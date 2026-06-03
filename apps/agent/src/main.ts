#!/usr/bin/env -S npx tsx
import { getEnv } from '@autoagent/config';
import { formatUsdc } from '@autoagent/wallet';
import type { RunResult, WorkflowDef } from '@autoagent/core';
import { buildRuntime } from './runtime';
import { loadWorkflows, findWorkflow } from './workflows';
import { Scheduler } from './scheduler';

interface Args {
  once: boolean;
  list: boolean;
  workflow?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { once: false, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--once') args.once = true;
    else if (a === '--list') args.list = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--workflow' || a === '-w') args.workflow = argv[++i];
    else if (a.startsWith('--workflow=')) args.workflow = a.slice('--workflow='.length);
  }
  return args;
}

function banner(): void {
  const env = getEnv();
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║  Synapse AutoAgent · Category 2: Ace Data Cloud Usage (x402)   ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');
  console.log(
    `  mode: ${env.DRY_RUN ? 'DRY-RUN (no real payments)' : '\x1b[31mLIVE — REAL MAINNET USDC\x1b[0m'}` +
      ` · payment: ${env.ACEDATA_PAYMENT_MODE} · rpc: ${env.SYNAPSE_RPC ? 'Synapse gateway' : 'public fallback'}`,
  );
  console.log('');
}

function printRunResult(r: RunResult): void {
  const ok = r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${ok} ${r.workflow}  (${r.durationMs}ms)`);
  for (const s of r.steps) {
    console.log(`      ${s.ok ? '·' : '✗'} ${s.id} [${s.kind}]${s.note ? ` — ${s.note}` : ''}`);
  }
  for (const rec of r.receipts) {
    const tag = rec.dryRun ? '\x1b[33m(sim)\x1b[0m' : '\x1b[32m(paid)\x1b[0m';
    console.log(
      `      💸 ${rec.service} ${formatUsdc(BigInt(rec.amountAtomic))} USDC ${tag}` +
        (rec.txSignature ? ` ${rec.explorerUrl}` : ''),
    );
  }
  console.log(`      Σ run spend: ${formatUsdc(BigInt(r.totalSpentAtomic))} USDC`);
  if (r.error) console.log(`      \x1b[31merror:\x1b[0m ${r.error}`);
  console.log('');
}

function printVolume(): void {
  const rt = buildRuntime();
  const rep = rt.ledger.report();
  console.log('  ── Volume to date (ledger) ─────────────────────────────────────');
  for (const cat of ['acedata-x402', 'sap-escrow'] as const) {
    const b = rep.byCategory[cat];
    console.log(
      `   ${cat.padEnd(13)} real ${formatUsdc(b.real).padStart(10)} USDC · sim ${formatUsdc(b.dryRun).padStart(10)} USDC · ${b.count} receipts`,
    );
  }
  console.log(`   ledger: ${rt.ledger.path}`);
  console.log('');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Synapse AutoAgent
Usage:
  npm run agent              start the autonomous scheduler (runs interval workflows forever)
  npm run agent:once         run every workflow once and exit
  tsx apps/agent/src/main.ts --once --workflow "Autonomous Research Brief"
  tsx apps/agent/src/main.ts --list

Set DRY_RUN=false in .env to settle real USDC on mainnet.`);
    return;
  }

  banner();
  const env = getEnv();
  const rt = buildRuntime(env);
  let workflows = loadWorkflows(env.WORKFLOWS_DIR);

  if (workflows.length === 0) {
    console.log(`  No workflows found in ${env.WORKFLOWS_DIR}. Add a .yaml workflow and retry.`);
    return;
  }

  if (args.list) {
    console.log('  Available workflows:');
    for (const w of workflows) {
      console.log(`   • ${w.name}  [${w.category}] — ${w.description}`);
    }
    console.log('');
    return;
  }

  if (args.workflow) {
    const wf = findWorkflow(env.WORKFLOWS_DIR, args.workflow);
    if (!wf) {
      console.error(`  Workflow "${args.workflow}" not found. Try --list.`);
      process.exitCode = 1;
      return;
    }
    workflows = [wf];
  }

  if (args.once || args.workflow) {
    for (const wf of workflows) {
      const result = await rt.engine.run(wf);
      printRunResult(result);
    }
    printVolume();
    return;
  }

  // Default: run forever on interval triggers.
  const scheduler = new Scheduler(rt);
  const shutdown = (): void => {
    scheduler.stop();
    printVolume();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  scheduler.start(workflows as WorkflowDef[]);
}

main().catch((err) => {
  console.error('\x1b[31mfatal:\x1b[0m', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
