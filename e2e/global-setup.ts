import { request } from '@playwright/test';

import { SHARED_TOKEN } from './tokens';

/**
 * Walking the whole suite in through the door, once, before anything runs.
 *
 * The Worker refuses every path without a pass cookie, which is the point of
 * it - and which would otherwise mean editing a hundred and four journeys that
 * have nothing to do with admission to make them knock first. Instead the pass
 * is fetched here and handed to every context as `storageState`, so a spec that
 * says `page.goto('/')` keeps saying that and keeps meaning it.
 *
 * It is deliberately ALLOWED TO FAIL. A build served by a plain file server has
 * no `/t/` to knock on; the state file is written empty and the suite runs
 * exactly as it did before there was a Worker. That is not a fallback nobody
 * checks, either - it is the shape the local development server has, and the
 * whole point of the offline-first design being real rather than claimed.
 */
export const DOOR_STATE = 'test-results/door-state.json';

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';
  const context = await request.newContext({ baseURL });

  try {
    // `maxRedirects: 0` because the redirect is the answer: following it to
    // `/` would fetch the whole bundle to learn something the 302 already said.
    await context.get(`/t/${SHARED_TOKEN}`, { maxRedirects: 0 });
  } catch {
    // Nothing on the other end, or nothing that answers this. Either way the
    // state below is the honest one: no pass, and the journeys find out what
    // that means for themselves.
  }

  await context.storageState({ path: DOOR_STATE });
  await context.dispose();
}
