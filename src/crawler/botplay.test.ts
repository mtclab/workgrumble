import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Game } from './game';
import { type Headless, headless } from './headlessgame';
import { findPrompt } from './interact';
import { generateLevel, type LevelRecipe } from './level';
import { POOL } from './missions';
import { fx } from './rng';
import { newSave } from './state';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});
vi.mock('./screens', async (orig) => ({
  ...await orig<typeof import('./screens')>(),
  showLoading: (_g: Game, _line: string, work: () => void) => work(),
  resume: (g: Game) => { g.screen = 'play'; },
}));

/**
 * The balance bot (scripts/helldesk-balance/bot.js, the browser matrix's
 * player) playing every card of the S1b pool on the real Game in node:
 * quiet where the card's style allows and loud, three seeds each, the way
 * `mission-matrix.mjs` plays them on the served build. Each card x approach
 * must finish the card on at least two of its three seeds (the matrix asks
 * 80% of ten). The bot sees the game through the same handles as in the
 * browser; the dialogue's buttons are the headless game's options, and a
 * lock opens at the first try (the lock minigame is a DOM widget; the
 * browser matrix plays it). The shared feel dice and the bot's are seeded
 * per run, so a run is the same every time.
 */

const BOT = readFileSync('scripts/helldesk-balance/bot.js', 'utf8');
const SEEDS = [1700000000, 1700000001, 1700000002];

interface Bot {
  run(seconds: number, maxFloors: number, wallMs: number): { target: string | null };
  policy: Record<string, unknown>;
  seed(seed: number): void;
}

/** One card played by the bot to its results card (or for ten minutes of game time). */
function play(card: string, approach: string, seed: number): Headless {
  fx.reseed(seed);
  const def = POOL.find((c) => c.id === card);
  if (def === undefined) throw new Error(card);
  const h = headless(newSave(1));
  h.g.loadMission(def, seed, true);
  h.g.screen = 'play';
  Object.assign(h.g, { lockpick: { open: false, start: (...args: unknown[]) => { (args[4] as (ok: boolean) => void)(true); } } });
  const options = (): object[] => (h.g.screen === 'dialogue' ? (h.dialogues.at(-1)?.options ?? []) : []).map((o, i) => ({
    disabled: o.disabled === true, textContent: `${i + 1}. ${o.tag === undefined ? '' : `[${o.tag}] `}${o.label}`, click: () => { h.pick(o.label); },
  }));
  const document = {
    querySelectorAll: (sel: string) => (sel === '.dlg-opt' ? options() : []),
    querySelector: (sel: string) => {
      const d = h.dialogues.at(-1);
      if (h.g.screen !== 'dialogue' || d === undefined) return null;
      return sel === '.dlg' ? { innerText: `${d.speaker}\n${d.subtitle ?? ''}\n${d.text}` } : sel === '.dlg-head b' ? { textContent: d.speaker } : sel === '.dlg-head span' ? { textContent: d.subtitle ?? '' } : null;
    },
  };
  const window: Record<string, unknown> = {
    __crawler: h.g,
    __helldesk: { mission: () => h.g.mission?.debug(), findPrompt: () => findPrompt(h.g), rest: () => undefined, hub: () => null, fixesFor: () => ['Turn it off and on again'] },
  };
  runInNewContext(BOT, { window, document, performance, MouseEvent: class {} });
  const bot = window.__bot as Bot;
  Object.assign(bot.policy, { approach });
  bot.seed(seed);
  for (let k = 0; k < 60 && h.g.mission?.run.over !== true; k++) bot.run(10, Infinity, 60000);
  return h;
}

const plan = POOL.flatMap((card) => [...(card.style === 'loud' ? [] : ['quiet']), 'loud'].map((approach) => [card.id, approach] as const));

describe('the balance bot finishes every card of the pool, quiet and loud', () => {
  it.each(plan)('%s, %s', (card, approach) => {
    const runs = SEEDS.map((seed) => {
      const h = play(card, approach, seed);
      const m = h.g.mission!.debug();
      return `${seed}: ${m.finish ?? `unfinished after ${Math.round(m.seconds)} s`}`;
    });
    expect(runs.filter((r) => r.endsWith(': done')).length, runs.join(', ')).toBeGreaterThanOrEqual(2);
  });
});
