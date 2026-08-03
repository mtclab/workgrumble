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
  CAUGHT_SUSPICION_FLOOR,
  EMPTIES_SUSPICION_BUMP,
  PING_STRESS,
} from '../boss';
import { COMPANY_IDS } from '../company';
import { conductEntries, conductLine } from '../conduct';
import { DRINK_PRICE_PENCE, MAX_CANS, NO_RUN } from '../consumables';
import { FIELDS } from '../fields';
import { METER_CEILING, STARTING_REPUTATION } from '../meters';
import { createWorldSession } from '../session';
import { DAY_ACTIONS, SOFTWARE_ACTIONS } from './ids';

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
  const CAUGHT_AT_A_FORUM = conductLine(120, 'screen', 'a discussion forum');

  it('resets suspicion to a floor and writes one line on the file', () => {
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
      dispatch(DAY_ACTIONS.bossCaught, { file_line: CAUGHT_AT_A_FORUM }),
    ).toEqual({ ok: true });

    expect(field(FIELDS.suspicion)).toBe(CAUGHT_SUSPICION_FLOOR);
    expect(field(FIELDS.caughtEvents)).toBe(1);
    const filed = conductEntries(field(FIELDS.conductFile));
    expect(filed).toHaveLength(1);
    expect(filed[0]?.tick).toBe(120);
    expect(filed[0]?.kind).toBe('screen');
    expect(filed[0]?.text).toContain('forum');
  });

  /**
   * THE STANDING ASSERTION OF SLICE 0.2.6, and it is written as an equality
   * with the untouched value on purpose.
   *
   * Being caught costs no points at all. It used to cost six off reputation,
   * which 0.2.5 stopped the review reading, so the fine was levied in a
   * currency nobody spends. The price is the clock (`CAUGHT_MINUTES`, charged
   * by the driver) and the line above. Any conduct term put back onto a meter
   * - however small, however well meant - turns this red, which is the
   * conversation that has to happen before it ships.
   */
  it('takes nothing off any meter but the one it resets', () => {
    const stress = field(FIELDS.stress);

    for (let round = 0; round < 12; round += 1) {
      dispatch(DAY_ACTIONS.bossCaught, { file_line: CAUGHT_AT_A_FORUM });
    }

    expect(field(FIELDS.reputation)).toBe(STARTING_REPUTATION);
    expect(field(FIELDS.stress)).toBe(stress);
    expect(field(FIELDS.caughtEvents)).toBe(12);
  });

  /**
   * The floor is a floor, not a discount. Being caught with a clean screen
   * history still leaves you as somebody who has just been spoken to.
   */
  it('raises suspicion to the floor when it was below it', () => {
    expect(field(FIELDS.suspicion)).toBe(0);
    dispatch(DAY_ACTIONS.bossCaught, { file_line: CAUGHT_AT_A_FORUM });
    expect(field(FIELDS.suspicion)).toBe(CAUGHT_SUSPICION_FLOOR);
  });

  it('counts every round he wins, and files every one of them', () => {
    dispatch(DAY_ACTIONS.bossCaught, {
      file_line: conductLine(120, 'screen', 'a discussion forum'),
    });
    dispatch(DAY_ACTIONS.bossCaught, {
      file_line: conductLine(240, 'screen', 'a puzzle game'),
    });

    expect(field(FIELDS.caughtEvents)).toBe(2);
    // Order is the file's own, oldest first, because a file that reordered
    // itself could not be checked against the clock.
    expect(conductEntries(field(FIELDS.conductFile)).map((line) => line.tick))
      .toEqual([120, 240]);
  });

  it('refuses to file a line nobody wrote', () => {
    const before = engine.snapshotHash();
    expectRefusal(
      dispatch(DAY_ACTIONS.bossCaught, { file_line: '   ' }),
      'blank line',
    );
    expect(engine.snapshotHash()).toBe(before);
  });

  /**
   * The software conversation COPIES the audit trail into the "spoken about"
   * field, and only that conversation does: a forum or a status leaves it alone.
   * The copy of an append-only trail is what stops the beat drumming - the
   * reader treats every line the copy holds as covered.
   */
  it('copies the audit into the spoken-about field only when told to', () => {
    // Two installs on the trail, so the copy has something to be.
    dispatch(SOFTWARE_ACTIONS.install, { id: 'arcade', line: 'arcade@40' });
    dispatch(SOFTWARE_ACTIONS.install, { id: 'media', line: 'media@95' });

    // A conversation about a screen leaves the copy absent, the way it leaves
    // the dot's own record alone.
    dispatch(DAY_ACTIONS.bossCaught, { file_line: CAUGHT_AT_A_FORUM });
    expect(field(FIELDS.installNoticed)).toBeUndefined();

    // The software conversation copies the whole trail as it stands - not a
    // count, a copy - so it is byte-for-byte the audit, and a fresh install
    // lands as a line the copy does not hold.
    dispatch(DAY_ACTIONS.bossCaught, {
      file_line: conductLine(240, 'software', 'a program installed against policy'),
      software_spoken: 1,
    });
    expect(field(FIELDS.installNoticed)).toBe(field(FIELDS.installAudit));
    const filed = conductEntries(field(FIELDS.conductFile));
    expect(filed[filed.length - 1]?.kind).toBe('software');
    expect(filed[filed.length - 1]?.text).toContain('Unauthorised software');
  });

  /**
   * Teeth on the flag: it is a whole one or it is absent, there is no half of a
   * conversation. A value that is not one is refused and the world is left
   * byte-identical. Drop the guard and this goes green with a copy made off a
   * flag the verb was never meant to act on.
   */
  it('refuses a software flag that is not exactly one', () => {
    const before = engine.snapshotHash();
    expectRefusal(
      dispatch(DAY_ACTIONS.bossCaught, {
        file_line: conductLine(
          240,
          'software',
          'a program installed against policy',
        ),
        software_spoken: 2,
      }),
      'one about the install audit',
    );
    expect(engine.snapshotHash()).toBe(before);
  });
});

