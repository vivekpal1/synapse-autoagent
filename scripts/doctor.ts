#!/usr/bin/env -S npx tsx
/**
 * Preflight check: verifies everything the agent needs to go live, without
 * spending anything. Run `npm run doctor` before `register` / `agent`.
 */
import { PublicKey } from '@solana/web3.js';
import {
  ACEDATA_API_BASE,
  SENTINEL_WALLET,
  explorerAgentUrl,
  getEnv,
} from '@autoagent/config';
import { getBalances, getConnection, hasKeypair, loadKeypair } from '@autoagent/wallet';
import { ExplorerClient, probeSapSdk } from '@autoagent/sap';
import { ACE_SERVICES } from '@autoagent/acedata';

type Status = 'ok' | 'warn' | 'fail';
const mark = { ok: '\x1b[32m✓\x1b[0m', warn: '\x1b[33m⚠\x1b[0m', fail: '\x1b[31m✗\x1b[0m' };
function line(status: Status, label: string, detail = ''): void {
  console.log(`  ${mark[status]} ${label}${detail ? `  — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  console.log('\n  Synapse AutoAgent · doctor\n');
  const env = getEnv();

  // Runtime config
  line(env.DRY_RUN ? 'warn' : 'ok', `DRY_RUN=${env.DRY_RUN}`, env.DRY_RUN ? 'set DRY_RUN=false to settle real USDC' : 'LIVE');
  line('ok', `payment mode: ${env.ACEDATA_PAYMENT_MODE}`);
  line(env.SYNAPSE_RPC ? 'ok' : 'warn', 'Synapse RPC', env.SYNAPSE_RPC ? 'configured' : 'using public fallback (get a key at synapse.oobeprotocol.ai)');
  line(env.ACEDATA_API_TOKEN ? 'ok' : 'warn', 'AceData Bearer token', env.ACEDATA_API_TOKEN ? 'set' : 'unset (x402 mode does not need it; classic mode does)');

  // Wallet
  let wallet: PublicKey | null = null;
  if (!hasKeypair(env)) {
    line('fail', 'agent wallet', 'no SOLANA_KEYPAIR_PATH / SOLANA_SECRET_KEY_BS58');
  } else {
    try {
      const kp = loadKeypair(env);
      wallet = kp.publicKey;
      line('ok', 'agent wallet', wallet.toBase58());
    } catch (err) {
      line('fail', 'agent wallet', (err as Error).message);
    }
  }

  // Balances
  if (wallet) {
    try {
      const bal = await getBalances(getConnection(env), wallet);
      line(bal.sol >= 0.12 ? 'ok' : 'warn', 'SOL balance', `${bal.sol.toFixed(4)} SOL (need ~0.1 to register)`);
      line(bal.usdc > 0 ? 'ok' : 'warn', 'USDC balance', `${bal.usdc} USDC (needed for live x402 payments)`);
    } catch (err) {
      line('warn', 'balances', `RPC unreachable: ${(err as Error).message}`);
    }
  }

  // SAP registration status
  if (wallet) {
    try {
      const agent = await new ExplorerClient().getAgent(wallet.toBase58());
      if (agent?.name) line('ok', 'SAP registration', `${agent.name} — ${explorerAgentUrl(wallet.toBase58())}`);
      else line('warn', 'SAP registration', 'not registered yet — run `npm run register`');
    } catch (err) {
      line('warn', 'SAP registration', `Explorer unreachable: ${(err as Error).message}`);
    }
  }

  // SAP SDK shape (we use the /instructions subpath + bundled IDL; the root barrel is broken in 0.19.8)
  try {
    const probe = await probeSapSdk();
    const okSdk = probe.instructionsOk && probe.hasAgentModule && probe.idlFound;
    line(okSdk ? 'ok' : 'warn', 'SAP SDK',
      okSdk ? `AgentModule + IDL v${probe.idlVersion} loadable` : `instructions=${probe.instructionsOk} agentModule=${probe.hasAgentModule} idl=${probe.idlFound} ${probe.error ?? ''}`);
  } catch (err) {
    line('fail', 'SAP SDK', (err as Error).message);
  }

  // AceData reachability (free 402 probe on chat)
  try {
    const res = await fetch(`${ACEDATA_API_BASE}/openai/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
    });
    line(res.status === 402 ? 'ok' : 'warn', 'AceData x402 gate', `HTTP ${res.status} (402 expected unauthenticated)`);
  } catch (err) {
    line('warn', 'AceData reachability', (err as Error).message);
  }

  line('ok', 'AceData services available', Object.keys(ACE_SERVICES).join(', '));
  line('ok', 'Synapse Sentinel ref', SENTINEL_WALLET);
  console.log('');
}

main().catch((err) => {
  console.error('doctor failed:', err);
  process.exitCode = 1;
});
