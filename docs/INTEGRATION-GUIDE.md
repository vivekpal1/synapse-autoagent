# Synapse + SAP + x402 + Ace Data Cloud — Integration Guide

> Source-verified reference for building an autonomous Solana agent that registers on-chain (SAP),
> discovers/serves tools, takes pay-per-call payments via x402, and consumes paid services
> (Synapse Sentinel, Ace Data Cloud). Everything below was drawn from **cloned source + live API
> verification** (2026-06-02). **LOW-confidence / unverified items are flagged inline with ⚠️ and
> collected in §10.** This is the contract the codebase in this repo is built against.

---

## 0. The three systems (mental model)

| System | Package(s) | What it is | Auth |
|---|---|---|---|
| **SAP** (Synapse Agent Protocol) | `@oobe-protocol-labs/synapse-sap-sdk` | On-chain Anchor program for agent identity, tool discovery, escrow, reputation, memory | Solana keypair (every action is a tx) |
| **Synapse Client SDK / Gateway** | `@oobe-protocol-labs/synapse-client-sdk` | Typed Solana RPC gateway + AI-agent toolkit (tools, MCP, AgentGateway, x402) | RPC Bearer API key (`sk_live_...`) |
| **x402** | `@x402/*` (Coinbase spec) **or** SAP's own header scheme | HTTP 402 micropayment protocol. Two **incompatible** flavors coexist (see §6). | On-chain signature (no account) |
| **Ace Data Cloud** | `@acedatacloud/sdk` + `@acedatacloud/x402-client` | AI service aggregator (LLM/image/video/music/TTS/search), payable via x402 | Bearer key **or** x402 (no key) |

**CRITICAL DISTINCTION — three different "x402" worlds:**
- **OOBE's own x402 RPC server** (`x402-synapse-rpc-server`) uses the **PayAI** facilitator
  (`https://facilitator.payai.network`). The bounty brief's mention of "AceDataCloud's facilitator"
  for OOBE is **inaccurate** — no AceDataCloud reference exists in that repo.
- **Ace Data Cloud** uses **its own** facilitator (`https://facilitator.acedata.cloud`).
- **SAP x402** (agent-to-agent, e.g. Synapse Sentinel) does **not** use an HTTP facilitator at all —
  settlement is a direct on-chain Anchor instruction (`settleCallsV2`). It uses `X-Payment-*` headers,
  NOT the Coinbase `X-PAYMENT` envelope.

Do not mix these. §6 lays out each flow separately.

---

## 1. Exact npm packages (versions verified)

```bash
# --- Core: SAP on-chain SDK + Solana/Anchor ---
npm install @oobe-protocol-labs/synapse-sap-sdk@0.19.8 \
            @coral-xyz/anchor@^0.30.1 \
            @solana/web3.js@^1.98.4 \
            @solana/spl-token@^0.4.14 \
            bn.js@^5.2.3 bs58@^5.0.0

# --- Synapse RPC gateway + AI toolkit (tools, MCP, AgentGateway, x402) ---
npm install @oobe-protocol-labs/synapse-client-sdk@2.0.6
# Optional peer deps ONLY if you use the AI layer:
npm install @langchain/core@">=0.3.0 <0.4.0" zod@">=3.23"

# --- Coinbase x402 client (for OOBE x402 RPC server / generic 402 servers) ---
npm install @x402/fetch @x402/core @x402/svm @solana/kit
#   NOTE: @x402/client does NOT exist on npm (404). Use @x402/fetch.

# --- Ace Data Cloud ---
npm install @acedatacloud/sdk @acedatacloud/x402-client
#   If @acedatacloud/x402-client is not yet on npm, install from git:
#   npm install @acedatacloud/sdk github:AceDataCloud/X402Client
```

**Verified:** `synapse-sap-sdk@0.19.8`, `synapse-client-sdk@2.0.6`, `@x402/*@2.14.0`. Node **>= 18**. All ESM+CJS dual builds.

