# Runbook — zero to real on-chain volume

This is the exact sequence to take the agent from a fresh clone to generating real
**Ace Data Cloud consumption volume** on Solana mainnet (Category 2).

> Everything is **DRY_RUN by default**. You only spend after Step 5.

## 0. Prerequisites

- Node ≥ 18 (tested on 20/24).
- A Solana mainnet keypair you control.
- ~0.1 SOL (for SAP registration) + a few USDC (for AceData x402 payments).

## 1. Install & smoke-test (no keys, no spend)

```bash
npm install
cp .env.example .env
npm run agent:once      # runs both workflows in DRY-RUN end-to-end
npm test                # 30 unit tests
```

You should see each workflow execute discover → plan → 3 AceData services → record, with
**simulated** receipts and a per-category volume summary.

## 2. Create the accounts (free)

1. **Ace Data Cloud** — sign up at <https://platform.acedata.cloud> with Google/GitHub.
   You get **free credits** automatically. (For x402 you don't even need the API key — but
   grab it if you want to try `classic` mode.)
2. **Synapse RPC** — create a free account at <https://synapse.oobeprotocol.ai/signup>.
   Copy your `sk_live_...` key. (For a higher tier, the bounty says you can ask for a discount.)

## 3. Configure `.env`

```bash
SYNAPSE_RPC="https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=sk_live_XXXX"
SYNAPSE_API_KEY="sk_live_XXXX"
SOLANA_KEYPAIR_PATH="./keys/agent.json"     # a solana-keygen JSON file
ACEDATA_PAYMENT_MODE="x402"
AGENT_X402_ENDPOINT="https://your-domain/x402"   # any URL you control (advertised on SAP)
DRY_RUN="true"                               # keep true until Step 5
```

Put your keypair at `keys/agent.json` (the `keys/` dir is gitignored). To make one:
`solana-keygen new -o keys/agent.json`. Fund it with SOL + USDC.

## 4. Preflight

```bash
npm run doctor          # checks wallet, balances, RPC, AceData 402 gate, SAP status, SDK shape
npm run balances        # confirms SOL + USDC are present
npm run inspect:402 -- chat   # prints the live USDC price of a chat call (no payment)
```

Fix any ✗ before continuing. You want SOL ≥ ~0.12 and USDC > 0.

## 5. Register on SAP mainnet

```bash
# Preview first (DRY_RUN=true): shows exactly what will be registered
npm run register

# Then go live for this one tx:
DRY_RUN=false npm run register     # sends register_agent (~0.1 SOL)
```

This publishes your agent and its AceData-backed capabilities on SAP. Verify on the
Explorer link the command prints.

## 6. Generate volume

```bash
# Set DRY_RUN=false in .env to settle real USDC, then:
npm run agent           # autonomous scheduler — runs workflows on their intervals, forever
# or a single controlled pass:
DRY_RUN=false npm run agent:once
```

Every AceData call now settles real USDC via the facilitator (you pay **0 SOL** gas). Each
settlement is receipted.

## 7. Prove it

```bash
npm run report          # volume by category + by AceData service + recent tx links
npm run dashboard       # http://localhost:4040 — live, shareable proof
```

Point judges at the dashboard and the on-chain transactions.

## Run it as a service (optional)

```bash
docker compose up --build      # agent + dashboard, restarts on failure
```

## Tuning volume safely

- `SCHEDULER_INTERVAL_MS` — how often workflows fire.
- `MAX_USDC_PER_CALL` / `_RUN` / `_DAY` — hard ceilings enforced before signing.
- Prefer the cheap synchronous services (chat, search, tts) for steady, legitimate volume;
  image/video are pricier and task-based.

> **Legitimacy matters.** The bounty disqualifies wash/loop/spam usage. These workflows do
> real, useful work (research briefs, content packages) — keep it that way.
