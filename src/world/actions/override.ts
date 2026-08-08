/**
 * The manager override / CYA verbs (E8, 0.24.0), and the reuse they turn on.
 *
 * The mechanic is: a manager orders something against best practice, and the
 * only professional path is to GET IT IN WRITING - a risk acceptance the ordering
 * manager signs - before you act. Two verbs carry it, and neither invents a new
 * artifact:
 *
 *  - `riskAcceptanceSign` is the SIGNATURE. It takes the risk-acceptance draft
 *    the order arrives with - a change_request node, the 0.10.0 artifact reused
 *    as the `risk_acceptance` variant - and records the ordering manager's
 *    approval on it, exactly the 0.10.0 approval decision (`cr_decision = approve`)
 *    with the accepting owner's name (`cr_accepted_by`, copied from the required
 *    signer the draft was seeded with). It does not create the artifact and it
 *    does not do the risky thing: it is the getting-it-in-writing, and nothing
 *    else. The risky action is the ordinary `accountAddToGroup` onto Domain
 *    Admins, and the ticket's resolution rule is what makes the two one move.
 *
 *  - `overrideFallout` is the CONSEQUENCE, and where the sign-off's teeth land.
 *    The grant gets flagged whichever way it was made; this reads the risk
 *    acceptance and lands the finding where it belongs - on the accepting owner
 *    who signed, charging the desk nothing, or on the desk itself when nothing
 *    was signed, charged as suspicion. It is dispatched by the day driver off a
 *    pure read (`overrideFalloutDue`), never by a button.
 */

import type { ActionData, NodeRefData } from '../../engine-api';
import {
  CHANGE_REQUEST_DECISIONS,
  CHANGE_REQUEST_KINDS,
  FIELDS,
} from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { UNAUTHORISED_OWNER } from '../override';
import { fieldIs, HELPDESK_TIER, not, param, paramNodeGuards, TARGET, targetGuards } from './helpers';
import { HELPDESK_ACTIONS, WORLD_ACTIONS } from './ids';

const ACTOR: NodeRefData = { ref: 'actor' };

/** The risk-acceptance node the fallout reads to decide whose finding it is. */
const RISK_ACCEPTANCE_PARAM = 'risk_acceptance';

/**
 * What an unauthorised Domain Admin grant costs the desk when the audit finds it.
 *
 * Suspicion, because suspicion is the meter that reads "somebody is looking at
 * you": an audit finding with your name on a privileged grant nobody signed off
 * is exactly that. It is charged ONLY on the silent-comply path - the signed path
 * lands the finding on the accepting owner and costs the desk nothing, which is
 * the whole professional point that the CYA is never the thing that is punished.
 */
export const OVERRIDE_FALLOUT_SUSPICION = 12;

export const OVERRIDE_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.riskAcceptanceSign,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('change_request'),
      {
        when: not(fieldIs(TARGET, FIELDS.crKind, CHANGE_REQUEST_KINDS.riskAcceptance)),
        reason: '"{target.label}" is not a risk acceptance. This signs off the '
          + 'accepting owner on a risk-acceptance form; an ordinary change '
          + 'request is approved through its own review, not signed here.',
      },
      {
        when: { pred: 'field_missing', node: TARGET, field: FIELDS.crRequiredSigner },
        reason: 'That risk acceptance names nobody to accept the risk. A '
          + 'sign-off with no accepting owner on it is the thing it exists to '
          + 'prevent - it has to say whose risk it is.',
      },
      {
        when: fieldIs(TARGET, FIELDS.crDecision, CHANGE_REQUEST_DECISIONS.approve),
        reason: 'That risk acceptance is already signed. It is on the record '
          + 'with the accepting owner\'s name; signing it again writes nothing '
          + 'new.',
      },
    ],
    apply: [
      // The approval decision, exactly the 0.10.0 one: an approved change_request.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.crDecision,
        value: { const: CHANGE_REQUEST_DECISIONS.approve },
      },
      // The signature: the accepting owner's name, copied off the required signer
      // the draft was seeded with. This is what a later audit reads.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.crAcceptedBy,
        value: { field: { node: TARGET, field: FIELDS.crRequiredSigner } },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.crStatus,
        value: { const: 'approved' },
      },
    ],
  },
  {
    id: WORLD_ACTIONS.overrideFallout,
    tier: HELPDESK_TIER,
    validate: [
      ...paramNodeGuards(RISK_ACCEPTANCE_PARAM, 'change_request'),
      ...targetGuards('account'),
      {
        when: { pred: 'field_is_number', node: TARGET, field: FIELDS.overrideFalloutAt },
        reason: 'That grant has already been through the audit. Once is how '
          + 'often a finding lands.',
      },
    ],
    apply: [
      // The latch, so the finding cannot land twice - the same shape the
      // social-engineering fallout keeps.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.overrideFalloutAt,
        value: { now: true },
      },
      // The signed path: a risk acceptance the accepting owner approved. The
      // finding is theirs - the desk is charged nothing.
      {
        op: 'when',
        cond: fieldIs(
          param(RISK_ACCEPTANCE_PARAM),
          FIELDS.crDecision,
          CHANGE_REQUEST_DECISIONS.approve,
        ),
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.incidentOwner,
            value: {
              field: { node: param(RISK_ACCEPTANCE_PARAM), field: FIELDS.crAcceptedBy },
            },
          },
        ],
      },
      // The silent-comply path: nothing signed. The finding is the desk's, and
      // the suspicion is charged to the person who granted it on their own
      // authority. Reverting THIS branch - charging regardless, or naming the
      // same owner either way - is what makes the two paths read the same, which
      // is the accountability lost.
      {
        op: 'when',
        cond: not(fieldIs(
          param(RISK_ACCEPTANCE_PARAM),
          FIELDS.crDecision,
          CHANGE_REQUEST_DECISIONS.approve,
        )),
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.incidentOwner,
            value: { const: UNAUTHORISED_OWNER },
          },
          {
            op: 'set_field',
            node: ACTOR,
            field: FIELDS.suspicion,
            value: {
              add: {
                node: ACTOR,
                field: FIELDS.suspicion,
                by: { const: OVERRIDE_FALLOUT_SUSPICION },
                clamp: { min: METER_FLOOR, max: METER_CEILING },
              },
            },
          },
        ],
      },
    ],
  },
];
