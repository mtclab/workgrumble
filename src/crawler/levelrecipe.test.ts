import { describe, expect, it } from 'vitest';
import { cellCenter, flowField, generateLevel, type Level, NEIGHBOURS8, toCell } from './level';
import { Rng } from './rng';
import { layRecipe, type RecipeId, RECIPES } from './templates';
import { THEMES } from './textures';

/**
 * The 0.3.0 spike's templates (docs/SPEC_HELLDESK_030.md 3.2, 6.0): every
 * recipe on 150 seeds is one connected floor - from the entry lift you can
 * reach every walkable cell, every room of the footprint, every corridor node,
 * the whole spine and the objective - and nothing solid was made walkable to
 * get there. The same rules `crawler.test.ts` holds the ordinary floors to.
 */
const SEEDS = Array.from({ length: 150 }, (_, i) => (i + 1) * 7919);
const MACHINES = new Set(['fridge', 'locker', 'vending', 'terminal', 'cooler', 'coffee', 'pantti', 'printer', 'crate', 'kiuas']);

function build(id: RecipeId, seed: number): Level {
  const theme = THEMES[seed % THEMES.length];
  if (theme === undefined) throw new Error('theme');
  return generateLevel(0, theme, seed, true, false, id);
}

function reachableNear(level: Level, field: Int16Array, x: number, z: number): boolean {
  const cx = toCell(x);
  const cz = toCell(z);
  if ((field[cz * level.w + cx] ?? -1) >= 0) return true;
  return NEIGHBOURS8.some(([ox, oz]) => (field[(cz + oz) * level.w + cx + ox] ?? -1) >= 0);
}

