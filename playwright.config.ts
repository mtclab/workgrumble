import { defineConfig, devices } from '@playwright/test';

/**
 * The server venue is the overseer's concern (staging box, per house
 * pipeline), so this config never starts one and never hardcodes a host.
 * Point PLAYWRIGHT_BASE_URL at a served build of `npm run build`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';

if (baseURL.length === 0) {
  throw new Error(
    'PLAYWRIGHT_BASE_URL must be set to the base URL of a served build.',
  );
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Unconditional, and not `Boolean(process.env.CI)`. The documented gate for
  // this repo is the LOCAL two-step one - there is no CI by policy - so a
  // CI-only guard is a guard that never runs: a committed `test.only` would
  // make `npm run gate:e2e` drive one test and exit green.
  forbidOnly: true,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1_280, height: 800 },
      },
    },
  ],
});
