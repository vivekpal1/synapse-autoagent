import type { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { ACEDATA_API_BASE } from '@autoagent/config';
import { PaymentError, type PaymentInfo } from '@autoagent/core';
import { payWithSolanaX402 } from '@autoagent/x402';
import {
  getService,
  simulateResult,
  type AceServiceDescriptor,
  type AceServiceResult,
} from './services';

export type AceDataMode = 'x402' | 'classic';

export interface AceDataClientOptions {
  mode?: AceDataMode;
  connection?: Connection; // required for x402 (live)
  payer?: Keypair; // required for x402 (live)
  apiToken?: string; // required for classic
  facilitatorPubkey?: PublicKey; // defaults to AceData Solana facilitator
  maxAmountAtomic?: bigint; // per-call ceiling at the client layer
  dryRun?: boolean;
  apiBase?: string;
  /** Light polling for task-based services (image/video). 0 disables. */
  pollAttempts?: number;
  pollIntervalMs?: number;
}

export interface AceCallOutcome {
  serviceId: string;
  label: string;
  result: AceServiceResult;
  payment: PaymentInfo;
}

/** Parse application/json OR x-ndjson (returns the last complete JSON event). */
async function parseResponse(res: Response): Promise<any> {
  const txt = await res.text();
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('ndjson') || (txt.includes('\n') && !ct.includes('application/json'))) {
    let last: any = {};
    for (const line of txt.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        last = JSON.parse(t);
      } catch {
        /* skip partial line */
      }
    }
    return last;
  }
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

/** Best-effort: pull an on-chain settlement signature from the x402 receipt header. */
function extractSettlementSignature(res: Response): string | undefined {
  for (const name of ['x-payment-response', 'X-Payment-Response', 'payment-response']) {
    const raw = res.headers.get(name);
    if (!raw) continue;
    try {
      const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      const sig = decoded?.transaction ?? decoded?.signature ?? decoded?.txHash ?? decoded?.payload?.signature;
      if (typeof sig === 'string') return sig;
    } catch {
      /* header not base64 JSON */
    }
  }
  return undefined;
}

/**
 * Client for Ace Data Cloud. The DEFAULT mode is x402: every call settles real
 * USDC through AceData's own facilitator on Solana (the verified flow) — which is
 * exactly the volume the bounty's Category 2 measures. `classic` (Bearer token)
 * exists for local testing with prepaid credits.
 *
 * In DRY_RUN, x402 calls still hit the live endpoint to read the real 402 price
 * (free), then return a simulated result WITHOUT signing — so a workflow runs
 * fully end-to-end and projects volume without spending. If the price probe can't
 * reach the network, it falls back to the per-service estimate.
 */
export class AceDataClient {
  private readonly mode: AceDataMode;
  private readonly apiBase: string;

  constructor(private readonly opts: AceDataClientOptions = {}) {
    this.mode = opts.mode ?? 'x402';
    this.apiBase = opts.apiBase ?? ACEDATA_API_BASE;
  }

  /** Convenience wrappers for the catalog. */
  chat(input: Record<string, any>) {
    return this.call('chat', input);
  }
  search(input: Record<string, any>) {
    return this.call('search', input);
  }
  tts(input: Record<string, any>) {
    return this.call('tts', input);
  }
  image(input: Record<string, any>) {
    return this.call('image', input);
  }
  video(input: Record<string, any>) {
    return this.call('video', input);
  }

  /** Invoke any catalog service by id. `callOpts.maxAmountAtomic` overrides the
   * client-wide ceiling for THIS call (the engine uses it to enforce live
   * per-run/per-day budget, refusing over-ceiling quotes before signing). */
  async call(
    serviceId: string,
    input: Record<string, any> = {},
    callOpts: { maxAmountAtomic?: bigint } = {},
  ): Promise<AceCallOutcome> {
    const svc = getService(serviceId);
    const url = `${this.apiBase}${svc.path}`;
    const headers = svc.buildHeaders?.(input) ?? {};
    const body = svc.buildBody(input);
    const ceiling = callOpts.maxAmountAtomic ?? this.opts.maxAmountAtomic;

    if (this.mode === 'classic') return this.callClassic(svc, url, headers, body, input);
    return this.callX402(svc, url, headers, body, input, ceiling);
  }

