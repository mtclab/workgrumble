import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from './game';
import { DT, type Headless, headless, lift, newCareer, press } from './headlessgame';
import { abortCard, alertOne, cardIndex, deskWatchers, hide, holdAll, liftTo, pickUp, reload, withDeck } from './deckplay';
import { readSlot } from './saves';
import { normalizeSave } from './state';
import { SEARCH_AFTER } from './stealth';
import type { Actor } from './entities';
import { findPrompt, interact } from './interact';
import { generateLevel, type LevelRecipe } from './level';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});
vi.mock('./screens', async (orig) => ({
  ...await orig<typeof import('./screens')>(),
  showLoading: (_g: Game, _line: string, work: () => void) => work(),
  transitionTo: (_g: Game, _label: string, _big: string, _line: string, then: () => void) => then(),
}));

/**
 * A card of the deck kept whole across saves, reloads and aborts
 * (docs/SPEC_HELLDESK_030_S1.md S1b "Saves" and its decided behaviour), on
 * the real Game and its production loop (headlessgame.ts): what has been
 * paid on a card is never paid again, and a reload changes nothing the
 * player could see or use.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function slots(): void {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) });
}

/** On your feet, whatever happens to you meanwhile. */
const keepUp = (h: Headless) => (): void => { h.g.save.sanity = 100; };

/** The Printer Uprising as this week's P1, taken up the lift. */
function printerWeek(h: Headless): void {
  const s = h.g.save;
  s.deck = { week: s.week, cards: [{ id: 'printer', p1: true, alarm: 'one-way', afterHours: false, inPerson: false, seed: 77, state: 'accepted' }] };
  h.g.loadHub(false);
  liftTo(h, 'printer');
}

describe('a resolve counts the moment it happens', () => {
  it('a jam resolved on the very frame an autosave is written is in the count after a reload, and the card can still be finished', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    printerWeek(h);
    g.settings.autosave = true;
    const m = g.mission!;
    const jam = m.crowd.find((a) => a.kind === 'jam')!;
    // Its last hit point gone: the frame's people resolve it, and this frame's autosave is written after them.
    jam.hp = 0;
    g.saveIn = DT / 2;
    h.run(DT, keepUp(h));
    expect(jam.resolved, 'resolved this frame').toBe(true);
    expect(g.saveIn, 'and the autosave was written this frame').toBeGreaterThan(30);
    const back = reload(h);
    const bm = back.g.mission!;
    expect(bm.run.progress, 'the jam is in the count after the reload').toBe(1);
    // The rest, and the card is done.
    for (const a of bm.crowd.filter((x) => x.kind === 'jam' && !x.resolved)) a.hp = 0;
    back.run(DT * 2, keepUp(back));
    expect(bm.run.progress).toBe(7);
    expect(bm.run.objectiveDone).toBe(true);
    expect(press(back, lift(back.g))[0]).toBe('Finish: close the card');
  });

  it('the results card and the bot\'s record show the Rep each resolve really paid (the employer\'s rate, the talk-down\'s cut), not the person\'s list price', () => {
    const h = newCareer();
    const g = h.g;
    g.save.workplace = 'deathmarch';
    withDeck(h, [{ id: 'phishing', alarm: 'search' }]);
    g.acceptCard(cardIndex(h, 'phishing'));
    liftTo(h, 'phishing');
    const m = g.mission!;
    vi.spyOn(g, 'check').mockReturnValue(true);
    let paid = 0;
    let listed = 0;
    for (const a of m.crowd.filter((_x, i) => m.specs[i]?.tag === 'sales')) {
      m.standInView(a.id, 1.6);
      g.promptTarget = { kind: 'actor', a };
      interact(g);
      const before = g.save.rep;
      h.pick(/^Walk them through it/);
      paid += g.save.rep - before;
      listed += a.rep;
      while (g.screen === 'dialogue') h.pick(/./);
      h.run(DT * 2, keepUp(h));
    }
    expect(m.run.objectiveDone).toBe(true);
    expect(paid, 'the talk-down pays 90% of them, at the Death March\'s 1.45').not.toBe(listed);
    press(h, lift(g));
    h.pick('Finish: close the card');
    expect(h.results?.rows.get('Rep')).toContain(`resolves ${paid})`);
    expect(m.debug().result?.perResolve, 'the bot records what was paid').toBe(paid);
  });
});

