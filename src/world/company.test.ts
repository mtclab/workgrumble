import { describe, expect, it } from 'vitest';

import { EntityGraph } from '../engine/graph';
import { NODE_KINDS } from '../engine/schema';
import { COMPANY_IDS, seedCompanyWorld } from './company';
import { FIELDS } from './fields';

function seeded(): EntityGraph {
  const graph = new EntityGraph();
  seedCompanyWorld(graph);
  return graph;
}

describe('company world', () => {
  it('seeds the same world every time', () => {
    expect(seeded().snapshotHash()).toBe(seeded().snapshotHash());
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

  it('leaves the payroll clerk locked out and off the common share', () => {
    const graph = seeded();

    expect(graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked)).toBe(true);
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
