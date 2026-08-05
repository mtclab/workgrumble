/**
 * The Bodgeworth & Batch conversations (0.6.0 slice 3).
 *
 * Same house rules as every other tree in this game: the reporter voices the
 * PROBLEM as they live it and never the cause; exactly one option per fault of
 * their own carries the `reveal` that writes that cause onto the ticket; every
 * option that puts a QUESTION to somebody carries `asks`, and no option that
 * merely tells them something does; and a tree with a ticket has a
 * `resolved_root`, so the person reacts to the fix. The register is a small
 * family firm - blunt, unbothered, "just make it work" - rather than the
 * probation shop's corporate politeness, but the comedy is the same one: they
 * are wrong about the cause and completely right about their own morning.
 */

import { BODGE_IDS } from '../second-company';
import type { DialogueTree } from './types';

const SHARON: DialogueTree = {
  id: 'dialogue/bodge-sharon',
  speaker: BODGE_IDS.sharon,
  tickets: ['ticket:office-login-locked'],
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'Nobody can get on the front desk. It has been fine for years '
        + 'and this morning it has just decided none of us are allowed in.',
      options: [
        {
          label: 'Ask her whether anyone has been typing it wrong this morning',
          next: 'typed',
          effects: [{ asks: true }],
        },
        {
          label: 'Check the login in the directory',
          next: 'checked',
          effects: [
            {
              reveal: 'The shared OFFICE account is locked out after a run of '
                + 'failed sign-ins this morning. One login, one lockout, the '
                + 'whole desk out.',
            },
          ],
        },
        { label: 'Tell her you are on it' },
      ],
    },
    {
      id: 'typed',
      npc_line: 'Baz was covering reception and swears blind he typed it right, '
        + 'about six times, getting crosser each go. So, yes. That.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Go and unlock it' },
      ],
    },
    {
      id: 'checked',
      npc_line: 'Locked, is it. I did wonder why it took all of us out at once '
        + 'and not just whoever broke it. That will be the one login, then.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Unlock it and tell her it is a shared-login thing' },
      ],
    },
    {
      id: 'after',
      npc_line: 'We are back in. Thank you. And no, before you say it, we are '
        + 'not getting everyone their own login, Vernon will have a fit.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const KEV: DialogueTree = {
  id: 'dialogue/bodge-kev',
  speaker: BODGE_IDS.kev,
  tickets: ['ticket:accounts-package-down'],
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'The accounts thing has stopped. I built that, and it has never '
        + 'done this, and I definitely did not touch it over the weekend.',
      options: [
        {
          label: 'Ask him when it stopped, and whether the box has been hot',
          next: 'hot',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the event log on the server',
          next: 'log',
          effects: [
            {
              reveal: 'The accounts service stopped at the weekend on a box '
                + 'that is short of memory and running hot - the fan he keeps '
                + 'mentioning. It will start straight back up and stop again '
                + 'until the server is looked at properly.',
            },
          ],
        },
        { label: 'Tell him you will get it running' },
      ],
    },
    {
      id: 'hot',
      npc_line: 'Sometime Saturday, going by the invoices that did not send. '
        + 'And yeah, the fan has been howling. I keep meaning to sort the box.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Start the service' },
      ],
    },
    {
      id: 'log',
      npc_line: 'Weekend, when nobody was in. So not me. Good. I will take '
        + '"the box is dying" over "Kev broke it" any day of the week.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Restart it and flag the box for a proper look' },
      ],
    },
    {
      id: 'after',
      npc_line: 'Back up, invoices sending. Cheers. I will get to the box. I '
        + 'have been going to get to the box since about 2011.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const BAZ: DialogueTree = {
  id: 'dialogue/bodge-baz',
  speaker: BODGE_IDS.baz,
  tickets: ['ticket:yard-printer-wedged'],
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'Printer in the yard is flashing and doing nothing. I have sent '
        + 'the same note about nine times now and not one has come out.',
      options: [
        {
          label: 'Ask him how many he has resent',
          next: 'resent',
          effects: [{ asks: true }],
        },
        {
          label: 'Look at the print queue',
          next: 'queue',
          effects: [
            {
              reveal: 'The spooler is wedged on a bad job and everything sent '
                + 'since is stacked behind it. Clearing the queue drops the '
                + 'job that jammed it; starting the spooler first just hands it '
                + 'the same broken thing back.',
            },
          ],
        },
        { label: 'Tell him to stop sending it and you will sort it' },
      ],
    },
    {
      id: 'resent',
      npc_line: 'Dunno. Every time I walked back out and it still had not come, '
        + 'I hit print again. So, loads. Was that not helping?',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Clear the queue and restart it' },
      ],
    },
    {
      id: 'queue',
      npc_line: 'So all my re-sends are just sat in a pile making it worse. '
        + 'Right. I will keep my hands off the button.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Clear the queue, then start the spooler' },
      ],
    },
    {
      id: 'after',
      npc_line: 'It is chucking them all out now. Nineteen delivery notes for '
        + 'one load. I will go and stand on the recycling.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const TREV: DialogueTree = {
  id: 'dialogue/bodge-trev',
  speaker: BODGE_IDS.trev,
  tickets: ['ticket:the-share-down'],
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'Can\'t open the shared drive. Is it the email thing? Everyone '
        + 'is emailing about the email thing. I only wanted off the list.',
      options: [
        {
          label: 'Ask him when the drive stopped answering',
          next: 'when',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the event log on the server',
          next: 'log',
          effects: [
            {
              reveal: 'The reply-all storm has been dropping the same photo '
                + 'into the shared drive all morning; the server ran out of '
                + 'room and the share service stopped when it could not write. '
                + 'It is the email thing, exactly - just not the way he means.',
            },
          ],
        },
        { label: 'Tell him you will get the drive back' },
      ],
    },
    {
      id: 'when',
      npc_line: 'About the time the cake photo started going round for the '
        + 'fortieth time. I am ninety, I do not need the drive AND the cake.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Go and start the share' },
      ],
    },
    {
      id: 'log',
      npc_line: 'The email filled the drive. Of course it did. In my day a memo '
        + 'was a bit of paper and it never once filled a drive.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Restart the share and note the storm is the cause' },
      ],
    },
    {
      id: 'after',
      npc_line: 'Drive is back. Now if you could stop the cake I would be a '
        + 'happy man. Take me off the list. Any list. All of them.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const VERNON: DialogueTree = {
  id: 'dialogue/bodge-vernon',
  speaker: BODGE_IDS.vernon,
  tickets: ['ticket:vernon-mouse'],
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'The whole laptop is dead. Dead. I have a call at two and I am '
        + 'paying you to have this sorted, so sort it.',
      options: [
        {
          label: 'Ask him what exactly is on the screen right now',
          next: 'screen',
          effects: [{ asks: true }],
        },
        {
          label: 'Look at the laptop and its mouse',
          next: 'mouse',
          effects: [
            {
              reveal: 'The wireless mouse battery is flat. The laptop is fine '
                + 'and has been fine throughout - "dead" is the pointer not '
                + 'moving, which is the mouse, which is the notice on his own '
                + 'screen he has decided is a separate problem.',
            },
          ],
        },
        { label: 'Tell him you are looking at it now' },
      ],
    },
    {
      id: 'screen',
      npc_line: 'There is a little box in the corner. "Mouse battery low." But '
        + 'that is nothing to do with it, the whole thing is dead, is it not?',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Put batteries in the mouse' },
      ],
    },
    {
      id: 'mouse',
      npc_line: 'It is the mouse? The mouse. Right. Well. Get it going, I have '
        + 'a call. And do not put that on a report anywhere.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Replace the battery and tell him the laptop was fine' },
      ],
    },
    {
      id: 'after',
      npc_line: 'Working. Fine. Good. That is what I pay you for. Do not make a '
        + 'thing of it.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

export const BODGE_TREES: readonly DialogueTree[] = [
  SHARON,
  KEV,
  BAZ,
  TREV,
  VERNON,
];
