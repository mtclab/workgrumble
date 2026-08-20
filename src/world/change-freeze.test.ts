/**
 * The month-end change freeze, as world data and as arithmetic on the world's
 * own calendar (E9, 0.39.0).
 *
 * Three things are proven here and each is a thing a revert can break:
 *
 *  - WHO declares one. Three customers on the roster and no others, read off
 *    the real seeded graph rather than off the table that wrote it.
 *  - WHEN the window is. Not a hard-coded thirtieth: the last `FREEZE_DAYS`
 *    days of whatever month the arc week lands in, which is a different date
 *    in September, October and February - and the thaw is always the first.
 *  - WHAT the emergency class is. A service that is DOWN on the record, in the
 *    same words the world already writes it in, and nothing else - not a flag,
 *    not a stopped-by-design manual service, not a healthy box somebody would
 *    like to change.
 *
 * The journey - a request filed in the freeze and refused on the day it was
 * filed - is proven through the real terminal in
 * `shell/apps/change-freeze.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { arcWeekOf } from './arc-week';
import {
  changeFreezeOfCustomer,
  FREEZE_DAYS,
  freezeDeferral,
  freezeReading,
  isEmergencyChange,
} from './change-freeze';
import {
  CHANGE_FREEZES,
  FIELDS,
  SERVICE_STATUS,
  STARTUP_TYPES,
  SYSTEMD_STATES,
  UNIT_ENABLEMENTS,
} from './fields';
import { dayOpensTick, shiftStartTick } from './hours';
import { MSP_CUSTOMERS, MSP_IDS } from './msp-company';
import { baselineServiceId } from './services';
import { createWorldSession, type WorldSession } from './session';

/** The week of the arc whose Monday is the twenty-eighth of September. */
const FREEZE_WEEK = 4;

/** The day of that week the month turns on: the first of October. */
const THAW_DAY = 4;

const FONTAINE_DFS = baselineServiceId(MSP_IDS.fontaineFileServer, 'Dfs');

function mspAt(arcWeek: number): WorldSession {
  return createWorldSession(Object.freeze({
    farmFund: 0,
    attempt: 1,
    arcWeek,
    employer: 'msp',
  }));
}

describe('the freeze is declared by the customer, as world data', () => {
  it('is on the two accountancies and the law firm, and on nobody else', () => {
    const { engine } = mspAt(1);
    const declared = engine.graph
      .nodesOfKind('customer')
      .filter((node) => node.fields[FIELDS.customerChangeFreeze] !== undefined)
      .map((node) => node.id)
      .sort();

    expect(declared).toEqual([
      MSP_CUSTOMERS.fontaine,
      MSP_CUSTOMERS.holloway,
      MSP_CUSTOMERS.pennington,
    ].sort());

    expect(changeFreezeOfCustomer(engine.graph, MSP_CUSTOMERS.fontaine))
      .toBe(CHANGE_FREEZES.monthEnd);
    // The dental practice, the studio, the manufacturer, the SaaS shop and the
    // monitoring-only clinic all have month ends. None of them has one that
    // decides whether a change may happen, so none of them declares one.
    expect(changeFreezeOfCustomer(engine.graph, MSP_CUSTOMERS.elmwood)).toBeNull();
    expect(changeFreezeOfCustomer(engine.graph, MSP_CUSTOMERS.northwind)).toBeNull();
    // And an id that is not a customer at all reads null rather than throwing.
    expect(changeFreezeOfCustomer(engine.graph, MSP_IDS.playerMachine)).toBeNull();
  });

  it('reads nothing at an employer that has no customers', () => {
    const { engine } = createWorldSession(Object.freeze({
      farmFund: 0,
      attempt: 1,
      arcWeek: FREEZE_WEEK,
      employer: 'workgrumble',
    }));

    expect(engine.graph.nodesOfKind('customer')).toHaveLength(0);
    expect(freezeReading(engine.graph, null, FREEZE_WEEK, 0)).toBeNull();
  });
});

