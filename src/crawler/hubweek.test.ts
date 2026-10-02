import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dropGear, EXIT_LIT, lastStand, placeQuestPickup, resolveActor, updatePickups } from './combat';
import { breach } from './desk';
import type { Actor } from './entities';
import { ARRIVAL_LIFT_ID, type Game } from './game';
import { answering, DT, type Headless, headless, lift, newCareer, press } from './headlessgame';
import { HUB_EXTRA_BASE, p1Resolved, personKey, workstationOf } from './hub';
import { interact, standAt, standBy } from './interact';
import * as host from './hosts';
import { isPracticeTicket } from './induction';
import { requestMentoring } from './teamwork';
import { generateLevel, type Interactable, type LevelRecipe } from './level';
import { plainInstance, uniqueInstance } from './loot';
import { generateMokki } from './mokki';
import { Rng } from './rng';
import { questOf, startStage } from './questing';
import { QUESTS, talkGiver } from './quests';
import { readSlot } from './saves';
import { activityHere, newSave, normalizeSave, type SaveState } from './state';
import { CONSUMABLES } from './items';
import { drink } from './vices';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});
vi.mock('./mokki', async (orig) => {
  const mod = await orig<typeof import('./mokki')>();
  return { ...mod, generateMokki: (seed: number, _headless?: boolean, upgrades?: readonly string[]) => mod.generateMokki(seed, true, upgrades) };
});
// Under the steam needs a screen to draw on: here it is only the moment it starts that matters.
vi.mock('./vision', async (orig) => ({ ...await orig<typeof import('./vision')>(), Vision: class { update(): null { return null; } } }));
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

