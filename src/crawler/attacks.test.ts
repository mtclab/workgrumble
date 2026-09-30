import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { type Actor, createActor, type GameCtx, updateActor } from './entities';
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
  field: Int16Array;
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
  windupCue(): void { /* no sound */ }
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