  private async callClassic(
    svc: AceServiceDescriptor,
    url: string,
    headers: Record<string, string>,
    body: unknown,
    input: Record<string, any>,
  ): Promise<AceCallOutcome> {
    if (!this.opts.apiToken) {
      throw new PaymentError('classic mode requires ACEDATA_API_TOKEN (a platform.acedata.cloud Bearer token).');
    }
    const dryRun = this.opts.dryRun ?? false;
    if (dryRun) {
      return this.outcome(svc, simulateResult(svc, input), BigInt(svc.estimatedAtomic), {
        dryRun: true,
        meta: { mode: 'classic', estimated: true },
      });
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${this.opts.apiToken}`, ...headers },
      body: JSON.stringify(body),
    });
    if (res.status >= 300) {
      throw new PaymentError(`AceData classic call failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const json = await parseResponse(res);
    return this.outcome(svc, svc.extractResult(json), BigInt(svc.estimatedAtomic), {
      dryRun: false,
      meta: { mode: 'classic' },
    });
  }

  private async callX402(
    svc: AceServiceDescriptor,
    url: string,
    headers: Record<string, string>,
    body: unknown,
    input: Record<string, any>,
    maxAmountAtomic?: bigint,
  ): Promise<AceCallOutcome> {
    const dryRun = this.opts.dryRun ?? false;

    if (!this.opts.payer || !this.opts.connection) {
      if (!dryRun) {
        throw new PaymentError('x402 live mode requires a funded `payer` Keypair and a `connection`.');
      }
      // Fully offline dry-run: no payer → use the estimate.
      return this.outcome(svc, simulateResult(svc, input), BigInt(svc.estimatedAtomic), {
        dryRun: true,
        meta: { mode: 'x402', estimated: true, reason: 'no-wallet' },
      });
    }

    try {
      const pay = await payWithSolanaX402({
        url,
        body,
        baseHeaders: headers,
        payer: this.opts.payer,
        connection: this.opts.connection,
        requirementsSource: 'body',
        paymentHeaderName: 'X-Payment',
        maxAmountAtomic: maxAmountAtomic ?? this.opts.maxAmountAtomic,
        dryRun,
      });

      if (dryRun || !pay.paid || !pay.response) {
        // Real price discovered, no payment signed.
        return this.outcome(svc, simulateResult(svc, input), BigInt(pay.amountAtomic), {
          dryRun: true,
          payTo: pay.payTo || undefined,
          meta: { mode: 'x402', estimated: false },
        });
      }

      // Paid: parse the real result and (lightly) poll task-based services.
      const json = await parseResponse(pay.response);
      let result = svc.extractResult(json);
      if (svc.taskBased && result.taskId && !result.artifactValue) {
        const polled = await this.pollTask(svc, result.taskId);
        if (polled) result = polled;
      }

      return this.outcome(svc, result, BigInt(pay.amountAtomic), {
        dryRun: false,
        payTo: pay.payTo || undefined,
        // The payer submits the transfer itself, so signedTxBase64 IS the on-chain signature.
        txSignature: pay.signedTxBase64 ?? extractSettlementSignature(pay.response),
        meta: { mode: 'x402', network: pay.network, asset: pay.asset },
      });
    } catch (err) {
      if (dryRun) {
        // Network unreachable in dry-run → degrade to estimate, keep workflow alive.
        return this.outcome(svc, simulateResult(svc, input), BigInt(svc.estimatedAtomic), {
          dryRun: true,
          meta: { mode: 'x402', estimated: true, reason: (err as Error).message.slice(0, 120) },
        });
      }
      throw err;
    }
  }

  /** Light, payment-free polling for task-based services. Returns null if not ready. */
  private async pollTask(svc: AceServiceDescriptor, taskId: string): Promise<AceServiceResult | null> {
    const attempts = this.opts.pollAttempts ?? 0;
    if (attempts <= 0) return null;
    const prefix = svc.path.split('/')[1];
    const taskUrl = `${this.apiBase}/${prefix}/tasks`;
    for (let i = 0; i < attempts; i++) {
      await new Promise((r) => setTimeout(r, this.opts.pollIntervalMs ?? 5_000));
      try {
        const res = await fetch(taskUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.opts.apiToken ? { authorization: `Bearer ${this.opts.apiToken}` } : {}),
          },
          body: JSON.stringify({ action: 'retrieve', id: taskId }),
        });
        if (res.status >= 300) continue;
        const json = await parseResponse(res);
        const r = svc.extractResult(json);
        if (r.artifactValue) return r;
      } catch {
        /* keep polling */
      }
    }
    return null;
  }

  private outcome(
    svc: AceServiceDescriptor,
    result: AceServiceResult,
    amountAtomic: bigint,
    p: { dryRun: boolean; payTo?: string; txSignature?: string; meta?: Record<string, unknown> },
  ): AceCallOutcome {
    const payment: PaymentInfo = {
      flow: 'acedata-x402',
      service: `acedata:${svc.path}`,
      token: 'USDC',
      amountAtomic: amountAtomic.toString(),
      network: 'solana',
      payTo: p.payTo,
      txSignature: p.txSignature,
      dryRun: p.dryRun,
      meta: { serviceId: svc.id, label: svc.label, ...(p.meta ?? {}) },
    };
    return { serviceId: svc.id, label: svc.label, result, payment };
  }
}
