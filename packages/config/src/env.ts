import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/**
 * Validated runtime configuration. Parsed once, lazily, from process.env.
 *
 * Design note: almost everything is optional so the codebase can boot, typecheck,
 * run tests, and execute DRY-RUN workflows with NO secrets. The live paths
 * (registration, real payments) assert the specific values they need at call time
 * via `requireX()` helpers — so a missing key fails loudly at the point of use with
 * an actionable message, not at import.
 */
const EnvSchema = z.object({
  // Synapse RPC
  SYNAPSE_RPC: z.string().url().optional(),
  SYNAPSE_API_KEY: z.string().optional(),
  SYNAPSE_WS: z.string().optional(),
  SYNAPSE_NETWORK: z.enum(['mainnet', 'devnet']).default('mainnet'),
  SYNAPSE_REGION: z.string().default('US-1'),
  SOLANA_RPC_FALLBACK: z.string().url().default('https://api.mainnet-beta.solana.com'),

  // Wallet
  SOLANA_KEYPAIR_PATH: z.string().optional(),
  SOLANA_SECRET_KEY_BS58: z.string().optional(),

  // Ace Data Cloud
  ACEDATA_API_TOKEN: z.string().optional(),
  ACEDATA_PAYMENT_MODE: z.enum(['x402', 'classic']).default('x402'),
  ACEDATA_X402_NETWORK: z.enum(['solana', 'base', 'skale']).default('solana'),

  // Agent identity
  AGENT_NAME: z.string().default('SynapseAutoAgent'),
  AGENT_DESCRIPTION: z
    .string()
    .default('Autonomous agent: discovers SAP tools, runs AI workflows, settles via x402/escrow'),
  AGENT_X402_ENDPOINT: z.string().default('https://your-agent.example.com/x402'),

  // Runtime
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  DRY_RUN: z
    .string()
    .default('true')
    .transform((v) => v !== 'false' && v !== '0'),
  WORKFLOWS_DIR: z.string().default('./workflows'),
  RECEIPTS_DIR: z.string().default('./receipts'),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(4040),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(900_000),

  // Spend guardrails (USDC atomic units, 6 decimals)
  MAX_USDC_PER_CALL: z.coerce.number().int().nonnegative().default(200_000),
  MAX_USDC_PER_RUN: z.coerce.number().int().nonnegative().default(2_000_000),
  MAX_USDC_PER_DAY: z.coerce.number().int().nonnegative().default(20_000_000),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parse + cache env. Throws a readable aggregate error if a present value is malformed. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test/CLI helper: re-read env (e.g. after dotenv override). */
export function resetEnvCache(): void {
  cached = null;
}

/** The Synapse RPC URL to use, falling back to public mainnet if no gateway key is set. */
export function rpcUrl(env: Env = getEnv()): string {
  return env.SYNAPSE_RPC ?? env.SOLANA_RPC_FALLBACK;
}

export function requireSynapseRpc(env: Env = getEnv()): string {
  if (!env.SYNAPSE_RPC) {
    throw new Error(
      'SYNAPSE_RPC is required for this operation. Get a free key at https://synapse.oobeprotocol.ai/signup and set SYNAPSE_RPC="https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=sk_live_...".',
    );
  }
  return env.SYNAPSE_RPC;
}
