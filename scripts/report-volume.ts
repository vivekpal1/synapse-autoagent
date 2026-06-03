#!/usr/bin/env -S npx tsx
/**
 * Aggregate the receipt ledger into a volume report (the bounty metric) and list
 * the most recent settled payments with their Solana Explorer links.
 */
import { getEnv } from '@autoagent/config';
import { ReceiptLedger } from '@autoagent/core';
import { formatUsdc } from '@autoagent/wallet';

function main(): void {
  const env = getEnv();
  const ledger = new ReceiptLedger(env.RECEIPTS_DIR);
  const rep = ledger.report();
  const all = ledger.all();

  console.log('\n  Synapse AutoAgent · volume report');
  console.log(`  ledger: ${ledger.path}\n`);
  console.log('  Category        real (USDC)     simulated     receipts');
  console.log('  ──────────────────────────────────────────────────────');
  for (const cat of ['acedata-x402', 'sap-escrow'] as const) {
    const b = rep.byCategory[cat];
    console.log(
      `  ${cat.padEnd(14)} ${formatUsdc(b.real).padStart(11)}  ${formatUsdc(b.dryRun).padStart(11)}  ${String(b.count).padStart(9)}`,
    );
  }
  console.log('  ──────────────────────────────────────────────────────');
  console.log(`  TOTAL real: ${formatUsdc(rep.totalReal)} USDC · simulated: ${formatUsdc(rep.totalDryRun)} USDC\n`);

  // Service breakdown (Cat 2 proof: which AceData services drove volume)
  const byService = new Map<string, { real: bigint; count: number }>();
  for (const r of all) {
    const key = (r.meta?.serviceId as string) ?? r.service;
    const cur = byService.get(key) ?? { real: 0n, count: 0 };
    cur.count += 1;
    if (!r.dryRun) cur.real += BigInt(r.amountAtomic);
    byService.set(key, cur);
  }
  if (byService.size > 0) {
    console.log('  By AceData service:');
    for (const [svc, v] of [...byService.entries()].sort((a, b) => Number(b[1].real - a[1].real))) {
      console.log(`   • ${svc.padEnd(10)} ${formatUsdc(v.real).padStart(11)} USDC · ${v.count} calls`);
    }
    console.log('');
  }

  const settled = all.filter((r) => r.txSignature).slice(-10);
  if (settled.length) {
    console.log('  Recent settled payments:');
    for (const r of settled) console.log(`   • ${r.service} ${formatUsdc(BigInt(r.amountAtomic))} USDC — ${r.explorerUrl}`);
    console.log('');
  }
}

main();
