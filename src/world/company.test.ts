import { describe, expect, it } from 'vitest';

import {
  NODE_KINDS,
  type ReadOnlyGraphView,
  WasmEngine,
} from '../engine-api';
import {
  companyInstallPolicy,
  companySetup,
  COMPANY_IDS,
  DEFAULT_INSTALL_POLICY,
  readInstallPolicy,
} from './company';
import {
  FIELDS,
  isService,
  MACHINE_OS,
  machineOsOf,
  MACHINE_ROLES,
  machineRoleOf,
  SERVICE_CLASSES,
  serviceClassOf,
  SERVICE_STATUS,
  STARTUP_TYPES,
  startupTypeOf,
  SYSTEMD_STATES,
} from './fields';
import { BASELINE_SERVICES, BASELINE_UNITS } from './services';

/** The seed applied by the engine that will run it, and read back through it. */
function seededEngine(): WasmEngine {
  const engine = new WasmEngine(1);
  engine.applySetup(companySetup());
  return engine;
}

function seeded(): ReadOnlyGraphView {
  return seededEngine().graph;
}

describe('company world', () => {
  it('seeds the same world every time', () => {
    expect(seededEngine().snapshotHash())
      .toBe(seededEngine().snapshotHash());
  });

  it('staffs the office and equips it', () => {
    const graph = seeded();
    const counts = Object.fromEntries(
      NODE_KINDS.map((kind) => [kind, graph.nodesOfKind(kind).length]),
    );

    // Seventeen people, because a week of twenty-odd tickets is a week in a
    // building with people in it: sixteen who report something and one leaver
    // who reports nothing and is the cause of a Wednesday.
    //
    // And three hundred-odd services, because fourteen boxes each run the
    // twenty-odd their role says they run. That number is the point rather
    // than the cost of it: a services list with one thing on it had already
    // done the player's diagnosis for them.
    //
    // The two hundred directories and files are the drives, from the same
    // table and for the same reason: fourteen boxes built from one image, plus
    // what each role adds and a profile for whoever logs on there.
    //
    // Thirty-three of them arrived with 0.2.4 and all thirty-three are seeded
    // rather than moved by anything: every one of the fourteen boxes gained
    // the temp directory the image has always made and the build log the image
    // left in it (fourteen directories, fourteen files), and the one
    // workstation that runs the pallet scanner gained the three directories
    // that software writes into and the two files it wrote (three, and two).
    // The twelve monthly exports on that box are NOT files: they are a listing
    // on the directory itself, because a file's size here is what `type` would
    // print and thirty megabytes of barcodes is not something to print.
    //
    // 0.7.0 makes the estate heterogeneous, and every number below that moved,
    // moved for that and only that:
    //  - machine 14 -> 17: the IIS intranet box (INTRA-01), the Linux product
    //    box (APP-01) and its database (DB-01).
    //  - service 324 -> 350: +25 on the IIS box (the server baseline plus the
    //    W3SVC/WAS/AppHostSvc web stack) and +1 on the DC (DFSR, SYSVOL
    //    replication named honestly beside the legacy FRS). The two Linux boxes
    //    add no services - they run units.
    //  - unit 0 -> 10: five systemd units each on APP-01 and DB-01, a new kind
    //    the estate did not have. Real data on real boxes, not readable by the
    //    SD player's Windows tools yet.
    //  - directory 153 -> 161, file 80 -> 85: the IIS box is Windows and gained
    //    the standard C: image (its root and the base directories/files every
    //    box is imaged with). The Linux boxes have no Windows drive and add none.
    expect(counts).toEqual({
      person: 17,
      account: 17,
      machine: 17,
      device: 5,
      service: 350,
      unit: 10,
      // No customers in the in-house probation estate: the customer dimension
      // (0.8.0) belongs to the MSP employer, and this count is 0 here for the
      // same reason every probation golden is untouched - it is purely additive.
      customer: 0,
      // No change requests either: the CR authorisation moment (0.10.0) is filed
      // by the player against out-of-scope MSP work, and the in-house estate has
      // none - 0 here for the same additive reason the customer count is.
      change_request: 0,
      share: 2,
      group: 3,
      mail_rule: 2,
      ticket: 0,
      directory: 161,
      file: 85,
    });
  });

  /**
   * The baseline, per role, and the two rules that keep it honest.
   *
   * Every service on every box carries the four facts a real services list
   * shows, and no box runs two of anything: the print server's spooler and the
   * file server's Server service are named services that the baseline must not
   * seed a second copy of.
   */
  it('runs a real service list on every box, with no duplicates on any', () => {
    const graph = seeded();

    for (const machine of graph.nodesOfKind('machine')) {
      const attached = graph.neighbors(machine.id, {
        direction: 'in',
        edgeKind: 'runs_on',
      });
      const role = machineRoleOf(machine.fields[FIELDS.machineRole]);
      const os = machineOsOf(machine.fields[FIELDS.machineOs]);

      // A machine role every box declares, and an OS to go with it.
      expect(Object.values(MACHINE_ROLES)).toContain(role);

      // A Linux box runs systemd units, not Windows services - a different kind
      // with different words, and none of the Windows service assertions apply.
      if (os === MACHINE_OS.linux) {
        const units = attached;
        const unitNames = units
          .map((unit) => unit.fields[FIELDS.unitName])
          .filter((name): name is string => typeof name === 'string');

        expect(units.length, machine.id)
          .toBeGreaterThanOrEqual((BASELINE_UNITS[role] ?? []).length);
        expect(new Set(unitNames).size, machine.id).toBe(unitNames.length);

        for (const unit of units) {
          expect(unit.kind, unit.id).toBe('unit');
          expect(typeof unit.fields[FIELDS.unitName], unit.id).toBe('string');
          expect(Object.values(SYSTEMD_STATES), unit.id)
            .toContain(unit.fields[FIELDS.unitState]);
        }

        continue;
      }

      const services = attached;
      const shorts = services
        .map((service) => service.fields[FIELDS.serviceName])
        .filter((short): short is string => typeof short === 'string');

      // A list long enough to have to be read rather than glanced at.
      expect(services.length, machine.id)
        .toBeGreaterThanOrEqual((BASELINE_SERVICES[role] ?? []).length);
      expect(new Set(shorts).size, machine.id).toBe(shorts.length);

      for (const service of services) {
        const kind = serviceClassOf(service.fields[FIELDS.serviceClass]);

        expect(typeof service.fields[FIELDS.name], service.id).toBe('string');
        expect(
          Object.values(SERVICE_STATUS),
          service.id,
        ).toContain(service.fields[FIELDS.status]);

        // Anything the service manager knows about has both of the facts a
        // services list prints; the fan and the licence pool have neither,
        // which is exactly why they are not in the table.
        if (isService(service.fields[FIELDS.serviceClass])) {
          expect(typeof service.fields[FIELDS.serviceName], service.id)
            .toBe('string');
          expect(
            startupTypeOf(service.fields[FIELDS.startupType]),
            service.id,
          ).not.toBeNull();
        } else {
          expect([
            SERVICE_CLASSES.hardware,
            SERVICE_CLASSES.appliance,
          ], service.id).toContain(kind);
        }
      }
    }
  });

  /**
   * The list is noise with one signal in it, and both halves have to be there:
   * services that are stopped ON PURPOSE - Manual, Disabled - so that a
   * stopped service is not automatically a fault, and Automatic ones that are
   * running so that one which is not stands out.
   */
  it('seeds a baseline that is stable, and stopped in the honest places', () => {
    const graph = seeded();
    const desk = graph.neighbors(COMPANY_IDS.playerMachine, {
      direction: 'in',
      edgeKind: 'runs_on',
    });
    const startups = new Set(
      desk.map((service) => service.fields[FIELDS.startupType]),
    );

    expect(startups).toContain(STARTUP_TYPES.automatic);
    expect(startups).toContain(STARTUP_TYPES.delayed);
    expect(startups).toContain(STARTUP_TYPES.manual);
    expect(startups).toContain(STARTUP_TYPES.disabled);

    // Nothing Automatic is stopped on a box with no ticket about it: an
    // Automatic service that is down is the line a player is meant to find,
    // and a seed that scattered them would be a seed that cries wolf.
    for (const service of desk) {
      if (service.fields[FIELDS.startupType] === STARTUP_TYPES.automatic) {
        expect(service.fields[FIELDS.status], service.id)
          .toBe(SERVICE_STATUS.running);
      }

      if (service.fields[FIELDS.startupType] === STARTUP_TYPES.disabled) {
        expect(service.fields[FIELDS.status], service.id)
          .toBe(SERVICE_STATUS.stopped);
      }
    }
  });

  /** A domain with no domain controller is a building where nobody logs on. */
  it('puts the directory on a domain controller that is really there', () => {
    const graph = seeded();
    const dc = graph.getNode(COMPANY_IDS.domainController);

    expect(dc?.fields[FIELDS.hostname]).toBe('DC-01');
    expect(machineRoleOf(dc?.fields[FIELDS.machineRole]))
      .toBe(MACHINE_ROLES.domainController);

    const shorts = graph
      .neighbors(COMPANY_IDS.domainController, {
        direction: 'in',
        edgeKind: 'runs_on',
      })
      .map((service) => service.fields[FIELDS.serviceName]);

    for (const service of ['NTDS', 'kdc', 'DNS', 'Netlogon']) {
      expect(shorts, service).toContain(service);
    }
  });

  /**
   * The one account that starts switched off, and why that is not a fault.
   *
   * Everything else broken in this game arrives with the ticket that is about
   * it. Colin Peach left in April and the leavers process did its job the same
   * afternoon - the account is correct, the audit trail is clean, and the seat
   * of the accounts suite he is still holding is what stops somebody's first
   * morning six months later.
   */
  it('keeps the leaver switched off and still holding a seat', () => {
    const graph = seeded();

    expect(graph.getField(COMPANY_IDS.colinAccount, FIELDS.enabled)).toBe(false);
    expect(graph.getField(COMPANY_IDS.colinAccount, FIELDS.licence)).toBe(true);
    expect(graph.getField(COMPANY_IDS.suiteLicences, FIELDS.seatsFree)).toBe(0);
    // And the new starter has neither, which is the ticket rather than the
    // seed being unkind: nobody has been able to give him one.
    expect(graph.getField(COMPANY_IDS.robAccount, FIELDS.licence))
      .toBeUndefined();
    expect(graph.getField(COMPANY_IDS.robAccount, FIELDS.enabled)).toBe(true);
  });

  it('gives every account exactly one owner and one username', () => {
    const graph = seeded();

    for (const account of graph.nodesOfKind('account')) {
      const owners = graph.neighbors(account.id, {
        direction: 'in',
        edgeKind: 'owns',
      });

      expect(owners).toHaveLength(1);
      expect(typeof account.fields[FIELDS.username]).toBe('string');
      expect(typeof account.fields[FIELDS.locked]).toBe('boolean');
    }
  });

  it('plugs every device into a machine and every service onto one', () => {
    const graph = seeded();

    for (const device of graph.nodesOfKind('device')) {
      expect(
        graph.neighbors(device.id, {
          direction: 'out',
          edgeKind: 'connected_to',
        }),
      ).toHaveLength(1);
    }

    for (const service of graph.nodesOfKind('service')) {
      expect(
        graph.neighbors(service.id, { direction: 'out', edgeKind: 'runs_on' }),
      ).toHaveLength(1);
    }
  });

  it('keeps a boss node and a player node with real names', () => {
    const graph = seeded();

    expect(graph.getField(COMPANY_IDS.boss, FIELDS.name)).toBe('Desmond Frisk');
    expect(graph.getField(COMPANY_IDS.boss, FIELDS.title)).toBe(
      'Service Delivery Lead',
    );
    expect(graph.getField(COMPANY_IDS.player, FIELDS.name)).toBe('Pat Pending');
  });

  /**
   * The seed is a WORKING building. Every account fault in this game arrives
   * with the ticket that is about it - which is what puts a lockout in the
   * machine's event log at the minute it happened, instead of before the world
   * started - so the payroll clerk is unlocked here and locked by his ticket.
   */
  it('seeds accounts that work, with the lockout story ready to be told', () => {
    const graph = seeded();

    expect(graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked)).toBe(false);
    expect(graph.getField(COMPANY_IDS.garyAccount, FIELDS.enabled)).toBe(true);
    expect(graph.getField(COMPANY_IDS.garyAccount, FIELDS.passwordExpired))
      .toBe(false);
    expect(graph.getField(COMPANY_IDS.garyAccount, FIELDS.badPwCount)).toBe(0);
    expect(graph.getField(COMPANY_IDS.garyAccount, FIELDS.pwMustChange))
      .toBe(false);
    // Two weeks away: he has not signed in since before this log starts, and
    // an absent last logon says so honestly where a made-up date would not.
    expect(graph.getField(COMPANY_IDS.garyAccount, FIELDS.lastLogon))
      .toBeUndefined();
    expect(graph.getField(COMPANY_IDS.playerAccount, FIELDS.lastLogon)).toBe(0);

    expect(
      graph
        .neighbors(COMPANY_IDS.garyAccount, {
          direction: 'out',
          edgeKind: 'has_access',
        })
        .map(({ id }) => id),
    ).toEqual([]);
  });
});

describe('the employer install policy', () => {
  it('is locked down for the probation employer', () => {
    // The forbidden path is this slice's teaching, so the probation shop has to
    // be the strict one. Flip this to wild_west and the audit stops costing
    // anything, which is the trap the whole mechanic is built to avoid.
    expect(companyInstallPolicy()).toBe('locked_down');
  });

  it('reads a missing or unknown policy as the strict default', () => {
    expect(DEFAULT_INSTALL_POLICY).toBe('locked_down');
    expect(readInstallPolicy(undefined)).toBe('locked_down');
    expect(readInstallPolicy('anarchy')).toBe('locked_down');
    expect(readInstallPolicy('wild_west')).toBe('wild_west');
  });
});
