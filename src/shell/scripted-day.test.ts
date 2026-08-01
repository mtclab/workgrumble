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
  CAUGHT_MINUTES,
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
import { APP_MANIFEST } from './apps';
import { AppStateStore } from './app-state';
import { pingBossThread } from './boss-thread';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Day {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
  readonly appState: AppStateStore;
  readonly caught: readonly { appId: string; tick: number }[];
  readonly notices: readonly string[];
  /** Everything the day announced, with the minute it happened on. */
  readonly timeline: readonly string[];
}

/** Which of the shipped apps are the ones you would rather not be seen at. */
const SLACK_APPS: ReadonlySet<string> = new Set(
  APP_MANIFEST.filter((app) => app.slack).map((app) => app.id),
);

/**
 * Opening windows, through the same store the desktop writes and the save
 * carries. The last one opened is the one in front.
 *
 * The test drives the SAVED screen rather than a fake of its own, which is the
 * whole point: a reload puts these windows back, so a reloaded session sees
 * what an uninterrupted one saw without anybody putting it back by hand.
 */
function show(day: Day, apps: readonly string[]): void {
  day.appState.patch('windows', {
    open: apps.map((appId) => ({ appId, minimized: false })),
    focusedId: apps[apps.length - 1] ?? null,
  });
}

function visibleSlack(appState: AppStateStore): readonly string[] {
  return appState.get().windows.open
    .filter((entry) => !entry.minimized && SLACK_APPS.has(entry.appId))
    .map((entry) => entry.appId);
}

function focusedSlack(appState: AppStateStore): string | null {
  const { open, focusedId } = appState.get().windows;
  const focused = open.find((entry) => entry.appId === focusedId);

  return focused !== undefined
    && !focused.minimized
    && SLACK_APPS.has(focused.appId)
    ? focused.appId
    : null;
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
  const caught: { appId: string; tick: number }[] = [];
  const notices: string[] = [];
  const timeline: string[] = [];
  const at = (what: string): string => `${what}@${String(engine.now())}`;
  const driver = new DayDriver(engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => visibleSlack(appState),
    focusedSlackApp: () => focusedSlack(appState),
    onNotice: (title) => {
      notices.push(title);
      timeline.push(at(title));
    },
    onCaught: (appId, tick) => {
      caught.push({ appId, tick });
      timeline.push(`caught:${appId}@${String(tick)}`);
    },
    onBossPing: (ping) => {
      pingBossThread(appState, ping.line);
      timeline.push(at(`ping:${String(ping.index)}`));
    },
  });

  return { driver, engine, appState, caught, notices, timeline };
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
      show(day, apps);
    },
  };
}

