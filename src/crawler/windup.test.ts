import { describe, expect, it } from 'vitest';
import {
  ATTACKS,
  ATTACKS_BY_KIND,
  type AttackClass,
  type AttackId,
  beginWindup,
  BOSS_PATTERNS,
  cancelWindup,
  chargeShown,
  isParry,
  type MeleeAction,
  type MeleeHold,
  meleeStep,
  PARRY_WINDOW,
  patternOf,
  screenAngle,
  strikeLands,
  TAP_TIME,
  telegraphOpacity,
  tickWindup,
  type Windup,
} from './windup';

/**
 * Combat you can read (docs/SPEC_COMBAT_READ.md), the rules on their own:
 * the wind-up table, the strike decided where the player is when it lands,
 * the parry window, and what a press of the melee button turns into.
 */

// The spec's floors, written out here rather than read from the module: a
// table edited down to nothing has to fail against these.
const SPEC_FLOOR: Record<AttackClass, number> = { melee: 0.35, contact: 0.35, ranged: 0.3, boss: 0.6 };

const ALL_IDS = Object.keys(ATTACKS) as AttackId[];

describe('the wind-up table', () => {
  it.each(ALL_IDS)('%s winds up for at least its floor', (id) => {
    const def = ATTACKS[id];
    expect(def.windup).toBeGreaterThanOrEqual(SPEC_FLOOR[def.cls]);
  });

  it('a boss slam winds up 0.6-0.8 s, and the QUICK sync crouches for 0.6 s', () => {
    expect(ATTACKS['boss.slam'].windup).toBeGreaterThanOrEqual(0.6);
    expect(ATTACKS['boss.slam'].windup).toBeLessThanOrEqual(0.8);
    expect(ATTACKS['boss.charge'].windup).toBeCloseTo(0.6);
  });

  it('every kind of trouble has its attacks in the table, and every table row belongs to someone', () => {
    const listed = new Set<AttackId>();
    for (const [kind, ids] of Object.entries(ATTACKS_BY_KIND)) {
      expect(ids.length, kind).toBeGreaterThan(0);
      for (const id of ids) {
        expect(ATTACKS[id], id).toBeDefined();
        listed.add(id);
      }
    }
    expect([...listed].sort()).toEqual([...ALL_IDS].sort());
  });

  it('every boss pattern is a boss attack, named back to its pattern', () => {
    for (const p of BOSS_PATTERNS) {
      expect(ATTACKS_BY_KIND.boss).toContain(`boss.${p}`);
      expect(patternOf(`boss.${p}`)).toBe(p);
      expect(ATTACKS[`boss.${p}`].cls).toBe('boss');
    }
    expect(patternOf('boss.slam')).toBeNull();
    expect(patternOf('user.melee')).toBeNull();
  });

  it('melee and contact strikes reach past the range that starts them, so standing still is hit', () => {
    // The ranges that start each wind-up, from entities.ts.
    const starts: Partial<Record<AttackId, number>> = {
      'user.melee': 2.0, 'manager.melee': 2.2, 'customer.shove': 2.0, 'vendor.grab': 1.5, 'reply.dive': 1.1, 'mosquito.bite': 1.1, 'boss.slam': 2.4,
    };
    for (const [id, start] of Object.entries(starts)) expect(ATTACKS[id as AttackId].reach, id).toBeGreaterThan(start);
  });
});

describe('the wind-up clock', () => {
  const fresh = (): Windup => ({ pending: null, windup: 0, windupLen: 0 });

  it('strikes once, when the wind-up has run out, and not a frame before', () => {
    const w = fresh();
    beginWindup(w, 'user.melee');
    const dt = 1 / 60;
    let t = 0;
    const strikes: number[] = [];
    for (let i = 0; i < 120; i++) {
      t += dt;
      if (tickWindup(w, dt) !== null) strikes.push(t);
    }
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toBeGreaterThanOrEqual(ATTACKS['user.melee'].windup - 1e-9);
    expect(strikes[0]).toBeLessThan(ATTACKS['user.melee'].windup + dt + 1e-9);
  });

  it('a cancelled wind-up never strikes', () => {
    const w = fresh();
    beginWindup(w, 'boss.slam');
    tickWindup(w, 0.3);
    cancelWindup(w);
    for (let i = 0; i < 60; i++) expect(tickWindup(w, 0.05)).toBeNull();
  });

  it('nothing pending, nothing strikes', () => {
    expect(tickWindup(fresh(), 1)).toBeNull();
  });
});

