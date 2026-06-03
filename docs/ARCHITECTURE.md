# Architecture

Synapse AutoAgent is a small TypeScript monorepo with one hard rule: **integration
packages never import the engine.** Dependencies flow one way, so there are no
cycles and any package can be tested in isolation.

```
config ──┬──────────────────────────────┐
         ▼                               ▼
      wallet        core (engine/ledger/guard/types/logger)
         │                ▲     ▲     ▲
         └────────┐       │     │     │
                  ▼       │     │     │
                x402 ─────┘   sap  acedata        (these depend on core+config, not vice-versa)
                  ▲           ▲      ▲
                  └───────────┴──────┴──────── apps/agent  (wires handlers → engine)
                                               apps/dashboard (reads ledger + explorer)
```

## The autonomous loop

The bounty's bar is "trigger → execution → payment without manual input." That is
literally the shape of [`WorkflowEngine.run`](../packages/core/src/engine.ts):

1. **Trigger** — [`Scheduler`](../apps/agent/src/scheduler.ts) fires each workflow on
   its `trigger.everyMs`. No prompt, no human.
2. **Discover** — the `discover` handler queries the [SAP Explorer](../packages/sap/src/explorer.ts)
   for live agents/tools (on-chain tool discovery).
3. **Plan** — `ai.plan` calls an LLM to turn the workflow's goal into concrete steps.
   This is both the *AI capability* and what makes the run adaptive rather than scripted.
4. **Execute + Pay** — each `acedata.*` step calls an Ace Data Cloud service. With no
   auth the gateway returns **HTTP 402**; the [x402 payer](../packages/x402/src/solana-payer.ts)
   reads the `accepts[]`, builds a USDC `TransferChecked` with the **facilitator as fee
   payer**, partial-signs, and retries with the `X-Payment` header.
5. **Settle + Record** — the facilitator settles on Solana; a [`PaymentReceipt`](../packages/core/src/types.ts)
   lands in the append-only [ledger](../packages/core/src/ledger.ts).

Steps pass data forward through a blackboard (`ctx.state[stepId]`) addressed by
`${steps.<id>.<path>}` / `${state.<key>}` / `${env.<KEY>}` templates — so workflows are
**data, not code**.

## Why config-driven workflows

Adding a new autonomous behavior is a YAML file in [`workflows/`](../workflows), not a
deploy. A workflow lists `steps` of a `kind` with `params`; the engine resolves the
`kind` against a [`StepRegistry`](../packages/core/src/registry.ts) the app populates.
This is the scalability story: the primitives (discover, the five AceData services,
ai.plan, record) compose into unlimited workflows.

## The three x402 flavors (don't mix them)

Research surfaced that "x402" means three incompatible things in this ecosystem:

| Flavor | Facilitator | Wire | Used here for |
|---|---|---|---|
| **Ace Data Cloud** | `facilitator.acedata.cloud` | `accepts[]` in JSON body, header `X-Payment`, payload `{serializedTransaction}` | **Category 2 — the core volume driver** |
| **OOBE x402 RPC server** | **PayAI** (`facilitator.payai.network`) | `PAYMENT-REQUIRED` header, `X-PAYMENT` | supporting only ([inspector](../packages/x402/src/oobe-rpc.ts)) |
| **SAP agent-to-agent** (Sentinel) | none — on-chain `settleCallsV2` | `X-Payment-*` headers | Category 1 (not built) |

The bounty brief said "AceDataCloud facilitator" for OOBE — that's inaccurate, and
conflating them would send payments to the wrong settlement layer. The payer is
parameterized (`requirementsSource`, `paymentHeaderName`, `facilitatorPubkey`) so each
flavor stays correct and separate.

## Spend safety

`SpendGuard` enforces per-call / per-run / per-day USDC ceilings. The agent computes the
tightest remaining ceiling and passes it to the payer, which refuses any 402 quote above
it **before signing**. Dry-run spend never counts against the real daily ledger total.

## Proof of volume

`receipts/ledger.ndjson` is the source of truth. [`report-volume`](../scripts/report-volume.ts)
and the [dashboard](../apps/dashboard) aggregate it by category and by AceData service, and
link each settlement to Synapse Explorer. That ledger + the on-chain transactions are what a
judge verifies.

## Extension points

- **Add an AceData service** → append one descriptor to [`ACE_SERVICES`](../packages/acedata/src/services.ts).
- **Add a workflow** → drop a `.yaml` in [`workflows/`](../workflows).
- **Add a step kind** → register a handler in [`apps/agent/src/handlers.ts`](../apps/agent/src/handlers.ts).
- **Swap the LLM/planner** → it's just the `chat` service with a system prompt.
