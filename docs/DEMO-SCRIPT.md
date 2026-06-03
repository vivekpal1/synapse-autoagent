# Demo script

A ~3-minute walkthrough that answers every question the bounty asks. Record terminal +
the dashboard. Each scene names the command to run and the point to make.

> Tip: run once in DRY-RUN to rehearse, then flip `DRY_RUN=false` for the real take so the
> dashboard shows **paid** receipts with live Explorer tx links.

---

### Scene 0 — Hook (10s)
> "This is an autonomous Solana agent. I start it once — it discovers tools, does real AI
> work, and pays for each call itself with x402. No human in the loop."

Show: `npm run doctor` — a green checklist (wallet, balances, Synapse RPC, AceData 402 gate, SAP registration). Proves the prerequisites are live.

---

### Scene 1 — How it discovers & selects tools (via SAP) (25s)
Run: `npm run agent -- --list` then start a run: `DRY_RUN=false npm run agent:once`.

Point to the first step in the logs: **`discover`** queries the on-chain **SAP Explorer**
(`explorer.oobeprotocol.ai/api/sap/agents`) for live agents and their capabilities. The
agent itself is registered on SAP (`npm run register`) and advertises its AceData-backed
tools — so it's both a consumer and a discoverable seller.

---

### Scene 2 — Which Ace Data Cloud services, and why (30s)
Point to the next steps. The **Autonomous Research Brief** workflow uses **3 distinct
AceData services**, each chosen for the job:
- **`serp/google`** — to gather current sources on the topic (grounding).
- **`openai/chat/completions`** — to synthesize a tight, cited brief (reasoning).
- **`fish/tts`** — to narrate the brief to audio (delivery).

Run `npm run inspect:402 -- chat` to show the **live x402 price** the agent reads before paying.

---

### Scene 3 — How tasks execute end-to-end (25s)
Show the run log top-to-bottom: `discover → plan → search → summarize → narrate → record`.
Each step's output feeds the next via `${steps.*}` templates. The `record` step writes the
finished deliverable to `data/outputs/…md`. Open it — a real research brief with an audio link.

> "An LLM **planner** decided the approach — that's the AI capability, and why this adapts
> instead of running a fixed script."

---

### Scene 4 — How payments are handled (30s)
This is the core of Category 2. For each service:
1. The agent calls the endpoint with **no auth** → AceData returns **HTTP 402** with `accepts[]`.
2. The [x402 payer](../packages/x402/src/solana-payer.ts) builds a USDC `TransferChecked`,
   sets the **AceData facilitator as the fee payer** (so the agent pays **0 SOL** gas),
   partial-signs, and retries with the `X-Payment` header.
3. The facilitator settles on Solana. A receipt is written.

Show the logs: `💸 acedata:/serp/google 0.03 USDC (paid)` with a tx link.

---

### Scene 5 — What makes it autonomous + proof (30s)
> "I never approved a payment, picked a tool, or wrote a prompt mid-run. The scheduler
> triggers it; the agent does the rest — within hard spend guardrails it enforces itself."

Show the **dashboard** (`npm run dashboard` → localhost:4040): volume by category, the
AceData service breakdown bars, recent **paid** receipts with Explorer links, and the
"✓ registered on SAP mainnet" badge. Then `npm run report` for the same numbers in the terminal.

Close: "Discovers via SAP, executes on Ace Data Cloud, settles with x402 — autonomously. GitHub in the post."

---

## The five required points, in one line each

| Question | Answer |
|---|---|
| Discovers & selects tools (SAP)? | `discover` step → SAP Explorer on-chain agent/tool index; agent self-registers on SAP |
| Uses which AceData APIs & why? | `serp/google` (ground), `openai/chat` (reason), `fish/tts` (deliver) — +image/video available |
| Tasks executed end-to-end? | Engine chains steps via a blackboard; deliverable saved to `data/outputs` |
| Payments handled? | x402: 402 → sign USDC `TransferChecked` (facilitator fee-payer) → retry → settle → receipt |
| What's autonomous? | Scheduler trigger; LLM planner; no manual approval; self-enforced spend guardrails |
