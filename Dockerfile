# Synapse AutoAgent — runs the agent (or dashboard) via tsx.
FROM node:20-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# Install all workspace deps (tsx is needed at runtime to execute TS directly).
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps ./apps
RUN npm install --no-audit --no-fund

# App sources + config
COPY tsconfig.json vitest.config.ts ./
COPY scripts ./scripts
COPY workflows ./workflows

# Receipts + outputs persist via a mounted volume in compose.
RUN mkdir -p receipts data/outputs

# Default: run the autonomous agent scheduler + the dashboard together (one web service).
# The dashboard binds to $PORT (Railway/PaaS inject it). DRY_RUN defaults true (no spend)
# until you set DRY_RUN=false and provide a funded wallet via env.
CMD ["npm", "start"]
