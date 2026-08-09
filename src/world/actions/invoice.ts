import type { ActionData, NodeRefData } from '../../engine-api';
import { FIELDS } from '../fields';
import { HELPDESK_TIER } from './helpers';
import { INVOICE_ACTIONS } from './ids';

/**
 * The invoice ladder's verb (0.30.0, slice 2).
 *
 * One field on the player's own node, written whole by the caller, exactly as
 * the timesheet's record verb is - and for exactly the same reason. What the
 * ladder is DOING is derived from the sheet, the customer's own estate log and
 * the conduct file; the only thing that has to survive a save is which beats
 * have already been handed over, so that a morning cannot deliver the same
 * phone call twice.
 *
 * Nobody presses it. It is the world's, settled at the start of a shift on the
 * same rail the compliance sweep and the scream test run on - a day is how long
 * it takes somebody in accounts payable to get to your line.
 */

const ACTOR: NodeRefData = { ref: 'actor' };

/** The whole re-encoded ledger, computed by the caller that owns the format. */
const LADDER_PARAM = 'ladder';

export const INVOICE_ACTION_DATA: readonly ActionData[] = [
  {
    id: INVOICE_ACTIONS.escalate,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: { pred: 'param_string_missing', param: LADDER_PARAM },
        reason: 'A record of what has been said to a customer is a list of '
          + 'what was said, and this is not one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.invoiceLadder,
        value: { param: LADDER_PARAM },
      },
    ],
  },
];

export { LADDER_PARAM as INVOICE_LADDER_PARAM };
