import { beforeAll, describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from './actions';
import { RECORD_PARAM, STARTUP_PARAM } from './actions/legendary';
import { isRollbackRecord } from './change-request';
import { HALCYON_IDS } from './corporate-company';
import { FIELDS, STARTUP_TYPES } from './fields';
import {
  LEGENDARY_MANDATE_TICKET,
  LEGENDARY_REVERT_TICKET,
  LEGENDARY_SERVICES,
} from './legendary';
import { createWorldSession, type WorldSession } from './session';
import { findWorldTicket, spawnWorldTicket } from './tickets';
import { DayDriver } from '../shell/day-driver';
import { loadEngineForTests } from '../engine-api/load-node';

/**
 * The legendary manager / implement-then-revert arc (E8, 0.25.0), driven through
 * the REAL session and the REAL dispatch path - the owner's marquee scenario.
 *
 * The goal, not the call. The mechanic is: a seagull manager's mandate flattens
 * every service to Automatic; you implement it with OR without capturing the
 * rollback first; the manager leaves and the change is a mess, so the org reverts;
 * and the revert is CLEAN (one restore per service) if you kept the rollback and
 * PAINFUL (reconstruct by hand) if you did not. So the assertions are about the
 * graph the dispatches leave and the paths that are actually available, not a verb
 * returning ok:
 *
 *  - the mandate arrives with EMPTY rollback records, services at their varied
 *    priors (two Disabled, one Manual), and the ticket open;
 *  - implementing is a REAL state change - the services ARE Automatic after (c);
 *  - keeping vs skipping the rollback is a REAL captured-state difference - the
 *    prior config is in the record iff captured, per service (b);
 *  - the manager-leaves beat fires by itself the minute the mandate closes, and
 *    the revert is raised;
 *  - the CLEAN revert REQUIRES the record - `restoreFromRecord` refuses an empty
 *    one, so the clean path exists only where the rollback was kept (a);
 *  - and the PAINFUL revert reconstructs to the same end state, so diligence is
 *    never punished - only the shortcut pays, and it pays in reconstruction.
 *
 * Because everything runs against the Halcyon estate through the driver, the
 * revert the day loop settles fires by itself the moment the mandate resolves -
 * which is exactly how a player meets it.
 */

beforeAll(() => {
  loadEngineForTests();
});

interface Notice {
  readonly title: string;
  readonly body: string;
}

function corporate(): WorldSession {
  return createWorldSession({
    farmFund: 0,
    attempt: 1,
    arcWeek: 1,
    employer: 'corporate',
  });
}

/** A driver over the session, collecting the notices the day loop raises. */
function driverFor(session: WorldSession, notices: Notice[] = []): DayDriver {
  return new DayDriver(session.engine, HALCYON_IDS.player, session.seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onNotice: (title, body) => {
      notices.push({ title, body });
    },
  });
}

function startup(session: WorldSession, service: string): unknown {
  return session.engine.graph.getField(service, FIELDS.startupType);
}

function rollback(session: WorldSession, record: string): unknown {
  return session.engine.graph.getField(record, FIELDS.crRollback);
}

function ticketState(session: WorldSession, id: string): unknown {
  return session.engine.graph.getField(id, FIELDS.state);
}

/** Drive one of a ticket's advertised paths through the real dispatch, in order. */
function drivePath(
  driver: DayDriver,
  ticketId: string,
  pathId: string,
): readonly boolean[] {
  const entry = findWorldTicket(ticketId);
  const path = entry?.paths.find((candidate) => candidate.id === pathId);

  if (path === undefined) {
    throw new Error(`No path "${pathId}" on "${ticketId}".`);
  }

  return path.steps.map((step) => driver.dispatch(
    step.action,
    HALCYON_IDS.player,
    step.target,
    { ...step.params },
  ).ok);
}

