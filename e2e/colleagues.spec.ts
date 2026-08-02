import { expect, type Page, test } from '@playwright/test';

import {
  beginShift,
  clockOffFor,
  logInOnDay,
  openFromStartMenu,
  runRealMinutes,
  runSimMinutes,
  workUntilMinute,
} from './helpers';

/**
 * The colleagues, on the built artifact, through the real entry point.
 *
 * One journey per payload, and each of them asserts the GOAL a player is after
 * rather than a control having been clickable:
 *
 * - somebody comes to the desk with something that should be a ticket, and
 *   BOTH answers are walked to the end - the job done off the books with
 *   nothing left behind, and the same job done because a ticket asked for it;
 * - somebody says "Hi." and nothing else, and the minutes waiting it out
 *   costs are the minutes it said it would cost;
 * - a request lands five minutes before everybody goes home, and its clock is
 *   still honest tomorrow morning.
 *
 * The minutes are the week's own, and the walk-up takes no jitter, so they can
 * be waited for rather than searched for. What IS searched for is the arrival
 * itself, because the lead's rounds can slide it and a test that pinned the
 * minute would break the day a patrol seed moves.
 */

/** The Friday minute somebody comes over, counting from 08:00. */
const WALK_UP_MINUTE = 11 * 60 + 40 - 8 * 60;
/** Monday's bare greeting, and how long he takes to type the rest of it. */
const HELLO_MINUTE = 10 * 60 + 50 - 8 * 60;
const HELLO_TYPING = 5;
/** And five to five on the Wednesday. */
const BEFORE_CLOSE_MINUTE = 16 * 60 + 55 - 8 * 60;

/** Every `data-` attribute the conversation window carries, in one read. */
type Takeover = Readonly<Record<string, string | undefined>>;

/**
 * Runs the clock a minute at a time until somebody is actually at the desk,
 * and answers with the window's own attributes as they stood in the read that
 * decided to stop.
 *
 * One read, one paint, one set of facts about it - the same contract the
 * interruption suite's hunt keeps, and for the same reason: the conversation
 * lasts the minutes its row says and a second round-trip is a later minute.
 */
async function huntForTheDesk(page: Page, limit = 60): Promise<Takeover> {
  const app = page.getByTestId('call-app');

  for (let minute = 0; minute < limit; minute += 1) {
    if (await app.count() > 0) {
      const snapshot: Takeover = await app.evaluate(
        (node) => ({ ...(node as HTMLElement).dataset }),
      );

      if (snapshot.source === 'walk_up') {
        return snapshot;
      }
    }

    await runSimMinutes(page, 1, 1);
  }

  throw new Error('Nobody came to the desk inside the hour.');
}

/* -- gate 1: the walk-up, both answers walked ------------------------------ */

/**
 * OFF THE BOOKS: the two-minute favour, done in the conversation that was
 * already happening, leaving nothing behind at all.
 *
 * The journey is the whole of it: a ticket open on the screen when somebody
 * arrives, the job done for them, the queue coming back untouched, and - the
 * claim that matters - no row anywhere with his name on it afterwards. The
 * work is real and Friday cannot see it, which is the trade rather than a
 * punishment.
 */
test('somebody at the desk, done off the books, and nothing to show for it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await logInOnDay(page, 5, { brief: 'keep' });
  await beginShift(page);

  // Mid-ticket, which is the only interesting time for this to happen.
  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-phishing-report').click();
  await expect(page.getByTestId('ticket-detail-title')).not.toBeEmpty();

  await workUntilMinute(page, WALK_UP_MINUTE - 4);

  // The clock is put UP deliberately, so the drop is a claim about the game
  // rather than about the helper: a person arriving is in `slowsTheClock`,
  // and the minutes she takes are minutes a player has to be able to read.
  await page.getByTestId('day-speed-4').click();
  await expect(page.getByTestId('day-speed-4'))
    .toHaveAttribute('data-active', 'true');

  const desk = await huntForTheDesk(page);

  // Not the phone. The window says so, in the words it uses rather than in an
  // attribute only a test can see.
  expect(desk.answered).toBe('false');
  await expect(page.getByTestId('call-caller')).toContainText('Gary');
  await expect(page.getByTestId('call-state')).toContainText('can see you');
  await expect(page.getByTestId('call-answer')).toHaveText('Look up');

  // And the day dropped to x1 when he arrived, and stayed there.
  await expect(page.getByTestId('day-speed-1'))
    .toHaveAttribute('data-active', 'true');

  await page.getByTestId('call-answer').click();
  await expect(page.getByTestId('call-app'))
    .toHaveAttribute('data-answered', 'true');

  // The option that does it there and then. It is the dialogue effect doing
  // the dispatching, through the same verb Remote Assist uses.
  await page.getByTestId('call-option-0').click();
  await expect(page.getByTestId('call-transcript'))
    .toContainText('off the books');

  // THE WORLD MOVED: the box that had been asking since before his fortnight
  // has gone round, which is what he came over about.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-gary').click();
  await expect(page.getByTestId('remote-dialog'))
    .toContainText('System Notice');

  // Well past the minute he would have filed one.
  await workUntilMinute(page, WALK_UP_MINUTE + 40);

  // THE HONESTY: there is no ticket, so there is nothing for Friday to count.
  // Not "we chose not to show it" - the row does not exist.
  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-gary-restart')).toHaveCount(0);
});

