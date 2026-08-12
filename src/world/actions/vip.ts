/**
 * The VIP tier's verbs (E8, 0.26.0): the shadow-IT pair, and the queue-jump's
 * bill.
 *
 * Three actions, and none of them invents an artifact:
 *
 *  - `mdmPushProfile` is the NORMAL management verb - the mail profile pushed to
 *    a device from the console - and it is here mostly to refuse. Enrolment is
 *    what it needs, so the company-issue phone takes it in one dispatch and the
 *    executive's personal tablet cannot, honestly and by name. The refusal is the
 *    lesson: the desk does not lack authority over that tablet, it lacks a
 *    channel to it, and no amount of clicking makes an unenrolled device managed.
 *    Since 0.32.0 it refuses a second thing, on the other side of the same
 *    truth: a managed Mac IS enrolled and the console still cannot push it a
 *    Screen Recording approval, because that consent is not a profile's to
 *    give. Two refusals, one lesson - what a management channel is FOR, and
 *    where it stops.
 *
 *  - `deviceManualMailSetup` is what a real desk does about that: talk the person
 *    holding the thing through setting the mailbox up by hand. It works on any
 *    device, managed or not, because a walkthrough always works - it just costs
 *    the owner's time and yours, which is the price of supporting something you
 *    were never given the keys to.
 *
 *  - `queueJumpFallout` is the collision's cost, dispatched by the day loop off a
 *    pure read (`queueJumpFalloutDue`) when the clock on whichever ticket was left
 *    waiting runs out. Both branches charge, in different currencies, and there is
 *    no third branch: that is what "no free lunch" means here. Reverting either
 *    one makes waiting on that ticket free, which is the mechanic gone.
 */

import type { ActionData, NodeRefData } from '../../engine-api';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { fieldIs, HELPDESK_TIER, not, TARGET, targetGuards } from './helpers';
import { HELPDESK_ACTIONS, WORLD_ACTIONS } from './ids';

const ACTOR: NodeRefData = { ref: 'actor' };

/**
 * What the exec going over your head costs, and what the blocked team costs.
 *
 * Two currencies on purpose, because they are two different things happening.
 * The flagged caller does not lose you standing with the floor - he rings the
 * Head of IT, and what that changes is how closely somebody senior is watching
 * you, which is suspicion. The team that sat blocked through the payment run does
 * not report you to anybody - they simply saw which ticket the desk did first,
 * and that is standing, which is reputation.
 *
 * Both are conservative and both are OVERSEER TUNING KNOBS. The suspicion is a
 * shade under the audit finding's twelve (`OVERRIDE_FALLOUT_SUSPICION`): an exec
 * complaining about you is not yet a finding with your name on it. The reputation
 * is a shade over a plain missed deadline's three (`REPUTATION_PER_BREACH`), and
 * it is charged ON TOP of that breach rather than instead of it, because a
 * deadline missed while four people could not do their jobs is worse than a
 * deadline missed.
 */
export const QUEUE_JUMP_VIP_SUSPICION = 10;
export const QUEUE_JUMP_TEAM_REPUTATION = 5;

export const VIP_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.mdmPushProfile,
    tier: HELPDESK_TIER,
    validate: [
      // BEFORE the kind guard, and on purpose (0.32.0, the creative vertical).
      //
      // A managed Mac is a `machine`, so the shipped kind refusal would answer
      // "that is a workstation, and this action only works on a device" - which
      // is true about the node and useless about the question. The question is
      // whether a console can push a Screen Recording approval down, the answer
      // is no, and the answer is the same whether the consent is currently
      // granted or not - so the guard fires on any box that CARRIES the consent
      // at all rather than on one particular value of it. Nothing else in any
      // world has the field, so no other target's behaviour moves.
      //
      // The refusal is the lesson and it is the real limit: a PPPC profile can
      // pre-approve Accessibility for a support tool, and Screen Recording is
      // the consent Apple keeps for the person at the keyboard.
      {
        when: {
          pred: 'field_is_bool',
          node: TARGET,
          field: FIELDS.tccScreenRecording,
        },
        reason: 'Screen Recording is not a thing this console can grant on '
          + '"{target.label}". A management profile can pre-approve '
          + 'Accessibility for a support tool; macOS keeps the screen itself '
          + 'for the person sitting at it, under System Settings > Privacy & '
          + 'Security > Screen Recording. There is no button here that clicks '
          + 'it for them - the fix is a phone call and their own hand.',
      },
      ...targetGuards('device'),
      {
        when: not(fieldIs(TARGET, FIELDS.mdmEnrolled, true)),
        reason: '"{target.label}" is not enrolled in device management. There '
          + 'is no console channel to it and nothing to push down - it is not '
          + 'the company\'s device, and enrolling somebody\'s personal hardware '
          + 'is their decision and a policy conversation, not a button here. '
          + 'Whatever is on it, it gets fixed by hand, with the person holding '
          + 'it.',
      },
      {
        when: fieldIs(TARGET, FIELDS.mailProfileOk, true),
        reason: 'The mailbox on "{target.label}" is syncing. Pushing the '
          + 'profile again would sign it out and back in for no reason at all.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.mailProfileOk,
        value: { const: true },
      },
    ],
  },
  {
    id: HELPDESK_ACTIONS.deviceManualMailSetup,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('device'),
      {
        when: fieldIs(TARGET, FIELDS.mailProfileOk, true),
        reason: 'The mailbox on "{target.label}" is already syncing. Talking '
          + 'somebody through re-adding an account that works is how a '
          + 'five-minute call becomes an afternoon.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.mailProfileOk,
        value: { const: true },
      },
    ],
  },
  {
    id: WORLD_ACTIONS.queueJumpFallout,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      {
        when: {
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.queueJumpFalloutAt,
        },
        reason: 'That wait has already been paid for. Once is how often a '
          + 'choice costs.',
      },
    ],
    apply: [
      // The latch, so the cost lands once - the same shape the override finding
      // and the social-engineering fallout keep.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.queueJumpFalloutAt,
        value: { now: true },
      },
      // The flagged caller left waiting: he does not raise it with you.
      {
        op: 'when',
        cond: fieldIs(TARGET, FIELDS.vip, true),
        ops: [
          {
            op: 'set_field',
            node: ACTOR,
            field: FIELDS.suspicion,
            value: {
              add: {
                node: ACTOR,
                field: FIELDS.suspicion,
                by: { const: QUEUE_JUMP_VIP_SUSPICION },
                clamp: { min: METER_FLOOR, max: METER_CEILING },
              },
            },
          },
        ],
      },
      // The ordinary reporter left waiting: nobody rings anybody, and the floor
      // saw exactly which ticket the desk did first.
      {
        op: 'when',
        cond: not(fieldIs(TARGET, FIELDS.vip, true)),
        ops: [
          {
            op: 'set_field',
            node: ACTOR,
            field: FIELDS.reputation,
            value: {
              add: {
                node: ACTOR,
                field: FIELDS.reputation,
                by: { const: -QUEUE_JUMP_TEAM_REPUTATION },
                clamp: { min: METER_FLOOR, max: METER_CEILING },
              },
            },
          },
        ],
      },
    ],
  },
];
