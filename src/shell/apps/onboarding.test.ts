/**
 * Customer onboarding + the discovery horror, proven through the REAL path
 * (0.13.0, the MSP arc's capstone).
 *
 * The 0.6.0 lesson - wiring bugs ship past a green unit suite when the test
 * builds state directly - so this drives the ACTUAL machinery a player hits: the
 * shipped `DayDriver` running the shipped MSP week, and `executeCommand(
 * parseCommand(...))` against the world it stands up. It asserts the OUTCOMES the
 * slice promises, not that a function returned ok:
 *
 *  - the onboarding event fires ON ITS DAY (Wednesday, mid-shift), not at Monday
 *    boot - so the MSP world is byte-identical to 0.12.0 until the client signs;
 *  - the discovery audit enumerates the new customer's REAL estate off the graph,
 *    matching exactly what the event seeded;
 *  - the horror - a backup reporting success it cannot restore from - is a REAL
 *    field on the estate node, surfaced by the audit reading it;
 *  - raising it (the escalate the arc reuses) resolves the discovery ticket.
 *
 * TEETH: the horror is surfaced BECAUSE `backup_verified` is false. Flip the node
 * healthy and the audit's finding is gone - the assertion proving that is what
 * stops the finding being a decorative string.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { AppStateStore } from '../app-state';
import { DayDriver, TICK_INTERVAL_MS } from '../day-driver';
import { loadEngineForTests } from '../../engine-api/load-node';
import {
  createWorldSession,
  type WeekCarry,
  type WorldSession,
} from '../../world/session';
import { employerFor } from '../../world/employers';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { FIELDS, SERVICE_STATUS } from '../../world/fields';
import { shiftEndTick, tickAtMinute } from '../../world/day';
import { MSP_CUSTOMERS, MSP_IDS } from '../../world/msp-company';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import type { GameApi } from './types';

beforeAll(() => {
  loadEngineForTests();
});

/** A career crossing into the MSP, fresh - the same carry the arc's specs use. */
const MSP_CARRY: WeekCarry = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

/** The day the client signs, and the minute the event stands them up. */
const ONBOARDING_DAY = 3;
const ONBOARDING_MINUTE = 10 * 60;
/** The discovery ticket's drip minute, twenty past - once there is an estate. */
const DISCOVERY_DRIP_MINUTE = 10 * 60 + 20;

interface Week {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly appState: AppStateStore;
  readonly notices: { title: string; body: string }[];
}

/** An MSP world with the shipped driver running the shipped MSP week. */
function startMspWeek(): Week {
  const session = createWorldSession(MSP_CARRY);
  const msp = employerFor('msp');
  const appState = new AppStateStore();
  const notices: { title: string; body: string }[] = [];
  const driver = new DayDriver(
    session.engine,
    MSP_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
      onNotice: (title, body) => notices.push({ title, body }),
    },
    // The driver deals the REAL MSP week, rooms and ping flag off the employer -
    // the same threading the shell does off the session (the 0.6.0 de-global
    // lesson), so the onboarding slot the week authors actually fires.
    undefined,
    msp.week,
    msp.channels,
    msp.runsBossPings,
  );

  return { session, driver, appState, notices };
}

