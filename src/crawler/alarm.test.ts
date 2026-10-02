import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strike } from './combat';
import type { Actor } from './entities';
import type { Game } from './game';
import { hide, holdAll } from './deckplay';
import { DT, type Headless, headless } from './headlessgame';
import { generateLevel, type LevelRecipe } from './level';
import type { AlarmRule, MissionCard } from './mission';
import { POSTITS, STAPLER } from './missions';
import { newSave } from './state';
import { COOLDOWN, INVESTIGATE, SEARCH_AFTER, SEARCH_COUNTDOWN, type Watcher } from './stealth';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});
vi.mock('./screens', async (orig) => ({
  ...await orig<typeof import('./screens')>(),
  showLoading: (_g: Game, _line: string, work: () => void) => work(),
}));

/**
 * The alarm rule per card (docs/SPEC_HELLDESK_030_S1.md, S1b gate 3, D7)
 * on the real Game and its production loop (headlessgame.ts), on the
 * stapler's map: one-way never drops; search drops an Alert person to
 * Noticed only after SEARCH_AFTER seconds unseen and the SEARCH_COUNTDOWN,
 * the countdown over their head, never from Escalated; cooldown drops one
 * tier after COOLDOWN seconds unseen and with no fighting, announced.
 */

afterEach(() => vi.restoreAllMocks());

const SEED = 4242;

function play(alarm: AlarmRule, card: MissionCard = STAPLER): Headless {
  const h = headless(newSave(1));
  h.g.loadMission(card, SEED, true, alarm);
  h.g.screen = 'play';
  return h;
}

/** Somebody at a desk, by their watcher. */
function deskWatcher(h: Headless, skip: readonly Actor[] = []): Watcher {
  const m = h.g.mission!;
  const w = [...m.watch.watchers.values()].find((x) => x.sort === 'desk' && !skip.includes(x.actor));
  if (w === undefined) throw new Error('nobody at a desk');
  return w;
}

/**
 * Stand in their view, standing up, until they are Alert; everyone else is
 * held where they are meanwhile (one person's alarm, not a crowd's), and
 * then they are all held: the alarm is the point here, not the chase.
 */
function alert(h: Headless, w: Watcher): void {
  const m = h.g.mission!;
  expect(m.standInView(w.actor.id, 3)).toBe(true);
  const others = (): void => { for (const a of m.crowd) if (a !== w.actor) a.stunned = 1e9; };
  for (let t = 0; t < 8 && w.mood !== 'alert'; t += DT) {
    others();
    h.run(DT, () => { h.g.save.sanity = 100; if (w.mood !== 'alert') m.standInView(w.actor.id, 3); });
  }
  expect(w.mood, `${w.actor.name} is Alert`).toBe('alert');
  holdAll(h)();
}

const freeAll = (h: Headless): void => { for (const a of h.g.mission!.crowd) a.stunned = 0; };

