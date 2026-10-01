import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { hurtActor } from './entities';
import { Game } from './game';
import { generateLevel } from './level';
import { readSlot } from './saves';
import { derive, newSave, normalizeSave } from './state';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number) => mod.generateLevel(n, theme, seed, true) };
});
vi.mock('./questing', () => ({ placeQuestContent: vi.fn(), scheduleStaffing: vi.fn(), evidenceHeld: () => 0 }));
vi.mock('./teamwork', async (orig) => ({ ...await orig<typeof import('./teamwork')>(), scheduleMentoring: vi.fn() }));

function world(save = newSave(77)): Game {
  const g = Object.create(Game.prototype) as Game;
  Object.assign(g, {
    save, vision: null, boss: null, scene: new THREE.Scene(), actors: [], pickups: [],
    derivedValue: derive(save), derivedDirty: false,
    player: { pos: new THREE.Vector3() }, hemi: { color: new THREE.Color(), groundColor: new THREE.Color() }, sun: {},
    renderer: {}, pipeline: { bloom: {} }, lights: [], slackedTerminals: new Set(), loggedOn: new Set(),
    clearWorld: vi.fn(), spawnFloorActors: vi.fn(), spawnCompanions: vi.fn(), syncInduction: vi.fn(),
    refreshDerived: vi.fn(), markSeen: vi.fn(), updateLights: vi.fn(), settleWorld: vi.fn(),
    bossStart: vi.fn(), floatText: vi.fn(), hud: { toast: vi.fn() },
  });
  return g;
}

afterEach(() => vi.unstubAllGlobals());

it('hurt the boss, save, Continue: the same health and phase remain', () => {
  const slots = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => slots.get(k) ?? null, setItem: (k: string, v: string) => slots.set(k, v) });
  const g = world();
  g.loadFloor(0, true);
  const b = g.boss!;
  hurtActor(g, b, b.maxHp * 0.6, null);
  b.phase = 2;
  const hp = b.hp;
  expect(g.writeSlotFor('quick')).toBe(true);
  const save = normalizeSave(readSlot('quick')!.data)!;
  const loaded = world(save);
  loaded.loadFloor(0, true);
  expect(loaded.boss!.hp, 'boss damage survives Continue').toBe(hp);
  expect(loaded.boss!.phase, 'phase two survives Continue').toBe(2);
  const old = world(newSave(77));
  old.loadFloor(0, true);
  expect(old.boss!.hp).toBe(old.boss!.maxHp);
});
