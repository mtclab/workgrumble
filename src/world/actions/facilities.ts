/**
 * The repair that is made of paper.
 *
 * Every estate has one machine that goes down at the same time every week, and
 * the answer is never a service pack. It is a note by the socket, written by
 * somebody in Facilities, saying which plug belongs to the box that the whole
 * warehouse prints through. It is a verb in the registry because it is a real
 * repair with a real outcome - the outage stops - and because a fix that lived
 * only in a line of dialogue would be a fix the world could not remember
 * tomorrow.
 */

import type { ActionData } from '../../engine-api';
import { FIELDS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

export const STICKY_NOTE_ALREADY_REASON = 'There is already a note on that '
  + 'socket. A second one is not twice as much note, and Vic will say so.';

export const FACILITIES_ACTIONS: readonly ActionData[] = [
  {
    id: HELPDESK_ACTIONS.facilitiesStickyNote,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('machine'),
      {
        when: fieldIs(TARGET, FIELDS.stickyNote, true),
        reason: STICKY_NOTE_ALREADY_REASON,
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.stickyNote,
        value: { const: true },
      },
    ],
  },
];
