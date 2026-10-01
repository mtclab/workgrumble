import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { hurtPlayer } from './combat';
import type { FixEntry } from './desk';
import { breach, fixOptions } from './desk';
import { type Actor, createActor, type SpawnOpts } from './entities';
import type { Game } from './game';
import { type InductionState, isPracticeTicket, LABELS_FOR_STEP, MAP_LOOK_SECONDS, PRACTICE_SANITY_FLOOR, PRACTICE_TICKET_FROM, type StepId } from './induction';
import { INDUCTION_TERMINAL_ID, InductionDay } from './inductionday';
import { enrage } from './hosts';
import { findPrompt } from './interact';
import { maybeStaff } from './questing';
import { generateLevel, type Interactable, type Level, toCell } from './level';
import { Rng } from './rng';
import { DEFAULT_KEYS, DEFAULT_SETTINGS } from './settings';
import { derive, newSave, type QueuedTicket } from './state';
import { THEMES } from './textures';

// Speech bubbles and markers are canvas text; the induction's rules do not need to see them.
vi.mock('./textures', async (orig) => ({
  ...(await orig<typeof import('./textures')>()),
  textSprite: () => new THREE.Sprite(),
  disposeSprite: () => undefined,
}));

/**
 * The real InductionDay (docs/SPEC_INDUCTION.md) on a real generated lobby,
 * headless: a stand-in for the Game with just what the induction reaches for,
 * so the props, the ticket, the labels, the prompt and the clean-up are the
 * shipped code, not a copy of its rules.
 */

interface Host {
  readonly g: Game;
  readonly day: InductionDay;
  readonly level: Level;
  readonly toasts: string[];
  /** Whether the map was open when each dialogue opened. */
  readonly dialogues: { mapOpen: boolean }[];
  readonly points: number[];
  readonly ended: string[];
}

const THEME = THEMES[0];

function host(step: StepId | 'done', seed = 1234): Host {
  if (THEME === undefined) throw new Error('no theme');
  const level = generateLevel(0, THEME, seed, true);
  const scene = new THREE.Scene();
  const rng = new Rng(9);
  const save = newSave(5);
  const st: InductionState = { step, looked: 0, sanityTold: false };
  save.induction = st;
  const toasts: string[] = [];
  const dialogues: { mapOpen: boolean }[] = [];
  const points: number[] = [];
  const ended: string[] = [];
  const hud = {
    mapOpen: false,
    root: null,
    point: (): void => { points.push(1); },
    pulseSanity: (): void => undefined,
    toast: (t: string): void => { toasts.push(t); },
  };
  const g = {
    level, scene, floor: 0, difficulty: 1, save,
    settings: { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } },
    derivedCache: derive(save),
    input: { mouseDX: 0, mouseDY: 0 },
    player: { pos: new THREE.Vector3(level.start.x, 0, level.start.z), yaw: Math.PI, pitch: 0 },
    actors: [] as Actor[],
    fixCache: new WeakMap<QueuedTicket, FixEntry>(),
    loggedOn: new Set<number>(),
    currentTerminal: null as Interactable | null,
    elevatorOpen: false,
    lockerItems: new Map<number, string>(),
    inductionDay: null as InductionDay | null,
    prompt: '',
    promptTarget: null,
    hud,
    spawnAt(kind: Actor['kind'], x: number, z: number, room: number, _aggro: boolean, opts: SpawnOpts = {}): Actor {
      const a = createActor(g, kind, x, z, room, rng, 10, opts);
      g.actors.push(a);
      return a;
    },
    fixOptions(q: QueuedTicket): string[] { return fixOptions(g as unknown as Game, q); },
    openDialogue(): void { dialogues.push({ mapOpen: hud.mapOpen }); },
    autosaveSoon(): void { /* nothing is saved here */ },
    tip(): void { /* no tips headless */ },
    endInduction(): void { ended.push('end'); },
  };
  const game = g as unknown as Game;
  const day = new InductionDay(game, st);
  g.inductionDay = day;
  return { g: game, day, level, toasts, dialogues, points, ended };
}

const practice = (g: Game): QueuedTicket[] => g.save.queue.filter(isPracticeTicket);

describe('InductionDay leaves the lobby as it found it', () => {
  it('dispose takes the people and the computer away and puts the grid back', () => {
    const h = host('ticket');
    const it = h.level.interactables.find((x) => x.id === INDUCTION_TERMINAL_ID);
    if (it === undefined) throw new Error('no lobby computer');
    const cell = toCell(it.z) * h.level.w + toCell(it.x);
    expect(h.level.solid[cell]).toBe(1);
    expect(h.g.actors).toHaveLength(3);
    h.g.loggedOn.add(it.id);
    h.g.currentTerminal = it;
    h.day.dispose();
    expect(h.level.solid[cell]).toBe(0);
    expect(h.level.interactables.some((x) => x.id === INDUCTION_TERMINAL_ID)).toBe(false);
    expect(h.g.loggedOn.has(INDUCTION_TERMINAL_ID)).toBe(false);
    expect(h.g.currentTerminal).toBeNull();
    expect(h.g.actors).toEqual([]);
    expect(h.g.scene.children).toEqual([]);
    // Twice is harmless.
    h.day.dispose();
  });
});

