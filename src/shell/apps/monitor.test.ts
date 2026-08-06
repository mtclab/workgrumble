/**
 * The RMM / monitoring board, proven through the REAL path (0.9.0).
 *
 * The board has no DOM in this environment, so - exactly as `msp-scope.test.ts`
 * drives the terminal through `executeCommand` rather than a rendered window -
 * these drive the SAME functions the board's buttons call: `monitorBoard` reads
 * the estate, `acknowledgeBoardAlert` writes the seen-flag, `escalateBoardAlert`
 * dispatches the 0.8.0 escalate verb, against a real MSP world session. Every
 * assertion has TEETH: revert the read, the ack or the escalate wiring and the
 * board shows the wrong state, or the alert ticket does not close, and these go
 * red.
 *
 * The board's whole point is that its status cannot drift from the world: it is
 * two reads of one node and one ticket. So the load-bearing assertions are
 * equalities between what the board says and what the graph holds.
 */

import { describe, expect, it } from 'vitest';

import { AppStateStore } from '../app-state';
import { DayDriver } from '../day-driver';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import { FIELDS, SERVICE_STATUS } from '../../world/fields';
import { MSP_CUSTOMERS, MSP_IDS } from '../../world/msp-company';
import {
  type BoardRow,
  monitorBoard,
  noiseFiring,
} from '../../world/monitoring';
import { spawnWorldTicket } from '../../world/tickets';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import { acknowledgeBoardAlert, escalateBoardAlert } from './monitor';
import type { GameApi } from './types';

const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

const BACKUP_TICKET = 'ticket:northwind-backup-alert';

function mspSession(...ticketIds: readonly string[]): WorldSession {
  const session = createWorldSession(MSP_CARRY);

  for (const id of ticketIds) {
    if (session.engine.graph.getNode(id) === undefined) {
      spawnWorldTicket(session.engine, id);
    }
  }

  return session;
}

/** The board's rows for the one monitoring-only customer, at a given tick. */
function northwindRows(
  session: WorldSession,
  appState: AppStateStore,
  now: number,
): readonly BoardRow[] {
  const board = monitorBoard(
    session.engine.graph,
    new Set(appState.get().monitor.acknowledged),
    now,
  );
  const northwind = board.find((customer) => customer.id === MSP_CUSTOMERS.northwind);
  expect(northwind, 'the monitoring-only customer is on the board').toBeDefined();
  return northwind?.rows ?? [];
}

function rowById(rows: readonly BoardRow[], id: string): BoardRow {
  const row = rows.find((candidate) => candidate.id.endsWith(`:${id}`));

  if (row === undefined) {
    throw new Error(`No board row for "${id}".`);
  }

  return row;
}

/** A minimal api carrying only what the board's escalate reaches. */
function apiFor(session: WorldSession): Pick<GameApi, 'dispatch' | 'actor'> {
  return {
    dispatch: (id, actor, target, params) => session.engine.dispatch(
      id,
      actor,
      target,
      params,
    ),
    actor: MSP_IDS.player,
  };
}

describe('the board shows only monitoring-only customers, read off the estate', () => {
  it('lists the watched things and reads their TRUE status live', () => {
    // No alert has fired yet: the estate is seeded healthy, so every watched
    // thing reads ok - eyes on glass, nothing firing.
    const clean = mspSession();
    const cleanRows = northwindRows(clean, new AppStateStore(), 0);
    expect(cleanRows.map((row) => row.label)).toEqual(
      expect.arrayContaining(['Backup job', 'TLS certificate', 'Disk space']),
    );
    for (const row of cleanRows.filter((candidate) => candidate.kind === 'alert')) {
      expect(row.status, `${row.label} healthy`).toBe('ok');
      expect(row.firing).toBe(false);
    }

    // The backup alert fires: its ticket wedges the backup SERVICE node, and the
    // board reads that node - so the row goes failed BECAUSE the node is wedged,
    // not because a string was set. That equality is the no-drift proof.
    const session = mspSession(BACKUP_TICKET);
    const backup = rowById(northwindRows(session, new AppStateStore(), 0), 'backup');
    expect(backup.status).toBe('failed');
    expect(backup.firing).toBe(true);
    // Teeth: the board's status is the node's status, two reads of one fact.
    expect(session.engine.graph.getField(MSP_IDS.northwindBackup, FIELDS.status))
      .toBe(SERVICE_STATUS.wedged);
  });

  it('shows nothing but the empty board where there is no monitoring customer', () => {
    // The probation shop has no customers at all, so the board is empty there -
    // which is what keeps it additive and the probation goldens untouched.
    const probation = createWorldSession(Object.freeze({
      farmFund: 0,
      attempt: 1,
      arcWeek: 1,
      employer: 'workgrumble',
    }));
    const board = monitorBoard(probation.engine.graph, new Set(), 0);
    expect(board).toEqual([]);
  });
});

describe('acknowledge quiets an alert without touching the world', () => {
  it('marks it seen, and the mark is the only thing that changes', () => {
    const session = mspSession(BACKUP_TICKET);
    const appState = new AppStateStore();

    const before = rowById(northwindRows(session, appState, 0), 'backup');
    expect(before.acknowledged).toBe(false);

    // The exact call the Acknowledge button makes.
    acknowledgeBoardAlert(appState, before.ackId);

    const after = rowById(northwindRows(session, appState, 0), 'backup');
    // Teeth: without the ack call this stays false.
    expect(after.acknowledged).toBe(true);
    // Acknowledging is screen state only - the alert is still firing, the node
    // is still wedged, and the ticket is still open. Seeing is not fixing.
    expect(after.firing).toBe(true);
    expect(session.engine.ticketState(BACKUP_TICKET)).toBe('open');
    expect(session.engine.graph.getField(MSP_IDS.northwindBackup, FIELDS.status))
      .toBe(SERVICE_STATUS.wedged);
  });
});

