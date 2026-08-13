/**
 * Fettle & Crane Managed IT's surplus (E11, 0.34.0 slice 2): the entries the
 * MSP can be dealt that its authored week never uses.
 *
 * Eighteen entries over two columns, and only two, because that is what this
 * shop's authored week actually uses: the MSP deals a morning pile and drips,
 * and its quota for every other column is nought to nought - no interruptions,
 * no walk-ups, no room posts, no incidents. An entry in a column the shop never
 * writes would be refused by the sampler's own quota check, correctly, and the
 * refusal would read as a generator bug rather than as content in the wrong
 * place.
 *
 * ONE ENTRY PER TICKET, and no ticket dealt twice: an id that turns up in two
 * cells is one record in the world graph, so whichever of them the draw put
 * second would arrive already answered. The loader checks that at boot
 * (`validateSpares`), which is the only place it can be checked - a draw only
 * ever sees the handful of spares that happened to come out together.
 *
 * THE DRIP MINUTES ARE SPREAD ON PURPOSE, evenly across 09:30 to 15:30 rather
 * than bunched where a writer's hand falls. The sampler places these by day and
 * not by hour, so a pool whose minutes all sat after two o'clock would compose
 * afternoons nobody could work whatever day it chose - and the feasibility
 * auditor would be right to refuse them. Twenty-five minutes apart, from a
 * quarter to ten to five past three, is what gives the draw somewhere to put
 * five of them in one day.
 *
 * The four morning entries are first, so that the five-day shape the roster
 * gate reads spreads them across four different days rather than stacking them
 * past the two-ticket cap a real morning pile has.
 */

import type { DayFragment } from '../pools';

export const MSP_SPARES: readonly DayFragment[] = [
  // The morning pile: what was already in the queue at eight o'clock. All four
  // are the job's own texture, which is what a morning pile is mostly made of.
  { inherited: ['ticket:msp-pool-fontaine-partner-lockout'] },
  { inherited: ['ticket:msp-pool-meridian-restart-prompt'] },
  { inherited: ['ticket:msp-pool-elmwood-reception-spooler'] },
  { inherited: ['ticket:msp-pool-marlowe-password-expired'] },

  // And the fourteen that arrive during the shift.
  {
    drip: [{
      ticketId: 'ticket:msp-pool-fontaine-file-server-full',
      minute: 9 * 60 + 45,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-fontaine-supervising-partner',
      minute: 10 * 60 + 10,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-meridian-wrong-groups',
      minute: 10 * 60 + 30,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-meridian-status-page',
      minute: 10 * 60 + 55,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-northwind-portal-stopped',
      minute: 11 * 60 + 15,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-northwind-server-service',
      minute: 11 * 60 + 40,
    }],
  },
  {
    // Noon, and the BACS cut-off in the ticket is at two: the two hours are the
    // whole of that entry, so the minute is content rather than spacing.
    drip: [{
      ticketId: 'ticket:msp-pool-holloway-payroll-export',
      minute: 12 * 60,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-holloway-workstation-service',
      minute: 12 * 60 + 25,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-holloway-disabled-account',
      minute: 12 * 60 + 50,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-elmwood-task-scheduler',
      minute: 13 * 60 + 15,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-arden-reset-handback',
      minute: 13 * 60 + 40,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-arden-server-service',
      minute: 14 * 60 + 5,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-marlowe-share-access',
      minute: 14 * 60 + 35,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:msp-pool-marlowe-nas-capacity',
      minute: 15 * 60 + 5,
    }],
  },
];