describe('the window is the last days of the month the arc week lands in', () => {
  it('freezes the Monday to the Wednesday of the week September ends in', () => {
    const { engine } = mspAt(FREEZE_WEEK);
    const read = (day: number) => freezeReading(
      engine.graph,
      MSP_CUSTOMERS.fontaine,
      FREEZE_WEEK,
      shiftStartTick(day),
    );

    // 28, 29 and 30 September - three days, which is FREEZE_DAYS.
    expect(read(1)?.frozen).toBe(true);
    expect(read(2)?.frozen).toBe(true);
    expect(read(3)?.frozen).toBe(true);
    expect(FREEZE_DAYS).toBe(3);
    // And the month turns: the first of October is not frozen, it is the thaw.
    expect(read(THAW_DAY)?.frozen).toBe(false);
    expect(read(5)?.frozen).toBe(false);

    expect(read(1)?.thawDate).toBe('01/10/1998');
    expect(read(1)?.freezeFrom).toBe('28/09/1998');
    // The tick the deferred window is measured from is the thaw day's own
    // open, which is a day of THIS week the player is still going to be at.
    expect(read(1)?.thawTick).toBe(dayOpensTick(THAW_DAY));
  });

  it('is nowhere near the first week of the arc', () => {
    const { engine } = mspAt(1);
    const read = freezeReading(engine.graph, MSP_CUSTOMERS.fontaine, 1, 0);

    // Monday 7 September: the freeze is a fact about the customer all the same,
    // it is simply not on - which is what the record has to be able to say.
    expect(read?.frozen).toBe(false);
    expect(read?.freezeFrom).toBe('28/09/1998');
  });

  /**
   * The reason `daysInMonth` is asked rather than assumed. A rule that froze
   * "the twenty-eighth onwards" would be right in September, a day early in
   * October, and would freeze the whole of the end of February for four days
   * instead of three.
   */
  it('counts back from the end of a short month and a long one alike', () => {
    const { engine } = mspAt(1);
    const on = (week: number, day: number, at = shiftStartTick(day)) =>
      freezeReading(engine.graph, MSP_CUSTOMERS.fontaine, week, at);

    // Week eight is the week October ends in: the twenty-eighth is NOT frozen
    // there, because October has thirty-one days.
    expect(on(8, 3)?.frozen).toBe(false);
    expect(on(8, 4)?.frozen).toBe(true);
    expect(on(8, 4)?.thawDate).toBe('01/11/1998');

    // February 1999, twenty-eight days: the twenty-sixth is the first frozen
    // day, and the thaw is the first of March.
    expect(on(25, 5)?.frozen).toBe(true);
    expect(on(25, 5)?.thawDate).toBe('01/03/1999');
    expect(on(25, 5)?.freezeFrom).toBe('26/02/1999');
  });

  it('reads the arc week off the player, and falls back to the first week', () => {
    const { engine } = mspAt(FREEZE_WEEK);

    expect(arcWeekOf(engine.graph, MSP_IDS.player)).toBe(FREEZE_WEEK);
    // A node with no arc week on it - anybody but the player - is week one,
    // which is the same answer every world that has never been promoted gives.
    expect(arcWeekOf(engine.graph, MSP_IDS.mspLead)).toBe(1);
  });
});