describe('S1a: drinks and quest pickups belong to where you are', () => {
  function at(location: 'hub' | 'office'): Headless {
    const h = newCareer();
    if (location === 'office') h.g.liftToP1();
    return h;
  }

  function elsewhere(s: SaveState): SaveState['hub'] | SaveState['floorState'] {
    return s.location === 'hub' ? s.floorState : s.hub;
  }

  for (const location of ['hub', 'office'] as const) {
    it(`drinking on the ${location} leaves the other place unchanged, including its sober boss reward`, () => {
      const h = at(location);
      const g = h.g;
      const other = structuredClone(elsewhere(g.save));
      drink(g, CONSUMABLES.find((c) => c.id === 'lonkero')!);
      expect(elsewhere(g.save), 'drinking leaves the other record unchanged').toEqual(other);
      expect(activityHere(g.save).drinksHere, 'the drink is counted here').toBe(1);
      if (location === 'hub') g.liftToP1();
      g.boss!.hp = 0;
      resolveActor(g, g.boss!);
      expect(g.save.achievements.includes('sober'), 'only drinks on the P1 cost its sober reward').toBe(location === 'hub');
      g.liftToHub();
      expect(g.drinksHere(), 'the hub keeps only its own drinks').toBe(location === 'hub' ? 1 : 0);
      g.liftToP1();
      expect(g.drinksHere(), 'the P1 keeps only its own drinks').toBe(location === 'office' ? 1 : 0);
    });

    it.each([0, 1])(`Dry Week on the ${location} checks the local drink count: %s`, (localDrinks) => {
      const h = at(location);
      const g = h.g;
      activityHere(g.save).drinksHere = localDrinks;
      elsewhere(g.save).drinksHere = 1 - localDrinks;
      g.save.questLog = [{ id: 'dryweek', stage: 1, progress: 0, done: false, floor: g.floor }];
      const rep = g.save.rep;
      const answer = talkGiver(g, 'dryweek', 'Sanna');
      expect(answer.mood, 'Sanna judges drinks here').toBe(localDrinks === 0 ? 'good' : 'bad');
      expect(g.save.rep - rep, 'the dry player gets the promised reward').toBe(localDrinks === 0 ? 120 : 0);
    });

    it(`loose quest pickups on the ${location} leave the other place unchanged`, () => {
      const h = at(location);
      const g = h.g;
      const other = structuredClone(elsewhere(g.save));
      placeQuestPickup(g, g.player.pos.x, g.player.pos.z, 'nanmug');
      updatePickups(g, DT);
      expect(g.save.questItems, 'the mug can be handed in').toContain('nanmug');
      expect(g.pickups.some((p) => p.id === 'nanmug'), 'the mug is taken').toBe(false);
      expect(elsewhere(g.save), 'taking a loose pickup leaves the other record unchanged').toEqual(other);
      expect(activityHere(g.save).picked, 'the pickup is remembered here').toContain('nanmug');
    });

    it(`locker quest pickups on the ${location} leave the other place unchanged`, () => {
      const h = at(location);
      const g = h.g;
      const locker = g.level.interactables.find((it) => it.kind === 'locker')!;
      g.lockerItems.set(locker.id, 'nanmug');
      g.save.consumables.paperclip = 1;
      Object.assign(g, { lockpick: { start: (_lock: number, _skill: number, _clips: () => number, _snap: () => void, done: (ok: boolean) => void) => done(true) } });
      const other = structuredClone(elsewhere(g.save));
      g.promptTarget = { kind: 'interact', it: locker };
      interact(g);
      expect(g.save.questItems, 'the mug can be handed in').toContain('nanmug');
      expect(g.lockerItems.has(locker.id), 'the locker no longer holds the mug').toBe(false);
      expect(elsewhere(g.save), 'taking a locker pickup leaves the other record unchanged').toEqual(other);
      expect(activityHere(g.save).picked, 'the locker pickup is remembered here').toContain('nanmug');
    });

    it(`quest placement on the ${location} ignores the other place's pickups but remembers its own`, () => {
      const h = at(location);
      const g = h.g;
      const st = { id: 'mug', stage: 0, progress: 0, done: false, floor: g.floor };
      elsewhere(g.save).picked.push('nanmug');
      const other = structuredClone(elsewhere(g.save));
      startStage(g, st);
      expect(g.pickups.some((p) => p.id === 'nanmug'), 'the other place cannot hide this mug').toBe(true);
      const mug = g.pickups.find((p) => p.id === 'nanmug')!;
      g.player.pos.copy(mug.mesh.position).setY(0);
      updatePickups(g, DT);
      g.takeItem('nanmug');
      startStage(g, st);
      expect(g.pickups.some((p) => p.id === 'nanmug'), 'a mug already taken here does not reappear').toBe(false);
      expect(elsewhere(g.save)).toEqual(other);
    });
  }

  it('drinks and pickups survive saves and lift trips, and the hub starts fresh on Monday', () => {
    const h = newCareer();
    const g = h.g;
    g.save.hub.drinksHere = 2;
    g.save.hub.picked.push('nanmug');
    g.save.floorState.drinksHere = 3;
    g.save.floorState.picked.push('postit');
    const saved = normalizeSave(JSON.parse(JSON.stringify(g.save)))!;
    const back = headless(saved);
    back.g.loadWorld(true);
    expect(back.g.drinksHere(), 'hub drinks survive Continue').toBe(2);
    expect(back.g.save.hub.picked, 'hub pickups survive Continue').toEqual(['nanmug']);
    back.g.liftToP1();
    expect(back.g.drinksHere(), 'P1 drinks survive the lift').toBe(3);
    expect(back.g.save.floorState.picked).toEqual(['postit']);
    back.g.liftToHub();
    expect(back.g.drinksHere()).toBe(2);
    expect(back.g.save.hub.picked).toEqual(['nanmug']);
    back.g.save.week++;
    back.g.startWeek(1);
    back.g.loadHub(false, true);
    expect(back.g.drinksHere(), 'Monday starts a new dry hub week').toBe(0);
    expect(back.g.save.hub.picked, 'Monday restocks hub quest pickups').toEqual([]);
    startStage(back.g, { id: 'mug', stage: 0, progress: 0, done: false, floor: back.g.floor });
    expect(back.g.pickups.some((p) => p.id === 'nanmug'), 'Monday makes the hub mug available again').toBe(true);
  });

  it('older hub saves get their own fresh drink and pickup records without copying the P1', () => {
    const s = newSave(1);
    s.floorState.drinksHere = 3;
    s.floorState.picked = ['postit'];
    const old = JSON.parse(JSON.stringify(s)) as { hub: Partial<SaveState['hub']> };
    delete old.hub.drinksHere;
    delete old.hub.picked;
    const loaded = normalizeSave(old)!;
    expect(loaded.hub).toMatchObject({ bossDone: false, drinksHere: 0, picked: [] });
    expect(loaded.floorState).toEqual(s.floorState);
  });

  it.each(['hub', 'office'] as const)('the PA ending on the %s leaves the other record unchanged and keeps Friday open after Continue', (location) => {
    for (const deal of ['nda', 'parachute'] as const) {
      const h = newCareer();
      const g = h.g;
      g.save.week = 5;
      g.startWeek(4);
      g.loadHub(false, true);
      if (location === 'office') g.liftToP1();
      const other = structuredClone(elsewhere(g.save));
      host.bossDeal(g, deal);
      expect(elsewhere(g.save), 'the PA ending leaves the other record unchanged').toEqual(other);
      expect(location === 'hub' ? g.save.hub.bossDone : g.save.floorState.bossDone, 'the ending is remembered here').toBe(true);
      expect(g.save.stats.bosses, 'the major incident is counted once').toBe(1);
      host.bossDeal(g, deal);
      expect(g.save.stats.bosses).toBe(1);
      g.save.questLog = QUESTS.filter((q) => q.id !== 'dryweek').map((q) => ({ id: q.id, stage: 0, progress: 0, done: true, floor: g.floor }));
      const back = headless(normalizeSave(JSON.parse(JSON.stringify(g.save)))!);
      back.g.loadWorld(true);
      expect(p1Resolved(back.g.save), 'the ending still unlocks Friday after Continue').toBe(true);
      expect(press(back, lift(back.g))).toContain('Friday: to the mökki');
      back.pick('Not yet.');
      expect(back.g.actors.some((a) => questOf(a) === 'dryweek'), 'no dry bet is offered after the major incident is resolved').toBe(false);
      if (location === 'hub') {
        expect(back.g.save.floorState, 'Continue on the hub still keeps P1 unchanged').toEqual(other);
        back.g.liftToP1();
        expect(back.g.boss, 'the settled boss does not return when the lift is taken').toBeNull();
        expect(back.g.save.floorState.bossDone).toBe(true);
      }
      back.g.save.week++;
      back.g.startWeek(5);
      back.g.loadHub(false, true);
      expect(p1Resolved(back.g.save), 'Monday has a new major incident to resolve').toBe(false);
      expect(back.g.save.hub.bossDone, 'the hub ending belongs to its week').toBe(false);
    }
  });

  it('taking a PA ending on the hub after resolving P1 counts the major incident only once', () => {
    const h = newCareer();
    const g = h.g;
    g.save.week = 5;
    g.startWeek(4);
    g.loadHub(false, true);
    g.liftToP1();
    g.boss!.hp = 0;
    resolveActor(g, g.boss!);
    g.liftToHub();
    const floor = structuredClone(g.save.floorState);
    host.bossDeal(g, 'nda');
    expect(g.save.stats.bosses, 'a hub ending cannot count the resolved P1 twice').toBe(1);
    expect(g.save.floorState).toEqual(floor);
    expect(g.save.hub.bossDone).toBe(true);
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
    g.save.hub.ignores[8] = [10, 25];
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
    expect(back.g.save.hub.ignores[8], 'each ignore, with when it was counted').toEqual([10, 25]);
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
    s.hub = { week: 'x', hostile: [{ spawnIndex: 'nope' }, { spawnIndex: 4, reason: 'breach' }], ignores: { 8: 2, 9: [5, 'x', 7], bad: 1, 10: 'no' }, used: [1, 'a'] };
    const v4 = normalizeSave(s)!;
    // A count from an earlier build is that many ignores, counted at the saved clock (0 here).
    expect(v4.hub).toMatchObject({ week: 1, hostile: [{ spawnIndex: 4, reason: 'breach' }], ignores: { 8: [0, 0], 9: [5, 7] }, used: [1], gearDrops: [] });
    expect(Object.keys(v4.hub.ignores)).toEqual(['8', '9']);
  });

  it('extras who came up the lift are saved by name', () => {
    slots();
    const h = newCareer();
    breach(h.g, { t: 1, sla: 0, from: 'Kim from Upstairs', struck: [], gold: false });
    expect(h.g.save.hub.hostile).toEqual([{ spawnIndex: HUB_EXTRA_BASE, reason: 'breach' }]);
    expect(h.g.save.hub.arrivals).toEqual([{ index: HUB_EXTRA_BASE, kind: 'user', name: 'Kim from Upstairs', why: 'breach' }]);
  });

  it('a hub saved by an earlier 0.3.0 build, with somebody up the lift kept by name, loads them as an arrival', () => {
    const s = JSON.parse(JSON.stringify(newSave(4))) as Record<string, unknown>;
    s.hub = { week: 1, hostile: [{ spawnIndex: HUB_EXTRA_BASE + 1, reason: 'breach', name: 'Kim from Upstairs' }], resolved: [], ignores: {}, used: [] };
    const v4 = normalizeSave(s)!;
    expect(v4.hub.hostile).toEqual([{ spawnIndex: HUB_EXTRA_BASE + 1, reason: 'breach' }]);
    expect(v4.hub.arrivals).toEqual([{ index: HUB_EXTRA_BASE + 1, kind: 'user', name: 'Kim from Upstairs', why: 'breach' }]);
    expect(v4.hub.nextArrival, 'the next index is a new one').toBe(HUB_EXTRA_BASE + 2);
  });
});

