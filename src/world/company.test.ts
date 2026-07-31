import { describe, expect, it } from 'vitest';

import {
  NODE_KINDS,
  type ReadOnlyGraphView,
  WasmEngine,
} from '../engine-api';
import { companySetup, COMPANY_IDS } from './company';
import { FIELDS } from './fields';

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

    expect(counts).toEqual({
      person: 6,
      account: 6,
      machine: 4,
      device: 3,
      service: 3,
      share: 1,
      group: 2,
      mail_rule: 1,
      ticket: 0,
    });
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
