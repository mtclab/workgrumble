/**
 * Bodgeworth & Batch, week one (0.6.0 slice 3).
 *
 * The second employer's week, and deliberately a SHORTER, characterful one: five
 * days, five faults, one review on the Friday, and - on the Wednesday - the
 * event day the whole E5 spine was built to home. It is not the probation
 * week's twenty-eight-ticket marathon and it is not meant to be; the point of
 * the second shop is the CONTRAST, and a first real week somewhere new is a
 * lighter thing than a probation gauntlet.
 *
 * THE EVENT DAY is the reply-all storm - the canon Bedlam-DL3 incident
 * (`docs/research/day-to-day-frustrations.md` section 5), homed here because a
 * wild-west firm with one all-staff room and no governance is exactly where it
 * happens. Trev asks to be taken off the mailing list; the whole firm replies
 * all; the scolds are themselves reply-alls; and buried in the flood is the one
 * message that matters - the shared drive has stopped, because the storm filled
 * it. It rides the 0.5.0 channel rails end to end: the storm is channel
 * messages arriving on the clock (no new mechanism), the cost is the attention
 * drip pricing the unread pile, and the skill is reading past forty cakes to
 * find the ticket. Nothing here dispatches; a week that never opens Hubbub
 * produces the same world, byte for byte.
 *
 * Same loader, same rules as the probation week: a morning pile is at most two,
 * every ticket arrives once, drips land inside the hours. The only thing passed
 * differently is the room set - `validateWeek` is told Bodgeworth's rooms, so a
 * storm message in `#office` is legal and one in the probation shop's
 * `#helpdesk` is the boot failure it should be.
 */

import { BODGE_CHANNELS, BODGE_IDS } from './second-company';
import { type DayScript, validateWeek } from './week';

const BODGE_ROOM_IDS = new Set(BODGE_CHANNELS.map((room) => room.id));

/** The reply-all room, and the minute the storm burns through the morning. */
const OFFICE = 'room:office';

