/**
 * Halcyon Grange Holdings' surplus (E11, 0.34.0 slice 2): eight entries the
 * shop can be dealt that its authored Monday-to-Friday never uses.
 *
 * One cell per fragment, and every one of them loose by construction. Three
 * columns only - the morning pile, the drip and the rooms - because those are
 * the three the authored week has any of, and a spare in a column this shop
 * quotas at nought to nought is an entry the sampler may never place.
 *
 * THE ROOM POSTS STAND ON THEIR OWN. A spare is dealt without whatever it might
 * have been written beside, so nothing below carries `relatedTicket`, `replyTo`
 * or a linked request: a post chasing a ticket the draw did not deal is a room
 * talking about a fault the week has not got. It costs this building nothing.
 * The authored week's rooms are already half announcement and half diary, and
 * `#it-support` - which the authored week never posts in at all - is exactly
 * where a desk's own standing notices live.
 *
 * The four tickets themselves are in `tickets/pool-corporate.ts`; this file is
 * only the placement.
 */

import { HALCYON_IDS } from '../corporate-company';
import type { DayFragment } from '../pools';

const IT_SUPPORT = 'room:it-support';
const EXEC = 'room:exec-office';

export const CORPORATE_SPARES: readonly DayFragment[] = [
  // On the desk before nine, because the floor arrived before the desk did and
  // found nothing working.
  { inherited: ['ticket:halcyon-dns-down'] },

  // And three that arrive during the shift, spread across it: a man back from
  // a week off site who cannot sign in, a request from the top floor before
  // lunch, and the afternoon's housekeeping.
  { drip: [{ ticketId: 'ticket:halcyon-colm-password', minute: 9 * 60 + 40 }] },
  { drip: [{ ticketId: 'ticket:halcyon-ap-cover', minute: 11 * 60 + 5 }] },
  {
    drip: [{
      ticketId: 'ticket:halcyon-interim-leaver',
      minute: 14 * 60 + 30,
    }],
  },

  /*
   * And the three heavy ones, which are what make a Thursday here possible at
   * all.
   *
   * A day at this shop may hold one inherited ticket and three drips, so four
   * arrivals is the hard ceiling - and four thirty-minute arrivals come out
   * under the floor of a load-2 Thursday however the sampler arranges them. The
   * fix is not more entries, it is heavier ones: each of these closes in two
   * load-bearing steps, which is what lets four arrivals reach the band the
   * shop's own week wrote down.
   */
  { drip: [{ ticketId: 'ticket:halcyon-dfs-disabled', minute: 9 * 60 + 35 }] },
  { drip: [{ ticketId: 'ticket:halcyon-bits-disabled', minute: 13 * 60 + 15 }] },
  {
    drip: [{
      ticketId: 'ticket:halcyon-audio-disabled',
      minute: 12 * 60 + 40,
    }],
  },

  // Four posts of a building that writes everything down and reads none of it.
  {
    channels: [
      {
        id: 'halcyon:pool-label-the-cable',
        channel: IT_SUPPORT,
        author: HALCYON_IDS.bronwen,
        body: 'the meeting room screen has been labelled - the label says '
          + 'which cable. please try the label before you ring the desk, '
          + 'because the desk is going to read you the label.',
        minute: 9 * 60 + 45,
      },
    ],
  },
  {
    channels: [
      {
        id: 'halcyon:pool-joiners-form',
        channel: IT_SUPPORT,
        author: HALCYON_IDS.manager,
        body: 'a reminder that the joiners form is the only way an account '
          + 'gets created. I am aware there is a spreadsheet. the spreadsheet '
          + 'is not the form and never has been.',
        minute: 13 * 60 + 50,
      },
    ],
  },
  {
    channels: [
      {
        id: 'halcyon:pool-carpet-friday',
        channel: EXEC,
        author: HALCYON_IDS.ea,
        body: 'diary note: the executive floor is being carpeted at the end of the week. '
          + 'anything with a cable on it will be moved and moved back by the '
          + 'contractors, so please do not raise that as a ticket until Monday.',
        minute: 10 * 60 + 30,
      },
    ],
  },
  {
    channels: [
      {
        id: 'halcyon:pool-year-end',
        channel: EXEC,
        author: HALCYON_IDS.cfo,
        body: 'Finance is in year-end from Monday. If something of ours stops '
          + 'working it will not wait, and I would rather say that now than at '
          + 'half past four on the day it happens.',
        minute: 15 * 60 + 20,
      },
    ],
  },

  /*
   * And four more of the same, which are here for a reason worth writing down.
   *
   * This shop is almost entirely COUPLED content - eight of its beats carry a
   * room post fastened to the ticket it is about - and the sampler places every
   * beat before the fill draws anything. With only one week's worth of loose
   * entries behind them the fill had no slack at all: on the seeds where the
   * beats happened to spend a day's three room-post slots, there was nothing
   * left that could legally go anywhere, and the week was refused. That refusal
   * was correct and it was also just a shortage.
   *
   * Room posts are the cheapest honest slack this shop has. A post needs no
   * ticket, no conversation and no article - it is one line of a building
   * talking to itself - and this building talks to itself constantly. So the
   * surplus carries twice the rooms it strictly needs, which is what lets every
   * seed find an arrangement rather than most of them.
   */
  {
    channels: [
      {
        id: 'halcyon:pool-printer-code',
        channel: IT_SUPPORT,
        author: HALCYON_IDS.bronwen,
        body: 'the code for the third-floor printer has not changed. it is on '
          + 'the printer. people keep ringing to ask for the code that is '
          + 'written on the thing they are standing in front of.',
        minute: 11 * 60 + 40,
      },
    ],
  },
  {
    channels: [
      {
        id: 'halcyon:pool-mailbox-quota',
        channel: IT_SUPPORT,
        author: HALCYON_IDS.manager,
        body: 'mailbox quota warnings are going out this week. they are real. '
          + 'the deleted items folder is part of the mailbox, which is the bit '
          + 'everybody argues with me about.',
        minute: 14 * 60 + 55,
      },
    ],
  },
  {
    channels: [
      {
        id: 'halcyon:pool-board-pack',
        channel: EXEC,
        author: HALCYON_IDS.ea,
        body: 'the board pack goes out at lunchtime tomorrow. if anything on this '
          + 'floor is going to need IT, it needs IT before the pack goes, '
          + 'not while it is going.',
        minute: 9 * 60 + 55,
      },
    ],
  },
  {
    channels: [
      {
        id: 'halcyon:pool-no-laptops',
        channel: EXEC,
        author: HALCYON_IDS.cfo,
        body: 'nobody is to take a laptop to the offsite without telling IT '
          + 'first. I am told this has already happened twice and that both of '
          + 'them told nobody.',
        minute: 12 * 60 + 50,
      },
    ],
  },
];
