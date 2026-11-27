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
  clockOffFor,
  completeLogin,
  dismissBrief,
  openFromStartMenu,
  runCommand,
  runToDayEnd,
  workUntilMinute,
} from './helpers';
import { OFFICE } from './office';

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
  await page.goto(OFFICE);
  await completeLogin(page, { brief: 'keep' });

  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    await page.getByTestId('close-updates').click();
    await expect(arrival).toHaveCount(0);
  }

  await dismissBrief(page);
}

async function freshProbation(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto(OFFICE);
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
  await page.goto(OFFICE);
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

  // THE LAUNCHER (W-07, 0.42.0). The sweep exists so that every surface a
  // player reaches gets a human eye on it each round, and the one surface
  // that had never been captured was the one the September walk found five
  // entries hidden in. The menu wraps into columns now; a frame is how
  // anybody notices when a column goes somewhere silly.
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('start-menu')).toBeVisible();
  await shot(page, '33-start-menu');
  await page.keyboard.press('Escape');
});

/**
 * THE START-FRESH DOOR (#61, 0.41.0), in all three of its states.
 *
 * Three frames because the door is a sequence rather than a control: a line
 * on the log-on screen, a question that names the career, and only then the
 * ladder with the line that says when the old one goes. A capture of the last
 * frame alone would show a difficulty select on a screen it is not on until
 * somebody has answered something.
 */
test('captures the start-fresh door on a career-carrying browser', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto(OFFICE);

  // A career worth being asked about: the senior desk, which is a fact the
  // seed does not carry and the exact case #61 was found on.
  await page.getByTestId('login-desk').selectOption('sd_senior');
  await page.getByTestId('login-password').fill('hunter2');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-screen'))
    .toBeVisible({ timeout: 30_000 });
  await shot(page, '33-door-shut');

  await page.getByTestId('login-start-fresh').click();
  await expect(page.getByTestId('login-start-fresh-confirm')).toBeVisible();
  await shot(page, '34-door-asking');

  await page.getByTestId('login-start-fresh-confirm-yes').click();
  await expect(page.getByTestId('login-desk-field')).toBeVisible();
  await shot(page, '35-door-open-with-ladder');
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
  await page.goto(OFFICE);

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

  // And the OTHER surface this rung now has of its own (0.40.0): the middle
  // sheet. It is worth a frame because it is neither of the shapes the sweep
  // already holds - it has rows to argue with, which the probationer's sheet
  // has not, and no billable word at the end of them, which the engineer's
  // sheet at frame 42 has - and because a shape nobody has looked at is a
  // shape nobody has checked the fold of.
  await openFromStartMenu(page, 'timesheet');
  await shot(page, '37-senior-timesheet');
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

/**
 * THE FRIDAY REVIEW SCORECARD, WHICH HAS NEVER MET AN EYE (0.38.1).
 *
 * The sweep captures seventeen player surfaces and this was not one of them:
 * the evening scorecard on the LAST day of the week, at a shop with tiered
 * customers on it, where 0.38.0's per-day contract-miss row renders. The
 * 0.36.0 pane-clip class lived in exactly this shape of gap - a surface that
 * is reachable, shipped, tested for its numbers, and never looked at.
 *
 * The whole week is walked on the shipped path, day by day, through the same
 * brief-and-clock-off pair every day-advancing spec uses. The review scene
 * stands up first on the Friday and is dismissed, because it is the scorecard
 * UNDER it that is the subject.
 *
 * A capture, not an assertion, like every other frame in this file - the
 * contract-miss row is conditional on the week having charged one, so the
 * frame is taken of the panel rather than of the row.
 */
test('captures the Friday review scorecard at the MSP', async ({ page }) => {
  test.setTimeout(300_000);
  await arriveAt(page, 'msp');
  await beginShift(page);

  // Monday to Thursday: run each day out, clock off, and start the next one.
  for (let day = 1; day <= 4; day += 1) {
    await clockOffFor(page, day);
    await page.getByTestId('brief-start-shift').click();
    await page.getByTestId('close-brief').click();
  }

  await runToDayEnd(page);

  // The review comes up at three on a Friday, but the scorecard window opens
  // ON TOP of it, focused - proven by this frame's first box run, where the
  // scorecard's own subtree intercepted the click meant to dismiss the review
  // underneath. The window in front is the subject, so nothing needs moving:
  // the frame is taken of the stack exactly as a player finds it.
  //
  // The frame used to scroll the work panel into view before shooting, because
  // the window opened two thirds of the way down its own content - the shell
  // focused the Clock off button at the bottom and the browser took the pane
  // with it. That is fixed at the root (window-renderer, `preventScroll`), so
  // the scroll is gone from here too: a frame that puts the subject right is a
  // frame that cannot show the day the defect comes back.
  await expect(page.getByTestId('scorecard-app')).toBeVisible();
  await shot(page, '44-msp-friday-scorecard');
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
