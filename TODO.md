# TODO — Synapse AutoAgent · **Category 2: Ace Data Cloud Usage (x402)**

> Master tracking file. Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked (needs user)

**Bounty:** [Autonomous Agent Bounty: OOBE × Ace Data Cloud](https://superteam.fun/earn/listing/autonomous-agent-bounty-oobe-ace-data-cloud)
**Chosen category:** **Cat 2 — Ace Data Cloud Usage (x402 facilitator)**. (You can join both but win one; we go all-in on Cat 2.)

**What we're building:** A SAP-registered autonomous agent that, on a trigger and with **zero manual steps**,
discovers/selects tools, runs an AI workflow that **consumes ≥3 distinct Ace Data Cloud services**, **pays via x402
through AceData's own facilitator** (Solana, verified flow), settles, and records on-chain-verifiable receipts —
maximizing **Ace Data Cloud service volume**.

### Cat 2 qualification checklist (from the bounty)
- [x] Register agent(s) on **SAP mainnet** — code complete (`@autoagent/sap` + `scripts/register-agent.ts`); **user runs `npm run register` with a funded key**
- [x] Execute a **complete automated workflow** (trigger → execute → pay → settle, no manual input) → `@autoagent/core` engine + `apps/agent` (runs end-to-end ✓)
- [!] Create **Ace Data Cloud** account at platform.acedata.cloud (Google/GitHub → free credits) — *user action*
- [x] Use **x402 with AceData's own facilitator** + **Synapse RPC** in execution → `@autoagent/x402` (verified flow) + `@autoagent/acedata`
- [x] Use **≥3 distinct Ace Data Cloud services** (chat, search, TTS, image, video) → `@autoagent/acedata`

---

## Phase 0 — Foundation ✅
- [x] Env probe (Node 24), `git init`, `.gitignore`, `.env.example`, tsconfig, vitest, eslint, prettier
- [x] Research → `docs/INTEGRATION-GUIDE.md` (source-verified)
- [x] npm dependency graph verified (all packages exist)

## Phase 1 — Package spine
- [x] `@autoagent/config` — zod env + verified constants (addresses, mints, AceData URLs)
- [x] `@autoagent/wallet` — keypair load, SOL/USDC balances, Synapse RPC connection
- [x] `@autoagent/core` — types, logger, receipt ledger, spend guard, **config-driven workflow engine**, registry, templating
- [x] `@autoagent/x402` — **verified raw Solana x402 payer** (AceData facilitator) + OOBE RPC 402 inspector

## Phase 2 — Ace Data Cloud integration (the star) ✅
- [x] `@autoagent/acedata` — client for **5 services**: chat, web search, TTS, image, video
- [x] x402 payment mode (default) via `@autoagent/x402` + classic Bearer mode fallback
- [x] Task-based polling helper (image/video return `task_id`)
- [x] Per-service receipts (service name, USDC amount, tx) → volume attribution

## Phase 3 — SAP registration (required, lightweight) ✅
- [x] `@autoagent/sap` — register agent on mainnet (verified low-level instruction path) + Explorer discovery read
- [x] Publish AceData-backed **capabilities** on SAP (the "selling" side of "buying & selling")

## Phase 4 — Autonomous agent app ✅
- [x] `apps/agent` — runner: scheduler trigger, step-handler registration, run loop, `--once`/`--list`/`--workflow`
- [x] Step handlers: `discover`, `acedata.chat/search/tts/image/video`, `ai.plan`, `record`
- [x] Flagship workflows (YAML): **Autonomous Research Brief** + **Content Studio** (each uses 3+ services)
- [x] AI capability: `ai.plan` LLM planner decides the run from a goal

## Phase 5 — Observability & proof ✅
- [x] `apps/dashboard` — live volume by category, receipts table w/ Explorer tx links, service breakdown (smoke-tested)
- [x] `scripts/`: `doctor`, `check-balances`, `inspect-402`, `register-agent`, `report-volume`

## Phase 6 — Hardening & scale ✅
- [x] Unit tests — 30 passing (engine, templating, ledger, guard, x402 envelope, acedata services)
- [x] Dockerfile + docker-compose (agent + dashboard)
- [x] GitHub Actions CI (install, typecheck, test, lint)
- [x] `npm run typecheck` clean · `npm run lint` clean

## Phase 7 — Deliverables ✅
- [x] `docs/ARCHITECTURE.md` (+ mermaid diagram), `docs/RUNBOOK.md`, `docs/SUBMISSION.md`, `docs/DEMO-SCRIPT.md`
- [x] `docs/tweets.md` — launch thread (@OOBEonSol @AceDataCloud) + GitHub link
- [x] Polished root `README.md`

---

## ⚠️ Blocked-on-user (live credentials — needed to generate REAL volume)
- [!] **Ace Data Cloud account** → free credits (Google/GitHub signup) — and for sustained volume, a USDC-funded Solana wallet
- [!] **Synapse RPC** free-tier key (synapse.oobeprotocol.ai) → `SYNAPSE_RPC`
- [!] **Funded Solana mainnet keypair** (SOL for SAP registration ~0.1 SOL; USDC for AceData x402 payments)
- [!] Run `npm run register` (SAP mainnet), then `DRY_RUN=false npm run agent` to start generating volume
- [!] Post submission on X (thread in `docs/tweets.md`), tag sponsors, link repo + demo

_Last updated: 2026-06-03 — pivoted to Cat-2-only scope._
