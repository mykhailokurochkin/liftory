import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:3330', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}),
      },
    },
    {
      name: 'desktop-chromium',
      testMatch: 'layout.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}),
      },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://127.0.0.1:3330/api/health',
    reuseExistingServer: false,
    timeout: 180000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
