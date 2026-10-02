import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attack, fire, resolveActor, shove, splash, standBeforeActor, strike } from './combat';
import { breach } from './desk';
import type { Actor } from './entities';
import { answering, DT, type Headless, headless } from './headlessgame';
import * as host from './hosts';
import { FIGHT_MEMORY, FIGHT_RANGE, HUB_EXTRA_BASE, HUB_GRACE, IGNORE_MEMORY, IGNORES_TO_TURN, LINE_TIME, REACHED_DIST, WITNESS_RANGE } from './hub';
import { interact, standAt } from './interact';
import { itemById, type WeaponDef } from './items';
import { flowField, generateLevel, type LevelRecipe, lineOfSight, NEIGHBOURS8, toCell } from './level';
import { fx } from './rng';
import { newSave, normalizeSave, type QueuedTicket, type SaveState } from './state';

vi.mock('./textures', async (orig) => ({ ...await orig<typeof import('./textures')>(), textSprite: () => new THREE.Sprite(), disposeSprite: () => undefined }));
vi.mock('./level', async (orig) => {
  const mod = await orig<typeof import('./level')>();
  return { ...mod, generateLevel: (n: number, theme: Parameters<typeof generateLevel>[1], seed: number, _nt?: boolean, _decor?: boolean, recipe?: LevelRecipe) => mod.generateLevel(n, theme, seed, true, false, recipe) };
});

/**
 * Hostility on the hub is earned (docs/SPEC_HELLDESK_030_S1.md, S1a gates 3
 * and 4), on the real Game, the real hub and the real AI frame by frame:
 * every source turns exactly the right people, says so before anyone
 * swings, nobody swings within HUB_GRACE seconds of turning, and nothing else
 * turns anybody.
 */

afterEach(() => vi.restoreAllMocks());

function hubFor(save: SaveState = newSave(7919)): Headless {
  const h = headless(save);
  h.g.loadHub(false, true);
  return h;
}

const neutral = (h: Headless): Actor[] => h.g.actors.filter((a) => a.colleague && !a.hostile && !a.resolved);
const hostiles = (h: Headless): Actor[] => h.g.actors.filter((a) => a.hostile && !a.resolved);
const named = (h: Headless, a: Actor): boolean => h.g.actors.filter((x) => x.name === a.name).length === 1;

/**
 * Turned at the time this is called, with the player right beside them:
 * no hit for HUB_GRACE seconds; and then (this is a fight, not a sulk) one
 * comes. Returns the first hit's delay.
 */
function graceThenFight(h: Headless, a: Actor): number {
  const t0 = h.g.time;
  const before = h.hurts.length;
  const close = (): void => { if (Math.hypot(a.pos.x - h.g.player.pos.x, a.pos.z - h.g.player.pos.z) > 2.5) standBeforeActor(h.g, a, 1.5); };
  close();
  // Frame by frame until the first hit (or 20 s): the fight itself is not the point, and a long one would burn you out.
  for (let t = 0; t < 20 && h.hurts.length === before; t += DT) h.run(DT, close);
  const hits = h.hurts.slice(before);
  expect(hits.length, `${a.name} comes after you`).toBeGreaterThan(0);
  const first = (hits[0]?.t ?? Infinity) - t0;
  expect(first, `${a.name} does not hit within ${HUB_GRACE} s of turning`).toBeGreaterThan(HUB_GRACE);
  return first;
}

/** Somebody whose next swing is due now: without the grace they would hit within half a second of turning. */
function ready(...people: Actor[]): void {
  for (const a of people) a.cooldown = 0;
}

/** The announcement: a toast naming them, a bark over them, and the red "!". */
function announced(h: Headless, a: Actor, toast: string): void {
  expect(h.toasts.some((t) => t.includes(a.name) && t.includes(toast)), `toast for ${a.name}: ${h.toasts.join(' | ')}`).toBe(true);
  expect(a.bubble, `${a.name} says something as they turn`).not.toBeNull();
  expect(a.marker, `${a.name} has the "!"`).not.toBeNull();
}

