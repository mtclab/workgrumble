/**
 * Halcyon Grange Holdings, week one (E8, 0.22.0) - the exec weak spot arc.
 *
 * The fourth employer's week, and, like Bodgeworth's, a shorter characterful
 * one: five days, the three VIP EXCEPTION tickets across the first three, the
 * access review and the queue-jump collision on the Thursday, and the manager's
 * override with the conversation at three on the Friday. Where Bodgeworth's
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
import { OVERRIDE_TICKET } from './override';
import {
  VIP_EARBUDS_TICKET,
  VIP_LEDGER_TICKET,
  VIP_TABLET_TICKET,
} from './vip';
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
    // And, after lunch, the shadow-IT tail (E8, 0.26.0): the CEO's mail has
    // stopped on two devices, one of which is not the company's. It sits on the
    // same day as the filter exemption because it is the same lesson from the
    // other end - the exec's convenience is already outside the controls, and
    // this is the device that was never inside them at all.
    drip: [
      { ticketId: 'ticket:halcyon-ceo-filter', minute: 11 * 60 },
      { ticketId: VIP_TABLET_TICKET, minute: 14 * 60 + 15 },
    ],
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
      {
        id: 'halcyon:tablet-chat',
        channel: EXEC,
        author: HALCYON_IDS.ea,
        body: 'heads up - Roland says his mail has stopped on his phone AND on '
          + 'his own iPad. the iPad is his personal one, before you ask. he does '
          + 'not see why that is a distinction.',
        minute: 14 * 60 + 5,
        relatedTicket: VIP_TABLET_TICKET,
      },
    ],
    patrolSeed: 5_501,
    // Two tickets now, and the second is three verbs and a signature.
    load: 3,
  },
  {
    day: 4,
    label: 'Thursday',
    // Thursday is the access recertification (E8, 0.23.0): the quiet day the Q3
    // review lands on, a whole queue of who-has-what to certify or revoke. It is
    // in the morning pile because compliance sent the list overnight; the exec
    // exceptions from earlier in the week sit the way they were left.
    inherited: ['ticket:halcyon-recert'],
    // And the collision (E8, 0.26.0), in one minute: the CEO's earbuds and the
    // finance team locked out of the ledger, arriving together. The same minute
    // on purpose - the version's whole beat is that both clocks start at once,
    // the flagged one is P2 before anybody reads it, the real one is P2 once
    // somebody does, and there is one desk. Whichever waits, it costs.
    drip: [
      { ticketId: VIP_EARBUDS_TICKET, minute: 10 * 60 },
      { ticketId: VIP_LEDGER_TICKET, minute: 10 * 60 },
    ],
    channels: [
      {
        id: 'halcyon:ledger-chat',
        channel: EXEC,
        author: HALCYON_IDS.bronwen,
        body: 'the ledger is not letting anyone in this morning - Miriam, '
          + 'Marguerite and Cass are all stuck, and the supplier run has to go '
          + 'today. raising it properly now.',
        minute: 10 * 60 + 2,
        relatedTicket: VIP_LEDGER_TICKET,
      },
      {
        id: 'halcyon:earbuds-chat',
        channel: EXEC,
        author: HALCYON_IDS.ea,
        body: '@you Roland is on his way down about his earbuds. I did say you '
          + 'were busy. It is flagged as his, so I imagine it has gone to the '
          + 'top of your list anyway.',
        minute: 10 * 60 + 4,
        mentionsPlayer: true,
        relatedTicket: VIP_EARBUDS_TICKET,
      },
    ],
    patrolSeed: 7_919,
    // The heaviest day of the week: the whole access review, and a collision on
    // top of it that cannot be finished twice.
    load: 4,
  },
  {
    day: 5,
    label: 'Friday',
    // Friday is the manager override (E8, 0.24.0): the Head of IT orders the
    // Meridian contractor given Domain Admin to finish the cutover tonight - the
    // order a good tech knows is wrong, where refusing and silently complying both
    // fail and the win is the risk acceptance signed. In the morning pile because
    // he raised it himself before nine; the review at three still runs the way it
    // runs every employer's, and the audit finding lands the same day.
    inherited: [OVERRIDE_TICKET],
    drip: [],
    channels: [
      {
        id: 'halcyon:override-push',
        channel: EXEC,
        author: HALCYON_IDS.manager,
        body: '@you raising one and I need it today: put the Meridian contractor '
          + '(Wystan) into Domain Admins so he can finish the finance cutover '
          + 'tonight. board wants it live Monday. we narrow it back down after, I '
          + 'promise.',
        minute: 9 * 60 + 10,
        mentionsPlayer: true,
        relatedTicket: OVERRIDE_TICKET,
      },
    ],
    patrolSeed: 2_357,
    load: 1,
  },
], HALCYON_ROOM_IDS);

/** Monday's inherited pile at Halcyon, for the employer registry. */
export function corporateInheritedTicketIds(): readonly string[] {
  return CORPORATE_WEEK[0]?.inherited ?? [];
}
