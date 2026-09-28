import { describe, expect, it } from 'vitest';
import { TICKETS } from './content/tickets';
import { ALL_ITEMS, CONSUMABLES, PERKS, WEAPONS } from './items';
import { flowField, generateLevel, type Level, NEIGHBOURS8, TILE, toCell } from './level';
import { Rng } from './rng';
import { SPELLS } from './magic';
import { generateMokki } from './mokki';
import {
  attributeMultiplier,
  BACKGROUNDS,
  bandFor,
  BRANCH_RUNG,
  checkChance,
  difficultyFor,
  drinkBac,
  endingFor,
  promille,
  RUNG_COUNT,
  SKILL_UPS_PER_LEVEL,
  titleFor,
} from './rpg';
import { ACTION_ITEM_KG, applyLevelUp, derive, levelUpReady, newSave, useSkill } from './state';
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

  it('skills rise by use and a level is earned by resting, Morrowind-style', () => {
    const s = newSave(1);
    let ups = 0;
    for (let i = 0; i < 400 && !levelUpReady(s); i++) if (useSkill(s, 'hardware', 1) !== null) ups++;
    expect(ups).toBe(SKILL_UPS_PER_LEVEL);
    expect(s.attrUps.grit).toBe(SKILL_UPS_PER_LEVEL);
    const grit = s.attrs.grit;
    applyLevelUp(s, ['grit', 'tech']);
    expect(s.level).toBe(2);
    expect(s.perkPoints).toBe(1);
    expect(s.attrs.grit).toBe(grit + attributeMultiplier(SKILL_UPS_PER_LEVEL));
    expect(levelUpReady(s)).toBe(false);
  });

  it('major skills are learned faster', () => {
    const s = newSave(1, { name: 'T', background: 'army', sign: 'patch', rung: 0, domain: null, track: null });
    expect(s.major).toContain('hardware');
    let majorUses = 0;
    while (useSkill(s, 'hardware', 1) === null) majorUses++;
    const t = newSave(1, { name: 'T', background: 'grad', sign: 'patch', rung: 0, domain: null, track: null });
    t.skills.hardware.value = s.skills.hardware.value - 1;
    let minorUses = 0;
    while (useSkill(t, 'hardware', 1) === null) minorUses++;
    expect(majorUses).toBeLessThan(minorUses);
  });

  it('gear stacks into derived stats', () => {
    const s = newSave(1);
    s.owned.push('cardigan', 'trainers', 'yubikey');
    s.equipped.body = 'cardigan';
    s.equipped.feet = 'trainers';
    s.equipped.trinket = 'yubikey';
    const bare = derive(newSave(1));
    const d = derive(s);
    expect(d.armor - bare.armor).toBeCloseTo(0.25);
    expect(d.speedMult - bare.speedMult).toBeCloseTo(0.15);
    expect(d.maxSanity - bare.maxSanity).toBe(25);
  });

  it('seeded rng repeats', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });
});

describe('Helldesk careers', () => {
  it('climbs from trainee to Senior Architect, and the title is the difficulty', () => {
    expect(titleFor(0, null, null)).toBe('IT Trainee');
    expect(titleFor(BRANCH_RUNG, 'Network', 'specialist')).toBe('Network Operations Specialist');
    expect(titleFor(BRANCH_RUNG + 1, 'Cloud', 'engineer')).toBe('Senior Cloud Engineer');
    expect(titleFor(RUNG_COUNT - 1, 'Security', 'engineer')).toBe('Senior Architect');
    for (let r = 1; r < RUNG_COUNT; r++) expect(difficultyFor(r)).toBeGreaterThan(difficultyFor(r - 1));
  });

  it('a hire above trainee arrives with the experience', () => {
    const low = newSave(1, { name: 'A', background: 'grad', sign: 'patch', rung: 0, domain: null, track: null });
    const high = newSave(1, { name: 'B', background: 'grad', sign: 'patch', rung: 5, domain: 'Database', track: 'engineer' });
    expect(high.level).toBeGreaterThan(low.level);
    expect(high.skills.troubleshooting.value).toBeGreaterThan(low.skills.troubleshooting.value);
    expect(derive(high).meleeMult).toBeGreaterThan(derive(low).meleeMult);
  });

  it('every background has three major skills', () => {
    for (const b of BACKGROUNDS) expect(b.major).toHaveLength(3);
  });

  it('persuasion odds move with skill and difficulty, within 5-95%', () => {
    expect(checkChance(80, 60, 20)).toBeGreaterThan(checkChance(20, 30, 20));
    expect(checkChance(0, 0, 200)).toBeCloseTo(0.05);
    expect(checkChance(100, 100, 0)).toBeCloseTo(0.95);
  });
});

describe('Helldesk vices', () => {
  it('has a narrow Ballmer Peak between tipsy and merry', () => {
    expect(bandFor(0)).toBe('sober');
    expect(bandFor(18)).toBe('tipsy');
    expect(bandFor(30)).toBe('peak');
    expect(bandFor(40)).toBe('tipsy');
    expect(bandFor(50)).toBe('merry');
    expect(bandFor(70)).toBe('hammered');
    expect(bandFor(95)).toBe('blackout');
    expect(promille(40)).toBe('1.00');
  });

  it('tolerance blunts a drink but never to nothing', () => {
    expect(drinkBac(20, 30, 5)).toBeGreaterThan(drinkBac(20, 90, 90));
    expect(drinkBac(20, 100, 100)).toBeGreaterThan(0);
  });

  it('every drink has BAC and is never sold by Internal IT', () => {
    const drinks = CONSUMABLES.filter((c) => c.bac !== undefined);
    expect(drinks.length).toBeGreaterThanOrEqual(5);
    for (const d of drinks) expect(d.unsold).toBe(true);
  });

  it('empties are evidence you have to carry', () => {
    const s = newSave(1);
    const before = derive(s).weight;
    s.empties = 10;
    expect(derive(s).weight).toBeGreaterThan(before);
  });

  it('endings follow the choices', () => {
    const base = { rung: 2, dependency: 0, warnings: 0, flags: {}, standing: { staff: 0, management: 0, kitchen: 0, itcrowd: 0 } };
    expect(endingFor(base).title).toBe('YOU BOUGHT THE FARM');
    expect(endingFor({ ...base, dependency: 80 }).title).toBe('THE DISTILLERY');
    expect(endingFor({ ...base, flags: { ceoDeal: true } }).title).toBe('THE COMPANY MAN');
    expect(endingFor({ ...base, rung: 8 }).title).toBe('THE ARCHITECT RETIRES');
  });
});

describe('Helldesk mökki', () => {
  it('every interactable at the mökki is reachable from the car', () => {
    const level = generateMokki(1234, true);
    const field = reachable(level);
    for (const it of level.interactables) expect(cellReachable(level, field, it.x, it.z), it.kind).toBe(true);
    const kinds = new Set(level.interactables.map((i) => i.kind));
    for (const k of ['bed', 'kiuas', 'lake', 'grill', 'stash', 'car', 'runestone'] as const) expect(kinds.has(k), k).toBe(true);
  });

  it('spells have unique ids and sane costs', () => {
    expect(new Set(SPELLS.map((s) => s.id)).size).toBe(SPELLS.length);
    for (const sp of SPELLS) expect(sp.cost).toBeGreaterThan(0);
  });
});
