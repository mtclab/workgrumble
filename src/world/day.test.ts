import { describe, expect, it } from 'vitest';

import type { ReadOnlyGraphNode } from '../engine-api';
import { HELPDESK_ACTIONS } from './actions';
import { DAY_ACTIONS } from './actions/ids';
import { COMPANY_IDS } from './company';
import {
  arrivalsBetween,
  buildDaySchedule,
  clockRuns,
  DAY_RATE_PENCE,
  dayForTick,
  dayLedger,
  dayOpensTick,
  daySlip,
  dueTransition,
  farmProgress,
  FARM_PRICE_PENCE,
  formatPence,
  isDayState,
  isLunchtime,
  lunchWindow,
  type ScheduledTicket,
  shiftEndTick,
  shiftStartTick,
} from './day';
import { FIELDS } from './fields';
import { createWorldSession, WORLD_SEED } from './session';
import { ticketArrivalPool } from './tickets';

/** 08:00 is tick 0; the shift is 09:00-17:00; day two opens 24 hours on. */
const SHIFT_START = 60;
const SHIFT_END = 540;
const DAY_TWO_OPENS = 1_440;

function ticket(
  id: string,
  fields: Readonly<Record<string, string | number | boolean>>,
): ReadOnlyGraphNode {
  return { id, kind: 'ticket', fields };
}

describe('the day clock', () => {
  it('places the shift, the lunch window and the day boundary', () => {
    expect(dayForTick(0)).toBe(1);
    expect(dayForTick(SHIFT_END)).toBe(1);
    expect(dayForTick(DAY_TWO_OPENS)).toBe(2);
    expect(dayOpensTick(1)).toBe(0);
    expect(dayOpensTick(2)).toBe(DAY_TWO_OPENS);

    expect(shiftStartTick(1)).toBe(SHIFT_START);
    expect(shiftEndTick(1)).toBe(SHIFT_END);
    expect(shiftStartTick(2)).toBe(DAY_TWO_OPENS + SHIFT_START);
    expect(shiftEndTick(2)).toBe(DAY_TWO_OPENS + SHIFT_END);

    // 12:00 to 12:30, and not a minute either side of it.
    expect(lunchWindow(1)).toEqual({ from: 240, to: 270 });
    expect(isLunchtime(239)).toBe(false);
    expect(isLunchtime(240)).toBe(true);
    expect(isLunchtime(269)).toBe(true);
    expect(isLunchtime(270)).toBe(false);
    // And it comes round again the next day, on the same face.
    expect(isLunchtime(DAY_TWO_OPENS + 245)).toBe(true);
  });

  it('refuses ticks and days that are not on the calendar', () => {
    expect(() => dayForTick(-1)).toThrow(TypeError);
    expect(() => dayForTick(1.5)).toThrow(TypeError);
    expect(() => dayOpensTick(0)).toThrow(TypeError);
    expect(isDayState('shift')).toBe(true);
    expect(isDayState('lunch')).toBe(false);
  });
});

/**
 * The state machine is what the driver asks before it moves anything, so its
 * answers ARE the day: a missed transition is a shift that never starts or a
 * scorecard that never appears.
 */
