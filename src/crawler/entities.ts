import * as THREE from 'three';
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
import { chatbotMesh, dogMesh, turretMesh } from './meshes';
import { fx, type Rng } from './rng';
import { MORALE_START, teamPower } from './team';
import { disposeSprite, textSprite } from './textures';

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
  | 'tonttu';

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

export type BossPattern =
  | 'invites'
  | 'summonUsers'
  | 'charge'
  | 'goldSpiral'
  | 'shockwave'
  | 'summonCustomers'
  | 'poBombs'
  | 'freeze'
  | 'summonReply'
  | 'lasers'
  | 'summonManagers'
  | 'allHands'
  | 'teleport'
  | 'hazards';

export interface DogParts {
  readonly legs: THREE.Object3D[];
  readonly tail: THREE.Object3D;
  readonly head: THREE.Object3D;
}

export interface Actor {
  readonly id: number;
  readonly kind: ActorKind;
  name: string;
  readonly hostile: boolean;
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
  readonly lastPos: THREE.Vector3;
  /** Who spawned it (turrets belong to a Shadow IT person). */
  owner: number;
  /** Which level spawn this is (-1: summoned), so resolving it survives a reload. */
  spawnIndex: number;
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
  /** 0..1 how hard you are to notice right now (gear, skill, sneaking). */
  readonly stealth: number;
  readonly invisible: boolean;
  readonly staffStanding: number;
  readonly managementStanding: number;
  readonly findings: number;
  field: Int16Array;
  hurtPlayer(amount: number, from: Actor | null, kind: 'melee' | 'ticket' | 'meeting' | 'boss' | 'aura' | 'bite'): void;
  enqueueTicket(from: Actor, gold: boolean): void;
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
  /** A boss open to talks (the Auditor, when you carry the Phoenix file). */
  bossParley(a: Actor): void;
  hazard(x: number, z: number, radius: number, seconds: number, kind: HazardKind): void;
  /** A vendor gets its hand in your pocket. Returns what it took. */
  stealRep(a: Actor, amount: number): number;
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
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), new THREE.MeshLambertMaterial({ color: 0xf4f4f4, emissive: 0x222222 }));
  body.position.y = 1.2;
  g.add(body);
  const flap = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.25, 4), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  flap.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  flap.position.set(0, 1.3, 0.04);
  flap.scale.set(1.2, 0.3, 1);
  g.add(flap);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  for (const x of [-0.12, 0.12]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), eyeMat);
    e.position.set(x, 1.22, 0.05);
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
  const paper = new THREE.MeshLambertMaterial({ color: 0xfafafa });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.1), paper);
    s.position.y = 0.3 + i * 0.22;
    s.rotation.y = (i % 3) * 0.3;
    g.add(s);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
  for (const x of [-0.18, 0.18]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.02), eyeMat);
    e.position.set(x, 1.3, 0.56);
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
  let rig: Rig | null = null;
  let dog: DogParts | null = null;
  const root = new THREE.Group();
  let name = '';
  let hp: number;
  let speed: number;
  let damage = 5;
  let radius = 0.4;
  let rep = 0;
  let boss: BossDef | null = null;
  let role: HelperRole | null = opts.role ?? null;
  let glowBase = 0;
  const hostile = kind !== 'healer' && kind !== 'helper' && kind !== 'npc' && kind !== 'tonttu';

  if (kind === 'reply') {
    root.add(envelopeMesh());
    name = 'RE: RE: RE: FW: All Staff';
  } else if (kind === 'jam') {
    root.add(jamMesh());
    name = 'Paper Jam (Tray 2)';
  } else if (kind === 'mosquito') {
    root.add(mosquitoMesh());
    name = 'Hyttynen';
  } else if (kind === 'chatbot') {
    root.add(chatbotMesh());
    name = r.pick(['HelpBot 3000', 'Clippy (Returns)', 'AskIT Assistant', 'Chatty McChatface']);
  } else if (kind === 'turret') {
    root.add(turretMesh());
    name = 'Unsanctioned Deployment';
  } else if (kind === 'boss') {
    boss = BOSSES[f % BOSSES.length] ?? null;
    if (boss === null) throw new Error('no boss');
    rig = buildRig(boss.outfit);
    root.add(rig.root);
    name = f >= BOSSES.length ? `${boss.name} (Overtime)` : boss.name;
  } else if (kind === 'helper' && role === 'dog') {
    const d = dogMesh();
    root.add(d.root);
    dog = { legs: d.legs, tail: d.tail, head: d.head };
  } else if (kind === 'helper' && (role === 'clone' || role === 'spirit')) {
    rig = buildRig(role === 'spirit' ? outfitFor('tonttu', r) : { skin: 0x9fe0ff, hair: 0x5fb6ff, top: 0x5fb6ff, legs: 0x2a6fb0, face: 'neutral', glasses: true });
    if (role === 'clone') {
      glowBase = 0x113355;
      for (const m of rig.materials) {
        m.transparent = true;
        m.opacity = 0.7;
      }
    }
    root.add(rig.root);
  } else {
    rig = buildRig(outfitFor(kind, r));
    root.add(rig.root);
  }
  if (kind === 'consultant') root.add(auraMesh());

  const diff = ctx.difficulty * (1 + f * 0.12);
  if (kind === 'boss' && boss !== null) {
    const loop = Math.floor(f / BOSSES.length);
    hp = boss.hp * ctx.difficulty * (1 + loop * 0.8);
    speed = 2.6;
    damage = 14 * ctx.difficulty * (1 + loop * 0.5);
    radius = 0.9;
    rep = Math.round((300 + f * 120) * ctx.difficulty);
  } else if (kind === 'healer') {
    const [n, dept] = r.pick(HEALER_NAMES);
    name = `${n} from ${dept}`;
    hp = 1;
    speed = 1.4;
  } else if (kind === 'tonttu') {
    name = 'Saunatonttu';
    hp = 1;
    speed = 1;
  } else if (kind === 'npc') {
    name = opts.npc?.name ?? 'Someone';
    hp = 1;
    speed = 1;
  } else if (kind === 'helper') {
    if (role === null) role = r.pick(['sysadmin', 'sysadmin', 'security', 'intern'] as const);
    name = opts.npc?.name ?? (role === 'sysadmin'
      ? r.pick(['Dave (Senior Sysadmin)', 'Old Bob (Mainframe)', 'Priya (Network Eng.)', 'Mikko (Sysadmin)'])
      : role === 'security' ? r.pick(['Sunil (Security)', 'Bev (Security)'])
        : role === 'clone' ? 'Pat (autoscaled instance)'
          : role === 'spirit' ? 'Saunatonttu (summoned)'
            : role === 'dog' ? 'Musti' : r.pick(['Josh (Intern)', 'Ellie (Intern)', 'Aino (Intern)']));
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

  const staff = opts.staffStanding ?? 0;
  const docile = (kind === 'user' || kind === 'caller') && elite === null && staff > 20 && r.chance((staff - 20) / 120);

  const a: Actor = {
    id: nextActorId++,
    kind, name, hostile, root, rig, dog,
    pos: root.position,
    push: new THREE.Vector3(),
    yaw: r.range(0, Math.PI * 2),
    radius, hp, maxHp: hp, speed, damage,
    cooldown: r.range(0.5, 2),
    aggro: false,
    resolved: false,
    calm: false,
    expired: false,
    removeIn: -1,
    flash: 0,
    attackAnim: 0,
    ticket: r.int(0, ticketCount - 1),
    bubble: null,
    bubbleTime: 0,
    barkIn: r.range(3, 12),
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
    blinkIn: r.range(3, 6),
    fleeT: 0,
    stolen: 0,
    shielded: false,
    stunned: 0,
    stunImmune: 0,
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

export function updateActor(ctx: GameCtx, a: Actor, dt: number): void {
  if (a.flash > 0) {
    a.flash = Math.max(0, a.flash - dt * 4);
    if (a.rig !== null) tintRig(a.rig, a.resolved ? 0x30ff60 : a.poisonT > 0 ? 0x30a030 : 0xff3030, a.flash);
  } else if (a.rig !== null) {
    const g = glowFor(a);
    if (a.rig.glow !== g) {
      a.rig.glow = g;
      tintRig(a.rig, 0, 0);
    }
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

  if (a.poisonT > 0) {
    a.poisonT -= dt;
    a.hp -= a.poisonDps * dt;
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

  a.lastPos.copy(a.pos);
  if (a.stunned > 0) {
    a.stunned -= dt;
    moveActor(ctx, a, 0, 0, 0, dt);
    a.root.rotation.y = a.yaw + Math.sin(ctx.time * 30) * 0.1;
    return;
  }

  if (a.hostile) updateHostile(ctx, a, dt);
  else updateFriendly(ctx, a, dt);

  a.root.rotation.y = a.yaw;
  const moved = Math.hypot(a.pos.x - a.lastPos.x, a.pos.z - a.lastPos.z) / Math.max(dt, 1e-4);
  if (a.rig !== null) {
    animateRig(a.rig, moved, dt, a.attackAnim);
    // A flinch when hit.
    a.rig.body.rotation.x = -a.flash * 0.28;
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
}

function animateDog(d: DogParts, speed: number, time: number, attack: number): void {
  const amp = Math.min(0.9, speed * 0.2);
  const s = Math.sin(time * (6 + speed * 1.5));
  d.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? s : -s) * amp; });
  d.tail.rotation.y = Math.sin(time * 12) * 0.5;
  d.head.rotation.x = attack > 0 ? 0.4 * attack : Math.sin(time * 1.3) * 0.05;
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
export function updateAuras(actors: readonly Actor[]): void {
  const consultants = actors.filter((c) => c.kind === 'consultant' && !c.resolved);
  for (const a of actors) {
    a.shielded = false;
    if (!a.hostile || a.resolved || a.kind === 'consultant' || a.kind === 'boss') continue;
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
  if (ctx.invisible && a.aggro && a.kind !== 'boss' && dist > 1.5) a.aggro = false;

  if (!a.aggro) {
    if (a.kind === 'boss') {
      const cx = toCell(ctx.playerPos.x);
      const cz = toCell(ctx.playerPos.z);
      if (!ctx.invisible && lv.roomOf[cz * lv.w + cx] === a.room) {
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
    } else if (sees && dist < aggroRange(ctx, a) && !a.docile) {
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
          if (s !== null) s.aggro = true;
        }
      } else {
        a.summonIn = fx.range(12, 18);
        say(a, 'I will get someone from my team to raise it with you.', 3);
        const s = ctx.spawn('user', a.pos.x + fx.range(-1, 1), a.pos.z + fx.range(-1, 1), a.room);
        if (s !== null) s.aggro = true;
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
        t.aggro = true;
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
  moveActor(ctx, a, mx, mz, speed, dt);
  if (sees && dist < 20 && !(a.kind === 'vendor' && a.fleeT > 0)) a.yaw = Math.atan2(dx, dz);

  if (a.cooldown > 0) return;
  const rate = a.elite === 'relentless' ? 0.8 : 1;
  // Low Management standing: managers send invites more often.
  const mgmtRate = 1 + Math.max(0, -ctx.managementStanding) / 100;
  switch (a.kind) {
    case 'user':
      if (dist < 2.0) {
        a.cooldown = 1.2 * rate;
        a.attackAnim = 1;
        ctx.hurtPlayer(dmg, a, 'melee');
        if (fx.chance(0.25)) ctx.enqueueTicket(a, false);
      }
      break;
    case 'reply':
      if (dist < 1.1) {
        // It delivers itself and is gone. That is not you resolving it.
        a.cooldown = 99;
        ctx.hurtPlayer(dmg, a, 'melee');
        a.resolved = true;
        a.expired = true;
        a.removeIn = 0.3;
      }
      break;
    case 'mosquito':
      if (dist < 1.1) {
        a.cooldown = 1.1;
        ctx.hurtPlayer(dmg, a, 'bite');
      }
      break;
    case 'caller':
      if (sees && dist < 18) {
        a.cooldown = fx.range(1.8, 2.8) * rate;
        a.attackAnim = 1;
        throwAt(ctx, a, 'ticket', 11, dmg);
      }
      break;
    case 'customer':
      if (sees && dist < 16) {
        a.cooldown = fx.range(2.0, 3.0) * rate;
        a.attackAnim = 1;
        throwAt(ctx, a, 'gold', 12, dmg);
      }
      if (dist < 2) {
        ctx.hurtPlayer(dmg * 0.6, a, 'melee');
        a.cooldown = 1.5 * rate;
      }
      break;
    case 'jam':
      if (sees && dist < 14) {
        a.cooldown = 1.9 * rate;
        for (const s of [-0.25, 0, 0.25]) throwAt(ctx, a, 'paper', 10, dmg, s, false);
      }
      break;
    case 'manager':
      if (dist < 2.2) {
        a.cooldown = (2.5 / mgmtRate) * rate;
        a.attackAnim = 1;
        say(a, 'Can you take an action item on that?', 2.5);
        ctx.addActionItem(a.name);
        ctx.hurtPlayer(dmg, a, 'melee');
      } else if (sees && dist < 15) {
        a.cooldown = (fx.range(2.8, 4.0) / mgmtRate) * rate;
        a.attackAnim = 1;
        throwAt(ctx, a, 'invite', 9, dmg);
      }
      break;
    case 'consultant':
      if (sees && dist < 16) {
        a.cooldown = fx.range(2.6, 3.4) * rate;
        a.attackAnim = 1;
        throwAt(ctx, a, 'deck', 8, dmg * 1.3);
      }
      break;
    case 'shadowit':
      if (sees && dist < 17) {
        a.cooldown = fx.range(1.6, 2.4) * rate;
        a.attackAnim = 1;
        for (const s of [-0.12, 0.12]) throwAt(ctx, a, 'code', 14, dmg * 0.8, s);
      }
      break;
    case 'turret':
      if (sees && dist < 16) {
        a.cooldown = 1.2;
        throwAt(ctx, a, 'code', 15, dmg);
      }
      break;
    case 'chatbot':
      if (sees && dist < 15) {
        a.cooldown = fx.range(2.2, 3.0) * rate;
        throwAt(ctx, a, 'chat', 7, dmg);
        if (fx.chance(0.3)) say(a, fx.pick(CHATBOT_BARKS), 2.5, '#002244', 'rgba(210,235,255,0.95)');
      }
      break;
    case 'vendor':
      if (a.fleeT <= 0 && dist < 1.5) {
        a.cooldown = 2 * rate;
        a.attackAnim = 1;
        const took = ctx.stealRep(a, Math.round((15 + ctx.floor * 6) * (a.elite === 'vip' ? 2 : 1)));
        a.stolen += took;
        ctx.hurtPlayer(dmg, a, 'melee');
        say(a, took > 0 ? `Thanks! That is ₡${took} for the "discovery workshop".` : 'No budget? I will come back next quarter.', 2.5);
        a.fleeT = 5;
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
    moveActor(ctx, a, a.chargeDir.x, a.chargeDir.z, 13, dt);
    if (dist < 2.2) {
      ctx.hurtPlayer(a.damage * 1.4, a, 'boss');
      ctx.shake(0.6);
      a.charging = 0;
    }
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
    a.attackAnim = 1;
    ctx.hurtPlayer(a.damage, a, 'boss');
  }

  a.patternIn -= dt * rate;
  if (a.patternIn > 0) return;
  // In phase two every other pattern is a hazard volley.
  const pattern: BossPattern = enraged && a.patternIdx % 2 === 1 ? 'hazards' : boss.patterns[a.patternIdx % boss.patterns.length] ?? 'invites';
  a.patternIdx++;
  a.patternIn = 3.2;
  a.attackAnim = 1;
  const f = ctx.floor;
  const d = ctx.difficulty;
  switch (pattern) {
    case 'invites':
      say(a, 'I have sent you a few invites.', 2);
      for (let i = -2; i <= 2; i++) throwAt(ctx, a, 'invite', 10, (6 + f) * d, i * 0.18, false);
      break;
    case 'summonUsers':
      say(a, 'Team! Everyone raise your issues with IT. Now.', 3);
      for (let i = 0; i < 3 + f; i++) ctx.spawn(i % 2 === 0 ? 'user' : 'caller', a.pos.x + fx.range(-2, 2), a.pos.z + fx.range(-2, 2), a.room);
      break;
    case 'summonCustomers':
      say(a, 'I have brought some of our key accounts.', 3);
      for (let i = 0; i < 2 + Math.floor(f / 2); i++) ctx.spawn('customer', a.pos.x + fx.range(-2, 2), a.pos.z + fx.range(-2, 2), a.room);
      break;
    case 'summonReply':
      say(a, 'I have CCd everyone.', 2);
      for (let i = 0; i < 6 + f; i++) ctx.spawn('reply', a.pos.x + fx.range(-2, 2), a.pos.z + fx.range(-2, 2), a.room);
      break;
    case 'summonManagers':
      say(a, ctx.findings > 0 ? `I have ${ctx.findings} finding${ctx.findings > 1 ? 's' : ''} to discuss with your managers.` : 'I will need to speak to your line managers.', 3);
      for (let i = 0; i < 2 + Math.min(3, ctx.findings); i++) ctx.spawn(i === 0 ? 'consultant' : 'manager', a.pos.x + fx.range(-2, 2), a.pos.z + fx.range(-2, 2), a.room);
      break;
    case 'allHands':
      say(a, 'ALL HANDS MEETING. Attendance is mandatory.', 3, '#fff', 'rgba(120,0,0,0.92)');
      for (const k of ['user', 'caller', 'customer', 'manager', 'reply', 'reply', 'vendor'] as const) {
        ctx.spawn(k, a.pos.x + fx.range(-3, 3), a.pos.z + fx.range(-3, 3), a.room);
      }
      break;
    case 'charge':
      say(a, 'Let us have a QUICK sync!', 1.5);
      a.chargeDir.set(dx, 0, dz).normalize();
      a.charging = 0.9;
      break;
    case 'goldSpiral':
      say(a, 'Everything is a P1!', 2);
      for (let k = 0; k < 3; k++) ring(ctx, a, 'gold', 10, 8, (8 + f * 2) * d, k * 0.2 + ctx.time);
      break;
    case 'shockwave':
      say(a, 'I would like to ESCALATE this.', 2);
      ctx.shake(0.4);
      ring(ctx, a, 'ring', 18, 9, (10 + f * 2) * d);
      break;
    case 'poBombs':
      say(a, 'Raise a PO for that. And that.', 2);
      for (let i = 0; i < 3 + Math.floor(f / 2); i++) {
        const from = a.pos.clone();
        from.y = 2;
        const t = ctx.playerPos.clone().add(new THREE.Vector3(fx.range(-3, 3), 0, fx.range(-3, 3)));
        const dir = t.sub(from);
        const flat = Math.hypot(dir.x, dir.z);
        dir.set(dir.x / flat, 0.9, dir.z / flat).normalize();
        ctx.fire({ kind: 'po', from, dir, speed: Math.min(16, 5 + flat * 0.9), damage: (12 + f * 2) * d, hostile: true, owner: a, gravity: 14, splash: 2.5 });
      }
      break;
    case 'freeze':
      say(a, 'BUDGET FREEZE. Nobody moves until Q3.', 2.5, '#fff', 'rgba(20,60,140,0.92)');
      if (dist < 12) ctx.rootPlayer(1.6, 'Budget freeze');
      ring(ctx, a, 'invite', 12, 7, (6 + f) * d);
      break;
    case 'lasers': {
      say(a, 'Finding. Finding. Finding.', 2);
      const n = 8 + Math.min(8, ctx.findings * 2);
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + ctx.time * 0.7;
        const from = a.pos.clone();
        from.y = 1.2;
        ctx.fire({ kind: 'laser', from, dir: new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), speed: 22, damage: (12 + f * 2) * d, hostile: true, owner: a, ttl: 2 });
      }
      a.patternIn = enraged ? 1.4 : 2.2;
      break;
    }
    case 'teleport': {
      say(a, 'Golden parachute!', 1.5);
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
      const lines: Record<HazardKind, string> = {
        meeting: 'Recurring invite: "Quick catch-up". Accept all.',
        fire: 'Everything is ON FIRE and it is YOUR fault.',
        freeze: 'Frozen. Pending approval.',
        coffee: 'Who spilled the executive espresso? YOU did.',
      };
      say(a, lines[boss.hazard], 2.5, '#fff', 'rgba(120,0,0,0.92)');
      // One on you, the rest around you: keep moving.
      ctx.hazard(ctx.playerPos.x, ctx.playerPos.z, 2.2, 7, boss.hazard);
      for (let i = 0; i < 2 + Math.min(3, Math.floor(f / 2)); i++) {
        const ang = fx.range(0, Math.PI * 2);
        const r = fx.range(3, 6);
        ctx.hazard(ctx.playerPos.x + Math.sin(ang) * r, ctx.playerPos.z + Math.cos(ang) * r, 2, 7, boss.hazard);
      }
      a.patternIn = 2.4;
      break;
    }
  }
}

function nearestHostile(ctx: GameCtx, a: Actor, range: number): Actor | null {
  let best: Actor | null = null;
  let bestD = range;
  for (const o of ctx.actors) {
    if (!o.hostile || o.resolved || (o.docile && !o.aggro)) continue;
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
    hurtActor(ctx, target, 11 * scale, new THREE.Vector3(tx, 0, tz).normalize().multiplyScalar(2));
    // Managers especially hate being barked at: they lose their train of thought.
    if (target.kind === 'manager') target.summonIn += 3;
    if (fx.chance(0.2)) say(a, 'GRRR-WUF!', 1.5, ...ALLY_BUBBLE);
  }
}

/**
 * Stun someone. Bosses take a short stagger at most, then shrug stuns off
 * for a few seconds, so nothing (a security guard, a rubber stamp) can
 * lock one down.
 */
export function stun(a: Actor, seconds: number): void {
  if (a.kind === 'boss') {
    if (a.stunImmune > 0) return;
    a.stunned = Math.max(a.stunned, Math.min(0.5, seconds));
    a.stunImmune = 6;
    return;
  }
  a.stunned = Math.max(a.stunned, seconds);
}

export function hurtActor(ctx: GameCtx, a: Actor, dmg: number, knock: THREE.Vector3 | null): void {
  if (a.resolved || !a.hostile) return;
  a.hp -= dmg;
  a.flash = 1;
  if (a.kind === 'boss' && !a.bossActive) {
    // Hitting a boss starts the fight properly, wherever you hit it from.
    startBoss(ctx, a);
  } else if (!a.aggro) {
    a.aggro = true;
    ctx.noticed(a);
  }
  a.docile = false;
  if (knock !== null && a.kind !== 'boss' && a.kind !== 'turret') a.push.add(knock);
  a.hpBar.visible = true;
  a.hpFill.scale.x = Math.max(0.001, a.hp / a.maxHp);
  a.hpFill.position.x = -(1 - a.hpFill.scale.x) / 2;
  ctx.floatText(new THREE.Vector3(a.pos.x, (a.kind === 'boss' ? 4 : 2.2) + fx.range(0, 0.4), a.pos.z), `${Math.round(dmg)}`, a.shielded ? '#8fd0ff' : '#ffe066');
}
