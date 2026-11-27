import * as THREE from 'three';
import { expect, it } from 'vitest';
import { cellCenter, type Interactable, repairFloorAccess } from './level';
import { Rng } from './rng';

function pocket(machine: boolean) {
  const w = 7;
  const h = 5;
  const floor = new Uint8Array(w * h);
  const solid = new Uint8Array(w * h).fill(1);
  for (let x = 1; x <= 5; x++) {
    floor[2 * w + x] = 1;
    if (x !== 3) solid[2 * w + x] = 0;
  }
  const bridge = 2 * w + 3;
  const prop = new THREE.BoxGeometry(1.8, 0.8, 1.2).translate(cellCenter(3), 0.4, cellCenter(2));
  const builder = { boxes: new Map([['wood', [prop]]]) };
  const level: Parameters<typeof repairFloorAccess>[0] = {
    w, h, floor, solid, opaque: solid.slice(),
    rooms: [{ id: 0, x: 1, y: 2, w: 2, h: 1, kind: 'lobby' }, { id: 1, x: 4, y: 2, w: 2, h: 1, kind: 'office' }],
    spawns: [{ kind: 'user', x: cellCenter(4), z: cellCenter(2), room: 1 }],
    interactables: machine ? [{ id: 1, kind: 'terminal', x: cellCenter(3), z: cellCenter(2) } as Interactable] : [],
    start: { x: cellCenter(1), z: cellCenter(2) },
  };
  return { level, builder, bridge };
}

it('a safety bridge is walkable and has no furniture geometry left in its cell', () => {
  const { level, builder, bridge } = pocket(false);
  repairFloorAccess(level, new Rng(7), builder);
  expect(level.solid[bridge]).toBe(0);
  expect(builder.boxes.get('wood'), 'the opened passage has no table left').toEqual([]);
  expect(level.spawns).toHaveLength(1);
});

it('a spawn with no reachable home is dropped instead of arriving beside the lift', () => {
  const { level, builder, bridge } = pocket(true);
  repairFloorAccess(level, new Rng(7), builder);
  expect(level.solid[bridge], 'the terminal remains solid').toBe(1);
  expect(level.spawns, 'no surprise hostile beside the arrival lift').toEqual([]);
});
