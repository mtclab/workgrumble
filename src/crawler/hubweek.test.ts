import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropGear, resolveActor } from './combat';
import { breach } from './desk';
import type { Actor } from './entities';
import { ARRIVAL_LIFT_ID, type Game } from './game';
import { type Headless, headless } from './headlessgame';
import { HUB_EXTRA_BASE } from './hub';
import { interact, standAt } from './interact';
import { generateLevel, type Interactable, type LevelRecipe } from './level';
import { plainInstance } from './loot';
import { generateMokki } from './mokki';
import { Rng } from './rng';
import { readSlot } from './saves';
import { newSave, normalizeSave, type SaveState } from './state';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});
vi.mock('./mokki', async (orig) => {
  const mod = await orig<typeof import('./mokki')>();
  return { ...mod, generateMokki: (seed: number, _headless?: boolean, upgrades?: readonly string[]) => mod.generateMokki(seed, true, upgrades) };
});
// The loading card and the lift's card go straight on (they wait for a painted frame on a screen).
vi.mock('./screens', async (orig) => ({
  ...await orig<typeof import('./screens')>(),
  showLoading: (_g: Game, _line: string, work: () => void) => work(),
  transitionTo: (_g: Game, _label: string, _big: string, _line: string, then: () => void) => then(),
}));

/**
 * The week through the hub (docs/SPEC_HELLDESK_030_S1.md, S1a gates 5 to
 * 7) on the real Game: Monday on the hub, the lift both ways, Friday only
 * once the P1 is resolved; saves; and where a burnout wakes you.
 */

afterEach(() => vi.unstubAllGlobals());

function slots(): Map<string, string> {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) });
  return m;
}

const lift = (g: Game, id?: number): Interactable => {
  const it = g.level.interactables.find((x) => x.kind === 'elevator' && (id === undefined || x.id === id));
  if (it === undefined) throw new Error('no lift');
  return it;
};

/** E on a lift: its buttons. */
function press(h: Headless, it: Interactable): string[] {
  h.g.promptTarget = { kind: 'interact', it };
  interact(h.g);
  const node = h.dialogues.at(-1);
  expect(node?.speaker).toBe('The lift');
  return node?.options.map((o) => o.label) ?? [];
}

function newCareer(): Headless {
  const h = headless(newSave(1));
  h.g.beginCareer({ name: 'Pat Hub', background: 'grad', sign: 'patch', rung: 0, domain: null, track: null }, true);
  h.pick(/./);
  return h;
}

