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

  runTo(world, start + 330);
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
 */
const GOLDEN_WORKED: GoldenWeek = {
  hash: '8d213f6a78394fc6',
  /** Friday, 17:00, and no further: there is no Saturday to advance into. */
  tick: 6_300,
  outcome: 'passed',
  // Monday brings four - the two that were waiting, the one that drips in
  // mid-morning, and the one the lead raises by mentioning it. Tuesday drips
  // one, Thursday inherits the office-wide fault, and the two blank days are
  // days lane C has not filled yet. All of them close, none of them go red.
  days: [
    [4, 4, 0],
    [1, 1, 0],
    [0, 0, 0],
    [1, 1, 0],
    [0, 0, 0],
  ],
  arrived: 6,
  closed: 6,
  breached: 0,
  stillOpen: 0,
  /** Five days at the rate, six resolution bonuses, the deductions nobody
   * agreed to, and the probation bonus for surviving Friday. */
  earnedPence: 72_275,
  meters: {
    // Six closed tickets carry the reputation up from fifty; one round of the
    // corridor found the browser on the Wednesday, which cost six of it.
    stress: 8,
    suspicion: 0,
    reputation: 62,
    // Counted per day and cleared at every clock-off: Friday was clean.
    caught_events: 0,
    farm_fund: 72_275,
    week_attempt: 1,
  },
  timeline: [
    'caught:browser@3076',
    'review:passed@6180',
    'beer@6300',
    'week:passed@6300',
  ],
};

/**
 * And the week nobody worked: a game of Bubble Break left up from Tuesday
 * morning, six deadlines missed, twelve conversations with the lead and a
 * reputation on the floor by Friday afternoon.
 */
const GOLDEN_IDLE: GoldenWeek = {
  hash: 'd1bc240a2f864c6c',
  tick: 6_300,
  outcome: 'fired',
  days: [
    [4, 0, 4],
    [1, 0, 1],
    [0, 0, 0],
    [1, 0, 1],
    [0, 0, 0],
  ],
  arrived: 6,
  closed: 0,
  breached: 6,
  stillOpen: 6,
  /** Still paid, right up until they stop paying you. */
  earnedPence: 43_375,
  meters: {
    stress: 98,
    suspicion: 96,
    reputation: 0,
    caught_events: 3,
    farm_fund: 43_375,
    week_attempt: 1,
  },
  timeline: [
    'caught:bubbles@1632',
    'caught:bubbles@1723',
    'caught:bubbles@1839',
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
