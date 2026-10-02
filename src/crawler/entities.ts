import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  animateRig,
  blobShadow,
  buildRig,
  disposeRig,
  type Expression,
  HAIRS,
  type Outfit,
  type Rig,
  setExpression,
  SHIRTS,
  SKINS,
  tintRig,
  TROUSERS,
} from './characters';
import {
  CHATBOT_BARKS,
  CONSULTANT_BARKS,
  CUSTOMER_BARKS,
  ELITE_LINES,
  HEALER_BARKS,
  HEALER_NAMES,
  HELPER_BARKS,
  MANAGER_BARKS,
  MANAGER_NAMES,
  SHADOWIT_BARKS,
  USER_BARKS,
  USER_NAMES,
  VENDOR_BARKS,
} from './content/lines';
import { disposeTree } from './dispose';
import { collideCircle, type Level, lineOfSight, NEIGHBOURS8, TILE, toCell } from './level';
import { chatbotMesh, dogMesh, dummyMesh, turretMesh } from './meshes';
import { fx, type Rng } from './rng';
import { MORALE_START, teamPower } from './team';
import { disposeSprite, textSprite } from './textures';
import {
  ATTACKS,
  type AttackId,
  beginWindup,
  type BossPattern,
  cancelWindup,
  patternOf,
  strikeLands,
  tickWindup,
  windupProgress,
} from './windup';

export type ActorKind =
  | 'user'
  | 'caller'
  | 'customer'
  | 'manager'
  | 'reply'
  | 'jam'
  | 'mosquito'
  | 'consultant'
  | 'shadowit'
  | 'vendor'
  | 'chatbot'
  | 'turret'
  | 'boss'
  | 'healer'
  | 'helper'
  | 'npc'
  | 'tonttu'
  /** Facilities' training dummy: the induction's, and nowhere else. */
  | 'dummy';

/** Kinds that are people with a problem (they can be talked to). */
export const TALKERS: readonly ActorKind[] = ['user', 'caller', 'customer', 'consultant', 'shadowit', 'vendor'];

export type HelperRole = 'sysadmin' | 'security' | 'intern' | 'clone' | 'spirit' | 'dog';

export type HazardKind = 'coffee' | 'fire' | 'meeting' | 'freeze';

/**
 * Elites: the same people, but worse. One affix each, a star over the head,
 * and much better loot.
 */
export type EliteAffix = 'relentless' | 'tenured' | 'vip' | 'cc' | 'escalating' | 'passive';

export const ELITE_INFO: Record<EliteAffix, { readonly prefix: string; readonly desc: string }> = {
  relentless: { prefix: 'Relentless', desc: 'Faster, and never lets up.' },
  tenured: { prefix: 'Tenured', desc: 'Twice the stamina. Has outlasted four reorgs.' },
  vip: { prefix: 'VIP', desc: 'Hits much harder. Knows the CEO.' },
  cc: { prefix: 'CC-Everyone', desc: 'Keeps summoning Reply-All storms.' },
  escalating: { prefix: 'Escalating', desc: 'Enrages when hurt.' },
  passive: { prefix: 'Passive-Aggressive', desc: 'Every hit drains your energy. Per their last email.' },
};

export const ELITE_AFFIXES = Object.keys(ELITE_INFO) as EliteAffix[];

export interface BossDef {
  readonly name: string;
  readonly title: string;
  readonly hp: number;
  readonly outfit: Outfit;
  readonly intro: string;
  readonly phase2: string;
  readonly defeat: string;
  readonly hazard: HazardKind;
  readonly patterns: readonly BossPattern[];
}

export type { BossPattern } from './windup';

export interface DogParts {
  readonly legs: THREE.Object3D[];
  readonly tail: THREE.Object3D;
  readonly head: THREE.Object3D;
}

export interface Actor {
  readonly id: number;
  readonly kind: ActorKind;
  name: string;
  /** After you (or out to make trouble). Fixed by kind, except a hub colleague, who turns only for a reason (hub.ts). */
  hostile: boolean;
  /**
   * A colleague on the hub: a user, caller or manager who is not after you
   * until you give them a reason. You can still hit one (a crime: D4); it
   * stays true once they have turned, so the hub knows its own people.
   */
  readonly colleague: boolean;
  readonly root: THREE.Group;
  readonly rig: Rig | null;
  readonly dog: DogParts | null;
  readonly pos: THREE.Vector3;
  readonly push: THREE.Vector3;
  yaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  cooldown: number;
  aggro: boolean;
  resolved: boolean;
  /** Resolved peacefully: walks off instead of floating away. */
  calm: boolean;
  /** Removed without a reward (a reply-all that hit you, a turret that timed out). */
  expired: boolean;
  removeIn: number;
  flash: number;
  attackAnim: number;
  /** The attack being wound up (null: none), seconds until it strikes, and the whole wind-up. */
  pending: AttackId | null;
  windup: number;
  windupLen: number;
  /** The way a melee or contact attack committed to when it started winding up. */
  readonly aim: THREE.Vector3;
  /** Lasers: the angle the carpet was marked at, so they fire where it said. */
  patternAng: number;
  /** Something without a rig: its own materials, for the warm glow of a wind-up (found when first needed). */
  glowMats: GlowMat[] | null;
  /** A glow or a flash is on the materials: put the resting glow back when it is over. */
  tinted: boolean;
  /** Index into TICKETS: the problem this person brought. */
  ticket: number;
  bubble: THREE.Sprite | null;
  bubbleTime: number;
  barkIn: number;
  readonly hpBar: THREE.Group;
  readonly hpFill: THREE.Mesh;
  marker: THREE.Sprite | null;
  wanderTarget: THREE.Vector3 | null;
  room: number;
  recruited: boolean;
  role: HelperRole | null;
  giftGiven: boolean;
  healIn: number;
  /** Seconds left for a temporary ally or a turret; -1 forever. */
  ttl: number;
  /** Talked to already: one talk-down per person. */
  talked: boolean;
  /** Will not start trouble unless you do (Staff standing; a boss open to talks). */
  docile: boolean;
  /** Story or quest NPC id, if this is one. */
  npcId: string | null;
  /** One-off conversation beats already had with this person. */
  readonly memo: Record<string, boolean>;
  elite: EliteAffix | null;
  boss: BossDef | null;
  bossActive: boolean;
  phase: 1 | 2;
  patternIn: number;
  patternIdx: number;
  charging: number;
  readonly chargeDir: THREE.Vector3;
  summonIn: number;
  /** Shadow IT: next blink, next turret. Vendors: fleeing timer. */
  blinkIn: number;
  fleeT: number;
  /** Rep a vendor has taken off you; you get it back if you resolve them. */
  stolen: number;
  /** Inside a consultant's aura this frame: takes half damage. */
  shielded: boolean;
  stunned: number;
  /** Bosses shrug off stuns for a while after one lands. */
  stunImmune: number;
  shoveImmune: number;
  slowT: number;
  poisonT: number;
  poisonDps: number;
  enragedT: number;
  revealT: number;
  rep: number;
  gold: boolean;
  /** Base emissive (a clone's blue); flashes and auras return to it. */
  glowBase: number;
  /** The quest that wants this one dealt with (a hunt target), if any. */
  questTag: string | null;
  /** A teammate's morale (0..100): how hard and how fast they work. */
  morale: number;
  /** An energy drink's power while it lasts (1: none), the seconds left, and the crash to come. */
  boost: number;
  boostT: number;
  boostCrash: number;
  /** Somebody you have mentored: they work harder for you. */
  protege: boolean;
  /** Where they started: a boss who gives up the chase goes back there. */
  readonly home: THREE.Vector3;
  /** Seconds the player has kept away from an active boss's room. */
  leashT: number;
  readonly lastPos: THREE.Vector3;
  /** Who spawned it (turrets belong to a Shadow IT person). */
  owner: number;
  /** Which level spawn this is (-1: summoned), so resolving it survives a reload. */
  spawnIndex: number;
}

/** A material of something without a rig, and the emissive it rests at. */
export interface GlowMat {
  readonly mat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  readonly base: number;
}

/**
 * A marking on the carpet that fades in where something is about to land: a
 * disc, or (with `beam`) a strip running out from (x, z) along a bearing.
 */
export interface TelegraphSpec {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly seconds: number;
  readonly beam?: { readonly angle: number; readonly length: number };
}

/**
 * What a calm person on a mission does this frame, as a mission's watch
 * decides (stealth.ts): today's rules ('legacy': hostile on sight), an idle
 * wander that notices nothing, a walk or a turn of its own, or Alert (they
 * come for you, after `pause` seconds: never straight from calm to a hit).
 */
export type WatchAct =
  | { readonly kind: 'legacy' }
  | { readonly kind: 'wander' }
  | { readonly kind: 'alert'; readonly pause: number }
  | { readonly kind: 'move'; readonly dx: number; readonly dz: number; readonly speed: number; readonly yaw: number | null };

/** A mission's watchers: who is watched, and what each calm one does with what it sees and hears. */
export interface WatchCtx {
  watches(a: Actor): boolean;
  look(a: Actor, dt: number, sees: boolean, dist: number): WatchAct;
}

/** The hub, as the AI sees it: whether a colleague is walking up to you with a problem. */
export interface HubCtx {
  seeks(a: Actor): boolean;
}

/** What the AI needs from the game. The Game implements it. */
export interface GameCtx {
  readonly level: Level;
  readonly scene: THREE.Scene;
  readonly playerPos: THREE.Vector3;
  readonly actors: Actor[];
  readonly floor: number;
  readonly difficulty: number;
  readonly time: number;
  /** A landed hit by or on the player, for balance measurements. */
  onCombatDamage?: () => void;
  /** 0..1 how hard you are to notice right now (gear, skill, sneaking). */
  readonly stealth: number;
  readonly invisible: boolean;
  readonly staffStanding: number;
  readonly managementStanding: number;
  readonly findings: number;
  /**
   * Whether anything hostile may notice the player. False during the
   * induction until its block and parry are done (docs/SPEC_INDUCTION.md):
   * nobody aggroes, nobody approaches, the boss does not start.
   */
  readonly floorAwake: boolean;
  /** A mission's stealth (the 0.3.0 spike), or none: then everyone is as they always were. */
  readonly watch?: WatchCtx | null;
  /** The hub, while you are on it (hub.ts). */
  readonly hub?: HubCtx | null;
  /** The player has hit a colleague on the hub: the crime (D4), and everything it brings, before the hit lands. */
  assault?(a: Actor): void;
  field: Int16Array;
  hurtPlayer(amount: number, from: Actor | null, kind: 'melee' | 'ticket' | 'meeting' | 'boss' | 'aura' | 'bite'): void;
  enqueueTicket(from: Actor, gold: boolean): void;
  markResolved(a: Actor): void;
  fire(p: ProjectileSpec): void;
  spawn(kind: ActorKind, x: number, z: number, room: number): Actor | null;
  floatText(pos: THREE.Vector3, text: string, color: string): void;
  healPlayer(amount: number, from: string): void;
  addActionItem(from: string): void;
  rootPlayer(seconds: number, reason: string): void;
  shake(amount: number): void;
  giveItem(id: string, n: number, from: string): void;
  giveAmmo(): void;
  /** How hard this ally hits: perks, and a teammate's morale and cans. */
  helperDamageMult(a: Actor): number;
  healerFrequency(): number;
  kitchenStanding(): number;
  ticketTitle(a: Actor): string;
  noticed(a: Actor): void;
  /** A boss notices you: title card, music, the fight is on. */
  bossStart(a: Actor): void;
  /** You got away: the boss goes back to its office and the music stops. */
  bossLeash(a: Actor): void;
  /** A boss open to talks (the Auditor, when you carry the Phoenix file). */
  bossParley(a: Actor): void;
  hazard(x: number, z: number, radius: number, seconds: number, kind: HazardKind): void;
  /** A vendor gets its hand in your pocket. Returns what it took. */
  stealRep(a: Actor, amount: number): number;
  /** Someone starts winding up an attack: the short rising sound of it. */
  windupCue(a: Actor, seconds: number): void;
  /** Mark the carpet where something is about to land. */
  telegraph(t: TelegraphSpec): void;
}

export type ProjectileKind =
  | 'ticket'
  | 'gold'
  | 'invite'
  | 'paper'
  | 'label'
  | 'toner'
  | 'duck'
  | 'rtfm'
  | 'stun'
  | 'po'
  | 'laser'
  | 'ring'
  | 'steam'
  | 'salmiakki'
  | 'deck'
  | 'code'
  | 'chat';

