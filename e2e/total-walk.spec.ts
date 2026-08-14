import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  beginShift,
  boxOf,
  clockOffFor,
  completeLogin,
  dismissBrief,
  dragBy,
  focusWindow,
  installedVersion,
  issueBadge,
  logInOnDay,
  logOnWithBadge,
  openFromDesktopIcon,
  openFromStartMenu,
  runCommand,
  runOnlyCommand,
  runRealMinutes,
  runSimMinutes,
  runToDayEnd,
  runToTelegraph,
  underPause,
  workUntil,
  workUntilMinute,
  workUntilTicket,
  worldHash,
} from './helpers';
import { REFUSED_TOKENS, SHARED_TOKEN } from './tokens';
import { AWAY_NOTICED_LINES } from '../src/world/dialogue';
import { buildPatrolSchedule } from '../src/world/boss';
import { FIRST_EMPLOYER } from '../src/world/employers';
import { dayLoad } from '../src/world/load';
import { loadReading } from '../src/world/load-voice';
import { dayScript } from '../src/world/week';
import { findWorldTicket } from '../src/world/tickets';
import { WORLD_SEED } from '../src/world/session';
import { DND_BEAT_MINUTES, dndEvidence } from '../src/world/presence';
import {
  COVERAGE,
  type CoverageId,
  coverageEntry,
  coverageFor,
  isDeclaredControl,
  WALK_RUNS,
  type WalkRunId,
} from '../src/shell/coverage';

/**
 * The play-every-function walk.
 *
 * The house rule this exists for: assert the OUTCOME a player is after, on the
 * shipped artifact, for every function they can reach - not that some function
 * returned success. `src/shell/coverage.ts` is the list of those functions and
 * this file is the thing that drives them, in four sessions, because a week
 * cannot be both passed and failed and an enrolment cannot be both checked and
 * skipped.
 *
 * The last test in this file is the gate: it compares what was actually driven
 * against the manifest and fails on either kind of disagreement. Adding a
 * function without walking it fails here; walking something nobody listed fails
 * in `coverage.test.ts` on the other half of the gate.
 *
 * It is deliberately one file in serial order: the ledger below is shared, and
 * a walk whose parts run in different workers cannot answer the only question
 * it is here to answer.
 */

test.describe.configure({ mode: 'serial' });

// Every session folds what it saw into the shared ledger, whether it passed or
// not: a run that fell over halfway still saw everything up to there.
test.afterEach(async ({ page }) => {
  await collectControls(page);
});

/** Everything this file has actually driven, by coverage id. */
const walked = new Set<string>();

/** The spool directory on the print server, which is where a queue lives. */
const WALK_SPOOL = '\\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\SPOOL\\PRINTERS';

/**
 * Every control this walk has SEEN, by test id, across all four sessions.
 *
 * The manifest gate below answers "was every listed function driven". It could
 * not answer "is every control on screen a listed function", because both
 * halves of the old gate read the same list: a UI-only control - a filter, a
 * navigation button, a toggle reaching no new action, command, app or scene -
 * could be added, left out of `COVERAGE`, and pass everything. So the walk
 * collects what the DOM actually produced and diffs it against
 * `PLAYER_CONTROLS`, which is a list of controls rather than of functions.
 */
const seenControls = new Set<string>();

/**
 * Watches the page for controls, from the first paint onwards.
 *
 * "A control" is deliberately the real form controls plus anything wearing a
 * button role, because those are the elements that DO something when they are
 * used. A div with a test id on it is a label, a panel or a readout, and a
 * gate that enumerated those would be a gate about markup. The selector is
 * written out inside the init script because that string is evaluated in the
 * page, where nothing from this module exists.
 *
 * An init script rather than a sweep at the end, because most of this product
 * is windows that open and close: a control that was only on screen between
 * two steps is still a control, and a single snapshot would miss every one of
 * them. The observer is cheap - it records a string per new element - and it
 * never touches anything it sees.
 */
