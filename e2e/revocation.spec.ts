import { execFileSync } from 'node:child_process';

import { expect, test } from '@playwright/test';

/**
 * Revoking a link, with somebody already inside.
 *
 * This is the standing journey for a defect found in production on the first
 * day: the door wrote the whole token record back with its count on it, so an
 * admission that had read the record before a revoke landed put `revoked:
 * false` back afterwards. The link kept working, a browser holding a pass from
 * it kept getting 200s on `/api/*`, and the CLI had already printed that
 * anybody it let in was out.
 *
 * Three things have to be true and none of them can be checked from inside the
 * browser, which is why this test reaches for the owner's own CLI rather than
 * for an endpoint. There is deliberately no web surface that revokes anything -
 * building one to make this testable would be building the thing the door
 * exists to not have.
 *
 * IT RUNS WHERE `wrangler dev` RUNS. The CLI writes the simulated KV under
 * `.wrangler/` in this repository, so the tests and the Worker have to be on
 * the same machine - which the suite already requires, because the door
 * fixtures are seeded the same way. If they are not, the first assertion fails
 * saying so rather than the test quietly skipping.
 */

function cli(args: readonly string[]): string {
  return execFileSync(
    'node',
    ['scripts/tokens.mjs', ...args, '--local'],
    { encoding: 'utf8' },
  ).trim();
}

test('revokes a link out from under a browser that is already inside', async ({
  browser,
}) => {
  // Its own link, so the journey never leaves a dead fixture behind and never
  // depends on one somebody else revoked.
  const token = cli([
    'mint',
    '--label',
    'e2e: revoked mid-session',
    '--uses',
    '5',
    '--quiet',
  ]);

  expect(
    token,
    'minting through the CLI must reach the same KV the Worker is serving - '
      + 'this suite runs on the host running `wrangler dev`, from the repo root',
  ).toMatch(/^[A-Za-z0-9_-]{8,64}$/);

  const inside = await browser.newContext();
  const tester = await inside.newPage();

  await tester.goto(`/t/${token}`);
  await expect(tester.getByTestId('boot-screen')).toBeVisible();

  // A second admission, so the counter has been written at least once before
  // the revoke: the defect lived in the write, and a link nobody had spent
  // could not have exercised it.
  const second = await browser.newContext();
  const another = await second.newPage();
  await another.goto(`/t/${token}`);
  await expect(another.getByTestId('boot-screen')).toBeVisible();

  cli(['revoke', token]);

  // 1. The link stops admitting anybody new.
  const late = await browser.newContext();
  const turnedAway = await late.newPage();
  const refused = await turnedAway.goto(`/t/${token}`);
  expect(refused?.status()).toBe(403);
  await expect(turnedAway.getByTestId('boot-screen')).toHaveCount(0);

  // 2. And the pass it already handed out stops working, which is the half a
  //    thirty-day cookie would otherwise keep alive for a month. `/api/save`
  //    is checked as well as `/`, because it is a path no cache can answer -
  //    a 403 on the page alone could be somebody else's cached copy.
  const page = await tester.goto('/');
  expect(page?.status()).toBe(403);
  await expect(tester.getByRole('heading'))
    .toHaveText(/invite-only while it is being tested/i);

  const api = await tester.request.get('/api/save');
  expect(api.status()).toBe(403);

  // 3. And the revocation is still there afterwards, however much traffic the
  //    link has taken since. This is the exact reading that came back false.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await turnedAway.goto(`/t/${token}`);
  }

  const record = JSON.parse(cli(['show', token])) as { revoked: unknown };
  expect(record.revoked).toBe(true);

  await inside.close();
  await second.close();
  await late.close();
});
