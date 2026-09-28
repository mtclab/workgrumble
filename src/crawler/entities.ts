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
  CUSTOMER_BARKS,
  HEALER_BARKS,
  HEALER_NAMES,
  HELPER_BARKS,
  MANAGER_BARKS,
  MANAGER_NAMES,
  USER_BARKS,
  USER_NAMES,
} from './content/lines';
import { disposeTree } from './dispose';
import { collideCircle, type Level, lineOfSight, NEIGHBOURS8, TILE, toCell } from './level';
import { fx, type Rng } from './rng';
import { disposeSprite, textSprite } from './textures';

export type ActorKind =
  | 'user'
  | 'caller'
  | 'customer'
  | 'manager'
  | 'reply'
  | 'jam'
  | 'mosquito'
  | 'boss'
  | 'healer'
  | 'helper'
  | 'npc'
  | 'tonttu';

export type HelperRole = 'sysadmin' | 'security' | 'intern' | 'clone' | 'spirit';

export interface BossDef {
  readonly name: string;
  readonly title: string;
  readonly hp: number;
  readonly outfit: Outfit;
  readonly intro: string;
  readonly defeat: string;
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
  | 'teleport';

export interface Actor {
  readonly id: number;
  readonly kind: ActorKind;
  name: string;
  readonly hostile: boolean;
  readonly root: THREE.Group;
  readonly rig: Rig | null;
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
  /** Seconds left for a temporary ally (clones, summoned tonttu); -1 forever. */
  ttl: number;
  /** Talked to already: one talk-down per person. */
  talked: boolean;
  /** Will not start trouble unless you do (high Staff standing). */
  docile: boolean;
  /** Story NPC id, if this is one. */
  npcId: string | null;
  boss: BossDef | null;
  bossActive: boolean;
  patternIn: number;
  patternIdx: number;
  charging: number;
  readonly chargeDir: THREE.Vector3;
  summonIn: number;
  stunned: number;
  slowT: number;
  poisonT: number;
  poisonDps: number;
  enragedT: number;
  revealT: number;
  rep: number;
  gold: boolean;
  readonly lastPos: THREE.Vector3;
}

/** What the AI needs from the game. The Game class implements it. */
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
  helperDamageMult(): number;
  healerFrequency(): number;
  kitchenStanding(): number;
  ticketTitle(a: Actor): string;
  noticed(a: Actor): void;
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
  | 'salmiakki';

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

const STATS: Record<'user' | 'caller' | 'customer' | 'manager' | 'reply' | 'jam' | 'mosquito', KindStats> = {
  user: { hp: 40, speed: 3.1, damage: 6, radius: 0.4, rep: 8 },
  caller: { hp: 32, speed: 2.7, damage: 8, radius: 0.4, rep: 10 },
  customer: { hp: 95, speed: 2.4, damage: 13, radius: 0.45, rep: 26 },
  manager: { hp: 130, speed: 2.3, damage: 6, radius: 0.45, rep: 42 },
  reply: { hp: 12, speed: 5.6, damage: 4, radius: 0.3, rep: 3 },
  jam: { hp: 75, speed: 1.9, damage: 7, radius: 0.55, rep: 20 },
  mosquito: { hp: 6, speed: 6.5, damage: 2, radius: 0.2, rep: 1 },
};

export const BOSSES: readonly BossDef[] = [
  {
    name: 'Derek', title: 'Team Leader, Service Desk', hp: 650,
    outfit: { skin: 0xf1c9a5, hair: 0x6b4423, top: 0xffffff, legs: 0x1f2a44, tie: 0xc0392b, lanyard: 0x2266cc, scale: 1.7, face: 'smug' },
    intro: 'Got a sec? I have booked us a quick 90-minute sync.',
    defeat: 'Fine. Let us... take this offline.',
    patterns: ['invites', 'summonUsers', 'charge', 'invites', 'shockwave'],
  },
  {
    name: 'Karen', title: 'VP of Customer Success', hp: 950,
    outfit: { skin: 0xffdbac, hair: 0xd8b36a, top: 0x8e44ad, legs: 0x2e3440, hairStyle: 'bun', glasses: true, scale: 1.75, face: 'angry' },
    intro: 'We are a GOLD account. I want the person in charge of you.',
    defeat: 'I will be leaving a review. A... good one.',
    patterns: ['goldSpiral', 'summonCustomers', 'shockwave', 'goldSpiral', 'charge'],
  },
  {
    name: 'Gordon', title: 'Head of Procurement', hp: 1250,
    outfit: { skin: 0xe0ac7e, hair: 0x8a8a8a, top: 0x3b3b3b, legs: 0x3b3b3b, tie: 0x27ae60, glasses: true, hairStyle: 'bald', scale: 1.8, face: 'stern' },
    intro: 'Has this purchase been through the three-quote process?',
    defeat: 'Approved. Under protest. Net 90.',
    patterns: ['poBombs', 'freeze', 'summonReply', 'poBombs', 'invites'],
  },
  {
    name: 'The Auditor', title: 'External, Big Four', hp: 1500,
    outfit: { skin: 0xc68642, hair: 0x111111, top: 0x222222, legs: 0x111111, tie: 0x111111, glasses: true, scale: 1.8, face: 'stern' },
    intro: 'I will need evidence. Of everything. Since 2011.',
    defeat: 'No material findings. This time.',
    patterns: ['lasers', 'summonManagers', 'lasers', 'shockwave', 'teleport'],
  },
  {
    name: 'Sir Reginald Workgrumble', title: 'Founder & CEO', hp: 2400,
    outfit: { skin: 0xf1c9a5, hair: 0xeeeeee, top: 0x1a1a3a, legs: 0x1a1a3a, tie: 0xd4af37, hairStyle: 'short', scale: 2.1, face: 'smug' },
    intro: 'Ah, IT. We are restructuring. You are the structure.',
    defeat: 'Take the farm money. Take it! Just fix my email first.',
    patterns: ['allHands', 'goldSpiral', 'lasers', 'teleport', 'shockwave', 'poBombs', 'charge'],
  },
];

const FACES: Partial<Record<ActorKind, Expression>> = {
  user: 'angry', caller: 'angry', customer: 'smug', manager: 'smug', healer: 'kind', helper: 'tired', npc: 'neutral', tonttu: 'happy',
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

export interface SpawnOpts {
  readonly staffStanding?: number;
  readonly npc?: { id: string; name: string };
  readonly role?: HelperRole;
  readonly ttl?: number;
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
  const root = new THREE.Group();
  let name = '';
  let hp = 100;
  let speed = 2.5;
  let damage = 5;
  let radius = 0.4;
  let rep = 0;
  let boss: BossDef | null = null;
  let role: HelperRole | null = opts.role ?? null;
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
  } else if (kind === 'boss') {
    boss = BOSSES[f % BOSSES.length] ?? null;
    if (boss === null) throw new Error('no boss');
    rig = buildRig(boss.outfit);
    root.add(rig.root);
    name = f >= BOSSES.length ? `${boss.name} (Overtime)` : boss.name;
  } else if (kind === 'helper' && (role === 'clone' || role === 'spirit')) {
    rig = buildRig(role === 'spirit' ? outfitFor('tonttu', r) : { skin: 0x9fe0ff, hair: 0x5fb6ff, top: 0x5fb6ff, legs: 0x2a6fb0, face: 'neutral', glasses: true });
    if (role === 'clone') for (const m of rig.materials) { m.transparent = true; m.opacity = 0.7; m.emissive.setHex(0x113355); }
    root.add(rig.root);
  } else {
    rig = buildRig(outfitFor(kind, r));
    root.add(rig.root);
  }

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
    name = role === 'sysadmin'
      ? r.pick(['Dave (Senior Sysadmin)', 'Old Bob (Mainframe)', 'Priya (Network Eng.)'])
      : role === 'security' ? 'Gary (Security)'
        : role === 'clone' ? 'Pat (autoscaled instance)'
          : role === 'spirit' ? 'Saunatonttu (summoned)' : r.pick(['Josh (Intern)', 'Ellie (Intern)']);
    hp = 1;
    speed = 3.6;
  } else if (kind !== 'boss') {
    const st = STATS[kind];
    hp = st.hp * diff;
    speed = st.speed * (1 + f * 0.03) * (0.9 + ctx.difficulty * 0.1);
    damage = st.damage * diff;
    radius = st.radius;
    rep = Math.round(st.rep * (1 + f * 0.25) * (0.6 + ctx.difficulty * 0.4));
    const first = r.pick(USER_NAMES);
    name = kind === 'manager' ? r.pick(MANAGER_NAMES)
      : kind === 'customer' ? `${first} (Client, Gold SLA)`
        : kind === 'caller' ? `${first} (on the phone)`
          : kind === 'mosquito' ? 'Hyttynen' : name !== '' ? name
            : `${first} from ${r.pick(['Sales', 'Marketing', 'Legal', 'Ops', 'Finance', 'HR', 'Comms'])}`;
  }

