/**
 * The week the player is hired into, which carries nothing by rule.
 *
 * A leaf of its own so the action tables can read it at module load: the beer's
 * guard asks whether the probation is behind the player (#75), and reaching
 * into `pressure.ts` for one number from there is an import cycle that hands
 * the table `undefined`. `pressure.ts` re-exports it, so every other reader is
 * unchanged.
 */
export const PROBATION_WEEK = 1;