describe('gate 3: every source turns exactly the right person, announced, and nobody swings for 1.5 s', () => {
  it('an SLA breach: the ticket\'s reporter, by name, comes to find you', () => {
    const h = hubFor();
    const c = neutral(h).find((a) => a.kind === 'user' && named(h, a));
    if (c === undefined) throw new Error('no user');
    standBeforeActor(h.g, c, 8);
    const q: QueuedTicket = { t: c.ticket, sla: 0, from: c.name, struck: [], gold: false };
    h.g.save.queue.push(q);
    ready(c);
    breach(h.g, q);
    expect(hostiles(h)).toEqual([c]);
    announced(h, c, 'is on the way up, and is not happy');
    expect(h.g.save.hub.hostile).toEqual([{ spawnIndex: c.spawnIndex, reason: 'breach' }]);
    graceThenFight(h, c);
  });

  it('an SLA breach from somebody not on the hub: they come up in the lift, and are still there after a reload', () => {
    const h = hubFor();
    const q: QueuedTicket = { t: 3, sla: 0, from: 'Nadia from Nowhere (backlog #4242)', struck: [], gold: false };
    h.g.save.queue.push(q);
    breach(h.g, q);
    const [n] = hostiles(h);
    expect(hostiles(h)).toHaveLength(1);
    expect(n?.name).toBe(q.from);
    expect(n?.spawnIndex).toBeGreaterThanOrEqual(HUB_EXTRA_BASE);
    const lift = h.g.level.interactables.find((it) => it.kind === 'elevator')!;
    expect(Math.hypot((n?.pos.x ?? 0) - lift.x, (n?.pos.z ?? 0) - lift.z), 'out of the lift').toBeLessThan(3.5);
    if (n === undefined) throw new Error('nobody came');
    announced(h, n, 'is on the way up');
    graceThenFight(h, n);
    const back = headless(normalizeSave(JSON.parse(JSON.stringify(h.g.save)))!);
    back.g.loadWorld(true);
    expect(hostiles(back).map((a) => a.name)).toEqual([q.from]);
  });

  it('hitting a colleague: the victim and every colleague within 12 m who sees it turn, HR warns, nobody else turns', () => {
    for (const seed of [7919, 15838, 23757]) {
      const h = hubFor(newSave(seed));
      const g = h.g;
      // Somebody with a crowd near enough to see, and somebody too far away to.
      const victim = neutral(h).find((a) => a.kind === 'user' && neutral(h).some((o) => o !== a && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < 8));
      if (victim === undefined) throw new Error(`seed ${seed}: no crowd`);
      expect(standBeforeActor(g, victim, 1.2)).toBe(true);
      const pp = g.player.pos;
      // Somebody in plain view, but further off than 12 m: they do not count as having seen it.
      const distant = neutral(h).find((a) => a !== victim && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) > WITNESS_RANGE + 3);
      const view = spotInView(h, WITNESS_RANGE + 2, WITNESS_RANGE + 8);
      if (distant !== undefined && view !== null) distant.pos.set(view.x, 0, view.z);
      const saw = neutral(h).filter((w) => w !== victim && Math.hypot(w.pos.x - pp.x, w.pos.z - pp.z) <= WITNESS_RANGE && lineOfSight(g.level, w.pos.x, w.pos.z, pp.x, pp.z));
      const away = neutral(h).filter((w) => w !== victim && !saw.includes(w));
      expect(away.length, `seed ${seed}: somebody did not see it`).toBeGreaterThan(0);
      if (distant !== undefined && view !== null) expect(away, `seed ${seed}: in view at ${Math.round(Math.hypot(distant.pos.x - pp.x, distant.pos.z - pp.z))} m`).toContain(distant);
      const warnings = g.save.warnings;
      ready(victim, ...saw);
      strike(g, victim, 1, null, 'melee');
      expect(new Set(hostiles(h)), `seed ${seed}: exactly the victim and the witnesses`).toEqual(new Set([victim, ...saw]));
      expect(g.save.warnings, 'HR').toBe(warnings + 1);
      announced(h, victim, 'You hit');
      for (const w of saw) announced(h, w, 'saw you hit');
      expect(victim.hp, 'and then the hit landed').toBeLessThan(victim.maxHp);
      graceThenFight(h, victim);
    }
  });

  it('a shove is laying hands on a colleague too', () => {
    const h = hubFor();
    const victim = neutral(h).find((a) => a.kind === 'user');
    if (victim === undefined) throw new Error('no user');
    expect(standBeforeActor(h.g, victim, 1.3)).toBe(true);
    shove(h.g);
    expect(hostiles(h)).toContain(victim);
    announced(h, victim, 'You hit');
  });

  it('collateral is not a crime: shots, splash and the Power Cycle pass through a colleague in a fight; a swing at the enemy beside them misses them; a swing at them is still assault', () => {
    const h = hubFor();
    const g = h.g;
    const [c, e] = neutral(h).filter((a) => a.kind === 'user' && named(h, a));
    if (c === undefined || e === undefined) throw new Error('no users');
    // A legitimate fight: e is after you (an SLA breach), c is a bystander in the line of fire.
    breach(g, { t: e.ticket, sla: 0, from: e.name, struck: [], gold: false });
    expect(e.hostile && !c.hostile).toBe(true);
    const run = openRun(h, 9);
    const at = (a: Actor, m: number, side = 0): void => { a.pos.set(run.x0 + run.dx * m + run.sx * side, 0, run.z0 + run.dz * m + run.sz * side); };
    g.player.pos.set(run.x0, 0, run.z0);
    g.player.yaw = Math.atan2(-run.dx, -run.dz);
    const freeze = (): void => { at(c, 3); at(e, 7); c.stunned = 1e9; e.stunned = 1e9; };
    const untouched = (what: string): void => {
      expect(c.hp, `${what}: no damage to the colleague`).toBe(c.maxHp);
      expect(c.hostile, `${what}: no crime`).toBe(false);
      expect(g.save.warnings, `${what}: no HR warning`).toBe(0);
    };
    // A label-maker shot straight through them at the enemy behind.
    freeze();
    const eHp = e.hp;
    fire(g, { kind: 'label', from: g.player.pos.clone().setY(1.3), dir: new THREE.Vector3(run.dx, 0, run.dz), speed: 30, damage: 12, hostile: false, owner: null, ttl: 3 });
    h.run(0.5, answering(h, freeze));
    expect(e.hp, 'the shot went through them and hit the enemy').toBeLessThan(eHp);
    untouched('a shot');
    // A rubber duck's splash on the enemy, the colleague a metre and a half away.
    at(c, 5.5);
    splash(g, e.pos.clone(), 3.8, 60);
    untouched('splash');
    // The Power Cycle (a nova) with both of them in range.
    freeze();
    const pc = itemById('powercycle') as WeaponDef;
    g.save.energy = 100;
    const beforeNova = e.hp;
    attack(g, pc, 1, false);
    untouched('the Power Cycle');
    expect(e.hp, 'the nova hit the enemy').toBeLessThan(beforeNova);
    // A swing at the enemy, the colleague right beside them in the arc.
    const stapler = itemById('stapler') as WeaponDef;
    at(e, 1.4);
    at(c, 1.4, 0.7);
    const before = e.hp;
    attack(g, stapler, 1, false);
    expect(e.hp, 'the swing landed on the enemy').toBeLessThan(before);
    untouched('a swing at the enemy beside them');
    // And a swing at the colleague, nobody hostile in reach: that is assault (D4).
    e.pos.set(run.x0 + run.dx * 16, 0, run.z0 + run.dz * 16);
    at(c, 1.4);
    g.attackCd = 0;
    attack(g, stapler, 1, false);
    expect(c.hostile, 'a deliberate swing is a crime').toBe(true);
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(g.save.warnings, 'HR hears of it').toBe(1);
    announced(h, c, 'You hit');
  });

  it('a witnessed crime: the manager who smells it is after you for the week (and HR hears)', () => {
    const h = hubFor();
    const m = neutral(h).find((a) => a.kind === 'manager');
    if (m === undefined) throw new Error('no manager');
    expect(standBeforeActor(h.g, m, 2)).toBe(true);
    h.g.save.bac = 60;
    h.g.refreshDerived();
    ready(m);
    const chance = vi.spyOn(fx, 'chance').mockReturnValue(true);
    h.run(DT * 2);
    chance.mockRestore();
    expect(hostiles(h)).toEqual([m]);
    expect(h.g.save.hub.hostile).toEqual([{ spawnIndex: m.spawnIndex, reason: 'caught' }]);
    expect(h.g.save.warnings).toBe(1);
    announced(h, m, 'caught you');
    // Sobered up at once, without the hangover the real vices would hand you for the drop (it lowers max Sanity).
    h.g.save.bac = 0;
    h.g.save.peakBac = 0;
    h.g.refreshDerived();
    graceThenFight(h, m);
  });

  it('a witnessed crime: whoever sees you at the office fridge', () => {
    const h = hubFor();
    const g = h.g;
    expect(standAt(g, 'fridge')).toBe(true);
    // A colleague a few metres off, in plain view.
    const w = neutral(h).find((a) => a.kind === 'user');
    if (w === undefined) throw new Error('no user');
    const pc = toCell(g.player.pos.x);
    const pz = toCell(g.player.pos.z);
    const spot = NEIGHBOURS8.map(([ox, oz]) => [pc + ox * 2, pz + oz * 2] as const)
      .find(([x, z]) => g.level.floor[z * g.level.w + x] === 1 && g.level.solid[z * g.level.w + x] === 0 && lineOfSight(g.level, x * 2 + 1, z * 2 + 1, g.player.pos.x, g.player.pos.z));
    if (spot === undefined) throw new Error('no spot by the fridge');
    w.pos.set(spot[0] * 2 + 1, 0, spot[1] * 2 + 1);
    const others = neutral(h).filter((a) => a !== w && Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) < 10 && lineOfSight(g.level, a.pos.x, a.pos.z, g.player.pos.x, g.player.pos.z));
    ready(w, ...others);
    interact(g);
    h.pick('Take Jukka\'s drinks.');
    expect(new Set(hostiles(h))).toEqual(new Set([w, ...others]));
    announced(h, w, 'saw you take Jukka');
    h.pick(/./);
    graceThenFight(h, w);
  });

  it('low Staff standing: on Monday exactly one colleague has been waiting all weekend; above -40, nobody', () => {
    const low = newSave(7919);
    low.standing.staff = -50;
    const h = hubFor(low);
    expect(hostiles(h)).toHaveLength(1);
    const [a] = hostiles(h);
    if (a === undefined) throw new Error('nobody');
    expect(h.g.save.hub.hostile).toEqual([{ spawnIndex: a.spawnIndex, reason: 'grudge' }]);
    announced(h, a, 'waiting all weekend');
    graceThenFight(h, a);
    const fine = newSave(7919);
    fine.standing.staff = -39;
    expect(hostiles(hubFor(fine))).toEqual([]);
    // Not on induction day: the morning is Morag's (only her dummy takes a hit).
    const morning = newSave(7919);
    morning.standing.staff = -50;
    morning.induction = { step: 'look', looked: 0, sanityTold: false };
    expect(hostiles(hubFor(morning)).map((a) => a.kind)).toEqual(['dummy']);
  });

  it('a story choice that makes an enemy: they turn up announced, not swinging', () => {
    const h = hubFor();
    host.spawnHostile(h.g, 'manager', 1, 'Derek (bitter)');
    const [d] = hostiles(h);
    expect(hostiles(h)).toHaveLength(1);
    if (d === undefined) throw new Error('nobody');
    expect(d.name).toBe('Derek (bitter)');
    announced(h, d, 'coming for you');
    graceThenFight(h, d);
  });

  it('a failed talk-down still enrages them (unchanged), and turns nobody else', () => {
    const h = hubFor();
    const c = neutral(h).find((a) => a.kind === 'user' && named(h, a));
    if (c === undefined) throw new Error('no user');
    breach(h.g, { t: c.ticket, sla: 0, from: c.name, struck: [], gold: false });
    expect(host.enrage(h.g, c)).toBe(true);
    expect(c.enragedT).toBeGreaterThan(0);
    expect(hostiles(h)).toEqual([c]);
  });

  it('nothing else turns anyone: ten minutes of the hub, walk-ups answered, a nap and the cat pictures caught, a turned manager who cannot summon', { timeout: 60_000 }, () => {
    const h = hubFor();
    const g = h.g;
    let answered = 0;
    const answer = (): void => {
      const w = g.hub?.walkingUp() ?? null;
      if (w === null || g.screen !== 'play' || !(g.hub?.debug().reached ?? false)) return;
      g.promptTarget = { kind: 'actor', a: w };
      interact(g);
      h.pick(/Walk them through it/);
      h.pick(/./);
      answered++;
    };
    h.run(600, answering(h, answer));
    expect(g.save.hub.clock, 'ten minutes of hub time').toBeGreaterThan(599);
    expect(answered, 'people walked up, and were talked to').toBeGreaterThanOrEqual(4);
    expect(hostiles(h), 'nobody turned').toEqual([]);
    expect(h.hurts, 'nobody hit you').toEqual([]);
    // Caught napping, and at the cat pictures: a manager with words, not a fight.
    // Ten minutes of the trickle filled the Löyly meter: empty it, so this nap is about the manager and not a SUO vision.
    g.save.loyly = 0;
    const chance = vi.spyOn(fx, 'chance').mockReturnValue(true);
    host.rest(g, false);
    chance.mockRestore();
    g.caughtPending = true;
    Object.assign(g, { os: { hide: (): void => undefined } });
    g.close();
    expect(hostiles(h), 'nap and cats turn nobody').toEqual([]);
    expect(g.actors.filter((a) => a.kind === 'manager' && a.colleague && !a.hostile && a.spawnIndex >= HUB_EXTRA_BASE).length, 'the two managers came, and are colleagues').toBe(2);
    expect(g.save.hub.arrivals.map((r) => r.why), 'kept for the week as visitors').toEqual(['visit', 'visit']);
    // A manager turned (a breach) calls for reinforcements every 12-18 s: on the hub, nobody comes.
    const m = neutral(h).find((a) => a.kind === 'manager' && named(h, a));
    if (m === undefined) throw new Error('no manager');
    breach(g, { t: m.ticket, sla: 0, from: m.name, struck: [], gold: false });
    standBeforeActor(g, m, 6);
    h.run(40, () => { if (Math.hypot(m.pos.x - g.player.pos.x, m.pos.z - g.player.pos.z) > 10) standBeforeActor(g, m, 6); });
    expect(hostiles(h), 'only the manager').toEqual(m.resolved ? [] : [m]);
    // A story choice that makes an enemy is a source too (announced, like the others): Derek, blamed.
    host.spawnHostile(g, 'manager', 1, 'Derek (bitter)');
    const d = hostiles(h).find((a) => a.name === 'Derek (bitter)');
    if (d === undefined) throw new Error('Derek did not come');
    announced(h, d, 'coming for you');
    expect(new Set(hostiles(h)), 'the manager (a breach) and Derek (a story choice), nobody else').toEqual(new Set(m.resolved ? [d] : [m, d]));
    // Every hostile on the hub's books came from an announced source in the table.
    for (const e of g.save.hub.hostile) expect(['breach', 'ignored', 'assault', 'witness', 'caught', 'grudge', 'story']).toContain(e.reason);
    expect(g.save.hub.hostile.find((e) => e.spawnIndex === d.spawnIndex)?.reason).toBe('story');
  });
});