  const bar = hpBar();
  bar.group.position.y = kind === 'boss' ? 4.2 : 2.35;
  root.add(bar.group);
  root.position.set(x, 0, z);
  ctx.scene.add(root);

  const staff = opts.staffStanding ?? 0;
  const docile = (kind === 'user' || kind === 'caller') && staff > 20 && r.chance((staff - 20) / 120);

  const a: Actor = {
    id: nextActorId++,
    kind, name, hostile, root, rig,
    pos: root.position,
    push: new THREE.Vector3(),
    yaw: r.range(0, Math.PI * 2),
    radius, hp, maxHp: hp, speed, damage,
    cooldown: r.range(0.5, 2),
    aggro: false,
    resolved: false,
    calm: false,
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
    recruited: role === 'clone' || role === 'spirit',
    role,
    giftGiven: false,
    healIn: 2,
    ttl: opts.ttl ?? -1,
    talked: false,
    docile,
    npcId: opts.npc?.id ?? null,
    boss,
    bossActive: false,
    patternIn: 2.5,
    patternIdx: 0,
    charging: 0,
    chargeDir: new THREE.Vector3(),
    summonIn: 10,
    stunned: 0,
    slowT: 0,
    poisonT: 0,
    poisonDps: 0,
    enragedT: 0,
    revealT: 0,
    rep,
    gold: kind === 'customer' || kind === 'boss',
    lastPos: new THREE.Vector3(x, 0, z),
  };
  if (docile && a.rig !== null) setExpression(a.rig, 'neutral');
  if (kind === 'npc' || kind === 'tonttu') setMarker(a, '!', '#ffd54a');
  return a;
}

