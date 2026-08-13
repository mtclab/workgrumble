/**
 * The onboarding event: a customer that SIGNS mid-week (0.13.0, the MSP arc's
 * capstone).
 *
 * Every other customer of the MSP is stood up at Monday boot by `mspSetup`. This
 * one is not: it arrives during the shift, the way the reply-all storm arrives on
 * Bodgeworth's Wednesday - a scheduled beat that changes the world when its
 * minute comes round rather than a thing that was always there. A small business
 * has just signed, the MSP has taken it on undocumented, and the estate stands up
 * UNKNOWN: you have not audited it yet, and the runbook you were handed is thin
 * and, where it is not thin, wrong.
 *
 * An onboarding is world DATA, the same shape as an incident: an id a day script
 * names, the customer it stands up, the setup ops that build that customer's
 * estate, and the notice the desk shows when it lands. The driver applies the
 * ops with a runtime `applySetup` - the same seam a dripped ticket or a filed
 * change request uses - and a save taken after it fired carries the new estate
 * whole. It is idempotent by the customer node: the driver skips an onboarding
 * whose customer is already in the graph, so a replay or a reload cannot stand
 * the same client up twice.
 *
 * Nothing here reads the clock or the simulation RNG; the ops it returns are the
 * customer's estate as authored (`mspOnboardingSetup`), and the minute it lands
 * on is the day script's, not this module's.
 */

import type { SetupOp } from '../engine-api';
import { MSP_CUSTOMERS, mspOnboardingSetup } from './msp-company';

export interface OnboardingEvent {
  /** The id a day script's `onboarding` slot names. */
  readonly id: string;
  /**
   * The customer node this stands up. The driver reads it to skip an onboarding
   * whose client is already in the graph, so the event is safe to cross twice
   * (a replay, a reload landing back inside the day).
   */
  readonly customer: string;
  /** The estate this signs up, as the ops that build it. */
  readonly setup: () => readonly SetupOp[];
  /** What the desk is told when the client lands, as a self-dismissing notice. */
  readonly notice: {
    readonly title: string;
    readonly body: string;
  };
}

/**
 * TILLMAN-FREIGHT signing on: the one onboarding the arc ships. A second would
 * be a second entry here and a second `onboarding` slot on some employer's week.
 */
const TILLMAN_ONBOARDING: OnboardingEvent = {
  id: 'onboarding:tillman',
  customer: MSP_CUSTOMERS.tillman,
  setup: mspOnboardingSetup,
  notice: {
    title: 'New customer signed: TILLMAN-FREIGHT',
    body: 'A small haulage firm just signed, taken on undocumented. Their estate '
      + 'is on the network but nobody has audited it. The handover note says the '
      + 'nightly backups are green - run discovery (audit customer:tillman) and '
      + 'see what is actually there before we own it.',
  },
};

/**
 * Exported because the work-kind index reads every setup this build ships
 * (`work-kinds.ts`), and an onboarding's estate is a third of an answer:
 * TILLMAN's server is built HERE rather than by the MSP, so a list this module
 * kept to itself left the one ticket about that server unclassifiable.
 */
export const ONBOARDINGS: readonly OnboardingEvent[] = [TILLMAN_ONBOARDING];

/** The onboarding a day script's slot names, or undefined if nobody wrote it. */
export function findOnboarding(id: string): OnboardingEvent | undefined {
  return ONBOARDINGS.find((event) => event.id === id);
}

/** Whether an id names an onboarding the world knows how to stand up. */
export function isOnboardingId(id: string): boolean {
  return findOnboarding(id) !== undefined;
}