describe('the ticket step cannot be stranded', () => {
  it('ensureTicket is idempotent: one ticket, one toast, the fix hinted', () => {
    const h = host('ticket');
    h.day.ensureTicket();
    h.day.ensureTicket();
    expect(practice(h.g)).toHaveLength(1);
    expect(h.toasts.filter((t) => t.includes('ticket'))).toHaveLength(1);
    const q = practice(h.g)[0];
    if (q === undefined) throw new Error('no ticket');
    expect(h.g.fixCache.get(q)?.hint).not.toBeNull();
  });

  it('a ticket taken away mid-step comes back on the next frame', () => {
    const h = host('ticket');
    h.g.save.queue = [];
    h.day.update(1 / 60);
    expect(practice(h.g)).toHaveLength(1);
  });

  it('the practice ticket never breaches', () => {
    const h = host('ticket');
    const q = practice(h.g)[0];
    if (q === undefined) throw new Error('no ticket');
    q.sla = 0;
    const g = h.g as unknown as { hurtPlayer: () => void; spawn: () => null };
    g.hurtPlayer = (): void => { throw new Error('a breach hurt the player'); };
    g.spawn = (): null => { throw new Error('a breach sent a manager'); };
    breach(h.g, q);
    expect(practice(h.g)).toHaveLength(1);
    expect(h.g.save.stats.breaches).toBe(0);
  });
});

describe('the label step can always be done', () => {
  it('arriving at it without a label maker or labels: Morag supplies both', () => {
    const h = host('heavy');
    const s = h.g.save;
    s.gear = s.gear.filter((x) => x.base !== 'labelmaker');
    s.ammo.labels = 0;
    h.day.event({ type: 'hit', how: 'heavy' });
    expect(s.induction?.step).toBe('label');
    expect(s.gear.some((x) => x.base === 'labelmaker')).toBe(true);
    expect(s.ammo.labels).toBeGreaterThanOrEqual(LABELS_FOR_STEP);
  });

  it('a save resumed at the label step is topped up too', () => {
    const h = host('label');
    expect(h.g.save.ammo.labels).toBeGreaterThanOrEqual(LABELS_FOR_STEP);
  });
});

describe('the map lesson shows the map, then Morag', () => {
  it.each([false, true])('M at the map step (map open before: %s): the map is up for a moment, then closes as the closing dialogue opens', (wasOpen) => {
    const h = host('map');
    const hud = h.g.hud as { mapOpen: boolean };
    // The press toggles first (game.ts), then the induction hears it.
    hud.mapOpen = !wasOpen;
    h.day.event({ type: 'map' });
    expect(hud.mapOpen).toBe(true);
    expect(h.dialogues).toEqual([]);
    h.day.update(MAP_LOOK_SECONDS / 2);
    expect(hud.mapOpen).toBe(true);
    expect(h.dialogues).toEqual([]);
    h.day.update(MAP_LOOK_SECONDS);
    expect(h.dialogues).toEqual([{ mapOpen: false }]);
    // Once.
    h.day.update(1);
    expect(h.dialogues).toHaveLength(1);
  });
});

describe('nobody on the floor is set on a new starter by a talk or a phone', () => {
  it('a failed talk-down mid-induction ends the talk, not in a fight; once the floor is awake it does', () => {
    const h = host('talk');
    const g = h.g as unknown as { floorAwake: boolean };
    const user = (h.g as unknown as { spawnAt: (k: string, x: number, z: number, r: number, ag: boolean) => Actor }).spawnAt('user', 5, 5, 0, false);
    g.floorAwake = false;
    expect(enrage(h.g, user)).toBe(false);
    expect(user.aggro).toBe(false);
    expect(user.enragedT).toBe(0);
    expect(user.talked).toBe(true);
    g.floorAwake = true;
    const other = (h.g as unknown as { spawnAt: (k: string, x: number, z: number, r: number, ag: boolean) => Actor }).spawnAt('user', 6, 6, 0, false);
    expect(enrage(h.g, other)).toBe(true);
    expect(other.aggro).toBe(true);
  });

  it('no in-person staffing mid-induction', () => {
    const h = host('swing');
    const g = h.g as unknown as { pendingStaff: null; afterDialogue: (() => void) | null };
    g.pendingStaff = null;
    g.afterDialogue = null;
    maybeStaff(h.g, 'Derek', 1);
    expect(g.afterDialogue).toBeNull();
  });
});

