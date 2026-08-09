import type { ActionData, GuardData, NodeRefData } from '../../engine-api';
import { FIELDS } from '../fields';
import { HELPDESK_TIER, not } from './helpers';
import { TIMESHEET_ACTIONS } from './ids';

/**
 * The timesheet verbs (0.30.0, slice 1).
 *
 * Every one of them writes a field on the PLAYER's own node, which is where a
 * timesheet belongs: it is not an artifact anything else is filed against - no
 * guard consults it, no ticket hangs off it, nothing asks the graph whether a
 * sheet exists - so it is fields on the person who has to fill it in rather
 * than a new node kind and a schema migration to hold four strings. A change
 * request earned its own kind because half the estate's verbs consult one; a
 * timesheet is read by the person who wrote it and, next slice, by the customer
 * it is sent to. Both of those are reads of the player's own record.
 *
 * The whole field arrives already written from `world/timesheet.ts`, the way a
 * touch record and a conduct line do, and the engine's job here is to insist it
 * IS a field and to say when the paper has already gone in. That keeps the
 * encoding in one place and keeps a replay writing the identical string rather
 * than rebuilding it against a clock nobody saved.
 */

const ACTOR: NodeRefData = { ref: 'actor' };

/** The whole re-encoded field, computed by the caller that owns the format. */
const LINES_PARAM = 'lines';
const CLAIMS_PARAM = 'claims';
/** 1 when the week ended and nobody had filled it in. */
const AUTO_PARAM = 'auto';

export const TIMESHEET_SUBMITTED_REASON = 'That sheet has gone in. Hours are '
  + 'amended by asking the person who invoices them, not by editing the copy on '
  + 'your own machine - and the week the customer is looking at is the one you '
  + 'submitted.';

/**
 * Whether the sheet is already in, which is the one thing both player verbs
 * refuse on. The stamp is a number or it is absent; there is no third state and
 * no flag beside it to fall out of step with.
 */
const ALREADY_SUBMITTED: GuardData = {
  when: {
    pred: 'field_is_number',
    node: ACTOR,
    field: FIELDS.timesheetSubmittedAt,
  },
  reason: TIMESHEET_SUBMITTED_REASON,
};

export const TIMESHEET_ACTION_DATA: readonly ActionData[] = [
  {
    // The world's own. One line, the minute what you were doing changed.
    id: TIMESHEET_ACTIONS.record,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: { pred: 'param_string_missing', param: LINES_PARAM },
        reason: 'A record of where the minutes went is a list of minutes, and '
          + 'this is not one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.timesheetLog,
        value: { param: LINES_PARAM },
      },
    ],
  },
  {
    // The player's. It writes the OTHER field, and that is the design.
    id: TIMESHEET_ACTIONS.claim,
    tier: HELPDESK_TIER,
    validate: [
      ALREADY_SUBMITTED,
      {
        when: { pred: 'param_string_missing', param: CLAIMS_PARAM },
        reason: 'A timesheet entry is a number of minutes against a line, and '
          + 'nothing arrived that is one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.timesheetClaim,
        value: { param: CLAIMS_PARAM },
      },
    ],
  },
  {
    // In. The stamp is the minute, so a reload lands on a submitted sheet and
    // a replay stamps the same minute rather than whenever it happened to run.
    id: TIMESHEET_ACTIONS.submit,
    tier: HELPDESK_TIER,
    validate: [
      ALREADY_SUBMITTED,
      {
        when: not({ pred: 'param_int_in', param: AUTO_PARAM, values: [0, 1] }),
        reason: 'A sheet is either filled in or it is the one the week ended '
          + 'holding, and this says neither.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.timesheetSubmittedAt,
        value: { now: true },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.timesheetSubmittedAuto,
        value: { eq: [{ param: AUTO_PARAM }, { const: 1 }] },
      },
    ],
  },
];

export { AUTO_PARAM as TIMESHEET_AUTO_PARAM };
export { CLAIMS_PARAM as TIMESHEET_CLAIMS_PARAM };
export { LINES_PARAM as TIMESHEET_LINES_PARAM };
