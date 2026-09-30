import { describe, expect, it } from 'vitest';
import { flowField, generateLevel, type Level, TILE } from './level';
import { generateMokki } from './mokki';
import { Rng } from './rng';
import { newSave, normalizeSave } from './state';
import {
  castPlan,
  DELIBERATE,
  farthestCell,
  FIGURE_FAR,
  FIGURE_NEAR,
  figureCell,
  overflowDecision,
  type OverflowCheck,
  SteamClock,
  SUO_LINES,
  SUO_MAX_WORDS,
  toneBreaches,
  VISION_SECONDS,
} from './suo';
import { THEMES } from './textures';

/**
 * SUO's rules (docs/SPEC_SUO.md): what takes you under, how long you stay,
 * what a rune costs when the Löyly runs dry, where the Löylyhenki stands, and
 * the tone every SUO line keeps.
 */

const MAX = 100;
/** A sauna at 95%: the textbook overflow. */
const BASE: OverflowCheck = { source: 'sauna', before: 95, gain: 40, max: MAX, spent: false, hostileAt: Infinity };

describe('the overflow trigger', () => {
  it('takes you under on a deliberate gain into a nearly full meter', () => {
    expect(overflowDecision(BASE)).toBe('go');
  });

  it('needs the meter at 90% of max or more before the gain', () => {
    expect(overflowDecision({ ...BASE, before: 90, gain: 40 })).toBe('go');
    expect(overflowDecision({ ...BASE, before: 89.9, gain: 40 })).toBe('no');
    // It is a share of max, not a number: a bigger meter needs more in it.
    expect(overflowDecision({ ...BASE, max: 200, before: 179, gain: 100 })).toBe('no');
    expect(overflowDecision({ ...BASE, max: 200, before: 180, gain: 100 })).toBe('go');
  });

  it('needs the gain to pass max by at least 10', () => {
    expect(overflowDecision({ ...BASE, before: 95, gain: 15 })).toBe('go');
    expect(overflowDecision({ ...BASE, before: 95, gain: 14.9 })).toBe('no');
    expect(overflowDecision({ ...BASE, before: 100, gain: 10 })).toBe('go');
    expect(overflowDecision({ ...BASE, before: 100, gain: 9 })).toBe('no');
  });

  it('counts only a sauna, a Salmari or a rest: never the trickle or combat', () => {
    for (const source of ['sauna', 'salmari', 'rest'] as const) expect(overflowDecision({ ...BASE, source })).toBe('go');
    for (const source of ['trickle', 'combat'] as const) {
      expect(DELIBERATE.has(source)).toBe(false);
      // However big the spill.
      expect(overflowDecision({ ...BASE, source, before: MAX, gain: 1000 })).toBe('no');
    }
  });

  it('waits while a hostile who has noticed you is within 15 m', () => {
    expect(overflowDecision({ ...BASE, hostileAt: 3 })).toBe('wait');
    expect(overflowDecision({ ...BASE, hostileAt: 14.99 })).toBe('wait');
    expect(overflowDecision({ ...BASE, hostileAt: 15 })).toBe('go');
    // Waiting is only said for an overflow that would have counted.
    expect(overflowDecision({ ...BASE, before: 50, hostileAt: 3 })).toBe('no');
  });

  it('happens once per floor visit, or once per weekend at the mökki', () => {
    expect(overflowDecision({ ...BASE, spent: true })).toBe('no');
    expect(overflowDecision({ ...BASE, spent: true, hostileAt: 3 })).toBe('no');
  });

  it('the mökki sauna, which fills you whatever you had, still counts', () => {
    // The mökki sauna offers a whole meter (it sets Löyly to full).
    expect(overflowDecision({ ...BASE, before: 90, gain: MAX })).toBe('go');
  });

  it('keeps the once-a-visit and once-a-weekend marks in the save, fresh each floor and weekend', () => {
    const s = newSave(7);
    expect(s.floorState.suo).toBe(false);
    expect(s.weekend.suo).toBe(false);
    expect(s.suoBlessing).toBe(false);
    // A save from before SUO existed loads with the fields filled in.
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.suoBlessing;
    delete (old.floorState as Record<string, unknown>).suo;
    delete (old.floorState as Record<string, unknown>).coldSteam;
    delete (old.weekend as Record<string, unknown>).suo;
    const back = normalizeSave(old);
    expect(back?.suoBlessing).toBe(false);
    expect(back?.floorState.suo).toBe(false);
    expect(back?.floorState.coldSteam).toBe(false);
    expect(back?.weekend.suo).toBe(false);
  });
});

