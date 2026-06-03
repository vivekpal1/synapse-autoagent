import { getEnv, type Env } from '@autoagent/config';
import { GuardrailError } from './errors';
import type { ReceiptLedger } from './ledger';

/**
 * Enforces spend ceilings BEFORE any payment is signed. The whole point of an
 * autonomous agent that moves real money is that it cannot run away with the
 * wallet — every paid step calls `assertCanSpend` first, and the per-run total is
 * tracked in-memory while the per-day total is reconstructed from the ledger.
 *
 * Amounts are USDC atomic units (6 decimals). SOL payments are converted to a
 * rough USDC-equivalent only for the ceiling check via `solToUsdcAtomic`.
 */
export class SpendGuard {
  private runSpent = 0n;

  constructor(
    private readonly ledger: ReceiptLedger,
    private readonly env: Env = getEnv(),
  ) {}

  /** USDC spent (real, non-dry-run) in the trailing 24h, from the ledger. */
  daySpent(): bigint {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return this.ledger.spentRealSince(since);
  }

  /** Throw if paying `amountAtomic` now would breach per-call/run/day ceilings. */
  assertCanSpend(amountAtomic: bigint, opts: { dryRun: boolean }): void {
    const perCall = BigInt(this.env.MAX_USDC_PER_CALL);
    const perRun = BigInt(this.env.MAX_USDC_PER_RUN);
    const perDay = BigInt(this.env.MAX_USDC_PER_DAY);

    if (amountAtomic > perCall) {
      throw new GuardrailError(
        `Per-call ceiling exceeded: ${amountAtomic} > MAX_USDC_PER_CALL=${perCall}.`,
      );
    }
    if (this.runSpent + amountAtomic > perRun) {
      throw new GuardrailError(
        `Per-run ceiling exceeded: ${this.runSpent + amountAtomic} > MAX_USDC_PER_RUN=${perRun}.`,
      );
    }
    // Dry-run spend never counts against the real daily ledger total.
    if (!opts.dryRun && this.daySpent() + amountAtomic > perDay) {
      throw new GuardrailError(
        `Per-day ceiling exceeded: ${this.daySpent() + amountAtomic} > MAX_USDC_PER_DAY=${perDay}.`,
      );
    }
  }

  /** Record that a spend happened (call AFTER a successful payment). */
  record(amountAtomic: bigint): void {
    this.runSpent += amountAtomic;
  }

  get runTotal(): bigint {
    return this.runSpent;
  }

  /** Reset the per-run counter (the engine calls this at the start of each run). */
  resetRun(): void {
    this.runSpent = 0n;
  }
}
