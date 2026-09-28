import { describe, expect, it } from 'vitest';
import { caffeineBand, caffeineDecay, CAFFEINE_HALF_LIFE, crashSeconds, effectiveCaffeine, toleranceAfter } from './caffeine';
import { TICKETS } from './content/tickets';
import { ALL_ITEMS, CONSUMABLES, ENERGY_DRINKS, WEAPONS } from './items';
import { flowField, generateLevel, type Level, NEIGHBOURS8, TILE, toCell } from './level';
import { plainInstance, RARITY_INFO, rollGear, sellValue, UNIQUES, uniqueInstance } from './loot';
import { SPELLS } from './magic';
import { generateMokki } from './mokki';
import { TREE_PERKS } from './perks';
import { advance, isActive, MAIN, QUEST_ITEMS, questById, QUESTS, type QuestState, sideQuestsFor, STAFFED, TRANSIENT_ITEMS } from './quests';
import { Rng } from './rng';
import {
  ARCH_RUNG,
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
import {
  ACTION_ITEM_KG,
  applyLevelUp,
  canTakePerk,
  derive,
  levelUpReady,
  migrate,
  newSave,
  normalizeSave,
  raiseSkill,
  useSkill,
  workload,
} from './state';
import { THEMES } from './textures';
import { UPGRADES } from './upgrades';

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

const MACHINES = new Set(['fridge', 'locker', 'vending', 'terminal', 'cooler', 'coffee', 'pantti', 'printer', 'crate', 'kiuas']);

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
      // Machines are never made walk-through to join the floor up.
      if (MACHINES.has(it.kind)) expect(level.solid[toCell(it.z) * level.w + toCell(it.x)], `${it.kind} solid`).toBe(1);
    }
    for (const sp of level.spawns) expect(cellReachable(level, field, sp.x, sp.z), `${sp.kind} spawn reachable`).toBe(true);
    expect(cellReachable(level, field, level.bossSpawn.x, level.bossSpawn.z)).toBe(true);
    // The lobby is never the boss room.
    expect(level.roomOf[toCell(level.bossSpawn.z) * level.w + toCell(level.bossSpawn.x)]).not.toBe(0);
    expect(level.interactables.filter((i) => i.kind === 'elevator')).toHaveLength(1);
    expect(level.interactables.some((i) => i.kind === 'terminal')).toBe(true);
    expect(level.interactables.some((i) => i.kind === 'itdesk')).toBe(true);
    expect(level.rooms.some((r) => r.kind === 'kitchen')).toBe(true);
  });

  it('puts the lift doors on a wall with no corridor opening beside them', () => {
    let clear = 0;
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const theme = THEMES[seed % THEMES.length];
      if (theme === undefined) throw new Error('theme');
      const level = generateLevel(seed % 5, theme, seed * 104729, true);
      const lift = level.interactables.find((i) => i.kind === 'elevator');
      if (lift === undefined) continue;
      const room = level.rooms[lift.room];
      if (room === undefined) continue;
      total++;
      const cx = toCell(lift.x);
      const cz = toCell(lift.z);
      let doorway = false;
      for (let oz = -1; oz <= 1; oz++) {
        for (let ox = -1; ox <= 1; ox++) {
          const ix = cx + ox;
          const iz = cz + oz;
          // Only cells of the room itself can be a doorway.
          if (ix < room.x || iz < room.y || ix >= room.x + room.w || iz >= room.y + room.h) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const x = cx + ox + dx;
            const z = cz + oz + dz;
            const inside = x >= room.x && z >= room.y && x < room.x + room.w && z < room.y + room.h;
            if (!inside && level.floor[z * level.w + x] === 1) doorway = true;
          }
        }
      }
      if (!doorway) clear++;
    }
    expect(clear / total).toBeGreaterThan(0.95);
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

  it('the building gets stranger higher up: new kinds of trouble from the second floor', () => {
    const kinds = (f: number): Set<string> => {
      const out = new Set<string>();
      for (let seed = 1; seed <= 20; seed++) {
        const theme = THEMES[f % THEMES.length];
        if (theme === undefined) throw new Error('theme');
        for (const sp of generateLevel(f, theme, seed * 31, true).spawns) out.add(sp.kind);
      }
      return out;
    };
    const ground = kinds(0);
    const high = kinds(4);
    expect(ground.has('consultant')).toBe(false);
    expect(ground.has('shadowit')).toBe(false);
    for (const k of ['chatbot', 'vendor', 'consultant', 'shadowit']) expect(high.has(k), k).toBe(true);
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

  it('has unique item, perk and quest ids', () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(TREE_PERKS.map((p) => p.id)).size).toBe(TREE_PERKS.length);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    expect(new Set(UNIQUES.map((u) => u.id)).size).toBe(UNIQUES.length);
    expect(WEAPONS.find((w) => w.price === 0)?.id).toBe('stapler');
  });

  it('every legendary has a base item and a special', () => {
    for (const u of UNIQUES) {
      const inst = uniqueInstance(u.id, new Rng(1));
      expect(inst, u.id).not.toBeNull();
      expect(u.special.length).toBeGreaterThan(0);
      expect(ALL_ITEMS.some((i) => i.id === u.base), u.base).toBe(true);
    }
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
    const patience = s.attrs.patience;
    applyLevelUp(s, ['grit', 'tech']);
    expect(s.level).toBe(2);
    expect(s.perkPoints).toBe(1);
    expect(s.attrs.grit).toBe(grit + attributeMultiplier(SKILL_UPS_PER_LEVEL));
    expect(s.attrs.patience).toBe(patience + 1);
    expect(levelUpReady(s)).toBe(false);
  });

  it('skill books count toward the next level', () => {
    const s = newSave(1);
    const before = s.skills.runecraft.value;
    raiseSkill(s, 'runecraft');
    expect(s.skills.runecraft.value).toBe(before + 1);
    expect(s.skillUps).toBe(1);
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

  it('gear instances stack into derived stats, affixes included', () => {
    const s = newSave(1);
    const r = new Rng(3);
    const cardigan = plainInstance('cardigan', r);
    const trainers = plainInstance('trainers', r);
    const key = { ...plainInstance('yubikey', r), affixes: [{ stat: 'maxSanity' as const, value: 10 }] };
    s.gear.push(cardigan, trainers, key);
    s.equipped.body = cardigan.uid;
    s.equipped.feet = trainers.uid;
    s.equipped.trinket = key.uid;
    const bare = derive(newSave(1));
    const d = derive(s);
    expect(d.armor - bare.armor).toBeCloseTo(0.25);
    expect(d.speedMult - bare.speedMult).toBeCloseTo(0.15);
    expect(d.maxSanity - bare.maxSanity).toBe(35);
  });

  it('perks are gated by the skill they belong to', () => {
    const s = newSave(1);
    s.perkPoints = 3;
    expect(canTakePerk(s, 'percussive')).toBe(false);
    s.skills.hardware.value = 15;
    expect(canTakePerk(s, 'percussive')).toBe(true);
    s.perks.percussive = 1;
    expect(canTakePerk(s, 'percussive')).toBe(false);
    s.skills.hardware.value = 40;
    expect(canTakePerk(s, 'percussive')).toBe(true);
    expect(canTakePerk(s, 'patience')).toBe(true);
    s.perkPoints = 0;
    expect(canTakePerk(s, 'patience')).toBe(false);
  });

  it('seeded rng repeats', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });
});

