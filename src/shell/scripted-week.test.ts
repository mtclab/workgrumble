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
 * Two weeks are walked. The WORKED week closes what arrives, using the paths
 * the content itself advertises, and passes the review; the IDLE week touches
 * nothing and is fired. Both are pinned to committed numbers, because two runs
 * agreeing only proves the run is repeatable - a changed rate moves both of
 * them together and sails through.
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
function workTheQueue(world: Week): void {
  for (const ticket of world.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket)) {
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
 */
const GOLDEN_WORKED: GoldenWeek = {
  hash: '70d995d48767efe3',
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
  meters: {
    // Twenty-three closed tickets carry the reputation from fifty to its
    // ceiling well before Friday, which is what a week worked properly looks
    // like - the review is survived rather than won, and this one is survived
    // with room. One round of the corridor found the browser on the
    // Wednesday, and the six points it cost were earned back inside the hour.
    stress: 11,
    suspicion: 0,
    reputation: 100,
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
  hash: 'b06f8bfb6fa6e7dc',
  tick: 6_300,
  outcome: 'fired',
  days: [
    [5, 0, 5],
    [5, 0, 5],
    [4, 0, 4],
    [5, 0, 5],
    [3, 0, 3],
  ],
  arrived: 22,
  closed: 0,
  breached: 22,
  stillOpen: 22,
  /** Still paid, right up until they stop paying you. */
  earnedPence: 37_775,
  meters: {
    stress: 98,
    suspicion: 96,
    reputation: 0,
    caught_events: 3,
    farm_fund: 37_775,
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
  expect(walked.card.reputation).toBe(golden.meters[FIELDS.reputation]);
  expect(walked.meters).toEqual(golden.meters);
  expect(walked.timeline).toEqual(golden.timeline);
}

describe('the probation week, twice', () => {
  it('arrives at the same week, to the byte', () => {
    const first = walk(workedWeek);
    const second = walk(workedWeek);

    expect(first).toEqual(second);
    // And it was a week with a week in it.
    expect(first.card.arrived).toBeGreaterThan(0);
    expect(first.card.closed).toBeGreaterThan(0);
    expect(first.meters[FIELDS.farmFund]).toBeGreaterThan(0);
  });

  it('is a different week when it is played differently', () => {
    expect(walk(idleWeek).hash).not.toBe(walk(workedWeek).hash);
  });

  /**
   * The golden weeks. Both endings are reached by PLAYING - the review reads
   * the meters, and the meters read the week - so these two blocks are the
   * whole arc pinned to numbers rather than to a claim about it.
   */
  it('lands on the golden week that was worked', () => {
    expectGolden(walk(workedWeek), GOLDEN_WORKED);
  });

  it('lands on the golden week that was not', () => {
    expectGolden(walk(idleWeek), GOLDEN_IDLE);
  });
});