describe('the strike is decided where the player is when it lands', () => {
  const user = ATTACKS['user.melee'];
  // An attacker at the origin, committed to swinging along +z at a player 1.9 m off.
  const hits = (px: number, pz: number): boolean => strikeLands(user, 0, 0, 0, 1, px, pz);

  it('standing where they were aimed at, the hit lands', () => {
    expect(hits(0, 1.9)).toBe(true);
  });

  it('strafed out of reach during the wind-up, it misses', () => {
    // 0.45 s of strafing at walking pace (5.2 m/s) is 2.3 m to the side.
    expect(hits(2.3, 1.9)).toBe(false);
  });

  it('stepped back out of reach, it misses; stepped back in, it lands', () => {
    expect(hits(0, user.reach + 0.1)).toBe(false);
    expect(hits(0, user.reach - 0.1)).toBe(true);
  });

  it('a melee swing covers its arc and not behind; a contact dive goes any way', () => {
    expect(hits(0, -1.5)).toBe(false);
    expect(hits(1.2, 1.2)).toBe(true);
    expect(strikeLands(ATTACKS['reply.dive'], 0, 0, 0, 1, 0, -1.2)).toBe(true);
  });

  it('right on top of the attacker, it lands whatever way they faced', () => {
    expect(hits(0.3, -0.3)).toBe(true);
  });
});

describe('the parry window', () => {
  it('is the last quarter second before the strike', () => {
    expect(PARRY_WINDOW).toBe(0.25);
    expect(isParry(0)).toBe(true);
    expect(isParry(1 / 60)).toBe(true);
    expect(isParry(0.25)).toBe(true);
    expect(isParry(0.26)).toBe(false);
    // The old window (0.3 s) no longer parries.
    expect(isParry(0.29)).toBe(false);
    expect(isParry(2)).toBe(false);
  });
});

