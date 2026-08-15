/**
 * The co-managed RACI's two world verbs (E9, 0.37.0): the record, and the word
 * that comes back.
 *
 * Neither of these is a thing the player does. `raciViolation` is dispatched by
 * the terminal in the minute a remediation on somebody else's box succeeded
 * without a heads-up - AFTER the success, never instead of it, because the
 * whole content of this wall is that it does not stop anything. `raciComplaint`
 * is dispatched by the day driver at the next start of shift off a pure read
 * (`raciComplaintDue`), the same rail the compliance sweep and the
 * privileged-access finding run on.
 *
 * The split between them is the split between what happened and what it cost,
 * and it is deliberate: the trail is written the moment the thing is done and
 * survives everything after, while the charge lands once, later, and only when
 * their sysadmin has actually noticed. A single verb doing both would have been
 * a consequence that arrives in the same breath as the act, which is precisely
 * the kind of wall this mechanic exists not to be.
 */

import type { ActionData, GuardData, NodeRefData } from '../../engine-api';
import { FIELDS, RACI_OWNERS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { fieldIs, HELPDESK_TIER, not, TARGET, targetGuards } from './helpers';
import { WORLD_ACTIONS } from './ids';

const ACTOR: NodeRefData = { ref: 'actor' };

/** The `verb@tick` line the trail takes, built by the caller. */
export const RACI_LINE_PARAM = 'line';

/**
 * What their sysadmin's complaint costs, and why it is reputation.
 *
 * Reputation, because nothing here is secret and nobody is suspicious: he knows
 * exactly what was done, when, and by which account, because his monitoring
 * told him. What has changed is his opinion of the other IT team on his
 * account, and reputation is the meter that reads "the people you work with
 * have views about you". Suspicion would have been the wrong currency twice -
 * it belongs to the shop watching its own tech, and this complaint never
 * reaches the shop.
 *
 * Four points - the same as a rude reply and one above a missed deadline -
 * because that is the honest weight of one peer being annoyed with you in
 * writing, and a run of them is what makes it hurt rather than the first.
 * OVERSEER TUNING KNOB.
 */
export const RACI_COMPLAINT_REPUTATION = 4;

/** A box that is nobody else's is a box there is nothing to record about. */
const THEIRS_UNDER_THE_RACI: GuardData = {
  when: not(fieldIs(TARGET, FIELDS.raciOwner, RACI_OWNERS.internal)),
  reason: 'That box is not one the customer\'s own IT owns under the RACI, so '
    + 'there is nothing about touching it for anybody to have a view on.',
};

export const RACI_ACTION_DATA: readonly ActionData[] = [
  {
    id: WORLD_ACTIONS.raciViolation,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      THEIRS_UNDER_THE_RACI,
      {
        when: { pred: 'param_blank', param: RACI_LINE_PARAM },
        reason: 'A line on the RACI trail has to say what was done and when. A '
          + 'record with no stamp is one nobody can place, and the entire value '
          + 'of this trail is that the minute is on it.',
      },
      {
        when: {
          pred: 'line_in_field',
          node: TARGET,
          field: FIELDS.raciViolations,
          value: { param: RACI_LINE_PARAM },
        },
        reason: 'That action is already on this box\'s RACI trail for this '
          + 'minute. The same verb cannot be done twice in the one minute it '
          + 'was done in.',
      },
    ],
    apply: [
      // The trail, which only ever grows: what was done on their box, and when.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.raciViolations,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.raciViolations,
            value: { param: RACI_LINE_PARAM },
          },
        },
      },
      // And the minute of the LATEST one, which is what the morning reads. It
      // is written in the same act as the trail line for the reason the
      // permissive-mode stamp is: a save could otherwise exist with a trail on
      // it and nothing remembering when the last entry landed.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.raciViolatedAt,
        value: { now: true },
      },
    ],
  },
  {
    id: WORLD_ACTIONS.raciComplaint,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      THEIRS_UNDER_THE_RACI,
      {
        when: not({
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.raciViolatedAt,
        }),
        reason: 'Nobody has touched that box unannounced, so their IT has '
          + 'nothing to complain about and this would be a grievance the world '
          + 'invented.',
      },
      {
        // The comparison rather than a latch, and the teeth of the repeat: a
        // complaint already stamped at or after the last unannounced touch has
        // answered for all of them. Touch it again and this passes again.
        when: {
          pred: 'field_at_least_field',
          node: TARGET,
          field: FIELDS.raciComplainedAt,
          than: { node: TARGET, field: FIELDS.raciViolatedAt },
        },
        reason: 'Their IT has already had their say about the last time '
          + 'anybody was on that box. Once per thing done is how often a '
          + 'colleague brings it up.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.raciComplainedAt,
        value: { now: true },
      },
      // The cost: standing with the other IT team on the account. It is charged
      // here rather than at the act for the same reason the finding is - a
      // consequence nobody has noticed yet has not happened yet.
      //
      // TODO (E9, the sharper half): a SECOND complaint inside the same week
      // should climb - the peer stops mailing you and mails the account manager
      // instead, which is the boss-beat register rather than a meter. The
      // trail on the box already counts the violations, so the read is there;
      // what is not is a boss beat at the MSP, and half an escalation is worse
      // than none. Repeats currently land as a second complaint of the same
      // weight, which is honest and is not the whole lesson.
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reputation,
        value: {
          sub: {
            node: ACTOR,
            field: FIELDS.reputation,
            by: { const: RACI_COMPLAINT_REPUTATION },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
    ],
  },
  /**
   * The watermark under the first complaint (0.37.1), and nothing else.
   *
   * A third verb rather than a fourth op on the second one, because the op
   * language has no conditional write and the condition is the whole content
   * here: the stamp goes on once and stays where it is. The guard is the
   * `ticket.record_ack_miss` guard word for word - already recorded, so this
   * is refused - and the day driver dispatches it expecting to be refused on
   * every morning but the first.
   *
   * What it is FOR is the inbox. `raci_complained_at` is a latch that moves
   * with each complaint, and his mail is anchored to a field's minute, so a
   * second violation used to re-date the first letter and shuffle it to the
   * top of the inbox rather than add anything. The letter now stays where it
   * was written. The repeat still charges, because that is the complaint
   * verb's business and it is untouched.
   */
  {
    id: WORLD_ACTIONS.raciFirstComplaint,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      THEIRS_UNDER_THE_RACI,
      {
        when: not({
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.raciComplainedAt,
        }),
        reason: 'Nobody has complained about that box yet, so there is no '
          + 'first complaint to date.',
      },
      {
        when: {
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.raciFirstComplainedAt,
        },
        reason: 'The first word about that box already has a date on it. A '
          + 'letter is written once, whatever is said afterwards.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.raciFirstComplainedAt,
        value: { now: true },
      },
    ],
  },
];
