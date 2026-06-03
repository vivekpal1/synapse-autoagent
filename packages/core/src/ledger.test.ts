import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ReceiptLedger } from './ledger';
import type { PaymentReceipt } from './types';

function receipt(over: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    id: ReceiptLedger.newId(),
    ts: new Date().toISOString(),
    runId: 'r1',
    workflow: 'wf',
    category: 'acedata-x402',
    flow: 'acedata-x402',
    service: 'acedata:/openai/chat/completions',
    token: 'USDC',
    amountAtomic: '95215',
    network: 'solana',
    dryRun: false,
    ...over,
  };
}

describe('ReceiptLedger', () => {
  let ledger: ReceiptLedger;
  beforeEach(() => {
    ledger = new ReceiptLedger(mkdtempSync(join(tmpdir(), 'autoagent-')));
  });

  it('appends and reads back receipts', () => {
    ledger.append(receipt());
    ledger.append(receipt({ amountAtomic: '30000' }));
    expect(ledger.all()).toHaveLength(2);
  });

  it('aggregates real vs simulated by category', () => {
    ledger.append(receipt({ amountAtomic: '100', dryRun: false }));
    ledger.append(receipt({ amountAtomic: '200', dryRun: true }));
    ledger.append(receipt({ amountAtomic: '50', category: 'sap-escrow', flow: 'sap-escrow', dryRun: false }));
    const rep = ledger.report();
    expect(rep.byCategory['acedata-x402'].real).toBe(100n);
    expect(rep.byCategory['acedata-x402'].dryRun).toBe(200n);
    expect(rep.byCategory['sap-escrow'].real).toBe(50n);
    expect(rep.totalReal).toBe(150n);
  });

  it('counts only real spend since a timestamp', () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    ledger.append(receipt({ amountAtomic: '100', ts: old }));
    ledger.append(receipt({ amountAtomic: '200' }));
    ledger.append(receipt({ amountAtomic: '999', dryRun: true }));
    const since = Date.now() - 24 * 3600 * 1000;
    expect(ledger.spentRealSince(since)).toBe(200n);
  });

  it('returns empty for a fresh ledger', () => {
    expect(ledger.all()).toEqual([]);
    expect(ledger.report().receiptCount).toBe(0);
  });
});
