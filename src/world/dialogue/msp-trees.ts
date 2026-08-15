/**
 * The MSP customers' conversations (0.8.0, Pass B).
 *
 * Same house rules as every other tree: the reporter voices the PROBLEM as they
 * live it and never the cause; exactly one option per fault of their own carries
 * the `reveal` that writes that cause onto the ticket; every tree has an option
 * that `asks`, so the SLA can honestly be parked on the reporter; and a person
 * who reports more than one thing opens on the right line for each and reacts to
 * each fix in turn.
 *
 * These are the three customer contacts - a law-firm practice manager, a SaaS
 * operations lead, a clinic office manager - each of whom FILES their company's
 * tickets on behalf of the colleague the fault is actually about. The comedy is
 * the same across all three: each is right about their own morning, and the
 * MSP's job is the scope none of them can quite see.
 */

import { HELPDESK_ACTIONS } from '../actions/ids';
import { MSP_IDS } from '../msp-company';
import {
  GATEKEEPER_ANSWER,
  HIPAA_ACCESS_REPORT,
  SCREEN_RECORDING_WALKTHROUGH,
} from '../tickets/msp';
import type { DialogueEffect, DialogueTree } from './types';

/**
 * The three replies that CLOSE a ticket on this roster, as effects.
 *
 * A chat option is the only route a player has to `ticket.reply_to_reporter`,
 * so a ticket whose resolution rule watches `replied` is closable exactly as
 * far as its tree offers one of these. The sentences themselves live with the
 * paths that advertise them (`tickets/msp.ts`), so the conversation and the
 * advertised path say the same thing rather than two similar things.
 */
const REPORT_THE_ACCESS_REVIEW: DialogueEffect = {
  action: HELPDESK_ACTIONS.ticketReplyToReporter,
  target: 'ticket:elmwood-hipaa-audit',
  params: { comment: HIPAA_ACCESS_REPORT },
};

const WALK_THROUGH_THE_GRANT: DialogueEffect = {
  action: HELPDESK_ACTIONS.ticketReplyToReporter,
  target: 'ticket:marlowe-screen-recording',
  params: { comment: SCREEN_RECORDING_WALKTHROUGH },
};

const EXPLAIN_THE_REFUSAL: DialogueEffect = {
  action: HELPDESK_ACTIONS.ticketReplyToReporter,
  target: 'ticket:marlowe-gatekeeper-plugin',
  params: { comment: GATEKEEPER_ANSWER },
};

const NADIA: DialogueTree = {
  id: 'dialogue/msp-nadia',
  speaker: MSP_IDS.fontaineContact,
  tickets: [
    'ticket:fontaine-matter-access',
    'ticket:fontaine-checkout-deadlock',
    'ticket:fontaine-efiling',
    // The surplus (E11, 0.34.0 slice 2). Nadia files for the firm, so the
    // firm's spare work speaks with her voice like the rest of it: a partner
    // locked out, a document store failing to save, and the ordinary grant.
    'ticket:msp-pool-fontaine-partner-lockout',
    'ticket:msp-pool-fontaine-file-server-full',
    'ticket:msp-pool-fontaine-supervising-partner',
  ],
  root: 'matter',
  roots: {
    'ticket:fontaine-matter-access': 'matter',
    'ticket:fontaine-checkout-deadlock': 'checkout',
    'ticket:fontaine-efiling': 'efiling',
    'ticket:msp-pool-fontaine-partner-lockout': 'lockout',
    'ticket:msp-pool-fontaine-file-server-full': 'server-space',
    'ticket:msp-pool-fontaine-supervising-partner': 'supervising',
  },
  resolved_roots: {
    'ticket:fontaine-matter-access': 'matter-done',
    'ticket:fontaine-checkout-deadlock': 'checkout-done',
    'ticket:fontaine-efiling': 'efiling-done',
    'ticket:msp-pool-fontaine-partner-lockout': 'lockout-done',
    'ticket:msp-pool-fontaine-file-server-full': 'server-space-done',
    'ticket:msp-pool-fontaine-supervising-partner': 'supervising-done',
  },
  nodes: [
    {
      id: 'matter',
      npc_line: 'Erin started this morning and she is staffed on Delacroix, but '
        + 'she cannot see the matter at all. I have checked conflicts already - '
        + 'no wall on this one - so she is fine to be added.',
      options: [
        {
          label: 'Ask whether anyone else on the matter has the same problem',
          next: 'matter-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check the matter\'s security group in the directory',
          effects: [
            {
              reveal: 'She has never been granted it. A matter workspace is a '
                + 'per-matter security group, and a new starter is in none of '
                + 'them until somebody who has checked conflicts adds her.',
            },
          ],
        },
        { label: 'Tell her you are on it' },
      ],
    },
    {
      id: 'matter-q',
      npc_line: 'No, just Erin - everyone else was added when the matter opened. '
        + 'She is the only one who joined after.',
      options: [{ label: 'Go and add her to the workspace' }],
    },
    {
      id: 'matter-done',
      npc_line: 'She is in - she can see the whole workspace now. Thank you. One '
        + 'less thing for her first day.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'checkout',
      npc_line: 'The Rossiter deposition is stuck read-only for everyone. iManage '
        + 'says Marcus has it checked out, and Marcus is in court and has been '
        + 'since Friday. Someone has a hearing on it tomorrow.',
      options: [
        {
          label: 'Ask how Marcus left the document on Friday',
          next: 'checkout-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the check-out status in iManage Control Center',
          effects: [
            {
              reveal: 'The document is checked out to Marcus and his client '
                + 'closed uncleanly, so the lock was never released. Releasing '
                + 'the stale check-out is the whole of the fix.',
            },
          ],
        },
        { label: 'Tell her you will get it unstuck' },
      ],
    },
    {
      id: 'checkout-q',
      npc_line: 'He shut the laptop lid on it, I think - he does that. Whatever '
        + 'he did, it did not let go of the document.',
      options: [{ label: 'Release the stale check-out' }],
    },
    {
      id: 'checkout-done',
      npc_line: 'It is editable again - the paralegal has it open now. That was '
        + 'quick. She was starting to panic about tomorrow.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'efiling',
      npc_line: 'I have a partner who cannot file the Rossiter motion - CM/ECF '
        + 'keeps rejecting the PDF, something about security settings, and it is '
        + 'due at noon. The court will not care that it was an IT problem.',
      options: [
        {
          label: 'Ask whether the paralegal made a court-ready copy',
          next: 'efiling-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the rejection and go looking for the right file',
          effects: [
            {
              reveal: 'CM/ECF bounced the draft print for its document security '
                + 'and missing text layer. The flattened OCR\'d PDF/A the '
                + 'paralegal exported is sitting in WINDOWS\\TEMP, not where the '
                + 'upload dialog points.',
            },
          ],
        },
        { label: 'Tell her you are on it now' },
      ],
    },
    {
      id: 'efiling-q',
      npc_line: 'She swears she saved a proper PDF/A earlier - the flattened '
        + 'one - but nobody can find it, and the one they keep uploading is the '
        + 'draft that bounces.',
      options: [{ label: 'Find the right copy and put it where it uploads from' }],
    },
    {
      id: 'efiling-done',
      npc_line: 'It went through - filed at eleven fifty-one. Nine minutes to '
        + 'spare. I am not going to tell the partner how close that was.',
      options: [{ label: 'Log the fix' }],
    },

    /* -- the surplus (E11, 0.34.0 slice 2) -------------------------------- */

    {
      id: 'lockout',
      npc_line: 'Marcus cannot sign in. He has been at it since the car park '
        + 'and it has stopped taking anything at all. He has a client at half '
        + 'nine and he has mentioned that twice.',
      options: [
        {
          label: 'Ask whether he has changed his password recently',
          next: 'lockout-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the state on his account in the directory',
          effects: [
            {
              reveal: 'A run of failed sign-ins tripped the lockout threshold, '
                + 'exactly as it is meant to. The password is still the '
                + 'password - the directory has shut the door, and the count '
                + 'that shut it is sitting on the account.',
            },
          ],
        },
        { label: 'Tell her you will get him in' },
      ],
    },
    {
      id: 'lockout-q',
      npc_line: 'Not that he has told me. He types it the way he does '
        + 'everything, which is fast and about four times.',
      options: [{ label: 'Unlock the account' }],
    },
    {
      id: 'lockout-done',
      npc_line: 'He is in. He has gone to make a coffee about it, which is his '
        + 'version of thank you.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'server-space',
      npc_line: 'Since yesterday afternoon, saving a document back into the '
        + 'document system fails about every other go. No pattern, no error '
        + 'worth repeating, works if you try again. Two fee earners have '
        + 'started keeping copies on their desktops, which is how a firm loses '
        + 'a document properly.',
      options: [
        {
          label: 'Ask whether it is everybody or a couple of machines',
          next: 'server-space-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the free space on the box the document store writes to',
          effects: [
            {
              reveal: 'FONT-FILE-01 is down to about two gigabytes, so a save '
                + 'into the document store succeeds or fails on how much room '
                + 'there happens to be in the second it lands - which is what '
                + '"about half the time" looks like from a fee earner\'s '
                + 'chair. It is a server, and Fontaine is a helpdesk contract: '
                + 'the desk may read that box and may not act on it.',
            },
          ],
        },
        { label: 'Tell her you are looking into it' },
      ],
    },
    {
      id: 'server-space-q',
      npc_line: 'Everybody, as far as I can tell - it is not one desk. Which I '
        + 'took to mean it was the system rather than anybody\'s computer, and '
        + 'I am hoping that is not worse.',
      options: [{ label: 'Escalate it to whoever owns their server' }],
    },
    {
      id: 'server-space-done',
      npc_line: 'Their support company have been on and cleared something '
        + 'down. They said they had no idea it was that close, which does not '
        + 'fill me with confidence about them and does about you.',
      options: [{ label: 'Log the escalation' }],
    },
    {
      id: 'supervising',
      npc_line: 'Marcus has been put on Delacroix as supervising partner and '
        + 'the workspace is not there for him. I have checked conflicts - no '
        + 'wall on this one - so he is clear to be added.',
      options: [
        {
          label: 'Ask when he was brought onto the matter',
          next: 'supervising-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Compare the matter\'s member list against who can open it',
          effects: [
            {
              reveal: 'He is in none of the matter groups nobody has put him '
                + 'in. Being staffed on a matter happens in a meeting; being '
                + 'in that matter\'s security group happens in the directory, '
                + 'and only the first of those has happened.',
            },
          ],
        },
        { label: 'Tell her you will see to it' },
      ],
    },
    {
      id: 'supervising-q',
      npc_line: 'Friday, at the partners\' meeting, which is where everything '
        + 'here is decided and nothing here is written down.',
      options: [{ label: 'Add him to the matter workspace' }],
    },
    {
      id: 'supervising-done',
      npc_line: 'He can see it. He has already opened three things in it and '
        + 'changed none of them, which is supervision.',
      options: [{ label: 'Log the fix' }],
    },
  ],
};

