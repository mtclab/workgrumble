import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  beginShift,
  boxOf,
  clockOffFor,
  completeLogin,
  dragBy,
  focusWindow,
  logInOnDay,
  openFromDesktopIcon,
  openFromStartMenu,
  realMs,
  runCommand,
  runSimMinutes,
  runToDayEnd,
  runToTelegraph,
  workUntil,
  workUntilMinute,
} from './helpers';
import {
  COVERAGE,
  type CoverageId,
  coverageEntry,
  coverageFor,
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

/** Everything this file has actually driven, by coverage id. */
const walked = new Set<string>();

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

/** Runs the clock a minute at a time until the lead is actually in the room. */
async function runUntilCaught(page: Page): Promise<void> {
  const caught = page.getByTestId('window-caught');

  for (let minute = 0; minute < 20 && await caught.count() === 0; minute += 1) {
    await page.clock.runFor(realMs(1, 4));
  }

  await expect(caught).toBeVisible();
}

/** Runs the clock until the desk is on the far side of its can. */
async function runUntilCrash(page: Page): Promise<void> {
  const desktop = page.getByTestId('desktop');

  for (let minute = 0; minute < 80; minute += 5) {
    if (await desktop.getAttribute('data-drink') === 'crash') {
      return;
    }

    await page.clock.runFor(realMs(5, 4));
  }

  await expect(desktop).toHaveAttribute('data-drink', 'crash');
}

/* ========================================================================= *
 * Run one: the week, played properly.
 * ========================================================================= */

test('walks every function of a probation week that goes well', async ({
  page,
}) => {
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
    await page.clock.runFor(realMs(10, 4));
    await expect(clock).toHaveText(stopped);
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
  });

  await step('desktop.icon', async () => {
    await openFromDesktopIcon(page, 'about');
  });

  await step('about.window', async () => {
    await expect(page.getByTestId('about-status')).toContainText('System is');
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
    await expect(page.getByTestId('mail-summary')).toContainText('3 unread');
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
    await expect(page.getByTestId('mail-summary')).toContainText('2 unread');
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
      .toContainText('Empty the queue FIRST');
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

    // Second line get round to it, and it lands back on the desk with a note,
    // a mail and a bill.
    await runSimMinutes(page, 25);
    await expectNoticed(page, 'Returned by second line');
    await openTicket(page, 'fan-noise');
    await expect(page.getByTestId('ticket-worknotes'))
      .toContainText('Returned by second line');
  });

  await step('mail.bounce', async () => {
    await openFromStartMenu(page, 'mail');
    await page.getByTestId('mail-row-handoff-bounce').click();
    await expect(page.getByTestId('mail-reader')).toContainText('what is this');
  });

  await step('remote.window', async () => {
    await openFromStartMenu(page, 'remote');
    await expect(page.getByTestId('remote-summary'))
      .toContainText('workstations');
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
    await expect(page.getByTestId('about-value-shift-clock'))
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

  await step('browser.bookmarks', async () => {
    await page.getByTestId('browser-home-button').click();
    await expect(page.getByTestId('browser-home')).toBeVisible();
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
    await expect(page.getByTestId('caught-note')).toContainText('17:00');
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
    await expect(page.getByTestId('cmd-output'))
      .toContainText('VPN Concentrator');
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
    await expect(page.getByTestId('cmd-output'))
      .toContainText('[hardware, not restartable]');
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

  /* -- Tuesday: the overnight outage, the spooler, and a favour ------------ */

  await beginShift(page);
  await workUntilMinute(page, 90);

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
    await runCommand(page, 'verify praval');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('Identity check recorded');
    await runCommand(page, 'verify nobodyhere');
    await expect(page.getByTestId('cmd-output')).toContainText('No account matches');
  });

  await step('cmd.mfa', async () => {
    await runCommand(page, 'mfa praval');
    await expect(page.getByTestId('cmd-output'))
      .toContainText('New authenticator enrolled');
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

  await clockOffFor(page, 3);

  /* -- Thursday: the arc, a relock, and forty people with one fault -------- */

  await beginShift(page);
  await workUntilMinute(page, 70);

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
    await expect(page.getByTestId('events-table').locator('.events-day').first())
      .toContainText('Day');
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

  await workUntilMinute(page, 230);

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
        'it-career-sim/save',
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

  /* -- Tuesday: the favour, done off the books ----------------------------- */

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
  // Playing two full days through the UI before the beat under test costs
  // most of ten minutes on the box; give the run room rather than a cliff.
  test.setTimeout(1_800_000);
  await logInOnDay(page, 3, { brief: 'keep' });
  await workUntil(page, 140);

  await step('chat.option-verify', async () => {
    await openFromStartMenu(page, 'chat');
    await page.getByTestId('chat-person-priya').click();
    await chatOption(page, /confirm her payroll number/);
    await chatOption(page, /having it and hearing it are different things/);
    await expect(page.getByTestId('chat-transcript')).toContainText('4471');
    await chatOption(page, /Enrol the new phone now that you know who she is/);
    await expectClosed(page, 'mfa-reregister');
  });

  await clockOffFor(page, 3);
  await beginShift(page);
  await openFromStartMenu(page, 'mail');
  await expect(page.getByTestId('mail-row-security-incident')).toHaveCount(0);
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