describe('boss.noticed_empties and boss.ping', () => {
  const THE_DESK = conductLine(120, 'desk', '5 empty cans');

  it('bumps suspicion for the desk and stress for the nag', () => {
    dispatch(DAY_ACTIONS.bossNoticedEmpties, {
      suspicion_up: EMPTIES_SUSPICION_BUMP,
      file_line: THE_DESK,
    });
    dispatch(DAY_ACTIONS.bossPing, { stress_up: PING_STRESS });

    expect(field(FIELDS.suspicion)).toBe(EMPTIES_SUSPICION_BUMP);
    expect(field(FIELDS.stress)).toBe(PING_STRESS);
    // The desk is the other thing that gets noticed, so it is the other thing
    // that goes on the file - and it says which of the two it was.
    const filed = conductEntries(field(FIELDS.conductFile));
    expect(filed).toHaveLength(1);
    expect(filed[0]?.kind).toBe('desk');
    expect(filed[0]?.text).toContain('5 empty cans');
  });

  it('holds both inside the meter range', () => {
    for (let round = 0; round < 40; round += 1) {
      dispatch(DAY_ACTIONS.bossPing, { stress_up: 9 });
      dispatch(DAY_ACTIONS.bossNoticedEmpties, {
        suspicion_up: 9,
        file_line: THE_DESK,
      });
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
    dispatch(DAY_ACTIONS.bossCaught, {
      file_line: conductLine(120, 'screen', 'a discussion forum'),
    });
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
    expect(field(FIELDS.reputation)).toBe(STARTING_REPUTATION);

    // And so does the file, which is the whole difference between it and the
    // caught count above: `caught_events` is a fact about a day and is cleared
    // with the day, and the file is a fact about a WEEK, because the thing
    // that eventually reads it is reading a week.
    expect(conductEntries(field(FIELDS.conductFile))).toHaveLength(1);
  });
});
