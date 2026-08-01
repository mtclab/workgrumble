/**
 * A whole week, driven headlessly through the shipped driver and the shipped
 * engine: five days, four nights, a review on the Friday and a screen at the
 * end of it.
 *
 * It is the M4 determinism gate, and it is the day gate's older brother. The
 * scripted DAY proves that a shift replays; a week has things in it that only
 * a week has - deadlines that survive a night, a queue that carries over, a
 * mark made out of five days' work, and a conversation at three
 * o'clock on Friday that reads it. Every one of those is a place where a
 * change could be invisible on any single day and wrong by Friday.
 *
 * Two weeks are walked for the golden. The WORKED week closes what arrives,
 * using the paths the content itself advertises, and passes the review; the
 * IDLE week touches nothing and is fired. Both are pinned to committed numbers,
 * because two runs agreeing only proves the run is repeatable - a changed rate
 * moves both of them together and sails through.
 *
 * Three more are walked for BALANCE, at the bottom of the file: half the
 * roster, the whole roster with the forum open all week, and both at once. The
 * question there is different - not "does the week replay" but "can the review
 * tell these apart, and what has it stopped being able to tell apart on
 * purpose" - and the answer is a committed table rather than a hash.
 *
 * Nothing below touches the DOM, so the real driver runs exactly as it does in
 * the browser, minus the browser.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { type ConductEntry, conductEntries } from '../world/conduct';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { isUnresolved } from '../world/sla';
import { createWorldSession } from '../world/session';
import { findWorldTicket } from '../world/tickets';
import {
  REVIEW_DAY,
  REVIEW_PASS_PERFORMANCE,
  type ReviewOutcome,
  reviewTick,
  type WeekScorecard,
} from '../world/week';
import { AppStateStore } from './app-state';
import { APP_MANIFEST } from './apps';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

const SLACK_APPS: ReadonlySet<string> = new Set(
  APP_MANIFEST.filter((app) => app.slack).map((app) => app.id),
);

interface Week {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
  readonly appState: AppStateStore;
  readonly timeline: string[];
}

function startWeek(): Week {
  const { engine, seed } = createWorldSession();
  const appState = new AppStateStore();
  const timeline: string[] = [];
  const visible = (): readonly string[] => appState.get().windows.open
    .filter((entry) => !entry.minimized && SLACK_APPS.has(entry.appId))
    .map((entry) => entry.appId);
  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    openSlackApps: visible,
    focusedSlackApp: () => {
      const { focusedId } = appState.get().windows;
      return focusedId !== null && visible().includes(focusedId)
        ? focusedId
        : null;
    },
    onCaught: (appId, tick) => {
      timeline.push(`caught:${appId}@${String(tick)}`);
    },
    // The week's own beats, in the minute they land: somebody messaging you
    // instead of raising a ticket, a chain coming back, a maintenance window
    // opening, and the bill for a shortcut arriving a day later.
    onNotice: (title) => {
      // The lead's footsteps are the DAY's beat and the day golden already
      // pins them three times over; a week timeline with fifteen of them in it
      // is a timeline nobody reads, which defeats the point of committing one.
      if (title !== 'Footsteps') {
        timeline.push(`notice:${title}@${String(engine.now())}`);
      }
    },
    onDirectMessage: (speaker, tick) => {
      timeline.push(`dm:${speaker}@${String(tick)}`);
    },
    // The minute the screen stopped being the player's. The END is left out
    // for the same reason the footsteps are: a call that arrived has an end
    // six minutes later by arithmetic, and the meeting's end says so itself,
    // in the notice about the recap.
    onInterruption: (view) => {
      timeline.push(`interrupted:${view.entry.id}@${String(view.entry.tick)}`);
    },
    onReview: (outcome, tick) => {
      timeline.push(`review:${outcome}@${String(tick)}`);
    },
    onBeerUnlocked: () => {
      timeline.push(`beer@${String(engine.now())}`);
    },
    onWeekEnd: (outcome) => {
      timeline.push(`week:${outcome}@${String(engine.now())}`);
    },
  });

  return { driver, engine, appState, timeline };
}

function show(world: Week, apps: readonly string[]): void {
  world.appState.patch('windows', {
    open: apps.map((appId) => ({ appId, minimized: false })),
    focusedId: apps[apps.length - 1] ?? null,
  });
}

/** Runs the clock to a minute of the current day, a tick at a time. */
function runTo(world: Week, tick: number): void {
  while (world.engine.now() < tick && world.driver.state() === 'shift') {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

/**
 * Competent play, expressed as the content expresses it: for every ticket in
 * the queue that is still somebody's problem, drive the first way the ticket
 * itself says it can be closed.
 *
 * Written against the CONTENT rather than against a list of action ids, so a
 * ticket whose advertised path changes is a ticket this week still closes -
 * and a ticket whose path stops working is a week that stops passing.
 */
function workTheQueue(
  world: Week,
  skip: (id: string) => boolean = () => false,
): void {
  for (const ticket of world.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket) || skip(ticket.id)) {
      continue;
    }

    const path = findWorldTicket(ticket.id)?.paths[0];

    if (path === undefined) {
      continue;
    }

    for (const step of path.steps) {
      world.driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      );
    }
  }
}

interface WalkedWeek {
  readonly hash: string;
  readonly tick: number;
  readonly outcome: ReviewOutcome;
  readonly card: WeekScorecard;
  readonly meters: Record<string, number>;
  readonly timeline: readonly string[];
  /** The conduct file the week wrote, as the world holds it. */
  readonly filed: readonly ConductEntry[];
  /**
   * What the player could have read an hour BEFORE the conversation: the file,
   * who had a reason to open it, and the bar that would produce. It is
   * captured at two o'clock on the Friday and is the whole of the legibility
   * gate - nothing at three may come out of a state that was not in here.
   */
  readonly atTwo: {
    readonly filed: readonly ConductEntry[];
    readonly triggers: readonly string[];
    readonly bar: number;
    readonly mark: number;
  };
}

const METERS: readonly string[] = [
  FIELDS.stress,
  FIELDS.suspicion,
  FIELDS.reputation,
  // The number the conversation on Friday actually reads: the week as a
  // percentage of its own work, weighted toward how it ended. It is in the
  // golden because it is what decides the ending - and it sits beside the
  // meter on purpose, because the two now answer different questions and a
  // slice that quietly reconnected them would show up here as both moving
  // together.
  FIELDS.weekReputation,
  FIELDS.caughtEvents,
  FIELDS.farmFund,
  FIELDS.weekAttempt,
];

/** An hour before the conversation, which is when the player still has one. */
const ONE_HOUR = 60;

