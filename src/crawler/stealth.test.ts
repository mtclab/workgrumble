import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { markResolved } from './combat';
import { type Actor, type ActorKind, createActor, type GameCtx, updateActor } from './entities';
import type { Game } from './game';
import { flowField, type Level } from './level';
import { MissionRun, payout, QUIET_BONUS, type Outcome } from './mission';
import { STAPLER, VENDOR_DAY } from './missions';
import { Rng } from './rng';
import { ALERT, CONE, INVESTIGATE, inCone, NOISE, type NoiseKind, sightRange, type Sort, type Tier, Watch, type WatchView } from './stealth';

// Speech bubbles and markers are canvas text; the rules do not need to see them.
vi.mock('./textures', async (orig) => ({
  ...(await orig<typeof import('./textures')>()),
  textSprite: () => new THREE.Sprite(),
  disposeSprite: () => undefined,
}));

/**
 * The 0.3.0 spike's stealth (docs/SPEC_HELLDESK_030.md 4.1, 4.4, 2.3), on the
 * real enemy AI: `updateActor` frame by frame with a mission's `Watch` as the
 * game's, in an empty walled room (with an optional wall down the middle).
 */
const DT = 1 / 60;
const N = 30;

function room(wallAt: number | null = null): Level {
  const floor = new Uint8Array(N * N);
  const solid = new Uint8Array(N * N);
  const opaque = new Uint8Array(N * N);
  const roomOf = new Int16Array(N * N).fill(-1);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      const wall = x === 0 || z === 0 || x === N - 1 || z === N - 1 || (wallAt !== null && z === wallAt && x > 2 && x < N - 3);
      floor[i] = wall ? 0 : 1;
      solid[i] = wall ? 1 : 0;
      opaque[i] = wall ? 1 : 0;
      if (!wall) roomOf[i] = 0;
    }
  }
  return {
    w: N, h: N, floor, solid, opaque, roomOf,
    rooms: [{ x: 1, y: 1, w: N - 2, h: N - 2, kind: 'office', id: 0 }],
    interactables: [], spawns: [], start: { x: N, z: N }, bossSpawn: { x: N, z: N },
    lightSpots: [], group: new THREE.Group(), seen: new Uint8Array(N * N),
  };
}

type Effect = 'hurt' | 'fire' | 'hazard' | 'root';

class Floor implements GameCtx {
  readonly level: Level;
  readonly scene = new THREE.Scene();
  readonly playerPos = new THREE.Vector3(N, 0, N);
  readonly actors: Actor[] = [];
  readonly floor = 0;
  readonly difficulty = 1;
  time = 0;
  combatAt = -Infinity;
  readonly stealth = 0;
  readonly invisible = false;
  readonly staffStanding = 0;
  readonly managementStanding = 0;
  readonly findings = 0;
  readonly floorAwake = true;
  field: Int16Array;
  readonly hits: { effect: Effect; at: number }[] = [];
  readonly rng = new Rng(11);
  readonly tiers: { to: Tier; from: Tier; at: number }[] = [];
  crouching = false;
  readonly watch: Watch;

  constructor(wallAt: number | null = null, start: Tier = 0) {
    this.level = room(wallAt);
    this.field = flowField(this.level, this.playerPos.x, this.playerPos.z, 40);
    const view = (): WatchView => ({ x: this.playerPos.x, z: this.playerPos.z, crouching: this.crouching, stealth: 0, invisible: false, time: this.time });
    this.watch = new Watch(this.level, { view, tierChanged: (to, from) => this.tiers.push({ to, from, at: this.time }) }, start);
  }

  private note(effect: Effect): void { this.hits.push({ effect, at: this.time }); }
  hurtPlayer(): void { this.note('hurt'); }
  fire(p: { hostile: boolean }): void { if (p.hostile) this.note('fire'); }
  hazard(): void { this.note('hazard'); }
  rootPlayer(): void { this.note('root'); }
  markResolved(a: Actor): void { markResolved(this as unknown as Game, a); }
  spawn(): Actor | null { return null; }
  enqueueTicket(): void { /* rides on a hit */ }
  floatText(): void { /* nothing to draw */ }
  healPlayer(): void { /* none here */ }
  addActionItem(): void { /* rides on a hit */ }
  shake(): void { /* camera only */ }
  giveItem(): void { /* none here */ }
  giveAmmo(): void { /* none here */ }
  helperDamageMult(): number { return 1; }
  healerFrequency(): number { return 1; }
  kitchenStanding(): number { return 0; }
  ticketTitle(): string { return 'My printer'; }
  /** The game's: anyone who turns on you is Alert as far as the mission goes. */
  noticed(a: Actor): void { this.watch.aggroed(a, this.time); }
  bossStart(): void { /* no bosses */ }
  bossLeash(): void { /* no bosses */ }
  bossParley(): void { /* no bosses */ }
  stealRep(): number { return 0; }
  windupCue(): void { /* sound only */ }
  telegraph(): void { /* a marking, not a hit */ }

