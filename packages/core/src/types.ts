import type { Logger } from 'pino';
import type { Env } from '@autoagent/config';
import type { ReceiptLedger } from './ledger';
import type { SpendGuard } from './guard';

/** The two bounty reward pools. A receipt is attributed to exactly one. */
export type Category = 'sap-escrow' | 'acedata-x402';

/** The concrete settlement mechanism a payment used. */
export type PaymentFlow =
  | 'sap-escrow' // on-chain SAP escrow create/settle (Category A)
  | 'sap-x402-sentinel' // SAP x402 header call to Synapse Sentinel (Category A)
  | 'acedata-x402' // Ace Data Cloud x402 via its facilitator (Category B)
  | 'oobe-x402-rpc'; // OOBE x402 RPC server via PayAI (supporting)

/** An immutable record of one settled (or simulated) payment. The proof of volume. */
export interface PaymentReceipt {
  id: string;
  ts: string; // ISO-8601
  runId: string;
  workflow: string;
  category: Category;
  flow: PaymentFlow;
  service: string; // e.g. 'acedata:openai/chat', 'sentinel:data_oracle', 'sap:escrow'
  token: 'USDC' | 'SOL';
  amountAtomic: string; // base units, string for bigint-safety
  network: string; // CAIP-2 (solana:5eyk...) or 'solana'
  payTo?: string;
  txSignature?: string; // on-chain settlement signature, when available
  explorerUrl?: string;
  dryRun: boolean;
  meta?: Record<string, unknown>;
}

/** A produced output of a workflow (text, a URL to generated media, structured data). */
export interface Artifact {
  stepId: string;
  kind: string; // 'text' | 'json' | 'audio-url' | 'image-url' | 'video-url' | ...
  label: string;
  value: unknown;
}

/** How a workflow is kicked off. */
export interface TriggerSpec {
  type: 'interval' | 'manual' | 'webhook' | 'cron';
  everyMs?: number;
  cron?: string;
}

/** One declarative step in a workflow YAML/JSON file. */
export interface StepSpec {
  id: string;
  kind: string; // resolved against the StepRegistry
  /** Human note shown in logs/dashboard. */
  note?: string;
  /** Arbitrary params; string values may contain ${...} templates (see engine). */
  params?: Record<string, unknown>;
  /** If true, a failure of this step does not abort the run. */
  optional?: boolean;
}

/** A complete workflow definition (loaded from YAML/JSON or built in code). */
export interface WorkflowDef {
  name: string;
  category: Category;
  description: string;
  trigger: TriggerSpec;
  steps: StepSpec[];
  /** Optional default params merged into every step's params. */
  defaults?: Record<string, unknown>;
  /** Constants seeded onto the run blackboard, referenceable as ${state.<key>}. */
  vars?: Record<string, unknown>;
}

/** Mutable per-run context handed to every step handler. */
export interface RunContext {
  runId: string;
  workflow: WorkflowDef;
  logger: Logger;
  ledger: ReceiptLedger;
  guard: SpendGuard;
  env: Env;
  dryRun: boolean;
  /** Blackboard: each step's output is stored under ctx.state[step.id]. */
  state: Record<string, unknown>;
  artifacts: Artifact[];
  receipts: PaymentReceipt[];
  startedAt: number;
}

/** What a step handler returns. */
export interface StepResult {
  ok: boolean;
  output?: unknown;
  receipt?: PaymentReceipt;
  artifacts?: Artifact[];
  note?: string;
}

/** A reusable primitive that executes one kind of step. */
export type StepHandler = (params: Record<string, unknown>, ctx: RunContext) => Promise<StepResult>;

/** Outcome of a full workflow run. */
export interface RunResult {
  runId: string;
  workflow: string;
  category: Category;
  ok: boolean;
  durationMs: number;
  steps: Array<{ id: string; kind: string; ok: boolean; note?: string }>;
  receipts: PaymentReceipt[];
  artifacts: Artifact[];
  totalSpentAtomic: string;
  error?: string;
}

/**
 * Partial payment data returned by an integration package (acedata/sap/x402).
 * The engine/handler enriches it with runId/workflow/category to mint a full
 * PaymentReceipt — the package itself doesn't know which run it belongs to.
 */
export interface PaymentInfo {
  flow: PaymentFlow;
  service: string;
  token: 'USDC' | 'SOL';
  amountAtomic: string;
  network: string;
  payTo?: string;
  txSignature?: string;
  dryRun: boolean;
  meta?: Record<string, unknown>;
}

/** A discovered SAP tool/agent (normalized across on-chain + Explorer shapes). */
export interface DiscoveredTool {
  agentWallet: string;
  agentName: string;
  toolName: string;
  category?: string;
  protocol?: string;
  pricePerCallAtomic?: number;
  token?: 'USDC' | 'SOL';
  x402Endpoint?: string;
  source: 'explorer' | 'onchain';
}