export interface ProjectileSpec {
  readonly kind: ProjectileKind;
  readonly from: THREE.Vector3;
  readonly dir: THREE.Vector3;
  readonly speed: number;
  readonly damage: number;
  readonly hostile: boolean;
  readonly owner: Actor | null;
  readonly ttl?: number;
  readonly splash?: number;
  readonly gravity?: number;
}

let nextActorId = 1;

// ---------------------------------------------------------------------------
// Construction

interface KindStats {
  readonly hp: number;
  readonly speed: number;
  readonly damage: number;
  readonly radius: number;
  readonly rep: number;
}

type Grunt = 'user' | 'caller' | 'customer' | 'manager' | 'reply' | 'jam' | 'mosquito' | 'consultant' | 'shadowit' | 'vendor' | 'chatbot' | 'turret';

const STATS: Record<Grunt, KindStats> = {
  user: { hp: 40, speed: 3.1, damage: 6, radius: 0.4, rep: 8 },
  caller: { hp: 32, speed: 2.7, damage: 8, radius: 0.4, rep: 10 },
  customer: { hp: 95, speed: 2.4, damage: 13, radius: 0.45, rep: 26 },
  manager: { hp: 130, speed: 2.3, damage: 6, radius: 0.45, rep: 42 },
  reply: { hp: 12, speed: 5.6, damage: 4, radius: 0.3, rep: 3 },
  jam: { hp: 75, speed: 1.9, damage: 7, radius: 0.55, rep: 20 },
  mosquito: { hp: 6, speed: 6.5, damage: 2, radius: 0.2, rep: 1 },
  consultant: { hp: 110, speed: 2.2, damage: 11, radius: 0.45, rep: 48 },
  shadowit: { hp: 70, speed: 3.3, damage: 8, radius: 0.4, rep: 36 },
  vendor: { hp: 55, speed: 4.2, damage: 3, radius: 0.4, rep: 30 },
  chatbot: { hp: 48, speed: 1.6, damage: 6, radius: 0.4, rep: 18 },
  turret: { hp: 30, speed: 0, damage: 5, radius: 0.35, rep: 4 },
};

export const BOSSES: readonly BossDef[] = [
  {
    name: 'Derek', title: 'Team Leader, Service Desk', hp: 650,
    outfit: { skin: 0xf1c9a5, hair: 0x6b4423, top: 0xffffff, legs: 0x1f2a44, tie: 0xc0392b, lanyard: 0x2266cc, scale: 1.7, face: 'smug' },
    intro: 'Got a sec? I have booked us a quick 90-minute sync.',
    phase2: 'Right. I am putting a RECURRING meeting in. Every fifteen minutes. Forever.',
    defeat: 'Fine. Let us... take this offline.',
    hazard: 'meeting',
    patterns: ['invites', 'summonUsers', 'charge', 'invites', 'shockwave'],
  },
  {
    name: 'Karen', title: 'VP of Customer Success', hp: 950,
    outfit: { skin: 0xffdbac, hair: 0xd8b36a, top: 0x8e44ad, legs: 0x2e3440, hairStyle: 'bun', glasses: true, scale: 1.75, face: 'angry' },
    intro: 'We are a GOLD account. I want the person in charge of you.',
    phase2: 'I am escalating this to the CEO. And the press. And my LinkedIn.',
    defeat: 'I will be leaving a review. A... good one.',
    hazard: 'fire',
    patterns: ['goldSpiral', 'summonCustomers', 'shockwave', 'goldSpiral', 'charge'],
  },
  {
    name: 'Gordon', title: 'Head of Procurement', hp: 1250,
    outfit: { skin: 0xe0ac7e, hair: 0x8a8a8a, top: 0x3b3b3b, legs: 0x3b3b3b, tie: 0x27ae60, glasses: true, hairStyle: 'bald', scale: 1.8, face: 'stern' },
    intro: 'Has this purchase been through the three-quote process?',
    phase2: 'Everything is frozen. The budget. The floor. YOU.',
    defeat: 'Approved. Under protest. Net 90.',
    hazard: 'freeze',
    patterns: ['poBombs', 'freeze', 'summonReply', 'poBombs', 'invites'],
  },
  {
    name: 'The Auditor', title: 'External, Big Four', hp: 1500,
    outfit: { skin: 0xc68642, hair: 0x111111, top: 0x222222, legs: 0x111111, tie: 0x111111, glasses: true, scale: 1.8, face: 'stern' },
    intro: 'I will need evidence. Of everything. Since 2011.',
    phase2: 'Material weakness. MATERIAL WEAKNESS.',
    defeat: 'No material findings. This time.',
    hazard: 'fire',
    patterns: ['lasers', 'summonManagers', 'lasers', 'shockwave', 'teleport'],
  },
  {
    name: 'Sir Reginald Workgrumble', title: 'Founder & CEO', hp: 2400,
    outfit: { skin: 0xf1c9a5, hair: 0xeeeeee, top: 0x1a1a3a, legs: 0x1a1a3a, tie: 0xd4af37, hairStyle: 'short', scale: 2.1, face: 'smug' },
    intro: 'Ah, IT. We are restructuring. You are the structure.',
    phase2: 'Do you know what I paid SynergyNow? Do you know what YOU cost? Everything must go.',
    defeat: 'Take the farm money. Take it! Just fix my email first.',
    hazard: 'coffee',
    patterns: ['allHands', 'goldSpiral', 'lasers', 'teleport', 'shockwave', 'poBombs', 'charge'],
  },
];

const FACES: Partial<Record<ActorKind, Expression>> = {
  user: 'angry', caller: 'angry', customer: 'smug', manager: 'smug', healer: 'kind', helper: 'tired', npc: 'neutral', tonttu: 'happy',
  consultant: 'smug', shadowit: 'tired', vendor: 'happy',
};

function outfitFor(kind: ActorKind, r: Rng): Outfit {
  const base = { skin: r.pick(SKINS), hair: r.pick(HAIRS), legs: r.pick(TROUSERS), face: FACES[kind] ?? 'neutral' };
  switch (kind) {
    case 'user':
      return { ...base, top: r.pick(SHIRTS), lanyard: 0x2266cc, glasses: r.chance(0.3), hairStyle: r.pick(['short', 'long', 'bun', 'bald'] as const) };
    case 'caller':
      return { ...base, top: r.pick(SHIRTS), headset: true, hairStyle: r.pick(['short', 'long'] as const) };
    case 'customer':
      return { ...base, top: 0x2c3e50, legs: 0x2c3e50, tie: r.pick([0xd4af37, 0xc0392b, 0x2980b9]), glasses: r.chance(0.5), scale: 1.08 };
    case 'manager':
      return { ...base, top: 0xffffff, tie: r.pick([0xc0392b, 0x8e44ad, 0x16a085]), lanyard: 0xc0392b, scale: 1.15, hairStyle: 'short' };
    case 'consultant':
      return { ...base, top: 0x1c2833, legs: 0x1c2833, tie: 0x5dade2, glasses: true, hairStyle: 'short', backpack: 0x111111, scale: 1.1 };
    case 'shadowit':
      return { ...base, top: 0x4a235a, legs: 0x1b2631, hairStyle: 'hood', glasses: r.chance(0.7), backpack: 0x7d3c98 };
    case 'vendor':
      return { ...base, top: 0xf39c12, legs: 0x2e4053, tie: 0xe74c3c, lanyard: 0xf1c40f, hairStyle: 'short', face: 'happy' };
    case 'healer':
      return { ...base, top: r.pick([0xf5b7b1, 0xd7bde2, 0xfad7a0, 0xa9dfbf]), cardigan: r.pick([0x8e44ad, 0xc0392b, 0x2e86c1, 0xd35400, 0x117a65]), legs: 0x4a4036, hairStyle: r.pick(['bun', 'long'] as const), glasses: r.chance(0.6), hair: r.pick([0x8a8a8a, 0xa0522d, 0xd8b36a, 0x6b4423]) };
    case 'helper':
      return { ...base, top: 0x2d2d2d, hairStyle: 'short', glasses: true, backpack: 0x444444 };
    case 'tonttu':
      return { skin: 0xf1c9a5, hair: 0xffffff, top: 0x7a4a2a, legs: 0x5a3a20, hairStyle: 'tonttu', beard: 0xf4f4f4, face: 'happy' };
    case 'npc':
      return { ...base, top: r.pick([0x5d6d7e, 0x7d3c98, 0x1e8449, 0xb9770e]), lanyard: 0xf1c40f, glasses: r.chance(0.5) };
    default:
      return { ...base, top: r.pick(SHIRTS) };
  }
}

function hpBar(): { group: THREE.Group; fill: THREE.Mesh } {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0x400000, depthTest: false, transparent: true }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff4040, depthTest: false, transparent: true }));
  fill.position.z = 0.001;
  bg.renderOrder = 11;
  fill.renderOrder = 12;
  group.add(bg);
  group.add(fill);
  group.visible = false;
  return { group, fill };
}

function envelopeMesh(): THREE.Group {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: 0x222222, roughness: 0.8 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.45, 0.05, 2, 0.02), paper);
  body.position.y = 1.2;
  g.add(body);
  // The flap: a triangle folded down over the front.
  const tri = new THREE.Shape();
  tri.moveTo(-0.34, 0);
  tri.lineTo(0.34, 0);
  tri.lineTo(0, -0.24);
  tri.closePath();
  const flap = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 }), new THREE.MeshStandardMaterial({ color: 0xe2e2e2, roughness: 0.8 }));
  flap.position.set(0, 1.42, 0.026);
  g.add(flap);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  for (const x of [-0.12, 0.12]) {
    const e = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), eyeMat);
    e.position.set(x, 1.2, 0.045);
    e.scale.y = 0.6;
    e.rotation.z = x > 0 ? 0.3 : -0.3;
    g.add(e);
  }
  return g;
}

function mosquitoMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.22, 4, 8), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
  body.rotation.x = Math.PI / 2;
  body.position.y = 1.4;
  g.add(body);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xddeeff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.1), wingMat);
    w.position.set(s * 0.14, 1.45, 0);
    w.name = 'wing';
    g.add(w);
  }
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2), new THREE.MeshBasicMaterial({ color: 0x220000 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.4, 0.2);
  g.add(nose);
  return g;
}

function jamMesh(): THREE.Group {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.85 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.1, 1.1, 2, 0.04), paper);
    s.position.y = 0.3 + i * 0.22;
    s.rotation.set((i % 2) * 0.08 - 0.04, (i % 3) * 0.3, ((i + 1) % 2) * 0.06 - 0.03);
    g.add(s);
  }
  // A crumpled sheet sticking out of the top, like a tongue.
  const tongue = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), paper);
  tongue.scale.set(1.3, 0.5, 0.9);
  tongue.position.set(0.1, 1.55, 0.2);
  g.add(tongue);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
  for (const x of [-0.18, 0.18]) {
    const e = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), eyeMat);
    e.position.set(x, 1.3, 0.57);
    g.add(e);
  }
  const shadow = blobShadow(1.3);
  if (shadow !== null) g.add(shadow);
  return g;
}

