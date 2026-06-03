#!/usr/bin/env -S npx tsx
/** Print the agent wallet's SOL + USDC balances (mainnet, via Synapse RPC). */
import { getEnv, rpcUrl } from '@autoagent/config';
import { getBalances, getConnection, loadKeypair } from '@autoagent/wallet';

async function main(): Promise<void> {
  const env = getEnv();
  const kp = loadKeypair(env);
  const bal = await getBalances(getConnection(env), kp.publicKey);
  console.log(`\n  wallet:  ${kp.publicKey.toBase58()}`);
  console.log(`  rpc:     ${rpcUrl(env)}`);
  console.log(`  SOL:     ${bal.sol.toFixed(6)}`);
  console.log(`  USDC:    ${bal.usdc} (${bal.usdcAtomic} atomic)\n`);
}

main().catch((err) => {
  console.error('check-balances failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
