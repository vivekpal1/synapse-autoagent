#!/usr/bin/env -S npx tsx
/**
 * Price discovery without paying: send an unauthenticated request to an Ace Data
 * Cloud service and print the 402 `accepts[]`. This is the x402 challenge the
 * agent reads before signing. Usage: `npm run inspect:402 -- chat`
 */
import { ACEDATA_API_BASE, USDC_DECIMALS } from '@autoagent/config';
import { ACE_SERVICES, getService } from '@autoagent/acedata';

async function main(): Promise<void> {
  const id = process.argv[2] ?? 'chat';
  const svc = getService(id);
  const url = `${ACEDATA_API_BASE}${svc.path}`;
  console.log(`\n  Probing ${svc.label}\n  POST ${url} (no auth → expect 402)\n`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(svc.buildHeaders?.({}) ?? {}) },
    body: JSON.stringify(svc.buildBody({})),
  });

  console.log(`  HTTP ${res.status}`);
  if (res.status !== 402) {
    console.log('  (not a 402 — endpoint may behave differently or require auth)\n');
    console.log((await res.text()).slice(0, 400));
    return;
  }

  const body = (await res.json()) as { accepts?: any[] };
  const accepts = body.accepts ?? [];
  console.log(`  ${accepts.length} payment option(s):\n`);
  for (const a of accepts) {
    const human =
      a.network?.startsWith?.('solana') || a.network === 'solana'
        ? `${Number(a.maxAmountRequired) / 10 ** USDC_DECIMALS} USDC`
        : `${a.maxAmountRequired} (atomic)`;
    console.log(`   • ${a.scheme.padEnd(6)} ${String(a.network).padEnd(20)} ${human.padStart(14)} → ${a.payTo}`);
  }
  console.log(`\n  Known services: ${Object.keys(ACE_SERVICES).join(', ')}\n`);
}

main().catch((err) => {
  console.error('inspect-402 failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