describe('gate 5: the week goes through the hub', () => {
  it('Monday lands on the hub: the major incident announced and in the tracker, and nothing to fight', () => {
    const h = newCareer();
    const s = h.g.save;
    expect(s).toMatchObject({ location: 'hub', floor: 0, week: 1 });
    expect(h.g.hub).not.toBeNull();
    expect(h.toasts).toContain('Monday. This week\'s major incident: Derek, floor B1.');
    expect(s.quests[0]).toMatchObject({ kind: 'boss', title: 'MAJOR INCIDENT: Derek' });
    expect(h.g.floorName()).toMatch(/^The hub - /);
  });

  it('the lifts: up to the P1 always, Friday only once it is resolved; down to the hub always; the P1 resumes as it was left; next Monday is the hub again', () => {
    const h = newCareer();
    const g = h.g;
    expect(press(h, lift(g))).toEqual(['Floor B1: the major incident', 'Not yet.']);
    h.pick('Floor B1: the major incident');
    expect(g.save).toMatchObject({ location: 'office', floor: 0 });
    expect(g.boss?.name).toBe('Derek');
    // The lift you came up in goes back down; the corner office's goes down too.
    expect(press(h, lift(g, ARRIVAL_LIFT_ID))).toEqual(['Back to the hub', 'Not yet.']);
    h.pick('Not yet.');
    expect(press(h, lift(g))).toEqual(['Back to the hub', 'Not yet.']);
    h.pick('Not yet.');

    // Things done up here: the boss hurt into phase two, somebody resolved, a cooler used, gear left lying.
    const boss = g.boss!;
    boss.hp = boss.maxHp * 0.4;
    boss.phase = 2;
    const someone = g.actors.find((a) => a.hostile && a.spawnIndex >= 0 && a.kind === 'user') as Actor;
    someone.hp = 0;
    resolveActor(g, someone);
    expect(standAt(g, 'cooler')).toBe(true);
    interact(g);
    const cooler = g.level.interactables.find((x) => x.kind === 'cooler' && x.used);
    expect(cooler).toBeDefined();
    const mug = plainInstance('mug', new Rng(3));
    dropGear(g, new THREE.Vector3(g.level.start.x + 1, 0, g.level.start.z + 1), mug, false);
    const left = { hp: boss.hp, phase: boss.phase, resolved: someone.spawnIndex, cooler: cooler!.id };

    press(h, lift(g, ARRIVAL_LIFT_ID));
    h.pick('Back to the hub');
    expect(g.save.location).toBe('hub');
    expect(press(h, lift(g)), 'no Friday while the P1 is open').toEqual(['Floor B1: the major incident', 'Not yet.']);
    expect(g.pickups.some((p) => p.gear?.uid === mug.uid), 'the P1\'s gear is not on the hub').toBe(false);
    h.pick('Floor B1: the major incident');
    // As it was left.
    expect(g.boss?.hp).toBe(left.hp);
    expect(g.boss?.phase).toBe(left.phase);
    expect(g.actors.some((a) => a.spawnIndex === left.resolved), 'the resolved one is still gone').toBe(false);
    expect(g.level.interactables.find((x) => x.id === left.cooler)?.used, 'the cooler is still empty').toBe(true);
    expect(g.pickups.some((p) => p.gear?.uid === mug.uid), 'the mug is still lying there').toBe(true);

    // The boss resolved: Friday on both lifts.
    g.boss!.hp = 0;
    resolveActor(g, g.boss!);
    h.dialogues.length = 0;
    g.screen = 'play';
    expect(press(h, lift(g, ARRIVAL_LIFT_ID))).toEqual(['Back to the hub', 'Friday: to the mökki', 'Not yet.']);
    h.pick('Back to the hub');
    expect(g.elevatorOpen).toBe(true);
    expect(g.save.quests.some((q) => q.kind === 'boss'), 'the major incident is off the tracker').toBe(false);
    expect(press(h, lift(g))).toEqual(['Floor B1: the major incident', 'Friday: to the mökki', 'Not yet.']);
    h.pick('Friday: to the mökki');
    expect(g.save.location).toBe('mokki');
    // Friday evening's calls (the review), answered.
    while ((g.screen as string) === 'dialogue') h.pick(/./);

    // Monday: the hub again, the next floor's major incident, the week begun afresh.
    g.goToWork();
    expect(g.save).toMatchObject({ location: 'hub', floor: 1, week: 2 });
    expect(g.save.floorState).toMatchObject({ floor: 1, bossDone: false, resolved: [], used: [] });
    expect(g.save.hub.week).toBe(2);
    expect(h.toasts.at(-1)).toBe('Monday. This week\'s major incident: Karen, floor 1.');
    expect(g.save.quests[0]).toMatchObject({ kind: 'boss', title: 'MAJOR INCIDENT: Karen' });
    expect(press(h, lift(g))).toEqual(['Floor 1: the major incident', 'Not yet.']);
  });

  it('the hub keeps its own week: used things, and who is after you, until Monday', () => {
    const h = newCareer();
    const g = h.g;
    expect(standAt(g, 'coffee')).toBe(true);
    interact(g);
    const coffee = g.level.interactables.find((x) => x.kind === 'coffee' && x.used)!;
    expect(g.save.hub.used).toContain(coffee.id);
    expect(g.save.floorState.used, 'not the P1\'s').not.toContain(coffee.id);
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    press(h, lift(g, ARRIVAL_LIFT_ID));
    h.pick('Back to the hub');
    expect(g.level.interactables.find((x) => x.id === coffee.id)?.used).toBe(true);
    // Monday: the coffee machine was refilled over the weekend.
    g.save.week = 2;
    g.startWeek(1);
    g.loadHub(false, true);
    expect(g.level.interactables.find((x) => x.id === coffee.id)?.used).toBe(false);
  });
});