function walk(play: (world: Week, day: number) => void): WalkedWeek {
  const world = startWeek();
  let atTwo: WalkedWeek['atTwo'] | null = null;

  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    expect(world.driver.day()).toBe(day);
    world.driver.startShift();
    play(world, day);

    if (day === REVIEW_DAY) {
      // Two o'clock on the Friday, with the file still a private document and
      // the conversation an hour away. Everything the review will do is
      // readable here, on the screens the player has had open all week.
      runTo(world, reviewTick(day) - ONE_HOUR);
      const reading = world.driver.conductReading();
      atTwo = {
        filed: conductEntries(world.driver.conductFile()),
        triggers: reading.triggers.map((trigger) => trigger.id),
        bar: reading.bar,
        mark: world.driver.weekReading(),
      };
    }

    runTo(world, shiftEndTick(day));
    expect(world.driver.state()).toBe('day_end');
    world.driver.clockOff();
  }

  if (atTwo === null) {
    throw new Error('The week never reached the Friday it is scored on.');
  }

  return {
    hash: world.engine.snapshotHash(),
    tick: world.engine.now(),
    outcome: world.driver.reviewOutcome(),
    card: world.driver.weekScorecard(),
    meters: Object.fromEntries(METERS.map((field) => {
      const value = world.engine.graph.getField(COMPANY_IDS.player, field);
      return [field, typeof value === 'number' ? value : Number.NaN];
    })),
    timeline: world.timeline,
    filed: conductEntries(world.driver.conductFile()),
    atTwo,
  };
}

/**
 * The week somebody actually worked.
 *
 * Two sweeps of the queue a day - one mid-morning, one mid-afternoon, which is
 * how the drip is caught as well as the pile - and a bit of texture: a browser
 * left up on the Wednesday, hidden before the lead's second round, because a
 * week with nothing to hide in it is not this game.
 */
function workedWeek(world: Week, day: number): void {
  const start = shiftStartTick(day);

  runTo(world, start + 90);
  workTheQueue(world);

  if (day === 3) {
    show(world, ['browser']);
    runTo(world, start + 150);
    show(world, []);
  }

  // Three sweeps rather than two. The week deals its heaviest arrivals in the
  // late morning and its chains come back within the hour, so a shift with two
  // passes in it is not competent play any more - it is somebody who went home
  // at half two.
  runTo(world, start + 240);
  workTheQueue(world);
  runTo(world, start + 400);
  workTheQueue(world);
}

/** And the week nobody did. The queue is left exactly as it arrives. */
function idleWeek(world: Week, day: number): void {
  if (day === 2) {
    show(world, ['bubbles']);
  }
}

/* -- the balance profiles -------------------------------------------------- */

/**
 * Half the roster, decided by the ticket's own id and therefore decided ONCE.
 *
 * "Every other one I come across" is not half a week's work - the second sweep
 * picks up what the first skipped, and the profile quietly becomes the worked
 * week with a delay in it (measured: 22 of 23 closed). A ticket this skips is
 * a ticket nobody ever touches, which is what doing half the job looks like.
 */
function halfTheRoster(id: string): boolean {
  let total = 0;

  for (const character of id) {
    total += character.charCodeAt(0);
  }

  return total % 2 === 1;
}

/** The three sweeps of the worked week, over whatever the profile allows. */
function sweeps(
  world: Week,
  day: number,
  skip?: (id: string) => boolean,
): void {
  const start = shiftStartTick(day);

  runTo(world, start + 90);
  workTheQueue(world, skip);
  runTo(world, start + 240);
  workTheQueue(world, skip);
  runTo(world, start + 400);
  workTheQueue(world, skip);
}

function halfWeek(world: Week, day: number): void {
  sweeps(world, day, halfTheRoster);
}

/** The queue worked properly, with the forum open behind it all week. */
function slackWeek(world: Week, day: number): void {
  show(world, ['browser']);
  sweeps(world, day);
}

/** And both at once: half the job, done with the browser up. */
function slackHalfWeek(world: Week, day: number): void {
  show(world, ['browser']);
  sweeps(world, day, halfTheRoster);
}

interface GoldenWeek {
  readonly hash: string;
  readonly tick: number;
  readonly outcome: ReviewOutcome;
  /** Per day: what arrived, what closed, what went red. */
  readonly days: readonly [number, number, number][];
  readonly arrived: number;
  readonly closed: number;
  readonly breached: number;
  readonly stillOpen: number;
  readonly earnedPence: number;
  /** What the lead read out at three o'clock, and decided on. */
  readonly reviewRead: number;
  /** And the mark it had to reach, which the conduct file can raise. */
  readonly reviewBar: number;
  /** How many lines the week put on the file. */
  readonly filed: number;
  /** Who already had a reason to open it, an hour before anybody did. */
  readonly triggersAtTwo: readonly string[];
  readonly meters: Record<string, number>;
  readonly timeline: readonly string[];
}

