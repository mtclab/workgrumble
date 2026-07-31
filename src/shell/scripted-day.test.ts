/**
 * A whole day, driven headlessly through the shipped driver and the shipped
 * engine.
 *
 * This is the determinism gate the M3 spec asks for, and it is deliberately
 * run HERE rather than in cargo: the day is a conversation between the driver
 * and the core - patrols, pings, meter intervals, crashes, spawns, the
 * day-end pay - and a cargo-level test would have to re-implement the driver
 * to express it, which would prove that the re-implementation is
 * deterministic. Nothing below touches the DOM, so the real driver runs
 * exactly as it does in the browser, minus the browser.
 *
 * The same seed and the same script have to land on the same hash. A DIFFERENT
 * script has to land somewhere else, which is what stops this from passing on
 * a hash that has quietly stopped depending on anything.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import {
  BOSS_TRAP_TICKET,
  buildPatrolSchedule,
  CAUGHT_REPUTATION_COST,
  CAUGHT_SUSPICION_FLOOR,
  EMPTIES_SUSPICION_BUMP,
  EMPTIES_TOLERATED,
  PING_STRESS,
} from '../world/boss';
import { COMPANY_IDS } from '../world/company';
import {
  buffTicks,
  crashStartsAt,
  crashStress,
  DRINK_PRICE_PENCE,
} from '../world/consumables';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import {
  METER_INTERVAL_TICKS,
  slackRate,
  STARTING_REPUTATION,
} from '../world/meters';
import { createWorldSession, WORLD_SEED } from '../world/session';
import { AppStateStore } from './app-state';
import { pingBossThread } from './boss-thread';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Screen {
  /** What the shell would report as genuinely on screen. */
  open: readonly string[];
}

interface Day {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
  readonly appState: AppStateStore;
  readonly screen: Screen;
  readonly caught: readonly { appId: string; tick: number }[];
  readonly notices: readonly string[];
}

/** One scripted move by the player, at the minute they made it. */
interface Move {
  readonly atTick: number;
  readonly label: string;
  play(day: Day): void;
}

function startDay(): Day {
  const { engine } = createWorldSession();
  const appState = new AppStateStore();
  const screen: Screen = { open: [] };
  const caught: { appId: string; tick: number }[] = [];
  const notices: string[] = [];
  const driver = new DayDriver(engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => screen.open,
    onNotice: (title) => {
      notices.push(title);
    },
    onCaught: (appId, tick) => {
      caught.push({ appId, tick });
    },
    onBossPing: (ping) => {
      pingBossThread(appState, ping.line);
    },
  });

  return { driver, engine, appState, screen, caught, notices };
}

/**
 * Plays a shift minute by minute, making each move on the minute it belongs
 * to. One tick at a time on purpose: a batch would let a patrol arrive and a
 * player react in the same call, which is the one thing a reaction window
 * cannot allow.
 */
function playUntil(day: Day, until: number, moves: readonly Move[]): Day {
  if (day.driver.state() === 'morning_brief') {
    day.driver.startShift();
  }

  const pending = [...moves].sort((left, right) => left.atTick - right.atTick);

  while (day.engine.now() < until && day.driver.state() === 'shift') {
    while (pending.length > 0 && (pending[0]?.atTick ?? 0) <= day.engine.now()) {
      pending.shift()?.play(day);
    }

    day.driver.step(TICK_INTERVAL_MS);
  }

  return day;
}

function playShift(day: Day, moves: readonly Move[]): Day {
  return playUntil(day, shiftEndTick(day.driver.day()), moves);
}

function meter(day: Day, field: string): number {
  const value = day.engine.graph.getField(COMPANY_IDS.player, field);
  return typeof value === 'number' ? value : Number.NaN;
}

const PATROL = buildPatrolSchedule(1, WORLD_SEED);
const FIRST_VISIT = PATROL.visits[0];
const SECOND_VISIT = PATROL.visits[1];
const FIRST_PING = PATROL.pings[0];

if (
  FIRST_VISIT === undefined
  || SECOND_VISIT === undefined
  || FIRST_PING === undefined
) {
  throw new Error('The shipped seed must give day one rounds and pings.');
}

function slackFrom(tick: number, apps: readonly string[]): Move {
  return {
    atTick: tick,
    label: `open ${apps.join(', ')}`,
    play: (day) => {
      day.screen.open = apps;
    },
  };
}