⚠️ **Pin `@x402/*` explicitly** — the OOBE x402 server pins them as `"latest"`, which can break on future releases.
⚠️ `@acedatacloud/sdk` lives in a separate repo (`AceDataCloud/SDK`) that was **not** cloned — confirm it is published before relying on the SDK path. The raw `fetch` flow (§6.3) has no such dependency and **is the path this repo uses by default.**

---

## 2. Environment variables / keys you must supply

```bash
# ───────── Synapse RPC Gateway (get key at https://synapse.oobeprotocol.ai/signup) ─────────
SYNAPSE_RPC="https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=sk_live_XXXX"   # api_key is a QUERY PARAM
SYNAPSE_API_KEY="sk_live_XXXX"          # used by client-sdk config.apiKey (Bearer)
SYNAPSE_WS="wss://us-1-mainnet.oobeprotocol.ai/ws?api_key=sk_live_XXXX"
SYNAPSE_NETWORK="mainnet"
SYNAPSE_REGION="US-1"

# ───────── Solana keypair (your agent's identity + payer) ─────────
SOLANA_KEYPAIR_PATH="/abs/path/keys/agent.json"   # or:
SOLANA_SECRET_KEY_BS58="<base58 secret key>"

# ───────── Ace Data Cloud ─────────
ACEDATA_API_TOKEN="<bearer>"            # CLASSIC path (from platform.acedata.cloud)
# x402 path reuses the Solana keypair above (must hold USDC on mainnet)

# ───────── Optional ─────────
ANCHOR_WALLET="/abs/path/keys/agent.json"   # for AnchorProvider.env()
ANCHOR_PROVIDER_URL="$SYNAPSE_RPC"
```

**Keys/accounts YOU must create (none are pre-provisioned):**
1. **Synapse Gateway API key** — register email+password (or "Sign up with Wallet") at `synapse.oobeprotocol.ai/signup`. Free tier: 10 RPS, 1M RPM, 1 `sendTransaction`/sec. Explorer reads additionally require your **IP whitelisted** on the key.
2. **A funded Solana mainnet keypair** — needs SOL for tx fees + stake, and USDC if paying agents.
3. **Ace Data Cloud**: either a Bearer token (`platform.acedata.cloud`) **or** a USDC-funded wallet for the x402 path.

**Known on-chain constants (no need to look up):**
```
SAP program ID:        SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ   (mainnet-beta)
GlobalRegistry PDA:    9odFrYBBZq6UQC6aGyzMPNXWJQn55kMtfigzhLg6S6L5  (seed 'sap_global')
SAP treasury:          J7PyZAGKvprCz4SQ5DKBLAHstJxgVqZcz6kguUoWpP7P  (0.5% settle fee)
USDC mint (mainnet):   EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v  (6 decimals)
USDC mint (devnet):    4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
Synapse Sentinel:      Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph  (agent wallet)
  Sentinel PDA:        AzqhCKhku9TX3ScVtQw5nffLJ6PoA8r3P6HiTdinuAKz
PayAI facilitator:     https://facilitator.payai.network
AceData facilitator:   https://facilitator.acedata.cloud
AceData SOL facilitator pubkey: 3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq
Solana CAIP-2:         solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
```

---

## 3. Register an agent on SAP mainnet

> ⚠️ **MOST IMPORTANT GOTCHA — version/export mismatch.** Published `@oobe-protocol-labs/synapse-sap-sdk@0.19.8`
> root exports the **constructor-based** `SapClient` whose module getters return **`TransactionInstruction`s**
> (you build/sign/send yourself). The ergonomic README API — `SapClient.from(provider)`, `SapConnection.fromKeypair(...)`,
> `.builder`, `.discovery`, `.x402` registries with one-call `.rpc()` methods — is **compiled into `dist/` but NOT
> re-exported from the package root** in 0.19.8. So the slick README snippets *will not import as written*.
> **This repo uses the published-root instruction-builder path as the primary, with the high-level path behind a
> capability probe.**

### 3a. Published path that works in 0.19.8 (instruction-builder)