async function recordControls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const selector = 'button[data-testid], select[data-testid], '
      + 'input[data-testid], textarea[data-testid], [role="button"][data-testid]';
    const seen = new Set<string>();
    const scope = window as unknown as { __controls: string[] };
    scope.__controls = [];

    const keep = (element: Element): void => {
      const id = (element as HTMLElement).dataset.testid;

      if (id !== undefined && !seen.has(id)) {
        seen.add(id);
        scope.__controls.push(id);
      }
    };

    // The node itself AND everything under it: an added element can be the
    // control, or the panel the control arrived inside.
    const note = (root: Element | Document): void => {
      if (root instanceof Element && root.matches(selector)) {
        keep(root);
      }

      for (const element of root.querySelectorAll(selector)) {
        keep(element);
      }
    };

    const start = (): void => {
      note(document);
      new MutationObserver((records) => {
        for (const record of records) {
          for (const added of record.addedNodes) {
            if (added instanceof Element) {
              note(added);
            }
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  });
}

/** Folds what one session saw into the ledger the gate reads. */
async function collectControls(page: Page): Promise<void> {
  const ids = await page.evaluate(
    () => (window as unknown as { __controls?: string[] }).__controls ?? [],
  );

  for (const id of ids) {
    seenControls.add(id);
  }
}


/** Every `data-` attribute a takeover window carries, read in one go. */
type Takeover = Readonly<Record<string, string | undefined>>;

/**
 * Runs the clock a minute at a time until something is actually taking the
 * screen off the player, and answers with the window's own attributes as they
 * stood in the read that decided to stop.
 *
 * It watches the attribute rather than whether the window exists, because both
 * of these windows can be up with nothing in them. And it hands the snapshot
 * BACK rather than leaving the caller to ask again: a call rings for the
 * minutes its row says, so a second round-trip is a question put to a later
 * paint, whose honest answer may be that the phone has stopped.
 */
async function huntForTakeover(
  page: Page,
  appId: 'call' | 'meeting',
  limit = 90,
): Promise<Takeover> {
  const app = page.getByTestId(`${appId}-app`);

  for (let minute = 0; minute < limit; minute += 1) {
    if (await app.count() > 0) {
      const snapshot: Takeover = await app.evaluate(
        (node) => ({ ...(node as HTMLElement).dataset }),
      );

      if (snapshot[appId] !== undefined && snapshot[appId] !== 'none') {
        return snapshot;
      }
    }

    await runSimMinutes(page, 1, 1);
  }

  throw new Error(`Nothing took the screen with a ${appId} inside the hour.`);
}

/**
 * The same, for the workstation - which needs its own because its window
 * stays OPEN between arrivals.
 *
 * That is the countdown, and the countdown is the half of the mechanic that
 * does not own the desk: the window is up saying how many minutes a postpone
 * bought while the queue carries on being workable underneath it. So "is it
 * happening" is `data-holding`, not "is there a window".
 */
async function huntForReboot(page: Page, limit = 30): Promise<Takeover> {
  const app = page.getByTestId('reboot-app');

  for (let minute = 0; minute < limit; minute += 1) {
    if (await app.count() > 0) {
      const snapshot: Takeover = await app.evaluate(
        (node) => ({ ...(node as HTMLElement).dataset }),
      );

      if (snapshot.holding === 'true') {
        return snapshot;
      }
    }

    await runSimMinutes(page, 1, 1);
  }

  throw new Error('The workstation never took the desk.');
}

/**
 * Drives one entry, named after it.
 *
 * The name is the id and the sentence from the manifest, so a failure in the
 * run says which function of the product broke rather than which line of a
 * four-hundred-line test did.
 */
async function step(
  id: CoverageId,
  drive: () => Promise<void>,
): Promise<void> {
  const entry = coverageEntry(id);
  await test.step(`${id} - ${entry.does}`, drive);
  walked.add(id);
}

/** Clicks a dialogue option by what it says, which is how a player picks one. */
async function chatOption(page: Page, name: RegExp): Promise<void> {
  await page.getByTestId('chat-options').getByRole('button', { name }).click();
}

/**
 * The toast that says THIS ticket closed.
 *
 * Named rather than counted: a toast lives ten simulated minutes, and this walk
 * closes several tickets without the clock moving in between - so "one resolved
 * toast on screen" is a number that depends on how much of the last five
 * minutes the walk spent clicking. The title is in the body of the notice, so
 * asking for the ticket by name is both exact and stable.
 */
function resolvedFor(page: Page, title: RegExp): Locator {
  return page
    .getByTestId('toast')
    .filter({ hasText: 'Ticket resolved' })
    .filter({ hasText: title });
}

/**
 * Brings the queue to the front and opens a ticket on it - opening the queue
 * first if this run has not needed it yet, because `focusWindow` waits on a
 * taskbar button that only exists once an app has been launched.
 */
async function openTicket(page: Page, slug: string): Promise<void> {
  if (await page.getByTestId('window-tickets').count() === 0) {
    await openFromStartMenu(page, 'tickets');
  } else {
    await focusWindow(page, 'tickets');
  }

  await page.getByTestId(`ticket-row-${slug}`).click();
}

async function expectClosed(page: Page, slug: string): Promise<void> {
  await openTicket(page, slug);
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
}

/**
 * The notification centre, which is the durable half of a toast: anything the
 * world said survives there whether or not the toast was still on screen when
 * the assertion got round to looking.
 */
async function expectNoticed(page: Page, text: string): Promise<void> {
  await page.getByTestId('notification-tray').click();
  await expect(
    page
      .getByTestId('notification-panel-item')
      .filter({ hasText: text })
      .first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('notification-panel')).toBeHidden();
}

/** Adds somebody to a group, which is two clicks and a dropdown. */
async function addToGroup(
  page: Page,
  account: string,
  group: string,
): Promise<void> {
  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-search').fill('');
  await page.getByTestId(`directory-row-${account}`).click();
  await page.getByTestId('directory-group-picker').selectOption(group);
  await page.getByTestId('directory-add-group').click();
}

/**
 * Runs the clock a minute at a time until the lead is actually in the room.
 *
 * Real minutes rather than bought ones (the 0.3.2 helper contract): the scene
 * this is waiting for is one of the things that drops the clock to x1, and a
 * step that put the speed back up would be arguing with the game in the same
 * minute it made its point. The loop stops on the scene, so nothing after it
 * depends on the speed the scene left behind.
 */
async function runUntilCaught(page: Page): Promise<void> {
  const caught = page.getByTestId('window-caught');

  for (let minute = 0; minute < 20 && await caught.count() === 0; minute += 1) {
    await runRealMinutes(page, 1, 4);
  }

  await expect(caught).toBeVisible();
}

/**
 * Work the world accepts and that resolves nothing: a screen rotated between
 * two wrong angles.
 *
 * The suspicion drip and the Away sting both read the same evidence - the
 * dispatch log says this desk is working - so the two journeys about a
 * dishonest dot need work that can be repeated without the queue emptying
 * underneath them.
 */
async function doSomeWork(page: Page): Promise<void> {
  // The callers of this run it in a loop that is WAITING to be caught, and
  // the caught dialog takes the desk the minute the lead arrives - including
  // halfway through the work below, where it intercepts the next click and
  // the click would otherwise retry into the test timeout. A caught window is
  // this function's cue to hand the turn back, not an error.
  const caught = page.getByTestId('window-caught');

  if (await caught.count() > 0) {
    return;
  }

  try {
    if (await page.getByTestId('window-remote').count() === 0) {
      await openFromStartMenu(page, 'remote');
    } else {
      await focusWindow(page, 'remote');
    }

    await page.getByTestId('remote-machine-ada').click({ timeout: 10_000 });

    const viewport = page.getByTestId('remote-viewport');
    // The other wrong angle, whichever this is: applying the angle a screen is
    // already at is refused before the click, by a button that greys itself
    // out.
    const angle = await viewport.getAttribute('data-rotation') === '180'
      ? '90'
      : '180';

    await page.getByTestId('remote-rotation-picker')
      .selectOption(angle, { timeout: 10_000 });
    await page.getByTestId('remote-apply-rotation')
      .click({ timeout: 10_000 });
    await expect(viewport).toHaveAttribute('data-rotation', angle);
  } catch (error) {
    if (await caught.count() > 0) {
      return;
    }

    throw error;
  }
}

/** Runs the clock until the desk is on the far side of its can. */
async function runUntilCrash(page: Page): Promise<void> {
  const desktop = page.getByTestId('desktop');

  for (let minute = 0; minute < 80; minute += 5) {
    if (await desktop.getAttribute('data-drink') === 'crash') {
      return;
    }

    // Bought minutes, because the crash is eighty minutes away and this is a
    // search that has to cover them: an afternoon that rang once would
    // otherwise cover twenty and report a can that never wore off.
    await runSimMinutes(page, 5, 4);
  }

  await expect(desktop).toHaveAttribute('data-drink', 'crash');
}

/* ========================================================================= *
 * Run one: the week, played properly.
 * ========================================================================= */

test('walks every function of a probation week that goes well', async ({
  page,
}) => {
  await recordControls(page);
  // Five played days plus every tool, every scene and a save/reload in the
  // middle of them. It is the longest journey in the suite by design.
  test.setTimeout(1_800_000);
  await page.clock.install();
  // The sway never settles under strict actionability checks, and this walk is
  // about what the product DOES rather than how it wobbles: shipped
  // reduced-motion path, same as every other cross-day journey here.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  /* -- Monday, 08:00: the boot, the login, and a desk nobody has used ----- */

  await step('boot.skip', async () => {
    await expect(page.getByTestId('boot-screen')).toBeVisible();
    await expect(page.getByTestId('boot-hint')).toContainText('skip');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('login-screen')).toBeVisible();
  });

  await step('login.desk', async () => {
    // The desk you were hired onto (0.35.0): the whole ladder on the log-on
    // box, the standard desk already selected. The walk takes the default
    // ON PURPOSE - this run IS the standard desk's career; the engineer
    // boot has its own spec. Driving the control here means reading it and
    // choosing, not merely sailing past a default.
    const desk = page.getByTestId('login-desk');
    await expect(desk).toBeVisible();
    await expect(desk).toHaveValue('sd_junior');
    await desk.selectOption('sd_junior');
  });

  await step('login.submit', async () => {
    await expect(page.getByTestId('login-user')).toContainText('Pat Pending');
    await expect(page.getByTestId('login-hint')).toContainText('sticky note');
    await page.getByTestId('login-password').fill('hunter2');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('desktop')).toBeVisible();
  });

  await step('desk.idle', async () => {
    await expect(page.getByTestId('desk-drink-label')).toHaveText(
      'Energy drink',
    );
    const can = page.getByTestId('desk-drink');
    await expect(can).toBeDisabled();
    await expect(can).toHaveAttribute('title', /not on shift/);
    await expect(page.getByTestId('desk-empties')).toBeHidden();
  });

  await step('desk.beer-locked', async () => {
    const beer = page.getByTestId('desk-beer');
    await expect(beer).toBeDisabled();
    await expect(beer).toHaveAttribute('data-locked', 'true');
    await expect(beer).toHaveAttribute('title', /probation/);
  });

  await step('brief.window', async () => {
    await expect(page.getByTestId('window-brief')).toBeVisible();
    await expect(page.getByTestId('brief-heading')).toContainText('Day 1');
    await expect(page.getByTestId('brief-heading')).toContainText('Monday');
    await expect(page.getByTestId('brief-mail-subject')).not.toBeEmpty();
    await expect(page.getByTestId('brief-queue-list').getByRole('listitem'))
      .toHaveCount(2);
    // The day drips more in while it is being worked, and the brief only says
    // so when it is true.
    await expect(page.getByTestId('brief-later')).toContainText('on their way');
  });

  await step('brief.load-reading', async () => {
    // The one reading on this screen that is arithmetic rather than a list, and
    // the assertion walks the same chain the surface does: `dayLoad` prices
    // Monday off the week's own table, the band picks the shop's line, and the
    // brief has to be saying that line. Derived rather than pinned, so a week
    // table that moves moves this with it - and a brief that stopped asking the
    // arithmetic goes red on the day the two disagree.
    const band = dayLoad(dayScript(1), findWorldTicket).load;
    const said = loadReading(FIRST_EMPLOYER, band);
    const reading = page.getByTestId('brief-load');

    expect(said).not.toBeNull();
    await expect(reading).toHaveAttribute('data-band', String(band));
    await expect(reading).toHaveText(said ?? '');
    // A forecast, not a manifest: no figure, and nothing about the walk-ups,
    // the pings and the rounds the day has not dealt yet.
    await expect(reading).not.toContainText(/\d|walk-?up|ping|ticket/i);
  });

  await step('brief.start-shift', async () => {
    await page.getByTestId('brief-start-shift').click();
    // The hour rather than the minute, here and in `desktop.clock` below: the
    // shift's clock is running from the moment it opens (the contract in
    // `helpers.ts`), so a read pinned to 09:00 races the first tick of it. A
    // morning that was not skipped is at 08-something and stays there.
    await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
    await expect(page.getByTestId('day-state')).toHaveText('Shift');
  });

  await step('brief.started-refusal', async () => {
    const start = page.getByTestId('brief-start-shift');
    await expect(start).toBeDisabled();
    await expect(start).toHaveAttribute('title', /already started/);
    await expect(start).toHaveText('Shift under way');
  });

  await step('windows.close', async () => {
    await page.getByTestId('close-brief').click();
    await expect(page.getByTestId('window-brief')).toHaveCount(0);
    await expect(page.getByTestId('taskbar-button-brief')).toHaveCount(0);
  });

  await step('desktop.clock', async () => {
    // Four steps of clicking after the shift opened, all of them spending
    // minutes: the taskbar carries the day and the hour the session is in,
    // which is what the clock strip is FOR, and not the minute the shift
    // started on.
    await expect(page.getByTestId('sim-clock-time')).toHaveText(/^09:/);
    await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
  });

  await step('desktop.speed', async () => {
    for (const speed of ['1', '2', '4']) {
      await page.getByTestId(`day-speed-${speed}`).click();
      await expect(page.getByTestId(`day-speed-${speed}`))
        .toHaveAttribute('data-active', 'true');
    }
  });

  await step('desktop.pause', async () => {
    const pause = page.getByTestId('day-pause');
    const clock = page.getByTestId('sim-clock-time');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('day-state')).toContainText('paused');
    // What pause promises is that the clock does not move - not that it is
    // any particular minute. Getting here costs a few of them.
    const stopped = (await clock.textContent())?.trim() ?? '';
    // Real time, deliberately: the claim is that a paused day converts none
    // of it, so nothing here may go near a helper that buys minutes.
    await runRealMinutes(page, 10, 4);
    await expect(clock).toHaveText(stopped);
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
  });

  /*
   * The helper the office bought, at the start of the week it will spend
   * being wrong about.
   *
   * Both of its functions are here because both are one click apart and
   * neither is load-bearing: nothing in the rest of this walk reads it, which
   * is the property the second step below asserts by taking the world's own
   * hash on both sides of the only thing anybody can do to it.
   */
  await step('assistant.speaks', async () => {
    await expect(page.getByTestId('assistant')).toBeVisible();
    await expect(page.getByTestId('assistant-character')).toBeVisible();
    await expect(page.getByTestId('assistant-bubble')).toBeVisible();
    await expect(page.getByTestId('assistant-line')).not.toBeEmpty();
  });

  await step('assistant.dismiss', async () => {
    const before = await worldHash(page);
    await page.getByTestId('assistant-dismiss').click();
    await expect(page.getByTestId('assistant')).toBeHidden();
    // Pure overlay: closing it moved nothing in the world, and it is back
    // tomorrow with a note about it whether or not anybody asks.
    expect(await worldHash(page)).toBe(before);
  });

  /*
   * The dot, at nine o'clock, before anybody has touched a ticket.
   *
   * All three states and back to Available, deliberately in a minute where the
   * touch log is empty: the drip only charges a status that disagrees with a
   * desk that is demonstrably working, so a week that tries the control and
   * puts it back has paid nothing for it - which is the honest baseline this
   * whole slice rests on, and asserting it here is what makes the meters of
   * the rest of this walk mean what they meant before the dot existed.
   *
   * The two costs of a dishonest dot - a call turned away, somebody answering
   * the Away lie - are the fired walk's, because a week cannot both answer the
   * Tuesday phone and dodge it.
   */
  await step('desktop.presence', async () => {
    const state = page.getByTestId('presence-state');

    await expect(state).toHaveText('Available');
    await expect(page.getByTestId('presence-available'))
      .toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('presence-away').click();
    await expect(state).toHaveText('Away');
    await expect(page.getByTestId('presence-away'))
      .toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('presence-dnd').click();
    await expect(state).toHaveText('Do not disturb');
    await expect(page.getByTestId('presence-away'))
      .toHaveAttribute('aria-pressed', 'false');

    // The office says something about it, once, in somebody's own thread.
    await expect(
      page.getByTestId('toast').filter({ hasText: 'noticed the dot' }).first(),
    ).toBeVisible();

    // And back to the honest one, which is where this walk leaves it: a week
    // that ended on a red dot would be a week whose meters mean something
    // else, and every assertion after this one assumes it did not.
    await page.getByTestId('presence-available').click();
    await expect(state).toHaveText('Available');
    await expect(page.getByTestId('presence-dnd'))
      .toHaveAttribute('aria-pressed', 'false');
  });

  await step('desktop.icon', async () => {
    await openFromDesktopIcon(page, 'about');
  });

  await step('about.window', async () => {
    await expect(page.getByTestId('about-status')).toContainText('System is');
    // An About dialog: what the machine is, and what is in the case. The
    // ticket count and the entity count that used to be on here were debug
    // readouts wearing a system-information window - the queue owns the one
    // and nothing in this building has ever counted the other.
    await expect(page.getByTestId('about-value-processor'))
      .toContainText('Pentagon');
    await expect(page.getByTestId('about-value-memory'))
      .toContainText('nobody knows why');
    await expect(page.getByTestId('about-value-logged-on-as'))
      .toHaveText('workgrumble\\ppending');
    await expect(page.getByTestId('about-value-uptime')).not.toBeEmpty();
    await expect(page.getByTestId('about-app')).not.toContainText('entities');
    await expect(page.getByTestId('about-app'))
      .not.toContainText('Tickets awaiting you');
    await expect(page.getByTestId('about-value-workstation'))
      .toHaveText('BEIGE-BOX');
    await page.getByTestId('close-about').click();
    await expect(page.getByTestId('window-about')).toHaveCount(0);
  });

  await step('desktop.day-state', async () => {
    // The brief is closed, and the taskbar is the way back to it: a screen you
    // can only be shown once is the dead end the house rules forbid.
    await page.getByTestId('day-state').click();
    await expect(page.getByTestId('window-brief')).toBeVisible();
  });

  await step('brief.open-mail', async () => {
    await page.getByTestId('brief-open-mail').click();
    await expect(page.getByTestId('window-mail')).toBeVisible();
  });

  await step('mail.window', async () => {
    // Four since 0.3.0: the sync on the Wednesday is booked from the Monday.
    await expect(page.getByTestId('mail-summary')).toContainText('4 unread');
    await expect(page.getByTestId('mail-empty')).toBeVisible();
  });

  await step('mail.select', async () => {
    const nag = page.getByTestId('mail-row-queue-nag');
    await expect(nag).toHaveAttribute('data-unread', 'true');
    await nag.click();
    await expect(page.getByTestId('mail-subject')).toContainText('the queue');
    await expect(page.getByTestId('mail-message-from-queue-nag-1'))
      .toHaveText('Desmond Frisk');
    await expect(nag).toHaveAttribute('data-unread', 'false');
    await expect(page.getByTestId('mail-summary')).toContainText('3 unread');
  });

  await step('brief.open-tickets', async () => {
    await focusWindow(page, 'brief');
    await page.getByTestId('brief-open-tickets').click();
    await expect(page.getByTestId('window-tickets')).toBeVisible();
    await page.getByTestId('close-brief').click();
  });

  /* -- the queue, before anything has been fixed -------------------------- */

  await step('tickets.window', async () => {
    await expect(page.getByTestId('tickets-summary')).toContainText('2 open');
  });

  await step('tickets.pick-duplicate', async () => {
    await page.getByTestId('ticket-pick-locked-account').check();
    await expect(page.getByTestId('ticket-pick-locked-account')).toBeChecked();
  });

  await step('tickets.link-parent-refused', async () => {
    // Neither of Monday's two is anybody's duplicate, and the queue lets the
    // player try: the refusal is the teaching.
    await page.getByTestId('ticket-row-rotated-screen').click();
    const attach = page.getByTestId('ticket-link-parent');
    await expect(attach).toContainText('Attach 1 ticked to this');
    await attach.click();
    await expect(page.getByTestId('ticket-refusal'))
      .toContainText('not a duplicate of anything');
    await expect(page.getByTestId('ticket-row-locked-account'))
      .toHaveAttribute('data-state', 'open');
    await page.getByTestId('ticket-pick-locked-account').uncheck();
  });

  await step('tickets.select', async () => {
    await page.getByTestId('ticket-row-locked-account').click();
    await expect(page.getByTestId('ticket-detail-title'))
      .toContainText('password is wrong');
    await expect(page.getByTestId('ticket-detail-reporter'))
      .toHaveText('Gary Poole');
    await expect(page.getByTestId('ticket-detail-body'))
      .toContainText('locked out');
  });

  await step('tickets.clocks', async () => {
    const response = page.getByTestId('ticket-detail-response');
    const resolution = page.getByTestId('ticket-detail-resolution');
    await expect(response).toHaveAttribute('data-due', /^\d{2}:\d{2}$/);
    await expect(resolution).toHaveAttribute('data-due', /^\d{2}:\d{2}$/);
    await expect(resolution).toContainText('left');
  });

  await step('tickets.streams', async () => {
    await expect(page.getByTestId('ticket-worknotes'))
      .toHaveAttribute('data-internal', 'true');
    await expect(page.getByTestId('ticket-comments'))
      .toHaveAttribute('data-internal', 'false');
    await expect(page.getByTestId('ticket-comments'))
      .toContainText('nobody has looked');
  });

  await step('tickets.escalate-refused', async () => {
    const escalate = page.getByTestId('ticket-escalate');
    await expect(escalate).toBeDisabled();
    await expect(escalate).toHaveAttribute('title', /fixable from your desk/);
  });

  await step('tickets.triage-pickers', async () => {
    await expect(page.getByTestId('ticket-detail-priority'))
      .toContainText('Untriaged');
    await expect(page.getByTestId('ticket-claimed-urgency'))
      .toContainText('urgency');
    await expect(page.getByTestId('triage-file')).toBeDisabled();
    await page.getByTestId('triage-impact').selectOption('1');
    await page.getByTestId('triage-urgency').selectOption('2');
    await expect(page.getByTestId('triage-outcome')).toContainText('P4');
  });

  await step('tickets.triage-file', async () => {
    await page.getByTestId('triage-file').click();
    await expect(page.getByTestId('ticket-detail-priority')).toHaveText('P4');
    await expect(page.getByTestId('ticket-row-priority-locked-account'))
      .toHaveText('P4');
  });

  await step('tickets.waiting-refused', async () => {
    const toggle = page.getByTestId('ticket-waiting-toggle');
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAttribute(
      'title',
      /have not actually asked them anything yet/,
    );
  });

  await step('tickets.open-chat', async () => {
    await page.getByTestId('ticket-open-chat').click();
    await expect(page.getByTestId('window-chat')).toBeVisible();
    await expect(page.getByTestId('chat-heading')).toHaveText('Gary Poole');
  });

  await step('chat.window', async () => {
    await expect(page.getByTestId('chat-summary')).toContainText('contacts');
    await expect(page.getByTestId('chat-context')).not.toBeEmpty();
  });

  await step('chat.option-ask', async () => {
    await chatOption(page, /when he last logged in/);
    await expect(page.getByTestId('chat-outcome'))
      .toContainText('where they can see it');
  });

  await step('tickets.waiting-toggle', async () => {
    await focusWindow(page, 'tickets');
    await expect(page.getByTestId('ticket-comments'))
      .toContainText('when he last logged in');
    const toggle = page.getByTestId('ticket-waiting-toggle');
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(page.getByTestId('ticket-detail-state'))
      .toContainText('Awaiting the user');
  });

  await step('tickets.triage-refused', async () => {
    const file = page.getByTestId('triage-file');
    await expect(file).toBeDisabled();
    await expect(file).toHaveAttribute(
      'title',
      /time it has already spent waiting comes with it/,
    );
    await page.getByTestId('ticket-waiting-toggle').click();
    await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');
  });

  await step('tickets.article-link', async () => {
    await expect(page.getByTestId('ticket-article-current'))
      .toContainText('Nothing linked yet');
    await page
      .getByTestId('ticket-article-picker')
      .selectOption('kb/three-ways-an-account-says-no');
    await page.getByTestId('ticket-link-article').click();
    await expect(page.getByTestId('ticket-article-current'))
      .toContainText('kb/three-ways-an-account-says-no');
    await expect(page.getByTestId('ticket-worknotes'))
      .toContainText('Linked knowledge article');
  });

  await step('tickets.article-refused', async () => {
    const link = page.getByTestId('ticket-link-article');
    await expect(link).toBeDisabled();
    await expect(link).toHaveAttribute(
      'title',
      /already the article on this ticket/,
    );
  });

  await step('tickets.open-kb', async () => {
    await page.getByTestId('ticket-open-kb').click();
    await expect(page.getByTestId('window-kb')).toBeVisible();
    await expect(page.getByTestId('kb-reference'))
      .toHaveText('kb/three-ways-an-account-says-no');
  });

  await step('kb.window', async () => {
    await expect(page.getByTestId('kb-count')).toContainText('articles');
  });

  await step('kb.select', async () => {
    await page.getByTestId('kb-row-print-spooler').click();
    await expect(page.getByTestId('kb-reference')).toHaveText('kb/print-spooler');
    await expect(page.getByTestId('kb-issue')).toContainText('haunted');
    await expect(page.getByTestId('kb-resolution'))
      .toContainText('STOP THE SPOOLER, then empty the queue');
    await expect(page.getByTestId('kb-state')).toHaveText('Published');
  });

  await step('kb.see-also', async () => {
    await page.getByTestId('kb-see-also-power-cycle').click();
    await expect(page.getByTestId('kb-reference')).toHaveText('kb/power-cycle');
  });

  await step('kb.draft', async () => {
    const draft = page.getByTestId('kb-row-vpn-on-the-print-server');
    await expect(draft).toHaveAttribute('data-state', 'draft');
    await draft.click();
    await expect(page.getByTestId('kb-state')).toContainText('Draft');
  });

  await step('tickets.open-events', async () => {
    await openTicket(page, 'locked-account');
    await page.getByTestId('ticket-open-events').click();
    await expect(page.getByTestId('window-events')).toBeVisible();
    await expect(page.getByTestId('events-count')).toContainText('PAYROLL-04');
  });

  await step('events.window', async () => {
    await expect(
      page.getByTestId('events-table').locator('[data-event="4740"]'),
    ).toContainText('gpoole');
  });

  await step('events.select', async () => {
    await page.getByTestId('events-machine-gary').click();
    await expect(page.getByTestId('events-count')).toContainText('PAYROLL-04');
    await expect(
      page.getByTestId('events-table').locator('[data-event="4625"]'),
    ).toHaveAttribute('data-level', 'warning');
  });

  await step('events.filter', async () => {
    await page.getByTestId('events-filter').selectOption('error');
    await expect(
      page.getByTestId('events-table').locator('[data-event="4625"]'),
    ).toHaveCount(0);
    await page.getByTestId('events-filter').selectOption('all');
    await expect(
      page.getByTestId('events-table').locator('[data-event="4625"]'),
    ).toHaveCount(1);
  });

  await step('events.empty', async () => {
    await page.getByTestId('events-machine-beige-box').click();
    await expect(page.getByTestId('events-log-empty'))
      .toContainText('BEIGE-BOX has nothing to report');
  });

  /* -- the directory, and the first ticket to close ----------------------- */

  await step('directory.window', async () => {
    await openFromStartMenu(page, 'directory');
    await expect(page.getByTestId('directory-count')).toContainText('accounts');
  });

  await step('directory.search', async () => {
    await page.getByTestId('directory-search').fill('gpoole');
    await expect(page.getByTestId('directory-row-gary')).toBeVisible();
    await expect(page.getByTestId('directory-row-ada')).toHaveCount(0);
  });

  await step('directory.select', async () => {
    await page.getByTestId('directory-row-gary').click();
    await expect(page.getByTestId('directory-detail-status'))
      .toHaveText('Locked out');
    await expect(page.getByTestId('directory-detail-bad-passwords'))
      .toContainText('5 since it was last cleared');
    await expect(page.getByTestId('directory-detail-last-logon'))
      .toContainText('Not since before this log starts');
  });

  await step('directory.unlock-refused', async () => {
    const enable = page.getByTestId('directory-enable');
    await expect(enable).toBeDisabled();
    await expect(enable).toHaveAttribute('title', /is not disabled/);
  });

  await step('directory.unlock', async () => {
    await page.getByTestId('directory-unlock').click();
    await expect(page.getByTestId('directory-outcome')).toContainText('Unlocked');
    await expect(page.getByTestId('directory-detail-status')).toHaveText('Fine');
    await expect(resolvedFor(page, /password is wrong/)).toHaveCount(1);
  });

  await step('directory.reset-password', async () => {
    await page.getByTestId('directory-reset-password').click();
    await expect(page.getByTestId('directory-outcome'))
      .toContainText('Temporary password issued');
    await expect(page.getByTestId('directory-detail-must-change'))
      .toContainText('at next logon');
  });

  await step('directory.add-group', async () => {
    // Gary is already in print-users and vpn-users, and the button says so
    // rather than pretending a second membership means anything. Give him
    // the one he does not have.
    await page.getByTestId('directory-group-picker')
      .selectOption('group:sales-send-as');
    await page.getByTestId('directory-add-group').click();
    await expect(page.getByTestId('directory-outcome'))
      .toContainText('membership added');
  });

  await step('directory.remove-group', async () => {
    await page.getByTestId('directory-remove-group').click();
    await expect(page.getByTestId('directory-outcome'))
      .toContainText('membership removed');
  });

  await step('directory.empty', async () => {
    await page.getByTestId('directory-search').fill('zzzz');
    await expect(page.getByTestId('directory-empty')).toBeVisible();
    await expect(page.getByTestId('directory-detail-empty')).toBeVisible();
    await expect(page.getByTestId('directory-unlock')).toHaveCount(0);
    await page.getByTestId('directory-search').fill('');
  });

  /* -- Ada, who has not been hacked --------------------------------------- */

  await step('chat.select', async () => {
    await focusWindow(page, 'chat');
    await page.getByTestId('chat-person-ada').click();
    await expect(page.getByTestId('chat-heading')).toHaveText('Ada Whitlock');
    await expect(page.getByTestId('chat-person-ada'))
      .toContainText('Open ticket');
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('I have been hacked');
  });

  await step('chat.option-plain', async () => {
    await chatOption(page, /doing when she left on Friday/);
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('I locked it, I went home');
    // Every question put to a reporter is a question ON THE RECORD since M4 -
    // it reaches the world through `asks`, so it reports like any other act.
    // What must not appear is a refusal.
    await expect(page.getByTestId('chat-refusal')).toBeHidden();
  });

  await step('chat.option-reveal', async () => {
    await chatOption(page, /anybody else was at her desk/);
    await expect(page.getByTestId('chat-outcome'))
      .toContainText('Filed as a work note');
    await openTicket(page, 'rotated-screen');
    await expect(page.getByTestId('ticket-worknotes'))
      .toContainText('showing her something');
  });

  await step('tickets.open-remote', async () => {
    // Her screen really is sideways, in front of the player, before anybody
    // has worked out that nobody hacked anything.
    await page.getByTestId('ticket-open-remote').click();
    await expect(page.getByTestId('window-remote')).toBeVisible();
    await expect(page.getByTestId('remote-hostname')).toHaveText('SALES-02');
    await expect(page.getByTestId('remote-owner')).toContainText('Ada');
    await expect(page.getByTestId('remote-viewport'))
      .toHaveAttribute('data-rotation', '90');
    await expect(page.getByTestId('remote-viewport'))
      .toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
  });

  await step('chat.option-refused', async () => {
    await focusWindow(page, 'chat');
    await chatOption(page, /Go back to the top/);
    await chatOption(page, /anybody else was at her desk/);
    await expect(page.getByTestId('chat-refusal'))
      .toContainText('already put that to them');
  });

  await step('chat.option-dispatch', async () => {
    await chatOption(page, /which keys Gareth pressed/);
    await chatOption(page, /Control, Alt and Up right now/);
    await expect(page.getByTestId('chat-outcome'))
      .toContainText('Done, from here');
    await expect(resolvedFor(page, /hacked/)).toHaveCount(1);
  });

  await step('chat.reaction', async () => {
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('They message you again.');
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('It is the right way up');
    await expect(page.getByTestId('chat-person-ada'))
      .not.toContainText('Open ticket');
  });

  await step('chat.restart', async () => {
    await chatOption(page, /rotation shortcut/);
    await chatOption(page, /shows Gareth the same shortcut/);
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('The conversation ends.');
    await page.getByTestId('chat-restart').click();
    await expect(
      page.getByTestId('chat-options').getByRole('button', {
        name: /rotation shortcut/,
      }),
    ).toBeVisible();
  });

  await step('chat.open-tickets', async () => {
    await page.getByTestId('chat-open-tickets').click();
    await expect(page.getByTestId('window-tickets'))
      .toHaveAttribute('data-focused', 'true');
  });

  /* -- the rooms the company rolled out ------------------------------------
   *
   * Monday posts three messages: the welcome in #announcements at 09:05, the
   * @-mention about the locked account in #helpdesk at 09:40, and the reply
   * threaded under it at 09:48. Past 09:50 all three have arrived, so the
   * badges are deterministic: the window opens on #announcements (first room,
   * read the minute it is painted), and #helpdesk is sitting on 2 unread with
   * the @ flying.
   */

  await workUntilMinute(page, 110);

  await step('hubbub.window', async () => {
    await openFromStartMenu(page, 'hubbub');
    await expect(page.getByTestId('hubbub-summary')).toContainText('rooms');
    // The first room is on screen, which is what reads it: its own badge is
    // gone and the welcome nobody asked for is visible.
    await expect(page.getByTestId('hubbub-message-welcome'))
      .toContainText('Welcome to Hubbub');
    await expect(page.getByTestId('hubbub-badge-announcements')).toBeHidden();
  });

  await step('hubbub.mention', async () => {
    // The @ is on the room before the room is opened: two unread, flagged.
    await expect(page.getByTestId('hubbub-badge-helpdesk')).toHaveText('2 @');
    await expect(page.getByTestId('hubbub-channel-helpdesk'))
      .toHaveAttribute('data-mention', 'true');
  });

  await step('hubbub.rooms', async () => {
    await page.getByTestId('hubbub-channel-helpdesk').click();

    // The goal, not the call: the message is READABLE - body, author's @, the
    // reply threaded one level under its root - and having been on screen is
    // what clears the badge and spends the @.
    await expect(page.getByTestId('hubbub-message-gary-account'))
      .toContainText('any movement on my account');
    await expect(page.getByTestId('hubbub-mention-gary-account'))
      .toHaveText('mentions you');
    await expect(
      page.getByTestId('hubbub-thread-gary-account')
        .getByTestId('hubbub-message-owen-reply'),
    ).toContainText('never the ticket system');
    await expect(page.getByTestId('hubbub-badge-helpdesk')).toBeHidden();
    await expect(page.getByTestId('hubbub-channel-helpdesk'))
      .toHaveAttribute('data-mention', 'false');

    // And the room shipped empty is honest about it.
    await page.getByTestId('hubbub-channel-water-cooler').click();
    await expect(page.getByTestId('hubbub-empty')).toBeVisible();
    await page.getByTestId('hubbub-channel-helpdesk').click();
  });

  await step('hubbub.presence', async () => {
    // One dot, everyone reads it: the walk left the tray on Available, and
    // the room says the same word off the same field.
    await expect(page.getByTestId('hubbub-presence'))
      .toHaveAttribute('data-presence', 'available');
    await expect(page.getByTestId('hubbub-presence')).toContainText('Available');
  });

  await step('hubbub.open-ticket', async () => {
    await page.getByTestId('hubbub-open-ticket-gary-account').click();
    await expect(page.getByTestId('window-tickets'))
      .toHaveAttribute('data-focused', 'true');
    await page.getByTestId('close-hubbub').click();
    await expect(page.getByTestId('window-hubbub')).toHaveCount(0);
  });

  /* -- the ticket that drips in, and the form second line will not keep ---- */

  await workUntilMinute(page, 155);

  await step('tickets.escalate-form', async () => {
    await openTicket(page, 'fan-noise');
    await expect(page.getByTestId('ticket-detail-raised')).toContainText(':');
    await page.getByTestId('ticket-escalate').click();
    await expect(page.getByTestId('ticket-handoff')).toBeVisible();
    await expect(page.getByTestId('handoff-tried-empty')).toBeVisible();
    await expect(page.getByTestId('handoff-warning'))
      .toContainText('what the user reported');
  });

  await step('tickets.handoff-cancel', async () => {
    await page.getByTestId('handoff-cancel').click();
    await expect(page.getByTestId('ticket-handoff')).toHaveCount(0);
  });

  await step('tickets.handoff-thin', async () => {
    await page.getByTestId('ticket-escalate').click();
    await page.getByTestId('handoff-send').click();

    // Taken, not refused - which is the whole of this mechanic: a thin handoff
    // is SENT and comes back, rather than being argued with at the desk. The
    // refusal line is read as TEXT rather than asserted hidden, so a form the
    // world does turn down says why in the failure instead of just failing.
    await expect(page.getByTestId('ticket-refusal')).toHaveText('');
    await expect(page.getByTestId('ticket-handoff')).toHaveCount(0);
    // It did not stick: the ticket is still open and still yours.
    await expect(page.getByTestId('ticket-row-fan-noise'))
      .toHaveAttribute('data-state', 'open');
  });

  /*
   * Ten to eleven, INSIDE the twenty-five minutes second line take to hand
   * that form back.
   *
   * The ordering is forced and it is worth saying why rather than leaving it
   * to look arbitrary. The bounce is a fixed wait FROM THE SEND, so those
   * twenty-five minutes are going to be spent here whatever else happens; the
   * greeting is a five-minute window on a fixed minute of the morning, and it
   * falls inside them. Spending the twenty-five first and visiting the chat
   * afterwards - which is what this walk used to do - arrives at eleven, ten
   * minutes after he finished typing, and asks a window that is honestly
   * showing nothing. The clock spends the same twenty-five minutes either way;
   * only the minute the walk looks up differs.
   *
   * The beat is WAITED OUT here rather than answered, which is the expensive
   * half of it: the question arrives when he has finished typing it, five
   * minutes of a shift later. The journey that asks instead is in
   * `colleagues.spec.ts`.
   */
  await workUntilMinute(page, 171);

  await step('chat.typing', async () => {
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-owen').click();

    const typing = page.getByTestId('chat-typing');
    await expect(typing).toHaveAttribute('data-typing', 'true');
    // Nothing but a greeting so far, which is the whole complaint.
    await expect(page.getByTestId('chat-transcript')).toContainText('Hi.');

    // And the cost, said before anybody pays it.
    const left = await underPause(
      page,
      async () => typing.getAttribute('data-left'),
    );
    expect(Number(left ?? '0')).toBeGreaterThan(0);
  });

  await workUntilMinute(page, 180);

  // He got there. The indicator is gone, because a typing indicator over a
  // question that has arrived is a screen arguing with itself.
  await expect(page.getByTestId('chat-typing'))
    .toHaveAttribute('data-typing', 'false');
  await expect(page.getByTestId('chat-transcript')).toContainText('despatch');

  // And second line get round to the form, in the same twenty-five minutes:
  // it lands back on the desk with a note, a mail and a bill.
  await expectNoticed(page, 'Returned by second line');
  await openTicket(page, 'fan-noise');
  await expect(page.getByTestId('ticket-worknotes'))
    .toContainText('Returned by second line');

  await step('mail.bounce', async () => {
    await openFromStartMenu(page, 'mail');
    await page.getByTestId('mail-row-handoff-bounce').click();
    await expect(page.getByTestId('mail-reader')).toContainText('what is this');
  });

  await step('remote.window', async () => {
    await openFromStartMenu(page, 'remote');
    await expect(page.getByTestId('remote-summary'))
      .toContainText('machines');
  });

  await step('remote.select', async () => {
    await page.getByTestId('remote-machine-beige-box').click();
    await expect(page.getByTestId('remote-hostname')).toHaveText('BEIGE-BOX');
  });

  await step('remote.reboot', async () => {
    await page.getByTestId('remote-reboot').click();
    await expect(page.getByTestId('remote-outcome')).toContainText('Rebooted');
  });

  await step('tickets.handoff-complete', async () => {
    await openTicket(page, 'fan-noise');
    await page.getByTestId('ticket-escalate').click();
    await expect(page.getByTestId('handoff-tried')).toContainText('Rebooted it');
    await page
      .getByTestId('handoff-reported')
      .fill('It sounds like a hornet in a biscuit tin.');
    await expect(page.getByTestId('handoff-warning')).toBeHidden();
    await page.getByTestId('handoff-send').click();
    await expect(page.getByTestId('ticket-row-fan-noise'))
      .toHaveAttribute('data-state', 'resolved');

    // And the other refusal on the same button, now that there is a closed
    // ticket to try it on: escalating one would only confuse the van.
    await openTicket(page, 'fan-noise');
    const escalate = page.getByTestId('ticket-escalate');
    await expect(escalate).toBeDisabled();
    await expect(escalate).toHaveAttribute('title', /closed/);
  });

  /* -- the toys, and the windows they come in ------------------------------ */

  await step('about.diagnostics', async () => {
    await openFromStartMenu(page, 'about');
    await page.getByTestId('about-run-diagnostics').click();
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Diagnostics complete' }),
    ).toHaveCount(1);
    await expect(page.getByTestId('about-value-last-diagnostic'))
      .toHaveText(/^\d{2}:\d{2}$/);
  });

  await step('notifications.toast', async () => {
    await expect(page.getByTestId('toast').first()).toBeVisible();
    await expect(page.getByTestId('notification-badge'))
      .not.toHaveAttribute('data-unread', '0');
  });

  await step('notifications.dismiss', async () => {
    const before = await page.getByTestId('toast').count();
    await page.getByTestId('toast-dismiss').first().click();
    await expect(page.getByTestId('toast')).toHaveCount(before - 1);
  });

  await step('notifications.tray', async () => {
    await page.getByTestId('notification-tray').click();
    await expect(page.getByTestId('notification-panel')).toBeVisible();
    await expect(page.getByTestId('notification-panel-item').first())
      .toBeVisible();
    await expect(page.getByTestId('notification-badge'))
      .toHaveAttribute('data-unread', '0');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('notification-panel')).toBeHidden();
  });

  await step('about.refresh', async () => {
    await focusWindow(page, 'about');
    await page.getByTestId('about-refresh').click();
    // Read off the world again: the diagnostic stamp the button above wrote
    // is a minute on this clock, and the dialog is showing it.
    await expect(page.getByTestId('about-value-last-diagnostic'))
      .toHaveText(/^\d{2}:\d{2}$/);
  });

  await step('about.reseat-fan', async () => {
    // The field team took the ticket; the fan is still a hornet in a tin, so
    // the percussion still works - and then honestly refuses.
    await page.getByTestId('about-reseat-fan').click();
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Fan reseated' }),
    ).toHaveCount(1);
    await expect(page.getByTestId('about-value-chassis-fan'))
      .toHaveText('running');
    await page.getByTestId('about-reseat-fan').click();
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Maintenance refused' }),
    ).toHaveCount(1);
  });

  await step('about.open-bubbles', async () => {
    await page.getByTestId('about-open-bubbles').click();
    await expect(page.getByTestId('window-bubbles')).toHaveCount(1);
  });

  await step('bubbles.window', async () => {
    await expect(page.getByTestId('bubbles-score')).toContainText('Caught 00');
  });

  await step('bubbles.catch', async () => {
    for (let caught = 0; caught < 5; caught += 1) {
      await page.getByTestId('bubble-target').click();
    }

    await expect(page.getByTestId('bubbles-score')).toContainText('05');
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Bubble Break milestone' }),
    ).toHaveCount(1);
  });

  await step('bubbles.reset', async () => {
    await page.getByTestId('bubbles-reset').click();
    await expect(page.getByTestId('bubbles-score')).toContainText('00');
  });

  await step('bubbles.initials', async () => {
    await page.getByTestId('bubbles-initials').fill('pat');
    await expect(page.getByTestId('bubbles-initials')).toHaveValue('PAT');
    await expect(page.getByTestId('bubbles-message'))
      .toContainText('hall of fame');
  });

  await step('monitor.window', async () => {
    // The RMM board is a base tool, so it opens on the probation desk - where
    // there is no monitoring-only customer, and it says so rather than drawing a
    // board with nothing on it. The lit board, its rows, its noise and the
    // escalate that resolves an alert ticket are the MSP's, driven through the
    // real dispatch path in monitor.test.ts because the browser walk stops at
    // the second employer and the board's customers live at the third.
    await openFromStartMenu(page, 'monitor');
    await expect(page.getByTestId('window-monitor')).toBeVisible();
    await expect(page.getByTestId('monitor-empty'))
      .toContainText('No monitoring contracts on this desk');
    await page.getByTestId('close-monitor').click();
    await expect(page.getByTestId('window-monitor')).toHaveCount(0);
  });

  await step('browser.window', async () => {
    await openFromStartMenu(page, 'browser');
    await expect(page.getByTestId('browser-address'))
      .toHaveText('about:bookmarks');
  });

  await step('browser.forum', async () => {
    await page.getByTestId('browser-site-forum').click();
    await expect(page.getByTestId('browser-thread')).toContainText(/mower wont/i);
  });

  await step('browser.gallery', async () => {
    await page.getByTestId('browser-site-cats').click();
    await expect(page.getByTestId('browser-grid').getByRole('listitem'))
      .toHaveCount(6);
    await expect(page.getByTestId('browser-hits')).toContainText('visitor');
  });

  await step('browser.nohello', async () => {
    // The page the veteran links, bookmarked on this workstation by somebody
    // who has read it and still opens with "Hi." - which is the joke and is
    // also, this week, a thing the player is about to be on the end of.
    await page.getByTestId('browser-site-nohello').click();
    // The site owner's whole argument, in the post rather than in the
    // shouted heading: `browser-thread` is the POSTS, and a test that read
    // the banner would be reading a different element.
    await expect(page.getByTestId('browser-thread'))
      .toContainText(/hello AND the question, in the same message/i);
  });

  await step('browser.bookmarks', async () => {
    await page.getByTestId('browser-home-button').click();
    await expect(page.getByTestId('browser-home')).toBeVisible();
  });

  await step('display.window', async () => {
    await openFromStartMenu(page, 'display');
    await expect(page.getByTestId('window-display')).toBeVisible();
    // The box as issued: the Windows caricature, on no distribution at all,
    // and the window says so before anybody presses anything.
    await expect(page.getByTestId('display-current')).toContainText('as issued');
    await expect(page.getByTestId('display-package-manager'))
      .toContainText('None');
    await expect(page.getByTestId('display-desktop-deskpro'))
      .toHaveAttribute('data-active', 'true');
  });

  await step('display.refused', async () => {
    // The gate, from the desk's side. The refusal is SAID - beside the button,
    // in the shell's own sentence - and the chrome does not move: the panel is
    // still at the bottom with a Start button on it, and the titlebar in front
    // still has all three of its buttons.
    await page.getByTestId('display-desktop-gnome').click();
    await expect(page.getByTestId('display-refusal'))
      .toContainText('promotion');
    await expect(page.getByTestId('desktop')).toHaveAttribute('data-skin', 'deskpro');
    await expect(page.getByTestId('desktop')).toHaveAttribute('data-panel', 'bottom');
    await expect(page.getByTestId('start-button')).toContainText('Start');
    await expect(page.getByTestId('minimize-display')).toHaveCount(1);
    await expect(page.getByTestId('display-desktop-deskpro'))
      .toHaveAttribute('data-active', 'true');
    await page.getByTestId('close-display').click();
    await expect(page.getByTestId('window-display')).toHaveCount(0);
  });

  await step('updates.window', async () => {
    await openFromStartMenu(page, 'updates');
    await expect(page.getByTestId('updates-installed'))
      .toContainText('has been installed');
    // The window shows THIS build's note, at the top, flagged as the one that
    // was installed, with lines under it. It used to assert the first four
    // words of the newest release note, which meant every release either
    // opened with the same sentence or broke this walk - and 0.2.4 broke it.
    const version = await installedVersion(page);

    await expect(page.getByTestId(`updates-entry-${version}`))
      .toHaveAttribute('data-installed', 'true');
    await expect(page.getByTestId(`updates-version-${version}`))
      .toHaveText(`Update ${version}`);
    await expect(page.getByTestId('updates-line').first()).not.toBeEmpty();
  });

  await step('updates.report', async () => {
    await page.getByTestId('updates-report').click();
    await expect(page.getByTestId('window-feedback')).toBeVisible();
  });

  await step('feedback.window', async () => {
    await expect(page.getByTestId('feedback-app'))
      .toContainText('Report a real problem');
  });

  await step('feedback.context', async () => {
    // Everything the report would carry besides the words, before anything is
    // sent, plus the line about not typing anything personal into it.
    await expect(page.getByTestId('feedback-context'))
      .toContainText('Window in front');
    await expect(page.getByTestId('feedback-notice'))
      .toContainText('do not put anything personal');
    await expect(page.getByTestId('feedback-contact')).not.toBeChecked();
  });

  await step('feedback.empty-refusal', async () => {
    await page.getByTestId('feedback-details').fill('Something went wrong.');
    await page.getByTestId('feedback-send').click();
    await expect(page.getByTestId('feedback-refusal'))
      .toContainText('needs a line saying what happened');
    await page.getByTestId('close-feedback').click();
    await page.getByTestId('close-updates').click();
  });

  await step('taskbar.button', async () => {
    const about = page.getByTestId('window-about');
    await page.getByTestId('taskbar-button-about').click();
    await expect(about).toHaveAttribute('data-focused', 'true');
    await page.getByTestId('taskbar-button-about').click();
    await expect(about).toBeHidden();
    await page.getByTestId('taskbar-button-about').click();
    await expect(about).toBeVisible();
  });

  await step('windows.drag', async () => {
    const about = page.getByTestId('window-about');
    const before = await boxOf(about);
    await dragBy(page, page.getByTestId('titlebar-about'), 90, 50);
    const after = await boxOf(about);
    expect(after.x - before.x).toBeGreaterThan(60);
    expect(after.y - before.y).toBeGreaterThan(30);
  });

  await step('windows.maximize', async () => {
    const about = page.getByTestId('window-about');
    await page.getByTestId('titlebar-about').dblclick({
      position: { x: 40, y: 10 },
    });
    await expect(about).toHaveAttribute('data-maximized', 'true');
    await page.getByTestId('titlebar-about').dblclick({
      position: { x: 40, y: 10 },
    });
    await expect(about).toHaveAttribute('data-maximized', 'false');
  });

  await step('windows.resize', async () => {
    const about = page.getByTestId('window-about');
    const before = await boxOf(about);
    await dragBy(page, page.getByTestId('resize-about-se'), -110, -50);
    const after = await boxOf(about);
    expect(after.width).toBeLessThan(before.width - 70);
    expect(after.height).toBeLessThan(before.height - 25);
  });

  await step('windows.minimize', async () => {
    await page.getByTestId('minimize-about').click();
    await expect(page.getByTestId('window-about')).toBeHidden();
    await expect(page.getByTestId('taskbar-button-about'))
      .toHaveAttribute('data-minimized', 'true');
    await page.getByTestId('taskbar-button-about').click();
    await expect(page.getByTestId('window-about')).toBeVisible();
  });

  await step('windows.cascade', async () => {
    // A crowded desktop: every window the cascade has placed has to be ON the
    // screen. One off the bottom edge is a window nobody can drag back.
    const windows = page.locator('.os-window');
    expect(await windows.count()).toBeGreaterThanOrEqual(9);
    const surface = await boxOf(page.getByTestId('desktop-surface'));

    for (const handle of await windows.all()) {
      if (await handle.isHidden()) {
        continue;
      }

      const box = await boxOf(handle);
      expect(box.x).toBeGreaterThanOrEqual(surface.x - 1);
      expect(box.y).toBeGreaterThanOrEqual(surface.y - 1);
      expect(box.x).toBeLessThan(surface.x + surface.width);
      expect(box.y).toBeLessThan(surface.y + surface.height);
    }
  });

  /* -- the corridor -------------------------------------------------------- */

  await step('desktop.telegraph', async () => {
    await focusWindow(page, 'browser');
    await runToTelegraph(page);
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-boss', 'telegraph');
    await expect(page.getByTestId('boss-chip')).toContainText('Footsteps');
    await expect(page.getByTestId('door-flash')).toBeVisible();
  });

  await step('desktop.boss-panic', async () => {
    // The on-screen twin of the panic key, for a player with no keyboard: the
    // same jab, the same result. It minimises the same slack windows Backquote
    // does, because it fires the same panic().
    await page.getByTestId('boss-panic').click();
    await expect(page.getByTestId('window-browser')).toBeHidden();
    await expect(page.getByTestId('window-bubbles')).toBeHidden();
    await expect(page.getByTestId('taskbar-button-bubbles'))
      .toHaveAttribute('data-minimized', 'true');
    // Put them back, so the key's own step below has the same two windows to
    // hide - the two controls are proven to reach the identical outcome.
    await page.getByTestId('taskbar-button-browser').click();
    await page.getByTestId('taskbar-button-bubbles').click();
    await expect(page.getByTestId('window-browser')).toBeVisible();
    await expect(page.getByTestId('window-bubbles')).toBeVisible();
  });

  await step('desktop.boss-key', async () => {
    await page.keyboard.press('Backquote');
    await expect(page.getByTestId('window-browser')).toBeHidden();
    await expect(page.getByTestId('window-bubbles')).toBeHidden();
    await runSimMinutes(page, 8);
    await expect(page.getByTestId('window-caught')).toHaveCount(0);
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-boss', 'clear');
  });

  /* -- the day's own screens, opened cold ---------------------------------- */

  await step('caught.window', async () => {
    await openFromStartMenu(page, 'caught');
    await expect(page.getByTestId('caught-app'))
      .toHaveAttribute('data-app', 'none');
  });

  await step('caught.scene-none', async () => {
    await expect(page.getByTestId('caught-heading'))
      .toHaveText('Nothing to report');
    // Since the conduct slice the price is minutes and a line, not points -
    // the scene opened cold says what a conversation would cost.
    await expect(page.getByTestId('caught-note'))
      .toContainText('costs a point');
  });

  await step('desktop.escape-scene', async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('window-caught')).toHaveCount(0);
  });

  await step('review.window', async () => {
    await openFromStartMenu(page, 'review');
    await expect(page.getByTestId('review-stamp')).toContainText('three');
  });

  await step('review.pending', async () => {
    await expect(page.getByTestId('review-app'))
      .toHaveAttribute('data-outcome', 'pending');
    await expect(page.getByTestId('review-heading'))
      .toHaveText('Nothing has been decided');
    await page.getByTestId('review-dismiss').click();
    await expect(page.getByTestId('window-review')).toHaveCount(0);
  });

  await step('beer.window', async () => {
    await openFromStartMenu(page, 'beer');
    await expect(page.getByTestId('beer-heading')).toContainText('fridge');
  });

  await step('beer.locked-refusal', async () => {
    const open = page.getByTestId('beer-open');
    await expect(open).toBeDisabled();
    await expect(open).toHaveAttribute('title', /probation/);
    await page.getByTestId('close-beer').click();
    await expect(page.getByTestId('window-beer')).toHaveCount(0);
  });

  await step('weekend.window', async () => {
    await openFromStartMenu(page, 'weekend');
    await expect(page.getByTestId('weekend-app'))
      .toHaveAttribute('data-ended', 'false');
    await expect(page.getByTestId('weekend-verdict-title'))
      .toHaveText('The week is not over');
    await page.getByTestId('close-weekend').click();
  });

  /* -- and the corridor again, walked into on purpose ---------------------- */

  await step('caught.scene-browser', async () => {
    await page.getByTestId('taskbar-button-browser').click();
    await expect(page.getByTestId('window-browser')).toBeVisible();
    await runToTelegraph(page);
    await runUntilCaught(page);
    await expect(page.getByTestId('caught-app'))
      .toHaveAttribute('data-app', 'browser');
    await expect(page.getByTestId('caught-line')).toContainText('forum');
  });

  /**
   * The half of that window that outlives the conversation. It costs no
   * points, it is dated, and it is readable from the minute it is written -
   * which is the whole legibility contract, on the built artifact.
   */
  await step('caught.file', async () => {
    const file = page.getByTestId('caught-file');
    await expect(file).toBeVisible();
    // At least the conversation that just happened, and said in the voice a
    // personnel note is written in rather than the voice he used.
    await expect(page.getByTestId('caught-file-line-0'))
      .toContainText('Screen observed to be non-work-related');
    await expect(page.getByTestId('caught-file-line-0'))
      .toContainText('discussion forum');
    await expect(file).not.toHaveAttribute('data-lines', '0');
  });

  /**
   * And WHO would read it, said before anybody does. The three reasons are on
   * the screen with the live ones marked and the mark Friday now has to reach
   * printed underneath, so nothing at three o'clock can arrive unannounced.
   */
  await step('caught.criteria', async () => {
    const criteria = page.getByTestId('caught-criteria');
    await expect(criteria).toBeVisible();
    await expect(page.getByTestId('caught-criteria-customer')).toBeVisible();
    await expect(page.getByTestId('caught-criteria-colleague')).toBeVisible();
    await expect(page.getByTestId('caught-criteria-lead')).toBeVisible();
    await expect(page.getByTestId('caught-criteria-summary'))
      .toContainText('file');
    // The bar is a number on the screen, days before it decides anything.
    await expect(criteria).toHaveAttribute('data-bar', /^\d+$/);
  });

  await step('caught.dismiss', async () => {
    await page.getByTestId('caught-dismiss').click();
    await expect(page.getByTestId('window-caught')).toHaveCount(0);
    // And back out of sight, before he comes round again.
    await page.keyboard.press('Backquote');
    await expect(page.getByTestId('window-browser')).toBeHidden();
  });

  /* -- the lead's other habit, and the ticket he makes of it --------------- */

  await step('chat.boss-ping', async () => {
    await expectNoticed(page, 'Message from the lead');
    await focusWindow(page, 'chat');
    await page.getByTestId('chat-person-desmond').click();
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('stopped getting email');
    await openTicket(page, 'boss-phone');
    await expect(page.getByTestId('ticket-claimed-urgency'))
      .toContainText('high urgency');
  });

  await step('scorecard.triage-report', async () => {
    // File it the way the man who raised it would like it filed. The estate
    // says one desk, and the scorecard will say so at five.
    await page.getByTestId('triage-impact').selectOption('3');
    await page.getByTestId('triage-urgency').selectOption('3');
    await page.getByTestId('triage-file').click();
    await expect(page.getByTestId('ticket-detail-priority')).toHaveText('P1');
  });

  await addToGroup(page, 'desmond', 'group:vpn-users');
  await expectClosed(page, 'boss-phone');

  /* -- the desk, and what it costs ----------------------------------------- */

  await step('desk.drink', async () => {
    await page.getByTestId('desk-drink').click();
    await expect(page.getByTestId('desk-drink-label')).toHaveText('Wired');
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-drink', 'buff');
  });

  await step('desk.empties', async () => {
    await expect(page.getByTestId('desk-empties')).toBeVisible();
    await expect(page.getByTestId('desk-overlay'))
      .toHaveAttribute('data-cans', '1');
  });

  await step('desk.tolerance', async () => {
    await expect(page.getByTestId('desk-drink'))
      .toHaveAttribute('title', /Number 2 of this run/);
    await page.getByTestId('desk-drink').click();
    await expect(page.getByTestId('desk-overlay'))
      .toHaveAttribute('data-cans', '2');
  });

  await step('desk.crash', async () => {
    await runUntilCrash(page);
    await expect(page.getByTestId('desk-drink-label'))
      .toHaveText('Coming down');
    await expectNoticed(page, 'That is the can, then');
  });

  await step('desk.tidy', async () => {
    await page.getByTestId('desk-tidy').click();
    await expectNoticed(page, 'Desk tidied');
    await expect(page.getByTestId('desk-empties')).toBeHidden();
    await expect(page.getByTestId('desk-tidy')).toBeHidden();
  });

  /* -- the mouse that was never frozen, and the rest of Remote Assist ------ */

  await workUntilMinute(page, 370);

  await step('remote.replace-battery', async () => {
    await openFromStartMenu(page, 'remote');
    await page.getByTestId('remote-machine-ada').click();
    await expect(page.getByTestId('remote-battery-ada-mouse'))
      .toContainText('Battery 0%');
    await page.getByTestId('remote-replace-battery-ada-mouse').click();
    await expect(resolvedFor(page, /frozen completely/)).toHaveCount(1);
    await expectClosed(page, 'flat-mouse');
  });

  await step('remote.battery-refused', async () => {
    await focusWindow(page, 'remote');
    const replace = page.getByTestId('remote-replace-battery-ada-mouse');
    await expect(replace).toBeDisabled();
    await expect(replace).toHaveAttribute('title', /fresh/);
  });

  await step('remote.screen', async () => {
    await page.getByTestId('remote-machine-print').click();
    await expect(page.getByTestId('remote-hostname')).toHaveText('PRINT-01');
    await expect(page.getByTestId('remote-viewport'))
      .toHaveAttribute('data-rotation', '0');
    await expect(page.getByTestId('remote-viewport'))
      .toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  });

  await step('remote.rotate', async () => {
    await page.getByTestId('remote-rotation-picker').selectOption('180');
    await page.getByTestId('remote-apply-rotation').click();
    await expect(page.getByTestId('remote-viewport'))
      .toHaveAttribute('data-rotation', '180');
    await expect(page.getByTestId('remote-viewport'))
      .toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
    await expect(page.getByTestId('remote-rotation-state'))
      .toHaveText('180 degrees');
  });

  await step('remote.rotate-refused', async () => {
    await page.getByTestId('remote-rotation-picker').selectOption('180');
    const apply = page.getByTestId('remote-apply-rotation');
    await expect(apply).toBeDisabled();
    await expect(apply).toHaveAttribute('title', /already at 180 degrees/);
  });

  await step('remote.restart-refused', async () => {
    const vpn = page.getByTestId('remote-restart-vpn');
    await expect(vpn).toBeDisabled();
    await expect(vpn).toHaveAttribute('title', /running/);

    // The other four true reasons, on the same box: a service the manager
    // will not take a stop control for, one that is Disabled, the fan, and
    // the licence pool - each refused in words about what it actually is.
    const rpc = page.getByTestId('remote-restart-print/rpcss');
    await expect(rpc).toBeDisabled();
    await expect(rpc).toHaveAttribute('title', /will not take a stop control/);
    const registry = page.getByTestId('remote-restart-print/remoteregistry');
    await expect(registry).toBeDisabled();
    await expect(registry).toHaveAttribute('title', /set to Disabled/);
  });

  await step('remote.services', async () => {
    await expect(page.getByTestId('remote-services-count'))
      .toContainText('registered');
    // Twenty-odd rows with a startup type on each: the column that says
    // whether a stopped service is a fault or a Tuesday.
    await expect(page.getByTestId('remote-services').locator('tbody tr'))
      .toHaveCount(24);
    await expect(page.getByTestId('remote-service-print/bits'))
      .toContainText('Manual');
  });

  await step('remote.programs', async () => {
    // The player's own box, and the boss's-eye view of it: what is open is
    // in that taskbar, whether or not it is minimised.
    await page.getByTestId('remote-machine-beige-box').click();
    await expect(page.getByTestId('remote-program-remote'))
      .toContainText('Remote Assist');
    // And on this box, the thing that reports a status and is not a service
    // sits under the table with the reason rather than in it.
    await expect(page.getByTestId('remote-not-services'))
      .toContainText('Also reporting a status');
    await expect(page.getByTestId('remote-service-chassis-fan'))
      .toContainText('Chassis fan');
    // Somebody else's screen does not invent windows it cannot see.
    await page.getByTestId('remote-machine-print').click();
    await expect(page.getByTestId('remote-program-remote')).toHaveCount(0);
    await expect(page.getByTestId('remote-taskbar'))
      .toContainText('cannot see what they have open');
  });

  await step('remote.clear-queue-refused', async () => {
    const clear = page.getByTestId('remote-clear-printer');
    await expect(clear).toBeDisabled();
    await expect(clear).toHaveAttribute('title', /already empty/);
  });

  await step('remote.power-refused', async () => {
    const power = page.getByTestId('remote-power-printer');
    await expect(power).toBeDisabled();
    await expect(power).toHaveAttribute('title', /superstition/);
  });

  await step('remote.tray-clock', async () => {
    const tray = page.getByTestId('remote-tray');
    const before = await tray.textContent();
    await runSimMinutes(page, 10);
    await expect(tray).not.toHaveText(before ?? '');
  });

  /* -- the terminal, which is the other skin over the same verbs ----------- */

  await step('cmd.window', async () => {
    await openFromStartMenu(page, 'cmd');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('WORKGRUMBLE Support Terminal');
  });

  await step('cmd.help', async () => {
    await runCommand(page, 'help');
    await expect(page.getByTestId('cmd-output')).toContainText('clearqueue');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Everything here does exactly what the buttons do');
  });

  await step('cmd.ver', async () => {
    await runCommand(page, 'ver');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Support contract expired before you were hired');
  });

  await step('cmd.changereq', async () => {
    // A base command, so it answers on the probation desk: nothing is filed,
    // and in-house work needs no request. The MSP loop - file, approve, act in
    // a window, and the scope consult that lets an approved action through - is
    // driven through the real terminal in change-request.test.ts.
    await runCommand(page, 'changereq list');
    await expect(page.getByTestId('cmd-output')).toContainText(/change request/i);
    await runCommand(page, 'changereq file BEIGE-BOX\\Spooler');
    await expect(page.getByTestId('cmd-output'))
      .toContainText(/change request|in-house|no /i);
  });

  await step('cmd.notify', async () => {
    // A base command, so it answers on the probation desk: an in-house box has
    // no customer IT to notify. The co-managed loop - a unilateral action
    // caught, the notify clearing it, and the fail-closed teeth - is driven
    // through the real terminal in msp-scope.test.ts.
    await runCommand(page, 'notify BEIGE-BOX\\Spooler');
    await expect(page.getByTestId('cmd-output'))
      .toContainText(/coordination|in-house|co-managed|notif/i);
  });

  await step('cmd.ping', async () => {
    await runCommand(page, 'ping SALES-02');
    await expect(page.getByTestId('cmd-output')).toContainText('Reply from');
    await runCommand(page, 'ping wibble');
    await expect(page.getByTestId('cmd-output')).toContainText('Unknown host');
  });

  await step('cmd.ipconfig', async () => {
    await runCommand(page, 'ipconfig');
    await expect(page.getByTestId('cmd-output')).toContainText('IPv4 Address');
    await runCommand(page, 'ipconfig /all');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Physical Address');
    await runCommand(page, 'ipconfig /flushdns');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Successfully flushed the DNS Resolver Cache');
    await runCommand(page, 'ipconfig /renew');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is not a switch this ipconfig has');
  });

  await step('cmd.whoami', async () => {
    await runCommand(page, 'whoami');
    await expect(page.getByTestId('cmd-output')).toContainText('ppending');
    await runCommand(page, 'whoami /groups');
    await expect(page.getByTestId('cmd-output')).toContainText('GROUP INFORMATION');
    await runCommand(page, 'whoami /elevated');
    await expect(page.getByTestId('cmd-output')).toContainText('It knows /groups');
  });

  await step('cmd.systeminfo', async () => {
    await runCommand(page, 'systeminfo');
    await expect(page.getByTestId('cmd-output')).toContainText('Host Name');
    await runCommand(page, 'systeminfo PRINT-01');
    // What the box IS and what is in its case. Attached hardware is the
    // printer plugged into it - not the thirteen machines that print through
    // it, which are clients and are somebody else's line.
    await expect(page.getByTestId('cmd-output'))
      .toContainText('OS Name:                   WORKGRUMBLE Print server');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Attached Hardware:         Hercules 400');
    await runCommand(page, 'systeminfo wibble');
    await expect(page.getByTestId('cmd-output')).toContainText('Unknown host');
  });

  await step('cmd.tracert', async () => {
    await runCommand(page, 'tracert SALES-02');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('print-01.workgrumble.local');
    await expect(page.getByTestId('cmd-output')).toContainText('Trace complete');
  });

  await step('cmd.nslookup', async () => {
    await runCommand(page, 'nslookup PRINT-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('may still be on fire');
    await runCommand(page, 'nslookup wibble');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Non-existent domain');
  });

  await step('cmd.users', async () => {
    await runCommand(page, 'users gpoole');
    await expect(page.getByTestId('cmd-output')).toContainText('Gary Poole');
    await runCommand(page, 'users nobodyhere');
    await expect(page.getByTestId('cmd-output')).toContainText('No account matches');
  });

  await step('cmd.net', async () => {
    await runCommand(page, 'net user gpoole');
    await expect(page.getByTestId('cmd-output')).toContainText('Account');
    await runCommand(page, 'net view PRINT-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is not something this terminal does');
  });

  await step('cmd.services', async () => {
    await runCommand(page, 'services BEIGE-BOX');
    const output = page.getByTestId('cmd-output');

    // A real list, in the columns a services window has - and the fan under
    // it, because a fan is not a service however loudly it reports a status.
    await expect(output).toContainText('Services on BEIGE-BOX (workstation)');
    await expect(output).toContainText('STARTUP TYPE');
    await expect(output).toContainText('DNS Client');
    await expect(output).toContainText('Automatic (Delayed Start)');
    await expect(output).toContainText(
      'Also on this box, reporting a status and not services:',
    );
    await expect(output).toContainText('[hardware, not restartable]');

    // And a box of a different kind runs a different list.
    await runCommand(page, 'services DC-01');
    await expect(output).toContainText('Services on DC-01 (domain controller)');
    await expect(output).toContainText('Kerberos Key Distribution Center');

    // The one nobody remembers is on the print server is in ITS list, which
    // is where a service lives - `systeminfo` counts them and names none.
    await runCommand(page, 'services PRINT-01');
    await expect(output).toContainText('VPN Concentrator');
  });

  await step('cmd.sc', async () => {
    await runCommand(page, 'sc query PRINT-01\\spooler');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('SERVICE_NAME: Spooler');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('WIN32_EXIT_CODE    : 0  (0x0)');
    await runCommand(page, 'sc config spooler start= auto');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('"sc config" is not something this terminal does');
  });

  await step('cmd.audit', async () => {
    // A base command, so it answers on the probation desk: this shop has no
    // managed customers, so audit names nobody and says so. The real MSP
    // discovery - the estate enumerated and the silently-failing backup
    // surfaced off the node - is driven through the real terminal in
    // onboarding.test.ts, which reaches the third employer the browser walk
    // does not.
    await runCommand(page, 'audit customer:tillman');
    await expect(page.getByTestId('cmd-output'))
      .toContainText(/no customer called|managed customer/i);
  });

  await step('cmd.tasklist', async () => {
    // The terminal is open, so the terminal is on the list: this window is a
    // process like any other, and so is the browser when it is up.
    await runCommand(page, 'tasklist');
    await expect(page.getByTestId('cmd-output')).toContainText('Image Name');
    await expect(page.getByTestId('cmd-output')).toContainText('CMD.EXE');
    await runCommand(page, 'tasklist /s PRINT-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Remote Registry is Disabled');
  });

  /* -- the drive, which is the other half of a terminal ------------------- */

  await step('cmd.dir', async () => {
    await runCommand(page, 'dir');
    const output = page.getByTestId('cmd-output');

    await expect(output).toContainText('Volume in drive C has no label.');
    await expect(output).toContainText('Directory of C:\\SUPPORT');
    await expect(output).toContainText('RUNBOOK.TXT');
    await expect(output).toContainText('bytes free');

    // The stuck queue, as the files it is actually made of, on the box it is
    // actually on. Monday has not been handed the spooler yet, so this is the
    // directory rather than the pile - and an empty spool directory is what a
    // print path that is working looks like.
    await runCommand(page, `dir ${WALK_SPOOL}`);
    await expect(output).toContainText('Volume in drive \\\\PRINT-01\\C$');
    await expect(output).toContainText('0 File(s)');
    await runCommand(page, 'dir C:\\NOTHING');
    await expect(output)
      .toContainText('The system cannot find the path specified.');
  });

  await step('cmd.cd', async () => {
    const prompt = page.locator('.cmd-prompt');

    await runCommand(page, 'cd ..');
    await expect(prompt).toHaveText('C:\\>');
    await runCommand(page, 'cd');
    await expect(page.getByTestId('cmd-output')).toContainText('C:\\');
    await runCommand(page, `cd ${WALK_SPOOL}`);
    await expect(page.getByTestId('cmd-output'))
      .toContainText('CMD does not support UNC paths as current directories.');
    // Back where the terminal opened, because everything after this is typed
    // at that prompt.
    await runCommand(page, 'cd C:\\SUPPORT');
    await expect(prompt).toHaveText('C:\\SUPPORT>');
  });

  await step('cmd.type', async () => {
    const output = page.getByTestId('cmd-output');

    await runCommand(page, 'type RUNBOOK.TXT');
    await expect(output).toContainText('PRINT SPOOLER - the order matters');
    await runCommand(page, 'type C:\\WINDOWS');
    await expect(output).toContainText('Access is denied.');
    await runCommand(page, 'type C:\\NOTHING.TXT');
    await expect(output)
      .toContainText('The system cannot find the file specified.');
  });

  await step('cmd.tree', async () => {
    const output = page.getByTestId('cmd-output');

    await runCommand(page, 'tree C:\\WINDOWS');
    await expect(output).toContainText('Folder PATH listing');
    // SYSTEM32 stopped being the last branch of this directory when every box
    // gained the temp directory its image has always made.
    await expect(output).toContainText('├───SYSTEM32');
    await expect(output).toContainText('└───TEMP');
    await runCommand(page, 'tree \\\\FILES-01\\C$ /f');
    await expect(output).toContainText('REPORTSVC.INI');
    await expect(output).toContainText('Access is denied.');
  });

  await step('cmd.rotate', async () => {
    await runCommand(page, 'rotate PRINT-01 0');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('display set to 0 degrees');
    await runCommand(page, 'rotate SALES-02 45');
    await expect(page.getByTestId('cmd-output')).toContainText('not an angle');
  });

  await step('cmd.unknown', async () => {
    await runCommand(page, 'unlok gpoole');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Did you mean "unlock"?');
    await runCommand(page, 'xyzzy');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is not a command on this terminal');
  });

  await step('cmd.usage', async () => {
    await runCommand(page, 'unlock');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Usage: unlock <account>');
  });

  await step('cmd.history', async () => {
    const input = page.getByTestId('cmd-input');
    await input.click();
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveValue('unlock');
    await page.keyboard.press('ArrowDown');
    await expect(input).toHaveValue('');
  });

  await step('cmd.empty', async () => {
    const input = page.getByTestId('cmd-input');
    await input.fill('');
    await input.press('Enter');
    await expect(
      page.getByTestId('cmd-output').locator('[data-kind="echo"]').last(),
    ).toHaveText(/^C:\\SUPPORT>\s*$/);
  });

  await step('cmd.focus', async () => {
    await page.getByTestId('cmd-output').click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('cmd-input')).toBeFocused();
  });

  await step('cmd.cls', async () => {
    // Typed rather than run through `runCommand`: that helper waits for the
    // line it typed to be echoed back, and this is the one command whose whole
    // job is to take the echo away with everything else. What is left is the
    // banner the terminal opens with, and nothing before it.
    const input = page.getByTestId('cmd-input');
    await input.fill('cls');
    await input.press('Enter');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Type "help" for the commands');
    await expect(page.getByTestId('cmd-output'))
      .not.toContainText('Reply from');
    await expect(page.getByTestId('cmd-output'))
      .not.toContainText('C:\\SUPPORT> cls');
  });

  /* -- the end of the day --------------------------------------------------- */

  await workUntilMinute(page, 505);

  await step('desk.late-refusal', async () => {
    const can = page.getByTestId('desk-drink');
    await expect(can).toBeDisabled();
    await expect(can).toHaveAttribute('title', /wear off somewhere on the way home/);
  });

  await step('scorecard.early-refusal', async () => {
    await openFromStartMenu(page, 'scorecard');
    const clockOff = page.getByTestId('scorecard-clock-off');
    await expect(clockOff).toBeDisabled();
    await expect(clockOff).toHaveAttribute('title', /still on/);
    await expect(page.getByTestId('scorecard-heading'))
      .toContainText('has not been scored yet');
  });

  await runToDayEnd(page);

  await step('scorecard.window', async () => {
    await expect(page.getByTestId('window-scorecard')).toBeVisible();
    await expect(page.getByTestId('scorecard-heading'))
      .toContainText('Day 1, clocking off');
    await expect(page.getByTestId('scorecard-arrived')).toHaveText('5');
    await expect(page.getByTestId('scorecard-caught')).toContainText('1 ·');
    await expect(page.getByTestId('scorecard-consumables'))
      .toContainText('£2.40');
    await expect(page.getByTestId('scorecard-reputation'))
      .not.toContainText('Not measured');
    // The mark the review turns on, on the screen every evening - with the
    // bar the file has produced, which is not the base one once somebody has
    // been walked in on. This journey has been caught once by now.
    await expect(page.getByTestId('scorecard-week'))
      .toContainText(/^\d+ of 100, and 50 is the pass · /);
  });

  await step('scorecard.payslip', async () => {
    await expect(page.getByTestId('scorecard-pay'))
      .toContainText('Vending machine');
    await expect(page.getByTestId('scorecard-net')).toContainText('£');
    await expect(page.getByTestId('scorecard-farm-total'))
      .toContainText('banked');
  });

  /* -- a save, a reload, and the same world back --------------------------- */

  await step('start-menu.save', async () => {
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-save').click();
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Game saved' }),
    ).toHaveCount(1);
  });

  const before = await page.evaluate(() => ({
    hash: globalThis.careerSim?.hash() ?? '',
    tick: globalThis.careerSim?.tick() ?? -1,
  }));

  await step('start-menu.load', async () => {
    await page.reload();
    await completeLogin(page, { brief: 'keep' });
    // A fresh session: a different world, at 08:00, having done none of it.
    const fresh = await page.evaluate(() => ({
      hash: globalThis.careerSim?.hash() ?? '',
      tick: globalThis.careerSim?.tick() ?? -1,
    }));
    expect(fresh.hash).not.toBe(before.hash);

    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-load').click();
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Game loaded' }),
    ).toHaveCount(1);

    const after = await page.evaluate(() => ({
      hash: globalThis.careerSim?.hash() ?? '',
      tick: globalThis.careerSim?.tick() ?? -1,
    }));
    expect(after).toEqual(before);
    await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
    await expect(page.getByTestId('day-state')).toHaveText('Day end');
  });

  await step('scorecard.clock-off', async () => {
    await page.getByTestId('day-state').click();
    await page.getByTestId('scorecard-clock-off').click();
    await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 2');
    await expect(page.getByTestId('window-brief')).toBeVisible();
  });

  /* -- Tuesday's brief: what came in overnight, and a dot with no desk ------ */

  await step('brief.after-hours', async () => {
    // Monday night's ping, read on Tuesday's "while you were out" surface.
    // Answering it is the world's trade - a point in your favour for a point of
    // it following you in - not a number the button chose.
    const item = page.getByTestId('brief-night-owen-monitor');
    await expect(item).toHaveAttribute('data-answered', 'false');
    await page.getByTestId('brief-night-answer-owen-monitor').click();
    await expect(item).toHaveAttribute('data-answered', 'true');
    await expect(page.getByTestId('brief-night-answer-owen-monitor'))
      .toHaveCount(0);
  });

  await step('desktop.presence-refused', async () => {
    // Off-shift, at the brief: a dot set into a dark building tells nobody
    // anything, so the world refuses it. This is the refusal F6 stopped popping
    // under a takeover - it still lands here, where it always did, against the
    // button that was pressed rather than as a toast.
    await page.getByTestId('presence-dnd').click();

    const refusal = page.getByTestId('presence-refusal');

    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText('no shift on');
    // The world did not take it, so the dot did not move.
    await expect(page.getByTestId('presence-state')).toHaveText('Available');
    // It goes the way every other transient thing does, and takes the key.
    await page.keyboard.press('Escape');
    await expect(refusal).toBeHidden();
  });

  /* -- Tuesday: the overnight outage, the spooler, and a favour ------------ */

  await beginShift(page);
  await workUntilMinute(page, 90);

  /*
   * Ten o'clock, and the phone. It is walked FIRST rather than around,
   * because a takeover that is dealt with is a Tuesday and one that is
   * ignored is a window sitting on top of every step after it.
   */

  await step('call.window', async () => {
    await huntForTakeover(page, 'call');
    await expect(page.getByTestId('call-caller')).not.toBeEmpty();
    await expect(page.getByTestId('call-subject')).toContainText('printer');
  });

  await step('call.defer', async () => {
    await page.getByTestId('call-defer').click();
    await expect(page.getByTestId('call-outcome')).toContainText('ring back');
    // The minutes it would have taken are the player's again.
    await expect(page.getByTestId('call-app'))
      .toHaveAttribute('data-call', 'none');
  });

  await step('call.callback', async () => {
    // The flag comes off the paint that FOUND the second arrival: asking again
    // afterwards is asking a later minute, and a call that has rung out by
    // then honestly answers that nothing is ringing.
    const second = await huntForTakeover(page, 'call', 40);
    expect(second.callback).toBe('true');
    // And the one button that is not on offer the second time says so rather
    // than being missing - which is the half that outlives the ringing.
    await page.getByTestId('call-decline').click();
    await expect(page.getByTestId('call-refusal')).toContainText('coming back');
  });

  await step('call.answer', async () => {
    await page.getByTestId('call-answer').click();
    await expect(page.getByTestId('call-app'))
      .toHaveAttribute('data-answered', 'true');
  });

  await step('call.conversation', async () => {
    await page.getByTestId('call-option-0').click();
    await expect(page.getByTestId('call-transcript')).toContainText('twice');
  });

  await step('remote.power-cycle', async () => {
    await openFromStartMenu(page, 'remote');
    await page.getByTestId('remote-machine-print-warehouse').click();
    await page.getByTestId('remote-power-printer-warehouse').click();
    await expect(resolvedFor(page, /Warehouse printer was dead/)).toHaveCount(1);
    await expectClosed(page, 'vacuum-tuesday');
  });

  await step('tickets.link-refused', async () => {
    await openTicket(page, 'wedged-spooler');
    const remote = page.getByTestId('ticket-open-remote');
    await expect(remote).toBeDisabled();
    await expect(remote).toHaveAttribute(
      'title',
      /No workstation is signed out to this reporter/,
    );
  });

  await step('cmd.queue', async () => {
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'queue hercules');
    await expect(page.getByTestId('cmd-output')).toContainText('47 job(s)');
    await runCommand(page, 'queue wibble');
    await expect(page.getByTestId('cmd-output')).toContainText('No printer matches');
  });

  await step('remote.clear-queue', async () => {
    await openFromStartMenu(page, 'remote');
    await page.getByTestId('remote-machine-print').click();
    await expect(page.getByTestId('remote-queue-printer'))
      .toHaveText('47 job(s) queued');
    await page.getByTestId('remote-clear-printer').click();
    await expect(page.getByTestId('remote-queue-printer'))
      .toHaveText('0 job(s) queued');
    // Stop, clear, start: the spooler is left stopped for the restart below,
    // because the files it was holding are what the clear had to get past.
    await expect(page.getByTestId('remote-service-spooler'))
      .toContainText('Stopped');
  });

  await step('cmd.clearqueue', async () => {
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'clearqueue hercules');
    await expect(page.getByTestId('cmd-output')).toContainText('already empty');
  });

  await step('remote.restart-service', async () => {
    await openFromStartMenu(page, 'remote');
    const restart = page.getByTestId('remote-restart-spooler');
    await expect(restart).toBeEnabled();
    await restart.click();
    await expect(page.getByTestId('remote-service-spooler'))
      .toContainText('Running');
    await expect(resolvedFor(page, /haunted/)).toHaveCount(1);
    await expectClosed(page, 'wedged-spooler');
  });

  await workUntilMinute(page, 300);
  await addToGroup(page, 'bev', 'group:print-users');
  await expectClosed(page, 'tidied-list');

  /*
   * The same question everywhere (0.5.0 slice 2). Bev asked for the VPN at ten
   * to ten in the inbox, a one-to-one chat and the #helpdesk room at once - one
   * request wearing three coats. The proper week does the correct play: it
   * CONVERTS the cross-post into a ticket, from the room where the bar hangs off
   * the message itself, and resolving it there quietens the mail and chat copies
   * too. That mint is the one intake Friday can see, and it is worked like any
   * other ticket below. (Answer and deflect - the other two ends of the same bar
   * - are held down on the real driver in src/shell/requests.test.ts, because a
   * week that goes well takes the credited one.)
   */
  await step('hubbub.request', async () => {
    await openFromStartMenu(page, 'hubbub');
    await page.getByTestId('hubbub-channel-helpdesk').click();
    const roomMessage = page.getByTestId('hubbub-message-bev-vpn');

    await expect(roomMessage.getByTestId('request-convert-bev-vpn'))
      .toBeVisible();
    await roomMessage.getByTestId('request-convert-bev-vpn').click();

    // Convert mints a real ticket the queue opens on, which is where the credit
    // lives...
    await expect(page.getByTestId('ticket-row-bev-vpn-request')).toBeVisible();

    // ...and every copy now reads converted off the one world record: the room's
    // own copy carries the resolved line rather than a button to press again.
    await expect(
      page.getByTestId('hubbub-message-bev-vpn')
        .getByTestId('request-status-bev-vpn'),
    ).toContainText('Converted');
  });

  // And the request-turned-ticket is worked like the rest: Bev has never been in
  // VPN Users, so the one directory move is the whole of the fix, and the ticket
  // the room minted closes on it.
  await addToGroup(page, 'bev', 'group:vpn-users');
  await expectClosed(page, 'bev-vpn-request');

  await workUntilMinute(page, 330);

  await step('cmd.grant', async () => {
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'grant kboateng sales');
    await expect(page.getByTestId('cmd-output')).toContainText('Full Access');
    await runCommand(page, 'grant nobodyhere sales');
    await expect(page.getByTestId('cmd-output')).toContainText('No account matches');
    await expectClosed(page, 'mailbox-access');
  });

  await addToGroup(page, 'kwame', 'group:sales-send-as');
  await expectClosed(page, 'sendas-missing');

  await workUntilMinute(page, 372);

  await step('chat.direct-message', async () => {
    await expectNoticed(page, 'Somebody has messaged you directly');
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-terry').click();
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('quick favour');
    // The answer that leaves a record: he files it, ten minutes later, from a
    // folder called Later.
    await chatOption(page, /raise it properly/);
  });

  await workUntilMinute(page, 395);

  await step('cmd.resetpw', async () => {
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'resetpw tblunt');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Temporary password issued');
    await runCommand(page, 'resetpw nobodyhere');
    await expect(page.getByTestId('cmd-output')).toContainText('No account matches');
    await expectClosed(page, 'must-change-password');
  });

  await clockOffFor(page, 2);

  /* -- Wednesday: a licence, a new phone and an announced window ----------- */

  await beginShift(page);
  await workUntilMinute(page, 70);

  /* Half past ten, and the half hour that was in Monday's inbox. */

  await step('meeting.window', async () => {
    await workUntilMinute(page, 145);
    await huntForTakeover(page, 'meeting', 20);
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-takeover', 'meeting');
    await expect(page.getByTestId('meeting-desk')).toContainText('still open');
  });

  await step('meeting.decline', async () => {
    await page.getByTestId('meeting-decline').click();
    await expect(page.getByTestId('meeting-refusal')).toBeVisible();
    await expect(page.getByTestId('meeting-app')).toBeVisible();
  });

  // F6 (0.3.6): the status control goes INERT under the block rather than
  // answering a click with a refusal panel popped over the meeting. The dimming
  // is the teaching, and the buttons are disabled so the keyboard cannot reach
  // past it either - a tab-and-Enter refusal is the same dead click by another
  // device. The refusal it used to pop here now lives only off-shift, where the
  // world still refuses a dot at a desk with no shift on (driven at Tuesday's
  // brief, the `desktop.presence-refused` step above). It is an inline check
  // rather than a coverage step because F6's inert state reaches no new function.
  await expect(page.getByTestId('presence-control'))
    .toHaveAttribute('data-inert', 'true');
  await expect(page.getByTestId('presence-dnd')).toBeDisabled();
  await expect(page.getByTestId('presence-refusal')).toBeHidden();
  await expect(page.getByTestId('meeting-app')).toBeVisible();

  await step('meeting.defer', async () => {
    await page.getByTestId('meeting-defer').click();
    await expect(page.getByTestId('meeting-refusal')).toBeVisible();
    // Out the far side of it, and the desk is the player's again.
    await runSimMinutes(page, 32);
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-takeover', 'none');
  });

  await step('cmd.licence', async () => {
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'licence give rtulliver');
    await expect(page.getByTestId('cmd-output')).toContainText('no free seats');
    await runCommand(page, 'licence take cpeach');
    await expect(page.getByTestId('cmd-output')).toContainText('Seat reclaimed');
    await runCommand(page, 'licence give rtulliver');
    await expect(page.getByTestId('cmd-output')).toContainText('Seat assigned');
    await runCommand(page, 'licence borrow rtulliver');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is not something this terminal does');
    await expectClosed(page, 'licence-exhausted');
  });

  await workUntilMinute(page, 140);

  await step('cmd.revoke', async () => {
    await openFromStartMenu(page, 'cmd');
    // The wrong flavour of fix first, because the refusal is the teaching.
    await runCommand(page, 'revoke praval');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('the fix for that is a new enrolment');
  });

  await step('cmd.verify', async () => {
    // A check is a CHANNEL. The bare verb used to write down that somebody had
    // been proved to be themselves on the strength of nothing at all.
    await runCommand(page, 'verify sounded-right praval');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is not a way of proving who somebody is');
    await runCommand(page, 'verify inperson praval');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('proves nothing about whoever is on the phone');
    await runCommand(page, 'verify callback praval');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('a callback to the number on file');
    await runCommand(page, 'verify callback nobodyhere');
    await expect(page.getByTestId('cmd-output')).toContainText('No account matches');
  });

  await step('cmd.mfa', async () => {
    await runCommand(page, 'mfa praval');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('New authenticator enrolled');
    // A recovery owes both of these, and neither used to happen.
    await expect(page.getByTestId('cmd-output'))
      .toContainText('previous binding has been invalidated');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('recovery notice');
    await expectClosed(page, 'mfa-reregister');
    // And now there IS a factor to sign out of everything, which is the other
    // half of the verb the refusal above was about.
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'revoke praval');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('has been signed out');
  });

  await workUntilMinute(page, 220);

  await step('tickets.link-parent', async () => {
    await openFromStartMenu(page, 'tickets');
    await page.getByTestId('ticket-pick-share-dup-terry').check();
    await page.getByTestId('ticket-row-share-maintenance').click();
    await page.getByTestId('ticket-link-parent').click();
    await expect(page.getByTestId('ticket-parent-outcome'))
      .toContainText('1 ticket(s) attached');
    await expect(page.getByTestId('ticket-parent-standing'))
      .toContainText('1 ticket(s) attached');

    // Nothing has closed yet: attaching a duplicate is filing, and the
    // children close when the fault behind them stops existing.
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'restart file sharing');
    await expect(page.getByTestId('cmd-output')).toContainText('RUNNING');
    await expectClosed(page, 'share-maintenance');
    await expectClosed(page, 'share-dup-terry');
    await expect(page.getByTestId('ticket-comments'))
      .toContainText('Closed with the parent incident');
  });

  // The warehouse box, on the afternoon it finally runs out of drive. The
  // table says 14:40 and the day's seed moves that by up to twelve minutes
  // either way, so the walk waits for the arrival rather than for the minute.
  await workUntilTicket(page, 'disk-full');

  await step('cmd.purge', async () => {
    await openFromStartMenu(page, 'cmd');
    const output = page.getByTestId('cmd-output');

    // The diagnosis is two footers: eight kilobytes left on one listing, and
    // three hundred megabytes in another on the same drive.
    await runCommand(page, 'dir \\\\WHOUSE-01\\C$');
    await expect(output).toContainText('8,192 bytes free');
    await runCommand(page, 'dir \\\\WHOUSE-01\\C$\\SCANNER\\EXPORT');
    await expect(output).toContainText('12 File(s)');
    await expect(output).toContainText('310,902,784 bytes');

    // The refusal that is the whole judgement: the pallet database next door
    // is the only copy of where anything in that warehouse is.
    await runCommand(page, 'purge \\\\WHOUSE-01\\C$\\SCANNER\\DATA');
    await expect(output).toContainText('is not a second copy of anything');

    await runCommand(page, 'purge \\\\WHOUSE-01\\C$\\SCANNER\\EXPORT');
    await expect(output).toContainText('310,902,784 bytes deleted');
    await expect(output).toContainText('310,910,976 bytes free');
    await expectClosed(page, 'disk-full');
  });

  await clockOffFor(page, 3);

  /* -- Thursday: the arc, a relock, and forty people with one fault -------- */

  await beginShift(page);
  await workUntilMinute(page, 70);

  await step('call.decline', async () => {
    // Twenty past eleven, and a printer in a building this desk does not hold
    // the contract for. This one the world says you may wave off.
    await workUntilMinute(page, 195);
    await huntForTakeover(page, 'call', 30);
    await page.getByTestId('call-decline').click();
    await expect(page.getByTestId('call-outcome')).toContainText('stops ringing');
    await expect(page.getByTestId('call-app'))
      .toHaveAttribute('data-call', 'none');
  });

  await step('cmd.forget', async () => {
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'forget tablet');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Stored credentials cleared');
    await runCommand(page, 'forget wibble');
    await expect(page.getByTestId('cmd-output')).toContainText('Nothing plugged in');
  });

  await step('cmd.unlock', async () => {
    await runCommand(page, 'unlock hmarsh');
    await expect(page.getByTestId('cmd-output')).toContainText('unlocked');
    await runCommand(page, 'unlock nobodyhere');
    await expect(page.getByTestId('cmd-output')).toContainText('No account matches');
    await expectClosed(page, 'stale-device-relock');
  });

  await step('events.history', async () => {
    // Twice at the same minute, two days apart, on the same box: the log is
    // the only place that fact is readable.
    await openFromStartMenu(page, 'remote');
    await page.getByTestId('remote-machine-print-warehouse').click();
    await page.getByTestId('remote-power-printer-warehouse').click();
    await openFromStartMenu(page, 'events');
    await page.getByTestId('events-machine-print-warehouse').click();
    await expect(page.getByTestId('events-app')).toContainText('lost power');
    // Dated the way the drive dates a file, which is the point of the column:
    // the two outages this arc turns on are the same minute on the Monday and
    // the Wednesday, and both dates are readable on one screen.
    await expect(page.getByTestId('events-table').locator('.events-day').first())
      .toHaveText(/^\d{2}\/\d{2}\/\d{4}$/u);
    await expect(page.getByTestId('events-table')).toContainText('07/09/1998');
    await expect(page.getByTestId('events-table')).toContainText('09/09/1998');
  });

  await step('chat.option-sticky', async () => {
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-vic').click();
    await chatOption(page, /sockets in the warehouse corridor/);
    await chatOption(page, /put a note on it saying what is plugged in/);
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('DO NOT UNPLUG');
    await expectClosed(page, 'vacuum-thursday');
  });

  await workUntilMinute(page, 180);

  await step('cmd.renewcert', async () => {
    await openFromStartMenu(page, 'tickets');
    await page.getByTestId('ticket-pick-vpn-cert-dup-ada').check();
    await page.getByTestId('ticket-pick-vpn-cert-dup-gary').check();
    await page.getByTestId('ticket-row-vpn-cert-expired').click();
    await page.getByTestId('ticket-link-parent').click();
    await expect(page.getByTestId('ticket-parent-standing'))
      .toContainText('2 ticket(s) attached');

    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'renewcert VPN Concentrator');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('New certificate issued');
    await runCommand(page, 'renewcert wibble');
    await expect(page.getByTestId('cmd-output')).toContainText('No service called');

    for (const slug of [
      'vpn-cert-expired',
      'vpn-cert-dup-ada',
      'vpn-cert-dup-gary',
    ]) {
      await expectClosed(page, slug);
    }
  });

  /* Ten past two, and the update that has been waiting since September. */

  await workUntilMinute(page, 365);

  await step('reboot.window', async () => {
    await huntForReboot(page);
    await expect(page.getByTestId('reboot-app'))
      .toHaveAttribute('data-postpones-left', '3');
    await expect(page.getByTestId('reboot-subject')).toContainText('September');
    // The desk is gone, and it says so in the workstation's own sentence
    // rather than the meeting's.
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-takeover', 'machine');
    await openFromStartMenu(page, 'cmd');
    await runOnlyCommand(page, 'restart backup');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('installing updates');
  });

  await step('reboot.withdrawn', async () => {
    // No Decline button anywhere, and a sentence saying why there is not.
    await expect(page.getByTestId('reboot-withdrawn'))
      .toContainText('option has been withdrawn');
    // And the button the keyboard lands on is the one that costs nothing. The
    // desktop puts the cursor on the primary control of any screen the day
    // opens, so the primary control here must not be the answer that spends
    // the whole budget on one Enter.
    await expect(page.getByTestId('reboot-postpone'))
      .toHaveClass(/os-button-primary/u);
  });

  await step('reboot.postpone', async () => {
    // Pressed with the day STOPPED, and the countdown read in the same held
    // minute. Two box runs died here reading five minutes where ten were
    // bought, and the second one was this: the assertion retries in real time
    // while the clock runs in sim time, so at speed the grace was half spent
    // before the chip was even looked at.
    await underPause(page, async () => {
      await expect(page.getByTestId('reboot-postpone'))
        .toHaveText('Postpone 10 minutes');
      await page.getByTestId('reboot-postpone').click();
      await expect(page.getByTestId('reboot-app'))
        .toHaveAttribute('data-holding', 'false');

      // Painted by the PRESS rather than by the next minute: with the clock
      // held there is no next minute, and a player who buys ten minutes and
      // pauses to think is entitled to see what they bought.
      const chip = page.getByTestId('reboot-chip');

      await expect(chip).toHaveText('Restarting in 10m');
      await expect(chip).toHaveAttribute('data-left', '2');
      await expect(page.getByTestId('desktop'))
        .toHaveAttribute('data-takeover', 'none');
    });
  });

  await step('reboot.countdown', async () => {
    // It COUNTS DOWN. A chip that showed the window as a constant would look
    // right at the moment it was pressed and be a lie a minute later - so one
    // minute is spent, and the reading is taken with the day held again.
    await runSimMinutes(page, 1, 1);
    await underPause(page, async () => {
      await expect(page.getByTestId('reboot-chip'))
        .toHaveAttribute('data-away', '9');
    });

    // And the desk answers, which is the whole of what the push bought.
    await runOnlyCommand(page, 'ver');
    await expect(page.getByTestId('cmd-output'))
      .not.toContainText('installing updates');
  });

  await step('reboot.spent', async () => {
    // The two shorter windows, and then the arrival that offers nothing.
    for (const window of ['Postpone 5 minutes', 'Postpone 2 minutes']) {
      await huntForReboot(page, 45);
      await expect(page.getByTestId('reboot-postpone')).toHaveText(window);
      await page.getByTestId('reboot-postpone').click();
    }

    const last = await huntForReboot(page, 15);

    expect(last.postponesLeft).toBe('0');
    await expect(page.getByTestId('reboot-postpone')).toBeHidden();
    await expect(page.getByTestId('reboot-detail'))
      .toContainText('nothing left to press');

    // And out the far side of it: the desk back, the price on the taskbar,
    // and the line about most of it.
    await runSimMinutes(page, 13, 1);
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-takeover', 'none');
    await expect(page.getByTestId('refocus-chip')).toBeVisible();
    await expectNoticed(page, 'Restoring your work... (most of it)');
  });

  await clockOffFor(page, 4);

  /* -- Friday, and the conversation at three ------------------------------- */

  await beginShift(page);
  await workUntilMinute(page, 70);

  await step('cmd.rule', async () => {
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'rule on quarantine');
    await expect(page.getByTestId('cmd-output')).toContainText('is now on');
    await runCommand(page, 'rule off quarantine');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is not something this terminal does');
  });

  await step('chat.option-reply', async () => {
    // The rule stops the mail and it does not close the ticket. The reply is
    // the half that pays: the next hundred of these depend on whether
    // reporting one was worth his morning.
    await openFromStartMenu(page, 'tickets');
    await page.getByTestId('ticket-row-phishing-report').click();
    await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-dennis').click();
    await chatOption(page, /he did exactly the right thing/);
    await expectClosed(page, 'phishing-report');
    await expect(page.getByTestId('ticket-comments'))
      .toContainText('You did exactly the right thing');
  });

  // Somebody who saved something nine times, finding out it is not where they
  // saved it. Nominally 09:40, jittered like every other drip.
  await workUntilTicket(page, 'saved-into-temp');

  await step('cmd.move', async () => {
    await openFromStartMenu(page, 'cmd');
    const output = page.getByTestId('cmd-output');

    // Not where she saved it. Where the mail client opened it from - and the
    // file itself proves it is the right one before anything moves.
    await runCommand(page, 'dir \\\\ACCTS-01\\C$\\WINDOWS\\TEMP');
    await expect(output).toContainText('STATEMENT.TXT');
    await runCommand(
      page,
      'type \\\\ACCTS-01\\C$\\WINDOWS\\TEMP\\STATEMENT.TXT',
    );
    await expect(output).toContainText('HOLLOWAY & SONS');

    await runCommand(
      page,
      'move \\\\ACCTS-01\\C$\\WINDOWS\\TEMP\\STATEMENT.TXT C:\\SUPPORT',
    );
    await expect(output).toContainText('two different drives');

    await runCommand(
      page,
      'move \\\\ACCTS-01\\C$\\WINDOWS\\TEMP\\STATEMENT.TXT '
      + '"\\\\ACCTS-01\\C$\\Documents and Settings\\praval\\My Documents"',
    );
    await expect(output).toContainText('1 file(s) moved.');
    await expectClosed(page, 'saved-into-temp');
  });

  await workUntilMinute(page, 180);

  await step('cmd.restart', async () => {
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'restart backup');
    await expect(page.getByTestId('cmd-output')).toContainText('RUNNING');
    await runCommand(page, 'restart vpn');
    await expect(page.getByTestId('cmd-output')).toContainText('is already running');
    await runCommand(page, 'restart fan');
    await expect(page.getByTestId('cmd-output')).toContainText('It will not help');
    await runCommand(page, 'restart wibble');
    await expect(page.getByTestId('cmd-output')).toContainText('No service called');
    await expectClosed(page, 'coverup-backup');
  });

  /*
   * Twenty to twelve, and somebody at the desk rather than on the phone.
   *
   * Same window, same three verbs, different everything else - and the choice
   * is the one this slice is about: two minutes now and no record of it, or a
   * ticket and a line on Friday's card. The walk that goes well takes the
   * quiet one, so the OTHER answer is driven in the week that goes badly.
   */
  await step('call.walk-up', async () => {
    const desk = await huntForTakeover(page, 'call', 60);

    expect(desk.source).toBe('walk_up');
    await expect(page.getByTestId('call-caller')).toContainText('Gary');
    // The dot has nothing to say about a person who can see you, and the
    // window says so where the player is looking.
    await expect(page.getByTestId('call-state')).toContainText('can see you');

    await page.getByTestId('call-answer').click();
    await expect(page.getByTestId('call-app'))
      .toHaveAttribute('data-answered', 'true');
  });

  await step('call.walk-up-off-book', async () => {
    await page.getByTestId('call-option-0').click();
    await expect(page.getByTestId('call-transcript'))
      .toContainText('off the books');
  });

  await workUntilMinute(page, 240);

  /*
   * THE HONESTY, and the reason the quiet answer is a real answer rather than
   * a free one: the job is done, the machine went round, and there is no row
   * anywhere with his name on it. Friday's card cannot count what the queue
   * never held.
   */
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-gary').click();
  // The box that had been asking since before his fortnight is not asking any
  // more, which is the whole of what he came over about.
  await expect(page.getByTestId('remote-dialog')).toContainText('System Notice');
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-gary-restart')).toHaveCount(0);

  // The report nobody raised in March: try the obvious thing, then hand it on
  // with the date on it. Both controls are already walked; the ticket is not.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-files').click();
  await page.getByTestId('remote-reboot').click();
  await openTicket(page, 'hr-report-macro');
  await page.getByTestId('ticket-escalate').click();
  await expect(page.getByTestId('handoff-tried')).toContainText('Rebooted');
  await page.getByTestId('handoff-reported').fill(
    'Headcount report has not generated since March; needed at 15:00 today.',
  );
  await page.getByTestId('handoff-send').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');

  /*
   * THE TIMESHEET (0.30.0), on the Friday it is due, which is where the joke
   * lives: a service-desk sheet is one bucket a day at seven and a half hours,
   * there is nothing on it to decide, and the only thing to do with it is send
   * it. Filed here rather than at the end of the week so the SUBMIT is the
   * player's own - the week ending files it for you, honestly labelled, and
   * that path is proven in the unit suite where a whole week can be driven.
   */
  await step('timesheet.window', async () => {
    await openFromStartMenu(page, 'timesheet');

    await expect(page.getByTestId('timesheet-app')).toBeVisible();
    await expect(page.getByTestId('timesheet-stance'))
      .toContainText('nothing on it to decide');
    await expect(page.getByTestId('timesheet-stamp'))
      .toContainText('end of today');

    // Five days of the week, one line each, seven and a half hours a line,
    // attributed to nobody - and not one control on any of them, because a
    // desk sheet has nothing on it anybody would ever be asked about.
    const rows = page.locator('[data-testid^="timesheet-line-"]');

    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('Service Desk');
    await expect(rows.first()).toHaveAttribute('data-gap', 'unedited');
    await expect(rows.first()).toHaveAttribute('data-billable', 'false');
    await expect(page.locator('[data-testid^="timesheet-minutes-"]'))
      .toHaveCount(0);
    await expect(page.locator('[data-testid^="timesheet-unattributed-"]'))
      .toHaveCount(0);
  });

  await step('cmd.timesheet', async () => {
    await openFromStartMenu(page, 'cmd');
    await runCommand(page, 'timesheet');

    const sheet = page.getByTestId('cmd-output');

    await expect(sheet).toContainText('Service Desk');
    await expect(sheet).toContainText('Due end of day 5, which is today.');

    await runCommand(page, 'timesheet submit');
    await expect(sheet).toContainText('before the sigh finished');

    // And it is a filed piece of paper from here on, which is what the whole
    // claim/record split is for: the copy on your machine is no longer the
    // thing anybody is looking at.
    await runCommand(page, 'timesheet claim 1.1 420');
    await expect(sheet).toContainText('That sheet has gone in');

    // The window that was open behind all that is a READ of the same sheet
    // rather than a second copy of it: nobody told it anything, and it is
    // stamped and frozen. Filing from one door freezes the other.
    await focusWindow(page, 'timesheet');
    await expect(page.getByTestId('timesheet-stamp'))
      .toContainText('Submitted at');
    await expect(page.getByTestId('timesheet-submit')).toBeDisabled();
  });

  await workUntilMinute(page, 425);

  await step('review.passed', async () => {
    await expect(page.getByTestId('window-review')).toBeVisible();
    await expect(page.getByTestId('review-app'))
      .toHaveAttribute('data-outcome', 'passed');
    await expect(page.getByTestId('review-line'))
      .toContainText('the week is fine');
    await expect(page.getByTestId('review-note')).toContainText('fridge');
  });

  /**
   * Somebody opened the file a minute before that, and the reason the bar was
   * what it was is printed beside the verdict rather than left to be guessed
   * at. A week that dealt with its queue has nobody with a reason to look, and
   * the window says exactly that.
   */
  await step('review.file-read', async () => {
    const conduct = page.getByTestId('review-conduct');
    await expect(conduct).toBeVisible();
    await expect(conduct).toContainText('file');
    await expect(page.getByTestId('review-app'))
      .toHaveAttribute('data-bar', /^\d+$/);
    await page.getByTestId('review-dismiss').click();
    await expect(page.getByTestId('window-review')).toHaveCount(0);
  });

  await runToDayEnd(page);

  await step('desk.beer-unlocked', async () => {
    await expect(page.getByTestId('desk-beer'))
      .toHaveAttribute('data-locked', 'false');
    await expect(page.getByTestId('desk-beer')).toBeEnabled();
  });

  await step('beer.open', async () => {
    await expect(page.getByTestId('window-beer')).toBeVisible();
    await expect(page.getByTestId('beer-app'))
      .toHaveAttribute('data-opened', 'false');
    await page.getByTestId('beer-open').click();
    await expect(page.getByTestId('beer-app'))
      .toHaveAttribute('data-opened', 'true');
  });

  await step('beer.aftermath', async () => {
    await expect(page.getByTestId('beer-reply'))
      .toContainText('considerably better');
    await expect(page.getByTestId('desk-beer-label')).toHaveText('Empty');
    await page.getByTestId('beer-open').click();
    await expect(page.getByTestId('window-beer')).toHaveCount(0);
  });

  await step('scorecard.end-week', async () => {
    const clockOff = page.getByTestId('scorecard-clock-off');
    await expect(clockOff).toHaveText('Clock off for the week');
    await clockOff.click();
    await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 5');
    await expect(page.getByTestId('sim-clock-time')).toHaveText('17:00');
  });

  await step('weekend.days', async () => {
    await expect(page.getByTestId('window-weekend')).toBeVisible();
    await expect(page.getByTestId('weekend-verdict'))
      .toHaveAttribute('data-outcome', 'passed');
    await expect(page.getByTestId('weekend-verdict-title'))
      .toContainText('passed');
    await expect(page.getByTestId('weekend-day-1')).toContainText('in,');
    await expect(page.getByTestId('weekend-day-5')).toBeVisible();
    await expect(page.getByTestId('weekend-closed')).not.toHaveText('0');
    // The mark and the two rows it is made of.
    await expect(page.getByTestId('weekend-resolution'))
      .toContainText(/^\d+ of \d+ · \d+%$/);
    await expect(page.getByTestId('weekend-attainment'))
      .toContainText(/^\d+ of \d+ · \d+%$/);
    await expect(page.getByTestId('weekend-performance'))
      // The bar is what the file produced, not the base 45: this week was
      // walked in on.
      .toContainText(/^\d+ out of 100, against the 50 he needs\./);
    await expect(page.getByTestId('weekend-bonus')).toContainText('£');
    await expect(page.getByTestId('weekend-earned')).toContainText('£');
    await expect(page.getByTestId('weekend-farm-total')).toContainText('banked');
  });

  await step('weekend.onward-offer', async () => {
    // After a pass the onward button is the offer itself: named, enabled, and
    // NOT clicked here - taking it reloads into the second employer, which is
    // the switch run's job. This walk only proves the door is there.
    const onward = page.getByTestId('weekend-onward');
    await expect(onward).toBeEnabled();
    await expect(onward).toHaveText(/Take the job at .+/);
  });

  await step('weekend.offer', async () => {
    await expect(page.getByTestId('weekend-offer'))
      .toHaveAttribute('data-tone', 'earned');
    await expect(page.getByTestId('weekend-offer-title')).toContainText('offer');
    await expect(page.getByTestId('weekend-offer-body')).toContainText('standing');
  });

  await step('weekend.stay-door', async () => {
    // The third door (E11): after a pass, and while the arc has another week
    // in it, the option that does not leave - named with the week it goes to.
    // NOT pressed here; pressing it is the step at the bottom of this run,
    // after the two session ceremonies below, because it reloads the page.
    const stay = page.getByTestId('weekend-stay');
    await expect(stay).toBeVisible();
    await expect(stay).toBeEnabled();
    await expect(stay).toHaveText('Stay for week 2');
  });

  /* -- and the two ways out of a session ----------------------------------- */

  await step('start-menu.open', async () => {
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('start-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('start-menu')).toBeHidden();
  });

  await step('start-menu.app', async () => {
    await openFromStartMenu(page, 'kb');
    await expect(page.getByTestId('kb-list')).toBeVisible();
  });

  await step('start-menu.log-off', async () => {
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-log-off').click();
    await expect(page.getByTestId('login-screen')).toBeVisible();
  });

  await step('login.restart', async () => {
    await page.getByTestId('login-restart').click();
    await expect(page.getByTestId('boot-screen')).toBeVisible();
    await page.keyboard.press('Space');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('desktop')).toBeVisible();
  });

  await step('start-menu.restart', async () => {
    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-restart').click();
    await expect(page.getByTestId('boot-screen')).toBeVisible();
    await page.keyboard.press('Space');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('desktop')).toBeVisible();
  });

  /* -- and out of the week, forwards ---------------------------------------- */

  await step('weektwo.arrive', async () => {
    // LAST, because it reloads onto a Monday nobody has worked and everything
    // above is about the week that has just been. The whole chain in one
    // session: a week played properly, a Friday passed, the door pressed, and
    // the world the boot on the far side of it stands up.
    await openFromStartMenu(page, 'weekend');
    await page.getByTestId('weekend-stay').click();

    await completeLogin(page, { brief: 'keep' });
    await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
    await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);

    // The same shop's SECOND week: the arc position climbed, and the Monday is
    // not the probation Monday every player is dealt.
    expect(await page.evaluate(
      () => globalThis.careerSim?.field('person:pat', 'arc_week') ?? null,
    )).toBe(2);

    await page.getByTestId('brief-start-shift').click();
    await page.getByTestId('close-brief').click();
    await openFromStartMenu(page, 'tickets');
    await expect(page.getByTestId('ticket-row-locked-account')).toHaveCount(0);
    await expect(page.getByTestId('tickets-empty')).toHaveCount(0);
  });
});

