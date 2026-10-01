import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { type Actor, allyIgnores, createActor, type GameCtx, hurtActor, isFoe, type ProjectileSpec, shrugsOff, spawnsAggro, stun, updateActor, updateAuras } from './entities';
import { actorColor } from './hud';
import { markResolved, shove } from './combat';
import type { Game } from './game';
import { newSave } from './state';
import { floorAwake, type InductionState, STEPS } from './induction';
import { flowField, type Level, TILE } from './level';
import { Rng } from './rng';
import { ATTACKS, ATTACKS_BY_KIND, type AttackClass, type AttackId, BOSS_PATTERNS, type HostileKind } from './windup';

// Speech bubbles are canvas text; the attack logic does not need to see them.
vi.mock('./textures', async (orig) => ({
  ...(await orig<typeof import('./textures')>()),
  textSprite: () => new THREE.Sprite(),
  disposeSprite: () => undefined,
}));

/**
 * Every hit on the player is announced before it lands (docs/SPEC_COMBAT_READ.md).
 *
 * These drive the real enemy AI (updateActor) frame by frame in an empty
 * room and watch what reaches the player: damage, a projectile leaving, a
 * hazard, a root, a summons. Each one must come at least its class's floor
 * after the attacker began a visible wind-up. An attack that skips the
 * wind-up (or has it set to 0) strikes in the same frame it is announced,
 * and fails here.
 */

// The spec's floors, written out here: the table cannot vouch for itself.
const SPEC_FLOOR: Record<AttackClass, number> = { melee: 0.35, contact: 0.35, ranged: 0.3, boss: 0.6 };
const DT = 1 / 60;
const N = 30;

/** An empty, walled room N cells square: room 0 (so a boss never leashes). */
function openRoom(): Level {
  const floor = new Uint8Array(N * N);
  const solid = new Uint8Array(N * N);
  const opaque = new Uint8Array(N * N);
  const roomOf = new Int16Array(N * N).fill(-1);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      floor[i] = 1;
      const wall = x === 0 || z === 0 || x === N - 1 || z === N - 1;
      solid[i] = wall ? 1 : 0;
      opaque[i] = wall ? 1 : 0;
      if (!wall) roomOf[i] = 0;
    }
  }
  return {
    w: N, h: N, floor, solid, opaque, roomOf,
    rooms: [{ x: 1, y: 1, w: N - 2, h: N - 2, kind: 'boss', id: 0 }],
    interactables: [], spawns: [], start: { x: N, z: N }, bossSpawn: { x: N, z: N },
    lightSpots: [], group: new THREE.Group(), seen: new Uint8Array(N * N),
  };
}

type Effect = 'hurt' | 'fire' | 'hazard' | 'root' | 'summon';

interface Hit {
  readonly effect: Effect;
  readonly at: number;
}

class Arena implements GameCtx {
  readonly level = openRoom();
  readonly scene = new THREE.Scene();
  readonly playerPos = new THREE.Vector3(N, 0, N);
  readonly actors: Actor[] = [];
  readonly floor = 0;
  readonly difficulty = 1;
  time = 0;
  readonly stealth = 0;
  readonly invisible = false;
  readonly staffStanding = 0;
  readonly managementStanding = 0;
  readonly findings = 0;
  /** Awake unless a test says the induction is still running. */
  floorAwake = true;
  field: Int16Array;
  readonly save = newSave(7);
  readonly hits: Hit[] = [];
  readonly rng = new Rng(7);

  constructor() {
    this.field = flowField(this.level, this.playerPos.x, this.playerPos.z, 40);
  }

  private note(effect: Effect): void {
    this.hits.push({ effect, at: this.time });
  }

