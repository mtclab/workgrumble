import { defineConfig, devices } from '@playwright/test';

import { DOOR_STATE } from './e2e/global-setup';

/**
 * The server venue is the overseer's concern (staging box, per house
 * pipeline), so this config never starts one and never hardcodes a host.
 * Point PLAYWRIGHT_BASE_URL at a served build of `npm run build` - which since
 * the deploy milestone means `wrangler dev` on the box, because the shipped
 * artifact is a Worker with a door on it rather than a directory of files.
 *
 * PLAYWRIGHT_BASE_URL is still the ONLY environment input. Admission is not a
 * variable: the tester links the door journeys use are constants in
 * `e2e/tokens.ts`, seeded from the same file by the owner's CLI, because a
 * suite that needs a secret handed to it is a suite that gets skipped.
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
  // Knocks on the door once and keeps the pass, so a hundred and four journeys
  // written before there was a door do not each have to learn about it.
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    storageState: DOOR_STATE,
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
