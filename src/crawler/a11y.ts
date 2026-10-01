/**
 * The comfort and accessibility rules (docs/SPEC_FIRST_LAUNCH.md), as pure
 * functions the game and the HUD call: what "off" means for shake and hit
 * pause, and how the screen-edge flashes differ by shape as well as colour.
 */

/**
 * How far the camera is thrown per unit of shake. Off is none at all: it
 * used to leave a fifth of it in, which is exactly the part somebody who
 * turns shake off is trying to get rid of.
 */
export function shakeScale(on: boolean): number {
  return on ? 0.15 : 0;
}

/** The freeze on a melee hit that lands, in seconds; with hit pause off there is none. */
export function hitPauseFor(power: boolean, on: boolean): number {
  if (!on) return 0;
  return power ? 0.09 : 0.035;
}

/**
 * The beat of stillness as the steam takes you under and lets you go, in
 * seconds. It is a hold for effect, like the one on a hit, so Hit pause off
 * drops it too. The crossing does not need it: its shaders are compiled by
 * `Game.precompile` off the main path, not during the freeze.
 */
export function crossingPauseFor(on: boolean, stop: number): number {
  return on ? stop : 0;
}

/** A flash on the screen's edge: hurt, healed, or pulled into a meeting. */
export type FlashKind = 'hurt' | 'heal' | 'meeting';

/** What the screen's edge is saying: a flash, or Sanity running low. */
export type EdgeKind = FlashKind | 'low';

interface EdgeShape {
  /** "r,g,b" of the glow. */
  readonly rgb: string;
  /** A hard rim this many px wide, drawn with no blur at all (0: none). */
  readonly rim: number;
  /** The soft glow inside it. */
  readonly blur: number;
  readonly spread: number;
}

/**
 * The shapes, so the edges are told apart without their colours: a hit is a
 * hard rim with a short, tight glow (a frame slammed round the screen); a
 * heal has no rim, only a wide soft glow that fades in from the edge; a
 * meeting has a thin rim and a middling glow. Low Sanity is the slow red
 * pulse it always was (it pulses: the movement is its cue).
 */
export const EDGE_SHAPE: Readonly<Record<EdgeKind, EdgeShape>> = {
  hurt: { rgb: '255,0,0', rim: 10, blur: 50, spread: 24 },
  heal: { rgb: '80,255,140', rim: 0, blur: 260, spread: 0 },
  meeting: { rgb: '80,140,255', rim: 3, blur: 120, spread: 30 },
  low: { rgb: '255,0,0', rim: 0, blur: 160, spread: 40 },
};

/** The box-shadow for an edge of `kind` at opacity `a`. */
export function edgeShadow(kind: EdgeKind, a: number): string {
  const s = EDGE_SHAPE[kind];
  const alpha = a.toFixed(3);
  const glow = `inset 0 0 ${s.blur}px ${s.spread}px rgba(${s.rgb},${alpha})`;
  return s.rim > 0 ? `inset 0 0 0 ${s.rim}px rgba(${s.rgb},${alpha}), ${glow}` : glow;
}
