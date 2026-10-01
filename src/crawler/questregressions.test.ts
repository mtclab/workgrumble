import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { Game } from './game';
import { CONSUMABLES } from './items';
import { generateLevel } from './level';
import { questEvent } from './questing';
import { sideQuestsFor, talkGiver } from './quests';
import { Rng } from './rng';
import { derive, freshFloorState, newSave, normalizeSave } from './state';
import { THEMES } from './textures';
import { drink } from './vices';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));

function host(n = 1): Game {
  const g = Object.create(Game.prototype) as Game;
  const save = newSave(77);
  save.floor = n;
  save.floorState = freshFloorState(n);
  const level = generateLevel(n, THEMES[n % 5]!, 77, true);
  Object.assign(g, {
    save, level, scene: new THREE.Scene(), actors: [], pickups: [], floaters: [],
    levelRng: new Rng(77), lootRng: new Rng(7), loggedOn: new Set(), lockerItems: new Map(),
    player: { pos: new THREE.Vector3(level.start.x, 0, level.start.z) }, derivedCache: derive(save),
    boss: null, pendingStaff: null, afterDialogue: null, screen: 'play', rootT: 0,
    exercise: vi.fn(), refreshDerived: vi.fn(), journal: vi.fn(), achieve: vi.fn(), tip: vi.fn(),
    hud: { toast: vi.fn() }, openDialogue: vi.fn(),
  });
  return g;
}

afterEach(() => vi.restoreAllMocks());

it.each(['before boss', 'after boss', 'next floor', 'weekend'] as const)('any drink fails an active Dry Week: %s', (when) => {
  const g = host();
  g.save.questLog.push({ id: 'dryweek', floor: 1, stage: 0, progress: 0, done: false });
  if (when !== 'before boss') questEvent(g, { type: 'boss', floor: 1 });
  if (when === 'next floor') { g.save.floor = 2; g.save.floorState = freshFloorState(2); }
  if (when === 'weekend') g.save.location = 'mokki';
  drink(g, CONSUMABLES.find((c) => c.id === 'lonkero')!);
  g.save = normalizeSave(JSON.parse(JSON.stringify(g.save)))!;
  expect(g.save.questLog[0]!.failed, 'Sanna remembers the drink until turn-in').toBe(true);
  const rep = g.save.rep;
  expect(talkGiver(g, 'dryweek', 'Sanna').mood).toBe('bad');
  expect(g.save.rep).toBe(rep);
});

it('Dry Week is offered only while the floor boss is unresolved', () => {
  expect(sideQuestsFor(1).some((q) => q.id === 'dryweek')).toBe(true);
  expect(sideQuestsFor(1, true).some((q) => q.id === 'dryweek'), 'no impossible bet on a cleared floor').toBe(false);
});