describe('gate 6: saves, v4 and from v3', () => {
  const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`./fixtures/save-v3-${name}.json`, import.meta.url), 'utf8')) as Record<string, unknown>;

  it('round trip on the hub: who is after you, the ignores, what was used, the gear lying about', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    const c = g.actors.find((a) => a.colleague && a.kind === 'user' && g.actors.filter((x) => x.name === a.name).length === 1)!;
    breach(g, { t: c.ticket, sla: 0, from: c.name, struck: [], gold: false });
    expect(c.hostile).toBe(true);
    g.save.hub.ignores[8] = 2;
    expect(standAt(g, 'coffee')).toBe(true);
    interact(g);
    const mug = plainInstance('mug', new Rng(5));
    dropGear(g, new THREE.Vector3(g.level.start.x + 1, 0, g.level.start.z), mug, false);
    expect(g.writeSlotFor('quick')).toBe(true);
    const saved = normalizeSave(readSlot('quick')!.data)!;
    expect(saved.version).toBe(4);
    expect(saved.hub).toEqual(g.save.hub);
    const back = headless(saved);
    back.g.loadWorld(true);
    expect(back.g.save.location).toBe('hub');
    expect(back.g.actors.filter((a) => a.hostile).map((a) => a.name)).toEqual([c.name]);
    expect(back.g.level.interactables.find((x) => x.kind === 'coffee')?.used).toBe(true);
    expect(back.g.pickups.some((p) => p.gear?.uid === mug.uid)).toBe(true);
    expect(back.g.save.hub.ignores[8]).toBe(2);
  });

  it('round trip on the P1 floor: the boss fight, the resolved, the floor', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    g.boss!.hp = g.boss!.maxHp * 0.3;
    g.boss!.phase = 2;
    const someone = g.actors.find((a) => a.hostile && a.spawnIndex >= 0 && a.kind !== 'boss')!;
    someone.hp = 0;
    resolveActor(g, someone);
    expect(g.writeSlotFor('quick')).toBe(true);
    const back = headless(normalizeSave(readSlot('quick')!.data)!);
    back.g.loadWorld(true);
    expect(back.g.save).toMatchObject({ location: 'office', floor: 0 });
    expect(back.g.boss?.hp).toBe(g.boss!.hp);
    expect(back.g.boss?.phase).toBe(2);
    expect(back.g.actors.some((a) => a.spawnIndex === someone.spawnIndex)).toBe(false);
  });

  /** What a v3 save must keep: Rep, items, quests, standing, and the floor's progress. */
  function kept(v3: Record<string, unknown>, v4: SaveState): void {
    for (const k of ['name', 'rep', 'level', 'rung', 'gear', 'equipped', 'consumables', 'ammo', 'spells', 'spell', 'questItems', 'questLog', 'quests', 'nextQuestId',
      'standing', 'warnings', 'flags', 'queue', 'stats', 'team', 'upgrades', 'weekend', 'floor', 'week', 'floorState', 'seed', 'careerId'] as const) {
      expect(v4[k], `${k} kept`).toEqual(v3[k]);
    }
  }

  it('v3 mid-floor: on the hub of the same week, everything kept, and the lift takes you up to the floor exactly as it was', () => {
    const v3 = fixture('midfloor');
    const v4 = normalizeSave(JSON.parse(JSON.stringify(v3)))!;
    expect(v4).toMatchObject({ version: 4, location: 'hub' });
    kept(v3, v4);
    const h = headless(v4);
    h.g.loadWorld(true);
    expect(h.g.save.location).toBe('hub');
    expect(h.g.save.hub.week).toBe(3);
    expect(press(h, lift(h.g)), 'the floor\'s boss is still to do: no Friday').toEqual(['Floor 2: the major incident', 'Not yet.']);
    h.pick('Floor 2: the major incident');
    const fs = v3.floorState as SaveState['floorState'];
    expect(h.g.save.floorState).toEqual(fs);
    expect(h.g.boss?.hp).toBe(fs.boss?.hp);
    expect(h.g.boss?.phase).toBe(2);
    for (const idx of fs.resolved) expect(h.g.actors.some((a) => a.spawnIndex === idx), `spawn ${idx} still resolved`).toBe(false);
    for (const id of fs.used) expect(h.g.level.interactables.find((x) => x.id === id)?.used, `prop ${id} still used`).toBe(true);
    expect(h.g.pickups.some((p) => p.gear?.uid === fs.gearDrops[0]?.gear.uid)).toBe(true);
    // The earlier choice's visitor came, and was resolved: still gone.
    expect(h.g.actors.some((a) => a.name === 'Marcus (holding a grudge)'), 'Marcus stays resolved').toBe(false);
    // And after the hub and the lift, nothing of the career was lost on the way (the people met there join the team).
    for (const k of ['rep', 'gear', 'equipped', 'consumables', 'questItems', 'questLog', 'standing', 'warnings', 'stats', 'queue'] as const) expect(h.g.save[k], `${k} after the lift`).toEqual(v3[k]);
    expect(h.g.save.team).toMatchObject(v3.team as SaveState['team']);
  });

  it('v3 at the start of a floor (the lobby): on the hub, the floor waiting upstairs', () => {
    const v3 = fixture('lobby');
    const v4 = normalizeSave(JSON.parse(JSON.stringify(v3)))!;
    expect(v4).toMatchObject({ version: 4, location: 'hub', floor: 0, week: 1 });
    kept(v3, v4);
    const h = headless(v4);
    h.g.loadWorld(true);
    expect(h.g.save.location).toBe('hub');
    expect(h.g.actors.some((a) => a.hostile)).toBe(false);
  });

  it('v3 at the mökki: still at the mökki, and Monday lands on the hub', () => {
    const v3 = fixture('mokki');
    const v4 = normalizeSave(JSON.parse(JSON.stringify(v3)))!;
    expect(v4).toMatchObject({ version: 4, location: 'mokki' });
    kept(v3, v4);
    const h = headless(v4);
    h.g.loadWorld(true);
    expect(h.g.save.location).toBe('mokki');
    h.g.goToWork();
    expect(h.g.save).toMatchObject({ location: 'hub', floor: 2, week: 3 });
    expect(h.g.save.rep).toBe(v3.rep);
  });

  it('a v4 save broken in the hub field loads with a fresh hub, not a crash', () => {
    const s = JSON.parse(JSON.stringify(newSave(4))) as Record<string, unknown>;
    s.hub = { week: 'x', hostile: [{ spawnIndex: 'nope' }, { spawnIndex: 4, reason: 'breach' }], ignores: { 8: 2, bad: 1 }, used: [1, 'a'] };
    const v4 = normalizeSave(s)!;
    expect(v4.hub).toMatchObject({ week: 1, hostile: [{ spawnIndex: 4, reason: 'breach' }], ignores: { 8: 2 }, used: [1], gearDrops: [] });
  });

  it('extras who came up the lift are saved by name', () => {
    slots();
    const h = newCareer();
    breach(h.g, { t: 1, sla: 0, from: 'Kim from Upstairs', struck: [], gold: false });
    expect(h.g.save.hub.hostile).toEqual([{ spawnIndex: HUB_EXTRA_BASE, reason: 'breach', name: 'Kim from Upstairs' }]);
  });
});