describe('escalate resolves the 0.8.0 alert ticket, and the board agrees', () => {
  it('closes the ticket and reads escalated back off it - no drift', () => {
    const session = mspSession(BACKUP_TICKET);
    const appState = new AppStateStore();
    const api = apiFor(session);

    const before = rowById(northwindRows(session, appState, 0), 'backup');
    expect(before.escalatable).toBe(true);
    expect(before.escalated).toBe(false);

    // The exact call the Escalate button makes - the 0.8.0 escalate verb.
    const outcome = escalateBoardAlert(api, before);
    expect(outcome.ok).toBe(true);

    // The alert ticket closed through the board, exactly as it does from the
    // terminal (msp-scope.test.ts) - the same verb writing the same field.
    expect(session.engine.ticketState(BACKUP_TICKET)).toBe('resolved');

    const after = rowById(northwindRows(session, appState, 0), 'backup');
    // The board reads escalated off the ticket, so the two cannot disagree.
    expect(after.escalated).toBe(true);
    expect(session.engine.graph.getField(BACKUP_TICKET, FIELDS.escalated))
      .toBe(true);
    // And it is no longer offered - raised once, not twice.
    expect(after.escalatable).toBe(false);

    // No drift on the other axis either: on a monitoring-only contract the MSP
    // did not fix the box, so the backup node is STILL wedged and the row still
    // reads failed - raised, but not healed. The board shows the truth.
    expect(after.status).toBe('failed');
    expect(session.engine.graph.getField(MSP_IDS.northwindBackup, FIELDS.status))
      .toBe(SERVICE_STATUS.wedged);
  });
});

describe('a fix stays refused through the board', () => {
  it('offers no fix on the board and refuses one at the terminal', () => {
    const session = mspSession(BACKUP_TICKET);
    const appState = new AppStateStore();
    const rows = northwindRows(session, appState, 0);

    // The board's whole verb set is acknowledge + escalate: no row carries a
    // third action, and a noise row carries not even the escalate.
    const backup = rowById(rows, 'backup');
    expect(backup.escalatable).toBe(true);

    // Escalating the NOISE is refused - there is nothing to raise, which is the
    // boy-who-cried-wolf half of the mechanic.
    const noiseTick = firstNoiseTick('cpu');
    const noiseRow = rowById(northwindRows(session, appState, noiseTick), 'cpu');
    expect(noiseRow.kind).toBe('noise');
    expect(noiseRow.ticket).toBeNull();
    expect(escalateBoardAlert(apiFor(session), noiseRow).ok).toBe(false);

    // And the 0.8.0 monitoring-only refusal is intact: reaching to FIX the
    // backup at the terminal is still refused, and the node stays wedged. This
    // is the mechanic proven through the board's own world, not a fixture.
    appState.setCustomerContext(MSP_CUSTOMERS.northwind);
    const terminal = executeCommand(
      parseCommand('restart NW-SRV-01\\NWBackup'),
      terminalApi(session, appState),
    ).lines.join('\n');
    expect(terminal).toContain('monitoring-only');
    expect(terminal).toContain('notify-and-escalate');
    expect(terminal).not.toContain('service reports RUNNING');
    expect(session.engine.graph.getField(MSP_IDS.northwindBackup, FIELDS.status))
      .toBe(SERVICE_STATUS.wedged);
  });
});

describe('the alert fatigue: noise auto-clears, real alerts do not', () => {
  it('shows a noise flare inside its window and not after it', () => {
    const session = mspSession(BACKUP_TICKET);
    const appState = new AppStateStore();

    const firing = firstNoiseTick('cpu');
    const cleared = firstClearTick('cpu', firing);

    // Deterministic (a function of the day and the id, no RNG): the same ticks
    // give the same answer every run.
    expect(noiseFiring('cpu', firing).firing).toBe(true);
    expect(noiseFiring('cpu', cleared).firing).toBe(false);

    // Inside the window the flare is on the board; after it, it has cleared
    // itself with nobody escalating anything.
    const firingRows = northwindRows(session, appState, firing);
    expect(firingRows.some((row) => row.kind === 'noise')).toBe(true);

    const clearedRows = northwindRows(session, appState, cleared);
    expect(clearedRows.some((row) => row.id.endsWith(':cpu'))).toBe(false);

    // The real backup alert does NOT auto-clear: it is on the board at BOTH
    // ticks, firing, because a genuine failure needs escalating, not waiting out.
    expect(rowById(firingRows, 'backup').firing).toBe(true);
    expect(rowById(clearedRows, 'backup').firing).toBe(true);
  });
});

/* -- helpers -------------------------------------------------------------- */

/** A full api for the terminal path, enough for the fix-refusal command. */
function terminalApi(session: WorldSession, appState: AppStateStore): GameApi {
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

/** The first shift tick of day one on which a noise seed is firing. */
function firstNoiseTick(seedId: string): number {
  for (let tick = 60; tick < 540; tick += 1) {
    if (noiseFiring(seedId, tick).firing) {
      return tick;
    }
  }

  throw new Error(`Noise "${seedId}" never fires in day one's shift.`);
}

/**
 * The first tick on or after `from` on which the seed has cleared - scanned to
 * the end of day one (tick 959 is 23:59), so a flare that runs to the end of the
 * shift still has a cleared tick after it to find.
 */
function firstClearTick(seedId: string, from: number): number {
  for (let tick = from; tick < 960; tick += 1) {
    if (!noiseFiring(seedId, tick).firing) {
      return tick;
    }
  }

  throw new Error(`Noise "${seedId}" never clears in day one.`);
}