  hurtPlayer(): void { this.note('hurt'); }
  fire(p: { hostile: boolean }): void { if (p.hostile) this.note('fire'); }
  hazard(): void { this.note('hazard'); }
  markResolved(a: Actor): void { markResolved(this as unknown as Game, a); }
  rootPlayer(): void { this.note('root'); }
  spawn(): Actor | null { this.note('summon'); return null; }
  enqueueTicket(): void { /* joins the queue: not a hit of its own */ }
  floatText(): void { /* nothing to draw */ }
  healPlayer(): void { /* not in these fights */ }
  addActionItem(): void { /* rides on the manager's hit */ }
  shake(): void { /* camera only */ }
  giveItem(): void { /* not in these fights */ }
  giveAmmo(): void { /* not in these fights */ }
  helperDamageMult(): number { return 1; }
  healerFrequency(): number { return 1; }
  kitchenStanding(): number { return 0; }
  ticketTitle(): string { return 'My printer'; }
  noticed(): void { /* no HUD */ }
  bossStart(): void { /* no music */ }
  bossLeash(): void { /* never leaves the room */ }
  bossParley(): void { /* not open to talks */ }
  stealRep(): number { return 0; }
  /** When each wind-up sound was asked for. */
  readonly cues: number[] = [];
  windupCue(): void { this.cues.push(this.time); }
  telegraph(): void { /* a marking, not a hit */ }

  /** One of `kind` `dist` metres due north of the player, after them and ready to go. */
  put(kind: HostileKind, dist: number): Actor {
    const a = createActor(this, kind, this.playerPos.x, this.playerPos.z - dist, 0, this.rng, 10);
    a.aggro = true;
    a.docile = false;
    a.cooldown = 0;
    // Keep the sums simple: no blinking away, no turret summons, no invite storms.
    a.blinkIn = 999;
    a.summonIn = 999;
    this.actors.push(a);
    return a;
  }

  /** A boss that only ever does `pattern` (or only slams, with null). */
  putBoss(pattern: (typeof BOSS_PATTERNS)[number] | null, dist: number): Actor {
    const a = this.put('boss', dist);
    const def = a.boss;
    if (def === null) throw new Error('no boss');
    a.boss = { ...def, patterns: pattern === null ? ['invites'] : [pattern] };
    a.bossActive = true;
    a.patternIn = pattern === null ? 999 : 0;
    a.cooldown = pattern === null ? 0 : 999;
    return a;
  }
}

interface Run {
  /** Hits that came without a wind-up of at least the floor before them, with what went wrong. */
  readonly early: string[];
  /** Which attacks landed something. */
  readonly landed: Set<AttackId>;
  readonly hits: number;
}

/**
 * Play `seconds` of the fight. After every frame, note when a wind-up
 * began; every hit during a frame is checked against the wind-up it
 * belongs to. A charge's run is part of its wind-up's attack.
 */
function fight(ctx: Arena, a: Actor, seconds: number, each?: (t: number) => void): Run {
  const early: string[] = [];
  const landed = new Set<AttackId>();
  let announced: { id: AttackId; at: number } | null = null;
  let prevPending: AttackId | null = null;
  let prevWindup = 0;
  let seen = 0;
  for (let t = 0; t < seconds; t += DT) {
    ctx.time += DT;
    each?.(ctx.time);
    updateActor(ctx, a, DT);
    for (; seen < ctx.hits.length; seen++) {
      const h = ctx.hits[seen];
      if (h === undefined) continue;
      if (announced === null) {
        early.push(`${h.effect} at ${h.at.toFixed(3)} s with no wind-up`);
        continue;
      }
      const floor = SPEC_FLOOR[ATTACKS[announced.id].cls];
      if (h.at - announced.at < floor - 1e-9) early.push(`${announced.id}: ${h.effect} ${(h.at - announced.at).toFixed(3)} s after the tell (floor ${floor})`);
      landed.add(announced.id);
    }
    // A wind-up began this frame: nothing was pending, or the clock was wound back up.
    if (a.pending !== null && (prevPending === null || a.windup > prevWindup)) announced = { id: a.pending, at: ctx.time };
    else if (a.pending === null && a.charging <= 0) announced = null;
    prevPending = a.pending;
    prevWindup = a.windup;
    if (a.resolved) break;
  }
  return { early, landed, hits: ctx.hits.length };
}