/** The consultant's aura: a faint ring on the carpet showing who is covered. */
const AURA_RADIUS = 6;
function auraMesh(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(AURA_RADIUS - 0.15, AURA_RADIUS, 48),
    new THREE.MeshBasicMaterial({ color: 0x5dade2, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.name = 'aura';
  return m;
}

export interface SpawnOpts {
  readonly staffStanding?: number;
  readonly npc?: { id: string; name: string };
  readonly role?: HelperRole;
  readonly ttl?: number;
  readonly elite?: EliteAffix | null;
  readonly owner?: number;
  readonly spawnIndex?: number;
  /** A particular person's clothes (Morag's cardigan), instead of the kind's usual roll. */
  readonly outfit?: Outfit;
  /** A colleague on the hub: spawned neutral (see `Actor.colleague`). */
  readonly colleague?: boolean;
}

/** This floor's boss's name, Overtime and all: on the floor, and in Monday's announcement. */
export function bossName(floor: number): string {
  const boss = BOSSES[floor % BOSSES.length];
  if (boss === undefined) throw new Error('no boss');
  return floor >= BOSSES.length ? `${boss.name} (Overtime)` : boss.name;
}

/** Roll the same person even when a saved resolution means no mesh is needed. */
export function rollActor(kind: ActorKind, floor: number, r: Rng, ticketCount: number, opts: SpawnOpts = {}) {
  let name = '';
  let role: HelperRole | null = opts.role ?? null;
  let outfit: Outfit | null = null;
  if (kind === 'chatbot') name = r.pick(['HelpBot 3000', 'Clippy (Returns)', 'AskIT Assistant', 'Chatty McChatface']);
  else if (kind === 'boss') {
    const boss = BOSSES[floor % BOSSES.length];
    if (boss === undefined) throw new Error('no boss');
    name = bossName(floor);
    outfit = boss.outfit;
  } else if (kind === 'reply') name = 'RE: RE: RE: FW: All Staff';
  else if (kind === 'jam') name = 'Paper Jam (Tray 2)';
  else if (kind === 'mosquito') name = 'Hyttynen';
  else if (kind === 'turret') name = 'Unsanctioned Deployment';
  else if (kind === 'dummy') name = 'Facilities training dummy';
  else if (kind === 'helper' && role === 'dog') { /* Musti has no outfit. */ }
  else if (kind === 'helper' && (role === 'clone' || role === 'spirit')) {
    outfit = role === 'spirit' ? outfitFor('tonttu', r) : { skin: 0x9fe0ff, hair: 0x5fb6ff, top: 0x5fb6ff, legs: 0x2a6fb0, face: 'neutral', glasses: true };
  } else outfit = opts.outfit ?? outfitFor(kind, r);

  if (kind === 'healer') {
    const [n, dept] = r.pick(HEALER_NAMES);
    name = `${n} from ${dept}`;
  } else if (kind === 'tonttu') name = 'Saunatonttu';
  else if (kind === 'npc') name = opts.npc?.name ?? 'Someone';
  else if (kind === 'helper') {
    if (role === null) role = r.pick(['sysadmin', 'sysadmin', 'security', 'intern'] as const);
    name = opts.npc?.name ?? (role === 'sysadmin'
      ? r.pick(['Dave (Senior Sysadmin)', 'Old Bob (Mainframe)', 'Priya (Network Eng.)', 'Mikko (Sysadmin)'])
      : role === 'security' ? r.pick(['Sunil (Security)', 'Bev (Security)'])
        : role === 'clone' ? 'Pat (autoscaled instance)'
          : role === 'spirit' ? 'Saunatonttu (summoned)'
            : role === 'dog' ? 'Musti' : r.pick(['Josh (Intern)', 'Ellie (Intern)', 'Aino (Intern)']));
  } else if (kind !== 'boss' && kind !== 'dummy') {
    const first = r.pick(USER_NAMES);
    const dept = r.pick(['Sales', 'Marketing', 'Legal', 'Ops', 'Finance', 'HR', 'Comms']);
    switch (kind) {
      case 'manager': name = r.pick(MANAGER_NAMES); break;
      case 'customer': name = `${first} (Client, Gold SLA)`; break;
      case 'caller': name = `${first} (on the phone)`; break;
      case 'consultant': name = `${first} (${r.pick(['McKinsley', 'Bane & Co', 'Deloittish', 'Accentual'])})`; break;
      case 'shadowit': name = `${first} from ${dept} (Shadow IT)`; break;
      case 'vendor': name = `${first} (${r.pick(['SynergyNow', 'CloudSprout', 'AIforce', 'VendorLock Inc'])})`; break;
      case 'user': name = `${first} from ${dept}`; break;
      default: break;
    }
  }
  const elite = kind !== 'healer' && kind !== 'helper' && kind !== 'npc' && kind !== 'tonttu' && kind !== 'boss' && kind !== 'turret' && kind !== 'reply' && kind !== 'mosquito' ? opts.elite ?? null : null;
  const staff = opts.staffStanding ?? 0;
  const docile = (kind === 'user' || kind === 'caller') && elite === null && staff > 20 && r.chance((staff - 20) / 120);
  return { name, role, outfit, docile, yaw: r.range(0, Math.PI * 2), cooldown: r.range(0.5, 2), ticket: r.int(0, ticketCount - 1), barkIn: r.range(3, 12), blinkIn: r.range(3, 6) };
}

export function createActor(
  ctx: Pick<GameCtx, 'scene' | 'floor' | 'difficulty'>,
  kind: ActorKind,
  x: number,
  z: number,
  room: number,
  r: Rng,
  ticketCount: number,
  opts: SpawnOpts = {},
): Actor {
  const f = ctx.floor;
  const rolled = rollActor(kind, f, r, ticketCount, opts);
  let rig: Rig | null = null;
  let dog: DogParts | null = null;
  const root = new THREE.Group();
  let name = rolled.name;
  let hp: number;
  let speed: number;
  let damage = 5;
  let radius = 0.4;
  let rep = 0;
  let boss: BossDef | null = null;
  const role = rolled.role;
  let glowBase = 0;
  const colleague = opts.colleague === true;
  const hostile = !colleague && kind !== 'healer' && kind !== 'helper' && kind !== 'npc' && kind !== 'tonttu';

  if (kind === 'reply') {
    root.add(envelopeMesh());
  } else if (kind === 'jam') {
    root.add(jamMesh());
  } else if (kind === 'mosquito') {
    root.add(mosquitoMesh());
  } else if (kind === 'chatbot') {
    root.add(chatbotMesh());
  } else if (kind === 'turret') {
    root.add(turretMesh());
  } else if (kind === 'boss') {
    boss = BOSSES[f % BOSSES.length] ?? null;
    if (boss === null) throw new Error('no boss');
    rig = buildRig(boss.outfit);
    root.add(rig.root);
  } else if (kind === 'dummy') {
    root.add(dummyMesh());
  } else if (kind === 'helper' && role === 'dog') {
    const d = dogMesh();
    root.add(d.root);
    dog = { legs: d.legs, tail: d.tail, head: d.head };
  } else if (kind === 'helper' && (role === 'clone' || role === 'spirit')) {
    rig = buildRig(rolled.outfit as Outfit);
    if (role === 'clone') {
      glowBase = 0x113355;
      for (const m of rig.materials) {
        m.transparent = true;
        m.opacity = 0.7;
      }
    }
    root.add(rig.root);
  } else {
    rig = buildRig(rolled.outfit as Outfit);
    root.add(rig.root);
  }
  if (kind === 'consultant') root.add(auraMesh());

  // Each floor up, everyone is a tenth tougher (on top of your rung and your employer).
  const diff = ctx.difficulty * (1 + f * 0.1);
  if (kind === 'boss' && boss !== null) {
    const loop = Math.floor(f / BOSSES.length);
    hp = boss.hp * ctx.difficulty * (1 + loop * 0.8);
    speed = 2.6;
    damage = 14 * ctx.difficulty * (1 + loop * 0.5);
    radius = 0.9;
    rep = Math.round((300 + f * 120) * ctx.difficulty);
  } else if (kind === 'healer') {
    hp = 1;
    speed = 1.4;
  } else if (kind === 'tonttu') {
    hp = 1;
    speed = 1;
  } else if (kind === 'npc') {
    hp = 1;
    speed = 1;
  } else if (kind === 'dummy') {
    // A practice hit takes a little off you, the same on every rung and floor:
    // the lesson is the block, not the arithmetic.
    hp = 120;
    speed = 0;
    damage = 5;
    radius = 0.45;
  } else if (kind === 'helper') {
    hp = 1;
    speed = role === 'dog' ? 5.2 : 3.6;
    radius = role === 'dog' ? 0.35 : 0.4;
  } else {
    const st = STATS[kind as Grunt];
    hp = st.hp * diff;
    speed = st.speed * (1 + f * 0.03) * (0.9 + ctx.difficulty * 0.1);
    damage = st.damage * diff;
    radius = st.radius;
    rep = Math.round(st.rep * (1 + f * 0.25) * (0.6 + ctx.difficulty * 0.4));
  }

  const elite = hostile && kind !== 'boss' && kind !== 'turret' && kind !== 'reply' && kind !== 'mosquito' ? opts.elite ?? null : null;
  if (elite !== null) {
    hp *= elite === 'tenured' ? 2.8 : 1.7;
    damage *= elite === 'vip' ? 1.6 : 1.1;
    speed *= elite === 'relentless' ? 1.45 : 1;
    rep = Math.round(rep * 3);
    radius += 0.05;
    name = `${ELITE_INFO[elite].prefix} ${name}`;
    if (rig !== null) rig.root.scale.multiplyScalar(elite === 'tenured' ? 1.3 : 1.15);
    else root.scale.setScalar(1.25);
  }

  const bar = hpBar();
  bar.group.position.y = kind === 'boss' ? 4.2 : kind === 'turret' ? 1.7 : 2.35 * (elite !== null ? 1.2 : 1);
  root.add(bar.group);
  root.position.set(x, 0, z);
  ctx.scene.add(root);

  const docile = rolled.docile;

  const a: Actor = {
    id: nextActorId++,
    kind, name, hostile, colleague, root, rig, dog,
    pos: root.position,
    push: new THREE.Vector3(),
    yaw: rolled.yaw,
    radius, hp, maxHp: hp, speed, damage,
    cooldown: rolled.cooldown,
    aggro: false,
    resolved: false,
    calm: false,
    expired: false,
    removeIn: -1,
    flash: 0,
    attackAnim: 0,
    pending: null,
    windup: 0,
    windupLen: 0,
    aim: new THREE.Vector3(0, 0, 1),
    patternAng: 0,
    glowMats: null,
    tinted: false,
    ticket: rolled.ticket,
    bubble: null,
    bubbleTime: 0,
    barkIn: rolled.barkIn,
    hpBar: bar.group,
    hpFill: bar.fill,
    marker: null,
    wanderTarget: null,
    room,
    recruited: role === 'clone' || role === 'spirit' || role === 'dog',
    role,
    giftGiven: false,
    healIn: 2,
    ttl: opts.ttl ?? (kind === 'turret' ? 30 : -1),
    talked: false,
    docile,
    npcId: opts.npc?.id ?? null,
    memo: {},
    elite,
    boss,
    bossActive: false,
    phase: 1,
    patternIn: 2.5,
    patternIdx: 0,
    charging: 0,
    chargeDir: new THREE.Vector3(),
    summonIn: kind === 'shadowit' ? 5 : 10,
    blinkIn: rolled.blinkIn,
    fleeT: 0,
    stolen: 0,
    shielded: false,
    stunned: 0,
    stunImmune: 0,
    shoveImmune: 0,
    slowT: 0,
    poisonT: 0,
    poisonDps: 0,
    enragedT: 0,
    revealT: 0,
    rep,
    gold: kind === 'customer' || kind === 'boss' || elite === 'vip',
    glowBase,
    questTag: null,
    morale: MORALE_START,
    boost: 1,
    boostT: 0,
    boostCrash: 0,
    protege: false,
    home: new THREE.Vector3(x, 0, z),
    leashT: 0,
    lastPos: new THREE.Vector3(x, 0, z),
    owner: opts.owner ?? 0,
    spawnIndex: opts.spawnIndex ?? -1,
  };
  if (rig !== null) {
    rig.glow = glowBase;
    tintRig(rig, 0, 0);
  }
  if (docile && a.rig !== null) setExpression(a.rig, 'neutral');
  if (kind === 'npc' || kind === 'tonttu') setMarker(a, '!', '#ffd54a');
  if (elite !== null) setMarker(a, '★', '#ff9a3a');
  return a;
}

export function markerHeight(a: Actor): number {
  if (a.kind === 'tonttu') return 1.9;
  if (a.kind === 'boss') return 4.8;
  return a.elite !== null ? 3.4 : 2.9;
}

export function setMarker(a: Actor, text: string | null, color = '#ffd54a'): void {
  if (a.marker !== null) {
    a.root.remove(a.marker);
    disposeSprite(a.marker);
    a.marker = null;
  }
  if (text === null) return;
  const s = textSprite(text, { color, size: 60 });
  s.position.y = markerHeight(a);
  a.root.add(s);
  a.marker = s;
}

export function disposeActor(scene: THREE.Scene, a: Actor): void {
  scene.remove(a.root);
  if (a.bubble !== null) disposeSprite(a.bubble);
  if (a.marker !== null) disposeSprite(a.marker);
  if (a.rig !== null) disposeRig(a.rig);
  disposeTree(a.root, true);
}

export function say(a: Actor, text: string, seconds = 3, color = '#111', bg = 'rgba(255,255,240,0.95)'): void {
  if (a.bubble !== null) {
    a.root.remove(a.bubble);
    disposeSprite(a.bubble);
  }
  const s = textSprite(text, { color, bg, size: 26, maxWidth: 420 });
  const top = a.kind === 'boss' ? 4.7
    : a.kind === 'reply' || a.kind === 'mosquito' || a.kind === 'turret' ? 1.9
      : a.kind === 'tonttu' || a.role === 'dog' ? 1.6 : a.elite !== null ? 3.1 : 2.7;
  s.position.y = top + s.scale.y / 2;
  a.root.add(s);
  a.bubble = s;
  a.bubbleTime = seconds;
}

// ---------------------------------------------------------------------------
// Behaviour

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function moveActor(ctx: GameCtx, a: Actor, dx: number, dz: number, speed: number, dt: number): void {
  const len = Math.hypot(dx, dz);
  const slow = a.slowT > 0 ? 0.4 : 1;
  if (len > 1e-4) {
    a.pos.x += (dx / len) * speed * slow * dt;
    a.pos.z += (dz / len) * speed * slow * dt;
    const targetYaw = Math.atan2(dx, dz);
    let d = targetYaw - a.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    a.yaw += d * Math.min(1, dt * 10);
  }
  a.pos.x += a.push.x * dt;
  a.pos.z += a.push.z * dt;
  a.push.multiplyScalar(Math.max(0, 1 - dt * 6));
  collideCircle(ctx.level, a.pos, a.radius);
}

/**
 * Can you walk it in a straight line? Line of sight only asks whether you can
 * see across; desks, counters and meeting tables are see-through but solid.
 */
export function walkClear(level: Level, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const steps = Math.ceil(dist / (TILE * 0.25));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = toCell(ax + dx * t);
    const cz = toCell(az + dz * t);
    if (cx < 0 || cz < 0 || cx >= level.w || cz >= level.h) return false;
    if (level.solid[cz * level.w + cx] === 1) return false;
  }
  return true;
}

/** Direction toward the player by flow field when there is no clear line. */
function navDir(ctx: GameCtx, a: Actor, out: THREE.Vector3): boolean {
  const lv = ctx.level;
  const cx = toCell(a.pos.x);
  const cz = toCell(a.pos.z);
  const here = ctx.field[cz * lv.w + cx] ?? -1;
  if (here < 0) return false;
  let best = here;
  let bx = cx;
  let bz = cz;
  for (const [ox, oz] of NEIGHBOURS8) {
    const nx = cx + ox;
    const nz = cz + oz;
    if (nx < 0 || nz < 0 || nx >= lv.w || nz >= lv.h) continue;
    if (ox !== 0 && oz !== 0) {
      if (lv.solid[cz * lv.w + nx] === 1 || lv.solid[nz * lv.w + cx] === 1) continue;
    }
    const d = ctx.field[nz * lv.w + nx] ?? -1;
    if (d >= 0 && d < best) {
      best = d;
      bx = nx;
      bz = nz;
    }
  }
  out.set(bx * TILE + TILE / 2 - a.pos.x, 0, bz * TILE + TILE / 2 - a.pos.z);
  return true;
}

/**
 * Head for the player: straight at them when the way is clear, by the flow
 * field when it is not. Returns false when there is no way at all.
 */
function approach(ctx: GameCtx, a: Actor, dx: number, dz: number, out: THREE.Vector3): boolean {
  if (walkClear(ctx.level, a.pos.x, a.pos.z, ctx.playerPos.x, ctx.playerPos.z)) {
    out.set(dx, 0, dz);
    return true;
  }
  return navDir(ctx, a, out);
}

function throwAt(ctx: GameCtx, a: Actor, kind: ProjectileKind, speed: number, damage: number, spread = 0, lead = true): void {
  const from = a.pos.clone();
  from.y = 1.4 * Math.min(1.6, a.rig?.root.scale.y ?? 1);
  if (a.kind === 'turret') from.y = 1.1;
  const target = ctx.playerPos.clone();
  target.y = 1.2;
  if (lead) target.x += fx.range(-0.4, 0.4);
  const dir = target.sub(from).normalize();
  if (spread !== 0) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
  ctx.fire({ kind, from, dir, speed, damage, hostile: true, owner: a });
}

function ring(ctx: GameCtx, a: Actor, kind: ProjectileKind, n: number, speed: number, damage: number, offset = 0): void {
  for (let i = 0; i < n; i++) {
    const ang = offset + (i / n) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    const from = a.pos.clone();
    from.y = 1.1;
    ctx.fire({ kind, from, dir, speed, damage, hostile: true, owner: a, ttl: 4 });
  }
}

function glowFor(a: Actor): number {
  if (a.revealT > 0) return 0x552200;
  if (a.shielded) return 0x0e2a4a;
  if (a.elite !== null && a.enragedT > 0) return 0x3a0800;
  return a.glowBase;
}

/** The warm glow of someone winding up an attack. */
const WARM = 0xff7a1a;
const WARM_COLOR = new THREE.Color(WARM);

/**
 * Warm up something without a rig (an envelope, a jam, a turret): its own
 * materials only, never the shared ones everybody's shadow is drawn with.
 */
function glowNonRig(a: Actor, amount: number): void {
  if (a.glowMats === null) {
    const mats: GlowMat[] = [];
    a.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.shared === true) return;
      const m: unknown = o.material;
      if ((m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial) && m.userData.shared !== true && !mats.some((g) => g.mat === m)) {
        mats.push({ mat: m, base: m.emissive.getHex() });
      }
    });
    a.glowMats = mats;
  }
  for (const g of a.glowMats) g.mat.emissive.setHex(g.base).lerp(WARM_COLOR, amount);
}

