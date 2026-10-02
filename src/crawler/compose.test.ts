import { describe, expect, it } from 'vitest';
import { loopCount } from './compose';
import { flowField, generateLevel, type Level, NEIGHBOURS8, toCell } from './level';
import { Rng } from './rng';
import {
  COMPOSED,
  COMPOSED_IDS,
  type ComposedId,
  type FeatureKind,
  MISSION_RECIPES,
  orient,
  type Piece,
  type RecipeSlot,
  sketchOf,
  type TemplateId,
  TEMPLATES,
  variantsOf,
} from './templates';
import { THEMES } from './textures';

/**
 * S2a (docs/SPEC_HELLDESK_030_S2.md): the templates and the floors composed
 * from them. Gate 1: every template in every variant keeps its footprint's
 * rules, has its doors on its edge, and can be walked from every door to
 * every corner of it. Gate 2: every recipe, 150 seeds each, is one connected
 * floor from the lift, with its loops, its objective in reach, its spine (if
 * it has one) a separate way to the objective past a supply closet, and no
 * furniture, person or prop where it should not be.
 */

/** Template structure that stands in a cell (the rest of a template's features keep a cell clear or mark it). */
const STANDS: ReadonlySet<FeatureKind> = new Set(['counter', 'planter', 'landmark', 'rack', 'terminal', 'crate', 'shredder']);
const MACHINES = new Set(['fridge', 'locker', 'vending', 'terminal', 'cooler', 'coffee', 'pantti', 'printer', 'crate', 'kiuas', 'shredder']);
const NEUTRAL = new Set(['user', 'caller', 'manager', 'healer', 'helper', 'npc', 'tonttu']);
const ARENAS: readonly TemplateId[] = ['T1', 'T6', 'T9'];

