import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from './load-node';
import type { EngineEvent } from './types';
import { WasmEngine } from './wasm-engine';

beforeAll(() => {
  loadEngineForTests();
});

/** What the wasm module actually exports, as wasm-bindgen declares it. */
function engineSurface(): string {
  return readFileSync(
    fileURLToPath(new URL('../../core-rs/pkg/core_rs.d.ts', import.meta.url)),
    'utf8',
  );
}

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

  /**
   * The tab-freezer. This loop is synchronous, so a quadrillion ticks is not a
   * long wait - it is a browser that never comes back. Both the adapter and
   * the engine refuse it; this is the adapter's half, which is the half that
   * would otherwise be the one running the loop.
   */
  it('refuses an advance no browser would survive', () => {
    const engine = seeded();

    for (const ticks of [
      Number.MAX_SAFE_INTEGER,
      Number.MAX_VALUE,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      -1,
      1_000_001,
    ]) {
      expect(() => {
        engine.advance(ticks);
      }, String(ticks)).toThrow(TypeError);
    }

    expect(engine.now()).toBe(0);
    engine.advance(0);
    expect(engine.now()).toBe(0);
  });

  /**
   * The wasm glue coerces: `Infinity` becomes seed 0, `1.5` becomes tier 1,
   * `2^32` becomes 0 again. By the time Rust sees the value there is nothing
   * wrong with it, so the refusal has to happen before the call.
   */
  it('refuses a seed or a tier that would be coerced into something else', () => {
    for (const seed of [
      Number.POSITIVE_INFINITY,
      Number.NaN,
      1.5,
      -1,
      0x1_0000_0000,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(() => new WasmEngine(seed), String(seed)).toThrow(TypeError);
    }

    expect(() => new WasmEngine(0)).not.toThrow();
    expect(() => new WasmEngine(0xffff_ffff)).not.toThrow();

    const engine = seeded();

    for (const tier of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => {
        engine.setTier(tier);
      }, String(tier)).toThrow(TypeError);
    }

    expect(engine.tier()).toBe(1);
    engine.setTier(2);
    expect(engine.tier()).toBe(2);
  });

  /**
   * `JSON.stringify` turns `Infinity` and `NaN` into `null` without a word,
   * and `null` is a legitimate field value - so a queue length of `Infinity`
   * arrived as a queue length of "nothing in particular" and the schema took
   * it. A lone surrogate becomes U+FFFD the same silent way.
   */
  it('refuses values that would arrive as something other than themselves', () => {
    const engine = seeded();
    const before = engine.snapshotHash();

    for (const value of [
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NaN,
    ]) {
      const result = engine.dispatch('account.unlock', 'person:pat', 'account:ada', {
        queue_len: value,
      });

      expect(result.ok, String(value)).toBe(false);
      expect(result.ok ? '' : result.reason).toContain('finite');
    }

    const surrogate = engine.dispatch('account.unlock', 'person:pat', '\ud800', {});
    expect(surrogate.ok).toBe(false);
    expect(surrogate.ok ? '' : surrogate.reason).toContain('surrogate');

    expect(engine.snapshotHash()).toBe(before);
    expect(engine.dispatchLog()).toHaveLength(0);

    // Content is a bug rather than a player mistake, so it throws instead.
    expect(() => {
      engine.applySetup([
        {
          op: 'setField',
          id: 'account:ada',
          field: 'locked',
          value: Number.POSITIVE_INFINITY as unknown as boolean,
        },
      ]);
    }).toThrow(TypeError);
    expect(engine.snapshotHash()).toBe(before);
  });

  /**
   * Waiting is a MECHANIC: an SLA pauses because the reporter was actually
   * asked something. An engine export that flipped the flag directly was a way
   * around the rule the game is about, so the boundary does not have one.
   */
  it('exposes no way to park a ticket except the action that costs a question', () => {
    const engine = seeded();

    expect(Object.keys(engine)).not.toContain('setWaiting');
    expect(engineSurface()).not.toContain('set_waiting');
  });

  /**
   * The M3 save seam, exercised from the side that will use it. A round trip
   * that only proves the JSON parses would let a restored engine be a
   * snapshot rather than a live world, so this one keeps playing afterwards.
   */
  it('survives a serialize and restore, and keeps running', () => {
    const engine = seeded();
    engine.advance(3);
    const saved = engine.serialize();
    const hash = engine.snapshotHash();

    const restored = new WasmEngine(1);
    restored.restore(saved);

    expect(restored.snapshotHash()).toBe(hash);
    expect(restored.now()).toBe(3);
    expect(restored.dispatchLog()).toEqual(engine.dispatchLog());
    expect(restored.dispatch('account.unlock', 'person:pat', 'account:ada', {}))
      .toEqual({ ok: true });
    expect(restored.graph.getField('account:ada', 'locked')).toBe(false);

    expect(() => {
      restored.restore('{ not json');
    }).toThrow();
  });

  /**
   * A load replaces the world wholesale, and no mutation caused it - so
   * nothing else says so. An open app repainting on `onWorldChange` kept the
   * PREVIOUS session on screen until some unrelated mutation happened along,
   * which is the shape of every "the save loaded but the window is stale" bug.
   */
  it('announces a restore so open apps repaint on the world they now have', () => {
    const source = seeded();
    source.advance(7);
    source.dispatch('account.unlock', 'person:pat', 'account:ada', {});
    const saved = source.serialize();

    const engine = seeded();
    const events: EngineEvent[] = [];
    const ticks: number[] = [];
    // Exactly the shell's wiring in `main.ts`: an app repaints from the world
    // whenever the world changed, whoever changed it.
    let repaints = 0;
    engine.onEvent((event) => {
      events.push(event);

      if (event.type === 'graph:mutated' || event.type === 'world:restored') {
        repaints += 1;
      }
    });
    engine.onTick((tick) => {
      ticks.push(tick);
    });

    expect(engine.graph.getField('account:ada', 'locked')).toBe(true);
    engine.restore(saved);

    expect(events).toEqual([{ type: 'world:restored', tick: 7 }]);
    expect(repaints).toBe(1);
    // And the clock consumers, which repaint on ticks rather than on events.
    expect(ticks).toEqual([7]);

    // The repaint that just fired reads the world that was loaded, not the one
    // the app was showing.
    expect(engine.now()).toBe(7);
    expect(engine.graph.getField('account:ada', 'locked')).toBe(false);
  });

  it('says nothing when a restore is refused', () => {
    const engine = seeded();
    const events: EngineEvent[] = [];
    engine.onEvent((event) => {
      events.push(event);
    });

    expect(() => {
      engine.restore(JSON.stringify({ version: '0.0.1' }));
    }).toThrow();
    expect(events).toEqual([]);
    expect(engine.graph.getField('account:ada', 'locked')).toBe(true);
  });
});