describe('Helldesk careers', () => {
  it('twelve rungs from trainee to Senior Architect, and the title is the difficulty', () => {
    expect(RUNG_COUNT).toBe(12);
    expect(titleFor(0, null, null)).toBe('IT Trainee');
    expect(titleFor(3, null, null)).toBe('Senior Helpdesk Analyst');
    expect(titleFor(BRANCH_RUNG, 'Network', 'specialist')).toBe('Junior Network Operations Specialist');
    expect(titleFor(BRANCH_RUNG + 1, 'Cloud', 'engineer')).toBe('Cloud Engineer');
    expect(titleFor(6, 'Security', 'engineer')).toBe('Senior Security Engineer');
    expect(titleFor(8, 'Database', 'specialist')).toBe('Principal Database Operations Specialist');
    expect(titleFor(ARCH_RUNG, 'Systems', 'engineer', 'domain')).toBe('Systems Architect');
    expect(titleFor(ARCH_RUNG, 'Systems', 'engineer', 'enterprise')).toBe('Enterprise Architect');
    expect(titleFor(RUNG_COUNT - 1, 'Security', 'engineer', 'solutions')).toBe('Senior Architect');
    for (let r = 1; r < RUNG_COUNT; r++) expect(difficultyFor(r)).toBeGreaterThan(difficultyFor(r - 1));
  });

  it('a hire above trainee arrives with the experience', () => {
    const low = newSave(1, { name: 'A', background: 'grad', sign: 'patch', rung: 0, domain: null, track: null });
    const high = newSave(1, { name: 'B', background: 'grad', sign: 'patch', rung: 6, domain: 'Database', track: 'engineer' });
    expect(high.level).toBeGreaterThan(low.level);
    expect(high.skills.troubleshooting.value).toBeGreaterThan(low.skills.troubleshooting.value);
    expect(derive(high).meleeMult).toBeGreaterThan(derive(low).meleeMult);
    expect(high.gear.length).toBeGreaterThan(low.gear.length);
  });

  it('the employer is a second difficulty dial', () => {
    const easy = newSave(1, { name: 'A', background: 'grad', sign: 'patch', rung: 0, domain: null, track: null, workplace: 'fourday' });
    const hard = newSave(1, { name: 'A', background: 'grad', sign: 'patch', rung: 0, domain: null, track: null, workplace: 'deathmarch', ironman: true });
    expect(derive(easy).slaMult).toBeGreaterThan(derive(hard).slaMult);
    expect(hard.ironman).toBe(true);
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

describe('Helldesk saves', () => {
  it('migrates a v2 save: owned items become instances, the old ladder maps onto the new one', () => {
    const v2 = {
      version: 2, seed: 5, name: 'Old Pat', floor: 2, rung: 3, owned: ['stapler', 'keyboard', 'cardigan'],
      equipped: { weapon: 'keyboard', head: null, body: 'cardigan', feet: null, trinket: null },
      perks: { patience: 1, cli: 1 }, perkPoints: 0, stats: { drinks: 4 },
    };
    const s = migrate(v2);
    expect(s).not.toBeNull();
    if (s === null) return;
    expect(s.version).toBe(3);
    expect(s.gear.map((g) => g.base)).toEqual(['stapler', 'keyboard', 'cardigan']);
    expect(s.gear.find((g) => g.uid === s.equipped.weapon)?.base).toBe('keyboard');
    expect(s.gear.find((g) => g.uid === s.equipped.body)?.base).toBe('cardigan');
    expect(s.rung).toBe(4);
    expect(s.perks.patience).toBe(1);
    expect(s.perks.cli).toBeUndefined();
    expect(s.perkPoints).toBe(1);
    expect(s.stats.drinks).toBe(4);
    expect(s.stats.elites).toBe(0);
  });

  it('normalises a partial v3 save so new fields are never missing', () => {
    const s = newSave(7);
    const partial = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete partial.buffs;
    delete partial.weekend;
    delete (partial.floorState as Record<string, unknown>).resolved;
    (partial.stats as Record<string, unknown>).fish = undefined;
    const n = normalizeSave(partial);
    expect(n).not.toBeNull();
    expect(n?.buffs).toEqual({});
    expect(n?.weekend.book).toBe(false);
    expect(n?.floorState.resolved).toEqual([]);
    expect(n?.floorState.extras).toEqual([]);
    expect(n?.stomach).toBe(0);
    expect(normalizeSave('nonsense')).toBeNull();
  });
});

describe('Helldesk vices', () => {
  it('has a narrow Ballmer Peak between tipsy and merry, wider with the flask', () => {
    expect(bandFor(0)).toBe('sober');
    expect(bandFor(18)).toBe('tipsy');
    expect(bandFor(30)).toBe('peak');
    expect(bandFor(40)).toBe('tipsy');
    expect(bandFor(40, true)).toBe('peak');
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

  it('caffeine: Alert, then WIRED, then the jitters, with tolerance pushing it all up', () => {
    expect(caffeineBand(0, 0)).toBe('none');
    expect(caffeineBand(90, 0)).toBe('alert');
    expect(caffeineBand(200, 0)).toBe('wired');
    expect(caffeineBand(350, 0)).toBe('jittery');
    expect(caffeineBand(500, 0)).toBe('palpitations');
    expect(effectiveCaffeine(200, 0.6)).toBeLessThan(200);
    expect(caffeineBand(200, 0.6)).toBe('alert');
    expect(toleranceAfter(0, 200)).toBeGreaterThan(0);
    expect(caffeineDecay(200, CAFFEINE_HALF_LIFE)).toBeCloseTo(100);
    expect(crashSeconds(100, false)).toBe(0);
    expect(crashSeconds(400, true)).toBeLessThan(crashSeconds(400, false));
  });

  it('there is a proper range of cans, and the White Monster is the rare king', () => {
    const cans = CONSUMABLES.filter((c) => c.mg !== undefined && c.bac === undefined);
    expect(cans.length).toBeGreaterThanOrEqual(10);
    for (const id of ENERGY_DRINKS) expect(CONSUMABLES.some((c) => c.id === id), id).toBe(true);
    const king = CONSUMABLES.find((c) => c.id === 'whitemonster');
    expect(king?.unsold).toBe(true);
    expect(king?.buff).toBe('ultra');
    const s = newSave(1);
    s.caffeine = 520;
    const shaky = derive(s);
    expect(shaky.caffeine.jitter).toBeGreaterThan(0);
    s.buffs.ultra = 30;
    const ascended = derive(s);
    expect(ascended.ultra).toBe(true);
    expect(ascended.caffeine.jitter).toBe(0);
    expect(ascended.caffeine.drain).toBe(0);
    expect(ascended.noRoot).toBe(true);
    expect(ascended.meleeMult).toBeGreaterThan(shaky.meleeMult * 1.3);
    expect(ascended.speedMult).toBeGreaterThan(shaky.speedMult);
    s.buffs = { wings: 20 };
    expect(derive(s).jump).toBeGreaterThan(1.5);
  });

  it('endings follow the choices', () => {
    const base = { rung: 2, dependency: 0, warnings: 0, flags: {}, standing: { staff: 0, management: 0, kitchen: 0, itcrowd: 0 } };
    expect(endingFor(base).title).toBe('YOU BOUGHT THE FARM');
    expect(endingFor({ ...base, dependency: 80 }).title).toBe('THE DISTILLERY');
    expect(endingFor({ ...base, flags: { ceoDeal: true } }).title).toBe('THE COMPANY MAN');
    expect(endingFor({ ...base, flags: { goldenParachute: true } }).title).toBe('THE GOLDEN PARACHUTE');
    expect(endingFor({ ...base, flags: { whistleblower: true } }).title).toBe('THE WHISTLEBLOWER');
    expect(endingFor({ ...base, rung: ARCH_RUNG }).title).toBe('THE ARCHITECT RETIRES');
  });
});

describe('Helldesk loot', () => {
  it('rarity decides the number of affixes, and better loot sells for more', () => {
    const r = new Rng(11);
    for (const rarity of ['common', 'fine', 'rare'] as const) {
      const g = rollGear(r, 2, 0, rarity);
      expect(g.affixes).toHaveLength(RARITY_INFO[rarity].affixes);
    }
    const common = rollGear(new Rng(4), 1, 0, 'common');
    const rare = { ...common, rarity: 'rare' as const };
    expect(sellValue(rare)).toBeGreaterThan(sellValue(common));
  });
});

describe('Helldesk quests', () => {
  it('advances through item, talk and count stages', () => {
    const st: QuestState = { id: 'mug', stage: 0, progress: 0, done: false, floor: 0 };
    expect(advance(st, { type: 'talk', npc: 'brenda' }, 0)).toBe(false);
    expect(advance(st, { type: 'pickup', item: 'nanmug' }, 0)).toBe(true);
    expect(advance(st, { type: 'talk', npc: 'brenda' }, 0)).toBe(true);
    expect(st.done).toBe(true);
    const ex: QuestState = { id: 'exorcism', stage: 0, progress: 0, done: false, floor: 1 };
    for (let i = 0; i < 2; i++) expect(advance(ex, { type: 'resolve', kind: 'jam', peaceful: false, elite: false }, 1)).toBe(false);
    expect(advance(ex, { type: 'resolve', kind: 'user', peaceful: false, elite: false }, 1)).toBe(false);
    expect(advance(ex, { type: 'resolve', kind: 'jam', peaceful: false, elite: false }, 1)).toBe(true);
  });

  it('every floor offers side quests and the main story has five chapters', () => {
    for (let f = 0; f < 10; f++) expect(sideQuestsFor(f).length, `floor ${f}`).toBeGreaterThan(3);
    expect(MAIN).toHaveLength(5);
  });

  it('quest ids are unique, items exist, and staffing never appears as an offer', () => {
    const all = [...QUESTS, ...STAFFED];
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    for (const q of all) {
      expect(questById(q.id)).toBe(q);
      for (const obj of q.stages) if (obj.item !== undefined) expect(QUEST_ITEMS[obj.item], `${q.id}: ${obj.item}`).toBeDefined();
    }
    for (const q of STAFFED) expect(q.staffed).toBe(true);
    for (let f = 0; f < 10; f++) for (const q of sideQuestsFor(f)) expect(q.staffed).not.toBe(true);
    for (const t of TRANSIENT_ITEMS) expect(QUEST_ITEMS[t]).toBeDefined();
  });

  it('advances use, collect and hunt stages', () => {
    const erg: QuestState = { id: 'ergonomics', stage: 0, progress: 0, done: false, floor: 0 };
    expect(advance(erg, { type: 'use', what: 'printer' }, 0)).toBe(false);
    expect(advance(erg, { type: 'use', what: 'terminal' }, 0)).toBe(false);
    expect(advance(erg, { type: 'use', what: 'terminal' }, 0)).toBe(false);
    expect(erg.progress).toBe(2);
    expect(advance(erg, { type: 'use', what: 'terminal' }, 0)).toBe(true);
    expect(erg.stage).toBe(1);
    const audit: QuestState = { id: 's-audit', stage: 0, progress: 0, done: false, floor: 0, staffed: true };
    for (let i = 0; i < 2; i++) expect(advance(audit, { type: 'pickup', item: 'form' }, 0)).toBe(false);
    expect(advance(audit, { type: 'pickup', item: 'badge' }, 0)).toBe(false);
    expect(advance(audit, { type: 'pickup', item: 'form' }, 0)).toBe(true);
    expect(audit.done).toBe(true);
    // A hunt only counts the tagged target, not any chatbot.
    const ghost: QuestState = { id: 'ghost', stage: 1, progress: 0, done: false, floor: 0 };
    expect(advance(ghost, { type: 'resolve', kind: 'chatbot', peaceful: false, elite: true }, 0)).toBe(false);
    expect(advance(ghost, { type: 'resolve', kind: 'chatbot', peaceful: false, elite: true, tag: 'prince' }, 0)).toBe(false);
    expect(advance(ghost, { type: 'resolve', kind: 'chatbot', peaceful: true, elite: true, tag: 'ghost' }, 0)).toBe(true);
  });

  it('failed and delegated work stops advancing and stops counting', () => {
    const s = newSave(7);
    expect(workload(s)).toEqual({ active: 0, capacity: 3, over: 0 });
    const war: QuestState = { id: 's-warroom', stage: 0, progress: 0, done: false, floor: 0, staffed: true, deadline: 240 };
    s.questLog.push(war, { id: 's-patch', stage: 0, progress: 0, done: false, floor: 0, staffed: true },
      { id: 'duck', stage: 0, progress: 0, done: false, floor: 0 }, { id: 'cables', stage: 0, progress: 0, done: false, floor: 0 });
    expect(workload(s)).toEqual({ active: 4, capacity: 3, over: 1 });
    const d = derive(s);
    expect(d.overload).toBe(1);
    expect(d.maxSanity).toBeLessThan(derive({ ...s, questLog: [] }).maxSanity);
    war.failed = true;
    expect(isActive(war)).toBe(false);
    expect(advance(war, { type: 'resolve', kind: 'user', peaceful: false, elite: false }, 0)).toBe(false);
    expect(workload(s).over).toBe(0);
    const patch = s.questLog[1];
    if (patch === undefined) throw new Error('missing');
    patch.delegated = true;
    expect(workload(s).active).toBe(2);
    // Time management and Boundaries buy capacity.
    s.perks.timemgmt = 2;
    expect(workload(s).capacity).toBe(5);
  });
});

describe('Helldesk mökki', () => {
  it('every interactable at the mökki is reachable from the car, fully built or not', () => {
    for (const ups of [[], UPGRADES.map((u) => u.id)]) {
      const level = generateMokki(1234, true, ups);
      const field = reachable(level);
      for (const it of level.interactables) expect(cellReachable(level, field, it.x, it.z), it.kind).toBe(true);
      const kinds = new Set(level.interactables.map((i) => i.kind));
      for (const k of ['bed', 'kiuas', 'lake', 'grill', 'stash', 'car', 'runestone', 'board'] as const) expect(kinds.has(k), k).toBe(true);
    }
    const full = new Set(generateMokki(1234, true, UPGRADES.map((u) => u.id)).interactables.map((i) => i.kind));
    for (const k of ['dock', 'patch', 'palju', 'bookshelf', 'terminal'] as const) expect(full.has(k), k).toBe(true);
  });

  it('spells have unique ids and sane costs', () => {
    expect(new Set(SPELLS.map((s) => s.id)).size).toBe(SPELLS.length);
    for (const sp of SPELLS) expect(sp.cost).toBeGreaterThan(0);
  });
});