describe('gate 7: burnout', () => {
  /** A DOM just big enough for the burnout screen: its buttons can be pressed. */
  function dom(): { press(label: RegExp): void } {
    const made: { textContent: string; click?: (e: unknown) => void }[] = [];
    const element = (): Record<string, unknown> => {
      const el: Record<string, unknown> = {
        className: '', textContent: '', style: {}, outerHTML: '', classList: { toggle: () => undefined, add: () => undefined },
        append: () => undefined, setAttribute: () => undefined, querySelector: () => null, replaceChildren: () => undefined, getContext: () => null,
        addEventListener: (_t: string, fn: (e: unknown) => void) => { el.click = fn; },
      };
      made.push(el as { textContent: string; click?: (e: unknown) => void });
      return el;
    };
    vi.stubGlobal('document', { createElement: element });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { fn(); return 0; });
    vi.stubGlobal('window', { setTimeout: (fn: () => void) => { fn(); return 0; } });
    return {
      press: (label: RegExp): void => {
        const b = made.find((x) => label.test(x.textContent) && x.click !== undefined);
        if (b === undefined) throw new Error(`no button ${String(label)}`);
        b.click?.({ stopPropagation: () => undefined });
      },
    };
  }

  function burnOut(h: Headless): void {
    h.g.save.sanity = 0;
    h.g.checkBurnout();
    expect(h.g.screen).toBe('dead');
    expect(h.g.save.stats.burnouts).toBe(1);
  }

  it('in the hub: you wake in the hub, at its lift', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    const page = dom();
    g.player.pos.set(g.level.start.x + 9, 0, g.level.start.z + 9);
    burnOut(h);
    page.press(/Clock back in/);
    expect(g.screen).toBe('play');
    expect(g.save.location).toBe('hub');
    expect(g.hub).not.toBeNull();
    const l = lift(g);
    expect(Math.hypot(g.player.pos.x - g.level.start.x, g.player.pos.z - g.level.start.z), 'at the lobby\'s start').toBeLessThan(0.01);
    expect(g.level.roomOf[Math.floor(l.z / 2) * g.level.w + Math.floor(l.x / 2)], 'the lift is in that lobby').toBe(0);
  });

  it('on the P1 floor: that floor again, its progress kept, as it always was', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    g.boss!.hp = g.boss!.maxHp * 0.5;
    const hp = g.boss!.hp;
    const page = dom();
    burnOut(h);
    page.press(/Clock back in/);
    expect(g.screen).toBe('play');
    expect(g.save).toMatchObject({ location: 'office', floor: 0 });
    expect(g.boss?.hp).toBe(hp);
    expect(Math.hypot(g.player.pos.x - g.level.start.x, g.player.pos.z - g.level.start.z)).toBeLessThan(0.01);
  });
});

// The mökki is generated without textures here; make sure the mock is the one in use.
it('the test world builds the mökki headless', () => {
  expect(generateMokki(1).w).toBeGreaterThan(0);
});
