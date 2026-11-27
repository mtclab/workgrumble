import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { strike } from './combat';
import { createActor } from './entities';
import type { Game } from './game';
import type { Level } from './level';
import { Rng } from './rng';
import { DEFAULT_SETTINGS } from './settings';
import { castSpell, domainAbility } from './spells';
import { derive, newSave } from './state';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));

function fight(awake: boolean): Game {
  const save = newSave(7);
  const g = {
    save, settings: DEFAULT_SETTINGS, derivedCache: derive(save), floorAwake: awake, floor: 0, difficulty: 1, scene: new THREE.Scene(), actors: [],
    player: { pos: new THREE.Vector3(10, 0, 10), yaw: 0 },
    level: { w: 20, h: 20, floor: new Uint8Array(400).fill(1), opaque: new Uint8Array(400), seen: new Uint8Array(400) } as Level,
    particles: { emit: vi.fn() }, fxMeshes: [], floaters: [], exercise: vi.fn(), healPlayer: vi.fn(),
    refreshDerived: vi.fn(), bossStart: vi.fn(), floatText: vi.fn(), hud: { toast: vi.fn() },
  } as unknown as Game;
  g.actors.push(createActor(g, 'boss', 10, 8, 0, new Rng(7), 10));
  return g;
}

it('a boss calmed for induction takes no stun, mark, slow or healing feed', () => {
  const g = fight(false);
  const heal = vi.spyOn(g, 'healPlayer');
  const b = g.actors[0]!;
  const hp = b.hp;
  g.derivedCache.specials.add('rubberStamp');
  g.derivedCache.specials.add('whisk');
  g.derivedCache.specials.add('redPen');
  g.save.sanity = 30;
  g.save.loyly = 30;
  strike(g, b, 30, null, 'melee', true);
  strike(g, b, 30, null, 'ranged');
  expect(b.stunned, 'induction boss ignores the stamp and heavy stagger').toBe(0);
  expect(b.memo.marked).not.toBe(true);
  expect(g.save.sanity, 'an ignored hit feeds no whisk healing').toBe(30);
  for (const spell of ['steam', 'vihta', 'avanto']) {
    g.save.spell = spell;
    g.save.suoBlessing = true;
    castSpell(g);
  }
  g.save.rung = 4;
  g.save.domain = 'Security';
  domainAbility(g);
  expect(b.stunned).toBe(0);
  expect(b.slowT).toBe(0);
  expect(b.hp).toBe(hp);
  expect(b.bossActive).toBe(false);
  expect(heal).not.toHaveBeenCalled();
});

it('Vihtaisku healing comes from health actually lost, including shields', () => {
  const g = fight(true);
  const heal = vi.spyOn(g, 'healPlayer');
  const b = g.actors[0]!;
  b.shielded = true;
  g.save.spell = 'vihta';
  g.save.suoBlessing = true;
  const hp = b.hp;
  castSpell(g);
  expect(heal).toHaveBeenCalledWith((hp - b.hp) / 3, '');
});
