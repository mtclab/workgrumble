import { expect, type Page, test } from '@playwright/test';

import {
  completeLogin,
  openFromStartMenu,
  runCommand,
  runSimMinutes,
  SHIFT_MINUTES,
} from './helpers';

/**
 * The MSP employer, on the built artifact (0.8.0 + 0.9.0, E5 #26/#27).
 *
 * The MSP arc is proven at the unit level through the real dispatch path
 * (msp-scope.test.ts, monitor.test.ts), but nothing walked it through the SHELL
 * - the browser never reaches the third employer, so the board's mount and the
 * scope refusal had no shipped-path coverage. This closes that: arrive at the
 * MSP, see the monitoring board stand up with a monitoring-only customer's
 * watched things on it, and confirm a FIX at that customer is refused by the
 * real terminal - the 0.8.0 scope mechanic and the 0.9.0 board, on the artifact.
 *
 * Seeded the way the shell seeds an arrival: a switch record in storage (the
 * key the offer-accept writes), so booting stands the MSP up on its Monday -
 * the same code path a real pass-and-accept takes.
 */

const SWITCH_KEY = 'workgrumble/switch';

/** A career crossing into the MSP with standing intact. */
const ARRIVAL = {
  employer: 'msp',
  career: {
    reputation: 74,
    title: 'IT Support Technician',
    farmFund: 30_000,
    trail: null,
  },
};

async function arriveAtMsp(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, ARRIVAL] as [string, typeof ARRIVAL],
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Every day-advancing spec installs the fake clock before boot.
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    const close = arrival.getByTestId('window-close');

    if (await close.count()) {
      await close.first().click();
    }
  }

  await expect(page.getByTestId('brief-heading')).toContainText('Day 1');
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
}

test('the monitoring board stands up at the MSP with a customer on it', async ({
  page,
}) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'monitor');

  // The board mounted through the real shell, and it is the monitoring-only
  // customer's surface: its watched things are listed, read off the estate.
  await expect(page.getByTestId('monitor-app')).toBeVisible();
  await expect(page.getByTestId('monitor-contract'))
    .toContainText(/eyes on glass|contract/i);
  await expect(page.getByTestId('monitor-row-customer:northwind:backup'))
    .toBeVisible();
  await expect(page.getByTestId('monitor-row-customer:northwind:cert'))
    .toBeVisible();
  await expect(page.getByTestId('monitor-row-customer:northwind:disk'))
    .toBeVisible();
});

test('a fix at the monitoring-only customer is refused by the terminal', async ({
  page,
}) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');
  // A Windows fix verb aimed at the monitoring-only customer's box: the
  // contract is notify-and-escalate, not remediate, and the terminal says so.
  await runCommand(page, 'restart NW-SRV-01\\Spooler');

  await expect(page.getByTestId('cmd-output'))
    .toContainText(/monitoring-only|notify-and-escalate|not.*remediate/i);
});

test('an out-of-scope server action names the change-request path, and one files', async ({
  page,
}) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');

  // FONTAINE-LAW is a helpdesk contract: a server is out of the day-to-day
  // scope, but - unlike monitoring-only - it is work a change request can
  // authorise, so the refusal names the path rather than being a dead end.
  await runCommand(page, 'restart FONT-FILE-01\\Spooler');
  await expect(page.getByTestId('cmd-output'))
    .toContainText(/change request|changereq/i);

  // Filing one is a real verb through the real terminal, and it then reads back
  // on the board of requests, under review.
  await runCommand(page, 'changereq file FONT-FILE-01\\Spooler');
  await runCommand(page, 'changereq list');
  await expect(page.getByTestId('cmd-output')).toContainText('FONT-FILE-01');
});

test('a co-managed customer needs coordination before you act', async ({
  page,
}) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');

  // ARDEN-MFG is co-managed: their own IT owns the box. A unilateral server
  // touch is caught and names the coordinate path, not a dead end.
  await runCommand(page, 'restart ARDEN-SRV-01\\W3SVC');
  await expect(page.getByTestId('cmd-output'))
    .toContainText(/co-managed|notify|coordinat|unilateral|RACI/i);

  // Notifying their IT files the coordination notice through the real terminal
  // - the coordinate step the tier turns on. That this notice then clears the
  // action (coordinate-then-act) is proven end to end in msp-scope.test.ts.
  await runCommand(page, 'notify ARDEN-SRV-01\\W3SVC');
  await expect(page.getByTestId('cmd-output'))
    .toContainText(/coordinat|their (own )?IT|noted|ARDEN/i);
});

test('a fully-managed customer has no server scope wall', async ({ page }) => {
  await arriveAtMsp(page);

  await openFromStartMenu(page, 'cmd');

  // HOLLOWAY-ACCT is fully-managed: the MSP is the whole IT department, so a
  // server action carries none of the helpdesk contract's "not your servers"
  // wall - the exact restart refused at a helpdesk customer is in scope here.
  await runCommand(page, 'restart HOLL-SRV-01\\Dfs');
  await expect(page.getByTestId('cmd-output'))
    .not.toContainText('Servers are not in this contract');
});

test('a ticket wears its customer SLA tier', async ({ page }) => {
  await arriveAtMsp(page);

  // The queue names each MSP ticket's customer and its SLA tier, so the player
  // can triage by it - a Gold customer's clock is tighter than a Bronze one's.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByText(/\((Gold|Silver|Bronze)\)/).first())
    .toBeVisible();
});

/**
 * The onboarding capstone on the built artifact (0.13.0, E5 #31).
 *
 * The event, the audit and the horror are proven at the unit level through the
 * real driver and terminal (onboarding.test.ts); this walks the shipped SHELL to
 * the day it fires - the browser reaches the third employer only by arriving at
 * it, and only mid-week does the client sign. Work Monday and Tuesday, open the
 * Wednesday shift, cross ten o'clock, and the customer that was not in the world
 * at boot is now on the wire: `audit customer:tillman` enumerates the estate
 * nobody documented and surfaces the backup that is green and empty.
 */
test('the mid-week onboarding stands a customer up and discovery finds the horror', async ({
  page,
}) => {
  await arriveAtMsp(page);

  // arriveAtMsp opens the Monday shift; run it out and clock off, then do the
  // Tuesday, to reach the Wednesday the client signs on.
  await runSimMinutes(page, SHIFT_MINUTES);
  await expect(page.getByTestId('day-state')).toHaveText('Day end');
  await page.getByTestId('scorecard-clock-off').click();

  await expect(page.getByTestId('brief-heading')).toContainText('Day 2');
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();
  await runSimMinutes(page, SHIFT_MINUTES);
  await expect(page.getByTestId('day-state')).toHaveText('Day end');
  await page.getByTestId('scorecard-clock-off').click();

  await expect(page.getByTestId('brief-heading')).toContainText('Day 3');
  await page.getByTestId('brief-start-shift').click();
  await page.getByTestId('close-brief').click();

  // The shift opens at 09:00; the client signs at 10:00 and the discovery ticket
  // lands at 10:20. Run past both.
  await runSimMinutes(page, 100);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'audit customer:tillman');

  const output = page.getByTestId('cmd-output');
  // The map the handover did not come with: the real estate, off the wire.
  await expect(output).toContainText('TILLMAN-FREIGHT');
  await expect(output).toContainText('TILL-SRV-01');
  // And the horror, read off the estate node: a backup reporting success it
  // cannot restore from.
  await expect(output).toContainText('failing silently');
});
