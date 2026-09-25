import { defineConfig, devices } from '@playwright/test';

const ci = !!process.env['CI'];

/**
 * End-to-end suite (#367) — against a running stack : the frontend (which proxies `/api` to the
 * backend) and a backend started with the `e2e` profile. Tilt serves both ; CI starts them itself.
 * Chromium only : the app is used in one browser, and each extra engine multiplies the runtime.
 */
export default defineConfig({
  testDir: './specs',
  // Each test signs in as its own throwaway user, so tests never share data.
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci
    ? [['list'], ['html', { open: 'never', outputFolder: '../../dist/e2e/report' }]]
    : 'list',
  outputDir: '../../dist/e2e/results',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    locale: 'fr-FR',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
