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

# Default: the autonomous agent scheduler. Override `command:` for the dashboard.
CMD ["npx", "tsx", "apps/agent/src/main.ts"]
