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
  workUntil,
  workUntilMinute,
  workUntilTicket,
  worldHash,
} from './helpers';
import { REFUSED_TOKENS, SHARED_TOKEN } from './tokens';
import { AWAY_NOTICED_LINES } from '../src/world/dialogue';
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
/**
 * Holds the day still for a read that has to be exact.
 *
 * The house lesson, learned again: an assertion retries in REAL time and the
 * clock is running in SIM time, so at x4 every half-second of retrying spends
 * two minutes of somebody's afternoon. Anything pinning an exact minute - a
 * countdown, a taskbar clock - reads it with the day stopped, which is a
 * control the player has and the one control every takeover leaves reachable.
 */
async function underPause<T>(page: Page, read: () => Promise<T>): Promise<T> {
  const pause = page.getByTestId('day-pause');
  const already = await pause.getAttribute('aria-pressed') === 'true';

  if (!already) {
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
  }

  try {
    return await read();
  } finally {
    if (!already) {
      await pause.click();
      await expect(pause).toHaveAttribute('aria-pressed', 'false');
    }
  }
}

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
  if (await page.getByTestId('window-remote').count() === 0) {
    await openFromStartMenu(page, 'remote');
  } else {
    await focusWindow(page, 'remote');
  }

  await page.getByTestId('remote-machine-ada').click();

  const viewport = page.getByTestId('remote-viewport');
  // The other wrong angle, whichever this is: applying the angle a screen is
  // already at is refused before the click, by a button that greys itself out.
  const angle = await viewport.getAttribute('data-rotation') === '180'
    ? '90'
    : '180';

  await page.getByTestId('remote-rotation-picker').selectOption(angle);
  await page.getByTestId('remote-apply-rotation').click();
  await expect(viewport).toHaveAttribute('data-rotation', angle);
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

  await step('brief.start-shift', async () => {
    await page.getByTestId('brief-start-shift').click();
    await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');
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
    await expect(page.getByTestId('sim-clock-time')).toHaveText('09:00');
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

  await step('weekend.onward-locked', async () => {
    const onward = page.getByTestId('weekend-onward');
    await expect(onward).toBeDisabled();
    await expect(onward).toHaveAttribute('title', /not built yet/);
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