export function setMarker(a: Actor, text: string | null, color = '#ffd54a'): void {
  if (a.marker !== null) {
    a.root.remove(a.marker);
    disposeSprite(a.marker);
    a.marker = null;
  }
  if (text === null) return;
  const s = textSprite(text, { color, size: 60 });
  s.position.y = a.kind === 'tonttu' ? 1.9 : 2.9;
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
  const top = a.kind === 'boss' ? 4.7 : a.kind === 'reply' || a.kind === 'mosquito' ? 1.9 : a.kind === 'tonttu' ? 1.6 : 2.7;
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

function throwAt(ctx: GameCtx, a: Actor, kind: ProjectileKind, speed: number, damage: number, spread = 0, lead = true): void {
  const from = a.pos.clone();
  from.y = 1.4 * Math.min(1.6, a.rig?.root.scale.y ?? 1);
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

export function updateActor(ctx: GameCtx, a: Actor, dt: number): void {
  if (a.flash > 0) {
    a.flash = Math.max(0, a.flash - dt * 4);
    if (a.rig !== null) tintRig(a.rig, a.resolved ? 0x30ff60 : a.poisonT > 0 ? 0x30a030 : 0xff3030, a.flash);
  }
  if (a.bubble !== null) {
    a.bubbleTime -= dt;
    if (a.bubbleTime <= 0) {
      a.root.remove(a.bubble);
      disposeSprite(a.bubble);
      a.bubble = null;
    }
  }
  if (a.marker !== null) a.marker.position.y = (a.kind === 'tonttu' ? 1.9 : 2.9) + Math.sin(ctx.time * 3) * 0.08;
  a.attackAnim = Math.max(0, a.attackAnim - dt * 3);
  a.slowT = Math.max(0, a.slowT - dt);
  a.enragedT = Math.max(0, a.enragedT - dt);
  a.revealT = Math.max(0, a.revealT - dt);

  if (a.resolved) {
    a.removeIn -= dt;
    if (a.calm) {
      // Walks off, satisfied (or just confused), and fades.
      moveActor(ctx, a, a.pos.x - ctx.playerPos.x, a.pos.z - ctx.playerPos.z, 1.5, dt);
      a.root.rotation.y = a.yaw;
      if (a.rig !== null) animateRig(a.rig, 1.5, dt);
      if (a.removeIn < 0.8) a.root.scale.setScalar(Math.max(0.01, a.removeIn / 0.8));
    } else {
      a.root.position.y += dt * 0.6;
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
  if (a.rig !== null) animateRig(a.rig, moved, dt, a.attackAnim);
  if (a.kind === 'reply') a.root.children[0]?.position.set(0, Math.sin(ctx.time * 8 + a.id) * 0.15, 0);
  if (a.kind === 'mosquito') {
    a.root.position.y = Math.sin(ctx.time * 5 + a.id) * 0.3;
    a.root.traverse((o) => { if (o.name === 'wing') o.rotation.x = Math.sin(ctx.time * 80) * 0.8; });
  }
}

function aggroRange(ctx: GameCtx, a: Actor): number {
  const base = a.kind === 'boss' ? 16 : a.kind === 'manager' ? 13 : a.kind === 'caller' ? 14 : a.kind === 'mosquito' ? 9 : 11;
  return base * (1 - ctx.stealth);
}

function barksFor(a: Actor): readonly string[] {
  return a.kind === 'customer' ? CUSTOMER_BARKS : a.kind === 'manager' ? MANAGER_BARKS : USER_BARKS;
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
        a.aggro = true;
        a.bossActive = true;
        if (a.boss !== null) say(a, a.boss.intro, 5, '#fff', 'rgba(120,0,0,0.92)');
        ctx.noticed(a);
      }
    } else if (sees && dist < aggroRange(ctx, a) && !a.docile) {
      a.aggro = true;
      ctx.noticed(a);
      if (a.kind !== 'reply' && a.kind !== 'jam' && a.kind !== 'mosquito') say(a, fx.pick(barksFor(a)), 2.5);
    } else if (a.docile && sees && dist < 5) {
      a.barkIn -= dt;
      if (a.barkIn <= 0) {
        a.barkIn = 12;
        say(a, fx.pick(['Oh, it\'s you! No rush, I\'ll raise a ticket.', 'Morning! Love your work.', 'You fixed my VPN once. Legend.']), 3);
      }
      a.yaw = Math.atan2(dx, dz);
    }
    if (!a.aggro) {
      if (a.wanderTarget === null || fx.chance(dt * 0.2)) {
        a.wanderTarget = new THREE.Vector3(a.pos.x + fx.range(-3, 3), 0, a.pos.z + fx.range(-3, 3));
      }
      tmp.subVectors(a.wanderTarget, a.pos);
      if (tmp.length() > 0.3) moveActor(ctx, a, tmp.x, tmp.z, a.speed * 0.3, dt);
      else moveActor(ctx, a, 0, 0, 0, dt);
      return;
    }
  }

  a.cooldown -= dt;
  a.barkIn -= dt;
  if (a.barkIn <= 0 && dist < 12 && (a.kind === 'user' || a.kind === 'caller' || a.kind === 'customer' || a.kind === 'manager')) {
    a.barkIn = fx.range(7, 14);
    say(a, fx.chance(0.5) ? `"${ctx.ticketTitle(a)}"` : fx.pick(barksFor(a)), 3);
  }

  if (a.kind === 'boss') {
    updateBoss(ctx, a, dt, dist, sees, dx, dz);
    return;
  }

  // Low Staff standing: they come in angrier. An enraged one hits harder still.
  const grudge = 1 + Math.max(0, -ctx.staffStanding) / 200 + (a.enragedT > 0 ? 0.5 : 0);
  const dmg = a.damage * (a.kind === 'user' || a.kind === 'caller' || a.kind === 'customer' ? grudge : 1);

  const keep = a.kind === 'caller' ? 8 : a.kind === 'customer' ? 5 : a.kind === 'manager' ? 5.5 : a.kind === 'jam' ? 6 : 0;
  let mx = 0;
  let mz = 0;
  if (sees && dist < 20) {
    if (keep > 0 && dist < keep - 1.5) {
      mx = -dx;
      mz = -dz;
    } else if (dist > keep + 0.5) {
      mx = dx;
      mz = dz;
    } else if (keep > 0) {
      mx = -dz * (a.id % 2 === 0 ? 1 : -1);
      mz = dx * (a.id % 2 === 0 ? 1 : -1);
    }
  } else if (navDir(ctx, a, tmp2)) {
    mx = tmp2.x;
    mz = tmp2.z;
  }
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
  let speed = a.speed * (a.enragedT > 0 ? 1.3 : 1);
  if (a.kind === 'user' && dist < 1.8) speed = 0;
  if ((a.kind === 'reply' || a.kind === 'mosquito') && dist < 0.9) speed = 0;
  moveActor(ctx, a, mx, mz, speed, dt);
  if (sees && dist < 20) a.yaw = Math.atan2(dx, dz);

  if (a.cooldown > 0) return;
  // Low Management standing: managers send invites more often.
  const mgmtRate = 1 + Math.max(0, -ctx.managementStanding) / 100;
  switch (a.kind) {
    case 'user':
      if (dist < 2.0) {
        a.cooldown = 1.2;
        a.attackAnim = 1;
        ctx.hurtPlayer(dmg, a, 'melee');
        if (fx.chance(0.25)) ctx.enqueueTicket(a, false);
      }
      break;
    case 'reply':
      if (dist < 1.1) {
        a.cooldown = 99;
        ctx.hurtPlayer(dmg, a, 'melee');
        a.hp = 0;
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
        a.cooldown = fx.range(1.8, 2.8);
        a.attackAnim = 1;
        throwAt(ctx, a, 'ticket', 11, dmg);
      }
      break;
    case 'customer':
      if (sees && dist < 16) {
        a.cooldown = fx.range(2.0, 3.0);
        a.attackAnim = 1;
        throwAt(ctx, a, 'gold', 12, dmg);
      }
      if (dist < 2) {
        ctx.hurtPlayer(dmg * 0.6, a, 'melee');
        a.cooldown = 1.5;
      }
      break;
    case 'jam':
      if (sees && dist < 14) {
        a.cooldown = 1.9;
        for (const s of [-0.25, 0, 0.25]) throwAt(ctx, a, 'paper', 10, dmg, s, false);
      }
      break;
    case 'manager':
      if (dist < 2.2) {
        a.cooldown = 2.5 / mgmtRate;
        a.attackAnim = 1;
        say(a, 'Can you take an action item on that?', 2.5);
        ctx.addActionItem(a.name);
        ctx.hurtPlayer(dmg, a, 'melee');
      } else if (sees && dist < 15) {
        a.cooldown = fx.range(2.8, 4.0) / mgmtRate;
        a.attackAnim = 1;
        throwAt(ctx, a, 'invite', 9, dmg);
      }
      break;
    default:
      break;
  }
  if (a.kind === 'manager') {
    a.summonIn -= dt;
    if (a.summonIn <= 0 && sees && dist < 16) {
      a.summonIn = fx.range(12, 18);
      say(a, 'I will get someone from my team to raise it with you.', 3);
      const s = ctx.spawn('user', a.pos.x + fx.range(-1, 1), a.pos.z + fx.range(-1, 1), a.room);
      if (s !== null) s.aggro = true;
    }
  }
}

function updateBoss(ctx: GameCtx, a: Actor, dt: number, dist: number, sees: boolean, dx: number, dz: number): void {
  const boss = a.boss;
  if (boss === null) return;
  const enraged = a.hp < a.maxHp * 0.5;
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
    if (dist > want + 1) { mx = dx; mz = dz; } else if (dist < want - 1) { mx = -dx; mz = -dz; } else { mx = -dz; mz = dx; }
  } else if (navDir(ctx, a, tmp2)) {
    mx = tmp2.x;
    mz = tmp2.z;
  }
  moveActor(ctx, a, mx, mz, a.speed * rate, dt);
  a.yaw = Math.atan2(dx, dz);
  if (dist < 2.4 && a.cooldown <= 0) {
    a.cooldown = 1;
    a.attackAnim = 1;
    ctx.hurtPlayer(a.damage, a, 'boss');
  }
  a.cooldown -= dt;

  a.patternIn -= dt * rate;
  if (a.patternIn > 0) return;
  const pattern = boss.patterns[a.patternIdx % boss.patterns.length] ?? 'invites';
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
      for (let i = 0; i < 2 + Math.min(3, ctx.findings); i++) ctx.spawn('manager', a.pos.x + fx.range(-2, 2), a.pos.z + fx.range(-2, 2), a.room);
      break;
    case 'allHands':
      say(a, 'ALL HANDS MEETING. Attendance is mandatory.', 3, '#fff', 'rgba(120,0,0,0.92)');
      for (const k of ['user', 'caller', 'customer', 'manager', 'reply', 'reply'] as const) {
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
    case 'lasers':
      say(a, 'Finding. Finding. Finding.', 2);
      for (let k = 0; k < 8 + Math.min(8, ctx.findings * 2); k++) {
        const n = 8 + Math.min(8, ctx.findings * 2);
        const ang = (k / n) * Math.PI * 2 + ctx.time * 0.7;
        const from = a.pos.clone();
        from.y = 1.2;
        ctx.fire({ kind: 'laser', from, dir: new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), speed: 22, damage: (12 + f * 2) * d, hostile: true, owner: a, ttl: 2 });
      }
      a.patternIn = enraged ? 1.4 : 2.2;
      break;
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
  }
}