/* ========================================================================= *
 * Run two: the week nobody worked, and the Monday that starts again.
 * ========================================================================= */

test('walks the week nobody worked, the firing, and the retry', async ({
  page,
}) => {
  await recordControls(page);
  test.setTimeout(900_000);
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await beginShift(page);
  // Four times normal speed, before anything walks the clock: the corridor
  // search and the wait for an arrival both buy their minutes at x4, and at
  // x1 they would run out of patience four minutes into the morning.
  await page.getByTestId('day-speed-4').click();
  await expect(page.getByTestId('day-speed-4'))
    .toHaveAttribute('data-active', 'true');

  /* -- Monday: four cans, a game, and nothing done at all ------------------ */

  await step('desk.empties-counted', async () => {
    for (let can = 0; can < 4; can += 1) {
      await page.getByTestId('desk-drink').click();
    }

    await expect(page.getByTestId('desk-overlay'))
      .toHaveAttribute('data-cans', '4');
    await expect(page.getByTestId('desk-empties'))
      .toHaveAttribute('data-too-many', 'true');

    // He does the arithmetic on his way past, and does not mention it.
    await runToTelegraph(page);
    await runSimMinutes(page, 8);
    await expectNoticed(page, 'He counted them');
  });

  await step('caught.scene-bubbles', async () => {
    await openFromStartMenu(page, 'bubbles');
    await page.getByTestId('bubble-target').click();
    await runToTelegraph(page);
    await runUntilCaught(page);
    await expect(page.getByTestId('caught-app'))
      .toHaveAttribute('data-app', 'bubbles');
    await expect(page.getByTestId('caught-heading')).toContainText('morale');
    await page.getByTestId('caught-dismiss').click();
    await page.keyboard.press('Backquote');
    await expect(page.getByTestId('window-bubbles')).toBeHidden();
  });

  await step('directory.enable', async () => {
    // The leaver, switched off in April by a process that did its job.
    await openFromStartMenu(page, 'directory');
    await page.getByTestId('directory-row-colin').click();
    await expect(page.getByTestId('directory-detail-status'))
      .toHaveText('Disabled');
    await page.getByTestId('directory-enable').click();
    await expect(page.getByTestId('directory-outcome')).toContainText('Enabled');
    await expect(page.getByTestId('directory-detail-status')).toHaveText('Fine');
  });

  await step('start-menu.load-refused', async () => {
    await page.evaluate(() => {
      window.localStorage.setItem(
        'workgrumble/save',
        JSON.stringify({ schema: 99, engine: '{}' }),
      );
    });
    // Hold the day still: what a refused load must not do is MOVE the world,
    // and a running clock at x4 moves twenty minutes while the menu opens.
    const pause = page.getByTestId('day-pause');
    await pause.click();
    const clock = await page.getByTestId('sim-clock-time').textContent();

    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-load').click();
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Not loaded' }),
    ).toHaveCount(1);
    await expect(page.getByTestId('sim-clock-time')).toHaveText(clock ?? '');
    await expect(page.getByTestId('day-state')).toContainText('Shift');
    await pause.click();
  });

  /*
   * The other thing he can find, on a screen with nothing on it.
   *
   * The game is minimised behind the panic key, so there is nothing to be
   * caught AT - which is the precedence rule this beat lives under: a man who
   * has just found a forum open is having that conversation instead. What is
   * left is the dot, held over a morning the dispatch log says was worked, and
   * the meter climbing until he has something he can point at.
   */
  await step('caught.scene-presence', async () => {
    await page.getByTestId('presence-dnd').click();
    await expect(page.getByTestId('presence-state'))
      .toHaveText('Do not disturb');

    const caught = page.getByTestId('window-caught');

    for (let round = 0; round < 40 && await caught.count() === 0; round += 1) {
      await doSomeWork(page);
      await runSimMinutes(page, 5, 4);
    }

    await expect(caught).toBeVisible();
    await expect(page.getByTestId('caught-app'))
      .toHaveAttribute('data-app', 'presence:dnd');
    await expect(page.getByTestId('caught-heading'))
      .toContainText('availability');

    /*
     * ONE reading, on both surfaces.
     *
     * The number he arrived with is captured in the minute he arrives, and the
     * assertion is not that the scene says something about a morning - it is
     * that the scene, the file and the captured minutes are three views of the
     * same value. A scene that recomputed a running total live would drift
     * from the line already written on the file, and a phrase match against
     * "morning|hour" would have passed all the way through that drift without
     * noticing.
     */
    const captured = await page.evaluate(
      () => globalThis.careerSim?.screens().caught.evidence ?? null,
    );

    expect(captured).not.toBeNull();
    expect(captured ?? 0).toBeGreaterThanOrEqual(DND_BEAT_MINUTES);

    const said = dndEvidence(captured ?? 0);
    const evidence = page.getByTestId('caught-evidence');

    await expect(evidence).toBeVisible();
    await expect(evidence).toHaveAttribute('data-minutes', String(captured));
    await expect(evidence).toContainText(said);
    // In his words rather than as a number, which is the other half of it.
    await expect(evidence).not.toContainText(/\d+ minutes/);
    // And the same reading on the file, in the voice a file is written in.
    await expect(page.getByTestId('caught-file'))
      .toContainText(`Availability status recorded as Do Not Disturb for ${said}`);

    await page.getByTestId('caught-dismiss').click();
    await expect(caught).toHaveCount(0);
    await page.getByTestId('presence-available').click();
    await expect(page.getByTestId('presence-state')).toHaveText('Available');
  });

  // Four hours in, with the game put away and nothing closed: the queue has
  // breached everything it had and the meter is pinned. Late enough to be well
  // clear of the line rather than balanced on it - the slack window that was
  // up until the telling-off was draining the same meter.
  await workUntilMinute(page, 440);

  await step('desktop.fumble-chip', async () => {
    // Four tickets nobody is closing and a deadline going past: by the middle
    // of the afternoon the room is swimming, and the chip says so.
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-fumbling', 'true');
    const chip = page.getByTestId('fumble-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('title', /entirely cosmetic/);
  });

  await step('cmd.fumble', async () => {
    await openFromStartMenu(page, 'cmd');
    const input = page.getByTestId('cmd-input');
    await input.fill('users gpoole');
    await input.press('Enter');
    const output = page.getByTestId('cmd-output');
    await expect(output).toContainText('Sent as typed');
    // And the command that ran is the one that was asked for.
    await expect(output).toContainText('C:\\SUPPORT> users gpoole');
    await expect(output).toContainText('Gary Poole');
  });

  await clockOffFor(page, 1);
  await beginShift(page);

  /* -- Tuesday: the phone nobody put through, and the lie somebody saw ----- */

  /*
   * The Tuesday morning the week that goes well spends answering a phone.
   *
   * Here it is spent behind a red dot instead, which is the other half of the
   * same row: the call is never offered, the record of it is in the window
   * that would have rung, and the whole of what the player gave up for the
   * quiet is on the suspicion meter.
   */
  await step('call.missed-record', async () => {
    await page.getByTestId('presence-dnd').click();
    await expect(page.getByTestId('presence-state'))
      .toHaveText('Do not disturb');

    // Across the hour the phone would have gone, working the whole time, so
    // the dot is genuinely disagreeing with the log.
    await workUntilMinute(page, 100);

    for (let round = 0; round < 6; round += 1) {
      await doSomeWork(page);
      await runSimMinutes(page, 10, 4);
    }

    await openFromStartMenu(page, 'call');
    // Nothing ever took the screen: the window is open with nothing in it.
    await expect(page.getByTestId('call-app'))
      .toHaveAttribute('data-call', 'none');

    const missed = page.getByTestId('call-missed');

    await expect(missed).toBeVisible();
    await expect(missed).toContainText('printer');
    await expect(missed.getByText(/^\d\d:\d\d$/).first()).toBeVisible();
    await page.getByTestId('close-call').click();
  });

  /*
   * And the dot that stops nothing at all and lies about it.
   *
   * The world takes the reputation whether or not anybody reads a screen; what
   * this drives is the half that makes it fair - the person who has been
   * waiting longest for a first word says what they think of it, in the
   * conversation they would have said it in.
   */
  await step('chat.away-noticed', async () => {
    await page.getByTestId('presence-away').click();
    await expect(page.getByTestId('presence-state')).toHaveText('Away');

    await doSomeWork(page);
    // The sting's own notice, which is titled for a person nobody has named
    // yet - the chatter's toasts say who they are, and this one deliberately
    // does not, because the point of it is to send the player to the thread.
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Somebody has noticed' }),
    ).toHaveCount(1);

    // WHO is discovered rather than assumed: the world picks whoever has been
    // waiting longest, and a step that hard-coded a name would be a step about
    // the seeded order of a queue.
    const said = await page.evaluate(() => Object.entries(
      globalThis.careerSim?.screens().chat.threads ?? {},
    ).map(([speaker, thread]) => ({
      speaker,
      text: thread.lines.at(-1)?.text ?? '',
    })));
    const answered = said.find(
      (thread) => Object.values(AWAY_NOTICED_LINES).includes(thread.text),
    );

    expect(answered, 'nobody said anything about the dot').toBeDefined();

    await openFromStartMenu(page, 'chat');
    await page
      .getByTestId(`chat-person-${(answered?.speaker ?? '').split(':')[1] ?? ''}`)
      .click();
    await expect(page.getByTestId('chat-transcript'))
      .toContainText(answered?.text ?? '');

    // Back to the honest one for the rest of the week: what this walk is about
    // from here is a queue nobody worked, not a status nobody moved.
    await page.getByTestId('presence-available').click();
    await expect(page.getByTestId('presence-state')).toHaveText('Available');
  });

  await workUntilMinute(page, 372);

  await step('chat.option-favour', async () => {
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-terry').click();
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('quick favour');
    await chatOption(page, /Do it now, quietly/);
    await expect(page.getByTestId('chat-outcome')).toContainText('Done, from here');

    // The work happened and the week has no record that it did.
    await runSimMinutes(page, 20);
    await openFromStartMenu(page, 'tickets');
    await expect(page.getByTestId('ticket-row-must-change-password'))
      .toHaveCount(0);
  });

  await clockOffFor(page, 2);
  await beginShift(page);
  await clockOffFor(page, 3);
  await beginShift(page);

  await step('reboot.restart-now', async () => {
    // The other button on the countdown, and the one somebody with nothing
    // open presses: skipping the dread is legal and lands in exactly the same
    // place, twelve minutes later.
    await workUntilMinute(page, 365);
    await huntForReboot(page);
    await page.getByTestId('reboot-restart-now').click();
    await expect(page.getByTestId('reboot-detail'))
      .toContainText('You pressed it yourself');
    await expect(page.getByTestId('reboot-postpone')).toBeHidden();
    await runSimMinutes(page, 13, 1);
    await expect(page.getByTestId('desktop'))
      .toHaveAttribute('data-takeover', 'none');
    await expect(page.getByTestId('refocus-chip')).toBeVisible();
  });

  await clockOffFor(page, 4);
  await beginShift(page);

  /* -- Friday: the link, the small room, and the Monday after it ----------- */

  await workUntilMinute(page, 90);

  await step('chat.option-phish', async () => {
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-dennis').click();
    await chatOption(page, /Open the link yourself/);
    await expect(page.getByTestId('chat-outcome')).toContainText('Done, from here');
    await expect(page.getByTestId('chat-transcript')).not.toBeEmpty();
  });

  /*
   * The other half of the walk-up, in the week that has room for it: he is
   * sent to the form, he grumbles, and eight minutes later there is a ticket
   * with a clock on it. Same repair, same colleague, and the only version of
   * it anybody is ever paid for.
   */
  await step('call.walk-up-filed', async () => {
    const desk = await huntForTakeover(page, 'call', 180);

    expect(desk.source).toBe('walk_up');
    await page.getByTestId('call-answer').click();
    await page.getByTestId('call-option-1').click();
    await expect(page.getByTestId('call-transcript'))
      .toContainText('take the point about there being a record');
  });

  await workUntilMinute(page, 245);

  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-gary-restart')).toHaveCount(1);

  await workUntilMinute(page, 425);

  await step('review.fired', async () => {
    await expect(page.getByTestId('window-review')).toBeVisible();
    await expect(page.getByTestId('review-app'))
      .toHaveAttribute('data-outcome', 'fired');
    await expect(page.getByTestId('review-line'))
      .toContainText('not working out');
    // The shift does not end early. There are two hours left on it.
    await expect(page.getByTestId('review-note')).toContainText('two hours');
    await page.getByTestId('review-dismiss').click();
    // And the fridge stays shut: the beer was never about the beer.
    await expect(page.getByTestId('desk-beer'))
      .toHaveAttribute('data-locked', 'true');
  });

  await runToDayEnd(page);
  await expect(page.getByTestId('window-beer')).toHaveCount(0);
  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('window-weekend')).toBeVisible();
  await expect(page.getByTestId('weekend-verdict'))
    .toHaveAttribute('data-outcome', 'fired');

  const banked = await page.getByTestId('weekend-farm-total').textContent();
  expect(banked ?? '').toMatch(/£\d/);

  await step('weekend.offer-fired', async () => {
    // The worse offer, beside the retry. The trail it leaves is on it and the
    // second button would take the desperate job - verified present and enabled
    // here, taken in the switch run rather than this one, which clicks retry.
    await expect(page.getByTestId('weekend-offer'))
      .toHaveAttribute('data-tone', 'desperate');
    await expect(page.getByTestId('weekend-offer-body'))
      .toContainText('follows you');
    const accept = page.getByTestId('weekend-accept-offer');
    await expect(accept).toBeVisible();
    await expect(accept).toBeEnabled();
    await expect(accept).toHaveText(/Take the offer at .+/);
  });

  await step('weekend.onward-retry', async () => {
    const onward = page.getByTestId('weekend-onward');
    await expect(onward).toBeEnabled();
    await expect(onward).toHaveText('Start Monday again');
    await onward.click();

    // The retry rebuilds the world from nothing, which is a new page.
    await completeLogin(page, { brief: 'keep' });
    await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
    await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);
    await expect(page.getByTestId('weekend-heading')).toHaveCount(0);

    // They keep the desk, the queue and the lanyard. The fund is still yours.
    await openFromStartMenu(page, 'scorecard');
    await expect(page.getByTestId('scorecard-farm-total'))
      .toHaveText(banked ?? '');
  });
});

