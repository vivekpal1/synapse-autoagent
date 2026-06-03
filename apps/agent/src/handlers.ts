import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Connection, Keypair } from '@solana/web3.js';
import { type Env } from '@autoagent/config';
import {
  GuardrailError,
  buildReceipt,
  type Artifact,
  type StepHandler,
  type StepRegistry,
} from '@autoagent/core';
import { getConnection, loadKeypair } from '@autoagent/wallet';
import { AceDataClient } from '@autoagent/acedata';
import { ExplorerClient } from '@autoagent/sap';

/**
 * Registers every reusable step primitive the workflow YAML can reference. The
 * engine stays generic; all knowledge of SAP/AceData/x402 lives here, so adding a
 * capability is "write a handler + use its kind in a workflow file".
 */
export function registerHandlers(registry: StepRegistry, env: Env): void {
  const explorer = new ExplorerClient();

  // Lazy, failure-tolerant wallet/connection — a DRY_RUN offline run needs neither.
  let _conn: Connection | undefined;
  let _payer: Keypair | undefined;
  let walletTried = false;
  const conn = (): Connection => (_conn ??= getConnection(env));
  const payer = (dryRun: boolean): Keypair | undefined => {
    if (!walletTried) {
      walletTried = true;
      try {
        _payer = loadKeypair(env);
      } catch (err) {
        if (!dryRun) throw err;
      }
    }
    return _payer;
  };

  // ── discover: select tools/agents via the SAP Explorer (SAP discovery) ──────
  registry.register('discover', async (params, ctx) => {
    try {
      const tools = await explorer.discoverTools({
        capability: params.capability as string | undefined,
        protocol: params.protocol as string | undefined,
        limit: (params.limit as number) ?? 10,
      });
      ctx.logger.info({ count: tools.length }, 'discovered SAP tools');
      return {
        ok: true,
        output: { tools, count: tools.length, selected: tools[0] ?? null },
        note: `discovered ${tools.length} SAP tools`,
      };
    } catch (err) {
      if (ctx.dryRun) {
        return { ok: true, output: { tools: [], count: 0 }, note: 'discovery skipped (offline dry-run)' };
      }
      throw err;
    }
  });

  // ── AceData service handlers (each is a paid x402 call = Cat-2 volume) ───────
  const aceHandler =
    (serviceId: string): StepHandler =>
    async (params, ctx) => {
      const client = new AceDataClient({
        mode: env.ACEDATA_PAYMENT_MODE,
        connection: conn(),
        payer: payer(ctx.dryRun),
        apiToken: env.ACEDATA_API_TOKEN,
        dryRun: ctx.dryRun,
        pollAttempts: (params.pollAttempts as number) ?? 0,
      });

      // Effective per-call ceiling = tightest of per-call / remaining-run / remaining-day.
      const perCall = BigInt(env.MAX_USDC_PER_CALL);
      const runRemaining = BigInt(env.MAX_USDC_PER_RUN) - ctx.guard.runTotal;
      const dayRemaining = ctx.dryRun
        ? perCall
        : BigInt(env.MAX_USDC_PER_DAY) - ctx.guard.daySpent();
      const ceiling = [perCall, runRemaining, dayRemaining].reduce((a, b) => (b < a ? b : a));
      if (ceiling <= 0n) {
        throw new GuardrailError(`No remaining budget for ${serviceId} (run/day ceiling reached).`);
      }

      const input = (params.input as Record<string, any>) ?? params;
      const outcome = await client.call(serviceId, input, { maxAmountAtomic: ceiling });

      const amount = BigInt(outcome.payment.amountAtomic);
      if (!outcome.payment.dryRun) ctx.guard.record(amount);

      const receipt = buildReceipt(outcome.payment, ctx);
      const artifacts: Artifact[] =
        outcome.result.artifactValue !== undefined
          ? [
              {
                stepId: '',
                kind: outcome.result.artifactKind ?? 'json',
                label: outcome.label,
                value: outcome.result.artifactValue,
              },
            ]
          : [];

      return {
        ok: true,
        output: {
          summary: outcome.result.summary,
          text: outcome.result.artifactKind === 'text' ? outcome.result.artifactValue : undefined,
          url: ['audio-url', 'image-url', 'video-url'].includes(outcome.result.artifactKind ?? '')
            ? outcome.result.artifactValue
            : undefined,
          artifact: outcome.result.artifactValue,
          data: outcome.result.data,
        },
        receipt,
        artifacts,
        note: outcome.result.summary,
      };
    };

  registry.register('acedata.chat', aceHandler('chat'));
  registry.register('acedata.search', aceHandler('search'));
  registry.register('acedata.tts', aceHandler('tts'));
  registry.register('acedata.image', aceHandler('image'));
  registry.register('acedata.video', aceHandler('video'));

  // ── ai.plan: the AI capability that makes the run autonomous ────────────────
  // An LLM turns a high-level goal into a concrete plan that later steps consume
  // via ${steps.<id>.text}. It is itself a paid AceData chat call (counts as volume).
  registry.register('ai.plan', async (params, ctx) => {
    const handler = registry.get('acedata.chat');
    const goal = (params.goal as string) ?? 'Produce a useful research brief.';
    return handler(
      {
        input: {
          model: params.model ?? 'gpt-4o-mini',
          system:
            'You are an autonomous research planner for a Solana agent. Given a GOAL, output a tight, ' +
            'numbered plan (max 5 steps) naming which capabilities to use (web search, summarization, ' +
            'narration). Be specific and concise. Output plain text only.',
          prompt: `GOAL: ${goal}`,
          max_tokens: 400,
        },
      },
      ctx,
    );
  });

  // ── record: assemble the final deliverable (no payment) ─────────────────────
  registry.register('record', async (params, ctx) => {
    const title = (params.title as string) ?? `${ctx.workflow.name} — ${ctx.runId}`;
    const body = (params.body as string) ?? '';
    const md = `# ${title}\n\n${body}\n\n---\n_Run ${ctx.runId} · ${new Date().toISOString()} · ${ctx.dryRun ? 'DRY-RUN' : 'LIVE'}_\n`;
    const artifact: Artifact = { stepId: '', kind: 'text', label: title, value: md };

    if (params.save) {
      const dir = resolve('data', 'outputs');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${ctx.workflow.name.replace(/\W+/g, '_')}-${ctx.runId}.md`);
      writeFileSync(file, md, 'utf8');
      ctx.logger.info({ file }, 'saved deliverable');
    }
    return { ok: true, output: { markdown: md, title }, artifacts: [artifact], note: `recorded: ${title}` };
  });
}