describe('the day state machine', () => {
  it('starts the shift at 09:00 and ends it at 17:00, and nowhere else', () => {
    expect(dueTransition('morning_brief', 0)).toBeNull();
    expect(dueTransition('morning_brief', SHIFT_START - 1)).toBeNull();
    expect(dueTransition('morning_brief', SHIFT_START)).toBe('shift');

    expect(dueTransition('shift', SHIFT_START)).toBeNull();
    expect(dueTransition('shift', SHIFT_END - 1)).toBeNull();
    expect(dueTransition('shift', SHIFT_END)).toBe('day_end');

    // The same day, a day later.
    expect(dueTransition('morning_brief', DAY_TWO_OPENS + SHIFT_START))
      .toBe('shift');
    expect(dueTransition('shift', DAY_TWO_OPENS + SHIFT_END)).toBe('day_end');
  });

  /**
   * The scorecard is the one screen the clock waits for. A day end that keeps
   * ticking scrolls the player's own results past them and starts eating the
   * evening; nothing but clocking off leaves that state.
   */
  it('stops the clock at the day end and leaves it to the player', () => {
    expect(clockRuns('morning_brief')).toBe(true);
    expect(clockRuns('shift')).toBe(true);
    expect(clockRuns('day_end')).toBe(false);

    expect(dueTransition('day_end', SHIFT_END)).toBeNull();
    expect(dueTransition('day_end', SHIFT_END + 600)).toBeNull();
    expect(dueTransition('day_end', DAY_TWO_OPENS + SHIFT_START)).toBeNull();
  });

  /**
   * The state is in the graph, which is the only reason a save can restore a
   * day mid-way. It moves through the action registry like everything else,
   * refusals included - so a replay of the log walks the same day.
   */
  it('lives in the graph and moves only through the day verbs', () => {
    const { engine } = createWorldSession();
    const player = COMPANY_IDS.player;
    const dayState = (): unknown => engine.graph.getField(
      player,
      FIELDS.dayState,
    );

    expect(dayState()).toBe('morning_brief');

    // Ending a shift that has not started is refused, in words.
    const early = engine.dispatch(DAY_ACTIONS.endShift, player, null, {});
    expect(early.ok).toBe(false);
    expect(early.ok === false && early.reason).toContain('not one');
    expect(dayState()).toBe('morning_brief');

    expect(engine.dispatch(DAY_ACTIONS.startShift, player, null, {}))
      .toEqual({ ok: true });
    expect(dayState()).toBe('shift');

    // And not twice.
    const again = engine.dispatch(DAY_ACTIONS.startShift, player, null, {});
    expect(again.ok).toBe(false);

    expect(engine.dispatch(DAY_ACTIONS.endShift, player, null, {}))
      .toEqual({ ok: true });
    expect(dayState()).toBe('day_end');

    expect(
      engine.dispatch(DAY_ACTIONS.clockOff, player, null, { banked: 7_240 }),
    ).toEqual({ ok: true });
    expect(dayState()).toBe('morning_brief');
    expect(engine.graph.getField(player, FIELDS.farmFund)).toBe(7_240);
  });

  /**
   * The banked total is hashed, saved and replayed. A total that arrives as
   * text - or as half a penny - would become the world's opinion of the money
   * and survive every load after it.
   */
  it('refuses a farm fund that is not a whole number of pence', () => {
    const { engine } = createWorldSession();
    const player = COMPANY_IDS.player;
    engine.dispatch(DAY_ACTIONS.startShift, player, null, {});
    engine.dispatch(DAY_ACTIONS.endShift, player, null, {});

    for (const banked of ['7240', 72.4, -1, true, null]) {
      const result = engine.dispatch(
        DAY_ACTIONS.clockOff,
        player,
        null,
        { banked },
      );
      expect(result.ok, `banked ${String(banked)} was accepted`).toBe(false);
    }

    expect(engine.dispatch(DAY_ACTIONS.clockOff, player, null, {}).ok)
      .toBe(false);
    expect(engine.graph.getField(player, FIELDS.farmFund)).toBe(0);
    expect(engine.graph.getField(player, FIELDS.dayState)).toBe('day_end');
  });
});