/**
 * FILED: the same repair, done because a ticket asked for it, and the only
 * version of it the week can read.
 *
 * The journey ends where the trade is actually settled - on the ticket that
 * exists, in the queue, with a clock on it, closed by the route its own
 * content advertises. The social cost is a line of grumbling and it is
 * asserted, because "a beat of social cost" that nobody ever reads is not one.
 */
test('somebody at the desk, sent to the form, and the ticket that counts', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await logInOnDay(page, 5, { brief: 'keep' });
  await beginShift(page);

  await workUntilMinute(page, WALK_UP_MINUTE - 4);
  await huntForTheDesk(page);

  // The three verbs are the same three verbs and none of them says "message
  // first" to a man standing in front of you.
  await expect(page.getByTestId('call-defer'))
    .toHaveText('Ask for twenty minutes');
  await expect(page.getByTestId('call-decline')).toHaveText('Say not now');

  await page.getByTestId('call-answer').click();

  // The social beat: he does not refuse, he explains why the form is annoying,
  // which is the true version of this conversation everywhere it happens.
  await page.getByTestId('call-option-1').click();
  await expect(page.getByTestId('call-transcript'))
    .toContainText('take the point about there being a record');

  // Eight minutes to walk back to Payroll and find the form.
  await workUntilMinute(page, WALK_UP_MINUTE + 20);

  await openFromStartMenu(page, 'tickets');
  const row = page.getByTestId('ticket-row-gary-restart');
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByTestId('ticket-detail-reporter')).toContainText('Gary');
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  // And it closes the way its own content says, which is the same repair the
  // other walk did for nothing.
  await openFromStartMenu(page, 'remote');
  await page.getByTestId('remote-machine-gary').click();
  await page.getByTestId('remote-reboot').click();

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-gary-restart').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
});

/* -- gate 2: the bare greeting -------------------------------------------- */

/**
 * "Hi." - and what asking buys over waiting, in minutes of a shift.
 *
 * Both halves are walked in one session because the claim is a COMPARISON:
 * the question is the same question either way, and the only difference is
 * how much of a Monday morning it cost. The window says the number before
 * anybody spends it, which is the legibility rule this game keeps everywhere.
 */
test('a bare hello costs the minutes it says, and asking skips them', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await logInOnDay(page, 1, { brief: 'keep' });
  await beginShift(page);

  await workUntilMinute(page, HELLO_MINUTE + 1);

  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-owen').click();

  const typing = page.getByTestId('chat-typing');
  await expect(typing).toHaveAttribute('data-typing', 'true');
  // A greeting and nothing else, which is the complaint the page he links is
  // about and which he is, at this moment, doing.
  await expect(page.getByTestId('chat-transcript')).toContainText('Hi.');

  // The cost, stated before it is paid.
  await page.getByTestId('day-pause').click();
  await expect(page.getByTestId('day-pause'))
    .toHaveAttribute('aria-pressed', 'true');
  const owed = Number(await typing.getAttribute('data-left') ?? '0');
  expect(owed).toBeGreaterThan(0);
  expect(owed).toBeLessThanOrEqual(HELLO_TYPING);
  await expect(typing).toContainText('one click');
  await page.getByTestId('day-pause').click();

  // Asking. One click, and the question is there - the same question, minutes
  // earlier than it was going to be.
  await page.getByTestId('chat-option-0').click();
  await expect(page.getByTestId('chat-transcript')).toContainText('despatch');
  // And the dots are gone, because there is nothing left to be typing.
  await expect(typing).toHaveAttribute('data-typing', 'false');

  // THE LINK, which is the payoff of the beat: the man doing it is the man
  // who read the page about it.
  await page.getByTestId('chat-option-0').click();
  await expect(page.getByTestId('chat-transcript'))
    .toContainText('nohello.invalid');

  await openFromStartMenu(page, 'browser');
  await page.getByTestId('browser-site-nohello').click();
  await expect(page.getByTestId('browser-thread'))
    .toContainText(/do not say just hello/i);
});