describe('gate 3: the alarm rule per card', () => {
  it('one-way: once they know, they know - an Alert person lost for a minute is still Alert, and the tier never drops', () => {
    const h = play('one-way');
    const w = deskWatcher(h);
    alert(h, w);
    const tier = h.g.mission!.watch.tier;
    hide(h);
    h.run(60, holdAll(h));
    expect(w.mood).toBe('alert');
    expect(w.actor.aggro).toBe(true);
    expect(h.g.mission!.watch.tier).toBe(tier);
    expect(h.toasts.some((t) => t.startsWith('STOOD DOWN'))).toBe(false);
    expect(h.missionHud?.rule).toBe('Once they know, they know.');
  });

  it('search: lost for 8 s they search (a countdown over their head, walking to where they last saw you), and only at the end of it drop to Noticed', () => {
    const h = play('search');
    const m = h.g.mission!;
    const w = deskWatcher(h);
    alert(h, w);
    expect(m.watch.tier).toBe(2);
    const seenAt = { x: h.g.player.pos.x, z: h.g.player.pos.z };
    hide(h);
    expect(w.lastSeen).toEqual(seenAt);
    h.run(SEARCH_AFTER - 0.3, holdAll(h));
    expect(w.mood, 'not before 8 s').toBe('alert');
    h.run(0.6, holdAll(h));
    expect(w.mood, 'searching after 8 s unseen').toBe('searching');
    expect(w.actor.aggro, 'looking, not chasing').toBe(false);
    expect(w.shown, 'the countdown over their head').toBe(`? ${SEARCH_COUNTDOWN}`);
    expect(m.hud().actors.find((a) => a.id === w.actor.id)?.mark ?? w.shown).toBe(`? ${SEARCH_COUNTDOWN}`);
    expect(m.watch.tier, 'still Alert while they search').toBe(2);
    // Let them go: they walk to where they last saw you, the countdown running.
    freeAll(h);
    const from = Math.hypot(w.actor.pos.x - seenAt.x, w.actor.pos.z - seenAt.z);
    expect(w.spot, 'the spot they saw you at').toEqual(seenAt);
    h.run(5, () => { h.g.save.sanity = 100; });
    expect(Math.hypot(w.actor.pos.x - seenAt.x, w.actor.pos.z - seenAt.z), 'walking to the spot').toBeLessThan(Math.max(1.3, from - 0.5));
    expect(w.shown).toBe(`? ${Math.ceil(SEARCH_COUNTDOWN - 5.3)}`);
    h.run(SEARCH_COUNTDOWN - 5 - 0.6, () => { h.g.save.sanity = 100; });
    expect(w.mood, 'not before the countdown is out').toBe('searching');
    expect(m.watch.tier).toBe(2);
    h.run(0.8, () => { h.g.save.sanity = 100; });
    expect(w.mood, 'gave up: Noticed').toBe('wary');
    expect(w.suspicion).toBe(INVESTIGATE);
    expect(w.shown).toBe('');
    expect(m.watch.tier, 'the tier follows the highest person').toBe(1);
    expect(h.toasts.some((t) => t.startsWith('STOOD DOWN to NOTICED'))).toBe(true);
    expect(m.run.maxTier, 'the run remembers it went Alert').toBe(2);
  });

  it('search: found while searching, they are Alert again at once', () => {
    const h = play('search');
    const m = h.g.mission!;
    const w = deskWatcher(h);
    alert(h, w);
    hide(h);
    h.run(SEARCH_AFTER + 0.5, holdAll(h));
    expect(w.mood).toBe('searching');
    freeAll(h);
    expect(m.standInView(w.actor.id, 3)).toBe(true);
    h.run(0.2, () => { h.g.save.sanity = 100; m.standInView(w.actor.id, 3); });
    expect(w.mood).toBe('alert');
    expect(w.shown).toBe('!');
  });

  it('search: Escalated (everyone) stays Escalated', () => {
    const h = play('search');
    const m = h.g.mission!;
    const a = deskWatcher(h);
    alert(h, a);
    // A second person who turns on you while the first is after you: Escalated.
    const b = deskWatcher(h, [a.actor]);
    b.actor.cooldown = 99;
    strike(h.g, b.actor, 1, null, 'melee');
    h.run(DT * 2, holdAll(h));
    expect(m.watch.tier).toBe(3);
    hide(h);
    h.run(SEARCH_AFTER + 1, holdAll(h));
    expect([...m.watch.watchers.values()].some((w) => w.mood === 'searching'), 'nobody searches at Escalated').toBe(false);
    h.run(SEARCH_COUNTDOWN + 10, holdAll(h));
    expect(m.watch.tier, 'Escalated stays').toBe(3);
    expect([a.mood, b.mood], 'both still after you').toEqual(['alert', 'alert']);
  });

  it('cooldown: 45 s with nobody seeing you and no fighting takes the tier down a step, announced; from Escalated too, one step at a time', () => {
    const h = play('cooldown');
    const m = h.g.mission!;
    const a = deskWatcher(h);
    alert(h, a);
    const b = deskWatcher(h, [a.actor]);
    strike(h.g, b.actor, 1, null, 'melee');
    h.run(DT * 2, holdAll(h));
    expect(m.watch.tier).toBe(3);
    // The fight is over two seconds after the last blow.
    h.run(2.1, holdAll(h));
    hide(h);
    h.toasts.length = 0;
    h.run(COOLDOWN - 0.5, holdAll(h));
    expect(m.watch.tier, 'not before 45 s').toBe(3);
    h.run(1, holdAll(h));
    expect(m.watch.tier, 'one step down').toBe(2);
    expect(h.toasts).toContain('STOOD DOWN to ALERT: it blew over.');
    h.run(COOLDOWN, holdAll(h));
    expect(m.watch.tier).toBe(1);
    expect(a.actor.aggro || b.actor.aggro, 'nobody is after you at Noticed').toBe(false);
    expect(h.toasts).toContain('STOOD DOWN to NOTICED: it blew over.');
    h.run(COOLDOWN, holdAll(h));
    expect(m.watch.tier).toBe(0);
    expect(h.toasts).toContain('STOOD DOWN to QUIET: it blew over.');
    expect(m.run.maxTier, 'the run remembers Escalated').toBe(3);
    expect(h.missionHud?.tier).toBe(0);
  });

  it('cooldown: a fight keeps the clock at zero', () => {
    const h = play('cooldown');
    const m = h.g.mission!;
    const w = deskWatcher(h);
    alert(h, w);
    hide(h);
    // Damage dealt or taken every few seconds: never 45 quiet seconds.
    h.run(COOLDOWN * 2, () => {
      holdAll(h)();
      if (Math.round(h.g.time * 30) % 30 === 0) h.g.combatAt = h.g.time;
    });
    expect(m.watch.tier).toBe(2);
  });
});

/**
 * A manager at a desk, Alert and on to you, who calls somebody from their
 * team over (their summon, the real one): the newcomer, once they are there.
 */