/* ========================================================================= *
 * The offer, taken. Its own run because accepting reloads the page into a
 * different world: the week run above sees the pass offer without taking it and
 * the fired run sees the worse one, and this is the single walk that crosses the
 * threshold - fire a week, take the desperate offer, and arrive at the second
 * employer with the standing and the fund carried across.
 * ========================================================================= */

test('walks the offer taken, and the arrival at the second employer', async ({
  page,
}) => {
  await recordControls(page);
  test.setTimeout(900_000);
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });
  await beginShift(page);

  // A week nobody worked, walked to the small room the cheap way: clock off each
  // day, and on the Friday let the review fire.
  for (let day = 1; day < 5; day += 1) {
    await clockOffFor(page, day);
    await beginShift(page);
  }

  await workUntilMinute(page, 425);
  await expect(page.getByTestId('review-app'))
    .toHaveAttribute('data-outcome', 'fired');
  await page.getByTestId('review-dismiss').click();
  await runToDayEnd(page);
  await page.getByTestId('scorecard-clock-off').click();
  await expect(page.getByTestId('window-weekend')).toBeVisible();

  const banked = await page.getByTestId('weekend-farm-total').textContent();

  await step('switch.accept', async () => {
    // The desperate offer, taken. It writes the career that crosses the
    // threshold, throws the save away, and reloads onto the next employer's
    // Monday - the same reload shape a retry uses, a different world on the far
    // side of it.
    const accept = page.getByTestId('weekend-accept-offer');
    await expect(accept).toBeEnabled();
    await accept.click();
  });

  await step('switch.arrive', async () => {
    // The new-machine screen names the shop before the log-on box: the arrival
    // riding the install screen the update wears.
    await expect(page.getByTestId('install-subject'))
      .toContainText('Bodgeworth');

    await completeLogin(page, { brief: 'keep' });

    // A first Monday at the new employer, and the fund carried across intact -
    // the joke the whole game is built on, unbroken by a change of company.
    await expect(page.getByTestId('sim-clock-day')).toHaveText('Day 1');
    await expect(page.getByTestId('sim-clock-time')).toHaveText(/^08:/);
    await openFromStartMenu(page, 'scorecard');
    await expect(page.getByTestId('scorecard-farm-total'))
      .toHaveText(banked ?? '');
  });
});