export function updateActor(ctx: GameCtx, a: Actor, dt: number): void {
  // Resolved by any road (resolved in combat, talked down, a quest): nothing is coming any more.
  if (a.resolved && a.pending !== null) cancelWindup(a);
  // How far through a wind-up: the tell grows until the strike.
  const tell = windupProgress(a);
  if (a.flash > 0) {
    a.flash = Math.max(0, a.flash - dt * 4);
    if (a.rig !== null) tintRig(a.rig, a.resolved ? 0x30ff60 : a.poisonT > 0 ? 0x30a030 : 0xff3030, a.flash);
    a.tinted = true;
  } else if (tell > 0) {
    // Winding up: a warm glow that brightens toward the strike.
    const amount = 0.3 + tell * 0.5;
    if (a.rig !== null) tintRig(a.rig, WARM, amount);
    else glowNonRig(a, amount * 0.8);
    a.tinted = true;
  } else if (a.rig !== null) {
    const g = glowFor(a);
    if (a.rig.glow !== g || a.tinted) {
      a.rig.glow = g;
      tintRig(a.rig, 0, 0);
      a.tinted = false;
    }
  } else if (a.tinted) {
    glowNonRig(a, 0);
    a.tinted = false;
  }
  if (a.bubble !== null) {
    a.bubbleTime -= dt;
    if (a.bubbleTime <= 0) {
      a.root.remove(a.bubble);
      disposeSprite(a.bubble);
      a.bubble = null;
    }
  }
  if (a.marker !== null) a.marker.position.y = markerHeight(a) + Math.sin(ctx.time * 3) * 0.08;
  a.attackAnim = Math.max(0, a.attackAnim - dt * 3);
  a.slowT = Math.max(0, a.slowT - dt);
  a.stunImmune = Math.max(0, a.stunImmune - dt);
  a.shoveImmune = Math.max(0, a.shoveImmune - dt);
  if (!(a.elite === 'escalating' && a.hp < a.maxHp * 0.5)) a.enragedT = Math.max(0, a.enragedT - dt);
  a.revealT = Math.max(0, a.revealT - dt);

  if (a.resolved) {
    a.removeIn -= dt;
    if (a.calm) {
      // Walks off, satisfied (or just confused), and fades.
      if (a.rig !== null && a.hostile) setExpression(a.rig, 'happy');
      moveActor(ctx, a, a.pos.x - ctx.playerPos.x, a.pos.z - ctx.playerPos.z, 1.5, dt);
      a.root.rotation.y = a.yaw;
      if (a.rig !== null) animateRig(a.rig, 1.5, dt);
      if (a.removeIn < 0.8) a.root.scale.setScalar(Math.max(0.01, a.removeIn / 0.8));
    } else {
      // Resolved: a satisfied spin, up and away in a flurry of paper.
      a.root.position.y += dt * 0.6;
      a.root.rotation.y += dt * (a.kind === 'boss' ? 2 : 9);
      a.root.scale.setScalar(Math.max(0.01, Math.min(1, a.removeIn / 1.2)));
      if (a.rig !== null) animateRig(a.rig, 0.5, dt);
    }
    return;
  }

  // Poison bleeds hp outside hurtActor: a boss that is not to be touched yet sheds it.
  if (a.poisonT > 0 && shrugsOff(ctx, a)) a.poisonT = 0;
  if (a.poisonT > 0) {
    a.poisonT -= dt;
    a.hp -= a.poisonDps * dt;
    if (a.poisonDps > 0) ctx.onCombatDamage?.();
    a.hpFill.scale.x = Math.max(0.001, a.hp / a.maxHp);
    a.hpFill.position.x = -(1 - a.hpFill.scale.x) / 2;
  }
  if (a.ttl > 0) {
    a.ttl -= dt;
    if (a.ttl <= 0) {
      a.resolved = true;
      a.expired = true;
      a.removeIn = 0.6;
      return;
    }
  }

  // The dummy is bolted to its base: no shove, knock or parry moves it. And
  // whatever got at it (a poison rune goes round hurtActor) is patched up.
  if (a.kind === 'dummy') {
    a.push.set(0, 0, 0);
    a.pos.copy(a.home);
    if (a.hp < a.maxHp * 0.25) a.hp = a.maxHp;
  }
  a.lastPos.copy(a.pos);
  if (a.stunned > 0) {
    a.stunned -= dt;
    moveActor(ctx, a, 0, 0, 0, dt);
    a.root.rotation.y = a.yaw + Math.sin(ctx.time * 30) * 0.1;
    if (a.stunned <= 0) rewind(ctx, a);
    return;
  }

  if (a.kind === 'dummy') updateDummy(ctx, a, dt);
  else if (a.hostile) updateHostile(ctx, a, dt);
  else if (a.colleague) updateColleague(ctx, a, dt);
  else updateFriendly(ctx, a, dt);

  a.root.rotation.y = a.yaw;
  const moved = Math.hypot(a.pos.x - a.lastPos.x, a.pos.z - a.lastPos.z) / Math.max(dt, 1e-4);
  if (a.rig !== null) {
    animateRig(a.rig, moved, dt, a.attackAnim, tell);
    // A flinch when hit; winding up, a lean back (or, for a charge, a crouch forward).
    const crouch = a.pending === 'boss.charge' ? tell : 0;
    a.rig.body.rotation.x = -a.flash * 0.28 - (tell - crouch) * 0.2 + crouch * 0.35;
    a.rig.body.position.y -= crouch * 0.3;
    // People who are not fighting you look at you as you pass.
    const dx = ctx.playerPos.x - a.pos.x;
    const dz = ctx.playerPos.z - a.pos.z;
    let look = 0;
    if (!a.aggro && Math.hypot(dx, dz) < 7) {
      look = Math.atan2(dx, dz) - a.yaw;
      while (look > Math.PI) look -= Math.PI * 2;
      while (look < -Math.PI) look += Math.PI * 2;
      look = Math.max(-0.9, Math.min(0.9, look));
    }
    a.rig.head.rotation.y += (look - a.rig.head.rotation.y) * Math.min(1, dt * 5);
  }
  if (a.dog !== null) animateDog(a.dog, moved, ctx.time, a.attackAnim);
  if (a.kind === 'reply') a.root.children[0]?.position.set(0, Math.sin(ctx.time * 8 + a.id) * 0.15, 0);
  if (a.kind === 'chatbot') a.root.children[0]?.position.set(0, Math.sin(ctx.time * 2.5 + a.id) * 0.12, 0);
  if (a.kind === 'mosquito') {
    a.root.position.y = Math.sin(ctx.time * 5 + a.id) * 0.3;
    a.root.traverse((o) => { if (o.name === 'wing') o.rotation.x = Math.sin(ctx.time * 80) * 0.8; });
  }
  if (a.kind === 'consultant') {
    const aura = a.root.getObjectByName('aura');
    if (aura !== undefined) aura.rotation.z = ctx.time * 0.4;
  }
  if (a.rig === null && a.dog === null) {
    // No arms to draw back: the whole thing pulls back and shivers, and a
    // swarm buzzes up before it dives.
    const body = a.root.children[0];
    if (body !== undefined && (tell > 0 || body.position.z !== 0)) {
      body.position.z = -tell * 0.35;
      body.position.x = tell > 0 ? Math.sin(ctx.time * 70) * 0.05 * tell : 0;
      if (a.kind === 'mosquito') body.position.y = tell * 0.45;
      else if (a.kind === 'reply') body.position.y += tell * 0.45;
    }
  }
}

