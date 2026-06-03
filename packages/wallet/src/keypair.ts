import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getEnv, type Env } from '@autoagent/config';

/**
 * Load the agent's Solana keypair from env. Accepts either:
 *  - SOLANA_KEYPAIR_PATH: a JSON file containing a `number[]` secret key (solana-keygen format), or
 *  - SOLANA_SECRET_KEY_BS58: a base58-encoded 64-byte secret key.
 *
 * Throws a clear, actionable error if neither is usable — we never silently
 * generate a throwaway key, because that key would be the on-chain identity.
 */
export function loadKeypair(env: Env = getEnv()): Keypair {
  if (env.SOLANA_KEYPAIR_PATH) {
    const path = resolve(env.SOLANA_KEYPAIR_PATH);
    if (!existsSync(path)) {
      throw new Error(`SOLANA_KEYPAIR_PATH points to a missing file: ${path}`);
    }
    const raw = readFileSync(path, 'utf8').trim();
    let secret: number[];
    try {
      secret = JSON.parse(raw);
    } catch {
      throw new Error(`Keypair file ${path} is not valid JSON (expected a number[] secret key).`);
    }
    if (!Array.isArray(secret) || secret.length !== 64) {
      throw new Error(`Keypair file ${path} must be a 64-element JSON number array.`);
    }
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }

  if (env.SOLANA_SECRET_KEY_BS58) {
    const decoded = bs58.decode(env.SOLANA_SECRET_KEY_BS58.trim());
    if (decoded.length !== 64) {
      throw new Error('SOLANA_SECRET_KEY_BS58 must decode to a 64-byte secret key.');
    }
    return Keypair.fromSecretKey(decoded);
  }

  throw new Error(
    'No agent wallet configured. Set SOLANA_KEYPAIR_PATH (a solana-keygen JSON file) or SOLANA_SECRET_KEY_BS58.',
  );
}

/** True if a wallet is configured, without throwing — for doctor checks and DRY_RUN gating. */
export function hasKeypair(env: Env = getEnv()): boolean {
  return Boolean(env.SOLANA_KEYPAIR_PATH || env.SOLANA_SECRET_KEY_BS58);
}
