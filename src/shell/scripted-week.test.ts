/**
 * A whole week, driven headlessly through the shipped driver and the shipped
 * engine: five days, four nights, a review on the Friday and a screen at the
 * end of it.
 *
 * It is the M4 determinism gate, and it is the day gate's older brother. The
 * scripted DAY proves that a shift replays; a week has things in it that only
 * a week has - deadlines that survive a night, a queue that carries over, a
 * reputation that is the sum of five days' work, and a conversation at three
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
 * tell these apart" - and the answer is a committed table rather than a hash.
 *
 * Nothing below touches the DOM, so the real driver runs exactly as it does in
 * the browser, minus the browser.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { isUnresolved } from '../world/sla';
import { createWorldSession } from '../world/session';
import { findWorldTicket } from '../world/tickets';
import {
  REVIEW_DAY,
  REVIEW_PASS_REPUTATION,
  type ReviewOutcome,
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
}

const METERS: readonly string[] = [
  FIELDS.stress,
  FIELDS.suspicion,
  FIELDS.reputation,
  // The number the conversation on Friday actually reads: the week, weighted
  // toward how it ended. It is in the golden because it is what decides the
  // ending - a rate change that moved the meter without moving this would be
  // a change to the game that the review never hears about, and the other way
  // round is worse.
  FIELDS.weekReputation,
  FIELDS.caughtEvents,
  FIELDS.farmFund,
  FIELDS.weekAttempt,
];

function walk(play: (world: Week, day: number) => void): WalkedWeek {
  const world = startWeek();

  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    expect(world.driver.day()).toBe(day);
    world.driver.startShift();
    play(world, day);
    runTo(world, shiftEndTick(day));
    expect(world.driver.state()).toBe('day_end');
    world.driver.clockOff();
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
 * makes of where it got to. The reason is in `weightedWeekReputation`: the
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
 * One thing that is NOT in these numbers is worth writing down beside them:
 * impact is now the count of PEOPLE downstream of a fault rather than of
 * people and services. It had to change - a machine with twenty-odd services
 * on it read as an office-wide incident when one monitor was upside down -
 * and it moves the true impact of exactly one shipped ticket, the exhausted
 * licence pool, from medium to low. Neither scripted week triages that
 * ticket, so neither week's numbers move with it; the ticket-app tests are
 * where that one is pinned.
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
 */
