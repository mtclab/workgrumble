import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from './load-node';
import type { EngineEvent } from './types';
import { WasmEngine } from './wasm-engine';

beforeAll(() => {
  loadEngineForTests();
});

function seeded(): WasmEngine {
  const engine = new WasmEngine(0x5eed);
  engine.applySetup([
    {
      op: 'addNode',
      node: { id: 'person:pat', kind: 'person', fields: { name: 'Pat' } },
    },
    {
      op: 'addNode',
      node: {
        id: 'account:ada',
        kind: 'account',
        fields: { username: 'ada', locked: true },
      },
    },
  ]);
  engine.registerActions({
    kind_labels: { account: 'an account' },
    actions: [
      {
        id: 'account.unlock',
        tier: 1,
        validate: [
          {
            when: { pred: 'target_missing' },
            reason: 'Pick an account first.',
          },
          {
            when: {
              pred: 'not',
              of: {
                pred: 'field_eq',
                node: { ref: 'target' },
                field: 'locked',
                value: { const: true },
              },
            },
            reason: '"{target.label}" is not locked.',
          },
        ],
        apply: [
          {
            op: 'set_field',
            node: { ref: 'target' },
            field: 'locked',
            value: { const: false },
          },
        ],
      },
    ],
  });
  return engine;
}

describe('WasmEngine', () => {
  it('reads the world through the read-only view', () => {
    const engine = seeded();

    expect(engine.graph.getNode('account:ada')?.kind).toBe('account');
    expect(engine.graph.getNode('account:nobody')).toBeUndefined();
    expect(engine.graph.getField('account:ada', 'locked')).toBe(true);
    expect(engine.graph.getField('account:ada', 'nothing')).toBeUndefined();
    expect(engine.graph.nodesOfKind('account')).toHaveLength(1);
    expect(engine.graph.allNodes().map((node) => node.id))
      .toEqual(['account:ada', 'person:pat']);
    expect(engine.graph.neighbors('account:ada', { direction: 'out' }))
      .toEqual([]);
  });

  it('dispatches, refuses in the world\'s own words, and logs both', () => {
    const engine = seeded();
    const events: EngineEvent[] = [];
    engine.onEvent((event) => {
      events.push(event);
    });

    expect(engine.dispatch('account.unlock', 'person:pat', 'account:ada', {}))
      .toEqual({ ok: true });
    expect(engine.graph.getField('account:ada', 'locked')).toBe(false);
    expect(events).toEqual([
      {
        type: 'graph:mutated',
        mutation: {
          type: 'field:set',
          id: 'account:ada',
          field: 'locked',
          previous: true,
          value: false,
        },
      },
    ]);

    expect(engine.dispatch('account.unlock', 'person:pat', 'account:ada', {}))
      .toEqual({ ok: false, reason: '"ada" is not locked.' });
    expect(engine.dispatch('account.unlock', 'person:pat', null, {}))
      .toEqual({ ok: false, reason: 'Pick an account first.' });
    expect(engine.dispatchLog()).toHaveLength(3);
  });

  it('refuses content that is malformed instead of half-installing it', () => {
    const engine = seeded();

    expect(() => {
      engine.registerActions({ actions: [{ id: 'a', tier: -1 }] });
    }).toThrow('tier');
    expect(engine.dispatch('a', 'person:pat', null, {}))
      .toEqual({ ok: false, reason: 'Unknown action "a".' });
  });

  it('advances the clock one tick at a time and announces each', () => {
    const engine = seeded();
    const ticks: number[] = [];
    const unsubscribe = engine.onTick((tick) => {
      ticks.push(tick);
    });

    engine.advance(3);
    unsubscribe();
    engine.advance(2);

    expect(engine.now()).toBe(5);
    expect(ticks).toEqual([1, 2, 3]);
    expect(() => {
      engine.advance(1.5);
    }).toThrow(TypeError);
  });
});