/** An open spot the player can see, between `near` and `far` metres away, or null. */
function spotInView(h: Headless, near: number, far: number): { x: number; z: number } | null {
  const lv = h.g.level;
  const pp = h.g.player.pos;
  for (let i = 0; i < lv.w * lv.h; i++) {
    if (lv.floor[i] !== 1 || lv.solid[i] === 1) continue;
    const x = (i % lv.w) * 2 + 1;
    const z = Math.floor(i / lv.w) * 2 + 1;
    const d = Math.hypot(x - pp.x, z - pp.z);
    if (d > near && d < far && lineOfSight(lv, pp.x, pp.z, x, z)) return { x, z };
  }
  return null;
}

/**
 * A straight run of open floor `cells` long and two lanes wide: its start
 * (the middle of the first lane cell), its direction (dx, dz), and the side
 * the second lane is on (sx, sz).
 */
function openRun(h: Headless, cells: number): { x0: number; z0: number; dx: number; dz: number; sx: number; sz: number } {
  const lv = h.g.level;
  const open = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < lv.w && r < lv.h && lv.floor[r * lv.w + c] === 1 && lv.solid[r * lv.w + c] === 0;
  for (let r = 0; r < lv.h; r++) {
    for (let c = 0; c < lv.w; c++) {
      for (const [dx, dz, sx, sz] of [[1, 0, 0, 1], [0, 1, 1, 0]] as const) {
        let ok = true;
        for (let k = 0; k < cells && ok; k++) ok = open(c + dx * k, r + dz * k) && open(c + dx * k + sx, r + dz * k + sz);
        if (ok) return { x0: c * 2 + 1, z0: r * 2 + 1, dx, dz, sx, sz };
      }
    }
  }
  throw new Error('no open run');
}

