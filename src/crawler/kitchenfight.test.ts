import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { KITCHEN_FIGHT_MEMORY, strike } from './combat';
import type { Actor } from './entities';
import { type Headless, headless } from './headlessgame';
import { cellCenter, generateLevel, type LevelRecipe, type Room } from './level';
import { newSave } from './state';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});

/**
 * The kitchen hub (T4, docs/SPEC_HELLDESK_030_S2.md): neutral ground. A
 * fight there costs Kitchen standing, once a fight; anywhere else it does
 * not. On the real hub, by the real hit (`strike`, every hit the player lands).
 */

function hub(): Headless {
  const h = headless(newSave(7919));
  h.g.loadHub(false, true);
  return h;
}

/** A free cell of the room's, at its middle row, `k` cells in from its left wall. */
function spotIn(h: Headless, rm: Room, k: number): { x: number; z: number } {
  const lv = h.g.level;
  for (let y = rm.y; y < rm.y + rm.h; y++) {
    for (let x = rm.x + k; x < rm.x + rm.w; x++) {
      const i = y * lv.w + x;
      if (lv.floor[i] === 1 && lv.solid[i] === 0) return { x: cellCenter(x), z: cellCenter(y) };
    }
  }
  throw new Error('no free cell');
}

function setUp(h: Headless, kind: 'kitchen' | 'cubicles'): Actor {
  const lv = h.g.level;
  const rooms = kind === 'kitchen'
    ? lv.recipe!.templates.filter((t) => t.id === 'T4').flatMap((t) => t.rooms)
    : lv.recipe!.templates.filter((t) => t.id === 'T1').flatMap((t) => t.rooms);
  const rm = lv.rooms[rooms[0]!]!;
  const a = h.g.actors.find((x) => x.colleague && !x.hostile)!;
  const at = spotIn(h, rm, 1);
  a.pos.set(at.x, 0, at.z);
  const me = spotIn(h, rm, 3);
  h.g.player.pos.set(me.x, 0, me.z);
  return a;
}

describe('a fight in the kitchen hub costs Kitchen standing', () => {
  it('a hit in the kitchen costs it once a fight; the next fight costs it again; a hit in a bullpen costs nothing', () => {
    const h = hub();
    expect(h.g.level.recipe?.templates.some((t) => t.id === 'T4'), 'the hub has its kitchen hub').toBe(true);
    const a = setUp(h, 'kitchen');
    const before = h.g.save.standing.kitchen;
    strike(h.g, a, 1, null, 'melee');
    const after = h.g.save.standing.kitchen;
    expect(after, 'a hit in the kitchen').toBeLessThan(before);
    expect(h.toasts.some((t) => t.includes('A fight in the kitchen'))).toBe(true);
    // The same fight: no more.
    h.g.time += 5;
    strike(h.g, a, 1, null, 'melee');
    expect(h.g.save.standing.kitchen, 'the same fight').toBe(after);
    // A fight later on is another fight.
    h.g.time += KITCHEN_FIGHT_MEMORY + 1;
    strike(h.g, a, 1, null, 'melee');
    expect(h.g.save.standing.kitchen, 'another fight').toBeLessThan(after);

    const other = hub();
    const b = setUp(other, 'cubicles');
    const was = other.g.save.standing.kitchen;
    strike(other.g, b, 1, null, 'melee');
    expect(other.g.save.standing.kitchen, 'a hit in a bullpen').toBe(was);
  });
});