/**
 * The golden weeks: literals, committed, binding.
 *
 * Two of them, because a week has two endings and both are reachable by
 * playing rather than by being told. Changing any of these numbers is allowed
 * and is a CONSCIOUS diff - the same rule the M0 hash and the golden day live
 * by - and the diff is the review: which day closed what, what the week paid,
 * and whether Friday still went the way the meters said it should.
 *
 * They moved for M4 lane C, which put the roster the week was always shaped
 * for into it: twenty-three tickets across five days instead of six, a chain
 * that raises its own second half, a message from somebody who would rather
 * not use the form, a maintenance window, and a cleaner with a trolley. Both
 * hashes, every count and both timelines moved together, and the shape of the
 * week - worked passes, idle is fired - did not.
 *
 * Both hashes then moved a second time, and only the hashes: the machine event
 * log learned to record a printer LOSING power as well as coming back. That is
 * two lines on PRINT-02 a week, it is the only evidence the recurring arc has,
 * and it changed no count, no meter and no minute on either timeline.
 *
 * And a third time, for the M4 QA wave, and again ONLY the hashes: every
 * count, every meter, both timelines and both endings came through untouched.
 * Four things are in the graph that were not before, and all four are state
 * rather than behaviour.
 *
 *  - The new starter is seeded WITH the Sales mailbox and the Send As group,
 *    and each of the two tickets about them takes its own one away as it
 *    arrives. Two edges in the seed, and the fault written down where every
 *    other missing-permission ticket in this world writes it - without which
 *    a player who granted both on the Monday was dealt two tickets that
 *    spawned already resolved.
 *  - The warehouse printer counts how many times it has lost power, so the
 *    note by the socket is earned by evidence rather than available on the
 *    Monday. One field, moved by the cleaner's trolley, twice a week.
 *  - The review writes down the reputation it was decided on, so the week
 *    screen stops reading a number that carries on moving all afternoon. One
 *    field on the player, written at three o'clock on the Friday.
 *  - Dennis's ticket carries the reply that closed it, because the reply IS
 *    the fix and the resolution rule now says so. Two fields on one ticket in
 *    the worked week, and none at all in the idle one.
 *
 * The coalesced night is in this diff too and moved NOTHING: the same nine
 * hundred minutes, in one call instead of nine hundred, is a performance
 * change and `night.test.ts` is the proof that it is only that.
 *
 * FOURTH MOVE (M5, the weighted review). Both hashes again, and this time two
 * numbers with them - and it is worth being exact about which:
 *
 *  - `week_reputation` is new on the player node, seeded at fifty and written
 *    at every clock-off and once more in the minute the review happens. It is
 *    the week as the conversation reads it: today folded into the days behind
 *    it, half and half. Worked: 98 by Friday evening (96 at three, folded once
 *    more by the last clock-off). Idle: 2 by Friday evening, 4 at three -
 *    Monday's fifty is worth about a sixteenth of the answer by then, and
 *    everything since has been nothing.
 *  - `reviewRead` - the number on the week screen - is 96 for the worked week
 *    and 4 for the idle one, where both used to be the live meter (100 and 0).
 *
 * Nothing else moved, and that is the claim: `reputation` is still 100 and 0,
 * every count, every penny, both timelines and both endings came through
 * untouched. How reputation MOVES was not touched - only what Friday at three
 * makes of where it got to. The reason is in `weightedWeekPerformance`: the
 * meter has a ceiling at 100 and a properly worked week reaches it by about
 * the Wednesday, after which nothing done on the Thursday or the Friday could
 * reach the review at all.
 *
 * SEVENTH MOVE (0.2.2, the estate is a real estate). Both hashes, and nothing
 * else in either week: same arrivals, same closes, same breaches, same pence,
 * same meters, same timelines, same outcome on the Friday. Monday's graph now
 * carries three hundred and twenty-four services instead of seven, a domain
 * controller, the processor and memory fields on every machine, and three
 * cables that were always implied - all seeded, none of it moved by anything
 * in either week, and therefore visible only in the hash of the world.
 *
 * EIGHTH MOVE (0.2.3, the filesystem). Both hashes, and nothing else in either
 * week again: same arrivals (22 and 22), same closes, same breaches, same
 * pence, same meters, same timelines, same outcome on the Friday. Two hundred
 * directories and files are in Monday's graph, with the `contains` edges under
 * them and a free-space figure on every machine - all seeded. One drive fact
 * MOVES in the worked week and it moves with the queue it belongs to: the
 * spooler ticket fills the spool directory on PRINT-01 with the jobs behind
 * its queue, and clearing that queue empties it in the same breath, which is
 * asserted after every mutation that touches a queue rather than left to a
 * hash. The idle week never touches it, and neither week's numbers move.
 *
 * One thing that is NOT in these numbers is worth writing down beside them:
 * impact is now the count of PEOPLE downstream of a fault rather than of
 * people and services. It had to change - a machine with twenty-odd services
 * on it read as an office-wide incident when one monitor was upside down -
 * and it moves the true impact of exactly one shipped ticket, the exhausted
 * licence pool, from medium to low. Neither scripted week triages that
 * ticket, so neither week's numbers move with it; the ticket-app tests are
 * where that one is pinned.
 *
 * NINTH MOVE (0.2.4, the drive has tickets on it). Both hashes, and this time
 * a great deal else, because this is the first slice since M4 lane C to put
 * TICKETS into the week rather than state into the world. Two of them, in the
 * two afternoons the week had left:
 *
 *  - `ticket:disk-full` on the Wednesday at 14:40, which is why the worked
 *    week's Wednesday row is 5 in and 5 closed rather than 4 and 4, and why
 *    the idle week's Wednesday is 5 in - its deadline runs out on the THURSDAY
 *    morning, so the breach lands in Thursday's row (6 rather than 5), which
 *    is the event-time accounting of the fifth move doing exactly what it was
 *    built to do;
 *  - `ticket:saved-into-temp` on the Friday at 09:40, which makes Friday 4 in
 *    and 4 closed in the worked week, and 4 in and 4 red in the idle one - it
 *    arrives early enough that its own deadline runs out the same afternoon.
 *
 * Everything else follows arithmetic that is already in the game. The worked
 * week banks 500 pence more, which is two closes at `CLOSED_TICKET_BONUS_PENCE`
 * (250); the idle week banks 800 less, which is two breaches at
 * `BREACH_DEDUCTION_PENCE` (400). Both timelines are unchanged - neither
 * ticket has a notice, a message or a scene of its own - and so are the caught
 * counts, the stress, the suspicion and the endings.
 *
 * The one number worth a sentence of its own is the worked week's review: 96
 * to 97, and 98 to 99 by five o'clock. Reputation was already at its ceiling
 * by the Wednesday, so the extra credit does not move the meter; what moves is
 * WHEN it got there, and the weighted read is a fresh question every day.
 *
 * FIFTH MOVE (M5 close-out, event-time accounting). Both hashes, and - for the
 * first time in this file - two numbers inside the IDLE week's day rows.
 *
 * The graph gained three things. Every account carries the identity-proofing
 * channels the June rollout put on file. Every ticket that closes carries the
 * minute it closed in, every ticket that goes red carries the minute it went
 * red, and every triage carries the minute it was filed. That is what moved
 * both hashes, and in the WORKED week it moved nothing else at all: every
 * ticket in it is closed on the day it arrived, so an arrival-scoped ledger
 * and an event-scoped one agree line for line.
 *
 * TENTH MOVE (0.2.5, the review reads a percentage). One hash, one number in
 * the worked week, and nothing at all in the idle one - which is the shortest
 * true summary of this slice and is worth being exact about.
 *
 * The conversation on Friday stopped reading the reputation meter folded day
 * over day, and started reading `weekPerformance`: how much of the week's own
 * work was closed, and how much of it never went red, as a percentage, folded
 * the same way. `week_reputation` still holds it - the field id is save state
 * and did not move - and every meter in the game still moves exactly as it did.
 *
 *  - The WORKED week's hash moved, because the numbers written into
 *    `week_reputation` at each clock-off are different numbers: 75, 88, 94, 97
 *    where they used to be a fold of the meter. Its review reads 99 rather
 *    than 97, and its Friday-evening standing is 100 rather than 99, because a
 *    week that closed all twenty-five of its tickets with nothing red is a
 *    hundred percent of the work every day - the fold is the only thing
 *    keeping it off a flat hundred, and Monday's opening fifty is what it is
 *    keeping it off by.
 *  - The IDLE week did not move AT ALL - not the hash, not the review, not the
 *    Friday-evening standing - and that is a coincidence rather than a claim.
 *    The intermediate readings are completely different (26, 14, 10 against
 *    44, 25, 13), but the hash is of the world at the END of the week and the
 *    field is overwritten every evening. The two models happen to arrive at
 *    the same last two numbers: 4 at three o'clock, when twenty-three of the
 *    week's twenty-four deadlines have gone and the twenty-fourth has not,
 *    and 2 by five, when it has.
 *
 * Nothing else in either week moved: same arrivals, same closes, same
 * breaches, same pence, same stress, same suspicion, same reputation, same
 * caught counts, same timelines, same endings.
 *
 * ELEVENTH MOVE (0.2.6, the conduct file). Both hashes, both timelines, and
 * NOTHING ELSE in either week - not an arrival, not a close, not a breach, not
 * a penny, and not one of the seven meters on either card. That is a stronger
 * claim than it sounds and it is the point of the slice, so it is worth being
 * exact about all three parts of it.
 *
 *  - THE TIMELINES gain one `notice:That is 10 minutes` per conversation, in
 *    the same minute as the conversation: once in the worked week, twelve
 *    times in the idle one. That notice IS the new price. Being caught used to
 *    cost six points of reputation, in a currency 0.2.5 stopped the review
 *    spending; it now costs ten minutes of the shift, and the shift still ends
 *    at five. The minutes are measured properly in `scripted-day.test.ts`, by
 *    playing one day twice and counting how many of them the player got.
 *  - THE HASHES move for the file and for the bar. Every conversation appends
 *    a dated line to `conduct_file` on the player - one in the worked week,
 *    twelve in the idle one - and `review_bar` is seeded at 45 on the Monday
 *    and written again at three o'clock beside `review_reputation`, with
 *    `review_conduct` carrying the sentence that explains it.
 *  - NOT ONE METER MOVED, in either week, and that is a coincidence worth
 *    naming rather than a claim. Reputation stopped losing six points a
 *    conversation, which should have moved both - except that the worked week
 *    was pinned at the ceiling of 100 by Wednesday and the idle week was
 *    pinned at the floor of 0 by Wednesday, so in both of them the six points
 *    were being clamped away as fast as they were charged. The two profiles
 *    where it shows are in the table at the bottom of this file, and it shows
 *    there by twenty-five points at a time.
 *
 * The endings did not move either: worked passes against a bar of 45 with
 * nothing on the file anybody has a reason to read, and idle is fired on the
 * numbers alone, at 4 against a bar of 70 it would have missed at 45.
 *
 * TWELFTH MOVE (0.2.7, the systemic layer). Both hashes, and NOTHING ELSE in
 * either week: not an arrival, not a close, not a breach, not a penny, not one
 * of the seven meters, not a line on either timeline, not a line on either
 * file, not a bar, and not an ending. One integer moved both of them.
 *
 * `arc_week` is seeded at 1 on the player node. A career is a table of weeks
 * the way a week is a table of days (`src/world/pressure.ts`), and where the
 * player is in it has to be world state: it is saved, it is replayed, and one
 * line of the redundancy matrix - length of service, the line nobody can move
 * - is read straight off it.
 *
 * What did NOT arrive in these two weeks is the point of the slice, so it is
 * worth listing what was deliberately not seeded. The probation week is week
 * one of the arc and the pacing rules give week one nothing at all: no season
 * is live, so the two mail gates the announcements arrive as are ABSENT rather
 * than false, the inbox holds the same threads it always held, no pool is
 * scored, `review_position` and `review_cut_from` do not exist, and the guard
 * that reads them therefore answers no. Both review verbs are guarded exactly
 * as they were, both weeks end exactly as they did, and the third ending is
 * unreachable from here by design rather than by omission - it is walked, on
 * the arc week it belongs to, in `scripted-arc.test.ts`.
 *
 * The idle week is where they disagree, which is the whole finding.
 * `ticket:flat-mouse` arrives at 13:34 on the Monday and its deadline runs out
 * at 09:34 on the Tuesday; `ticket:must-change-password` is filed on the
 * Tuesday afternoon and goes red on the Wednesday morning. The old ledger
 * counted both against the day they ARRIVED on, so Monday was charged a
 * service credit for a deadline that had not yet been missed - on a payslip
 * banked at Monday's 17:00 - and Wednesday, where the deadline actually ran
 * out, showed nothing. Monday's row is four now and Wednesday's is five. Every
 * total is unchanged: twenty-two arrived, none closed, twenty-two breached,
 * twenty-two still open, and the same 37,775 pence, because the same
 * twenty-two events are still charged exactly once each - on the days they
 * happened.
 *
 * THIRTEENTH MOVE (0.3.0 lane B, the interruptions fire). Both hashes, both
 * timelines, and ONE meter in ONE of the two weeks. Everything the week is
 * scored on came through untouched, and that is the claim worth being exact
 * about: same arrivals (25 and 24), same closes, same breaches, same pence,
 * same review reading, same bar, same file, same caught counts, same endings.
 *
 *  - THE TIMELINES gain three `interrupted:` lines apiece, in both weeks,
 *    because being taken off the work does not care whether the work was being
 *    done. `call:spooler` at 1566 - Tuesday 10:06, five past ten plus a minute
 *    of jitter; `meeting:hygiene-sync` at 3030 - Wednesday 10:30 exactly,
 *    because an announced hour takes no jitter and the summons mail names it;
 *    `call:annexe-printer` at 4522 - Thursday 11:18, twenty past minus two.
 *    The end of a call is left off (it is arithmetic), and the end of the
 *    meeting says so itself in the fourth new line, `notice:That could have
 *    been an email@3060`, which is the recap landing in the inbox at eleven.
 *  - THE HASHES move for four things, all of them state rather than balance:
 *    three ids in `interruption_answered` and `refocus_until` on the player
 *    (both written by the meeting, which is answered at the END of its block
 *    because a junior cannot skip it), `meeting_recap_at` (the minute the room
 *    emptied, which the recap thread is gated on), and the stress below.
 *  - ONE METER MOVED, and only in the worked week: stress 11 -> 15. Three
 *    arrivals are charged in both weeks - 2 for the call about a ticket
 *    nobody was on, 6 for the half hour, 4 for the printer in the annexe - and
 *    in the IDLE week all twelve points land on a meter that has been pinned
 *    at 98 since the Wednesday, so they are clamped away as fast as they are
 *    charged. That is the same shape the conduct slice found and it is a
 *    coincidence rather than a claim: the idle week is saturated, so it cannot
 *    show a new cost, and the worked week can.
 *  - NOTHING IN THE FIVE-PROFILE TABLE MOVED. Interruptions cost stress and
 *    focus, and the review reads neither: it reads how much of the week's own
 *    work was closed and how much of it kept its deadline. A slice that
 *    quietly put being interrupted into the mark would separate the pairs at
 *    the bottom of this file, and that is the assertion which would go red.
 */