describe('S1a: arrivals keep who they are', () => {
  /** The save as written and read back, loaded into a fresh game. */
  function reload(h: Headless): Headless {
    const back = headless(normalizeSave(JSON.parse(JSON.stringify(h.g.save)))!);
    back.g.loadWorld(true);
    return back;
  }
  const people = (h: Headless, name: string): Actor[] => h.g.actors.filter((a) => a.name === name && !a.resolved);
  /** Up to the P1 and back down. */
  function upAndBack(h: Headless): void {
    press(h, lift(h.g));
    h.pick('Floor B1: the major incident');
    press(h, lift(h.g, ARRIVAL_LIFT_ID));
    h.pick('Back to the hub');
  }

  it('Derek, blamed: after a trip up the lift and back, and a reload, he is still there and still after you', () => {
    const h = newCareer();
    host.spawnHostile(h.g, 'manager', 1, 'Derek (bitter)');
    const [d] = people(h, 'Derek (bitter)');
    expect(d?.hostile).toBe(true);
    const idx = d!.spawnIndex;
    expect(idx).toBeGreaterThanOrEqual(HUB_EXTRA_BASE);
    expect(h.g.save.hub.arrivals).toEqual([{ index: idx, kind: 'manager', name: 'Derek (bitter)', why: 'story' }]);
    const check = (x: Headless, when: string): void => {
      const all = people(x, 'Derek (bitter)');
      expect(all.length, `${when}: Derek, once`).toBe(1);
      expect(all[0]?.hostile, `${when}: still after you`).toBe(true);
      expect(all[0]?.marker, `${when}: the "!"`).not.toBeNull();
      expect(all[0]?.kind).toBe('manager');
      expect(all[0]?.spawnIndex, `${when}: the same person`).toBe(idx);
      expect(x.g.save.hub.hostile).toEqual([{ spawnIndex: idx, reason: 'story' }]);
    };
    upAndBack(h);
    check(h, 'after the lift');
    check(reload(h), 'after a reload');
  });

  it('a manager who caught you napping is the same manager after a reload (a visit, not a fight)', () => {
    const h = newCareer();
    const m = h.g.hub!.visit('manager', h.g.level.start.x + 2, h.g.level.start.z);
    expect(m?.hostile).toBe(false);
    const back = reload(h);
    const again = back.g.actors.filter((a) => a.spawnIndex === m!.spawnIndex);
    expect(again.map((a) => [a.name, a.kind, a.hostile])).toEqual([[m!.name, 'manager', false]]);
    expect(back.g.save.hub.arrivals).toEqual([{ index: m!.spawnIndex, kind: 'manager', name: m!.name, why: 'visit' }]);
  });

  it('breach arrivals: two, the first resolved, a third: three distinct people, the third never takes a resolved one\'s index, all kept through the lift and a reload', () => {
    const h = newCareer();
    const g = h.g;
    const names = ['Ana from Upstairs', 'Ben from Upstairs', 'Cy from Upstairs'];
    breach(g, { t: 1, sla: 0, from: names[0]!, struck: [], gold: false });
    breach(g, { t: 2, sla: 0, from: names[1]!, struck: [], gold: false });
    const first = people(h, names[0]!)[0]!;
    first.hp = 0;
    resolveActor(g, first);
    breach(g, { t: 3, sla: 0, from: names[2]!, struck: [], gold: false });
    const rec = g.save.hub.arrivals;
    expect(rec.map((r) => r.name)).toEqual(names);
    expect(new Set(rec.map((r) => r.index)).size, 'three distinct records').toBe(3);
    expect(rec.map((r) => r.index), 'counting up, never reused').toEqual([HUB_EXTRA_BASE, HUB_EXTRA_BASE + 1, HUB_EXTRA_BASE + 2]);
    const after = (x: Headless, when: string): void => {
      expect(people(x, names[0]!), `${when}: the resolved one stays away`).toEqual([]);
      for (const n of names.slice(1)) {
        expect(people(x, n).length, `${when}: ${n}, once`).toBe(1);
        expect(people(x, n)[0]?.hostile, `${when}: ${n} still after you`).toBe(true);
      }
      expect(x.g.save.hub.hostile.map((e) => e.spawnIndex).sort()).toEqual([HUB_EXTRA_BASE + 1, HUB_EXTRA_BASE + 2]);
    };
    after(h, 'now');
    upAndBack(h);
    after(h, 'after the lift');
    after(reload(h), 'after a reload');
  });

  it('a breach on somebody resolved earlier this week: the same person turns again, announced, and nobody new comes up the lift', () => {
    const h = newCareer();
    const g = h.g;
    const c = g.actors.find((a) => a.colleague && a.kind === 'user' && g.actors.filter((x) => x.name === a.name).length === 1)!;
    const idx = c.spawnIndex;
    breach(g, { t: c.ticket, sla: 0, from: c.name, struck: [], gold: false });
    c.hp = 0;
    resolveActor(g, c);
    expect(g.save.hub.resolved).toContain(idx);
    // Gone for the week, as far as the floor goes: not back after the lift.
    upAndBack(h);
    expect(people(h, c.name)).toEqual([]);
    h.toasts.length = 0;
    breach(g, { t: c.ticket, sla: 0, from: c.name, struck: [], gold: false });
    const again = people(h, c.name);
    expect(again.length, 'one of them').toBe(1);
    expect(again[0]?.spawnIndex, 'the same person').toBe(idx);
    expect(again[0]?.hostile).toBe(true);
    expect(again[0]?.marker).not.toBeNull();
    expect(h.toasts.some((t) => t.includes(`${c.name} is on the way up`)), 'announced').toBe(true);
    expect(g.save.hub.arrivals, 'nobody new up the lift').toEqual([]);
    expect(g.save.hub.resolved).not.toContain(idx);
    expect(g.save.hub.hostile).toEqual([{ spawnIndex: idx, reason: 'breach' }]);
    expect(people(reload(h), c.name).map((a) => [a.spawnIndex, a.hostile]), 'and after a reload').toEqual([[idx, true]]);
  });
});