const THEO: DialogueTree = {
  id: 'dialogue/msp-theo',
  speaker: MSP_IDS.meridianContact,
  tickets: [
    'ticket:meridian-app-assignment',
    'ticket:meridian-offboarding',
    'ticket:meridian-mfa-lockout',
    'ticket:meridian-prod-down',
    // The surplus (E11, 0.34.0 slice 2): his own laptop, the migration
    // weekend's other casualty, and the deadline that does not move a contract.
    'ticket:msp-pool-meridian-restart-prompt',
    'ticket:msp-pool-meridian-wrong-groups',
    'ticket:msp-pool-meridian-status-page',
  ],
  root: 'sso',
  roots: {
    'ticket:meridian-app-assignment': 'sso',
    'ticket:meridian-offboarding': 'offboard',
    'ticket:meridian-mfa-lockout': 'mfa',
    'ticket:meridian-prod-down': 'prod',
    'ticket:msp-pool-meridian-restart-prompt': 'laptop-restart',
    'ticket:msp-pool-meridian-wrong-groups': 'nora-groups',
    'ticket:msp-pool-meridian-status-page': 'status-page',
  },
  resolved_roots: {
    'ticket:meridian-app-assignment': 'sso-done',
    'ticket:meridian-offboarding': 'offboard-done',
    'ticket:meridian-mfa-lockout': 'mfa-done',
    'ticket:meridian-prod-down': 'prod-done',
    'ticket:msp-pool-meridian-restart-prompt': 'laptop-restart-done',
    'ticket:msp-pool-meridian-wrong-groups': 'nora-groups-done',
    'ticket:msp-pool-meridian-status-page': 'status-page-done',
  },
  nodes: [
    {
      id: 'sso',
      npc_line: 'Dana clicks the Salesforce tile in Okta and it just drops her '
        + 'back on the dashboard - round and round, no error. Rest of her team '
        + 'is fine. Prod is fine too, before you ask.',
      options: [
        {
          label: 'Ask what changed over the weekend',
          next: 'sso-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check Dana\'s app assignment in Okta',
          effects: [
            {
              reveal: 'The weekend migration rebuilt the Salesforce app on a new '
                + 'group and did not carry Dana into it. Okta authenticates her, '
                + 'finds no assignment, and returns her to the dashboard.',
            },
          ],
        },
        { label: 'Tell him you will look at her account' },
      ],
    },
    {
      id: 'sso-q',
      npc_line: 'IT redid the Salesforce SSO integration on Saturday. Everyone '
        + 'else came across fine, though, so I assumed it was just her.',
      options: [{ label: 'Restore her app assignment' }],
    },
    {
      id: 'sso-done',
      npc_line: 'She is in - straight through this time. So it was the '
        + 'migration, not her. Good, she was blaming her own password.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'offboard',
      npc_line: 'Access review flagged Rafiq - the contractor whose deal ended '
        + 'in April. He is still in Production Admins in Okta. He does not work '
        + 'here and he can still reach prod, which is not a great look.',
      options: [
        {
          label: 'Ask whether his account was ever fully offboarded',
          next: 'offboard-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check the group membership in Okta',
          effects: [
            {
              reveal: 'Offboarding disabled the account and stopped there. '
                + 'Disabling somebody does not strip their groups, so his '
                + 'production-admin access has simply outlived him.',
            },
          ],
        },
        { label: 'Tell him you will take it off' },
      ],
    },
    {
      id: 'offboard-q',
      npc_line: 'The account was disabled in April, I checked that. Whoever did '
        + 'it clearly did not go through the groups afterwards.',
      options: [{ label: 'Remove him from the group' }],
    },
    {
      id: 'offboard-done',
      npc_line: 'Out - he is not in it any more. I will note the review caught '
        + 'it. That is the sort of thing that keeps me up, honestly.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'mfa',
      npc_line: 'Nora is locked out of everything. The authenticator stopped '
        + 'taking its own code, she tried a few more times, and Okta shut the '
        + 'account. She has a client call at ten.',
      options: [
        {
          label: 'Ask how many times she tried before it locked',
          next: 'mfa-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check the account state in the Okta admin console',
          effects: [
            {
              reveal: 'A run of failed sign-ins tripped Okta\'s lockout, exactly '
                + 'as it should. An identity user at a helpdesk customer - the '
                + 'desk unlocks it from the admin console.',
            },
          ],
        },
        { label: 'Tell him you will get her back in' },
      ],
    },
    {
      id: 'mfa-q',
      npc_line: 'Enough times that it gave up on her. It is a Monday, the codes '
        + 'were being difficult, and she is only human.',
      options: [{ label: 'Unlock the account' }],
    },
    {
      id: 'mfa-done',
      npc_line: 'Back in, with a minute before her call. Cheers. If the codes '
        + 'keep playing up we will sort the authenticator properly later.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'prod',
      npc_line: 'The product is throwing 502s and customers are noticing. Can '
        + 'you just bounce the app server - MERI-APP-01 - and see if that clears '
        + 'it? I know it is a big ask.',
      options: [
        {
          label: 'Ask which box the product actually runs on',
          next: 'prod-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check what the contract covers on that server',
          effects: [
            {
              reveal: 'MERI-APP-01 is the Linux prod app server, and this is a '
                + 'helpdesk contract - it is out of reach on OS and scope both. '
                + 'The fast, correct move is a clean escalation to their infra '
                + 'team.',
            },
          ],
        },
        { label: 'Tell him you will get the right people on it' },
      ],
    },
    {
      id: 'prod-q',
      npc_line: 'MERI-APP-01, the Linux box - our infra team owns that one. I '
        + 'know it is not really your side, I am just hoping for a quick win.',
      options: [{ label: 'Escalate it to their infrastructure team' }],
    },
    {
      id: 'prod-done',
      npc_line: 'Their engineer has it - picked it up straight away. You were '
        + 'right not to touch it. Faster this way anyway, honestly.',
      options: [{ label: 'Log the escalation' }],
    },

    /* -- the surplus (E11, 0.34.0 slice 2) -------------------------------- */

    {
      id: 'laptop-restart',
      npc_line: 'My own laptop has been asking me to restart since the start '
        + 'of the month and I have been pressing Later like everybody else in '
        + 'this building. I would like it to stop asking.',
      options: [
        {
          label: 'Ask whether anything is actually going wrong with it',
          next: 'laptop-restart-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check what the machine is waiting for',
          effects: [
            {
              reveal: 'There is a fortnight of updates staged on it and '
                + 'nothing else wrong with it at all. Staged means downloaded '
                + 'and waiting for the box to go round once, because applying '
                + 'them under somebody mid-call is how you take a floor out at '
                + 'half past two.',
            },
          ],
        },
        { label: 'Tell him you will deal with it' },
      ],
    },
    {
      id: 'laptop-restart-q',
      npc_line: 'Nothing at all. It works perfectly. It just asks, and I '
        + 'always say no, and then I say no again.',
      options: [{ label: 'Take the machine round once' }],
    },
    {
      id: 'laptop-restart-done',
      npc_line: 'Gone, and it took four minutes rather than the afternoon I '
        + 'had it filed as. Do not tell me how long I ignored that.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'nora-groups',
      npc_line: 'Two things about the same person, and I have a horrible '
        + 'feeling they are one thing. Nora has never once got into Salesforce '
        + 'since the SSO was rebuilt - she has been asking a colleague to pull '
        + 'her reports, which he has been doing, which is why nobody said '
        + 'anything. And the access review has her name in a group I am fairly '
        + 'sure an analyst should not be in.',
      options: [
        {
          label: 'Ask who set her account up on the migration weekend',
          next: 'nora-groups-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read every group her account is actually in',
          effects: [
            {
              reveal: 'She was rebuilt by hand that weekend and put into '
                + 'Production Admins instead of Salesforce Users - two entries '
                + 'next to each other in the same list at two in the morning. '
                + 'Okta authenticates her, finds no assignment to the app and '
                + 'returns her to the dashboard, and the group she did get is '
                + 'the one the review flagged. Neither half of that is fixed '
                + 'by the other.',
            },
          ],
        },
        { label: 'Tell him you will take both of them together' },
      ],
    },
    {
      id: 'nora-groups-q',
      npc_line: 'Whoever was still awake. It was meant to be automated and '
        + 'about six accounts were not, and hers was one of them.',
      options: [{ label: 'Put both halves of her provisioning right' }],
    },
    {
      id: 'nora-groups-done',
      npc_line: 'She is in Salesforce and out of the admin group, and the '
        + 'review has gone quiet. I had those down as two tickets, which tells '
        + 'you something about me and that weekend.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'status-page',
      npc_line: 'We are in an incident and our biggest customer\'s contract '
        + 'says a customer-visible one is posted within thirty minutes. Twenty '
        + 'are gone. The person who publishes the page is on a plane. I have '
        + 'written the words - can you push them for me?',
      options: [
        {
          label: 'Ask where the status page is actually served from',
          next: 'status-page-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check what the contract covers on that box',
          effects: [
            {
              reveal: 'The status page is served off MERI-APP-01 with the '
                + 'product - a Linux box on their own infrastructure team\'s '
                + 'side of a helpdesk contract. There is no version of this '
                + 'the desk can publish: not the contract, not the toolset, '
                + 'not the credentials. The ten minutes belong to somebody who '
                + 'can reach the box.',
            },
          ],
        },
        { label: 'Tell him you are already moving on it' },
      ],
    },
    {
      id: 'status-page-q',
      npc_line: 'Same box as everything else - MERI-APP-01. I know what you '
        + 'are about to say. Say it fast.',
      options: [{ label: 'Get it to somebody who can publish it, now' }],
    },
    {
      id: 'status-page-done',
      npc_line: 'It went up at twenty-eight minutes. Their on-call had it '
        + 'inside two of you raising it. I was going to argue with you and I '
        + 'am glad I did not have the time.',
      options: [{ label: 'Log the escalation' }],
    },
  ],
};

