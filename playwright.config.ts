import { defineConfig } from '@playwright/test';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.local/browsers');
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3200',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/dev.mjs --test --external-db',
    url: 'http://127.0.0.1:3200/api/health',
    timeout: 180000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGINT', timeout: 15000 },
  },
});
