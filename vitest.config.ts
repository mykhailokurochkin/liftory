import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/contracts/src/**', 'packages/offline/src/**', 'apps/api/src/**'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
    },
    testTimeout: 15000,
  },
});
