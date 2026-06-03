import { explorerTxUrl } from '@autoagent/config';
import { ReceiptLedger } from './ledger';
import type { Category, PaymentInfo, PaymentReceipt, RunContext } from './types';

/** Enrich a package-level PaymentInfo into a full, ledger-ready PaymentReceipt. */
export function buildReceipt(
  info: PaymentInfo,
  ctx: Pick<RunContext, 'runId' | 'workflow'>,
  category?: Category,
): PaymentReceipt {
  return {
    id: ReceiptLedger.newId(),
    ts: new Date().toISOString(),
    runId: ctx.runId,
    workflow: ctx.workflow.name,
    category: category ?? ctx.workflow.category,
    flow: info.flow,
    service: info.service,
    token: info.token,
    amountAtomic: info.amountAtomic,
    network: info.network,
    payTo: info.payTo,
    txSignature: info.txSignature,
    explorerUrl: info.txSignature ? explorerTxUrl(info.txSignature) : undefined,
    dryRun: info.dryRun,
    meta: info.meta,
  };
}