/**
 * The sysadmin run (E6): the promotion crossed, ssh, and the unix dialect.
 *
 * Its own session because a service-desk week cannot hold the engineer tier -
 * ssh is refused until the promotion fires, and the whole server surface lives
 * on the far side of that threshold. The MSP is stood up the way the shell
 * stands an arrival up: a switch record in storage carrying the standing the
 * offer is made at (the same seam msp.spec.ts uses), so booting lands on the
 * MSP's Monday with a reputation the promotion can be earned against.
 */
const E6_SWITCH_KEY = 'workgrumble/switch';
const E6_ARRIVAL = {
  employer: 'msp',
  career: {
    reputation: 74,
    title: 'IT Support Technician',
    farmFund: 30_000,
    trail: null,
  },
};

test('walks the promotion, ssh, and the unix terminal at the MSP', async ({
  page,
}) => {
  await recordControls(page);
  test.setTimeout(900_000);
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [E6_SWITCH_KEY, E6_ARRIVAL] as [string, typeof E6_ARRIVAL],
  );
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  // The arrival rides the update screen; close it if it is up, the way msp.spec
  // does, so the desktop is clear to work on.
  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    const close = arrival.getByTestId('window-close');

    if (await close.count()) {
      await close.first().click();
    }
  }

  await dismissBrief(page);
  await openFromStartMenu(page, 'cmd');

  await step('cmd.promotion', async () => {
    // Bare "promotion" reads as the earned OFFER first - the diegetic frame -
    // then "promotion accept" takes it, flips the tier through the real
    // dispatch, and raises the first incident (the downed client portal).
    await runCommand(page, 'promotion');
    await expect(page.getByTestId('cmd-output')).toContainText('they want you on');
    await runCommand(page, 'promotion accept');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Systems Engineer now');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('the client portal is down');
  });

  /*
   * The PLAN SURFACE (E10, 0.29.0, slice 2), walked around the terminal steps
   * below rather than in one block, because that is the only way to see it do
   * its job: it is a read of the world, so it is worth looking at BEFORE the
   * `fw` verbs move anything (the plan as it is handed over - four dates, one
   * phase live, three tasks that have not arrived and a rule list that is only
   * the pack) and AGAIN after them, where the same window has followed the
   * cable out and back with nothing stored to follow it.
   *
   * Same threshold as the terminal verbs and the same reason: no service-desk
   * week has a project to draw.
   */
  await step('projects.window', async () => {
    await openFromStartMenu(page, 'projects');

    await expect(page.getByTestId('projects-app')).toBeVisible();
    await expect(page.getByTestId('projects-name'))
      .toContainText('edge firewall replacement');
    await expect(page.getByTestId('projects-now')).toContainText('Now: Audit');

    // The four phases, each with the DATE it is due and the working time to
    // it. Both halves in one row is the whole design job: a date three days
    // out is not legible on its own.
    for (const phase of ['audit', 'staging', 'cutover', 'scream_test']) {
      await expect(page.getByTestId(`projects-phase-due-${phase}`))
        .toHaveText(/^Day \d+ \d\d:\d\d$/);
      await expect(page.getByTestId(`projects-phase-slack-${phase}`))
        .toContainText('of working time');
    }

    await expect(page.getByTestId('projects-phase-state-audit'))
      .toHaveText('NOW');
    await expect(page.getByTestId('projects-phase-state-cutover'))
      .toHaveText('TO DO');

    // And the rule set as far as ANYBODY knows it, which is the pack: the two
    // rules that exist only in the live configuration are not on this board,
    // because nobody has read the box yet.
    await expect(page.getByTestId('projects-rules-source'))
      .toContainText('From the handover pack');
    await expect(page.getByTestId('projects-rule-wan-default')).toBeVisible();
    await expect(page.getByTestId('projects-rule-vpn-brenmark')).toHaveCount(0);
  });

  await step('projects.task', async () => {
    // The task that HAS arrived goes to the queue, at itself.
    await page.getByTestId('projects-open-task-arden-fw-audit').click();
    await expect(page.getByTestId('ticket-detail-title'))
      .toContainText('establish the rule set');

    // The one that has not is a line on the plan rather than a dead row: it
    // says so, and its button says why it cannot be pressed.
    await focusWindow(page, 'projects');
    await page.getByTestId('projects-phase-staging').click();
    await expect(page.getByTestId('projects-task-state'))
      .toContainText('arrives when the task before it closes');
    await expect(page.getByTestId('projects-open-task-arden-fw-staging'))
      .toBeDisabled();

    // Shut it and go back to the terminal, which is where the next step does
    // the work. The board repaints every minute it is open, and the rest of
    // this run is measured in thousands of them.
    await page.getByTestId('close-projects').click();
    await expect(page.getByTestId('window-projects')).toHaveCount(0);
    await focusWindow(page, 'cmd');
  });

  /*
   * The first PROJECT (E10, 0.29.0), walked on the desktop terminal BEFORE the
   * ssh below, because that is where it lives: `fw` is a desk verb about a
   * customer's edge, and after `cmd.ssh` the terminal is standing on a server
   * and speaking unix.
   *
   * The project is assigned by the promotion two steps up, which is also what
   * makes this reachable at all: every `fw` verb is engineer-tier, so no
   * service-desk run can drive a single one of them.
   *
   * The scrollback rule this whole file is written under applies: `cmd-output`
   * is the entire session and is never cleared, so every assertion below is a
   * string this run has printed NOWHERE else - the pack line, the AVC-free
   * rule names, the two window sentences, and the cable moving each way.
   */
  await step('cmd.fw', async () => {
    // The plan, first: four phases with dates on them, and the one you are in.
    await runCommand(page, 'fw status');
    await expect(page.getByTestId('cmd-output')).toContainText('[NOW ] Audit');
    await expect(page.getByTestId('cmd-output')).toContainText('working min');

    // The pack, which is what exists before anybody reads the box - and it says
    // so without saying what is missing from it.
    await runCommand(page, 'fw rules ARD-FW-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('From the handover pack:');

    // And the box, which knows two things the pack does not.
    await runCommand(page, 'fw audit ARD-FW-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Live configuration read off ARD-FW-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('are not in the handover pack');
    await expect(page.getByTestId('cmd-output')).toContainText('vpn-brenmark');

    // The staging config: six rules, one command each, in canon's order.
    for (const rule of [
      'wan-default',
      'nat-portal',
      'policy-plant',
      'vpn-coalport',
      'vpn-brenmark',
      'nat-scanners',
    ]) {
      await runCommand(page, `fw migrate ${rule}`);
    }

    await expect(page.getByTestId('cmd-output')).toContainText('Carried onto');

    // The window, and the half that makes it a mechanic: the cutover is
    // REFUSED before the slot opens, and the refusal names where the paperwork
    // has got to rather than dead-ending.
    await runCommand(page, 'changereq file ARD-FW-02');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Change request filed with ARDEN-MFG');
    await runCommand(page, 'fw cutover ARD-FW-02');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is an outage on somebody\'s whole site');

    // Then the hour nobody wanted, bought a quarter at a time. The loop is
    // bounded rather than open: a window that never opens is a bug, and a walk
    // that waited for ever would report it as a timeout an hour later.
    const output = page.getByTestId('cmd-output');
    let moved = false;

    for (let pass = 0; pass < 10 && !moved; pass += 1) {
      await runSimMinutes(page, 15);
      await runCommand(page, 'fw cutover ARD-FW-02');
      moved = ((await output.textContent()) ?? '').includes('Circuit moved:');
    }

    expect(moved, 'the change window opened and the cutover was taken').toBe(true);
    await expect(output).toContainText('The site is behind the new box.');

    // The phase followed the cable, with nothing stored to follow it.
    await runCommand(page, 'fw status');
    await expect(output).toContainText('[NOW ] Scream test');

    // And back again, which is a real verb: the site returns to the box that
    // was working an hour ago, the derivation follows, and the window is spent.
    await runCommand(page, 'fw rollback ARD-FW-01');
    await expect(output).toContainText('Circuit moved back:');
    await expect(output).toContainText('The window is spent');
    await runCommand(page, 'fw status');
    await expect(output).toContainText('[NOW ] Cutover');
  });

  /*
   * THE SHEET (0.30.0, slice 1), read the minute after a morning of real work -
   * which is the only place it can be read, because it is derived from what the
   * engine recorded and there is nothing on it until something has been done.
   *
   * The engineer's shape: a line per customer, the project as an attributable
   * line of its own carrying its code, a billable flag, and the rest of the
   * working day underneath as time on nobody's invoice. Both numbers on every
   * row - worked and claimed - which is what makes padding one a thing done
   * with the truth on the screen beside it.
   */
  await step('cmd.timesheet-attributed', async () => {
    await focusWindow(page, 'cmd');
    await runCommand(page, 'timesheet');

    const sheet = page.getByTestId('cmd-output');

    await expect(sheet).toContainText('Timesheet - week to date');
    await expect(sheet).toContainText('ARDEN-MFG: edge firewall replacement');
    await expect(sheet).toContainText('billable');
    // The second cost of a morning that was not all billable: the rest of it,
    // on nobody's invoice, said out loud rather than left to be inferred.
    await expect(sheet).toContainText('unattributed');

    // The pad, and the half that makes it a mechanic: the claim moves and the
    // worked column does not. Line 1.1 is the first line of day one, printed
    // down the left of the sheet a moment ago.
    await runCommand(page, 'timesheet claim 1.1 420');
    await expect(sheet).toContainText('7h claimed against');
    await expect(sheet).toContainText('The records still say what they said');

    // And the other axis, which the research says is the one that actually
    // decides a challenge: how much of a sentence goes beside the number.
    await runCommand(page, 'timesheet vague 1.1');
    await expect(sheet).toContainText('now reads "consulting"');
    await runCommand(page, 'timesheet');
    await expect(sheet).toContainText('(vague)');

    // And the OTHER reader of the same week (0.30.0, slice 2): what the
    // business makes of the total. It is a row and not a verdict - the number,
    // the target, and the arithmetic behind it - and the honest engineer's
    // week does not reach the seventy-five the trade asks for, which costs
    // exactly nothing anywhere in this game.
    await expect(sheet).toContainText('Utilisation:');
    await expect(sheet).toContainText('% billable, against the 75%');
    await expect(sheet).toContainText('the business asks for');
  });

  /*
   * THE WATERMELON (0.30.0, slice 3): green on the outside, red in the middle.
   *
   * A colour, filed - and the only verb in the `fw` family that changes nothing
   * at all about the estate. The terminal prints the plan's OWN colour in the
   * same breath, which is what makes the mechanic something the player can see
   * the shape of rather than a trap: the two readings are side by side, one of
   * them derived from the work and one of them typed.
   */
  await step('cmd.fw-report', async () => {
    const out = page.getByTestId('cmd-output');

    await runCommand(page, 'fw report puce');
    await expect(out).toContainText('It is green, amber or red');

    await runCommand(page, 'fw report green');
    await expect(out).toContainText('Status filed: GREEN.');
    await expect(out).toContainText('Reported today: GREEN');
    await expect(out).toContainText('The plan says:');

    // Filed again, and the last thing said on a day is what the business has.
    await runCommand(page, 'fw report amber');
    await expect(out).toContainText('Status filed: AMBER.');
    await expect(out).toContainText('Reported today: AMBER');

    // It moved a colour and nothing else: the board still reads the phase off
    // the work, which is the whole architecture of the slice.
    await runCommand(page, 'fw status');
    await expect(out).toContainText('Reported today: AMBER');
  });

  /*
   * THE SAME SHEET, THROUGH THE WINDOW (0.30.0). The terminal has just moved
   * two things on it; this opens the other door onto the same state and does
   * the engineer's half of the mechanic with the two numbers on the screen
   * beside each other, which is the whole reason the window exists.
   */
  await openFromStartMenu(page, 'timesheet');

  const sheetRows = page.locator('[data-testid^="timesheet-line-"]');

  /*
   * All three under ONE pause, and that is the house rule rather than a
   * convenience. The worked column of an open line GROWS every tick - the
   * segment the player is standing in is still running - so at x4 a figure read
   * off the row is a different number by the time an assertion has retried
   * against it once, which is exactly how this step first went red on the box
   * (6m expected, 26m by the fourth attempt). Everything below is about what
   * the sheet DOES with a claim, and none of it needs the clock moving.
   *
   * The arithmetic of a line is not asserted here at all, in any of the three:
   * that is `src/shell/apps/timesheet.test.ts` and `src/shell/timesheet.test.ts`,
   * where a minute is a minute and nothing is racing a repaint. What a browser
   * proves is the direction - the claim moved, the record did not follow it.
   */
  await underPause(page, async () => {
    await step('timesheet.claim', async () => {
      await expect(page.getByTestId('timesheet-stance'))
        .toContainText('A line per customer');
      await expect(sheetRows.first()).toBeVisible();

      // The pad is driven from what the ENGINE says the line was worth, read
      // off the row: a walk that typed a figure of its own would be a walk that
      // quietly claimed less than the truth on a slow morning.
      const handle = await sheetRows.first().getAttribute('data-handle') ?? '';
      const worked = Number(
        await sheetRows.first().getAttribute('data-worked'),
      );

      expect(worked).toBeGreaterThan(0);

      const claim = worked + 60;

      await page.getByTestId(`timesheet-minutes-${handle}`)
        .fill(String(claim));
      await page.getByTestId(`timesheet-put-${handle}`).click();

      // Both figures now, and the record did not follow the claim: the row's
      // own reading of the gap says the claim is OVER, the second figure is on
      // screen, and what the engine recorded is still less than what was
      // typed. Relative, not exact - the record is a live number and the claim
      // is a piece of paper, which is the whole mechanic.
      await expect(sheetRows.first()).toHaveAttribute('data-gap', 'over');
      await expect(page.getByTestId(`timesheet-claimed-${handle}`))
        .toBeVisible();
      await expect(page.getByTestId('timesheet-outcome'))
        .toContainText('The records still say what they said');

      const after = Number(
        await sheetRows.first().getAttribute('data-worked'),
      );

      expect(after).toBeGreaterThan(0);
      expect(after).toBeLessThan(claim);
    });

    await step('timesheet.detail', async () => {
      const row = sheetRows.last();
      const handle = await row.getAttribute('data-handle') ?? '';
      const detail = page.getByTestId(`timesheet-detail-${handle}`);
      const reads = page.getByTestId(`timesheet-reads-${handle}`);

      // Both directions, from whichever way round the terminal left it. Written
      // out in full is a date, an estate and a number of hours; the other one is
      // a word, which is exactly what makes it look like one.
      await detail.selectOption('detailed');
      await expect(row).toHaveAttribute('data-detail', 'detailed');
      await expect(reads).toContainText('/1998');

      await detail.selectOption('vague');
      await expect(row).toHaveAttribute('data-detail', 'vague');
      await expect(reads).toHaveText('consulting');
    });

    await step('timesheet.submit', async () => {
      await page.getByTestId('timesheet-submit').click();

      await expect(page.getByTestId('timesheet-stamp'))
        .toContainText('Submitted at');
      await expect(page.getByTestId('timesheet-submit')).toBeDisabled();
      // Frozen, line by line: not one row still offers an edit, and the claims
      // that were made are standing on it.
      await expect(page.locator('[data-testid^="timesheet-minutes-"]'))
        .toHaveCount(0);
      await expect(page.locator('[data-testid^="timesheet-detail-"]'))
        .toHaveCount(0);
      await expect(sheetRows.first()).toHaveAttribute('data-gap', 'over');
    });
  });

  await step('projects.phase', async () => {
    // The same window, opened again after the terminal moved the world twice.
    // Nothing here was told what happened - the board is a read, so the audit
    // and the staging config are behind it, the cable went out and came back,
    // and the phase it is standing in came back with it. A window that had
    // been sitting open would prove the same thing; a fresh one proves it
    // without a single repaint's worth of memory to do it with.
    await openFromStartMenu(page, 'projects');

    await expect(page.getByTestId('projects-phase-state-audit'))
      .toHaveText('DONE');
    await expect(page.getByTestId('projects-phase-state-staging'))
      .toHaveText('DONE');
    await expect(page.getByTestId('projects-now')).toContainText('Now: Cutover');
    await expect(page.getByTestId('projects-stamps'))
      .toContainText('Rolled back at');

    // The blocked state, in words: a project that is ready and may not move is
    // not a project that has stopped, and the board says which of the two
    // kinds of waiting this is.
    await expect(page.getByTestId('projects-blocked'))
      .toContainText('change window');

    // Standing on a phase reads its own date against now, which is the thing
    // the phase rows are for.
    await page.getByTestId('projects-phase-scream_test').click();
    await expect(page.getByTestId('projects-detail-when'))
      .toContainText(/^Due Day \d+ \d\d:\d\d - /);

    // The watermelon, on the one screen it has to be legible on (0.30.0): what
    // was reported today, beside what the plan says. The terminal filed AMBER
    // a few steps up and nothing about the work moved when it did, so the two
    // halves of this row come from two different places by construction.
    await expect(page.getByTestId('projects-report'))
      .toHaveAttribute('data-reported', 'amber');
    await expect(page.getByTestId('projects-report'))
      .toContainText('Status report: AMBER.');
    await expect(page.getByTestId('projects-report'))
      .toContainText('The plan says');

    // And the rule list is the box's now, not the pack's - the audit two steps
    // up found the tunnel nobody wrote down, and the board shows it carried.
    await expect(page.getByTestId('projects-rules-source'))
      .toContainText('Read off the box');
    await expect(page.getByTestId('projects-rule-vpn-brenmark'))
      .toContainText('carried');

    await page.getByTestId('close-projects').click();
    await focusWindow(page, 'cmd');
  });

  await step('cmd.ssh', async () => {
    // Past the promotion ssh connects to the MSP's OWN box - FC-RMM-01, where
    // the portal is down: trust-on-first-use shows the fingerprint, records the
    // host, and the prompt becomes the server's.
    await runCommand(page, 'ssh pat@FC-RMM-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('ED25519 key fingerprint is');
    await expect(page.locator('.cmd-prompt').first())
      .toHaveText('pat@FC-RMM-01:~$');
  });

  await step('cmd.journalctl', async () => {
    // The why, before the fix: the journal shows the crash and the start-limit.
    await runCommand(page, 'journalctl -u fcportal');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Start request repeated too quickly');
  });

  await step('cmd.df', async () => {
    // The disk, in the Mounted-on shape - no drive letter.
    await runCommand(page, 'df -h');
    await expect(page.getByTestId('cmd-output')).toContainText('Mounted on');
  });

  await step('cmd.ps', async () => {
    // The processes: systemd as PID 1, and a downed unit honestly absent.
    await runCommand(page, 'ps aux');
    await expect(page.getByTestId('cmd-output')).toContainText('/sbin/init');
  });

  await step('cmd.ip', async () => {
    // The address, in CIDR - the family difference from ipconfig.
    await runCommand(page, 'ip a');
    await expect(page.getByTestId('cmd-output')).toContainText('inet 10.42.0');
  });

  await step('cmd.ls', async () => {
    // The mode/owner/group columns, the family difference from dir.
    await runCommand(page, 'ls -la');
    await expect(page.getByTestId('cmd-output')).toContainText('drwxr-xr-x');
  });

  await step('cmd.ss', async () => {
    // The listeners, in the real State/Local Address:Port shape: sshd holds 22,
    // nginx is up - but the portal is failed, so its 8000 upstream is honestly
    // absent. ss is how a not-listening service is diagnosed before the fix.
    await runCommand(page, 'ss -tlnp');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Local Address:Port');
    await expect(page.getByTestId('cmd-output')).toContainText('*:22');

    // The not-installed gags, right where they belong: ss is canonical, and
    // netstat/ifconfig (net-tools), traceroute and htop are NOT on a stock box -
    // a real command-not-found with Ubuntu's own "sudo apt install" hint, never
    // a fake output. This teaches ip/ss as the tools to learn.
    await runCommand(page, 'netstat -tlnp');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('sudo apt install net-tools');
    await runCommand(page, 'traceroute FC-RMM-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('sudo apt install traceroute');
    await runCommand(page, 'htop');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('sudo apt install htop');
  });

  await step('cmd.apt', async () => {
    // The pending-updates state (0.20.0): FC-RMM-01 is behind on patches, incl a
    // security one. apt update reads the count, apt list --upgradable lists them.
    await runCommand(page, 'sudo apt update');
    await expect(page.getByTestId('cmd-output')).toContainText('can be upgraded');
    await runCommand(page, 'apt list --upgradable');
    await expect(page.getByTestId('cmd-output')).toContainText('upgradable from');
    // libssl3t64/noble-security - the security update is always in the set.
    await expect(page.getByTestId('cmd-output')).toContainText('security');

    // INSTALL CLOSES THE GAG: htop was command-not-found up in cmd.ss. After
    // apt install it is present - the real NEW-packages shape, then it RUNS.
    await runCommand(page, 'sudo apt install htop');
    await expect(page.getByTestId('cmd-output')).toContainText('Setting up htop');

    // Apply the updates: the box is clean after, and apt update says so.
    await runCommand(page, 'sudo apt upgrade');
    await expect(page.getByTestId('cmd-output')).toContainText('0 not upgraded');
    await runCommand(page, 'sudo apt update');
    await expect(page.getByTestId('cmd-output')).toContainText('up to date');
  });

  await step('cmd.gagged-tools-installed', async () => {
    // The loop closed, walked: htop now RUNS (it was gagged in cmd.ss), and net-
    // tools + traceroute install and then run in their real shapes. Before the
    // install each was command-not-found; the box's installed set is the switch.
    await runCommand(page, 'htop');
    await expect(page.getByTestId('cmd-output')).toContainText('Load average');

    await runCommand(page, 'sudo apt install net-tools');
    await runCommand(page, 'ifconfig');
    // The dotted netmask - the family diff from ip a's /24 the gag taught toward.
    await expect(page.getByTestId('cmd-output'))
      .toContainText('netmask 255.255.255.0');
    await runCommand(page, 'netstat -tlnp');
    await expect(page.getByTestId('cmd-output')).toContainText('LISTEN');

    await runCommand(page, 'sudo apt install traceroute');
    await runCommand(page, 'traceroute FC-RMM-01');
    await expect(page.getByTestId('cmd-output')).toContainText('hops max');
  });

  await step('cmd.dpkg', async () => {
    // The installed set read: dpkg -l shows the apt-installed packages as ii,
    // agreeing with apt install off the one real box field.
    await runCommand(page, 'dpkg -l');
    await expect(page.getByTestId('cmd-output')).toContainText('ii  htop');
  });

  await step('cmd.dig', async () => {
    // Name resolution the long way, over the estate DNS: the ANSWER SECTION.
    await runCommand(page, 'dig FC-RMM-01');
    await expect(page.getByTestId('cmd-output')).toContainText('ANSWER SECTION');
  });

  await step('cmd.host', async () => {
    // The terse cousin: "name has address addr".
    await runCommand(page, 'host FC-RMM-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('has address 10.42.0');
  });

  await step('cmd.ping.unix', async () => {
    // Continuous by default - the sharpest family diff. It SAYS it would keep
    // going and names -c; a Windows 4-and-stop would fail this.
    await runCommand(page, 'ping FC-RMM-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('does not stop on its own');
    // Bounded with -c: the transmitted/received statistics block.
    await runCommand(page, 'ping -c 4 FC-RMM-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('4 packets transmitted');
  });

  await step('cmd.curl', async () => {
    // The HTTP truth that pairs with ss: nginx ANSWERS (server: nginx) but 502s,
    // because its upstream - the portal - is down. The diagnosis before restart.
    await runCommand(page, 'curl -I http://localhost');
    await expect(page.getByTestId('cmd-output')).toContainText('502');
    await expect(page.getByTestId('cmd-output')).toContainText('server: nginx');
  });

  await step('cmd.breakglass', async () => {
    // Change control (0.18.0): fcportal is DOWN in an active incident, so the box
    // has a real fire on it. That makes break-glass LEGITIMATE - the emergency,
    // audited override outside the change window - so bouncing nginx to help
    // clear it is allowed and logged loudly, where the same restart in hours with
    // nothing on fire would be a NORMAL change waiting on a request + window.
    await runCommand(page, 'breakglass nginx');
    await expect(page.getByTestId('cmd-output')).toContainText('BREAK-GLASS');
    await expect(page.getByTestId('cmd-output')).toContainText('logged');
    // fcportal is untouched by that - the fire is still lit for the fix below.
    await runCommand(page, 'systemctl status fcportal');
    await expect(page.getByTestId('cmd-output')).toContainText('Active: failed');
  });

  await step('cmd.systemctl', async () => {
    // THE FIX: status shows it failed, restart is SILENT on success, and status
    // reads running afterwards - the payoff, walked on the real build. Then the
    // scope wall proven still up: a customer's out-of-scope server refuses the
    // same verb, so the fix on our OWN box is non-bypassing.
    await runCommand(page, 'systemctl status fcportal');
    await expect(page.getByTestId('cmd-output')).toContainText('Active: failed');

    await runCommand(page, 'systemctl restart fcportal');
    await runCommand(page, 'systemctl status fcportal');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Active: active (running)');

    await runCommand(page, 'exit');
    await runCommand(page, 'ssh pat@MERI-APP-01');
    await runCommand(page, 'systemctl restart grumbleapp');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('CONTRACT still governs');
  });

  /* -- 0.19.0/0.21.0: the other three incidents the promotion raised ------ */

  /*
   * These sit AFTER cmd.systemctl on purpose, and it is not narrative taste.
   * That step's payoff is a bare "Active: active (running)" asserted against
   * `cmd-output`, which is the whole scrollback and is never cleared - so ANY
   * other unit coming up above it would have satisfied that line before the
   * portal restart it is about ever ran, and the step would go green on a
   * portal still down. Three units come up below, so they come up after it.
   * Leaving MERI-APP-01 and ssh-ing home is the price; FC-RMM-01 is a known
   * host by now, so it connects straight through.
   */
  await runCommand(page, 'exit');
  await runCommand(page, 'ssh pat@FC-RMM-01');
  await expect(page.locator('.cmd-prompt').first())
    .toHaveText('pat@FC-RMM-01:~$');

  await step('cmd.whoami.unix', async () => {
    // The family difference IS the whole command: a Linux box answers the bare
    // login, where the desktop whoami answers a domain\user. Read off the last
    // line rather than as a substring - "pat" is in the prompt of every line
    // above it, so containment would pass on a whoami that printed nothing.
    // Safe anywhere on the box: it reads the session and writes nothing.
    await runCommand(page, 'whoami');
    await expect(page.getByTestId('cmd-output').locator('.cmd-line-out').last())
      .toHaveText('pat');
  });

  await step('cmd.id', async () => {
    // Identity at fidelity: the login is a sudoer carrying adm, root really is
    // uid 0, and a name the box does not have is refused rather than invented.
    // Safe here for the same reason as whoami - three reads, no writes.
    await runCommand(page, 'id');
    await expect(page.getByTestId('cmd-output')).toContainText(
      'uid=1000(pat) gid=1000(pat) groups=1000(pat),4(adm),27(sudo)',
    );

    await runCommand(page, 'id root');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('uid=0(root) gid=0(root) groups=0(root)');

    await runCommand(page, 'id nobodyhere');
    await expect(page.getByTestId('cmd-output'))
      .toContainText("id: 'nobodyhere': no such user");
  });

  await step('cmd.getent', async () => {
    // /etc/passwd's own seven colon-fields, off a user set DERIVED from the
    // box: www-data is here because nginx is, and fcauth is here because the
    // permission incident put that unit on this machine. The single-user query
    // runs FIRST - the scrollback is never cleared and the full listing holds
    // every line the one-user answer would, so the order is the only thing
    // keeping the two apart.
    // Safe here: reads only, and it wants the incident units already present,
    // which they have been since cmd.promotion.
    await runCommand(page, 'getent passwd root');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('root:x:0:0:root:/root:/bin/bash');

    await runCommand(page, 'getent passwd');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('pat:x:1000:1000::/home/pat:/bin/bash');
    await expect(page.getByTestId('cmd-output'))
      .toContainText(/fcauth:x:9\d\d:9\d\d::\/nonexistent:\/usr\/sbin\/nologin/u);

    // And only the database it models: the honest refusal, not a faked group.
    await runCommand(page, 'getent group root');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is a database it does not model here');
  });

  await step('cmd.du', async () => {
    // The disk-full drill, whole. df says 40G of 40G is gone with 188M left,
    // du -sh names the journal as where it went, du -h /var/log puts nginx's
    // ordinary logs beside it as the size the runaway is measured against, and
    // the vacuum hands the bytes back. du reads the box's journal_bytes field,
    // so the second read CHANGING to the vacuum target is what proves it is a
    // fact rather than a printed constant - and df agrees, off the same fix.
    // Safe here: nothing later reads the disk. cmd.df asserted the column
    // shape, not a number, and it has already run.
    await runCommand(page, 'df -h');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('/dev/root 40G 40G 188M 100% /');

    await runCommand(page, 'du -sh /var/log/journal');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('26G /var/log/journal');
    await runCommand(page, 'du -h /var/log');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('12M /var/log/nginx');

    await runCommand(page, 'journalctl --vacuum-size=200M');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Vacuuming done, freed 26G');

    // The same command, a different answer, because the world moved.
    await runCommand(page, 'du -sh /var/log/journal');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('200M /var/log/journal');
    await runCommand(page, 'df -h');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('/dev/root 40G 14G 26G 35% /');
  });

  await step('cmd.certbot', async () => {
    // The cert-expiry incident, which is a PROCESS failure: nginx never went
    // down, the certificate simply ran out, and curl is what shows a box
    // running and refusing. "certbot certificates" reads the state on either
    // side of the renew, and that read-back is the flip - the scrollback is
    // cumulative, so "curl no longer says expired" is not a sentence this
    // terminal can be asked. Then the renew against the now-good cert refuses
    // in certbot's own words instead of churning a fresh one.
    // Safe here: cmd.curl's 502 was plain http off the downed portal, which
    // nothing below touches, and no later step reads the certificate.
    await runCommand(page, 'curl -I https://fc-rmm-01');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('certificate has expired');
    await runCommand(page, 'certbot certificates');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Expiry Date: EXPIRED (renew now: certbot renew)');

    await runCommand(page, 'certbot renew');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Congratulations, all renewals succeeded');
    await runCommand(page, 'certbot certificates');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Expiry Date: valid (not yet due for renewal)');

    await runCommand(page, 'certbot renew');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Certificate not yet due for renewal; no action taken');
  });

  await step('cmd.chown', async () => {
    // The permission-denied incident, first half. The deploy left the secret
    // env file root:root at 600, so the service account cannot read it: ls -la
    // is the diagnosis, chown is half the fix, and the listing after it is the
    // read-back - chown writes the SAME fs_owner/fs_group fields ls -la
    // renders, so the group column moving to fcauth while the mode stays 600
    // is the no-drift proof. The owner is validated against the box's real
    // user set, which is why a name it does not have is refused.
    // Safe here: fcauth is a unit no other step in this run reads.
    await runCommand(page, 'ls -la /etc/fcauth/auth.env');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('-rw------- 1 root root');

    await runCommand(page, 'chown nobodyhere /etc/fcauth/auth.env');
    await expect(page.getByTestId('cmd-output'))
      .toContainText("chown: invalid user: 'nobodyhere'");

    // Silent on success, the way a real chown is - the listing is the answer.
    await runCommand(page, 'chown root:fcauth /etc/fcauth/auth.env');
    await runCommand(page, 'ls -la /etc/fcauth/auth.env');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('-rw------- 1 root fcauth');
  });

  await step('cmd.chmod', async () => {
    // The other half, and the payoff. With the bits still 600 the group cannot
    // read the file, so systemd refuses the start and leaves the unit down -
    // the fix is not a retry. chmod 640 is least privilege (the group reads,
    // the world does not), ls -la reads the new column straight back off the
    // same fs_mode field, and only THEN does the restart take. The Main PID
    // line is the assertion because it exists solely on a unit that is really
    // running, where a bare "Active: active (running)" is true of half the box.
    // Safe here: fcauth coming up is invisible to every later step, and
    // cmd.systemctl's own running-read was already made above this block.
    await runCommand(page, 'systemctl restart fcauth');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Job for fcauth.service failed');

    await runCommand(page, 'chmod 640 /etc/fcauth/auth.env');
    await runCommand(page, 'ls -la /etc/fcauth/auth.env');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('-rw-r----- 1 root fcauth');

    await runCommand(page, 'systemctl restart fcauth');
    await runCommand(page, 'systemctl status fcauth');
    await expect(page.getByTestId('cmd-output'))
      .toContainText(/Main PID: \d+ \(fcauth\)/u);
  });

  await step('cmd.postmortem', async () => {
    // The failed-deploy incident, which does NOT close on the restart - that
    // is the whole of what the tier is. The trail starts empty, the write-up
    // is refused while the fire is still burning, the rollback brings the
    // worker up, and only then does the postmortem take. Then the trail reads
    // back, and the TICKET is checked off the queue rather than off the
    // terminal's own "the incident is closed": that line prints on a
    // successful dispatch, so believing it would be believing the call
    // instead of the goal.
    // Safe here: last thing done on the box, and the queue excursion puts the
    // terminal back exactly as it found it for cmd.logout below.
    await runCommand(page, 'postmortem list');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('No postmortems on the record yet.');

    await runCommand(page, 'journalctl -u fcworker');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('it worked in staging because staging sets it');
    await runCommand(page, 'postmortem file fcworker');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('The service is still down');

    await runCommand(page, 'systemctl restart fcworker');
    await runCommand(page, 'systemctl status fcworker');
    await expect(page.getByTestId('cmd-output'))
      .toContainText(/Main PID: \d+ \(fcworker\)/u);

    await runCommand(page, 'postmortem file fcworker');
    await expect(page.getByTestId('cmd-output')).toContainText(
      'Postmortem filed for fcworker.service. The incident is closed.',
    );
    // Blameless: the write-up analyses the system, and the section that says
    // so by name is the one the authored prose is gated on.
    await expect(page.getByTestId('cmd-output'))
      .toContainText('WHAT THE SYSTEM LET HAPPEN');

    await runCommand(page, 'postmortem list');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('1 postmortem(s) on the record:');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('unit:fc-rmm-01/fcworker.service@');

    // The goal, off the queue: the restart alone left this open, and this is
    // the only read that can tell the difference.
    await expectClosed(page, 'syseng-failed-deploy');
    await page.getByTestId('close-tickets').click();
    await focusWindow(page, 'cmd');
  });

  await step('cmd.logout', async () => {
    // Leaves the session, back to the desktop terminal and its Windows prompt.
    await runCommand(page, 'logout');
    await expect(page.locator('.cmd-prompt').first()).toHaveText(/C:\\/);
  });

  await step('cmd.exit', async () => {
    // The other spelling: ssh back to our own box (known host now, no
    // fingerprint) and exit out again.
    await runCommand(page, 'ssh pat@FC-RMM-01');
    await expect(page.locator('.cmd-prompt').first())
      .toHaveText('pat@FC-RMM-01:~$');
    await runCommand(page, 'exit');
    await expect(page.locator('.cmd-prompt').first()).toHaveText(/C:\\/);
  });

  /* -- 0.27.0: the engineer's own desktop, and the distro under it -------- */

  const desktop = page.getByTestId('desktop');

  await step('display.desktop', async () => {
    await openFromStartMenu(page, 'display');

    // KDE: the comfortable landing. Bottom panel, Kickoff in the corner, and
    // every window button where a Windows refugee left it.
    await page.getByTestId('display-desktop-kde').click();
    await expect(page.getByTestId('display-refusal')).toBeHidden();
    await expect(desktop).toHaveAttribute('data-skin', 'kde');
    await expect(desktop).toHaveAttribute('data-panel', 'bottom');
    await expect(page.getByTestId('start-button')).toContainText('Kickoff');
    await expect(page.getByTestId('taskbar-windows')).toBeVisible();
    await expect(page.getByTestId('minimize-display')).toHaveCount(1);
    // The distro came with it: KDE ships on the Fedora edition here.
    await expect(page.getByTestId('display-current')).toContainText('Fedora');

    // GNOME: the top bar, no window list, and the sharp tell. The minimize
    // button is not hidden - it IS NOT IN THE DOCUMENT - and neither is the
    // maximize; a CSS-hidden fake would pass a visibility check and fails this.
    await page.getByTestId('display-desktop-gnome').click();
    await expect(desktop).toHaveAttribute('data-skin', 'gnome');
    await expect(desktop).toHaveAttribute('data-panel', 'top');
    await expect(page.getByTestId('start-button')).toContainText('Activities');
    await expect(page.getByTestId('taskbar-windows')).toHaveCount(0);
    await expect(page.getByTestId('minimize-display')).toHaveCount(0);
    await expect(page.getByTestId('close-display')).toHaveCount(1);
    await expect(
      page.getByTestId('window-display').locator('.window-maximize'),
    ).toHaveCount(0);

    // And the product still works underneath it, which is the bug this step
    // forbids: a skin is a LOOK, so the queue opens and a ticket still reads
    // the same on the desktop with no taskbar on it.
    await openFromStartMenu(page, 'tickets');
    await expect(page.getByTestId('window-tickets')).toBeVisible();
    await expect(page.getByTestId('tickets-summary')).toContainText('open');
    await expect(page.getByTestId('tickets-queue')).toBeVisible();
    await page.getByTestId('close-tickets').click();

    // Xfce and LXQt (0.28.0): the other two bottom-panel desktops, and the
    // proof they are not the same desktop twice. Same edge, same three window
    // buttons - so the CORNER is what tells them apart, and it is asserted as
    // the exact word rather than as containment: "Applications" contains no
    // part of "LXQt" and neither contains "Menu", so a launcher that failed to
    // repaint would be caught rather than pass on a leftover.
    await openFromStartMenu(page, 'display');
    await page.getByTestId('display-desktop-xfce').click();
    await expect(desktop).toHaveAttribute('data-skin', 'xfce');
    await expect(desktop).toHaveAttribute('data-panel', 'bottom');
    await expect(desktop).toHaveAttribute('data-launcher', 'applications');
    await expect(page.getByTestId('start-button')).toHaveText('Applications');
    await expect(page.getByTestId('taskbar-windows')).toBeVisible();
    await expect(page.getByTestId('minimize-display')).toHaveCount(1);

    await page.getByTestId('display-desktop-lxqt').click();
    await expect(desktop).toHaveAttribute('data-skin', 'lxqt');
    await expect(desktop).toHaveAttribute('data-panel', 'bottom');
    await expect(desktop).toHaveAttribute('data-launcher', 'plain');
    await expect(page.getByTestId('start-button')).toHaveText('LXQt');
    await expect(page.getByTestId('minimize-display')).toHaveCount(1);

    // Cinnamon: the joke. Back to a bottom panel and all three buttons - the
    // Linux desktop that looks most like the one you left.
    await page.getByTestId('display-desktop-cinnamon').click();
    await expect(desktop).toHaveAttribute('data-skin', 'cinnamon');
    await expect(desktop).toHaveAttribute('data-panel', 'bottom');
    await expect(page.getByTestId('start-button')).toContainText('Menu');
    await expect(page.getByTestId('minimize-display')).toHaveCount(1);
  });

  /*
   * MATE, and the second panel with it. It sits BETWEEN the desktop step and
   * the distro step on purpose, and the ordering is not taste: `display.distro`
   * below opens on a Cinnamon box speaking apt and asserts that moving to
   * Fedora leaves the DESKTOP where it is, so whatever runs in here has to hand
   * the machine back exactly as it found it. That is also the honest ending for
   * this step - leaving MATE is the only way to see the second bar taken out of
   * the document again, which is the half of the extension the other six
   * desktops depend on.
   */
  await step('display.two-panels', async () => {
    const secondBar = page.getByTestId('taskbar-second');

    await page.getByTestId('display-desktop-mate').click();
    await expect(desktop).toHaveAttribute('data-skin', 'mate');
    await expect(desktop).toHaveAttribute('data-panel', 'top');
    await expect(desktop).toHaveAttribute('data-panel-second', 'bottom');
    await expect(secondBar).toBeVisible();

    // The split, asked INSIDE each bar: the launcher is up in the menu bar, and
    // the window list and the clock are down in the taskbar. Two panels that
    // both existed with everything in the wrong one would satisfy every count
    // taken across the whole page, which is why none of these are.
    const menuBar = page.getByTestId('taskbar');
    await expect(menuBar.getByTestId('start-button'))
      .toHaveText('Applications');
    await expect(menuBar.getByTestId('taskbar-windows')).toHaveCount(0);
    await expect(menuBar.getByTestId('sim-clock')).toHaveCount(0);
    await expect(secondBar.getByTestId('taskbar-windows')).toBeVisible();
    await expect(secondBar.getByTestId('sim-clock')).toBeVisible();

    // ONE window list on the machine, not one per bar - and it is the live one:
    // the queue opens from the top bar and its button appears in the bottom.
    await expect(page.getByTestId('taskbar-windows')).toHaveCount(1);
    await openFromStartMenu(page, 'tickets');
    await expect(secondBar.getByTestId('taskbar-button-tickets')).toBeVisible();
    await expect(page.getByTestId('tickets-summary')).toContainText('open');
    await page.getByTestId('close-tickets').click();

    // And back to Cinnamon, which is where the next step needs the box: the
    // second bar leaves the DOCUMENT, rather than being emptied and hidden.
    await focusWindow(page, 'display');
    await page.getByTestId('display-desktop-cinnamon').click();
    await expect(desktop).toHaveAttribute('data-skin', 'cinnamon');
    await expect(desktop).toHaveAttribute('data-panel-second', 'none');
    await expect(secondBar).toHaveCount(0);
    await expect(page.getByTestId('taskbar-windows')).toBeVisible();
  });

  /*
   * The Mac (0.33.0), between the second-panel step and the distro step for
   * exactly the reason MATE is: it borrows the machine and hands it back on
   * Cinnamon-and-Mint, which is what `display.distro` below opens on.
   *
   * It is the same extension as MATE's used the other way round - launcher
   * panel at the bottom, other bar on top - plus the two primitives nothing
   * before it needed: a bar that is a MENU BAR, and a titlebar whose buttons
   * are at the other end in the other order.
   */
  await step('display.mac-chrome', async () => {
    const menuBar = page.getByTestId('taskbar-second');
    const dock = page.getByTestId('taskbar');

    await page.getByTestId('display-desktop-orchard').click();
    await expect(desktop).toHaveAttribute('data-skin', 'orchard');
    await expect(desktop).toHaveAttribute('data-panel', 'bottom');
    await expect(desktop).toHaveAttribute('data-panel-second', 'top');
    await expect(desktop).toHaveAttribute('data-launcher', 'dock');
    // Not Linux, so not on a distribution - and the window says the true
    // reason there is no package manager rather than the beige box's one.
    await expect(desktop).toHaveAttribute('data-distro', 'none');
    await expect(page.getByTestId('display-package-manager'))
      .toContainText('no system package manager');

    // The split, asked inside each bar: the menu bar names the focused app and
    // holds the clock, the dock holds the launcher and the window list.
    await expect(menuBar).toHaveAttribute('data-kind', 'menu-bar');
    await expect(menuBar.getByTestId('menu-bar-app'))
      .toHaveText('Display Properties');
    await expect(menuBar.getByTestId('sim-clock')).toBeVisible();
    await expect(menuBar.getByTestId('taskbar-windows')).toHaveCount(0);
    await expect(dock.getByTestId('start-button')).toBeVisible();
    await expect(dock.getByTestId('sim-clock')).toHaveCount(0);

    // THE BUTTONS: left end, close first, all three present. The order is read
    // off the DOM row rather than off a class on the window, because the row
    // is what the renderer builds and the order is what it builds it in.
    const controls = page.getByTestId('window-display')
      .locator('.window-controls');
    await expect(controls).toHaveAttribute('data-side', 'left');
    await expect(controls.locator('button')).toHaveCount(3);
    await expect(controls.locator('button').nth(0))
      .toHaveClass(/window-close/u);
    await expect(controls.locator('button').nth(1))
      .toHaveClass(/window-minimize/u);

    // And they are really over there: geometry, because a side that was
    // declared and never styled would pass every assertion above.
    const controlsBox = await controls.boundingBox();
    const titleBox = await page.getByTestId('window-display')
      .locator('.window-title').boundingBox();
    expect(controlsBox?.x ?? Number.MAX_SAFE_INTEGER)
      .toBeLessThan(titleBox?.x ?? 0);

    // The product works under it, and the menu bar follows the focus - which
    // is the whole of what a menu bar owns in a shell whose apps have no menus.
    await openFromStartMenu(page, 'tickets');
    await expect(menuBar.getByTestId('menu-bar-app')).toHaveText('Ticket Queue');
    await expect(page.getByTestId('tickets-summary')).toContainText('open');
    // Closing the queue drops focus to whatever is open underneath - this
    // walk has a desk's worth of windows by now - and the desktop's own name
    // is what NOTHING focused shows. So park windows until the bar says
    // whose desk this is, reading each owner off the bar itself (the bar
    // names the focused window; that is the claim being leaned on), then
    // bring Display Properties back for the switch below.
    await page.getByTestId('close-tickets').click();

    for (let parked = 0; parked < 8; parked += 1) {
      const owner = await menuBar.getByTestId('menu-bar-app').textContent();

      if (owner === 'Orchard 15') {
        break;
      }

      await page
        .locator('.os-window[data-focused="true"]')
        .locator('[data-testid^="minimize-"]')
        .click();
    }

    await expect(menuBar.getByTestId('menu-bar-app')).toHaveText('Orchard 15');
    await page.getByTestId('taskbar-button-display').click();

    // And back to Cinnamon, which is where the next step needs the box: both
    // new primitives leave the DOCUMENT rather than being hidden by a rule.
    await focusWindow(page, 'display');
    await page.getByTestId('display-desktop-cinnamon').click();
    await expect(desktop).toHaveAttribute('data-panel-second', 'none');
    await expect(page.getByTestId('menu-bar-app')).toHaveCount(0);
    await expect(controls).toHaveAttribute('data-side', 'right');
    await expect(page.getByTestId('display-package-manager'))
      .toContainText('apt');
  });

  await step('display.distro', async () => {
    // The second axis, on its own: Mint came with Cinnamon, and moving to
    // Fedora leaves the desktop exactly where it is. KDE-on-Fedora and
    // Cinnamon-on-Fedora are both real machines, and this is the proof the two
    // axes are independent rather than one dressed as two.
    await expect(page.getByTestId('display-package-manager')).toContainText('apt');
    await page.getByTestId('display-distro-fedora').click();
    await expect(desktop).toHaveAttribute('data-skin', 'cinnamon');
    await expect(desktop).toHaveAttribute('data-distro', 'fedora');
    await expect(page.getByTestId('display-package-manager')).toContainText('dnf');
    await expect(page.getByTestId('display-current')).toContainText('Fedora');

    // Debian (0.28.0): the row whose difference is TEMPERAMENT and not a verb.
    // It is here to prove the axis admits a distro that changes nothing
    // mechanical - the box goes back to speaking the same apt Ubuntu speaks,
    // and the only thing that moved is which name is running.
    await page.getByTestId('display-distro-debian').click();
    await expect(desktop).toHaveAttribute('data-distro', 'debian');
    await expect(desktop).toHaveAttribute('data-skin', 'cinnamon');
    await expect(page.getByTestId('display-package-manager')).toContainText('apt');
    await expect(page.getByTestId('display-current')).toContainText('Debian');

    // And back onto dnf, which is where the step below needs the box.
    await page.getByTestId('display-distro-fedora').click();
    await expect(desktop).toHaveAttribute('data-distro', 'fedora');
    await page.getByTestId('close-display').click();
  });

  await step('cmd.dnf', async () => {
    // The dialect, on the one box that speaks it: the player's own, which is
    // reachable over ssh at all because they put Linux on it.
    await focusWindow(page, 'cmd');
    await runCommand(page, 'ssh engineer@FC-DESK-07');
    await expect(page.locator('.cmd-prompt').first())
      .toHaveText('engineer@FC-DESK-07:~$');

    // The other family's package manager is a missing binary, which is the
    // sharpest thing this axis has.
    await runCommand(page, 'sudo apt update');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('apt: command not found');

    await runCommand(page, 'dnf check-update');
    await expect(page.getByTestId('cmd-output')).toContainText('openssl-libs');

    // The same gag, the same field, the other words: htop is not on the box,
    // the hint is dnf's, and the install closes it.
    await runCommand(page, 'htop');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('sudo dnf install htop');
    await runCommand(page, 'sudo dnf install htop');
    await expect(page.getByTestId('cmd-output')).toContainText('Complete!');
    await runCommand(page, 'htop');
    await expect(page.getByTestId('cmd-output')).toContainText('Load average');

    // And the patching half, through the same verb apt upgrade dispatches.
    await runCommand(page, 'sudo dnf upgrade');
    await expect(page.getByTestId('cmd-output')).toContainText('Upgrading:');
    await runCommand(page, 'exit');
    // Back on the desktop's own dialect - whichever directory this run left the
    // Windows terminal standing in.
    await expect(page.locator('.cmd-prompt').first()).toHaveText(/^C:\\/u);
  });

  /* -- 0.28.0: the other three families, on the same one box -------------- */

  /*
   * Everything below stands on FC-DESK-07, which cmd.dnf has just left PATCHED
   * and carrying htop. That is deliberate rather than a compromise: one box can
   * only be behind on its updates once, so the pending path is walked in the
   * dialect that already owned it (dnf, above) and the dialects below walk what
   * a PATCHED box says - which is where zypper's "No updates found." and, more
   * to the point, pacman's eternal `-Syu` actually live. The pending shapes of
   * all four are covered exhaustively in cmd-unix.test.ts.
   *
   * Every assertion here is against a string that appears NOWHERE ELSE in the
   * scrollback - `cmd-output` is the whole session and is never cleared, so a
   * line the run has already printed is not evidence of anything. That rules
   * out "Complete!", "hops max", "LISTEN" and every other family-shared phrase,
   * which is why the assertions below are the redirect lines, the transaction
   * rows and the version strings in each family's OWN spelling.
   */

  await step('cmd.yum', async () => {
    // Onto the enterprise rebuild: the same dnf, and the distro that carries
    // the other two beats in this block.
    await openFromStartMenu(page, 'display');
    await page.getByTestId('display-distro-rhel').click();
    await expect(desktop).toHaveAttribute('data-distro', 'rhel');
    await expect(desktop).toHaveAttribute('data-skin', 'cinnamon');
    await expect(page.getByTestId('display-package-manager')).toContainText('dnf');
    await page.getByTestId('close-display').click();

    await focusWindow(page, 'cmd');
    await runCommand(page, 'ssh engineer@FC-DESK-07');
    await expect(page.locator('.cmd-prompt').first())
      .toHaveText('engineer@FC-DESK-07:~$');

    // The muscle memory, answered: the wrapper says where it went and dnf does
    // the rest. The redirect carries the WHOLE line, which is what makes it a
    // string this run has printed nowhere else.
    await runCommand(page, 'yum check-update');
    await expect(page.getByTestId('cmd-output'))
      .toContainText("Redirecting to '/usr/bin/dnf check-update'");

    // And it is not a read-only impersonation: it installs, through the same
    // action, into the same installed_packages set - proven three steps later,
    // when pacman lists what yum put here.
    await runCommand(page, 'sudo yum install traceroute');
    await expect(page.getByTestId('cmd-output'))
      .toContainText("Redirecting to '/usr/bin/dnf install traceroute'");
    // The gag closed, read off a usage line no earlier traceroute printed:
    // every other one in this run was given a host.
    await runCommand(page, 'traceroute');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Usage: traceroute [OPTIONS] HOST');
  });

  await step('cmd.subscription-manager', async () => {
    // The register beat, and the whole of it: it fails, and nothing cares.
    await runCommand(page, 'subscription-manager status');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Overall Status: Disabled');

    await runCommand(page, 'subscription-manager register');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Unable to register');

    // The teeth: dnf works exactly as well after the failed registration as
    // before it, and it can still READ the box - the already-installed answer
    // is dnf reaching the same installed_packages set it wrote a step ago. A
    // second `yum check-update` would have proved nothing: that line is
    // already in the scrollback and the scrollback is never cleared.
    await runCommand(page, 'sudo yum install htop');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is already installed');
    await runCommand(page, 'subscription-manager list');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Not Subscribed');
    await runCommand(page, 'exit');
  });

  /*
   * 0.28.0 slice 3: SELinux, on the one box in the game that has it.
   *
   * It sits HERE, on the RHEL box `cmd.yum` put the machine on, because RHEL is
   * where a player would actually meet this - and because everything below has
   * to happen before `cmd.zypper` moves the box to openSUSE, which has no
   * SELinux on it at all.
   *
   * The scrollback rule this block is written under is the one the whole
   * section is: `cmd-output` is the entire session and is never cleared, so
   * every assertion here is a string this run has printed NOWHERE else - the
   * AVC line, the label, the relabel, and the 403's own content-type. The two
   * that could not be made unique - "Enforcing" and a 200 response - are read
   * off the LAST line of the output instead of by containment, so a stale line
   * higher up the scrollback cannot satisfy them.
   */
  const cmdOut = page.getByTestId('cmd-output');
  const lastOut = cmdOut.locator('.cmd-line-out').last();

  await step('cmd.getenforce', async () => {
    // Back onto the desk box - a known host by now, so it connects straight
    // through - and the box says on the way in that something is refusing.
    // That banner is the only thing that points at this at all, and it names
    // no answer: it says the permissions look fine, which they do.
    await runCommand(page, 'ssh engineer@FC-DESK-07');
    await expect(cmdOut).toContainText('NOTE TO SELF');
    await expect(page.locator('.cmd-prompt').first())
      .toHaveText('engineer@FC-DESK-07:~$');

    await runCommand(page, 'getenforce');
    await expect(lastOut).toHaveText('Enforcing');
  });

  await step('cmd.sestatus', async () => {
    // The fuller read, and the pair that matters: what it is doing now, and
    // what the config file says it should be doing at the next boot.
    await runCommand(page, 'sestatus');
    await expect(cmdOut).toContainText('Loaded policy name:');
    await expect(cmdOut).toContainText('Mode from config file:');
    await expect(cmdOut).toContainText('/sys/fs/selinux');
  });

  await step('cmd.restorecon', async () => {
    // The denial, met the way a player meets it: a service that is UP, and
    // refusing. Read off the last line, because the response line itself
    // ("HTTP/1.1 403 Forbidden") is the only unique half and the content-type
    // is what tells a served page apart from Apache's error page.
    await runCommand(page, 'curl -I http://localhost/');
    await expect(cmdOut).toContainText('HTTP/1.1 403 Forbidden');
    await expect(lastOut).toHaveText('content-type: text/html; charset=iso-8859-1');

    // The trap: the permissions are perfect. Asserted as the whole row, so a
    // mode or an owner drifting would be caught rather than contained.
    await runCommand(page, 'ls -la /var/www/html/index.html');
    await expect(lastOut).toHaveText(/^-rw-r--r--\s+1\s+apache\s+apache\s/u);

    // And the diagnosis, already written down, in the kernel's own words.
    await runCommand(page, 'journalctl -u httpd');
    await expect(cmdOut).toContainText('avc:  denied  { read }');
    await expect(cmdOut).toContainText('permissive=0');

    // The one column ls -la does not print, which is the whole fault.
    await runCommand(page, 'ls -laZ /var/www/html/index.html');
    await expect(cmdOut).toContainText('unconfined_u:object_r:user_home_t:s0');

    // The fix that changes the FILE, and prints what it changed.
    await runCommand(page, 'sudo restorecon -v /var/www/html/index.html');
    await expect(cmdOut).toContainText('Relabeled /var/www/html/index.html');
    await expect(cmdOut).toContainText('system_u:object_r:httpd_sys_content_t:s0');

    // The goal, not the call: the page the box was refusing is served. Nothing
    // was restarted, and the box is STILL enforcing while it serves it - which
    // is the whole difference between this fix and the other one.
    await runCommand(page, 'curl -I http://localhost/');
    await expect(lastOut).toHaveText('content-type: text/html');
    await runCommand(page, 'getenforce');
    await expect(lastOut).toHaveText('Enforcing');

    await runCommand(page, 'exit');
  });

  await step('cmd.zypper', async () => {
    await openFromStartMenu(page, 'display');
    await page.getByTestId('display-distro-opensuse').click();
    await expect(desktop).toHaveAttribute('data-distro', 'opensuse');
    // The axes are independent even here: openSUSE ships KDE, and this box is
    // on Cinnamon and stays on Cinnamon, because there was a desktop to leave.
    await expect(desktop).toHaveAttribute('data-skin', 'cinnamon');
    await expect(page.getByTestId('display-package-manager')).toContainText('zypper');
    await page.getByTestId('close-display').click();

    await focusWindow(page, 'cmd');
    await runCommand(page, 'ssh engineer@FC-DESK-07');

    // The other families are missing binaries here, in both directions - the
    // sharpest thing this axis has, and the box names the verb it does have.
    await runCommand(page, 'sudo dnf upgrade');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('This box speaks zypper');

    await runCommand(page, 'sudo zypper refresh');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('All repositories have been refreshed.');
    // Patched by dnf three steps ago, and zypper reads the same one truth -
    // in zypper's words rather than dnf's silence, which is what the real one
    // does.
    await runCommand(page, 'zypper list-updates');
    await expect(page.getByTestId('cmd-output')).toContainText('No updates found.');

    // A real transaction, in zypper's own Continue?/[done] shape, writing the
    // same field every other dialect reads.
    await runCommand(page, 'sudo zypper install net-tools');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('The following NEW package is going to be installed:');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Installing: net-tools-2.10-150600.3.2.x86_64');
    await runCommand(page, 'exit');
  });

  await step('display.distro-pick', async () => {
    // Arch, and the one thing in this whole shell where a choice opens another
    // choice. It has to start from the ISSUED box, because a machine that
    // already has a desktop has one to leave alone and is asked nothing.
    await openFromStartMenu(page, 'display');
    await page.getByTestId('display-desktop-deskpro').click();
    await expect(desktop).toHaveAttribute('data-distro', 'none');
    await expect(page.getByTestId('display-desktop-pick')).toBeHidden();

    await page.getByTestId('display-distro-arch').click();
    await expect(page.getByTestId('display-desktop-pick')).toBeVisible();
    await expect(page.getByTestId('display-pick-prompt'))
      .toContainText('Arch Linux');
    // And the press itself installed NOTHING: the machine is exactly the box
    // IT issued until the second question has an answer.
    await expect(desktop).toHaveAttribute('data-skin', 'deskpro');
    await expect(desktop).toHaveAttribute('data-distro', 'none');

    // The answer sets both axes at once, so the machine is never briefly on a
    // distribution nobody chose.
    await page.getByTestId('display-pick-xfce').click();
    await expect(desktop).toHaveAttribute('data-skin', 'xfce');
    await expect(desktop).toHaveAttribute('data-distro', 'arch');
    await expect(page.getByTestId('display-desktop-pick')).toBeHidden();
    await expect(page.getByTestId('display-package-manager'))
      .toContainText('pacman');

    // And the same distro on a box that now HAS a desktop asks nothing at all,
    // which is the independence rule rather than an exemption for Arch.
    await page.getByTestId('display-distro-arch').click();
    await expect(page.getByTestId('display-desktop-pick')).toBeHidden();
    await expect(desktop).toHaveAttribute('data-skin', 'xfce');
    await page.getByTestId('close-display').click();
  });

  await step('cmd.pacman', async () => {
    await focusWindow(page, 'cmd');
    await runCommand(page, 'ssh engineer@FC-DESK-07');

    // The payoff of the whole axis, in one read: apt put nothing here, dnf put
    // htop here, yum put traceroute here and zypper put net-tools here - and
    // pacman, the fourth family, lists all three off the ONE field, in Arch's
    // own version spelling.
    await runCommand(page, 'pacman -Q');
    await expect(page.getByTestId('cmd-output')).toContainText('htop 3.3.0-1');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('traceroute 2.1.5-1');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('net-tools 2.10-3');

    // pacman has no "already the newest version": it warns and reinstalls.
    await runCommand(page, 'sudo pacman -S htop');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is up to date -- reinstalling');

    // The eternal -Syu: the SYNC runs whether or not there is anything to
    // upgrade, because the repositories moved this morning the way they move
    // every morning - today this box happens to be level with them.
    await runCommand(page, 'sudo pacman -Syu');
    await expect(page.getByTestId('cmd-output'))
      .toContainText(':: Synchronising package databases...');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('there is nothing to do');

    // The capitals matter, and getting them wrong does not install anything.
    await runCommand(page, 'sudo pacman -s htop');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('The capitals matter.');

    await runCommand(page, 'sudo apt update');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('This box speaks pacman');
    await runCommand(page, 'exit');
    await expect(page.locator('.cmd-prompt').first()).toHaveText(/^C:\\/u);
  });

  /*
   * The MAC DIALECT (E5 slice 3, 0.33.0), on a box nobody reinstalled: one of
   * MARLOWE-STUDIO's designer Macs, seeded by the estate since 0.32.0 and
   * refused at this seam until now.
   *
   * The scrollback rule this section runs under applies here too - `cmd-output`
   * is the whole session and is never cleared - so every string below is one
   * this run has printed nowhere else, and the two that could not be made
   * unique are read off the LAST line rather than by containment.
   */
  await step('cmd.launchctl', async () => {
    await focusWindow(page, 'cmd');
    await runCommand(page, 'ssh pat@MARL-WS-01');

    // The prompt is the first thing that says which family this is, before
    // anything has been typed: zsh's space-and-percent, not bash's colon.
    await expect(page.locator('.cmd-prompt').first())
      .toHaveText('pat@MARL-WS-01 ~ %');

    // The Linux dialect refuses BY NAME here, in zsh's own word order, and
    // names the tool this box actually has.
    await runCommand(page, 'systemctl status sshd');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('zsh: command not found: systemctl');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('macOS runs launchd, not systemd');

    // The loaded jobs, by their real reverse-DNS labels.
    await runCommand(page, 'launchctl list');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('com.jamf.management.daemon');

    // The status read, and the domain that decides where the plist lives.
    await runCommand(page, 'launchctl print system/com.apple.mDNSResponder');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('/Library/LaunchDaemons/com.apple.mDNSResponder.plist');

    // The wrong domain FAILS, which is the whole reason the domain is data:
    // Adobe's Communicator is an agent in the login session, not a daemon.
    await runCommand(page, 'launchctl print system/com.adobe.ARMDC.Communicator');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Could not find service "com.adobe.ARMDC.Communicator"');
    await runCommand(page, 'launchctl print gui/501/com.adobe.ARMDC.Communicator');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('/Library/LaunchAgents/com.adobe.ARMDC.Communicator.plist');

    // The fix verbs, and the goal rather than the call: bootout takes the job
    // out and the box AGREES it is out. "state = not running" is a string this
    // run has printed nowhere else, which is the rule this whole section is
    // written under - the scrollback is never cleared.
    await runCommand(page, 'launchctl bootout system/com.jamf.management.daemon');
    await runCommand(page, 'launchctl print system/com.jamf.management.daemon');
    await expect(cmdOut).toContainText('state = not running');

    // And back: bootstrap takes the PLIST PATH rather than a target, which is
    // launchd's real asymmetry, and kickstart -k is the restart. Both are
    // SILENT on success, exactly as systemctl is - so the proof is read off
    // the LAST line, which is the echo of the command itself and nothing
    // after it. A verb that printed a fabricated "started successfully" would
    // fail here.
    await runCommand(
      page,
      'launchctl bootstrap system /Library/LaunchDaemons/'
        + 'com.jamf.management.daemon.plist',
    );
    await runCommand(page, 'launchctl kickstart -k system/com.jamf.management.daemon');
    await expect(lastOut)
      .toHaveText(/launchctl kickstart -k system\/com\.jamf\.management\.daemon$/u);
  });

  await step('cmd.log', async () => {
    // The Mac's face of the log, in the real columns - and the last line says
    // out loud that the window was not applied rather than implying it was.
    await runCommand(page, 'log show --last 30m');
    await expect(page.getByTestId('cmd-output')).toContainText('Log      - Default:');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('--last 30m is the real flag');
    await runCommand(page, 'log stream');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('log stream is a live tail');
  });

  await step('cmd.brew', async () => {
    // The refusal that is the teaching: no Homebrew on a managed fleet Mac.
    await runCommand(page, 'brew install htop');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Homebrew is not part of macOS');

    // And the shared table, audited: BSD's df table, launchd as PID 1, and a
    // real macOS tool that is NOT claimed to be missing.
    await runCommand(page, 'df -h');
    await expect(page.getByTestId('cmd-output')).toContainText('%iused');
    await runCommand(page, 'ps aux');
    await expect(page.getByTestId('cmd-output')).toContainText('/sbin/launchd');
    await runCommand(page, 'softwareupdate --list');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('is a real tool on this box');

    await runCommand(page, 'exit');
    await expect(page.locator('.cmd-prompt').first()).toHaveText(/^C:\\/u);
  });

  /*
   * And the same two families on the surface that DRAWS a screen (#55, 0.33.0).
   *
   * The terminal above has been honest about these boxes since 0.32.0 - it
   * refuses the Windows tools on them by name - while Remote Assist drew My
   * Documents and a Recycle bin on every one of them from 0.7.0. This is the
   * shipped-path half of that fix, asked on the two customer estates the
   * dialect steps have just been standing on.
   */
  await step('remote.face-console', async () => {
    await openFromStartMenu(page, 'remote');
    await page.getByTestId('remote-machine-marl-nas-01').click();
    await expect(page.getByTestId('remote-hostname')).toHaveText('MARL-NAS-01');

    // What a screen plugged into a NAS shows: its own login prompt, and a
    // sentence about where the work actually happens.
    await expect(page.getByTestId('remote-viewport'))
      .toHaveAttribute('data-face', 'linux');
    await expect(page.getByTestId('remote-console-prompt'))
      .toHaveText('MARL-NAS-01 login:');
    await expect(page.getByTestId('remote-console')).toContainText('over ssh');

    // THE GATE, on the document: no Windows furniture anywhere in it. Asked as
    // counts, so a caricature hidden behind a rule would still be found.
    await expect(page.getByTestId('remote-desktop-icons')).toHaveCount(0);
    await expect(page.getByTestId('remote-dialog')).toHaveCount(0);
    await expect(page.getByTestId('remote-start')).toHaveCount(0);
  });

  await step('remote.face-mac', async () => {
    await page.getByTestId('remote-machine-marl-ws-01').click();
    await expect(page.getByTestId('remote-hostname')).toHaveText('MARL-WS-01');

    // A Mac drawn as a Mac: the menu bar over the dock, the same two layout
    // facts the chrome slice ships, and the clock in the bar a Mac keeps it
    // in. Nothing else - this estate holds no Mac desktop to draw.
    await expect(page.getByTestId('remote-viewport'))
      .toHaveAttribute('data-face', 'mac');
    await expect(page.getByTestId('remote-menu-bar')).toBeVisible();
    await expect(page.getByTestId('remote-dock')).toBeVisible();
    await expect(page.getByTestId('remote-menu-bar')
      .getByTestId('remote-tray')).toHaveCount(1);

    // The consent is granted across the studio until the Wednesday ticket
    // takes it away on one box, so this Mac shows a screen rather than the
    // black frame - the other state is walked in msp.spec.ts, on the ticket.
    await expect(page.getByTestId('remote-viewport'))
      .toHaveAttribute('data-blackout', 'false');
    await expect(page.getByTestId('remote-blackout')).toHaveCount(0);

    // And the gate again, on the family the 0.32.0 estate added.
    await expect(page.getByTestId('remote-desktop-icons')).toHaveCount(0);
    await expect(page.getByTestId('remote-dialog')).toHaveCount(0);
    await expect(page.getByTestId('remote-start')).toHaveCount(0);
  });
});

/* ========================================================================= *
 * The other way out of the denial: the switch instead of the relabel, and the
 * morning after it. Its own session for the reason the shortcut/checked pair
 * is two: one box cannot be fixed both ways, and the consequence of this one
 * is a night away.
 * ========================================================================= */

test('walks setenforce 0, and the sweep that puts it in the inbox', async ({
  page,
}) => {
  await recordControls(page);
  // A full day is run out inside this one, so it gets the room the other
  // multi-day runs get rather than a cliff.
  test.setTimeout(1_800_000);
  await page.addInitScript(
    ([key, record]) => {
      window.localStorage.setItem(key, JSON.stringify(record));
    },
    [E6_SWITCH_KEY, E6_ARRIVAL] as [string, typeof E6_ARRIVAL],
  );
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await completeLogin(page, { brief: 'keep' });

  const arrival = page.getByTestId('window-updates');

  if (await arrival.count()) {
    const close = arrival.getByTestId('window-close');

    if (await close.count()) {
      await close.first().click();
    }
  }

  // The shift is genuinely started here, unlike the sysadmin run: this beat is
  // settled at the START of a shift, so there has to be a day to end.
  await beginShift(page);

  await openFromStartMenu(page, 'cmd');
  await runCommand(page, 'promotion accept');
  await expect(page.getByTestId('cmd-output'))
    .toContainText('Systems Engineer now');

  // Linux on the issued box, and then Fedora under it. The desktop is chosen
  // FIRST and it is Cinnamon rather than the one Fedora ships, for a reason
  // this run cares about and the sysadmin run also settled on: GNOME has no
  // window list, and everything below wants to click its way back to a
  // terminal. The distro is the axis under test either way.
  await openFromStartMenu(page, 'display');
  await page.getByTestId('display-desktop-cinnamon').click();
  await page.getByTestId('display-distro-fedora').click();
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-distro', 'fedora');
  await expect(page.getByTestId('desktop'))
    .toHaveAttribute('data-skin', 'cinnamon');
  await page.getByTestId('close-display').click();
  await focusWindow(page, 'cmd');

  const out = page.getByTestId('cmd-output');
  const lastLine = out.locator('.cmd-line-out').last();

  await step('cmd.setenforce', async () => {
    await runCommand(page, 'ssh engineer@FC-DESK-07');
    await expect(out).toContainText('NOTE TO SELF');

    // The same denial the other run relabels its way out of.
    await runCommand(page, 'curl -I http://localhost/');
    await expect(out).toContainText('HTTP/1.1 403 Forbidden');

    // One keystroke, no output at all, and the page is served - which is
    // exactly why this is the fix everybody reaches for.
    await runCommand(page, 'sudo setenforce 0');
    await runCommand(page, 'getenforce');
    await expect(lastLine).toHaveText('Permissive');
    await runCommand(page, 'curl -I http://localhost/');
    await expect(lastLine).toHaveText('content-type: text/html');

    // And the file is exactly as mislabelled as it was: nothing about the
    // fault was fixed. The box has stopped acting on labels.
    await runCommand(page, 'ls -laZ /var/www/html/index.html');
    await expect(out).toContainText('unconfined_u:object_r:user_home_t:s0');
    await runCommand(page, 'exit');

    // Nothing has landed this afternoon. A consequence in the same hour would
    // read as a punishment for the keystroke rather than as its cost.
    await openFromStartMenu(page, 'mail');
    await expect(page.getByTestId('mail-row-selinux-permissive')).toHaveCount(0);
    await page.getByTestId('close-mail').click();
  });

  // The night, and the sweep that reads the estate across it. Outside the step
  // above for the same reason the enrolment run puts it outside its own: it is
  // the game's clock doing the work, not a control being driven.
  await clockOffFor(page, 1);
  await beginShift(page);

  await step('mail.selinux', async () => {
    // A day later, on a list with a date beside it, in somebody else's report -
    // which is exactly how long it takes and exactly where it turns up.
    await openFromStartMenu(page, 'mail');
    await page.getByTestId('mail-row-selinux-permissive').click();
    await expect(page.getByTestId('mail-subject')).toContainText('SELinux');
    await expect(page.getByTestId('mail-subject')).toContainText('FC-DESK-07');
    await expect(page.getByTestId('mail-message-selinux-permissive-1'))
      .toContainText('setenforce 0');
  });
});

/* ========================================================================= *
 * Runs three and four: the fork a single week cannot hold both sides of.
 * ========================================================================= */

test('walks the enrolment nobody checked, and the post it becomes', async ({
  page,
}) => {
  await recordControls(page);
  // Playing two full days through the UI before the beat under test costs
  // most of ten minutes on the box; give the run room rather than a cliff.
  test.setTimeout(1_800_000);
  await logInOnDay(page, 3, { brief: 'keep' });
  await workUntil(page, 140);

  await step('chat.option-mfa', async () => {
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-priya').click();
    await chatOption(page, /how long she has been locked out/);
    await chatOption(page, /Enrol the new phone now and get on with the queue/);
    await expect(page.getByTestId('chat-outcome')).toContainText('Done, from here');
    await expectClosed(page, 'mfa-reregister');
  });

  await clockOffFor(page, 3);
  await beginShift(page);

  await step('mail.incident', async () => {
    // A day later, in somebody else's incident report, which is exactly how
    // long it takes.
    await openFromStartMenu(page, 'mail');
    await page.getByTestId('mail-row-security-incident').click();
    await expect(page.getByTestId('mail-subject')).toContainText('INCIDENT');
  });
});

test('walks the thirty seconds of checking that stops the post', async ({
  page,
}) => {
  await recordControls(page);
  // Playing two full days through the UI before the beat under test costs
  // most of ten minutes on the box; give the run room rather than a cliff.
  test.setTimeout(1_800_000);
  await logInOnDay(page, 3, { brief: 'keep' });
  await workUntil(page, 140);

  await step('chat.option-verify', async () => {
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-priya').click();
    await chatOption(page, /how you are meant to prove she is her/);
    // She offers the payroll number, the manager and the desk. None of them is
    // evidence, and the option that says so is the one that leads anywhere.
    await expect(page.getByTestId('chat-transcript')).toContainText('4471');
    await chatOption(page, /none of that is evidence/);
    await chatOption(page, /ring her back on the number the directory holds/);
    await chatOption(page, /Enrol the new phone now that you know who she is/);
    await expectClosed(page, 'mfa-reregister');
  });

  await clockOffFor(page, 3);
  await beginShift(page);
  await openFromStartMenu(page, 'mail');
  await expect(page.getByTestId('mail-row-security-incident')).toHaveCount(0);
});

/* ========================================================================= *
 * The store run: install a toy against the policy, be asked about it, and
 * reload to find the install set where it was. Its own run because the golden
 * weeks install nothing - that is what keeps them byte-identical - so the one
 * walk that installs is kept out of them.
 * ========================================================================= */

/**
 * Minimises everything and raises exactly one slack window, so the lead catches
 * the app the walk means rather than whichever happens to be top of the pile.
 *
 * `caughtBy` reads the first open, unminimised slack window, so a desktop with
 * three toys up is a coin toss about which scene fires. The boss key puts them
 * all away; raising one by its taskbar button makes it the only thing on screen.
 */
async function raiseOnly(page: Page, appId: string): Promise<void> {
  await page.keyboard.press('Backquote');
  await page.getByTestId(`taskbar-button-${appId}`).click();
  await expect(page.getByTestId(`window-${appId}`)).toBeVisible();
}

/**
 * The three corridors of Monday, by arithmetic rather than by waiting.
 *
 * `buildPatrolSchedule` is deterministic `f(seed, day)` - the same function the
 * driver settles patrols with - and the store run plays attempt one, whose seed
 * is `WORLD_SEED`. So the arrival ticks are known before the walk starts, and
 * `driveToArrival` advances the clock straight to each one. This is P1-A's fix:
 * the old walk polled for a telegraph and hung for thirty minutes when the third
 * corridor did not come while it happened to be looking; this cannot, because it
 * asks the schedule when the corridor is and goes there.
 */
const MONDAY_PATROLS = buildPatrolSchedule(1, WORLD_SEED).visits;

/**
 * Tuesday's corridors, for the fourth and fifth caught scenes the store run
 * needs.
 *
 * Monday has exactly three patrols (`PATROLS_PER_DAY`), and the store run spends
 * all three - the game, the install audit, the media player. Two more toys carry
 * two more scenes: Office Solitaire's telling-off is driven at Tuesday's FIRST
 * corridor and Office Minesweeper's at Tuesday's SECOND - the same deterministic
 * `f(seed, day)` schedule, one day on, with room to spare (Tuesday has three
 * corridors too). Ticks are absolute across the week, so `driveToArrival`
 * reaches each the same way.
 */
const TUESDAY_PATROLS = buildPatrolSchedule(2, WORLD_SEED).visits;

async function nowTick(page: Page): Promise<number> {
  return page.evaluate(() => globalThis.careerSim?.tick() ?? 0);
}

/**
 * Advances the sim clock to just past a known patrol arrival and asserts the
 * caught window opened. The screen state set BEFORE the call is what the lead
 * finds when he gets there, so the caller decides which scene fires.
 */
async function driveToArrival(page: Page, arrivalTick: number): Promise<void> {
  const toGo = arrivalTick + 1 - await nowTick(page);

  if (toGo > 0) {
    await runSimMinutes(page, toGo);
  }

  await expect(page.getByTestId('window-caught')).toBeVisible();
}

test('walks the web store, the install, the audit and the uninstall', async ({
  page,
}) => {
  await recordControls(page);
  // The 240s house class rather than the 30-minute default: a partial Monday
  // and a reload are well under four minutes, and a walk that drives a
  // newly-created surface must FAIL FAST if one of them hangs rather than eat
  // half an hour and blow the whole suite's budget.
  test.setTimeout(240_000);
  await logInOnDay(page, 1, { brief: 'keep' });
  await beginShift(page);

  await step('browser.store', async () => {
    await openFromStartMenu(page, 'browser');
    await page.getByTestId('browser-site-store').click();
    await expect(page.getByTestId('browser-store')).toBeVisible();
    // The policy consequence, stated before the install rather than sprung
    // after it - the trade the store is built on.
    await expect(page.getByTestId('browser-store-notice'))
      .toContainText('locked-down');
  });

  await step('store.install', async () => {
    // No toy on the desktop yet.
    await expect(page.getByTestId('desktop-icon-arcade')).toHaveCount(0);

    await page.getByTestId('store-install-arcade').click();
    // Live re-mount: the icon and the start-menu entry are there at once, with
    // no reload. The button flips to Uninstall in the same breath.
    await expect(page.getByTestId('desktop-icon-arcade')).toBeVisible();
    await expect(page.getByTestId('store-uninstall-arcade')).toBeVisible();

    await page.getByTestId('store-install-mediaplayer').click();
    await expect(page.getByTestId('desktop-icon-mediaplayer')).toBeVisible();
    await expect(page.getByTestId('store-uninstall-mediaplayer')).toBeVisible();

    await page.getByTestId('store-install-solitaire').click();
    await expect(page.getByTestId('desktop-icon-solitaire')).toBeVisible();
    await expect(page.getByTestId('store-uninstall-solitaire')).toBeVisible();

    await page.getByTestId('store-install-minesweeper').click();
    await expect(page.getByTestId('desktop-icon-minesweeper')).toBeVisible();
    await expect(page.getByTestId('store-uninstall-minesweeper')).toBeVisible();
  });

  // Close the Browser window we installed FROM before reaching for the icons it
  // was sitting over. A desktop double-click fights window stacking - the icon
  // is "visible" behind the browser but every click lands on the browser - so
  // the covering window comes down first, which also proves the freshly
  // installed icon is genuinely reachable rather than blocked by a lasting
  // overlay.
  await page.getByTestId('close-browser').click();
  await expect(page.getByTestId('window-browser')).toHaveCount(0);

  await step('arcade.window', async () => {
    // The desktop is clear now, so the live-installed icon takes a real
    // double-click: the desktop-icon route, on a surface nothing is covering.
    await openFromDesktopIcon(page, 'arcade');
    await expect(page.getByTestId('arcade-app')).toBeVisible();
  });

  await step('arcade.play', async () => {
    const body = page.getByTestId('arcade-body');
    const before = await body.innerText();
    await page.getByTestId('arcade-play').click();
    await expect(body).not.toHaveText(before);
  });

  await step('mediaplayer.window', async () => {
    // The arcade window is open now and would sit over the media icon, so this
    // one takes the start-menu route the other toys in these walks use - a menu
    // overlay whose item click does not fight window geometry.
    await openFromStartMenu(page, 'mediaplayer');
    await expect(page.getByTestId('media-app')).toBeVisible();
  });

  await step('mediaplayer.play', async () => {
    const app = page.getByTestId('media-app');
    await page.getByTestId('media-play').click();
    await expect(app).toHaveAttribute('data-playing', 'true');
  });

  await step('solitaire.window', async () => {
    // The start-menu route again, for the same reason the media player took it:
    // two toy windows are already up and would fight a desktop double-click.
    await openFromStartMenu(page, 'solitaire');
    await expect(page.getByTestId('solitaire-app')).toBeVisible();
  });

  await step('solitaire.play', async () => {
    // Draw from the stock: the one move legal in every deal. The board changes
    // correctly - a card that was face down in the stock is now face up on the
    // waste - which is a real move made, not a button that returned success.
    const waste = page.getByTestId('solitaire-waste');
    await expect(waste.locator('[data-testid^="solitaire-card-"]')).toHaveCount(0);

    await page.getByTestId('solitaire-stock').click();
    await expect(waste.locator('[data-testid^="solitaire-card-"]')).toHaveCount(1);
    const first = await waste
      .locator('[data-testid^="solitaire-card-"]')
      .getAttribute('data-testid');

    // A second draw turns a second card, so the top of the waste is a different
    // card than the one the first draw left - the pile genuinely advanced.
    await page.getByTestId('solitaire-stock').click();
    await expect(waste.locator('[data-testid^="solitaire-card-"]'))
      .not.toHaveAttribute('data-testid', first ?? '');
  });

  await step('minesweeper.window', async () => {
    // The start-menu route again, for the same reason the other toys took it:
    // three toy windows are already up and would fight a desktop double-click.
    await openFromStartMenu(page, 'minesweeper');
    await expect(page.getByTestId('minesweeper-app')).toBeVisible();
  });

  await step('minesweeper.play', async () => {
    // Flag a covered square, then clear one - both real moves the logic
    // validates, not buttons that returned success. Flag mode marks a corner
    // (which the first reveal may bury a mine under, and that is fine); left-
    // click then clears a first-click-safe region that floods.
    const grid = page.getByTestId('minesweeper-grid');
    await expect(grid.locator('[data-state="revealed"]')).toHaveCount(0);

    // Flag the corner: turn the mode on, click, and the square goes flagged.
    await page.getByTestId('minesweeper-flag-toggle').click();
    await page.getByTestId('minesweeper-cell-0-0').click();
    await expect(page.getByTestId('minesweeper-cell-0-0'))
      .toHaveAttribute('data-state', 'flagged');

    // Mode off, then clear the centre: the first click is always safe and opens
    // into a flood, so the board genuinely changed - more than one square is now
    // revealed where none was before.
    await page.getByTestId('minesweeper-flag-toggle').click();
    await page.getByTestId('minesweeper-cell-4-4').click();
    await expect(
      grid.locator('[data-state="revealed"]').first(),
    ).toBeVisible();
    const revealed = await grid.locator('[data-state="revealed"]').count();
    expect(revealed).toBeGreaterThan(1);
  });

  /* -- caught at the game on the screen, at the first Monday corridor ------- */

  await step('caught.scene-arcade', async () => {
    await raiseOnly(page, 'arcade');
    await driveToArrival(page, MONDAY_PATROLS[0]?.arrivalTick ?? 0);
    await expect(page.getByTestId('caught-app'))
      .toHaveAttribute('data-app', 'arcade');
    await page.getByTestId('caught-dismiss').click();
    await expect(page.getByTestId('window-caught')).toHaveCount(0);
  });

  /* -- caught by the install LOG, nothing on the screen, second corridor --- */

  await step('caught.scene-software', async () => {
    // Everything away, so the finding is the audit and not a window. The arcade
    // conversation was about a screen and did not touch the "spoken about" copy,
    // so both installs are still unspoken and the beat is armed.
    await page.keyboard.press('Backquote');
    await driveToArrival(page, MONDAY_PATROLS[1]?.arrivalTick ?? 0);
    await expect(page.getByTestId('caught-app'))
      .toHaveAttribute('data-app', 'software:install');
    // The line names the programs on the audit and says the one thing that is
    // always true - the list - rather than a hardcoded "that game".
    await expect(page.getByTestId('caught-line')).toContainText('list');
    await page.getByTestId('caught-dismiss').click();
    await expect(page.getByTestId('window-caught')).toHaveCount(0);
  });

  /* -- and caught at the other toy, at the third corridor ------------------ */

  await step('caught.scene-mediaplayer', async () => {
    await raiseOnly(page, 'mediaplayer');
    await driveToArrival(page, MONDAY_PATROLS[2]?.arrivalTick ?? 0);
    await expect(page.getByTestId('caught-app'))
      .toHaveAttribute('data-app', 'mediaplayer');
    await page.getByTestId('caught-dismiss').click();
    await expect(page.getByTestId('window-caught')).toHaveCount(0);
    await page.keyboard.press('Backquote');
  });

  /* -- caught mid-hand at the card game, at Tuesday's first corridor -------- */

  await step('caught.scene-solitaire', async () => {
    // Monday's three corridors are spent, so the fourth toy's scene is driven
    // into Tuesday. The install set rode the night, so Solitaire is still on the
    // machine; re-open it and raise it alone so it is the thing on the screen
    // when the lead arrives.
    await clockOffFor(page, 1);
    await beginShift(page);

    await openFromStartMenu(page, 'solitaire');
    await raiseOnly(page, 'solitaire');
    await driveToArrival(page, TUESDAY_PATROLS[0]?.arrivalTick ?? 0);
    await expect(page.getByTestId('caught-app'))
      .toHaveAttribute('data-app', 'solitaire');
    await page.getByTestId('caught-dismiss').click();
    await expect(page.getByTestId('window-caught')).toHaveCount(0);
    await page.keyboard.press('Backquote');
  });

  /* -- and caught mid-square at Minesweeper, at Tuesday's second corridor --- */

  await step('caught.scene-minesweeper', async () => {
    // The fifth toy's scene, driven at Tuesday's SECOND corridor: Monday's three
    // are spent (game, audit, media) and Tuesday's first caught the card game.
    // The install set rode the day, so Minesweeper is still on the machine;
    // re-open it and raise it alone so it is the thing on the screen when the
    // lead arrives.
    await openFromStartMenu(page, 'minesweeper');
    await raiseOnly(page, 'minesweeper');
    await driveToArrival(page, TUESDAY_PATROLS[1]?.arrivalTick ?? 0);
    await expect(page.getByTestId('caught-app'))
      .toHaveAttribute('data-app', 'minesweeper');
    await page.getByTestId('caught-dismiss').click();
    await expect(page.getByTestId('window-caught')).toHaveCount(0);
    await page.keyboard.press('Backquote');
  });

  /* -- save, reload, and the install set exactly where it was -------------- */

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-save').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game saved' }),
  ).toHaveCount(1);

  await page.reload();
  await completeLogin(page, { brief: 'keep' });
  // A fresh session has neither toy on the desktop.
  await expect(page.getByTestId('desktop-icon-arcade')).toHaveCount(0);

  await page.getByTestId('start-button').click();
  await page.getByTestId('start-menu-load').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Game loaded' }),
  ).toHaveCount(1);
  // The install set rode the save: all three toys are back on the desktop, live,
  // off the loaded state and not this session's history.
  await expect(page.getByTestId('desktop-icon-arcade')).toBeVisible();
  await expect(page.getByTestId('desktop-icon-mediaplayer')).toBeVisible();
  await expect(page.getByTestId('desktop-icon-solitaire')).toBeVisible();
  await expect(page.getByTestId('desktop-icon-minesweeper')).toBeVisible();

  /* -- and taken back off, the record staying behind ----------------------- */

  await step('store.uninstall', async () => {
    await openFromStartMenu(page, 'browser');
    await page.getByTestId('browser-site-store').click();

    await page.getByTestId('store-uninstall-arcade').click();
    // Gone from the desktop live; the button is Install again.
    await expect(page.getByTestId('desktop-icon-arcade')).toHaveCount(0);
    await expect(page.getByTestId('store-install-arcade')).toBeVisible();

    await page.getByTestId('store-uninstall-mediaplayer').click();
    await expect(page.getByTestId('desktop-icon-mediaplayer')).toHaveCount(0);

    await page.getByTestId('store-uninstall-solitaire').click();
    await expect(page.getByTestId('desktop-icon-solitaire')).toHaveCount(0);

    await page.getByTestId('store-uninstall-minesweeper').click();
    await expect(page.getByTestId('desktop-icon-minesweeper')).toHaveCount(0);
  });

  // The conduct file still carries the software line: uninstalling took the toy
  // off the machine and left the record that it was there, which is the whole
  // point of the trail surviving it.
  await openFromStartMenu(page, 'caught');
  await expect(page.getByTestId('caught-file'))
    .toContainText('Unauthorised software');
});