/** At your own desk (the open plan, among the workers who walk up), the floor's paths recomputed from there. */
function atDesk(h: Headless): void {
  const desk = workstationOf(h.g.level);
  if (desk === undefined || !standBy(h.g, desk)) throw new Error('no desk');
  h.run(DT, answering(h));
}

describe('S1a: hub tickets and breaches', () => {
  it('a ticket raised on the hub that breaches on the P1 floor is the hub\'s: nobody sent upstairs, the reporter after you on the hub when you are back, announced then', () => {
    const h = newCareer();
    const g = h.g;
    const hub = g.hub!;
    atDesk(h);
    hub.walkUpNow();
    h.run(DT, answering(h));
    const w = hub.walkingUp();
    if (w === null) throw new Error('nobody walked up');
    g.promptTarget = { kind: 'actor', a: w };
    interact(g);
    h.pick(/^Could you raise a ticket for that\? \(SLA about \d+ min\)$/);
    h.pick(/./);
    const q = g.save.queue.find((x) => x.from === w.name);
    expect(q?.hub, 'raised on the hub').toBe(true);
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    expect(g.save.location).toBe('office');
    const sent = (): number => g.actors.filter((a) => a.kind === 'manager' && a.spawnIndex < 0 && !a.resolved).length;
    const managers = sent();
    // Its SLA runs out up here, in the real frame.
    q!.sla = DT / 2;
    h.run(DT * 2);
    expect(g.save.queue.includes(q!), 'breached').toBe(false);
    expect(sent(), 'no manager sent upstairs for a hub ticket').toBe(managers);
    expect(h.toasts.some((t) => t.includes(`${w.name} will be waiting for you on the hub`))).toBe(true);
    expect(g.save.hub.breaches).toEqual([{ t: q!.t, from: w.name }]);
    expect(g.save.hub.hostile, 'nothing turned yet: the hub is downstairs').toEqual([]);
    // Back down: they are after you, announced as you arrive.
    h.toasts.length = 0;
    press(h, lift(g, ARRIVAL_LIFT_ID));
    h.pick('Back to the hub');
    const r = g.actors.find((a) => a.colleague && a.name === w.name)!;
    expect(r.hostile, 'the reporter is after you').toBe(true);
    expect(r.marker).not.toBeNull();
    expect(r.bubble).not.toBeNull();
    expect(h.toasts.some((t) => t.includes(`${w.name} is on the way up`)), 'announced on arrival').toBe(true);
    expect(g.save.hub.hostile).toEqual([{ spawnIndex: r.spawnIndex, reason: 'breach' }]);
    expect(g.save.hub.breaches).toEqual([]);
  });
});