describe('the ticket drip', () => {
  const pool: readonly ScheduledTicket[] = [
    { id: 'ticket:one', arrival: 'morning' },
    { id: 'ticket:two', arrival: 'morning' },
    { id: 'ticket:three', arrival: 'drip' },
    { id: 'ticket:four', arrival: 'drip' },
    { id: 'ticket:five', arrival: 'drip' },
  ];

  it('opens with the inherited pile and spreads the rest across the shift', () => {
    const schedule = buildDaySchedule(1, WORLD_SEED, pool);

    expect(schedule.day).toBe(1);
    expect(schedule.shift).toEqual({ from: SHIFT_START, to: SHIFT_END });
    expect(schedule.lunch).toEqual({ from: 240, to: 270 });
    expect(schedule.arrivals).toHaveLength(5);

    const morning = schedule.arrivals.filter(
      (arrival) => arrival.tick === schedule.opensTick,
    );
    expect(morning.map((arrival) => arrival.ticketId))
      .toEqual(['ticket:one', 'ticket:two']);

    const dripped = schedule.arrivals.filter(
      (arrival) => arrival.tick > schedule.opensTick,
    );
    expect(dripped).toHaveLength(3);

    for (const arrival of dripped) {
      // Never in the first half hour, never in the last ninety minutes: a
      // ticket nobody has time to start is a punishment, not a shift.
      expect(arrival.tick).toBeGreaterThanOrEqual(SHIFT_START + 30);
      expect(arrival.tick).toBeLessThanOrEqual(SHIFT_END - 90);
    }

    // Earliest first, so the driver can walk it with the clock.
    const ticks = schedule.arrivals.map((arrival) => arrival.tick);
    expect([...ticks].sort((left, right) => left - right)).toEqual(ticks);
  });

  it('deals the same day twice and different days differently', () => {
    const first = buildDaySchedule(1, WORLD_SEED, pool);
    expect(buildDaySchedule(1, WORLD_SEED, pool)).toEqual(first);

    const second = buildDaySchedule(2, WORLD_SEED, pool);
    const offsets = (day: number, ticks: readonly number[]): number[] => ticks
      .map((tick) => tick - dayOpensTick(day));

    expect(
      offsets(2, second.arrivals.map((arrival) => arrival.tick)),
    ).not.toEqual(offsets(1, first.arrivals.map((arrival) => arrival.tick)));

    // A different world is a different day too.
    expect(buildDaySchedule(1, WORLD_SEED + 1, pool)).not.toEqual(first);
  });

  it('hands the driver exactly the arrivals one clock step passed', () => {
    const schedule = buildDaySchedule(1, WORLD_SEED, pool);
    const dripped = schedule.arrivals.filter(
      (arrival) => arrival.tick > schedule.opensTick,
    );
    const first = dripped[0];

    if (first === undefined) {
      throw new Error('The fixture pool has to drip something.');
    }

    // The tick it lands on is the tick it is handed over on - once.
    expect(arrivalsBetween(schedule, first.tick - 1, first.tick))
      .toEqual([first]);
    expect(arrivalsBetween(schedule, first.tick, first.tick)).toEqual([]);
    // A jump forwards catches everything it jumped over.
    expect(arrivalsBetween(schedule, schedule.opensTick, SHIFT_END))
      .toEqual(dripped);
    expect(arrivalsBetween(schedule, -1, schedule.opensTick))
      .toHaveLength(2);
  });

  it('schedules the shipped queue as the morning it is', () => {
    const schedule = buildDaySchedule(1, WORLD_SEED, ticketArrivalPool());
    const { engine } = createWorldSession();

    // Everything the schedule says is already here IS already here, and
    // nothing else has been spawned behind the schedule's back.
    const spawned = engine.graph.nodesOfKind('ticket').map((node) => node.id);
    expect([...spawned].sort()).toEqual(
      schedule.arrivals
        .filter((arrival) => arrival.tick <= 0)
        .map((arrival) => arrival.ticketId)
        .sort(),
    );
  });
});

