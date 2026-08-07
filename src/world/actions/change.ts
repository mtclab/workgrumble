import type {
  ActionData,
  GuardData,
  NodeRefData,
  OpData,
  PredData,
} from '../../engine-api';
import { BREAK_GLASS_ABUSE_SUSPICION } from '../change-control';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { CHANGE_ACTIONS } from './ids';
import { HELPDESK_TIER } from './helpers';

/**
 * Break-glass, as the audit trail sees it (E6, 0.18.0).
 *
 * Both verbs are aimed at whoever dispatched them - the trail is a property of
 * the engineer who broke the glass, and it lives on the player node beside the
 * install audit and the on-call record. Neither RESTARTS the unit: the emergency
 * fix is the ordinary `unit.restart` the driver dispatches alongside a
 * legitimate break, exactly as the software verbs leave the desktop manifest to
 * the shell. What the world holds is the RECORD, because the record has to
 * survive a save, a replay, and the fire being put out.
 *
 * The lines are `unit@tick` and nothing the world stitches together: the driver
 * builds the line in the minute the glass was broken and this appends it, the
 * same contract `software.install` keeps, so a replay writes the identical
 * string. Whether there was a real fire behind the break is the DRIVER's
 * question (`hasActiveIncident`, a pure read of the estate) - the world trusts
 * the line the same as it trusts a touch log, and records which trail it goes on.
 */
const ACTOR: NodeRefData = { ref: 'actor' };

/** The unit, named once, so a record reads back as being about something. */
const ID_PARAM = 'id';
/** The whole `unit@tick` line the trail takes, built by the driver. */
const LINE_PARAM = 'line';

const NAMED: GuardData[] = [
  {
    when: { pred: 'param_blank', param: ID_PARAM },
    reason: 'The glass was broken and nobody wrote down on what. A break-glass '
      + 'line with no unit on it is a record that cannot be read back, which is '
      + 'the same as no record at all.',
  },
  {
    when: { pred: 'param_blank', param: LINE_PARAM },
    reason: 'A break-glass override has to say which minute it happened on. A '
      + 'record with no stamp is one the audit cannot place, and the whole point '
      + 'of breaking the glass loudly is that it can.',
  },
];

/** The exact line already on a trail - the same minute cannot log twice. */
function alreadyLogged(field: string): PredData {
  return {
    pred: 'line_in_field',
    node: ACTOR,
    field,
    value: { param: LINE_PARAM },
  };
}

/** Appending the `unit@tick` line to a trail, which IS the record. */
function record(field: string): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field,
    value: {
      append_line: {
        node: ACTOR,
        field,
        value: { param: LINE_PARAM },
      },
    },
  };
}

export const BREAK_GLASS_TWICE_REASON = 'That override is already on the '
  + 'break-glass trail for this minute. The glass cannot be broken twice in the '
  + 'same minute it was broken in.';

/**
 * The two verbs.
 *
 * `breakGlassRecord` writes a legitimate emergency onto `break_glass_audit`,
 * which only ever grows. `breakGlassAbuse` writes an override pulled with no
 * fire onto `break_glass_abuse` AND charges its suspicion - the abuse is its own
 * record and its own cost, because breaking the glass for routine work reads at
 * the review the way a morning on Do Not Disturb does. Neither has a policy or
 * incident branch: WHETHER the break was legitimate is decided by the driver
 * from the estate (`hasActiveIncident`) and priced by which verb it dispatches,
 * exactly as the software policy is priced off the install trail rather than
 * enforced in the verb.
 */
export const CHANGE_ACTION_DATA: readonly ActionData[] = [
  {
    id: CHANGE_ACTIONS.breakGlassRecord,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      { when: alreadyLogged(FIELDS.breakGlassAudit), reason: BREAK_GLASS_TWICE_REASON },
    ],
    apply: [record(FIELDS.breakGlassAudit)],
  },
  {
    id: CHANGE_ACTIONS.breakGlassAbuse,
    tier: HELPDESK_TIER,
    validate: [
      ...NAMED,
      { when: alreadyLogged(FIELDS.breakGlassAbuse), reason: BREAK_GLASS_TWICE_REASON },
    ],
    apply: [
      record(FIELDS.breakGlassAbuse),
      // The cost, charged on the abuse and clamped like every other meter move:
      // suspicion is the meter the review reads for "something the boss would
      // rather not see", and an emergency override with no emergency is exactly
      // that.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.suspicion,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.suspicion,
            by: { const: BREAK_GLASS_ABUSE_SUSPICION },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
    ],
  },
];