const GOLDEN_WORKED: GoldenWeek = {
  hash: '6f3b040aad9925b8',
  /** Friday, 17:00, and no further: there is no Saturday to advance into. */
  tick: 6_300,
  outcome: 'passed',
  // The ramp, as arrivals: Monday two inherited, two dripped and the concern
  // the lead raises by mentioning it. Tuesday inherits the overnight outage
  // and the spooler, drips two more, and gains both a chain follow-up and the
  // ticket Terry files when nobody does him a favour. Wednesday is a licence,
  // an enrolment and a maintenance flood; Thursday is the arc, a relock and a
  // certificate with two duplicates hanging off it; Friday is three and a
  // conversation at three o'clock. Every one of them closes.
  days: [
    [5, 5, 0],
    [6, 6, 0],
    [5, 5, 0],
    [5, 5, 0],
    [4, 4, 0],
  ],
  arrived: 25,
  closed: 25,
  breached: 0,
  stillOpen: 0,
  /** Five days at the rate, twenty-five resolution bonuses, the deductions
   * nobody agreed to, and the probation bonus for surviving Friday. */
  earnedPence: 77_025,
  reviewRead: 99,
  // The published bar, untouched: the queue was dealt with, nobody was left
  // in silence, and a file with one line on it is a private document until
  // somebody has a reason to ask for it. Nobody did.
  reviewBar: 45,
  triggersAtTwo: [],
  // And the line itself, which is the whole of what the Wednesday browser
  // cost the world. It reads "Wednesday 11:16 - Screen observed to be
  // non-work-related on passing (a discussion forum)." and it decides nothing.
  filed: 1,
  meters: {
    // Twenty-five closed tickets carry the reputation from fifty to its
    // ceiling well before Friday, which is what a week worked properly looks
    // like - and which the review no longer reads. One round of the corridor
    // found the browser on the Wednesday, and the six points it cost were
    // earned back inside the hour; the conversation on Friday never hears
    // about either.
    // Eleven of it is the queue, and four of it is having been reachable:
    // three arrivals at 2, 6 and 4 points, mostly worked off again by the
    // five-minute interval before the week ends.
    stress: 15,
    suspicion: 0,
    reputation: 100,
    // The week as the review read it: a hundred percent of the work, every
    // day, held just off a flat hundred by Monday morning's opening fifty.
    // 99 at three o'clock, 100 by five, when the last fold has pushed the
    // opening figure down to a thirty-second of the answer.
    week_reputation: 100,
    // Counted per day and cleared at every clock-off: Friday was clean.
    caught_events: 0,
    farm_fund: 77_025,
    week_attempt: 1,
  },
  // The week's own beats, in the minute they land. The lead's footsteps are
  // left out on purpose - the day golden pins those - so what is left is the
  // content: a chain coming back forty minutes after it was closed, somebody
  // asking for a favour instead of filing, a maintenance window opening at
  // nine on the Wednesday, and one browser found on a screen.
  timeline: [
    'interrupted:call:spooler@1566',
    'notice:They are back@1740',
    'dm:person:terry@1810',
    'notice:Maintenance window@2940',
    'interrupted:meeting:hygiene-sync@3030',
    'notice:That could have been an email@3060',
    'caught:browser@3076',
    'notice:That is 10 minutes@3076',
    'interrupted:call:annexe-printer@4522',
    'review:passed@6180',
    'beer@6300',
    'week:passed@6300',
  ],
};