/** Where to stand each attack's attacker so that attack is the one it uses. */
const RANGE: Record<Exclude<AttackId, `boss.${string}`>, number> = {
  'user.melee': 1.9,
  'manager.melee': 2.0,
  'customer.shove': 1.5,
  'vendor.grab': 1.3,
  'reply.dive': 1.0,
  'mosquito.bite': 1.0,
  'caller.throw': 8,
  'customer.throw': 8,
  'jam.volley': 8,
  'manager.invite': 8,
  'consultant.deck': 8,
  'shadowit.code': 8,
  'turret.code': 8,
  'chatbot.chat': 8,
  'dummy.swing': 1.9,
};

const GRUNTS = (Object.entries(ATTACKS_BY_KIND) as [HostileKind, readonly AttackId[]][])
  .filter(([kind]) => kind !== 'boss')
  .flatMap(([kind, ids]) => ids.map((id) => [id, kind] as const));

describe('every attack is wound up before it lands', () => {
  it.each(GRUNTS)('%s (%s)', (id, kind) => {
    const ctx = new Arena();
    const a = ctx.put(kind, RANGE[id as keyof typeof RANGE]);
    const run = fight(ctx, a, 6);
    expect(run.early).toEqual([]);
    expect([...run.landed], 'the attack happened at all').toContain(id);
  });

  it('boss.slam', () => {
    const ctx = new Arena();
    const a = ctx.putBoss(null, 2.0);
    const run = fight(ctx, a, 4);
    expect(run.early).toEqual([]);
    expect([...run.landed]).toContain('boss.slam');
  });

  it.each(BOSS_PATTERNS)('boss.%s', (p) => {
    const ctx = new Arena();
    const a = ctx.putBoss(p, 6);
    const run = fight(ctx, a, 3);
    expect(run.early).toEqual([]);
    expect([...run.landed], 'the pattern did something').toContain(`boss.${p}`);
  });
});

describe('the strike is decided where the player is when it lands', () => {
  /** A user squares up; once the wind-up shows, the player does `dodge` (or stands). */
  function swing(dodge: (p: THREE.Vector3) => void): { hurt: number; struck: boolean } {
    const ctx = new Arena();
    const a = ctx.put('user', 1.9);
    let started = false;
    let struck = false;
    for (let t = 0; t < 1.1 && !struck; t += DT) {
      ctx.time += DT;
      const was = a.pending;
      updateActor(ctx, a, DT);
      if (!started && a.pending !== null) {
        started = true;
        dodge(ctx.playerPos);
      }
      if (was !== null && a.pending === null) struck = true;
    }
    return { hurt: ctx.hits.filter((h) => h.effect === 'hurt').length, struck };
  }

  it('standing still, the swing lands', () => {
    const r = swing(() => undefined);
    expect(r.struck).toBe(true);
    expect(r.hurt).toBe(1);
  });

  it('strafed out during the wind-up, the swing comes and misses', () => {
    const r = swing((p) => { p.x += 2.3; });
    expect(r.struck).toBe(true);
    expect(r.hurt).toBe(0);
  });

  it('stepped back out of reach, it misses', () => {
    const r = swing((p) => { p.z += 1.2; });
    expect(r.struck).toBe(true);
    expect(r.hurt).toBe(0);
  });

  it('the QUICK sync runs where the boss faced as it crouched: step out of the line', () => {
    const run = (sidestep: boolean): number => {
      const ctx = new Arena();
      const a = ctx.putBoss('charge', 6);
      let moved = false;
      fight(ctx, a, 2.5, () => {
        if (sidestep && !moved && a.pending === 'boss.charge') {
          moved = true;
          ctx.playerPos.x += 3 * TILE;
        }
      });
      return ctx.hits.filter((h) => h.effect === 'hurt').length;
    };
    expect(run(false)).toBe(1);
    expect(run(true)).toBe(0);
  });
});