```ts
import { SapClient, Pdas } from '@oobe-protocol-labs/synapse-sap-sdk';
import { GLOBAL_REGISTRY_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import fs from 'fs';

const kp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH!, 'utf8')))
);
const client = new SapClient({ rpcUrl: process.env.SYNAPSE_RPC!, wallet: new Wallet(kp) });

const [agentPda] = Pdas.getAgentPDA(kp.publicKey);
const [statsPda] = Pdas.getAgentStatsPDA(agentPda);

const ix = await client.agent.registerAgent({
  signer: kp, wallet: kp.publicKey, agent: agentPda, agentStats: statsPda,
  globalRegistry: GLOBAL_REGISTRY_ADDRESS,
  name: 'SwapBot', description: 'AI-powered DEX aggregator',
  capabilities: [{ id: 'jupiter:swap', description: null, protocol_id: 'jupiter', version: '1.0.0' }],
  pricing: [], protocols: ['jupiter'],
  agentId: null, agentUri: null, x402Endpoint: 'https://swapbot.example.com/x402',
});
const tx  = await client.buildTransaction([ix], kp.publicKey);
const sig = await client.sendTransaction(tx, [kp]);
```

⚠️ **`sendTransaction` VersionedTransaction quirk:** the root client signs first (`tx.sign(signers)`) then sends
**without** passing signers. Don't double-pass signers. **Cost:** agent registration ≈ **0.1 SOL**; close 0.05 SOL; featured listing 1 SOL.

### 3b. High-level fluent builder (README design intent — ⚠️ NOT root-exported in 0.19.8)

```ts
import { SapClient } from '@oobe-protocol-labs/synapse-sap-sdk';  // ⚠️ SapClient.from not root-exported in 0.19.8
import { AnchorProvider } from '@coral-xyz/anchor';
const client = SapClient.from(AnchorProvider.env());
const { txSignature, agentPda } = await client.builder
  .agent('SwapBot').description('AI swap agent').x402Endpoint('https://swapbot.example.com/x402')
  .addCapability('jupiter:swap', { protocol: 'jupiter', version: '6.0' })
  .addPricingTier({ tierId: 'standard', pricePerCall: 1000, rateLimit: 60, tokenType: 'sol', settlementMode: 'x402' })
  .addProtocol('jupiter').register();
```

Capability/protocol/tool ids + schemas are stored on-chain as **SHA-256 hashes**; the SDK hashes the id for you.
⚠️ camelCase (high-level) vs snake_case (`instructions/*`, IDL) — match the layer. Don't mix `instructions/*`
(low-level, returns `TransactionInstruction`) with `modules/*`+`registries/*` (high-level, returns `TransactionSignature`).

---

## 4. Tool discovery

### 4a. On-chain DiscoveryRegistry (⚠️ high-level, validate import per 3b)
```ts
const agents     = await client.discovery.findAgentsByProtocol('jupiter');
const swapAgents = await client.discovery.findAgentsByCapability('jupiter:swap');
const tools      = await client.discovery.findToolsByCategory('Swap');  // or numeric 0
const profile    = await client.discovery.getAgentProfile(agentWallet);
const overview   = await client.discovery.getNetworkOverview();
// categories: 0 Swap,1 Lend,2 Stake,3 Nft,4 Payment,5 Data,6 Governance,7 Bridge,8 Analytics,9 Custom
```

### 4b. Explorer REST API (verified live, no key needed for reads)
```bash
curl 'https://explorer.oobeprotocol.ai/api/sap/agents/Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph'   # single agent (VERIFIED)
curl 'https://explorer.oobeprotocol.ai/api/sap/agents?capability=jupiter:swap&protocol=jupiter&limit=20'
curl 'https://explorer.oobeprotocol.ai/api/sap/transactions?limit=50'   # proof of volume (VERIFIED)
curl 'https://explorer.oobeprotocol.ai/api/sap/escrows'                 # escrows = proof of paid calls
curl 'https://explorer.oobeprotocol.ai/api/sap/tools'
curl 'https://explorer.oobeprotocol.ai/api/sap/tx/{signature}'
curl 'https://explorer.oobeprotocol.ai/api/sap/address/{address}'
```
⚠️ Live caveats (2026-06-02): `/api/sap/metrics` returned `{error:'Internal server error'}`. `/transactions` mixes
enriched + unenriched rows (some `programs:[]`, `signer:null`). Don't assume every field is populated.

