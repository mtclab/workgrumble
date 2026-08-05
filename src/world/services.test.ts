import { describe, expect, it } from 'vitest';

import {
  MACHINE_ROLES,
  SERVICE_CLASSES,
  SERVICE_STATUS,
  serviceClassOf,
  STARTUP_TYPES,
  SYSTEMD_STATES,
  UNIT_ENABLEMENTS,
  isRestartable,
  isService,
  startupTypeOf,
} from './fields';
import {
  BASELINE_SERVICES,
  baselineServiceId,
  BASELINE_UNITS,
  linuxUnitId,
} from './services';

/** The Windows roles - the only ones the Windows service baseline covers. */
const WINDOWS_ROLES = [
  MACHINE_ROLES.workstation,
  MACHINE_ROLES.printServer,
  MACHINE_ROLES.fileServer,
  MACHINE_ROLES.domainController,
  MACHINE_ROLES.iisServer,
] as const;

/**
 * The baseline is content, and content this dull has to be checked like
 * content: real names, one of each, and a list per role that differs from the
 * others by the services that role actually adds.
 */
describe('the baseline services', () => {
  it('gives every role a list long enough to have to be read', () => {
    for (const role of WINDOWS_ROLES) {
      const services = BASELINE_SERVICES[role] ?? [];

      // "A real workstation runs dozens of services, and finding the broken
      // one among them IS the first-line skill" - the owner, playing the
      // build that listed one.
      expect(services.length, role).toBeGreaterThanOrEqual(20);

      const shorts = services.map((service) => service.service);
      const names = services.map((service) => service.name);

      expect(new Set(shorts).size, role).toBe(shorts.length);
      expect(new Set(names).size, role).toBe(names.length);

      for (const service of services) {
        expect(service.service, role).toMatch(/^[A-Za-z0-9]+$/u);
        expect(service.name.length, service.service).toBeGreaterThan(2);
        expect(startupTypeOf(service.startup), service.service).not.toBeNull();
        expect(
          Object.values(SERVICE_STATUS),
          service.service,
        ).toContain(service.status);
      }
    }
  });

  it('sorts each list the way a services window opens', () => {
    for (const role of WINDOWS_ROLES) {
      const names = (BASELINE_SERVICES[role] ?? []).map((service) => service.name);

      expect(names, role).toEqual([...names].sort(
        (left, right) => left.localeCompare(right),
      ));
    }
  });

  /**
   * Each server role is the workstation list plus what that role is FOR. A
   * domain controller with no directory service, or a print server with no
   * print stack, would be a machine kind in name only.
   */
  it('adds what each role is actually for', () => {
    const shortsOf = (role: keyof typeof BASELINE_SERVICES): readonly string[] =>
      (BASELINE_SERVICES[role] ?? []).map((service) => service.service);

    expect(shortsOf(MACHINE_ROLES.printServer)).toContain('LPDSVC');
    expect(shortsOf(MACHINE_ROLES.fileServer)).toContain('Dfs');
    expect(shortsOf(MACHINE_ROLES.domainController)).toContain('NTDS');
    expect(shortsOf(MACHINE_ROLES.domainController)).toContain('kdc');
    // The AD box names the directory, Kerberos and SYSVOL replication honestly.
    expect(shortsOf(MACHINE_ROLES.domainController)).toContain('DFSR');
    // The IIS box runs the web stack, dependency and all.
    expect(shortsOf(MACHINE_ROLES.iisServer)).toContain('W3SVC');
    expect(shortsOf(MACHINE_ROLES.iisServer)).toContain('WAS');
    expect(shortsOf(MACHINE_ROLES.iisServer)).toContain('AppHostSvc');
    // And the workstation list has none of them.
    expect(shortsOf(MACHINE_ROLES.workstation)).not.toContain('NTDS');
    expect(shortsOf(MACHINE_ROLES.workstation)).not.toContain('Dfs');
    expect(shortsOf(MACHINE_ROLES.workstation)).not.toContain('W3SVC');
  });

  it('names the directory service the way a real DC does', () => {
    const dc = BASELINE_SERVICES[MACHINE_ROLES.domainController] ?? [];
    const ntds = dc.find((service) => service.service === 'NTDS');

    // The real display name, not the Windows 2000 "Directory Service": this box
    // IS Active Directory and its services list has to say so.
    expect(ntds?.name).toBe('Active Directory Domain Services');
  });

  /**
   * Both halves of the reading skill have to be in the seed: services that are
   * stopped and CORRECT, so that stopped is not automatically a fault, and
   * Automatic ones that are running, so that one which is not stands out.
   */
  it('is stopped in the honest places and nowhere else', () => {
    for (const role of WINDOWS_ROLES) {
      for (const service of BASELINE_SERVICES[role] ?? []) {
        if (service.status === SERVICE_STATUS.stopped) {
          expect(
            [STARTUP_TYPES.manual, STARTUP_TYPES.disabled],
            `${role}/${service.service}`,
          ).toContain(service.startup);
        }

        if (service.startup === STARTUP_TYPES.disabled) {
          expect(service.status, service.service).toBe(SERVICE_STATUS.stopped);
        }
      }

      const startups = new Set(
        (BASELINE_SERVICES[role] ?? []).map((service) => service.startup),
      );

      expect(startups, role).toContain(STARTUP_TYPES.automatic);
      expect(startups, role).toContain(STARTUP_TYPES.delayed);
      expect(startups, role).toContain(STARTUP_TYPES.manual);
      expect(startups, role).toContain(STARTUP_TYPES.disabled);
    }
  });

  /**
   * The manager's own services are the ones it will not take a stop control
   * for, and there is at least one on every box - which is what makes the
   * refusal a lesson rather than a special case somebody wrote for a fan.
   */
  it('marks the ones the manager guards, and nothing else', () => {
    for (const role of WINDOWS_ROLES) {
      const guarded = (BASELINE_SERVICES[role] ?? []).filter(
        (service) => serviceClassOf(service.serviceClass) === SERVICE_CLASSES.system,
      );

      expect(guarded.length, role).toBeGreaterThan(0);

      for (const service of guarded) {
        expect(isRestartable(service.serviceClass), service.service).toBe(false);
        // Guarded or not, it is still a service and still belongs in the list.
        expect(isService(service.serviceClass), service.service).toBe(true);
      }
    }
  });

  it('gives every box its own copy of a service, by id', () => {
    expect(baselineServiceId('machine:beige-box', 'Spooler'))
      .toBe('service:beige-box/spooler');
    expect(baselineServiceId('machine:files', 'Dfs'))
      .not.toBe(baselineServiceId('machine:dc', 'Dfs'));
  });
});