const IVY: DialogueTree = {
  id: 'dialogue/msp-ivy',
  speaker: MSP_IDS.northwindContact,
  tickets: [
    'ticket:northwind-backup-alert',
    'ticket:northwind-cert-alert',
    'ticket:northwind-disk-alert',
    // The surplus (E11, 0.34.0 slice 2). Both are the same lesson the three
    // above teach and neither is a threshold: an outage with an obvious fix,
    // and a fault on the watched box reported from two desks nobody watches.
    'ticket:msp-pool-northwind-portal-stopped',
    'ticket:msp-pool-northwind-server-service',
  ],
  root: 'backup',
  roots: {
    'ticket:northwind-backup-alert': 'backup',
    'ticket:northwind-cert-alert': 'cert',
    'ticket:northwind-disk-alert': 'disk',
    'ticket:msp-pool-northwind-portal-stopped': 'portal-stopped',
    'ticket:msp-pool-northwind-server-service': 'folders-gone',
  },
  resolved_roots: {
    'ticket:northwind-backup-alert': 'backup-done',
    'ticket:northwind-cert-alert': 'cert-done',
    'ticket:northwind-disk-alert': 'disk-done',
    'ticket:msp-pool-northwind-portal-stopped': 'portal-stopped-done',
    'ticket:msp-pool-northwind-server-service': 'folders-gone-done',
  },
  nodes: [
    {
      id: 'backup',
      npc_line: 'Your monitoring flagged the backup on our server - failed, it '
        + 'says? I do not know what that means, only that your screen went red '
        + 'and mine did not.',
      options: [
        {
          label: 'Ask whether their own IT handles fixes on that box',
          next: 'backup-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the alert and check what the contract covers',
          effects: [
            {
              reveal: 'The backup job failed overnight. Northwind is monitoring-'
                + 'only, so remediation is out of contract - the job is to '
                + 'acknowledge and escalate, loudly, because nobody here is '
                + 'testing a restore either.',
            },
          ],
        },
        { label: 'Tell her you have seen it' },
      ],
    },
    {
      id: 'backup-q',
      npc_line: 'We have a chap who comes in for the actual fixing. You just '
        + 'watch it - that was the cheap option, I remember picking it.',
      options: [{ label: 'Escalate it to whoever does their fixes' }],
    },
    {
      id: 'backup-done',
      npc_line: 'Raised, then. Their engineer will pick it up. Thank you for '
        + 'spotting it - that part, at least, clearly works.',
      options: [{ label: 'Log the escalation' }],
    },
    {
      id: 'cert',
      npc_line: 'Something about a certificate on our patient portal expiring? '
        + 'Your board flagged it. It still works today, so I am not sure what '
        + 'the fuss is.',
      options: [
        {
          label: 'Ask who renewed the certificate last time',
          next: 'cert-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the expiry date and check the contract',
          effects: [
            {
              reveal: 'The portal\'s TLS certificate is near expiry - a threshold '
                + 'the monitoring catches early. Renewing it is out of a '
                + 'monitoring-only contract; raising it in time is the point.',
            },
          ],
        },
        { label: 'Tell her you will get it raised' },
      ],
    },
    {
      id: 'cert-q',
      npc_line: 'Our IT man does that, I think, when it comes up. It has been a '
        + 'year, so I could not tell you exactly. Does it matter?',
      options: [{ label: 'Escalate it before it expires' }],
    },
    {
      id: 'cert-done',
      npc_line: 'Passed on, with plenty of warning this time. He grumbled that '
        + 'nobody usually tells him until it has already broken. So - progress.',
      options: [{ label: 'Log the escalation' }],
    },
    {
      id: 'disk',
      npc_line: 'The server is low on space, your board says - amber, whatever '
        + 'that is. It has always managed before, so I assumed it sorts itself '
        + 'out.',
      options: [
        {
          label: 'Ask whether anything new is being saved to that box',
          next: 'disk-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the threshold and check the contract',
          effects: [
            {
              reveal: 'Free space has crossed the low threshold and is still '
                + 'falling. Clearing anything on it is real remediation and out '
                + 'of scope; escalating while there is headroom is the value the '
                + 'account bought.',
            },
          ],
        },
        { label: 'Tell her you will flag it now' },
      ],
    },
    {
      id: 'disk-q',
      npc_line: 'Not that I know of - it is the same handful of things it always '
        + 'does. It does not sort itself out, does it. I can hear you not saying '
        + 'so.',
      options: [{ label: 'Escalate it while there is still room' }],
    },
    {
      id: 'disk-done',
      npc_line: 'Raised - their man will clear it down. You caught it before it '
        + 'stopped, apparently, which is more than the last lot did.',
      options: [{ label: 'Log the escalation' }],
    },

    /* -- the surplus (E11, 0.34.0 slice 2) -------------------------------- */

    {
      id: 'portal-stopped',
      npc_line: 'Your board says our booking page is off, and two patients '
        + 'have rung reception because the website will not let them book. Can '
        + 'you not just put it back on? It is one button, surely.',
      options: [
        {
          label: 'Ask who comes out when that server needs something doing',
          next: 'portal-stopped-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read what the board is saying and check the contract',
          effects: [
            {
              reveal: 'The portal service on NW-SRV-01 is stopped, which is '
                + 'why the booking page answers nothing at all. Starting it '
                + 'would very probably fix it, and starting it is remediation '
                + '- this account bought watching and notifying, and the hands '
                + 'belong to whoever they pay for hands.',
            },
          ],
        },
        { label: 'Tell her you have it in front of you' },
      ],
    },
    {
      id: 'portal-stopped-q',
      npc_line: 'Our chap. He is in on Thursdays, though he will come out if '
        + 'it is proper. Is this proper? It sounds proper.',
      options: [{ label: 'Raise it with him now, with the service named' }],
    },
    {
      id: 'portal-stopped-done',
      npc_line: 'He is coming in. He said it was a five-minute job and he was '
        + 'cross it had been off since ten, which I gather is a point in your '
        + 'favour rather than against you.',
      options: [{ label: 'Log the escalation' }],
    },
    {
      id: 'folders-gone',
      npc_line: 'Neither of the reception machines can get to the shared '
        + 'folders - the letters, the scanned referrals, none of it. The '
        + 'computers themselves seem perfectly happy. I do know those two are '
        + 'not yours.',
      options: [
        {
          label: 'Ask whether anything has been done to the server this week',
          next: 'folders-gone-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the one box at this account you are paid to watch',
          effects: [
            {
              reveal: 'The Server service on NW-SRV-01 has wedged. It is the '
                + 'part that publishes a Windows box\'s shares, so the server '
                + 'is up, answering and handing out nothing - which from a '
                + 'reception desk looks exactly like two PCs going wrong at '
                + 'once. It is one fault, on the only machine here the '
                + 'contract covers.',
            },
          ],
        },
        { label: 'Tell her you will look at what you can see' },
      ],
    },
    {
      id: 'folders-gone-q',
      npc_line: 'Not to my knowledge, and I would know, because nobody here '
        + 'does anything to it. It has sat in the same cupboard since we '
        + 'bought it and we all walk past it.',
      options: [{ label: 'Raise it with their engineer, naming the service' }],
    },
    {
      id: 'folders-gone-done',
      npc_line: 'He went to the server rather than the two desks, which he '
        + 'said saved him an hour. I did not tell him whose hour it was.',
      options: [{ label: 'Log the escalation' }],
    },
  ],
};

/* -- HOLLOWAY-ACCT: fully-managed, the whole estate in reach (0.11.0) ------- */

const PRIYA: DialogueTree = {
  id: 'dialogue/msp-priya',
  speaker: MSP_IDS.hollowayContact,
  tickets: [
    'ticket:holloway-shared-drive',
    'ticket:holloway-spooler',
    'ticket:holloway-lockout',
    // The surplus (E11, 0.34.0 slice 2): a cut-off she cannot move, one desk
    // that is not the office, and the state everybody reports as a lockout.
    'ticket:msp-pool-holloway-payroll-export',
    'ticket:msp-pool-holloway-workstation-service',
    'ticket:msp-pool-holloway-disabled-account',
  ],
  root: 'drive',
  roots: {
    'ticket:holloway-shared-drive': 'drive',
    'ticket:holloway-spooler': 'spool',
    'ticket:holloway-lockout': 'lock',
    'ticket:msp-pool-holloway-payroll-export': 'payroll',
    'ticket:msp-pool-holloway-workstation-service': 'mapped-drives',
    'ticket:msp-pool-holloway-disabled-account': 'switched-off',
  },
  resolved_roots: {
    'ticket:holloway-shared-drive': 'drive-done',
    'ticket:holloway-spooler': 'spool-done',
    'ticket:holloway-lockout': 'lock-done',
    'ticket:msp-pool-holloway-payroll-export': 'payroll-done',
    'ticket:msp-pool-holloway-workstation-service': 'mapped-drives-done',
    'ticket:msp-pool-holloway-disabled-account': 'switched-off-done',
  },
  nodes: [
    {
      id: 'drive',
      npc_line: 'The whole office has lost the S: drive - the letter is there but '
        + 'every client folder under it is empty or errors, and it is month-end. '
        + 'You look after all of this for us, so I am hoping you can just fix it.',
      options: [
        {
          label: 'Ask whether one PC or everyone has lost the drive',
          next: 'drive-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check the file service on HOLL-SRV-01',
          effects: [
            {
              reveal: 'The Distributed File System service on HOLL-SRV-01 has '
                + 'wedged - running, and serving a namespace that resolves to '
                + 'nothing. Restarting the service on the server clears it, and '
                + 'fully-managed means the server is ours to restart.',
            },
          ],
        },
        { label: 'Tell her you are on it' },
      ],
    },
    {
      id: 'drive-q',
      npc_line: 'Everyone - every desk in the office, all at once. Which is why I '
        + 'thought it must be the server rather than any one machine.',
      options: [{ label: 'Restart the file service on the server' }],
    },
    {
      id: 'drive-done',
      npc_line: 'The folders are back - all of them, straight away. On month-end, '
        + 'no less. This is exactly why we hand the lot to you.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'spool',
      npc_line: 'The reception PC will not print - jobs just stack up in the queue '
        + 'and nothing comes out. Same machine as always. Can you have a look?',
      options: [
        {
          label: 'Ask whether anything prints or the queue just grows',
          next: 'spool-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the spooler status on HOLL-WS-01',
          effects: [
            {
              reveal: 'The Print Spooler on the reception workstation has wedged - '
                + 'holding every job and releasing none. A restart of the spooler '
                + 'drains the queue; it is a workstation service, the same fix at '
                + 'any tier.',
            },
          ],
        },
        { label: 'Tell her you will sort the printing' },
      ],
    },
    {
      id: 'spool-q',
      npc_line: 'Nothing at all comes out - they just pile up. The printer itself '
        + 'is awake, the light is on, it simply never gets anything.',
      options: [{ label: 'Restart the spooler on the reception PC' }],
    },
    {
      id: 'spool-done',
      npc_line: 'Printing again - the backlog all came out in a rush. Half of it '
        + 'we did not need, but that is our fault, not yours.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'lock',
      npc_line: 'Gordon is locked out - he cannot get into the practice suite and '
        + 'the payroll run is this morning. He had a go at his password rather too '
        + 'many times after the weekend.',
      options: [
        {
          label: 'Ask how many times Gordon tried before it locked',
          next: 'lock-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the lockout trail on his account',
          effects: [
            {
              reveal: 'A run of failed sign-ins tripped the lockout, exactly as it '
                + 'should. Unlocking Gordon\'s account is the whole of it - a user '
                + 'is helpdesk work at any tier, fully-managed included.',
            },
          ],
        },
        { label: 'Tell her you will get him back in' },
      ],
    },
    {
      id: 'lock-q',
      npc_line: 'Enough that it gave up on him - four or five, he says, though I '
        + 'suspect it was more like eight. It was a long weekend.',
      options: [{ label: 'Unlock his account' }],
    },
    {
      id: 'lock-done',
      npc_line: 'He is in, with time before payroll. Thank you - he was starting '
        + 'to sweat about it, and so was I, frankly.',
      options: [{ label: 'Log the fix' }],
    },

    /* -- the surplus (E11, 0.34.0 slice 2) -------------------------------- */

    {
      id: 'payroll',
      npc_line: 'I exported Bramble\'s payslip pack an hour ago, went to '
        + 'lunch, and now the portal is asking me to pick a file and the '
        + 'folder is empty. BACS closes at two. After that forty-two people '
        + 'get paid on Thursday instead of Wednesday. I am about to run the '
        + 'whole payroll again.',
      options: [
        {
          label: 'Ask how long re-running the payroll would take her',
          next: 'payroll-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Go looking for the pack she says she already made',
          effects: [
            {
              reveal: 'The pack is not lost. The payroll software\'s export '
                + 'dialog opens where it last read a file from, so it went '
                + 'into WINDOWS\\TEMP, and the portal\'s upload page opens in '
                + 'My Documents - two defaults that have never agreed. It is '
                + 'there, dated an hour ago, with the client and the period in '
                + 'the first line of it, which is worth reading before moving '
                + 'anything.',
            },
          ],
        },
        { label: 'Tell her not to touch the payroll yet' },
      ],
    },
    {
      id: 'payroll-q',
      npc_line: 'Fifty minutes if nothing goes wrong, and something always '
        + 'goes wrong. I have got eighty. You can see why I am not calm.',
      options: [{ label: 'Put the pack where the upload page opens' }],
    },
    {
      id: 'payroll-done',
      npc_line: 'Submitted at ten to two. I have written down where that '
        + 'dialog puts things. In pen. On the monitor.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'mapped-drives',
      npc_line: 'Every mapped drive has gone off my machine at once - S:, the '
        + 'scans folder, all of them. I did ask around before ringing: '
        + 'everybody else is working normally.',
      options: [
        {
          label: 'Ask whether she can reach the server any other way',
          next: 'mapped-drives-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the file-sharing services on her own machine',
          effects: [
            {
              reveal: 'The Workstation service on HOLL-WS-01 has wedged. It is '
                + 'the SMB client - the half of file sharing that does the '
                + 'asking - so every mapping on that one machine stops '
                + 'resolving while the server and everybody else\'s desk carry '
                + 'on perfectly. One desk is the client; the whole office is '
                + 'the server.',
            },
          ],
        },
        { label: 'Tell her you are looking at her box' },
      ],
    },
    {
      id: 'mapped-drives-q',
      npc_line: 'I can get into the practice suite, and that lives on the same '
        + 'server, so it is not as if the thing is switched off.',
      options: [{ label: 'Restart the client service on her machine' }],
    },
    {
      id: 'mapped-drives-done',
      npc_line: 'All back. I did not have to log out and in, which I had '
        + 'braced myself for.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'switched-off',
      npc_line: 'I cannot get in and I would like unlocking, please, quickly - '
        + 'the whole practice\'s post arrives in a mailbox I am the only one '
        + 'who opens. Gordon signed in fine, so it is not the server.',
      options: [
        {
          label: 'Ask what the screen actually says when she tries',
          next: 'switched-off-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the state on her account before touching it',
          effects: [
            {
              reveal: 'She is not locked out. The account is DISABLED - '
                + 'switched off on purpose, which is a different fault with a '
                + 'different fix and one an unlock does nothing whatever '
                + 'about. The somebody who switched it off is the monthly '
                + 'leavers spreadsheet: it carries a row for a P Mehta who '
                + 'left the practice they merged with in the spring.',
            },
          ],
        },
        { label: 'Tell her you are reading her account now' },
      ],
    },
    {
      id: 'switched-off-q',
      npc_line: 'It says my account is not available and to contact my '
        + 'administrator, which I took to be a rude way of saying locked. Is '
        + 'it not the same thing?',
      options: [{ label: 'Put the account back, and write down why it went' }],
    },
    {
      id: 'switched-off-done',
      npc_line: 'Back in. And I have found the row with the other P Mehta on '
        + 'it - she left Ashcombe in April. I have crossed her out in a way I '
        + 'hope is permanent.',
      options: [{ label: 'Log the fix' }],
    },
  ],
};

