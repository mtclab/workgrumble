import { beforeAll, describe, expect, it, vi } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import {
  DAY_RATE_PENCE,
  dayLedger,
  daySlip,
  shiftEndTick,
  shiftStartTick,
} from '../world/day';
import { FIELDS } from '../world/fields';
import { createWorldSession, WORLD_SEED } from '../world/session';
import {
  DayDriver,
  TICK_INTERVAL_MS,
  ticksFromElapsed,
} from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Harness {
  readonly driver: DayDriver;
  readonly engine: ReturnType<typeof createWorldSession>['engine'];
  readonly boundaries: () => number;
  readonly notices: () => readonly string[];
  /** What the shell would say is on screen. The tests move it about. */
  readonly slack: { open: readonly string[] };
}

function harness(): Harness {
  const { engine } = createWorldSession();
  const onDayBoundary = vi.fn();
  const notices: string[] = [];
  const slack: { open: readonly string[] } = { open: [] };
  const driver = new DayDriver(engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary,
    openSlackApps: () => slack.open,
    onNotice: (title) => {
      notices.push(title);
    },
  });

  return {
    driver,
    engine,
    boundaries: () => onDayBoundary.mock.calls.length,
    notices: () => notices,
    slack,
  };
}

/** Real milliseconds that buy `ticks` simulated minutes at normal speed. */
function realMs(ticks: number): number {
  return ticks * TICK_INTERVAL_MS;
}

describe('turning real time into ticks', () => {
  it('keeps the remainder instead of losing it four times a second', () => {
    expect(ticksFromElapsed(250, 1, 0)).toEqual({ ticks: 0, carriedMs: 250 });
    expect(ticksFromElapsed(250, 1, 750)).toEqual({ ticks: 1, carriedMs: 0 });

    // A quarter-second at x4 is a whole minute; at x2 it is half of one.
    expect(ticksFromElapsed(250, 4, 0)).toEqual({ ticks: 1, carriedMs: 0 });
    expect(ticksFromElapsed(250, 2, 0)).toEqual({ ticks: 0, carriedMs: 500 });

    // Four quarter-seconds at x2 are two minutes, not one and a bit lost.
    let carriedMs = 0;
    let ticks = 0;

    for (let step = 0; step < 4; step += 1) {
      const converted = ticksFromElapsed(250, 2, carriedMs);
      ticks += converted.ticks;
      carriedMs = converted.carriedMs;
    }

    expect(ticks).toBe(2);
    expect(carriedMs).toBe(0);
  });

  it('refuses time and speeds that are not either', () => {
    expect(() => ticksFromElapsed(-1, 1, 0)).toThrow(TypeError);
    expect(() => ticksFromElapsed(Number.NaN, 1, 0)).toThrow(TypeError);
    expect(() => ticksFromElapsed(250, 3, 0)).toThrow(TypeError);
    expect(() => ticksFromElapsed(250, 1, -5)).toThrow(TypeError);
  });
});

