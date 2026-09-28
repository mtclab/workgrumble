import { describe, expect, it } from 'vitest';
import { TICKETS } from './content/tickets';
import { ALL_ITEMS, PERKS, WEAPONS, xpForLevel } from './items';
import { flowField, generateLevel, type Level, NEIGHBOURS8, TILE, toCell } from './level';
import { Rng } from './rng';
import { ACTION_ITEM_KG, derive, grantXp, newSave } from './state';
import { THEMES } from './textures';

function reachable(level: Level): Int16Array {
  return flowField(level, level.start.x, level.start.z, 32000);
}

function cellReachable(level: Level, field: Int16Array, x: number, z: number): boolean {
  const cx = toCell(x);
  const cz = toCell(z);
  if ((field[cz * level.w + cx] ?? -1) >= 0) return true;
  // Solid props (desks, printers) are used from a neighbouring cell.
  return NEIGHBOURS8.some(([ox, oz]) => (field[(cz + oz) * level.w + cx + ox] ?? -1) >= 0);
}

describe('Helldesk floors', () => {
  const floors: [number, number][] = [];
  for (let seed = 1; seed <= 25; seed++) {
    for (let f = 0; f <= 5; f++) floors.push([seed * 7919, f]);
  }

  it.each(floors)('seed %i floor %i: every walkable cell connects to the lift', (seed, f) => {
    const theme = THEMES[f % THEMES.length];
    if (theme === undefined) throw new Error('theme');
    const level = generateLevel(f, theme, seed, true);
    const field = reachable(level);
    for (let i = 0; i < level.w * level.h; i++) {
      if (level.floor[i] === 1 && level.solid[i] === 0) expect(field[i], `cell ${i}`).toBeGreaterThanOrEqual(0);
    }
    for (const it of level.interactables) {
      expect(cellReachable(level, field, it.x, it.z), `${it.kind} reachable`).toBe(true);
    }
    expect(cellReachable(level, field, level.bossSpawn.x, level.bossSpawn.z)).toBe(true);
    expect(level.interactables.filter((i) => i.kind === 'elevator')).toHaveLength(1);
    expect(level.interactables.some((i) => i.kind === 'terminal')).toBe(true);
    expect(level.interactables.some((i) => i.kind === 'itdesk')).toBe(true);
    expect(level.rooms.some((r) => r.kind === 'kitchen')).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const theme = THEMES[1];
    if (theme === undefined) throw new Error('theme');
    const a = generateLevel(1, theme, 42, true);
    const b = generateLevel(1, theme, 42, true);
    expect(Array.from(a.solid)).toEqual(Array.from(b.solid));
    expect(a.spawns).toEqual(b.spawns);
    expect(a.start.x).toBeGreaterThan(0);
    expect(a.w * TILE).toBeGreaterThan(0);
  });
});

describe('Helldesk content', () => {
  it('carries the office sim tickets, each with a fix to choose', () => {
    expect(TICKETS.length).toBeGreaterThan(100);
    for (const t of TICKETS) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.fixes.length).toBeGreaterThan(0);
    }
  });

  it('has unique item and perk ids', () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PERKS.map((p) => p.id)).size).toBe(PERKS.length);
    expect(WEAPONS.find((w) => w.price === 0)?.id).toBe('stapler');
  });
});

describe('Helldesk character', () => {
  it('action items weigh you down until you are over-encumbered', () => {
    const s = newSave(1);
    expect(derive(s).overEncumbered).toBe(false);
    s.actionItems = Math.ceil(40 / ACTION_ITEM_KG) + 1;
    expect(derive(s).overEncumbered).toBe(true);
    s.perks.back = 3;
    s.perks.teflon = 1;
    expect(derive(s).overEncumbered).toBe(false);
  });

  it('levels up and banks perk points', () => {
    const s = newSave(1);
    expect(grantXp(s, xpForLevel(1) + xpForLevel(2))).toBe(2);
    expect(s.level).toBe(3);
    expect(s.perkPoints).toBe(2);
  });

  it('gear stacks into derived stats', () => {
    const s = newSave(1);
    s.owned.push('cardigan', 'trainers', 'yubikey');
    s.equipped.body = 'cardigan';
    s.equipped.feet = 'trainers';
    s.equipped.trinket = 'yubikey';
    const d = derive(s);
    expect(d.armor).toBeCloseTo(0.25);
    expect(d.speedMult).toBeCloseTo(1.15);
    expect(d.maxSanity).toBe(125);
  });

  it('seeded rng repeats', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });
});
