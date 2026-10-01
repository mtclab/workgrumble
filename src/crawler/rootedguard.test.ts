import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { hurtPlayer, playerAttackInput } from './combat';
import type { Actor } from './entities';
import type { Game } from './game';
import { derive, newSave } from './state';

it('a rooted player can raise their guard and reduce a frontal hit', () => {
  const save = newSave(7);
  const g = {
    save, derivedCache: derive(save), screen: 'play', rootT: 2, auraSlow: 0, rmbT: 0,
    input: { rmb: true, lmb: false, clicked: () => false },
    player: { pos: new THREE.Vector3(), yaw: 0 }, tip: vi.fn(), exercise: vi.fn(), shake: vi.fn(),
    hud: { flash: vi.fn(), hitFrom: vi.fn() },
  } as unknown as Game;
  const before = save.sanity;
  playerAttackInput(g, 0.4);
  hurtPlayer(g, 20, { pos: new THREE.Vector3(0, 0, -1), kind: 'user' } as Actor, 'melee');
  expect(before - save.sanity, 'root permits the 65 percent block reduction').toBeCloseTo(7 * (1 - g.derivedCache.armor));
  expect(g.rootT).toBe(2);
});
