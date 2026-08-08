/**
 * The legendary manager / implement-then-revert arc's one piece of world logic
 * (E8, 0.25.0): when the revert is due.
 *
 * Everything else about the arc is content and reuse. The mandate is a ticket;
 * the rollback records are change_request nodes (the 0.10.0 artifact reused as the
 * `rollback_record` variant) the mandate seeds and `captureRollback` fills; the
 * mandated change and the reconstruct are the ordinary `serviceSetStartup`; and
 * the clean/painful split is the revert ticket's own two paths. The one thing that
 * is not content is the churn TURNING: once the mandate is implemented, the
 * manager is gone and the change is a mess, so the org reverts - which is the read
 * the day driver settles the revert off.
 *
 * It is a pure read of the graph, the same shape as `recertFollowUpDue`: it names
 * the revert to raise when the mandate has been worked to a close AND the revert
 * has not already been raised, and nothing otherwise. Because it reads the mandate
 * ticket - a Halcyon-only node - it returns nothing in every other world, so the
 * driver hook that calls it is inert everywhere the mandate does not live, exactly
 * as the recert follow-up and the override finding are.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { HALCYON_IDS } from './corporate-company';
import { FIELDS, STARTUP_TYPES } from './fields';

/** The seagull's mandate - the ticket the player implements it as. */
export const LEGENDARY_MANDATE_TICKET = 'ticket:halcyon-mandate';

/**
 * The revert. Summoned - and `follows` the mandate - because it turns up only once
 * the mandate has been implemented: the manager has moved on and the flattened
 * config is a finding, so the org puts it back. Raised the same minute the mandate
 * closes, which is both the mechanism and the only state a player meets it in.
 */
export const LEGENDARY_REVERT_TICKET = 'ticket:halcyon-revert';

/**
 * The three services the mandate flattens, each paired with the rollback record
 * that captures its prior startup type and the prior itself.
 *
 * The record ids are constants because four places name each - the mandate seeds
 * it, the capture step targets it, the clean revert reads it, and the test asserts
 * it - so those cannot drift about which node holds which service's prior. The
 * priors are the deliberate, VARIED defaults the seeded estate carries (two
 * Disabled, one Manual): varied so the record genuinely drives the restore rather
 * than a single blanket value doing it, which is what makes keeping the rollback
 * worth anything.
 */
export const LEGENDARY_SERVICES: readonly Readonly<{
  service: string;
  record: string;
  prior: string;
}>[] = [
  {
    service: HALCYON_IDS.telnet,
    record: 'changereq:halcyon-rollback-telnet',
    prior: STARTUP_TYPES.disabled,
  },
  {
    service: HALCYON_IDS.remoteRegistry,
    record: 'changereq:halcyon-rollback-remote-registry',
    prior: STARTUP_TYPES.disabled,
  },
  {
    service: HALCYON_IDS.modulesInstaller,
    record: 'changereq:halcyon-rollback-modules',
    prior: STARTUP_TYPES.manual,
  },
];

/**
 * The revert to raise, or nothing.
 *
 * Due when the mandate has been worked to a close AND the revert has not already
 * been raised. It keys only on the mandate being implemented - not on whether the
 * rollback was kept - because the manager leaves and the mess is revealed either
 * way; the rollback decides only whether the revert is clean or painful, which is
 * the revert ticket's own two paths, not this read.
 */
export function legendaryRevertDue(
  graph: ReadOnlyGraphView,
): string | undefined {
  if (graph.getNode(LEGENDARY_MANDATE_TICKET) === undefined) {
    return undefined;
  }

  if (graph.getField(LEGENDARY_MANDATE_TICKET, FIELDS.state) !== 'resolved') {
    return undefined;
  }

  if (graph.getNode(LEGENDARY_REVERT_TICKET) !== undefined) {
    return undefined;
  }

  return LEGENDARY_REVERT_TICKET;
}