/**
 * And the other half: nobody asks, and the minutes go anyway.
 *
 * It drives its own real time rather than the house helper, because the point
 * is a stretch of clock in which the player does NOTHING - and a helper that
 * re-asserted a speed would be pressing a button in a test about not pressing
 * one.
 */
test('waiting it out spends the minutes the indicator counted', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await logInOnDay(page, 1, { brief: 'keep' });
  await beginShift(page);

  await workUntilMinute(page, HELLO_MINUTE + 1);
  await openFromStartMenu(page, 'chat');
  await page.getByTestId('chat-person-owen').click();

  const typing = page.getByTestId('chat-typing');
  await expect(typing).toHaveAttribute('data-typing', 'true');
  await expect(page.getByTestId('chat-transcript')).not.toContainText('despatch');

  // One minute at a time, at x1, with nothing pressed: the number on the
  // screen has to come down by one for each of them, or the cost it advertises
  // is not the cost it charges.
  for (let minute = 1; minute < HELLO_TYPING; minute += 1) {
    const before = Number(await typing.getAttribute('data-left') ?? '0');
    await runRealMinutes(page, 1, 1);
    await expect(typing).toHaveAttribute('data-left', String(before - 1));
  }

  // And then he gets there by himself, in the same words the click would have
  // bought several minutes ago.
  await runRealMinutes(page, 2, 1);
  await expect(typing).toHaveAttribute('data-typing', 'false');
  await expect(page.getByTestId('chat-transcript')).toContainText('despatch');
});

/* -- gate 3: the request at five to five ----------------------------------- */

/**
 * A ticket raised with five minutes of the shift left, and a clock that is
 * still telling the truth tomorrow morning.
 *
 * The journey crosses a night on purpose. What is asserted on the Wednesday is
 * that the response deadline is NOT tonight - it reads five to ten, which is
 * fifty-five minutes of tomorrow added to the five that are left of today -
 * and what is asserted on the Thursday is that the ticket is still there, is
 * still workable, and closes inside a resolution deadline nobody scripted.
 */
test('the five-to-five request carries its clock into the morning', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await logInOnDay(page, 3, { brief: 'keep' });
  await beginShift(page);

  await workUntilMinute(page, BEFORE_CLOSE_MINUTE + 1);

  await openFromStartMenu(page, 'tickets');
  const row = page.getByTestId('ticket-row-vpn-month-end');
  await expect(row).toHaveCount(1);
  await row.click();

  await expect(page.getByTestId('ticket-detail-raised')).toHaveText('16:55');
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  // THE CROSS-DAY TRUTH, on the screen the player reads it from: an hour from
  // five to five is five minutes of tonight and fifty-five of tomorrow, so the
  // response clock runs out at five to ten in the morning rather than at five
  // to six this evening.
  await expect(page.getByTestId('ticket-detail-response'))
    .toHaveAttribute('data-due', '09:55');
  await expect(page.getByTestId('ticket-detail-response'))
    .not.toContainText('Breached');

  // Home time, and it goes with you.
  await clockOffFor(page, 3);
  await beginShift(page);

  await openFromStartMenu(page, 'tickets');
  await expect(page.getByTestId('ticket-row-vpn-month-end')).toHaveCount(1);

  // Nine o'clock on the Thursday, and it is workable - which is the whole
  // reason it was not a cheat to deal it at five to five.
  await page.getByTestId('ticket-row-vpn-month-end').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Open');

  await openFromStartMenu(page, 'directory');
  await page.getByTestId('directory-search').fill('');
  await page.getByTestId('directory-row-marcus').click();
  await page.getByTestId('directory-group-picker').selectOption('group:vpn-users');
  await page.getByTestId('directory-add-group').click();

  await openFromStartMenu(page, 'tickets');
  await page.getByTestId('ticket-row-vpn-month-end').click();
  await expect(page.getByTestId('ticket-detail-state')).toContainText('Closed');
});
