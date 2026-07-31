/**
 * The recurring arc: the same outage, twice, four minutes to five.
 *
 * The warehouse print box sits on the only socket in that corridor, and on
 * Tuesday and Thursday evenings the cleaner's round covers that corridor. She
 * needs a socket. She is not doing anything wrong and nobody has ever told her
 * what that plug is.
 *
 * On the Tuesday it is a printer that has gone off, and turning it back on is
 * the whole of the job. On the Thursday it has gone off again, at the same
 * minute, and the Event Viewer on PRINT-02 has both of them written down four
 * lines apart - which is the moment the ticket stops being about a printer.
 * The second one does not close on power alone: the fix is a note by the
 * socket, which is a conversation with Facilities and a piece of tape.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import type { TicketActionStep, WorldTicket } from './types';

const POWER_IT_BACK_UP: TicketActionStep = {
  action: HELPDESK_ACTIONS.devicePowerCycle,
  target: COMPANY_IDS.warehousePrinter,
};

export const VACUUM_TUESDAY: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.warehousePrinter, COMPANY_IDS.warehousePrintServer],
  // The warehouse cannot print despatch notes, which stops lorries. Owen has
  // called it medium because Owen has been here eleven years.
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:vacuum-tuesday',
    archetype: 'recurring_arc',
    flavor: {
      title: 'Warehouse printer was dead again when I came in',
      body:
        'Owen reports that the Ajax was off when he opened up. Not jammed, not '
        + 'out of paper: off, with the standby light out, the way a thing is '
        + 'off when it has no electricity. He has plugged it back in himself '
        + 'twice this month and it did not seem worth a ticket either time.',
    },
    reporter: COMPANY_IDS.owen,
    // The fault as the ticket reports it: off, and off for the first time.
    // The count is part of the fault rather than a side effect of the clock
    // having passed through the right minute - the same rule the rest of this
    // roster keeps, and the reason a ticket is broken whether or not anybody
    // was watching last night.
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.warehousePrinter,
        field: FIELDS.powered,
        value: false,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.warehousePrinter,
        field: FIELDS.powerLosses,
        value: 1,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.warehousePrinter },
      field: FIELDS.powered,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/the-same-thing-every-week',
  },
  cause: 'The printer lost power at four minutes to five yesterday evening. '
    + 'Nothing on the box did it, which is the only interesting thing about it '
    + 'so far.',
  dialogue_ref: 'dialogue/late-shift',
  paths: [
    {
      id: 'power-it-back-on',
      app: 'remote',
      label: 'Bring the Ajax back up from the hardware panel on PRINT-02',
      steps: [POWER_IT_BACK_UP],
    },
  ],
};

/**
 * And again on the Thursday, at the same minute, which is the ticket.
 *
 * Power alone will not close it. That is not the game being awkward: it is the
 * difference between support and a standing appointment, and it is the one
 * lesson the whole arc exists to teach. The log on PRINT-02 has both outages in
 * it, four minutes to five, two days apart, and Facilities know exactly whose
 * round that is.
 */
export const VACUUM_THURSDAY: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.warehousePrinter, COMPANY_IDS.warehousePrintServer],
  claimed_urgency: 3,
  true_urgency: 2,
  def: {
    id: 'ticket:vacuum-thursday',
    archetype: 'recurring_arc',
    flavor: {
      title: 'The warehouse printer is off AGAIN',
      body:
        'Owen, again, in capitals, at ten past eight. Same printer, same dead '
        + 'standby light, same morning of the week it was on Tuesday. He would '
        + 'like somebody to work out what is doing it rather than turn it on, '
        + 'and he is right, and he has been right for about a month.',
    },
    reporter: COMPANY_IDS.owen,
    // And the second time, which is the whole ticket. Twice is what the note
    // by the socket is earned by: Facilities will write "DO NOT UNPLUG" on
    // anything once somebody can tell them what keeps being unplugged and
    // when, and one outage cannot tell them that.
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.warehousePrinter,
        field: FIELDS.powered,
        value: false,
      },
      {
        op: 'setField',
        id: COMPANY_IDS.warehousePrinter,
        field: FIELDS.powerLosses,
        value: 2,
      },
    ],
    resolved_when: {
      op: 'and',
      exprs: [
        {
          op: 'eq',
          selector: { id: COMPANY_IDS.warehousePrinter },
          field: FIELDS.powered,
          value: true,
        },
        {
          op: 'eq',
          selector: { id: COMPANY_IDS.warehousePrintServer },
          field: FIELDS.stickyNote,
          value: true,
        },
      ],
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 7 },
    kb_ref: 'kb/the-same-thing-every-week',
  },
  cause: 'The cleaner\'s trolley needs a socket on Tuesday and Thursday '
    + 'evenings, and the only one in that corridor has the warehouse print box '
    + 'in it. Nobody has ever told her, because nobody has ever looked at two '
    + 'timestamps together.',
  dialogue_ref: 'dialogue/late-shift',
  paths: [
    {
      id: 'power-and-a-note-on-the-socket',
      app: 'chat',
      label: 'Power it back up, then get Vic in Facilities to put a note on '
        + 'that socket',
      steps: [
        POWER_IT_BACK_UP,
        {
          action: HELPDESK_ACTIONS.facilitiesStickyNote,
          target: COMPANY_IDS.warehousePrintServer,
        },
      ],
    },
  ],
};

export const ARC_TICKETS: readonly WorldTicket[] = [
  VACUUM_TUESDAY,
  VACUUM_THURSDAY,
];
