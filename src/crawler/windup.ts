import type { ActorKind } from './entities';

/**
 * Combat you can read (docs/SPEC_COMBAT_READ.md): every hit on the player is
 * announced before it lands, and every action the player takes answers.
 *
 * The rules live here, apart from the scene, so they can be tested without
 * one: how long each enemy attack winds up, whether a strike still lands
 * from where the player stands when it comes, what counts as a parry, what a
 * press of the left button turns into, and which way a hit came from.
 */

// ================================================================== enemy attacks

export const BOSS_PATTERNS = [
  'invites',
  'summonUsers',
  'charge',
  'goldSpiral',
  'shockwave',
  'summonCustomers',
  'poBombs',
  'freeze',
  'summonReply',
  'lasers',
  'summonManagers',
  'allHands',
  'teleport',
  'hazards',
] as const;

export type BossPattern = (typeof BOSS_PATTERNS)[number];

/**
 * Melee swings at you from in front; contact attacks lunge or dive into you;
 * ranged ones raise and throw; boss attacks are the big ones.
 */
export type AttackClass = 'melee' | 'contact' | 'ranged' | 'boss';

/** The shortest wind-up a class may have. Nothing lands unannounced. */
export const WINDUP_FLOOR: Record<AttackClass, number> = { melee: 0.35, contact: 0.35, ranged: 0.3, boss: 0.6 };

export interface AttackDef {
  readonly cls: AttackClass;
  /** Seconds from the tell to the strike. */
  readonly windup: number;
  /** How far the strike reaches when it lands (melee and contact; 0 for the rest). */
  readonly reach: number;
  /** Half-angle, in radians, around the direction the attacker committed to. PI: any way. */
  readonly arc: number;
}

type GruntAttack =
  | 'user.melee'
  | 'manager.melee'
  | 'customer.shove'
  | 'vendor.grab'
  | 'reply.dive'
  | 'mosquito.bite'
  | 'boss.slam'
  | 'caller.throw'
  | 'customer.throw'
  | 'jam.volley'
  | 'manager.invite'
  | 'consultant.deck'
  | 'shadowit.code'
  | 'turret.code'
  | 'chatbot.chat'
  | 'dummy.swing';

export type AttackId = GruntAttack | `boss.${BossPattern}`;

const melee = (windup: number, reach: number, arc = 1.0): AttackDef => ({ cls: 'melee', windup, reach, arc });
const contact = (windup: number, reach: number): AttackDef => ({ cls: 'contact', windup, reach, arc: Math.PI });
const ranged = (windup: number): AttackDef => ({ cls: 'ranged', windup, reach: 0, arc: Math.PI });
const boss = (windup: number): AttackDef => ({ cls: 'boss', windup, reach: 0, arc: Math.PI });

/**
 * Every attack's wind-up, in one table. Bigger hits wind up longer. The
 * reach is a little past the range that starts the wind-up, so standing
 * still takes the hit and stepping away is what avoids it.
 */
export const ATTACKS: Record<AttackId, AttackDef> = {
  'user.melee': melee(0.45, 2.2),
  'manager.melee': melee(0.55, 2.4),
  'customer.shove': contact(0.4, 2.2),
  'vendor.grab': contact(0.45, 1.8),
  'reply.dive': contact(0.35, 1.4),
  'mosquito.bite': contact(0.35, 1.4),
  'boss.slam': { cls: 'boss', windup: 0.7, reach: 2.8, arc: 1.2 },
  'caller.throw': ranged(0.4),
  'customer.throw': ranged(0.45),
  'jam.volley': ranged(0.5),
  'manager.invite': ranged(0.45),
  'consultant.deck': ranged(0.5),
  'shadowit.code': ranged(0.35),
  'turret.code': ranged(0.35),
  'chatbot.chat': ranged(0.4),
  // The induction's dummy: a slow, honest swing, for learning to block and parry.
  'dummy.swing': melee(0.55, 2.6, 1.2),
  'boss.invites': boss(0.6),
  'boss.summonUsers': boss(0.6),
  // The crouch before a QUICK sync.
  'boss.charge': boss(0.6),
  'boss.goldSpiral': boss(0.7),
  'boss.shockwave': boss(0.8),
  'boss.summonCustomers': boss(0.6),
  'boss.poBombs': boss(0.7),
  'boss.freeze': boss(0.8),
  'boss.summonReply': boss(0.6),
  'boss.lasers': boss(0.8),
  'boss.summonManagers': boss(0.6),
  'boss.allHands': boss(0.8),
  'boss.teleport': boss(0.6),
  'boss.hazards': boss(0.6),
};

