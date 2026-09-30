import { flowField, type Level, TILE, toCell } from './level';
import type { Rng } from './rng';

/**
 * SUO: the bog under the office, and the rules that take you there and back.
 *
 * Everything here is pure (no scene, no DOM), so the thresholds, the clock,
 * the cold-steam price and the tone of every SUO line are pinned by unit
 * tests. `vision.ts` is the part that redresses the world; `docs/SPEC_SUO.md`
 * is the contract.
 */

// ================================================================== the lines

/**
 * Every line SUO says. The office is the joke and SUO plays it straight, so
 * these are short, unexcited and free of office words - `toneBreaches` says
 * so, and the unit tests fail the build on a breach.
 */
export const SUO_LINES = {
  /** On the way under. */
  enter: 'The steam takes you under.',
  /** The one line on screen while you look for the figure. */
  seek: 'Something stands in the steam. Go to it.',
  /** Close enough to touch it. */
  near: 'The Löylyhenki waits. Give it your hand. (E)',
  /** The steam ran out: back, nothing gained, nothing lost. */
  leave: 'The steam thins. You are back.',
  /** You took its hand. */
  blessed: 'It takes the weight. The next rune holds.',
  /** An overflow with someone after you: no vision this time. */
  wait: 'The steam waits. Not with them this close.',
  /** A save asked for while under. */
  noSave: 'Nothing is kept here.',
  /** A rune cast on sanity because the Löyly ran dry. */
  dry: 'Cold steam. You pay with yourself.',
  /** The blessing, in the effects list until the next rune spends it. */
  effect: 'Steam-blessed: next rune free and certain',
} as const;

/** Most words a SUO line may have. */
export const SUO_MAX_WORDS = 8;

/**
 * The office's vocabulary. Acronyms and the chat app match only as written
 * (so "it" and "teams" stay usable); the rest match in any case, plural and
 * verb forms included.
 */
const OFFICE_EXACT = ['SLA', 'KPI', 'HR', 'IT', 'Teams'];
const OFFICE_WORDS = ['ticket', 'meeting', 'stakeholder', 'sync', 'deliverable', 'manager', 'email', 'e-mail', 'synergy', 'deadline'];

/** What is wrong with a SUO line, if anything: one reason per breach. */
export function toneBreaches(line: string): string[] {
  const out: string[] = [];
  const words = line.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length > SUO_MAX_WORDS) out.push(`${words.length} words (at most ${SUO_MAX_WORDS})`);
  if (line.includes('!')) out.push('an exclamation mark');
  if (/\p{Extended_Pictographic}/u.test(line)) out.push('an emoji');
  for (const w of OFFICE_EXACT) if (new RegExp(`(^|[^\\p{L}])${w}s?($|[^\\p{L}])`, 'u').test(line)) out.push(`office word "${w}"`);
  for (const w of OFFICE_WORDS) if (new RegExp(`(^|[^\\p{L}])${w}(s|es|ed|ing)?($|[^\\p{L}])`, 'iu').test(line)) out.push(`office word "${w}"`);
  return out;
}

// ================================================================== the trigger

/** Where a Löyly gain came from. Only the deliberate ones can take you under. */
export type LoylySource = 'sauna' | 'salmari' | 'rest' | 'trickle' | 'combat';

/** The gains that count: a throw on the kiuas, a Salmari, a sleep. */
export const DELIBERATE: ReadonlySet<LoylySource> = new Set(['sauna', 'salmari', 'rest']);

/** The meter has to be this full already, as a share of max. */
export const OVERFLOW_FULL = 0.9;
/** And the gain has to spill past max by at least this much. */
export const OVERFLOW_SPILL = 10;
/** No vision with a hostile who has noticed you this close, in metres. */
export const HOSTILE_WAIT = 15;

export interface OverflowCheck {
  readonly source: LoylySource;
  /** Löyly before the gain. */
  readonly before: number;
  /** The gain as offered, before the clamp at max. */
  readonly gain: number;
  readonly max: number;
  /** A vision already happened on this floor visit (office) or this weekend (mökki). */
  readonly spent: boolean;
  /** Distance to the nearest hostile that has noticed you (Infinity if none). */
  readonly hostileAt: number;
}

/** 'go': the steam takes you under. 'wait': it would have, but not with someone after you. */
export type OverflowResult = 'go' | 'wait' | 'no';