/** The mandate, spawned the way the arc raises it, with a notice collector. */
function mandateReady(): {
  session: WorldSession;
  driver: DayDriver;
  notices: Notice[];
} {
  const session = corporate();
  const notices: Notice[] = [];
  const driver = driverFor(session, notices);
  spawnWorldTicket(session.engine, LEGENDARY_MANDATE_TICKET);
  return { session, driver, notices };
}

describe('the mandate arrives with empty rollback records', () => {
  it('seeds one rollback record per service, empty, and leaves the estate at its '
    + 'varied priors', () => {
    const { session } = mandateReady();

    // The mandate is open, nothing flattened yet.
    expect(ticketState(session, LEGENDARY_MANDATE_TICKET)).not.toBe('resolved');

    for (const entry of LEGENDARY_SERVICES) {
      // The service is at its deliberate prior, not Automatic.
      expect(startup(session, entry.service)).toBe(entry.prior);

      // The rollback record is the reused change_request, the rollback_record
      // variant, and it holds NO captured prior yet.
      const record = session.engine.graph.getNode(entry.record);
      expect(record?.kind).toBe('change_request');
      expect(record !== undefined && isRollbackRecord(record)).toBe(true);
      expect(rollback(session, entry.record)).toBeUndefined();
    }

    // The priors are genuinely varied - not one blanket value - which is what
    // makes the per-service captured record worth anything.
    expect(startup(session, HALCYON_IDS.telnet)).toBe(STARTUP_TYPES.disabled);
    expect(startup(session, HALCYON_IDS.remoteRegistry)).toBe(STARTUP_TYPES.disabled);
    expect(startup(session, HALCYON_IDS.modulesInstaller)).toBe(STARTUP_TYPES.manual);
  });
});

describe('implementing the mandate is a real state change (teeth c)', () => {
  it('flattens every service to Automatic, whichever way it is implemented', () => {
    const kept = mandateReady();
    expect(drivePath(kept.driver, LEGENDARY_MANDATE_TICKET, 'implement-with-rollback')
      .every(Boolean)).toBe(true);

    const skipped = mandateReady();
    expect(
      drivePath(skipped.driver, LEGENDARY_MANDATE_TICKET, 'implement-and-skip-rollback')
        .every(Boolean),
    ).toBe(true);

    for (const entry of LEGENDARY_SERVICES) {
      // The estate IS in the bad config after implementing, both ways.
      expect(startup(kept.session, entry.service)).toBe(STARTUP_TYPES.automatic);
      expect(startup(skipped.session, entry.service)).toBe(STARTUP_TYPES.automatic);
    }

    // And the mandate closes on the bad config alone - keeping the rollback is not
    // a clause of it.
    expect(ticketState(kept.session, LEGENDARY_MANDATE_TICKET)).toBe('resolved');
    expect(ticketState(skipped.session, LEGENDARY_MANDATE_TICKET)).toBe('resolved');
  });
});

describe('keeping vs skipping the rollback is a real captured-state difference '
  + '(teeth b)', () => {
  it('captures the exact per-service prior iff the rollback was kept', () => {
    const kept = mandateReady();
    drivePath(kept.driver, LEGENDARY_MANDATE_TICKET, 'implement-with-rollback');

    const skipped = mandateReady();
    drivePath(skipped.driver, LEGENDARY_MANDATE_TICKET, 'implement-and-skip-rollback');

    for (const entry of LEGENDARY_SERVICES) {
      // Kept: the record holds the REAL prior, copied off the live service before
      // the mandate overwrote it - and it is the service's own prior, not a
      // constant (Disabled for two, Manual for one).
      expect(rollback(kept.session, entry.record)).toBe(entry.prior);

      // Skipped: the record is empty. The two worlds read differently at the
      // record, which is the whole of what decides slice three.
      expect(rollback(skipped.session, entry.record)).toBeUndefined();
      expect(rollback(kept.session, entry.record))
        .not.toBe(rollback(skipped.session, entry.record));
    }
  });

  it('the modules installer captures Manual, not the Disabled the others hold - '
    + 'the record drives the restore, not a blanket value', () => {
    const kept = mandateReady();
    drivePath(kept.driver, LEGENDARY_MANDATE_TICKET, 'implement-with-rollback');

    expect(rollback(kept.session, 'changereq:halcyon-rollback-telnet'))
      .toBe(STARTUP_TYPES.disabled);
    expect(rollback(kept.session, 'changereq:halcyon-rollback-modules'))
      .toBe(STARTUP_TYPES.manual);
  });
});