/** The boss key, as the driver sees it: the screen goes clean. */
function bossKeyAt(tick: number): Move {
  return {
    atTick: tick,
    label: 'boss key',
    play: (day) => {
      day.screen.open = [];
    },
  };
}

function drinkAt(tick: number): Move {
  return {
    atTick: tick,
    label: 'open a can',
    play: (day) => {
      expect(day.driver.drink().ok, `can at ${String(tick)}`).toBe(true);
    },
  };
}

describe('the lead on the clock', () => {
  /**
   * The skill the whole system is built around: the telegraph is a reaction
   * window, and using it is the difference between a day with a conversation
   * in it and a day without one.
   */
  it('catches a screen that is still up, and misses one that is not', () => {
    // Up since the shift started, which is what makes the reset visible: by
    // the time he arrives the meter is high, and afterwards it is not.
    const allMorning = slackFrom(shiftStartTick(1) + 2, ['bubbles']);
    const caughtDay = playUntil(
      startDay(),
      FIRST_VISIT.arrivalTick + 1,
      [allMorning],
    );

    expect(caughtDay.caught).toEqual([
      { appId: 'bubbles', tick: FIRST_VISIT.arrivalTick },
    ]);
    expect(meter(caughtDay, FIELDS.caughtEvents)).toBe(1);
    expect(meter(caughtDay, FIELDS.reputation))
      .toBe(STARTING_REPUTATION - CAUGHT_REPUTATION_COST);

    // Suspicion was reset to the floor as he arrived - being spoken to does
    // not launder the morning, it puts you where somebody who has just been
    // spoken to sits - and it has started climbing again, because the window
    // is still up while he is standing there.
    const before = playUntil(
      startDay(),
      FIRST_VISIT.arrivalTick - 1,
      [allMorning],
    );
    expect(meter(before, FIELDS.suspicion))
      .toBeGreaterThan(CAUGHT_SUSPICION_FLOOR * 2);
    expect(meter(caughtDay, FIELDS.suspicion))
      .toBeLessThan(meter(before, FIELDS.suspicion));
    // The interval the arrival fell in still charges for a window that is
    // still up while he stands there, so the floor is a floor plus one
    // interval of exactly the app he caught you at - and no more.
    expect(meter(caughtDay, FIELDS.suspicion))
      .toBeLessThanOrEqual(CAUGHT_SUSPICION_FLOOR + slackRate('bubbles').suspicion);
    expect(meter(caughtDay, FIELDS.suspicion))
      .toBeGreaterThanOrEqual(CAUGHT_SUSPICION_FLOOR);

    // Left up all day, he finds it every round he does.
    const oblivious = playShift(startDay(), [allMorning]);
    expect(oblivious.caught.length).toBe(PATROL.visits.length);

    const survived = playShift(startDay(), [
      slackFrom(FIRST_VISIT.telegraphTick - 30, ['browser']),
      bossKeyAt(FIRST_VISIT.telegraphTick),
      // Straight back to it the moment he has gone, which is the loop.
      slackFrom(FIRST_VISIT.departureTick, ['browser']),
      bossKeyAt(SECOND_VISIT.telegraphTick),
    ]);

    expect(survived.caught).toEqual([]);
    expect(meter(survived, FIELDS.caughtEvents)).toBe(0);
    // Surviving is not free: the suspicion charged while it was on screen is
    // still on the meter, which is what makes the next round worse.
    expect(meter(survived, FIELDS.suspicionEvents)).toBeGreaterThan(0);
  });

  it('tells the player the footsteps started, before he arrives', () => {
    const day = startDay();
    day.driver.startShift();

    while (day.engine.now() < FIRST_VISIT.telegraphTick) {
      day.driver.step(TICK_INTERVAL_MS);
    }

    expect(day.notices).toContain('Footsteps');
    expect(day.driver.boss().phase).toBe('telegraph');
    expect(day.driver.boss().ticksToArrival)
      .toBe(FIRST_VISIT.arrivalTick - FIRST_VISIT.telegraphTick);

    while (day.engine.now() < FIRST_VISIT.arrivalTick) {
      day.driver.step(TICK_INTERVAL_MS);
    }

    expect(day.driver.boss().phase).toBe('present');
    expect(day.driver.boss().ticksToArrival).toBeNull();
  });

  /** The desk tells the story even when the screen does not. */
  it('counts the empties when the screen is clean', () => {
    const cans = EMPTIES_TOLERATED + 1;
    const day = playUntil(
      startDay(),
      FIRST_VISIT.arrivalTick + 1,
      Array.from(
        { length: cans },
        (_unused, index) => drinkAt(shiftStartTick(1) + 1 + index),
      ),
    );

    expect(meter(day, FIELDS.deskCans)).toBe(cans);
    expect(day.caught).toEqual([]);
    expect(day.notices).toContain('He counted them');
    expect(meter(day, FIELDS.consumableSpend)).toBe(DRINK_PRICE_PENCE * cans);

    // Against the same day with nothing on the desk: the empties are what
    // made the difference, not the hours.
    const sober = playUntil(startDay(), FIRST_VISIT.arrivalTick + 1, []);
    expect(meter(day, FIELDS.suspicion) - meter(sober, FIELDS.suspicion))
      .toBeGreaterThanOrEqual(EMPTIES_SUSPICION_BUMP - 1);
  });

  it('says nothing about a desk that was tidied in time', () => {
    const day = playUntil(startDay(), FIRST_VISIT.arrivalTick + 1, [
      ...Array.from(
        { length: EMPTIES_TOLERATED + 1 },
        (_unused, index) => drinkAt(shiftStartTick(1) + 1 + index),
      ),
      {
        atTick: FIRST_VISIT.telegraphTick,
        label: 'tidy the desk',
        play: (world) => {
          expect(world.driver.tidyDesk().ok).toBe(true);
        },
      },
    ]);

    expect(day.notices).not.toContain('He counted them');
    expect(meter(day, FIELDS.deskCans)).toBe(0);
  });

  /**
   * The trap: he raises a ticket by mentioning it, it costs stress, and the
   * line lands in the thread he has always used.
   */
  it('raises the trap ticket on the first ping, once', () => {
    const day = playUntil(startDay(), FIRST_PING.tick + 1, []);

    expect(day.engine.ticketState(BOSS_TRAP_TICKET)).toBe('open');
    expect(day.engine.graph.getField(BOSS_TRAP_TICKET, FIELDS.spawnedAt))
      .toBe(FIRST_PING.tick);
    expect(meter(day, FIELDS.stress)).toBeGreaterThanOrEqual(PING_STRESS);

    const thread = day.appState.get().chat.threads[COMPANY_IDS.boss];
    expect(thread?.lines.some((line) => line.text === FIRST_PING.line))
      .toBe(true);
    expect(thread?.nodeId).toBe('phone');
  });
});

