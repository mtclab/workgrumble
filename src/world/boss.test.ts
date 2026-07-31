/**
 * The rounds, minute by minute.
 *
 * A patrol schedule is only worth anything if it is three things at once:
 * repeatable (the same seed and day put him in the same place), fair (the
 * reaction window is always the full window, never a shorter one because the
 * jitter stacked two rounds), and honest about lunch (the safe half hour is the
 * tutorial, and a boss who turns up at ten past twelve makes it a lie). All
 * three are asserted across a spread of seeds and days rather than on the one
 * the game ships with, because a bad seed is a bug that only shows up in play.
 */

import { describe, expect, it } from 'vitest';

import {
  BOSS_TRAP_TICKET,
  buildPatrolSchedule,
  caughtBy,
  EMPTIES_TOLERATED,
  emptiesNoticed,
  PATROLS_PER_DAY,
  patrolPhase,
  patrolsClearOfLunch,
  PINGS_PER_DAY,
  pingsBetween,
  PRESENCE_TICKS,
  TELEGRAPH_TICKS,
  ticksToArrival,
  visitAt,
  visitsArrivingBetween,
  visitsTelegraphingBetween,
} from './boss';
import { isLunchtime, shiftWindow } from './day';
import { WORLD_SEED } from './session';

const SEEDS = [WORLD_SEED, 1, 7, 0x5eed_1234, 999_331];
const DAYS = [1, 2, 3, 4, 5];

function everySchedule(): readonly ReturnType<typeof buildPatrolSchedule>[] {
  return SEEDS.flatMap(
    (seed) => DAYS.map((day) => buildPatrolSchedule(day, seed)),
  );
}

describe('the patrol schedule', () => {
  it('is a function of the seed and the day, and nothing else', () => {
    for (const day of DAYS) {
      expect(buildPatrolSchedule(day, WORLD_SEED))
        .toEqual(buildPatrolSchedule(day, WORLD_SEED));
    }

    // Different days are different rounds; that is the point of the jitter.
    const first = buildPatrolSchedule(1, WORLD_SEED).visits.map(
      (visit) => visit.arrivalTick,
    );
    const second = buildPatrolSchedule(2, WORLD_SEED).visits.map(
      (visit) => visit.arrivalTick - shiftWindow(2).from,
    );
    const firstOffsets = first.map((tick) => tick - shiftWindow(1).from);

    expect(firstOffsets).not.toEqual(second);
  });

  it('refuses a day that is not a day', () => {
    expect(() => buildPatrolSchedule(0, WORLD_SEED)).toThrow(TypeError);
    expect(() => buildPatrolSchedule(1.5, WORLD_SEED)).toThrow(TypeError);
  });

  it('walks the floor a few times a shift and never outside it', () => {
    for (const schedule of everySchedule()) {
      expect(schedule.visits.length).toBeGreaterThan(0);
      expect(schedule.visits.length).toBeLessThanOrEqual(PATROLS_PER_DAY);

      for (const visit of schedule.visits) {
        expect(visit.telegraphTick).toBeGreaterThan(schedule.shift.from);
        expect(visit.departureTick).toBeLessThan(schedule.shift.to);
      }
    }
  });

  /**
   * The reaction window IS the mechanic. A round that telegraphed for two
   * minutes because it had been shoved forward would be a round the player
   * could not have played around, and it would look exactly like bad luck.
   */
  it('always gives the whole reaction window', () => {
    for (const schedule of everySchedule()) {
      for (const visit of schedule.visits) {
        expect(visit.arrivalTick - visit.telegraphTick).toBe(TELEGRAPH_TICKS);
        expect(visit.departureTick - visit.arrivalTick).toBe(PRESENCE_TICKS);
      }
    }
  });

  it('never lets two rounds run into each other', () => {
    for (const schedule of everySchedule()) {
      schedule.visits.forEach((visit, index) => {
        const previous = schedule.visits[index - 1];

        if (previous !== undefined) {
          expect(visit.telegraphTick).toBeGreaterThan(previous.departureTick);
        }

        expect(visit.index).toBe(index);
      });
    }
  });

  /** Lunch is the safe window the whole mechanic is taught in. */
  it('leaves the lunch half hour alone, on every seed and every day', () => {
    for (const schedule of everySchedule()) {
      expect(patrolsClearOfLunch(schedule)).toBe(true);

      for (const visit of schedule.visits) {
        for (
          let tick = visit.telegraphTick;
          tick <= visit.departureTick;
          tick += 1
        ) {
          expect(isLunchtime(tick), `tick ${String(tick)}`).toBe(false);
        }
      }
    }
  });
});

