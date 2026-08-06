/**
 * The change-request authorisation moment (0.10.0), proven through the REAL
 * terminal path.
 *
 * The 0.6.0 lesson holds: these drive the ACTUAL dispatch a player hits -
 * `executeCommand(parseCommand(...))` against a real MSP world, the customer
 * context set the way opening a ticket sets it, and the clock advanced through
 * the real engine so the review and the window are the world's own arithmetic.
 * Every gate has TEETH: the fail-closed test proves that reverting the approval
 * consult wrongly lets an unapproved action dispatch.
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
import { FIELDS } from '../../world/fields';
import { MSP_CUSTOMERS, MSP_IDS } from '../../world/msp-company';
import { spawnWorldTicket } from '../../world/tickets';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import type { GameApi } from './types';

const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

function mspSession(...ticketIds: readonly string[]): WorldSession {
  const session = createWorldSession(MSP_CARRY);

  for (const id of ticketIds) {
    if (session.engine.graph.getNode(id) === undefined) {
      spawnWorldTicket(session.engine, id);
    }
  }

  return session;
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
    restartWeek: () => {},
    acceptOffer: () => {},
    employer: 'msp',
    actor: MSP_IDS.player,
  };
}

function run(api: GameApi, input: string): string {
  return executeCommand(parseCommand(input), api).lines.join('\n');
}

/** The single change request the terminal has filed this session. */
function theRequest(session: WorldSession): Readonly<ReadOnlyGraphNode> {
  const requests = session.engine.graph.nodesOfKind('change_request');
  expect(requests).toHaveLength(1);
  const request = requests[0];

  if (request === undefined) {
    throw new Error('expected exactly one change request');
  }

  return request;
}

function tickField(session: WorldSession, field: string): number {
  const value = theRequest(session).fields[field];
  expect(typeof value).toBe('number');
  return typeof value === 'number' ? value : 0;
}

function windowOpenOf(session: WorldSession): number {
  return tickField(session, FIELDS.crWindowOpen);
}

function windowCloseOf(session: WorldSession): number {
  return tickField(session, FIELDS.crWindowClose);
}

/** Sets the customer context and files a CR for restarting FONT-FILE-01\Dfs. */
function fontaineWithFiledCr(): { session: WorldSession; api: GameApi } {
  const session = mspSession();
  const appState = new AppStateStore();
  appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
  const api = apiFor(session, appState);

  const filed = run(api, 'changereq file FONT-FILE-01\\Dfs');
  expect(filed).toContain('Change request filed');
  return { session, api };
}

describe('an out-of-scope action names the change-request path', () => {
  it('refuses a helpdesk tech reaching for a server, and points at the CR', () => {
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const output = run(api, 'restart FONT-FILE-01\\Dfs');

    // The 0.8.0 refusal is intact...
    expect(output).toContain('Servers are not in this contract');
    // ...but it is no longer a dead end: it names the path.
    expect(output).toContain('changereq file');
    // Teeth: nothing was bounced.
    expect(output).not.toContain('running');
  });
});

describe('filing then approving a CR permits the exact action it covers', () => {
  it('lets the restart through once the CR is approved and inside its window', () => {
    const { session, api } = fontaineWithFiledCr();

    // Straight after filing the request is under review: the action is still
    // refused, and it did NOT dispatch. This is the fail-closed floor.
    const underReview = run(api, 'restart FONT-FILE-01\\Dfs');
    expect(underReview).toContain('under review');
    expect(underReview).not.toContain('running');

    // Advance to the moment the change window opens - the world's own arithmetic,
    // read off the request node - and the exact action it covers now goes
    // through the scope pre-flight: the guard stands down and the terminal sends
    // it to the engine, which gives its own (customer-agnostic) answer.
    session.engine.advance(windowOpenOf(session));

    const inWindow = run(api, 'restart FONT-FILE-01\\Dfs');
    expect(inWindow).not.toContain('Servers are not in this contract');
    expect(inWindow).not.toContain('changereq');
    // It REACHED the engine - the proof the CR let it through (a healthy service
    // answers "already running", exactly as an in-scope restart of one does).
    expect(inWindow).toContain('running');
  });

  it('FAILS CLOSED: reverting the approval consult would wrongly allow it', () => {
    // The security-critical property, made a teeth test. With a filed-but-not-
    // yet-approved CR the action is refused and does not dispatch. The ONLY thing
    // standing between "refused" and "dispatched" is `changeRequestConsult`
    // returning allowed=false here; revert it to always-allow and this restart
    // reaches the engine, "running" appears, and the assertion goes red.
    const { session, api } = fontaineWithFiledCr();

    // Well before the review clears (window_open is strictly after review_until).
    session.engine.advance(Math.max(0, windowOpenOf(session) - 5));

    const output = run(api, 'restart FONT-FILE-01\\Dfs');
    expect(output).not.toContain('running');
    // And the true reason is on screen: authorisation is not yet in hand.
    expect(output.toLowerCase()).toMatch(/under review|not now|window/);
  });
});

describe('acting outside the window still refuses', () => {
  it('refuses after the change window has closed', () => {
    const { session, api } = fontaineWithFiledCr();

    // Past the far edge of the window.
    session.engine.advance(windowCloseOf(session) + 1);

    const output = run(api, 'restart FONT-FILE-01\\Dfs');
    expect(output).toContain('window has closed');
    expect(output).not.toContain('running');
  });
});

describe('monitoring-only is NOT unlockable by a change request', () => {
  it('files as rejected, blocks the fix, and never names the CR on the refusal', () => {
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.northwind);
    const api = apiFor(session, appState);

    // Filing against a monitoring-only account is honest about being the wrong
    // instrument: it is headed for rejection.
    const filed = run(api, 'changereq file NW-SRV-01\\NWBackup');
    expect(filed).toContain('headed for rejection');
    expect(filed).toContain('notify-and-escalate');

    // The request node is REJECTED, and it carries no window (empty until
    // approved - and this one never is).
    const request = theRequest(session);
    expect(request.fields[FIELDS.crDecision]).toBe('reject');
    expect(request.fields[FIELDS.crWindowOpen]).toBeUndefined();

    // Even after any amount of time, the fix stays refused with the escalate
    // reason - and the refusal does NOT offer a CR, because a CR is not the path.
    session.engine.advance(500);
    const refused = run(api, 'restart NW-SRV-01\\NWBackup');
    expect(refused).toContain('monitoring-only');
    expect(refused).toContain('notify-and-escalate');
    expect(refused).not.toContain('changereq');
    expect(refused).not.toContain('running');

    // The listing shows it rejected - the rejected CR says why.
    const listed = run(api, 'changereq list');
    expect(listed).toContain('[rejected]');
  });
});

describe('the change-request system is additive and inert until used', () => {
  it('needs no request for in-house work, and files nothing', () => {
    // The MSP desk's own managed box (no customer): in scope, no CR needed, and
    // no node created - which is why every existing employer golden holds.
    const session = mspSession();
    const appState = new AppStateStore();
    appState.setCustomerContext(MSP_CUSTOMERS.fontaine);
    const api = apiFor(session, appState);

    const output = run(api, 'changereq file FC-DESK-07\\Spooler');
    expect(output).toContain('No change request needed');
    expect(session.engine.graph.nodesOfKind('change_request')).toHaveLength(0);
  });

  it('lists nothing before anything is filed', () => {
    const session = mspSession();
    const api = apiFor(session, new AppStateStore());

    expect(run(api, 'changereq list')).toContain('No change requests filed');
  });
});
