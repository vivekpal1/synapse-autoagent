import { Connection } from '@solana/web3.js';
import { getEnv, rpcUrl, type Env } from '@autoagent/config';

/** A confirmed-commitment Solana connection pointed at the Synapse RPC gateway (or fallback). */
export function getConnection(env: Env = getEnv()): Connection {
  return new Connection(rpcUrl(env), { commitment: 'confirmed' });
}
