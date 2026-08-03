/**
 * The rest of the building.
 *
 * Same house rules as the pilot conversations in `trees.ts`: the reporter
 * voices the problem as they experience it and never the cause; one option per
 * fault of their own carries the `reveal` that writes that cause onto the
 * ticket; every option that puts a QUESTION to somebody carries `asks`, and no
 * option that merely tells them something does; and the comedy is recognition
 * rather than contempt - everybody here is wrong about the cause and entirely
 * right about their own morning.
 *
 * Two of these do something the pilot six never had to. Terry's carries a
 * `summoned_root`: a message that arrives asking for a favour, with both
 * answers legitimate and one of them worth eight points on a scorecard. And
 * Facilities has no ticket at all - Vic is in the contact list because the only
 * permanent fix in this week is a piece of tape, and somebody has to hold it.
 */

import { COMPANY_IDS } from '../company';
import { HELPDESK_ACTIONS } from '../actions/ids';
import { VERIFICATION_METHODS } from '../fallout';
import { PHISH_PRAISE } from '../tickets/desk';
import type { DialogueEffect, DialogueTree } from './types';

const ACCOUNTS_PAYABLE: DialogueTree = {
  id: 'dialogue/accounts-payable',
  speaker: COMPANY_IDS.priya,
  tickets: ['ticket:mfa-reregister', 'ticket:saved-into-temp'],
  root: 'phone',
  roots: {
    'ticket:mfa-reregister': 'phone',
    'ticket:saved-into-temp': 'statement',
  },
  resolved_roots: {
    'ticket:mfa-reregister': 'after',
    'ticket:saved-into-temp': 'statement-after',
  },
  nodes: [
    {
      id: 'phone',
      npc_line: 'The code app is on the new phone. It is installed, it is '
        + 'empty, and it is extremely pleased with itself about it.',
      options: [
        {
          label: 'Ask what happened to the old phone',
          next: 'traded',
          effects: [
            { asks: true },
            {
              reveal: 'The second factor was bound to the old handset, which '
                + 'was wiped in the shop on Saturday. Nothing is broken; the '
                + 'binding is simply gone.',
            },
          ],
        },
        {
          label: 'Ask how you are meant to prove she is her',
          next: 'verify',
          effects: [{ asks: true }],
        },
        { label: 'Ask how long she has been locked out', next: 'hurry',
          effects: [{ asks: true }] },
        { label: 'Tell her you are looking at the account now' },
      ],
    },
    {
      id: 'traded',
      npc_line: 'Traded in on Saturday. They wiped it at the counter while I '
        + 'watched, which at the time felt like the responsible thing.',
      options: [
        {
          label: 'Ask how you are meant to prove she is her',
          next: 'verify',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'phone' },
        { label: 'Tell her that is the whole answer, and it is fixable' },
      ],
    },
    {
      // The node the whole lesson turns on. She offers the facts everybody
      // offers - a payroll number, a manager, a desk - and every one of them
      // is on a payslip, a company blog and a seating plan. The two options
      // that VERIFY her are the two channels the June rollout put on her
      // account before any of this happened: a number the directory can ring,
      // and a code issued in an envelope. Neither is something a caller can
      // supply, which is the entire property being taught.
      id: 'verify',
      npc_line: 'Prove it? I can give you my payroll number. 4471. My manager '
        + 'is Yolanda, my desk is under the vent that works, and I started the '
        + 'March before last. Is that enough of me?',
      options: [
        {
          label: 'Say none of that is evidence, and ask which it is to be: a '
            + 'callback, or the recovery code',
          next: 'channels',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'phone' },
      ],
    },
    {
      id: 'channels',
      npc_line: 'The payroll number is on my payslip and my manager is on the '
        + 'website, yes, all right. The envelope from June is in my drawer, '
        + 'and my desk phone works, obviously, it is the phone that does not.',
      options: [
        {
          label: 'Hang up and ring her back on the number the directory holds',
          next: 'checked',
          effects: [
            {
              action: HELPDESK_ACTIONS.accountVerifyIdentity,
              target: COMPANY_IDS.priyaAccount,
              params: { method: VERIFICATION_METHODS.callback },
            },
          ],
        },
        {
          label: 'Ask her to open the June envelope and read the recovery code',
          next: 'checked',
          effects: [
            { asks: true },
            {
              action: HELPDESK_ACTIONS.accountVerifyIdentity,
              target: COMPANY_IDS.priyaAccount,
              params: { method: VERIFICATION_METHODS.recoveryCode },
            },
          ],
        },
        {
          // Offered because it is what everybody does, and because the lesson
          // is a choice rather than a puzzle. It proves nothing and it records
          // nothing, and the enrolment below is unchecked whichever way she
          // sounded.
          label: 'Take the payroll number and the manager\'s name and move on',
          next: 'hurry',
        },
      ],
    },
    {
      id: 'checked',
      npc_line: 'Right. Yes. That is me, then, officially, which is a strange '
        + 'thing to be told by somebody who has known me for two years.',
      options: [
        {
          label: 'Enrol the new phone now that you know who she is',
          next: 'done',
          effects: [
            {
              action: HELPDESK_ACTIONS.accountRegisterMfa,
              target: COMPANY_IDS.priyaAccount,
            },
          ],
        },
        { label: 'Go back to the top', next: 'phone' },
      ],
    },
    {
      id: 'hurry',
      npc_line: 'There is a payment run at eleven and I cannot approve it. Can '
        + 'you not just do it? You know it is me. We have spoken about the '
        + 'kettle.',
      options: [
        {
          // The shortcut, offered plainly. It works. It closes the ticket. The
          // bill for it turns up in somebody else's incident report a day
          // later, which is exactly as long as it takes in life.
          label: 'Enrol the new phone now and get on with the queue',
          next: 'done',
          effects: [
            {
              action: HELPDESK_ACTIONS.accountRegisterMfa,
              target: COMPANY_IDS.priyaAccount,
            },
          ],
        },
        {
          label: 'Ask how you are meant to prove she is her',
          next: 'verify',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'phone' },
      ],
    },
    {
      id: 'done',
      npc_line: 'There is a code. There is a code and it is changing and I '
        + 'have never been so pleased to see six numbers. There is also an '
        + 'email telling me somebody re-registered my authenticator, which I '
        + 'assume is you, and which I would very much want to see if it were '
        + 'not.',
      options: [
        { label: 'Confirm it was you, and say that is exactly what it is for' },
      ],
    },
    {
      id: 'after',
      npc_line: 'It is working. I have written the recovery code on a card and '
        + 'put it somewhere safe, which is my purse, which is where the phone '
        + 'is. I have heard myself say that.',
      options: [
        { label: 'Suggest anywhere at all that is not the purse' },
      ],
    },
    /* -- and the file that has not gone anywhere -------------------------- */
    {
      id: 'statement',
      npc_line: 'I did that statement for two hours yesterday. Two hours, with '
        + 'Sandra on the phone, and I saved it. I am not somebody who does not '
        + 'save things. It is not in My Documents this morning and I would '
        + 'like to know what your machine has done with my afternoon.',
      options: [
        {
          // The question the whole ticket turns on, and it is not the one
          // anybody asks first. Where she SAVED it is her answer; where she
          // OPENED it is the machine's.
          label: 'Ask where she opened it from, not where she saved it',
          next: 'attachment',
          effects: [
            { asks: true },
            {
              reveal: 'She opened the statement straight out of Sandra\'s '
                + 'mail and worked in it from there, so every Save went back '
                + 'to the copy the mail client had already written into the '
                + 'temp directory on ACCTS-01.',
            },
          ],
        },
        {
          // The crude register, on the diagnostic beat. The question still gets
          // asked and the truth still lands - the effects are the neutral
          // option's, `asks` plus the same reveal, so the ticket is worked out
          // exactly the same - and because `asks` records what was PUT TO her,
          // the sentence the player chose is the one that goes on her stream.
          // Being rude to a user is, quite literally, put on the record.
          label: 'Tell her the machine did nothing to her afternoon, she worked '
            + 'out of a temp folder like everyone who never listens, and she '
            + 'can get stuffed - now where did she OPEN it',
          tone: 'aggressive',
          next: 'attachment',
          effects: [
            { asks: true },
            {
              reveal: 'She opened the statement straight out of Sandra\'s '
                + 'mail and worked in it from there, so every Save went back '
                + 'to the copy the mail client had already written into the '
                + 'temp directory on ACCTS-01.',
            },
            {
              action: HELPDESK_ACTIONS.reporterRebuff,
              target: 'ticket:saved-into-temp',
              params: {
                reaction_first: 'Priya has gone quiet on the line. "Right. '
                  + 'Well. I will remember that you said that." She is writing '
                  + 'something down, and it is not about the file.',
                reaction_again: 'Priya is not quiet this time. "That is the '
                  + 'second time. I am forwarding this to your manager and to '
                  + 'mine, and I have kept both."',
              },
            },
          ],
        },
        {
          label: 'Ask what the file was called',
          next: 'called',
          effects: [{ asks: true }],
        },
        {
          label: 'Ask how she saved it - the button, or Save As',
          next: 'the-button',
          effects: [{ asks: true }],
        },
        { label: 'Tell her nothing has been lost yet, and go and look' },
      ],
    },
    {
      id: 'attachment',
      npc_line: 'Out of Sandra\'s email. I opened it, I worked in it, I saved '
        + 'it. That is opening it. Is there another kind of opening it?',
      options: [
        {
          label: 'Ask what the file was called',
          next: 'called',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'statement' },
        { label: 'Say you know exactly where it is and it will take a minute' },
      ],
    },
    {
      id: 'called',
      npc_line: 'Statement. It is called Statement. Sandra calls everything '
        + 'Statement, which has never once been a problem until now, has it.',
      options: [
        {
          label: 'Ask where she opened it from, not where she saved it',
          next: 'attachment',
          effects: [
            { asks: true },
            {
              reveal: 'She opened the statement straight out of Sandra\'s '
                + 'mail and worked in it from there, so every Save went back '
                + 'to the copy the mail client had already written into the '
                + 'temp directory on ACCTS-01.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'statement' },
      ],
    },
    {
      id: 'the-button',
      npc_line: 'The button. The little disk. Nine times, because the mail '
        + 'kept going funny and I was not going to lose it, and now you are '
        + 'telling me pressing save nine times is what did it.',
      options: [
        {
          label: 'Say that pressing it nine times worked perfectly, nine times',
          next: 'attachment',
        },
        { label: 'Go back to the top', next: 'statement' },
      ],
    },
    {
      id: 'statement-after',
      npc_line: 'It is there. It is in My Documents with the queries still on '
        + 'it. So it was never gone, it was somewhere nobody would ever look, '
        + 'which as far as I am concerned is a distinction for you and not '
        + 'for me.',
      options: [
        {
          label: 'Explain, in one sentence, what opening an attachment does',
        },
        { label: 'Agree that this is entirely fair' },
      ],
    },
  ],
};

const ESTIMATING: DialogueTree = {
  id: 'dialogue/estimating',
  speaker: COMPANY_IDS.terry,
  tickets: ['ticket:must-change-password', 'ticket:share-dup-terry'],
  root: 'idle',
  roots: {
    'ticket:must-change-password': 'box',
    'ticket:share-dup-terry': 'files',
  },
  resolved_roots: {
    'ticket:must-change-password': 'sorted',
    'ticket:share-dup-terry': 'drive-back',
  },
  summoned_root: 'favour',
  nodes: [
    {
      id: 'idle',
      npc_line: 'Estimating. If it is about the quote for the Denby job, it '
        + 'is with Ada, and it has been with Ada since Thursday.',
      options: [
        { label: 'Say you were only passing' },
      ],
    },
    {
      // The direct message. Nothing in this tree points here; the day drops
      // the conversation on it at the minute the week says he asks.
      id: 'favour',
      npc_line: 'Pat - quick favour, off the books. That password box has come '
        + 'up again. Can you just do it now rather than me raising one of '
        + 'those tickets? You know it is me. I am the one with the monitor.',
      options: [
        {
          label: 'Do it now, quietly, and say nothing about it',
          next: 'grateful',
          effects: [
            {
              action: HELPDESK_ACTIONS.accountResetPassword,
              target: COMPANY_IDS.terryAccount,
            },
          ],
        },
        {
          label: 'Ask him to raise it properly, and say why it helps him',
          next: 'files-it',
        },
        { label: 'Say you will get to it and do neither' },
      ],
    },
    {
      id: 'grateful',
      npc_line: 'You are a good man, Pat. I will not tell the others. I will '
        + 'tell two of the others.',
      options: [
        { label: 'Get back to the queue' },
      ],
    },
    {
      id: 'files-it',
      npc_line: 'Right. No, that is fair. It is just that the form asks what '
        + 'category it is and I do not know what category it is. I will put '
        + 'Other. It is always Other.',
      options: [
        { label: 'Tell him Other is the correct category' },
        { label: 'Offer to walk him through the form once', next: 'form' },
      ],
    },
    {
      id: 'form',
      npc_line: 'I have the link. I have always had the link. It is in my '
        + 'favourites under a folder called Later.',
      options: [
        { label: 'Recognise the folder, and say nothing' },
      ],
    },
    {
      id: 'box',
      npc_line: 'There is a box. It comes up every morning. I have written '
        + 'down what it says, word for word, and I have not clicked anything.',
      options: [
        {
          label: 'Ask him to read the box out, all of it, including the button',
          next: 'reads',
          effects: [
            { asks: true },
            {
              reveal: 'He reads it out himself: "Your password has expired. '
                + 'Click Continue to change it." The instruction and the '
                + 'button are both on his screen.',
            },
          ],
        },
        {
          label: 'Ask what happens when he clicks Continue',
          next: 'never',
          effects: [{ asks: true }],
        },
        { label: 'Tell him you will reset it from here' },
      ],
    },
    {
      id: 'reads',
      npc_line: '"Your password has expired. Click Continue to change it." '
        + 'And then there is a button. It says Continue. I do not know what '
        + 'it wants from me.',
      options: [
        { label: 'Explain, kindly, what it wants from him', next: 'oh' },
        { label: 'Go back to the top', next: 'box' },
      ],
    },
    {
      id: 'oh',
      npc_line: 'So the box was the fix. The box has been the fix since '
        + 'Monday. I have been walking past the fix.',
      options: [
        { label: 'Tell him everybody does this, because everybody does' },
      ],
    },
    {
      id: 'never',
      npc_line: 'I have never clicked it. It appeared one morning and I did '
        + 'not want to make it worse. You hear stories.',
      options: [
        {
          label: 'Ask him to read the box out, all of it, including the button',
          next: 'reads',
          effects: [
            { asks: true },
            {
              reveal: 'He reads it out himself: "Your password has expired. '
                + 'Click Continue to change it." The instruction and the '
                + 'button are both on his screen.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'box' },
      ],
    },
    {
      id: 'files',
      npc_line: 'All my files have been deleted. All of them. Every file I '
        + 'have ever had, gone, this morning, without warning.',
      options: [
        {
          label: 'Ask which files, specifically',
          next: 'which',
          effects: [{ asks: true }],
        },
        {
          label: 'Ask where they were kept',
          next: 'the-drive',
          effects: [{ asks: true }],
        },
        { label: 'Tell him the drive is down and it is being dealt with' },
      ],
    },
    {
      id: 'which',
      npc_line: 'All of them. That is the point I am making. I am not going to '
        + 'list them, there are hundreds.',
      options: [
        {
          label: 'Ask where they were kept',
          next: 'the-drive',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'files' },
      ],
    },
    {
      id: 'the-drive',
      npc_line: 'On the drive. The one everybody uses. It is not there, and '
        + 'neither are my files, which were on it. I would call that deleted.',
      options: [
        { label: 'Agree that from where he is sitting, that is deleted' },
        { label: 'Go back to the top', next: 'files' },
      ],
    },
    {
      id: 'sorted',
      npc_line: 'It let me in and it did not ask me anything. I did not click '
        + 'the box, for the record. You clicked the box.',
      options: [
        { label: 'Let him have that' },
      ],
    },
    {
      id: 'drive-back',
      npc_line: 'The drive is back and all my files are on it. I would like it '
        + 'noted that they WERE deleted, for about two hours.',
      options: [
        { label: 'Note it, in those words, and move on' },
      ],
    },
  ],
};

const WAREHOUSE: DialogueTree = {
  id: 'dialogue/warehouse',
  speaker: COMPANY_IDS.hilda,
  tickets: ['ticket:stale-device-relock', 'ticket:disk-full'],
  root: 'again',
  roots: {
    'ticket:stale-device-relock': 'again',
    'ticket:disk-full': 'full',
  },
  resolved_roots: {
    'ticket:stale-device-relock': 'after',
    'ticket:disk-full': 'space-after',
  },
  nodes: [
    {
      id: 'again',
      npc_line: 'It has locked me out again. Third time this week. Somebody '
        + 'unlocks it, I get about ten minutes, and then it goes.',
      options: [
        {
          label: 'Ask what else in the warehouse signs in as her',
          next: 'tablet',
          effects: [
            { asks: true },
            {
              reveal: 'There is a scanning tablet in the warehouse cupboard '
                + 'that has been signed in as her since 2019, and it still has '
                + 'the password she had before the spring.',
            },
          ],
        },
        {
          // The milder register on a diagnostic beat: the same question, the
          // same reveal, asked with no patience left. It is short rather than
          // crude, which is the far end of the range from the ones that swear -
          // and it still costs, because short with a user is still a choice.
          label: 'Ask her, without the patience, what else in that warehouse '
            + 'signs in as her, since it is plainly not the computer at fault',
          tone: 'aggressive',
          next: 'tablet',
          effects: [
            { asks: true },
            {
              reveal: 'There is a scanning tablet in the warehouse cupboard '
                + 'that has been signed in as her since 2019, and it still has '
                + 'the password she had before the spring.',
            },
            {
              action: HELPDESK_ACTIONS.reporterRebuff,
              target: 'ticket:stale-device-relock',
              params: {
                reaction_first: 'Hilda: "Charming. It throws me out four times '
                  + 'a week and I get the tone. Noted." She answers the '
                  + 'question anyway, because she wants it fixed.',
                reaction_again: 'Hilda has stopped being amused. "That is '
                  + 'enough of that. I have told the shift supervisor, and she '
                  + 'has told me to tell you that she has told him."',
              },
            },
          ],
        },
        {
          label: 'Ask exactly how long after each unlock it goes',
          next: 'ten-minutes',
          effects: [{ asks: true }],
        },
        { label: 'Tell her you will unlock it while you look' },
      ],
    },
    {
      id: 'tablet',
      npc_line: 'Only the scanner in the cupboard, and that is not me, that is '
        + 'the scanner. It has been in there since before the new racking.',
      options: [
        { label: 'Go back to the top', next: 'again' },
        { label: 'Tell her the scanner is the whole answer' },
      ],
    },
    {
      id: 'ten-minutes',
      npc_line: 'Ten minutes. Near enough exactly ten, every time. I have '
        + 'started making the tea in the gap, because it is the right length '
        + 'for a tea.',
      options: [
        {
          label: 'Ask what else in the warehouse signs in as her',
          next: 'tablet',
          effects: [
            { asks: true },
            {
              reveal: 'There is a scanning tablet in the warehouse cupboard '
                + 'that has been signed in as her since 2019, and it still has '
                + 'the password she had before the spring.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'again' },
      ],
    },
    {
      id: 'after',
      npc_line: 'Two hours and it is still open. I do not trust it. I am going '
        + 'to keep signing out and back in all afternoon to check.',
      options: [
        { label: 'Explain, gently, what that will do to the count' },
      ],
    },
    /* -- and the drive that filled itself --------------------------------- */
    {
      id: 'full',
      npc_line: 'It will not save the booking-in sheet. It will not print it '
        + 'either. There is a box about disk space, and before you ask: I have '
        + 'saved four things on that computer in my life and one of them was a '
        + 'Christmas rota. It is not full of me.',
      options: [
        {
          label: 'Ask what else runs on that machine besides her',
          next: 'scanner',
          effects: [
            { asks: true },
            {
              reveal: 'The pallet scanner runs on WHOUSE-01 and writes a '
                + 'monthly export into C:\\SCANNER\\EXPORT. It has done that '
                + 'since 1997 and nothing has ever deleted one.',
            },
          ],
        },
        {
          label: 'Ask whether anything has been slow or odd before today',
          next: 'slow',
          effects: [{ asks: true }],
        },
        { label: 'Tell her you can see the drive from here, and look' },
      ],
    },
    {
      id: 'scanner',
      npc_line: 'The scanner box. The pallets. That has been in the corner '
        + 'doing its own thing since before the racking, and nobody has ever '
        + 'touched it, because nobody has ever known how.',
      options: [
        {
          label: 'Ask whether anybody ever looks at what it writes',
          next: 'head-office',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'full' },
        { label: 'Tell her that is the whole answer' },
      ],
    },
    {
      id: 'head-office',
      npc_line: 'It sends it all to head office at midnight, and head office '
        + 'has never once asked me about any of it. The pallet file is the one '
        + 'that matters. If that goes, we are counting the warehouse by hand '
        + 'for a fortnight, and I will know who to ring.',
      options: [
        { label: 'Promise to leave the pallet file exactly where it is' },
        { label: 'Go back to the top', next: 'full' },
      ],
    },
    {
      id: 'slow',
      npc_line: 'It has been slow for about a year. Everything in here is '
        + 'slow for about a year. I did not think slow was a thing you were '
        + 'allowed to ring about.',
      options: [
        {
          label: 'Ask what else runs on that machine besides her',
          next: 'scanner',
          effects: [
            { asks: true },
            {
              reveal: 'The pallet scanner runs on WHOUSE-01 and writes a '
                + 'monthly export into C:\\SCANNER\\EXPORT. It has done that '
                + 'since 1997 and nothing has ever deleted one.',
            },
          ],
        },
        { label: 'Say that slow is absolutely a thing to ring about' },
      ],
    },
    {
      id: 'space-after',
      npc_line: 'It has saved it. And printed it. Three hundred megabytes of '
        + 'barcodes, you say. From a machine nobody uses, in a corner, for a '
        + 'year. And it will do it again next month, will it.',
      options: [
        { label: 'Say yes, and put that on the ticket where somebody will see' },
      ],
    },
  ],
};

const SALES_NEW_STARTER: DialogueTree = {
  id: 'dialogue/sales-new-starter',
  speaker: COMPANY_IDS.kwame,
  tickets: ['ticket:mailbox-access', 'ticket:sendas-missing'],
  root: 'access',
  roots: {
    'ticket:mailbox-access': 'access',
    'ticket:sendas-missing': 'send',
  },
  resolved_roots: {
    'ticket:mailbox-access': 'in',
    'ticket:sendas-missing': 'sent',
  },
  // Two weeks in and doing it for the opposite reason to Owen: he has been
  // told to be polite to the IT desk and this is what being polite looks like
  // to somebody who has not yet learned what it costs the IT desk.
  hello_root: 'hello',
  nodes: [
    {
      id: 'hello',
      npc_line: 'Hi.',
      options: [
        { label: 'Ask what he needs', next: 'hello-question' },
      ],
    },
    {
      id: 'hello-question',
      npc_line: 'Sorry - I did not want to just launch into it. Do we have a '
        + 'way of sending something that is too big for mail? There is a '
        + 'forty-meg presentation and it has bounced twice.',
      options: [
        {
          label: 'Point him at the common share and tell him how big it holds',
          next: 'hello-share',
        },
        {
          label: 'Tell him the desk would rather be launched into',
          next: 'hello-launched',
        },
      ],
    },
    {
      id: 'hello-share',
      npc_line: 'The share. Of course. I did not want to put it on the share '
        + 'in case that was the wrong thing to do with the share.',
      options: [
        { label: 'Confirm that the share is for exactly this' },
      ],
    },
    {
      id: 'hello-launched',
      npc_line: 'Really? Everybody keeps telling me not to be abrupt with '
        + 'people. Right. Noted. Next time it is just the question.',
      options: [
        { label: 'Promise him nobody here will think he was abrupt' },
        { label: 'Point him at the share as well', next: 'hello-share' },
      ],
    },
    {
      id: 'access',
      npc_line: 'Sorry to bother you. I am on the Sales mailbox rota from '
        + 'tomorrow and I cannot find it anywhere. I have looked twice in case '
        + 'it was me.',
      options: [
        {
          label: 'Ask what he will actually be doing in that mailbox',
          next: 'replying',
          effects: [
            { asks: true },
            {
              reveal: 'He will be ANSWERING customers from the mailbox, not '
                + 'just reading it - which is Send As, and is a second '
                + 'permission nobody has asked for.',
            },
          ],
        },
        {
          label: 'Ask who told him he was on the rota',
          next: 'ada-said',
          effects: [{ asks: true }],
        },
        { label: 'Tell him you will get him on it now' },
      ],
    },
    {
      id: 'replying',
      npc_line: 'Answering them, mostly. Ada said "just reply to them as '
        + 'Sales", which I have written down, because I write everything down '
        + 'at the moment.',
      options: [
        { label: 'Go back to the top', next: 'access' },
        { label: 'Tell him you will do both halves of that' },
      ],
    },
    {
      id: 'ada-said',
      npc_line: 'Ada. Her message says "as discussed". We have not discussed '
        + 'it. I am looking forward to discussing it.',
      options: [
        {
          label: 'Ask what he will actually be doing in that mailbox',
          next: 'replying',
          effects: [
            { asks: true },
            {
              reveal: 'He will be ANSWERING customers from the mailbox, not '
                + 'just reading it - which is Send As, and is a second '
                + 'permission nobody has asked for.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'access' },
      ],
    },
    {
      id: 'in',
      npc_line: 'It is there. I can see all of it. There are eleven hundred '
        + 'unread and one of them is from 2019 and says "urgent".',
      options: [
        { label: 'Warn him not to open the one from 2019' },
      ],
    },
    {
      id: 'send',
      npc_line: 'I am so sorry to come back. I can see everything now and it '
        + 'will not let me send. I promise I have not done anything clever.',
      options: [
        {
          label: 'Ask him to read the error out, word for word',
          next: 'error',
          effects: [
            { asks: true },
            {
              reveal: 'The error is a Send As refusal: he has Full Access to '
                + 'the mailbox and no permission to send as it, which are two '
                + 'different grants in two different places.',
            },
          ],
        },
        {
          label: 'Ask whether he can save a draft in there',
          next: 'draft',
          effects: [{ asks: true }],
        },
        { label: 'Tell him this one is on the request, not on him' },
      ],
    },
    {
      id: 'error',
      npc_line: '"You do not have permission to send as this user." Which is '
        + 'fair enough, except that I thought I did, because I have the '
        + 'mailbox.',
      options: [
        { label: 'Explain that those are two permissions', next: 'two' },
        { label: 'Go back to the top', next: 'send' },
      ],
    },
    {
      id: 'draft',
      npc_line: 'Drafts are fine. I have four. They are very good drafts and '
        + 'none of them has left the building.',
      options: [
        {
          label: 'Ask him to read the error out, word for word',
          next: 'error',
          effects: [
            { asks: true },
            {
              reveal: 'The error is a Send As refusal: he has Full Access to '
                + 'the mailbox and no permission to send as it, which are two '
                + 'different grants in two different places.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'send' },
      ],
    },
    {
      id: 'two',
      npc_line: 'So the first ticket was right and also not enough. I will not '
        + 'raise it as two next time. I will raise it as one and say both.',
      options: [
        { label: 'Tell him that is better than most of this building manages' },
      ],
    },
    {
      id: 'sent',
      npc_line: 'It has sent. To an actual customer. Who has replied. I am '
        + 'going to sit down for a moment.',
      options: [
        { label: 'Congratulate him and get back to the queue' },
      ],
    },
  ],
};

const FINANCE_NEW_STARTER: DialogueTree = {
  id: 'dialogue/finance-new-starter',
  speaker: COMPANY_IDS.rob,
  tickets: ['ticket:licence-exhausted'],
  root: 'first-day',
  resolved_root: 'after',
  nodes: [
    {
      id: 'first-day',
      npc_line: 'Morning. I am new. Everything on this machine works except '
        + 'the one program my entire job is, and my manager is standing behind '
        + 'me being encouraging about it.',
      options: [
        {
          label: 'Ask what the message says exactly',
          next: 'message',
          effects: [{ asks: true }],
        },
        {
          label: 'Ask who used to sit at that desk',
          next: 'colin',
          effects: [
            { asks: true },
            {
              reveal: 'The desk was Colin Peach\'s until April. Nobody has '
                + 'done the job since, and nobody has taken anything off his '
                + 'account except the account.',
            },
          ],
        },
        { label: 'Tell him it is a licence and it is not his fault' },
      ],
    },
    {
      id: 'message',
      npc_line: '"Unable to obtain a licence. Please contact your '
        + 'administrator." My manager says that is you. My manager says that '
        + 'with a great deal of confidence for somebody who was wrong about '
        + 'the car park.',
      options: [
        {
          label: 'Ask who used to sit at that desk',
          next: 'colin',
          effects: [
            { asks: true },
            {
              reveal: 'The desk was Colin Peach\'s until April. Nobody has '
                + 'done the job since, and nobody has taken anything off his '
                + 'account except the account.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'first-day' },
      ],
    },
    {
      id: 'colin',
      npc_line: 'Colin, they said. He left in April. They have kept his mug, '
        + 'which everybody has mentioned, and which is apparently the part of '
        + 'this that matters.',
      options: [
        { label: 'Go back to the top', next: 'first-day' },
        { label: 'Tell him Colin is, in a sense, still logged in' },
      ],
    },
    {
      id: 'after',
      npc_line: 'It opened. It looks exactly like the one at my last place, '
        + 'which is somehow the most depressing part of the whole morning.',
      options: [
        { label: 'Welcome him to Workgrumble' },
      ],
    },
  ],
};

const LATE_SHIFT: DialogueTree = {
  id: 'dialogue/late-shift',
  speaker: COMPANY_IDS.owen,
  tickets: ['ticket:vacuum-tuesday', 'ticket:vacuum-thursday'],
  root: 'tuesday',
  roots: {
    'ticket:vacuum-tuesday': 'tuesday',
    'ticket:vacuum-thursday': 'thursday',
  },
  resolved_roots: {
    'ticket:vacuum-tuesday': 'back-up',
    'ticket:vacuum-thursday': 'the-note',
  },
  // Eleven years in the building and he still opens with a bare hello. That
  // is the joke and it is the true one: knowing about the habit is not the
  // same as not having it, which is why the man who sends you the page is the
  // man doing the thing the page is about.
  hello_root: 'hello',
  nodes: [
    {
      id: 'hello',
      npc_line: 'Hi.',
      options: [
        { label: 'Ask what he needs', next: 'hello-question' },
      ],
    },
    {
      id: 'hello-question',
      npc_line: 'Right - the despatch printer. Is that ticket still open or '
        + 'has somebody done it? I only ask because the lorries go at six and '
        + 'I would rather find out now than at six.',
      options: [
        {
          label: 'Answer him, and ask why he did not just say that',
          next: 'hello-why',
        },
        { label: 'Answer him and get back to the queue' },
      ],
    },
    {
      id: 'hello-why',
      npc_line: 'Habit. You say hello, they say hello, then you ask. My '
        + 'daughter sent me a website about it - nohello.invalid - and I read '
        + 'the whole thing and agreed with every word and then did it again '
        + 'the next morning.',
      options: [
        {
          label: 'Say the site is bookmarked on the second monitor already',
          next: 'hello-bookmarked',
        },
        { label: 'Let him off, because you do it as well' },
      ],
    },
    {
      id: 'hello-bookmarked',
      npc_line: 'Then we are both aware of it. That is the useful stage, is '
        + 'it not. Being aware of it.',
      options: [
        { label: 'Agree that awareness has changed nothing whatsoever' },
      ],
    },
    {
      id: 'tuesday',
      npc_line: 'The Ajax was dead when I opened up. Not jammed, not out of '
        + 'paper. Dead. No standby light, nothing, like it had never been '
        + 'plugged in.',
      options: [
        {
          label: 'Ask whether it has done this before',
          next: 'before',
          effects: [
            { asks: true },
            {
              reveal: 'He has plugged that printer back in himself twice this '
                + 'month, both times on the morning after a Tuesday or a '
                + 'Thursday, and neither time seemed worth a ticket.',
            },
          ],
        },
        {
          label: 'Ask whether anything else in that corridor is off',
          next: 'corridor',
          effects: [{ asks: true }],
        },
        { label: 'Tell him you will bring it back up from here' },
      ],
    },
    {
      id: 'before',
      npc_line: 'Twice this month. I plugged it back in and got on with it. It '
        + 'did not seem worth your time, and I did not fancy the form.',
      options: [
        { label: 'Go back to the top', next: 'tuesday' },
        { label: 'Tell him it was extremely worth your time' },
      ],
    },
    {
      id: 'corridor',
      npc_line: 'Just the printer. Lights are on, the vending machine is on, '
        + 'and I would absolutely notice if the vending machine was off.',
      options: [
        { label: 'Go back to the top', next: 'tuesday' },
      ],
    },
    {
      id: 'thursday',
      npc_line: 'It is off AGAIN. Same printer, same dead light, same morning '
        + 'of the week as Tuesday. I would like somebody to find out what is '
        + 'doing it rather than turn it on.',
      options: [
        {
          label: 'Ask what time he leaves the building',
          next: 'half-five',
          effects: [
            { asks: true },
            {
              reveal: 'The late shift leaves at half five and the printer is '
                + 'always on when Owen goes, so whatever takes it off does it '
                + 'between five and half five, on the same two evenings.',
            },
          ],
        },
        {
          label: 'Tell him you are going to look at the times, not the printer',
          next: 'times',
        },
        { label: 'Bring it back up and say you are on it' },
      ],
    },
    {
      id: 'half-five',
      npc_line: 'Half five. It is on when I go, every time, because I have '
        + 'started checking on my way past. I am not mad. I have started '
        + 'checking because I am not mad.',
      options: [
        { label: 'Go back to the top', next: 'thursday' },
        { label: 'Tell him that is exactly the thing you needed' },
      ],
    },
    {
      id: 'times',
      npc_line: 'Right. Good. Somebody looking at the times. That is all I '
        + 'have wanted since about the middle of last month.',
      options: [
        {
          label: 'Ask what time he leaves the building',
          next: 'half-five',
          effects: [
            { asks: true },
            {
              reveal: 'The late shift leaves at half five and the printer is '
                + 'always on when Owen goes, so whatever takes it off does it '
                + 'between five and half five, on the same two evenings.',
            },
          ],
        },
        { label: 'Go and read the log on PRINT-02' },
      ],
    },
    {
      id: 'back-up',
      npc_line: 'It is printing. Cheers. I will see you Thursday, probably, '
        + 'and I mean that in the worst way.',
      options: [
        { label: 'Tell him you sincerely hope not' },
      ],
    },
    {
      id: 'the-note',
      npc_line: 'It is up, and there is a note taped over the socket in what I '
        + 'can only describe as Vic\'s handwriting. It is going to work, is it '
        + 'not. It is going to work and it took a month.',
      options: [
        { label: 'Admit that it took a month' },
      ],
    },
  ],
};

/**
 * The reply itself, as an effect, said once and offered from three places.
 *
 * It is a dispatched action rather than a line of flavour, because it is the
 * half of this ticket that closes it: the rule stops the mail and the reply
 * decides whether the next hundred get reported. The resolved conversation
 * used to claim "you wrote back" whether or not anybody had.
 */
const PRAISE_DENNIS: DialogueEffect = {
  action: HELPDESK_ACTIONS.ticketReplyToReporter,
  target: 'ticket:phishing-report',
  params: { comment: PHISH_PRAISE },
};

const MARKETING: DialogueTree = {
  id: 'dialogue/marketing',
  speaker: COMPANY_IDS.dennis,
  tickets: ['ticket:phishing-report'],
  root: 'sorry',
  resolved_root: 'after',
  nodes: [
    {
      id: 'sorry',
      npc_line: 'Sorry, this is probably nothing. It just felt wrong. It wants '
        + 'me to re-enter my password because of unusual activity, and I have '
        + 'not been doing anything unusual.',
      options: [
        {
          label: 'Ask what made him look twice at it',
          next: 'domain',
          effects: [
            { asks: true },
            {
              reveal: 'The sender domain is one letter off ours. Dennis '
                + 'noticed because he had spent the morning proofreading a '
                + 'poster, and nobody else on his floor noticed at all.',
            },
          ],
        },
        {
          label: 'Ask whether anybody else on his floor got it',
          next: 'others',
          effects: [{ asks: true }],
        },
        {
          label: 'Tell him he did exactly the right thing',
          next: 'told',
          effects: [PRAISE_DENNIS],
        },
        {
          // Offered plainly, and it is not a fail state. It costs a great deal
          // of composure and the ticket still closes, because the fix was
          // never the link.
          label: 'Open the link yourself, on your own machine, just to see',
          next: 'clicked',
          effects: [
            {
              action: HELPDESK_ACTIONS.securityFollowLink,
              target: COMPANY_IDS.player,
            },
          ],
        },
      ],
    },
    {
      id: 'domain',
      npc_line: 'One letter. In the bit after the at. I only saw it because I '
        + 'had been proofreading a poster all morning and my eyes were in '
        + 'that mode.',
      options: [
        {
          label: 'Tell him he did exactly the right thing',
          next: 'told',
          effects: [PRAISE_DENNIS],
        },
        { label: 'Go back to the top', next: 'sorry' },
      ],
    },
    {
      id: 'others',
      npc_line: 'The two either side of me. I told them not to click it. One '
        + 'of them had already replied to it saying "is this you".',
      options: [
        {
          label: 'Tell him he did exactly the right thing',
          next: 'told',
          effects: [PRAISE_DENNIS],
        },
        { label: 'Go back to the top', next: 'sorry' },
      ],
    },
    {
      id: 'told',
      npc_line: 'Oh. Right. Thanks. I nearly did not send it, to be honest. I '
        + 'thought you would all have seen it already.',
      options: [
        { label: 'Tell him to send the next one too, and mean it' },
      ],
    },
    {
      id: 'clicked',
      npc_line: 'Your screen has gone red and something in the building is '
        + 'making a noise I have not heard before. Was that meant to happen? '
        + 'That was not meant to happen, was it.',
      options: [
        { label: 'Say nothing and close the tab', next: 'sorry' },
      ],
    },
    {
      id: 'after',
      npc_line: 'You wrote back. Nobody writes back. I have printed it out, '
        + 'which I appreciate is not what you meant by it.',
      options: [
        { label: 'Let him print it out' },
      ],
    },
  ],
};

const ACCOUNTS: DialogueTree = {
  id: 'dialogue/accounts',
  speaker: COMPANY_IDS.marcus,
  // The month-end request first, because it is the one he raises earlier in
  // the week: `conversationFor` opens on the first of these that is live, and
  // a man with a request in and a backup light on is a man who wants to talk
  // about the request.
  tickets: ['ticket:vpn-month-end', 'ticket:coverup-backup'],
  root: 'itself',
  roots: {
    'ticket:vpn-month-end': 'month-end',
    'ticket:coverup-backup': 'itself',
  },
  resolved_roots: {
    'ticket:vpn-month-end': 'month-end-after',
    'ticket:coverup-backup': 'after',
  },
  nodes: [
    {
      /**
       * Five to five, and he is still at his desk because he has just found
       * out.
       *
       * The register is the whole point of the class: nobody is being
       * unreasonable, the timing is not anybody's fault, and the thing that
       * hurts is a clock that stops at five and starts again at nine.
       */
      id: 'month-end',
      npc_line: 'I know what time it is. Month-end moved to tomorrow and I '
        + 'am doing it from home, and I have just this minute found out that '
        + 'the remote thing does not let me in.',
      options: [
        {
          label: 'Ask whether he has ever worked from home before',
          next: 'month-end-never',
          effects: [
            { asks: true },
            {
              reveal: 'He has never worked from home, so his account has '
                + 'never been in VPN Users. Nothing broke; nobody ever put '
                + 'him in it, because until this week nobody needed to.',
            },
          ],
        },
        {
          label: 'Ask what time he starts tomorrow',
          next: 'month-end-half-eight',
          effects: [{ asks: true }],
        },
        { label: 'Tell him it is in the queue with a clock on it' },
      ],
    },
    {
      id: 'month-end-never',
      npc_line: 'Never. Twenty-six years and I have never once worked from '
        + 'home. I am told this is now a thing people do and I am told it is '
        + 'my turn.',
      options: [
        { label: 'Go back to the top', next: 'month-end' },
        { label: 'Tell him that is the answer, and it is not a fault' },
      ],
    },
    {
      id: 'month-end-half-eight',
      npc_line: 'Half eight. Which I appreciate is before you, and that is '
        + 'exactly why I am standing here at five to five rather than ringing '
        + 'you at half eight.',
      options: [
        { label: 'Go back to the top', next: 'month-end' },
        { label: 'Concede that this is the considerate version of it' },
      ],
    },
    {
      id: 'month-end-after',
      npc_line: 'I am in. From home. On a Thursday. I have told my wife and '
        + 'she was not as impressed as I had hoped.',
      options: [
        { label: 'Congratulate him on entering the current decade' },
      ],
    },
    {
      id: 'itself',
      npc_line: 'The backup light has gone red. I have not touched anything. '
        + 'It did it by itself, over the weekend, while I was not even here.',
      options: [
        {
          label: 'Ask when he was last at the machine',
          next: 'weekend',
          effects: [{ asks: true }],
        },
        {
          label: 'Ask whether the fan had been loud before it happened',
          next: 'fan',
          effects: [
            { asks: true },
            {
              reveal: 'The log on ACCTS-03 says the backup agent was stopped '
                + 'from the console at 09:07, about four minutes after the fan '
                + 'noise he has just described, on a morning he was signed in.',
            },
          ],
        },
        { label: 'Tell him you will start it again and leave it there' },
      ],
    },
    {
      id: 'weekend',
      npc_line: 'Friday. I left at four. Or half four. It is difficult to be '
        + 'precise about a Friday.',
      options: [
        {
          label: 'Ask whether the fan had been loud before it happened',
          next: 'fan',
          effects: [
            { asks: true },
            {
              reveal: 'The log on ACCTS-03 says the backup agent was stopped '
                + 'from the console at 09:07, about four minutes after the fan '
                + 'noise he has just described, on a morning he was signed in.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'itself' },
      ],
    },
    {
      id: 'fan',
      npc_line: 'It was roaring. All morning. I did wonder whether I should '
        + 'turn something off to quieten it down. I did not turn anything off.',
      options: [
        { label: 'Go back to the top', next: 'itself' },
        { label: 'Say nothing at all, out loud, at length' },
      ],
    },
    {
      id: 'after',
      npc_line: 'The light is green. So it fixed itself, then. These things '
        + 'do, I find.',
      options: [
        // Both of these pay the same. It is a tone choice, and a game that
        // paid for the humiliation would be teaching something false.
        { label: 'Read him the line from the log, mildly', next: 'caught' },
        { label: 'Agree that these things do, and go' },
      ],
    },
    {
      id: 'caught',
      npc_line: 'Ah. Yes. I may have clicked something to stop the noise. I '
        + 'did not know it was the backup. It said Stop and it was the only '
        + 'thing on the screen that said Stop.',
      options: [
        { label: 'Tell him that is a much better ticket than the first one' },
      ],
    },
  ],
};

const HR: DialogueTree = {
  id: 'dialogue/hr',
  speaker: COMPANY_IDS.yolanda,
  tickets: ['ticket:hr-report-macro'],
  root: 'three',
  resolved_root: 'after',
  nodes: [
    {
      id: 'three',
      npc_line: 'I need the headcount report for the board pack. Three '
        + 'o\'clock today. I appreciate that is not a lot of notice.',
      options: [
        {
          label: 'Ask when it last ran on its own',
          next: 'march',
          effects: [
            { asks: true },
            {
              reveal: 'It has not generated since March. Everybody has been '
                + 'building it by hand since then, on Sundays, and nobody '
                + 'raised it because there was a way round it.',
            },
          ],
        },
        {
          label: 'Ask what happens if it is not there by three',
          next: 'consequence',
          effects: [{ asks: true }],
        },
        { label: 'Tell her what you can honestly do before three' },
      ],
    },
    {
      id: 'march',
      npc_line: 'March. We have been doing it by hand since March. On Sundays. '
        + 'I did not raise it because we had a way round it, which I now hear '
        + 'myself saying out loud.',
      options: [
        { label: 'Go back to the top', next: 'three' },
        { label: 'Tell her the date is the useful part of this ticket' },
      ],
    },
    {
      id: 'consequence',
      npc_line: 'Nothing. Somebody says "do we have the headcount" and I say '
        + '"not yet" and the meeting moves on. I would just like, once, to say '
        + 'yes.',
      options: [
        {
          label: 'Ask when it last ran on its own',
          next: 'march',
          effects: [
            { asks: true },
            {
              reveal: 'It has not generated since March. Everybody has been '
                + 'building it by hand since then, on Sundays, and nobody '
                + 'raised it because there was a way round it.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'three' },
      ],
    },
    {
      id: 'after',
      npc_line: 'It has run. It is forty pages and it has caught up every '
        + 'month since March in one go. Nobody will read it and I have never '
        + 'been happier.',
      options: [
        { label: 'Suggest she puts the good bit on page one' },
      ],
    },
  ],
};

/**
 * Facilities. No tickets, no clock, and the only permanent fix in the week.
 *
 * The sticky note is a real verb with a real outcome and it is the closing half
 * of the recurring arc - which is why Vic is a contact rather than a line of
 * flavour text. Nothing here asks anybody anything: he is not a reporter, so
 * there is no ticket to log a question against.
 */
const FACILITIES: DialogueTree = {
  id: 'dialogue/facilities',
  speaker: COMPANY_IDS.vic,
  tickets: [],
  root: 'vic',
  // He rings on the Thursday about a printer in a building this desk does not
  // hold the contract for, which is the malignant half of the cost model made
  // of words: nothing lands on any ticket, because there is no ticket, and
  // that is exactly what it costs you.
  call_roots: ['ringing-annexe', 'ringing-annexe-shaky'],
  nodes: [
    {
      id: 'vic',
      npc_line: 'Facilities. If it is the second-floor heating, I know, and I '
        + 'cannot, and the part is coming from Wolverhampton.',
      options: [
        { label: 'Ask about the sockets in the warehouse corridor', next: 'sockets' },
        { label: 'Ask who is in that end of the building after five', next: 'rounds' },
        { label: 'Say you were only passing' },
      ],
    },
    {
      id: 'sockets',
      npc_line: 'One socket that end. Everything else is up by the doors, '
        + 'because of the racking. Why. What has been unplugged.',
      options: [
        {
          label: 'Ask him to put a note on it saying what is plugged in',
          next: 'note',
          effects: [
            {
              action: HELPDESK_ACTIONS.facilitiesStickyNote,
              target: COMPANY_IDS.warehousePrintServer,
            },
          ],
        },
        { label: 'Ask who is in that end of the building after five', next: 'rounds' },
        { label: 'Say it is probably nothing' },
      ],
    },
    {
      id: 'rounds',
      npc_line: 'Cleaning, Tuesdays and Thursdays, that end, from five. Then '
        + 'me locking up. Then nobody until Owen at six in the morning.',
      options: [
        { label: 'Ask about the sockets in the warehouse corridor', next: 'sockets' },
        { label: 'Thank him and go and look at a log' },
      ],
    },
    {
      id: 'note',
      npc_line: 'Tape and a marker, two minutes, I will do it on my way past. '
        + '"DO NOT UNPLUG - WAREHOUSE PRINTER". In capitals. I have got '
        + 'capitals and I have been waiting for a reason.',
      options: [
        { label: 'Tell him that is the best fix anybody has shipped this week' },
      ],
    },
    {
      id: 'ringing-annexe',
      npc_line: 'Vic, Facilities. The printer in the annexe is doing a noise. '
        + 'Not the warehouse one. The annexe one, by the vending machine, that '
        + 'nobody has asked me about once in four years.',
      options: [
        {
          label: 'Ask him what sort of noise',
          next: 'ringing-annexe-noise',
        },
        {
          label: 'Explain that the annexe is on the other contract',
          next: 'ringing-annexe-contract',
        },
      ],
    },
    {
      id: 'ringing-annexe-noise',
      npc_line: 'A sort of - it is hard to do down a phone. Ronk. Then '
        + 'nothing. Then ronk. It has been ronking since about half nine.',
      options: [
        {
          label: 'Explain that the annexe is on the other contract',
          next: 'ringing-annexe-contract',
        },
      ],
    },
    {
      id: 'ringing-annexe-contract',
      npc_line: 'Right. And who is the other contract. No - do not look it '
        + 'up, I will ask Bev, she has the folder. Sorry. You have been very '
        + 'good about this.',
      options: [
        { label: 'Put the phone down and try to remember what you were doing' },
      ],
    },
    {
      id: 'ringing-annexe-shaky',
      npc_line: 'Vic, Facilities. Sorry, is this a bad - it is. I can hear '
        + 'that it is. It is about a printer that is not yours and I am going '
        + 'to say it anyway, because I have got the phone in my hand now.',
      options: [
        {
          label: 'Ask him what sort of noise',
          next: 'ringing-annexe-noise',
        },
      ],
    },
  ],
};

/** The people M4 hired, in the order the building would introduce them. */
export const STAFF_TREES: readonly DialogueTree[] = [
  ACCOUNTS_PAYABLE,
  ESTIMATING,
  WAREHOUSE,
  SALES_NEW_STARTER,
  FINANCE_NEW_STARTER,
  LATE_SHIFT,
  MARKETING,
  ACCOUNTS,
  HR,
  FACILITIES,
];
