/**
 * Fettle & Crane Managed IT's surplus (E11, 0.34.0 slice 2): the entries the
 * MSP can be dealt that its authored week never uses.
 *
 * Twenty-one entries over two columns, and only two, because that is what this
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
 * The FIVE morning entries are first, so that the five-day shape the roster
 * gate reads spreads them across five different days rather than stacking them
 * past the two-ticket cap a real morning pile has.
 *
 * NINETEEN from 0.37.0, and the nineteenth is here for a reason worth writing
 * down, because it is not the reason the other eighteen are. PENNINGTON-ACCT's
 * practice suite is the co-managed RACI's teaching ticket - it is not surplus
 * in spirit - and it is in the surplus because the AUTHORED week could not
 * take it. The engineer's blend at this shop is measured off the authored
 * week's own mix (`mixBoundsFor`), and that mix is at the edge of what this
 * shop's content can express: adding one server-kind arrival to the authored
 * table moves the access and device ceilings by one apiece, and
 * `mixAfforded(msp, systems_engineer, 20)` falls from twenty to ten - half an
 * engineer's weeks quietly served as a junior's. Measured three ways round
 * (Tuesday, Wednesday, Thursday, and again with a compensating access-kind
 * arrival beside it) and it is the mix rather than the day or the band. A
 * spare carries no home day, so it is outside that baseline entirely and the
 * shipped week, its ramp, its load table and its work-kind mix are all
 * byte-identical. Buying it a place in the authored week is a content-tuning
 * job - more access and device weight, measured against the same gate - and it
 * is a slice of its own rather than a line in this one.
 *
 * TWENTY-ONE from 0.38.0, and the two new ones are in the surplus for exactly
 * that reason rather than as a preference: the out-of-scope asks are the same
 * kind of teaching content on the same knife-edge of a mix, and the same
 * measurement (`mixAfforded(msp, systems_engineer, 20)`, still twenty) is what
 * put them here. They are noted again beside the entries themselves.
 */

import type { DayFragment } from '../pools';

export const MSP_SPARES: readonly DayFragment[] = [
  // The morning pile: what was already in the queue at eight o'clock. All four
  // are the job's own texture, which is what a morning pile is mostly made of.
  { inherited: ['ticket:msp-pool-fontaine-partner-lockout'] },
  { inherited: ['ticket:msp-pool-meridian-restart-prompt'] },
  { inherited: ['ticket:msp-pool-elmwood-reception-spooler'] },
  { inherited: ['ticket:msp-pool-marlowe-password-expired'] },
  // And the fifth, which is the co-managed RACI's teaching ticket rather than
  // texture (E9, 0.37.0). In the MORNING pile deliberately: it is a firm that
  // cannot bill until it is fixed, so it reads as the thing that was already
  // waiting at eight rather than as an afternoon interruption - and a ticket
  // whose consequence lands the NEXT morning wants the whole of a day in front
  // of it. The sampler still chooses the day, and on a Friday draw the peer's
  // mail has no morning to arrive on: the violation is stamped and the week
  // ends before anybody says anything, which is honest (he writes to you on
  // Monday, and there is no Monday) and is the one draw where the second half
  // of the lesson does not land.
  { inherited: ['ticket:pennington-practice-down'] },

  // And the sixteen that arrive during the shift, of which the first two are
  // the out-of-scope asks (E9, 0.38.0) and are here for the same reason the
  // Pennington teaching ticket above is: the MSP's authored week is at the edge
  // of the blend its content can express, and a spare carries no home day, so
  // the shipped week, its ramp, its load table and its work-kind mix are all
  // byte-identical with these in the pool. `mixAfforded(msp, systems_engineer,
  // 20)` is measured with them in and is still twenty of twenty.
  //
  // THEY ARE THE EARLIEST TWO MINUTES IN THE POOL, and that is content rather
  // than spacing. Each of them can start a clock that has to land inside the
  // same shift to be seen at all - the customer answers an estimate
  // forty-five minutes later, and the customer who was obliged for nothing is
  // back ninety minutes later, asking for more - so an ask dealt at ten past
  // three is an ask whose second half arrives tomorrow morning. Half past nine -
  // the earliest minute a drip may land at all - and five past eleven leave the
  // whole of a day in front of both.
  {
    drip: [{
      ticketId: 'ticket:fontaine-new-office-wifi',
      minute: 9 * 60 + 30,
    }],
  },
  {
    drip: [{
      ticketId: 'ticket:pennington-practice-migration',
      minute: 11 * 60 + 5,
    }],
  },
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
