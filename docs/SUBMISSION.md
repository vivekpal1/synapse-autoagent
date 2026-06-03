# Submission — Synapse AutoAgent

**Category:** 2 — Ace Data Cloud Usage (x402 facilitator)
**Repo:** `<your GitHub URL>`
**Demo:** `<your video/walkthrough URL>`
**Agent on SAP:** `<explorer.oobeprotocol.ai/agents/<your-wallet>>`

## One-liner

An autonomous Solana agent that discovers tools on the Synapse Agent Protocol, runs useful
AI workflows on Ace Data Cloud, and pays for every call itself with x402 through AceData's
own facilitator — trigger to settlement, no human in the loop.

## The problem it solves

AI services are pay-per-use, but agents can't hold credit-card accounts or click "top up."
x402 fixes the payment rail (HTTP 402 → sign → retry), but you still need an agent that can
**find capabilities, decide what to do, do it, and settle** on its own — safely. Synapse
AutoAgent is that loop, productized: a config-driven workflow engine where each step is a
discoverable tool or a paid AI service, with on-chain receipts and self-enforced spend limits.

## How each Category 2 requirement is met

- **Registered on SAP mainnet** — `npm run register` publishes the agent and its
  AceData-backed capabilities via the SAP SDK (`@oobe-protocol-labs/synapse-sap-sdk`). It
  appears on Synapse Explorer.
- **Complete automated workflow** — a scheduler triggers workflows that run
  discover → plan → execute → pay → settle → record with zero manual steps.
- **x402 via AceData's own facilitator + Synapse RPC** — the verified Solana flow: read the
  402 `accepts[]`, build a USDC `TransferChecked` with the facilitator as fee payer,
  partial-sign, retry with `X-Payment`. Solana RPC runs through the Synapse gateway.
- **≥3 distinct AceData services** — the shipped workflows use **search (`serp/google`),
  LLM chat (`openai/chat/completions`), and TTS (`fish/tts`)**; image (`midjourney`) and
  video (`veo`) are wired and one config line away.
- **AI capability** — an LLM planner turns a goal into a plan, and an LLM synthesizes the
  deliverable. The run adapts rather than following a fixed script.

## Why the volume is legitimate

Each call does real work — a research brief grounded in live search and narrated to audio,
or a complete content package (copy + image + voiceover). No loops, no wash, no spam. Spend
guardrails (`MAX_USDC_PER_CALL/RUN/DAY`) are enforced before any transaction is signed, and
every payment is receipted to an auditable ledger linked to on-chain transactions.

## What's notable technically

- **Verified integration.** Built against source-read SDKs (see `docs/INTEGRATION-GUIDE.md`),
  using the exact AceData x402 form that settled on mainnet — and correctly separating it
  from OOBE's PayAI-backed x402 RPC server (a common mix-up).
- **Config-driven & scalable.** New autonomous behaviors are YAML files; new AI services are
  one descriptor. No dependency cycles; clean package boundaries.
- **Production posture.** Typecheck + 30 tests + lint in CI, Docker/compose, structured
  logging, dry-run-by-default safety, and a live volume dashboard.

## Run it

```bash
npm install && cp .env.example .env
npm run agent:once          # full pipeline in safe DRY-RUN
# add keys, set DRY_RUN=false → npm run register → npm run agent → npm run dashboard
```

See `docs/RUNBOOK.md` for the full go-live sequence and `docs/DEMO-SCRIPT.md` for the walkthrough.








Here's how to run and test it, from "works right now with zero setup" up to "live on mainnet."

## Level 1 — run & test instantly (no keys, safe DRY-RUN)

Everything here works as-is — payments are simulated, nothing is spent.

```bash
cd /Users/vivek/projects/synapse-autoagent
npm install                 # already done, but safe to re-run

# ── automated tests / quality gates ──
npm run typecheck           # TS compiles clean
npm test                    # 30 unit tests (engine, ledger, guard, x402 envelope, services)
npm run lint                # eslint clean

# ── run the autonomous agent end-to-end ──
npm run agent -- --list     # list the workflows it found
npm run agent:once          # run BOTH workflows once → prints steps, receipts, volume

# ── watch the dashboard (monochrome) ──
npm run dashboard           # then open http://localhost:4040 in a browser
```

**What to expect from `npm run agent:once`:** each workflow runs `discover → plan → search → summarize → narrate → record`, prints a `💸 (sim)` receipt per AceData service, a `Σ run spend`, and a volume summary. It also writes deliverables to `data/outputs/*.md` — open one to see the actual generated brief.

> Order matters for the dashboard: run `npm run agent:once` **first** (it creates `receipts/ledger.ndjson`), then `npm run dashboard` — the page reads that ledger and shows the volume + receipts table.

A few more you can poke at:
```bash
npm run report                  # volume by category + by AceData service + tx links
npm run inspect:402 -- chat     # ask AceData for the live x402 price of a chat call (no payment)
npm run agent -- --once --workflow "Content Studio"   # run just one workflow
```

## Level 2 — go live (real mainnet USDC volume, for the actual bounty)

This needs **your** accounts/keys — it moves real money, so it's gated behind `DRY_RUN=false`.

```bash
cp .env.example .env
```
Then edit `.env`:
1. **`SYNAPSE_RPC`** — free key from https://synapse.oobeprotocol.ai/signup
2. **`SOLANA_KEYPAIR_PATH=./keys/agent.json`** — a funded mainnet keypair (`solana-keygen new -o keys/agent.json`); fund with ~0.1 SOL + some USDC
3. Sign up at https://platform.acedata.cloud (Google/GitHub → free credits)
4. Keep `DRY_RUN=true` for now

```bash
npm run doctor              # green checklist: wallet, balances, RPC, AceData 402 gate, SAP status
npm run balances            # confirm SOL + USDC present
npm run register            # DRY_RUN=true → previews only
DRY_RUN=false npm run register   # actually registers on SAP mainnet (~0.1 SOL)

# Now generate real volume:
DRY_RUN=false npm run agent:once    # one controlled pass with real payments
# or run the scheduler forever:
DRY_RUN=false npm run agent
```

Then `npm run report` / the dashboard will show **`paid`** receipts with real Solana Explorer tx links. Full walkthrough: [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Option — run as a service (Docker)

```bash
docker compose up --build   # agent + dashboard together, auto-restart
```

---

Want me to run `npm run agent:once` + boot the dashboard right now so you can see the current state, or are you set to drive it yourself?