import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  openFromStartMenu,
  runCommand,
} from './helpers';

/**
 * THE MONDAY AFTER A CLIENT LEFT, on the built artifact (E9, 0.39.0).
 *
 * The ladder itself is driven end to end in `src/shell/patience.test.ts` -
 * three rungs, a walk-back and a departure need two ruinous weeks and a week
 * boundary, which is a great deal of clock for a browser and is exactly the
 * arrangement the invoice ladder already has. What a browser CAN ask, and
 * nothing else can, is the question this file is: does the shipped artifact,
 * booted through the shipped arrival path, actually stand up a world with a
 * customer missing from it - and does everything else in that world still work.
 *
 * The arrival is seeded the way the shell seeds one, exactly as
 * `week-two.spec.ts` and `employer-switch.spec.ts` seed theirs: a record in the
 * switch slot, which is what `stayAnotherWeek` writes on its way out. The
 * estate delta on it carries one field - the patience ledger the Friday fold
 * wrote - and that one field is the whole departure. There is no second list.
 *
 * Authored for the box run (specs are written, not run here); it is part of the
 * version's single box cycle.
 */

const SWITCH_KEY = 'workgrumble/switch';

/** A box at the studio that gave notice, and one at a firm that did not. */
const GONE_BOX = 'MARL-WS-01';
const STAYING_BOX = 'FONT-FILE-01';

/**
 * A week one at the MSP that lost MARLOWE-STUDIO: the ledger says `leaving`,
 * which is the only fact a departure is. The standing beside it has decayed to
 * nothing and the notice still stands, because a notice given is given.
 */
const AFTER_THE_NOTICE = {
  employer: 'msp',
  career: {
    reputation: 68,
    title: 'Systems Engineer',
    farmFund: 42_000,
    trail: null,
    tier: 'systems_engineer',
  },
  arcWeek: 2,
  estate: [{
    node: 'person:pat',
    field: 'customer_patience',
    value: 'customer:marlowe|0|leaving|0',
  }],
};

async function arriveAfterTheNotice(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, AFTER_THE_NOTICE] as [string, typeof AFTER_THE_NOTICE],
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  // The arrival window, shut through the testid the window renderer actually
  // writes - `close-${appId}`, which for this one is `close-updates`. The guard
  // this replaces asked for `window-close`, which nothing in the shell has ever
  // been called: it matched nothing, so the window stayed up and a later click
  // could land under it (the 0.38.1 stacking mode). A dead guard is worse than
  // no guard, because it reads like one.
  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    await page.getByTestId('close-updates').click();
    await expect(arrival).toHaveCount(0);
  }

  await expect(page.getByTestId('brief-heading')).toContainText('Day 1');
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
}

test('the departed customer\'s estate is not in the world', async ({ page }) => {
  await arriveAfterTheNotice(page);

  await openFromStartMenu(page, 'cmd');

  // The box a KB article still names, typed at a world it is not in any more.
  // The terminal answers with what it does not have - history is history, not
  // a dangling pointer - and does not throw, blank, or pretend.
  await runCommand(page, `restart ${GONE_BOX}\\Spooler`);

  const output = page.getByTestId('cmd-output');

  await expect(output).not.toContainText('MARLOWE-STUDIO');
  // THE EXACT WORDING, and it has to be exact to be a test at all. The box is a
  // Mac in the un-churned world, so a world that still HAD the studio in it
  // answers "is not a Windows host" - which matched the loose /no |not |unknown|
  // cannot/i this replaces, and made the assertion true either way. The
  // unknown-host refusal is the one and only answer that means the estate is
  // gone, word for word as `src/shell/patience.test.ts` pins it in unit land.
  await expect(output).toContainText('Unknown host "MARL-WS-01"');
});

test('every other estate is exactly where it was', async ({ page }) => {
  await arriveAfterTheNotice(page);

  await openFromStartMenu(page, 'cmd');

  // FONTAINE-LAW is still a helpdesk contract with a server on the far side of
  // it, and the 0.11.0 refusal is word for word what it always was. Losing a
  // client changes what work arrives, and nothing whatever about anybody else.
  await runCommand(page, `restart ${STAYING_BOX}\\Spooler`);

  await expect(page.getByTestId('cmd-output'))
    .toContainText(/change request|changereq/i);
});

test('the queue deals none of their work', async ({ page }) => {
  await arriveAfterTheNotice(page);

  await openFromStartMenu(page, 'tickets');

  // The queue is a real queue - a week that dealt nothing would pass this by
  // accident - and not one row of it belongs to the studio that left.
  await expect(page.getByTestId('tickets-app')).toBeVisible();
  await expect(page.getByTestId('tickets-empty')).toHaveCount(0);
  await expect(page.getByTestId('tickets-queue')).not.toContainText('MARLOWE');
});