function animateDog(d: DogParts, speed: number, time: number, attack: number): void {
  const amp = Math.min(0.9, speed * 0.2);
  const s = Math.sin(time * (6 + speed * 1.5));
  d.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? s : -s) * amp; });
  d.tail.rotation.y = Math.sin(time * 12) * 0.5;
  d.head.rotation.x = attack > 0 ? 0.4 * attack : Math.sin(time * 1.3) * 0.05;
}

/** Turn toward a bearing, not snap to it. */
function turnTo(a: Actor, yaw: number, dt: number): void {
  let d = yaw - a.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  a.yaw += d * Math.min(1, dt * 6);
}

function aggroRange(ctx: GameCtx, a: Actor): number {
  const base = a.kind === 'boss' ? 16 : a.kind === 'manager' || a.kind === 'consultant' ? 13 : a.kind === 'caller' || a.kind === 'turret' ? 14 : a.kind === 'mosquito' ? 9 : 11;
  return base * (1 - ctx.stealth);
}

function barksFor(a: Actor): readonly string[] {
  switch (a.kind) {
    case 'customer': return CUSTOMER_BARKS;
    case 'manager': return MANAGER_BARKS;
    case 'consultant': return CONSULTANT_BARKS;
    case 'shadowit': return SHADOWIT_BARKS;
    case 'vendor': return VENDOR_BARKS;
    case 'chatbot': return CHATBOT_BARKS;
    default: return USER_BARKS;
  }
}

const SILENT: readonly ActorKind[] = ['reply', 'jam', 'mosquito', 'turret'];

/** Consultants cover everyone near them. Computed once a frame by the game. */
/**
 * Trouble on the floor: anyone hostile except Facilities' training dummy,
 * which takes hits like a hostile but is not one for anything that counts
 * them (the spawn cap, sneaking practice, a consultant's shield).
 */
export function isFoe(a: Actor): boolean {
  return a.hostile && a.kind !== 'dummy';
}

/** Somebody the player's own swings and shots land on: anyone hostile, and a hub colleague (which is a crime). */
export function hittable(a: Actor): boolean {
  return a.hostile || a.colleague;
}

/**
 * A boss nobody may touch yet: before the floor wakes (the induction), one
 * that has not started takes no damage by any road - a hit, a splash,
 * poison - and starts no fight.
 */
export function shrugsOff(ctx: Pick<GameCtx, 'floorAwake'>, a: Actor): boolean {
  return a.kind === 'boss' && !a.bossActive && !ctx.floorAwake;
}

/**
 * Allies (the IT crowd, clones, Musti, their shots) leave alone: the dummy
 * always (it is the player's lesson, and a guard's stuns would stop it ever
 * swinging), and while the floor sleeps anyone who has not come after you.
 */
export function allyIgnores(ctx: Pick<GameCtx, 'floorAwake'>, o: Actor): boolean {
  return o.kind === 'dummy' || (!ctx.floorAwake && !o.aggro);
}

/** Does something summoned now (a breach's manager, a nap's visitor, a manager's reinforcements) arrive already after you? Not while the floor sleeps. */
export function spawnsAggro(ctx: Pick<GameCtx, 'floorAwake'>): boolean {
  return ctx.floorAwake;
}

export function updateAuras(actors: readonly Actor[]): void {
  const consultants = actors.filter((c) => c.kind === 'consultant' && !c.resolved);
  for (const a of actors) {
    a.shielded = false;
    if (!isFoe(a) || a.resolved || a.kind === 'consultant' || a.kind === 'boss') continue;
    for (const c of consultants) {
      if (Math.hypot(c.pos.x - a.pos.x, c.pos.z - a.pos.z) < AURA_RADIUS) {
        a.shielded = true;
        break;
      }
    }
  }
}

function startBoss(ctx: GameCtx, a: Actor): void {
  if (a.bossActive) return;
  a.aggro = true;
  a.bossActive = true;
  a.docile = false;
  if (a.boss !== null) say(a, a.boss.intro, 5, '#fff', 'rgba(120,0,0,0.92)');
  ctx.bossStart(a);
}

function updateHostile(ctx: GameCtx, a: Actor, dt: number): void {
  const dx = ctx.playerPos.x - a.pos.x;
  const dz = ctx.playerPos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const lv = ctx.level;
  const sees = !ctx.invisible && dist < 30 && lineOfSight(lv, a.pos.x, a.pos.z, ctx.playerPos.x, ctx.playerPos.z);

  // Invisible: everyone loses track of you unless you are standing on them.
  if (ctx.invisible && a.aggro && a.kind !== 'boss' && dist > 1.5) {
    a.aggro = false;
    cancelWindup(a);
  }

  if (!a.aggro) {
    // On a mission the watch decides who notices you, and how (stealth.ts).
    const act = a.kind === 'boss' || a.kind === 'dummy' ? null : ctx.watch?.look(a, dt, sees, dist) ?? null;
    if (act !== null && act.kind === 'move') {
      cancelWindup(a);
      moveActor(ctx, a, act.dx, act.dz, act.speed, dt);
      if (act.yaw !== null) turnTo(a, act.yaw, dt);
      return;
    }
    if (act !== null && act.kind === 'alert') {
      a.aggro = true;
      a.docile = false;
      // Alert comes a beat before the first wind-up: the cooldown gates every attack.
      a.cooldown = Math.max(a.cooldown, act.pause);
      ctx.noticed(a);
    } else if (act !== null && act.kind === 'wander') {
      // Calm on a mission: being in view is the watch's business, not a reason to fight.
    } else if (a.kind === 'boss') {
      const cx = toCell(ctx.playerPos.x);
      const cz = toCell(ctx.playerPos.z);
      if (!ctx.invisible && ctx.floorAwake && lv.roomOf[cz * lv.w + cx] === a.room) {
        if (a.docile) {
          if (a.memo.parley !== true) {
            a.memo.parley = true;
            ctx.bossParley(a);
          }
          if (dist < 12) a.yaw = Math.atan2(dx, dz);
        } else {
          startBoss(ctx, a);
        }
      }
    } else if (sees && dist < aggroRange(ctx, a) && !a.docile && ctx.floorAwake) {
      a.aggro = true;
      ctx.noticed(a);
      if (!SILENT.includes(a.kind)) say(a, a.elite !== null ? fx.pick(ELITE_LINES) : fx.pick(barksFor(a)), 2.5);
    } else if (a.docile && sees && dist < 5) {
      a.barkIn -= dt;
      if (a.barkIn <= 0) {
        a.barkIn = 12;
        say(a, fx.pick(['Oh, it\'s you! No rush, I\'ll raise a ticket.', 'Morning! Love your work.', 'You fixed my VPN once. Legend.']), 3);
      }
      a.yaw = Math.atan2(dx, dz);
    }
    if (!a.aggro) {
      // Nobody after you: whatever was winding up is off.
      cancelWindup(a);
      if (a.kind === 'turret' || a.kind === 'boss') {
        moveActor(ctx, a, 0, 0, 0, dt);
        return;
      }
      if (a.wanderTarget === null || fx.chance(dt * 0.2)) {
        a.wanderTarget = new THREE.Vector3(a.pos.x + fx.range(-3, 3), 0, a.pos.z + fx.range(-3, 3));
      }
      tmp.subVectors(a.wanderTarget, a.pos);
      if (tmp.length() > 0.3) moveActor(ctx, a, tmp.x, tmp.z, a.speed * 0.3, dt);
      else moveActor(ctx, a, 0, 0, 0, dt);
      return;
    }
  }

  if (a.kind === 'boss') {
    updateBoss(ctx, a, dt, dist, sees, dx, dz);
    return;
  }

  a.cooldown -= dt;
  a.barkIn -= dt;
  if (a.barkIn <= 0 && dist < 12 && !SILENT.includes(a.kind)) {
    a.barkIn = fx.range(7, 14);
    const talker = a.kind === 'user' || a.kind === 'caller' || a.kind === 'customer';
    say(a, talker && fx.chance(0.5) ? `"${ctx.ticketTitle(a)}"` : fx.pick(barksFor(a)), 3);
  }

  // Escalating elites snap at half health, for good.
  if (a.elite === 'escalating' && a.hp < a.maxHp * 0.5 && a.enragedT <= 0) {
    a.enragedT = 999;
    say(a, 'Right. I want to speak to your MANAGER.', 2.5, '#fff', 'rgba(140,20,0,0.92)');
  }

  // Low Staff standing: they come in angrier. An enraged one hits harder still.
  const grudge = 1 + Math.max(0, -ctx.staffStanding) / 200 + (a.enragedT > 0 ? 0.5 : 0);
  const people = a.kind === 'user' || a.kind === 'caller' || a.kind === 'customer' || a.kind === 'vendor';
  const dmg = a.damage * (people ? grudge : 1) * (a.enragedT > 0 && !people ? 1.5 : 1);

  // Summoning runs on its own clock, not on the attack cooldown.
  if (a.kind === 'manager' || a.elite === 'cc') {
    a.summonIn -= dt;
    if (a.summonIn <= 0 && sees && dist < 16) {
      if (a.elite === 'cc') {
        a.summonIn = fx.range(7, 10);
        say(a, 'Adding everyone on this thread.', 2.5);
        for (let i = 0; i < 2; i++) {
          const s = ctx.spawn('reply', a.pos.x + fx.range(-1, 1), a.pos.z + fx.range(-1, 1), a.room);
          if (s !== null) s.aggro = spawnsAggro(ctx);
        }
      } else {
        a.summonIn = fx.range(12, 18);
        say(a, 'I will get someone from my team to raise it with you.', 3);
        const s = ctx.spawn('user', a.pos.x + fx.range(-1, 1), a.pos.z + fx.range(-1, 1), a.room);
        if (s !== null) s.aggro = spawnsAggro(ctx);
      }
    }
  }
  if (a.kind === 'shadowit') {
    a.summonIn -= dt;
    const mine = ctx.actors.filter((t) => t.kind === 'turret' && t.owner === a.id && !t.resolved).length;
    if (a.summonIn <= 0 && sees && dist < 18 && mine < 2) {
      a.summonIn = fx.range(8, 11);
      say(a, 'Hold on, I will just spin up another instance.', 2.5);
      const t = ctx.spawn('turret', a.pos.x + fx.range(-1.2, 1.2), a.pos.z + fx.range(-1.2, 1.2), a.room);
      if (t !== null) {
        t.owner = a.id;
        t.aggro = spawnsAggro(ctx);
      }
    }
    a.blinkIn -= dt;
    if (a.blinkIn <= 0 && (a.hp < a.maxHp || dist < 4)) {
      a.blinkIn = fx.range(4, 6.5);
      blink(ctx, a, 5);
    }
  }

  const keep = a.kind === 'caller' ? 8 : a.kind === 'customer' ? 5 : a.kind === 'manager' ? 5.5 : a.kind === 'jam' ? 6
    : a.kind === 'consultant' ? 7 : a.kind === 'shadowit' ? 9 : a.kind === 'chatbot' ? 8 : 0;
  let mx = 0;
  let mz = 0;
  if (a.kind === 'vendor' && a.fleeT > 0) {
    a.fleeT -= dt;
    mx = -dx;
    mz = -dz;
  } else if (a.kind === 'turret') {
    // Tripods do not walk.
  } else if (sees && dist < 20) {
    if (keep > 0 && dist < keep - 1.5) {
      mx = -dx;
      mz = -dz;
    } else if (dist > keep + 0.5) {
      if (approach(ctx, a, dx, dz, tmp2)) {
        mx = tmp2.x;
        mz = tmp2.z;
      }
    } else if (keep > 0) {
      mx = -dz * (a.id % 2 === 0 ? 1 : -1);
      mz = dx * (a.id % 2 === 0 ? 1 : -1);
    }
  } else if (navDir(ctx, a, tmp2)) {
    mx = tmp2.x;
    mz = tmp2.z;
  }
  if (a.kind !== 'turret') {
    for (const o of ctx.actors) {
      if (o === a || o.resolved) continue;
      const sx = a.pos.x - o.pos.x;
      const sz = a.pos.z - o.pos.z;
      const d2 = sx * sx + sz * sz;
      const min = a.radius + o.radius + 0.2;
      if (d2 < min * min && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        mx += (sx / d) * 2;
        mz += (sz / d) * 2;
      }
    }
  }
  let speed = a.speed * (a.enragedT > 0 ? 1.3 : 1);
  if (a.kind === 'user' && dist < 1.8) speed = 0;
  if ((a.kind === 'reply' || a.kind === 'mosquito') && dist < 0.9) speed = 0;
  if (a.kind === 'vendor' && a.fleeT <= 0 && dist < 1.2) speed = 0;
  // Winding up, they plant their feet: that is what makes it something you can step out of.
  if (a.pending !== null) speed = 0;
  moveActor(ctx, a, mx, mz, speed, dt);
  const committed = a.pending !== null && ATTACKS[a.pending].cls !== 'ranged';
  if (committed) a.yaw = Math.atan2(a.aim.x, a.aim.z);
  else if (sees && dist < 20 && !(a.kind === 'vendor' && a.fleeT > 0)) a.yaw = Math.atan2(dx, dz);

  // An attack on its way lands (or does not) when the wind-up runs out.
  if (a.pending !== null) {
    const id = tickWindup(a, dt);
    if (id !== null) strikeGrunt(ctx, a, id, sees, dmg);
    return;
  }
  // The cooldown runs from the start of a wind-up, so the pace of attacks is what it always was.
  if (a.cooldown > 0) return;
  const rate = a.elite === 'relentless' ? 0.8 : 1;
  // Low Management standing: managers send invites more often.
  const mgmtRate = 1 + Math.max(0, -ctx.managementStanding) / 100;
  switch (a.kind) {
    case 'user':
      if (dist < 2.0) {
        a.cooldown = 1.2 * rate;
        windUp(ctx, a, 'user.melee', dx, dz);
      }
      break;
    case 'reply':
      if (dist < 1.1) {
        a.cooldown = 0.9;
        windUp(ctx, a, 'reply.dive', dx, dz);
      }
      break;
    case 'mosquito':
      if (dist < 1.1) {
        a.cooldown = 1.1;
        windUp(ctx, a, 'mosquito.bite', dx, dz);
      }
      break;
    case 'caller':
      if (sees && dist < 18) {
        a.cooldown = fx.range(1.8, 2.8) * rate;
        windUp(ctx, a, 'caller.throw', dx, dz);
      }
      break;
    case 'customer':
      // Up close they shove you; further off they throw their gold tickets.
      if (dist < 2) {
        a.cooldown = 1.5 * rate;
        windUp(ctx, a, 'customer.shove', dx, dz);
      } else if (sees && dist < 16) {
        a.cooldown = fx.range(2.0, 3.0) * rate;
        windUp(ctx, a, 'customer.throw', dx, dz);
      }
      break;
    case 'jam':
      if (sees && dist < 14) {
        a.cooldown = 1.9 * rate;
        windUp(ctx, a, 'jam.volley', dx, dz);
      }
      break;
    case 'manager':
      if (dist < 2.2) {
        a.cooldown = (2.5 / mgmtRate) * rate;
        say(a, 'Can you take an action item on that?', 2.5);
        windUp(ctx, a, 'manager.melee', dx, dz);
      } else if (sees && dist < 15) {
        a.cooldown = (fx.range(2.8, 4.0) / mgmtRate) * rate;
        windUp(ctx, a, 'manager.invite', dx, dz);
      }
      break;
    case 'consultant':
      if (sees && dist < 16) {
        a.cooldown = fx.range(2.6, 3.4) * rate;
        windUp(ctx, a, 'consultant.deck', dx, dz);
      }
      break;
    case 'shadowit':
      if (sees && dist < 17) {
        a.cooldown = fx.range(1.6, 2.4) * rate;
        windUp(ctx, a, 'shadowit.code', dx, dz);
      }
      break;
    case 'turret':
      if (sees && dist < 16) {
        a.cooldown = 1.2;
        windUp(ctx, a, 'turret.code', dx, dz);
      }
      break;
    case 'chatbot':
      if (sees && dist < 15) {
        a.cooldown = fx.range(2.2, 3.0) * rate;
        windUp(ctx, a, 'chatbot.chat', dx, dz);
      }
      break;
    case 'vendor':
      if (a.fleeT <= 0 && dist < 1.5) {
        a.cooldown = 2 * rate;
        windUp(ctx, a, 'vendor.grab', dx, dz);
      }
      break;
    default:
      break;
  }
}