describe('the emergency class is a service that is down on the record', () => {
  it('is a wedged service, and a stopped one that was set to start itself', () => {
    const session = mspAt(FREEZE_WEEK);
    const { engine } = session;

    // Healthy: the Dfs service is running, so a change to it is a change.
    expect(isEmergencyChange(engine.graph, FONTAINE_DFS)).toBe(false);

    engine.applySetup([{
      op: 'setField',
      id: FONTAINE_DFS,
      field: FIELDS.status,
      value: SERVICE_STATUS.stopped,
    }]);
    // Stopped, and its startup type is automatic: it should be up and is not.
    expect(isEmergencyChange(engine.graph, FONTAINE_DFS)).toBe(true);

    engine.applySetup([{
      op: 'setField',
      id: FONTAINE_DFS,
      field: FIELDS.status,
      value: SERVICE_STATUS.wedged,
    }]);
    expect(isEmergencyChange(engine.graph, FONTAINE_DFS)).toBe(true);
  });

  /**
   * The narrow half, and the one that keeps the class honest: half the
   * baseline of every box in this game is stopped and MANUAL, because that is
   * what a real box looks like. If a stopped service were an emergency on its
   * own, almost every target in the estate would walk through the freeze.
   */
  it('is not a stopped manual service, an account, or a box', () => {
    const session = mspAt(FREEZE_WEEK);
    const { engine } = session;

    engine.applySetup([
      {
        op: 'setField',
        id: FONTAINE_DFS,
        field: FIELDS.status,
        value: SERVICE_STATUS.stopped,
      },
      {
        op: 'setField',
        id: FONTAINE_DFS,
        field: FIELDS.startupType,
        value: STARTUP_TYPES.manual,
      },
    ]);

    expect(isEmergencyChange(engine.graph, FONTAINE_DFS)).toBe(false);
    expect(isEmergencyChange(engine.graph, MSP_IDS.fontaineFileServer)).toBe(false);
    expect(isEmergencyChange(engine.graph, MSP_IDS.fontaineContactAccount))
      .toBe(false);
    expect(isEmergencyChange(engine.graph, 'service:nothing/at-all')).toBe(false);
  });

  it('is a failed unit, and an enabled one that is not running', () => {
    const session = mspAt(FREEZE_WEEK);
    const { engine } = session;
    const unit = MSP_IDS.mspInfraPortalUnit;

    expect(isEmergencyChange(engine.graph, unit)).toBe(false);

    engine.applySetup([{
      op: 'setField',
      id: unit,
      field: FIELDS.unitState,
      value: SYSTEMD_STATES.failed,
    }]);
    expect(isEmergencyChange(engine.graph, unit)).toBe(true);

    engine.applySetup([
      {
        op: 'setField',
        id: unit,
        field: FIELDS.unitState,
        value: SYSTEMD_STATES.inactiveDead,
      },
      {
        op: 'setField',
        id: unit,
        field: FIELDS.unitEnabled,
        value: UNIT_ENABLEMENTS.disabled,
      },
    ]);
    // Inactive because nobody asked it to start is not a fire.
    expect(isEmergencyChange(engine.graph, unit)).toBe(false);

    engine.applySetup([{
      op: 'setField',
      id: unit,
      field: FIELDS.unitEnabled,
      value: UNIT_ENABLEMENTS.enabled,
    }]);
    expect(isEmergencyChange(engine.graph, unit)).toBe(true);
  });
});

describe('the deferral defers, and only that', () => {
  it('defers a change in the window and nothing outside it', () => {
    const frozen = mspAt(FREEZE_WEEK);
    const quiet = mspAt(1);
    const at = (session: WorldSession, week: number, day: number) => freezeDeferral(
      session.engine.graph,
      MSP_CUSTOMERS.fontaine,
      FONTAINE_DFS,
      week,
      shiftStartTick(day),
    );

    expect(at(frozen, FREEZE_WEEK, 1)?.thawDate).toBe('01/10/1998');
    expect(at(frozen, FREEZE_WEEK, 1)?.from).toBe(dayOpensTick(THAW_DAY));
    // The day after the thaw, and a week nowhere near a month end: nothing.
    expect(at(frozen, FREEZE_WEEK, THAW_DAY)).toBeNull();
    expect(at(quiet, 1, 1)).toBeNull();
  });

  it('defers nothing at a customer who declares no freeze', () => {
    const session = mspAt(FREEZE_WEEK);

    // ELMWOOD-DENTAL, in the same minute of the same month: the estate that
    // declares nothing is the estate this feature cannot touch.
    expect(freezeDeferral(
      session.engine.graph,
      MSP_CUSTOMERS.elmwood,
      MSP_IDS.elmwoodImagingBridge,
      FREEZE_WEEK,
      shiftStartTick(1),
    )).toBeNull();

    // And no customer at all - the MSP's own estate - is never frozen.
    expect(freezeDeferral(
      session.engine.graph,
      null,
      MSP_IDS.mspInfraPortalUnit,
      FREEZE_WEEK,
      shiftStartTick(1),
    )).toBeNull();
  });

  it('does not defer the fire', () => {
    const session = mspAt(FREEZE_WEEK);

    session.engine.applySetup([{
      op: 'setField',
      id: FONTAINE_DFS,
      field: FIELDS.status,
      value: SERVICE_STATUS.wedged,
    }]);

    expect(freezeDeferral(
      session.engine.graph,
      MSP_CUSTOMERS.fontaine,
      FONTAINE_DFS,
      FREEZE_WEEK,
      shiftStartTick(1),
    )).toBeNull();
  });
});
