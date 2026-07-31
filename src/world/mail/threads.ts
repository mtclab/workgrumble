import { COMPANY_IDS } from '../company';
import { WORLD_IDS } from '../demo-world';
import { FIELDS } from '../fields';
import { HANDOFF_BOUNCE } from '../tickets/handoff';
import type { MailThread } from './types';

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
          'Correction to the below: the good kettle has been moved into your '
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
          'Following up on the below. Still no rush. I have moved the call to '
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
];
