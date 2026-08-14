/**
 * Overseer visual-review captures, second file (2026-08-13): everything
 * player-facing that shipped AFTER visual.spec.ts's probation-era set. Like
 * that file these are CAPTURES, not assertions - the gate is a human eye on
 * every frame, per the standing testing-expansion mandate. The one hard rule
 * here is that every capture happens through the shipped shell.
 *
 * Screenshots land in test-results/visual-sweep/.
 */
import { expect, type Page, test } from '@playwright/test';

import {
  beginShift,
  completeLogin,
  dismissBrief,
  openFromStartMenu,
  runCommand,
  workUntilMinute,
} from './helpers';

const OUT = 'test-results/visual-sweep';
const SWITCH_KEY = 'workgrumble/switch';

const ARRIVALS = {
  msp: {
    employer: 'msp',
    career: {
      reputation: 74,
      title: 'IT Support Technician',
      farmFund: 30_000,
      trail: null,
    },
  },
  corporate: {
    employer: 'corporate',
    career: {
      reputation: 78,
      title: 'IT Support Technician',
      farmFund: 40_000,
      trail: null,
    },
  },
  bodgeworth: {
    employer: 'bodgeworth',
    career: {
      reputation: 70,
      title: 'IT Support Technician',
      farmFund: 20_000,
      trail: null,
    },
  },
} as const;

async function arriveAt(
  page: Page,
  employer: keyof typeof ARRIVALS,
): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [SWITCH_KEY, ARRIVALS[employer]] as [
      string,
      (typeof ARRIVALS)[keyof typeof ARRIVALS],
    ],
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
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

  await dismissBrief(page);
}

async function freshProbation(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await dismissBrief(page);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('captures the start select and the engineer boot', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await shot(page, '30-login-ladder');

  await page.getByTestId('login-desk').selectOption('systems_engineer');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-screen'))
    .toBeVisible({ timeout: 30_000 });
  await completeLogin(page, { brief: 'keep' });
  // The brief opens scrolled to wherever the incident list left it; the
  // capture wants the TOP - the greeting and the load line are the frame.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(
      '[data-testid="window-brief"] *',
    )) {
      if (el.scrollTop > 0) {
        el.scrollTop = 0;
      }
    }
  });
  await shot(page, '31-engineer-first-monday');
  await dismissBrief(page);
  await shot(page, '32-engineer-desktop-with-pile');
});

/**
 * The second queue (E9, 0.36.0), which is the one surface this slice adds and
 * therefore the one the sweep has never seen.
 *
 * Two frames rather than one, because the tab is half the design: the strip
 * with both lists on it and the count of what is still unsigned, and then the
 * pane where somebody else's filing sits above the form that disagrees with
 * it. A capture of only the second would not show that this is a SECOND queue
 * at all.
 */
test('captures the senior rung\'s audit queue', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');

  await page.getByTestId('login-desk').selectOption('sd_senior');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-screen'))
    .toBeVisible({ timeout: 30_000 });
  await completeLogin(page, { brief: 'keep' });
  await dismissBrief(page);
  await beginShift(page);
  // Far enough into the morning that first line have filed the first two.
  await workUntilMinute(page, 800);

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('tickets-tab-audit').click();
  await shot(page, '35-audit-queue-tab');

  await page.getByTestId('ticket-row-audit-print-task').click();
  // The frame is named for the filing AND the triage: scroll the form into
  // view before shooting, or 36 is 35 again with the same fold - which is
  // what the first human eyeball of these frames found it was.
  await page.getByTestId('triage-file').scrollIntoViewIfNeeded();
  await shot(page, '36-audit-filing-and-triage');
});

test('captures the MSP surfaces', async ({ page }) => {
  test.setTimeout(180_000);
  await arriveAt(page, 'msp');

  await openFromStartMenu(page, 'tickets');
  await shot(page, '40-msp-queue-tiers');

  await openFromStartMenu(page, 'monitor');
  await shot(page, '41-monitoring-board');

  await openFromStartMenu(page, 'timesheet');
  await shot(page, '42-timesheet');

  await openFromStartMenu(page, 'projects');
  await shot(page, '43-projects');
});

test('captures the remote faces (#55)', async ({ page }) => {
  await arriveAt(page, 'msp');
  await openFromStartMenu(page, 'remote');

  await page.getByTestId('remote-machine-marl-nas-01').click();
  await shot(page, '50-remote-console-face');

  await page.getByTestId('remote-machine-marl-ws-01').click();
  await shot(page, '51-remote-mac-face');
});

test('captures the corporate surfaces', async ({ page }) => {
  await arriveAt(page, 'corporate');
  await openFromStartMenu(page, 'tickets');
  await shot(page, '60-halcyon-queue');
});

test('captures the wild west', async ({ page }) => {
  await arriveAt(page, 'bodgeworth');
  await shot(page, '61-bodgeworth-desktop');
  await openFromStartMenu(page, 'chat');
  await shot(page, '62-bodgeworth-rooms');
});

test('captures the store and the games', async ({ page }) => {
  await freshProbation(page);
  await openFromStartMenu(page, 'browser');
  await page.getByTestId('browser-site-store').click();
  await shot(page, '70-web-store');
});

test('captures the updates app with the whole history', async ({ page }) => {
  await freshProbation(page);
  await openFromStartMenu(page, 'updates');
  await shot(page, '71-update-history');
});

test('captures the mac terminal refusing honestly', async ({ page }) => {
  await arriveAt(page, 'msp');
  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'restart MARL-WS-01\\Spooler');
  await shot(page, '80-windows-tool-refuses-mac');
});