### 4c. Synapse Client SDK — generate LangChain/MCP tools from RPC
```ts
import { SynapseClient } from '@oobe-protocol-labs/synapse-client-sdk';
import { createExecutableSolanaTools, solanaToolNames }
  from '@oobe-protocol-labs/synapse-client-sdk/ai/tools';   // ⚠️ AI layer NOT in root barrel
const client = new SynapseClient({ endpoint: process.env.SYNAPSE_RPC!, apiKey: process.env.SYNAPSE_API_KEY });
const { tools, toolMap } = createExecutableSolanaTools(client, { include: ['getBalance', 'getSlot'] });
// ⚠️ factory is createExecutableSolanaTools — NOT createSolanaTools (README is wrong)
```

---

## 5. On-chain escrow payment flow (SAP) — Category A core

How a **client** pays a **SAP agent** per call. Off-chain HTTP serves the request; the chain holds the prepaid
escrow and settles. **Use escrow V2** — V1 `create` is gone.

**Preconditions (else the tx fails):**
1. **Agent must be staked** — holds an `AgentStake` PDA with `staked_amount >= max(0.1 SOL, 50% of deposit)`.
   `MIN_AGENT_STAKE_LAMPORTS = 100_000_000`, `STAKE_COVERAGE_BPS = 5000`. ⚠️ constants say 0.1 SOL; skill doc warns
   it may be **1 SOL** — **verify on-chain**. Unstake cooldown 7 days; lost-dispute slash 50%.
2. **Payment token allowlisted on-chain:** only **native SOL** (`tokenMint=null`) or **USDC**. Other SPL mint →
   `PaymentTokenNotAllowed` (6093).
3. **`settlementSecurity`** must be `1` (CoSigned — needs `coSigner`) or `2` (DisputeWindow — needs
   `disputeWindowSlots >= 1`, recommend ~2160 ≈ 15 min). `0` (SelfReport) is **rejected**.

**Agent stakes first (root instruction-builder):**
```ts
import BN from 'bn.js';
const [stakePda] = Pdas.getAgentStakePDA(agentKp.publicKey);
const stakeIx = await client.staking.initStake({
  signer: agentKp, wallet: agentKp.publicKey, agent: agentPda, stake: stakePda,
  initialDeposit: new BN(100_000_000),  // 0.1 SOL
});
await client.sendTransaction(await client.buildTransaction([stakeIx], agentKp.publicKey), [agentKp]);
```

**Client creates + funds a V2 escrow (low-level, works in 0.19.8):**
```ts
const [escrowPda] = Pdas.getEscrowV2PDA(agentPda, 0);   // (agentPda, escrowNonce)
const createIx = await client.escrow.createEscrowV2({
  signer: depositorKp, depositor: depositorKp.publicKey, agent: agentPda,
  agentStake: Pdas.getAgentStakePDA(agentWallet)[0], agentStats: Pdas.getAgentStatsPDA(agentPda)[0],
  pricingMenu: pricingMenuPda, escrow: escrowPda,
  escrowNonce: new BN(0), pricePerCall: new BN(1_000_000), maxCalls: new BN(100),
  initialDeposit: new BN(100_000_000), expiresAt: new BN(0), volumeCurve: [],
  tokenMint: null, tokenDecimals: 9, settlementSecurity: 2,
  disputeWindowSlots: new BN(2_160), coSigner: null, arbiter: null,
});
// also: depositEscrowV2, settleCallsV2, finalizeSettlement, withdrawEscrowV2, closeEscrowV2
```