/** A spot the walker can walk to, 6 to 12 m away from them. */
function awayFrom(h: Headless, a: Actor): { x: number; z: number } {
  const lv = h.g.level;
  const field = flowField(lv, a.pos.x, a.pos.z, 400);
  for (let i = 0; i < lv.w * lv.h; i++) {
    const steps = field[i] ?? -1;
    if (steps < 3 || steps > 10 || lv.solid[i] === 1) continue;
    const x = (i % lv.w) * 2 + 1;
    const z = Math.floor(i / lv.w) * 2 + 1;
    const d = Math.hypot(x - a.pos.x, z - a.pos.z);
    if (d > 6 && d < 12) return { x, z };
  }
  throw new Error('nowhere to walk off to');
}

describe('gate 4: walk-ups', () => {
  it('ignored three times, the walker turns (the bark first); the next walk-up, talked to, is resolved; never two at once', { timeout: 60_000 }, () => {
    const h = hubFor();
    const g = h.g;
    const hub = g.hub;
    if (hub === null) throw new Error('no hub');
    const walkers: (number | null)[] = [];
    const watch = (): void => {
      const now = hub.debug().walker;
      const last = walkers.at(-1);
      if (now !== last) {
        // A new walk-up only once the last one is over: never two at once.
        expect(last === null || last === undefined || now === null, `walk-up ${String(now)} started while ${String(last)} was still on`).toBe(true);
        walkers.push(now);
      }
      // Only ever one person looking for you.
      expect(g.actors.filter((a) => hub.seeks(a)).length).toBeLessThanOrEqual(1);
    };
    const reach = (): void => {
      for (let t = 0; t < 40 && !hub.debug().reached; t += 0.5) h.run(0.5, answering(h, watch));
      expect(hub.debug().reached, 'the walk-up reaches you').toBe(true);
    };

    hub.walkUpNow();
    h.run(DT, answering(h, watch));
    const w = hub.walkingUp();
    if (w === null) throw new Error('nobody walked up');
    expect(w.hostile).toBe(false);
    // Kept waiting at your side longer than the gap between walk-ups: still the one walk-up.
    reach();
    h.run(150, answering(h, watch));
    expect(hub.walkingUp(), 'still the same walk-up, nobody else').toBe(w);
    for (let n = 1; n <= IGNORES_TO_TURN; n++) {
      reach();
      ready(w);
      const p = awayFrom(h, w);
      g.player.pos.set(p.x, 0, p.z);
      h.run(DT, answering(h, watch));
      expect(g.save.hub.ignores[w.spawnIndex]?.length ?? 0, `ignore ${n}`).toBe(n);
      if (n < IGNORES_TO_TURN) {
        expect(w.hostile, `not yet, after ${n}`).toBe(false);
        expect(h.toasts.at(-1)).toContain(`(${n}/${IGNORES_TO_TURN})`);
      }
    }
    expect(w.hostile, 'the third ignore turns them').toBe(true);
    expect(hostiles(h)).toEqual([w]);
    expect(g.save.hub.hostile).toEqual([{ spawnIndex: w.spawnIndex, reason: 'ignored' }]);
    announced(h, w, 'ignored three times');
    graceThenFight(h, w);
    // Beaten (resolved), and the fight over: nobody walks up mid-fight.
    w.hp = 0;
    resolveActor(g, w);
    h.run(FIGHT_MEMORY + 1, answering(h, watch));

    // The next one, talked to: resolved, paid, and nobody turned.
    hub.walkUpNow();
    h.run(DT, answering(h, watch));
    const next = hub.walkingUp();
    if (next === null) throw new Error('nobody walked up');
    expect(next).not.toBe(w);
    reach();
    const rep = g.save.rep;
    g.promptTarget = { kind: 'actor', a: next };
    interact(g);
    expect(h.dialogues.at(-1)?.subtitle).toBe('A walk-up');
    h.pick(/Walk them through it/);
    watch();
    expect(hub.walkingUp(), 'resolved: they go back to their desk').toBeNull();
    expect(next.hostile).toBe(false);
    expect(next.marker).toBeNull();
    expect(g.save.rep).toBeGreaterThan(rep);
    expect(g.save.hub.ignores[next.spawnIndex]).toBeUndefined();
    h.pick(/./);

    // And one asked for a ticket: it goes into your queue, from them.
    hub.walkUpNow();
    h.run(DT, answering(h, watch));
    const third = hub.walkingUp();
    if (third === null) throw new Error('nobody walked up');
    reach();
    g.promptTarget = { kind: 'actor', a: third };
    interact(g);
    // The option says how long you will have.
    expect(h.dialogues.at(-1)?.options.map((o) => o.label)).toContain('Could you raise a ticket for that? (SLA about 2 min)');
    h.pick('Could you raise a ticket for that? (SLA about 2 min)');
    expect(g.save.queue.find((q) => q.from === third.name)?.sla, 'and that is what it is').toBeCloseTo(130 * g.derived().slaMult, 0);
    watch();
    expect(hub.walkingUp()).toBeNull();
    expect(g.save.queue.map((q) => q.from)).toContain(third.name);
    expect(hostiles(h)).toEqual([]);
  });

  it('walking past a walk-up without stopping is not ignoring them; nor is a walk-up who gives up without reaching you', () => {
    const h = hubFor();
    const g = h.g;
    const hub = g.hub!;
    hub.walkUpNow();
    h.run(DT, answering(h));
    const w = hub.walkingUp();
    if (w === null) throw new Error('nobody walked up');
    // A straight, open run four metres wide: you on one lane, them coming the other way a metre to the side.
    const run = openRun(h, 9);
    g.player.pos.set(run.x0, 0, run.z0);
    g.player.yaw = Math.atan2(-run.dx, -run.dz);
    w.pos.set(run.x0 + run.dx * 7 + run.sx * 1.1, 0, run.z0 + run.dz * 7 + run.sz * 1.1);
    // W, the real key, held: past them at a walk, never stopping.
    g.input.keys.add(g.settings.keys.forward);
    let closest = Infinity;
    let inReach = 0;
    const walk = answering(h, () => {
      const d = Math.hypot(w.pos.x - g.player.pos.x, w.pos.z - g.player.pos.z);
      closest = Math.min(closest, d);
      if (d <= REACHED_DIST) inReach += DT;
      expect(hub.debug().reached, 'walking past is not stopping for them').toBe(false);
    });
    for (let t = 0; t < 4 && Math.hypot(g.player.pos.x - run.x0, g.player.pos.z - run.z0) < 15; t += DT) h.run(DT, walk);
    g.input.keys.delete(g.settings.keys.forward);
    expect(closest, 'you went right past them').toBeLessThan(REACHED_DIST);
    expect(inReach, 'within reach for less than their line takes').toBeLessThan(LINE_TIME);
    expect(Math.hypot(w.pos.x - g.player.pos.x, w.pos.z - g.player.pos.z), 'and well off past them').toBeGreaterThan(4);
    expect(hub.walkingUp(), 'they are still after a word').toBe(w);
    expect(g.save.hub.ignores[w.spawnIndex], 'no ignore counted').toBeUndefined();
    expect(h.toasts.some((t) => t.includes('walked off on')), 'and nothing said about one').toBe(false);

    // Kept out of reach until they give up: that counts nothing either.
    h.run(100, answering(h, () => {
      if (hub.walkingUp() === w && Math.hypot(w.pos.x - g.player.pos.x, w.pos.z - g.player.pos.z) < 6) {
        const p = awayFrom(h, w);
        g.player.pos.set(p.x, 0, p.z);
      }
    }));
    expect(hub.walkingUp(), 'they gave up').not.toBe(w);
    expect(w.marker).toBeNull();
    expect(g.save.hub.ignores[w.spawnIndex], 'a give-up is not an ignore').toBeUndefined();
    expect(w.hostile).toBe(false);
  });

  it('an ignore is forgotten ten minutes of hub time after it was counted', { timeout: 60_000 }, () => {
    const h = hubFor();
    const g = h.g;
    const hub = g.hub!;
    hub.walkUpNow();
    h.run(DT, answering(h));
    const w = hub.walkingUp();
    if (w === null) throw new Error('nobody walked up');
    const reach = (): void => {
      for (let t = 0; t < 40 && !hub.debug().reached; t += 0.5) h.run(0.5, answering(h));
      expect(hub.debug().reached, 'the walk-up reaches you').toBe(true);
    };
    const walkOff = (): void => {
      const p = awayFrom(h, w);
      g.player.pos.set(p.x, 0, p.z);
      h.run(DT, answering(h));
    };
    reach();
    walkOff();
    reach();
    walkOff();
    const at = g.save.hub.clock;
    expect(g.save.hub.ignores[w.spawnIndex]?.length, 'two ignores').toBe(2);
    // They catch you up and wait at your side while the clock runs.
    h.run(IGNORE_MEMORY - 30, answering(h));
    expect(g.save.hub.ignores[w.spawnIndex]?.length, 'still remembered at nine and a half minutes').toBe(2);
    h.run(40, answering(h));
    expect(g.save.hub.clock - at).toBeGreaterThan(IGNORE_MEMORY);
    expect(g.save.hub.ignores[w.spawnIndex], 'forgotten after ten').toBeUndefined();
    expect(hub.debug().ignores).toEqual([]);
    // So the next walk-off is the first again, not the third.
    reach();
    walkOff();
    expect(w.hostile).toBe(false);
    expect(g.save.hub.ignores[w.spawnIndex]?.length).toBe(1);
    expect(h.toasts.at(-1)).toContain(`(1/${IGNORES_TO_TURN})`);
  });

  it('nobody walks up mid-fight (somebody after you within 20 m, or a hit in the last 10 s), and a walk-up waits out a fight', { timeout: 60_000 }, () => {
    const h = hubFor();
    const g = h.g;
    const hub = g.hub!;
    // Among people (somebody in walking distance), with somebody after you 14 m off: a walk-up that falls due waits.
    const near = neutral(h).find((a) => (a.kind === 'caller' || a.kind === 'user') && neutral(h).filter((o) => o !== a && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < 12).length >= 2)!;
    standBeforeActor(g, near, 4);
    const c = neutral(h).find((a) => a.kind === 'user' && a !== near && named(h, a))!;
    breach(g, { t: c.ticket, sla: 0, from: c.name, struck: [], gold: false });
    const spot = spotInView(h, FIGHT_RANGE - 7, FIGHT_RANGE - 5) ?? { x: g.player.pos.x + FIGHT_RANGE - 6, z: g.player.pos.z };
    c.pos.set(spot.x, 0, spot.z);
    c.stunned = 1e9;
    hub.walkUpNow();
    h.run(5, answering(h));
    expect(hub.fighting()).toBe(true);
    expect(hub.walkingUp(), 'nobody walks up with somebody after you 14 m off').toBeNull();
    // They are dealt with: no walk-up for ten seconds after the last blow, then one comes.
    c.hp = 0;
    resolveActor(g, c);
    g.combatAt = g.time;
    const blow = g.time;
    h.run(FIGHT_MEMORY - 1, answering(h));
    expect(hub.walkingUp(), 'nine seconds after the last blow, still nobody').toBeNull();
    // (Nobody in walking distance: the hub looks again ten seconds on.)
    for (let t = 0; t < 15 && hub.walkingUp() === null; t += DT) h.run(DT, answering(h));
    const w = hub.walkingUp();
    expect(w, 'the fight over, the walk-up comes').not.toBeNull();
    expect(g.time - blow, 'not before ten seconds after the last blow').toBeGreaterThanOrEqual(FIGHT_MEMORY);
    if (w === null) return;

    // Reached, and then a fight breaks out: running off mid-fight is not ignoring them.
    for (let t = 0; t < 40 && !hub.debug().reached; t += 0.5) h.run(0.5, answering(h));
    expect(hub.debug().reached).toBe(true);
    const m = neutral(h).find((a) => a !== w && a.kind !== 'manager' && named(h, a))!;
    breach(g, { t: m.ticket, sla: 0, from: m.name, struck: [], gold: false });
    m.pos.set(g.player.pos.x + 0.5, 0, g.player.pos.z);
    h.run(DT, answering(h));
    expect(hub.debug().reached, 'a fight: they have to catch you again after it').toBe(false);
    const p = awayFrom(h, w);
    g.player.pos.set(p.x, 0, p.z);
    h.run(3, answering(h));
    expect(g.save.hub.ignores[w.spawnIndex], 'no ignore counted mid-fight').toBeUndefined();
    expect(hub.walkingUp(), 'still waiting for you').toBe(w);
  });

  it('nobody walks up while the induction runs, even once the floor is awake for its last steps', () => {
    const save = newSave(7919);
    save.induction = { step: 'ticket', looked: 0, sanityTold: false };
    const h = hubFor(save);
    expect(h.g.inductionDay).not.toBeNull();
    expect(h.g.floorAwake).toBe(true);
    h.run(200);
    expect(h.g.hub?.debug().walker).toBeNull();
    expect(h.g.save.hub.clock, 'the hub\'s week starts after the morning').toBe(0);
    h.g.endInduction('finish', false);
    h.run(130, answering(h));
    expect(h.g.save.hub.clock).toBeGreaterThan(129);
  });

  it('a walk-up comes every 60 to 120 s of hub time, one at a time', { timeout: 60_000 }, () => {
    const h = hubFor();
    const starts: number[] = [];
    let last: number | null = null;
    h.run(500, answering(h, () => {
      const d = h.g.hub?.debug();
      const now = d?.walker ?? null;
      if (now !== null && now !== last) starts.push(h.g.save.hub.clock);
      last = now;
      // Nobody waits forever: answer whoever has reached you.
      const w = h.g.hub?.walkingUp() ?? null;
      if (w !== null && d?.reached === true && h.g.screen === 'play') {
        h.g.promptTarget = { kind: 'actor', a: w };
        interact(h.g);
        h.pick(/Walk them through it/);
        h.pick(/./);
      }
    }));
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(starts[0]).toBeGreaterThanOrEqual(60);
    expect(starts[0]).toBeLessThanOrEqual(120.1);
    // The next comes 60 s or more after the last one started (and not before it is over).
    for (let i = 1; i < starts.length; i++) expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBeGreaterThanOrEqual(60);
  });
});