/* -- ARDEN-MFG: co-managed, coordinate-then-act (0.11.0) ------------------- */

const DEV: DialogueTree = {
  id: 'dialogue/msp-dev',
  speaker: MSP_IDS.ardenContact,
  tickets: [
    'ticket:arden-lockout-handback',
    'ticket:arden-portal-afterhours',
    // The edge replacement (E10, 0.29.0). Dev is the counterpart on all of it -
    // the co-managed contract is the reason a project on their estate is a
    // conversation rather than a work order - so the four phase tasks, the
    // delivery row and the two tickets a missed rule raises all speak with his
    // voice. The tasks hide no cause, which is what makes them planned work:
    // nothing is broken, so there is nothing to be wrong about. The two screams
    // do, and it is the same cause twice, said by two different parts of a
    // factory.
    'ticket:arden-fw-project',
    'ticket:arden-fw-audit',
    'ticket:arden-fw-staging',
    'ticket:arden-fw-cutover',
    'ticket:arden-fw-handover',
    'ticket:arden-fw-scream-brenmark',
    'ticket:arden-fw-scream-scanners',
    // The surplus (E11, 0.34.0 slice 2), and it is the co-managed split twice:
    // the user work that is theirs however convenient it would be to take it,
    // and the server work that is the MSP's and still cannot happen unannounced.
    'ticket:msp-pool-arden-reset-handback',
    'ticket:msp-pool-arden-server-service',
  ],
  root: 'handback',
  roots: {
    'ticket:arden-lockout-handback': 'handback',
    'ticket:arden-portal-afterhours': 'portal',
    'ticket:msp-pool-arden-reset-handback': 'reset-handback',
    'ticket:msp-pool-arden-server-service': 'drawings',
    'ticket:arden-fw-project': 'edge-project',
    'ticket:arden-fw-audit': 'edge-audit',
    'ticket:arden-fw-staging': 'edge-staging',
    'ticket:arden-fw-cutover': 'edge-cutover',
    'ticket:arden-fw-handover': 'edge-handover',
    'ticket:arden-fw-scream-brenmark': 'edge-brenmark',
    'ticket:arden-fw-scream-scanners': 'edge-scanners',
  },
  resolved_roots: {
    'ticket:arden-lockout-handback': 'handback-done',
    'ticket:arden-portal-afterhours': 'portal-done',
    'ticket:msp-pool-arden-reset-handback': 'reset-handback-done',
    'ticket:msp-pool-arden-server-service': 'drawings-done',
    'ticket:arden-fw-project': 'edge-project-done',
    'ticket:arden-fw-audit': 'edge-audit-done',
    'ticket:arden-fw-staging': 'edge-staging-done',
    'ticket:arden-fw-cutover': 'edge-cutover-done',
    'ticket:arden-fw-handover': 'edge-handover-done',
    'ticket:arden-fw-scream-brenmark': 'edge-brenmark-done',
    'ticket:arden-fw-scream-scanners': 'edge-scanners-done',
  },
  nodes: [
    {
      id: 'handback',
      npc_line: 'Marika on the floor mailed your alias by mistake - she is locked '
        + 'out and cannot log in. I am forwarding it on. Can you reset her, or is '
        + 'this one of the ones that is really ours?',
      options: [
        {
          label: 'Ask whose desk daytime user resets sit with on this account',
          next: 'handback-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check the RACI split on day-to-day user support',
          effects: [
            {
              reveal: 'A daytime user lockout is Arden\'s own helpdesk\'s under the '
                + 'co-managed split - the MSP has the servers, the after-hours and '
                + 'the specialist work, their team has the users. The correct move '
                + 'is to hand it back, not to double-handle it.',
            },
          ],
        },
        { label: 'Tell him you will route it to the right desk' },
      ],
    },
    {
      id: 'handback-q',
      npc_line: 'Day-to-day users are my team, yes - I know that. It is half past '
        + 'four and I was hoping you would just take it. But you are right, it is '
        + 'ours.',
      options: [{ label: 'Hand it back to their helpdesk' }],
    },
    {
      id: 'handback-done',
      npc_line: 'Fair enough - my desk has her. Cleaner that way, honestly; last '
        + 'time we both reset someone and locked each other straight back out.',
      options: [{ label: 'Log the handoff' }],
    },
    {
      id: 'portal',
      npc_line: 'The shop-floor scheduling portal is down for the night shift - '
        + 'the IIS box, ARDEN-SRV-01 - and my lot have all gone home. That server '
        + 'is your side after hours. Can you get it back up?',
      options: [
        {
          label: 'Ask whether their IT is around to coordinate with tonight',
          next: 'portal-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check what the co-managed contract asks before touching it',
          effects: [
            {
              reveal: 'The Web Publishing service on ARDEN-SRV-01 has wedged and '
                + 'taken the portal with it. It is the MSP\'s to fix after hours - '
                + 'but co-managed, so notify their IT first ("notify <service>") '
                + 'and then restart, rather than acting on their box unannounced.',
            },
          ],
        },
        { label: 'Tell him you will get on it, coordinated' },
      ],
    },
    {
      id: 'portal-q',
      npc_line: 'I am the only one still reachable, and I am telling you now - so '
        + 'consider us notified. Log it your end too, so nobody trips over anyone '
        + 'on that server.',
      options: [{ label: 'Notify their IT, then restart the portal service' }],
    },
    {
      id: 'portal-done',
      npc_line: 'Portal is back - the night shift can schedule again. Thanks for '
        + 'flagging it to me first; that is the bit the last outfit never did.',
      options: [{ label: 'Log the fix' }],
    },

    /* -- the edge replacement (E10, 0.29.0) ------------------------------- */

    {
      id: 'edge-project',
      npc_line: 'So - the firewall. ARD-FW-01 went end-of-support in the spring '
        + 'and the replacement has been in the cabinet since July, which is '
        + 'entirely my fault. Three days, you said. What do you need from us?',
      options: [
        {
          label: 'Ask what the plant cannot afford to have down, and when',
          next: 'edge-project-q',
          effects: [{ asks: true }],
        },
        { label: 'Walk him through the four tasks and the window' },
      ],
    },
    {
      id: 'edge-project-q',
      npc_line: 'The press line and goods-in. Everything else can blink. The line '
        + 'runs to six, so anything you do to the edge happens after that or in a '
        + 'window I have signed - and I will sign one, just ask.',
      options: [{ label: 'Book it round the line' }],
    },
    {
      id: 'edge-project-done',
      npc_line: 'That is the first project on this account that finished in the '
        + 'week it said it would. I have told the plant manager, who did not know '
        + 'there was a firewall, which I think is the highest praise available.',
      options: [{ label: 'Close the project' }],
    },
    {
      id: 'edge-audit',
      npc_line: 'Here is the pack the contractor left when he did the install. '
        + 'Four rules on one page. I will be honest with you, I have never opened '
        + 'it before today.',
      options: [
        {
          label: 'Ask when it was last revised, and by whom',
          next: 'edge-audit-q',
          effects: [{ asks: true }],
        },
        { label: 'Take the pack and get started' },
      ],
    },
    {
      id: 'edge-audit-q',
      npc_line: '2019, and by him, and he has not been near the place since. '
        + 'Whether anything has changed on that box since 2019 is a question I '
        + 'genuinely cannot answer. You have the login; I would rather you looked.',
      options: [{ label: 'Read the box rather than the paperwork' }],
    },
    {
      id: 'edge-audit-done',
      npc_line: 'Right - so that is what it is doing. It is oddly reassuring to '
        + 'have a list that came off the actual machine.',
      options: [{ label: 'Log the audit' }],
    },
    {
      id: 'edge-staging',
      npc_line: 'The new box is racked and powered and doing absolutely nothing, '
        + 'which I gather is correct. How long to build it up?',
      options: [
        {
          label: 'Ask whether anything on the edge changed since the pack',
          next: 'edge-staging-q',
          effects: [{ asks: true }],
        },
        { label: 'Start carrying the rules over' },
      ],
    },
    {
      id: 'edge-staging-q',
      npc_line: 'Not that I know of. Although "not that I know of" is doing a lot '
        + 'of work in that sentence - people have rung the contractor directly '
        + 'over the years and I only heard about it afterwards.',
      options: [{ label: 'Carry over whatever the audit actually found' }],
    },
    {
      id: 'edge-staging-done',
      npc_line: 'So it is a copy of the old one, on hardware that is still '
        + 'supported. That is all I wanted.',
      options: [{ label: 'Log the build' }],
    },
    {
      id: 'edge-cutover',
      npc_line: 'You want to move the circuit. I can sign that off - raise the '
        + 'change and I will approve it - but tell me straight: how long is the '
        + 'site dark, and what happens if it does not come up?',
      options: [
        {
          label: 'Ask who makes the call to go back if it does not hold',
          next: 'edge-cutover-q',
          effects: [{ asks: true }],
        },
        { label: 'File the change and wait for the window' },
      ],
    },
    {
      id: 'edge-cutover-q',
      npc_line: 'Me. I make that call, and I will make it fast - I would rather '
        + 'be back on the old box in five minutes than clever for an hour. Leave '
        + 'it in the rack until we are sure.',
      options: [{ label: 'Agree the trigger, and leave ARD-FW-01 racked' }],
    },
    {
      id: 'edge-cutover-done',
      npc_line: 'Two minutes and the phones came back. Nobody on the floor '
        + 'noticed, which is the correct amount of noticing.',
      options: [{ label: 'Log the cutover' }],
    },
    {
      id: 'edge-handover',
      npc_line: 'Are we done? I only ask because the last outfit said "done" and '
        + 'what we got was a box and no paperwork, which is how we ended up here.',
      options: [
        {
          label: 'Ask what he needs on file for the next person who touches it',
          next: 'edge-handover-q',
          effects: [{ asks: true }],
        },
        { label: 'Record the as-built and hand it over' },
      ],
    },
    {
      id: 'edge-handover-q',
      npc_line: 'What is actually on it. Not what we meant to put on it - what is '
        + 'on it, this week, read off the machine. If somebody has to do this '
        + 'again in six years I would like them to start further along than we '
        + 'did.',
      options: [{ label: 'Write the as-built off the new box' }],
    },
    {
      id: 'edge-handover-done',
      npc_line: 'Filed, and I have put a copy where I will find it. Pleasure '
        + 'doing business - genuinely, and I do not say that to suppliers.',
      options: [{ label: 'Sign it off' }],
    },
    {
      id: 'edge-brenmark',
      npc_line: 'Brenmark rang the plant manager, not me. Their engineers cannot '
        + 'get into the press line to read the fault codes and the line is on a '
        + 'manual reset every twenty minutes. It worked on Tuesday.',
      options: [
        {
          label: 'Ask what Brenmark connect to, and how long they have had it',
          next: 'edge-brenmark-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Compare the old edge\'s rule set against the new one',
          effects: [
            {
              reveal: 'There is a tunnel on ARD-FW-01 - vpn-brenmark, IPsec, put '
                + 'in when the line was commissioned - that is not on ARD-FW-02. '
                + 'It is not in the handover pack either, which is why an audit '
                + 'that read the pack never saw it. Carry it over and the line '
                + 'comes back.',
            },
          ],
        },
        { label: 'Tell him you are on it' },
      ],
    },
    {
      id: 'edge-brenmark-q',
      npc_line: 'A tunnel of some sort, straight to the press controller. Since '
        + '2019. The man who agreed it left the year after and I could not tell '
        + 'you where it is written down, if it ever was.',
      options: [{ label: 'Go and look at what the old box was carrying' }],
    },
    {
      id: 'edge-brenmark-done',
      npc_line: 'They are in, and the line is off manual. I am not going to '
        + 'pretend I enjoyed the phone call, but you had it back inside the hour.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'edge-scanners',
      npc_line: 'Goods-in have been scanning all morning and nothing is landing '
        + 'in the system. There is a pallet queue out to the yard and the yard is '
        + 'in the rain.',
      options: [
        {
          label: 'Ask how the scanners get their data back into the system',
          next: 'edge-scanners-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Compare the old edge\'s rule set against the new one',
          effects: [
            {
              reveal: 'The scanners talk to a hosted service that calls BACK in '
                + 'on 5601 - nat-scanners on ARD-FW-01, opened for a trial in the '
                + 'spring and never removed, because by then it was load-bearing. '
                + 'It is not on the new box and it is not in the pack.',
            },
          ],
        },
        { label: 'Tell him you are on it' },
      ],
    },
    {
      id: 'edge-scanners-q',
      npc_line: 'They go out to some hosted thing and it comes back in. That is '
        + 'the whole of what I know - it was set up as a trial and then we just '
        + 'kept using it, the way everything here happens.',
      options: [{ label: 'Go and look at what the old box was carrying' }],
    },
    {
      id: 'edge-scanners-done',
      npc_line: 'Stock is going in again and the yard has stopped ringing me. '
        + 'Two of those in one morning, mind. Both from before my time, both '
        + 'undocumented - I am starting to see the pattern.',
      options: [{ label: 'Log the fix' }],
    },

    /* -- the surplus (E11, 0.34.0 slice 2) -------------------------------- */

    {
      id: 'reset-handback',
      npc_line: 'Marika\'s password has run out and she has mailed your alias '
        + 'again - it is the address sitting in her sent items from last time. '
        + 'I am forwarding it on the off-chance. Can you just do it while you '
        + 'are in there?',
      options: [
        {
          label: 'Ask whose desk an expired password sits with on this account',
          next: 'reset-handback-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read her account state, then read the RACI',
          effects: [
            {
              reveal: 'Her password has expired - a policy clock running out '
                + 'on the credential rather than a door anybody shut - and '
                + 'under the co-managed RACI day-to-day user work is Arden\'s '
                + 'own helpdesk\'s. Taking it from here is two desks on one '
                + 'account an hour apart, and neither knowing the other did.',
            },
          ],
        },
        { label: 'Tell him you will put it where it belongs' },
      ],
    },
    {
      id: 'reset-handback-q',
      npc_line: 'Mine. I know it is mine. I am on a line changeover and I was '
        + 'hoping you would not notice, and you have, and fair enough.',
      options: [{ label: 'Route it back to his helpdesk' }],
    },
    {
      id: 'reset-handback-done',
      npc_line: 'My lot have done it and she is back on the terminal. I have '
        + 'also put your alias in a rule that bounces her straight to us, which '
        + 'should stop the next one.',
      options: [{ label: 'Log the handoff' }],
    },
    {
      id: 'drawings',
      npc_line: 'Nobody on the floor can open the drawings share on '
        + 'ARDEN-SRV-01. The machinists are working off a printed set from '
        + 'March, which is a quality problem waiting to be a safety one. My '
        + 'people are all on the changeover. That server is your side.',
      options: [
        {
          label: 'Ask whether the portal on the same box is still up',
          next: 'drawings-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the file-sharing services on ARDEN-SRV-01',
          effects: [
            {
              reveal: 'The Server service on ARDEN-SRV-01 has wedged - the '
                + 'part that publishes the box\'s shares - so the machine is '
                + 'up and answering and handing out no files, which is exactly '
                + 'why the portal on it is fine and the drawings are not. It '
                + 'is a server, so it is the MSP\'s under the split, and it is '
                + 'a shared box, so nothing happens on it unannounced.',
            },
          ],
        },
        { label: 'Tell him you will pick it up, coordinated' },
      ],
    },
    {
      id: 'drawings-q',
      npc_line: 'The portal is fine - people are booking on it right now. That '
        + 'is what made me think it was not the machine.',
      options: [
        { label: 'Notify their IT, then restart the file-sharing service' },
      ],
    },
    {
      id: 'drawings-done',
      npc_line: 'Drawings are back and the floor has put the paper down. '
        + 'Thanks for telling me first - two of mine were logged into that box '
        + 'looking for the same thing.',
      options: [{ label: 'Log the fix' }],
    },
  ],
};