describe('the day driver', () => {
  it('runs the morning, and the player skips the rest of it', () => {
    const { driver, engine } = harness();

    expect(driver.day()).toBe(1);
    expect(driver.state()).toBe('morning_brief');
    expect(engine.now()).toBe(0);

    // The morning hour is real time: the player is at the desk, reading.
    driver.step(realMs(5));
    expect(engine.now()).toBe(5);
    expect(driver.state()).toBe('morning_brief');

    driver.startShift();
    expect(driver.state()).toBe('shift');
    expect(engine.now()).toBe(shiftStartTick(1));

    // And it cannot be started twice, from the button or from the clock.
    driver.startShift();
    expect(engine.now()).toBe(shiftStartTick(1));
  });

  it('starts the shift on its own at 09:00 for a player who dawdles', () => {
    const { driver, engine } = harness();

    driver.step(realMs(59));
    expect(driver.state()).toBe('morning_brief');

    driver.step(realMs(1));
    expect(engine.now()).toBe(shiftStartTick(1));
    expect(driver.state()).toBe('shift');
  });

  /**
   * 17:00 is a wall, not a milestone. A day end that kept converting would
   * scroll the player's own results past them, so the clock stops there and
   * only clocking off moves it.
   */
  it('stops the clock dead at the day end', () => {
    const { driver, engine } = harness();
    driver.startShift();

    driver.step(realMs(shiftEndTick(1)));
    expect(driver.state()).toBe('day_end');
    expect(engine.now()).toBe(shiftEndTick(1));

    driver.step(realMs(120));
    expect(engine.now()).toBe(shiftEndTick(1));
    expect(driver.state()).toBe('day_end');
  });

  it('pauses and changes speed without the engine clock knowing', () => {
    const { driver, engine } = harness();
    driver.startShift();
    const start = engine.now();

    driver.setPaused(true);
    driver.step(realMs(30));
    expect(engine.now()).toBe(start);

    driver.setPaused(false);
    driver.step(realMs(10));
    expect(engine.now()).toBe(start + 10);

    driver.setSpeed(4);
    driver.step(realMs(10));
    expect(engine.now()).toBe(start + 50);

    driver.setSpeed(2);
    driver.step(realMs(10));
    expect(engine.now()).toBe(start + 70);
  });

  /** A pause must not bank real time and hand it over as a jump on resume. */
  it('drops the part-converted time it was holding when it pauses', () => {
    const { driver, engine } = harness();
    driver.startShift();
    const start = engine.now();

    driver.step(750);
    driver.setPaused(true);
    driver.setPaused(false);
    driver.step(250);

    expect(engine.now()).toBe(start);
    driver.step(750);
    expect(engine.now()).toBe(start + 1);
  });

  /**
   * The day boundary: the day is paid, the money is banked in the graph, the
   * night passes, and the dispatch log starts again from a checkpoint.
   */
  it('pays the day, sleeps through the night and drains the log', () => {
    const { driver, engine, boundaries } = harness();
    driver.startShift();
    driver.step(realMs(shiftEndTick(1)));
    expect(driver.state()).toBe('day_end');

    const slip = daySlip(dayLedger(engine.graph.nodesOfKind('ticket'), 1));
    expect(engine.dispatchLog().length).toBeGreaterThan(0);
    expect(engine.logCheckpoint().hash).toBeNull();

    driver.clockOff();

    expect(engine.graph.getField(COMPANY_IDS.player, FIELDS.farmFund))
      .toBe(slip.net);
    expect(driver.day()).toBe(2);
    expect(driver.state()).toBe('morning_brief');
    expect(engine.now()).toBe(1_440);
    expect(boundaries()).toBe(1);

    // The log now starts from this morning, and the baseline is this world.
    expect(engine.dispatchLog()).toEqual([]);
    expect(engine.logCheckpoint()).toEqual({
      tick: 1_440,
      hash: engine.snapshotHash(),
      entries: 0,
    });

    // A second day banks on top of the first rather than replacing it.
    driver.startShift();
    driver.step(realMs(shiftEndTick(2)));
    driver.clockOff();
    expect(engine.graph.getField(COMPANY_IDS.player, FIELDS.farmFund))
      .toBeGreaterThanOrEqual(slip.net + DAY_RATE_PENCE - 500);
    expect(boundaries()).toBe(2);
  });

  it('ignores a clock-off that is not at the end of a day', () => {
    const { driver, engine, boundaries } = harness();
    driver.clockOff();

    expect(driver.day()).toBe(1);
    expect(driver.state()).toBe('morning_brief');
    expect(engine.now()).toBe(0);
    expect(boundaries()).toBe(0);
  });

  it('tells whoever is watching when the day moves', () => {
    const { driver } = harness();
    const listener = vi.fn();
    const unsubscribe = driver.onChanged(listener);

    driver.setSpeed(2);
    driver.setSpeed(2);
    expect(listener).toHaveBeenCalledTimes(1);

    driver.setPaused(true);
    driver.setPaused(false);
    expect(listener).toHaveBeenCalledTimes(3);

    driver.startShift();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    driver.setSpeed(4);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  /**
   * The schedule belongs to the day the world is on. After a load the driver
   * may be standing in a different day entirely, and walking yesterday's
   * schedule would drop today's arrivals on the wrong minute.
   */
  it('picks the day back up from the world after a load', () => {
    const { driver, engine } = harness();
    driver.startShift();
    driver.step(realMs(shiftEndTick(1)));
    driver.clockOff();
    const saved = engine.serialize();

    const fresh = harness();
    expect(fresh.driver.schedule().day).toBe(1);

    fresh.engine.restore(saved);
    fresh.driver.resync();

    expect(fresh.driver.day()).toBe(2);
    expect(fresh.driver.schedule().day).toBe(2);
    expect(fresh.driver.state()).toBe('morning_brief');
    expect(fresh.driver.paused()).toBe(false);
  });
});
