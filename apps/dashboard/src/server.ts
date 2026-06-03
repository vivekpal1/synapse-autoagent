#!/usr/bin/env -S npx tsx
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import { explorerAgentUrl, getEnv } from '@autoagent/config';
import { ReceiptLedger } from '@autoagent/core';
import { ExplorerClient } from '@autoagent/sap';
import { hasKeypair, loadKeypair } from '@autoagent/wallet';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = getEnv();
const app = express();
const ledger = new ReceiptLedger(env.RECEIPTS_DIR);
const explorer = new ExplorerClient();

const usd = (atomic: bigint): number => Number(atomic) / 1e6;

app.get('/api/volume', (_req, res) => {
  const rep = ledger.report();
  const all = ledger.all();
  const byService: Record<string, { realUsd: number; count: number }> = {};
  for (const r of all) {
    const k = (r.meta?.serviceId as string) ?? r.service;
    byService[k] ??= { realUsd: 0, count: 0 };
    byService[k]!.count += 1;
    if (!r.dryRun) byService[k]!.realUsd += usd(BigInt(r.amountAtomic));
  }
  res.json({
    dryRun: env.DRY_RUN,
    category: {
      acedata: {
        realUsd: usd(rep.byCategory['acedata-x402'].real),
        simUsd: usd(rep.byCategory['acedata-x402'].dryRun),
        count: rep.byCategory['acedata-x402'].count,
      },
      sap: {
        realUsd: usd(rep.byCategory['sap-escrow'].real),
        simUsd: usd(rep.byCategory['sap-escrow'].dryRun),
        count: rep.byCategory['sap-escrow'].count,
      },
    },
    totalRealUsd: usd(rep.totalReal),
    totalSimUsd: usd(rep.totalDryRun),
    byService,
    recent: all
      .slice(-25)
      .reverse()
      .map((r) => ({
        ts: r.ts,
        service: r.service,
        usd: usd(BigInt(r.amountAtomic)),
        dryRun: r.dryRun,
        tx: r.txSignature ?? null,
        explorerUrl: r.explorerUrl ?? null,
        workflow: r.workflow,
      })),
  });
});

app.get('/api/agent', async (_req, res) => {
  let wallet: string | null = null;
  try {
    if (hasKeypair(env)) wallet = loadKeypair(env).publicKey.toBase58();
  } catch {
    /* no wallet configured */
  }
  if (!wallet) return res.json({ wallet: null, registered: false });
  try {
    const agent = await explorer.getAgent(wallet);
    const txs = await explorer.recentTransactions(10).catch(() => []);
    res.json({
      wallet,
      registered: Boolean(agent?.name),
      agent,
      explorerUrl: explorerAgentUrl(wallet),
      recentTx: txs.slice(0, 10),
    });
  } catch (err) {
    res.json({ wallet, registered: false, error: (err as Error).message });
  }
});

app.use(express.static(join(__dirname, '..', 'public')));

// Railway (and most PaaS) inject PORT; fall back to the configured DASHBOARD_PORT locally.
const port = Number(process.env.PORT) || env.DASHBOARD_PORT;
app.listen(port, '0.0.0.0', () => {
  console.log(`\n  Dashboard → http://localhost:${port}\n  (reads ${ledger.path})\n`);
});
