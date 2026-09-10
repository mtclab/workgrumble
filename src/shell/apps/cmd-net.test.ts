import { describe, expect, it } from 'vitest';

import { COMPANY_IDS } from '../../world/company';
import { EMPLOYER_IDS } from '../../world/employers';
import { ONBOARDINGS } from '../../world/onboarding';
import { createWorldSession, FIRST_WEEK } from '../../world/session';
import {
  addressOf,
  DNS_SUFFIX,
  fqdn,
  GATEWAY,
  hopMs,
  hostOctet,
  isAddressLiteral,
  machineAtAddress,
  macOf,
  reverseName,
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

/**
 * The property the whole of W-20 stands on: an address names ONE box.
 *
 * Reading the derivation backwards is only an honest answer while it is a
 * bijection over the estate, and two hundred and forty numbers against
 * twenty-eight machines is not as much room as it sounds - the unsalted hash
 * really did put two pairs of MSP boxes on one number each. Nothing in this
 * estate models a duplicate address (there is no arp table, no conflict
 * warning, no second claimant anywhere), so an estate with one would simply be
 * a terminal giving the wrong box to a player who had just been taught to test
 * by address.
 *
 * When this fails it names the two machines. The fix is to re-roll
 * `ADDRESS_SALT` in `cmd-net.ts` - every address in this game is derived,
 * printed, and never stored, so a re-roll costs the screen and nothing else.
 */
describe('an address names one box (0.42.0, W-20)', () => {
  it('gives every machine in every shipped estate a number of its own', () => {
    const clashes: string[] = [];

    for (const employer of EMPLOYER_IDS) {
      const session = createWorldSession({ ...FIRST_WEEK, employer });

      // Including the customer who signs mid-week: their boxes are on the
      // network from Wednesday, and an address that named two of them would
      // be a fault that only appeared three days into an arc.
      if (employer === 'msp') {
        for (const event of ONBOARDINGS) {
          session.engine.applySetup(event.setup());
        }
      }

      const machines = session.engine.graph.nodesOfKind('machine');
      const byAddress = new Map<string, string[]>();

      for (const machine of machines) {
        const address = addressOf(machine.id);
        byAddress.set(address, [...(byAddress.get(address) ?? []), machine.id]);
      }

      for (const [address, ids] of byAddress) {
        if (ids.length > 1) {
          clashes.push(`${employer} ${address}: ${ids.join(' + ')}`);
        }
      }

      // And the estate really was walked - an employer whose graph came back
      // empty would pass an emptiness check for ever.
      expect(machines.length).toBeGreaterThan(5);

      // The read runs backwards for every one of them, which is the thing the
      // terminal actually does with it.
      for (const machine of machines) {
        expect(machineAtAddress(machines, addressOf(machine.id))?.id)
          .toBe(machine.id);
      }
    }

    expect(clashes, 'two boxes on one address').toEqual([]);
  });

  it('knows an address from a name, and answers with neither for nonsense', () => {
    expect(isAddressLiteral('10.42.0.29')).toBe(true);
    expect(isAddressLiteral(' 10.42.0.29 ')).toBe(true);
    // Three dots do not make an address: the estate's own names have more.
    expect(isAddressLiteral('print-01.workgrumble.local')).toBe(false);
    expect(isAddressLiteral('10.42.0')).toBe(false);
    expect(isAddressLiteral('10.42.0.999')).toBe(false);

    expect(machineAtAddress([{ id: COMPANY_IDS.printServer }], 'PRINT-01'))
      .toBeNull();
    expect(machineAtAddress([{ id: COMPANY_IDS.printServer }], '10.42.0.251'))
      .toBeNull();
  });

  it('reverses an address the way the tree is actually walked', () => {
    expect(reverseName('10.42.0.29')).toBe('29.0.42.10.in-addr.arpa');
  });
});
