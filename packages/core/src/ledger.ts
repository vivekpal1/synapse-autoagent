import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getEnv } from '@autoagent/config';
import type { Category, PaymentReceipt } from './types';

/** Aggregated volume, split by real vs simulated, per category. */
export interface VolumeReport {
  byCategory: Record<Category, { real: bigint; dryRun: bigint; count: number }>;
  totalReal: bigint;
  totalDryRun: bigint;
  receiptCount: number;
}

/**
 * Append-only NDJSON ledger of every payment the agent makes. This is the
 * source of truth for "how much volume did we generate" — the dashboard and the
 * spend guard both read it, and it's the artifact you point judges at alongside
 * the on-chain Explorer links.
 */
export class ReceiptLedger {
  private readonly file: string;

  constructor(receiptsDir: string = getEnv().RECEIPTS_DIR) {
    const dir = resolve(receiptsDir);
    this.file = join(dir, 'ledger.ndjson');
    mkdirSync(dirname(this.file), { recursive: true });
  }

  /** Mint a receipt id (also exported for tests). */
  static newId(): string {
    return randomUUID();
  }

  /** Append a receipt durably (one JSON object per line). */
  append(receipt: PaymentReceipt): void {
    appendFileSync(this.file, JSON.stringify(receipt) + '\n', 'utf8');
  }

  /** Read every receipt (skips blank/corrupt lines defensively). */
  all(): PaymentReceipt[] {
    if (!existsSync(this.file)) return [];
    const lines = readFileSync(this.file, 'utf8').split('\n');
    const out: PaymentReceipt[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as PaymentReceipt);
      } catch {
        // ignore a partially-written tail line
      }
    }
    return out;
  }

  /** Sum of amountAtomic for real (non-dry-run) receipts since a timestamp (ms). */
  spentRealSince(sinceMs: number): bigint {
    let sum = 0n;
    for (const r of this.all()) {
      if (r.dryRun) continue;
      if (new Date(r.ts).getTime() >= sinceMs) sum += BigInt(r.amountAtomic);
    }
    return sum;
  }

  /** Volume aggregated by category, separating real from simulated spend. */
  report(): VolumeReport {
    const blank = (): { real: bigint; dryRun: bigint; count: number } => ({
      real: 0n,
      dryRun: 0n,
      count: 0,
    });
    const byCategory: Record<Category, { real: bigint; dryRun: bigint; count: number }> = {
      'sap-escrow': blank(),
      'acedata-x402': blank(),
    };
    let totalReal = 0n;
    let totalDryRun = 0n;
    let receiptCount = 0;
    for (const r of this.all()) {
      const bucket = byCategory[r.category];
      if (!bucket) continue;
      const amt = BigInt(r.amountAtomic);
      bucket.count += 1;
      receiptCount += 1;
      if (r.dryRun) {
        bucket.dryRun += amt;
        totalDryRun += amt;
      } else {
        bucket.real += amt;
        totalReal += amt;
      }
    }
    return { byCategory, totalReal, totalDryRun, receiptCount };
  }

  get path(): string {
    return this.file;
  }
}
