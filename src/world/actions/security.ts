/**
 * The two verbs the security tickets need, and neither of them is a fix.
 *
 * One is the player clicking the link they were told not to click, which is in
 * the registry because it HAPPENS and because a consequence the world does not
 * record is a consequence somebody can argue with afterwards. The other is the
 * bill for an enrolment nobody verified, arriving a day late in somebody else's
 * incident report - which is exactly how long it takes.
 *
 * Both move the meters of the person carrying them, so both are aimed at
 * whoever dispatched them; the account is named as a parameter where one is
 * involved, because the reputation is the player's and the field that stops the
 * bill arriving twice belongs to the account it was about.
 */

import type { ActionData, NodeRefData } from '../../engine-api';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { HELPDESK_TIER, not, param, paramNodeGuards } from './helpers';
import { HELPDESK_ACTIONS, WORLD_ACTIONS } from './ids';

const ACTOR: NodeRefData = { ref: 'actor' };

const ACCOUNT_PARAM = 'account';

/**
 * What following the link costs, before anybody has worked out whether it did
 * anything. It is stress and it is suspicion, because the first thing that
 * happens is a full-screen warning from a security suite nobody knew was
 * installed, and the second thing is everybody looking over.
 */
export const PHISH_CLICK_STRESS = 12;
export const PHISH_CLICK_SUSPICION = 10;

/**
 * And what a social-engineering incident costs, when the enrolment turns out to
 * have been done for somebody who was not her.
 *
 * Reputation, because reputation is the meter that does not drain: this is the
 * one the review remembers.
 */
export const SOCIAL_ENGINEERING_REPUTATION = 9;

export const SECURITY_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.securityFollowLink,
    tier: HELPDESK_TIER,
    validate: [],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.stress,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.stress,
            by: { const: PHISH_CLICK_STRESS },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.suspicion,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.suspicion,
            by: { const: PHISH_CLICK_SUSPICION },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
    ],
  },
  {
    id: WORLD_ACTIONS.securityFallout,
    tier: HELPDESK_TIER,
    validate: [
      ...paramNodeGuards(ACCOUNT_PARAM, 'account'),
      {
        when: not(
          {
            pred: 'field_is_number',
            node: param(ACCOUNT_PARAM),
            field: FIELDS.mfaEnrolledAt,
          },
        ),
        reason: 'Nothing was enrolled on that account, so there is nothing to '
          + 'answer for.',
      },
      {
        when: {
          pred: 'field_is_number',
          node: param(ACCOUNT_PARAM),
          field: FIELDS.identityVerifiedAt,
        },
        reason: 'Somebody checked who they were before that enrolment. That is '
          + 'the whole of the difference, and it is why this is not happening.',
      },
      {
        when: {
          pred: 'field_is_number',
          node: param(ACCOUNT_PARAM),
          field: FIELDS.securityFalloutAt,
        },
        reason: 'That one has already come back on you. Once is the '
          + 'arrangement, even here.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: param(ACCOUNT_PARAM),
        field: FIELDS.securityFalloutAt,
        value: { now: true },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reputation,
        value: {
          sub: {
            node: ACTOR,
            field: FIELDS.reputation,
            by: { const: SOCIAL_ENGINEERING_REPUTATION },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
    ],
  },
];
