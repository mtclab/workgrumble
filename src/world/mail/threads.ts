import { COMPANY_IDS, staffName } from '../company';
import { WORLD_IDS } from '../demo-world';
import { FIELDS } from '../fields';
import { MSP_IDS } from '../msp-company';
import {
  decisionDate,
  noticeDays,
  PRESSURE_MAIL,
  REDUNDANCY_ROUND,
} from '../pressure';
import {
  HYGIENE_SYNC_MINUTE,
  HYGIENE_SYNC_MINUTES,
  TICKET_HYGIENE_SYNC,
} from '../scenes';
import { HANDOFF_BOUNCE } from '../tickets/handoff';
import type { MailThread } from './types';

/** The hour the summons names, in the shape a person writes it. */
function clockTime(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** The two threads the mandatory sync is announced and remembered by. */
export const MEETING_MAIL = Object.freeze({
  summons: 'mail/hygiene-sync',
  recap: 'mail/hygiene-sync-recap',
});

/**
 * The minutes, as the recap prints them: whoever spoke, and what they said.
 *
 * Built from the meeting's own beats rather than typed out a second time,
 * which is the whole joke made structural. The mail is not ABOUT the meeting
 * and does not summarise it - it is the meeting, in full, arriving half an
 * hour late, and a version of it that had been edited down would quietly be
 * making the opposite point.
 */
function minutedInFull(): readonly string[] {
  return TICKET_HYGIENE_SYNC.beats.map(
    (beat) => `${staffName(beat.who)}: ${beat.line}`,
  );
}

/** The inbox, as it stood when the shift started. */
export const MAIL_THREADS: readonly MailThread[] = [
  {
    id: 'mail/onboarding',
    subject: 'Welcome to Workgrumble (please read, there is a quiz)',
    messages: [
      {
        id: 'mail/onboarding#1',
        from: COMPANY_IDS.bev,
        tick: 0,
        body: [
          'Welcome to the team. Your lanyard is at reception and it is the '
          + 'only one we have, so treat it as an heirloom.',
          'A few house facts. The kettle in the cupboard is the good kettle. '
          + 'The kitchen kettle is descaled annually by whoever complains '
          + 'loudest, which since March has been nobody.',
          'Fire drill is the second Tuesday. Everyone assembles by the bins '
          + 'and discusses whether it is a drill for eleven minutes.',
        ],
      },
      {
        id: 'mail/onboarding#2',
        from: COMPANY_IDS.bev,
        tick: 12,
        body: [
          'Correction to the above: the good kettle has been moved into your '
          + 'cupboard, which is now technically an office. Congratulations on '
          + 'the promotion.',
          'People will come to your desk instead of raising a ticket. That is '
          + 'not your fault and it is also now your problem.',
          // The one thing a player has to know before the corridor is used
          // against them, said before the shift starts and by the person who
          // would say it. Learning the panic key by being caught is a tutorial
          // written by the boss.
          'Last thing, and I have not told you this. The key to the left of '
          + 'the 1, above Tab, tidies your screen of anything that is not '
          + 'work. Instantly. Desmond has never worked out why everyone types '
          + 'so fast when he walks past.',
        ],
      },
    ],
  },
  {
    id: 'mail/queue-nag',
    subject: 'Quick one - the queue',
    messages: [
      {
        id: 'mail/queue-nag#1',
        from: COMPANY_IDS.boss,
        tick: 5,
        body: [
          'Pat - no rush at all, but could you give me a sense of where we '
          + 'are with the queue. Not a report. Just a sense. By ten.',
          'I have a call at eleven where I would like to sound informed, '
          + 'which is a different thing from being informed and considerably '
          + 'faster to arrange.',
        ],
      },
      {
        id: 'mail/queue-nag#2',
        from: COMPANY_IDS.boss,
        tick: 25,
        body: [
          'Following up on the above. Still no rush. I have moved the call to '
          + 'half ten, so if anything there is now less rush, compressed.',
          'Also Sales are saying they have been hacked. I have said we are '
          + 'all over it. Please be all over it.',
        ],
      },
    ],
  },
  /**
   * The announcement. It is in the inbox from Monday morning, it says exactly
   * what will happen and exactly when it will stop, and on Wednesday the queue
   * fills up with people reporting it anyway - which is not a failure of the
   * mail. Its job is to be the thing you can point at, in one sentence, forty
   * times, without composing forty explanations.
   */
  {
    id: 'mail/maintenance-window',
    subject: 'PLANNED: file sharing unavailable Wednesday 09:00-11:00',
    messages: [
      {
        id: 'mail/maintenance-window#1',
        from: COMPANY_IDS.boss,
        tick: 8,
        body: [
          'Forwarding this on from the supplier, who sent it to me because I '
          + 'am the one who signed for the box in 2019.',
          'The common drive will be unavailable on WEDNESDAY from 09:00 until '
          + '11:00 while they do whatever it is they do. Nothing else is '
          + 'affected. Files are not being deleted, whatever anybody says on '
          + 'the day, and somebody will say it on the day.',
          'Please do not forward this to everybody. I have forwarded it to '
          + 'everybody.',
        ],
      },
    ],
  },
  /**
   * The bill for an enrolment nobody checked. Gated on the account's own
   * fallout field, so it exists exactly when it has happened, is stamped at the
   * minute it landed, and never exists at all for a player who spent thirty
   * seconds asking somebody their payroll number.
   */
  {
    id: 'mail/security-incident',
    subject: 'INCIDENT 4471 - account takeover, Accounts Payable',
    arrival: {
      node: COMPANY_IDS.priyaAccount,
      field: FIELDS.securityFalloutAt,
    },
    messages: [
      {
        id: 'mail/security-incident#1',
        from: COMPANY_IDS.boss,
        tick: 0,
        body: [
          'Pat. Not a telling off. A thing that has happened, and a thing I '
          + 'have to send round because somebody upstream has asked me to.',
          'An authenticator was enrolled yesterday on an Accounts Payable '
          + 'account. It was not enrolled by the person whose account it is. '
          + 'She was, at the time, in a meeting, being extremely audible '
          + 'about a payment run.',
          'The service desk record says the enrolment happened. It does not '
          + 'say anybody checked who they were speaking to, because nobody '
          + 'did, and that sentence is now in a report with a number on it.',
          'Nothing was taken. Everything was seen. Verify them next time - it '
          + 'is thirty seconds and it is the only part of that job that was '
          + 'ever the job.',
        ],
      },
    ],
  },
  /**
   * Second line, returning a handoff nobody could work from. It is gated on
   * the ticket's own field, so it exists exactly when it has happened and is
   * stamped at the minute it landed - and if the player never sends a thin
   * handoff, nobody in the game ever writes this.
   */
  {
    id: HANDOFF_BOUNCE.mailRef,
    subject: 'RE: escalation - returning this one',
    arrival: {
      node: WORLD_IDS.ticket,
      field: FIELDS.handoffSettledAt,
    },
    messages: [
      {
        id: 'mail/handoff-bounce#1',
        from: COMPANY_IDS.boss,
        tick: 0,
        body: [
          'Desmond forwarding this on from second line, whose exact words '
          + 'were "what is this", and who I am told said them out loud.',
          'Their form wants what the user reported and what you tried. Yours '
          + 'had the ticket number. They have sent it back and they have '
          + 'sent it back to you, which I gather is the polite version.',
          'Not a telling off. Genuinely. It is only that they now know your '
          + 'name, and that is a thing that compounds.',
        ],
      },
    ],
  },
  /**
   * BEAT ONE: the weather.
   *
   * Ambient, no numbers, costs nothing and changes nothing. It is a mail that
   * was forwarded to the wrong list, which is how most people at this level
   * first learn anything, and the only thing in it that matters is a phrase
   * somebody in Finance would not have written if it were not already being
   * discussed. Nothing in the game reads it. It exists so that an attentive
   * player gets to feel clever a fortnight later, which is the entire point of
   * a beat that does nothing.
   *
   * It is gated on the arc rather than on the week: `session.ts` writes the
   * field when the arc says the weather has already happened, so a week played
   * before it does not have it in the inbox and every week after it does.
   */
  {
    id: PRESSURE_MAIL.weather,
    subject: 'FW: Q3 forecast - board pack (DRAFT - not for circulation)',
    arrival: {
      node: COMPANY_IDS.player,
      field: FIELDS.pressureWeatherAt,
    },
    messages: [
      {
        id: 'mail/round-weather#1',
        from: COMPANY_IDS.marcus,
        tick: 0,
        body: [
          'Apologies all - please ignore and delete, this went to the wrong '
          + 'distribution list. It is a working draft and the figures in it '
          + 'are not final.',
          'Marcus',
        ],
      },
      {
        id: 'mail/round-weather#2',
        from: COMPANY_IDS.marcus,
        tick: 3,
        body: [
          'Following up: the delete request applies to the attachment as '
          + 'well. I am told the attachment is the part people opened.',
          'For the avoidance of doubt the line about establishment costs on '
          + 'the second page is an OPTION under discussion and not a plan. '
          + 'Nothing has been decided and nobody should be reading anything '
          + 'into the fact that it is on a page at all.',
        ],
      },
    ],
  },
  /**
   * BEAT TWO: the notice, and the one beat that is not optional.
   *
   * Named, dated, with a number in it, sent to everybody, exactly as the law
   * makes an employer send one. It says how many roles are proposed, who is in
   * the selection pool, what the criteria are, when consultation closes and
   * when the decision is - because a round of two out of six has no statutory
   * consultation period of its own, and this game holds itself to the
   * collective one anyway rather than being harder to see coming than the law.
   *
   * The numbers and the dates in it are interpolated from the season rather
   * than typed, so the mail and the machinery can never disagree about how
   * many people are going or when.
   */
  {
    id: PRESSURE_MAIL.notice,
    subject: `ALL STAFF - proposed reduction of ${
      String(REDUNDANCY_ROUND.cut)
    } roles: consultation`,
    arrival: {
      node: COMPANY_IDS.player,
      field: FIELDS.pressureNoticeAt,
    },
    messages: [
      {
        id: 'mail/round-notice#1',
        from: COMPANY_IDS.yolanda,
        tick: 0,
        body: [
          'This mail is going to everybody at this site and I would rather '
          + 'you heard it from a mail than from the kitchen.',
          `The company is proposing a reduction of ${
            String(REDUNDANCY_ROUND.cut)
          } roles from a selection pool of ${
            String(REDUNDANCY_ROUND.pool)
          } in support and administrative functions at this site. If you are `
          + 'in the pool you are being told so individually today. Being in a '
          + 'pool is not a decision about you and it is not a shortlist.',
          `Consultation opens now and closes at 17:00 on ${
            decisionDate(REDUNDANCY_ROUND)
          }, which is ${
            String(noticeDays(REDUNDANCY_ROUND))
          } days from today. No dismissal takes effect before that date. `
          + 'During consultation you may put alternatives to us in writing, '
          + 'and we do have to consider them, and I would encourage it.',
          'Selection will be made on a scoring matrix. The criteria are '
          + 'performance, disciplinary record where it is current and '
          + 'relevant, and length of service. The matrix is published: you '
          + 'can see your own scores and the pool\'s from today.',
        ],
      },
      {
        id: 'mail/round-notice#2',
        from: COMPANY_IDS.boss,
        tick: 40,
        body: [
          'Pat - you will have had the one from HR. I am not going to add '
          + 'anything clever to it.',
          'The scoring is the scoring. The only line on it that moves between '
          + 'now and then is the one about the week, and that is the one you '
          + 'have been looking at every evening since you started.',
          'Door is open. I say that to everybody and I mean it about four '
          + 'times a year, and this is one of them.',
        ],
      },
    ],
  },
  /**
   * The summons, which is the whole of the mechanic.
   *
   * It is in the inbox from the Monday, it names the hour, and the hour it
   * names is the one the schedule uses - so the dread is a thing the player
   * can plan around rather than a thing that happens to them. Ungated for
   * exactly that reason: an invitation that only appears once the meeting has
   * started is not an invitation.
   */
  {
    id: MEETING_MAIL.summons,
    subject: `${TICKET_HYGIENE_SYNC.title} - Wednesday ${
      clockTime(HYGIENE_SYNC_MINUTE)
    }`,
    messages: [
      {
        id: 'mail/hygiene-sync#1',
        from: COMPANY_IDS.boss,
        tick: 3,
        body: [
          `Booking a ${String(HYGIENE_SYNC_MINUTES)} minute sync on ticket `
          + `hygiene for WEDNESDAY at ${clockTime(HYGIENE_SYNC_MINUTE)}. `
          + 'Attendance is expected. I have said that in the way you have to '
          + 'say it, and I am aware of how it reads.',
          TICKET_HYGIENE_SYNC.subject,
          'Pat - you are new, so to be clear, this is not optional and it is '
          + 'not about you. Half ten, the room with the whiteboard nobody has '
          + 'ever successfully cleaned.',
        ],
      },
    ],
  },
  /**
   * And the recap, which is the meeting, in full, half an hour late.
   *
   * Gated on the field the day loop writes when the room empties, so it exists
   * exactly when the meeting has happened and every line is stamped from
   * there. The body is built from the meeting's own beats rather than written
   * a second time: the joke only lands if it is genuinely the same content,
   * and a summary would be quietly making the opposite point.
   */
  {
    id: MEETING_MAIL.recap,
    subject: `RECAP: ${TICKET_HYGIENE_SYNC.title}`,
    arrival: {
      node: COMPANY_IDS.player,
      field: FIELDS.meetingRecapAt,
    },
    messages: [
      {
        id: 'mail/hygiene-sync-recap#1',
        from: COMPANY_IDS.boss,
        tick: 0,
        body: [
          TICKET_HYGIENE_SYNC.recapOpener,
          ...minutedInFull(),
          'Actions: none. Next one in a fortnight.',
        ],
      },
    ],
  },
  /**
   * The compliance report that read the estate overnight (E6, 0.28.0).
   *
   * The other half of `setenforce 0`: it worked, it worked instantly, and it is
   * in a report. Gated on the box's own `selinux_noticed_at`, so it exists
   * exactly when somebody upstream has actually looked - and never at all for a
   * player who relabelled the file, because nothing stamped the minute.
   *
   * It is written against the MSP's desk box because that is the one world where
   * the engineer tier and a machine the player may reinstall exist together; a
   * second employer that grows the tier grows a row here beside it. Morgan sends
   * it because Morgan runs Fettle & Crane's own estate, and it is deliberately
   * not a telling-off: the beat is that a shortcut is a thing that is written
   * down, not a thing you are shouted at for.
   */
  {
    id: 'mail/selinux-permissive',
    subject: 'Compliance sweep - SELinux not enforcing on FC-DESK-07',
    arrival: {
      node: MSP_IDS.playerMachine,
      field: FIELDS.selinuxNoticedAt,
    },
    messages: [
      {
        id: 'mail/selinux-permissive#1',
        from: MSP_IDS.mspLead,
        tick: 0,
        body: [
          'Not a telling off, and I am not asking you to justify it. The '
          + 'overnight sweep flags any box on the estate where SELinux is not '
          + 'enforcing, and it flagged yours, so it is on a list with a date '
          + 'next to it and I have to send this.',
          'I know exactly what happened, because I have done it. Something was '
          + 'denied, the permissions were obviously fine, you had eleven other '
          + 'things on, and setenforce 0 made it go away in one keystroke. It '
          + 'does. That is the problem with it.',
          'What is left behind is a machine where the label on a file no '
          + 'longer decides anything - and the label was never wrong about '
          + 'that one file, it was wrong about where the file had been. '
          + 'Relabel it and the box can go back to enforcing.',
          'Put it back once the file is right and the next sweep will not '
          + 'flag you. This one already has, and that does not come off - it '
          + 'is not held against you, it is just a thing that got written '
          + 'down, which is most of what compliance is.',
        ],
      },
    ],
  },
];
