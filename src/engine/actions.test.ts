import { describe, expect, it } from 'vitest';

import { ActionRegistry, type ActionDef } from './actions';
import { SimClock } from './clock';
import { EntityGraph } from './graph';
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

  it('isolates graph writes attempted by a rejecting validator', () => {
    const graph = actionGraph();
    const registry = new ActionRegistry(
      graph,
      createRng(2),
      new SimClock(),
    );
    registry.register({
      id: 'invalid.mutating-validator',
      tier: 1,
      validate: (context) => {
        context.graph.setField('account:user', 'locked', false);
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
    expect(graph.snapshotHash()).toBe(before);
    expect(graph.getField('account:user', 'locked')).toBe(true);
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