/**
 * Glenda at TILLMAN-FREIGHT, the customer that signs mid-week (0.13.0). She is
 * right about her own morning - the office runs, the screen is green - and wrong
 * about the one thing onboarding exists to find. The `reveal` is the horror read
 * off the estate: a backup that reports success and restores nothing. Her tree
 * only exists once the onboarding event has stood her company up.
 */
const GLENDA: DialogueTree = {
  id: 'dialogue/msp-glenda',
  speaker: MSP_IDS.tillmanContact,
  tickets: ['ticket:tillman-backup-discovery'],
  root: 'backup',
  roots: {
    'ticket:tillman-backup-discovery': 'backup',
  },
  resolved_roots: {
    'ticket:tillman-backup-discovery': 'backup-done',
  },
  nodes: [
    {
      id: 'backup',
      npc_line: 'Welcome aboard, I suppose - the chap who set our computers up '
        + 'years ago is long gone, so you are it now. It all works fine as far as '
        + 'I can see. He did say the backups run every night, if that helps.',
      options: [
        {
          label: 'Ask whether anyone has ever restored from one of those backups',
          next: 'backup-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Audit the estate and read the backup on TILL-SRV-01',
          effects: [
            {
              reveal: 'The backup service is RUNNING and reports success every '
                + 'night - green on any screen that reads status - but it has not '
                + 'produced a verified restore point since last November. It is '
                + 'configured, green, and empty: monitoring the job was never '
                + 'testing the restore. Raise it before the estate goes live.',
            },
          ],
        },
        { label: 'Tell her you will take a proper look at it' },
      ],
    },
    {
      id: 'backup-q',
      npc_line: 'Restored? No - why would we, nothing has ever gone wrong. That '
        + 'is rather the point of a backup, isn\'t it, that you never need it.',
      options: [{ label: 'Raise the finding on the onboarding plan' }],
    },
    {
      id: 'backup-done',
      npc_line: 'Flagged, then. I did not know a backup could just quietly not '
        + 'work - glad you looked. Better we find it now than the day we need it.',
      options: [{ label: 'Log the escalation' }],
    },
  ],
};