/* ========================================================================= *
 * The deploy run: everything the tester build adds and a file server cannot.
 * ========================================================================= */

test('walks the door, the badge and the report the tester build adds', async ({
  browser,
  page,
}) => {
  await recordControls(page);
  test.setTimeout(600_000);

  await step('door.refusal', async () => {
    // A browser holding no pass, offered four dead links: revoked, spent,
    // expired, and one nobody ever minted. The assertion is that the four
    // answers are ONE answer.
    const outside = await browser.newContext();
    const stranger = await outside.newPage();
    const pages: string[] = [];

    for (const token of REFUSED_TOKENS) {
      const response = await stranger.goto(`/t/${token}`);
      expect(response?.status(), token).toBe(403);
      await expect(stranger.getByTestId('boot-screen')).toHaveCount(0);
      pages.push(await stranger.content());
    }

    expect(new Set(pages).size).toBe(1);
    await outside.close();
  });

  await step('door.admission', async () => {
    const invited = await browser.newContext();
    const tester = await invited.newPage();

    await tester.goto(`/t/${SHARED_TOKEN}`);
    await expect(tester).toHaveURL(/\/$/);
    await expect(tester.getByTestId('boot-screen')).toBeVisible();

    // The pass survives the redirect that set it, which is the whole of what
    // a thirty-day cookie is for.
    await tester.goto('/');
    await expect(tester.getByTestId('boot-screen')).toBeVisible();
    await invited.close();
  });

  await page.clock.install();
  await page.goto('/');
  await page.keyboard.press('Space');

  await step('login.badge-refused', async () => {
    await page.getByTestId('login-badge').fill('WG-9999-ZZ');
    await page.getByTestId('login-password').fill('hunter2');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('login-badge-refusal'))
      .toContainText('not one this building recognises');
    await expect(page.getByTestId('desktop')).toHaveCount(0);
  });

  let badge = '';

  await step('login.issue-badge', async () => {
    await page.getByTestId('login-badge').fill('');
    badge = await issueBadge(page);
    await expect(page.getByTestId('login-badge-issued'))
      .toContainText('IT cannot look it up');
  });

  await step('login.account', async () => {
    // The whole of what this company holds about anybody: a number and three
    // dates, one of which is a deadline.
    const record = page.getByTestId('login-badge-account');

    await expect(record).toContainText(badge);
    await expect(record).toContainText('Issued');
    await expect(record).toContainText('Last seen');
    await expect(record).toContainText('Cleared on');
    await expect(record).toContainText('180 days');
  });

  await step('login.fresh-week', async () => {
    // A badge minted and never played, carried to a browser that has never
    // seen it. The outcome a player is after is being told which of the two
    // things happened - resumed, or started again - and being started again
    // ON THE SAME BADGE rather than on a second one nobody asked for.
    const empty = await browser.newContext();
    const minted = await empty.newPage();

    await minted.goto(`/t/${SHARED_TOKEN}`);
    await minted.keyboard.press('Space');
    const unused = await issueBadge(minted);
    await empty.close();

    const arriving = await browser.newContext();
    const monday = await arriving.newPage();

    await monday.clock.install();
    await monday.goto(`/t/${SHARED_TOKEN}`);
    await monday.keyboard.press('Space');
    await logOnWithBadge(monday, unused);

    await expect(
      monday.getByTestId('toast').filter({ hasText: 'Nothing is filed' }),
    ).toBeVisible();
    await expect(monday.getByTestId('sim-clock-day')).toHaveText('Day 1');
    // Eight o'clock: a fresh week opens on the brief, not on the shift.
    await expect(monday.getByTestId('sim-clock-time')).toHaveText(/^08:/);

    await monday.getByTestId('start-button').click();
    await monday.getByTestId('start-menu-log-off').click();
    await expect(monday.getByTestId('login-badge-account')).toContainText(unused);

    await arriving.close();
  });

  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('desktop')).toBeVisible();
  await dismissBrief(page);

  await step('feedback.send', async () => {
    await openFromStartMenu(page, 'feedback');
    await page.getByTestId('feedback-summary')
      .fill('The spooler button did nothing on Thursday');
    await page.getByTestId('feedback-details')
      .fill('Clicked it four times; the queue stayed where it was.');
    await page.getByTestId('feedback-contact').check();
    await page.getByTestId('feedback-send').click();

    await expect(page.getByTestId('feedback-outcome')).toContainText('Filed');
    await expect(page.getByTestId('feedback-summary')).toHaveValue('');
    await page.getByTestId('close-feedback').click();
  });

  let played = '';

  await step('start-menu.badge-sync', async () => {
    await page.getByTestId('day-state').click();
    await beginShift(page);
    await runSimMinutes(page, 90);
    // Two browsers cannot be compared while one of them is still living
    // through minutes.
    await page.getByTestId('day-pause').click();
    await expect(page.getByTestId('day-state')).toContainText('paused');

    await page.getByTestId('start-button').click();
    await page.getByTestId('start-menu-save').click();
    await expect(
      page.getByTestId('toast').filter({ hasText: 'Game saved' }),
    ).toHaveCount(1);

    played = await worldHash(page);
    expect(played).not.toBe('');
  });

  await step('login.badge', async () => {
    // A browser with nothing in it: no week, no badge, and no pass until it
    // follows the link. The goal is being back in the same Monday, so the
    // assertion is the graph hash rather than a status code.
    const elsewhere = await browser.newContext();
    const other = await elsewhere.newPage();

    await other.clock.install();
    await other.goto(`/t/${SHARED_TOKEN}`);
    await other.keyboard.press('Space');
    await logOnWithBadge(other, badge);

    await expect(
      other.getByTestId('toast').filter({ hasText: 'later week on it' }),
    ).toBeVisible();
    await expect.poll(() => worldHash(other), { timeout: 15_000 }).toBe(played);

    await elsewhere.close();
  });

  await step('updates.installed', async () => {
    // A workstation that remembers an older build, which is the only kind
    // that has been updated.
    const older = await browser.newContext();
    const upgraded = await older.newPage();

    await upgraded.addInitScript(() => {
      window.localStorage.setItem('workgrumble/seen-version', '0.0.1');
    });
    await upgraded.goto(`/t/${SHARED_TOKEN}`);
    await upgraded.keyboard.press('Space');

    await step('boot.installing', async () => {
      // Our release arriving as the fiction's update, on the fiction's own
      // screen, BEFORE the notes that say what was in it - and the log-on box
      // waits for it, because an update is not a thing anybody skips.
      const screen = upgraded.getByTestId('install-screen');

      await expect(screen).toBeVisible();
      await expect(upgraded.getByTestId('install-headline'))
        .toContainText(/Restarting your workstation|Working on updates/);
      await expect(upgraded.getByTestId('install-subject'))
        .toContainText('DeskPro WorkGroup');
      await expect(upgraded.getByTestId('login-screen')).toBeVisible();
      await expect(screen).toBeHidden();
    });

    await upgraded.getByTestId('login-password').fill('hunter2');
    await upgraded.getByTestId('login-submit').click();

    await expect(upgraded.getByTestId('window-updates')).toBeVisible();
    await expect(upgraded.getByTestId('updates-installed'))
      .toContainText('has been installed');
    await older.close();
  });
});