/**
 * And the week nobody worked: a game of Bubble Break left up from Tuesday
 * morning, twenty-two deadlines missed, fourteen rounds of the corridor that
 * all found the same window, and a reputation on the floor by Wednesday.
 *
 * Twenty-two rather than twenty-three, and the missing one is the point: the
 * second half of the mailbox chain is raised by fixing the first half, and
 * nobody fixed anything. The ticket Terry files when the favour is not done
 * arrives regardless, because ignoring a message is not the same as saying no
 * and the world does not pretend otherwise.
 */
const GOLDEN_IDLE: GoldenWeek = {
  // Unchanged by 0.2.5, to the byte. See the TENTH MOVE above: the readings
  // this week takes on the way through are completely different and every one
  // of them is overwritten by the next. Moved by 0.2.7 for the same single
  // integer the worked week moved for, and for nothing else.
  hash: '3c7626b18073176b',
  tick: 6_300,
  outcome: 'fired',
  // Two of these rows moved for the M5 close-out, and the move IS the fix.
  // `ticket:flat-mouse` arrives at twenty to two on the Monday and its
  // deadline runs out at half nine on the TUESDAY; `ticket:must-change-password`
  // is filed on the Tuesday afternoon and goes red on the WEDNESDAY. Both used
  // to be counted against the day they arrived on - Monday and Tuesday - which
  // is a day whose pay had already been banked without the deduction, and a
  // day on which the deadline had not yet run out. A day is answerable for
  // what happened in it, so Monday reports four and Wednesday five, and the
  // week's totals are exactly what they were: twenty-two arrivals, twenty-two
  // breaches, nothing closed.
  days: [
    [5, 0, 4],
    [5, 0, 5],
    [5, 0, 5],
    [5, 0, 6],
    [4, 0, 4],
  ],
  arrived: 24,
  closed: 0,
  breached: 24,
  stillOpen: 24,
  /**
   * Still paid, right up until they stop paying you - and eight hundred pence
   * less than it used to be, which is the money half of the same finding.
   *
   * Under the old ledger a day was charged for the breaches its OWN arrivals
   * had accumulated BY THE TIME its payslip was written. `flat-mouse` had not
   * gone red by Monday's 17:00 and `must-change-password` had not gone red by
   * Tuesday's, so neither was on the payslip of the day it arrived on - and
   * neither could ever appear on the payslip of the day it actually breached,
   * because that day's ledger only looked at its own arrivals. Two service
   * credits, 400 pence each, that the week card printed as missed deadlines
   * and the fund was never charged for. They are charged now, on the days the
   * deadlines ran out.
   */
  earnedPence: 36_175,
  reviewRead: 4,
  // Seventy rather than forty-five, and it made no difference: a week that
  // reads 4 was going home either way. All three reasons to look are live by
  // the Friday - twenty-four people who were never told anything, the
  // colleague sent to the form on the Tuesday, and the lead's own phone - and
  // the twelve lines on the file saturate the shift at five points a line.
  reviewBar: 70,
  triggersAtTwo: ['customer', 'colleague', 'lead'],
  filed: 12,
  meters: {
    stress: 98,
    suspicion: 96,
    reputation: 0,
    // Four at three o'clock: twenty-three of the week's twenty-four deadlines
    // have run out, the twenty-fourth runs out at a quarter past, and nothing
    // has been closed at all - so the mark is one twenty-fourth of half the
    // scale, and what is left of it is Monday morning's fifty at a sixteenth.
    // Two by five, when the last deadline has gone as well.
    week_reputation: 2,
    caught_events: 3,
    farm_fund: 36_175,
    week_attempt: 1,
  },
  timeline: [
    'interrupted:call:spooler@1566',
    'caught:bubbles@1632',
    'notice:That is 10 minutes@1632',
    'caught:bubbles@1723',
    'notice:That is 10 minutes@1723',
    'dm:person:terry@1810',
    'caught:bubbles@1839',
    'notice:That is 10 minutes@1839',
    'notice:Maintenance window@2940',
    'interrupted:meeting:hygiene-sync@3030',
    'notice:That could have been an email@3060',
    'caught:bubbles@3076',
    'notice:That is 10 minutes@3076',
    'caught:bubbles@3179',
    'notice:That is 10 minutes@3179',
    'caught:bubbles@3283',
    'notice:That is 10 minutes@3283',
    'caught:bubbles@4512',
    'notice:That is 10 minutes@4512',
    'interrupted:call:annexe-printer@4522',
    'caught:bubbles@4615',
    'notice:That is 10 minutes@4615',
    'caught:bubbles@4719',
    'notice:That is 10 minutes@4719',
    'caught:bubbles@5950',
    'notice:That is 10 minutes@5950',
    'caught:bubbles@6078',
    'notice:That is 10 minutes@6078',
    'caught:bubbles@6170',
    'notice:That is 10 minutes@6170',
    'review:fired@6180',
    'week:fired@6300',
  ],
};