describe('S1a: the hub and the P1 floor each have their own once-a-floor saves and steam', () => {
  /** Burnt out at zero: did a once-a-floor save hold you up (and which line said so)? */
  function zero(h: Headless): string | null {
    h.toasts.length = 0;
    h.g.save.sanity = 0;
    h.g.sisuT = 0;
    const held = lastStand(h.g);
    return held ? h.toasts.at(-1) ?? '' : null;
  }
  function withNokia(h: Headless): void {
    const nokia = uniqueInstance('nokia', new Rng(2))!;
    h.g.save.gear.push(nokia);
    h.g.equipGear(nokia.uid);
    expect(h.g.derived().specials.has('nokia')).toBe(true);
  }
  /** A full Löyly meter, and a sauna's worth more: does the steam take you under? */
  function steam(h: Headless): boolean {
    const g = h.g;
    g.visionDue = false;
    const max = g.derived().maxLoyly;
    g.save.loyly = max;
    g.steamOverflow('sauna', max, max);
    return g.visionDue;
  }

  for (const first of ['hub', 'P1'] as const) {
    it(`Unbreakable, the Nokia and the SUO used on the ${first === 'hub' ? 'hub do not spend the P1 floor\'s' : 'P1 floor do not spend the hub\'s'}`, () => {
      const h = newCareer();
      const g = h.g;
      g.save.perks.unbreakable = 1;
      withNokia(h);
      const up = (): void => { press(h, lift(g)); h.pick('Floor B1: the major incident'); };
      const down = (): void => { press(h, lift(g, ARRIVAL_LIFT_ID)); h.pick('Back to the hub'); };
      if (first === 'P1') up();
      // Spent here: Unbreakable, then the Nokia, then nothing; and the steam once.
      expect(zero(h)).toContain('UNBREAKABLE');
      expect(zero(h)).toContain('Nokia');
      expect(zero(h), 'both spent here').toBeNull();
      expect(steam(h), 'the steam takes you under').toBe(true);
      (g as unknown as { startVision(): void }).startVision();
      g.vision = null;
      expect(steam(h), 'once a floor').toBe(false);
      // The other place still has its own.
      if (first === 'P1') down();
      else up();
      expect(zero(h), 'Unbreakable still there').toContain('UNBREAKABLE');
      expect(zero(h), 'the Nokia still there').toContain('Nokia');
      expect(zero(h)).toBeNull();
      expect(steam(h), 'and the steam').toBe(true);
    });
  }

  it('the hub\'s are fresh each Monday', () => {
    const h = newCareer();
    h.g.save.hub.once = { unbreakableUsed: true, nokiaUsed: true, suo: true, coldSteam: true };
    h.g.save.week = 2;
    h.g.startWeek(1);
    h.g.loadHub(false, true);
    expect(h.g.save.hub.once).toEqual({ unbreakableUsed: false, nokiaUsed: false, suo: false, coldSteam: false });
  });
});