**Agent settles served calls (claims payment):**
```ts
const settleIx = await client.escrow.settleCallsV2({
  signer: agentKp, wallet: agentKp.publicKey, agent: agentPda,
  agentStats: Pdas.getAgentStatsPDA(agentPda)[0], escrow: escrowPda, settlementReceipt: receiptPda,
  escrowNonce: new BN(0), callsToSettle: new BN(5), serviceHash: serviceHash32,
});
// DisputeWindow: createPendingSettlement -> wait window -> finalizeSettlement (client may fileDispute)
```
Settlement limits: `settleCallsV2` ≤ `MAX_CALLS_PER_SETTLEMENT = 10_000`; `settleBatch` ≤ 10/tx. Protocol fee 0.5%.
⚠️ All numeric args expect **`BN`**. ⚠️ PDA helper names: `get*PDA` (root) vs `derive*` (core build) — check installed exports.

---

## 6. x402 flows (three distinct paths)

### 6.1 SAP agent-to-agent x402 (header scheme — used by Synapse Sentinel) — Category A
NOT the Coinbase wire format. Open an escrow (§5), build SAP `X-Payment-*` headers, POST to the agent's HTTP endpoint;
the agent serves off-chain and settles on-chain.
```ts
const headers = client.x402.buildPaymentHeadersFromEscrow(agentWallet);
// X-Payment-Protocol:'SAP-x402', X-Payment-Escrow, -Agent, -Depositor, -MaxCalls, -PricePerCall, -Program, -Network
const res = await fetch('https://agent.sentinel.oobeprotocol.ai/tools/jupiter_swap', {
  method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ inputMint: 'SOL', outputMint: 'USDC', amount: 1 }),
});
// the AGENT later calls client.x402.settle(...) on-chain to claim from your escrow.
```

### 6.2 OOBE x402 RPC server (Coinbase x402 v2 + **PayAI** facilitator)
Live server `https://x402.oobeprotocol.ai` monetizes 14 Solana RPC methods at `POST /rpc/{method}`, USDC-on-Solana,
settled via **PayAI**. Wire headers (verified against `@x402/core` 2.14.0): request `X-PAYMENT` (base64 envelope);
402 challenge `PAYMENT-REQUIRED`; receipt `X-PAYMENT-RESPONSE`.
```ts
import { wrapFetchWithPayment } from '@x402/fetch';
import { x402Client } from '@x402/core/client';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
const client = new x402Client(); registerExactSvmScheme(client, { signer });   // signer holds USDC on Solana
const fetchWithPay = wrapFetchWithPayment(fetch, client);
const res = await fetchWithPay('https://x402.oobeprotocol.ai/rpc/getAccountInfo', { method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getAccountInfo', params:['<pubkey>', {encoding:'jsonParsed'}] }) });
```
Source-verified prices (`src/rpc-methods.ts` authoritative; markdown tables stale): `getBalance` $0.01,
`getAccountInfo` $0.01, `getTransaction` $0.012, `getProgramAccounts` $0.08, `sendTransaction` $0.20,
`getBlock` $0.03, `getTokenAccountsByOwner` $0.02. ⚠️ `@x402/client` package does NOT exist (use `@x402/fetch`).

### 6.3 Ace Data Cloud x402 (its OWN facilitator) — Category B core
Call any `api.acedata.cloud` endpoint with **no Authorization header** → 402 + `accepts[]` → sign `X-Payment`
envelope → retry. AceData runs its own facilitator (`facilitator.acedata.cloud`).