export type HostileKind = Exclude<ActorKind, 'healer' | 'helper' | 'npc' | 'tonttu'>;

/** Which attacks each kind of trouble has, so nobody is left out of the table. */
export const ATTACKS_BY_KIND: Record<HostileKind, readonly AttackId[]> = {
  user: ['user.melee'],
  caller: ['caller.throw'],
  customer: ['customer.shove', 'customer.throw'],
  manager: ['manager.melee', 'manager.invite'],
  reply: ['reply.dive'],
  jam: ['jam.volley'],
  mosquito: ['mosquito.bite'],
  consultant: ['consultant.deck'],
  shadowit: ['shadowit.code'],
  vendor: ['vendor.grab'],
  chatbot: ['chatbot.chat'],
  turret: ['turret.code'],
  dummy: ['dummy.swing'],
  boss: ['boss.slam', ...BOSS_PATTERNS.map((p): AttackId => `boss.${p}`)],
};

/** The boss pattern an attack is, or null for anything else (the slam included). */
export function patternOf(id: AttackId): BossPattern | null {
  if (!id.startsWith('boss.')) return null;
  const p = id.slice(5);
  return (BOSS_PATTERNS as readonly string[]).includes(p) ? (p as BossPattern) : null;
}

/** An attacker's wind-up: what is coming, and how long until it does. */
export interface Windup {
  pending: AttackId | null;
  /** Seconds until the strike. */
  windup: number;
  /** The whole wind-up, for how far drawn back to show it. */
  windupLen: number;
}

export function beginWindup(w: Windup, id: AttackId): void {
  w.pending = id;
  w.windup = ATTACKS[id].windup;
  w.windupLen = ATTACKS[id].windup;
}

/** A stun, a leash or losing you: the attack is off. */
export function cancelWindup(w: Windup): void {
  w.pending = null;
  w.windup = 0;
}

/**
 * Run the clock. Returns the attack that strikes this frame (once, the frame
 * the wind-up runs out), or null while it is still winding up or idle.
 */
export function tickWindup(w: Windup, dt: number): AttackId | null {
  if (w.pending === null) return null;
  w.windup -= dt;
  if (w.windup > 0) return null;
  const id = w.pending;
  w.pending = null;
  w.windup = 0;
  return id;
}

/** 0 at the start of a wind-up, 1 as it strikes; 0 when nothing is coming. */
export function windupProgress(w: Windup): number {
  if (w.pending === null || w.windupLen <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - w.windup / w.windupLen));
}

/**
 * Does a strike land? Decided when it lands, from where the player is then:
 * in reach, and inside the arc around the direction the attacker committed
 * to when it started winding up. Right on top of the attacker always lands.
 */
export function strikeLands(def: AttackDef, ax: number, az: number, aimX: number, aimZ: number, px: number, pz: number): boolean {
  const dx = px - ax;
  const dz = pz - az;
  const dist = Math.hypot(dx, dz);
  if (dist > def.reach) return false;
  if (def.arc >= Math.PI || dist < 0.6) return true;
  const aim = Math.hypot(aimX, aimZ);
  if (aim < 1e-6) return true;
  const cos = (dx * aimX + dz * aimZ) / (dist * aim);
  return Math.acos(Math.max(-1, Math.min(1, cos))) <= def.arc;
}

// ================================================================== blocking

/** Raise the block in the last quarter second before a strike lands and it is a parry. */
export const PARRY_WINDOW = 0.25;

/** `blockHeldFor`: seconds the block has been up when the strike lands. */
export function isParry(blockHeldFor: number): boolean {
  return blockHeldFor >= 0 && blockHeldFor <= PARRY_WINDOW;
}

