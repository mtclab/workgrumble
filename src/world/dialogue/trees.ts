import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { WORLD_IDS } from '../demo-world';
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
  id: 'dialogue/rotated-screen',
  speaker: COMPANY_IDS.ada,
  ticket: 'ticket:rotated-screen',
  root: 'complaint',
  resolved_root: 'after',
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
  id: 'dialogue/locked-account',
  speaker: COMPANY_IDS.gary,
  ticket: 'ticket:locked-account',
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'The computer says my password is wrong. It is not wrong. It '
        + 'is the same password it has been since the merger.',
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
  ],
};

const WEDGED_SPOOLER: DialogueTree = {
  id: 'dialogue/wedged-spooler',
  speaker: COMPANY_IDS.nina,
  ticket: 'ticket:wedged-spooler',
  root: 'complaint',
  resolved_root: 'after',
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
  ],
};

const FAN_NOISE: DialogueTree = {
  id: 'dialogue/fan-noise',
  speaker: COMPANY_IDS.player,
  ticket: WORLD_IDS.ticket,
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

const BOSS_NAG: DialogueTree = {
  id: 'dialogue/boss-nag',
  speaker: COMPANY_IDS.boss,
  root: 'nag',
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
  ],
};

const RECEPTION: DialogueTree = {
  id: 'dialogue/reception',
  speaker: COMPANY_IDS.bev,
  root: 'hello',
  nodes: [
    {
      id: 'hello',
      npc_line: 'Is this about the printer? Everything is about the printer. '
        + 'I have a sign about the printer.',
      options: [
        { label: 'Ask whether anything else is broken', next: 'buzzer' },
        { label: 'Ask about the visitor biscuits', next: 'biscuits' },
        { label: 'Say you were only passing through' },
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
  ],
};

export const DIALOGUE_TREES: readonly DialogueTree[] = [
  ROTATED_SCREEN,
  LOCKED_ACCOUNT,
  WEDGED_SPOOLER,
  FAN_NOISE,
  BOSS_NAG,
  RECEPTION,
];
