import { describe, expect, it } from 'vitest';

import {
  MACHINE_ROLES,
  SERVICE_CLASSES,
  SERVICE_STATUS,
  serviceClassOf,
  STARTUP_TYPES,
  isRestartable,
  isService,
  startupTypeOf,
} from './fields';
import { BASELINE_SERVICES, baselineServiceId } from './services';

/**
 * The baseline is content, and content this dull has to be checked like
 * content: real names, one of each, and a list per role that differs from the
 * others by the services that role actually adds.
 */
describe('the baseline services', () => {
  it('gives every role a list long enough to have to be read', () => {
    for (const role of Object.values(MACHINE_ROLES)) {
      const services = BASELINE_SERVICES[role];

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
    for (const role of Object.values(MACHINE_ROLES)) {
      const names = BASELINE_SERVICES[role].map((service) => service.name);

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
      BASELINE_SERVICES[role].map((service) => service.service);

    expect(shortsOf(MACHINE_ROLES.printServer)).toContain('LPDSVC');
    expect(shortsOf(MACHINE_ROLES.fileServer)).toContain('Dfs');
    expect(shortsOf(MACHINE_ROLES.domainController)).toContain('NTDS');
    expect(shortsOf(MACHINE_ROLES.domainController)).toContain('kdc');
    // And the workstation list has none of them.
    expect(shortsOf(MACHINE_ROLES.workstation)).not.toContain('NTDS');
    expect(shortsOf(MACHINE_ROLES.workstation)).not.toContain('Dfs');
  });

  /**
   * Both halves of the reading skill have to be in the seed: services that are
   * stopped and CORRECT, so that stopped is not automatically a fault, and
   * Automatic ones that are running, so that one which is not stands out.
   */
  it('is stopped in the honest places and nowhere else', () => {
    for (const role of Object.values(MACHINE_ROLES)) {
      for (const service of BASELINE_SERVICES[role]) {
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
        BASELINE_SERVICES[role].map((service) => service.startup),
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
    for (const role of Object.values(MACHINE_ROLES)) {
      const guarded = BASELINE_SERVICES[role].filter(
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