/** Stand `dist` m in front of somebody, facing them (the way E finds who you are talking to). */
function faceUp(g: Game, a: Actor, dist: number): void {
  const x = a.pos.x + Math.sin(a.yaw) * dist;
  const z = a.pos.z + Math.cos(a.yaw) * dist;
  g.player.pos.set(x, 0, z);
  g.player.yaw = Math.atan2(x - a.pos.x, z - a.pos.z);
  g.player.pitch = 0;
}

/** Who E would talk to, standing in front of `a`. */
function talksTo(g: Game, a: Actor): boolean {
  faceUp(g, a, 1.5);
  findPrompt(g);
  return g.promptTarget?.kind === 'actor' && g.promptTarget.a === a;
}

describe('what happened with each person survives a reload', () => {
  it('billed by a vendor, saved and reloaded: resolving that vendor still refunds the bill', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    g.save.rep = 600;
    withDeck(h, [{ id: 'vendor' }]);
    g.acceptCard(cardIndex(h, 'vendor'));
    liftTo(h, 'vendor');
    const m = g.mission!;
    const vendor = m.crowd.find((a) => a.kind === 'vendor')!;
    const i = m.crowd.indexOf(vendor);
    // Stand by the vendor until they bill you (their grab: the real one).
    for (let t = 0; t < 30 && vendor.stolen === 0; t += DT) h.run(DT, () => { keepUp(h)(); g.player.pos.set(vendor.pos.x + 1, 0, vendor.pos.z); });
    const owed = vendor.stolen;
    expect(owed, 'billed').toBeGreaterThan(0);
    const back = reload(h);
    const again = back.g.mission!.crowd[i]!;
    expect(again.stolen, 'still owed after the reload').toBe(owed);
    const rep = back.g.save.rep;
    again.hp = 0;
    back.run(DT, keepUp(back));
    expect(again.resolved).toBe(true);
    expect(back.toasts).toContain(`The vendor's "workshop fee" is refunded: +₡${owed}.`);
    expect(back.g.save.rep - rep, 'the refund, and the resolve').toBeGreaterThanOrEqual(owed);
  });

  it('a promotion pitch made, saved and reloaded: that manager will not hear another', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler' }]);
    g.acceptCard(cardIndex(h, 'stapler'));
    liftTo(h, 'stapler');
    const m = g.mission!;
    const boss = m.crowd.find((a, k) => a.kind === 'manager' && m.specs[k]?.tag === undefined)!;
    const i = m.crowd.indexOf(boss);
    vi.spyOn(g, 'check').mockReturnValue(true);
    expect(talksTo(g, boss), 'E talks to them').toBe(true);
    interact(g);
    const mgmt = g.save.standing.management;
    h.pick(/about my promotion/);
    expect(g.save.standing.management, 'the pitch landed').toBe(mgmt + 5);
    while (g.screen === 'dialogue') h.pick(/./);
    expect(talksTo(g, boss), 'one pitch per manager').toBe(false);
    const back = reload(h);
    back.g.screen = 'play';
    expect(talksTo(back.g, back.g.mission!.crowd[i]!), 'and still none after a reload').toBe(false);
  });

  it('a Phishing talk-down that failed stays failed after a reload: no second try', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'phishing', alarm: 'search' }]);
    g.acceptCard(cardIndex(h, 'phishing'));
    liftTo(h, 'phishing');
    const m = g.mission!;
    const dean = m.crowd.find((a) => a.name === 'Dean from Sales')!;
    const i = m.crowd.indexOf(dean);
    vi.spyOn(g, 'check').mockReturnValue(false);
    expect(talksTo(g, dean)).toBe(true);
    interact(g);
    h.pick(/^Walk them through it/);
    while (g.screen === 'dialogue') h.pick(/./);
    expect(dean.aggro, 'it went wrong').toBe(true);
    const back = reload(h);
    back.g.screen = 'play';
    const again = back.g.mission!.crowd[i]!;
    expect(again.talked).toBe(true);
    expect(talksTo(back.g, again), 'no talking Dean round now').toBe(false);
  });
});

