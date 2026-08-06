import { expect, type Page, test } from '@playwright/test';

import { completeLogin, openFromStartMenu, runCommand } from './helpers';

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
