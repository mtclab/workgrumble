import type { ActionData, NodeRefData } from '../../engine-api';
import { FIELDS } from '../fields';
import { HELPDESK_TIER } from './helpers';
import { PATIENCE_ACTIONS } from './ids';

/**
 * The patience ladder's verb (E9, 0.39.0).
 *
 * One field on the player's own node, written whole by the caller, exactly as
 * the invoice ladder's record verb is and for exactly the same reason. What
 * every account is DOING is derived from the contract stamps the tickets
 * already carry; what has to survive a Friday is the history - which beats have
 * been handed over, and what the weeks that no longer exist came to.
 *
 * Nobody presses it. It is the world's, dispatched twice a day on the same rail
 * the invoice ladder runs on, and once more at the end of the week for the
 * fold - a day is how long it takes a client to pick up a phone, and a week is
 * how long it takes them to decide anything.
 */

const ACTOR: NodeRefData = { ref: 'actor' };

/** The whole re-encoded ledger, computed by the caller that owns the format. */
const LEDGER_PARAM = 'ledger';

export const PATIENCE_ACTION_DATA: readonly ActionData[] = [
  {
    id: PATIENCE_ACTIONS.record,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: { pred: 'param_string_missing', param: LEDGER_PARAM },
        reason: 'A record of where a customer stands is a list of what has '
          + 'happened to them, and this is not one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.customerPatience,
        value: { param: LEDGER_PARAM },
      },
    ],
  },
];

export { LEDGER_PARAM as PATIENCE_LEDGER_PARAM };