/* ========================================================================= *
 * The aggressive register (0.4.1, issue #18).
 *
 * Self-contained runs that drive the tone controls into the shared ledger: the
 * crude reply that still fixes the ticket, the lead hearing it at your shoulder,
 * and the reporter's reaction escalating on a repeat. They log in fresh rather
 * than threading through a week so a rude reply cannot perturb another journey's
 * assertions - the ledger is shared, the page is not.
 * ========================================================================= */

test('the aggressive register - said, and still fixed, with the lead there',
  async ({ page }) => {
    test.setTimeout(240_000);
    await logInOnDay(page, 1, { brief: 'keep' });
    await beginShift(page);

    // Ada's beat, walked to the point where the screen can be rotated back.
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-ada').click();
    await chatOption(page, /anybody else was at her desk/);
    await chatOption(page, /which keys Gareth pressed/);

    // To the corridor, then let him arrive - nothing on screen but the chat,
    // so the only thing he can catch is the mouth.
    await runToTelegraph(page);
    const desktop = page.getByTestId('desktop');
    for (let minute = 0; minute < 8; minute += 1) {
      if (await desktop.getAttribute('data-boss') === 'present') {
        break;
      }

      await runSimMinutes(page, 1, 1);
    }
    await expect(desktop).toHaveAttribute('data-boss', 'present');

    await step('chat.aggressive', async () => {
      await focusWindow(page, 'chat');
      await chatOption(page, /fuck off with the crime report/);
      // The lead was present, so the caught-scene class takes the screen; the
      // fix underneath it is confirmed once the scene is dismissed.
      await expect(page.getByTestId('window-caught')).toBeVisible();
    });

    await step('caught.scene-rude', async () => {
      await expect(page.getByTestId('caught-app'))
        .toHaveAttribute('data-app', 'conduct:rude');
      await expect(page.getByTestId('caught-heading'))
        .toHaveText('A quick word about tone');
      await page.getByTestId('caught-dismiss').click();
      // Even caught, the ticket resolved: the tone never changes the fix.
      await expectClosed(page, 'rotated-screen');
    });
  });