describe('S1a: the induction\'s early exit', () => {
  function inducted(step: 'look' | 'parry' | 'ticket'): Headless {
    const h = headless(newSave(1));
    h.g.beginCareer({ name: 'Pat Hub', background: 'grad', sign: 'patch', rung: 0, domain: null, track: null }, false);
    h.pick(/./);
    expect(h.g.inductionDay).not.toBeNull();
    h.g.save.induction = { step, looked: 0, sanityTold: false };
    return h;
  }

  it('before the floor is awake the lift stays shut; once it is, the lift goes up and the induction is abandoned (not finished)', () => {
    const asleep = inducted('parry');
    expect(asleep.g.floorAwake).toBe(false);
    const before = asleep.dialogues.length;
    asleep.g.promptTarget = { kind: 'interact', it: lift(asleep.g) };
    interact(asleep.g);
    expect(asleep.dialogues.length, 'no buttons yet').toBe(before);
    expect(asleep.toasts.at(-1)).toContain('Finish the card first');

    const h = inducted('ticket');
    const g = h.g;
    expect(g.floorAwake).toBe(true);
    expect(press(h, lift(g)), 'the lift works once the floor is awake').toEqual(['Floor B1: the major incident', 'Not yet.']);
    h.pick('Floor B1: the major incident');
    expect(g.save.location).toBe('office');
    expect(g.inductionDay, 'the morning is over').toBeNull();
    expect(g.save.induction).toBeNull();
    expect(g.save.queue.some((q) => isPracticeTicket(q)), 'the practice ticket went with it').toBe(false);
    expect(g.settings.inductionDone, 'abandoned, not finished: the next career is still offered it').not.toBe(true);
  });
});

describe('S1a: a mentee comes with you', () => {
  it('Soft Skills Shadowing taken on the hub: the mentee rides up with you, a talk-down upstairs counts, and they come back down', () => {
    // A senior (the team asks seniors for help).
    const h = newCareer(3);
    const g = h.g;
    expect(requestMentoring(g, 'm-talkdown'), 'somebody on the hub asks').toBe(true);
    const ask = g.mentorAsk!;
    const mentee = ask.actor;
    g.promptTarget = { kind: 'actor', a: mentee };
    interact(g);
    h.pick('Of course. Show me.');
    h.pick(/./);
    const st = g.save.questLog.find((q) => q.id === 'm-talkdown')!;
    expect(st.by).toBe(mentee.name);
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    // Upstairs, with you.
    const up = g.actors.filter((a) => a.name === mentee.name && !a.resolved);
    expect(up.length, 'the mentee came up the lift').toBe(1);
    expect(up[0]?.recruited, 'following you').toBe(true);
    expect(up[0]?.role).toBe(mentee.role);
    expect(Math.hypot(up[0]!.pos.x - g.player.pos.x, up[0]!.pos.z - g.player.pos.z)).toBeLessThan(3);
    // A talk-down here, with them watching: it counts.
    const target = g.actors.find((a) => a.hostile && !a.resolved && a.kind === 'user')!;
    target.pos.set(g.player.pos.x + 2, 0, g.player.pos.z);
    g.resolvePeacefully(target, 'charmed');
    expect(st.progress, 'the talk-down counted').toBe(1);
    // And back down: still with you, not two of them.
    press(h, lift(g, ARRIVAL_LIFT_ID));
    h.pick('Back to the hub');
    // (By name and kind: a card's giver this week can share the mentee's name.)
    const down = g.actors.filter((a) => a.name === mentee.name && a.kind === mentee.kind && !a.resolved);
    expect(down.length, 'one of them on the hub').toBe(1);
    expect(down[0]?.recruited).toBe(true);
    expect(Math.hypot(down[0]!.pos.x - g.player.pos.x, down[0]!.pos.z - g.player.pos.z)).toBeLessThan(3);
  });
});

