/**
 * The month-end change freeze, proven through the REAL terminal (E9, 0.39.0).
 *
 * Same discipline as the 0.10.0 change-request suite beside it: these drive
 * the actual dispatch a player hits - `executeCommand(parseCommand(...))`
 * against a real MSP world in the week of the arc that September ends in, the
 * customer context set the way opening a ticket sets it, and the clock
 * advanced through the real engine so the window is the world's own
 * arithmetic. Nothing here reads a fixture.
 *
 * The three teeth, each named at the assertion that holds it:
 *
 *  - the deferral is REAL: the window a request filed in the close books is on
 *    the far side of the thaw, and the action it authorises is refused for the
 *    whole of the day it was filed on. Revert `freezeDeferral` to null and the
 *    window lands the same afternoon.
 *  - the fire is NOT frozen: the same request for a service that is DOWN books
 *    its window the same day. Drop the emergency arm and it goes to the first.
 *  - the freeze NEVER UNLOCKS: a monitoring-only account that declared a close
 *    is still rejected, with no window and no thaw on the paperwork. Compute
 *    the deferral before the decision instead of after and this one goes red.
 */

import { describe, expect, it } from 'vitest';

import { AppStateStore } from '../app-state';
import { DayDriver } from '../day-driver';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import type { ReadOnlyGraphNode } from '../../engine-api';
import { FIELDS, SERVICE_STATUS } from '../../world/fields';
import { dayForTick, shiftEndTick } from '../../world/hours';
import { MSP_CUSTOMERS, MSP_IDS } from '../../world/msp-company';
import { baselineServiceId } from '../../world/services';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import type { GameApi } from './types';

/** The week of the arc whose Monday is the twenty-eighth of September. */
const FREEZE_WEEK = 4;

/** The day of that week the month turns on: the first of October. */
const THAW_DAY = 4;

const THAW_DATE = '01/10/1998';

const FONTAINE_DFS = baselineServiceId(MSP_IDS.fontaineFileServer, 'Dfs');

function mspSession(arcWeek: number): WorldSession {
  return createWorldSession(Object.freeze({
    farmFund: 0,
    attempt: 1,
    arcWeek,
    employer: 'msp',
  }));
}

function apiFor(session: WorldSession, appState: AppStateStore): GameApi {
  return {
    graph: session.engine.graph,
    appState,
    day: new DayDriver(session.engine, MSP_IDS.player, WORLD_SEED, {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    }),
    dispatch: (id, actor, target, params) => session.engine.dispatch(
      id,
      actor,
      target,
      params,
    ),
    recordProbe: () => {},
    dispatchLog: () => session.engine.dispatchLog(),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener) => session.engine.onTick(listener),
    },
    onWorldChange: (listener) => session.engine.onEvent(() => {
      listener();
    }),
    notify: () => {},
    report: () => Promise.resolve({ ok: true, value: undefined }),
    openApp: () => {},
    closeApp: () => {},
    hasApp: () => false,
    installApp: () => ({ ok: true }),
    uninstallApp: () => ({ ok: true }),
    setDesktop: () => ({ ok: true }),
    restartWeek: () => {},
    acceptOffer: () => {},
    stayAnotherWeek: () => {},
    employer: 'msp',
    actor: MSP_IDS.player,
  };
}

function run(api: GameApi, input: string): string {
  return executeCommand(parseCommand(input), api).lines.join('\n');
}

function theRequest(session: WorldSession): Readonly<ReadOnlyGraphNode> {
  const requests = session.engine.graph.nodesOfKind('change_request');
  expect(requests).toHaveLength(1);
  const request = requests[0];

  if (request === undefined) {
    throw new Error('expected exactly one change request');
  }

  return request;
}

function windowOpenOf(session: WorldSession): number {
  const value = theRequest(session).fields[FIELDS.crWindowOpen];
  expect(typeof value).toBe('number');
  return typeof value === 'number' ? value : 0;
}

function deskAt(
  arcWeek: number,
  customer: string,
): { session: WorldSession; api: GameApi } {
  const session = mspSession(arcWeek);
  const appState = new AppStateStore();
  appState.setCustomerContext(customer);

  return { session, api: apiFor(session, appState) };
}

describe('a change filed inside the close waits for the first', () => {
  it('approves it, names the thaw, and books the window past it', () => {
    const { session, api } = deskAt(FREEZE_WEEK, MSP_CUSTOMERS.fontaine);

    const filed = run(api, 'changereq file FONT-FILE-01\\Dfs');

    // The paperwork is not the problem and the reply says so: it is filed, it
    // is approved by the customer, and what is holding it is the calendar.
    expect(filed).toContain('Change request filed');
    expect(filed).toContain('MONTH-END CHANGE FREEZE');
    expect(filed).toContain(THAW_DATE);

    const request = theRequest(session);
    expect(request.fields[FIELDS.crDecision]).toBe('approve');
    expect(request.fields[FIELDS.crFreezeThaw]).toBe(THAW_DATE);

    // THE TEETH. The window is on the thaw day, not on the day it was filed.
    // Revert the deferral - have `freezeDeferral` answer null - and the window
    // is measured off the review instead, lands on day one, and this is red.
    expect(dayForTick(windowOpenOf(session))).toBe(THAW_DAY);
  });

  it('refuses the action for the whole of the day it was filed on', () => {
    const { session, api } = deskAt(FREEZE_WEEK, MSP_CUSTOMERS.fontaine);

    run(api, 'changereq file FONT-FILE-01\\Dfs');

    // Five o'clock on the day of filing - long past any window an unfrozen
    // request would have opened and closed in. The service is not bounced.
    session.engine.advance(shiftEndTick(1));

    const refused = run(api, 'restart FONT-FILE-01\\Dfs');
    expect(refused).not.toContain('running');
    expect(refused).toContain('Authorised - but not now');
    // And it says WHY the slot is so far out, off the request's own paperwork.
    expect(refused).toContain('MONTH-END FREEZE');
    expect(refused).toContain(THAW_DATE);
  });

  it('lets the same action through when the month has turned', () => {
    const { session, api } = deskAt(FREEZE_WEEK, MSP_CUSTOMERS.fontaine);

    run(api, 'changereq file FONT-FILE-01\\Dfs');
    session.engine.advance(windowOpenOf(session));

    // A deferral is not a refusal: on the first, in the window it booked, the
    // work happens. The engine answers for a healthy service, which is the
    // proof it reached the engine at all.
    const done = run(api, 'restart FONT-FILE-01\\Dfs');
    expect(done).not.toContain('Servers are not in this contract');
    expect(done).not.toContain('changereq');
    expect(done).toContain('running');
  });
});

