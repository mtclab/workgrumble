import type {
  ActionData,
  NodeRefData,
  OpData,
  PredData,
} from '../../engine-api';
import { FIELDS } from '../fields';
import {
  METER_CEILING,
  METER_FLOOR,
  RUDE_REPUTATION_COST,
  RUDE_REPUTATION_ESCALATION,
} from '../meters';
import { HELPDESK_ACTION_IDS, HELPDESK_ACTIONS } from './ids';
import { HELPDESK_TIER, not, TARGET, targetGuards } from './helpers';

/**
 * The one verb the aggressive register adds - the SOCIAL cost of a rude reply,
 * and nothing else.
 *
 * It is aimed at the ticket the conversation is about, and it does three things,
 * none of which touch that ticket's estate:
 *
 * - it takes reputation off the person who said it (the dispatcher), a flat cost
 *   the first time and a steeper one every time after, because a reporter who
 *   comes back to more of the same is one who starts telling people;
 * - it lands the reporter's reaction on its OWN stream (`reporter_reaction`, not
 *   `customer_visible`) - sharper the second time, which is the whole of
 *   "repeating it escalates". It is a separate field on purpose: `customer_visible`
 *   is the evidence the CYA rule reads to allow "waiting on user", and a reporter
 *   reacting to being told off is not the player asking a diagnostic question, so
 *   the reaction must never unlock an affordance the neutral reply cannot;
 * - it counts the snap, on the ticket, so the second reply can read the first.
 *
 * What it deliberately does NOT do is anything to the fix. The reply that
 * carries this also carries the SAME ticket-work effects the neutral reply on
 * the beat runs - the rotate, the reboot, the question that gets the truth out -
 * so the ticket resolves exactly as it would have. That split is enforced at
 * load by the tone gate in `dialogue/index.ts`, which reads `SOCIAL_ACTIONS` and
 * proves an aggressive option's ticket work is byte-identical to its neutral
 * twin's. This is where "you never lose a ticket for being rude" stops being a
 * promise and becomes a thing the shape of the data cannot break.
 */
const ACTOR: NodeRefData = { ref: 'actor' };

/** The two lines the reporter comes back with, sharpest last. */
export const REBUFF_FIRST_PARAM = 'reaction_first';
export const REBUFF_AGAIN_PARAM = 'reaction_again';

/** Whether this reporter has already been snapped at on this ticket. */
const ALREADY_RUDE: PredData = {
  pred: 'field_at_least',
  node: TARGET,
  field: FIELDS.rudeReplies,
  value: 1,
};

/** Take a flat count of reputation off the person who said it. */
function reputationDown(by: number): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field: FIELDS.reputation,
    value: {
      sub: {
        node: ACTOR,
        field: FIELDS.reputation,
        by: { const: by },
        clamp: { min: METER_FLOOR, max: METER_CEILING },
      },
    },
  };
}

/**
 * Land one of the reactions on the reporter's own reaction stream.
 *
 * `reporter_reaction`, never `customer_visible`: the reaction is the reporter
 * talking back, not a question the player put to them, and only the latter is
 * allowed to stop an SLA. Writing it here is what keeps the social effect from
 * changing a single ticket affordance.
 */
function reaction(param: string): OpData {
  return {
    op: 'set_field',
    node: TARGET,
    field: FIELDS.reporterReaction,
    value: {
      append_line: {
        node: TARGET,
        field: FIELDS.reporterReaction,
        value: { param_trim: param },
      },
    },
  };
}

export const TONE_ACTION_DATA: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.reporterRebuff,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      {
        when: { pred: 'param_blank', param: REBUFF_FIRST_PARAM },
        reason: 'A rude reply lands the reporter\'s reaction on their stream, '
          + 'and there is no reaction written for the first one. A snap that '
          + 'leaves no mark on the record is a snap the world cannot see paid.',
      },
      {
        when: { pred: 'param_blank', param: REBUFF_AGAIN_PARAM },
        reason: 'There is no sharper reaction written for a repeat, and repeating '
          + 'it is meant to escalate. A second snap that reads the same as the '
          + 'first is a reporter who did not notice, which is not the point.',
      },
    ],
    apply: [
      // The flat cost, always. Reputation only, and off the dispatcher: the
      // ticket is the target because the reaction and the count live there, but
      // the standing that pays is the person who opened their mouth.
      reputationDown(RUDE_REPUTATION_COST),
      // And the steeper cost, only once there is already a snap on this ticket.
      // A missing counter is not "at least one", so the first reply never pays
      // this and every one after it does.
      {
        op: 'when',
        cond: ALREADY_RUDE,
        ops: [reputationDown(RUDE_REPUTATION_ESCALATION)],
      },
      // The reporter's reaction, on their own stream, sharper the second time.
      // Two branches on the same counter, read BEFORE it is bumped below, so
      // the line that lands is the one for the number of snaps that came first.
      {
        op: 'when',
        cond: not(ALREADY_RUDE),
        ops: [reaction(REBUFF_FIRST_PARAM)],
      },
      {
        op: 'when',
        cond: ALREADY_RUDE,
        ops: [reaction(REBUFF_AGAIN_PARAM)],
      },
      // The count itself, opened on the first snap and bumped on every one. It
      // is added to, so the field has to exist first: an add against an absent
      // field is a refusal, not a start, which is the same reason the dot's own
      // minutes open their account before they bank any.
      {
        op: 'when',
        cond: { pred: 'field_missing', node: TARGET, field: FIELDS.rudeReplies },
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.rudeReplies,
            value: { const: 0 },
          },
        ],
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.rudeReplies,
        value: {
          add: {
            node: TARGET,
            field: FIELDS.rudeReplies,
            by: { const: 1 },
            clamp: { min: 0, max: Number.MAX_SAFE_INTEGER },
          },
        },
      },
    ],
  },
];

/**
 * A belt-and-braces check that the id this module ships is one the dialogue
 * layer will actually let a conversation dispatch. The dialogue allowlist IS the
 * helpdesk registry, so a `reporter.rebuff` that was somehow not in it would be
 * a social effect no reply could run - the fix would happen and the cost would
 * silently never be paid, which is the exact failure the whole framework exists
 * to make impossible.
 */
export const REBUFF_IS_DISPATCHABLE: boolean = HELPDESK_ACTION_IDS.includes(
  HELPDESK_ACTIONS.reporterRebuff,
);
