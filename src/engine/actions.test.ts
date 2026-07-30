import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  ActionRegistry,
  type ActionDef,
  type ValidationContext,
} from './actions';
import { SimClock } from './clock';
import { EntityGraph } from './graph';
import type { ReadOnlyGraphView } from './graph-view';
import { createRng } from './rng';

function actionGraph(): EntityGraph {
  const graph = new EntityGraph();
  graph.addNode({
    id: 'person:tech',
    kind: 'person',
    fields: { name: 'Tech' },
  });
  graph.addNode({
    id: 'account:user',
    kind: 'account',
    fields: { username: 'user', locked: true },
  });
  return graph;
}

function unlockAction(): ActionDef {
  return {
    id: 'account.unlock',
    tier: 2,
    validate: ({ target }) => (
      target === null ? 'Target is required.' : null
    ),
    apply: ({ graph, target }) => {
      if (target !== null) {
        graph.setField(target, 'locked', false);
      }
    },
  };
}

describe('ActionRegistry', () => {
  it('gates a tier-2 action at tier 1 without changing the graph', () => {
    const graph = actionGraph();
    const registry = new ActionRegistry(
      graph,
      createRng(1),
      new SimClock(),
      1,
    );
    registry.register(unlockAction());
    const before = graph.snapshotHash();

    const result = registry.dispatch(
      'account.unlock',
      'person:tech',
      'account:user',
      {},
    );

    expect(result).toEqual({
      ok: false,
      reason: 'Action "account.unlock" requires tier 2.',
    });
    expect(graph.snapshotHash()).toBe(before);
    expect(registry.log).toEqual([
      {
        tick: 0,
        id: 'account.unlock',
        actor: 'person:tech',
        target: 'account:user',
        params: {},
        ok: false,
        reason: 'Action "account.unlock" requires tier 2.',
      },
    ]);
  });

  it('leaves the graph untouched when validation rejects dispatch', () => {
    const graph = actionGraph();
    const registry = new ActionRegistry(
      graph,
      createRng(2),
      new SimClock(),
      2,
    );
    registry.register(unlockAction());
    const before = graph.snapshotHash();

    expect(
      registry.dispatch('account.unlock', 'person:tech', null, {}),
    ).toEqual({ ok: false, reason: 'Target is required.' });
    expect(graph.snapshotHash()).toBe(before);
  });

  it('hands validation a read-only view that cannot write to the world', () => {
    const graph = actionGraph();
    const registry = new ActionRegistry(
      graph,
      createRng(2),
      new SimClock(),
    );
    const writeAttempts: string[] = [];
    registry.register({
      id: 'invalid.mutating-validator',
      tier: 1,
      validate: (context) => {
        // Type level: the view has no writers at all (see the ReadOnlyGraphView
        // assertion below). Runtime level: there is nothing to reach for, and
        // the frozen view refuses to grow one.
        expectTypeOf(context.graph).toEqualTypeOf<ReadOnlyGraphView>();
        const reachable = context.graph as unknown as Record<string, unknown>;

        for (const method of ['setField', 'addNode', 'addEdge', 'removeEdge']) {
          writeAttempts.push(`${method}:${String(typeof reachable[method])}`);
        }

        expect(
          Reflect.set(reachable, 'setField', (): void => {}),
        ).toBe(false);
        return 'Rejected after an invalid validation write.';
      },
      apply: (context) => {
        context.graph.setField('account:user', 'locked', false);
      },
    });
    const before = graph.snapshotHash();

    expect(
      registry.dispatch(
        'invalid.mutating-validator',
        'person:tech',
        'account:user',
        {},
      ),
    ).toEqual({
      ok: false,
      reason: 'Rejected after an invalid validation write.',
    });
    expect(writeAttempts).toEqual([
      'setField:undefined',
      'addNode:undefined',
      'addEdge:undefined',
      'removeEdge:undefined',
    ]);
    expect(graph.snapshotHash()).toBe(before);
    expect(graph.getField('account:user', 'locked')).toBe(true);
  });

  it('validates against the live world, matching the old clone semantics', () => {
    const graph = actionGraph();
    const clock = new SimClock();
    const registry = new ActionRegistry(graph, createRng(4), clock, 2);
    const seen: string[] = [];
    registry.register({
      id: 'audit.read-fields',
      tier: 1,
      validate: (context: ValidationContext) => {
        seen.push(String(context.graph.getField('account:user', 'locked')));
        seen.push(context.graph.allNodes().map(({ id }) => id).join(','));
        seen.push(
          context.graph
            .nodesOfKind('account')
            .map(({ id }) => id)
            .join(','),
        );
        seen.push(String(context.clock.now()));
        return null;
      },
      apply: ({ graph, target }) => {
        if (target !== null) {
          graph.setField(target, 'locked', false);
        }
      },
    });

    clock.advance(7);
    expect(
      registry.dispatch('audit.read-fields', 'person:tech', 'account:user', {}),
    ).toEqual({ ok: true });
    expect(seen).toEqual([
      'true',
      'account:user,person:tech',
      'account:user',
      '7',
    ]);
    expect(graph.getField('account:user', 'locked')).toBe(false);
  });

  it('applies a valid action and protects its append-only log copies', () => {
    const graph = actionGraph();
    const clock = new SimClock();
    const registry = new ActionRegistry(graph, createRng(3), clock, 2);
    registry.register(unlockAction());
    clock.advance(4);
    const params = { source: 'directory' };

    expect(
      registry.dispatch(
        'account.unlock',
        'person:tech',
        'account:user',
        params,
      ),
    ).toEqual({ ok: true });
    params.source = 'tampered';

    expect(graph.getField('account:user', 'locked')).toBe(false);
    expect(registry.log[0]?.params.source).toBe('directory');

    const exposed = registry.log[0];
    if (exposed !== undefined) {
      exposed.params.source = 'also tampered';
    }
    expect(registry.log[0]?.params.source).toBe('directory');
  });
});
