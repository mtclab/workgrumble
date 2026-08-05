/**
 * How a probation ending becomes the way a career leaves an employer.
 *
 * `week.ts` decides an OUTCOME on the Friday - passed, fired, redundant - which
 * is the review's own word for what happened in the room. `career.ts` maps the
 * three EXITS - completed, resigned, fired - onto what a career carries out of a
 * shop. This is the one-line bridge between them, kept as its own module because
 * it is the only place the two vocabularies meet and a switch built out of the
 * wrong translation would carry the wrong standing to the next job.
 *
 *  - PASSED  -> completed. You cleared the bar. The career carries clean.
 *  - FIRED   -> fired.     Let go for cause. The standing takes the dent and
 *                          the firing follows you, which is what a reference is.
 *  - REDUNDANT -> completed. Made redundant is NOT for cause - the reference is
 *                          the dull factual one and nothing follows you - so it
 *                          carries as clean as a pass does. It leaves no trail
 *                          because `career.ts` has trails for the two exits that
 *                          are somebody's fault, and a redundancy is nobody's.
 *  - PENDING -> null.      The week is not over; there is no exit to take yet,
 *                          and an offer asked for before the verdict is a screen
 *                          that says so rather than one that guesses.
 *
 * The `resigned` exit is not reachable from a review outcome, because resigning
 * is a thing the player does rather than a verdict the week hands down - it
 * waits for the quit action a later slice adds, and the engine already carries
 * it (`careerAfter`, `career.test.ts`).
 */

import type { EmployerExit } from './career';
import type { ReviewOutcome } from './week';

export function exitForOutcome(outcome: ReviewOutcome): EmployerExit | null {
  switch (outcome) {
    case 'passed':
    case 'redundant':
      return 'completed';
    case 'fired':
      return 'fired';
    case 'pending':
      return null;
  }
}

/**
 * How the next employer's offer reads, given how this one ended.
 *
 * The tone is a function of the outcome and nothing else, so the offer screen
 * and any test of it agree without either reading a meter: a pass is an offer
 * you earned, a firing is the one you could still get, and a redundancy is the
 * even-handed one that comes with the dull factual reference.
 */
export type OfferTone = 'earned' | 'even' | 'desperate';

export function offerTone(outcome: ReviewOutcome): OfferTone | null {
  switch (outcome) {
    case 'passed':
      return 'earned';
    case 'redundant':
      return 'even';
    case 'fired':
      return 'desperate';
    case 'pending':
      return null;
  }
}