describe('somebody who came onto the card in play is kept by a save', () => {
  it('saved and reloaded: the same person, where they were, still after you, still counted', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'postits', alarm: 'search' }]);
    g.acceptCard(cardIndex(h, 'postits'));
    liftTo(h, 'postits');
    const m = g.mission!;
    const p = g.player.pos;
    // Somebody who turns up after you (a story's enemy, a manager's "someone from my team": `Game.spawn`).
    const extra = g.spawn('user', p.x + 1, p.z, -1)!;
    h.run(DT * 2, keepUp(h));
    const i = m.crowd.indexOf(extra);
    expect(i, 'one of the card\'s people').toBeGreaterThanOrEqual(0);
    expect(m.watch.watchers.get(extra.id)?.mood).toBe('alert');
    const tier = m.watch.tier;
    const back = reload(h);
    const bm = back.g.mission!;
    const again = bm.crowd[i]!;
    expect(again, 'back after the reload').toBeDefined();
    expect({ kind: again.kind, name: again.name, rep: again.rep, x: again.pos.x, z: again.pos.z, hp: again.hp })
      .toEqual({ kind: extra.kind, name: extra.name, rep: extra.rep, x: extra.pos.x, z: extra.pos.z, hp: extra.hp });
    expect(again.aggro, 'still after you').toBe(true);
    expect(bm.watch.watchers.get(again.id)?.mood).toBe('alert');
    expect(bm.watch.tier).toBe(tier);
    expect(bm.crowd).toHaveLength(m.crowd.length);
  });
});

describe('the alarm\'s clocks and memory survive a reload', () => {
  it('search rule: somebody Alert who lost you 5 s ago, saved and reloaded, starts searching 3 s later, not 8', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'postits', alarm: 'search' }]);
    g.acceptCard(cardIndex(h, 'postits'));
    liftTo(h, 'postits');
    const m = g.mission!;
    const w = deskWatchers(h)[0]!;
    const i = m.crowd.indexOf(w.actor);
    alertOne(h, w);
    hide(h);
    h.run(5, holdAll(h));
    expect(w.mood).toBe('alert');
    expect(w.lost).toBeGreaterThan(4.9);
    const lost = w.lost;
    const seen = w.lastSeen;
    const back = reload(h);
    const bw = back.g.mission!.watch.watchers.get(back.g.mission!.crowd[i]!.id)!;
    expect(bw.lost, 'the clock as it was').toBeCloseTo(lost, 5);
    expect(bw.lastSeen, 'and where they last had you').toEqual(seen);
    hide(back);
    back.run(SEARCH_AFTER - lost - 0.4, holdAll(back));
    expect(bw.mood, 'not yet').toBe('alert');
    back.run(0.8, holdAll(back));
    expect(bw.mood, '8 s after they lost you, reload or not').toBe('searching');
    expect(bw.spot, 'looking where they last had you').toEqual(seen);
  });

  it('one-way: somebody who went Alert and was resolved still counts after a reload: the next one to go Alert is a second alarm', () => {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler', alarm: 'one-way' }]);
    g.acceptCard(cardIndex(h, 'stapler'));
    liftTo(h, 'stapler');
    const m = g.mission!;
    const [first, second] = deskWatchers(h);
    const j = m.crowd.indexOf(second!.actor);
    alertOne(h, first!);
    expect(m.watch.tier).toBe(2);
    first!.actor.hp = 0;
    h.run(DT * 2, holdAll(h));
    expect(first!.actor.resolved).toBe(true);
    const back = reload(h);
    const bm = back.g.mission!;
    expect(bm.watch.tier).toBe(2);
    alertOne(back, bm.watch.watchers.get(bm.crowd[j]!.id)!);
    expect(bm.watch.tier, 'a second person raised the alarm').toBe(3);
  });
});