/** The boss key, as the driver sees it: the screen goes clean. */
function bossKeyAt(tick: number): Move {
  return {
    atTick: tick,
    label: 'boss key',
    play: (day) => {
      show(day, []);
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
    // And it cost no points. It used to cost six off reputation, in a currency
    // the review stopped spending in 0.2.5; what it costs now is one dated
    // line and ten minutes of the shift, both asserted below.
    expect(meter(caughtDay, FIELDS.reputation)).toBe(STARTING_REPUTATION);
    expect(caughtDay.driver.conductReading().lines).toBe(1);

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
    // The window is STILL up while he is standing there, so the intervals the
    // conversation takes charge for it: the floor, plus the interval the
    // arrival fell in, plus the ones the ten minutes cost - all of them at
    // exactly the rate of the app he caught you at, and no more. That the
    // conversation shows up here at all is the point of it costing minutes.
    expect(meter(caughtDay, FIELDS.suspicion)).toBeLessThanOrEqual(
      CAUGHT_SUSPICION_FLOOR
        + (1 + CAUGHT_MINUTES / METER_INTERVAL_TICKS)
          * slackRate('bubbles').suspicion,
    );
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

  /**
   * WHAT BEING CAUGHT ACTUALLY COSTS, measured in the only currency that is
   * scarce: minutes of a shift that ends at 17:00 whatever happens in it.
   *
   * The counting is deliberately blunt. Both days are played the same way and
   * the same number of times, one minute per call, and the day that got caught
   * runs out of shift sooner - by exactly `CAUGHT_MINUTES` per conversation.
   * Those minutes come off the queue and no deadline moves with them, which is
   * how the corridor reaches the mark the review is decided on without conduct
   * ever appearing in it.
   *
   * A slice that made a catch free on the clock as well as on the scoreboard
   * would leave the boss key with nothing behind it, and this is the assertion
   * that would go red first.
   */
  it('charges a conversation in minutes, off a shift that still ends at five', () => {
    const callsToClockOff = (day: Day, moves: readonly Move[]): number => {
      day.driver.startShift();
      const pending = [...moves].sort((left, right) => left.atTick - right.atTick);
      let calls = 0;

      while (day.driver.state() === 'shift') {
        while (
          pending.length > 0 && (pending[0]?.atTick ?? 0) <= day.engine.now()
        ) {
          pending.shift()?.play(day);
        }

        day.driver.step(TICK_INTERVAL_MS);
        calls += 1;
      }

      return calls;
    };

    const allMorning = slackFrom(shiftStartTick(1) + 2, ['bubbles']);
    const oblivious = startDay();
    const obliviousCalls = callsToClockOff(oblivious, [allMorning]);

    // The same day, with the same window open, put away every time the floor
    // creaks. Nothing else about the two differs.
    const careful = startDay();
    const carefulCalls = callsToClockOff(careful, [
      allMorning,
      ...PATROL.visits.flatMap((visit) => [
        bossKeyAt(visit.telegraphTick),
        slackFrom(visit.departureTick, ['bubbles']),
      ]),
    ]);

    expect(careful.caught).toEqual([]);
    expect(oblivious.caught.length).toBe(PATROL.visits.length);
    // Both days end at 17:00 - that is the point of the whole mechanic - so
    // the difference is entirely in how many of those minutes the player got.
    expect(oblivious.engine.now()).toBe(careful.engine.now());
    expect(carefulCalls - obliviousCalls)
      .toBe(PATROL.visits.length * CAUGHT_MINUTES);
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

  /**
   * Two observations, one visit. Being caught at something is a conversation
   * about the screen; the cans are a second, quieter one about the desk, and
   * a man who has just found a browser open does not stop being able to count.
   * Settling only the first made the screen a hiding place for the desk.
   */
  it('settles the screen and the desk in the same visit, once each', () => {
    const cans = EMPTIES_TOLERATED + 1;
    const day = playUntil(startDay(), FIRST_VISIT.arrivalTick + 1, [
      ...Array.from(
        { length: cans },
        (_unused, index) => drinkAt(shiftStartTick(1) + 1 + index),
      ),
      slackFrom(FIRST_VISIT.telegraphTick - 5, ['browser']),
    ]);

    expect(day.caught).toEqual([
      { appId: 'browser', tick: FIRST_VISIT.arrivalTick },
    ]);
    expect(meter(day, FIELDS.caughtEvents)).toBe(1);
    expect(
      day.notices.filter((notice) => notice === 'He counted them'),
    ).toHaveLength(1);

    // Both observations, exactly once each, and both on the file: the screen
    // he found something on and the desk he did the arithmetic on. Neither
    // costs a point of anything.
    expect(meter(day, FIELDS.reputation)).toBe(STARTING_REPUTATION);
    expect(
      day.driver.conductReading().lines,
      'the screen and the desk are two lines, not one',
    ).toBe(2);
    expect(meter(day, FIELDS.suspicion))
      .toBeGreaterThanOrEqual(CAUGHT_SUSPICION_FLOOR + EMPTIES_SUSPICION_BUMP);
    expect(meter(day, FIELDS.deskCans)).toBe(cans);
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
/**
 * The scripted day, as it stood when this gate was written. See the test that
 * reads it for what changing any of these means.
 */
const GOLDEN_DAY = {
  /**
   * The world at the end of it, in sixteen characters.
   *
   * It has moved three times, and the third one is smaller than it looks. In
   * lane B the machines started keeping event logs, and an event log is graph
   * state; in lane C the building gained eleven more people, the estate they
   * sit at, and a Monday with five tickets on it instead of four; and then the
   * event log learned to record a printer LOSING power as well as getting it
   * back, which is the only witness the recurring arc has and which the
   * cleaner's trolley writes into PRINT-02 at four minutes to five on the
   * Monday. Every time, every other number on this screen was read rather than
   * assumed, and the only one that has ever moved with the hash - stress at
   * five o'clock - moved for a reason written beside it.
   *
   * It has now moved a fourth time, for the M4 QA wave, and again alone: not
   * one meter, minute, timeline entry or penny on this screen changed. Two
   * things are in Monday's graph that were not before. The new starter is
   * seeded with the Sales mailbox and the Send As group - two edges, so that
   * the two tickets about them can take the permissions away as they arrive
   * rather than reporting the absence of something nobody wrote down. And the
   * warehouse printer counts how many times it has lost power, which is what
   * the note by the socket is earned by; the trolley writes the first of
   * those at 16:56 on this very Monday.
   *
   * And a fifth time, for M5's weighted review, and once again the hash is the
   * only thing on this screen that moved. The player node carries one more
   * number - `week_reputation`, the week as the Friday conversation will read
   * it - seeded at fifty on the Monday morning and written once at clock-off,
   * where this day ends. Nothing about how reputation MOVES changed, which is
   * why every meter below is the number it was: this day's stress, suspicion
   * and reputation, its pay, its patrols and its cans are untouched, and the
   * new field is Monday's fifty folded into the 26 this day ends on, which
   * is 38 at midnight - a day whose queue went unworked, read as the review
   * would read it.
   *
   * And a sixth time, for the M5 close-out, and again the hash is the only
   * number here that has moved. Three things are in Monday's graph that were
   * not: every account carries the identity-proofing channels the June rollout
   * put on file (a callback number and a recovery code, one string per
   * account), and every ticket that went red now carries the MINUTE it went
   * red as well as the flag. This day's four breaches therefore write four
   * `breached_at` stamps - the same four events, timestamped - which is what
   * makes a day answerable for what happened IN it rather than for what its
   * tickets happen to look like afterwards. Nothing resolves in this scripted
   * day and nobody triages anything, so no `resolved_at` or `classified_at`
   * appears in it at all. Every meter, minute, timeline entry and penny below
   * is the number it was.
   *
   * SEVENTH MOVE (0.2.2, the estate is a real estate). The hash again, and the
   * hash alone. Monday's graph now holds three hundred and twenty-four
   * services instead of seven - every box in the building runs the twenty-odd
   * its role says it runs, with a status and a startup type on each - plus a
   * domain controller, the machine fields that say what is in each case, and
   * three cables that were always implied and never written down. All of it
   * is SEEDED and none of it moves: no baseline service changes state in this
   * day, nothing new writes to an event log, and the day's own numbers are
   * therefore untouched. Every meter, minute, timeline entry and penny below
   * is again the number it was.
   *
   * EIGHTH MOVE (0.2.3, the filesystem). The hash, and the hash alone, for the
   * third slice running. Monday's graph now holds two hundred directories and
   * files - fourteen boxes each built from one image, plus what each role adds
   * and a profile for whoever logs on there - joined by the `contains` edges
   * that make a drive a drive, and one more field on every machine saying how
   * much of that drive is free. The spooler ticket is not in this scripted day
   * at all, so the one field the world MOVES on a drive - the list of jobs
   * behind a print queue - is empty here from the first minute to the last.
   * Every directory in it is seeded, nothing in this day writes to one, and
   * every meter, minute, timeline entry and penny below is once again the
   * number it was.
   *
   * NINTH MOVE (0.2.4, the drive has tickets on it). The hash, and the hash
   * alone, for the fourth slice running - and this time that claim is worth
   * spelling out, because two tickets were added to the WEEK and neither of
   * them is on a Monday. Monday's queue is the same five arrivals it has been
   * since M4: the two the morning hands over, the one about your own desk, the
   * mouse after lunch, and the concern the lead raises by mentioning it. Every
   * meter, minute, breach, timeline entry and penny below is untouched.
   *
   * What moved the hash is all seed. Every one of the fourteen boxes now has
   * the temp directory its image has always made, with the build log the image
   * left in it; the warehouse workstation has the three directories its pallet
   * scanner writes into, the two files it wrote, and - as a listing on the
   * directory rather than as files - the twelve monthly exports that have been
   * eating that drive since 1997; and every directory and file on every drive
   * carries the volume it is on, which is the one fact about a path that a
   * guard cannot walk to and the reason a move between two boxes can be
   * refused for the true reason rather than allowed. None of it moves in this
   * day: nothing in this scripted Monday touches a drive at all.
   *
   * TENTH MOVE (0.2.5, the review reads a percentage). The hash, and the hash
   * alone, for the fifth slice running - and this time the cause is one number
   * on the player node rather than a graph full of seed.
   *
   * `week_reputation` is still there, still written once at this day's
   * clock-off, and it now holds something else. It used to be Monday's fifty
   * folded into the reputation meter this day ends on, which came to 38. It is
   * now Monday's fifty folded into the MARK - five tickets arrived, none were
   * closed, four went red, so the resolution half is nought and the deadline
   * half is one in five, which is a mark of 10 - and that comes to 30.
   *
   * Nothing else moved, and the reason is worth having in writing: how
   * reputation MOVES was not touched by this slice, only what Friday at three
   * makes of the week. Every meter, minute, breach, patrol, can, timeline
   * entry and penny below is the number it was, including the reputation of 26
   * this day ends on, which the review no longer reads.
   *
   * ELEVENTH MOVE (0.2.6, the conduct file). The hash, ONE meter and TWO
   * timeline entries, and each of the three is the slice stated exactly.
   *
   *  - `reputation` at five o'clock goes from 26 to 38, and the twelve points
   *    are the two conversations at 311 and 390 which used to cost six each.
   *    They cost nothing now. 0.2.5 stopped the review reading this meter, so
   *    the six points were a fine levied in a currency nobody spends; what a
   *    conversation costs is on the two new timeline lines. The four breaches
   *    still cost their three each, which is why it is 38 rather than 50 - the
   *    QUEUE still moves this meter, and only the corridor stopped.
   *  - `That is 10 minutes` twice, in the same minute as each arrival. Ten
   *    minutes of the shift, gone, with no deadline moving to meet them. It is
   *    the whole price now and it is measured properly one test up, by playing
   *    the same day twice and counting how many minutes the player got.
   *  - The hash, for those twelve points and for the two dated lines the day
   *    wrote onto `conduct_file`, plus `review_bar` on the player node at the
   *    published 45, seeded on the Monday because a bar the world was not
   *    carrying is a bar the review verbs cannot compare anything against.
   *
   * Everything else came through untouched: the same stress, the same
   * suspicion, the same fifty-eight suspicious minutes, the same two
   * conversations, the same four breaches charged once each, the same two
   * cans, the same crash, the same 7,315 pence, and the same `week_reputation`
   * of 30 - because nothing in this slice touches what the review reads.
   */
  hash: '673109081cdf3cfa',
  /** Midnight: the day was clocked off and the night slept through. */
  tick: 1_440,
  /** The meters partway through, where a changed rate is still legible. */
  onTheWay: {
    // 09:45. The browser has been up since five past and nothing has been
    // closed. Monday inherits two tickets, which is exactly what a person can
    // hold in their head, so there is nothing on the stress meter at all - the
    // rate saying so rather than a meter that has stopped working.
    105: {
      stress: 0,
      suspicion: 34,
      reputation: 50,
      suspicion_events: 7,
      caught_events: 0,
      breaches_charged: 0,
      resolve_credit_paid: 0,
      consumable_spend: 0,
      desk_cans: 0,
      drink_started_at: -1,
      drink_tolerance: 0,
      drink_crash_charged: -1,
    },
    // 11:00. One can open and paid for, the screen clean since twenty to ten,
    // and the morning's arrival now in the queue beside the two inherited
    // ones - so the queue has started charging for itself, and the first
    // deadline of the day has gone past.
    180: {
      stress: 17,
      suspicion: 19,
      reputation: 50,
      suspicion_events: 7,
      caught_events: 0,
      breaches_charged: 0,
      resolve_credit_paid: 0,
      consumable_spend: 120,
      desk_cans: 1,
      drink_started_at: 120,
      drink_tolerance: 1,
      drink_crash_charged: 120,
    },
  } as Record<string, Record<string, number>>,
  /** Every number the pressure layer ended the day holding. */
  atSeventeen: {
    // A queue of FIVE that nobody closed, two cans, and two conversations
    // with the lead. Monday's roster grew by one in lane C - the mouse that
    // drips in after lunch - and one more ticket sitting in the queue all
    // afternoon is worth forty-two points of stress by five o'clock, which is
    // the queue rate doing exactly what it says it does.
    stress: 91,
    suspicion: 100,
    reputation: 38,
    suspicion_events: 58,
    caught_events: 2,
    // Four deadlines missed and charged once each: the two tickets inherited
    // at eight, the one that arrived mid-morning, and the one the lead raised
    // by mentioning it. The fifth - the mouse, dripped in at twenty to two -
    // is still inside its four hours when the office closes and its clock
    // stops with the shift. Nothing was resolved, so there was no credit.
    breaches_charged: 4,
    resolve_credit_paid: 0,
    consumable_spend: 240,
    desk_cans: 2,
    // The second can of the run, and the crash it was billed for.
    drink_started_at: 234,
    drink_tolerance: 2,
    drink_crash_charged: 234,
  } as Record<string, number>,
  banked: 7_315,
  /**
   * Every minute the day announced something, in order: the bill for a can,
   * the footsteps, the lead's messages, and the two rounds that found
   * something on the screen.
   */
  timeline: [
    'That is the can, then@165',
    'Footsteps@216',
    'ping:0@229',
    'That is the can, then@270',
    'Footsteps@307',
    'caught:browser@311',
    'That is 10 minutes@311',
    'ping:1@381',
    'Footsteps@386',
    'caught:browser@390',
    'That is 10 minutes@390',
  ] as readonly string[],
};

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

  /**
   * Minutes the meters are read on the way through, before anything has had
   * time to pin itself to the top of its range.
   *
   * The end-of-day snapshot alone is not enough to hold a RATE: stress spends
   * the back half of this day against its ceiling, so doubling what a ticket
   * in the queue is worth per interval changes nothing anybody can read at
   * 17:00. These two are taken while there is still room to move.
   */
  const PROBE_TICKS: readonly number[] = [
    shiftStartTick(1) + 45,
    shiftStartTick(1) + 120,
  ];

  function probeAt(
    tick: number,
    into: Record<string, Record<string, number>>,
  ): Move {
    return {
      atTick: tick,
      label: `read the meters at ${String(tick)}`,
      play: (day) => {
        into[String(tick)] = Object.fromEntries(
          PRESSURE_FIELDS.map((field) => [field, meter(day, field)]),
        );
      },
    };
  }

  interface Walked {
    readonly hash: string;
    readonly tick: number;
    /** The meters partway through, where they are still free to move. */
    readonly onTheWay: Record<string, Record<string, number>>;
    /** What the day END looked like, before clocking off cleared the counts. */
    readonly atSeventeen: Record<string, number>;
    readonly banked: number;
    readonly caught: number;
    /** Every footstep, arrival, ping and bill, with the minute it landed on. */
    readonly timeline: readonly string[];
  }

  /**
   * Everything the pressure layer ends the day holding.
   *
   * The watermarks and the run are in here with the meters on purpose: they
   * are what makes a repeating tick idempotent, and a regression that billed a
   * breach twice or lost a crash would leave the visible meters looking
   * plausible while the bookkeeping behind them had changed.
   */
  const PRESSURE_FIELDS: readonly string[] = [
    FIELDS.stress,
    FIELDS.suspicion,
    FIELDS.reputation,
    FIELDS.suspicionEvents,
    FIELDS.caughtEvents,
    FIELDS.breachesCharged,
    FIELDS.resolveCreditPaid,
    FIELDS.consumableSpend,
    FIELDS.deskCans,
    FIELDS.drinkStartedAt,
    FIELDS.drinkTolerance,
    FIELDS.drinkCrashCharged,
  ];

  function walk(moves: readonly Move[]): Walked {
    const onTheWay: Record<string, Record<string, number>> = {};
    const day = playShift(startDay(), [
      ...moves,
      ...PROBE_TICKS.map((tick) => probeAt(tick, onTheWay)),
    ]);
    expect(day.driver.state()).toBe('day_end');

    const atSeventeen = Object.fromEntries(
      PRESSURE_FIELDS.map((field) => [field, meter(day, field)]),
    );

    day.driver.clockOff();

    return {
      hash: day.engine.snapshotHash(),
      tick: day.engine.now(),
      onTheWay,
      atSeventeen,
      banked: meter(day, FIELDS.farmFund),
      caught: day.caught.length,
      timeline: day.timeline,
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
   * The golden day: literals, committed, binding.
   *
   * Two runs agreeing proves the day is deterministic and nothing else - a
   * change to a rate, a schedule or a meter moves both of them together and
   * the comparison sails through. These numbers are the other half: they were
   * produced by the code below on the day it was written, and every one of
   * them is a decision. Changing any of them is allowed and is a CONSCIOUS
   * diff - the same rule the M0 golden hash lives by - and the diff is the
   * review: which meter moved, which minute the lead arrived on, what the day
   * paid.
   */
  it('lands on the golden day, to the number', () => {
    const walked = walk(script());

    expect(walked.hash).toBe(GOLDEN_DAY.hash);
    expect(walked.tick).toBe(GOLDEN_DAY.tick);
    expect(walked.onTheWay).toEqual(GOLDEN_DAY.onTheWay);
    expect(walked.atSeventeen).toEqual(GOLDEN_DAY.atSeventeen);
    expect(walked.banked).toBe(GOLDEN_DAY.banked);
    expect(walked.timeline).toEqual(GOLDEN_DAY.timeline);
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

  /**
   * The reload, played honestly.
   *
   * Nothing about the boss is saved - the schedule is a function of the day -
   * but what is ON SCREEN is, and it is what the arrival is decided on. The
   * reloaded session is handed the save and nothing else: no test puts the
   * windows back for it, because if a save does not carry them then reloading
   * mid-telegraph is a way out of the conversation.
   */
  it('walks into the same arrival after a mid-telegraph reload', () => {
    const day = startDay();
    day.driver.startShift();
    show(day, ['browser']);

    while (day.engine.now() < FIRST_VISIT.telegraphTick + 1) {
      day.driver.step(TICK_INTERVAL_MS);
    }

    expect(day.driver.boss().phase).toBe('telegraph');
    const saved = day.engine.serialize();
    const screens = day.appState.snapshot();

    const reloaded = startDay();
    reloaded.engine.restore(saved);
    expect(reloaded.appState.hydrate(screens)).toBe(true);
    reloaded.driver.resync();

    expect(reloaded.driver.boss()).toEqual(day.driver.boss());
    expect(reloaded.engine.now()).toBe(day.engine.now());
    // The Browser came back with the save, which is the whole point.
    expect(visibleSlack(reloaded.appState)).toEqual(['browser']);

    for (const world of [day, reloaded]) {
      while (world.engine.now() < FIRST_VISIT.arrivalTick + 1) {
        world.driver.step(TICK_INTERVAL_MS);
      }
    }

    expect(reloaded.caught).toEqual(day.caught);
    expect(reloaded.caught).toEqual([
      { appId: 'browser', tick: FIRST_VISIT.arrivalTick },
    ]);
    expect(meter(reloaded, FIELDS.caughtEvents))
      .toBe(meter(day, FIELDS.caughtEvents));
    expect(meter(reloaded, FIELDS.reputation)).toBe(STARTING_REPUTATION);
    // The file is world state, so it comes back out of a save with the rest
    // of the world rather than being rebuilt from a log nobody kept.
    expect(reloaded.driver.conductFile()).toBe(day.driver.conductFile());
    expect(meter(reloaded, FIELDS.suspicion)).toBe(meter(day, FIELDS.suspicion));
    expect(meter(reloaded, FIELDS.stress)).toBe(meter(day, FIELDS.stress));
    expect(reloaded.engine.snapshotHash()).toBe(day.engine.snapshotHash());
  });
});
