import { expect, type Page, test } from '@playwright/test';

import { completeLogin, openFromStartMenu } from './helpers';

/**
 * The corporate employer, on the built artifact (0.22.0, E8 #40/#41).
 *
 * E8 - the org-dysfunction epic - opens here: a new in-house corporate desk
 * (Halcyon Grange) where you support the executives directly, and the politics
 * are the job. The whole setup-and-payoff arc - the VIP exception that grants a
 * hole, the exec BEC compromise, the inbox-rule hunt whose forward survives a
 * password reset, the EA delegate that turns out to be the persistence - is
 * proven end to end through the real driver, chain and dispatch in bec.test.ts
 * (the browser walk cannot reach a fourth employer across a multi-day arc).
 *
 * This walks the shipped SHELL far enough to prove the arc is really there: the
 * corporate desk stands up via the switch the way a real pass-and-accept takes,
 * and the exec-exception ticket that starts it all is on the Monday queue.
 */

const SWITCH_KEY = 'workgrumble/switch';

/** A career crossing into the corporate desk with standing intact. */
const ARRIVAL = {
  employer: 'corporate',
  career: {
    reputation: 78,
    title: 'IT Support Technician',
    farmFund: 40_000,
    trail: null,
  },
};

async function arriveAtCorporate(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, ARRIVAL] as [string, typeof ARRIVAL],
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    await page.getByTestId('close-updates').click();
    await expect(arrival).toHaveCount(0);
  }

  await expect(page.getByTestId('brief-heading')).toContainText('Day 1');
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
}

test('the corporate desk stands up and the exec-exception ticket is waiting', async ({
  page,
}) => {
  await arriveAtCorporate(page);

  // The Monday queue at Halcyon opens with the exec exception that seeds the
  // whole arc: the EA asking, on the CEO's behalf, to take the second factor
  // off his account - the hole the BEC later walks through.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-halcyon-ceo-mfa-off'))
    .toBeVisible();
});
