# Deploy on Railway

The repo ships a `Dockerfile` + `railway.json`. One Railway service runs **both** the
autonomous agent (scheduler) and the volume **dashboard** (bound to Railway's `$PORT`).

> Safe by default: with no `DRY_RUN` set, the deploy runs in **DRY-RUN** (no spend). Flip
> `DRY_RUN=false` and provide a funded wallet only when you want it generating real volume
> in the cloud.

## Option A — Railway CLI (fastest)

```bash
railway login                       # opens a browser (you do this once)
railway init                        # create/link a project
railway up                          # build the Dockerfile + deploy
railway domain                      # generate a public URL for the dashboard
```

Set environment variables (Railway dashboard → Variables, or CLI):

```bash
railway variables \
  --set "SYNAPSE_RPC=https://us-1-mainnet.oobeprotocol.ai/rpc?api_key=sk_live_XXXX" \
  --set "SYNAPSE_API_KEY=sk_live_XXXX" \
  --set "ACEDATA_PAYMENT_MODE=x402" \
  --set "AGENT_X402_ENDPOINT=https://github.com/vivekpal1/synapse-autoagent" \
  --set "SCHEDULER_INTERVAL_MS=3600000" \
  --set "MAX_USDC_PER_DAY=500000" \
  --set "DRY_RUN=true"
# To go LIVE (real cloud volume): add the wallet + flip the flag
#   --set "SOLANA_SECRET_KEY_BS58=<base58 secret>"   (NEVER commit this)
#   --set "DRY_RUN=false"
```

**Persist the receipt ledger** so the dashboard keeps history across restarts: add a Railway
**Volume** mounted at `/app/receipts` (Railway dashboard → service → Volumes, or
`railway volume add --mount-path /app/receipts`). Optionally also `/app/data` for saved deliverables.

## Option B — GitHub deploy (no CLI)

1. Railway → **New Project → Deploy from GitHub repo** → pick `vivekpal1/synapse-autoagent`.
2. Railway auto-detects the `Dockerfile`.
3. Add the Variables above, generate a domain, add a `/app/receipts` volume.

## Notes

- The dashboard listens on `$PORT` automatically; no port config needed.
- The agent runs the **interval** workflows (see `workflows/`); `SCHEDULER_INTERVAL_MS`
  controls cadence. Keep it long + `MAX_USDC_PER_DAY` low to cap spend.
- Health: the dashboard serves `GET /api/volume` and `GET /api/agent` (JSON) and `/` (UI).
- The agent wallet on Railway is whatever `SOLANA_SECRET_KEY_BS58` you set — fund that wallet
  if you want real cloud volume, or leave `DRY_RUN=true` to run the loop without spending.
