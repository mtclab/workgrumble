/**
 * The resolution deadline, re-cut to whatever priority the ticket now carries.
 *
 * Its own module since 0.36.0, and for the reason the codebase keeps saying:
 * ONE truth. Two verbs now assign a priority to a ticket - the player's triage
 * (`ticket.classify`) and the audit deal that puts a first-line analyst's
 * filing on somebody else's ticket - and the whole point of the audit mechanic
 * is that a wrong filing BUYS THE WRONG CLOCK. A second copy of this arithmetic
 * in the deal would be a second answer to "how long has this ticket got", and
 * the one place the two could disagree is exactly the place the mechanic is.
 *
 * It lives beside the verbs rather than in `priority.ts` because it is ops
 * rather than arithmetic: the numbers are `SLA_TARGETS`, and this is how they
 * are written onto a node without the engine breaching the ticket on a partial
 * sum halfway through.
 */

import type { OpData } from '../../engine-api';
import { FIELDS } from '../fields';
import { PRIORITIES, type Priority, SLA_TARGETS } from '../priority';
import { fieldIs, TARGET } from './helpers';

/**
 * Re-cutting the resolution deadline to the priority that was just assigned.
 *
 * One op per priority, guarded on the priority the ops above have already
 * written, because the deadline has to come from the TABLE rather than from a
 * number the caller sent along with it. Assigning a P1 to something that has
 * been sitting all morning therefore leaves it with very little of its hour
 * left, which is the consequence of mis-triage made mechanical rather than
 * narrated.
 *
 * The sum is built in a scratch field and the real deadline is written ONCE,
 * at the end. Adding the terms straight onto `sla_deadline` put the ticket on
 * a partial sum for one mutation - the arrival plus the new target, before the
 * pause and the overnight hours went back on - and the engine breaches on
 * whatever the deadline says the moment it says it. A ticket carried over from
 * yesterday was therefore breached BY BEING TRIAGED, and a breach latches: the
 * player never saw a deadline that had passed, only a red badge that arrived
 * with the classification.
 */
export function deadlineOps(): readonly OpData[] {
  return PRIORITIES.map((priority: Priority) => ({
    op: 'when' as const,
    cond: fieldIs(TARGET, FIELDS.priority, priority),
    ops: [
      {
        op: 'set_field' as const,
        node: TARGET,
        field: FIELDS.slaRecut,
        value: {
          add: {
            node: TARGET,
            field: FIELDS.spawnedAt,
            by: { const: SLA_TARGETS[priority].resolution },
            // A deadline is a tick, and the engine holds ticks in the range
            // JavaScript can read back exactly. Nothing here can get near it;
            // the clamp is mandatory, and the honest bound for a tick is the
            // tick range.
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
      // And every minute the ticket was already excused goes back on top: the
      // pause it spent on somebody else, and the hours the office was dark.
      // The target is measured from the minute the ticket ARRIVED, and neither
      // of those is a minute anybody was allowed to work in. Without this,
      // following the app's own instruction - clear the hold, then triage -
      // cost the player every minute of it, and a ticket inherited on Monday
      // and triaged on Tuesday breached the moment it was classified.
      ...[FIELDS.heldTicks, FIELDS.offHoursTicks].map((counter) => ({
        op: 'when' as const,
        cond: {
          pred: 'field_is_number' as const,
          node: TARGET,
          field: counter,
        },
        ops: [
          {
            op: 'set_field' as const,
            node: TARGET,
            field: FIELDS.slaRecut,
            value: {
              add: {
                node: TARGET,
                field: FIELDS.slaRecut,
                by: { field: { node: TARGET, field: counter } },
                clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
              },
            },
          },
        ],
      })),
      // The one write anybody sees, and the only one the breach check reads.
      {
        op: 'set_field' as const,
        node: TARGET,
        field: FIELDS.slaDeadline,
        value: { field: { node: TARGET, field: FIELDS.slaRecut } },
      },
      { op: 'clear_field' as const, node: TARGET, field: FIELDS.slaRecut },
    ],
  }));
}