describe('an aborted card is still the same card', () => {
  it('sweep part of it, abort, take it again: whoever was dealt with stays dealt with, and nothing already paid (Rep, standing, a manager\'s meeting) can be paid again', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'stapler', alarm: 'one-way' }]);
    g.acceptCard(cardIndex(h, 'stapler'));
    liftTo(h, 'stapler');
    const m = g.mission!;
    // One of them resolved in a fight: Rep paid.
    const user = deskWatchers(h).find((w) => w.actor.kind === 'user')!.actor;
    const iu = m.crowd.indexOf(user);
    const rep0 = g.save.rep;
    user.hp = 0;
    h.run(DT * 2, keepUp(h));
    expect(user.resolved).toBe(true);
    expect(g.save.rep, 'paid for them').toBeGreaterThan(rep0);
    // The manager at a desk, in a meeting: Management +3.
    const boss = m.crowd.find((a, k) => a.kind === 'manager' && m.specs[k]?.tag === undefined)!;
    const ib = m.crowd.indexOf(boss);
    expect(talksTo(g, boss)).toBe(true);
    interact(g);
    const mgmt0 = g.save.standing.management;
    h.pick(/^Accept the meeting/);
    while (g.screen === 'dialogue') h.pick(/./);
    expect(g.save.standing.management, 'the meeting paid').toBeGreaterThanOrEqual(mgmt0 + 3);
    h.run(5, keepUp(h));
    abortCard(h);
    expect(g.save.location).toBe('hub');
    expect(g.save.deck.cards[cardIndex(h, 'stapler')]?.state, 'still on the board').toBe('accepted');
    const paid = { rep: g.save.rep, standing: { ...g.save.standing } };
    const seconds = m.run.seconds;
    // Back up the lift: the card as it was left.
    liftTo(h, 'stapler');
    const said = h.toasts.at(-1);
    const again = g.mission!;
    expect(again).not.toBe(m);
    for (const k of [iu, ib]) {
      const a = again.crowd[k]!;
      expect(a.resolved, `${a.name} is still dealt with`).toBe(true);
      expect(g.actors, `${a.name} is not on the map to be paid for again`).not.toContain(a);
    }
    expect(g.save.rep, 'nothing paid twice on the way back').toBe(paid.rep);
    expect(g.save.standing).toEqual(paid.standing);
    // Everyone left on it, dealt with now: only they pay, and no meeting is to be had.
    expect(again.crowd.some((a, k) => a.kind === 'manager' && again.specs[k]?.tag === undefined && !a.resolved), 'no second meeting').toBe(false);
    expect(again.run.seconds, 'its clock goes on').toBeCloseTo(seconds, 5);
    expect(said).toBe('The Red Stapler, Recovered: as you left it.');
  });

  it('copies already picked up stay picked up, and the results card counts only the card\'s own Rep, not what you earned on the hub meanwhile', () => {
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'postits' }]);
    g.acceptCard(cardIndex(h, 'postits'));
    const rep0 = g.save.rep;
    liftTo(h, 'postits');
    pickUp(h, 3);
    expect(g.mission!.run.progress).toBe(3);
    abortCard(h);
    g.addRep(50);
    liftTo(h, 'postits');
    const m = g.mission!;
    expect(m.run.progress, 'three still collected').toBe(3);
    expect(m.scatter.filter((c) => c.picked)).toHaveLength(3);
    expect(g.pickups.filter((p) => p.id.startsWith('card:')), 'and not lying there again').toHaveLength(9);
    pickUp(h, 5);
    expect(m.run.objectiveDone).toBe(true);
    press(h, lift(g));
    h.pick('Finish: close the card');
    const card = g.save.rep - rep0 - 50;
    expect(h.results?.rows.get('Rep')?.startsWith(`+${card} `), `the card's own ${card}: ${h.results?.rows.get('Rep') ?? ''}`).toBe(true);
  });
});