  /** One of `kind` at (x, z) facing `yaw`, calm, watched as `sort`. */
  put(kind: ActorKind, x: number, z: number, yaw: number, sort: Sort = 'desk'): Actor {
    const a = createActor(this, kind, x, z, 0, this.rng, 10);
    a.docile = false;
    a.cooldown = 0;
    a.blinkIn = 999;
    a.summonIn = 999;
    a.yaw = yaw;
    this.actors.push(a);
    this.watch.add(a, sort);
    return a;
  }

  /** One `kind` `dist` m due north of the player, facing them. */
  facing(kind: ActorKind, dist: number): Actor {
    // Forward is (sin yaw, cos yaw): facing +z, toward the player south of them.
    return this.put(kind, this.playerPos.x, this.playerPos.z - dist, 0);
  }

  step(seconds: number, each?: (t: number) => void): void {
    for (let t = 0; t < seconds; t += DT) {
      this.time += DT;
      each?.(this.time);
      for (const a of this.actors) updateActor(this, a, DT);
    }
  }

  susp(a: Actor): number {
    return this.watch.watchers.get(a.id)?.suspicion ?? -1;
  }
}

describe('suspicion', () => {
  it('never rises with no line of sight and no noise', () => {
    // Behind a wall, close, facing the player: nothing.
    const walled = new Floor(13);
    const a = walled.put('manager', N, N - 4, 0);
    walled.step(6);
    expect(walled.susp(a)).toBe(0);
    expect(a.aggro).toBe(false);
    // In the open but outside the cone (the player behind them): nothing either.
    const open = new Floor();
    const b = open.put('manager', N, N - 4, Math.PI);
    open.step(6);
    expect(inCone(b.yaw, b.pos.x, b.pos.z, N, N)).toBe(false);
    expect(open.susp(b)).toBe(0);
    expect(open.watch.tier).toBe(0);
    // The control: the same person turned round sees you, and it rises.
    const seen = new Floor();
    const c = seen.put('manager', N, N - 4, 0);
    seen.step(0.5);
    expect(seen.susp(c)).toBeGreaterThan(0);
  });

  it('sees in a 110 degree cone, as far as the kind sees', () => {
    expect(inCone(0, 0, 0, Math.sin(CONE / 2 - 0.02) * 5, Math.cos(CONE / 2 - 0.02) * 5)).toBe(true);
    expect(inCone(0, 0, 0, Math.sin(CONE / 2 + 0.02) * 5, Math.cos(CONE / 2 + 0.02) * 5)).toBe(false);
    expect(sightRange('user')).toBe(9);
    expect(sightRange('manager')).toBe(13);
    const ctx = new Floor();
    const far = ctx.facing('user', 10);
    ctx.step(2);
    expect(ctx.susp(far), 'a user does not see 10 m').toBe(0);
  });

  it('crouching halves the rise', () => {
    const rise = (crouch: boolean): number => {
      const ctx = new Floor();
      ctx.crouching = crouch;
      const a = ctx.facing('user', 4);
      ctx.step(0.5);
      return ctx.susp(a);
    };
    const standing = rise(false);
    const crouched = rise(true);
    expect(standing).toBeGreaterThan(5);
    expect(standing).toBeLessThan(INVESTIGATE);
    expect(crouched / standing).toBeCloseTo(0.5, 2);
  });

  it.each(Object.keys(NOISE) as NoiseKind[])('a %s noise inside its radius jumps by its amount and turns them to the spot', (kind) => {
    const n = NOISE[kind];
    const ctx = new Floor();
    // Facing away from where the noise will be, out of sight of the player.
    const a = ctx.put('user', N, N - (n.radius - 1), Math.PI);
    const outside = ctx.put('user', N + 4, N - (n.radius + 4), Math.PI);
    ctx.watch.noise(kind, N, N, ctx.time);
    expect(ctx.susp(a)).toBe(n.jump);
    expect(Math.abs(Math.atan2(N - a.pos.x, N - a.pos.z) - a.yaw)).toBeLessThan(1e-9);
    expect(ctx.susp(outside), 'outside the radius').toBe(0);
    expect(outside.yaw).toBe(Math.PI);
    // Over Investigate, they walk to the SPOT (not to wherever you are now).
    if (n.jump >= INVESTIGATE) {
      ctx.playerPos.set(N + 10, 0, N + 10);
      ctx.step(1.5);
      expect(Math.hypot(a.pos.x - N, a.pos.z - N)).toBeLessThan(n.radius - 1.5);
    }
  });

  it('decays out of sight below Investigate, and not above it', () => {
    const ctx = new Floor();
    const a = ctx.put('user', N, N - 4, Math.PI);
    ctx.watch.noise('sprint', N, N, ctx.time);
    ctx.playerPos.set(N + 20, 0, N + 20);
    ctx.step(3);
    expect(ctx.susp(a)).toBe(0);
    const b = ctx.put('user', N, N - 4, Math.PI);
    ctx.watch.noise('gun', N, N, ctx.time);
    ctx.step(3);
    expect(ctx.susp(b)).toBe(60);
  });
});