describe('nothing is rebuilt every frame', () => {
  it('a hundred quiet frames: the card is not touched again', () => {
    const h = host('swing');
    const before = h.points.length;
    for (let i = 0; i < 100; i++) h.day.update(1 / 60);
    expect(h.points.length).toBe(before);
    // A rebinding is a change: the card is redrawn, once.
    h.g.settings.keys.interact = 'KeyF';
    for (let i = 0; i < 10; i++) h.day.update(1 / 60);
    expect(h.points.length).toBe(before + 1);
  });
});

describe('E on induction day goes to what the card asks for (the real InductionDay and findPrompt)', () => {
  /** Put the lobby's own computer one metre in front of the player, closer than anything. */
  function ownComputer(h: Host): void {
    const p = h.g.player;
    h.level.interactables.push({ kind: 'terminal', x: p.pos.x - Math.sin(p.yaw), z: p.pos.z - Math.cos(p.yaw), id: 3, room: 0, used: false, mesh: null, lock: 0 });
  }

  it('at the talk step: the colleague, even with a computer closer and right in front', () => {
    const h = host('talk');
    expect(h.day.standBefore('colleague', 1.8)).toBe(true);
    ownComputer(h);
    findPrompt(h.g);
    expect(h.g.promptTarget).toEqual({ kind: 'actor', a: h.day.colleague });
  });

  it('at the talk step, standing at the induction computer: it offers nothing yet', () => {
    const h = host('talk');
    expect(h.day.standBefore('terminal', 1.4)).toBe(true);
    findPrompt(h.g);
    const t = h.g.promptTarget;
    expect(t?.kind === 'interact' && t.it.id === INDUCTION_TERMINAL_ID).toBe(false);
  });

  it('at the ticket step: the induction computer, over the lobby\'s own one in front', () => {
    const h = host('ticket');
    expect(h.day.standBefore('terminal', 1.4)).toBe(true);
    ownComputer(h);
    findPrompt(h.g);
    const t = h.g.promptTarget;
    expect(t?.kind === 'interact' ? t.it.id : null).toBe(INDUCTION_TERMINAL_ID);
  });

  it('at a swing step: the colleague offers nothing', () => {
    const h = host('swing');
    expect(h.day.standBefore('colleague', 1.8)).toBe(true);
    findPrompt(h.g);
    expect(h.g.promptTarget).toBeNull();
  });

  it('the pinned prompt respects facing and walls like any other', () => {
    const h = host('talk');
    expect(h.day.standBefore('colleague', 2.2)).toBe(true);
    expect(h.day.pinnedPrompt()).not.toBeNull();
    // Turned round: not in front, and not right beside you.
    h.g.player.yaw += Math.PI;
    expect(h.day.pinnedPrompt()).toBeNull();
    h.g.player.yaw -= Math.PI;
    // A wall between.
    const c = h.day.colleague;
    if (c === null) throw new Error('no colleague');
    const p = h.g.player.pos;
    const mid = toCell((p.z + c.pos.z) / 2) * h.level.w + toCell((p.x + c.pos.x) / 2);
    const was = h.level.opaque[mid] ?? 0;
    h.level.opaque[mid] = 1;
    expect(h.day.pinnedPrompt()).toBeNull();
    h.level.opaque[mid] = was;
  });
});

describe('a practice hit never burns anybody out', () => {
  it('a hard swing at low Sanity stops at the floor, Ironman or not', () => {
    const h = host('block');
    const dummy = h.day.dummy;
    if (dummy === null) throw new Error('no dummy');
    const s = h.g.save;
    s.ironman = true;
    s.sanity = PRACTICE_SANITY_FLOOR + 2;
    const g = h.g as unknown as Record<string, unknown>;
    Object.assign(g, {
      screen: 'play', blocking: false, sisuT: 0, hurtFlash: 0, faceT: 0, faceMood: 'normal',
      exercise: (): void => undefined, shake: (): void => undefined, practice: (): void => undefined,
    });
    g.hud = { ...(g.hud as object), flash: (): void => undefined, hitFrom: (): void => undefined, hitAround: (): void => undefined };
    hurtPlayer(h.g, 500, dummy, 'melee');
    expect(s.sanity).toBe(PRACTICE_SANITY_FLOOR);
  });
});

describe('the practice ticket is recognised by who sent it', () => {
  it('Morag\'s, and nobody else\'s', () => {
    expect(isPracticeTicket({ from: PRACTICE_TICKET_FROM })).toBe(true);
    expect(isPracticeTicket({ from: 'Ada Whitlock' })).toBe(false);
  });
});