describe('a wind-up ends with the one who wound it up', () => {
  it('resolved or talked down mid-wind-up: nothing is pending and no warm glow is left', () => {
    for (const kind of ['user', 'reply'] as const) {
      const ctx = new Arena();
      const a = ctx.put(kind, kind === 'user' ? 1.9 : 1.0);
      for (let i = 0; i < 12; i++) {
        ctx.time += DT;
        updateActor(ctx, a, DT);
      }
      expect(a.pending, kind).not.toBeNull();
      // The glow is on while it winds up.
      const glowing = a.rig !== null ? a.rig.materials.some((m) => m.emissive.getHex() !== 0) : (a.glowMats ?? []).some((g) => g.mat.emissive.getHex() !== g.base);
      expect(glowing, kind).toBe(true);
      // Talked down: resolved and calm, no flash of its own.
      a.resolved = true;
      a.calm = true;
      a.removeIn = 2;
      ctx.time += DT;
      updateActor(ctx, a, DT);
      expect(a.pending, kind).toBeNull();
      if (a.rig !== null) for (const m of a.rig.materials) expect(m.emissive.getHex(), kind).toBe(a.rig.glow);
      else for (const g of a.glowMats ?? []) expect(g.mat.emissive.getHex(), kind).toBe(g.base);
    }
  });
});

describe('a flinch sets a wind-up back to its start', () => {
  it('after a short stun the whole tell plays again, sound and all, before anything lands', () => {
    const ctx = new Arena();
    const a = ctx.put('user', 1.9);
    // Most of the way through the wind-up...
    for (let t = 0; t < 0.3; t += DT) {
      ctx.time += DT;
      updateActor(ctx, a, DT);
    }
    expect(a.pending).toBe('user.melee');
    const cuesBefore = ctx.cues.length;
    // ...a 0.3 s flinch (cable management), shorter than a stagger.
    stun(a, 0.3);
    let stunEnd = -1;
    for (let t = 0; t < 1.5 && ctx.hits.length === 0; t += DT) {
      ctx.time += DT;
      const was = a.stunned;
      updateActor(ctx, a, DT);
      if (was > 0 && a.stunned <= 0) stunEnd = ctx.time;
    }
    expect(stunEnd).toBeGreaterThan(0);
    expect(ctx.cues.length, 'the sound again as it starts over').toBe(cuesBefore + 1);
    expect(ctx.hits).toHaveLength(1);
    expect(ctx.hits[0]?.at ?? 0).toBeGreaterThanOrEqual(stunEnd + ATTACKS['user.melee'].windup - 1e-9);
  });

  it('a stagger (a shove, a parry) takes the attack away altogether', () => {
    const ctx = new Arena();
    const a = ctx.put('user', 1.9);
    for (let t = 0; t < 0.3; t += DT) {
      ctx.time += DT;
      updateActor(ctx, a, DT);
    }
    stun(a, 0.5);
    expect(a.pending).toBeNull();
  });
});

describe('boss pacing', () => {
  it('the next pattern comes as long after a strike as it always did: the wind-up only adds warning', () => {
    const ctx = new Arena();
    const a = ctx.putBoss('lasers', 6);
    const strikes: number[] = [];
    const starts: number[] = [];
    let prev: AttackId | null = null;
    for (let t = 0; t < 8; t += DT) {
      ctx.time += DT;
      updateActor(ctx, a, DT);
      if (prev === null && a.pending !== null) starts.push(ctx.time);
      if (prev !== null && a.pending === null) strikes.push(ctx.time);
      prev = a.pending;
    }
    expect(strikes.length).toBeGreaterThanOrEqual(2);
    // The lasers' own gap (2.2 s, calm) runs from the strike to the next wind-up.
    const first = strikes[0] ?? 0;
    const next = starts.find((s) => s > first) ?? 0;
    expect(next - first).toBeGreaterThanOrEqual(2.2 - DT - 1e-9);
    expect(next - first).toBeLessThan(2.2 + 2 * DT);
  });
});

