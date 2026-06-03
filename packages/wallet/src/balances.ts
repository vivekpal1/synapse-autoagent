import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, TokenAccountNotFoundError } from '@solana/spl-token';
import { USDC_DECIMALS, USDC_MINT_MAINNET } from '@autoagent/config';

export interface WalletBalances {
  sol: number; // human SOL
  lamports: number;
  usdc: number; // human USDC
  usdcAtomic: bigint; // base units (6 decimals)
}

/** Native SOL balance in lamports. */
export async function getLamports(conn: Connection, owner: PublicKey): Promise<number> {
  return conn.getBalance(owner);
}

/**
 * USDC balance for an owner, in atomic units. Returns 0n if the associated token
 * account does not exist yet (a fresh wallet) instead of throwing.
 */
export async function getUsdcAtomic(
  conn: Connection,
  owner: PublicKey,
  mint: PublicKey = new PublicKey(USDC_MINT_MAINNET),
): Promise<bigint> {
  const ata = await getAssociatedTokenAddress(mint, owner, true);
  try {
    const acct = await getAccount(conn, ata);
    return acct.amount;
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError) return 0n;
    throw err;
  }
}

/**
 * Combined SOL + USDC snapshot. Resilient: a fresh wallet has no USDC token
 * account, and some RPCs return an error (rather than null) for a missing
 * account — in either case we report 0 USDC and still surface the SOL balance,
 * instead of failing the whole lookup.
 */
export async function getBalances(conn: Connection, owner: PublicKey): Promise<WalletBalances> {
  const [lamportsR, usdcR] = await Promise.allSettled([
    getLamports(conn, owner),
    getUsdcAtomic(conn, owner),
  ]);
  if (lamportsR.status === 'rejected') throw lamportsR.reason; // SOL lookup is the real RPC health check
  const lamports = lamportsR.value;
  const usdcAtomic = usdcR.status === 'fulfilled' ? usdcR.value : 0n;
  return {
    lamports,
    sol: lamports / 1e9,
    usdcAtomic,
    usdc: Number(usdcAtomic) / 10 ** USDC_DECIMALS,
  };
}

/** Format USDC atomic units as a human string, e.g. 67500n -> "0.0675". */
export function formatUsdc(atomic: bigint | number): string {
  const n = typeof atomic === 'bigint' ? Number(atomic) : atomic;
  return (n / 10 ** USDC_DECIMALS).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}