describe('the can, on the clock', () => {
  it('bills the crash once, when the buff runs out', () => {
    const opened = shiftStartTick(1) + 10;
    const day = playShift(startDay(), [drinkAt(opened)]);

    expect(meter(day, FIELDS.drinkCrashCharged)).toBe(opened);
    expect(meter(day, FIELDS.stress)).toBeGreaterThanOrEqual(crashStress(1));
    expect(
      day.notices.filter((notice) => notice === 'That is the can, then'),
    ).toHaveLength(1);
  });

  /**
   * A second can opened while the first is still working does not buy a
   * second crash - it moves the one crash later and makes it worse. That is
   * the tolerance model, and it is the reason chaining is a decision: the bill
   * is deferred, never cancelled.
   */
  it('stacks a second can into the same run and pays once, harder', () => {
    const opened = shiftStartTick(1) + 10;
    const second = opened + 20;
    const lands = crashStartsAt(second, 2);
    const moves = [drinkAt(opened), drinkAt(second)];

    // Measured across the interval the bill lands in - the meters run every
    // five minutes, and the crash is settled on the same cadence - so the
    // queue's own slow climb cannot be mistaken for the crash.
    const before = playUntil(startDay(), lands - 1, moves);
    const stress = meter(before, FIELDS.stress);
    before.driver.step(TICK_INTERVAL_MS * METER_INTERVAL_TICKS);

    expect(meter(before, FIELDS.stress) - stress)
      .toBeGreaterThanOrEqual(crashStress(2));
    expect(crashStress(2)).toBeGreaterThan(crashStress(1));
    expect(buffTicks(2)).toBeLessThan(buffTicks(1));

    const stacked = playShift(startDay(), moves);
    expect(meter(stacked, FIELDS.drinkTolerance)).toBe(2);
    expect(meter(stacked, FIELDS.drinkCrashCharged)).toBe(second);
    expect(meter(stacked, FIELDS.deskCans)).toBe(2);
    // One bill, not two: the second can moved the landing rather than adding
    // a second one, which is why chaining is a decision and not a loophole.
    expect(
      stacked.notices.filter((notice) => notice === 'That is the can, then'),
    ).toHaveLength(1);
  });
});