const GOLDEN_WORKED: GoldenWeek = {
  hash: '6c16e0e39e3cb04f',
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
    [4, 4, 0],
    [5, 5, 0],
    [3, 3, 0],
  ],
  arrived: 23,
  closed: 23,
  breached: 0,
  stillOpen: 0,
  /** Five days at the rate, twenty-three resolution bonuses, the deductions
   * nobody agreed to, and the probation bonus for surviving Friday. */
  earnedPence: 76_525,
  reviewRead: 96,
  meters: {
    // Twenty-three closed tickets carry the reputation from fifty to its
    // ceiling well before Friday, which is what a week worked properly looks
    // like - the review is survived rather than won, and this one is survived
    // with room. One round of the corridor found the browser on the
    // Wednesday, and the six points it cost were earned back inside the hour.
    stress: 11,
    suspicion: 0,
    reputation: 100,
    // The week as the review read it, folded once more by Friday's own
    // clock-off: 96 at three o'clock, 98 by five.
    week_reputation: 98,
    // Counted per day and cleared at every clock-off: Friday was clean.
    caught_events: 0,
    farm_fund: 76_525,
    week_attempt: 1,
  },
  // The week's own beats, in the minute they land. The lead's footsteps are
  // left out on purpose - the day golden pins those - so what is left is the
  // content: a chain coming back forty minutes after it was closed, somebody
  // asking for a favour instead of filing, a maintenance window opening at
  // nine on the Wednesday, and one browser found on a screen.
  timeline: [
    'notice:They are back@1740',
    'dm:person:terry@1810',
    'notice:Maintenance window@2940',
    'caught:browser@3076',
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
  hash: 'd9f4d5b0a0b6259b',
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
    [4, 0, 5],
    [5, 0, 5],
    [3, 0, 3],
  ],
  arrived: 22,
  closed: 0,
  breached: 22,
  stillOpen: 22,
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
  earnedPence: 36_975,
  reviewRead: 4,
  meters: {
    stress: 98,
    suspicion: 96,
    reputation: 0,
    // Four at three o'clock - Monday's fifty is down to a sixteenth of the
    // answer by Friday, and everything since has been zero - and two by five.
    week_reputation: 2,
    caught_events: 3,
    farm_fund: 36_975,
    week_attempt: 1,
  },
  timeline: [
    'caught:bubbles@1632',
    'caught:bubbles@1723',
    'dm:person:terry@1810',
    'caught:bubbles@1839',
    'notice:Maintenance window@2940',
    'caught:bubbles@3076',
    'caught:bubbles@3179',
    'caught:bubbles@3283',
    'caught:bubbles@4512',
    'caught:bubbles@4615',
    'caught:bubbles@4719',
    'caught:bubbles@5950',
    'caught:bubbles@6078',
    'caught:bubbles@6170',
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
  expect(walked.card.reputation).toBe(golden.reviewRead);
  expect(walked.meters).toEqual(golden.meters);
  expect(walked.timeline).toEqual(golden.timeline);
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
 * looks at one number. What is being asked is not "is the number right" - it
 * is whether the number can tell these five apart, because a threshold that
 * everybody clears is a review nobody sits, and one that nobody clears is a
 * game with one ending.
 *
 * The answer is a two-by-two and a floor. There are two ways to lose this job -
 * miss the work, or be seen not doing it - and the week forgives EITHER of
 * them on its own and neither of them together:
 *
 *   worked properly ............ 23 of 23, no breaches ...... 96, passed
 *   half the roster ............ 13 of 22, ten breaches ..... 67, passed
 *   worked, browser up all week . 23 of 23, caught 15 times .. 51, passed
 *   half the roster, browser up . 13 of 22, caught 15 times ... 5, FIRED
 *   nothing at all .............. 0 of 22, everything late .... 4, FIRED
 *
 * with the line at 40. Nothing was tuned to produce that: these are the rates
 * as M3 and M4 left them, and the table is committed here so that a change to
 * any of them shows up as a diff in a shape rather than as a number in a file.
 *
 * The figures are what the REVIEW read - the week weighted toward how it ended
 * - rather than the live meter, because that is the number the conversation is
 * had about. They were 100 / 69 / 50 / 0 / 0 on the meter before the weighting
 * landed, so the shape is unchanged and the top of it is no longer flat: a
 * week worked properly used to sit on the ceiling from about the Wednesday,
 * which meant the Thursday and the Friday could not reach the review at all.
 */
describe('the week at four skill levels', () => {
  interface Profile {
    readonly name: string;
    readonly play: (world: Week, day: number) => void;
    readonly closed: number;
    readonly breached: number;
    /** Where the live meter ended up. */
    readonly reputation: number;
    /** And what the conversation on Friday actually read out of it. */
    readonly reviewRead: number;
    readonly outcome: ReviewOutcome;
    readonly caught: number;
  }

  const PROFILES: readonly Profile[] = [
    {
      name: 'worked properly',
      play: workedWeek,
      closed: 23,
      breached: 0,
      reputation: 100,
      reviewRead: 96,
      outcome: 'passed',
      // One browser, on the Wednesday, hidden before the second round - and
      // found once, which is the week's own texture rather than a profile.
      caught: 1,
    },
    {
      name: 'half the roster',
      play: halfWeek,
      closed: 13,
      breached: 10,
      reputation: 69,
      reviewRead: 67,
      outcome: 'passed',
      caught: 0,
    },
    {
      name: 'worked, with the browser up all week',
      play: slackWeek,
      closed: 23,
      breached: 0,
      reputation: 50,
      reviewRead: 51,
      outcome: 'passed',
      caught: 15,
    },
    {
      name: 'half the roster, with the browser up all week',
      play: slackHalfWeek,
      closed: 13,
      breached: 10,
      reputation: 0,
      reviewRead: 5,
      outcome: 'fired',
      caught: 15,
    },
    {
      name: 'nothing at all',
      play: idleWeek,
      closed: 0,
      breached: 22,
      reputation: 0,
      reviewRead: 4,
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
    return week?.card.reputation ?? Number.NaN;
  };

  it.each(PROFILES)('plays $name the way it says', (profile) => {
    const week = walked.get(profile.name);
    expect(week).toBeDefined();
    expect(week?.card.closed).toBe(profile.closed);
    expect(week?.card.breached).toBe(profile.breached);
    expect(week?.meters[FIELDS.reputation]).toBe(profile.reputation);
    expect(week?.card.reputation).toBe(profile.reviewRead);
    expect(
      week?.timeline.filter((line) => line.startsWith('caught:')),
    ).toHaveLength(profile.caught);
  });

  it('sends the two who did neither home, and keeps the other three', () => {
    for (const profile of PROFILES) {
      expect(walked.get(profile.name)?.outcome, profile.name)
        .toBe(profile.outcome);
    }

    // The threshold is what decided all five, and it decided them by the
    // number rather than by anything the profiles were told.
    for (const profile of PROFILES) {
      const reputation = readingOf(profile.name);

      if (profile.outcome === 'passed') {
        expect(reputation, profile.name)
          .toBeGreaterThanOrEqual(REVIEW_PASS_REPUTATION);
      } else {
        expect(reputation, profile.name).toBeLessThan(REVIEW_PASS_REPUTATION);
      }
    }
  });

  /**
   * And they are separated in the right ORDER, with room between them. Two
   * profiles landing on the same number would pass every assertion above while
   * telling the player nothing: the week has to be able to tell "did the work"
   * from "did half of it" from "did it with the forum open".
   */
  it('marks the week down for each thing that went wrong', () => {
    const worked = readingOf('worked properly');
    const half = readingOf('half the roster');
    const slacked = readingOf('worked, with the browser up all week');
    const both = readingOf('half the roster, with the browser up all week');

    expect(worked).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(slacked);
    expect(slacked).toBeGreaterThan(both);
    // A margin rather than a tie-break: ten points is a bad day, and these are
    // meant to be different weeks.
    expect(worked - half).toBeGreaterThanOrEqual(10);
    expect(half - slacked).toBeGreaterThanOrEqual(10);
    expect(slacked - both).toBeGreaterThanOrEqual(10);
  });
});
