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
import type { DialogueTree } from './types';

const ACCOUNTS_PAYABLE: DialogueTree = {
  id: 'dialogue/accounts-payable',
  speaker: COMPANY_IDS.priya,
  tickets: ['ticket:mfa-reregister'],
  root: 'phone',
  resolved_root: 'after',
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
          label: 'Ask her to confirm her payroll number and her start date',
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
          label: 'Ask her to confirm her payroll number and her start date',
          next: 'verify',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'phone' },
        { label: 'Tell her that is the whole answer, and it is fixable' },
      ],
    },
    {
      id: 'verify',
      npc_line: 'My payroll number? Do you not have my payroll number? You are '
        + 'IT. You have everything. I have seen the screens.',
      options: [
        {
          label: 'Explain that having it and hearing it are different things',
          next: 'checked',
          effects: [
            {
              action: HELPDESK_ACTIONS.accountVerifyIdentity,
              target: COMPANY_IDS.priyaAccount,
            },
          ],
        },
        { label: 'Go back to the top', next: 'phone' },
      ],
    },
    {
      id: 'checked',
      npc_line: 'Fine. 4471, and I started the March before last, and my '
        + 'manager is Yolanda, and my desk is under the vent that works. Is '
        + 'that enough of me?',
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
      npc_line: 'Since seven. There is a payment run at eleven and I cannot '
        + 'approve it. Can you not just do it? You know it is me. We have '
        + 'spoken about the kettle.',
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
          label: 'Ask her to confirm her payroll number and her start date',
          next: 'verify',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'phone' },
      ],
    },
    {
      id: 'done',
      npc_line: 'There is a code. There is a code and it is changing and I '
        + 'have never been so pleased to see six numbers.',
      options: [
        { label: 'Tell her to keep the recovery code somewhere else' },
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
  tickets: ['ticket:stale-device-relock'],
  root: 'again',
  resolved_root: 'after',
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
  nodes: [
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
  nodes: [
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
        { label: 'Tell him he did exactly the right thing', next: 'told' },
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
        { label: 'Tell him he did exactly the right thing', next: 'told' },
        { label: 'Go back to the top', next: 'sorry' },
      ],
    },
    {
      id: 'others',
      npc_line: 'The two either side of me. I told them not to click it. One '
        + 'of them had already replied to it saying "is this you".',
      options: [
        { label: 'Tell him he did exactly the right thing', next: 'told' },
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
  tickets: ['ticket:coverup-backup'],
  root: 'itself',
  resolved_root: 'after',
  nodes: [
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