describe('S1a: hub people remember the week', () => {
  it('a healer who signed The Leaving Card and gave you cake does neither again this week: not after the lift, not after a reload', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    g.acceptQuest('leavingcard');
    const st = g.save.questLog.find((q) => q.id === 'leavingcard')!;
    const healer = g.actors.find((a) => a.kind === 'healer' && !a.resolved)!;
    const key = personKey(healer);
    /** E on the healer: what she offers. The signature counts as you talk to her. */
    const visit = (x: Headless): string[] => {
      const her = x.g.actors.find((a) => a.kind === 'healer' && personKey(a) === key);
      if (her === undefined) throw new Error('she is not on the floor');
      x.g.promptTarget = { kind: 'actor', a: her };
      interact(x.g);
      return x.dialogues.at(-1)?.options.map((o) => o.label) ?? [];
    };
    expect(visit(h)).toContain('Is there any cake going?');
    expect(st.progress, 'her signature').toBe(1);
    h.pick('Is there any cake going?');
    h.pick(/./);
    // Up and back down.
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    press(h, lift(g, ARRIVAL_LIFT_ID));
    h.pick('Back to the hub');
    expect(visit(h), 'no second cake').not.toContain('Is there any cake going?');
    expect(st.progress, 'no second signature from her').toBe(1);
    while (h.g.screen === 'dialogue') h.pick(/./);
    // A save and a load.
    expect(g.writeSlotFor('quick')).toBe(true);
    const back = headless(normalizeSave(readSlot('quick')!.data)!);
    back.g.loadWorld(true);
    expect(visit(back), 'after a reload, still no second cake').not.toContain('Is there any cake going?');
    expect(back.g.save.questLog.find((q) => q.id === 'leavingcard')?.progress, 'nor a second signature').toBe(1);
    // Monday: she has forgotten.
    back.g.save.week = 2;
    back.g.startWeek(1);
    back.g.loadHub(false, true);
    expect(back.g.save.hub.people).toEqual({});
  });
});

describe('S1a: computers are counted by where they are', () => {
  it('the Ergonomic Survey counts a hub computer once, this week and next, and a P1 computer with the same id as another', () => {
    const h = newCareer();
    const g = h.g;
    g.acceptQuest('ergonomics');
    const st = g.save.questLog.find((q) => q.id === 'ergonomics')!;
    const logOn = (): number => {
      expect(standAt(g, 'terminal')).toBe(true);
      const t = g.promptTarget;
      if (t?.kind !== 'interact') throw new Error('no computer');
      interact(g);
      g.close();
      return t.it.id;
    };
    const id = logOn();
    expect(st.progress).toBe(1);
    expect(st.terminals).toEqual([`hub:${id}`]);
    // Next week's hub (the week's P1 floor is a different one): the same computer, not a new one.
    g.save.floor = 1;
    g.loadHub(false);
    expect(logOn()).toBe(id);
    expect(st.progress, 'the same hub computer counts once').toBe(1);
    // Upstairs, a computer that happens to have the same id is a different computer.
    press(h, lift(g));
    h.pick('Floor 1: the major incident');
    g.questEvent({ type: 'use', what: 'terminal', terminal: id });
    expect(st.progress, 'a P1 computer is not the hub\'s').toBe(2);
    expect(st.terminals).toEqual([`hub:${id}`, `1:${id}`]);
  });
});

