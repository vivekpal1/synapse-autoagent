#!/usr/bin/env -S npx tsx
/**
 * Register the agent on SAP mainnet (required for the bounty). Costs ~0.1 SOL.
 *
 * Safe by default: in DRY_RUN it only PREVIEWS the registration. Set DRY_RUN=false
 * to actually send the on-chain transaction. The agent advertises its
 * AceData-backed capabilities so it is discoverable as a tool seller on SAP — the
 * "selling" half of "buying and selling via AI tool usage".
 */
import { explorerAgentUrl, getEnv, requireSynapseRpc } from '@autoagent/config';
import { loadKeypair } from '@autoagent/wallet';
import { ExplorerClient, registerAgent, type RegisterCapability } from '@autoagent/sap';
import { ACE_SERVICES } from '@autoagent/acedata';

async function main(): Promise<void> {
  const env = getEnv();
  const kp = loadKeypair(env);
  const wallet = kp.publicKey.toBase58();

  // One representative on-chain capability (the SAP IDL coder can't encode a vec of ≥2).
  // The individual AceData services are advertised via `protocols` and consumed via x402.
  const capabilities: RegisterCapability[] = [
    { id: 'acedata:ai-services', protocolId: 'acedata', version: '1.0.0' },
  ];
  const services = Object.values(ACE_SERVICES).map((s) => s.id);

  console.log('\n  SAP mainnet registration\n');
  console.log(`  wallet:      ${wallet}`);
  console.log(`  name:        ${env.AGENT_NAME}`);
  console.log(`  x402:        ${env.AGENT_X402_ENDPOINT}`);
  console.log(`  protocols:   acedata`);
  console.log(`  capability:  ${capabilities[0]!.id}`);
  console.log(`  services:    ${services.join(', ')} (consumed via x402)`);

  // Already registered?
  const existing = await new ExplorerClient().getAgent(wallet).catch(() => null);
  if (existing?.name) {
    console.log(`\n  Already registered as "${existing.name}" → ${explorerAgentUrl(wallet)}\n`);
    return;
  }

  if (env.DRY_RUN) {
    console.log('\n  DRY_RUN=true → preview only. Set DRY_RUN=false to send the tx (~0.1 SOL).\n');
    return;
  }

  const rpc = requireSynapseRpc(env);
  console.log('\n  Sending register_agent transaction…');
  const result = await registerAgent(kp, rpc, {
    name: env.AGENT_NAME,
    description: env.AGENT_DESCRIPTION,
    capabilities,
    protocols: ['acedata'],
    x402Endpoint: env.AGENT_X402_ENDPOINT,
  });
  console.log(`\n  ✓ registered`);
  console.log(`    signature: ${result.signature}`);
  console.log(`    agent PDA: ${result.agentPda}`);
  console.log(`    explorer:  ${explorerAgentUrl(wallet)}\n`);
}

main().catch((err) => {
  console.error('\x1b[31mregister failed:\x1b[0m', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