/**
 * The M3 determinism gate. A whole day - arrivals, patrols, pings, meters,
 * cans, crashes, the pay at the end - replayed from the same seed and the same
 * script, twice, has to land on the same graph.
 */
describe('the same day, twice', () => {
  const script = (): readonly Move[] => [
    slackFrom(shiftStartTick(1) + 5, ['browser']),
    bossKeyAt(shiftStartTick(1) + 40),
    drinkAt(shiftStartTick(1) + 60),
    slackFrom(FIRST_VISIT.telegraphTick - 12, ['bubbles']),
    bossKeyAt(FIRST_VISIT.telegraphTick + 1),
    drinkAt(FIRST_PING.tick + 5),
    slackFrom(SECOND_VISIT.telegraphTick - 6, ['browser']),
  ];

  interface Walked {
    readonly hash: string;
    readonly tick: number;
    /** What the day END looked like, before clocking off cleared the counts. */
    readonly atSeventeen: Record<string, number>;
    readonly banked: number;
    readonly caught: number;
  }

  function walk(moves: readonly Move[]): Walked {
    const day = playShift(startDay(), moves);
    expect(day.driver.state()).toBe('day_end');

    const atSeventeen = Object.fromEntries(
      [
        FIELDS.stress,
        FIELDS.suspicion,
        FIELDS.reputation,
        FIELDS.suspicionEvents,
        FIELDS.caughtEvents,
        FIELDS.consumableSpend,
        FIELDS.deskCans,
      ].map((field) => [field, meter(day, field)]),
    );

    day.driver.clockOff();

    return {
      hash: day.engine.snapshotHash(),
      tick: day.engine.now(),
      atSeventeen,
      banked: meter(day, FIELDS.farmFund),
      caught: day.caught.length,
    };
  }

  it('arrives at the same world, to the byte', () => {
    const first = walk(script());
    const second = walk(script());

    expect(first).toEqual(second);
    // And it was a day with something in it, rather than a quiet one that
    // would have matched whatever the script said.
    expect(first.banked).toBeGreaterThan(0);
    expect(first.caught).toBeGreaterThan(0);
    expect(first.atSeventeen[FIELDS.consumableSpend])
      .toBe(DRINK_PRICE_PENCE * 2);
    expect(first.atSeventeen[FIELDS.suspicionEvents]).toBeGreaterThan(0);
  });

  /**
   * And the gate has teeth: a day played differently is a different world. A
   * hash that matched here would be a hash that had stopped depending on the
   * day at all.
   */
  it('arrives somewhere else when the day is played differently', () => {
    const lazy = walk([
      slackFrom(shiftStartTick(1) + 5, ['browser']),
    ]);
    const busy = walk(script());

    expect(lazy.hash).not.toBe(busy.hash);
  });

  /** Nothing about the boss is saved, so a reload lands him where the day says. */
  it('puts the lead back where the day says after a reload', () => {
    const day = startDay();
    day.driver.startShift();
    day.driver.step(TICK_INTERVAL_MS * 30);

    const saved = day.engine.serialize();
    const reloaded = startDay();
    reloaded.engine.restore(saved);
    reloaded.driver.resync();

    expect(reloaded.driver.boss()).toEqual(day.driver.boss());
    expect(reloaded.engine.now()).toBe(day.engine.now());

    // Walk both to the first arrival with the same screen up: same outcome.
    for (const world of [day, reloaded]) {
      world.screen.open = ['bubbles'];

      while (world.engine.now() < FIRST_VISIT.arrivalTick) {
        world.driver.step(TICK_INTERVAL_MS);
      }
    }

    expect(reloaded.caught).toEqual(day.caught);
    expect(meter(reloaded, FIELDS.reputation))
      .toBe(STARTING_REPUTATION - CAUGHT_REPUTATION_COST);
  });
});