describe.each(RECIPES)('recipe %s', (id) => {
  it('lays a footprint that keeps its own rules (rectangular rooms, the lobby first)', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const plan = layRecipe(id, new Rng(seed));
      expect(plan.rooms[0]?.tag).toBe('lobby');
      expect(plan.rooms[0]?.kind).toBe('lobby');
      expect(plan.rooms.filter((rm) => rm.tag === 'lobby')).toHaveLength(1);
      expect(plan.rows.every((row) => row.length === plan.w)).toBe(true);
    }
  });

  it('is connected on 150 seeds: lift to every cell, room, node, spine cell and the objective', { timeout: 60_000 }, () => {
    for (const seed of SEEDS) {
      const level = build(id, seed);
      const layout = level.recipe;
      if (layout === undefined) throw new Error('no recipe layout');
      const lift = level.interactables.filter((it) => it.kind === 'elevator');
      expect(lift, `seed ${seed}: one lift`).toHaveLength(1);
      expect(lift[0]?.room, `seed ${seed}: the lift is in the lobby`).toBe(0);
      const field = flowField(level, level.start.x, level.start.z, 32000);
      for (let i = 0; i < level.w * level.h; i++) {
        if (level.floor[i] === 1 && level.solid[i] === 0) expect(field[i], `seed ${seed}: cell ${i}`).toBeGreaterThanOrEqual(0);
      }
      // Nothing of the footprint was sealed off and filled in.
      for (const rm of level.rooms) {
        let reached = 0;
        for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) if ((field[y * level.w + x] ?? -1) >= 0) reached++;
        expect(reached, `seed ${seed}: room ${rm.id} (${rm.kind})`).toBeGreaterThan(0);
      }
      for (const i of [...layout.nodes, ...layout.spine]) expect(field[i], `seed ${seed}: node/spine cell ${i}`).toBeGreaterThanOrEqual(0);
      for (const it of level.interactables) {
        expect(reachableNear(level, field, it.x, it.z), `seed ${seed}: ${it.kind} reachable`).toBe(true);
        if (MACHINES.has(it.kind)) expect(level.solid[toCell(it.z) * level.w + toCell(it.x)], `seed ${seed}: ${it.kind} solid`).toBe(1);
      }
      // Glass stays glass: in the way, not in the view.
      for (let i = 0; i < level.w * level.h; i++) {
        if (level.glass?.[i] !== 1) continue;
        expect(level.solid[i], `seed ${seed}: glass ${i} solid`).toBe(1);
        expect(level.opaque[i], `seed ${seed}: glass ${i} see-through`).toBe(0);
      }
      if (id === 'officeRow') {
        // The stapler's closet: in HR's office, locked, and reachable.
        const closet = level.interactables.find((it) => it.id === layout.closet);
        expect(closet?.kind, `seed ${seed}: HR's closet`).toBe('locker');
        expect(closet?.room).toBe(layout.rooms.hr?.[0]);
        expect(closet?.lock ?? 0).toBeGreaterThan(0);
        expect(layout.spine.length).toBeGreaterThan(20);
        // The one point a patrol crosses the spine at, and a computer in every office.
        expect(layout.spineNodes, `seed ${seed}: one spine node`).toHaveLength(1);
        expect(layout.spine).toContain(layout.spineNodes[0]);
        for (const o of layout.rooms.office ?? []) expect(level.interactables.some((it) => it.kind === 'terminal' && it.room === o), `seed ${seed}: office ${o} has its computer`).toBe(true);
      } else if (id === 'annex') {
        // Josh's way: Internal IT's counter at the far end, the vendors' pitch on the straight way.
        expect(level.interactables.filter((it) => it.kind === 'itdesk' && it.room === layout.rooms.it?.[0]), `seed ${seed}: the counter`).toHaveLength(1);
        expect(layout.rooms.pitch).toHaveLength(1);
        expect(level.glass?.some((g) => g === 1)).toBe(true);
      } else {
        expect(layout.rooms.meeting).toHaveLength(3);
        expect(level.glass?.some((g) => g === 1)).toBe(true);
      }
      // People come with the mission, not with the furniture.
      expect(level.spawns).toHaveLength(0);
    }
  });

  it('the service spine is a way round: from the lobby to HR without the main corridor', () => {
    if (id !== 'officeRow') return;
    for (const seed of SEEDS.slice(0, 20)) {
      const level = build(id, seed);
      const layout = level.recipe;
      if (layout === undefined) throw new Error('no recipe layout');
      // Block the main corridor (every node row) and walk again: HR is still in reach, by the spine.
      const solid = level.solid.slice();
      for (const n of layout.nodes) {
        const x = n % level.w;
        const y = Math.floor(n / level.w);
        for (const dy of [0, 1]) solid[(y + dy) * level.w + x] = 1;
      }
      const field = flowField({ ...level, solid }, level.start.x, level.start.z, 32000);
      const hr = level.rooms[layout.rooms.hr?.[0] ?? -1];
      if (hr === undefined) throw new Error('no HR office');
      let inHr = 0;
      for (let y = hr.y; y < hr.y + hr.h; y++) for (let x = hr.x; x < hr.x + hr.w; x++) if ((field[y * level.w + x] ?? -1) >= 0) inHr++;
      expect(inHr, `seed ${seed}: HR by the spine`).toBeGreaterThan(0);
    }
  });

  it('builds the same layout furnished and bare', () => {
    const theme = THEMES[1];
    if (theme === undefined) throw new Error('theme');
    const full = generateLevel(0, theme, 4242, true, true, id);
    const bare = generateLevel(0, theme, 4242, true, false, id);
    expect([...full.solid]).toEqual([...bare.solid]);
    expect(full.interactables.map((i) => `${i.kind}@${i.x},${i.z}`)).toEqual(bare.interactables.map((i) => `${i.kind}@${i.x},${i.z}`));
    expect(full.group.children.length).toBeGreaterThan(bare.group.children.length);
  });

  it('starts the player in the lobby, beside the lift', () => {
    const level = build(id, 99);
    expect(level.roomOf[toCell(level.start.z) * level.w + toCell(level.start.x)]).toBe(0);
    expect(cellCenter(toCell(level.start.x))).toBe(level.start.x);
  });
});