describe('the day scorecard', () => {
  const tickets: readonly ReadOnlyGraphNode[] = [
    ticket('ticket:closed', { spawned_at: 5, state: 'resolved', breached: false }),
    ticket('ticket:late', { spawned_at: 30, state: 'resolved', breached: true }),
    ticket('ticket:missed', { spawned_at: 60, state: 'breached', breached: true }),
    ticket('ticket:open', { spawned_at: 61, state: 'open', breached: false }),
    ticket('ticket:parked', {
      spawned_at: 62,
      state: 'waiting_on_user',
      breached: false,
    }),
    ticket('ticket:tomorrow', {
      spawned_at: DAY_TWO_OPENS + 10,
      state: 'open',
      breached: false,
    }),
  ];

  /**
   * Scoped by the day a ticket ARRIVED in. Counting every ticket in the graph
   * would have Wednesday taking credit for Tuesday's work - and the scorecard
   * is the one screen the player is asked to believe.
   */
  it('counts only the tickets the day itself brought in', () => {
    // Still open counts everything that has not been FIXED - the open one, the
    // parked one and the one whose deadline ran out. A ticket does not stop
    // being somebody's problem by going red, and a day with breaches on it
    // that reports nothing still open is a day telling a story about itself.
    expect(dayLedger(tickets, 1)).toEqual({
      arrived: 5,
      closed: 2,
      breached: 2,
      stillOpen: 3,
    });
    expect(dayLedger(tickets, 2)).toEqual({
      arrived: 1,
      closed: 0,
      breached: 0,
      stillOpen: 1,
    });
    expect(dayLedger([], 1)).toEqual({
      arrived: 0,
      closed: 0,
      breached: 0,
      stillOpen: 0,
    });
  });

  /**
   * A breach that gets closed late is still a breach - the queue app already
   * refuses to forget it, and the payslip must not either.
   */
  it('pays for what closed and charges for what was missed', () => {
    const clean = daySlip({
      arrived: 3,
      closed: 3,
      breached: 0,
      stillOpen: 0,
    });
    expect(clean.gross).toBe(DAY_RATE_PENCE + 3 * 250);
    expect(clean.deducted).toBe(150 + 220 + 75);
    expect(clean.net).toBe(clean.gross - clean.deducted);
    expect(clean.lines.some((line) => line.label.includes('Service credit')))
      .toBe(false);

    const rough = daySlip({ arrived: 3, closed: 1, breached: 2, stillOpen: 0 });
    expect(rough.deducted).toBe(150 + 220 + 75 + 2 * 400);
    expect(rough.net).toBe(rough.gross - rough.deducted);
    expect(rough.net).toBeLessThan(clean.net);
    expect(rough.lines.some((line) => line.label.includes('2 missed')))
      .toBe(true);
  });

  /**
   * The vending machine is on the payslip because a mechanic the scorecard
   * does not price is a mechanic with no downside except the invisible one.
   */
  it('takes the vending machine off the day it was spent on', () => {
    const dry = daySlip({ arrived: 2, closed: 2, breached: 0, stillOpen: 0 });
    const wired = daySlip(
      { arrived: 2, closed: 2, breached: 0, stillOpen: 0 },
      360,
    );

    expect(wired.gross).toBe(dry.gross);
    expect(wired.deducted).toBe(dry.deducted + 360);
    expect(wired.net).toBe(dry.net - 360);
    expect(wired.lines.some((line) => line.label.includes('Vending machine')))
      .toBe(true);
    // A day nobody spent anything on does not get a line saying so.
    expect(dry.lines.some((line) => line.label.includes('Vending machine')))
      .toBe(false);
    expect(
      () => daySlip({ arrived: 1, closed: 0, breached: 0, stillOpen: 1 }, -5),
    ).toThrow(TypeError);
  });

  /** A day cannot end owing the company money. It is a gag, not a bailiff. */
  it('never pays out less than nothing', () => {
    const disaster = daySlip({
      arrived: 40,
      closed: 0,
      breached: 40,
      stillOpen: 0,
    });
    expect(disaster.deducted).toBeGreaterThan(disaster.gross);
    expect(disaster.net).toBe(0);
  });

  it('counts money in whole pence and shows it in pounds', () => {
    expect(formatPence(9_600)).toBe('96.00');
    expect(formatPence(7)).toBe('0.07');
    expect(formatPence(0)).toBe('0.00');
    expect(formatPence(-250)).toBe('-2.50');
    expect(() => formatPence(12.5)).toThrow(TypeError);

    expect(farmProgress(0)).toBe(0);
    expect(farmProgress(FARM_PRICE_PENCE)).toBe(1);
    expect(farmProgress(FARM_PRICE_PENCE * 4)).toBe(1);
    expect(farmProgress(FARM_PRICE_PENCE / 4)).toBeCloseTo(0.25, 10);
    // The joke needs the number to be absurd: a clean day is a rounding error.
    expect(farmProgress(daySlip({
      arrived: 4,
      closed: 4,
      breached: 0,
      stillOpen: 0,
    }).net)).toBeLessThan(0.001);
  });
});

/**
 * The scorecard reads the world the player worked, not a tally the shell kept
 * on the side - so closing a ticket has to move it.
 */
describe('a worked day', () => {
  it('shows up on the ledger the scorecard is built from', () => {
    const session = createWorldSession();
    const before = dayLedger(session.engine.graph.nodesOfKind('ticket'), 1);
    expect(before.closed).toBe(0);
    expect(before.arrived).toBe(4);

    expect(
      session.engine.dispatch(
        HELPDESK_ACTIONS.ticketEscalate,
        COMPANY_IDS.player,
        'ticket:fan-noise',
        {
          reported: 'It makes a noise like a bag of spanners.',
          tried: 'Turned it off and on again',
        },
      ),
    ).toEqual({ ok: true });

    const after = dayLedger(session.engine.graph.nodesOfKind('ticket'), 1);
    expect(after.closed).toBe(1);
    expect(after.stillOpen).toBe(3);
    expect(daySlip(after).net).toBeGreaterThan(daySlip(before).net);
  });
});
