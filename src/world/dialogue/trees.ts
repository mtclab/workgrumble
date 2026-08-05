import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { WORLD_IDS } from '../demo-world';
import { BODGE_TREES } from './bodge-trees';
import { MSP_TREES } from './msp-trees';
import { STAFF_TREES } from './staff';
import type { DialogueTree } from './types';

/**
 * Every conversation in the building, as data.
 *
 * House rules for writing one:
 * - the reporter voices the PROBLEM as they experience it, never the cause;
 * - exactly one option per tree is the right question, and it carries the
 *   `reveal` that writes the cause onto the ticket;
 * - every option that puts a QUESTION to a reporter carries `asks`, and no
 *   option that merely tells them something does: that mark is what lets the
 *   SLA be parked on them, so it has to mean what it says;
 * - a tree with a ticket also has a `resolved_root`, so the person reacts to
 *   the fix instead of repeating their complaint at a closed ticket;
 * - the comedy is recognition, never contempt: the user is wrong about the
 *   cause and completely right about their own experience.
 */

const ROTATED_SCREEN: DialogueTree = {
  id: 'dialogue/sales',
  speaker: COMPANY_IDS.ada,
  tickets: [
    'ticket:rotated-screen',
    'ticket:flat-mouse',
    'ticket:vpn-cert-dup-ada',
  ],
  root: 'complaint',
  roots: {
    'ticket:rotated-screen': 'complaint',
    'ticket:flat-mouse': 'frozen',
    'ticket:vpn-cert-dup-ada': 'vpn',
  },
  resolved_roots: {
    'ticket:rotated-screen': 'after',
    'ticket:flat-mouse': 'mouse-after',
    'ticket:vpn-cert-dup-ada': 'vpn-after',
  },
  nodes: [
    {
      id: 'complaint',
      npc_line: 'I want it on record that I have been hacked. My screen is '
        + 'sideways, I have touched nothing, and I have read about this.',
      options: [
        {
          label: 'Ask what the screen was doing when she left on Friday',
          next: 'friday',
          effects: [{ asks: true }],
        },
        {
          label: 'Ask whether anybody else was at her desk on Friday',
          next: 'colleague',
          effects: [
            { asks: true },
            {
              reveal: 'Ada mentions a colleague was "showing her something" '
                + 'at her keyboard on Friday afternoon.',
            },
          ],
        },
        {
          // The milder register on a diagnostic beat, and the same question:
          // the `asks` and the reveal are the neutral option's, so the truth
          // lands identically and the beat goes the same place ('colleague').
          // All the tone adds is the flat contempt of somebody who has heard
          // "I have been hacked" once too often - and it still costs.
          label: 'Ask her, flatly, whether anybody was at her desk, because it '
            + 'is that and not hackers, it is always that',
          tone: 'aggressive',
          next: 'colleague',
          effects: [
            { asks: true },
            {
              reveal: 'Ada mentions a colleague was "showing her something" '
                + 'at her keyboard on Friday afternoon.',
            },
            {
              action: HELPDESK_ACTIONS.reporterRebuff,
              target: 'ticket:rotated-screen',
              params: {
                reaction_first: 'Ada bristles. "There is no need to take that '
                  + 'tone. I am reporting a crime." She answers the question '
                  + 'anyway, because underneath it she wants the screen fixed.',
                reaction_again: 'Ada, colder now: "That is twice you have '
                  + 'spoken to me like that. I shall be putting it in an email, '
                  + 'with the times on it."',
              },
            },
          ],
        },
        {
          label: 'Ask her to read the screen out, tilt and all',
          next: 'tilt',
          effects: [{ asks: true }],
        },
        { label: 'Tell her you are looking at it now' },
      ],
    },
    {
      id: 'friday',
      npc_line: 'Fine. Perfectly fine. I locked it, I went home, I came back '
        + 'and it is like this. You do not do that to a screen by accident.',
      options: [
        {
          label: 'Ask whether anybody else was at her desk on Friday',
          next: 'colleague',
          effects: [
            { asks: true },
            {
              reveal: 'Ada mentions a colleague was "showing her something" '
                + 'at her keyboard on Friday afternoon.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'complaint' },
        { label: 'Tell her you are looking at it now' },
      ],
    },
    {
      id: 'colleague',
      npc_line: 'Well. Gareth was showing me a shortcut on my keyboard on '
        + 'Friday. But he would not hack me. He cannot hack the coffee '
        + 'machine, and it has one button.',
      options: [
        {
          label: 'Ask which keys Gareth pressed',
          next: 'keys',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'complaint' },
        { label: 'Thank her and get on with it' },
      ],
    },
    {
      id: 'keys',
      npc_line: 'Control, something, and an arrow. Then he laughed and went '
        + 'to lunch. Is that hacking? That sounds like hacking.',
      options: [
        { label: 'Tell her that is a screen-rotation shortcut', next: 'tilt' },
        {
          // Fixed over the phone, by the person whose screen it is. The
          // ticket closes on the world changing, so the conversation lands on
          // her reaction rather than on the branch this option names.
          label: 'Talk her through pressing Control, Alt and Up right now',
          next: 'tilt',
          effects: [
            {
              action: HELPDESK_ACTIONS.machineSetDisplayRotation,
              target: COMPANY_IDS.adaMachine,
              params: { rotation: 0 },
            },
          ],
        },
        {
          // The aggressive register, on the beat that fixes it. The rotate is
          // byte-identical to the neutral option above - the screen goes back
          // the same way - and the tone is the ONLY difference: she is told,
          // rudely, that she was never hacked, and the rebuff pays for it. This
          // is the owner's catharsis, and it is deliberately out of proportion
          // to a woman who is only confused, which is why it costs.
          label: 'Rotate it back and tell her she was not hacked, it was '
            + 'Gareth, and she can fuck off with the crime report',
          tone: 'aggressive',
          next: 'tilt',
          effects: [
            {
              action: HELPDESK_ACTIONS.machineSetDisplayRotation,
              target: COMPANY_IDS.adaMachine,
              params: { rotation: 0 },
            },
            {
              action: HELPDESK_ACTIONS.reporterRebuff,
              target: 'ticket:rotated-screen',
              params: {
                reaction_first: 'Ada goes very still. "I beg your pardon. I '
                  + 'shall be mentioning your manner to somebody, and I mean '
                  + 'that." The screen is, however, the right way up.',
                reaction_again: 'Ada does not miss a beat this time. "That is '
                  + 'twice. I have now mentioned your manner to two somebodies, '
                  + 'and one of them has a title."',
              },
            },
          ],
        },
        { label: 'Go back to the top', next: 'complaint' },
        { label: 'Say you will have it back by eleven' },
      ],
    },
    {
      id: 'tilt',
      npc_line: 'It says everything it usually says, only I have to read it '
        + 'like this. I have been working like this since nine. My neck has '
        + 'opinions.',
      options: [
        { label: 'Go back to the top', next: 'complaint' },
        { label: 'Tell her to sit up, this takes a moment' },
      ],
    },
    {
      id: 'frozen',
      npc_line: 'It has frozen. Completely. Nothing moves, nothing clicks, and '
        + 'the arrow is exactly where I left it when I went to lunch.',
      options: [
        {
          label: 'Ask her to read out everything on the screen, notices and all',
          next: 'notice',
          effects: [
            { asks: true },
            {
              reveal: 'She reads out a low-battery notice for a wireless mouse '
                + 'and calls it a separate issue she will raise later.',
            },
          ],
        },
        {
          label: 'Ask whether the keyboard still does anything',
          next: 'keyboard',
          effects: [{ asks: true }],
        },
        { label: 'Tell her not to hold the power button in yet' },
      ],
    },
    {
      id: 'notice',
      npc_line: 'There is a little box in the corner about a battery in a '
        + 'mouse. That is a different thing. I will raise that separately, '
        + 'when this is sorted.',
      options: [
        { label: 'Suggest, gently, that it might be the same thing', next: 'same' },
        { label: 'Go back to the frozen machine', next: 'frozen' },
      ],
    },
    {
      id: 'same',
      npc_line: 'It is not the same thing. The mouse is a mouse. The computer '
        + 'is the computer. ... It is the same thing, is it.',
      options: [
        { label: 'Say nothing and go and find two batteries' },
      ],
    },
    {
      id: 'keyboard',
      npc_line: 'The keyboard is fine. I have typed my password four times to '
        + 'prove it and it has accepted all four, which I find infuriating.',
      options: [
        {
          label: 'Ask her to read out everything on the screen, notices and all',
          next: 'notice',
          effects: [
            { asks: true },
            {
              reveal: 'She reads out a low-battery notice for a wireless mouse '
                + 'and calls it a separate issue she will raise later.',
            },
          ],
        },
        { label: 'Go back to the frozen machine', next: 'frozen' },
      ],
    },
    {
      id: 'mouse-after',
      npc_line: 'It was the mouse. It was two batteries. I am going to need a '
        + 'moment with that, and then I am never going to mention it again.',
      options: [
        { label: 'Agree never to mention it again' },
      ],
    },
    {
      id: 'vpn',
      npc_line: 'I am at home and I cannot reach anything. I have restarted '
        + 'the laptop, the router and, at one point, my phone. Before '
        + 'contacting anybody. Which I would like noted.',
      options: [
        { label: 'Note that she restarted everything first', next: 'noted' },
        { label: 'Tell her the whole company is on this one' },
      ],
    },
    {
      id: 'noted',
      npc_line: 'Thank you. Nobody ever notes it. I shall wait. I am extremely '
        + 'good at waiting, as you know.',
      options: [
        { label: 'Go back to the connection', next: 'vpn' },
        { label: 'Leave it there and go and fix the actual thing' },
      ],
    },
    {
      id: 'vpn-after',
      npc_line: 'I am back in. So it was your end all along and my router has '
        + 'been slandered. I shall apologise to it.',
      options: [
        { label: 'Suggest she apologises to the phone as well' },
      ],
    },
    {
      id: 'after',
      npc_line: 'Oh. It is the right way up. So was it hackers, or was it '
        + 'Gareth? Because I have already told two people it was hackers.',
      options: [
        { label: 'Explain the rotation shortcut, honestly', next: 'lesson' },
        { label: 'Let her keep the better story' },
      ],
    },
    {
      id: 'lesson',
      npc_line: 'Control, Alt and an arrow. That is all it was. I am going to '
        + 'be furious about this for the rest of the week.',
      options: [
        { label: 'Suggest she shows Gareth the same shortcut, twice' },
      ],
    },
  ],
};

const LOCKED_ACCOUNT: DialogueTree = {
  id: 'dialogue/payroll',
  speaker: COMPANY_IDS.gary,
  tickets: [
    'ticket:locked-account',
    'ticket:vpn-cert-dup-gary',
    'ticket:gary-restart',
  ],
  root: 'complaint',
  roots: {
    'ticket:locked-account': 'complaint',
    'ticket:vpn-cert-dup-gary': 'remote',
    'ticket:gary-restart': 'restart-chased',
  },
  resolved_roots: {
    'ticket:locked-account': 'after',
    'ticket:vpn-cert-dup-gary': 'remote-after',
    'ticket:gary-restart': 'restart-done',
  },
  // The walk-up. Nothing in this tree points at either of them: the day puts
  // him at the desk and the window opens on whichever one the meters choose,
  // exactly as a ringing phone does.
  call_roots: ['at-the-desk', 'at-the-desk-shaky'],
  nodes: [
    {
      // The bot-frustrated register (0.5.0 slice 3): Gary has been round the
      // self-service portal's loop - it heard "password" and kept offering him a
      // reset, which does nothing to a locked account - and he has arrived at a
      // human already cross. The tone framework (0.4.1) is how the player meets
      // that: snap back in kind, or take one of the neutral roads and de-escalate.
      id: 'complaint',
      npc_line: 'I have now told your little chat robot four times that '
        + 'resetting the password does nothing, and four times it has told ME to '
        + 'reset the password. So I will say it to a person: it is not the '
        + 'password. It is the same one it has been since the merger.',
      options: [
        {
          label: 'Ask him to read the message out, word for word',
          next: 'reads',
          effects: [
            { asks: true },
            {
              reveal: 'Gary reads it out himself: "This account has been '
                + 'locked out, please contact support."',
            },
          ],
        },
        {
          // Meeting the bot-frustration in kind: the SAME question and the SAME
          // reveal as the neutral read-it-out above, going to the SAME beat -
          // the tone gate proves that, so the fix is untouched - with the flat
          // temper of somebody who has also had a morning. It costs, because it
          // is a snap at a man who is only confused, and the rebuff pays for it.
          label: 'Tell him the robot is off the table, and to read the message '
            + 'out to you, word for word, now',
          tone: 'aggressive',
          next: 'reads',
          effects: [
            { asks: true },
            {
              reveal: 'Gary reads it out himself: "This account has been '
                + 'locked out, please contact support."',
            },
            {
              action: HELPDESK_ACTIONS.reporterRebuff,
              target: 'ticket:locked-account',
              params: {
                reaction_first: 'Gary blinks. "Well - there is no need for the '
                  + 'tone, I have had the tone off the machine all morning." He '
                  + 'reads it out anyway, because underneath it he just wants in.',
                reaction_again: 'Gary, quietly now: "That is the second time. I '
                  + 'came to a person to get away from being spoken to like a '
                  + 'form. I will remember which of you it was."',
              },
            },
          ],
        },
        {
          label: 'Ask when he last logged in',
          next: 'holiday',
          effects: [{ asks: true }],
        },
        {
          label: 'Ask him to try once more while you watch',
          next: 'again',
          effects: [{ asks: true }],
        },
        { label: 'Tell him you will look at the account' },
      ],
    },
    {
      id: 'holiday',
      npc_line: 'A fortnight ago. Portugal. It rained on the Tuesday and I '
        + 'have photographs of that, if you want them.',
      options: [
        {
          label: 'Ask him to read the message out, word for word',
          next: 'reads',
          effects: [
            { asks: true },
            {
              reveal: 'Gary reads it out himself: "This account has been '
                + 'locked out, please contact support."',
            },
          ],
        },
        { label: 'Go back to the top', next: 'complaint' },
        { label: 'Tell him you will look at the account' },
      ],
    },
    {
      id: 'again',
      npc_line: 'There. Wrong again. Watch: same password, same fingers, same '
        + 'wrong. Somebody has changed something at your end.',
      options: [
        {
          label: 'Ask him to read the message out, word for word',
          next: 'reads',
          effects: [
            { asks: true },
            {
              reveal: 'Gary reads it out himself: "This account has been '
                + 'locked out, please contact support."',
            },
          ],
        },
        { label: 'Go back to the top', next: 'complaint' },
      ],
    },
    {
      id: 'reads',
      npc_line: '"This account has been locked out, please contact support." '
        + 'Which is what I have been saying. It says the password is wrong.',
      options: [
        {
          label: 'Explain that locked out is not the same as wrong',
          next: 'lesson',
        },
        { label: 'Go back to the top', next: 'complaint' },
        { label: 'Tell him to hold on, this is two clicks' },
      ],
    },
    {
      id: 'lesson',
      npc_line: 'So the password was right the whole time and the machine let '
        + 'me believe otherwise. That is worse, somehow.',
      options: [
        { label: 'Agree that it is worse, and go and unlock it' },
      ],
    },
    {
      id: 'remote',
      npc_line: 'The remote thing will not come up. I am at home on the '
        + 'payroll run. I expect this is the same as my password, because both '
        + 'of them are computers and both of them have now had a go at me.',
      options: [
        { label: 'Tell him it is not his account this time', next: 'not-you' },
        { label: 'Tell him the whole building is on this one' },
      ],
    },
    {
      id: 'not-you',
      npc_line: 'So this one is not me either. That is two things that were '
        + 'not me. I am beginning to enjoy this fortnight.',
      options: [
        { label: 'Go back to the connection', next: 'remote' },
        { label: 'Leave him enjoying it' },
      ],
    },
    {
      id: 'remote-after',
      npc_line: 'I am on. Payroll will go out. Nobody will ever know how close '
        + 'it was, which is how it has been for eleven years.',
      options: [
        { label: 'Tell him you will know' },
      ],
    },
    {
      id: 'after',
      npc_line: 'I am in. So it WAS the password, then. I knew it was '
        + 'something at your end.',
      options: [
        { label: 'Explain lockouts one more time', next: 'again-after' },
        { label: 'Let it go and take the win' },
      ],
    },
    {
      id: 'again-after',
      npc_line: 'Ten wrong tries locks it. Nobody told me that. I would have '
        + 'stopped at nine.',
      options: [
        { label: 'Tell him nine is the correct number of tries' },
      ],
    },
    /**
     * The whole payload of the walk-up, in one node with three answers.
     *
     * He is not being unreasonable and he is not trying it on: this is a
     * two-minute job, he is standing here, and raising a ticket for it feels
     * to him like paperwork about paperwork. The player's three answers are
     * all legitimate and they cost different things, which is the teaching:
     *
     * - doing it now is fastest, costs nothing today, and leaves no record
     *   anywhere that it happened, so Friday's card cannot see it;
     * - sending him to the form costs a small social beat and a ticket that
     *   turns up with a clock on it, and it is the only version of this that
     *   is worth anything at the review;
     * - saying you will get to it is the third thing people actually do, and
     *   the world treats it as the second, because he raises it anyway.
     */
    {
      id: 'at-the-desk',
      npc_line: 'Sorry - while you are here. That box about restarting has '
        + 'been on my screen since I got back from my fortnight, and I keep '
        + 'pressing the other one because payroll is open. Can you just do it '
        + 'from your end? It is two minutes and I am at lunch at twelve.',
      options: [
        {
          label: 'Restart it now, from here, and say nothing about it',
          next: 'restart-grateful',
          effects: [
            {
              action: HELPDESK_ACTIONS.machineReboot,
              target: COMPANY_IDS.garyMachine,
            },
          ],
        },
        {
          label: 'Ask him to raise it, and say what the ticket buys him',
          next: 'restart-files',
        },
        { label: 'Say you will get to it, and mean it at the time' },
      ],
    },
    {
      // The same conversation, had by somebody whose hands are going. He is
      // not slower and he is not kinder; the difference is that the shape of
      // the ask is harder to hold on to, which is what the meters actually do.
      id: 'at-the-desk-shaky',
      npc_line: 'Sorry - while you are here - are you all right? You look '
        + 'like I have caught you at something. It is only the restart box. '
        + 'It has been up since I got back from my fortnight.',
      options: [
        {
          label: 'Restart it now, from here, before you lose the thread',
          next: 'restart-grateful',
          effects: [
            {
              action: HELPDESK_ACTIONS.machineReboot,
              target: COMPANY_IDS.garyMachine,
            },
          ],
        },
        {
          label: 'Ask him to raise it, because you will forget otherwise',
          next: 'restart-files',
        },
        { label: 'Say you will get to it, and mean it at the time' },
      ],
    },
    {
      id: 'restart-grateful',
      npc_line: 'Oh, that is it? Marvellous. You are much better than the '
        + 'last one. I shall not tell anybody you did it off the books, and by '
        + 'that I mean I shall tell Payroll.',
      options: [
        { label: 'Get back to the queue, which has not moved' },
      ],
    },
    {
      id: 'restart-files',
      npc_line: 'Raise a ticket. For a restart. Right - no, fine, I take the '
        + 'point about there being a record. It is only that the form asks me '
        + 'what the impact is, and the impact is that I am mildly annoyed.',
      options: [
        {
          label: 'Tell her low impact is a real answer and the form means it',
          next: 'restart-form',
        },
        { label: 'Agree that the form is like that, and leave it there' },
      ],
    },
    {
      id: 'restart-form',
      npc_line: 'Low, then. I shall put low and I shall be brave about it. '
        + 'Give me a minute, the form is in a folder somewhere.',
      options: [
        { label: 'Say that is exactly what the queue is for' },
      ],
    },
    {
      // She raised it, so this is her chasing it - which is the price of
      // having done it properly, and it is a small price said out loud.
      id: 'restart-chased',
      npc_line: 'I raised it, as instructed. It is in your queue being a '
        + 'ticket. I am told that is better, and I am prepared to believe it.',
      options: [
        {
          label: 'Ask what the box on his screen actually says',
          next: 'restart-the-box',
          effects: [
            { asks: true },
            {
              reveal: 'The prompt has been up since some point before my fortnight and '
                + 'says the updates are already downloaded and waiting for a '
                + 'restart. Nothing is failing; PAYROLL-04 is simply a '
                + 'fortnight behind because the only thing that ever asks has '
                + 'a Later button on it.',
            },
          ],
        },
        { label: 'Confirm it is in the queue and it is not forgotten' },
        {
          label: 'Restart it now while he is standing here',
          next: 'restart-grateful',
          effects: [
            {
              action: HELPDESK_ACTIONS.machineReboot,
              target: COMPANY_IDS.garyMachine,
            },
          ],
        },
        {
          // The milder end of the register, on the same reboot. The machine
          // still goes round - the effect is the neutral one, unchanged - and
          // all the tone adds is a flat, short remark that he brought this on
          // himself. Curt, not crude, so the register reads as a range.
          label: 'Restart it, and tell him flatly the Later button was never a '
            + 'fix and he knew that a fortnight ago',
          tone: 'aggressive',
          next: 'restart-grateful',
          effects: [
            {
              action: HELPDESK_ACTIONS.machineReboot,
              target: COMPANY_IDS.garyMachine,
            },
            {
              action: HELPDESK_ACTIONS.reporterRebuff,
              target: 'ticket:gary-restart',
              params: {
                reaction_first: 'Gary, wounded: "There was no need for that. I '
                  + 'only asked. I will note that you were short with me." It '
                  + 'has, though, gone round and come back.',
                reaction_again: 'Gary is not enjoying his fortnight any more. '
                  + '"Twice, now. I am putting that in writing, which I did not '
                  + 'want to do."',
              },
            },
          ],
        },
      ],
    },
    {
      id: 'restart-the-box',
      npc_line: 'It says the updates have downloaded and it needs to restart '
        + 'to finish. It has said that since last week. I have read it every '
        + 'morning and pressed the other button every morning.',
      options: [
        { label: 'Go back to the top', next: 'restart-chased' },
        { label: 'Say the other button is the one everybody presses' },
      ],
    },
    {
      id: 'restart-done',
      npc_line: 'It went round and came back and everything is where I left '
        + 'it. And there is a record of it, which I am told is the point, and '
        + 'which I now slightly see.',
      options: [
        { label: 'Do not push the point any further than that' },
      ],
    },
  ],
};

const WEDGED_SPOOLER: DialogueTree = {
  id: 'dialogue/logistics',
  speaker: COMPANY_IDS.nina,
  tickets: ['ticket:wedged-spooler', 'ticket:vpn-cert-expired'],
  root: 'complaint',
  roots: {
    'ticket:wedged-spooler': 'complaint',
    'ticket:vpn-cert-expired': 'depot',
  },
  resolved_roots: {
    'ticket:wedged-spooler': 'after',
    'ticket:vpn-cert-expired': 'depot-after',
  },
  // She rings on the Tuesday, about the printer, while you are already on the
  // printer - which is the benign half of the cost model made of words: no
  // focus lost, and the call is how the ticket moves. The second node is the
  // same call taken by somebody whose hands are already going.
  call_roots: ['ringing-spooler', 'ringing-spooler-shaky'],
  nodes: [
    {
      id: 'complaint',
      npc_line: 'The printer is haunted. It hums, it flashes, it prints '
        + 'nothing, and last night it did all three at once with nobody in '
        + 'the building.',
      options: [
        {
          label: 'Ask what was sent to it just before it stopped',
          next: 'last-job',
          effects: [
            { asks: true },
            {
              reveal: 'Nina sent the long delivery note out of the old '
                + 'system just before the printer went quiet.',
            },
          ],
        },
        {
          label: 'Ask how many people have re-sent their jobs',
          next: 'resends',
          effects: [{ asks: true }],
        },
        {
          label: 'Ask whether the paper tray is empty',
          next: 'paper',
          effects: [{ asks: true }],
        },
        { label: 'Tell her you will go and look at the print server' },
      ],
    },
    {
      id: 'resends',
      npc_line: 'Everyone. Twice. Bev sent hers four times and then printed a '
        + 'sign asking people to stop sending things twice.',
      options: [
        {
          label: 'Ask what was sent to it just before it stopped',
          next: 'last-job',
          effects: [
            { asks: true },
            {
              reveal: 'Nina sent the long delivery note out of the old '
                + 'system just before the printer went quiet.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'complaint' },
      ],
    },
    {
      id: 'paper',
      npc_line: 'Full. I filled it. Then I filled it again out of spite. It '
        + 'is the fullest tray in the building and it prints nothing.',
      options: [
        {
          label: 'Ask what was sent to it just before it stopped',
          next: 'last-job',
          effects: [
            { asks: true },
            {
              reveal: 'Nina sent the long delivery note out of the old '
                + 'system just before the printer went quiet.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'complaint' },
      ],
    },
    {
      id: 'last-job',
      npc_line: 'The big delivery note. The one from the old system that '
        + 'always comes out looking wrong. Then everything stopped.',
      options: [
        {
          label: 'Ask whether that has happened before',
          next: 'before',
          effects: [{ asks: true }],
        },
        { label: 'Go back to the top', next: 'complaint' },
        { label: 'Tell her not to send it again until you call back' },
      ],
    },
    {
      id: 'before',
      npc_line: 'Every time somebody prints that thing. We stopped talking '
        + 'about it. We just walk to the other printer and say nothing.',
      options: [
        { label: 'Promise to write it down where somebody will read it' },
      ],
    },
    {
      id: 'depot',
      npc_line: 'I am at the depot and I cannot get in. The client says the '
        + 'connection could not be verified, which I assume is a computer '
        + 'being sniffy rather than a sentence with information in it.',
      options: [
        {
          label: 'Ask who else at the depot is having it',
          next: 'everybody',
          effects: [
            { asks: true },
            {
              reveal: 'Everybody outside the building is affected and '
                + 'everybody inside it is fine, which puts the fault on the '
                + 'way in rather than on anybody\'s laptop.',
            },
          ],
        },
        {
          label: 'Ask whether it worked yesterday',
          next: 'yesterday',
          effects: [{ asks: true }],
        },
        { label: 'Tell her you are looking at the concentrator now' },
      ],
    },
    {
      id: 'everybody',
      npc_line: 'All four of us out here, and the two drivers, and Ada is at '
        + 'home saying the same thing on the other channel. Nobody in the '
        + 'office has noticed a thing, obviously.',
      options: [
        { label: 'Go back to the depot', next: 'depot' },
        { label: 'Tell her that is the answer and she has just given it' },
      ],
    },
    {
      id: 'yesterday',
      npc_line: 'Yesterday it was fine. This morning it is not. Nothing has '
        + 'changed at this end unless somebody has changed something at that '
        + 'end, which is traditional.',
      options: [
        {
          label: 'Ask who else at the depot is having it',
          next: 'everybody',
          effects: [
            { asks: true },
            {
              reveal: 'Everybody outside the building is affected and '
                + 'everybody inside it is fine, which puts the fault on the '
                + 'way in rather than on anybody\'s laptop.',
            },
          ],
        },
        { label: 'Go back to the depot', next: 'depot' },
      ],
    },
    {
      id: 'depot-after',
      npc_line: 'We are in. All of us, at once, which was quite the moment out '
        + 'here. What was it, so I can tell them something better than '
        + '"computers".',
      options: [
        { label: 'Tell her a certificate expired, and what that means' },
      ],
    },
    {
      id: 'after',
      npc_line: 'It is printing. All of it. All forty-seven, and the sign '
        + 'about sending things twice is coming out four times.',
      options: [
        { label: 'Explain what a print queue actually is', next: 'lesson' },
        { label: 'Accept the credit for the exorcism' },
      ],
    },
    {
      id: 'lesson',
      npc_line: 'So it was a queue, not a ghost. I preferred the ghost. The '
        + 'ghost was not my delivery note.',
      options: [
        { label: 'Tell her the old system is the real haunting' },
      ],
    },
    {
      id: 'ringing-spooler',
      npc_line: 'Sorry. I know you are on it, I can see the ticket says you '
        + 'are on it. I am ringing because there is a thing I did not put on '
        + 'the ticket and I have been thinking about it since.',
      options: [
        {
          label: 'Ask what she did not put on it',
          next: 'ringing-spooler-agreed',
          effects: [
            { asks: true },
            {
              reveal: 'Nina sent the long delivery note out of the old '
                + 'system just before the printer went quiet.',
            },
          ],
        },
        {
          label: 'Tell her you are at the print server now',
          next: 'ringing-spooler-agreed',
          effects: [{ asks: true }],
        },
      ],
    },
    {
      id: 'ringing-spooler-agreed',
      npc_line: 'I sent it twice. Forty-one pages, twice, because the first '
        + 'one did not come out. I will sit on my hands now. If Bev sends '
        + 'anything I will tell you it was Bev.',
      options: [
        { label: 'Put the phone down and carry on where you were' },
      ],
    },
    {
      id: 'ringing-spooler-shaky',
      npc_line: 'Hello? You have gone very quiet. Take a second, honestly. It '
        + 'is a printer. Nobody upstairs has died about a printer yet.',
      options: [
        {
          label: 'Ask her, slowly, what she sent to it',
          next: 'ringing-spooler-agreed',
          effects: [
            { asks: true },
            {
              reveal: 'Nina sent the long delivery note out of the old '
                + 'system just before the printer went quiet.',
            },
          ],
        },
      ],
    },
  ],
};

const FAN_NOISE: DialogueTree = {
  id: 'dialogue/yourself',
  speaker: COMPANY_IDS.player,
  tickets: [WORLD_IDS.ticket],
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'You have opened a chat window with yourself, because process '
        + 'says the reporter must be contacted and you are the reporter.',
      options: [
        {
          label: 'Ask yourself when the noise started',
          next: 'when',
          effects: [
            {
              reveal: 'Your own notes: the noise started after the tower was '
                + 'moved to sweep behind the desk.',
            },
          ],
        },
        { label: 'Ask yourself whether it is getting worse', next: 'worse' },
        { label: 'Close the window before anybody sees' },
      ],
    },
    {
      id: 'when',
      npc_line: 'Thursday evening, after the cleaner shifted the tower to get '
        + 'the brush behind it. Correct about the timing. Wrong about blame.',
      options: [
        { label: 'Go back to the top', next: 'complaint' },
        { label: 'Note it on the ticket and go and look at the fan' },
      ],
    },
    {
      id: 'worse',
      npc_line: 'Yes. It now sounds like a hornet in a biscuit tin being '
        + 'asked to keep it down.',
      options: [
        { label: 'Go back to the top', next: 'complaint' },
      ],
    },
    {
      id: 'after',
      npc_line: 'Silence. You are going to notice this silence all afternoon '
        + 'and you are going to enjoy every minute of it.',
      options: [
        { label: 'Log the fix and take the win' },
      ],
    },
  ],
};

/**
 * The lead's channel. It is one thread, because he is one man and he has one
 * way of raising things: at you, in chat, when it occurs to him.
 *
 * The `phone` node is the exception to the tree's own rules and the reason it
 * is written like this: NOTHING in the tree points at it. The boss system drops
 * the conversation onto that node when he pings, which is also the tick the
 * trap ticket is raised - so the question that stops his clock and the note
 * that records the cause are only reachable once there is a ticket for them to
 * land on, and a player who opens the boss channel unprompted gets the nag.
 */
const BOSS_CHANNEL: DialogueTree = {
  id: 'dialogue/the-lead',
  speaker: COMPANY_IDS.boss,
  tickets: ['ticket:boss-phone'],
  root: 'nag',
  resolved_root: 'after',
  summoned_root: 'phone',
  nodes: [
    {
      id: 'nag',
      npc_line: 'Pat. Quick one. Are we on top of the queue? I have a call at '
        + 'eleven and I would very much like to say we are on top of it.',
      options: [
        { label: 'Say the queue is under control', next: 'relieved' },
        { label: 'Tell him what is actually in the queue', next: 'honest' },
        { label: 'Ask him to raise a ticket like everybody else', next: 'ticket' },
        { label: 'Say nothing and go back to work' },
      ],
    },
    {
      id: 'relieved',
      npc_line: 'Excellent. That is what I shall say. If it turns out we are '
        + 'not on top of it, I will be as surprised as anybody.',
      options: [
        { label: 'Go back to the top', next: 'nag' },
        { label: 'Leave it there' },
      ],
    },
    {
      id: 'honest',
      npc_line: 'Right. Yes. Well. Prioritise, that is the thing. Do the '
        + 'important ones first, and the other ones also first.',
      options: [
        { label: 'Ask which of the two firsts he means', next: 'both' },
        { label: 'Leave it there' },
      ],
    },
    {
      id: 'both',
      npc_line: 'Both, ideally. That is why we hired somebody with initiative. '
        + 'Do not let me hold you up.',
      options: [
        { label: 'Go back to the top', next: 'nag' },
        { label: 'Get back to the queue' },
      ],
    },
    {
      id: 'ticket',
      npc_line: 'I do not raise tickets, Pat. I raise concerns. The system '
        + 'for concerns is you.',
      options: [
        { label: 'Go back to the top', next: 'nag' },
        { label: 'Accept the system for concerns' },
      ],
    },
    {
      id: 'phone',
      npc_line: 'My phone has stopped getting email. I need it for the eleven '
        + 'o\'clock. Top priority, please.',
      options: [
        {
          label: 'Ask whether mail is still arriving on his desktop',
          next: 'desktop',
          effects: [
            { asks: true },
            {
              reveal: 'Mail is still landing on his desktop, so the mailbox is '
                + 'fine and the phone has lost its way in rather than its mail.',
            },
          ],
        },
        {
          label: 'Ask when the phone last had anything',
          next: 'yesterday',
          effects: [{ asks: true }],
        },
        {
          label: 'Ask how many people are affected by this',
          next: 'affected',
          effects: [{ asks: true }],
        },
        { label: 'Say you will look at it and go back to the queue' },
      ],
    },
    {
      id: 'desktop',
      npc_line: 'The desktop is fine. The desktop has always been fine. The '
        + 'desktop is not the one I take into the eleven o\'clock.',
      options: [
        { label: 'Ask when the phone last had anything', next: 'yesterday',
          effects: [{ asks: true }] },
        { label: 'Go back to the top', next: 'nag' },
        { label: 'Tell him it is the account, not the handset' },
      ],
    },
    {
      id: 'yesterday',
      npc_line: 'Yesterday afternoon. Around the time somebody sent a mail '
        + 'about tidying up the groups, which I did not read, because I was '
        + 'in a meeting about reading things.',
      options: [
        {
          label: 'Ask whether mail is still arriving on his desktop',
          next: 'desktop',
          effects: [
            { asks: true },
            {
              reveal: 'Mail is still landing on his desktop, so the mailbox is '
                + 'fine and the phone has lost its way in rather than its mail.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'nag' },
      ],
    },
    {
      id: 'affected',
      npc_line: 'One. Me. I would have thought that was the point rather than '
        + 'the objection.',
      options: [
        { label: 'Agree, and file it honestly anyway', next: 'phone' },
        { label: 'Go back to the top', next: 'nag' },
      ],
    },
    {
      id: 'after',
      npc_line: 'It is coming through. All of it, at once, including the one '
        + 'about tidying up the groups. Was that us?',
      options: [
        { label: 'Explain what a group membership is, briefly', next: 'lesson' },
        { label: 'Say it was one of those things' },
      ],
    },
    {
      id: 'lesson',
      npc_line: 'So I was taken out of a list and the phone did as it was '
        + 'told. I shall raise a concern about the list.',
      options: [
        { label: 'Suggest he raises it as a ticket' },
      ],
    },
  ],
};

/**
 * Reception. It was small talk before it was a ticket, and it stays small
 * talk: the afternoon's arrival hangs off the same conversation, because Bev
 * has one channel and one manner, and the question that gets the truth out of
 * her is the one nobody thinks to ask a receptionist - when did it last work.
 */
const RECEPTION: DialogueTree = {
  id: 'dialogue/reception',
  speaker: COMPANY_IDS.bev,
  tickets: [
    'ticket:tidied-list',
    'ticket:share-maintenance',
    'ticket:bev-vpn-request',
  ],
  root: 'hello',
  roots: {
    'ticket:tidied-list': 'hello',
    'ticket:share-maintenance': 'drive',
    // The one she asked for in three windows at once, once you have turned the
    // asking into a ticket. Until then this tree is about nothing of hers, and
    // the request itself lives on the convert / answer / deflect bar rather
    // than in here.
    'ticket:bev-vpn-request': 'vpn',
  },
  resolved_roots: {
    'ticket:tidied-list': 'after',
    'ticket:share-maintenance': 'drive-after',
    'ticket:bev-vpn-request': 'vpn-after',
  },
  nodes: [
    {
      id: 'hello',
      npc_line: 'Is this about the printer? Everything is about the printer. '
        + 'I have a sign about the printer.',
      options: [
        { label: 'Ask when her printing last worked', next: 'march' },
        { label: 'Ask whether anything else is broken', next: 'buzzer' },
        { label: 'Ask about the visitor biscuits', next: 'biscuits' },
        { label: 'Say you were only passing through' },
      ],
    },
    {
      id: 'march',
      npc_line: 'March. I know because it was the week they went through the '
        + 'systems taking out everybody who had left, and I made them a pot '
        + 'of coffee for it. It has never printed since. I did not connect '
        + 'the two, because why would I.',
      options: [
        {
          label: 'Put it to her that it stopped when the lists were tidied',
          effects: [
            { asks: true },
            {
              reveal: 'Reporter says printing stopped the week the group '
                + 'lists were tidied up, in March. Nothing was wrong with '
                + 'the printer then either.',
            },
          ],
        },
        { label: 'Go back to the top', next: 'hello' },
      ],
    },
    {
      id: 'drive',
      npc_line: 'The common drive has gone. The visitor list is on the common '
        + 'drive. There are auditors in reception and I am reading their names '
        + 'off a post-it I wrote at half eight.',
      options: [
        {
          label: 'Ask exactly when it went',
          next: 'nine',
          effects: [
            { asks: true },
            {
              reveal: 'It went at nine, which is the minute the announced '
                + 'maintenance window opened - and the same mail says the '
                + 'window closed at eleven.',
            },
          ],
        },
        {
          label: 'Ask whether anything else has gone with it',
          next: 'else',
          effects: [{ asks: true }],
        },
        { label: 'Tell her it is the drive and not her' },
      ],
    },
    {
      id: 'nine',
      npc_line: 'Nine. On the dot. I know because I had just put the phone '
        + 'down on somebody who wanted the postcode.',
      options: [
        { label: 'Go back to the drive', next: 'drive' },
        { label: 'Tell her that is the most useful sentence of the morning' },
      ],
    },
    {
      id: 'else',
      npc_line: 'Everything else is fine. Mail is fine. The printer is fine, '
        + 'which after last week I do not say lightly.',
      options: [
        {
          label: 'Ask exactly when it went',
          next: 'nine',
          effects: [
            { asks: true },
            {
              reveal: 'It went at nine, which is the minute the announced '
                + 'maintenance window opened - and the same mail says the '
                + 'window closed at eleven.',
            },
          ],
        },
        { label: 'Go back to the drive', next: 'drive' },
      ],
    },
    {
      id: 'drive-after',
      npc_line: 'It is back. So it was the maintenance, which I was told about '
        + 'in a mail I deleted, and it was also broken afterwards, which I was '
        + 'not told about at all. I am going to hold onto the second half.',
      options: [
        { label: 'Concede the second half entirely' },
      ],
    },
    {
      id: 'after',
      npc_line: 'It has just printed the visitor list. All four pages, one of '
        + 'which is the auditors. I shall put the sign about the printer away, '
        + 'but not far away.',
      options: [
        { label: 'Log what actually happened, in those words' },
      ],
    },
    {
      id: 'buzzer',
      npc_line: 'The door buzzer works if you lean on it. I stopped reporting '
        + 'that in March. The buzzer and I have an understanding.',
      options: [
        { label: 'Offer to log it properly this time', next: 'logged' },
        { label: 'Go back to the top', next: 'hello' },
      ],
    },
    {
      id: 'logged',
      npc_line: 'Do not. The last person who logged it came and leaned on it '
        + 'twice and wrote "no fault found".',
      options: [
        { label: 'Agree that the buzzer has won' },
      ],
    },
    {
      id: 'biscuits',
      npc_line: 'Those are for visitors. You are not a visitor. You are, at '
        + 'best, a fixture.',
      options: [
        { label: 'Ask what a fixture is allowed', next: 'allowed' },
        { label: 'Go back to the top', next: 'hello' },
      ],
    },
    {
      id: 'allowed',
      npc_line: 'The plain ones. And only after eleven, when the visitors '
        + 'have shown their true intentions.',
      options: [
        { label: 'Take a plain one and go' },
      ],
    },
    // The VPN request, once it is a ticket. The cause is not a fault and it is
    // not hidden by accident - it is hidden by nobody ever having asked a
    // receptionist whether she works from home - so the question that gets it
    // out of her is the one nobody thinks to ask.
    {
      id: 'vpn',
      npc_line: 'The working-from-home thing. Thursday, while the boiler is '
        + 'off. I have never done it before, so I have never needed whatever it '
        + 'is, and now I need it by Thursday and I have asked everywhere.',
      options: [
        {
          label: 'Ask whether she has ever been set up for remote access',
          next: 'vpn-never',
          effects: [
            { asks: true },
            {
              reveal: 'Reporter has never had remote access, because reception '
                + 'has never worked from home until this week. Nothing is '
                + 'broken; she is simply not in VPN Users.',
            },
          ],
        },
        { label: 'Tell her you will get her set up' },
      ],
    },
    {
      id: 'vpn-never',
      npc_line: 'Never. Why would I. I answer the door. The door does not have '
        + 'a home version. Apparently the boiler does.',
      options: [
        { label: 'Tell her that is exactly the answer', next: 'vpn' },
        { label: 'Tell her you will add her to the right list' },
      ],
    },
    {
      id: 'vpn-after',
      npc_line: 'It let me in. From my kitchen. I could see the whole boiler '
        + 'situation and answer the door at the same time, which is more than '
        + 'the boiler can say.',
      options: [
        { label: 'Log that it was a group membership, not a fault' },
      ],
    },
  ],
};

export const DIALOGUE_TREES: readonly DialogueTree[] = [
  ROTATED_SCREEN,
  LOCKED_ACCOUNT,
  WEDGED_SPOOLER,
  FAN_NOISE,
  BOSS_CHANNEL,
  RECEPTION,
  ...STAFF_TREES,
  // The second employer's cast (0.6.0 slice 3), added to the one registry so
  // `findDialogueTree` reaches them exactly as it reaches everyone else - the
  // conversations are per-reporter, and a reporter is a reporter whichever shop
  // they work in.
  ...BODGE_TREES,
  // The MSP customers' contacts (0.8.0), added the same way: a customer contact
  // is a reporter like any other, reached through the one registry.
  ...MSP_TREES,
];