/**
 * The tell: the attack is chosen and the way it will go is fixed; the arm
 * (or the body) draws back, a warm glow, and a short rising sound.
 */
function windUp(ctx: GameCtx, a: Actor, id: AttackId, dx: number, dz: number): void {
  beginWindup(a, id);
  a.memo.flinched = false;
  const len = Math.hypot(dx, dz);
  if (len > 1e-4) a.aim.set(dx / len, 0, dz / len);
  else a.aim.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
  a.attackAnim = 0;
  ctx.windupCue(a, ATTACKS[id].windup);
}

/** Did a melee or contact strike reach the player, from where they stand now? */
function lands(ctx: GameCtx, a: Actor, id: AttackId): boolean {
  return strikeLands(ATTACKS[id], a.pos.x, a.pos.z, a.aim.x, a.aim.z, ctx.playerPos.x, ctx.playerPos.z)
    && lineOfSight(ctx.level, a.pos.x, a.pos.z, ctx.playerPos.x, ctx.playerPos.z);
}

/**
 * The strike, when the wind-up runs out. Melee and contact attacks hit only
 * if you are still where they aimed; throws go at where you are now, and
 * only if they can still see you.
 */
function strikeGrunt(ctx: GameCtx, a: Actor, id: AttackId, sees: boolean, dmg: number): void {
  a.attackAnim = 1;
  switch (id) {
    case 'user.melee':
      if (lands(ctx, a, id)) {
        ctx.hurtPlayer(dmg, a, 'melee');
        if (fx.chance(0.25)) ctx.enqueueTicket(a, false);
      }
      break;
    case 'reply.dive':
      // The lunge: it throws itself at you whether it connects or not.
      a.push.addScaledVector(a.aim, 7);
      if (lands(ctx, a, id)) {
        // It delivers itself and is gone. That is not you resolving it.
        a.cooldown = 99;
        ctx.hurtPlayer(dmg, a, 'melee');
        a.resolved = true;
        a.expired = true;
        a.removeIn = 0.3;
        ctx.markResolved(a);
      }
      break;
    case 'mosquito.bite':
      a.push.addScaledVector(a.aim, 5);
      if (lands(ctx, a, id)) ctx.hurtPlayer(dmg, a, 'bite');
      break;
    case 'customer.shove':
      a.push.addScaledVector(a.aim, 4);
      if (lands(ctx, a, id)) ctx.hurtPlayer(dmg * 0.6, a, 'melee');
      break;
    case 'manager.melee':
      if (lands(ctx, a, id)) {
        ctx.addActionItem(a.name);
        ctx.hurtPlayer(dmg, a, 'melee');
      }
      break;
    case 'vendor.grab':
      a.push.addScaledVector(a.aim, 5);
      if (lands(ctx, a, id)) {
        const took = ctx.stealRep(a, Math.round((15 + ctx.floor * 6) * (a.elite === 'vip' ? 2 : 1)));
        a.stolen += took;
        ctx.hurtPlayer(dmg, a, 'melee');
        say(a, took > 0 ? `Thanks! That is ₡${took} for the "discovery workshop".` : 'No budget? I will come back next quarter.', 2.5);
        a.fleeT = 5;
      }
      break;
    case 'caller.throw':
      if (sees) throwAt(ctx, a, 'ticket', 11, dmg);
      break;
    case 'customer.throw':
      if (sees) throwAt(ctx, a, 'gold', 12, dmg);
      break;
    case 'jam.volley':
      if (sees) for (const s of [-0.25, 0, 0.25]) throwAt(ctx, a, 'paper', 10, dmg, s, false);
      break;
    case 'manager.invite':
      if (sees) throwAt(ctx, a, 'invite', 9, dmg);
      break;
    case 'consultant.deck':
      if (sees) throwAt(ctx, a, 'deck', 8, dmg * 1.3);
      break;
    case 'shadowit.code':
      if (sees) for (const s of [-0.12, 0.12]) throwAt(ctx, a, 'code', 14, dmg * 0.8, s);
      break;
    case 'turret.code':
      if (sees) throwAt(ctx, a, 'code', 15, dmg);
      break;
    case 'chatbot.chat':
      if (sees) {
        throwAt(ctx, a, 'chat', 7, dmg);
        if (fx.chance(0.3)) say(a, fx.pick(CHATBOT_BARKS), 2.5, '#002244', 'rgba(210,235,255,0.95)');
      }
      break;
    default:
      break;
  }
}

/** Shadow IT's trick: vanish and reappear somewhere nearby on the same floor. */
function blink(ctx: GameCtx, a: Actor, radius: number): void {
  const lv = ctx.level;
  for (let t = 0; t < 20; t++) {
    const x = a.pos.x + fx.range(-radius, radius);
    const z = a.pos.z + fx.range(-radius, radius);
    const cx = toCell(x);
    const cz = toCell(z);
    if (cx < 0 || cz < 0 || cx >= lv.w || cz >= lv.h) continue;
    const i = cz * lv.w + cx;
    if (lv.solid[i] !== 0 || lv.floor[i] !== 1 || (ctx.field[i] ?? -1) < 0) continue;
    if (Math.hypot(x - ctx.playerPos.x, z - ctx.playerPos.z) < 4) continue;
    ctx.floatText(new THREE.Vector3(a.pos.x, 1.6, a.pos.z), '*poof*', '#c39bd3');
    a.pos.set(x, 0, z);
    collideCircle(lv, a.pos, a.radius);
    return;
  }
}

function updateBoss(ctx: GameCtx, a: Actor, dt: number, dist: number, sees: boolean, dx: number, dz: number): void {
  const boss = a.boss;
  if (boss === null) return;
  if (!a.bossActive) startBoss(ctx, a);
  // The leash: get out of their room and stay well clear, and a boss gives up the chase.
  // The damage you did stays done, so backing off to heal is a real option.
  const lv = ctx.level;
  const inRoom = lv.roomOf[toCell(ctx.playerPos.z) * lv.w + toCell(ctx.playerPos.x)] === a.room;
  a.leashT = !inRoom && dist > 12 ? a.leashT + dt : 0;
  if (a.leashT > 6) {
    a.leashT = 0;
    a.aggro = false;
    a.bossActive = false;
    a.charging = 0;
    cancelWindup(a);
    a.pos.copy(a.home);
    say(a, 'We will pick this up in my office.', 3);
    ctx.bossLeash(a);
    return;
  }
  // Phase two at half health: a line, a shake, and the floor turns against you.
  if (a.phase === 1 && a.hp < a.maxHp * 0.5) {
    a.phase = 2;
    say(a, boss.phase2, 4, '#fff', 'rgba(140,0,0,0.95)');
    ctx.shake(0.8);
    ctx.floatText(new THREE.Vector3(a.pos.x, 5, a.pos.z), 'PHASE 2', '#ff5050');
    a.patternIn = 0.8;
  }
  const enraged = a.phase === 2;
  // Every finding the Auditor holds against you makes the audit worse.
  const audit = boss.name === 'The Auditor' ? 1 + ctx.findings * 0.2 : 1;
  const rate = (enraged ? 1.5 : 1) * audit;

  if (a.charging > 0) {
    a.charging -= dt;
    const start = a.pos.clone();
    moveActor(ctx, a, a.chargeDir.x, a.chargeDir.z, 13, dt);
    new THREE.Line3(start, a.pos).closestPointToPoint(ctx.playerPos, true, tmp2);
    if (Math.hypot(ctx.playerPos.x - tmp2.x, ctx.playerPos.z - tmp2.z) < a.radius + 0.45) {
      ctx.hurtPlayer(a.damage * 1.4, a, 'boss');
      ctx.shake(0.6);
      a.charging = 0;
    }
    return;
  }

  // Winding up: planted, facing the way it committed to, until the strike.
  // The slam's cooldown keeps running (contact hits come as often as they
  // did); the pattern clock waits, so the next pattern comes as long after
  // this one's strike as patterns always came after each other, and a
  // wind-up only ever adds warning.
  if (a.pending !== null) {
    moveActor(ctx, a, 0, 0, 0, dt);
    a.yaw = a.pending === 'boss.slam' || a.pending === 'boss.charge' ? Math.atan2(a.aim.x, a.aim.z) : Math.atan2(dx, dz);
    a.cooldown -= dt;
    const id = tickWindup(a, dt);
    if (id !== null) strikeBoss(ctx, a, id, dist);
    return;
  }

  const want = 6;
  let mx = 0;
  let mz = 0;
  if (sees) {
    if (dist > want + 1) {
      if (approach(ctx, a, dx, dz, tmp2)) {
        mx = tmp2.x;
        mz = tmp2.z;
      }
    } else if (dist < want - 1) {
      mx = -dx;
      mz = -dz;
    } else {
      mx = -dz;
      mz = dx;
    }
  } else if (navDir(ctx, a, tmp2)) {
    mx = tmp2.x;
    mz = tmp2.z;
  }
  moveActor(ctx, a, mx, mz, a.speed * rate, dt);
  a.yaw = Math.atan2(dx, dz);
  a.cooldown -= dt;
  if (dist < 2.4 && a.cooldown <= 0) {
    a.cooldown = 1;
    windUp(ctx, a, 'boss.slam', dx, dz);
    return;
  }

  a.patternIn -= dt * rate;
  if (a.patternIn > 0) return;
  // In phase two every other pattern is a hazard volley.
  let pattern: BossPattern = enraged && a.patternIdx % 2 === 1 ? 'hazards' : boss.patterns[a.patternIdx % boss.patterns.length] ?? 'invites';
  // Nobody summons a second wave while the first is still standing: the adds are capped.
  if (pattern.startsWith('summon') || pattern === 'allHands') {
    const adds = ctx.actors.filter((x) => x.owner === a.id && !x.resolved).length;
    if (adds >= 3 + ctx.floor) pattern = 'invites';
  }
  a.patternIdx++;
  a.patternIn = 3.2;
  // The line is the tell: said as the boss winds up, before anything leaves its hands.
  switch (pattern) {
    case 'invites': say(a, 'I have sent you a few invites.', 2); break;
    case 'summonUsers': say(a, 'Team! Everyone raise your issues with IT. Now.', 3); break;
    case 'summonCustomers': say(a, 'I have brought some of our key accounts.', 3); break;
    case 'summonReply': say(a, 'I have CCd everyone.', 2); break;
    case 'summonManagers':
      say(a, ctx.findings > 0 ? `I have ${ctx.findings} finding${ctx.findings > 1 ? 's' : ''} to discuss with your managers.` : 'I will need to speak to your line managers.', 3);
      break;
    case 'allHands': say(a, 'ALL HANDS MEETING. Attendance is mandatory.', 3, '#fff', 'rgba(120,0,0,0.92)'); break;
    case 'charge': say(a, 'Let us have a QUICK sync!', 1.5); break;
    case 'goldSpiral': say(a, 'Everything is a P1!', 2); break;
    case 'shockwave': say(a, 'I would like to ESCALATE this.', 2); break;
    case 'poBombs': say(a, 'Raise a PO for that. And that.', 2); break;
    case 'freeze': say(a, 'BUDGET FREEZE. Nobody moves until Q3.', 2.5, '#fff', 'rgba(20,60,140,0.92)'); break;
    case 'lasers': {
      say(a, 'Finding. Finding. Finding.', 2);
      a.patternIn = enraged ? 1.4 : 2.2;
      a.patternAng = ctx.time * 0.7;
      markLasers(ctx, a);
      break;
    }
    case 'teleport': say(a, 'Golden parachute!', 1.5); break;
    case 'hazards': {
      const lines: Record<HazardKind, string> = {
        meeting: 'Recurring invite: "Quick catch-up". Accept all.',
        fire: 'Everything is ON FIRE and it is YOUR fault.',
        freeze: 'Frozen. Pending approval.',
        coffee: 'Who spilled the executive espresso? YOU did.',
      };
      say(a, lines[boss.hazard], 2.5, '#fff', 'rgba(120,0,0,0.92)');
      a.patternIn = 2.4;
      break;
    }
  }
  windUp(ctx, a, `boss.${pattern}`, dx, dz);
}

