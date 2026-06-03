import type { Connection, Keypair } from '@solana/web3.js';
import { OOBE_X402_RPC_BASE } from '@autoagent/config';
import { payWithSolanaX402 } from './solana-payer';
import type { X402Accept, X402PayResult } from './types';

/**
 * Client for OOBE's public x402 RPC server (https://x402.oobeprotocol.ai), which
 * monetizes 14 Solana RPC methods at POST /rpc/{method} via Coinbase x402 v2,
 * settled through the PayAI facilitator. Demonstrates the THIRD x402 flavor
 * (distinct from SAP escrow and AceData) — supporting, not required for either pool.
 *
 * Wire details (verified against @x402/core 2.14.0): challenge header PAYMENT-REQUIRED,
 * payment header X-PAYMENT, receipt header X-PAYMENT-RESPONSE.
 *
 * NOTE: For production payment against this server, the maintained path is the
 * official `@x402/fetch` `wrapFetchWithPayment(fetch, client)` with
 * `registerExactSvmScheme(client, { signer })`. The raw payer below is best-effort
 * and should be validated against a live 402 before relying on it (the exact PayAI
 * fee-payer arrangement was not captured during research).
 */
export const OOBE_RPC_METHODS = [
  'getAccountInfo',
  'getBalance',
  'getBlock',
  'getTransaction',
  'sendTransaction',
  'getLatestBlockhash',
  'getSlot',
  'getBlockHeight',
  'getBlockTime',
  'getSignatureStatuses',
  'getTokenAccountsByOwner',
  'getProgramAccounts',
  'simulateTransaction',
  'getRecentPerformanceSamples',
] as const;
export type OobeRpcMethod = (typeof OOBE_RPC_METHODS)[number];

export interface OobePriceQuote {
  method: string;
  amountAtomic: string;
  asset: string;
  payTo: string;
  network: string;
}

/**
 * Read-only price discovery: send an unauthenticated request and parse the 402
 * PAYMENT-REQUIRED challenge. Costs nothing — no payment is signed. Great for the
 * dashboard / doctor to prove the x402 gate is live.
 */
export async function quoteOobeRpc(
  method: OobeRpcMethod,
  params: unknown[] = [],
  base = OOBE_X402_RPC_BASE,
): Promise<OobePriceQuote> {
  const res = await fetch(`${base}/rpc/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (res.status !== 402) {
    throw new Error(`Expected 402 from OOBE x402 RPC, got ${res.status}.`);
  }
  const raw = res.headers.get('PAYMENT-REQUIRED');
  if (!raw) throw new Error('402 missing PAYMENT-REQUIRED header.');
  const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  const accepts = (decoded.accepts ?? decoded) as X402Accept[];
  const sol = accepts.find((a) => a.network === 'solana' || a.network.startsWith('solana:'));
  if (!sol) throw new Error('No Solana accept option from OOBE x402 RPC.');
  return {
    method,
    amountAtomic: sol.maxAmountRequired,
    asset: sol.asset,
    payTo: sol.payTo,
    network: sol.network,
  };
}

/** EXPERIMENTAL — pay + call an OOBE x402 RPC method via the raw Solana payer. */
export async function payOobeRpc(opts: {
  method: OobeRpcMethod;
  params?: unknown[];
  payer: Keypair;
  connection: Connection;
  maxAmountAtomic?: bigint;
  dryRun?: boolean;
  base?: string;
}): Promise<X402PayResult> {
  const base = opts.base ?? OOBE_X402_RPC_BASE;
  return payWithSolanaX402({
    url: `${base}/rpc/${opts.method}`,
    body: { jsonrpc: '2.0', id: 1, method: opts.method, params: opts.params ?? [] },
    payer: opts.payer,
    connection: opts.connection,
    requirementsSource: 'header',
    challengeHeaderName: 'PAYMENT-REQUIRED',
    paymentHeaderName: 'X-PAYMENT',
    maxAmountAtomic: opts.maxAmountAtomic,
    dryRun: opts.dryRun,
  });
}

/** True if a network id refers to Solana (plain or CAIP-2). */
export function isSolanaNetwork(network: string): boolean {
  return network === 'solana' || network.startsWith('solana:');
}