describe('a broken mid-card save', () => {
  /** A career on the post-its, three picked up and someone suspicious, saved: the save as JSON, to break. */
  function midCard(): { raw: Record<string, unknown>; run: Record<string, unknown> } {
    slots();
    const h = newCareer();
    const g = h.g;
    withDeck(h, [{ id: 'postits', alarm: 'search' }]);
    g.acceptCard(cardIndex(h, 'postits'));
    liftTo(h, 'postits');
    pickUp(h, 3);
    const w = deskWatchers(h)[0]!;
    g.player.crouching = true;
    g.mission!.standInView(w.actor.id, 6);
    h.run(0.6, () => { g.mission!.standInView(w.actor.id, 6); });
    expect(g.writeSlotFor('auto')).toBe(true);
    const raw = JSON.parse(JSON.stringify(readSlot('auto')!.data)) as Record<string, unknown>;
    const run = (raw.mission as Record<string, unknown>).run as Record<string, unknown>;
    return { raw, run };
  }

  const people = (run: Record<string, unknown>): Record<string, unknown>[] => run.people as Record<string, unknown>[];
  const breaks: readonly [string, (run: Record<string, unknown>) => void][] = [
    ['the run is not a run', (run) => { run.run = 'garbage'; }],
    ['a counted person is not a place in the crowd', (run) => { (run.run as Record<string, unknown>).counted = ['x']; }],
    ['the people are missing', (run) => { delete run.people; }],
    ['the people are not a list', (run) => { run.people = { 0: {} }; }],
    ['a person has no position', (run) => { delete people(run)[0]!.x; }],
    ['a person is in a mood the game does not have', (run) => { people(run)[0]!.mood = 'furious'; }],
    ['a person\'s place in the crowd is negative', (run) => { people(run)[0]!.i = -1; }],
    ['two people in one place', (run) => { people(run)[1]!.i = people(run)[0]!.i; }],
    ['a person\'s memo is not words', (run) => { people(run)[0]!.memo = [1, 2]; }],
    ['a person who joined later is of no kind', (run) => { people(run)[0]!.extra = { kind: 'dragon' }; }],
    ['the copies picked up are not places', (run) => { run.collected = [-1]; }],
    ['the copies picked up are missing', (run) => { delete run.collected; }],
    ['the tier is out of range', (run) => { run.tier = 7; }],
  ];

  it('as written, it loads onto the card (the control)', () => {
    const { raw } = midCard();
    const s = normalizeSave(raw)!;
    expect(s.location).toBe('mission');
    const back = headless(s);
    back.g.loadWorld(true);
    expect(back.g.mission?.run.progress).toBe(3);
  });

  it.each(breaks)('%s: the load lands on the hub, the card still on the board, and taking it again starts it fresh', (_why, brk) => {
    const { raw, run } = midCard();
    brk(run);
    const s = normalizeSave(raw);
    expect(s, 'the career still loads').not.toBeNull();
    expect(s!.location).toBe('hub');
    expect(s!.mission).toBeNull();
    const back = headless(s!);
    expect(() => back.g.loadWorld(true)).not.toThrow();
    expect(back.g.hub, 'on the hub').not.toBeNull();
    expect(back.g.save.deck.cards[cardIndex(back, 'postits')]?.state, 'still on the board').toBe('accepted');
    back.g.screen = 'play';
    liftTo(back, 'postits');
    expect(back.g.mission!.run.progress, 'fresh').toBe(0);
    expect(back.g.mission!.run.seconds).toBe(0);
  });

  it('a card left at its lift whose run is broken is dropped: taking it again starts it fresh', () => {
    const { raw, run } = midCard();
    people(run)[0]!.mood = 'furious';
    raw.left = [raw.mission];
    raw.location = 'hub';
    raw.mission = null;
    const s = normalizeSave(raw)!;
    expect(s.left).toEqual([]);
    const back = headless(s);
    back.g.loadWorld(true);
    back.g.screen = 'play';
    liftTo(back, 'postits');
    expect(back.g.mission!.run.progress).toBe(0);
  });
});