describe('reading the schedule', () => {
  const schedule = buildPatrolSchedule(1, WORLD_SEED);
  const visit = schedule.visits[0];

  if (visit === undefined) {
    throw new Error('The shipped seed must put the lead on the floor.');
  }

  it('names the three phases of a round', () => {
    expect(patrolPhase(schedule, visit.telegraphTick - 1)).toBe('clear');
    expect(patrolPhase(schedule, visit.telegraphTick)).toBe('telegraph');
    expect(patrolPhase(schedule, visit.arrivalTick - 1)).toBe('telegraph');
    expect(patrolPhase(schedule, visit.arrivalTick)).toBe('present');
    expect(patrolPhase(schedule, visit.departureTick - 1)).toBe('present');
    expect(patrolPhase(schedule, visit.departureTick)).toBe('clear');
  });

  it('says how long is left to do something about it', () => {
    expect(ticksToArrival(schedule, visit.telegraphTick))
      .toBe(TELEGRAPH_TICKS);
    expect(ticksToArrival(schedule, visit.arrivalTick - 1)).toBe(1);
    expect(ticksToArrival(schedule, visit.arrivalTick)).toBeNull();
    expect(ticksToArrival(schedule, visit.telegraphTick - 1)).toBeNull();
    expect(visitAt(schedule, visit.telegraphTick - 1)).toBeNull();
  });

  /**
   * Half-open, like every other window in the day: a clock step that lands
   * exactly on the arrival must decide the round exactly once, and a step that
   * covers several minutes must not lose one.
   */
  it('hands a clock step the rounds it just walked past', () => {
    expect(
      visitsArrivingBetween(schedule, visit.arrivalTick - 1, visit.arrivalTick),
    ).toEqual([visit]);
    expect(
      visitsArrivingBetween(schedule, visit.arrivalTick, visit.arrivalTick + 5),
    ).toEqual([]);
    expect(visitsArrivingBetween(schedule, 0, schedule.shift.to))
      .toEqual([...schedule.visits]);
    expect(
      visitsTelegraphingBetween(
        schedule,
        visit.telegraphTick - 1,
        visit.telegraphTick,
      ),
    ).toEqual([visit]);
  });
});

describe('the pings', () => {
  it('nags twice a shift, in order, clear of lunch', () => {
    for (const schedule of everySchedule()) {
      expect(schedule.pings.length).toBe(PINGS_PER_DAY);

      schedule.pings.forEach((ping, index) => {
        expect(ping.index).toBe(index);
        expect(ping.line.length).toBeGreaterThan(0);
        expect(isLunchtime(ping.tick)).toBe(false);
        expect(ping.tick).toBeGreaterThan(schedule.shift.from);
        expect(ping.tick).toBeLessThan(schedule.shift.to);
      });
    }
  });

  /** One trap ticket a day, raised by the man who does not raise tickets. */
  it('drops the trap ticket on the first ping and never again', () => {
    for (const schedule of everySchedule()) {
      const carrying = schedule.pings.filter((ping) => ping.ticketId !== null);

      expect(carrying.map((ping) => ping.ticketId)).toEqual([BOSS_TRAP_TICKET]);
      expect(carrying[0]?.index).toBe(0);
    }
  });

  it('hands a clock step the pings it just walked past', () => {
    const schedule = buildPatrolSchedule(1, WORLD_SEED);
    const first = schedule.pings[0];

    if (first === undefined) {
      throw new Error('The shipped seed must include a ping.');
    }

    expect(pingsBetween(schedule, first.tick - 1, first.tick)).toEqual([first]);
    expect(pingsBetween(schedule, first.tick, first.tick + 1)).toEqual([]);
  });
});

describe('what he finds when he gets there', () => {
  it('is caught by the first slack window that is genuinely on screen', () => {
    expect(caughtBy(['bubbles', 'browser'])).toBe('bubbles');
    expect(caughtBy(['browser'])).toBe('browser');
    expect(caughtBy([])).toBeNull();
  });

  it('counts the empties only once there are too many of them', () => {
    expect(emptiesNoticed(EMPTIES_TOLERATED)).toBe(false);
    expect(emptiesNoticed(EMPTIES_TOLERATED + 1)).toBe(true);
    expect(emptiesNoticed(0)).toBe(false);
    expect(emptiesNoticed(Number.NaN)).toBe(false);
  });
});