describe('the freeze does not hold the fire', () => {
  it('books the same day for a service that is down on the record', () => {
    const { session, api } = deskAt(FREEZE_WEEK, MSP_CUSTOMERS.fontaine);

    // The document store has stopped - the ticket the firm actually raises in
    // the middle of its billing run. It should be running; it is not.
    session.engine.applySetup([{
      op: 'setField',
      id: FONTAINE_DFS,
      field: FIELDS.status,
      value: SERVICE_STATUS.stopped,
    }]);

    const filed = run(api, 'changereq file FONT-FILE-01\\Dfs');
    expect(filed).not.toContain('MONTH-END');

    // THE TEETH for the emergency arm: drop `isEmergencyChange` from the
    // deferral and this window walks to the thaw day, leaving a firm with its
    // document system down and a provider quoting them a calendar.
    expect(dayForTick(windowOpenOf(session))).toBe(1);
    expect(theRequest(session).fields[FIELDS.crFreezeThaw]).toBeUndefined();
  });
});

describe('the freeze never unlocks what the contract refuses', () => {
  it('still rejects a monitoring-only remediation, with no window at all', () => {
    const { session, api } = deskAt(FREEZE_WEEK, MSP_CUSTOMERS.northwind);

    // NORTHWIND-CLINIC declares no close; give it one, which is the sharpest
    // version of the question - if a freeze could reach the DECISION, the
    // customer whose contract forbids remediation outright is where it would
    // show. It composes the only way it may: scope decides whether, the
    // calendar decides when, and a refusal has no when.
    session.engine.applySetup([{
      op: 'setField',
      id: MSP_CUSTOMERS.northwind,
      field: FIELDS.customerChangeFreeze,
      value: 'month_end',
    }]);

    const filed = run(api, 'changereq file NW-SRV-01\\NWBackup');
    expect(filed).toContain('headed for rejection');
    expect(filed).not.toContain('MONTH-END CHANGE FREEZE');

    const request = theRequest(session);
    expect(request.fields[FIELDS.crDecision]).toBe('reject');
    // THE TEETH. No window, and no thaw stamp: compute the deferral before the
    // decision rather than after it - or stamp it unconditionally - and a
    // rejected request starts carrying a date it may act on.
    expect(request.fields[FIELDS.crWindowOpen]).toBeUndefined();
    expect(request.fields[FIELDS.crFreezeThaw]).toBeUndefined();

    // And the wall itself is untouched, in the same minute of the same close.
    session.engine.advance(shiftEndTick(1));
    const refused = run(api, 'restart NW-SRV-01\\NWBackup');
    expect(refused).toContain('monitoring-only');
    expect(refused).not.toContain('running');
  });
});

describe('a customer who declares no close is untouched by any of it', () => {
  it('books the same day at ARDEN-MFG in the same week', () => {
    const { session, api } = deskAt(FREEZE_WEEK, MSP_CUSTOMERS.arden);

    const filed = run(api, 'changereq file ARDEN-SRV-01\\W32Time');
    expect(filed).toContain('Change request filed');
    expect(filed).not.toContain('MONTH-END');

    expect(dayForTick(windowOpenOf(session))).toBe(1);
    expect(theRequest(session).fields[FIELDS.crFreezeThaw]).toBeUndefined();
  });

  it('leaves the same firm alone in a week that is not a month end', () => {
    const { session, api } = deskAt(1, MSP_CUSTOMERS.fontaine);

    const filed = run(api, 'changereq file FONT-FILE-01\\Dfs');
    expect(filed).not.toContain('MONTH-END');
    expect(dayForTick(windowOpenOf(session))).toBe(1);
  });
});

describe('the customer record carries the declaration', () => {
  it('prints the close on the audit, and prints nothing on a firm without one', () => {
    const { api } = deskAt(FREEZE_WEEK, MSP_CUSTOMERS.fontaine);

    const audited = run(api, 'audit FONTAINE-LAW');
    expect(audited).toContain('Change freeze: MONTH-END, on now');
    expect(audited).toContain('28/09/1998');
    expect(audited).toContain(THAW_DATE);

    // The same command at a customer who declares none is the block it always
    // was: no freeze line, and no mention of a calendar nobody keeps.
    const elmwood = run(api, 'audit ELMWOOD-DENTAL');
    expect(elmwood).toContain('Discovery audit');
    expect(elmwood).not.toContain('Change freeze');
  });

  it('says the close is coming rather than on, in a quiet week', () => {
    const { api } = deskAt(1, MSP_CUSTOMERS.fontaine);

    const audited = run(api, 'audit FONTAINE-LAW');
    expect(audited).toContain('Change freeze: month-end');
    expect(audited).toContain('Not on today');
  });
});
