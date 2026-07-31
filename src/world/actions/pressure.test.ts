/**
 * The boss and the desk, driven through the shipped registry against the
 * shipped world.
 *
 * These verbs are dispatched by the day driver rather than by a button, which
 * is exactly why they need this: nobody is watching them happen, so the only
 * thing standing between "the lead caught you" and a quietly wrong meter is a
 * test that checks the numbers the world ends up holding. Refusals are asserted
 * to leave the world byte-identical, because a half-applied punishment is
 * worse than no punishment at all.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { DispatchResult, EngineApi, FieldValue } from '../../engine-api';
import {
  CAUGHT_REPUTATION_COST,
  CAUGHT_SUSPICION_FLOOR,
  EMPTIES_SUSPICION_BUMP,
  PING_STRESS,
} from '../boss';
import { COMPANY_IDS } from '../company';
import { DRINK_PRICE_PENCE, MAX_CANS, NO_RUN } from '../consumables';
import { FIELDS } from '../fields';
import { METER_CEILING, STARTING_REPUTATION } from '../meters';
import { createWorldSession } from '../session';
import { DAY_ACTIONS } from './ids';

let engine: EngineApi;

function dispatch(
  id: string,
  params: Record<string, FieldValue> = {},
): DispatchResult {
  return engine.dispatch(id, COMPANY_IDS.player, null, params);
}

function field(name: string): FieldValue | undefined {
  return engine.graph.getField(COMPANY_IDS.player, name);
}

/** Puts the shift on, because the desk verbs are shift verbs. */
function startShift(): void {
  expect(dispatch(DAY_ACTIONS.startShift)).toEqual({ ok: true });
}

function drink(tolerance = 1): DispatchResult {
  return dispatch(DAY_ACTIONS.consumableDrink, {
    tolerance,
    pence: DRINK_PRICE_PENCE,
  });
}

function expectRefusal(result: DispatchResult, fragment: string): void {
  expect(result.ok).toBe(false);

  if (!result.ok) {
    expect(result.reason).toContain(fragment);
  }
}

beforeEach(() => {
  engine = createWorldSession().engine;
});

describe('boss.caught', () => {
  it('resets suspicion to a floor and takes the price off reputation', () => {
    dispatch(DAY_ACTIONS.metersTick, {
      stress_up: 0,
      stress_down: 0,
      suspicion_up: 60,
      suspicion_down: 0,
      reputation_up: 0,
      reputation_down: 0,
      suspicion_events_up: 1,
      breaches_charged: 0,
      resolve_credit_paid: 0,
    });
    expect(field(FIELDS.suspicion)).toBe(60);

    expect(
      dispatch(DAY_ACTIONS.bossCaught, {
        reputation_cost: CAUGHT_REPUTATION_COST,
      }),
    ).toEqual({ ok: true });

    expect(field(FIELDS.suspicion)).toBe(CAUGHT_SUSPICION_FLOOR);
    expect(field(FIELDS.reputation))
      .toBe(STARTING_REPUTATION - CAUGHT_REPUTATION_COST);
    expect(field(FIELDS.caughtEvents)).toBe(1);
  });

  /**
   * The floor is a floor, not a discount. Being caught with a clean screen
   * history still leaves you as somebody who has just been spoken to.
   */
  it('raises suspicion to the floor when it was below it', () => {
    expect(field(FIELDS.suspicion)).toBe(0);
    dispatch(DAY_ACTIONS.bossCaught, { reputation_cost: 1 });
    expect(field(FIELDS.suspicion)).toBe(CAUGHT_SUSPICION_FLOOR);
  });

  it('counts every round he wins', () => {
    dispatch(DAY_ACTIONS.bossCaught, { reputation_cost: 1 });
    dispatch(DAY_ACTIONS.bossCaught, { reputation_cost: 1 });
    expect(field(FIELDS.caughtEvents)).toBe(2);
  });

  it('cannot take reputation below the floor', () => {
    for (let round = 0; round < 12; round += 1) {
      dispatch(DAY_ACTIONS.bossCaught, { reputation_cost: 10 });
    }

    expect(field(FIELDS.reputation)).toBe(0);
  });

  it('refuses a cost that is not a number of points', () => {
    const before = engine.snapshotHash();
    expectRefusal(
      dispatch(DAY_ACTIONS.bossCaught, { reputation_cost: -3 }),
      'whole number of points',
    );
    expect(engine.snapshotHash()).toBe(before);
  });
});

