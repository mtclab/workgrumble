import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Actor, createActor } from './entities';
import { Game } from './game';
import { generateLevel } from './level';
import { fx, Rng } from './rng';
import { derive, newSave } from './state';
import { storyNpcFor } from './story';
import { THEMES } from './textures';

vi.mock('./textures', async (orig) => ({
  ...(await orig<typeof import('./textures')>()),
  textSprite: () => new THREE.Sprite(),
  disposeSprite: () => undefined,
}));

function floor(seed: number, n: number, resolved: number[] = [], storyDone = false): Game {
  const g = Object.create(Game.prototype) as Game;
  const save = newSave(seed);
  save.floor = n;
  save.rung = 11;
  save.standing.staff = 50;
  save.floorState.resolved = resolved;
  if (storyDone) save.flags[`story_${storyNpcFor(n).id}_${n}`] = true;
  Object.assign(g, { save, scene: new THREE.Scene(), level: generateLevel(n, THEMES[n % THEMES.length]!, seed, true), levelRng: new Rng(seed ^ 0x5bd1e995), derivedCache: derive(save), actors: [] });
  return g;
}

function identity(a: Actor) {
  return { name: a.name, role: a.role, kind: a.kind, elite: a.elite, outfit: a.rig?.outfit };
}

describe('the people on a saved floor', () => {
  afterEach(() => vi.restoreAllMocks());
  it('every survivor keeps their name role kind elite and outfit after early resolutions', () => {
    // Keep collision nudges identical so this compares the actor rolls.
    vi.spyOn(fx, 'range').mockReturnValue(0);
    for (const n of [0, 1, 2, 3, 4]) {
      for (const seed of [77, 1234, 9012]) {
        const fresh = floor(seed, n);
        fresh.spawnFloorActors();
        const resolved = fresh.actors.filter((a) => a.spawnIndex >= 0).slice(0, 8).map((a) => a.spawnIndex);
        const loaded = floor(seed, n, resolved, true);
        loaded.spawnFloorActors();
        for (const a of loaded.actors) {
          const original = fresh.actors.find((b) => b.spawnIndex === a.spawnIndex);
          expect(identity(a), 'surviving actor identity').toEqual(identity(original!));
        }
        expect(loaded.actors.some((a) => resolved.includes(a.spawnIndex))).toBe(false);
        expect(loaded.levelRng.next(), 'the next person gets the original draws').toBe(fresh.levelRng.next());
      }
    }
  });

  it('a fresh floor retains the pre-fix random sequence', () => {
    const g = floor(77, 1);
    const rng = new Rng(31);
    const a = createActor(g, 'user', 1, 1, 0, rng, 100);
    expect({ ...identity(a), next: rng.next() }).toMatchInlineSnapshot(`
      {
        "elite": null,
        "kind": "user",
        "name": "Susan from Comms",
        "next": 0.42185495886951685,
        "outfit": {
          "face": "angry",
          "glasses": false,
          "hair": 10506797,
          "hairStyle": "long",
          "lanyard": 2254540,
          "legs": 4866102,
          "skin": 6044190,
          "top": 9417689,
        },
        "role": null,
      }
    `);
  });
});


it('far calm actors leave on time and zero-health grunts are resolved without approaching', () => {
  const g = floor(77, 0);
  Object.assign(g, { player: { pos: new THREE.Vector3(-100, 0, -100) }, time: 0 });
  const calm = createActor(g, 'user', g.level.start.x, g.level.start.z, 0, g.levelRng, 10);
  calm.resolved = true;
  calm.calm = true;
  calm.removeIn = 0.3;
  const grunt = createActor(g, 'user', g.level.start.x, g.level.start.z, 0, g.levelRng, 10);
  grunt.hp = 0;
  grunt.expired = true;
  grunt.spawnIndex = 16;
  g.actors.push(calm, grunt);
  for (let i = 0; i < 20; i++) g.updateActors(0.1);
  expect(g.actors, 'both actors leave while the player stays far away').toEqual([]);
  expect(g.save.floorState.resolved).toContain(16);
});