/** The spokes the lasers will run along, marked on the carpet for the wind-up. */
function markLasers(ctx: GameCtx, a: Actor): void {
  const n = laserCount(ctx);
  for (let k = 0; k < n; k++) {
    ctx.telegraph({ x: a.pos.x, z: a.pos.z, radius: 0.12, seconds: ATTACKS['boss.lasers'].windup, beam: { angle: (k / n) * Math.PI * 2 + a.patternAng, length: 12 } });
  }
}

/** The Auditor's lasers: more of them for every finding against you. */
function laserCount(ctx: GameCtx): number {
  return 8 + Math.min(8, ctx.findings * 2);
}

/**
 * A lob that comes down on (tx, tz) after `t` seconds, from `from`, under
 * `gravity`: the launch velocity, so the landing marker is where it lands.
 */
export function lobVelocity(from: THREE.Vector3, tx: number, tz: number, gravity: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set((tx - from.x) / t, (0.5 * gravity * t * t - from.y) / t, (tz - from.z) / t);
}

/** A boss's strike, when its wind-up runs out: aimed at where you are now. */
function strikeBoss(ctx: GameCtx, a: Actor, id: AttackId, dist: number): void {
  const boss = a.boss;
  if (boss === null) return;
  a.attackAnim = 1;
  if (id === 'boss.slam') {
    if (lands(ctx, a, id)) {
      ctx.hurtPlayer(a.damage, a, 'boss');
      ctx.shake(0.3);
    }
    return;
  }
  const pattern = patternOf(id);
  if (pattern === null) return;
  const f = ctx.floor;
  const d = ctx.difficulty;
  switch (pattern) {
    case 'invites':
      for (let i = -2; i <= 2; i++) throwAt(ctx, a, 'invite', 10, (6 + f) * d, i * 0.18, false);
      break;
    case 'summonUsers':
      for (let i = 0; i < 2 + f; i++) summon(ctx, a, i % 2 === 0 ? 'user' : 'caller', 2);
      break;
    case 'summonCustomers':
      for (let i = 0; i < 2 + Math.floor(f / 2); i++) summon(ctx, a, 'customer', 2);
      break;
    case 'summonReply':
      for (let i = 0; i < 6 + f; i++) summon(ctx, a, 'reply', 2);
      break;
    case 'summonManagers':
      for (let i = 0; i < 2 + Math.min(3, ctx.findings); i++) summon(ctx, a, i === 0 ? 'consultant' : 'manager', 2);
      break;
    case 'allHands':
      for (const k of ['user', 'caller', 'customer', 'manager', 'reply', 'reply', 'vendor'] as const) summon(ctx, a, k, 3);
      break;
    case 'charge':
      // Off it goes, the way it faced while it crouched: step out of the line.
      a.chargeDir.copy(a.aim);
      a.charging = 0.9;
      break;
    case 'goldSpiral':
      for (let k = 0; k < 3; k++) ring(ctx, a, 'gold', 10, 8, (8 + f * 2) * d, k * 0.2 + ctx.time);
      break;
    case 'shockwave':
      ctx.shake(0.4);
      ring(ctx, a, 'ring', 18, 9, (10 + f * 2) * d);
      break;
    case 'poBombs': {
      // Each one's landing spot is marked on the carpet for the whole of its flight.
      for (let i = 0; i < 3 + Math.floor(f / 2); i++) {
        const from = a.pos.clone();
        from.y = 2;
        const tx = ctx.playerPos.x + fx.range(-3, 3);
        const tz = ctx.playerPos.z + fx.range(-3, 3);
        const t = Math.max(0.9, Math.min(1.6, 0.9 + Math.hypot(tx - from.x, tz - from.z) * 0.05));
        const vel = lobVelocity(from, tx, tz, 14, t, new THREE.Vector3());
        const speed = vel.length();
        ctx.telegraph({ x: tx, z: tz, radius: 2.5, seconds: t });
        ctx.fire({ kind: 'po', from, dir: vel.divideScalar(speed), speed, damage: (12 + f * 2) * d, hostile: true, owner: a, gravity: 14, splash: 2.5 });
      }
      break;
    }
    case 'freeze':
      if (dist < 12 && lineOfSight(ctx.level, a.pos.x, a.pos.z, ctx.playerPos.x, ctx.playerPos.z)) ctx.rootPlayer(1.6, 'Budget freeze');
      ring(ctx, a, 'invite', 12, 7, (6 + f) * d);
      break;
    case 'lasers': {
      const n = laserCount(ctx);
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + a.patternAng;
        const from = a.pos.clone();
        from.y = 1.2;
        ctx.fire({ kind: 'laser', from, dir: new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), speed: 22, damage: (12 + f * 2) * d, hostile: true, owner: a, ttl: 2 });
      }
      break;
    }
    case 'teleport': {
      const lv = ctx.level;
      const room = lv.rooms[a.room];
      if (room !== undefined) {
        for (let t = 0; t < 20; t++) {
          const x = (room.x + 1 + fx.int(0, room.w - 3)) * TILE + TILE / 2;
          const z = (room.y + 1 + fx.int(0, room.h - 3)) * TILE + TILE / 2;
          if (lv.solid[toCell(z) * lv.w + toCell(x)] === 0 && Math.hypot(x - ctx.playerPos.x, z - ctx.playerPos.z) > 5) {
            a.pos.set(x, 0, z);
            break;
          }
        }
      }
      ring(ctx, a, 'gold', 8, 7, (8 + f) * d);
      break;
    }
    case 'hazards': {
      // One on you, the rest around you: keep moving.
      ctx.hazard(ctx.playerPos.x, ctx.playerPos.z, 2.2, 7, boss.hazard);
      for (let i = 0; i < 2 + Math.min(3, Math.floor(f / 2)); i++) {
        const ang = fx.range(0, Math.PI * 2);
        const r = fx.range(3, 6);
        ctx.hazard(ctx.playerPos.x + Math.sin(ang) * r, ctx.playerPos.z + Math.cos(ang) * r, 2, 7, boss.hazard);
      }
      break;
    }
  }
}