describe('readable: nobody goes from Quiet to striking the player inside 1.5 s', () => {
  const KINDS: ActorKind[] = ['user', 'caller', 'customer', 'manager', 'consultant', 'shadowit', 'vendor', 'chatbot', 'jam'];
  const SCENES: { name: string; each: (ctx: Floor) => (t: number) => void }[] = [
    { name: 'standing in view', each: () => () => undefined },
    { name: 'sprinting in view', each: (ctx) => { let next = 0; return (t) => { if (t >= next) { ctx.watch.noise('sprint', ctx.playerPos.x, ctx.playerPos.z, t); next = t + 1; } }; } },
    { name: 'firing every 0.1 s', each: (ctx) => { let next = 0; return (t) => { if (t >= next) { ctx.watch.noise('gun', ctx.playerPos.x, ctx.playerPos.z, t); next = t + 0.1; } }; } },
  ];
  for (const kind of KINDS) {
    for (const dist of [1.6, 4, 8]) {
      it.each(SCENES)(`${kind} at ${dist} m: $name`, ({ each }) => {
        const ctx = new Floor();
        const a = ctx.facing(kind, dist);
        ctx.step(1.5, each(ctx));
        expect(ctx.hits.map((h) => `${h.effect} at ${h.at.toFixed(2)} s`), `${a.name}`).toEqual([]);
      });
    }
  }

  it('the control: a user in view does strike in the end, after Alert', () => {
    const ctx = new Floor();
    const a = ctx.facing('user', 1.6);
    let alertAt = -1;
    ctx.step(6, () => { if (alertAt < 0 && a.aggro) alertAt = ctx.time; });
    expect(alertAt).toBeGreaterThan(0);
    const first = ctx.hits[0];
    expect(first?.effect).toBe('hurt');
    // The Alert comes before the first strike by the pause and the wind-up.
    expect((first?.at ?? 0) - alertAt).toBeGreaterThanOrEqual(0.5 + 0.35 - 1e-9);
  });
});

