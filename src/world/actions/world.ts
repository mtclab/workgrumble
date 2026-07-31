/**
 * What the world does while you are answering the phone.
 *
 * A cleaner's trolley wants the socket the warehouse print box is in, at four
 * minutes to five, on the evenings her round covers that corridor. A tablet in a
 * cupboard offers a password that was changed months ago, every few minutes,
 * forever. A maintenance window opens at nine on a Wednesday and takes the file
 * sharing service down with it, exactly as the mail everybody deleted said it
 * would.
 *
 * None of that is the player working and none of it is on a button. All of it
 * still goes through the action registry, because everything that changes this
 * world does: the dispatch log is what a replay is rebuilt from, and a fault
 * that arrived from outside the registry would be a fault that did not survive a
 * reload.
 *
 * The actor on these is the player node, for the same reason the machine event
 * log's writer is: the engine has one actor, and these verbs are the world using
 * it as a system account rather than the player doing anything.
 */

import type { ActionData } from '../../engine-api';
import { FIELDS, LOCKOUT_THRESHOLD, SERVICE_STATUS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  not,
  TARGET,
  targetGuards,
} from './helpers';
import { WORLD_ACTIONS } from './ids';

const COUNT_PARAM = 'count';

export const WORLD_ACTION_DATA: readonly ActionData[] = [
  {
    id: WORLD_ACTIONS.powerCut,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('device'),
      {
        when: not(fieldIs(TARGET, FIELDS.powered, true)),
        reason: 'That one is already off. Even a trolley cannot unplug it '
          + 'twice.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.powered,
        value: { const: false },
      },
    ],
  },
  {
    id: WORLD_ACTIONS.serviceStopped,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('service'),
      {
        when: not(fieldIs(TARGET, FIELDS.status, SERVICE_STATUS.running)),
        reason: 'That service is already down, so the window has nothing left '
          + 'to take.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.status,
        value: { const: SERVICE_STATUS.stopped },
      },
    ],
  },
  {
    /**
     * One more wrong password from something that is not a person.
     *
     * The count arrives as a parameter rather than being incremented here,
     * because the caller is the thing that knows what the directory has seen so
     * far and because a replay has to write the same number - the same contract
     * the touch log and the event log keep. The lockout itself is part of the
     * same action: a directory that counted to five and did not shut the door
     * would be a directory with the lesson taken out of it.
     */
    id: WORLD_ACTIONS.staleLogon,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('account'),
      {
        when: not({ pred: 'param_is_whole_number', param: COUNT_PARAM, value: 1 }),
        reason: 'A bad password count is a whole number of attempts, starting '
          + 'at one.',
      },
      {
        when: fieldIs(TARGET, FIELDS.locked, true),
        reason: 'That account is already locked. The door does not get more '
          + 'shut.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.badPwCount,
        value: { param: COUNT_PARAM },
      },
      {
        op: 'when',
        cond: {
          pred: 'field_at_least',
          node: TARGET,
          field: FIELDS.badPwCount,
          value: LOCKOUT_THRESHOLD,
        },
        ops: [
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.locked,
            value: { const: true },
          },
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.lockedSince,
            value: { now: true },
          },
        ],
      },
    ],
  },
];