describe('boss.noticed_empties and boss.ping', () => {
  it('bumps suspicion for the desk and stress for the nag', () => {
    dispatch(DAY_ACTIONS.bossNoticedEmpties, {
      suspicion_up: EMPTIES_SUSPICION_BUMP,
    });
    dispatch(DAY_ACTIONS.bossPing, { stress_up: PING_STRESS });

    expect(field(FIELDS.suspicion)).toBe(EMPTIES_SUSPICION_BUMP);
    expect(field(FIELDS.stress)).toBe(PING_STRESS);
  });

  it('holds both inside the meter range', () => {
    for (let round = 0; round < 40; round += 1) {
      dispatch(DAY_ACTIONS.bossPing, { stress_up: 9 });
      dispatch(DAY_ACTIONS.bossNoticedEmpties, { suspicion_up: 9 });
    }

    expect(field(FIELDS.stress)).toBe(METER_CEILING);
    expect(field(FIELDS.suspicion)).toBe(METER_CEILING);
  });
});

describe('consumable.drink', () => {
  it('starts the run on the engine clock, not on a number it was handed', () => {
    startShift();
    engine.advance(37);

    expect(drink()).toEqual({ ok: true });
    expect(field(FIELDS.drinkStartedAt)).toBe(37);
    expect(field(FIELDS.drinkTolerance)).toBe(1);
    expect(field(FIELDS.drinkCrashCharged)).toBe(NO_RUN);
    expect(field(FIELDS.deskCans)).toBe(1);
    expect(field(FIELDS.consumableSpend)).toBe(DRINK_PRICE_PENCE);
  });

  it('adds up the empties and the money across a run', () => {
    startShift();
    drink(1);
    engine.advance(20);
    drink(2);

    expect(field(FIELDS.deskCans)).toBe(2);
    expect(field(FIELDS.consumableSpend)).toBe(DRINK_PRICE_PENCE * 2);
    expect(field(FIELDS.drinkTolerance)).toBe(2);
    expect(field(FIELDS.drinkStartedAt)).toBe(20);
  });

  it('refuses to be opened outside a shift, and says why', () => {
    const before = engine.snapshotHash();
    expectRefusal(drink(), 'not on shift');
    expect(engine.snapshotHash()).toBe(before);
  });

  it('refuses a can that belongs to no run and money that is not money', () => {
    startShift();
    const before = engine.snapshotHash();

    expectRefusal(
      dispatch(DAY_ACTIONS.consumableDrink, { tolerance: 0, pence: 100 }),
      'no zeroth can',
    );
    expectRefusal(
      dispatch(DAY_ACTIONS.consumableDrink, { tolerance: 1, pence: -100 }),
      'whole pence',
    );
    expect(engine.snapshotHash()).toBe(before);
  });

  /**
   * The shift-tail rule, asked of the WORLD rather than of the button.
   *
   * The desk overlay greys the can out in the last three quarters of an hour,
   * and until now that was the only thing stopping anybody: a second caller -
   * a terminal command, a dialogue effect, the next surface anybody wires up -
   * got a buff whose bill lands after 17:00, where the day ends before the
   * meters can settle it and clocking off wipes the run.
   */
  it('refuses a can that would wear off after everybody has gone home', () => {
    startShift();
    // 16:16, one minute past the last one a first can can be started at: it
    // runs 45 minutes and the shift has 44 left. The second of a run is a
    // shorter thing - 33 minutes - so that one is still legal here, which is
    // the difference the guard has to know about.
    engine.advance(496);
    const before = engine.snapshotHash();

    expectRefusal(drink(1), 'wear off somewhere on the way home');
    expect(engine.snapshotHash()).toBe(before);

    expect(drink(2)).toEqual({ ok: true });
    expect(field(FIELDS.drinkStartedAt)).toBe(496);

    // And by 16:49 there is no can in the machine short enough to fit: even
    // the fourth of a run, which is barely a buff, would run past five.
    engine.advance(33);
    expectRefusal(drink(2), 'wear off somewhere on the way home');
    expectRefusal(drink(4), 'wear off somewhere on the way home');
  });

  it('stops stacking empties somewhere short of a sculpture', () => {
    startShift();

    for (let can = 0; can < MAX_CANS + 5; can += 1) {
      drink(1);
    }

    expect(field(FIELDS.deskCans)).toBe(MAX_CANS);
  });
});