function expectGolden(walked: WalkedWeek, golden: GoldenWeek): void {
  expect(walked.hash).toBe(golden.hash);
  expect(walked.tick).toBe(golden.tick);
  expect(walked.outcome).toBe(golden.outcome);
  expect(walked.card.days.map((line) => [
    line.ledger.arrived,
    line.ledger.closed,
    line.ledger.breached,
  ])).toEqual(golden.days);
  expect(walked.card.arrived).toBe(golden.arrived);
  expect(walked.card.closed).toBe(golden.closed);
  expect(walked.card.breached).toBe(golden.breached);
  expect(walked.card.stillOpen).toBe(golden.stillOpen);
  expect(walked.card.earnedPence).toBe(golden.earnedPence);
  // The card shows what the CONVERSATION read, which is the week weighted
  // toward how it ended - not the live meter, which carries on moving all
  // Friday afternoon and is on this screen too, one line up.
  expect(walked.card.performance).toBe(golden.reviewRead);
  // And the line it had to clear, which is the published 45 unless somebody
  // had a reason to open the file and found something in it.
  expect(walked.card.bar).toBe(golden.reviewBar);
  expect(walked.filed).toHaveLength(golden.filed);
  expect(walked.meters).toEqual(golden.meters);
  expect(walked.timeline).toEqual(golden.timeline);

  /*
   * THE LEGIBILITY GATE, run on every golden week rather than as a case of
   * its own, because it is not a property of one week: NOTHING at three
   * o'clock may come out of a state the player could not have read at two.
   *
   * The file is dated, so the first half is checkable arithmetic - every line
   * on it was written before the conversation. The second half is the stronger
   * claim and is why the walk stops at two: the bar the world applied and the
   * people who caused it are asserted to be the ones the shipped screens were
   * already showing an hour earlier, off the same pure function the review
   * dispatches with. A trigger that fired from nothing, a bar that appeared at
   * the verdict, or a reason invented in the room all turn this red.
   */
  const due = reviewTick(REVIEW_DAY);
  expect(walked.filed.every((line) => line.tick < due), 'filed before three')
    .toBe(true);
  // The file at two is the file at three with the last hour missing - never a
  // line that was back-dated, reordered or invented in the room.
  expect(walked.filed.slice(0, walked.atTwo.filed.length))
    .toEqual(walked.atTwo.filed);
  // Who was going to look, and what line that produced, an hour before it
  // produced anything. Both pinned below, so a trigger that starts firing for
  // a different reason is a diff somebody has to justify.
  expect(walked.atTwo.triggers).toEqual(golden.triggersAtTwo);
  expect(walked.atTwo.bar).toBe(golden.reviewBar);
  // And the verdict is those two numbers and nothing else. There is no third
  // input: not the reputation meter, not the caught count, not a die.
  expect(walked.outcome)
    .toBe(walked.card.performance >= walked.card.bar ? 'passed' : 'fired');
}

/**
 * How long one walked week is allowed to take.
 *
 * A week is five days of dispatches against the whole estate, and the estate
 * got four times bigger when every box in the building started running its
 * real service list. The engine takes a savepoint - a copy of the world -
 * before every dispatch, so the cost of one action is a function of how big
 * the world is: a dispatch went from about 0.12ms to about 0.43ms, and a
 * walked week from about 2.4 to about 2.6 seconds. Nothing a player can feel
 * (one click is one dispatch) and everything a test that walks two weeks in
 * one case can: those cases now want more than vitest's five seconds.
 *
 * It is written down here rather than raised globally so that the number is a
 * statement about THESE tests, and so the day it starts creeping again -
 * which is what the filesystem slice will do to it - somebody has to come and
 * change a line with this comment attached.
 */
const WALK_TIMEOUT_MS = 20_000;

describe('the probation week, twice', () => {
  it('arrives at the same week, to the byte', () => {
    const first = walk(workedWeek);
    const second = walk(workedWeek);

    expect(first).toEqual(second);
    // And it was a week with a week in it.
    expect(first.card.arrived).toBeGreaterThan(0);
    expect(first.card.closed).toBeGreaterThan(0);
    expect(first.meters[FIELDS.farmFund]).toBeGreaterThan(0);
  }, WALK_TIMEOUT_MS);

  it('is a different week when it is played differently', () => {
    expect(walk(idleWeek).hash).not.toBe(walk(workedWeek).hash);
  }, WALK_TIMEOUT_MS);

  /**
   * The golden weeks. Both endings are reached by PLAYING - the review reads
   * the meters, and the meters read the week - so these two blocks are the
   * whole arc pinned to numbers rather than to a claim about it.
   */
  it('lands on the golden week that was worked', () => {
    expectGolden(walk(workedWeek), GOLDEN_WORKED);
  }, WALK_TIMEOUT_MS);

  it('lands on the golden week that was not', () => {
    expectGolden(walk(idleWeek), GOLDEN_IDLE);
  }, WALK_TIMEOUT_MS);
});

/**
 * Balance, from playing rather than from a spreadsheet.
 *
 * Five weeks, played five ways, put through the shipped driver and read at the
 * one moment that decides anything: three o'clock on Friday, when the lead
 * looks at one number and, sometimes, at one folder. What is being asked is
 * not "is the number right" - it is whether the week can tell these five
 * apart, because a threshold everybody clears is a review nobody sits, and one
 * nobody clears is a game with one ending.
 *
 * The answer, from 0.2.6, is the two-by-two back, on purpose this time:
 *
 *   worked properly ............ 25 of 25, no breaches ... 99 vs 45, passed
 *   worked, browser up all week  25 of 25, caught 15x .... 99 vs 45, passed
 *   half the roster ............ 13 of 24, twelve red .... 56 vs 45, passed
 *   half the roster, browser up  13 of 24, caught 15x .... 56 vs 70, FIRED
 *   nothing at all ............. 0 of 24, everything red .. 4 vs 70, FIRED
 *
 * The mark is unchanged from 0.2.5 in all five - 99, 99, 56, 56, 4 - and it
 * has to be: conduct is not in it and this file asserts the equality one test
 * down. What moved is the BAR, from a constant to a thing the week can raise,
 * and the mechanism is the whole slice:
 *
 *  - THE FILE accumulates and does nothing. Every conversation in the corridor
 *    appends one dated line and costs no points at all. The slacking weeks
 *    carry fifteen of them; the worked week carries one, from the browser it
 *    left up on the Wednesday.
 *  - SOMEBODY HAS TO HAVE A REASON TO OPEN IT. Three of them, all pure
 *    functions of the ticket nodes: a customer who went red and was never told
 *    anything, a colleague sent to the form and left on it, and the lead's own
 *    ticket left to go red. The two weeks that did the job have none of those,
 *    which is why fifteen conversations cost them nothing.
 *  - THE MARK IS THE SHIELD. Each line raises the bar five points to a ceiling
 *    of twenty-five, so a full file asks for 70 - MetricNet's top quartile.
 *    That is Hollander's idiosyncrasy credit as arithmetic: contribution buys
 *    latitude, the latitude is finite, and it is spent by deviating.
 *
 * So the pair that separates is the pair where both halves are true, and it
 * separates without conduct ever entering a race with closures. "Half the
 * roster" keeps the job on a mark of 56 against a bar of 45, and is SEEN to
 * keep it: somebody did have a reason to look, and the sentence on the review
 * screen says they looked and found nothing on file. "Half the roster with the
 * browser up" reads the identical 56 and goes home, because the same reason
 * found fifteen lines.
 *
 * WHAT THE METER STOPPED DOING, and it is the honest cost of the slice: the
 * reputation column no longer tells the pairs apart either. It used to read
 * 100 / 63 / 57 / 0 across the four working profiles, and it now reads
 * 100 / 63 / 100 / 63, because being caught stopped taking six points off it.
 * The world has not forgotten - the file remembers, in dated sentences, which
 * is a better record than a number - and the assertion below was repointed
 * from the meter to the file rather than deleted.
 *
 * The figures are what the REVIEW read, which is the week to date as it stood
 * at the end of each day, folded so that Friday is half the answer and Monday
 * is a sixteenth. `week.test.ts` holds the scaling gate that keeps the mark
 * from ever again being a function of how much content the game has.
 */