describe('induction day: nothing on the floor notices a new starter before the block and parry are done', () => {
  /** A `kind` 4 m in front of the player, in plain sight, for three seconds, with the induction at `st`. */
  function watch(kind: HostileKind, st: InductionState | null): { aggro: boolean; hits: number; wound: boolean } {
    const ctx = new Arena();
    ctx.floorAwake = floorAwake(st);
    const a = createActor(ctx, kind, ctx.playerPos.x, ctx.playerPos.z - 4, 0, ctx.rng, 10);
    a.docile = false;
    ctx.actors.push(a);
    let wound = false;
    for (let t = 0; t < 3; t += DT) {
      ctx.time += DT;
      updateActor(ctx, a, DT);
      if (a.pending !== null) wound = true;
    }
    return { aggro: a.aggro, hits: ctx.hits.length, wound };
  }

  const at = (step: InductionState['step']): InductionState => ({ step, looked: 0, sanityTold: false });
  const BEFORE = STEPS.slice(0, STEPS.indexOf('parry') + 1);

  it.each(['user', 'caller', 'manager', 'customer', 'reply', 'mosquito', 'chatbot'] as const)('%s: unaware through step 6, noticing from step 7', (kind) => {
    for (const step of BEFORE) {
      const r = watch(kind, at(step));
      expect(r.aggro, step).toBe(false);
      // No approach, no wind-up, nothing thrown: it has not noticed anybody.
      expect(r.wound, step).toBe(false);
      expect(r.hits, step).toBe(0);
    }
    for (const step of ['ticket', 'map', 'done'] as const) expect(watch(kind, at(step)).aggro, step).toBe(true);
    // No induction at all (skipped, finished, an older career): the floor as it always was.
    expect(watch(kind, null).aggro).toBe(true);
  });

  it('the boss does not start when you walk into its room before step 6 is done', () => {
    const start = (st: InductionState | null): boolean => {
      const ctx = new Arena();
      ctx.floorAwake = floorAwake(st);
      const a = createActor(ctx, 'boss', ctx.playerPos.x, ctx.playerPos.z - 6, 0, ctx.rng, 10);
      ctx.actors.push(a);
      for (let i = 0; i < 30; i++) {
        ctx.time += DT;
        updateActor(ctx, a, DT);
      }
      return a.bossActive;
    };
    expect(start(at('block'))).toBe(false);
    expect(start(at('ticket'))).toBe(true);
  });

  it('the training dummy swings only while it is set on you, and like everyone else', () => {
    const ctx = new Arena();
    const a = createActor(ctx, 'dummy', ctx.playerPos.x, ctx.playerPos.z - 1.9, 0, ctx.rng, 10);
    ctx.actors.push(a);
    for (let t = 0; t < 3; t += DT) {
      ctx.time += DT;
      updateActor(ctx, a, DT);
    }
    expect(ctx.hits).toEqual([]);
    const home = a.pos.clone();
    a.aggro = true;
    a.cooldown = 0;
    const run = fight(ctx, a, 3);
    expect(run.early).toEqual([]);
    expect([...run.landed]).toContain('dummy.swing');
    // Bolted down: it never took a step.
    expect(a.pos.distanceTo(home)).toBeLessThan(1e-9);
  });
});