describe('the manager leaves and the revert is raised', () => {
  it('raises the revert the minute the mandate closes, with the manager-leaves '
    + 'notice', () => {
    const { session, driver, notices } = mandateReady();

    // Before: no revert.
    expect(session.engine.graph.getNode(LEGENDARY_REVERT_TICKET)).toBeUndefined();

    drivePath(driver, LEGENDARY_MANDATE_TICKET, 'implement-with-rollback');

    // The day loop has raised the revert off the mandate being implemented.
    expect(ticketState(session, LEGENDARY_MANDATE_TICKET)).toBe('resolved');
    expect(session.engine.graph.getNode(LEGENDARY_REVERT_TICKET)).toBeDefined();
    expect(ticketState(session, LEGENDARY_REVERT_TICKET)).toBe('open');

    // And it is the manager-leaves beat, not the generic "same person, forty
    // minutes later" follow-up notice.
    const notice = notices.find((entry) => entry.body.includes(
      findWorldTicket(LEGENDARY_REVERT_TICKET)?.def.flavor.title ?? '',
    ));
    expect(notice?.title).toBe('The mandate is being reversed');
    expect(notice?.body).toContain('moved on to an exciting new opportunity');
  });

  it('normalises the estate to the mandated bad state, so the revert never arrives '
    + 'solved', () => {
    const { session, driver } = mandateReady();
    drivePath(driver, LEGENDARY_MANDATE_TICKET, 'implement-and-skip-rollback');

    // The revert is open with every service still Automatic - the fault it is
    // about is really there.
    expect(ticketState(session, LEGENDARY_REVERT_TICKET)).toBe('open');
    for (const entry of LEGENDARY_SERVICES) {
      expect(startup(session, entry.service)).toBe(STARTUP_TYPES.automatic);
    }
  });
});

describe('the revert is clean if the rollback was kept', () => {
  it('restores each service from its record in one step, and closes', () => {
    const { session, driver } = mandateReady();
    drivePath(driver, LEGENDARY_MANDATE_TICKET, 'implement-with-rollback');

    // The clean path: one restore per service, all accepted.
    expect(drivePath(driver, LEGENDARY_REVERT_TICKET, 'revert-from-rollback')
      .every(Boolean)).toBe(true);

    // Restored to the exact priors - including the Manual one - and closed.
    for (const entry of LEGENDARY_SERVICES) {
      expect(startup(session, entry.service)).toBe(entry.prior);
    }
    expect(startup(session, HALCYON_IDS.modulesInstaller)).toBe(STARTUP_TYPES.manual);
    expect(ticketState(session, LEGENDARY_REVERT_TICKET)).toBe('resolved');
  });
});