/** The Linux roles, and their systemd unit baseline. */
const LINUX_ROLES = [
  MACHINE_ROLES.appServer,
  MACHINE_ROLES.dbServer,
] as const;

/**
 * The systemd side of the heterogeneous estate. A different manager with
 * different words, checked like content the same way the Windows list is: real
 * unit names, real states, and the product/database the role is actually for.
 */
describe('the baseline systemd units', () => {
  it('gives every Linux role real units, in the real state words', () => {
    for (const role of LINUX_ROLES) {
      const units = BASELINE_UNITS[role] ?? [];

      // The base stack (cron, ssh, journald) plus what the role is for - short,
      // the way a real product box is, not the twenty-odd of a Windows list.
      expect(units.length, role).toBeGreaterThanOrEqual(4);

      const names = units.map((unit) => unit.unit);

      expect(new Set(names).size, role).toBe(names.length);

      for (const unit of units) {
        // A unit name carries its type: nginx.service, not nginx.
        expect(unit.unit, role).toMatch(/\.service$/u);
        expect(unit.name.length, unit.unit).toBeGreaterThan(2);
        expect(Object.values(SYSTEMD_STATES), unit.unit).toContain(unit.state);
        expect(Object.values(UNIT_ENABLEMENTS), unit.unit)
          .toContain(unit.enabled);
      }
    }
  });

  it('adds what each Linux role is actually for', () => {
    const unitsOf = (role: keyof typeof BASELINE_UNITS): readonly string[] =>
      (BASELINE_UNITS[role] ?? []).map((unit) => unit.unit);

    // The app server fronts the product with nginx and runs it under systemd.
    expect(unitsOf(MACHINE_ROLES.appServer)).toContain('nginx.service');
    expect(unitsOf(MACHINE_ROLES.appServer)).toContain('grumbleapp.service');
    // The database server runs the meta-unit and the real cluster beside it.
    expect(unitsOf(MACHINE_ROLES.dbServer)).toContain('postgresql.service');
    expect(unitsOf(MACHINE_ROLES.dbServer))
      .toContain('postgresql@16-main.service');
    // Both share the base stack, and neither runs the other's product.
    expect(unitsOf(MACHINE_ROLES.appServer)).toContain('ssh.service');
    expect(unitsOf(MACHINE_ROLES.dbServer)).not.toContain('grumbleapp.service');
  });

  it('speaks systemd\'s own state vocabulary, not the Windows one', () => {
    // The postgresql meta-unit is a oneshot: active (exited), not running - a
    // real detail, and a word Windows services do not have.
    const db = BASELINE_UNITS[MACHINE_ROLES.dbServer] ?? [];
    const meta = db.find((unit) => unit.unit === 'postgresql.service');
    const cluster = db.find(
      (unit) => unit.unit === 'postgresql@16-main.service',
    );

    expect(meta?.state).toBe(SYSTEMD_STATES.activeExited);
    expect(cluster?.state).toBe(SYSTEMD_STATES.activeRunning);
  });

  it('gives every box its own copy of a unit, by id', () => {
    expect(linuxUnitId('machine:app', 'nginx.service'))
      .toBe('unit:app/nginx.service');
    // The `unit:` prefix keeps units out of the `service:` id space, so no
    // Windows service tool can ever collide with one.
    expect(linuxUnitId('machine:app', 'nginx.service'))
      .not.toBe(baselineServiceId('machine:app', 'nginx'));
  });
});