describe('induction day: the corner office stays shut, and the dummy is not trouble', () => {
  it('a boss hit before the floor wakes does no damage and starts no fight; after, it does both', () => {
    const hit = (awake: boolean): { hp: number; max: number; active: boolean } => {
      const ctx = new Arena();
      ctx.floorAwake = awake;
      const a = createActor(ctx, 'boss', ctx.playerPos.x, ctx.playerPos.z - 2, 0, ctx.rng, 10);
      ctx.actors.push(a);
      hurtActor(ctx, a, 40, null);
      return { hp: a.hp, max: a.maxHp, active: a.bossActive };
    };
    const asleep = hit(false);
    expect(asleep.hp).toBe(asleep.max);
    expect(asleep.active).toBe(false);
    const awake = hit(true);
    expect(awake.hp).toBeLessThan(awake.max);
    expect(awake.active).toBe(true);
  });

  it('summoned trouble arrives calm while the floor sleeps', () => {
    expect(spawnsAggro({ floorAwake: false })).toBe(false);
    expect(spawnsAggro({ floorAwake: true })).toBe(true);
  });

  it('the dummy is no foe: no consultant shields it, and its map dot is not a hostile red', () => {
    const ctx = new Arena();
    const c = createActor(ctx, 'consultant', ctx.playerPos.x, ctx.playerPos.z - 4, 0, ctx.rng, 10);
    const d = createActor(ctx, 'dummy', ctx.playerPos.x + 1, ctx.playerPos.z - 4, 0, ctx.rng, 10);
    const u = createActor(ctx, 'user', ctx.playerPos.x - 1, ctx.playerPos.z - 4, 0, ctx.rng, 10);
    updateAuras([c, d, u]);
    expect(u.shielded).toBe(true);
    expect(d.shielded).toBe(false);
    expect(isFoe(d)).toBe(false);
    expect(isFoe(u)).toBe(true);
    expect(actorColor(d)).not.toBe(actorColor(u));
    expect(actorColor(d)).not.toMatch(/^#ff/i);
  });
});

describe('induction day: nothing reaches the sleeping floor by a side door', () => {
  /** A recruited `role` beside the player and `foe` 5 m off; who does the ally shoot at in 4 s? */
  function ally(role: 'security' | 'sysadmin', foe: 'user' | 'dummy', awake: boolean, foeAggro: boolean): { shots: number; aggro: boolean } {
    const ctx = new Arena();
    ctx.floorAwake = awake;
    const h = createActor(ctx, 'helper', ctx.playerPos.x + 1, ctx.playerPos.z, 0, ctx.rng, 10, { role });
    h.recruited = true;
    h.cooldown = 0;
    const f = createActor(ctx, foe, ctx.playerPos.x, ctx.playerPos.z - 5, 0, ctx.rng, 10);
    f.aggro = foeAggro;
    f.docile = false;
    ctx.actors.push(h, f);
    let shots = 0;
    ctx.fire = (p: ProjectileSpec): void => { if (!p.hostile && p.owner === h) shots++; };
    for (let t = 0; t < 4; t += DT) {
      ctx.time += DT;
      updateActor(ctx, h, DT);
    }
    return { shots, aggro: f.aggro };
  }

  it('the IT crowd leaves the calm alone while the floor sleeps, and the dummy alone always', () => {
    for (const role of ['security', 'sysadmin'] as const) {
      expect(ally(role, 'user', false, false), role).toEqual({ shots: 0, aggro: false });
      // The dummy, mid-lesson and swinging: still not theirs to stun.
      expect(ally(role, 'dummy', true, true).shots, role).toBe(0);
      // The control: somebody after you on an awake floor gets shot at.
      expect(ally(role, 'user', true, true).shots, role).toBeGreaterThan(0);
    }
    const ctx = new Arena();
    const calm = createActor(ctx, 'user', 0, 0, 0, ctx.rng, 10);
    const dummy = createActor(ctx, 'dummy', 0, 0, 0, ctx.rng, 10);
    expect(allyIgnores({ floorAwake: false }, calm)).toBe(true);
    expect(allyIgnores({ floorAwake: true }, calm)).toBe(false);
    calm.aggro = true;
    expect(allyIgnores({ floorAwake: false }, calm)).toBe(false);
    expect(allyIgnores({ floorAwake: true }, dummy)).toBe(true);
  });

  it('poison does not bleed a boss nobody may touch yet', () => {
    const bleed = (awake: boolean): { hp: number; max: number; poison: number } => {
      const ctx = new Arena();
      ctx.floorAwake = awake;
      const b = createActor(ctx, 'boss', ctx.playerPos.x + 20, ctx.playerPos.z + 20, 99, ctx.rng, 10);
      if (awake) b.bossActive = true;
      b.poisonT = 6;
      b.poisonDps = 50;
      ctx.actors.push(b);
      for (let t = 0; t < 1; t += DT) {
        ctx.time += DT;
        updateActor(ctx, b, DT);
      }
      return { hp: b.hp, max: b.maxHp, poison: b.poisonT };
    };
    const asleep = bleed(false);
    expect(asleep.hp).toBe(asleep.max);
    expect(asleep.poison).toBe(0);
    const awake = bleed(true);
    expect(awake.hp).toBeLessThan(awake.max);
    const ctx = new Arena();
    const b = createActor(ctx, 'boss', 0, 0, 0, ctx.rng, 10);
    expect(shrugsOff({ floorAwake: false }, b)).toBe(true);
    expect(shrugsOff({ floorAwake: true }, b)).toBe(false);
  });

  it('a manager\'s reinforcements arrive calm while the floor sleeps', () => {
    const reinforce = (awake: boolean): boolean[] => {
      const ctx = new Arena();
      ctx.floorAwake = awake;
      const m = ctx.put('manager', 10);
      m.summonIn = 0;
      m.cooldown = 999;
      const came: Actor[] = [];
      const spawn: GameCtx['spawn'] = (kind, x, z, room) => {
        const s = createActor(ctx, kind, x, z, room, ctx.rng, 10);
        came.push(s);
        return s;
      };
      (ctx as { spawn: GameCtx['spawn'] }).spawn = spawn;
      for (let t = 0; t < 0.5; t += DT) {
        ctx.time += DT;
        updateActor(ctx, m, DT);
      }
      return came.map((c) => c.aggro);
    };
    expect(reinforce(false)).toEqual([false]);
    expect(reinforce(true)).toEqual([true]);
  });
});


describe('interrupts leave a colleague a chance to finish their attack', () => {
  it('a user still lands an attack within a few seconds of shoves every 0.8 s', () => {
    const ctx = new Arena();
    const a = ctx.put('user', 1.9);
    const g = { actors: ctx.actors, scene: ctx.scene, fxMeshes: [], save: newSave(7), player: { pos: ctx.playerPos, yaw: 0 } } as unknown as Game;
    let next = 0.3;
    fight(ctx, a, 4, (t) => {
      // Hold the range fixed to measure interruptions rather than knockback.
      a.pos.set(ctx.playerPos.x, 0, ctx.playerPos.z - 1.9);
      a.push.set(0, 0, 0);
      if (t >= next) { shove(g); next += 0.8; }
    });
    expect(ctx.hits.filter((h) => h.effect === 'hurt').length, 'the user can finish a swing').toBeGreaterThan(0);
  });

  it('quick cable-management flinches restart a wind-up only once', () => {
    const ctx = new Arena();
    const a = ctx.put('user', 1.9);
    let next = 0.3;
    fight(ctx, a, 3, (t) => {
      if (t >= next) { stun(a, 0.3); next += 0.35; }
    });
    expect(ctx.hits.filter((h) => h.effect === 'hurt').length, 'quick flinches let the swing finish').toBeGreaterThan(0);
  });
});


describe('Budget Freeze checks where you are at release', () => {
  it.each(['range', 'wall', 'standing'] as const)('%s during the wind-up', (dodge) => {
    const ctx = new Arena();
    const a = ctx.putBoss('freeze', 6);
    let moved = false;
    fight(ctx, a, 1.5, () => {
      if (moved || a.pending !== 'boss.freeze') return;
      moved = true;
      if (dodge === 'range') ctx.playerPos.z += 8;
      if (dodge === 'wall') ctx.level.opaque.fill(1, 14 * N, 15 * N);
    });
    expect(ctx.hits.filter((h) => h.effect === 'root').length, 'freeze only reaches a player still in sight and range').toBe(dodge === 'standing' ? 1 : 0);
  });
});


it('a delivered Reply-All stays gone in the saved floor', () => {
  const ctx = new Arena();
  const a = ctx.put('reply', 1);
  a.spawnIndex = 12;
  fight(ctx, a, 2);
  expect(a.expired).toBe(true);
  expect(JSON.parse(JSON.stringify(ctx.save.floorState)) as { resolved: number[] }).toMatchObject({ resolved: [12] });
  expect(ctx.save.stats.resolvedField, 'delivery earns no resolution credit').toBe(0);
});