describe('the steam meter', () => {
  it('always runs out after 30 s of play, and not before', () => {
    const r = new Rng(99);
    for (let run = 0; run < 200; run++) {
      const c = new SteamClock();
      let t = 0;
      let ended = false;
      // Frames of any length the loop can produce (it caps dt at 0.05 s), and some odd ones.
      while (!ended) {
        const dt = run % 5 === 0 ? r.range(0, 0.25) : r.range(0.001, 0.05);
        ended = c.tick(dt);
        t += dt;
        if (!ended) expect(t).toBeLessThan(VISION_SECONDS + 1e-9);
        expect(t).toBeLessThan(VISION_SECONDS + 0.3);
      }
      expect(t).toBeGreaterThanOrEqual(VISION_SECONDS - 1e-9);
      expect(c.done).toBe(true);
      expect(c.fraction).toBe(0);
    }
  });

  it('runs down only with play: a zero or backwards step changes nothing', () => {
    const c = new SteamClock();
    c.tick(0);
    c.tick(-5);
    expect(c.left).toBe(VISION_SECONDS);
    expect(c.fraction).toBe(1);
    c.tick(15);
    expect(c.fraction).toBeCloseTo(0.5);
    expect(c.tick(15)).toBe(true);
  });
});

describe('casting when the Löyly runs dry', () => {
  it('pays in Löyly when there is enough, at the usual odds', () => {
    expect(castPlan(20, 20, 50, 0.8, false)).toEqual({ kind: 'loyly', cost: 20, odds: 0.8 });
  });

  it('short of Löyly, costs 1.5x the Löyly cost in sanity at a quarter worse odds', () => {
    expect(castPlan(20, 19, 100, 0.8, false)).toEqual({ kind: 'sisu', sanity: 30, odds: 0.8 * 0.75 });
    // Rounded up: sisu is never cheaper than 1.5x.
    expect(castPlan(15, 0, 100, 0.6, false)).toEqual({ kind: 'sisu', sanity: 23, odds: 0.6 * 0.75 });
  });

  it('refuses with neither: never the last of your sanity', () => {
    expect(castPlan(20, 5, 30, 0.8, false)).toEqual({ kind: 'refuse' });
    expect(castPlan(20, 5, 29, 0.8, false)).toEqual({ kind: 'refuse' });
    expect(castPlan(20, 5, 31, 0.8, false).kind).toBe('sisu');
  });

  it('the blessing pays for the next rune whatever you have', () => {
    expect(castPlan(40, 0, 1, 0.05, true)).toEqual({ kind: 'blessed' });
    expect(castPlan(40, 100, 100, 0.9, true)).toEqual({ kind: 'blessed' });
  });
});

