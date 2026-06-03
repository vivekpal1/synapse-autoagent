import { randomUUID } from 'node:crypto';
import { getEnv, type Env } from '@autoagent/config';
import { childLogger } from './logger';
import { WorkflowError } from './errors';
import { resolveTemplates } from './template';
import type { ReceiptLedger } from './ledger';
import type { SpendGuard } from './guard';
import type { StepRegistry } from './registry';
import type { RunContext, RunResult, WorkflowDef } from './types';

export interface EngineDeps {
  registry: StepRegistry;
  ledger: ReceiptLedger;
  guard: SpendGuard;
  env?: Env;
}

/**
 * Executes a declarative workflow end-to-end: trigger → step-by-step execution →
 * payment → settlement → recorded receipts. No human input between the trigger
 * and the final receipt — that is what makes the workflow "autonomous".
 *
 * Each step's output lands on `ctx.state[step.id]` so later steps can reference it
 * via `${steps.<id>.<path>}` templates. Payments produce receipts that are both
 * appended to the durable ledger and returned in the RunResult.
 */
export class WorkflowEngine {
  private readonly registry: StepRegistry;
  private readonly ledger: ReceiptLedger;
  private readonly guard: SpendGuard;
  private readonly env: Env;

  constructor(deps: EngineDeps) {
    this.registry = deps.registry;
    this.ledger = deps.ledger;
    this.guard = deps.guard;
    this.env = deps.env ?? getEnv();
  }

  async run(workflow: WorkflowDef): Promise<RunResult> {
    const runId = randomUUID().slice(0, 8);
    const logger = childLogger({ runId, workflow: workflow.name });
    const startedAt = Date.now();
    this.guard.resetRun();

    const ctx: RunContext = {
      runId,
      workflow,
      logger,
      ledger: this.ledger,
      guard: this.guard,
      env: this.env,
      dryRun: this.env.DRY_RUN,
      state: { ...(workflow.vars ?? {}) },
      artifacts: [],
      receipts: [],
      startedAt,
    };

    logger.info(
      { category: workflow.category, dryRun: ctx.dryRun, steps: workflow.steps.length },
      `▶ run start: ${workflow.name}`,
    );

    const stepOutcomes: RunResult['steps'] = [];
    let runOk = true;
    let runError: string | undefined;

    for (const step of workflow.steps) {
      const scope = {
        steps: ctx.state,
        state: ctx.state,
        env: process.env as Record<string, string | undefined>,
      };
      const params = resolveTemplates(
        { ...(workflow.defaults ?? {}), ...(step.params ?? {}) },
        scope,
      );
      const stepLog = logger.child({ step: step.id, kind: step.kind });
      stepLog.info({ note: step.note }, `· step: ${step.id} (${step.kind})`);

      try {
        const handler = this.registry.get(step.kind);
        const result = await handler(params, { ...ctx, logger: stepLog });

        ctx.state[step.id] = result.output ?? null;
        if (result.artifacts) {
          ctx.artifacts.push(
            ...result.artifacts.map((a) => ({ ...a, stepId: a.stepId || step.id })),
          );
        }
        if (result.receipt) {
          this.ledger.append(result.receipt);
          ctx.receipts.push(result.receipt);
          stepLog.info(
            { amount: result.receipt.amountAtomic, tx: result.receipt.txSignature },
            `  💸 receipt: ${result.receipt.service}`,
          );
        }

        stepOutcomes.push({ id: step.id, kind: step.kind, ok: result.ok, note: result.note });
        if (!result.ok && !step.optional) {
          runOk = false;
          runError = `step "${step.id}" reported failure: ${result.note ?? 'no detail'}`;
          break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stepLog.error({ err: message }, `  ✗ step failed: ${step.id}`);
        stepOutcomes.push({ id: step.id, kind: step.kind, ok: false, note: message });
        if (step.optional) continue;
        runOk = false;
        runError = `step "${step.id}" threw: ${message}`;
        break;
      }
    }

    const totalSpent = ctx.receipts.reduce((acc, r) => acc + BigInt(r.amountAtomic), 0n);
    const result: RunResult = {
      runId,
      workflow: workflow.name,
      category: workflow.category,
      ok: runOk,
      durationMs: Date.now() - startedAt,
      steps: stepOutcomes,
      receipts: ctx.receipts,
      artifacts: ctx.artifacts,
      totalSpentAtomic: totalSpent.toString(),
      error: runError,
    };

    logger[runOk ? 'info' : 'error'](
      { ok: runOk, durationMs: result.durationMs, spent: result.totalSpentAtomic },
      `${runOk ? '✓' : '✗'} run end: ${workflow.name}`,
    );
    return result;
  }
}

/** Guard: a workflow must have at least one step and a known trigger. */
export function validateWorkflow(wf: WorkflowDef): void {
  if (!wf.name) throw new WorkflowError('Workflow is missing a name.');
  if (!wf.steps?.length) throw new WorkflowError(`Workflow "${wf.name}" has no steps.`);
  if (!['interval', 'manual', 'webhook', 'cron'].includes(wf.trigger?.type)) {
    throw new WorkflowError(`Workflow "${wf.name}" has an invalid trigger.`);
  }
}