describe('the week at five skill levels', () => {
  interface Profile {
    readonly name: string;
    readonly play: (world: Week, day: number) => void;
    readonly closed: number;
    readonly breached: number;
    /** Where the live meter ended up, which the review no longer reads. */
    readonly reputation: number;
    /** And what the conversation on Friday actually read out. */
    readonly reviewRead: number;
    /** Against what, which is 45 unless somebody opened the file. */
    readonly reviewBar: number;
    /** How many dated lines the week put on it. */
    readonly filed: number;
    readonly outcome: ReviewOutcome;
    readonly caught: number;
  }

  const PROFILES: readonly Profile[] = [
    {
      name: 'worked properly',
      play: workedWeek,
      closed: 25,
      breached: 0,
      reputation: 100,
      reviewRead: 99,
      // Nothing went red, the colleague who was sent to the form got his
      // ticket closed, and the lead's own phone was dealt with. Nobody has a
      // reason to ask for the folder, so the line stays where it is published.
      reviewBar: 45,
      // One browser, on the Wednesday, hidden before the second round - and
      // found once, which is the week's own texture rather than a profile.
      // It is on the file forever and it decides nothing.
      filed: 1,
      outcome: 'passed',
      caught: 1,
    },
    {
      name: 'half the roster',
      play: halfWeek,
      closed: 13,
      breached: 12,
      reputation: 63,
      // Fifty-four percent of the queue closed and fifty percent of it kept
      // inside its deadline is a week worth 52 whole; the fold reads it four
      // points higher because the early days were still salvageable when they
      // ended, and a lead who read them then thought better of the week than
      // the week turned out to deserve.
      reviewRead: 56,
      // Twelve people went red and none of them were told anything, so
      // somebody DOES come looking - and finds an empty folder. The bar does
      // not move for a blank page, which is the fizzle the player is shown.
      reviewBar: 45,
      filed: 0,
      outcome: 'passed',
      caught: 0,
    },
    {
      name: 'worked, with the browser up all week',
      play: slackWeek,
      closed: 25,
      breached: 0,
      // The meter used to be forty-three points down on the week that hid the
      // browser. It is level with it now: being caught costs minutes and a
      // line, and no points at all.
      reputation: 100,
      reviewRead: 99,
      reviewBar: 45,
      // Fifteen conversations, fifteen lines, and not one person with a reason
      // to read them. This is the documented case and the one the whole design
      // exists to keep: monitoring is near-universal, enforcement is rare, and
      // getting away with it this time is a better feeling than losing six
      // points for it.
      filed: 15,
      outcome: 'passed',
      caught: 15,
    },
    {
      name: 'half the roster, with the browser up all week',
      play: slackHalfWeek,
      closed: 13,
      breached: 12,
      reputation: 63,
      // The identical mark to the week above it, and a different ending. The
      // twelve people left in silence give somebody a reason to open the
      // folder, the fifteen lines in it saturate the shift at five points a
      // line, and 56 does not reach 70. Two ways to lose the job, either
      // forgiven alone, neither forgiven together - and this time it is the
      // design rather than an accident of two constants.
      reviewRead: 56,
      reviewBar: 70,
      filed: 15,
      outcome: 'fired',
      caught: 15,
    },
    {
      name: 'nothing at all',
      play: idleWeek,
      closed: 0,
      breached: 24,
      reputation: 0,
      reviewRead: 4,
      // All three reasons are live by the Friday and the raised bar changes
      // nothing: 4 was going home against 45 as well.
      reviewBar: 70,
      filed: 12,
      outcome: 'fired',
      // A game of Bubble Break left up from the Tuesday morning, found on
      // every round of the corridor for the rest of the week.
      caught: 12,
    },
  ];

  const walked = new Map<string, WalkedWeek>();

  beforeAll(() => {
    for (const profile of PROFILES) {
      walked.set(profile.name, walk(profile.play));
    }
  }, WALK_TIMEOUT_MS);

  /** What the review read for a profile, which is the number that decided it. */
  const readingOf = (name: string): number => {
    const week = walked.get(name);
    expect(week).toBeDefined();
    return week?.card.performance ?? Number.NaN;
  };

  /** And where the meter ended up, which is a different question now. */
  const meterOf = (name: string): number => {
    const week = walked.get(name);
    expect(week).toBeDefined();
    return week?.meters[FIELDS.reputation] ?? Number.NaN;
  };

  it.each(PROFILES)('plays $name the way it says', (profile) => {
    const week = walked.get(profile.name);
    expect(week).toBeDefined();
    expect(week?.card.closed).toBe(profile.closed);
    expect(week?.card.breached).toBe(profile.breached);
    expect(week?.meters[FIELDS.reputation]).toBe(profile.reputation);
    expect(week?.card.performance).toBe(profile.reviewRead);
    expect(week?.card.bar).toBe(profile.reviewBar);
    expect(week?.filed).toHaveLength(profile.filed);
    expect(
      week?.timeline.filter((line) => line.startsWith('caught:')),
    ).toHaveLength(profile.caught);
  });

  it('sends two of them home, and keeps three', () => {
    for (const profile of PROFILES) {
      expect(walked.get(profile.name)?.outcome, profile.name)
        .toBe(profile.outcome);
    }

    // And each of the five was decided by its own two numbers rather than by
    // anything the profile was told - the mark it earned, against the bar its
    // own week produced.
    for (const profile of PROFILES) {
      const week = walked.get(profile.name);
      const reading = readingOf(profile.name);
      const bar = week?.card.bar ?? Number.NaN;

      // The bar never goes below the published figure, whatever a file says.
      expect(bar, profile.name)
        .toBeGreaterThanOrEqual(REVIEW_PASS_PERFORMANCE);

      if (profile.outcome === 'passed') {
        expect(reading, profile.name).toBeGreaterThanOrEqual(bar);
      } else {
        expect(reading, profile.name).toBeLessThan(bar);
      }
    }
  });

  /**
   * THE TWO-BY-TWO, restored on purpose.
   *
   * It was an emergent property of two constants nobody chose until 0.2.5
   * collapsed it, and it is now the design: two ways to lose the job, either
   * forgiven alone, neither forgiven together. The four cells are asserted as
   * a table rather than one at a time, because the shape is the claim - three
   * of these passing and one failing is a different game from four passing.
   */
  it('forgives either half on its own and neither of them together', () => {
    const outcome = (name: string): ReviewOutcome | undefined => walked
      .get(name)?.outcome;

    expect([
      outcome('worked properly'),
      outcome('worked, with the browser up all week'),
      outcome('half the roster'),
      outcome('half the roster, with the browser up all week'),
    ]).toEqual(['passed', 'passed', 'passed', 'fired']);
  });

  /**
   * Conduct is not in the mark, and the equality is exact ON PURPOSE.
   *
   * Two weeks that dealt with the queue identically read identically, however
   * many times the lead came round the corner and found a forum. It is written
   * as an equality rather than as "close enough" because that is the assertion
   * with teeth: any conduct term smuggled back into the review's number -
   * however small, however well meant - separates these pairs and turns this
   * red, which is the conversation that has to happen before it ships.
   *
   * Slice D is where the distinction comes back, and it comes back as a file
   * somebody has a reason to read rather than as points in a race with
   * closures. See `docs/research/review-scoring.md` section 4, option D.
   */
  it('reads a week the same whether or not it was seen slacking', () => {
    expect(readingOf('worked, with the browser up all week'))
      .toBe(readingOf('worked properly'));
    expect(readingOf('half the roster, with the browser up all week'))
      .toBe(readingOf('half the roster'));
  });

  /**
   * And the world has NOT forgotten, which is the half of the finding this
   * whole slice is built on.
   *
   * The assertion used to be on the reputation meter, because in 0.2.5 that
   * was the only place a conversation in the corridor left a mark. It is
   * repointed rather than deleted: being caught costs no points now, so the
   * meter reads the same for a week that hid the browser and a week that did
   * not - and the record moved to a file, in dated sentences, which is a
   * better record than a number was.
   *
   * If a later slice quietly stops writing it, the latent half of the design
   * has nothing to be made of. This is the assertion that goes red first.
   */
  it('still records what the review does not read', () => {
    const filed = (name: string): number => walked.get(name)?.filed.length
      ?? Number.NaN;

    expect(filed('worked, with the browser up all week'))
      .toBeGreaterThan(filed('worked properly'));
    expect(filed('half the roster, with the browser up all week'))
      .toBeGreaterThan(filed('half the roster'));

    // And it records WHAT was noticed and WHEN, rather than a tally: every
    // line names the minute, the day and the thing on the screen.
    const [first] = walked.get('worked, with the browser up all week')?.filed
      ?? [];
    expect(first?.kind).toBe('screen');
    expect(first?.text).toContain('discussion forum');
    expect(first?.text).toContain('Monday');

    // The meter, meanwhile, has stopped telling the pairs apart - which is the
    // stated cost of taking the fine off it, written down so nobody reads the
    // equality below as a bug.
    expect(meterOf('worked, with the browser up all week'))
      .toBe(meterOf('worked properly'));
    expect(meterOf('half the roster, with the browser up all week'))
      .toBe(meterOf('half the roster'));
  });

  /**
   * And the three levels the mark DOES have are in the right order with room
   * between them. Two of them landing on the same number would pass every
   * assertion above while telling the player nothing: the week has to be able
   * to tell "did the work" from "did half of it" from "did none of it".
   *
   * The margins are large because a percentage of the work is a blunt
   * instrument by design - it answers "did you do the job" and it cannot
   * answer "how", which is the documented cost of normalising and the reason
   * the second axis is a whole slice of its own. What it can no longer do is
   * drift: the gate that holds the ordering at any roster size is in
   * `week.test.ts`, and this one holds it on the artifact that actually ships.
   */
  it('marks the week down for the work that did not get done', () => {
    const worked = readingOf('worked properly');
    const half = readingOf('half the roster');
    const nothing = readingOf('nothing at all');

    expect(worked).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(nothing);

    // Room rather than a tie-break, on both gaps.
    expect(worked - half).toBeGreaterThanOrEqual(20);
    expect(half - nothing).toBeGreaterThanOrEqual(20);

    // And the whole scale is used: a review that told these apart inside ten
    // points would be a review nobody could read. It is also a percentage, so
    // it cannot leave the hundred it is out of however the roster grows.
    expect(worked - nothing).toBeGreaterThanOrEqual(40);
    expect(worked).toBeLessThanOrEqual(100);
    expect(nothing).toBeGreaterThanOrEqual(0);
  });
});