describe('the tone of SUO', () => {
  it('every SUO line is short, calm, free of emoji and of the office', () => {
    for (const [key, line] of Object.entries(SUO_LINES)) {
      expect(toneBreaches(line), `${key}: "${line}"`).toEqual([]);
    }
  });

  it('catches every kind of breach (the lint has teeth)', () => {
    const bad: [string, string][] = [
      ['nine words', 'one two three four five six seven eight nine'],
      ['an exclamation', 'The steam takes you!'],
      ['an emoji', 'The steam takes you 🧖'],
      ['a pictograph', 'The steam ♨ takes you'],
      ['a ticket', 'Your ticket is in the bog.'],
      ['tickets', 'The bog keeps your tickets.'],
      ['an SLA', 'The SLA does not reach here.'],
      ['a meeting', 'No meeting down here.'],
      ['a KPI', 'The KPI sleeps.'],
      ['a stakeholder', 'Stakeholders drown too.'],
      ['a sync', 'We will sync later.'],
      ['a deliverable', 'The deliverable sinks.'],
      ['a manager', 'Your Manager stands there.'],
      ['HR', 'HR cannot find you.'],
      ['IT', 'Even IT is quiet.'],
      ['an email', 'An email floats past.'],
      ['emailing', 'Stop emailing the steam.'],
      ['Teams', 'Teams is far away.'],
      ['synergy', 'Synergy of peat and water.'],
      ['a deadline', 'The deadline passed.'],
    ];
    for (const [what, line] of bad) expect(toneBreaches(line).length, what).toBeGreaterThan(0);
  });

  it('does not mistake ordinary words for the office', () => {
    for (const line of ['It waits for you.', 'The teams of the dead.', 'A hitch in the air.', 'Give it your hand. (E)']) {
      expect(toneBreaches(line), line).toEqual([]);
    }
    expect(SUO_MAX_WORDS).toBe(8);
  });
});

describe('where the Löylyhenki stands', () => {
  function floors(): Level[] {
    const out: Level[] = [];
    for (let f = 0; f < 5; f++) {
      const theme = THEMES[f % THEMES.length];
      if (theme === undefined) throw new Error('no theme');
      for (let k = 0; k < 6; k++) out.push(generateLevel(f, theme, 1000 + f * 97 + k * 13, true));
    }
    out.push(generateMokki(4242, true));
    out.push(generateMokki(99, true, ['woodshed', 'savusauna', 'laituri', 'boat', 'dog', 'guestroom', 'palju']));
    return out;
  }

  it('on a floor cell you can walk to, 10 to 18 m away', () => {
    const r = new Rng(5);
    let placed = 0;
    for (const lv of floors()) {
      // From the start, and from beside every interactable you could be standing at (the kiuas among them).
      const from = [lv.start, ...lv.interactables.map((it) => ({ x: it.x + TILE, z: it.z }))];
      for (const p of from) {
        const reach = flowField(lv, p.x, p.z, 400);
        const start = Math.floor(p.z / TILE) * lv.w + Math.floor(p.x / TILE);
        if ((reach[start] ?? -1) < 0 || lv.solid[start] === 1) continue;
        const at = figureCell(lv, p.x, p.z, r);
        if (at === null) continue;
        placed++;
        const d = Math.hypot(at.x - p.x, at.z - p.z);
        expect(d).toBeGreaterThanOrEqual(FIGURE_NEAR);
        expect(d).toBeLessThanOrEqual(FIGURE_FAR);
        const i = Math.floor(at.z / TILE) * lv.w + Math.floor(at.x / TILE);
        expect(lv.floor[i]).toBe(1);
        expect(lv.solid[i]).toBe(0);
        expect(reach[i]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(placed).toBeGreaterThan(100);
  });

  it('from every floor start there is somewhere in range', () => {
    const r = new Rng(6);
    for (const lv of floors()) expect(figureCell(lv, lv.start.x, lv.start.z, r)).not.toBeNull();
  });

  it('falls back to the farthest reachable cell, never the one you stand on', () => {
    const lv = floors()[0] as Level;
    const at = farthestCell(lv, lv.start.x, lv.start.z);
    const reach = flowField(lv, lv.start.x, lv.start.z, 400);
    const i = Math.floor(at.z / TILE) * lv.w + Math.floor(at.x / TILE);
    expect(reach[i]).toBeGreaterThan(0);
  });
});
