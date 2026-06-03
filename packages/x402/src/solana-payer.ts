import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { USDC_DECIMALS, X402_VERSION } from '@autoagent/config';
import { PaymentError } from '@autoagent/core';
import type { X402Accept, X402Envelope, X402PayResult } from './types';

export interface X402PayOptions {
  url: string;
  method?: string; // default POST
  body?: unknown; // JSON-serializable
  baseHeaders?: Record<string, string>;
  payer: Keypair;
  connection: Connection;
  /** Where the server advertises requirements. AceData → 'body'; Coinbase/OOBE → 'header'. */
  requirementsSource?: 'body' | 'header';
  challengeHeaderName?: string; // default 'PAYMENT-REQUIRED'
  /** Header used to send the signed envelope. AceData/Coinbase → 'X-Payment'. */
  paymentHeaderName?: string; // default 'X-Payment'
  /** Hard ceiling: refuse to pay if the quoted amount exceeds this (atomic units). */
  maxAmountAtomic?: bigint;
  /** Simulate: discover the price via the 402 but DO NOT submit a transfer. */
  dryRun?: boolean;
  /** How long to wait for the transfer tx to confirm before sending the signature. */
  confirmTimeoutMs?: number;
}

function selectSolanaAccept(accepts: X402Accept[]): X402Accept {
  const solana = accepts.filter((a) => a.network === 'solana' || a.network.startsWith('solana:'));
  if (solana.length === 0) {
    throw new PaymentError(
      `No Solana payment option in accepts[] (got: ${accepts.map((a) => a.network).join(', ')}).`,
    );
  }
  return solana.find((a) => a.scheme === 'exact') ?? solana[0]!;
}

async function readRequirements(
  res: Response,
  source: 'body' | 'header',
  challengeHeader: string,
): Promise<X402Accept[]> {
  if (source === 'header') {
    const raw = res.headers.get(challengeHeader);
    if (!raw) throw new PaymentError(`402 missing ${challengeHeader} header.`);
    const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return (decoded.accepts ?? decoded) as X402Accept[];
  }
  const json = (await res.json()) as { accepts?: X402Accept[] };
  if (!json.accepts?.length) throw new PaymentError('402 body had no accepts[] array.');
  return json.accepts;
}

/**
 * Build the SPL USDC TransferChecked instruction from the payer to the recipient.
 * Pure (no network) — exported for tests. Matches @acedatacloud/x402-client's layout.
 */
export async function buildUsdcTransferIx(opts: {
  payer: PublicKey;
  payTo: PublicKey;
  mint: PublicKey;
  amount: bigint;
  decimals: number;
}) {
  const sourceAta = await getAssociatedTokenAddress(opts.mint, opts.payer);
  const destAta = await getAssociatedTokenAddress(opts.mint, opts.payTo);
  return createTransferCheckedInstruction(
    sourceAta,
    opts.mint,
    destAta,
    opts.payer,
    opts.amount,
    opts.decimals,
  );
}

/**
 * Best-effort propagation wait (no WebSocket — Synapse gateway RPCs may lack one).
 * Like the official client, we don't block on full confirmation before sending the
 * signature (AceData verifies on-chain itself). We poll briefly so the tx has
 * propagated, fail fast only if it definitively errored, and otherwise return.
 */
async function awaitPropagation(
  connection: Connection,
  signature: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]).catch(() => ({ value: [null] }));
    const st = value[0];
    if (st) {
      if (st.err) throw new PaymentError(`payment tx failed on-chain: ${JSON.stringify(st.err)}`);
      if (st.confirmationStatus) return; // processed/confirmed/finalized — propagated
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  // Timed out waiting — proceed anyway; the server polls the chain to verify.
}

/**
 * Execute the AceData-style x402 flow for USDC on Solana:
 *   request → 402 → read requirements → (guard) → submit a TransferChecked the PAYER
 *   pays for and signs → confirm → retry with X-Payment carrying { signature }.
 *
 * This matches the official @acedatacloud/x402-client: the user is the fee payer and
 * submits the transfer themselves; the server verifies the on-chain signature. The
 * returned txSignature is a real, Explorer-verifiable settlement.
 *
 * In dryRun it stops after price discovery (the 402 costs nothing) and signs nothing.
 */
