import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from './game';
import { DT, type Headless, lift, newCareer, press } from './headlessgame';
import { cardIndex, liftTo, reload, withDeck } from './deckplay';
import { interact } from './interact';
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