function nearestHostile(ctx: GameCtx, a: Actor, range: number): Actor | null {
  let best: Actor | null = null;
  let bestD = range;
  for (const o of ctx.actors) {
    if (!o.hostile || o.resolved || (o.docile && !o.aggro) || allyIgnores(ctx, o)) continue;
    // Helpers never start a boss fight you have not started yourself.
    if (o.kind === 'boss' && !o.bossActive) continue;
    const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
    if (d < bestD && lineOfSight(ctx.level, a.pos.x, a.pos.z, o.pos.x, o.pos.z)) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

const ALLY_BUBBLE: [string, string] = ['#003040', 'rgba(220,250,255,0.95)'];

/** Follow the player: straight when you can, by the flow field when you cannot. */
function follow(ctx: GameCtx, a: Actor, dx: number, dz: number, dist: number, stopAt: number, dt: number): void {
  if (dist > stopAt) {
    if (approach(ctx, a, dx, dz, tmp2)) moveActor(ctx, a, tmp2.x, tmp2.z, a.speed * (dist > 8 ? 1.6 : 1), dt);
    else moveActor(ctx, a, 0, 0, 0, dt);
  } else {
    moveActor(ctx, a, 0, 0, 0, dt);
  }
  if (dist > 30) a.pos.set(ctx.playerPos.x + 1, 0, ctx.playerPos.z + 1);
}

/** How near the player has to stand before the dummy starts a swing. Its reach is a little more, as for everyone. */
const DUMMY_RANGE = 2.2;

/**
 * The induction's training dummy. It never walks and never notices anyone
 * by itself: it swings only while it is set on the player (`aggro`, which the
 * induction's block and parry steps turn on), and then exactly as everyone
 * else does - a wind-up with the warm glow and the rising sound, and a strike
 * decided from where the player is when it lands - so what it teaches is
 * what the floor does.
 */
function updateDummy(ctx: GameCtx, a: Actor, dt: number): void {
  const dx = ctx.playerPos.x - a.pos.x;
  const dz = ctx.playerPos.z - a.pos.z;
  if (a.pending !== null) {
    const id = tickWindup(a, dt);
    if (id !== null) {
      a.attackAnim = 1;
      if (lands(ctx, a, id)) ctx.hurtPlayer(a.damage, a, 'melee');
    }
    return;
  }
  if (!a.aggro) return;
  a.yaw = Math.atan2(dx, dz);
  a.cooldown -= dt;
  if (a.cooldown <= 0 && Math.hypot(dx, dz) < DUMMY_RANGE) {
    // Time to read the swing, lower the guard and try again before the next.
    a.cooldown = 2.4;
    windUp(ctx, a, 'dummy.swing', dx, dz);
  }
}

/** How close a walk-up comes before stopping to talk: well inside the hub's reach (hub.ts REACHED_DIST, 1.8 m). */
export const WALKUP_STOP = 1.3;

/**
 * A colleague on the hub who is not after you: at their desk most of the
 * time, a few steps away and back now and then, and - walking up to you with
 * a problem - coming over and waiting to be talked to.
 */
function updateColleague(ctx: GameCtx, a: Actor, dt: number): void {
  const dx = ctx.playerPos.x - a.pos.x;
  const dz = ctx.playerPos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  cancelWindup(a);
  if (ctx.hub?.seeks(a) === true) {
    // Right up to your side (inside the hub's 1.8 m "reached"), where they can say it to your face.
    if (dist > WALKUP_STOP && approach(ctx, a, dx, dz, tmp2)) moveActor(ctx, a, tmp2.x, tmp2.z, a.speed * 0.8, dt);
    else moveActor(ctx, a, 0, 0, 0, dt);
    if (dist < 12) a.yaw = Math.atan2(dx, dz);
    return;
  }
  if (a.wanderTarget === null || fx.chance(dt * 0.05)) {
    a.wanderTarget = fx.chance(0.6) ? a.home.clone() : new THREE.Vector3(a.home.x + fx.range(-3, 3), 0, a.home.z + fx.range(-3, 3));
  }
  tmp.subVectors(a.wanderTarget, a.pos);
  moveActor(ctx, a, tmp.x, tmp.z, tmp.length() > 0.3 ? a.speed * 0.35 : 0, dt);
}

function updateFriendly(ctx: GameCtx, a: Actor, dt: number): void {
  const dx = ctx.playerPos.x - a.pos.x;
  const dz = ctx.playerPos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);

  if (a.kind === 'healer') {
    a.healIn -= dt;
    const kitchen = ctx.kitchenStanding();
    if (dist < 6 && a.healIn <= 0 && kitchen > -40 && lineOfSight(ctx.level, a.pos.x, a.pos.z, ctx.playerPos.x, ctx.playerPos.z)) {
      a.healIn = 6 / ctx.healerFrequency();
      say(a, fx.pick(HEALER_BARKS), 3, '#5a0040', 'rgba(255,230,245,0.95)');
      ctx.healPlayer(14 * (1 + kitchen / 150), a.name);
    }
    if (dist < 10 && dist > 2.5 && kitchen > -40 && approach(ctx, a, dx, dz, tmp2)) {
      moveActor(ctx, a, tmp2.x, tmp2.z, a.speed, dt);
    } else {
      if (a.wanderTarget === null || fx.chance(dt * 0.25)) {
        a.wanderTarget = new THREE.Vector3(a.pos.x + fx.range(-3, 3), 0, a.pos.z + fx.range(-3, 3));
      }
      tmp.subVectors(a.wanderTarget, a.pos);
      moveActor(ctx, a, tmp.x, tmp.z, tmp.length() > 0.3 ? a.speed * 0.6 : 0, dt);
    }
    if (dist < 6) a.yaw = Math.atan2(dx, dz);
    return;
  }

  if (a.kind === 'npc' || a.kind === 'tonttu') {
    moveActor(ctx, a, 0, 0, 0, dt);
    if (dist < 9) a.yaw = Math.atan2(dx, dz);
    return;
  }

  if (!a.recruited) {
    // Stuck on something: they come and find you, busy or not.
    if (a.memo.seeking === true && dist > 2.4 && dist < 40 && approach(ctx, a, dx, dz, tmp2)) {
      moveActor(ctx, a, tmp2.x, tmp2.z, a.speed * 0.8, dt);
      a.yaw = Math.atan2(dx, dz);
      return;
    }
    a.barkIn -= dt;
    if (dist < 5 && a.barkIn <= 0 && a.npcId === null && a.memo.seeking !== true) {
      a.barkIn = 8;
      say(a, a.role === 'intern' ? 'Is there anything I can do? Please?' : a.role === 'security' ? 'Need a hand? Press E.' : 'Need backup? Press E.', 3, ...ALLY_BUBBLE);
    }
    moveActor(ctx, a, 0, 0, 0, dt);
    if (dist < 8) a.yaw = Math.atan2(dx, dz);
    return;
  }

  a.cooldown -= dt;
  if (a.role === 'dog') {
    updateDog(ctx, a, dt, dx, dz, dist);
    return;
  }
  follow(ctx, a, dx, dz, dist, 3, dt);
  const target = a.npcId === 'josh' ? null : nearestHostile(ctx, a, 14);
  if (target !== null) {
    a.yaw = Math.atan2(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
    if (a.cooldown <= 0) {
      const from = a.pos.clone();
      from.y = 1.4 * (a.rig?.root.scale.y ?? 1);
      const to = target.pos.clone();
      to.y = 1.2;
      const dir = to.sub(from).normalize();
      const scale = ctx.helperDamageMult(a) * (1 + ctx.floor * 0.3) * ctx.difficulty;
      // Morale and cans: a keen teammate works faster, a flagging one slower.
      const haste = onTeam(a) ? teamPower(a.morale, a.boostT > 0 ? a.boost : 1, a.protege).haste : 1;
      if (a.role === 'sysadmin' || a.role === 'clone') {
        a.cooldown = (a.role === 'clone' ? 0.6 : 1.1) * haste;
        a.attackAnim = 1;
        ctx.fire({ kind: 'rtfm', from, dir, speed: 24, damage: 15 * scale, hostile: false, owner: a });
        if (a.role === 'sysadmin' && fx.chance(0.15)) say(a, fx.pick(HELPER_BARKS), 2, ...ALLY_BUBBLE);
      } else if (a.role === 'security') {
        a.cooldown = 2.2 * haste;
        a.attackAnim = 1;
        ctx.fire({ kind: 'stun', from, dir, speed: 20, damage: 6 * scale, hostile: false, owner: a });
        if (fx.chance(0.2)) say(a, 'Badge, please.', 2, ...ALLY_BUBBLE);
      } else if (a.role === 'spirit') {
        a.cooldown = 0.9;
        a.attackAnim = 1;
        ctx.fire({ kind: 'steam', from, dir, speed: 16, damage: 20 * scale, hostile: false, owner: a, splash: 1.8 });
        if (fx.chance(0.1)) say(a, fx.pick(['Löylyä!', 'Lisää löylyä!', 'Perkele!']), 2, ...ALLY_BUBBLE);
      }
    }
  } else if (dist < 6) {
    a.yaw = Math.atan2(dx, dz);
  }
  if (a.role === 'intern' && a.npcId === null) {
    a.healIn -= dt;
    if (a.healIn <= 0) {
      a.healIn = 30;
      if (fx.chance(0.5)) {
        say(a, 'I got you a coffee! Oat milk, right?', 3, ...ALLY_BUBBLE);
        ctx.giveItem('coffee', 1, a.name);
      } else {
        say(a, 'Found some supplies in the stationery cupboard!', 3, ...ALLY_BUBBLE);
        ctx.giveAmmo();
      }
    }
  }
}

/** One of your team: the IT crowd (not a clone, a spirit, the dog or a quest NPC). */
export function onTeam(a: Actor): boolean {
  return a.kind === 'helper' && a.npcId === null && (a.role === 'sysadmin' || a.role === 'security' || a.role === 'intern');
}

/** Musti: runs down the nearest trouble, bites it, and comes back for praise. */
function updateDog(ctx: GameCtx, a: Actor, dt: number, dx: number, dz: number, dist: number): void {
  const target = dist < 18 ? nearestHostile(ctx, a, 10) : null;
  if (target === null) {
    follow(ctx, a, dx, dz, dist, 2.2, dt);
    if (dist < 5) a.yaw = Math.atan2(dx, dz);
    a.barkIn -= dt;
    if (a.barkIn <= 0 && dist < 6) {
      a.barkIn = fx.range(14, 24);
      say(a, fx.pick(['Hau!', 'Wuf.', '*sniffs your pocket for makkara*', '*wags*']), 2, ...ALLY_BUBBLE);
    }
    return;
  }
  const tx = target.pos.x - a.pos.x;
  const tz = target.pos.z - a.pos.z;
  const td = Math.hypot(tx, tz);
  if (td > target.radius + 0.8) {
    if (walkClear(ctx.level, a.pos.x, a.pos.z, target.pos.x, target.pos.z)) moveActor(ctx, a, tx, tz, a.speed, dt);
    else follow(ctx, a, dx, dz, dist, 2.2, dt);
  } else {
    moveActor(ctx, a, 0, 0, 0, dt);
  }
  a.yaw = Math.atan2(tx, tz);
  if (td < target.radius + 1.1 && a.cooldown <= 0) {
    a.cooldown = 1.0;
    a.attackAnim = 1;
    const scale = ctx.helperDamageMult(a) * (1 + ctx.floor * 0.3) * ctx.difficulty;
    hurtActor(ctx, target, 11 * scale, new THREE.Vector3(tx, 0, tz).normalize().multiplyScalar(2), false);
    // Managers especially hate being barked at: they lose their train of thought.
    if (target.kind === 'manager') target.summonIn += 3;
    if (fx.chance(0.2)) say(a, 'GRRR-WUF!', 1.5, ...ALLY_BUBBLE);
  }
}

/** A boss's add: tagged as theirs, so the next wave waits until this one is dealt with. */
function summon(ctx: GameCtx, boss: Actor, kind: ActorKind, spread: number): void {
  const s = ctx.spawn(kind, boss.pos.x + fx.range(-spread, spread), boss.pos.z + fx.range(-spread, spread), boss.room);
  if (s !== null) s.owner = boss.id;
}

/** A stun at least this long knocks an attack out of someone's hands. */
const STAGGER = 0.5;

/**
 * Stun someone. Bosses take a short stagger at most, then shrug stuns off
 * for a few seconds, so nothing (a security guard, a rubber stamp) can
 * lock one down: a stagger only sets a boss's wind-up back to its start.
 * Anyone else properly staggered mid-wind-up (a shove, a parry, a heavy
 * swing) loses the attack. A flinch shorter than that (or quick hits with a
 * perk would keep everyone from ever finishing one) sets it back to the
 * start: when the flinch is over, the whole tell plays again, so nothing
 * lands a moment after a wind-up you last saw half a second ago.
 */
export function stun(a: Actor, seconds: number): void {
  if (a.kind === 'boss') {
    if (a.stunImmune > 0) return;
    a.stunned = Math.max(a.stunned, Math.min(0.5, seconds));
    a.stunImmune = 6;
  } else {
    if (seconds < STAGGER && a.pending !== null) {
      if (a.memo.flinched === true) return;
      a.memo.flinched = true;
    }
    a.stunned = Math.max(a.stunned, seconds);
    if (seconds >= STAGGER) cancelWindup(a);
  }
  if (a.pending !== null) beginWindup(a, a.pending);
}

/**
 * A wind-up set back by a stun starts over as the stun wears off: aimed at
 * where you are now, with its sound (and a laser volley's marks) again.
 */
function rewind(ctx: GameCtx, a: Actor): void {
  if (a.pending === null) return;
  const dx = ctx.playerPos.x - a.pos.x;
  const dz = ctx.playerPos.z - a.pos.z;
  const len = Math.hypot(dx, dz);
  if (len > 1e-4) a.aim.set(dx / len, 0, dz / len);
  beginWindup(a, a.pending);
  ctx.windupCue(a, a.windupLen);
  if (a.pending === 'boss.lasers') markLasers(ctx, a);
}

export function hurtActor(ctx: GameCtx, a: Actor, dmg: number, knock: THREE.Vector3 | null, player = true): void {
  if (a.resolved) return;
  if (!a.hostile) {
    // A colleague on the hub, hit by the player: the hub hears of it first
    // (they and whoever saw it turn), then the hit lands. Nobody else's hits count.
    if (!player || !a.colleague) return;
    ctx.assault?.(a);
    if (!a.hostile) return;
  }
  // The corner office does not open for a new starter mid-induction: a hit is
  // shrugged off (no damage, no fight) until the floor is awake. Otherwise a
  // stapler at step 3 was a back door into the whole boss fight.
  if (shrugsOff(ctx, a)) {
    if (a.bubble === null) say(a, 'Not now. Finish your induction first.', 2.5);
    return;
  }
  a.hp -= dmg;
  if (player && dmg > 0) ctx.onCombatDamage?.();
  a.flash = 1;
  if (a.kind === 'boss' && !a.bossActive) {
    // Hitting a boss starts the fight properly, wherever you hit it from.
    startBoss(ctx, a);
  } else if (!a.aggro && a.kind !== 'dummy') {
    a.aggro = true;
    ctx.noticed(a);
  }
  a.docile = false;
  if (knock !== null && a.kind !== 'boss' && a.kind !== 'turret' && a.kind !== 'dummy') a.push.add(knock);
  // Facilities want it back in one piece: it is never resolved, only patched up.
  if (a.kind === 'dummy' && a.hp < a.maxHp * 0.25) a.hp = a.maxHp;
  a.hpBar.visible = true;
  a.hpFill.scale.x = Math.max(0.001, a.hp / a.maxHp);
  a.hpFill.position.x = -(1 - a.hpFill.scale.x) / 2;
  ctx.floatText(new THREE.Vector3(a.pos.x, (a.kind === 'boss' ? 4 : 2.2) + fx.range(0, 0.4), a.pos.z), `${Math.round(dmg)}`, a.shielded ? '#8fd0ff' : '#ffe066');
}
