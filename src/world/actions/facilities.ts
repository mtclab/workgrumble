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
  not,
  TARGET,
  targetGuards,
} from './helpers';
import { HELPDESK_ACTIONS } from './ids';

export const STICKY_NOTE_ALREADY_REASON = 'There is already a note on that '
  + 'socket. A second one is not twice as much note, and Vic will say so.';

/**
 * How many times a socket has to have taken something down before a note on
 * the wall is a repair rather than a decoration.
 *
 * Twice, and the number is the whole arc: one outage is an accident and
 * nobody in Facilities is getting out the marker for it. The same socket doing
 * it again, at the same minute, on the other end of the week, is a timetable -
 * and a timetable is the one thing in this game that can be diagnosed rather
 * than fixed.
 */
export const STICKY_NOTE_EVIDENCE = 2;

/** Whatever is plugged into this machine that has been unplugged twice. */
const REPEAT_OFFENDER = 'unplugged';

export const STICKY_NOTE_NO_EVIDENCE_REASON = 'Nothing plugged in at that end '
  + 'has gone off often enough for Vic to get the marker out. He will write '
  + '"DO NOT UNPLUG" on anything you like, once you can tell him what keeps '
  + 'being unplugged and when - and the box knows, because it wrote it down '
  + 'both times.';

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
      // The evidence, read off the estate rather than off the queue.
      //
      // Without this the note was available on the Monday: the action only
      // asked whether one was already there, so a player who happened to open
      // Facilities on day one could close Thursday's ticket - the one the
      // whole two-day arc exists to teach - with a power cycle and a chat, on
      // a morning when the fault it diagnoses had not happened once.
      //
      // It is deliberately NOT gated on Thursday's ticket being open. A note
      // by a socket is a repair to a building, and a repair that waited for
      // somebody to file about it would be the world taking its instructions
      // from the queue.
      {
        when: not({
          pred: 'neighbor_where',
          node: TARGET,
          direction: 'in',
          edge_kind: 'connected_to',
          bind: REPEAT_OFFENDER,
          matching: {
            pred: 'field_at_least',
            node: { bind: REPEAT_OFFENDER },
            field: FIELDS.powerLosses,
            value: STICKY_NOTE_EVIDENCE,
          },
        }),
        reason: STICKY_NOTE_NO_EVIDENCE_REASON,
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
