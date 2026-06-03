import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReceiptLedger } from './ledger';
import { SpendGuard } from './guard';
import { StepRegistry } from './registry';
import { WorkflowEngine } from './engine';
import { buildReceipt } from './receipt';
import type { Env } from '@autoagent/config';
import type { WorkflowDef } from './types';

const env = {
  DRY_RUN: true,
  MAX_USDC_PER_CALL: 200_000,
  MAX_USDC_PER_RUN: 500_000,
  MAX_USDC_PER_DAY: 1_000_000,
} as unknown as Env;

function setup() {
  const ledger = new ReceiptLedger(mkdtempSync(join(tmpdir(), 'autoagent-engine-')));
  const guard = new SpendGuard(ledger, env);
  const registry = new StepRegistry();

  registry.register('gen', async (params) => ({
    ok: true,
    output: { text: `gen:${params.seed ?? '?'}` },
    note: 'generated',
  }));

  registry.register('pay', async (params, ctx) => {
    const payment = {
      flow: 'acedata-x402' as const,
      service: `acedata:${params.svc ?? 'x'}`,
      token: 'USDC' as const,
      amountAtomic: String(params.amount ?? 1000),
      network: 'solana',
      dryRun: ctx.dryRun,
    };
    return { ok: true, output: { paid: payment.amountAtomic }, receipt: buildReceipt(payment, ctx) };
  });

  registry.register('boom', async () => {
    throw new Error('kaboom');
  });

  return { engine: new WorkflowEngine({ registry, ledger, guard, env }), ledger };
}

const wf = (steps: WorkflowDef['steps']): WorkflowDef => ({
  name: 'test-wf',
  category: 'acedata-x402',
  description: 't',
  trigger: { type: 'manual' },
  steps,
  vars: { topic: 'hello' },
});

describe('WorkflowEngine', () => {
  it('runs steps, chains state via templates, and records receipts', async () => {
    const { engine, ledger } = setup();
    const result = await engine.run(
      wf([
        { id: 'g', kind: 'gen', params: { seed: '${state.topic}' } },
        { id: 'p', kind: 'pay', params: { svc: 'chat', amount: 95215 } },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.receipts).toHaveLength(1);
    expect(result.totalSpentAtomic).toBe('95215');
    expect(ledger.all()).toHaveLength(1);
  });

  it('seeds vars onto the blackboard for templating', async () => {
    const { engine } = setup();
    const result = await engine.run(wf([{ id: 'g', kind: 'gen', params: { seed: '${state.topic}' } }]));
    expect(result.steps[0]?.ok).toBe(true);
  });

  it('aborts on a non-optional step failure', async () => {
    const { engine } = setup();
    const result = await engine.run(
      wf([
        { id: 'b', kind: 'boom' },
        { id: 'p', kind: 'pay' },
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/kaboom/);
    expect(result.receipts).toHaveLength(0); // never reached the pay step
  });

  it('continues past an optional step failure', async () => {
    const { engine } = setup();
    const result = await engine.run(
      wf([
        { id: 'b', kind: 'boom', optional: true },
        { id: 'p', kind: 'pay', params: { amount: 500 } },
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.receipts).toHaveLength(1);
  });

  it('rejects an unknown step kind', async () => {
    const { engine } = setup();
    const result = await engine.run(wf([{ id: 'z', kind: 'nope' }]));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown step kind/i);
  });
});