function summoned(h: Headless): { manager: Actor; extra: Actor } {
  const m = h.g.mission!;
  const w = [...m.watch.watchers.values()].find((x) => x.sort === 'desk' && x.actor.kind === 'manager')!;
  alert(h, w);
  expect(m.watch.tier, 'one person after you').toBe(2);
  freeAll(h);
  const called: Actor[] = [];
  const spawn = h.g.spawn.bind(h.g);
  vi.spyOn(h.g, 'spawn').mockImplementation((...args) => {
    const a = spawn(...args);
    if (a !== null) called.push(a);
    return a;
  });
  w.actor.summonIn = 0;
  for (let t = 0; t < 3 && called.length === 0; t += DT) {
    for (const a of m.crowd) if (a !== w.actor) a.stunned = 1e9;
    h.run(DT, () => { h.g.save.sanity = 100; m.standInView(w.actor.id, 3); });
  }
  expect(called, `${w.actor.name} called somebody over`).toHaveLength(1);
  return { manager: w.actor, extra: called[0]! };
}

describe('somebody who comes onto a card in play is one of its people', () => {
  it('one-way: a manager\'s "someone from my team" is watched like everyone, and is a second person after you: Escalated', () => {
    const h = play('one-way');
    const m = h.g.mission!;
    const { extra } = summoned(h);
    expect(m.crowd, 'one of the card\'s people').toContain(extra);
    expect(m.watch.watches(extra)).toBe(true);
    expect(m.watch.watchers.get(extra.id)?.mood).toBe('alert');
    expect(m.watch.tier, 'a second person after you').toBe(3);
    expect(h.toasts.some((t) => t.startsWith('ESCALATED'))).toBe(true);
  });

  it('cooldown: the one called over stands down with everyone when it blows over', () => {
    const h = play('cooldown');
    const m = h.g.mission!;
    const { extra } = summoned(h);
    expect(m.watch.tier).toBe(3);
    h.run(2.1, holdAll(h));
    hide(h);
    h.run(COOLDOWN * 2 + 1, holdAll(h));
    expect(m.watch.tier, 'down to Noticed').toBe(1);
    expect(extra.aggro, 'they are not after you any more either').toBe(false);
    expect(m.watch.watchers.get(extra.id)?.mood).toBe('wary');
  });

  it('search: somebody who turns up after you (a story\'s enemy) loses you, searches with the countdown over their head, and gives up', () => {
    const h = play('search');
    const g = h.g;
    const m = g.mission!;
    const p = g.player.pos;
    const extra = g.spawn('user', p.x + 1, p.z, -1)!;
    expect(extra.aggro, 'they arrive after you').toBe(true);
    h.run(DT * 2, holdAll(h));
    expect(m.watch.watchers.get(extra.id)?.mood).toBe('alert');
    expect(m.watch.tier).toBe(2);
    hide(h);
    h.run(SEARCH_AFTER + 0.5, holdAll(h));
    const w = m.watch.watchers.get(extra.id)!;
    expect(w.mood, 'searching').toBe('searching');
    expect(extra.aggro).toBe(false);
    h.run(SEARCH_COUNTDOWN + 0.5, holdAll(h));
    expect(w.mood, 'gave up').toBe('wary');
    expect(m.watch.tier).toBe(1);
  });
});

describe('search: the only one after you resolved', () => {
  it('the tier holds; 8 s after anyone last saw you the floor searches (shown, with its countdown), and 20 s later it drops one step, announced', () => {
    // The post-its: nobody is called in when it goes loud (the stapler's Head of People would be after you too).
    const h = play('search', POSTITS);
    const m = h.g.mission!;
    const w = deskWatcher(h);
    alert(h, w);
    expect(m.watch.tier).toBe(2);
    w.actor.hp = 0;
    h.run(DT * 2, holdAll(h));
    expect(w.actor.resolved).toBe(true);
    expect(m.watch.tier, 'not at once').toBe(2);
    hide(h);
    h.toasts.length = 0;
    h.run(SEARCH_AFTER - 0.5, holdAll(h));
    expect(m.watch.tier).toBe(2);
    expect(h.missionHud?.rule, 'nothing shown yet').toBe('Lose them and they search, then give up.');
    h.run(1, holdAll(h));
    expect(h.missionHud?.rule, 'the floor is searching').toBe(`Lose them and they search, then give up. The floor is searching (${SEARCH_COUNTDOWN} s).`);
    h.run(SEARCH_COUNTDOWN - 1, holdAll(h));
    expect(m.watch.tier, 'still held before the countdown is out').toBe(2);
    expect(h.missionHud?.rule).toBe('Lose them and they search, then give up. The floor is searching (1 s).');
    h.run(1, holdAll(h));
    expect(m.watch.tier, 'one step down').toBe(1);
    expect(h.toasts).toContain('STOOD DOWN to NOTICED: the floor stopped searching.');
    expect(h.missionHud?.rule).toBe('Lose them and they search, then give up.');
  });

  it('one-way: the only one after you resolved, and the tier never drops', () => {
    const h = play('one-way', POSTITS);
    const m = h.g.mission!;
    const w = deskWatcher(h);
    alert(h, w);
    w.actor.hp = 0;
    h.run(DT * 2, holdAll(h));
    hide(h);
    h.run(SEARCH_AFTER + SEARCH_COUNTDOWN + 10, holdAll(h));
    expect(m.watch.tier).toBe(2);
    expect(h.toasts.some((t) => t.startsWith('STOOD DOWN'))).toBe(false);
  });
});