/**
 * Grace at ELMWOOD-DENTAL, the fully-managed dental practice (0.14.0). She files
 * three very different things on behalf of the surgery - a chair-side emergency,
 * an integration that broke over a weekend, and a compliance request - and is
 * right about each as she experiences it. The `reveal` on each is the cause read
 * plainly: a USB sensor off the bus, a bridge a PMS update moved the interface
 * under, and an audit trail that is a read rather than a repair. Each fault opens
 * on its own line, each carries an `asks` so the SLA can be parked honestly, and
 * each reacts to its own fix.
 */
const GRACE: DialogueTree = {
  id: 'dialogue/msp-grace',
  speaker: MSP_IDS.elmwoodContact,
  tickets: [
    'ticket:elmwood-xray-sensor',
    'ticket:elmwood-imaging-bridge',
    'ticket:elmwood-hipaa-audit',
    // The surplus (E11, 0.34.0 slice 2): the most ordinary ticket in the game,
    // and the nastiest shape a fault can take - one whose symptom is an absence.
    'ticket:msp-pool-elmwood-reception-spooler',
    'ticket:msp-pool-elmwood-task-scheduler',
  ],
  root: 'sensor',
  roots: {
    'ticket:elmwood-xray-sensor': 'sensor',
    'ticket:elmwood-imaging-bridge': 'bridge',
    'ticket:elmwood-hipaa-audit': 'hipaa',
    'ticket:msp-pool-elmwood-reception-spooler': 'reception-print',
    'ticket:msp-pool-elmwood-task-scheduler': 'recalls',
  },
  resolved_roots: {
    'ticket:elmwood-xray-sensor': 'sensor-done',
    'ticket:elmwood-imaging-bridge': 'bridge-done',
    'ticket:elmwood-hipaa-audit': 'hipaa-done',
    'ticket:msp-pool-elmwood-reception-spooler': 'reception-print-done',
    'ticket:msp-pool-elmwood-task-scheduler': 'recalls-done',
  },
  nodes: [
    {
      id: 'sensor',
      npc_line: 'The X-ray sensor on the chair-side machine has just stopped - '
        + 'the software says no sensor is connected and the dentist cannot take '
        + 'the picture. There is a patient in the chair right now with their mouth '
        + 'open, so if there is anything quick, now would be the time.',
      options: [
        {
          label: 'Ask whether the sensor or its cable was moved before it dropped',
          next: 'sensor-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check what "not detected" means on an intraoral sensor',
          effects: [
            {
              reveal: 'A sensor that reports "not detected" has almost always '
                + 'dropped off the USB bus - a connector worked loose or the '
                + 'interface stopped enumerating. Re-seating the USB connection '
                + 'brings it back and the imaging software finds it again; nothing '
                + 'on the PC or in the patient database is wrong.',
            },
          ],
        },
        { label: 'Tell her you will reseat it right now' },
      ],
    },
    {
      id: 'sensor-q',
      npc_line: 'The nurse did tidy the cables round the back this morning, now '
        + 'you mention it - so it could have been nudged. Whatever it takes, there '
        + 'is a patient waiting.',
      options: [{ label: 'Reseat the USB sensor on the operatory PC' }],
    },
    {
      id: 'sensor-done',
      npc_line: 'It is back - the dentist has the image. Thank you, that was '
        + 'genuinely holding up the appointment. I will tell the nurse to leave '
        + 'the cables where they are.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'bridge',
      npc_line: 'Ever since the practice software updated over the weekend, the '
        + 'X-rays we take do not save to the patient\'s chart - the picture is '
        + 'captured and then it just is not there. The imaging bridge on the '
        + 'server is running; someone here tried restarting it and it made no '
        + 'difference.',
      options: [
        {
          label: 'Ask exactly which update went on and when it was last working',
          next: 'bridge-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check why a restart of a running bridge changes nothing',
          effects: [
            {
              reveal: 'The Dentrix update moved the interface the DEXIS bridge '
                + 'writes through, so a capture succeeds and the bridge can no '
                + 'longer hand it to the chart. Restarting just reloads the same '
                + 'version-mismatched integration - it is the vendor\'s to '
                + 'reconcile the bridge to the new PMS version, and it wants '
                + 'raising with the update details.',
            },
          ],
        },
        { label: 'Tell her you will raise it with the imaging vendor' },
      ],
    },
    {
      id: 'bridge-q',
      npc_line: 'It was the Dentrix update - it ran itself on Saturday night. It '
        + 'was saving images fine on Friday. Can you not just fix it your end?',
      options: [{ label: 'Escalate it to the imaging vendor with the update details' }],
    },
    {
      id: 'bridge-done',
      npc_line: 'Raised, then - I understand it is theirs to sort. As long as '
        + 'somebody is on it; we are writing the X-rays down on paper until then, '
        + 'which is nobody\'s idea of a good afternoon.',
      options: [{ label: 'Log the escalation' }],
    },
    {
      id: 'hipaa',
      npc_line: 'One of our patients has asked us who has looked at their record '
        + 'in the last month - they are entitled to know. It is all logged in the '
        + 'system, I just do not know how to get it out, and I need to give them a '
        + 'straight answer.',
      options: [
        {
          label: 'Ask the patient and the date range the accounting has to cover',
          next: 'hipaa-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check where a chart-access record is kept',
          effects: [
            {
              reveal: 'The practice management system keeps an audit trail as a '
                + 'matter of course - every chart open logged with who and when. '
                + 'This is a read and a report, not a repair: run the audit report '
                + 'for that patient and date range and hand the accounting back. '
                + 'Nothing needs changing on the estate.',
            },
          ],
        },
        {
          // The reply IS the fix here - the deliverable is the accounting,
          // given - so this option dispatches it rather than promising it.
          // Until 0.32.0 it only promised, and the ticket could not be closed
          // by anybody: the path advertised a verb no surface offered.
          label: 'Give her the accounting off the audit trail',
          effects: [REPORT_THE_ACCESS_REVIEW],
        },
      ],
    },
    {
      id: 'hipaa-q',
      npc_line: 'It is for one patient, over the last month - I will send you the '
        + 'name. They just want to know it was only the people who should have '
        + 'seen it. Which I am sure it was, but they are entitled to the list.',
      options: [
        {
          label: 'Pull the Dentrix audit trail and report the accounting back',
          effects: [REPORT_THE_ACCESS_REVIEW],
        },
      ],
    },
    {
      id: 'hipaa-done',
      npc_line: 'That is exactly what I needed - only the dentist and me, both '
        + 'accounted for. I will pass it on. Good to know the system was watching '
        + 'all along; I will sleep better for it.',
      options: [{ label: 'Log the report' }],
    },

    /* -- the surplus (E11, 0.34.0 slice 2) -------------------------------- */

    {
      id: 'reception-print',
      npc_line: 'Nothing has printed at reception since yesterday afternoon '
        + 'and the jobs are just sitting there. Referral letters, appointment '
        + 'cards, the lot.',
      options: [
        {
          label: 'Ask whether anything comes out, or the queue only grows',
          next: 'reception-print-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the print services on the reception desktop',
          effects: [
            {
              reveal: 'The Print Spooler on ELM-WS-02 has wedged - reporting '
                + 'itself running while it neither takes a job nor lets one '
                + 'go, which is the one status a spooler earns an article for. '
                + 'It is a workstation service and there is nothing at this '
                + 'practice standing in front of it.',
            },
          ],
        },
        { label: 'Tell her you will sort the printing' },
      ],
    },
    {
      id: 'reception-print-q',
      npc_line: 'Nothing comes out at all. The printer is on, the light is '
        + 'green, it simply never hears about any of it.',
      options: [{ label: 'Restart the spooler on the reception PC' }],
    },
    {
      id: 'reception-print-done',
      npc_line: 'It has all come out at once and half of it was for yesterday. '
        + 'The bin is full and reception is happy, which is the usual trade.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'recalls',
      npc_line: 'A patient rang to ask why she never got her six-month recall. '
        + 'I looked, and the letter is not in the sent list. Then I looked at '
        + 'last week, and that is not there either. Please tell me it is the '
        + 'printer.',
      options: [
        {
          label: 'Ask what else the practice runs overnight',
          next: 'recalls-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check what has and has not run on the practice server',
          effects: [
            {
              reveal: 'It is not the printer. The Task Scheduler service on '
                + 'ELM-SRV-01 has wedged, and everything the practice does on '
                + 'a timer runs under it - the recall run, the overnight '
                + 'database job, the end-of-day export. A job that never '
                + 'starts writes no error, because nothing ran to have one, '
                + 'which is why a fortnight of them went missing in silence.',
            },
          ],
        },
        { label: 'Tell her you will find out what has run and what has not' },
      ],
    },
    {
      id: 'recalls-q',
      npc_line: 'The backup, I think, and something that sends the day\'s '
        + 'takings off somewhere. I have never had to know, which I am hearing '
        + 'as a problem while I say it.',
      options: [
        { label: 'Get the schedule going again, and tell her what it missed' },
      ],
    },
    {
      id: 'recalls-done',
      npc_line: 'Running again, and I have started the recall run by hand for '
        + 'the two weeks it swallowed. Ninety-one letters. I would rather have '
        + 'heard that from you than from another patient.',
      options: [{ label: 'Log the fix' }],
    },
  ],
};

/**
 * Morgan Okafor, Fettle & Crane's infrastructure lead (E6, Pass B).
 *
 * The one internal reporter: the incident is the MSP's OWN client portal down,
 * not a customer's, and Morgan is the engineer who owns the box and pages the
 * newly-promoted player onto it. The shape is every other tree's - a question
 * that counts as asking, the reveal that writes the cause, a neutral line - but
 * the ENDING is different: this one the player FIXES rather than escalates,
 * because it is the employer's own infra and the player is now the engineer for
 * it. The reveal names the real reason a `systemctl restart` is the fix: the
 * unit crashed once and systemd hit its start-limit and stopped retrying.
 */
/**
 * Rosa at MARLOWE-STUDIO, the fully-managed creative agency (0.32.0). She runs
 * the studio and files for whoever is stuck at a desk, so she is right about
 * three symptoms and reaching for the wrong cause on all three - which is the
 * shape of every Mac ticket a Windows-shaped desk gets: "surely you can switch
 * that on from your end" (you cannot, it is a consent), "surely that means it
 * is a virus" (it means nobody checked it), and "surely the machine has lost
 * its licence" (the licence was never on the machine).
 *
 * The `reveal` on each is the cause said plainly, each has an `asks` so the
 * clock can be parked honestly, and each has its own reaction afterwards.
 */