describe('S1a: the way out is the lift that lights up', () => {
  /** The colour of a lift's lamp. */
  const lamp = (it: Interactable): number => {
    let c = -1;
    it.mesh?.traverse((o) => { if (o.name === 'lamp' && o instanceof THREE.Mesh) c = (o.material as THREE.MeshBasicMaterial).color.getHex(); });
    return c;
  };

  it('resolving the boss lights the corner office\'s lift, not the one you came up in; and it is still lit when you come back up', () => {
    const h = newCareer();
    const g = h.g;
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    const exit = g.level.interactables.find((x) => x.kind === 'elevator' && x.id !== ARRIVAL_LIFT_ID)!;
    const arrival = lift(g, ARRIVAL_LIFT_ID);
    expect(lamp(exit), 'red while the incident is open').toBe(0xff3030);
    g.boss!.hp = 0;
    resolveActor(g, g.boss!);
    expect(lamp(exit), 'the corner office\'s lift is lit').toBe(EXIT_LIT);
    expect(lamp(arrival), 'the arrival lift is not').toBe(0xff3030);
    while (g.screen === 'dialogue') h.pick(/./);
    press(h, lift(g, ARRIVAL_LIFT_ID));
    h.pick('Back to the hub');
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    const again = g.level.interactables.find((x) => x.kind === 'elevator' && x.id !== ARRIVAL_LIFT_ID)!;
    expect(lamp(again), 'still lit, back up').toBe(EXIT_LIT);
    expect(lamp(lift(g, ARRIVAL_LIFT_ID))).toBe(0xff3030);
  });
});

describe('S1a: Monday wipes the hub\'s week', () => {
  it('through the real weekend and goToWork: who was after you, who was resolved and the ignores all start again', () => {
    const h = newCareer();
    const g = h.g;
    const hub = g.hub!;
    const people = g.actors.filter((a) => a.colleague && a.kind === 'user' && g.actors.filter((x) => x.name === a.name).length === 1);
    const [after, beaten] = people;
    if (after === undefined || beaten === undefined) throw new Error('not enough people');
    // A walk-up, reached and walked off on: one ignore (first: nobody walks up mid-fight).
    atDesk(h);
    hub.walkUpNow();
    h.run(DT, answering(h));
    const w = hub.walkingUp()!;
    for (let t = 0; t < 40 && !hub.debug().reached; t += 0.5) h.run(0.5, answering(h));
    expect(hub.debug().reached).toBe(true);
    const off = g.level.interactables.map((it) => ({ x: it.x, z: it.z })).find((q) => Math.hypot(q.x - w.pos.x, q.z - w.pos.z) > 8) ?? g.level.start;
    g.player.pos.set(off.x, 0, off.z);
    h.run(DT, answering(h));
    expect(g.save.hub.ignores[w.spawnIndex]?.length, 'an ignore on the books').toBe(1);
    // One after you, one resolved (a breach, beaten).
    breach(g, { t: after.ticket, sla: 0, from: after.name, struck: [], gold: false });
    breach(g, { t: beaten.ticket, sla: 0, from: beaten.name, struck: [], gold: false });
    beaten.hp = 0;
    resolveActor(g, beaten);
    expect(g.save.hub.hostile.map((e) => e.spawnIndex)).toContain(after.spawnIndex);
    expect(g.save.hub.resolved).toContain(beaten.spawnIndex);
    // The week: the P1 resolved, Friday, the weekend, Monday.
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    g.boss!.hp = 0;
    resolveActor(g, g.boss!);
    while (g.screen === 'dialogue') h.pick(/./);
    press(h, lift(g, ARRIVAL_LIFT_ID));
    h.pick('Friday: to the mökki');
    while ((g.screen as string) === 'dialogue') h.pick(/./);
    expect(g.save.location).toBe('mokki');
    g.goToWork();
    while ((g.screen as string) === 'dialogue') h.pick(/./);
    expect(g.save).toMatchObject({ location: 'hub', week: 2 });
    // Each of them, on the books and on the floor.
    expect(g.save.hub.hostile, 'nobody after you').toEqual([]);
    expect(g.save.hub.resolved, 'nobody resolved').toEqual([]);
    expect(g.save.hub.ignores, 'no ignores').toEqual({});
    expect(g.actors.find((a) => a.spawnIndex === after.spawnIndex)?.hostile, `${after.name} had the weekend`).toBe(false);
    expect(g.actors.filter((a) => a.spawnIndex === beaten.spawnIndex && !a.resolved).length, `${beaten.name} is back`).toBe(1);
    expect(g.hub?.debug().ignores, 'the walk-up is forgotten').toEqual([]);
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

describe('resolving somebody pays, with or without a mission card', () => {
  it('a user beaten on the week\'s floor (no card running) pays their Rep', () => {
    const h = newCareer();
    const g = h.g;
    press(h, lift(g));
    h.pick('Floor B1: the major incident');
    expect(g.mission).toBeNull();
    const someone = g.actors.find((a) => a.hostile && !a.resolved && a.kind === 'user') as Actor;
    expect(someone).toBeDefined();
    const before = g.save.rep;
    someone.hp = 0;
    resolveActor(g, someone);
    expect(g.save.rep, 'Rep for the resolve').toBeGreaterThan(before);
  });
});