export async function payWithSolanaX402(opts: X402PayOptions): Promise<X402PayResult> {
  const method = opts.method ?? 'POST';
  const paymentHeader = opts.paymentHeaderName ?? 'X-Payment';
  const challengeHeader = opts.challengeHeaderName ?? 'PAYMENT-REQUIRED';
  const source = opts.requirementsSource ?? 'body';

  const baseInit: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.baseHeaders ?? {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };

  const first = await fetch(opts.url, baseInit);
  if (first.status !== 402) {
    return {
      paid: false,
      response: first,
      amountAtomic: '0',
      payTo: '',
      asset: '',
      network: 'solana',
      dryRun: opts.dryRun ?? false,
    };
  }

  const accepts = await readRequirements(first, source, challengeHeader);
  const accept = selectSolanaAccept(accepts);
  const amount = BigInt(accept.maxAmountRequired);

  if (opts.maxAmountAtomic !== undefined && amount > opts.maxAmountAtomic) {
    throw new PaymentError(
      `Quoted ${amount} exceeds payer ceiling ${opts.maxAmountAtomic} for ${opts.url}.`,
    );
  }

  if (opts.dryRun) {
    return {
      paid: false,
      response: first,
      amountAtomic: amount.toString(),
      payTo: accept.payTo,
      asset: accept.asset,
      network: accept.network,
      dryRun: true,
    };
  }

  // Build + submit the transfer (payer is the fee payer and signer).
  const mint = new PublicKey(accept.asset);
  const payTo = new PublicKey(accept.payTo);
  const decimals = (accept.extra as { decimals?: number } | undefined)?.decimals ?? USDC_DECIMALS;
  const destAta = await getAssociatedTokenAddress(mint, payTo);
  const transferIx = await buildUsdcTransferIx({ payer: opts.payer.publicKey, payTo, mint, amount, decimals });

  const tx = new Transaction().add(
    // Idempotent: no-op if the recipient's USDC account already exists, else create it.
    createAssociatedTokenAccountIdempotentInstruction(opts.payer.publicKey, destAta, payTo, mint),
    transferIx,
  );
  tx.feePayer = opts.payer.publicKey;
  tx.recentBlockhash = (await opts.connection.getLatestBlockhash('confirmed')).blockhash;
  tx.sign(opts.payer);
  // skipPreflight: bypass the gateway RPC's (flaky) preflight simulation; the tx is well-formed.
  const signature = await opts.connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 5,
  });
  await awaitPropagation(opts.connection, signature, opts.confirmTimeoutMs ?? 15_000);

  const envelope: X402Envelope = {
    x402Version: X402_VERSION,
    scheme: accept.scheme || 'exact',
    network: 'solana',
    payload: { signature },
  };
  const paymentValue = Buffer.from(JSON.stringify(envelope)).toString('base64');

  // Retry on 5xx reusing the SAME payment signature — AceData re-verifies the on-chain
  // tx, so a transient server blip (e.g. auth_service_unavailable) never double-charges.
  const paidHeaders = {
    ...(baseInit.headers as Record<string, string>),
    [paymentHeader]: paymentValue,
  };
  let paidRes!: Response;
  for (let attempt = 0; attempt < 4; attempt++) {
    paidRes = await fetch(opts.url, { ...baseInit, headers: paidHeaders });
    if (paidRes.status < 500) break; // success or a client error — stop retrying
    await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
  }
  if (paidRes.status >= 300) {
    const text = await paidRes.text().catch(() => '');
    throw new PaymentError(
      `Paid retry to ${opts.url} failed (${paidRes.status}) after settling ${signature}: ${text.slice(0, 200)}`,
    );
  }

  return {
    paid: true,
    response: paidRes,
    amountAtomic: amount.toString(),
    payTo: accept.payTo,
    asset: accept.asset,
    network: accept.network,
    signedTxBase64: signature, // the on-chain settlement signature
    dryRun: false,
  };
}
