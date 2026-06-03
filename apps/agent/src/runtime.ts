import { getEnv, type Env } from '@autoagent/config';
import {
  ReceiptLedger,
  SpendGuard,
  StepRegistry,
  WorkflowEngine,
} from '@autoagent/core';
import { registerHandlers } from './handlers';

export interface Runtime {
  env: Env;
  engine: WorkflowEngine;
  registry: StepRegistry;
  ledger: ReceiptLedger;
  guard: SpendGuard;
}

/** Compose the full agent runtime: ledger + guard + step registry + engine. */
export function buildRuntime(env: Env = getEnv()): Runtime {
  const ledger = new ReceiptLedger(env.RECEIPTS_DIR);
  const guard = new SpendGuard(ledger, env);
  const registry = new StepRegistry();
  registerHandlers(registry, env);
  const engine = new WorkflowEngine({ registry, ledger, guard, env });
  return { env, engine, registry, ledger, guard };
}