const ROSA: DialogueTree = {
  id: 'dialogue/msp-rosa',
  speaker: MSP_IDS.marloweContact,
  tickets: [
    'ticket:marlowe-screen-recording',
    'ticket:marlowe-gatekeeper-plugin',
    'ticket:marlowe-seat-expired',
    // The surplus (E11, 0.34.0 slice 2), and it keeps the vertical's shape: two
    // of the three are things Rosa is blaming a Mac for and one of them is not
    // a fault at all, it is a bill.
    'ticket:msp-pool-marlowe-share-access',
    'ticket:msp-pool-marlowe-password-expired',
    'ticket:msp-pool-marlowe-nas-capacity',
  ],
  root: 'screen',
  roots: {
    'ticket:marlowe-screen-recording': 'screen',
    'ticket:marlowe-gatekeeper-plugin': 'plugin',
    'ticket:marlowe-seat-expired': 'seat',
    'ticket:msp-pool-marlowe-share-access': 'projects-volume',
    'ticket:msp-pool-marlowe-password-expired': 'corin-password',
    'ticket:msp-pool-marlowe-nas-capacity': 'nas-space',
  },
  resolved_roots: {
    'ticket:marlowe-screen-recording': 'screen-done',
    'ticket:marlowe-gatekeeper-plugin': 'plugin-done',
    'ticket:marlowe-seat-expired': 'seat-done',
    'ticket:msp-pool-marlowe-share-access': 'projects-volume-done',
    'ticket:msp-pool-marlowe-password-expired': 'corin-password-done',
    'ticket:msp-pool-marlowe-nas-capacity': 'nas-space-done',
  },
  nodes: [
    {
      id: 'screen',
      npc_line: 'Whatever you are doing to look at Corin\'s Mac, it is not '
        + 'working - he can see that somebody has joined, and you are apparently '
        + 'looking at a black square. He is describing a colour problem down the '
        + 'phone at me instead, which is going about as well as you would '
        + 'imagine. His Mac is on your management thing, so can you not just '
        + 'switch the screen on from your end?',
      options: [
        {
          label: 'Ask whether he has been asked to allow anything since the '
            + 'tool was installed',
          next: 'screen-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check why a connected Mac session shows nothing',
          effects: [
            {
              reveal: 'macOS puts screen capture behind a consent only the '
                + 'person logged in at that Mac can give - Privacy & Security > '
                + 'Screen Recording, per application - so a support tool without '
                + 'it connects normally and is handed a blank frame. Device '
                + 'management cannot grant it: a profile can pre-approve '
                + 'Accessibility for the same tool, and Apple keeps Screen '
                + 'Recording for the user\'s own click. The fix is to talk him '
                + 'through it.',
            },
          ],
        },
        {
          label: 'Write him the two lines: Privacy & Security, Screen '
            + 'Recording, tick it, reopen',
          effects: [WALK_THROUGH_THE_GRANT],
        },
      ],
    },
    {
      id: 'screen-q',
      npc_line: 'There was a box, he says, when the tool first went on. He '
        + 'thinks he clicked whichever one made it go away, because he was in '
        + 'the middle of something. Is that the whole of it?',
      options: [
        {
          label: 'Send him the steps and say why we cannot do it from here',
          effects: [WALK_THROUGH_THE_GRANT],
        },
      ],
    },
    {
      id: 'screen-done',
      npc_line: 'He has ticked it and you are in - he says it came up the second '
        + 'the tool reopened. I did not know there were things we had to allow '
        + 'and you could not. Good to know it is us and not you being awkward.',
      options: [{ label: 'Log the walkthrough' }],
    },
    {
      id: 'plugin',
      npc_line: 'The edit Mac will not open the plugin the whole job is built '
        + 'on. It says - I wrote it down - "Chroma Bloom cannot be opened '
        + 'because the developer cannot be verified. macOS cannot verify that '
        + 'this app is free from malware." Half the room thinks we have been '
        + 'sent a virus and the other half wants to turn the security off. We '
        + 'deliver today.',
      options: [
        {
          label: 'Ask where the plugin came from and whether it is the usual '
            + 'supplier',
          next: 'plugin-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check what "the developer cannot be verified" actually claims',
          effects: [
            {
              reveal: 'That is Gatekeeper saying the build has not been '
                + 'NOTARIZED - never submitted to Apple\'s malware scan and '
                + 'stamped - which is "nobody has checked this", not "this is '
                + 'malware". Plugins and small tools frequently are not. macOS '
                + 'ships the override for exactly this: open it from Finder\'s '
                + 'context menu and confirm, or allow it in Privacy & Security '
                + 'after the refusal. Turning Gatekeeper off for the machine to '
                + 'open one file is the wrong trade.',
            },
          ],
        },
        {
          label: 'Write back with what it means and the supported way to open '
            + 'it',
          effects: [EXPLAIN_THE_REFUSAL],
        },
      ],
    },
    {
      id: 'plugin-q',
      npc_line: 'It is from the freelancer who built the effect - we have used '
        + 'his work for two years and he sent it the way he always does. So it '
        + 'is not a virus, it is just... unsigned, or something?',
      options: [
        {
          label: 'Explain notarization and give her the right-click Open path',
          effects: [EXPLAIN_THE_REFUSAL],
        },
      ],
    },
    {
      id: 'plugin-done',
      npc_line: 'Open, running, and rendering. I have told the room nobody is '
        + 'switching anything off, and I have asked him to do the notarizing '
        + 'thing on the next one so we are not doing this on every machine.',
      options: [{ label: 'Log the answer' }],
    },
    {
      id: 'seat',
      npc_line: 'Luca cannot get into the suite this morning - it says his '
        + 'subscription is not active. He was in it on Friday, same desk, same '
        + 'files. I have signed him out and in again and I have sat him at '
        + 'another Mac, and it says exactly the same thing on that one. He is '
        + 'billing us by the hour to sit there.',
      options: [
        {
          label: 'Ask when his contract term was set up and who renewed the plan',
          next: 'seat-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check what a licence is actually attached to',
          effects: [
            {
              reveal: 'The suite is licensed NAMED USER: the seat is assigned to '
                + 'a person in the vendor\'s admin console and follows them '
                + 'between machines, which is why signing out and changing Mac '
                + 'both changed nothing. His term seat lapsed at renewal. The '
                + 'plan has no free seat and the ones it has are held by '
                + 'designers who are working, so this is a seat to be bought, '
                + 'raised with the licensing desk - not a fix on the estate.',
            },
          ],
        },
        { label: 'Tell her it is the licence and not the Macs' },
      ],
    },
    {
      id: 'seat-q',
      npc_line: 'He was set up for the two weeks we booked him for, and this is '
        + 'week three - we kept him on. The renewal went through at the start of '
        + 'the month; I assumed it just covered everybody. Can you not move a '
        + 'spare one over?',
      options: [
        { label: 'Explain there is no spare, and raise it with the licensing '
            + 'desk' },
      ],
    },
    {
      id: 'seat-done',
      npc_line: 'Raised, and I will chase the seat at our end - I take the point '
        + 'about not pulling one off Corin to do it. I had genuinely thought a '
        + 'licence lived on the machine. That explains the last two of these as '
        + 'well.',
      options: [{ label: 'Log the escalation' }],
    },

    /* -- the surplus (E11, 0.34.0 slice 2) -------------------------------- */

    {
      id: 'projects-volume',
      npc_line: 'Luca can see the NAS, he signs into it, and then there is '
        + 'nothing there - the Projects volume everybody else mounts is simply '
        + 'not in his list. I have restarted the Mac, I have sat him at '
        + 'another desk, and I am about to ask whether the thing needs '
        + 'reinstalling. Why does the same machine work for Corin and not for '
        + 'him?',
      options: [
        {
          label: 'Ask whether the sign-in itself works or refuses him',
          next: 'projects-volume-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Compare who can open that volume against who cannot',
          effects: [
            {
              reveal: 'A server hands a client the list of shares that client '
                + 'is entitled to see, so a volume somebody has no rights to '
                + 'is not refused - it is absent, and from the Finder that '
                + 'looks exactly like a share that has been deleted. He signed '
                + 'in, which proves the Mac, the network and the account are '
                + 'all fine; he was set up as a freelancer and the Projects '
                + 'volume was never on the list somebody worked through.',
            },
          ],
        },
        { label: 'Tell her to leave the Mac alone for a minute' },
      ],
    },
    {
      id: 'projects-volume-q',
      npc_line: 'It takes his password first time, every time. That is why I '
        + 'stopped blaming the password and started blaming the Mac.',
      options: [{ label: 'Put his account on the volume\'s list' }],
    },
    {
      id: 'projects-volume-done',
      npc_line: 'It is there and he has mounted it. I have apologised to the '
        + 'Mac. I did not know an empty list was a permission - I assumed we '
        + 'would get told off rather than shown nothing.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'corin-password',
      npc_line: 'Corin\'s password has stopped working on his own Mac. He has '
        + 'not changed it - I have watched him type it, it is the same one he '
        + 'has had since I met him, which is its own conversation.',
      options: [
        {
          label: 'Ask when he last changed it',
          next: 'corin-password-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read which of the three states his account is in',
          effects: [
            {
              reveal: 'His password has expired. The account itself is '
                + 'completely healthy and the credential is out of date, which '
                + 'is the third face a login box wears and the only one where '
                + 'nothing has been shut and nothing has been switched off - '
                + 'so a Mac says the password is wrong, because from where the '
                + 'Mac is standing it is.',
            },
          ],
        },
        { label: 'Tell her you will get him back in' },
      ],
    },
    {
      id: 'corin-password-q',
      npc_line: 'He genuinely cannot remember, which I suspect is the answer '
        + 'to your question.',
      options: [{ label: 'Issue him a new password' }],
    },
    {
      id: 'corin-password-done',
      npc_line: 'He is in, and he has been made to choose a new one, which he '
        + 'did with the enthusiasm you would expect. I have not asked what it '
        + 'is and I am not going to.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'nas-space',
      npc_line: 'The NAS has started warning about space and I wondered '
        + 'whether somebody could clear the old stuff off it. There is a shoot '
        + 'next week - three days - and the producer says it will land about '
        + 'four terabytes.',
      options: [
        {
          label: 'Ask what on that volume the studio could stand to lose',
          next: 'nas-space-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the free space, then read what is taking it',
          effects: [
            {
              reveal: 'There is no old stuff. Every job on that NAS is live or '
                + 'delivered and being held, every file on it is the only copy '
                + 'of itself, and nothing automatic has been quietly writing a '
                + 'second one - which is what makes this different from every '
                + 'other full drive on the estate. A hundred and twenty '
                + 'gigabytes against four terabytes is not a housekeeping '
                + 'problem, and no amount of looking will turn it into one.',
            },
          ],
        },
        { label: 'Tell her you will read the box before promising anything' },
      ],
    },
    {
      id: 'nas-space-q',
      npc_line: 'Nothing, when you put it like that. Delivered jobs we have to '
        + 'hold for two years and the live ones are, well, live. I was rather '
        + 'hoping you would find me some.',
      options: [
        { label: 'Put the numbers and the date to somebody who can buy disks' },
      ],
    },
    {
      id: 'nas-space-done',
      npc_line: 'Raised, and the disks are ordered for Tuesday. I had it filed '
        + 'as a tidy-up, which would have gone very badly the first time '
        + 'somebody asked for a re-cut.',
      options: [{ label: 'Log the escalation' }],
    },
  ],
};

