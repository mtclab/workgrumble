/**
 * Halcyon Grange Holdings, week one (E8, 0.22.0) - the exec weak spot arc.
 *
 * The fourth employer's week, and, like Bodgeworth's, a shorter characterful
 * one: five days, the three VIP EXCEPTION tickets across the first three, quiet
 * on Thursday, and the conversation at three on the Friday. Where Bodgeworth's
 * week is about a wild-west estate and the MSP's is about scope, this one is
 * about the POLITICS - each fault is an executive, through their assistant,
 * leaning on the desk to open a hole, and the whole week is the setup a later
 * pass's BEC incident is the payoff to.
 *
 * Same loader and same rules as the other weeks: a morning pile of at most two,
 * every ticket arrives once, drips land inside the hours, and the room set is
 * Halcyon's own so an `#exec-office` message is legal here and a probation
 * `#helpdesk` one is the boot failure it should be. Nothing here dispatches; a
 * week that never opens the channel client produces the same world, byte for
 * byte.
 */

import { HALCYON_CHANNELS, HALCYON_IDS } from './corporate-company';
import { type DayScript, validateWeek } from './week';

const HALCYON_ROOM_IDS = new Set(HALCYON_CHANNELS.map((room) => room.id));

/** The room the exec floor demands things in. */
const EXEC = 'room:exec-office';

export const CORPORATE_WEEK: readonly DayScript[] = validateWeek([
  {
    day: 1,
    label: 'Monday',
    // The first exception is on the desk before nine: the CEO wants his second
    // factor gone, filed by his EA and flagged as his personal priority.
    inherited: ['ticket:halcyon-ceo-mfa-off'],
    drip: [],
    // The exec floor's room, and Denise setting the tone for the week. Inert on
    // a scripted walk, like every channel message.
    channels: [
      {
        id: 'halcyon:welcome',
        channel: EXEC,
        author: HALCYON_IDS.ea,
        body: 'morning - new person on the IT desk this week (Pat). the exec '
          + 'floor tends to need things quickly, so please keep an eye on this '
          + 'channel. Roland already has a couple of asks in.',
        minute: 9 * 60 + 5,
      },
      {
        id: 'halcyon:mfa-nudge',
        channel: EXEC,
        author: HALCYON_IDS.ea,
        body: '@you the two-factor one for Roland is the priority today. he has '
          + 'mentioned it twice. thank you!',
        minute: 9 * 60 + 25,
        mentionsPlayer: true,
        relatedTicket: 'ticket:halcyon-ceo-mfa-off',
      },
    ],
    patrolSeed: 0,
    load: 1,
  },
  {
    day: 2,
    label: 'Tuesday',
    inherited: [],
    // The delegate request, mid-morning: give the EA full access to the CEO's
    // mailbox.
    drip: [{ ticketId: 'ticket:halcyon-ea-delegate', minute: 10 * 60 }],
    channels: [
      {
        id: 'halcyon:delegate-chat',
        channel: EXEC,
        author: HALCYON_IDS.ea,
        body: 'raising one properly this time: I should really have access to '
          + 'Roland\'s mailbox, he never reads it. ticket incoming.',
        minute: 9 * 60 + 55,
        relatedTicket: 'ticket:halcyon-ea-delegate',
      },
    ],
    patrolSeed: 3_137,
    load: 2,
  },
  {
    day: 3,
    label: 'Wednesday',
    inherited: [],
    // The filter exemption, late morning: take the CEO off the mail filter.
    drip: [{ ticketId: 'ticket:halcyon-ceo-filter', minute: 11 * 60 }],
    channels: [
      {
        id: 'halcyon:filter-chat',
        channel: EXEC,
        author: HALCYON_IDS.ea,
        body: 'the filter ate another one of Roland\'s emails. he wants it just '
          + 'not doing that for him. there is a setting for it apparently.',
        minute: 10 * 60 + 50,
        relatedTicket: 'ticket:halcyon-ceo-filter',
      },
    ],
    patrolSeed: 5_501,
    load: 2,
  },
  {
    day: 4,
    label: 'Thursday',
    // Thursday is the access recertification (E8, 0.23.0): the quiet day the Q3
    // review lands on, a whole queue of who-has-what to certify or revoke. It is
    // in the morning pile because compliance sent the list overnight; the exec
    // exceptions from earlier in the week sit the way they were left.
    inherited: ['ticket:halcyon-recert'],
    drip: [],
    patrolSeed: 7_919,
    load: 2,
  },
  {
    day: 5,
    label: 'Friday',
    inherited: [],
    // Friday brings nothing new. Friday is the conversation at three, run by the
    // driver on the review day exactly as it runs the other employers', against
    // the same bar.
    drip: [],
    patrolSeed: 2_357,
    load: 1,
  },
], HALCYON_ROOM_IDS);

/** Monday's inherited pile at Halcyon, for the employer registry. */
export function corporateInheritedTicketIds(): readonly string[] {
  return CORPORATE_WEEK[0]?.inherited ?? [];
}