/**
 * The sixth week, and the one the whole layer exists to produce.
 *
 * The five profiles above cover three of the four cells the design has: no
 * reason to look, a reason that finds nothing, and a reason that finds
 * everything against a week with nothing to defend itself with. The fourth is
 * the interesting one and no shipped profile reaches it - a thick file, read
 * by somebody with a genuine grievance, against a week that DID the job.
 *
 * So it is driven here: the whole roster with the browser up all week, minus
 * one ticket left to go red on the Monday morning. The file is fifteen lines
 * deep, the person whose screen went dark and who nobody rang back is a real
 * person with a real reason, the bar goes to 70 - and the week survives it,
 * because twenty-four of twenty-five closed is what latitude is bought with.
 *
 * That is the moment the research says this system is for: the player learns
 * that the thing which never mattered has been written down all along, and
 * that this time it was close. It is also the assertion that stops the shield
 * from quietly becoming decoration - a build where a thick file is fatal
 * regardless of the numbers passes every test above and fails this one.
 */
describe('the file, read by somebody, against a week that can take it', () => {
  /** Monday's first ticket, left alone all week while everything else closes. */
  const ABANDONED = 'ticket:rotated-screen';

  it('is read out, and survived, by the work that was done', () => {
    const week = walk((world, day) => {
      show(world, ['browser']);
      sweeps(world, day, (id) => id === ABANDONED);
    });

    // A thick file, and a real reason to open it: somebody has been sitting in
    // front of an upside-down monitor since Monday and has never been told a
    // thing.
    expect(week.filed.length).toBe(15);
    expect(week.atTwo.triggers).toEqual(['customer']);
    expect(week.card.bar).toBe(70);
    expect(week.card.conduct).toContain('15 lines');
    expect(week.card.conduct).toContain('70');

    // And the week clears it. Not comfortably - the whole point is that it is
    // close - but on the work, which is the only thing that ever shields
    // anybody.
    expect(week.card.performance).toBeGreaterThanOrEqual(week.card.bar);
    expect(week.outcome).toBe('passed');
    expect(week.card.closed).toBe(24);
    expect(week.card.breached).toBe(1);

    // The same file against the week that did half the job sends it home. Two
    // weeks, one folder, two endings, and the difference is the queue.
    expect(week.card.performance).toBeGreaterThan(56);
  });
});