/** Every walkable cell of a piece you can reach from `from` without going outside it or through its structure. */
function reach(p: Piece, from: number): Set<number> {
  const stands = new Set(p.features.filter((f) => STANDS.has(f.kind)).map((f) => f.y * p.w + f.x));
  const walk = (i: number): boolean => {
    const x = i % p.w;
    const y = (i - x) / p.w;
    const c = p.rows[y]?.[x] ?? '#';
    const edge = x === 0 || y === 0 || x === p.w - 1 || y === p.h - 1;
    return !edge && c !== '#' && c !== '=' && !stands.has(i);
  };
  const seen = new Set<number>();
  const stack = walk(from) ? [from] : [];
  for (const s of stack) seen.add(s);
  while (stack.length > 0) {
    const c = stack.pop() as number;
    const x = c % p.w;
    for (const n of [x > 0 ? c - 1 : -1, x < p.w - 1 ? c + 1 : -1, c - p.w, c + p.w]) {
      if (n < 0 || n >= p.w * p.h || seen.has(n) || !walk(n)) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return seen;
}

function walkableInside(p: Piece): number[] {
  const stands = new Set(p.features.filter((f) => STANDS.has(f.kind)).map((f) => f.y * p.w + f.x));
  const out: number[] = [];
  for (let y = 1; y < p.h - 1; y++) {
    for (let x = 1; x < p.w - 1; x++) {
      const c = p.rows[y]?.[x] ?? '#';
      if (c !== '#' && c !== '=' && !stands.has(y * p.w + x)) out.push(y * p.w + x);
    }
  }
  return out;
}

describe('gate 1: every template, every variant', () => {
  it.each(TEMPLATES)('%s: a valid footprint, doors on its edge, every cell of it reached from every door', (id) => {
    const variants = variantsOf(id);
    expect(variants.length, 'mirrored and turned').toBe(id === 'it' ? 2 : 8);
    for (let seed = 1; seed <= 12; seed++) {
      for (const variant of variants) {
        const sketch = sketchOf(id, new Rng(seed * 7919));
        const p = orient(id, sketch, variant);
        const tag = `${id} seed ${seed} ${JSON.stringify(variant)}`;
        expect(p.rows.every((row) => row.length === p.w), `${tag}: rectangular`).toBe(true);
        expect(p.rows).toHaveLength(p.h);
        expect(p.rooms.length, `${tag}: rooms`).toBeGreaterThan(0);
        // Every edge cell is wall or a door, and every door is listed with the way out of it.
        for (let y = 0; y < p.h; y++) {
          for (let x = 0; x < p.w; x++) {
            const edge = x === 0 || y === 0 || x === p.w - 1 || y === p.h - 1;
            const c = p.rows[y]?.[x];
            if (edge) expect(['#', 'D', 'v'], `${tag}: edge ${x},${y}`).toContain(c);
            else expect(c, `${tag}: a service door inside at ${x},${y}`).not.toBe('v');
          }
        }
        expect(p.doors.length, `${tag}: doors`).toBeGreaterThanOrEqual(1);
        for (const d of [...p.doors, ...p.service]) {
          const ox = d.x + d.dx;
          const oy = d.y + d.dy;
          expect(ox < 0 || oy < 0 || ox >= p.w || oy >= p.h, `${tag}: door ${d.x},${d.y} opens outward`).toBe(true);
        }
        // From every door (and every service door), the whole inside.
        const inside = walkableInside(p);
        for (const d of [...p.doors, ...p.service]) {
          const seen = reach(p, (d.y - d.dy) * p.w + d.x - d.dx);
          expect(inside.filter((i) => !seen.has(i)), `${tag}: unreached from door ${d.x},${d.y}`).toEqual([]);
        }
        // Each template's own must-haves (spec table).
        const kinds = (k: FeatureKind): number => p.features.filter((f) => f.kind === k).length;
        const sides = new Set(p.doors.map((d) => `${d.dx},${d.dy}`));
        switch (id) {
          case 'T1':
            expect(sides.size, `${tag}: four doors, one a side, so it loops`).toBe(4);
            expect(p.rooms.map((r) => r.kind)).toEqual(['cubicles']);
            expect(kinds('aisle'), `${tag}: aisles between the pods`).toBeGreaterThan(p.rooms[0]!.w);
            break;
          case 'T2':
            expect(sides.size, `${tag}: a door every side`).toBe(4);
            expect(p.rooms.filter((r) => r.kind === 'meeting').length).toBeGreaterThanOrEqual(2);
            expect(p.rows.join('')).toContain('=');
            break;
          case 'T3': {
            const hr = p.rooms.find((r) => r.tag === 'hr');
            expect(hr, `${tag}: HR at the end`).toBeDefined();
            expect(p.rooms.filter((r) => r.tag === 'office').length).toBeGreaterThanOrEqual(3);
            // HR's office always has its service door (the spine's way in).
            expect(p.service.some((d) => {
              const ix = d.x - d.dx;
              const iy = d.y - d.dy;
              return ix >= hr!.x && iy >= hr!.y && ix < hr!.x + hr!.w && iy < hr!.y + hr!.h;
            }), `${tag}: HR's back door`).toBe(true);
            break;
          }
          case 'T4':
            expect(sides.size, `${tag}: four spokes`).toBe(4);
            expect(kinds('counter'), `${tag}: the island`).toBeGreaterThanOrEqual(9);
            break;
          case 'T5':
            expect(kinds('rack'), `${tag}: racks`).toBeGreaterThan(20);
            expect(kinds('terminal')).toBe(1);
            break;
          case 'T6':
            expect(kinds('landmark'), `${tag}: the landmark`).toBe(1);
            expect(kinds('planter'), `${tag}: the planted void`).toBeGreaterThan(10);
            expect(sides.size).toBe(4);
            break;
          case 'T7':
            expect(p.rooms.map((r) => r.tag)).toEqual(['lobby']);
            expect(kinds('counter'), `${tag}: reception`).toBe(3);
            expect(p.service.length, `${tag}: the back door by the lift`).toBe(1);
            break;
          case 'T9':
            expect(p.rooms.map((r) => r.kind)).toEqual(['boss']);
            break;
          case 'T10':
            expect(p.rooms.map((r) => r.kind)).toEqual(['print']);
            expect(kinds('shredder')).toBe(1);
            break;
          case 'sauna':
            expect(p.rooms.map((r) => r.kind)).toEqual(['sauna']);
            break;
          case 'it':
            expect(p.rooms.map((r) => r.kind)).toEqual(['it']);
            // The counter runs along the top: no door into the space behind it.
            expect(p.doors.every((d) => d.dy !== -1), `${tag}: no door above the counter`).toBe(true);
            break;
        }
      }
    }
  });

  it('the dice give templates inner variety (pods, boxes, offices, sizes, the landmark)', () => {
    for (const id of ['T1', 'T2', 'T3', 'T5', 'T6'] as const) {
      const shapes = new Set<string>();
      for (let seed = 1; seed <= 30; seed++) {
        const s = sketchOf(id, new Rng(seed * 104723));
        shapes.add(`${s.rows().join('|')}#${s.features.map((f) => `${f.kind}${f.x},${f.y}`).join(';')}`);
      }
      expect(shapes.size, id).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('recipe data', () => {
  it('every mission recipe: 3 to 5 templates from the lobby, a loop, its objective among them; sneaky has a spine, loud an arena', () => {
    expect(MISSION_RECIPES.length).toBeGreaterThanOrEqual(10);
    for (const id of MISSION_RECIPES) {
      const rc = COMPOSED[id];
      const ids: TemplateId[] = rc.templates.map((s) => s.id);
      expect(ids.length, id).toBeGreaterThanOrEqual(3);
      expect(ids.length, id).toBeLessThanOrEqual(5);
      expect(ids[0], `${id}: arrives in the lobby`).toBe('T7');
      expect(rc.loops, id).toBeGreaterThanOrEqual(1);
      expect(rc.objective === null ? false : ids.includes(rc.objective), `${id}: its objective's template`).toBe(true);
      if (rc.style === 'sneaky') expect(rc.spine, `${id}: sneaky has a spine`).toBe(true);
      if (rc.style === 'loud') expect(ids.some((t) => ARENAS.includes(t)), `${id}: loud has an arena`).toBe(true);
    }
  });

  it('the hub recipe is the spec\'s: lobby, kitchen, two bullpens, ring, offices, server hall, print room, the sauna sometimes, Internal IT; two loops', () => {
    const hub = COMPOSED.hub;
    expect(hub.templates.map((s) => s.id)).toEqual(['T7', 'T4', 'T1', 'T1', 'T2', 'T3', 'T5', 'T10', 'sauna', 'it']);
    expect((hub.templates as readonly RecipeSlot[]).find((s) => s.id === 'sauna')?.chance).toBe(0.7);
    expect(hub.loops).toBeGreaterThanOrEqual(2);
    expect(hub.spine).toBe(false);
  });
});

const SEEDS = Array.from({ length: 150 }, (_, i) => (i + 1) * 7919);

function build(id: ComposedId, seed: number): Level {
  const theme = THEMES[seed % THEMES.length];
  if (theme === undefined) throw new Error('theme');
  return generateLevel(id === 'hub' ? 2 : 1, theme, seed, true, false, id);
}

function nearReach(level: Level, field: Int16Array, x: number, z: number): boolean {
  const cx = toCell(x);
  const cz = toCell(z);
  if ((field[cz * level.w + cx] ?? -1) >= 0) return true;
  return NEIGHBOURS8.some(([ox, oz]) => (field[(cz + oz) * level.w + cx + ox] ?? -1) >= 0);
}

/** Gate 2 on one floor; returns its loop count. */
function checkFloor(id: ComposedId, level: Level, seed: number): number {
  const rc = COMPOSED[id];
  const tag = `${id} seed ${seed}`;
  const layout = level.recipe;
  if (layout === undefined) throw new Error(`${tag}: no layout`);
  expect(layout.id).toBe(id);
  const { w } = level;
  const lifts = level.interactables.filter((it) => it.kind === 'elevator');
  expect(lifts, `${tag}: one lift`).toHaveLength(1);
  expect(lifts[0]?.room, `${tag}: in the lobby`).toBe(0);
  expect(level.rooms[0]?.kind).toBe('lobby');
  const field = flowField(level, level.start.x, level.start.z, 32000);
  // Connected: every walkable cell from the lift.
  for (let i = 0; i < w * level.h; i++) if (level.floor[i] === 1 && level.solid[i] === 0) expect(field[i], `${tag}: cell ${i % w},${Math.floor(i / w)}`).toBeGreaterThanOrEqual(0);
  for (const rm of level.rooms) {
    let n = 0;
    for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) if ((field[y * w + x] ?? -1) >= 0) n++;
    expect(n, `${tag}: room ${rm.id} (${rm.kind}) reached`).toBeGreaterThan(0);
  }
  // The templates as listed, each walled but for its doors; the loops met.
  const placed = layout.templates;
  expect(placed.map((t) => t.id).filter((t) => t !== 'sauna')).toEqual(rc.templates.map((s) => s.id).filter((t) => t !== 'sauna'));
  const loops = loopCount(w, level.h, (i) => level.floor[i] === 1 && level.solid[i] === 0, placed);
  expect(loops, `${tag}: loops`).toBeGreaterThanOrEqual(rc.loops);
  for (const t of placed) {
    const openings = new Set([...t.doors, ...t.service]);
    for (let y = t.y; y < t.y + t.h; y++) {
      for (let x = t.x; x < t.x + t.w; x++) {
        const ring = x === t.x || y === t.y || x === t.x + t.w - 1 || y === t.y + t.h - 1;
        if (ring) expect(level.floor[y * w + x] === 1, `${tag}: ${t.id} ring ${x},${y}`).toBe(openings.has(y * w + x));
      }
    }
    for (const d of t.doors) expect(field[d], `${tag}: ${t.id} door reached`).toBeGreaterThanOrEqual(0);
  }
  // The objective's template, in reach.
  if (rc.objective !== null) {
    const ob = placed[layout.objective];
    expect(ob?.id, `${tag}: the objective's template`).toBe(rc.objective);
    let inside = 0;
    for (const id2 of ob!.rooms) {
      const rm = level.rooms[id2]!;
      for (let y = rm.y; y < rm.y + rm.h; y++) for (let x = rm.x; x < rm.x + rm.w; x++) if ((field[y * w + x] ?? -1) >= 0) inside++;
    }
    expect(inside, `${tag}: inside the objective's template`).toBeGreaterThan(0);
  }
  // The spine: from the lobby's service door to the objective's, outside every template, past a supply closet.
  if (rc.spine) {
    const entry = placed[0]!;
    const ob = placed[layout.objective]!;
    expect(entry.service, `${tag}: the lobby's back door`).toHaveLength(1);
    expect(ob.service, `${tag}: the objective's back door`).toHaveLength(1);
    const spine = new Set(layout.spine);
    const doors = new Set([...entry.service, ...ob.service]);
    for (const c of spine) {
      if (doors.has(c)) continue;
      const x = c % w;
      const y = Math.floor(c / w);
      for (const t of placed) expect(x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h, `${tag}: spine ${x},${y} inside ${t.id}`).toBe(false);
    }
    // Walk the spine alone, from the lobby's door: it reaches the objective's.
    const from = entry.service[0]!;
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length > 0) {
      const c = stack.pop()!;
      for (const n of [c - 1, c + 1, c - w, c + w]) if (spine.has(n) && !seen.has(n) && level.solid[n] === 0) { seen.add(n); stack.push(n); }
    }
    expect(seen.has(ob.service[0]!), `${tag}: the spine reaches the objective`).toBe(true);
    // Two wide: every spine cell has a spine neighbour across it.
    expect(layout.spineClosets.length, `${tag}: a supply closet`).toBeGreaterThanOrEqual(1);
    for (const id2 of layout.spineClosets) {
      const it = level.interactables.find((x) => x.id === id2)!;
      expect(it.kind).toBe('locker');
      expect(it.lock).toBeGreaterThan(0);
      const c = toCell(it.z) * w + toCell(it.x);
      expect([c - 1, c + 1, c - w, c + w].some((n) => seen.has(n)), `${tag}: the closet is on the spine`).toBe(true);
    }
    expect(layout.spineNodes.length, `${tag}: a point a patrol crosses the spine`).toBeGreaterThanOrEqual(1);
  } else {
    expect(layout.spine, `${tag}: no spine`).toEqual([]);
  }
  // No furniture walk-through, nothing in a wall, every prop and person in reach.
  for (const it of level.interactables) {
    const c = toCell(it.z) * w + toCell(it.x);
    expect(level.floor[c], `${tag}: ${it.kind} on the floor`).toBe(1);
    expect(nearReach(level, field, it.x, it.z), `${tag}: ${it.kind} reachable`).toBe(true);
    if (MACHINES.has(it.kind)) expect(level.solid[c], `${tag}: ${it.kind} solid`).toBe(1);
  }
  // (A hub person whose chair is under a desk stands at the nearest free spot on load: hub.ts populate.)
  for (const sp of level.spawns) {
    const c = toCell(sp.z) * w + toCell(sp.x);
    expect(level.floor[c], `${tag}: ${sp.kind} not in a wall`).toBe(1);
    expect(nearReach(level, field, sp.x, sp.z), `${tag}: ${sp.kind} reachable`).toBe(true);
  }
  // Glass: in the way, not in the view. The racks: both.
  for (let i = 0; i < w * level.h; i++) {
    if (level.glass?.[i] === 1) expect(level.solid[i] === 1 && level.opaque[i] === 0, `${tag}: glass`).toBe(true);
  }
  // The hum is the server hall's, all of it and nothing else.
  const halls = new Set(placed.filter((t) => t.id === 'T5').flatMap((t) => t.rooms));
  for (let i = 0; i < w * level.h; i++) expect(level.hum?.[i] === 1, `${tag}: hum at ${i}`).toBe(halls.has(level.roomOf[i] ?? -1));
  if (id === 'hub') {
    for (const sp of level.spawns) expect(NEUTRAL.has(sp.kind), `${tag}: ${sp.kind}`).toBe(true);
    expect(level.spawns.length, `${tag}: the hub has its people`).toBeGreaterThanOrEqual(8);
  } else {
    expect(level.spawns, `${tag}: people come with the mission`).toHaveLength(0);
  }
  return loops;
}

describe('gate 2: every recipe x 150 seeds', () => {
  it.each(COMPOSED_IDS.filter((id) => COMPOSED[id].style !== 'show'))('%s: connected from the lift, its loops, the objective in reach, its spine, nothing walked through or in a wall', { timeout: 240_000 }, (id) => {
    for (const seed of SEEDS) checkFloor(id, build(id, seed), seed);
  });

  it.each(COMPOSED_IDS.filter((id) => COMPOSED[id].style === 'show'))('%s (a template on show): the same rules on 30 seeds', { timeout: 120_000 }, (id) => {
    for (const seed of SEEDS.slice(0, 30)) checkFloor(id, build(id, seed), seed);
  });

  it('the same seed, the same floor; furnished or bare, the same layout', () => {
    const theme = THEMES[1]!;
    for (const id of ['hub', 'officeSpine', 'migration'] as const) {
      const a = generateLevel(1, theme, 4242, true, false, id);
      const b = generateLevel(1, theme, 4242, true, false, id);
      const full = generateLevel(1, theme, 4242, true, true, id);
      expect([...b.solid]).toEqual([...a.solid]);
      expect([...full.solid], id).toEqual([...a.solid]);
      expect(full.interactables.map((i) => `${i.kind}@${i.x},${i.z}`)).toEqual(a.interactables.map((i) => `${i.kind}@${i.x},${i.z}`));
      expect(full.group.children.length).toBeGreaterThan(a.group.children.length);
    }
  });
});