/** A terminal GameApi over this world, the way the shell wires one. */
function apiFor(world: Week): GameApi {
  return {
    graph: world.session.engine.graph,
    appState: world.appState,
    day: world.driver,
    dispatch: (id, actor, target, params) => world.session.engine.dispatch(
      id,
      actor,
      target,
      params,
    ),
    dispatchLog: () => world.session.engine.dispatchLog(),
    clock: {
      now: () => world.session.engine.now(),
      onTick: (listener) => world.session.engine.onTick(listener),
    },
    onWorldChange: (listener) => world.session.engine.onEvent(() => {
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

function run(world: Week, input: string): string {
  return executeCommand(parseCommand(input), apiFor(world)).lines.join('\n');
}

/** Steps the clock to a tick of the current day, one minute at a time. */
function runTo(world: Week, tick: number): void {
  while (
    world.session.engine.now() < tick
    && world.driver.state() === 'shift'
  ) {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

/** Plays the days before the onboarding, then opens the Wednesday shift. */
function openOnboardingDay(world: Week): void {
  for (let day = 1; day < ONBOARDING_DAY; day += 1) {
    expect(world.driver.day()).toBe(day);
    world.driver.startShift();
    runTo(world, shiftEndTick(day));
    world.driver.clockOff();
  }

  expect(world.driver.day()).toBe(ONBOARDING_DAY);
  world.driver.startShift();
}

describe('the onboarding event fires on its day, not at Monday boot', () => {
  it('is absent all the way to its minute, then stands the estate up', () => {
    const world = startMspWeek();

    // Monday boot: the MSP world is 0.12.0's. The customer that signs Wednesday
    // does not exist yet, and the ones that were always there do - the additive
    // claim, at the moment it has to hold.
    expect(world.session.engine.graph.getNode(MSP_CUSTOMERS.tillman))
      .toBeUndefined();
    expect(world.session.engine.graph.getNode(MSP_CUSTOMERS.northwind))
      .toBeDefined();

    openOnboardingDay(world);

    // The minute BEFORE the event: still nothing. Monday and Tuesday came and
    // went and did not stand it up, and neither has Wednesday morning.
    const eventTick = tickAtMinute(ONBOARDING_DAY, ONBOARDING_MINUTE);
    runTo(world, eventTick - 1);
    expect(world.session.engine.graph.getNode(MSP_CUSTOMERS.tillman))
      .toBeUndefined();

    // Crossing the minute stands the whole estate up and announces it.
    runTo(world, eventTick);
    expect(world.session.engine.graph.getNode(MSP_CUSTOMERS.tillman))
      .toBeDefined();
    for (const id of [
      MSP_IDS.tillmanContact,
      MSP_IDS.tillmanReception,
      MSP_IDS.tillmanYardPc,
      MSP_IDS.tillmanServer,
      MSP_IDS.tillmanBackup,
    ]) {
      expect(world.session.engine.graph.getNode(id), id).toBeDefined();
    }

    expect(world.notices.some(
      (notice) => notice.title.includes('TILLMAN-FREIGHT'),
    )).toBe(true);
  });

  it('seeds the backup already failing silently - running, unverified', () => {
    const world = startMspWeek();
    openOnboardingDay(world);
    runTo(world, tickAtMinute(ONBOARDING_DAY, ONBOARDING_MINUTE));

    // The whole horror, as estate state: the job is RUNNING (green on any board
    // that reads status) and has not verified a restore. Two facts, one true and
    // one damning, on the one node.
    expect(world.session.engine.graph.getField(MSP_IDS.tillmanBackup, FIELDS.status))
      .toBe(SERVICE_STATUS.running);
    expect(world.session.engine.graph.getField(
      MSP_IDS.tillmanBackup,
      FIELDS.backupVerified,
    )).toBe(false);
  });

  it('stands the same estate up deterministically across two runs', () => {
    const first = startMspWeek();
    const second = startMspWeek();

    for (const world of [first, second]) {
      openOnboardingDay(world);
      runTo(world, tickAtMinute(ONBOARDING_DAY, ONBOARDING_MINUTE));
    }

    // No RNG, no clock read: the estate the event applies is authored data, so
    // two worlds driven identically to the same minute are byte-identical.
    expect(first.session.engine.snapshotHash())
      .toBe(second.session.engine.snapshotHash());
  });
});

describe('the discovery audit enumerates the real estate and finds the horror', () => {
  function auditedWorld(): Week {
    const world = startMspWeek();
    openOnboardingDay(world);
    runTo(world, tickAtMinute(ONBOARDING_DAY, ONBOARDING_MINUTE));
    return world;
  }

  it('lists exactly the machines the event seeded', () => {
    const world = auditedWorld();
    const output = run(world, 'audit customer:tillman');

    expect(output).toContain('TILLMAN-FREIGHT');
    // The map you did not have: every seeded box, read off the wire.
    expect(output).toContain('TILL-WS-01');
    expect(output).toContain('TILL-WS-02');
    expect(output).toContain('TILL-SRV-01');
    // And the contract it reads off the customer node.
    expect(output).toContain('Fully managed');
  });

  it('surfaces the silently-failing backup, read off the estate node', () => {
    const world = auditedWorld();
    const output = run(world, 'audit customer:tillman');

    expect(output).toContain('FINDINGS');
    expect(output).toContain('failing silently');
    // It names the real service and the stale date it read, not a slogan.
    expect(output).toContain('wbengine');
    expect(output).toContain('2025-11-09');
  });

  it('TEETH: flip the backup verified and the finding is gone', () => {
    const world = auditedWorld();

    // Same command, one field changed on the estate. The horror was a read of
    // the node, so making the node healthy makes the finding disappear - which
    // is the proof it was never a printed string.
    world.session.engine.applySetup([
      {
        op: 'setField',
        id: MSP_IDS.tillmanBackup,
        field: FIELDS.backupVerified,
        value: true,
      },
    ]);

    const output = run(world, 'audit customer:tillman');
    expect(output).not.toContain('failing silently');
    expect(output).toContain('Nothing flagged');
  });
});

describe('raising the finding resolves the discovery ticket the honest way', () => {
  it('the ticket drips after the estate exists, and escalate closes it', () => {
    const world = startMspWeek();
    openOnboardingDay(world);
    // Past the drip: the discovery ticket lands once there is a client to
    // audit. Run to the minute the SCHEDULE puts it on rather than to the
    // minute the week authors, because a drip wanders either side of its slot
    // by up to twelve minutes and which way it wanders is a property of the
    // seed - the claim here is that the ticket arrives AFTER the client does,
    // which is asserted, and not that it arrives on any particular minute.
    const dripped = world.driver.schedule().arrivals.find(
      (arrival) => arrival.ticketId === 'ticket:tillman-backup-discovery',
    );

    expect(dripped?.tick).toBeGreaterThan(
      tickAtMinute(ONBOARDING_DAY, ONBOARDING_MINUTE),
    );
    runTo(world, dripped?.tick ?? tickAtMinute(
      ONBOARDING_DAY,
      DISCOVERY_DRIP_MINUTE,
    ));

    expect(world.session.engine.ticketState('ticket:tillman-backup-discovery'))
      .toBe('open');

    // The honest onboarding move is to RAISE it - the escalate the arc reuses,
    // driven at the same dispatch a player hits. It closes the ticket.
    const escalate = world.session.engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      MSP_IDS.player,
      'ticket:tillman-backup-discovery',
      {
        reported: 'TILL-SRV-01 backup reports success but has no verified '
          + 'restore point in months - failing silently.',
        tried: 'Ran discovery on the estate\n'
          + 'Read the backup off the node: running, backup_verified false',
      },
    );

    expect(escalate.ok).toBe(true);
    expect(world.session.engine.ticketState('ticket:tillman-backup-discovery'))
      .toBe('resolved');
  });
});