describe('the clean revert REQUIRES the record (teeth a)', () => {
  it('restoreFromRecord is refused on an empty record - so the clean path exists '
    + 'only where the rollback was kept', () => {
    const { session, driver } = mandateReady();
    // Skip the rollback: the records stay empty.
    drivePath(driver, LEGENDARY_MANDATE_TICKET, 'implement-and-skip-rollback');

    // The clean path is NOT available: every restore is refused because the record
    // holds no captured prior. This is the load-bearing guard - revert it and the
    // clean restore would run against an empty record and wrongly stand in for
    // keeping the rollback.
    const results = drivePath(driver, LEGENDARY_REVERT_TICKET, 'revert-from-rollback');
    expect(results.every((ok) => ok === false)).toBe(true);

    // And nothing was restored: the estate is still flattened, the ticket open.
    for (const entry of LEGENDARY_SERVICES) {
      expect(startup(session, entry.service)).toBe(STARTUP_TYPES.automatic);
    }
    expect(ticketState(session, LEGENDARY_REVERT_TICKET)).not.toBe('resolved');
  });

  it('restoreFromRecord is accepted on a captured record - the same verb, the '
    + 'record the only difference', () => {
    const { session, driver } = mandateReady();
    drivePath(driver, LEGENDARY_MANDATE_TICKET, 'implement-with-rollback');

    const first = LEGENDARY_SERVICES[0];
    if (first === undefined) {
      throw new Error('The arc ships no services.');
    }

    const result = driver.dispatch(
      HELPDESK_ACTIONS.restoreFromRecord,
      HALCYON_IDS.player,
      first.service,
      { [RECORD_PARAM]: first.record },
    );

    // Same verb as the refused world above; here it is accepted, because THIS
    // record holds a captured prior. The record is the whole of the difference.
    expect(result.ok).toBe(true);
    expect(startup(session, first.service)).toBe(first.prior);
  });
});

describe('the revert is painful but reachable if the rollback was skipped', () => {
  it('reconstructs each service by hand to the same end state - diligence is '
    + 'never the thing punished', () => {
    const { session, driver } = mandateReady();
    drivePath(driver, LEGENDARY_MANDATE_TICKET, 'implement-and-skip-rollback');

    // The clean path is unavailable (proven above); the reconstruct path is, and
    // it reaches the same restored state - so skipping the rollback costs the
    // reconstruction, never the ability to fix it.
    expect(
      drivePath(driver, LEGENDARY_REVERT_TICKET, 'revert-by-reconstruction')
        .every(Boolean),
    ).toBe(true);

    for (const entry of LEGENDARY_SERVICES) {
      expect(startup(session, entry.service)).toBe(entry.prior);
    }
    expect(ticketState(session, LEGENDARY_REVERT_TICKET)).toBe('resolved');
  });

  it('the reconstruct must set the Manual one Manual, not Disabled - the value '
    + 'the skipped record never held', () => {
    const { session, driver } = mandateReady();
    drivePath(driver, LEGENDARY_MANDATE_TICKET, 'implement-and-skip-rollback');

    // Reconstruct two of three, leaving the modules installer wrong (Disabled,
    // the value a lazy reconstruct might reach for): the revert does NOT close,
    // because the prior it needs is Manual. This is why the captured record - the
    // one thing that knew - is worth keeping.
    expect(driver.dispatch(
      HELPDESK_ACTIONS.serviceSetStartup,
      HALCYON_IDS.player,
      HALCYON_IDS.telnet,
      { [STARTUP_PARAM]: STARTUP_TYPES.disabled },
    ).ok).toBe(true);
    expect(driver.dispatch(
      HELPDESK_ACTIONS.serviceSetStartup,
      HALCYON_IDS.player,
      HALCYON_IDS.remoteRegistry,
      { [STARTUP_PARAM]: STARTUP_TYPES.disabled },
    ).ok).toBe(true);
    expect(driver.dispatch(
      HELPDESK_ACTIONS.serviceSetStartup,
      HALCYON_IDS.player,
      HALCYON_IDS.modulesInstaller,
      { [STARTUP_PARAM]: STARTUP_TYPES.disabled },
    ).ok).toBe(true);

    expect(ticketState(session, LEGENDARY_REVERT_TICKET)).not.toBe('resolved');

    // Set it to the RIGHT prior and it closes.
    expect(driver.dispatch(
      HELPDESK_ACTIONS.serviceSetStartup,
      HALCYON_IDS.player,
      HALCYON_IDS.modulesInstaller,
      { [STARTUP_PARAM]: STARTUP_TYPES.manual },
    ).ok).toBe(true);
    expect(ticketState(session, LEGENDARY_REVERT_TICKET)).toBe('resolved');
  });
});
