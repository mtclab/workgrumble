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

import { MSP_IDS } from '../msp-company';
import type { DialogueTree } from './types';

const NADIA: DialogueTree = {
  id: 'dialogue/msp-nadia',
  speaker: MSP_IDS.fontaineContact,
  tickets: [
    'ticket:fontaine-matter-access',
    'ticket:fontaine-checkout-deadlock',
    'ticket:fontaine-efiling',
  ],
  root: 'matter',
  roots: {
    'ticket:fontaine-matter-access': 'matter',
    'ticket:fontaine-checkout-deadlock': 'checkout',
    'ticket:fontaine-efiling': 'efiling',
  },
  resolved_roots: {
    'ticket:fontaine-matter-access': 'matter-done',
    'ticket:fontaine-checkout-deadlock': 'checkout-done',
    'ticket:fontaine-efiling': 'efiling-done',
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
  ],
  root: 'sso',
  roots: {
    'ticket:meridian-app-assignment': 'sso',
    'ticket:meridian-offboarding': 'offboard',
    'ticket:meridian-mfa-lockout': 'mfa',
    'ticket:meridian-prod-down': 'prod',
  },
  resolved_roots: {
    'ticket:meridian-app-assignment': 'sso-done',
    'ticket:meridian-offboarding': 'offboard-done',
    'ticket:meridian-mfa-lockout': 'mfa-done',
    'ticket:meridian-prod-down': 'prod-done',
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
  ],
};

const IVY: DialogueTree = {
  id: 'dialogue/msp-ivy',
  speaker: MSP_IDS.northwindContact,
  tickets: [
    'ticket:northwind-backup-alert',
    'ticket:northwind-cert-alert',
    'ticket:northwind-disk-alert',
  ],
  root: 'backup',
  roots: {
    'ticket:northwind-backup-alert': 'backup',
    'ticket:northwind-cert-alert': 'cert',
    'ticket:northwind-disk-alert': 'disk',
  },
  resolved_roots: {
    'ticket:northwind-backup-alert': 'backup-done',
    'ticket:northwind-cert-alert': 'cert-done',
    'ticket:northwind-disk-alert': 'disk-done',
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
  ],
};

export const MSP_TREES: readonly DialogueTree[] = [NADIA, THEO, IVY];
