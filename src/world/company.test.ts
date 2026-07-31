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

    // Seventeen people, because a week of twenty-odd tickets is a week in a
    // building with people in it: sixteen who report something and one leaver
    // who reports nothing and is the cause of a Wednesday.
    expect(counts).toEqual({
      person: 17,
      account: 17,
      machine: 13,
      device: 5,
      service: 7,
      share: 2,
      group: 3,
      mail_rule: 2,
      ticket: 0,
    });
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
