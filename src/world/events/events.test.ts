import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { HELPDESK_ACTIONS, WORLD_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { createWorldSession, type WorldSession } from '../session';
import { spawnWorldTicket } from '../tickets';
import {
  countEvents,
  encodeEvent,
  EVENT_IDS,
  EVENT_LOG_LIMIT,
  EVENT_SOURCES,
  type MachineEvent,
  machinesFor,
  readEventLog,
  withEvent,
} from './index';

beforeAll(() => {
  loadEngineForTests();
});

function event(overrides: Partial<MachineEvent> = {}): MachineEvent {
  return {
    tick: 12,
    level: 'error',
    source: EVENT_SOURCES.scm,
    id: EVENT_IDS.serviceCrashed,
    subject: COMPANY_IDS.spooler,
    message: 'The Print Spooler service terminated unexpectedly.',
    ...overrides,
  };
}

describe('the log a machine keeps', () => {
  it('reads back exactly what it wrote', () => {
    const log = readEventLog(withEvent('', event()));

    expect(log).toEqual([event()]);
    expect(encodeEvent(event()).startsWith('12|error|')).toBe(true);
  });

  it('keeps the newest thirty and drops the oldest', () => {
    let log = '';

    for (let tick = 0; tick < EVENT_LOG_LIMIT + 7; tick += 1) {
      log = withEvent(log, event({ tick }));
    }

    const read = readEventLog(log);
    expect(read).toHaveLength(EVENT_LOG_LIMIT);
    expect(read[0]?.tick).toBe(7);
    expect(read[EVENT_LOG_LIMIT - 1]?.tick).toBe(EVENT_LOG_LIMIT + 6);
  });

  /**
   * A bounded log that evicts by age alone is a diagnosis surface anything
   * repetitive can empty.
   *
   * Thirty reboots of PRINT-02 on a Wednesday afternoon - each of them a
   * perfectly legal, repeatable action - pushed Monday's power loss off the
   * end, and Thursday's ticket then asked the player to correlate two
   * timestamps of which the log could show one. So the bound stays and the
   * eviction is by WORTH: information first, oldest first, and the bad news
   * survives it.
   */
  it('throws away the noise before it throws away the evidence', () => {
    let log = withEvent('', event({
      tick: 0,
      level: 'error',
      id: EVENT_IDS.powerLost,
      subject: COMPANY_IDS.printer,
      message: 'It lost power without being shut down.',
    }));

    // Comfortably more benign rows than the whole window holds.
    for (let tick = 1; tick <= EVENT_LOG_LIMIT + 10; tick += 1) {
      log = withEvent(log, event({
        tick,
        level: 'information',
        id: EVENT_IDS.rebooted,
        message: 'The system has been restarted.',
      }));
    }

    const outage = withEvent(log, event({
      tick: 2_880,
      level: 'error',
      id: EVENT_IDS.powerLost,
      subject: COMPANY_IDS.printer,
      message: 'It lost power without being shut down. Again.',
    }));
    const read = readEventLog(outage);

    // Still bounded: this is in every save from here on.
    expect(read.length).toBeLessThanOrEqual(EVENT_LOG_LIMIT);
    // And the two timestamps the arc turns on are both still readable.
    expect(read.filter((entry) => entry.id === EVENT_IDS.powerLost)
      .map((entry) => entry.tick)).toEqual([0, 2_880]);
    // The noise is what went, oldest of it first.
    expect(read.some((entry) => entry.level === 'information')).toBe(true);
    expect(read.find((entry) => entry.level === 'information')?.tick)
      .toBeGreaterThan(1);
  });

  /** Warnings outrank information too, and errors outrank warnings' age. */
  it('drops the oldest of everything only once nothing cheaper is left', () => {
    let log = '';

    for (let tick = 0; tick < EVENT_LOG_LIMIT + 5; tick += 1) {
      log = withEvent(log, event({ tick, level: 'warning' }));
    }

    const read = readEventLog(log);
    expect(read).toHaveLength(EVENT_LOG_LIMIT);
    expect(read[0]?.tick).toBe(5);
  });

  /**
   * A save is a file on the player's machine and anything can have been at it.
   * A row that renders `undefined` is worse than one row shorter.
   */
  it('drops lines it cannot read rather than rendering nonsense', () => {
    const log = [
      encodeEvent(event()),
      'not|an|event',
      '',
      `nine|${'information'}|${EVENT_SOURCES.kernel}|1074|machine:x|text`,
      encodeEvent(event({ tick: 40, level: 'information' })),
    ].join('\n');

    expect(readEventLog(log).map((entry) => entry.tick)).toEqual([12, 40]);
    expect(readEventLog(null)).toEqual([]);
    expect(readEventLog('')).toEqual([]);
  });

  /** Separators inside a message would split a row into two half-rows. */
  it('scrubs anything that would break the row apart', () => {
    const log = readEventLog(withEvent('', event({
      message: 'It fell over | again\nand again',
    })));

    expect(log).toHaveLength(1);
    expect(log[0]?.message).toBe('It fell over   again and again');
  });

  it('counts what has already happened to the same thing', () => {
    const log = readEventLog([
      encodeEvent(event({ tick: 1 })),
      encodeEvent(event({ tick: 2, subject: COMPANY_IDS.vpn })),
      encodeEvent(event({ tick: 3 })),
    ].join('\n'));

    expect(countEvents(log, EVENT_IDS.serviceCrashed, COMPANY_IDS.spooler))
      .toBe(2);
    expect(countEvents(log, EVENT_IDS.serviceCrashed, COMPANY_IDS.vpn)).toBe(1);
    expect(countEvents(log, EVENT_IDS.rebooted, COMPANY_IDS.spooler)).toBe(0);
  });
});

describe('which box an event belongs to', () => {
  let session: WorldSession;

  beforeEach(() => {
    session = createWorldSession();
  });

  it('follows the estate rather than guessing', () => {
    const { graph } = session.engine;

    expect(machinesFor(graph, COMPANY_IDS.printServer))
      .toEqual([COMPANY_IDS.printServer]);
    // The spooler and the VPN are both on the print server, which is the whole
    // personality of this estate.
    expect(machinesFor(graph, COMPANY_IDS.spooler))
      .toEqual([COMPANY_IDS.printServer]);
    expect(machinesFor(graph, COMPANY_IDS.vpn))
      .toEqual([COMPANY_IDS.printServer]);
    expect(machinesFor(graph, COMPANY_IDS.printer))
      .toEqual([COMPANY_IDS.printServer]);
    expect(machinesFor(graph, COMPANY_IDS.garyAccount))
      .toEqual([COMPANY_IDS.garyMachine]);
    // Nobody has ever signed a workstation out to reception, so her lockouts
    // are written nowhere rather than on somebody else's box.
    expect(machinesFor(graph, COMPANY_IDS.bevAccount)).toEqual([]);
    expect(machinesFor(graph, COMPANY_IDS.printUsers)).toEqual([]);
    expect(machinesFor(graph, 'machine:imaginary')).toEqual([]);
  });
});

describe('the log the world writes for itself', () => {
  let session: WorldSession;

  const logOf = (machineId: string): readonly MachineEvent[] => readEventLog(
    session.engine.graph.getField(machineId, FIELDS.eventLog),
  );

  beforeEach(() => {
    session = createWorldSession();
  });

  /**
   * The fault arrives with the ticket's setup ops rather than with a button,
   * which is exactly why the log is written from graph mutations: a spooler
   * that was already down when the player sat down still fell over.
   */
  it('records a crash the moment the world breaks, spawn or not', () => {
    session.engine.advance(20);
    spawnWorldTicket(session.engine, 'ticket:wedged-spooler');

    const log = logOf(COMPANY_IDS.printServer);
    const crash = log.find((entry) => entry.id === EVENT_IDS.serviceCrashed);

    expect(crash?.level).toBe('error');
    expect(crash?.source).toBe(EVENT_SOURCES.scm);
    expect(crash?.tick).toBe(20);
    expect(crash?.subject).toBe(COMPANY_IDS.spooler);
    expect(crash?.message).toContain(
      'The Print Spooler service terminated unexpectedly. It has done this '
      + '1 time(s). It will do it again.',
    );

    // The queue piling up behind it is the printer's own complaint.
    const queue = log.find((entry) => entry.id === EVENT_IDS.printFailed);
    expect(queue?.level).toBe('warning');
    expect(queue?.message).toContain('47 queued');
  });

  /**
   * The whole scenario, in the world: an outage, a busy afternoon on the same
   * box, and a second outage two days later that still has something to be
   * correlated with.
   *
   * A reboot is repeatable and it is logged, so thirty of them used to be a
   * way of destroying the only evidence the week's two-day arc has - and
   * nothing about doing it looks like sabotage from the inside.
   */
  it('keeps two outages readable across thirty reboots between them', () => {
    const cut = (): void => {
      session.engine.dispatch(
        WORLD_ACTIONS.powerCut,
        COMPANY_IDS.player,
        COMPANY_IDS.warehousePrinter,
        {},
      );
    };
    const restore = (): void => {
      session.engine.dispatch(
        HELPDESK_ACTIONS.devicePowerCycle,
        COMPANY_IDS.player,
        COMPANY_IDS.warehousePrinter,
        {},
      );
    };

    session.engine.advance(10);
    cut();
    restore();

    for (let round = 0; round < EVENT_LOG_LIMIT + 5; round += 1) {
      session.engine.advance(1);
      session.engine.dispatch(
        HELPDESK_ACTIONS.machineReboot,
        COMPANY_IDS.player,
        COMPANY_IDS.warehousePrintServer,
        {},
      );
    }

    session.engine.advance(2_880);
    cut();

    const outages = logOf(COMPANY_IDS.warehousePrintServer)
      .filter((entry) => entry.id === EVENT_IDS.powerLost);

    expect(outages).toHaveLength(2);
    expect(outages[0]?.tick).toBe(10);
    expect(logOf(COMPANY_IDS.warehousePrintServer).length)
      .toBeLessThanOrEqual(EVENT_LOG_LIMIT);
  });

  /** The count IS the diagnosis: four crashes is a timetable, not a mystery. */
  it('counts how many times the same thing has fallen over', () => {
    spawnWorldTicket(session.engine, 'ticket:wedged-spooler');

    for (let round = 0; round < 2; round += 1) {
      session.engine.advance(60);
      session.engine.dispatch(
        HELPDESK_ACTIONS.printerClearQueue,
        COMPANY_IDS.player,
        COMPANY_IDS.printer,
        {},
      );
      session.engine.dispatch(
        HELPDESK_ACTIONS.serviceRestart,
        COMPANY_IDS.player,
        COMPANY_IDS.spooler,
        {},
      );
      session.engine.applySetup([
        {
          op: 'setField',
          id: COMPANY_IDS.spooler,
          field: FIELDS.status,
          value: 'wedged',
        },
      ]);
    }

    const crashes = logOf(COMPANY_IDS.printServer)
      .filter((entry) => entry.id === EVENT_IDS.serviceCrashed);

    expect(crashes).toHaveLength(3);
    expect(crashes[1]?.message).toContain('2 time(s)');
    expect(crashes[2]?.message).toContain('3 time(s)');

    // And coming back up is information rather than an error, so a level
    // filter separates "it broke" from "somebody fixed it".
    const back = logOf(COMPANY_IDS.printServer)
      .filter((entry) => entry.id === EVENT_IDS.serviceRunning);
    expect(back).toHaveLength(2);
    expect(back[0]?.level).toBe('information');
  });

  it('records lockouts, unlocks and resets on the desk they happened at', () => {
    session.engine.advance(5);
    session.engine.dispatch(
      HELPDESK_ACTIONS.accountUnlock,
      COMPANY_IDS.player,
      COMPANY_IDS.garyAccount,
      {},
    );
    session.engine.dispatch(
      HELPDESK_ACTIONS.accountResetPassword,
      COMPANY_IDS.player,
      COMPANY_IDS.garyAccount,
      {},
    );

    // The whole story, in order, on the desk it happened at: five failures,
    // the door shutting, somebody opening it again, and the reset after.
    const log = logOf(COMPANY_IDS.garyMachine);
    expect(log.map((entry) => entry.id)).toEqual([
      EVENT_IDS.logonFailed,
      EVENT_IDS.accountLocked,
      EVENT_IDS.accountUnlocked,
      EVENT_IDS.passwordReset,
    ]);
    expect(log[0]?.level).toBe('warning');
    expect(log[0]?.source).toBe(EVENT_SOURCES.security);
    expect(log[0]?.message).toContain('Bad password count is now 5');
    expect(log[1]?.level).toBe('warning');
    expect(log[1]?.message).toContain('gpoole');
    expect(log[2]?.tick).toBe(5);
    // Somebody else's desk knows nothing about it.
    expect(logOf(COMPANY_IDS.adaMachine)).toEqual([]);
  });

  it('records a reboot on the machine that had one', () => {
    session.engine.advance(9);
    session.engine.dispatch(
      HELPDESK_ACTIONS.machineReboot,
      COMPANY_IDS.player,
      COMPANY_IDS.adaMachine,
      {},
    );

    const log = logOf(COMPANY_IDS.adaMachine);
    expect(log).toHaveLength(1);
    expect(log[0]?.id).toBe(EVENT_IDS.rebooted);
    expect(log[0]?.tick).toBe(9);
    expect(log[0]?.message).toContain('SALES-02');
  });

  /**
   * The load-bearing one for the recurring arc: the dispatch log is drained at
   * every day boundary, and a fault that shows as two outages four days apart
   * is unreadable from a machine that forgets overnight.
   */
  it('still knows about yesterday after the log has been checkpointed', () => {
    spawnWorldTicket(session.engine, 'ticket:wedged-spooler');
    const crashedAt = logOf(COMPANY_IDS.printServer)[0];
    expect(crashedAt?.id).toBe(EVENT_IDS.serviceCrashed);

    // A whole day goes past. Nobody fixes it, so the agent has something to
    // say about the service level as well.
    session.engine.advance(1_440);
    session.engine.checkpoint();
    const before = logOf(COMPANY_IDS.printServer);

    expect(session.engine.dispatchLog()).toHaveLength(0);
    // Yesterday's crash is still the first line of it, which is the whole
    // reason a recurring fault is readable at all.
    expect(before[0]).toEqual(crashedAt);
    expect(before.some((entry) => entry.id === EVENT_IDS.slaMissed)).toBe(true);

    // And a save carries it, because it is a field like any other.
    const saved = session.engine.serialize();
    const reloaded = createWorldSession();
    reloaded.engine.restore(saved);
    expect(readEventLog(
      reloaded.engine.graph.getField(COMPANY_IDS.printServer, FIELDS.eventLog),
    )).toEqual(before);
  });

  it('never writes the fact that it is writing', () => {
    spawnWorldTicket(session.engine, 'ticket:wedged-spooler');

    for (const entry of logOf(COMPANY_IDS.printServer)) {
      expect(entry.subject).not.toBe(COMPANY_IDS.printServer);
      expect(entry.message).not.toContain('event_log');
    }
  });
});
