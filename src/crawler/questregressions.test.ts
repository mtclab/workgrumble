import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createActor } from './entities';
import { Game } from './game';
import { storyNpcFor, talkManager, talkStory } from './story';
import { CONSUMABLES } from './items';
import { interact } from './interact';
import { generateLevel, type Interactable } from './level';
import { assignStaffed, maybeStaff, offerStaffing, placeQuestContent, pushBack, questEvent, settleWeek, staffingNode } from './questing';
import { isActive, QUESTS, sideQuestsFor, STAFFED, talkGiver } from './quests';
import { fx, Rng } from './rng';
import { derive, freshFloorState, newSave, normalizeSave, workload } from './state';
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


it.each([false, true])('delegating a meeting protects the mentee, with another helper: %s', (another) => {
  const g = host();
  g.save.rung = 9;
  const mentee = createActor(g, 'helper', g.level.start.x, g.level.start.z, 0, g.levelRng, 10, { role: 'intern' });
  mentee.name = 'Sam (Intern)';
  mentee.recruited = true;
  g.actors.push(mentee);
  g.save.questLog.push({ id: 'm-pair', stage: 0, progress: 0, done: false, floor: 1, mentor: true, by: mentee.name });
  if (another) {
    const other = createActor(g, 'helper', g.level.start.x + 1, g.level.start.z, 0, g.levelRng, 10, { role: 'security' });
    other.name = 'Alex (Security)';
    other.recruited = true;
    g.actors.push(other);
  }
  const manager = createActor(g, 'manager', g.level.start.x + 2, g.level.start.z, 0, g.levelRng, 10);
  const choice = talkManager(g, manager).options.find((o) => o.label.startsWith('Delegate it'));
  expect(choice?.label, 'only a helper outside mentoring can attend the meeting').toBe(another ? 'Delegate it to Alex (Security).' : undefined);
  choice?.pick();
  expect(mentee.recruited).toBe(true);
  expect(mentee.resolved).toBe(false);
});


it('reloading mentoring creates no nameless giver and names the teammate in dialogue', () => {
  const g = host();
  g.save.questItems = ['memo', 'schedule', 'emails', 'po'];
  g.save.questLog = QUESTS.map((q) => ({ id: q.id, stage: 0, progress: 0, done: true, floor: 1 }));
  g.save.questLog.push({ id: 'm-pair', stage: 0, progress: 1, done: false, floor: 1, mentor: true, by: 'Sam (Intern)' });
  g.save = normalizeSave(JSON.parse(JSON.stringify(g.save)))!;
  placeQuestContent(g);
  expect(g.actors.some((a) => a.name === ''), 'mentoring has a teammate, never an empty-name NPC').toBe(false);
  const node = talkGiver(g, 'm-pair', 'Sam');
  expect(node.text).toContain('Pair with Sam');
  expect(node.text).not.toContain('{m}');
});


it.each(['email', 'call'] as const)('pushed-back staffing counts toward the cap and cannot return this floor: %s', (route) => {
  const g = host();
  vi.spyOn(fx, 'chance').mockReturnValue(true);
  const ids = ['s-patch', 's-kb', 's-incident'];
  for (const id of ids) {
    const def = STAFFED.find((q) => q.id === id)!;
    if (route === 'email') {
      assignStaffed(g, def, 'The PMO');
      expect(pushBack(g, g.save.questLog.length - 1)).toContain('off your plate');
    } else staffingNode(g, def, 'The PMO').options[1]!.pick();
    expect(offerStaffing(g, 'The PMO', id), 'the same assignment cannot be offered again').toBe(false);
  }
  g.save = normalizeSave(JSON.parse(JSON.stringify(g.save)))!;
  expect(g.save.questLog.filter((q) => q.staffed && q.floor === 1)).toHaveLength(3);
  expect(g.save.questLog.some(isActive)).toBe(false);
  expect(workload(g.save).active).toBe(0);
  maybeStaff(g, 'The PMO', 1);
  expect(g.afterDialogue, 'three calls are enough even when handed back').toBeNull();
  expect(offerStaffing(g, 'The PMO')).toBe(false);
  settleWeek(g);
  expect(g.save.stats.staffedMissed, 'handing work back is not missing a deliverable').toBe(0);
  expect(g.save.stats.staffedDone).toBe(0);
});


it('the ergonomic survey counts a computer once across a reload and distinguishes floors', () => {
  const g = host();
  Object.assign(g, { openOs: vi.fn() });
  g.save.questLog.push({ id: 'ergonomics', stage: 0, progress: 0, done: false, floor: 1 });
  const logOn = (id: number): void => {
    g.promptTarget = { kind: 'interact', it: { id, kind: 'terminal' } as Interactable };
    interact(g);
  };
  logOn(501);
  g.save = normalizeSave(JSON.parse(JSON.stringify(g.save)))!;
  g.loggedOn.clear();
  logOn(501);
  expect(g.save.questLog[0]!.progress, 'returning to the same computer adds no survey credit').toBe(1);
  logOn(502);
  expect(g.save.questLog[0]!.progress).toBe(2);
  g.save.floor = 2;
  g.loggedOn.clear();
  logOn(501);
  expect(g.save.questLog[0]!.stage, 'three distinct computers finish the survey').toBe(1);
  expect(g.save.questLog[0]!.terminals).toEqual(['1:501', '1:502', '2:501']);
});


it.each([1, 2, 3])('floor %s story rewards are paid once per career, including after a reload', (n) => {
  const g = host(n);
  const npc = storyNpcFor(n);
  const person = () => createActor(g, 'npc', g.level.start.x, g.level.start.z, 0, g.levelRng, 10, { npc });
  const choose = (a: ReturnType<typeof person>): void => {
    const node = talkStory(g, a);
    (node.options.find((o) => o.label.includes('the truth')) ?? node.options[0])?.pick();
  };
  choose(person());
  g.save = normalizeSave(JSON.parse(JSON.stringify(g.save)))!;
  const rep = g.save.rep;
  const standing = { ...g.save.standing };
  g.save.floor = n + 5;
  choose(person());
  expect(g.save.rep, 'Overtime cannot pay the same story reward again').toBe(rep);
  expect(g.save.standing, 'Overtime cannot pay the same standing again').toEqual(standing);
  // Careers saved before career-wide flags also remember their first telling.
  delete g.save.flags[`story_${npc.id}`];
  g.save.flags[`story_${npc.id}_${n}`] = true;
  choose(person());
  expect(g.save.rep).toBe(rep);
  expect(g.save.standing).toEqual(standing);
});

it('floor 9 has one Jukka when the story and his side quest both need him', () => {
  const g = host(9);
  g.save.questLog.push({ id: 'jukka', stage: 0, progress: 0, done: false, floor: 4 });
  g.spawnFloorActors();
  placeQuestContent(g);
  expect(g.actors.filter((a) => a.npcId === 'jukka'), 'one person handles the story and the quest').toHaveLength(1);
  expect(g.actors.filter((a) => a.name === 'Jukka from Finance')).toHaveLength(1);
});
