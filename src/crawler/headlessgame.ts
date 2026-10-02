import * as THREE from 'three';
import type { DialogueNode } from './dialogue';
import { Game } from './game';
import { Input } from './input';
import { Player } from './player';
import { Rng } from './rng';
import { DEFAULT_KEYS, DEFAULT_SETTINGS } from './settings';
import { derive, type SaveState } from './state';

/**
 * Test support: a Game with no screen (no WebGL in a unit test). The real
 * world-building, people and rules run on it - `loadHub`, `loadFloor`, the
 * lift, the hub's hostility, and every frame through `Game.step` itself - while the renderer, the
 * HUD and the menus are stand-ins that record what they were asked to show.
 *
 * The test file still mocks what needs a canvas: `./textures` (speech
 * bubbles and markers) and `./level` (`generateLevel` without textures), the
 * way the other Game tests do.
 */
export interface Headless {
  readonly g: Game;
  /** Every toast, in order. */
  readonly toasts: string[];
  /** Every dialogue opened, in order (the last is the one up). */
  readonly dialogues: DialogueNode[];
  /** Sanity lost, by the game time it was lost at (`run` records it). */
  readonly hurts: { readonly t: number; readonly lost: number }[];
  /**
   * Run `seconds` worth of frames of the production loop (`Game.step`, the
   * balance bot's loop). Calls `each` after every frame. Like the game, a
   * frame with a dialogue or menu up does not move the clock: answer it.
   */
  run(seconds: number, each?: () => void): void;
  /** Answer the dialogue that is up with the option labelled `label` (as a click would): what it opens next, or null when it closes. */
  pick(label: string | RegExp): DialogueNode | null;
}

export const DT = 1 / 30;

const noop = (): void => undefined;

export function headless(save: SaveState): Headless {
  const g = Object.create(Game.prototype) as Game;
  const toasts: string[] = [];
  const dialogues: DialogueNode[] = [];
  const hurts: { t: number; lost: number }[] = [];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const element = { style: {}, classList: { add: noop, remove: noop, toggle: noop }, append: noop, replaceChildren: noop };
  Object.assign(g, {
    save,
    settings: { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS }, autosave: false, tips: false },
    scene,
    camera,
    hemi: new THREE.HemisphereLight(),
    sun: new THREE.DirectionalLight(),
    lights: [],
    carry: new THREE.PointLight(),
    renderer: { getRenderTarget: () => null, setRenderTarget: noop, compileAsync: () => Promise.resolve(), shadowMap: { enabled: false }, toneMappingExposure: 1 },
    pipeline: { bloom: {}, composer: { readBuffer: null } },
    particles: { clear: noop, emit: noop, update: noop },
    // The real player (moved, collided and timed by the real frame); only its picture is never drawn.
    player: new Player(camera, scene),
    hud: {
      toast: (t: string): void => { toasts.push(t); },
      flash: noop, hitFrom: noop, hitAround: noop, tip: noop, showCard: noop, point: noop, pulseSanity: noop, mapOpen: false, root: element,
    },
    os: { hide: noop, open: noop, syncQuality: noop },
    dialogue: { close: noop, show: noop },
    // The real input sets with no window to listen to: a test presses keys by putting them in `keys` (held) or `pressed` (this frame).
    input: Object.assign(Object.create(Input.prototype) as Input, {
      keys: new Set<string>(), pressed: new Set<string>(), mouseDX: 0, mouseDY: 0, wheel: 0, locked: true, enabled: true, releasing: false,
      attackCode: DEFAULT_KEYS.attack, blockCode: DEFAULT_KEYS.block, requestLock: noop, releaseLock: noop,
    }),
    overlay: element,
    menuKeys: { open: noop, close: noop },
    compass: { visible: false, update: noop },
    rootedCard: { update: noop, pulse: noop },
    screen: 'play',
    time: 0,
    actors: [], projectiles: [], pickups: [], fxMeshes: [], floaters: [], hazards: [],
    field: new Int16Array(0), fieldIn: 0, seenIn: 0, lightIn: 0, saveIn: 60,
    lockerItems: new Map<number, string>(), slackedTerminals: new Set<number>(), loggedOn: new Set<number>(),
    markers: [], markersIn: 0, history: [], historyIn: 0, projGeo: new Map(),
    fixCache: new WeakMap(), levelRng: new Rng(1), lootRng: new Rng(2),
    boss: null, bossMult: 1, elevatorOpen: false, mission: null, hub: null, inductionDay: null, vision: null, visionDue: false,
    mentorAsk: null, pendingStaff: null, staffIn: 0, staffFirst: false, mentorIn: 0, afterDialogue: null, currentTerminal: null,
    prompt: '', promptTarget: null, caughtPending: false, caughtCd: 0, rootT: 0, rootMax: 0, rootImmuneUntil: 0,
    sisuT: 0, invisT: 0, saunaT: 0, slowT: 0, hitStop: 0, hurtFlash: 0, faceT: 0, faceMood: 'normal', shakeAmt: 0,
    attackCd: 0, shoveCd: 0, chargeT: 0, charging: false, swingQueued: false, dryFire: false, blocking: false, rmbT: 0,
    abilityCd: 0, auraSlow: 0, hazardSlow: 0, mark: null, lastVisionDiff: null, headless: true,
    // The frame's own working state (class field defaults, which Object.create skips).
    athleticsT: 0, stealthT: 0, stumbleT: 3, withdrawalT: 0, jitterT: 4, stillT: 0, stepIn: 0, busyAt: null, rootReason: '',
    pauseAfterLoad: false, dustIn: 0, moveDir: new THREE.Vector2(),
    meterFacts: { step: null, loyly: 0, maxLoyly: 0, runes: 0, ability: false, bac: 0, stomach: 0, caffeine: 0, crash: 0 },
    openDialogue: (node: DialogueNode, after?: () => void): void => {
      dialogues.push(node);
      g.screen = 'dialogue';
      g.afterDialogue = after ?? null;
    },
  });
  g.derivedCache = derive(save);
  const run = (seconds: number, each?: () => void): void => {
    // The production frame (`Game.step`, what the balance bot drives): the
    // player's timers, vices, quests, pager, team, the people, the hub, the
    // flying things, the SLA clocks and the burnout check, in the game's order.
    const frames = Math.round(seconds / DT);
    for (let i = 0; i < frames; i++) {
      const before = g.save.sanity;
      g.step(DT);
      if (g.save.sanity < before) hurts.push({ t: g.time, lost: before - g.save.sanity });
      each?.();
    }
  };
  const pick = (label: string | RegExp): DialogueNode | null => {
    const node = dialogues.at(-1);
    const opt = node?.options.find((o) => (typeof label === 'string' ? o.label === label : label.test(o.label)));
    if (node === undefined || opt === undefined) throw new Error(`no option ${String(label)} in ${node?.speaker ?? 'no dialogue'}: ${node?.options.map((o) => o.label).join(' | ') ?? ''}`);
    const next = opt.pick();
    if (next !== null) {
      dialogues.push(next);
      return next;
    }
    g.screen = 'play';
    const then = g.afterDialogue;
    g.afterDialogue = null;
    then?.();
    return null;
  };
  return { g, toasts, dialogues, hurts, run, pick };
}
