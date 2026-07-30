import { describe, expect, expectTypeOf, it } from 'vitest';

import { EntityGraph } from '../engine/graph';
import {
  createReadonlyGraph,
  type ReadonlyGraph,
} from './graph-view';

type MutationKey = Extract<
  'addNode' | 'removeNode' | 'setField' | 'addEdge' | 'removeEdge',
  keyof ReadonlyGraph
>;

describe('read-only graph view', () => {
  it('exposes only the typed query surface', () => {
    const graph = new EntityGraph();
    const view = createReadonlyGraph(graph);
    const noMutationKey: MutationKey extends never ? true : false = true;

    expectTypeOf(view).toEqualTypeOf<ReadonlyGraph>();
    expect(noMutationKey).toBe(true);
    expect(Object.keys(view).sort()).toEqual([
      'getField',
      'getNode',
      'neighbors',
      'nodesOfKind',
    ]);
    expect('setField' in view).toBe(false);
  });

  it('freezes the view, returned nodes, fields, and collections at runtime', () => {
    const graph = new EntityGraph();
    graph.addNode({
      id: 'person:player',
      kind: 'person',
      fields: { name: 'Pat Pending' },
    });
    const view = createReadonlyGraph(graph);
    const player = view.getNode('person:player');
    const people = view.nodesOfKind('person');

    expect(player).toBeDefined();
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(player)).toBe(true);
    expect(Object.isFrozen(player?.fields)).toBe(true);
    expect(Object.isFrozen(people)).toBe(true);
    expect(Reflect.set(view, 'setField', (): void => {})).toBe(false);

    if (player !== undefined) {
      expect(Reflect.set(player.fields, 'name', 'Intruder')).toBe(false);
    }

    expect(graph.getField('person:player', 'name')).toBe('Pat Pending');
  });

  it('returns frozen neighbor snapshots without leaking graph mutation', () => {
    const graph = new EntityGraph();
    graph.addNode({
      id: 'person:player',
      kind: 'person',
      fields: { name: 'Pat Pending' },
    });
    graph.addNode({
      id: 'machine:desk',
      kind: 'machine',
      fields: { hostname: 'BEIGE-BOX' },
    });
    graph.addEdge({
      from: 'person:player',
      to: 'machine:desk',
      kind: 'owns',
    });
    const view = createReadonlyGraph(graph);
    const neighbors = view.neighbors('person:player', {
      direction: 'out',
      edgeKind: 'owns',
    });

    expect(neighbors.map(({ id }) => id)).toEqual(['machine:desk']);
    expect(Object.isFrozen(neighbors[0])).toBe(true);
  });
});