describe('the melee button', () => {
  const POWER = 0.65;
  const DT = 1 / 60;

  interface Frame { readonly pressed?: boolean; readonly down: boolean; readonly ready?: boolean; readonly canAct?: boolean }

  /** Play frames through the button; collect every swing it asked for, and whether the ring ever showed early. */
  function play(frames: readonly Frame[], h: MeleeHold = { charging: false, chargeT: 0, swingQueued: false }): { swings: MeleeAction[]; charged: number; ringBeforeTap: boolean } {
    const swings: MeleeAction[] = [];
    let charged = 0;
    let ringBeforeTap = false;
    for (const f of frames) {
      const act = meleeStep(h, { pressed: f.pressed ?? false, down: f.down, dt: DT, ready: f.ready ?? true, canAct: f.canAct ?? true }, POWER);
      if (act === 'light' || act === 'heavy') swings.push(act);
      if (act === 'charged') charged++;
      if (h.charging && h.chargeT <= TAP_TIME && chargeShown(h, POWER) > 0) ringBeforeTap = true;
    }
    return { swings, charged, ringBeforeTap };
  }

  /** A press held for `seconds`, then let go, then a quiet second. */
  function press(seconds: number, extra: Partial<Frame> = {}): Frame[] {
    const out: Frame[] = [{ pressed: true, down: true, ...extra }];
    for (let t = DT; t < seconds; t += DT) out.push({ down: true, ...extra });
    for (let i = 0; i < 60; i++) out.push({ down: false, ...extra });
    return out;
  }

  it('a tap is one quick swing, on the release', () => {
    const frames = press(0.08);
    const h: MeleeHold = { charging: false, chargeT: 0, swingQueued: false };
    // Nothing on the press itself: the swing waits to see what the press becomes.
    expect(meleeStep(h, { pressed: true, down: true, dt: DT, ready: true, canAct: true }, POWER)).toBe('none');
    expect(play(frames).swings).toEqual(['light']);
  });

  it('held past ready is one heavy swing, and never a quick one first', () => {
    const r = play(press(1.0));
    expect(r.swings).toEqual(['heavy']);
    expect(r.charged).toBe(1);
  });

  it('let go between a tap and ready is a quick swing, not silence', () => {
    expect(play(press(0.4)).swings).toEqual(['light']);
  });

  it('the ring only shows once a hold is longer than a tap', () => {
    const h: MeleeHold = { charging: false, chargeT: 0, swingQueued: false };
    const r = play(press(0.5), h);
    expect(r.ringBeforeTap).toBe(false);
    const holding: MeleeHold = { charging: true, chargeT: TAP_TIME + 0.05, swingQueued: false };
    expect(chargeShown(holding, POWER)).toBeGreaterThan(0);
    expect(chargeShown({ charging: true, chargeT: TAP_TIME - 0.01 }, POWER)).toBe(0);
    expect(chargeShown({ charging: true, chargeT: 5 }, POWER)).toBe(1);
  });

  it('never both a quick and a heavy swing from one press, however it is held', () => {
    for (let held = 0.02; held < 1.5; held += 0.03) {
      const r = play(press(held));
      expect(r.swings, `held ${held.toFixed(2)} s`).toHaveLength(1);
    }
  });

  it('a quick swing let go while the tool recovers goes when it can, once', () => {
    const h: MeleeHold = { charging: false, chargeT: 0, swingQueued: false };
    const r1 = play(press(0.1, { ready: false }).slice(0, 10), h);
    expect(r1.swings).toEqual([]);
    expect(h.swingQueued).toBe(true);
    const r2 = play([{ down: false, ready: true }, { down: false, ready: true }], h);
    expect(r2.swings).toEqual(['light']);
  });

  it('a heavy swing does not wait for the tool to recover', () => {
    expect(play(press(1.0, { ready: false })).swings).toEqual(['heavy']);
  });

  it('let go and pressed again inside one frame: the first press still answers', () => {
    const r = play([{ pressed: true, down: true }, { down: true }, { pressed: true, down: true }, { down: false }]);
    expect(r.swings).toEqual(['light', 'light']);
  });

  it('rooted in a meeting, a press does nothing', () => {
    expect(play(press(0.1, { canAct: false })).swings).toEqual([]);
  });
});

describe('where a hit came from', () => {
  // Yaw 0 faces -z: ahead is (0, -1), right is (1, 0).
  it('ahead is the top of the screen, right is right, behind is the bottom', () => {
    expect(screenAngle(0, -3, 0)).toBeCloseTo(0);
    expect(screenAngle(3, 0, 0)).toBeCloseTo(Math.PI / 2);
    expect(screenAngle(-3, 0, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(screenAngle(0, 3, 0))).toBeCloseTo(Math.PI);
  });

  it('turns with the player: face the source and it is ahead', () => {
    const yaw = 1.1;
    expect(screenAngle(-Math.sin(yaw) * 4, -Math.cos(yaw) * 4, yaw)).toBeCloseTo(0);
  });
});

describe('floor markings', () => {
  it('a hazard fades in over its first 0.9 s as it always did, then holds', () => {
    // At the flicker's peak (sin = 1) the old ramp was min(0.35, age * 0.4).
    const peak = Math.PI / 40;
    expect(telegraphOpacity(0.5, 0.9, peak)).toBeCloseTo(Math.min(0.35, 0.5 * 0.4));
    expect(telegraphOpacity(1.2, 0.9, 0)).toBeCloseTo(0.45);
  });

  it('a landing marker keeps fading in for its whole life', () => {
    const peak = Math.PI / 40;
    expect(telegraphOpacity(0.2, 1, peak)).toBeLessThan(telegraphOpacity(0.8, 1, peak));
    expect(telegraphOpacity(0.99, 1, peak)).toBeLessThanOrEqual(0.35);
  });
});
