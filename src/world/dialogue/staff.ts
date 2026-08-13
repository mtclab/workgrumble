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
  tickets: [
    'ticket:mfa-reregister',
    'ticket:saved-into-temp',
    // The pool's two (E11, 0.34.0 slice 2): the thing she mentions at the end
    // of a call about something else, and the one she rings about at once.
    // They are the same machine and they are not the same urgency, and she has
    // them the wrong way round, which is the point of both of them.
    'ticket:pool-accounts-updates',
    'ticket:pool-accounts-drives',
  ],
  root: 'phone',
  roots: {
    'ticket:mfa-reregister': 'phone',
    'ticket:saved-into-temp': 'statement',
    'ticket:pool-accounts-updates': 'shield-icon',
    'ticket:pool-accounts-drives': 'red-crosses',
  },
  resolved_roots: {
    'ticket:mfa-reregister': 'after',
    'ticket:saved-into-temp': 'statement-after',
    'ticket:pool-accounts-updates': 'shield-gone',
    'ticket:pool-accounts-drives': 'drives-back',
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
    /* -- the pool: the icon she does not want to make a fuss about ------ */
    {
      id: 'shield-icon',
      npc_line: 'While I have you. There is a little shield in the corner with '
        + 'a cross through it. It has been there for ages and everything works '
        + 'perfectly, so I am not asking you to do anything, I am just '
        + 'mentioning it.',
      options: [
        {
          label: 'Ask what the machine says about updates when she opens it',
          next: 'shield-set',
          effects: [
            { asks: true },
            {
              reveal: 'Automatic Updates on ACCTS-01 is set to Disabled rather '
                + 'than merely stopped, so nothing has started it since '
                + 'somebody set it that way and nothing ever will, restart or '
                + 'no restart.',
            },
          ],
        },
        {
          label: 'Ask how long the cross has been on it',
          next: 'shield-ages',
          effects: [{ asks: true }],
        },
        { label: 'Thank her for mentioning it, and mean it' },
      ],
    },
    {
      id: 'shield-set',
      npc_line: 'It says updates are turned off. Not failed. Turned off. Well '
        + 'that is somebody\'s decision, is it not, and it was not mine.',
      options: [
        { label: 'Ask how long the cross has been on it', next: 'shield-ages',
          effects: [{ asks: true }] },
        { label: 'Agree that it was somebody\'s decision and go and undo it' },
      ],
    },
    {
      id: 'shield-ages',
      npc_line: 'Years, possibly. There was a man who came round and made all '
        + 'the machines faster. He was very confident about it and I have not '
        + 'seen him since.',
      options: [
        { label: 'Go back to the top', next: 'shield-icon' },
        { label: 'Say nothing at all about the man who made things faster' },
      ],
    },
    {
      id: 'shield-gone',
      npc_line: 'The cross has gone and the machine spent twenty minutes doing '
        + 'something to itself with a bar on the screen. Was that bad? That '
        + 'felt like it might have been bad.',
      options: [
        { label: 'Tell her that was four years of it, and it was not bad' },
      ],
    },
    /* -- and the drives, which are not the servers ---------------------- */
    {
      id: 'red-crosses',
      npc_line: 'The file server has gone. All three of my drives have little '
        + 'red crosses on them and none of them will open. I have written down '
        + 'what it says: "The network path was not found."',
      options: [
        {
          label: 'Ask which servers those three drives are actually on',
          next: 'red-crosses-all',
          effects: [
            { asks: true },
            {
              reveal: 'The three drives are on three different servers and all '
                + 'three failed in the same second, which puts the fault on '
                + 'ACCTS-01 rather than on any of the machines she is naming.',
            },
          ],
        },
        {
          label: 'Ask whether the mail and the printing still work',
          next: 'red-crosses-rest',
          effects: [{ asks: true }],
        },
        { label: 'Tell her nothing has been lost and go and look at her box' },
      ],
    },
    {
      id: 'red-crosses-all',
      npc_line: 'Three different servers. I had not thought about that. Three '
        + 'servers do not all fall over in the same second, do they. That is '
        + 'the sort of thing that happens in a film.',
      options: [
        { label: 'Go back to the top', next: 'red-crosses' },
        { label: 'Tell her three at once is always one thing, closer to home' },
      ],
    },
    {
      id: 'red-crosses-rest',
      npc_line: 'Mail is fine. Printing is fine. Everything is fine except the '
        + 'three things I need to do the payment run with.',
      options: [
        {
          label: 'Ask which servers those three drives are actually on',
          next: 'red-crosses-all',
          effects: [
            { asks: true },
            {
              reveal: 'The three drives are on three different servers and all '
                + 'three failed in the same second, which puts the fault on '
                + 'ACCTS-01 rather than on any of the machines she is naming.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'red-crosses' },
      ],
    },
    {
      id: 'drives-back',
      npc_line: 'They are back. All three, at once, exactly as they went. So '
        + 'it was never the servers, and I have just spent forty minutes being '
        + 'furious at a building.',
      options: [
        { label: 'Tell her the building is used to it' },
      ],
    },
  ],
};

const ESTIMATING: DialogueTree = {
  id: 'dialogue/estimating',
  speaker: COMPANY_IDS.terry,
  tickets: [
    // The audit queue (E9, 0.36.0): the rebuilt machine that cannot fetch a
    // driver, filed as one desk.
    'ticket:audit-print-workstation',
    'ticket:must-change-password',
    'ticket:share-dup-terry',
    // The pool's two (E11, 0.34.0 slice 2): a screen he turned over himself
    // and a tender he is certain the machine has eaten.
    'ticket:pool-estimating-rotated',
    'ticket:pool-estimating-tender',
  ],
  root: 'idle',
  roots: {
    'ticket:audit-print-workstation': 'new-machine',
    'ticket:must-change-password': 'box',
    'ticket:share-dup-terry': 'files',
    'ticket:pool-estimating-rotated': 'upside-down',
    'ticket:pool-estimating-tender': 'tender-gone',
  },
  resolved_roots: {
    'ticket:audit-print-workstation': 'new-machine-after',
    'ticket:must-change-password': 'sorted',
    'ticket:share-dup-terry': 'drive-back',
    'ticket:pool-estimating-rotated': 'right-way-up',
    'ticket:pool-estimating-tender': 'tender-found',
  },
  summoned_root: 'favour',
  nodes: [
    {
      // The audit queue (E9, 0.36.0). One man, one rebuilt machine - and the
      // thing that is broken is on the print server, which is everybody's.
      id: 'new-machine',
      npc_line: 'The rebuild has gone on fine and it will not take the '
        + 'printer. It finds the name and then says it cannot get the driver. '
        + 'I have done it twice and I am going to lunch.',
      options: [
        {
          label: 'Ask whether anything else on the rebuild has worked',
          next: 'new-machine-else',
          effects: [
            { asks: true },
            { reveal: 'The print server cannot read the share it hands drivers out of, so no machine set up from today can add the printer.' },
          ],
        },
        { label: 'Tell him you will look at the print server' },
      ],
    },
    {
      id: 'new-machine-else',
      npc_line: 'Everything else. The estimating package, the tender folder, '
        + 'the lot. It is only the printer, which is why I said it is the '
        + 'printer.',
      options: [
        { label: 'Go back to the top', next: 'new-machine' },
      ],
    },
    {
      id: 'new-machine-after',
      npc_line: 'It has taken it. I have printed the tender to check and then '
        + 'thrown it away, which is a thing I now do twice a day.',
      options: [{ label: 'Leave him to it' }],
    },

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
    /* -- the pool: a screen he turned over himself ---------------------- */
    {
      id: 'upside-down',
      npc_line: 'Everything is upside down. I have not installed anything, I '
        + 'have not clicked anything, and I am reading this to you upside down '
        + 'as we speak.',
      options: [
        {
          label: 'Ask what he was doing at the desk this morning',
          next: 'upside-down-clean',
          effects: [
            { asks: true },
            {
              reveal: 'He wiped the keyboard with his hand flat across it, '
                + 'which is Control, Alt and an arrow key held down together '
                + 'for as long as the wipe took.',
            },
          ],
        },
        {
          label: 'Ask whether the mouse still moves the way it used to',
          next: 'upside-down-mouse',
          effects: [{ asks: true }],
        },
        { label: 'Tell him to sit up straight, this takes a moment' },
      ],
    },
    {
      id: 'upside-down-clean',
      npc_line: 'I cleaned the keyboard. With a cloth. Firmly. It was filthy '
        + 'and I have been meaning to do it since the spring, and I am now '
        + 'getting a horrible feeling about the spring.',
      options: [
        { label: 'Go back to the top', next: 'upside-down' },
        { label: 'Tell him the keyboard is cleaner and that is worth something' },
      ],
    },
    {
      id: 'upside-down-mouse',
      npc_line: 'The mouse goes the wrong way now as well. Up is down. I have '
        + 'been trying to get to the start menu for ten minutes and it is at '
        + 'the top, which is at the bottom.',
      options: [
        {
          label: 'Ask what he was doing at the desk this morning',
          next: 'upside-down-clean',
          effects: [
            { asks: true },
            {
              reveal: 'He wiped the keyboard with his hand flat across it, '
                + 'which is Control, Alt and an arrow key held down together '
                + 'for as long as the wipe took.',
            },
          ],
        },
        { label: 'Tell him to leave the mouse alone for two minutes' },
      ],
    },
    {
      id: 'right-way-up',
      npc_line: 'That is better. That is much better. I am going to keep '
        + 'cleaning the keyboard, though. I am just going to do it with the '
        + 'machine switched off, like a coward.',
      options: [
        { label: 'Tell him that is not cowardice, it is the procedure' },
      ],
    },
    /* -- and the tender that goes at four ------------------------------- */
    {
      id: 'tender-gone',
      npc_line: 'The Denby tender has gone. Three days of it. It goes to them '
        + 'at four o\'clock and the only version on this machine is last '
        + 'week\'s, with the old steel figure in it, which we have already '
        + 'been beaten on. I would rather send nothing than send that.',
      options: [
        {
          label: 'Ask where he opened rev 2 from, not where he saved it',
          next: 'tender-opened',
          effects: [
            { asks: true },
            {
              reveal: 'He opened rev 2 straight out of the surveyor\'s mail and '
                + 'has worked in it from there all week, so every Save went '
                + 'back to the copy the mail client had already written into '
                + 'the temp directory on EST-03.',
            },
          ],
        },
        {
          label: 'Ask what tells the two versions apart',
          next: 'tender-which',
          effects: [{ asks: true }],
        },
        { label: 'Tell him nothing has been lost yet and it is not four yet' },
      ],
    },
    {
      id: 'tender-opened',
      npc_line: 'Out of Kerrigan\'s email. That is where it lives. I open it, I '
        + 'do the numbers, I save it, I close it, and tomorrow I open it again '
        + 'out of the same email. That is how I have always done it.',
      options: [
        { label: 'Ask what tells the two versions apart', next: 'tender-which',
          effects: [{ asks: true }] },
        { label: 'Say you know exactly where it is, and that it will take a '
          + 'minute' },
      ],
    },
    {
      id: 'tender-which',
      npc_line: 'The steel. Rev 1 has forty-one one. Rev 2 has thirty-eight '
        + 'seven fifty, and a line under it saying Hallam matched it. If the '
        + 'line is there it is the right one.',
      options: [
        {
          label: 'Ask where he opened rev 2 from, not where he saved it',
          next: 'tender-opened',
          effects: [
            { asks: true },
            {
              reveal: 'He opened rev 2 straight out of the surveyor\'s mail and '
                + 'has worked in it from there all week, so every Save went '
                + 'back to the copy the mail client had already written into '
                + 'the temp directory on EST-03.',
            },
          ],
        },
        { label: 'Promise to read the top of it back to him before he sends it' },
      ],
    },
    {
      id: 'tender-found',
      npc_line: 'That is it. Thirty-eight seven fifty and the line about '
        + 'Hallam. It has gone at ten to four. I am going to go and stand '
        + 'outside for a moment.',
      options: [
        { label: 'Tell him where the machine had put it, in one sentence' },
        { label: 'Let him go and stand outside' },
      ],
    },
  ],
};

const WAREHOUSE: DialogueTree = {
  id: 'dialogue/warehouse',
  speaker: COMPANY_IDS.hilda,
  tickets: [
    // The audit queue (E9, 0.36.0): PRINT-01 has stopped announcing itself and
    // she has concluded somebody took it away.
    'ticket:audit-print-browser',
    'ticket:stale-device-relock',
    'ticket:disk-full',
    // The pool's two (E11, 0.34.0 slice 2). Both are the machine in the corner
    // that nobody has ever touched, which is the whole of the warehouse's
    // relationship with computers.
    'ticket:pool-warehouse-schedule',
    'ticket:pool-warehouse-tablet',
  ],
  root: 'again',
  roots: {
    'ticket:audit-print-browser': 'gone-missing',
    'ticket:stale-device-relock': 'again',
    'ticket:disk-full': 'full',
    'ticket:pool-warehouse-schedule': 'head-office-rang',
    'ticket:pool-warehouse-tablet': 'scanner-dead',
  },
  resolved_roots: {
    'ticket:audit-print-browser': 'gone-missing-after',
    'ticket:stale-device-relock': 'after',
    'ticket:disk-full': 'space-after',
    'ticket:pool-warehouse-schedule': 'export-sent',
    'ticket:pool-warehouse-tablet': 'scanner-back',
  },
  nodes: [
    {
      // The audit queue's third instance of the class (E9, 0.36.0): the box
      // has stopped announcing itself, so anybody setting a machine up today
      // cannot find it - and one person has noticed.
      id: 'gone-missing',
      npc_line: 'PRINT-01 has gone. It is not in the network list any more. '
        + 'I am not saying anybody has taken it, but it is not there.',
      options: [
        {
          label: 'Ask whether printing still works from her own machine',
          next: 'gone-missing-hers',
          effects: [
            { asks: true },
            { reveal: 'PRINT-01 has stopped announcing itself on the network, so nothing lists it - anybody who already has it keeps printing.' },
          ],
        },
        { label: 'Tell her you will go and look at it' },
      ],
    },
    {
      id: 'gone-missing-hers',
      npc_line: 'Mine prints. Mine has always printed. It is the list that is '
        + 'wrong, and the lad in the office cannot add it to his at all.',
      options: [
        { label: 'Go back to the top', next: 'gone-missing' },
      ],
    },
    {
      id: 'gone-missing-after',
      npc_line: 'It is back on the list. I will not ask where it went.',
      options: [{ label: 'Leave her to it' }],
    },

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
    /* -- the pool: the file head office has not had -------------------- */
    {
      id: 'head-office-rang',
      npc_line: 'Somebody from head office has rung me about a pallet file. I '
        + 'have never sent a pallet file in my life. The machine in the corner '
        + 'sends it and it has always sent it and now apparently it is my '
        + 'fault that it has not.',
      options: [
        {
          label: 'Ask what else on that machine happens overnight',
          next: 'export-midnight',
          effects: [
            { asks: true },
            {
              reveal: 'Nothing on WHOUSE-01 has run to a timetable since some '
                + 'point last month. The scanner does not send the export '
                + 'itself - it asks the machine to run it at midnight, and '
                + 'nothing has been there to be asked.',
            },
          ],
        },
        {
          label: 'Ask when head office last had one',
          next: 'export-last-month',
          effects: [{ asks: true }],
        },
        { label: 'Tell her it is not her fault and you will find out whose' },
      ],
    },
    {
      id: 'export-midnight',
      npc_line: 'Midnight. That is the only thing I know about it. The man who '
        + 'installed it said midnight, in 1997, and it has been doing it at '
        + 'midnight ever since and nobody has ever looked.',
      options: [
        { label: 'Ask when head office last had one', next: 'export-last-month',
          effects: [{ asks: true }] },
        { label: 'Tell her that is the whole answer and she has just given it' },
      ],
    },
    {
      id: 'export-last-month',
      npc_line: 'The first of last month, they said. So it did one, and then '
        + 'it did not do the next one, and nobody noticed for four weeks. '
        + 'Including head office, who are cross.',
      options: [
        { label: 'Go back to the top', next: 'head-office-rang' },
        { label: 'Say that four weeks is quite a long time to notice in' },
      ],
    },
    {
      id: 'export-sent',
      npc_line: 'It has gone. Head office have it and have said nothing, which '
        + 'from head office is a thank you. Will it do the next one on its own?',
      options: [
        { label: 'Say yes, and say what would stop it, so she knows the shape' },
      ],
    },
    /* -- and a flat battery, which is a flat battery -------------------- */
    {
      id: 'scanner-dead',
      npc_line: 'The scanner in the cupboard has died. Black screen, nothing, '
        + 'no lights. It has done nothing wrong and neither have I, and I '
        + 'cannot book anything in without it.',
      options: [
        {
          label: 'Ask what was on the screen the last time it was on',
          next: 'scanner-last-said',
          effects: [
            { asks: true },
            {
              reveal: 'The last thing on the tablet was a box about the battery '
                + 'being low, which she read, agreed with, and put back in the '
                + 'cupboard.',
            },
          ],
        },
        {
          label: 'Ask how long it has been in the cupboard',
          next: 'scanner-cupboard',
          effects: [{ asks: true }],
        },
        { label: 'Tell her you will bring it back up from here' },
      ],
    },
    {
      id: 'scanner-last-said',
      npc_line: 'There was a box about the battery. I read it. I did agree '
        + 'with it. And then I put it away, which I can hear is the wrong end '
        + 'of that sentence.',
      options: [
        { label: 'Go back to the top', next: 'scanner-dead' },
        { label: 'Tell her everybody does this, because everybody does' },
      ],
    },
    {
      id: 'scanner-cupboard',
      npc_line: 'Since Thursday. It lives in the cupboard. That is where the '
        + 'cupboard comes in - it is the scanner cupboard, it is not a '
        + 'punishment.',
      options: [
        {
          label: 'Ask what was on the screen the last time it was on',
          next: 'scanner-last-said',
          effects: [
            { asks: true },
            {
              reveal: 'The last thing on the tablet was a box about the battery '
                + 'being low, which she read, agreed with, and put back in the '
                + 'cupboard.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'scanner-dead' },
      ],
    },
    {
      id: 'scanner-back',
      npc_line: 'It is on. It was batteries. I am not going to say anything '
        + 'else about it and I would take it as a kindness if you did not '
        + 'either.',
      options: [
        { label: 'Take it as a kindness and say nothing' },
      ],
    },
  ],
};

const SALES_NEW_STARTER: DialogueTree = {
  id: 'dialogue/sales-new-starter',
  speaker: COMPANY_IDS.kwame,
  tickets: [
    'ticket:mailbox-access',
    'ticket:sendas-missing',
    // And the pool's one (E11, 0.34.0 slice 2): the second factor that was
    // bound to a handset belonging to somebody else's company.
    'ticket:pool-sales-new-mfa',
  ],
  root: 'access',
  roots: {
    'ticket:mailbox-access': 'access',
    'ticket:sendas-missing': 'send',
    'ticket:pool-sales-new-mfa': 'agency-phone',
  },
  resolved_roots: {
    'ticket:mailbox-access': 'in',
    'ticket:sendas-missing': 'sent',
    'ticket:pool-sales-new-mfa': 'codes-back',
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
    /* -- the pool: the codes that went back to the agency --------------- */
    {
      id: 'agency-phone',
      npc_line: 'I am so sorry. The code app has no codes in it. I think this '
        + 'one is my fault, although I have been through it four times and I '
        + 'am not sure at which point it became my fault.',
      options: [
        {
          label: 'Ask what phone the codes were on before this one',
          next: 'agency-posted',
          effects: [
            { asks: true },
            {
              reveal: 'The authenticator was set up on the agency handset, '
                + 'which went back in the post on Friday in the envelope they '
                + 'provided. Nothing is broken; the binding is simply not there '
                + 'any more.',
            },
          ],
        },
        {
          label: 'Ask how you are meant to know he is who he says he is',
          next: 'agency-prove',
          effects: [{ asks: true }],
        },
        { label: 'Tell him this is not his fault and it is fixable' },
      ],
    },
    {
      id: 'agency-posted',
      npc_line: 'The agency one. I posted it back on Friday in their envelope, '
        + 'because their letter said to post it back on Friday in their '
        + 'envelope. Nobody said anything about the codes being on it.',
      options: [
        {
          label: 'Ask how you are meant to know he is who he says he is',
          next: 'agency-prove',
          effects: [{ asks: true }],
        },
        { label: 'Tell him nobody ever says anything about the codes' },
      ],
    },
    {
      id: 'agency-prove',
      npc_line: 'Oh - good, yes, you should check. I have been here a '
        + 'fortnight, so I do not think you would know my voice. There is a '
        + 'desk phone, and there was an envelope in my induction pack that I '
        + 'have not opened because I did not know what it was for.',
      options: [
        { label: 'Tell him what the envelope is for, and to keep it' },
        { label: 'Go back to the top', next: 'agency-phone' },
      ],
    },
    {
      id: 'codes-back',
      npc_line: 'There are numbers. Changing numbers. And an email saying '
        + 'somebody re-registered my authenticator, which I assume is you, and '
        + 'which I am pleased to have got, if that is the right thing to say.',
      options: [
        { label: 'Confirm it was you, and say that is exactly what it is for' },
      ],
    },
  ],
};

const FINANCE_NEW_STARTER: DialogueTree = {
  id: 'dialogue/finance-new-starter',
  speaker: COMPANY_IDS.rob,
  // And a machine with no sound on it (E11, 0.34.0 slice 2), which he reports
  // the way a man three weeks in reports everything: unsure whether it is a
  // fault or simply how it is here.
  tickets: ['ticket:licence-exhausted', 'ticket:pool-finance-sound'],
  root: 'first-day',
  roots: {
    'ticket:licence-exhausted': 'first-day',
    'ticket:pool-finance-sound': 'sound',
  },
  resolved_root: 'after',
  resolved_roots: {
    'ticket:licence-exhausted': 'after',
    'ticket:pool-finance-sound': 'sound-done',
  },
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
    {
      id: 'sound',
      npc_line: 'There is no sound on this one. Little red cross on the '
        + 'speaker. I did not want to raise it if that is just how they are '
        + 'set up here, but somebody said I should ask.',
      options: [
        {
          label: 'Ask whether it has ever made a sound since he arrived',
          next: 'sound-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Read what the cross on the icon is reporting',
          effects: [
            {
              reveal: 'That mark is the audio service not running rather than '
                + 'a speaker or a lead being wrong, which is why it is silent '
                + 'in everything and why nothing he plugs in changes it.',
            },
          ],
        },
        { label: 'Tell him it is not how they are set up here' },
      ],
    },
    {
      id: 'sound-q',
      npc_line: 'Not once, now you say it. I assumed the finance ones were '
        + 'locked down. I have been watching training videos with the '
        + 'subtitles on for three weeks.',
      options: [
        { label: 'Back to the top', next: 'sound' },
        { label: 'Go and start it' },
      ],
    },
    {
      id: 'sound-done',
      npc_line: 'That is sound. Thank you. I will stop assuming things are '
        + 'meant to be broken.',
      options: [{ label: 'Log the fix' }],
    },
  ],
};

const LATE_SHIFT: DialogueTree = {
  id: 'dialogue/late-shift',
  speaker: COMPANY_IDS.owen,
  tickets: [
    'ticket:vacuum-tuesday',
    'ticket:vacuum-thursday',
    // The pool's two (E11, 0.34.0 slice 2). Both are the shift that starts at
    // six: a queue nobody was awake to see build up, and a password policy
    // that expires credentials at an hour when there is nobody to ask.
    'ticket:pool-despatch-queue',
    'ticket:pool-despatch-expired',
  ],
  root: 'tuesday',
  roots: {
    'ticket:vacuum-tuesday': 'tuesday',
    'ticket:vacuum-thursday': 'thursday',
    'ticket:pool-despatch-queue': 'ajax-stack',
    'ticket:pool-despatch-expired': 'password-box',
  },
  resolved_roots: {
    'ticket:vacuum-tuesday': 'back-up',
    'ticket:vacuum-thursday': 'the-note',
    'ticket:pool-despatch-queue': 'ajax-clear',
    'ticket:pool-despatch-expired': 'password-done',
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
    /* -- the pool: the stack on the Ajax at six in the morning ---------- */
    {
      id: 'ajax-stack',
      npc_line: 'The Ajax has a stack of things on it and is printing none of '
        + 'them. It is on, it is awake, it has paper. It is just sat there '
        + 'with twelve jobs and a light going round.',
      options: [
        {
          label: 'Ask him to read the queue out, sizes and all',
          next: 'ajax-front',
          effects: [
            { asks: true },
            {
              reveal: 'The job at the front of the queue is five hundred '
                + 'kilobytes and is not a delivery note; the eleven behind it '
                + 'are all the same size and all waiting their turn behind it.',
            },
          ],
        },
        {
          label: 'Ask what time the first of them went on',
          next: 'ajax-when',
          effects: [{ asks: true }],
        },
        { label: 'Tell him not to send them again until you call back' },
      ],
    },
    {
      id: 'ajax-front',
      npc_line: 'Top one is five hundred and something kilobytes. The rest are '
        + 'all six thousand-odd, which is what a delivery note is. So the big '
        + 'one is not one of ours, and the big one is the one at the front.',
      options: [
        { label: 'Go back to the top', next: 'ajax-stack' },
        { label: 'Tell him that is the ticket answered, and he answered it' },
      ],
    },
    {
      id: 'ajax-when',
      npc_line: 'Four minutes past six. I know because I got in at six, put '
        + 'the kettle on, and by the time I sat down there was already '
        + 'something on it that was not mine. Mine start at seven minutes past.',
      options: [
        {
          label: 'Ask him to read the queue out, sizes and all',
          next: 'ajax-front',
          effects: [
            { asks: true },
            {
              reveal: 'The job at the front of the queue is five hundred '
                + 'kilobytes and is not a delivery note; the eleven behind it '
                + 'are all the same size and all waiting their turn behind it.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'ajax-stack' },
      ],
    },
    {
      id: 'ajax-clear',
      npc_line: 'It is going. The lorries will go at six and they will have '
        + 'paper with them. Whoever sent the big one will send it again and we '
        + 'will do this on Thursday, but that is Thursday\'s business.',
      options: [
        { label: 'Agree to make it Thursday\'s business' },
      ],
    },
    /* -- and the password that expired before anybody was in ------------ */
    {
      id: 'password-box',
      npc_line: 'A box came up at six this morning. I have written it down, '
        + 'because I have learned that is the useful thing to do: "Your '
        + 'password has expired. Click Continue to change it."',
      options: [
        {
          label: 'Ask what happened after he clicked Continue',
          next: 'password-tried',
          effects: [
            { asks: true },
            {
              reveal: 'He clicked Continue, was asked for the old password and '
                + 'two copies of a new one, and got as far as finding out that '
                + 'the new one may not be the old one.',
            },
          ],
        },
        {
          label: 'Ask whether it let him in at all',
          next: 'password-in',
          effects: [{ asks: true }],
        },
        { label: 'Tell him the box was right and he did the right thing' },
      ],
    },
    {
      id: 'password-tried',
      npc_line: 'It wanted the old one and two of the new one, and then it '
        + 'told me the new one could not be the old one. Which it was. I had '
        + 'been using the old one for four years and I am fond of it.',
      options: [
        { label: 'Ask whether it let him in at all', next: 'password-in',
          effects: [{ asks: true }] },
        { label: 'Sympathise about the old one, briefly' },
      ],
    },
    {
      id: 'password-in',
      npc_line: 'It let me in for the shift. It just asks again every time I '
        + 'go anywhere, which at six in the morning with nobody to ring is a '
        + 'long five hours.',
      options: [
        { label: 'Go back to the top', next: 'password-box' },
        { label: 'Tell him nobody should have to do five hours of that' },
      ],
    },
    {
      id: 'password-done',
      npc_line: 'Right. New one. I have written it on nothing and told nobody, '
        + 'which I gather is the whole idea. It will ask me to change it again '
        + 'the moment I log on, will it.',
      options: [
        { label: 'Say yes, and say why that is the flag working' },
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
  // And the trust relationship (E11, 0.34.0 slice 2), which is the same man
  // again: he photographs the error, reads it out accurately, and concludes
  // the fault is his own for having been the one it happened to.
  // And the audit queue's arithmetic item (E9, 0.36.0): one desk, genuinely,
  // and a number underneath it that the nine cells do not make.
  tickets: [
    'ticket:phishing-report',
    'ticket:pool-marketing-trust',
    'ticket:audit-marketing-spooler',
  ],
  root: 'sorry',
  roots: {
    'ticket:audit-marketing-spooler': 'nothing-prints',
    'ticket:phishing-report': 'sorry',
    'ticket:pool-marketing-trust': 'trust',
  },
  resolved_root: 'after',
  resolved_roots: {
    'ticket:audit-marketing-spooler': 'nothing-prints-after',
    'ticket:phishing-report': 'after',
    'ticket:pool-marketing-trust': 'trust-done',
  },
  // He also messages you on the Thursday, mid-morning, with a quick question
  // that is not a ticket and never was - the malignant half of the cost model
  // in a chat window rather than down a phone. A red dot slides it (chat
  // READS_THE_DOT); an honest one takes the message and the twenty-three
  // minutes back onto the work. Same interruption family, one register over.
  call_roots: ['chat-dennis', 'chat-dennis-shaky'],
  nodes: [
    {
      // The audit queue's arithmetic item (E9, 0.36.0). One desk, genuinely -
      // and a deadline, which is the urgency half the filing got right.
      id: 'nothing-prints',
      npc_line: 'Nothing at all comes out of mine. Both people either side of '
        + 'me print off the same printer without a murmur. The proof has to be '
        + 'signed on paper by five by a man who will not read a screen.',
      options: [
        {
          label: 'Ask what happens when he prints',
          next: 'nothing-prints-what',
          effects: [
            { asks: true },
            { reveal: 'The spooler on Dennis\'s own machine is stopped, so his jobs never leave the desk. It is his machine and nobody else\'s.' },
          ],
        },
        { label: 'Tell him you will look at his machine' },
      ],
    },
    {
      id: 'nothing-prints-what',
      npc_line: 'Nothing happens. No error, no queue, no anything. It is as '
        + 'though I have not pressed it, and I have, forty times.',
      options: [
        { label: 'Go back to the top', next: 'nothing-prints' },
      ],
    },
    {
      id: 'nothing-prints-after',
      npc_line: 'It has printed. All forty of them. I am going to have a very '
        + 'quiet word with the recycling.',
      options: [{ label: 'Leave him to it' }],
    },

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
    {
      id: 'chat-dennis',
      npc_line: 'Sorry to ping. Quick one, not urgent - is the shared calendar '
        + 'meant to be an hour out for everyone, or is it just showing wrong on '
        + 'mine? I did not want to raise a whole ticket if it is just me.',
      options: [
        {
          label: 'Tell him a calendar an hour out is everyone, and it is a '
            + 'clocks thing, not an IT thing',
          next: 'chat-dennis-clocks',
        },
        {
          label: 'Ask him to raise it properly if it is still wrong tomorrow',
          next: 'chat-dennis-tomorrow',
        },
      ],
    },
    {
      id: 'chat-dennis-clocks',
      npc_line: 'Oh. The clocks. Of course. I have been staring at it since '
        + 'nine wondering if I had double-booked myself into last week. Thank '
        + 'you. Sorry. Back to it.',
      options: [
        { label: 'Tell him it is fine and close the chat' },
      ],
    },
    {
      id: 'chat-dennis-tomorrow',
      npc_line: 'Right, yes. If it is still an hour out tomorrow I will do a '
        + 'ticket. It is probably nothing. It is almost certainly nothing. '
        + 'Sorry to have pinged.',
      options: [
        { label: 'Tell him it is no trouble and close the chat' },
      ],
    },
    {
      id: 'chat-dennis-shaky',
      npc_line: 'Sorry - is this a bad moment? It reads like a bad moment. It '
        + 'is only a quick one about the shared calendar being an hour out, and '
        + 'it can absolutely wait, I should not have pinged.',
      options: [
        {
          label: 'Tell him a calendar an hour out is everyone, and it is a '
            + 'clocks thing, not an IT thing',
          next: 'chat-dennis-clocks',
        },
      ],
    },
    {
      id: 'trust',
      npc_line: 'It says the trust relationship between this workstation and '
        + 'the primary domain failed. I took a photograph of it. I got on '
        + 'fine at the machine next to mine, so it is definitely this one, '
        + 'and I am sorry - I do not know what I did to it.',
      options: [
        {
          label: 'Ask what the machine beside him did differently',
          next: 'trust-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Check whether anything else is failing to sign in',
          effects: [
            {
              reveal: 'Nothing he did, and it is not his machine. Signing on '
                + 'to a domain runs over a channel each machine keeps with the '
                + 'directory, and the service that maintains those channels is '
                + 'not running - so a machine that still holds a live one '
                + 'carries on as normal while any machine that has to '
                + 're-establish it is told the trust failed.',
            },
          ],
        },
        { label: 'Tell him it is not something he did' },
      ],
    },
    {
      id: 'trust-q',
      npc_line: 'It was already on, I think - Priya had not locked it since '
        + 'yesterday. Does that matter? It sounds like it might matter, from '
        + 'the way you asked.',
      options: [
        { label: 'Back to the top', next: 'trust' },
        { label: 'Go and look at the domain controller' },
      ],
    },
    {
      id: 'trust-done',
      npc_line: 'I am back on. And you are sure it was not me. I am going to '
        + 'keep the photograph anyway.',
      options: [{ label: 'Log the fix' }],
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
  tickets: [
    'ticket:vpn-month-end',
    'ticket:coverup-backup',
    // The pool's two (E11, 0.34.0 slice 2): the warning the whole building has
    // been clicking through, and an empty window he has decided is the network.
    'ticket:pool-portal-cert',
    'ticket:pool-accounts-browse',
  ],
  root: 'itself',
  roots: {
    'ticket:vpn-month-end': 'month-end',
    'ticket:coverup-backup': 'itself',
    'ticket:pool-portal-cert': 'portal-warning',
    'ticket:pool-accounts-browse': 'neighbourhood',
  },
  resolved_roots: {
    'ticket:vpn-month-end': 'month-end-after',
    'ticket:coverup-backup': 'after',
    'ticket:pool-portal-cert': 'portal-clean',
    'ticket:pool-accounts-browse': 'neighbourhood-back',
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
    /* -- the pool: the warning everybody has been trained to click ------ */
    {
      id: 'portal-warning',
      npc_line: 'The timesheet site puts up a page saying it cannot be '
        + 'trusted. I have clicked past it, everybody has clicked past it, and '
        + 'I mention it only because we have now taught the whole of Accounts '
        + 'to click past a security warning to fill in a timesheet.',
      options: [
        {
          label: 'Ask him to read the warning out, including the small print',
          next: 'portal-since',
          effects: [
            { asks: true },
            {
              reveal: 'The warning is a date rather than a fault: the '
                + 'certificate on the portal ran out over the weekend, and '
                + 'every browser in the building started saying so at nine on '
                + 'Monday.',
            },
          ],
        },
        {
          label: 'Ask who else is seeing it',
          next: 'portal-everybody',
          effects: [{ asks: true }],
        },
        { label: 'Thank him for raising the part that is actually the problem' },
      ],
    },
    {
      id: 'portal-since',
      npc_line: 'It says the certificate for this site expired on the '
        + 'thirteenth. Which was Sunday. So it did not break, it simply ran '
        + 'out, like a road tax.',
      options: [
        { label: 'Ask who else is seeing it', next: 'portal-everybody',
          effects: [{ asks: true }] },
        { label: 'Tell him that is very nearly exactly what it is' },
      ],
    },
    {
      id: 'portal-everybody',
      npc_line: 'Everybody. Every desk. Nobody has said anything because '
        + 'everybody assumed somebody else had, which I believe is how most of '
        + 'the interesting things in this building happen.',
      options: [
        {
          label: 'Ask him to read the warning out, including the small print',
          next: 'portal-since',
          effects: [
            { asks: true },
            {
              reveal: 'The warning is a date rather than a fault: the '
                + 'certificate on the portal ran out over the weekend, and '
                + 'every browser in the building started saying so at nine on '
                + 'Monday.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'portal-warning' },
      ],
    },
    {
      id: 'portal-clean',
      npc_line: 'No warning. Straight in. I would like it on the record that '
        + 'the whole of Accounts can now go back to not reading things, which '
        + 'is where we are all happiest.',
      options: [
        { label: 'Put it on the record in almost those words' },
      ],
    },
    /* -- and the window with nothing in it ------------------------------ */
    {
      id: 'neighbourhood',
      npc_line: 'Network Neighbourhood is empty. Not an error - empty. I went '
        + 'looking for a machine whose name I half remember and there is '
        + 'nothing in there at all. Has the network gone?',
      options: [
        {
          label: 'Ask what still works from that desk',
          next: 'neighbourhood-else',
          effects: [
            { asks: true },
            {
              reveal: 'Everything that reaches a machine by name still works '
                + 'from that desk and only the browsing list is empty, which '
                + 'puts it on ACCTS-03 rather than on the network.',
            },
          ],
        },
        {
          label: 'Ask what he was looking for in there',
          next: 'neighbourhood-looking',
          effects: [{ asks: true }],
        },
        { label: 'Tell him the network has not gone' },
      ],
    },
    {
      id: 'neighbourhood-else',
      npc_line: 'Mail is fine. My drives are fine. I printed something two '
        + 'minutes ago. So everything works and the list of everything is '
        + 'empty, which is somehow more unsettling.',
      options: [
        { label: 'Go back to the top', next: 'neighbourhood' },
        { label: 'Explain what that window is a list OF' },
      ],
    },
    {
      id: 'neighbourhood-looking',
      npc_line: 'A machine called something like ACCTS-OLD. There is a folder '
        + 'on it from before the merger and I have to find a journal in it '
        + 'twice a year, and this is the twice.',
      options: [
        {
          label: 'Ask what still works from that desk',
          next: 'neighbourhood-else',
          effects: [
            { asks: true },
            {
              reveal: 'Everything that reaches a machine by name still works '
                + 'from that desk and only the browsing list is empty, which '
                + 'puts it on ACCTS-03 rather than on the network.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'neighbourhood' },
      ],
    },
    {
      id: 'neighbourhood-back',
      npc_line: 'There is a list again. Eleven machines, three of which I have '
        + 'never heard of, and one of them is ACCTS-OLD. I am going to go and '
        + 'be quietly pleased about this.',
      options: [
        { label: 'Let him be quietly pleased' },
      ],
    },
  ],
};

const HR: DialogueTree = {
  id: 'dialogue/hr',
  speaker: COMPANY_IDS.yolanda,
  // And a starter who can do everything except print (E11, 0.34.0 slice 2).
  // It is the same woman from the other end: the one who chases a report
  // nobody ran is also the one who checks the form twice before she rings.
  tickets: ['ticket:hr-report-macro', 'ticket:pool-hr-print-group'],
  root: 'three',
  roots: {
    'ticket:hr-report-macro': 'three',
    'ticket:pool-hr-print-group': 'starter',
  },
  resolved_root: 'after',
  resolved_roots: {
    'ticket:hr-report-macro': 'after',
    'ticket:pool-hr-print-group': 'starter-done',
  },
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
    {
      id: 'starter',
      npc_line: 'I have a starter on the second floor who cannot print. She '
        + 'can log on, she has her mail, she can open the shared drives. She '
        + 'presses print and it simply goes. No error, no queue, nothing. I '
        + 'have been through the starter form twice and it was all done.',
      options: [
        {
          label: 'Ask whether anything at all comes back when she prints',
          next: 'starter-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Compare her account against somebody who can print',
          effects: [
            {
              reveal: 'Everything on the form was done and the form does not '
                + 'cover this: printing here is a membership, held separately '
                + 'from the account and from the drives. Without it the server '
                + 'takes the job politely and throws it away, which is why '
                + 'there is no error for her to read out to you.',
            },
          ],
        },
        { label: 'Tell her you will sort the starter out' },
      ],
    },
    {
      id: 'starter-q',
      npc_line: 'Nothing whatsoever. She said it was like printing into a '
        + 'cupboard. She has been emailing things to the girl next to her and '
        + 'asking her to print them, which I only found out this morning.',
      options: [
        { label: 'Back to the top', next: 'starter' },
        { label: 'Go and put it right' },
      ],
    },
    {
      id: 'starter-done',
      npc_line: 'She has printed. Thank you. And I will get that put on the '
        + 'form, before the next one spends a fortnight printing into a '
        + 'cupboard.',
      options: [{ label: 'Log the fix' }],
    },
  ],
};

/**
 * Facilities, and the only permanent fix in the authored week.
 *
 * The sticky note is a real verb with a real outcome and it is the closing half
 * of the recurring arc - which is why Vic was a contact before he was ever a
 * reporter. He had no ticket at all until the pool arrived (E11, 0.34.0 slice
 * 2), and the one he has now is the shape his job makes: Facilities came off
 * the staff payroll onto a contract, and the run that processes leavers reads
 * the payroll list.
 */
const FACILITIES: DialogueTree = {
  id: 'dialogue/facilities',
  speaker: COMPANY_IDS.vic,
  tickets: ['ticket:pool-facilities-disabled'],
  root: 'vic',
  // Named per ticket even though he only files one, because his `root` is the
  // small talk a passer-by gets and a man who cannot log on is not making small
  // talk. Without this the conversation about his own ticket would open on the
  // second-floor heating.
  roots: { 'ticket:pool-facilities-disabled': 'switched-off' },
  resolved_root: 'switched-back-on',
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
    /* -- the pool: the man the leavers run has retired ------------------ */
    {
      id: 'switched-off',
      npc_line: 'The computer says I do not work here. I have written down '
        + 'what it says: "Your account has been disabled. Please see your '
        + 'system administrator." I am holding the keys to the second floor '
        + 'and I would like somebody to tell me whether I still should be.',
      options: [
        {
          label: 'Ask what changed about Facilities at the end of the quarter',
          next: 'switched-off-when',
          effects: [
            { asks: true },
            {
              reveal: 'Facilities came off the staff payroll and onto a '
                + 'contract at the end of the quarter, and the run that '
                + 'processes leavers reads the payroll list. It did exactly '
                + 'what it is written to do.',
            },
          ],
        },
        {
          label: 'Ask him to read the message out again, all of it',
          next: 'switched-off-words',
          effects: [{ asks: true }],
        },
        { label: 'Tell him he works here and to hold on to the keys' },
      ],
    },
    {
      id: 'switched-off-when',
      npc_line: 'We went onto the contract. Same job, same me, same van. '
        + 'Payroll stopped paying me and the contract started, and I signed '
        + 'something about it in a corridor.',
      options: [
        { label: 'Go back to the top', next: 'switched-off' },
        { label: 'Tell him that is the whole of it, and it is not about him' },
      ],
    },
    {
      id: 'switched-off-words',
      npc_line: 'Disabled. Not locked, not expired - I have had both of those '
        + 'and they say something else. This one says disabled and it says see '
        + 'your system administrator, which is a phrase I have never had to '
        + 'read out loud before.',
      options: [
        {
          label: 'Ask what changed about Facilities at the end of the quarter',
          next: 'switched-off-when',
          effects: [
            { asks: true },
            {
              reveal: 'Facilities came off the staff payroll and onto a '
                + 'contract at the end of the quarter, and the run that '
                + 'processes leavers reads the payroll list. It did exactly '
                + 'what it is written to do.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'switched-off' },
      ],
    },
    {
      id: 'switched-back-on',
      npc_line: 'I am in. Good. I shall go and unlock the second floor, and I '
        + 'shall not mention to anybody that for forty minutes this morning I '
        + 'was, technically, a member of the public.',
      options: [
        { label: 'Agree never to mention the forty minutes' },
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