describe('escalation', () => {
  it('Alert by one person marks the people in earshot Noticed (walls halve it); two Alerts escalate', () => {
    // A wall across row 16 (z 32-34), the player at z 30.
    const ctx = new Floor(16);
    const a = ctx.put('user', N, N - 2, 0);
    // 8 m off in the open: in earshot. Out of the player's sight (facing away).
    const near = ctx.put('user', N + 8, N - 2, -Math.PI / 2);
    // 8 m off behind the wall: half earshot is 6 m, so not.
    const walled = ctx.put('user', N, N + 6, 0);
    // 14 m off in the open: out of earshot.
    const far = ctx.put('user', N - 14, N - 2, Math.PI / 2);
    ctx.watch.aggroed(a, ctx.time);
    expect(ctx.watch.tier).toBe(2);
    expect(ctx.susp(near)).toBeGreaterThanOrEqual(INVESTIGATE);
    expect(ctx.watch.watchers.get(near.id)?.mood).toBe('investigating');
    expect(ctx.susp(walled), 'behind a wall, earshot halves').toBe(0);
    expect(ctx.susp(far), 'out of earshot').toBe(0);
    ctx.watch.aggroed(near, ctx.time);
    expect(ctx.watch.tier).toBe(3);
    expect(ctx.tiers.map((t) => t.to)).toEqual([2, 3]);
    // Escalated is today's game: the next person who sees you comes for you, no build-up.
    const late = ctx.facing('manager', 5);
    ctx.step(0.1);
    expect(late.aggro).toBe(true);
  });

  it('never goes down within a mission', () => {
    const ctx = new Floor();
    const a = ctx.facing('user', 3);
    const b = ctx.put('user', N + 6, N - 3, -Math.PI / 2);
    const seen: Tier[] = [];
    let away = false;
    // Seen, Noticed, Alert; then hidden for a minute while others still investigate.
    ctx.step(70, (t) => {
      if (!away && a.aggro) {
        away = true;
        ctx.playerPos.set(N + 26, 0, N + 26);
      }
      if (t > 20 && t < 20.1) ctx.watch.noise('sprint', b.pos.x, b.pos.z, t);
      seen.push(ctx.watch.tier);
    });
    expect(Math.max(...seen)).toBe(2);
    for (let i = 1; i < seen.length; i++) expect(seen[i], `frame ${i}`).toBeGreaterThanOrEqual(seen[i - 1] as number);
    expect(ctx.watch.tier).toBe(2);
    expect(ctx.tiers.every((t) => t.to > t.from)).toBe(true);
  });

  it('starts Escalated on a loud card, and stays there', () => {
    const ctx = new Floor(null, 3);
    const v = ctx.facing('vendor', 5);
    ctx.step(0.1);
    expect(v.aggro).toBe(true);
    expect(ctx.watch.tier).toBe(3);
  });
});

describe('a mission run pays', () => {
  const done = (o: Partial<Outcome>): Outcome => ({ finish: 'done', maxTier: 0, spoiled: false, resolvedRep: 0, seconds: 200, ...o });

  it('a quiet finish pays the card plus 40%, and +3 Management, +2 Staff', () => {
    const p = payout(STAPLER, done({ maxTier: 1 }));
    expect(p.quiet).toBe(true);
    expect(p.base).toBe(STAPLER.value);
    expect(p.bonus).toBe(Math.round(STAPLER.value * QUIET_BONUS));
    expect(p.management).toBe(3);
    expect(p.staff).toBe(2);
  });

  it('a loud finish pays the card and the resolves, no bonus, no standing', () => {
    const p = payout(STAPLER, done({ maxTier: 2, resolvedRep: 137 }));
    expect(p.quiet).toBe(false);
    expect(p.base).toBe(STAPLER.value);
    expect(p.bonus).toBe(0);
    expect(p.perResolve).toBe(137);
    expect(p.management + p.staff).toBe(0);
  });

  it('HR noticing you spoils the quiet bonus on the stapler, even at Noticed', () => {
    const run = new MissionRun(STAPLER, 0);
    run.tier(1);
    run.noticedBy('hr');
    run.took('redstapler');
    expect(run.finish('done')?.pay.quiet).toBe(false);
  });

  it('counts resolves once each, finishes only when the objective is done, and once', () => {
    const run = new MissionRun(VENDOR_DAY, 3);
    expect(run.finish('done')).toBeNull();
    for (const id of [1, 2, 2, 3]) run.resolved(id, 'vendor', 40);
    run.resolved(9, 'consultant', 60);
    expect(run.objectiveDone).toBe(false);
    run.resolved(4, 'vendor', 40);
    expect(run.objectiveDone).toBe(true);
    const end = run.finish('done');
    expect(end?.pay).toEqual({ quiet: false, base: VENDOR_DAY.value, bonus: 0, perResolve: 220, management: 0, staff: 0 });
    expect(run.finish('done')).toBeNull();
    // An aborted card pays nothing new.
    expect(payout(VENDOR_DAY, done({ finish: 'aborted', resolvedRep: 50 })).base).toBe(0);
  });

  it('keeps the highest tier the mission reached', () => {
    const run = new MissionRun(STAPLER, 0);
    run.tier(2);
    run.tier(1);
    expect(run.maxTier).toBe(2);
    expect(ALERT).toBeGreaterThan(INVESTIGATE);
  });
});