test('the aggressive register - repeating it escalates', async ({ page }) => {
  test.setTimeout(240_000);
  // Ada's opening beat on day one is a DIAGNOSTIC aggressive beat - it does not
  // resolve, so the rude option can be picked twice, on a ticket that is
  // deterministically live on Monday.
  await logInOnDay(page, 1, { brief: 'keep' });
  await beginShift(page);

  await step('chat.aggressive-escalates', async () => {
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-ada').click();
    await expect(page.getByTestId('chat-transcript'))
      .toContainText('I have been hacked');

    await chatOption(page, /flatly, whether anybody was at her desk/);
    await chatOption(page, /Go back to the top/);
    await chatOption(page, /flatly, whether anybody was at her desk/);

    await openTicket(page, 'rotated-screen');
    // Their reaction, on its own stream - sharper the second time.
    const stream = page.getByTestId('ticket-reactions');
    await expect(stream).toContainText('There is no need to take that tone');
    await expect(stream).toContainText('twice you have spoken to me like that');
  });
});


/* ========================================================================= *
 * The senior rung: the second queue (E9, 0.36.0).
 *
 * Its own session because it is its own JOB. The start select writes one desk
 * per browser, and a probation week cannot also be a senior's week - so the
 * only way to walk a rung is to be hired onto it, which is what this run does
 * before it touches anything.
 *
 * The journey is the rung's own day, in the order a person would live it: read
 * somebody else's filing, disagree with one and agree with another, watch the
 * one you agreed with come back, write the article the repetition earns, and
 * send a handoff that does not take the ticket off your board.
 * ========================================================================= */

test('walks the second queue: audited, corrected, billed and written up',
  async ({ page }) => {
    await recordControls(page);
    // Several days are run out inside this one, so it gets the room the other
    // multi-day runs get rather than a cliff.
    test.setTimeout(1_800_000);
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const boot = page.getByTestId('boot-screen');

    if (await boot.isVisible()) {
      await page.keyboard.press('Space');
    }

    // HIRED AS A SENIOR, through the shipped ladder rather than through a
    // seeded save: the whole of D1 is that the desk you are hired onto is the
    // difficulty select, and a walk that wrote the title itself would be
    // walking a second way to be a senior.
    await expect(page.getByTestId('login-desk')).toBeVisible();
    await page.getByTestId('login-desk').selectOption('sd_senior');
    await page.getByTestId('login-password').fill('hunter2');
    await page.getByTestId('login-submit').click();

    // The pick rebuilds the world, so the machine starts again.
    await expect(page.getByTestId('login-screen'))
      .toBeVisible({ timeout: 30_000 });
    await completeLogin(page, { brief: 'keep' });
    await beginShift(page);

    // Far enough into the morning that first line have filed the first two.
    await workUntilMinute(page, 800);

    await step('tickets.tab-audit', async () => {
      await openFromStartMenu(page, 'tickets');
      await expect(page.getByTestId('tickets-tabs')).toBeVisible();
      await page.getByTestId('tickets-tab-audit').click();
      await expect(page.getByTestId('tickets-tab-audit'))
        .toHaveAttribute('aria-pressed', 'true');
    });

    await step('tickets.audit-panel', async () => {
      await page.getByTestId('ticket-row-audit-print-task').click();
      await expect(page.getByTestId('ticket-audit')).toBeVisible();
      await expect(page.getByTestId('ticket-audit-who'))
        .toContainText('first line');
      // What was filed, and NOT whether it is right: the panel states the
      // filing and leaves the judgement where it belongs.
      await expect(page.getByTestId('ticket-audit-filed'))
        .toContainText('They filed');
    });

    /**
     * The correction, through the QUEUE'S OWN TRIAGE FORM. There is no
     * audit-correct control to click and that is the design: a correction is a
     * triage, and the same two dropdowns and the same button file it.
     */
    await step('tickets.audit-correct', async () => {
      await page.getByTestId('triage-impact').selectOption('3');
      await page.getByTestId('triage-urgency').selectOption('2');
      await expect(page.getByTestId('triage-file')).toBeEnabled();
      await page.getByTestId('triage-file').click();
      await expect(page.getByTestId('ticket-audit-outcome'))
        .toContainText('re-triaged');
      // And it cost the rest of the thought you were having, which the desk
      // says out loud on the same beat every interruption in this game does.
      await expect(page.getByTestId('ticket-audit')).toHaveAttribute(
        'data-verdict',
        'corrected',
      );
    });

    // The other one: agreed with, as filed, for nothing - which is the whole
    // temptation the bill later is the answer to.
    await step('tickets.audit-confirm', async () => {
      await page.getByTestId('ticket-row-audit-marketing-spooler').click();
      const confirm = page.getByTestId('audit-confirm');
      await expect(confirm).toBeEnabled();
      await confirm.click();
      await expect(page.getByTestId('ticket-audit')).toHaveAttribute(
        'data-verdict',
        'confirmed',
      );
      await expect(page.getByTestId('audit-confirm')).toBeDisabled();
    });

    await step('tickets.tab-mine', async () => {
      await page.getByTestId('tickets-tab-mine').click();
      await expect(page.getByTestId('tickets-tab-mine'))
        .toHaveAttribute('aria-pressed', 'true');
      // Your own queue has been running the whole time you were in theirs.
      await expect(page.getByTestId('tickets-tab-mine')).toContainText('My queue');
    });

    /**
     * Retained ownership: the handoff goes and the ticket stays, with the clock
     * still running. Driven on one of the player's OWN tickets, because that is
     * where the rung's second shape break lives - it is not an audit thing.
     *
     * THE TICKET IS NAMED, and that is the fix for what a box run found the
     * hard way: this step used to press `ticket-escalate` on whatever happened
     * to be open, which at that moment was a desk-fixable audit item, so the
     * button was correctly disabled and the walk clicked at it for half an
     * hour. The escalate button is only live on a ticket whose own resolution
     * rule accepts escalation, and this shop has exactly one of those in a
     * drawn week - `pool-product-login-down`, the product on the Linux box the
     * desk cannot reach on OS or on tier. The seed deals it on the Monday at
     * 09:45, deterministically (`weekSeedFor` is a hash of the shop and the
     * week, and nothing in this run has moved either); `world/audit.test.ts`
     * asserts in milliseconds that the drawn week still holds one, so a pool
     * change that moved it reds there rather than here.
     */
    await step('tickets.retained', async () => {
      // THE DIAGNOSIS FIRST, because the form means it. "What I tried" fills
      // itself from the ticket's own touch log and a handoff with nothing
      // tried is accepted, sent, and BOUNCED - which a box run proved by
      // walking straight to the escalate button and watching the retained row
      // never come. The desk can prove exactly two true things about APP-01
      // and the walk now proves both: it answers on the wire, and ssh stops
      // at this desk's tier.
      await openFromStartMenu(page, 'cmd');
      await runCommand(page, 'ping APP-01');
      await runCommand(page, 'ssh APP-01');
      // Visible first, same manners as the escalate button below: a missing
      // control should red in seconds, not eat the multi-day run's budget.
      await expect(page.getByTestId('close-cmd')).toBeVisible();
      await page.getByTestId('close-cmd').click();

      await page.getByTestId('ticket-row-pool-product-login-down').click();
      const escalate = page.getByTestId('ticket-escalate');
      // ENABLED FIRST, always. A disabled control is a wrong target, and a
      // wrong target should red in seconds rather than time the suite out
      // clicking at something that was never going to move.
      await expect(escalate).toBeEnabled();
      await escalate.click();
      // The evidence arrived without being typed: the form lists the ping and
      // the refused ssh off the log, which is the difference between this
      // handoff and a ticket number with a name on it.
      await expect(page.getByTestId('handoff-tried'))
        .toContainText('answers on the wire');
      await expect(page.getByTestId('handoff-tried')).toContainText('Tried ssh');
      await page.getByTestId('handoff-reported').fill(
        'Customers cannot sign in; APP-01 answers on the wire and is out of '
        + 'reach on OS and on tier.',
      );
      const send = page.getByTestId('handoff-send');
      await expect(send).toBeEnabled();
      await send.click();
      await expect(page.getByTestId('ticket-detail-retained'))
        .toContainText('still yours');
    });

    // The clock the confirmed filing bought runs out on TUESDAY (~13:16 -
    // spawn 795 plus the P4 day plus the arrival minutes the SLA excuses),
    // and the bill lands as a toast plus a line ON THE TICKET'S RECORD. The
    // walk asserts the record on Wednesday, not the notification panel: the
    // panel is a 24-slot history, and three box runs in a row watched a busy
    // Tuesday walk the career event straight out of it - which is exactly
    // why the fallout writes the file too. The mechanism and its minute stay
    // audit-teeth's to prove.
    await runToDayEnd(page);
    await logInOnDay(page, 2, { brief: 'keep' });
    await beginShift(page);

    // Wednesday: the second instance of the class - ruling on it is what
    // earns the prompt. (The days each item lands on are a budget decision
    // measured against the drawn week - see `AUDIT_ITEMS`.)
    await runToDayEnd(page);
    await logInOnDay(page, 3, { brief: 'keep' });
    await beginShift(page);
    await workUntilMinute(page, 700);

    await openFromStartMenu(page, 'tickets');
    await page.getByTestId('tickets-tab-audit').click();

    await step('tickets.audit-bill', async () => {
      // Monday's signature, on Monday's filing, read off the file where QA
      // wrote it - durable across any number of louder days since.
      await page.getByTestId('ticket-row-audit-marketing-spooler').click();
      await expect(page.getByTestId('ticket-worknotes'))
        .toContainText('QA sign-off came back');
    });

    await page.getByTestId('ticket-row-audit-print-workstation').click();
    await expect(page.getByTestId('audit-confirm')).toBeEnabled();
    await page.getByTestId('audit-confirm').click();

    await step('tickets.write-up', async () => {
      await expect(page.getByTestId('ticket-writeup')).toBeVisible();
      await page.getByTestId('audit-author-article').click();
      await expect(page.getByTestId('ticket-writeup')).toHaveCount(0);
      // And the article is on the shelf, which is the compounding half: it was
      // not there to be read a minute ago.
      await openFromStartMenu(page, 'kb');
      await expect(
        page.getByTestId('kb-row-impact-is-the-estate-not-the-fault'),
      ).toBeVisible();
    });
  });

/* ========================================================================= *
 * The gate.
 * ========================================================================= */

test('drove every function the coverage manifest lists', () => {
  for (const run of Object.keys(WALK_RUNS) as WalkRunId[]) {
    const missing = coverageFor(run)
      .filter((entry) => !walked.has(entry.id))
      .map((entry) => entry.id);

    expect(missing, `the "${run}" run left these undriven: ${WALK_RUNS[run]}`)
      .toEqual([]);
  }

  // And nothing was driven that nobody listed, which would mean the ledger and
  // the manifest have drifted apart in the other direction.
  const listed = new Set(COVERAGE.map((entry) => entry.id));
  expect([...walked].filter((id) => !listed.has(id))).toEqual([]);
  expect(walked.size).toBe(COVERAGE.length);
});

/**
 * The other direction, and the one that used to have nothing looking at it.
 *
 * Everything above argues with `COVERAGE`, which is a list of FUNCTIONS; both
 * halves of that gate read the same list, so a UI-only control reaching no new
 * action, command, app or scene could be added, left out of the list, and pass
 * both. This one argues with the DOM: every button, select, input and textarea
 * these four sessions actually put on screen has to be a control somebody
 * wrote down in `PLAYER_CONTROLS`.
 *
 * A failure here is a list to extend, not a bug to hunt: the message names the
 * ids nobody has accounted for.
 */
test('saw no control the inventory does not know about', () => {
  const unknown = [...seenControls]
    .filter((id) => !isDeclaredControl(id))
    .sort((left, right) => left.localeCompare(right));

  expect(
    unknown,
    'controls on screen that PLAYER_CONTROLS does not list - add them there '
      + 'with the function they belong to, or take them off the screen',
  ).toEqual([]);

  // And the walk really did look: a run that saw nothing has a broken
  // recorder rather than a product with no buttons in it.
  expect(seenControls.size).toBeGreaterThan(30);
});