export function overflowDecision(c: OverflowCheck): OverflowResult {
  if (!DELIBERATE.has(c.source) || c.spent || c.max <= 0) return 'no';
  if (c.before < c.max * OVERFLOW_FULL) return 'no';
  if (c.before + c.gain - c.max < OVERFLOW_SPILL) return 'no';
  return c.hostileAt < HOSTILE_WAIT ? 'wait' : 'go';
}

// ================================================================== the steam meter

/** How long a vision lasts, in seconds of play. */
export const VISION_SECONDS = 30;

/** The steam meter: seconds left, run down only by play (the pause menu stops the loop). */
export class SteamClock {
  left = VISION_SECONDS;

  /** Run the clock; true once the steam is gone. */
  tick(dt: number): boolean {
    this.left = Math.max(0, this.left - Math.max(0, dt));
    return this.left <= 0;
  }

  /** 1 when full, 0 when gone: the width of the thin meter. */
  get fraction(): number {
    return this.left / VISION_SECONDS;
  }

  get done(): boolean {
    return this.left <= 0;
  }
}

// ================================================================== casting when dry

/** Sanity paid per point of Löyly a rune would have cost. */
export const SISU_PRICE = 1.5;
/** Cast chance on sisu, as a share of the usual. */
export const SISU_ODDS = 0.75;

export type CastPlan =
  /** The blessing: costs nothing, cannot fail, and is spent. */
  | { readonly kind: 'blessed' }
  | { readonly kind: 'loyly'; readonly cost: number; readonly odds: number }
  | { readonly kind: 'sisu'; readonly sanity: number; readonly odds: number }
  /** Neither the Löyly nor the sanity for it. */
  | { readonly kind: 'refuse' };

/**
 * How a rune gets paid for. With the Löyly for it, the usual way; short of
 * it, with sanity at 1.5x the cost and a quarter worse odds - but never with
 * the last of it, so a rune cannot burn you out.
 */
export function castPlan(cost: number, loyly: number, sanity: number, odds: number, blessed: boolean): CastPlan {
  if (blessed) return { kind: 'blessed' };
  if (loyly >= cost) return { kind: 'loyly', cost, odds };
  const price = Math.ceil(cost * SISU_PRICE);
  if (sanity > price) return { kind: 'sisu', sanity: price, odds: odds * SISU_ODDS };
  return { kind: 'refuse' };
}

// ================================================================== where the Löylyhenki stands

/** The figure stands this far away, in metres, on a floor you can walk to. */
export const FIGURE_NEAR = 10;
export const FIGURE_FAR = 18;

/**
 * A cell for the Löylyhenki: reachable on foot from the player, and between
 * 10 and 18 m away as the crow flies. Cells with nothing solid round them
 * are preferred, so it never stands pressed into a wall or a desk. Null only
 * if nothing reachable is in range (a floor too small or walled in), and the
 * caller then picks the farthest reachable cell instead.
 */
export function figureCell(level: Level, px: number, pz: number, rng: Rng): { x: number; z: number } | null {
  const dist = flowField(level, px, pz, 400);
  const open: number[] = [];
  const tight: number[] = [];
  for (let cz = 1; cz < level.h - 1; cz++) {
    for (let cx = 1; cx < level.w - 1; cx++) {
      const i = cz * level.w + cx;
      if ((dist[i] ?? -1) < 0 || level.floor[i] !== 1 || level.solid[i] === 1) continue;
      const d = Math.hypot(cx * TILE + TILE / 2 - px, cz * TILE + TILE / 2 - pz);
      if (d < FIGURE_NEAR || d > FIGURE_FAR) continue;
      const clear = level.solid[i - 1] !== 1 && level.solid[i + 1] !== 1 && level.solid[i - level.w] !== 1 && level.solid[i + level.w] !== 1;
      (clear ? open : tight).push(i);
    }
  }
  const pool = open.length > 0 ? open : tight;
  if (pool.length === 0) return null;
  const i = rng.pick(pool);
  const cx = i % level.w;
  return { x: cx * TILE + TILE / 2, z: ((i - cx) / level.w) * TILE + TILE / 2 };
}

/** The fallback: the reachable cell farthest from the player (never the player's own). */
export function farthestCell(level: Level, px: number, pz: number): { x: number; z: number } {
  const dist = flowField(level, px, pz, 400);
  let best = toCell(pz) * level.w + toCell(px);
  let bestD = -1;
  dist.forEach((v, i) => {
    if (v > bestD && level.floor[i] === 1) {
      bestD = v;
      best = i;
    }
  });
  const cx = best % level.w;
  return { x: cx * TILE + TILE / 2, z: ((best - cx) / level.w) * TILE + TILE / 2 };
}