function nearestHostile(ctx: GameCtx, a: Actor, range: number): Actor | null {
  let best: Actor | null = null;
  let bestD = range;
  for (const o of ctx.actors) {
    if (!o.hostile || o.resolved || o.docile && !o.aggro) continue;
    const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
    if (d < bestD && lineOfSight(ctx.level, a.pos.x, a.pos.z, o.pos.x, o.pos.z)) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

const ALLY_BUBBLE: [string, string] = ['#003040', 'rgba(220,250,255,0.95)'];

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
    if (dist < 10 && dist > 2.5 && kitchen > -40) {
      moveActor(ctx, a, dx, dz, a.speed, dt);
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
    a.barkIn -= dt;
    if (dist < 5 && a.barkIn <= 0) {
      a.barkIn = 8;
      say(a, a.role === 'intern' ? 'Is there anything I can do? Please?' : a.role === 'security' ? 'Need a hand? Press E.' : 'Need backup? Press E.', 3, ...ALLY_BUBBLE);
    }
    moveActor(ctx, a, 0, 0, 0, dt);
    if (dist < 8) a.yaw = Math.atan2(dx, dz);
    return;
  }
  const sees = lineOfSight(ctx.level, a.pos.x, a.pos.z, ctx.playerPos.x, ctx.playerPos.z);
  if (dist > 3) {
    if (sees) moveActor(ctx, a, dx, dz, a.speed * (dist > 8 ? 1.6 : 1), dt);
    else if (navDir(ctx, a, tmp2)) moveActor(ctx, a, tmp2.x, tmp2.z, a.speed * 1.4, dt);
    else moveActor(ctx, a, 0, 0, 0, dt);
  } else {
    moveActor(ctx, a, 0, 0, 0, dt);
  }
  if (dist > 30) a.pos.set(ctx.playerPos.x + 1, 0, ctx.playerPos.z + 1);
  a.cooldown -= dt;
  const target = nearestHostile(ctx, a, 14);
  if (target !== null) {
    a.yaw = Math.atan2(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
    if (a.cooldown <= 0) {
      const from = a.pos.clone();
      from.y = 1.4 * (a.rig?.root.scale.y ?? 1);
      const to = target.pos.clone();
      to.y = 1.2;
      const dir = to.sub(from).normalize();
      const scale = ctx.helperDamageMult() * (1 + ctx.floor * 0.3) * ctx.difficulty;
      if (a.role === 'sysadmin' || a.role === 'clone') {
        a.cooldown = a.role === 'clone' ? 0.6 : 1.1;
        a.attackAnim = 1;
        ctx.fire({ kind: 'rtfm', from, dir, speed: 24, damage: 15 * scale, hostile: false, owner: a });
        if (a.role === 'sysadmin' && fx.chance(0.15)) say(a, fx.pick(HELPER_BARKS), 2, ...ALLY_BUBBLE);
      } else if (a.role === 'security') {
        a.cooldown = 2.2;
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
  if (a.role === 'intern') {
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

export function hurtActor(ctx: GameCtx, a: Actor, dmg: number, knock: THREE.Vector3 | null): void {
  if (a.resolved || !a.hostile) return;
  a.hp -= dmg;
  a.flash = 1;
  if (!a.aggro) {
    a.aggro = true;
    ctx.noticed(a);
  }
  a.docile = false;
  if (knock !== null && a.kind !== 'boss') a.push.add(knock);
  a.hpBar.visible = true;
  a.hpFill.scale.x = Math.max(0.001, a.hp / a.maxHp);
  a.hpFill.position.x = -(1 - a.hpFill.scale.x) / 2;
  ctx.floatText(new THREE.Vector3(a.pos.x, (a.kind === 'boss' ? 4 : 2.2) + fx.range(0, 0.4), a.pos.z), `${Math.round(dmg)}`, '#ffe066');
}