describe('consumable.crash', () => {
  it('bills the stress once, against the run that bought it', () => {
    startShift();
    engine.advance(10);
    drink();

    expect(
      dispatch(DAY_ACTIONS.consumableCrash, { stress_up: 6, charged_for: 10 }),
    ).toEqual({ ok: true });

    expect(field(FIELDS.stress)).toBe(6);
    expect(field(FIELDS.drinkCrashCharged)).toBe(10);
  });

  it('refuses a bill that is not a number of points or minutes', () => {
    startShift();
    const before = engine.snapshotHash();

    expectRefusal(
      dispatch(DAY_ACTIONS.consumableCrash, { stress_up: 1.5, charged_for: 0 }),
      'whole number of points',
    );
    expectRefusal(
      dispatch(DAY_ACTIONS.consumableCrash, { stress_up: 1, charged_for: -1 }),
      'minute the can was opened',
    );
    expect(engine.snapshotHash()).toBe(before);
  });
});

describe('desk.tidy', () => {
  it('clears the evidence and refuses to tidy an empty desk', () => {
    startShift();
    drink();
    expect(field(FIELDS.deskCans)).toBe(1);

    expect(dispatch(DAY_ACTIONS.deskTidy)).toEqual({ ok: true });
    expect(field(FIELDS.deskCans)).toBe(0);

    const before = engine.snapshotHash();
    expectRefusal(dispatch(DAY_ACTIONS.deskTidy), 'already clear');
    expect(engine.snapshotHash()).toBe(before);
  });
});

/**
 * The night. Stress is carried into tomorrow on purpose - a shift you survived
 * is a shift you are still carrying - but everything that was true about ONE
 * day has to be false again by morning, or the scorecard stops meaning
 * anything by Wednesday.
 */
describe('clocking off', () => {
  it('clears the desk, the money and the day counts, and keeps the meters', () => {
    startShift();
    drink();
    dispatch(DAY_ACTIONS.bossPing, { stress_up: PING_STRESS });
    dispatch(DAY_ACTIONS.bossCaught, { reputation_cost: CAUGHT_REPUTATION_COST });
    dispatch(DAY_ACTIONS.endShift);

    expect(dispatch(DAY_ACTIONS.clockOff, { banked: 4_200 })).toEqual({ ok: true });

    expect(field(FIELDS.farmFund)).toBe(4_200);
    expect(field(FIELDS.dayState)).toBe('morning_brief');
    expect(field(FIELDS.caughtEvents)).toBe(0);
    expect(field(FIELDS.suspicionEvents)).toBe(0);
    expect(field(FIELDS.deskCans)).toBe(0);
    expect(field(FIELDS.consumableSpend)).toBe(0);
    expect(field(FIELDS.drinkStartedAt)).toBe(NO_RUN);
    expect(field(FIELDS.drinkTolerance)).toBe(0);
    expect(field(FIELDS.drinkCrashCharged)).toBe(NO_RUN);

    // What the day did to you comes home with you.
    expect(field(FIELDS.stress)).toBe(PING_STRESS);
    expect(field(FIELDS.suspicion)).toBe(CAUGHT_SUSPICION_FLOOR);
    expect(field(FIELDS.reputation))
      .toBe(STARTING_REPUTATION - CAUGHT_REPUTATION_COST);
  });
});