const MORGAN: DialogueTree = {
  id: 'dialogue/msp-morgan',
  speaker: MSP_IDS.mspLead,
  // Morgan is the infra lead who raises all the engineer-tier incidents on the
  // MSP's own box - the promotion's first fix (the portal) and the characteristic
  // ones (E6, 0.19.0: the disk, the cert, the deploy). One tree because he is one
  // speaker, but each incident has its own opening line: sharing a root is a
  // person answering the phone about the wrong problem.
  tickets: [
    'ticket:syseng-first-incident',
    'ticket:syseng-disk-full',
    'ticket:syseng-cert-expiry',
    'ticket:syseng-failed-deploy',
    'ticket:syseng-permission-denied',
  ],
  root: 'portal',
  roots: {
    'ticket:syseng-first-incident': 'portal',
    'ticket:syseng-disk-full': 'disk',
    'ticket:syseng-cert-expiry': 'cert',
    'ticket:syseng-failed-deploy': 'deploy',
    'ticket:syseng-permission-denied': 'perm',
  },
  resolved_roots: {
    'ticket:syseng-first-incident': 'portal-done',
    'ticket:syseng-disk-full': 'disk-done',
    'ticket:syseng-cert-expiry': 'cert-done',
    'ticket:syseng-failed-deploy': 'deploy-done',
    'ticket:syseng-permission-denied': 'perm-done',
  },
  nodes: [
    {
      id: 'portal',
      npc_line: 'Congratulations on the move - and welcome to being on call. The '
        + 'client portal is down: FC-RMM-01, fcportal.service, customers cannot '
        + 'log in to raise anything. It is our own box, so it is ours to fix. ssh '
        + 'in and have a look?',
      options: [
        {
          label: 'Ask what the unit is actually doing',
          next: 'portal-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the journal and work out why it will not start',
          effects: [
            {
              reveal: 'fcportal.service crashed once this morning and systemd '
                + 'retried it too fast, tripped its start-limit, and gave up - so '
                + 'it is sitting failed rather than restarting itself. A '
                + 'systemctl restart clears the counter and brings it back; there '
                + 'is nothing to change, it just needs starting by hand.',
            },
          ],
        },
        { label: 'Tell him you are on it' },
      ],
    },
    {
      id: 'portal-q',
      npc_line: 'systemctl status says failed - it fell over at about quarter to '
        + 'nine and has not come back. journalctl -u fcportal will have the why. '
        + 'You have the tier for it now; the box is yours.',
      options: [{ label: 'ssh in and read the unit' }],
    },
    {
      id: 'portal-done',
      npc_line: 'It is back - customers are logging in again. First one on your '
        + 'own tier, and you brought it up clean. That is the job now. Good.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'disk',
      npc_line: 'FC-RMM-01 is out of disk - the root filesystem is at 100% and '
        + 'jobs are failing on "No space left on device". Something has been '
        + 'writing logs unbounded. Find WHAT before you delete anything.',
      options: [
        {
          label: 'Ask where to look',
          next: 'disk-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Work out what is eating the disk',
          effects: [
            {
              reveal: 'df -h shows the filesystem full; du -sh on /var/log points '
                + 'at the runaway. It will be the systemd journal - a crash-looping '
                + 'service floods it and nothing caps it. journalctl --vacuum-size '
                + 'reclaims the space.',
            },
          ],
        },
        { label: 'Tell him you are on it' },
      ],
    },
    {
      id: 'disk-q',
      npc_line: 'df -h first to confirm it, then du -sh /var/log/* to find the '
        + 'biggest thing in there. Nine times out of ten on an app box it is the '
        + 'journal. Do not just delete blindly - know what you are freeing.',
      options: [{ label: 'ssh in and run df' }],
    },
    {
      id: 'disk-done',
      npc_line: 'Space is back and the jobs are running. Worth capping that '
        + 'journal so it cannot do it again - but you stopped the fire. Good.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'cert',
      npc_line: 'The client portal is throwing certificate warnings and nobody can '
        + 'log in - but the service is UP, I have checked. This is not a crash. '
        + 'Have a look before you go restarting things.',
      options: [
        {
          label: 'Ask what he means it is not a crash',
          next: 'cert-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check the certificate',
          effects: [
            {
              reveal: 'The TLS certificate has expired. Nothing broke - it just '
                + 'reached its expiry date and browsers refuse it. curl -I shows '
                + 'it; certbot renew replaces it. It is a monitoring failure, not '
                + 'a technical one: nobody tracked the deadline.',
            },
          ],
        },
        { label: 'Tell him you are on it' },
      ],
    },
    {
      id: 'cert-q',
      npc_line: 'The service is running fine - it is the certificate that ran out. '
        + 'A cert is a deadline nobody put in the calendar. curl -I will confirm '
        + 'the expiry; certbot renew fixes it in the moment. The real fix is '
        + 'monitoring the expiry so this never surprises us again.',
      options: [{ label: 'ssh in and curl it' }],
    },
    {
      id: 'cert-done',
      npc_line: 'Portal is serving again. The service never went anywhere - it was '
        + 'the cert the whole time. Put its next expiry on a calendar, would you? '
        + 'Good work.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'deploy',
      npc_line: 'The background worker is down after this afternoon\'s release. '
        + '"It worked in staging." Roll it back and get it up - and then write the '
        + 'postmortem, because this one is not closed until it is written up.',
      options: [
        {
          label: 'Ask why the postmortem matters here',
          next: 'deploy-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Work out why it failed in prod',
          effects: [
            {
              reveal: 'journalctl shows it failing on a config key staging sets '
                + 'and production does not. Roll back and restart to stop the '
                + 'bleeding. The real gap is that staging was not a copy of prod - '
                + 'which is a system to fix, not a person to blame.',
            },
          ],
        },
        { label: 'Tell him you are on it' },
      ],
    },
    {
      id: 'deploy-q',
      npc_line: 'Because the restart stops the outage but does not stop it '
        + 'happening again. A blameless postmortem - what the SYSTEM let happen, '
        + 'never whose hand was on the deploy - is what turns a fire into a thing '
        + 'we fixed. postmortem file the unit once it is back up.',
      options: [{ label: 'ssh in and read the worker' }],
    },
    {
      id: 'deploy-done',
      npc_line: 'Worker is back and the postmortem reads clean - the system, not '
        + 'a name. That is the professional move, and it is how we stop the next '
        + 'one. Good work.',
      options: [{ label: 'Log the fix' }],
    },
    {
      id: 'perm',
      npc_line: 'Portal logins are failing - the auth service is down, and it is '
        + 'not a crash. This afternoon\'s deploy touched a file. Have a look at why '
        + 'it will not start before you go restarting it.',
      options: [
        {
          label: 'Ask what a deploy has to do with it',
          next: 'perm-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read why it will not start',
          effects: [
            {
              reveal: 'journalctl shows it dying on "Permission denied" reading '
                + '/etc/fcauth/auth.env. The deploy left the file owned root:root '
                + 'mode 600, so the fcauth service account cannot read it. ls -la '
                + 'shows it; chown root:fcauth and chmod 640 make it readable, then '
                + 'restart. Half of Linux breakage is a permission bit.',
            },
          ],
        },
        { label: 'Tell him you are on it' },
      ],
    },
    {
      id: 'perm-q',
      npc_line: 'Because the deploy re-copied the config as root-only, and a '
        + 'service that cannot read its own config will not start. Nothing crashed '
        + 'and nothing in the app is wrong - a permission bit is. ls -la the file, '
        + 'chown/chmod it so the service account can read it, then restart. A '
        + 'restart before the file is readable just fails again.',
      options: [{ label: 'ssh in and ls -la the file' }],
    },
    {
      id: 'perm-done',
      npc_line: 'Auth is back and logins are flowing. A wrong owner and a wrong '
        + 'mode, nothing more - and the fix was least privilege, the group reads '
        + 'and the world does not. Good work.',
      options: [{ label: 'Log the fix' }],
    },
  ],
};

/**
 * Esme at PENNINGTON-ACCT, the co-managed accountancy with a written RACI (E9,
 * 0.37.0). She runs the practice and she is not an IT person: what she knows is
 * that Ledgerline will not open and that forty people are sitting on their
 * hands, which is exactly as much as a practice manager should know.
 *
 * The tree is careful about one thing in particular. She never says "and you
 * are allowed to fix it" and she never says you are not, because that is not
 * hers to say and because the whole beat is that nobody will say it: the
 * question of whose box PENN-SRV-01 is belongs to a document, and the answer is
 * on the `reveal` where every other cause on this shelf lives. What she does
 * say - twice, in her own words - is that Gil will want to know, which is
 * the honest shape of the thing. The person who tells you to tell him is the
 * one who has to work with him.
 */
const ESME: DialogueTree = {
  id: 'dialogue/msp-esme',
  speaker: MSP_IDS.penningtonContact,
  tickets: ['ticket:pennington-practice-down'],
  root: 'ledgerline',
  roots: {
    'ticket:pennington-practice-down': 'ledgerline',
  },
  resolved_roots: {
    'ticket:pennington-practice-down': 'ledgerline-done',
  },
  nodes: [
    {
      id: 'ledgerline',
      npc_line: 'Ledgerline will not open. Not for me, not for the seniors, not '
        + 'for the two juniors who have been trying since half eight - it just '
        + 'sits there. Nobody can put their time in and nobody can raise a bill, '
        + 'and it is the Tuesday of a filing week.',
      options: [
        {
          label: 'Ask whether Gil knows, and whether he is reachable',
          next: 'ledgerline-callum',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the Ledgerline service on PENN-SRV-01',
          effects: [
            {
              reveal: 'The Ledgerline service on PENN-SRV-01 is stopped - the '
                + 'application is down, not the network and not anybody\'s '
                + 'password. A restart brings it back and your account will do '
                + 'it without an argument, because the MSP monitors that box '
                + 'and holds an admin login on it. What the contract says is a '
                + 'separate question: PENN-SRV-01 and the practice system on it '
                + 'are Gil\'s under the RACI, so the move is to notify their '
                + 'IT and then restart it. Nothing will stop you doing it the '
                + 'other way round.',
            },
          ],
        },
        { label: 'Tell her you are looking at it now' },
      ],
    },
    {
      id: 'ledgerline-callum',
      npc_line: 'Gil is at the Brightwater office until three and his phone '
        + 'goes to voicemail in that building - it always has. He is very good, '
        + 'and he is one man. He will see it, mind. He has that screen with the '
        + 'graphs on it and he looks at it before he takes his coat off.',
      options: [
        { label: 'Leave their IT the heads-up, then restart the service' },
      ],
    },
    {
      id: 'ledgerline-done',
      npc_line: 'It is back - people are logging their morning in now, and the '
        + 'seniors have stopped standing behind me. Thank you. I will tell '
        + 'Gil you were on it, though I dare say he will already know.',
      options: [{ label: 'Log the restart' }],
    },
  ],
};

export const MSP_TREES: readonly DialogueTree[] = [
  NADIA,
  THEO,
  IVY,
  PRIYA,
  DEV,
  GLENDA,
  GRACE,
  ROSA,
  MORGAN,
  ESME,
];
