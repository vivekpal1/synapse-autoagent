import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReceiptLedger } from './ledger';
import { SpendGuard } from './guard';
import { GuardrailError } from './errors';
import type { Env } from '@autoagent/config';

const env = {
  MAX_USDC_PER_CALL: 200_000,
  MAX_USDC_PER_RUN: 500_000,
  MAX_USDC_PER_DAY: 1_000_000,
} as unknown as Env;

function freshGuard(): { guard: SpendGuard; ledger: ReceiptLedger } {
  const ledger = new ReceiptLedger(mkdtempSync(join(tmpdir(), 'autoagent-guard-')));
  return { guard: new SpendGuard(ledger, env), ledger };
}

describe('SpendGuard', () => {
  it('allows a spend within all ceilings', () => {
    const { guard } = freshGuard();
    expect(() => guard.assertCanSpend(100_000n, { dryRun: false })).not.toThrow();
  });

  it('rejects an over-per-call spend', () => {
    const { guard } = freshGuard();
    expect(() => guard.assertCanSpend(200_001n, { dryRun: false })).toThrow(GuardrailError);
  });

  it('rejects when the per-run total would be exceeded', () => {
    const { guard } = freshGuard();
    guard.record(200_000n);
    guard.record(200_000n);
    expect(() => guard.assertCanSpend(150_000n, { dryRun: false })).toThrow(/per-run/i);
  });

  it('ignores the daily ledger total for dry-run spends', () => {
    const { guard, ledger } = freshGuard();
    ledger.append({
      id: 'x', ts: new Date().toISOString(), runId: 'r', workflow: 'w',
      category: 'acedata-x402', flow: 'acedata-x402', service: 's', token: 'USDC',
      amountAtomic: '900000', network: 'solana', dryRun: false,
    });
    // Real spend would breach the day ceiling…
    expect(() => guard.assertCanSpend(150_000n, { dryRun: false })).toThrow(/per-day/i);
    // …but a dry-run spend is exempt.
    expect(() => guard.assertCanSpend(150_000n, { dryRun: true })).not.toThrow();
  });

  it('resets the per-run counter', () => {
    const { guard } = freshGuard();
    guard.record(400_000n);
    guard.resetRun();
    expect(guard.runTotal).toBe(0n);
  });
});
