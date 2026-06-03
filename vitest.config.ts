import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@autoagent/config': r('./packages/config/src/index.ts'),
      '@autoagent/wallet': r('./packages/wallet/src/index.ts'),
      '@autoagent/x402': r('./packages/x402/src/index.ts'),
      '@autoagent/sap': r('./packages/sap/src/index.ts'),
      '@autoagent/acedata': r('./packages/acedata/src/index.ts'),
      '@autoagent/core': r('./packages/core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