// ================================================================== the player's melee button

/** A hold shorter than this is a tap: no charge ring, and a quick swing on release. */
export const TAP_TIME = 0.2;

/** The melee button's state. The Game carries these three fields itself. */
export interface MeleeHold {
  charging: boolean;
  /** Seconds the current press has been held. */
  chargeT: number;
  /** A quick swing asked for while the tool was still recovering: it goes as soon as it can. */
  swingQueued: boolean;
}

export interface MeleeFrame {
  /** The button went down this frame. */
  readonly pressed: boolean;
  /** The button is down now. */
  readonly down: boolean;
  readonly dt: number;
  /** The tool has recovered from the last swing. */
  readonly ready: boolean;
  /** Not rooted in a meeting. */
  readonly canAct: boolean;
}

/** What this frame's input comes to: nothing, a swing of either weight, or the charge just filling. */
export type MeleeAction = 'none' | 'light' | 'heavy' | 'charged';

/**
 * One frame of the melee button. A press starts a hold and swings nothing
 * yet; letting go before the charge is ready is a quick swing, after it a
 * heavy one. One press is one swing, never both. A quick swing asked for
 * while the tool recovers waits for it.
 */
export function meleeStep(h: MeleeHold, f: MeleeFrame, powerTime: number): MeleeAction {
  // A release and a fresh press inside one frame: the old press is let go first.
  if (f.pressed && h.charging) {
    const done = release(h, f, powerTime);
    h.charging = f.canAct;
    h.chargeT = 0;
    return done;
  }
  if (f.pressed && f.canAct) {
    h.charging = true;
    h.chargeT = 0;
    return 'none';
  }
  if (h.charging && f.down) {
    const before = h.chargeT;
    h.chargeT += f.dt;
    return before < powerTime && h.chargeT >= powerTime ? 'charged' : 'none';
  }
  if (h.charging) return release(h, f, powerTime);
  if (h.swingQueued && f.ready && f.canAct) {
    h.swingQueued = false;
    return 'light';
  }
  return 'none';
}

function release(h: MeleeHold, f: MeleeFrame, powerTime: number): MeleeAction {
  const held = h.chargeT;
  h.charging = false;
  h.chargeT = 0;
  if (!f.canAct) return 'none';
  if (held >= powerTime) {
    h.swingQueued = false;
    return 'heavy';
  }
  if (f.ready) {
    // This swing answers any press still waiting too: one swing, not two.
    h.swingQueued = false;
    return 'light';
  }
  h.swingQueued = true;
  return 'none';
}

/**
 * Put the button down: a menu, a dialogue or a lost mouse capture came
 * between the press and its release. The release the game sees afterwards
 * belongs to nobody, so nothing half-charged or queued may go off on it.
 */
export function dropHold(h: MeleeHold): void {
  h.charging = false;
  h.chargeT = 0;
  h.swingQueued = false;
}

/** How full the charge ring is: nothing at all until a hold passes a tap. */
export function chargeShown(h: Pick<MeleeHold, 'charging' | 'chargeT'>, powerTime: number): number {
  if (!h.charging || h.chargeT <= TAP_TIME) return 0;
  return Math.min(1, h.chargeT / powerTime);
}

// ================================================================== where it came from

/**
 * The on-screen angle of something at (dx, dz) from the player: 0 straight
 * ahead (the top of the screen), positive clockwise (to the right), PI behind.
 */
export function screenAngle(dx: number, dz: number, yaw: number): number {
  const ahead = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  const side = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  return Math.atan2(side, ahead);
}

// ================================================================== floor markings

/**
 * How visible a marking on the carpet is: it fades in, flickering, until it
 * arms at `armAt` seconds; then it holds steady with a slow pulse. Boss
 * hazards arm and hurt; landing markers never arm (the hit arrives instead).
 */
export function telegraphOpacity(age: number, armAt: number, time: number): number {
  if (age > armAt) return 0.45 + Math.sin(time * 6) * 0.08;
  return Math.min(0.35, (age / armAt) * 0.36) * (0.5 + 0.5 * Math.sin(time * 20));
}
