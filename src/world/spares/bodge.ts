/**
 * Bodgeworth & Batch's surplus (E11, 0.34.0 slice 2): nine entries the shop can
 * be dealt that its authored Monday-to-Friday never uses.
 *
 * One cell per fragment, and every one of them loose by construction. Three
 * columns only, because those are the three this shop's authored week has any
 * of - a morning pile of at most two, one drip a day, and a room that never
 * shuts up - and a spare in a column whose quota is nought to nought would be
 * an entry the sampler is forbidden to place.
 *
 * THE ROOM POSTS STAND ON THEIR OWN, which is a rule about the draw rather than
 * about taste: a spare is dealt without whatever it might have been written
 * beside, so a post carrying `relatedTicket` would be somebody chasing a fault
 * that is not in this week. That suits Bodgeworth exactly. `#office` and
 * `#yard` are half chatter and half deliveries even in the authored week, and
 * none of what is below is about a ticket, because none of what these people
 * post is usually about a ticket.
 *
 * The five tickets themselves are in `tickets/pool-bodge.ts`; this file is only
 * the placement.
 */

import { BODGE_IDS } from '../second-company';
import type { DayFragment } from '../pools';

const OFFICE = 'room:office';
const YARD = 'room:yard';

export const BODGE_SPARES: readonly DayFragment[] = [
  // The two that are on the desk before nine. Both are whole-desk faults
  // somebody has been living with since before the shift started, which is
  // what an inherited pile is for at this shop.
  { inherited: ['ticket:front-desk-no-network'] },
  { inherited: ['ticket:kev-relock'] },

  // And the three that arrive during it, spread across the shift so that a
  // week which draws all of them is still a week with air in it.
  { drip: [{ ticketId: 'ticket:baz-locked-out', minute: 10 * 60 }] },
  { drip: [{ ticketId: 'ticket:trev-switched-off', minute: 11 * 60 + 30 }] },
  { drip: [{ ticketId: 'ticket:yard-printer-unplugged', minute: 14 * 60 + 20 }] },

  // Four rooms' worth of a small firm talking to itself. Nothing here is a
  // fault, nothing here is a hint, and nothing here needs anything else in the
  // week to have been drawn with it.
  {
    channels: [
      {
        id: 'bodge:pool-forklift-charger',
        channel: YARD,
        author: BODGE_IDS.baz,
        body: 'who has had the forklift charger. i am not accusing anyone. i '
          + 'would just like it back on the hook it lives on',
        minute: 9 * 60 + 35,
      },
    ],
  },
  {
    channels: [
      {
        id: 'bodge:pool-lock-the-cabin',
        channel: OFFICE,
        author: BODGE_IDS.sharon,
        body: 'the portacabin door does not lock itself. if you are last out, '
          + 'lock it. this is the third time i have put this in here',
        minute: 13 * 60 + 15,
      },
    ],
  },
  {
    channels: [
      {
        id: 'bodge:pool-milk-run',
        channel: OFFICE,
        author: BODGE_IDS.vernon,
        body: 'if anyone is going past the cash and carry we need milk. put it '
          + 'on the account. get the proper biscuits this time',
        minute: 10 * 60 + 50,
      },
    ],
  },
  {
    channels: [
      {
        id: 'bodge:pool-blue-van',
        channel: YARD,
        author: BODGE_IDS.trev,
        body: 'Whose is the blue van parked across the weighbridge. It has '
          + 'been there since Tuesday and nobody will own up to it. Trevor.',
        minute: 15 * 60 + 40,
      },
    ],
  },
];
