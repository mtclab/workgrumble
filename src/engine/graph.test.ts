import { describe, expect, it } from 'vitest';

import { createEngineEventBus } from './events';
import {
  EntityGraph,
  type GraphMutation,
  type Node,
} from './graph';
import { isNode, validateNode } from './schema';

function person(id: string, name: string): Node {
  return {
    id,
    kind: 'person',
    fields: { name },
  };
}

describe('EntityGraph', () => {
  it('routes every mutation through typed events and cascades edges', () => {
    const bus = createEngineEventBus();
    const graph = new EntityGraph(bus);
    const mutations: GraphMutation[] = [];
    bus.on('graph:mutated', (mutation) => {
      mutations.push(mutation);
    });

    graph.addNode(person('person:a', 'Ada'));
    graph.addNode({
      id: 'account:a',
      kind: 'account',
      fields: { username: 'ada', locked: true },
    });
    graph.addEdge({
      from: 'person:a',
      to: 'account:a',
      kind: 'owns',
    });
    graph.setField('account:a', 'locked', false);
    graph.removeNode('person:a');

    expect(mutations.map(({ type }) => type)).toEqual([
      'node:added',
      'node:added',
      'edge:added',
      'field:set',
      'node:removed',
    ]);
    expect(graph.neighbors('account:a', { direction: 'in' })).toEqual([]);

    const removed = mutations[4];
    expect(removed?.type).toBe('node:removed');
    if (removed?.type === 'node:removed') {
      expect(removed.edges).toEqual([
        { from: 'person:a', to: 'account:a', kind: 'owns' },
      ]);
    }
  });

  it('keeps internal state behind copies and forbids duplicate edges', () => {
    const graph = new EntityGraph();
    const input = person('person:a', 'Ada');
    graph.addNode(input);
    graph.addNode(person('person:b', 'Bob'));

    input.fields.name = 'tampered input';
    const output = graph.getNode('person:a');
    expect(output?.fields.name).toBe('Ada');

    if (output !== undefined) {
      output.fields.name = 'tampered output';
    }
    expect(graph.getField('person:a', 'name')).toBe('Ada');

    const edge = {
      from: 'person:a',
      to: 'person:b',
      kind: 'connected_to',
    } as const;
    graph.addEdge(edge);

    expect(() => graph.addEdge(edge)).toThrow('Duplicate edges');
  });

  it('hashes equivalent graphs identically regardless of insertion order', () => {
    const left = new EntityGraph();
    const right = new EntityGraph();

    left.addNode({
      id: 'machine:z',
      kind: 'machine',
      fields: { resolution: '800x600', hostname: 'zeta' },
    });
    left.addNode(person('person:a', 'Ada'));
    left.addEdge({
      from: 'person:a',
      to: 'machine:z',
      kind: 'owns',
    });

    right.addNode(person('person:a', 'Ada'));
    right.addNode({
      id: 'machine:z',
      kind: 'machine',
      fields: { hostname: 'zeta', resolution: '800x600' },
    });
    right.addEdge({
      from: 'person:a',
      to: 'machine:z',
      kind: 'owns',
    });

    expect(left.snapshotHash()).toBe(right.snapshotHash());
  });
});

describe('node schema validation', () => {
  it('accepts valid data-loaded nodes and rejects invalid known fields', () => {
    const valid: unknown = {
      id: 'service:print',
      kind: 'service',
      fields: { name: 'Print Spooler', status: 'wedged' },
    };
    const invalid: unknown = {
      id: 'service:print',
      kind: 'service',
      fields: { status: 'confused' },
    };

    expect(isNode(valid)).toBe(true);
    expect(isNode(invalid)).toBe(false);
    expect(validateNode(valid)).toEqual(valid);
    expect(() => validateNode(invalid)).toThrow('status');
  });
});

