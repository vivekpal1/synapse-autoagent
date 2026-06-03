# Launch thread (X)

Tag **@OOBEonSol** and **@AceDataCloud**. Attach the demo video to tweet 1 and the repo link
in tweet 1 (or the last tweet). Replace `<repo>` / `<demo>` / `<explorer>` placeholders.

---

## Main thread

**1/ 🧵**
Meet **Synapse AutoAgent** — an autonomous agent on @solana that discovers tools, does real
AI work, and pays for every call *itself* with x402.

Trigger → discover → execute → settle. No human in the loop.

Built for the @OOBEonSol × @AceDataCloud bounty (Category 2).

🎥 <demo>  ·  🛠 <repo>

**2/**
The loop, end to end:

⏱ scheduler fires
🔎 discovers tools on Synapse Agent Protocol (SAP)
🧠 an LLM plans the run
⚡ runs 3+ @AceDataCloud services (search → synthesize → narrate)
💸 pays each call via x402
🧾 records an on-chain receipt

**3/**
Payments are the fun part.

Call an @AceDataCloud service with no key → HTTP **402**. The agent reads the price, signs a
USDC transfer with **AceData's facilitator as fee payer**, and retries.

Result: the agent pays in USDC and spends **0 SOL** on gas. 🪄

**4/**
It's a real worker, not a demo loop.

The "Research Brief" workflow: web search for live sources → LLM writes a tight brief →
text-to-speech narrates it. Out comes a finished, useful artifact every run.

Swap in image + video generation with one line of YAML.

**5/**
Why it matters: agents can't open billing accounts. x402 + SAP gives them a way to *find*
capabilities and *pay* for them autonomously.

Synapse AutoAgent productizes that loop — config-driven workflows, on-chain receipts, and
spend guardrails enforced *before* it ever signs.

**6/**
Open source, typed, tested (30 ✅), Dockerized, with a live volume dashboard showing every
@AceDataCloud call + Solana Explorer tx links.

Registered on SAP mainnet → <explorer>

Category 2 · built on @OOBEonSol Synapse + @AceDataCloud.

⭐ <repo>

---

## Single-tweet version

Built **Synapse AutoAgent** for the @OOBEonSol × @AceDataCloud bounty: an autonomous @solana
agent that discovers tools on SAP, runs @AceDataCloud AI services (search + LLM + TTS), and
pays each call via x402 — 0 SOL gas, on-chain receipts, no human in the loop.

🎥 <demo>  🛠 <repo>  (Category 2)

---

## Reply / caption snippets

- "Every 💸 in the dashboard is a real x402 settlement on Solana — click through to Explorer."
- "DRY-RUN by default; spend ceilings enforced before any tx is signed. Autonomy ≠ reckless."
- "Adding a new AI service = one descriptor. Adding a new workflow = one YAML file."
