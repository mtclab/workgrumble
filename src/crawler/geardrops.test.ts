import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { dropGear, redropBossLoot, restoreGearDrops, updatePickups } from './combat';
import type { Game } from './game';
import { plainInstance, uniqueInstance } from './loot';
import { Rng } from './rng';
import { newSave, normalizeSave, type SaveState } from './state';

vi.mock('./audio', () => ({ sfx: { pickup: () => undefined } }));

function host(save: SaveState): Game {
  return { save, scene: new THREE.Scene(), pickups: [], lootRng: new Rng(7), floor: 0, level: { bossSpawn: { x: 10, z: 20 } }, player: { pos: new THREE.Vector3() }, hud: { toast: () => undefined }, tip: () => undefined, achieve: () => undefined, refreshDerived: () => undefined } as unknown as Game;
}

const reload = (g: Game): Game => {
  const loaded = host(normalizeSave(JSON.parse(JSON.stringify(g.save)))!);
  restoreGearDrops(loaded);
  return loaded;
};

describe('gear left on the floor', () => {
  it('the same item stays at its spot after loading and stays collected after another load', () => {
    const g = host(newSave(1));
    const gear = plainInstance('stapler', new Rng(22));
    dropGear(g, new THREE.Vector3(10, 0, 20), gear);
    const original = g.pickups[0]!;
    const loaded = reload(g);
    expect(loaded.pickups, 'saved gear on the floor').toHaveLength(1);
    expect(loaded.pickups[0]!.gear).toEqual(gear);
    expect(loaded.pickups[0]!.mesh.position).toEqual(original.mesh.position);
    loaded.player.pos.copy(original.mesh.position);
    updatePickups(loaded, 0.1);
    expect(loaded.save.gear.filter((x) => x.uid === gear.uid)).toHaveLength(1);
    expect(reload(loaded).pickups).toHaveLength(0);
  });

  it('loading saved boss gear does not also regenerate the legendary', () => {
    const g = host(newSave(1));
    const gear = uniqueInstance('derekLanyard', new Rng(2));
    expect(gear).not.toBeNull();
    dropGear(g, new THREE.Vector3(12, 0, 20), gear!);
    const loaded = reload(g);
    redropBossLoot(loaded);
    expect(loaded.pickups.filter((p) => p.gear?.unique === gear!.unique)).toHaveLength(1);
  });

  it('saves from before gear records still load', () => {
    const old = JSON.parse(JSON.stringify(newSave(1))) as SaveState;
    Reflect.deleteProperty(old.floorState, 'gearDrops');
    expect(normalizeSave(old)?.floorState.gearDrops).toEqual([]);
  });
});
