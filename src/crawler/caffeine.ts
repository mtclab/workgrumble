/**
 * The other tightrope. The office sim's energy drink was "legal, no
 * suspicion: faster actions, then the crash; chaining cans means jitters and
 * a harder crash." Here caffeine is a meter in milligrams: a little makes you
 * sharp, a lot makes you shake, too much and your heart has opinions. It
 * wears off, and the higher you went the harder you land.
 */

export type CaffeineBand = 'none' | 'alert' | 'wired' | 'jittery' | 'palpitations';

export interface CaffeineEffects {
  readonly label: string;
  readonly speed: number;
  readonly attack: number;
  readonly energyRegen: number;
  /** Aim jitter (0..1). */
  readonly jitter: number;
  /** Sanity lost per second. */
  readonly drain: number;
  /** You cannot sleep like this. */
  readonly noRest: boolean;
}

export const CAFFEINE_EFFECTS: Record<CaffeineBand, CaffeineEffects> = {
  none: { label: 'Decaf', speed: 0, attack: 0, energyRegen: 0, jitter: 0, drain: 0, noRest: false },
  alert: { label: 'Alert', speed: 0.08, attack: 0.08, energyRegen: 0.5, jitter: 0, drain: 0, noRest: false },
  wired: { label: 'WIRED', speed: 0.18, attack: 0.2, energyRegen: 1, jitter: 0.1, drain: 0, noRest: true },
  jittery: { label: 'Jittery', speed: 0.22, attack: 0.25, energyRegen: 1.2, jitter: 0.6, drain: 0.4, noRest: true },
  palpitations: { label: 'PALPITATIONS', speed: 0.25, attack: 0.25, energyRegen: 1.2, jitter: 1, drain: 2, noRest: true },
};

/** Effective milligrams after tolerance. */
export function effectiveCaffeine(mg: number, tolerance: number): number {
  return mg * (1 - Math.min(0.6, tolerance) * 0.6);
}

export function caffeineBand(mg: number, tolerance: number): CaffeineBand {
  const e = effectiveCaffeine(mg, tolerance);
  if (e >= 460) return 'palpitations';
  if (e >= 300) return 'jittery';
  if (e >= 150) return 'wired';
  if (e >= 50) return 'alert';
  return 'none';
}

/** Caffeine half-life, in game seconds (it is a very long work day). */
export const CAFFEINE_HALF_LIFE = 80;

export function caffeineDecay(mg: number, dt: number): number {
  return mg * Math.pow(0.5, dt / CAFFEINE_HALF_LIFE);
}

/** Crash length after coming down from `peak` effective mg. */
export function crashSeconds(peak: number, caffeinePerk: boolean): number {
  if (peak < 150) return 0;
  return Math.min(45, (peak - 100) / 8) * (caffeinePerk ? 0.5 : 1);
}

export interface CaffeinatedDrink {
  readonly id: string;
  readonly mg: number;
}

/** Each can nudges tolerance up; it drifts back down over days. */
export function toleranceAfter(tolerance: number, mg: number): number {
  return Math.min(1, tolerance + mg / 2500);
}
