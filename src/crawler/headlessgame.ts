import * as THREE from 'three';
import { updateProjectiles } from './combat';
import type { DialogueNode } from './dialogue';
import { Game } from './game';
import { flowField } from './level';
import { Rng } from './rng';
import { DEFAULT_KEYS, DEFAULT_SETTINGS } from './settings';
import { derive, type SaveState } from './state';

/**
 * Test support: a Game with no screen (no WebGL in a unit test). The real
 * world-building, people and rules run on it - `loadHub`, `loadFloor`, the
 * lift, the hub's hostility, the AI frame by frame - while the renderer, the
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
  /** Advance the world `seconds` of game time: the people, the hub, the flying things. Calls `each` every frame. */
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
  const element = { style: {}, classList: { add: noop, remove: noop, toggle: noop }, append: noop, replaceChildren: noop };
  Object.assign(g, {
    save,
    settings: { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS }, autosave: false, tips: false },
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    hemi: new THREE.HemisphereLight(),
    sun: new THREE.DirectionalLight(),
    lights: [],
    renderer: { getRenderTarget: () => null, setRenderTarget: noop, compileAsync: () => Promise.resolve(), shadowMap: { enabled: false }, toneMappingExposure: 1 },
    pipeline: { bloom: {}, composer: { readBuffer: null } },
    particles: { clear: noop, emit: noop, update: noop },
    player: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, crouching: false, crouch: 0, outdoor: false, onGround: true, swing: 0, charge: 0, setTool: noop, model: { visible: true } },
    hud: {
      toast: (t: string): void => { toasts.push(t); },
      flash: noop, hitFrom: noop, hitAround: noop, tip: noop, showCard: noop, point: noop, pulseSanity: noop, mapOpen: false, root: element,
    },
    os: { hide: noop, open: noop, syncQuality: noop },
    dialogue: { close: noop, show: noop },
    input: { enabled: true, locked: true, releaseLock: noop, requestLock: noop, hit: () => false, down: () => false, endFrame: noop, mouseDX: 0, mouseDY: 0, wheel: 0 },
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
    openDialogue: (node: DialogueNode, after?: () => void): void => {
      dialogues.push(node);
      g.screen = 'dialogue';
      g.afterDialogue = after ?? null;
    },
  });
  g.derivedCache = derive(save);
  const run = (seconds: number, each?: () => void): void => {
    const end = g.time + seconds - 1e-9;
    while (g.time < end) {
      g.time += DT;
      g.fieldIn -= DT;
      if (g.fieldIn <= 0) {
        g.fieldIn = 0.35;
        g.field = flowField(g.level, g.player.pos.x, g.player.pos.z, 40);
      }
      const before = g.save.sanity;
      g.updateActors(DT);
      g.hub?.update(DT);
      updateProjectiles(g, DT);
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