export const SECOND_WEEK: readonly DayScript[] = validateWeek([
  {
    day: 1,
    label: 'Monday',
    // Two faults on the desk before nine: the shared front-desk login is
    // locked (the whole office out at once, because it is one login), and Kev's
    // accounts package has fallen over on the server under his desk.
    inherited: ['ticket:office-login-locked', 'ticket:accounts-package-down'],
    drip: [],
    // The room the firm lives in, and Sharon's one attempt at governance. It is
    // inert on a scripted walk, like every channel message: a welcome nobody
    // reads and a rule nobody keeps.
    channels: [
      {
        id: 'bodge:welcome',
        channel: OFFICE,
        author: BODGE_IDS.sharon,
        body: 'morning all. new IT person starts today (Pat). be nice. and '
          + 'PLEASE stop using #office for delivery arguments, that is what '
          + '#yard is for.',
        minute: 9 * 60 + 5,
      },
      {
        id: 'bodge:vernon-welcome',
        channel: OFFICE,
        author: BODGE_IDS.vernon,
        body: '@you welcome aboard. things just need to work. that is the whole '
          + 'brief. shout if you need the wifi password, it is on the fridge.',
        minute: 9 * 60 + 20,
        mentionsPlayer: true,
      },
    ],
    patrolSeed: 0,
    load: 1,
  },
  {
    day: 2,
    label: 'Tuesday',
    inherited: [],
    // The yard printer, wedged, mid-morning - Baz has been re-sending the same
    // delivery note all morning and stacking the queue higher every time.
    drip: [{ ticketId: 'ticket:yard-printer-wedged', minute: 10 * 60 + 20 }],
    channels: [
      {
        id: 'bodge:yard-printer-chat',
        channel: OFFICE,
        author: BODGE_IDS.baz,
        body: 'yard printer is possessed again. flashing, no paper coming out. '
          + 'raising it properly this time i promise',
        minute: 10 * 60 + 15,
        relatedTicket: 'ticket:yard-printer-wedged',
      },
    ],
    patrolSeed: 1_699,
    load: 2,
  },
  {
    day: 3,
    label: 'Wednesday',
    inherited: [],
    // The signal in the storm: the shared drive stops at ten, because the storm
    // has been filling it since half nine. It arrives as an ordinary drip; what
    // makes it the event is where it lands.
    drip: [{ ticketId: 'ticket:the-share-down', minute: 10 * 60 }],
    // THE REPLY-ALL STORM. One root - Trev asking to come off the list - and a
    // cascade of reply-alls under it, the scolds among them being reply-alls
    // themselves. All one thread (channel threads are one level deep, and so is
    // the joke about them), all in #office, all inert on a scripted walk. The
    // one message that is not cake is `bodge:share-down`, the drive falling over
    // at ten, sat in the middle of the noise where a real one always is.
    channels: [
      {
        id: 'bodge:storm-root',
        channel: OFFICE,
        author: BODGE_IDS.trev,
        body: 'Could whoever runs this take me off this mailing list please. I '
          + 'do not need the cake emails. Trevor.',
        minute: 9 * 60 + 30,
      },
      {
        id: 'bodge:storm-cake',
        channel: OFFICE,
        author: BODGE_IDS.sharon,
        body: 'there is cake in the kitchen! it is Sandra from accounts leaving '
          + '(photo)',
        minute: 9 * 60 + 32,
        replyTo: 'bodge:storm-root',
      },
      {
        id: 'bodge:storm-me-too',
        channel: OFFICE,
        author: BODGE_IDS.baz,
        body: 'take me off it too then',
        minute: 9 * 60 + 34,
        replyTo: 'bodge:storm-root',
      },
      {
        id: 'bodge:storm-scold-1',
        channel: OFFICE,
        author: BODGE_IDS.kev,
        body: 'can everyone STOP replying all please',
        minute: 9 * 60 + 37,
        replyTo: 'bodge:storm-root',
      },
      {
        id: 'bodge:storm-cake-2',
        channel: OFFICE,
        author: BODGE_IDS.vernon,
        body: 'is there any of the cake left',
        minute: 9 * 60 + 41,
        replyTo: 'bodge:storm-root',
      },
      {
        id: 'bodge:storm-me-too-2',
        channel: OFFICE,
        author: BODGE_IDS.trev,
        body: 'I asked to be REMOVED and now I have forty emails about cake. '
          + 'This is the opposite of removed.',
        minute: 9 * 60 + 46,
        replyTo: 'bodge:storm-root',
      },
      {
        id: 'bodge:storm-scold-2',
        channel: OFFICE,
        author: BODGE_IDS.sharon,
        body: 'STOP. REPLYING. ALL. (sorry, replying all to say that)',
        minute: 9 * 60 + 52,
        replyTo: 'bodge:storm-root',
      },
      // Ten o'clock, and the one that is not cake: the drive has stopped. It is
      // a room post about the drip that lands this same minute, wearing the
      // storm as camouflage - the @you and the ticket link are the only things
      // in this thread that mean anything.
      {
        id: 'bodge:share-down',
        channel: OFFICE,
        author: BODGE_IDS.trev,
        body: '@you now the shared drive will not open either. is that the '
          + 'email thing as well? I only wanted off the list.',
        minute: 10 * 60,
        mentionsPlayer: true,
        relatedTicket: 'ticket:the-share-down',
        replyTo: 'bodge:storm-root',
      },
      {
        id: 'bodge:storm-cake-3',
        channel: OFFICE,
        author: BODGE_IDS.baz,
        body: 'cake gone. sorry Trev',
        minute: 10 * 60 + 6,
        replyTo: 'bodge:storm-root',
      },
      {
        id: 'bodge:storm-scold-3',
        channel: OFFICE,
        author: BODGE_IDS.vernon,
        body: 'whoever is IT now, sort this list out. that is an order and a '
          + 'welcome present',
        minute: 10 * 60 + 12,
        mentionsPlayer: true,
        replyTo: 'bodge:storm-root',
      },
    ],
    patrolSeed: 4_057,
    load: 3,
  },
  {
    day: 4,
    label: 'Thursday',
    inherited: [],
    // The boss's dead laptop, which is a flat mouse, mid-morning, on a call day.
    drip: [{ ticketId: 'ticket:vernon-mouse', minute: 10 * 60 }],
    patrolSeed: 6_421,
    load: 2,
  },
  {
    day: 5,
    label: 'Friday',
    inherited: [],
    // Friday brings nothing new. Friday is about the conversation at three -
    // Vernon's version of a review, which the driver runs on the review day
    // exactly as it runs the probation shop's, against the same bar.
    drip: [],
    patrolSeed: 2_939,
    load: 1,
  },
], BODGE_ROOM_IDS);

/** Monday's inherited pile at Bodgeworth, for the employer registry. */
export function bodgeInheritedTicketIds(): readonly string[] {
  return SECOND_WEEK[0]?.inherited ?? [];
}

/** The day the reply-all storm lands, named for the tests that assert it. */
export const BODGE_EVENT_DAY = 3 as const;
