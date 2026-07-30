import { describe, expect, expectTypeOf, it } from 'vitest';

import { EntityGraph } from './graph';
import {
  createReadOnlyGraphView,
  type ReadOnlyGraphView,
} from './graph-view';

type MutationKey = Extract<
  'addNode' | 'removeNode' | 'setField' | 'addEdge' | 'removeEdge',
  keyof ReadOnlyGraphView
>;

function peopledGraph(): EntityGraph {
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
  return graph;
}

describe('read-only graph view', () => {
  it('exposes only the typed query surface', () => {
    const graph = new EntityGraph();
    const view = createReadOnlyGraphView(graph);
    const noMutationKey: MutationKey extends never ? true : false = true;

    expectTypeOf(view).toEqualTypeOf<ReadOnlyGraphView>();
    expect(noMutationKey).toBe(true);
    expect(Object.keys(view).sort()).toEqual([
      'allNodes',
      'getField',
      'getNode',
      'neighbors',
      'nodesOfKind',
    ]);
    expect('setField' in view).toBe(false);
  });

  it('freezes the view, returned nodes, fields, and collections at runtime', () => {
    const graph = peopledGraph();
    const view = createReadOnlyGraphView(graph);
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
    const view = createReadOnlyGraphView(peopledGraph());
    const neighbors = view.neighbors('person:player', {
      direction: 'out',
      edgeKind: 'owns',
    });

    expect(neighbors.map(({ id }) => id)).toEqual(['machine:desk']);
    expect(Object.isFrozen(neighbors[0])).toBe(true);
  });

  it('answers every query with what the live graph holds', () => {
    const graph = peopledGraph();
    const view = createReadOnlyGraphView(graph);

    expect(view.allNodes().map(({ id }) => id)).toEqual([
      'machine:desk',
      'person:player',
    ]);
    expect(view.getField('machine:desk', 'hostname')).toBe('BEIGE-BOX');
    expect(view.nodesOfKind('machine').map(({ id }) => id)).toEqual([
      'machine:desk',
    ]);
    expect(view.getNode('machine:nowhere')).toBeUndefined();

    // The view is a window, not a snapshot: later writes are visible through
    // the same handle, which is what lets a validator read the current world.
    graph.setField('machine:desk', 'hostname', 'BEIGE-BOX-II');
    expect(view.getField('machine:desk', 'hostname')).toBe('BEIGE-BOX-II');
    expect(Object.isFrozen(view.allNodes())).toBe(true);
  });
});