**Raw Solana x402 (the form that actually settled on mainnet — this repo's default):**
```ts
import { Connection, PublicKey, TransactionMessage, VersionedTransaction,
         ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import { createTransferCheckedInstruction, getAssociatedTokenAddress,
         createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import bs58 from 'bs58';

const API = 'https://api.acedata.cloud', PATH = '/openai/chat/completions';
const body = { model: 'gpt-4o-mini', messages: [{ role:'user', content:'hi' }], max_tokens: 10 };
const payer = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_SECRET_KEY_BS58!));
const FACILITATOR = new PublicKey('3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq');

const r1 = await fetch(API + PATH, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
const { accepts } = await r1.json();                          // r1.status === 402
const req = accepts.find((a) => a.network === 'solana');
const amount = BigInt(req.maxAmountRequired), mint = new PublicKey(req.asset), payTo = new PublicKey(req.payTo);

const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const payerAta = await getAssociatedTokenAddress(mint, payer.publicKey);
const payToAta = await getAssociatedTokenAddress(mint, payTo);
const { blockhash } = await conn.getLatestBlockhash('confirmed');
const ixs = [
  ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }),
  createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, payToAta, payTo, mint),
  createTransferCheckedInstruction(payerAta, mint, payToAta, payer.publicKey, amount, 6),
];
const msg = new TransactionMessage({ payerKey: FACILITATOR, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
const tx = new VersionedTransaction(msg); tx.sign([payer]);
const envelope = { x402Version: 2, scheme: 'exact', network: 'solana',
  payload: { serializedTransaction: Buffer.from(tx.serialize()).toString('base64') } };

const r2 = await fetch(API + PATH, { method:'POST',
  headers: { 'Content-Type':'application/json', 'X-Payment': btoa(JSON.stringify(envelope)) },
  body: JSON.stringify(body) });
```
⚠️ Solana payload discrepancy: SDK src emits `{signature}`; the **form that actually settled** is
`{serializedTransaction}` with the facilitator as fee payer (user pays **zero SOL** gas). ⚠️ Solana is pricier
(~0.095 USDC chat vs ~0.021 on Base). `'upto'` (metered) is **Base-only** + needs one-time `approvePermit2`.

---

## 7. Three+ concrete Ace Data Cloud services — Category B requires ≥3 distinct

Data plane `https://api.acedata.cloud/<service>/<action>`. Classic auth `authorization: Bearer <token>`.
Long-running gen endpoints are **task-based** (return `task_id`, poll `POST /<service>/tasks {action:'retrieve', id}`).

| # | Service | Endpoint | Shape | Notes |
|---|---|---|---|---|
| 1 | **LLM chat** | `POST /openai/chat/completions` | OpenAI-compatible `{model,messages,max_tokens}` → `choices[].message.content` | models: gpt-4o-mini, claude-sonnet-4-5, glm-4.7… synchronous |
| 2 | **Web search** | `POST /serp/google` | `{query,type,number,country,language}` → `{organic,images,news,knowledge_graph,...}` | synchronous JSON |
| 3 | **Text-to-speech** | `POST /fish/tts` | `{text,format}` → `{audio_url,task_id}` | ⚠️ engine via `model` **HEADER** (`s1`/`s2-pro`), not body |
| 4 | **Image gen** | `POST /midjourney/imagine` | `{prompt,mode}` → `{task_id,image_url,...}` | task-based, ndjson |
| 5 | **Video gen** | `POST /veo/videos` | `{model,prompt,image_url}` → `{task_id}` | task-based; siblings luma/pika/hailuo/sora |

⚠️ Two hosts: account/billing/JWT on `platform.acedata.cloud/api/v1`; AI data plane on `api.acedata.cloud/<service>`.
Don't cross the tokens.

---

## 8. Synapse Sentinel (the live SAP agent) — Category A requires using it ≥1×

**Verified live 2026-06-02** via Explorer API:
```jsonc
{
  "pda": "AzqhCKhku9TX3ScVtQw5nffLJ6PoA8r3P6HiTdinuAKz",
  "wallet": "Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph",
  "name": "Synapse Sentinel",
  "description": "Pay-per-call gateway exposing 110 SynapseAgentKit tools via SAP x402",
  "x402Endpoint": "https://agent.sentinel.oobeprotocol.ai/tools/:name",
  "isActive": true, "uptimePercent": 100,
  "reputationScore": 0, "totalCallsServed": "0",  // ⚠️ registered 2026-05-03, no settled volume yet
  "capabilities": ["synapse-agent-kit:gateway@2.0(synapse)","token:transfer@1.0(spl-token)",
                   "nft:metaplex@1.0(metaplex)","defi:swap@6.0(jupiter)",
                   "data:oracle@1.0(pyth)","blink:execute@1.0(solana-actions)"]
}
```
**Pricing tiers** (all USDC, `tokenDecimals: 6`, `settlementMode: x402`, `minEscrowDeposit: 10000`):

| Tier | pricePerCall (USDC base units) | ≈ USD | rate/burst | maxCalls/session |
|---|---|---|---|---|
| token | 12150 | $0.01215 | 60 / 20 | 10000 |
| nft | 27000 | $0.027 | 30 / 10 | 5000 |
| defi | 67500 | $0.0675 | 30 / 10 | 5000 |
| misc | 20250 | $0.02025 | 60 / 20 | 10000 |
| blinks | 24300 | $0.0243 | 60 / 20 | 10000 |

Call: open an escrow then hit `https://agent.sentinel.oobeprotocol.ai/tools/<tool_name>` (e.g. `/tools/jupiter_swap`,
`/tools/token_transfer`). ⚠️ The `synapse-sap` CLI is **not on npm** (`@oobe-protocol-labs/synapse-sap-cli` → 404);
it ships inside the SDK repo `synapse-sap-sdk/cli`. ⚠️ Sentinel's HTTP `/tools/:name` request/response shape was not
live-tested — confirm before depending on a specific tool's body schema.

---

## 9. End-to-end build order

1. Create Synapse Gateway account → `SYNAPSE_API_KEY`; build `SYNAPSE_RPC` with `?api_key=`.
2. Fund a mainnet keypair (SOL + USDC).
3. Verify which `SapClient` your installed 0.19.8 exposes (`new SapClient({...})` vs `SapClient.from(...)`). Validate min-stake on-chain.
4. Register your agent (§3) → pay 0.1 SOL.
5. Stake your agent (§5) so clients can escrow against you.
6. Publish tools; confirm via Explorer API (§4b).
7. Consumer side: open escrow → call Sentinel (§6.1/§8) or pay AceData (§6.3) or OOBE x402 RPC server (§6.2).
8. Provider side: serve HTTP, then `settleCallsV2` on-chain to claim payment.

---

## 10. Gotchas + unknowns to validate LIVE (⚠️)

**You must supply (no defaults):** Synapse Gateway API key (+ IP whitelist for Explorer reads); a funded Solana
mainnet keypair; Ace Data Cloud Bearer **or** USDC wallet; `RPC_URL` if self-hosting the OOBE x402 server.

**LOW confidence / unverified — validate before shipping:**
1. **SAP min agent stake**: constants say 0.1 SOL, skill doc warns 1 SOL. Verify on-chain.
2. **`SapClient.from` / `.builder` / `.discovery` / `.x402` / `SapConnection` are NOT root-exported in 0.19.8.** Use the §3a/§5 low-level instruction-builder path, or probe the deep import.
3. **AceData Solana x402 envelope**: SDK emits `{signature}`; the form that settled is `{serializedTransaction}` (facilitator fee payer). This repo uses the raw `{serializedTransaction}` flow.
4. **`@acedatacloud/sdk` publication + method surface** — README only; confirm on npm or use raw fetch.
5. **`@acedatacloud/x402-client` npm version** is CalVer; repo says `0.1.0`. If not on npm, install from git.
6. **PDA helper names**: `get*PDA` vs `derive*` — check installed exports.
7. **`/api/sap/metrics`** errored live; `/transactions` partially unenriched.
8. **Synapse Sentinel `totalCallsServed: 0`** — registered/active but no proven settled volume; HTTP shape untested.
9. **Exact x402 wire bytes** from `@x402/core` middleware described from types, not a captured live 402.
10. **Doc drift everywhere** — trust source over markdown.

**Hard rules you can rely on:**
- SAP payment tokens are **SOL or USDC only** (else 6093).
- SAP `settlementSecurity` must be 1 or 2 (0 rejected).
- Fish TTS engine = `model` **header**, not body.
- OOBE x402 server uses **PayAI**, not AceDataCloud.
- Mainnet, **real money** on all three x402 flows — always read the 402 `accepts[]`/`PAYMENT-REQUIRED` before signing.
