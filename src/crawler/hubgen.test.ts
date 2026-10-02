import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { type Actor, isFoe } from './entities';
import { headless } from './headlessgame';
import { buildHub, hubSeed } from './hub';
import { startInduction } from './induction';
import { generateLevel, type LevelRecipe } from './level';
import { levelPrint } from './levelprint';
import { newSave, normalizeSave, type SaveState } from './state';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});

/**
 * The hub (docs/SPEC_HELLDESK_030_S1.md, S1a gates 1 and 2): the career's
 * own floor, built by the real generator and loaded by the real Game.
 */
const SEEDS = Array.from({ length: 150 }, (_, i) => (i + 1) * 7919);

function hubOf(save: SaveState) {
  const h = headless(save);
  h.g.loadHub(false, true);
  return h;
}

/** Who is on the hub, by spawn index: name, kind and looks. */
function people(actors: readonly Actor[]): Record<number, { name: string; kind: string; outfit: unknown }> {
  const out: Record<number, { name: string; kind: string; outfit: unknown }> = {};
  for (const a of actors) if (a.spawnIndex >= 0) out[a.spawnIndex] = { name: a.name, kind: a.kind, outfit: a.rig?.outfit };
  return out;
}

describe('gate 1: a hub has nobody hostile on load', () => {
  it('150 career seeds: colleagues on every hub, every one of them neutral, nobody after you', { timeout: 120_000 }, () => {
    for (const seed of SEEDS) {
      const { g } = hubOf(newSave(seed));
      const colleagues = g.actors.filter((a) => a.colleague);
      expect(colleagues.length, `seed ${seed}: the hub has its workers`).toBeGreaterThanOrEqual(5);
      const hostile = g.actors.filter((a) => a.hostile);
      expect(hostile.map((a) => `${a.kind} ${a.name}`), `seed ${seed}: nobody hostile on load`).toEqual([]);
      expect(g.actors.some((a) => a.aggro), `seed ${seed}: nobody after you`).toBe(false);
      expect(g.boss, `seed ${seed}: no boss on the hub`).toBeNull();
    }
  });

  it('on induction day the only thing that takes a hit is Facilities\' dummy, which is no foe', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const save = newSave(seed);
      save.induction = startInduction();
      const { g } = hubOf(save);
      expect(g.inductionDay, `seed ${seed}: the induction runs on the hub`).not.toBeNull();
      expect(g.actors.filter((a) => a.hostile).map((a) => a.kind), `seed ${seed}`).toEqual(['dummy']);
      expect(g.actors.some(isFoe), `seed ${seed}`).toBe(false);
    }
  });
});

describe('gate 2: the same career builds the same hub', () => {
  it('cells, rooms, interactables and people\'s names, every time; a reload and next week show the same people', { timeout: 60_000 }, () => {
    for (const seed of SEEDS.slice(0, 25)) {
      const first = hubOf(newSave(seed));
      const again = hubOf(newSave(seed));
      expect(levelPrint(again.g.level), `seed ${seed}: the same floor`).toBe(levelPrint(first.g.level));
      expect(people(again.g.actors), `seed ${seed}: the same people`).toEqual(people(first.g.actors));
      // Saved and loaded: the same people.
      const loaded = headless(normalizeSave(JSON.parse(JSON.stringify(first.g.save)))!);
      loaded.g.loadWorld(true);
      expect(levelPrint(loaded.g.level)).toBe(levelPrint(first.g.level));
      expect(people(loaded.g.actors), `seed ${seed}: the same people after a reload`).toEqual(people(first.g.actors));
      // Somebody resolved this week stays away; everybody else is who they were.
      const resolved = first.g.actors.filter((a) => a.colleague).slice(0, 3).map((a) => a.spawnIndex);
      const without = normalizeSave(JSON.parse(JSON.stringify(first.g.save)))!;
      without.hub.resolved = resolved;
      const back = headless(without);
      back.g.loadWorld(true);
      const expected = people(first.g.actors);
      for (const idx of resolved) delete expected[idx];
      expect(people(back.g.actors), `seed ${seed}: the same people around the resolved ones`).toEqual(expected);
      // Next week, another P1 and the same building and people.
      const week = headless(normalizeSave(JSON.parse(JSON.stringify(first.g.save)))!);
      week.g.save.week = 2;
      week.g.startWeek(1);
      week.g.loadHub(false, true);
      expect(levelPrint(week.g.level)).toBe(levelPrint(first.g.level));
      expect(people(week.g.actors), `seed ${seed}: the same people next week`).toEqual(people(first.g.actors));
    }
  });

  it('different careers get different hubs', () => {
    const prints = new Set(SEEDS.slice(0, 30).map((seed) => levelPrint(buildHub(seed, true))));
    expect(prints.size).toBe(30);
    expect(hubSeed(1)).not.toBe(hubSeed(2));
  });
});
