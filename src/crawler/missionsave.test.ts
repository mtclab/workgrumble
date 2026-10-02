import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from './game';
import { DT, type Headless, lift, newCareer, press } from './headlessgame';
import { cardIndex, liftTo, reload, withDeck } from './deckplay';
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
