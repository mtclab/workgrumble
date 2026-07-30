import { COMPANY_IDS } from '../company';
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
];
