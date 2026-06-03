/**
 * On-chain + service constants for the OOBE Synapse / SAP / Ace Data Cloud stack.
 *
 * Every value here was source-verified or live-verified on 2026-06-02 — see
 * docs/INTEGRATION-GUIDE.md §2/§8 for provenance. Do not edit casually: these are
 * mainnet program IDs and token mints; a wrong byte moves real money.
 */

// ─── Synapse Agent Protocol (SAP) — mainnet-beta ─────────────────────────────
export const SAP_PROGRAM_ID = 'SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ';
export const SAP_GLOBAL_REGISTRY = '9odFrYBBZq6UQC6aGyzMPNXWJQn55kMtfigzhLg6S6L5';
export const SAP_TREASURY = 'J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P';
/** Protocol settlement fee, in basis points (0.5%). */
export const SAP_SETTLE_FEE_BPS = 50;
/** Minimum agent stake (lamports). NOTE: constants say 0.1 SOL, skill doc warns 1 SOL — verify on-chain. */
export const MIN_AGENT_STAKE_LAMPORTS = 100_000_000;
export const STAKE_COVERAGE_BPS = 5000; // agent must cover >= 50% of escrow deposit

// ─── Tokens ──────────────────────────────────────────────────────────────────
export const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const USDC_DECIMALS = 6;
export const SOL_DECIMALS = 9;

// ─── Synapse Sentinel (required for Category A) ──────────────────────────────
export const SENTINEL_WALLET = 'Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph';
export const SENTINEL_PDA = 'AzqhCKhku9TX3ScVtQw5nffLJ6PoA8r3P6HiTdinuAKz';
/** `:name` is replaced with the tool, e.g. /tools/jupiter_swap, /tools/token_transfer. */
export const SENTINEL_X402_ENDPOINT = 'https://agent.sentinel.oobeprotocol.ai/tools/:name';

/** Sentinel pricing tiers — pricePerCall in USDC base units (6 decimals). Verified live 2026-06-02. */
export const SENTINEL_TIERS = {
  token: { pricePerCall: 12_150, rateLimit: 60, burst: 20, maxCalls: 10_000 },
  nft: { pricePerCall: 27_000, rateLimit: 30, burst: 10, maxCalls: 5_000 },
  defi: { pricePerCall: 67_500, rateLimit: 30, burst: 10, maxCalls: 5_000 },
  misc: { pricePerCall: 20_250, rateLimit: 60, burst: 20, maxCalls: 10_000 },
  blinks: { pricePerCall: 24_300, rateLimit: 60, burst: 20, maxCalls: 10_000 },
} as const;
export type SentinelTier = keyof typeof SENTINEL_TIERS;

// ─── x402 facilitators & networks ────────────────────────────────────────────
/** OOBE x402 RPC server uses PayAI (NOT AceDataCloud — bounty brief was inaccurate). */
export const PAYAI_FACILITATOR = 'https://facilitator.payai.network';
export const ACEDATA_FACILITATOR = 'https://facilitator.acedata.cloud';
/** AceData's Solana fee-payer pubkey for facilitator-fee-payer x402 txs (user pays 0 SOL gas). */
export const ACEDATA_SOL_FACILITATOR_PUBKEY = '3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq';
/** CAIP-2 chain id for Solana mainnet-beta (used in x402 `accepts[]`). */
export const SOLANA_CAIP2_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const X402_VERSION = 2;

// ─── Service base URLs ───────────────────────────────────────────────────────
export const ACEDATA_API_BASE = 'https://api.acedata.cloud';
export const ACEDATA_PLATFORM_BASE = 'https://platform.acedata.cloud/api/v1';
export const EXPLORER_API_BASE = 'https://explorer.oobeprotocol.ai/api/sap';
export const EXPLORER_WEB_BASE = 'https://explorer.oobeprotocol.ai';
export const OOBE_X402_RPC_BASE = 'https://x402.oobeprotocol.ai';

// ─── SAP tool categories (on-chain enum) ─────────────────────────────────────
export const TOOL_CATEGORIES = [
  'Swap',
  'Lend',
  'Stake',
  'Nft',
  'Payment',
  'Data',
  'Governance',
  'Bridge',
  'Analytics',
  'Custom',
] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/** Build a clickable Solana Explorer / OOBE Explorer link for a signature. */
export function explorerTxUrl(signature: string): string {
  return `${EXPLORER_WEB_BASE}/tx/${signature}`;
}
export function explorerAgentUrl(wallet: string): string {
  return `${EXPLORER_WEB_BASE}/agents/${wallet}`;
}
