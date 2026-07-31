import { describe, expect, it } from 'vitest';

import { COMPANY_IDS } from '../../world/company';
import {
  addressOf,
  DNS_SUFFIX,
  fqdn,
  GATEWAY,
  hopMs,
  hostOctet,
  macOf,
  stableHash,
  SUBNET,
  traceLine,
} from './cmd-net';

/**
 * The addresses are derived rather than stored, so the gate is the derivation:
 * same input, same address, forever - and inside the scope the building has.
 * A renumbered estate would be a save that reads differently after an update,
 * which is the same class of bug as a moved golden hash.
 */
describe('the network the terminal prints', () => {
  it('gives every node one address and always the same one', () => {
    const ids = [
      COMPANY_IDS.playerMachine,
      COMPANY_IDS.adaMachine,
      COMPANY_IDS.garyMachine,
      COMPANY_IDS.printServer,
    ];

    for (const id of ids) {
      expect(addressOf(id)).toBe(addressOf(id));
      expect(addressOf(id)).toMatch(/^10\.42\.0\.\d{1,3}$/u);
      expect(hostOctet(id)).toBeGreaterThanOrEqual(11);
      expect(hostOctet(id)).toBeLessThanOrEqual(250);
      // The gateway is the one address the scope may never hand out: an
      // estate that renumbered onto it would take the building off the air.
      expect(addressOf(id)).not.toBe(GATEWAY);
    }

    // And the four machines this world ships are four different desks.
    expect(new Set(ids.map(addressOf)).size).toBe(ids.length);
    expect(GATEWAY).toBe(`${SUBNET}.1`);
  });

  it('hashes deterministically and differently', () => {
    expect(stableHash('machine:print')).toBe(stableHash('machine:print'));
    expect(stableHash('machine:print')).not.toBe(stableHash('machine:ada'));
    expect(stableHash('')).toBeGreaterThan(0);
  });

  it('writes a MAC the way a support call reads one out', () => {
    const mac = macOf(COMPANY_IDS.printServer);

    expect(mac).toMatch(/^(?:[0-9A-F]{2}-){5}[0-9A-F]{2}$/u);
    expect(mac.startsWith('00-1B-44-')).toBe(true);
    expect(macOf(COMPANY_IDS.printServer)).toBe(mac);
  });

  it('qualifies a hostname the way the name server would', () => {
    expect(fqdn('PRINT-01')).toBe(`print-01.${DNS_SUFFIX}`);
  });

  it('prints a hop that carries its number, its name and its address', () => {
    const line = traceLine(2, 'PRINT-01', COMPANY_IDS.printServer);

    expect(line).toContain(`print-01.${DNS_SUFFIX}`);
    expect(line).toContain(addressOf(COMPANY_IDS.printServer));
    expect(line.trim().startsWith('2')).toBe(true);
    expect(line).toBe(traceLine(2, 'PRINT-01', COMPANY_IDS.printServer));

    // Further away is slower, which is what makes a trace worth reading.
    expect(hopMs(3, COMPANY_IDS.printServer, 0))
      .toBeGreaterThan(hopMs(1, COMPANY_IDS.printServer, 0));
  });
});
