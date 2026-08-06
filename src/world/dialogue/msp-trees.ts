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

/* -- HOLLOWAY-ACCT: fully-managed, the whole estate in reach (0.11.0) ------- */

const PRIYA: DialogueTree = {
  id: 'dialogue/msp-priya',
  speaker: MSP_IDS.hollowayContact,
  tickets: [
    'ticket:holloway-shared-drive',
    'ticket:holloway-spooler',
    'ticket:holloway-lockout',
  ],
  root: 'drive',
  roots: {
    'ticket:holloway-shared-drive': 'drive',
    'ticket:holloway-spooler': 'spool',
    'ticket:holloway-lockout': 'lock',
  },
  resolved_roots: {
    'ticket:holloway-shared-drive': 'drive-done',
    'ticket:holloway-spooler': 'spool-done',
    'ticket:holloway-lockout': 'lock-done',
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
  ],
};

/* -- ARDEN-MFG: co-managed, coordinate-then-act (0.11.0) ------------------- */

const DEV: DialogueTree = {
  id: 'dialogue/msp-dev',
  speaker: MSP_IDS.ardenContact,
  tickets: [
    'ticket:arden-lockout-handback',
    'ticket:arden-portal-afterhours',
  ],
  root: 'handback',
  roots: {
    'ticket:arden-lockout-handback': 'handback',
    'ticket:arden-portal-afterhours': 'portal',
  },
  resolved_roots: {
    'ticket:arden-lockout-handback': 'handback-done',
    'ticket:arden-portal-afterhours': 'portal-done',
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
  ],
  root: 'sensor',
  roots: {
    'ticket:elmwood-xray-sensor': 'sensor',
    'ticket:elmwood-imaging-bridge': 'bridge',
    'ticket:elmwood-hipaa-audit': 'hipaa',
  },
  resolved_roots: {
    'ticket:elmwood-xray-sensor': 'sensor-done',
    'ticket:elmwood-imaging-bridge': 'bridge-done',
    'ticket:elmwood-hipaa-audit': 'hipaa-done',
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
        { label: 'Tell her you will pull the log and write it up' },
      ],
    },
    {
      id: 'hipaa-q',
      npc_line: 'It is for one patient, over the last month - I will send you the '
        + 'name. They just want to know it was only the people who should have '
        + 'seen it. Which I am sure it was, but they are entitled to the list.',
      options: [{ label: 'Pull the Dentrix audit trail and report the accounting back' }],
    },
    {
      id: 'hipaa-done',
      npc_line: 'That is exactly what I needed - only the dentist and me, both '
        + 'accounted for. I will pass it on. Good to know the system was watching '
        + 'all along; I will sleep better for it.',
      options: [{ label: 'Log the report' }],
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
const MORGAN: DialogueTree = {
  id: 'dialogue/msp-morgan',
  speaker: MSP_IDS.mspLead,
  tickets: ['ticket:syseng-first-incident'],
  root: 'portal',
  resolved_root: 'portal-done',
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
  MORGAN,
];
