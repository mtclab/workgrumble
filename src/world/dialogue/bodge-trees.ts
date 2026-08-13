/**
 * The Bodgeworth & Batch conversations (0.6.0 slice 3).
 *
 * Same house rules as every other tree in this game: the reporter voices the
 * PROBLEM as they live it and never the cause; exactly one option per fault of
 * their own carries the `reveal` that writes that cause onto the ticket; every
 * option that puts a QUESTION to somebody carries `asks`, and no option that
 * merely tells them something does; and every ticket has a reaction of its own,
 * so the person reacts to the fix. The register is a small
 * family firm - blunt, unbothered, "just make it work" - rather than the
 * probation shop's corporate politeness, but the comedy is the same one: they
 * are wrong about the cause and completely right about their own morning.
 *
 * Every one of the five now reports TWO things (E11, 0.34.0 slice 2, the pool
 * in `tickets/pool-bodge.ts`), which is why each tree carries `roots` and
 * `resolved_roots` keyed per ticket rather than the single opening line and
 * single reaction it had while there was only one fault each. Two complaints
 * sharing an opening line is a person who has not noticed which of their
 * problems you are ringing about, and two fixes sharing a reaction is a person
 * with one joke.
 */

import { BODGE_IDS } from '../second-company';
import type { DialogueTree } from './types';

const SHARON: DialogueTree = {
  id: 'dialogue/bodge-sharon',
  speaker: BODGE_IDS.sharon,
  // Two now (E11, 0.34.0 slice 2): the shared login the whole desk is behind,
  // and the morning the desk alone cannot see the server. A person with more
  // than one complaint opens on the right line for each and reacts to each fix
  // in turn, which is what the two maps below are for - a single
  // `resolved_root` would have her saying the same sentence about two very
  // different afternoons.
  tickets: ['ticket:office-login-locked', 'ticket:front-desk-no-network'],
  root: 'complaint',
  roots: {
    'ticket:office-login-locked': 'complaint',
    'ticket:front-desk-no-network': 'network',
  },
  resolved_roots: {
    'ticket:office-login-locked': 'after',
    'ticket:front-desk-no-network': 'network-done',
  },
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
    {
      id: 'network',
      npc_line: 'The front desk cannot get at anything on the server. The '
        + 'drive is there, it just will not open, and Kev has already been '
        + 'over and told me the server is fine, which is not what I asked.',
      options: [
        {
          label: 'Ask her whether anybody else has lost the drive this morning',
          next: 'network-others',
          effects: [{ asks: true }],
        },
        {
          label: 'Look at what is running on the front desk itself',
          next: 'network-found',
          effects: [
            {
              reveal: 'The Workstation service on FRONT-DESK is stopped, and '
                + 'that service is the machine\'s own end of a mapped drive - '
                + 'the half that does the asking. The server is answering '
                + 'everybody else perfectly well; this one box has no way of '
                + 'reaching any share at all.',
            },
          ],
        },
        { label: 'Tell her you will get the desk back on the drive' },
      ],
    },
    {
      id: 'network-others',
      npc_line: 'No. Kev is on it, Baz got his notes off it in the yard, and I '
        + 'am the one writing hires out by hand. So it is us. It is always us.',
      options: [
        { label: 'Back to the top', next: 'network' },
        { label: 'Go and look at the front desk' },
      ],
    },
    {
      id: 'network-found',
      npc_line: 'So it is this computer and not the server. Right. And before '
        + 'you ask - yes, Kev was on it last week making it quicker.',
      options: [
        { label: 'Back to the top', next: 'network' },
        { label: 'Put the desk back on the network and tell her what it was' },
      ],
    },
    {
      id: 'network-done',
      npc_line: 'It is opening. Good. I have a stack of hire notes to type up '
        + 'that I would not have if anybody asked me before speeding things up.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const KEV: DialogueTree = {
  id: 'dialogue/bodge-kev',
  speaker: BODGE_IDS.kev,
  // And the login that will not stay open (E11, 0.34.0 slice 2), which is the
  // other half of Kev: everything clever in this estate is his, and so is
  // everything haunted.
  tickets: ['ticket:accounts-package-down', 'ticket:kev-relock'],
  root: 'complaint',
  roots: {
    'ticket:accounts-package-down': 'complaint',
    'ticket:kev-relock': 'relock',
  },
  resolved_roots: {
    'ticket:accounts-package-down': 'after',
    'ticket:kev-relock': 'relock-done',
  },
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
    {
      id: 'relock',
      npc_line: 'My login keeps shutting itself. Four times since Thursday. I '
        + 'get about ten minutes of invoicing and then it has gone again, and '
        + 'no, before you start, I have not been typing it wrong.',
      options: [
        {
          label: 'Ask him what has changed about that login lately',
          next: 'relock-changed',
          effects: [{ asks: true }],
        },
        {
          label: 'Look at where the failed sign-ins are coming from',
          next: 'relock-found',
          effects: [
            {
              reveal: 'The yard printer scans to a folder on the server, and '
                + 'it signs in to do it as Kev, because Kev set it up with his '
                + 'own login. He changed that password last week and the '
                + 'printer did not: it offers the old one every few minutes '
                + 'until the directory has had five and shuts the account.',
            },
          ],
        },
        { label: 'Tell him you will find out what keeps shutting it' },
      ],
    },
    {
      id: 'relock-changed',
      npc_line: 'I changed the password. Twice, trying to get ahead of it. So '
        + 'if you are about to say it is the password, I have had that thought '
        + 'and it did not work either time.',
      options: [
        { label: 'Back to the top', next: 'relock' },
        { label: 'Go and find out what else knows that password' },
      ],
    },
    {
      id: 'relock-found',
      npc_line: 'The printer. The printer has been locking me out. I set that '
        + 'up in about 2011 and I have never once thought about it since.',
      options: [
        { label: 'Back to the top', next: 'relock' },
        { label: 'Sort the printer out and get him back in' },
      ],
    },
    {
      id: 'relock-done',
      npc_line: 'Ten minutes and it is still open, which is a personal best '
        + 'for the week. I will put my own login back in that printer, shall I. '
        + 'No. I will not. You do it.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const BAZ: DialogueTree = {
  id: 'dialogue/bodge-baz',
  speaker: BODGE_IDS.baz,
  // And his own login, locked (E11, 0.34.0 slice 2) - the short one, and the
  // job's own texture: five wrong goes and a counter that did what it is for.
  tickets: ['ticket:yard-printer-wedged', 'ticket:baz-locked-out'],
  root: 'complaint',
  roots: {
    'ticket:yard-printer-wedged': 'complaint',
    'ticket:baz-locked-out': 'mine',
  },
  resolved_roots: {
    'ticket:yard-printer-wedged': 'after',
    'ticket:baz-locked-out': 'mine-done',
  },
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
    {
      id: 'mine',
      npc_line: 'My own login has stopped letting me in now. It says locked '
        + 'out. I have read it twice. And it is not my fault this time, the '
        + 'keys on the yard terminal have got mud in them.',
      options: [
        {
          label: 'Ask him how many goes he had at it',
          next: 'mine-goes',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the account in the directory',
          effects: [
            {
              reveal: 'Five wrong attempts in a row this morning tripped the '
                + 'lockout counter on his own account. The password is still '
                + 'the password and there is nothing else wrong with it - the '
                + 'door is what is shut.',
            },
          ],
        },
        { label: 'Tell him you will get him back in' },
      ],
    },
    {
      id: 'mine-goes',
      npc_line: 'Five or six. Maybe seven. It kept saying no and I kept going, '
        + 'which in hindsight is what it is complaining about, is it not.',
      options: [{ label: 'Go and open it back up' }],
    },
    {
      id: 'mine-done',
      npc_line: 'In. Cheers. I will get the mud out of the keys. I will not, '
        + 'but I have said it, and you have written it down.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const TREV: DialogueTree = {
  id: 'dialogue/bodge-trev',
  speaker: BODGE_IDS.trev,
  // And the login that was switched off while he was not looking (E11, 0.34.0
  // slice 2). Short, and the other half of the three-states article: not
  // locked, not expired, off.
  tickets: ['ticket:the-share-down', 'ticket:trev-switched-off'],
  root: 'complaint',
  roots: {
    'ticket:the-share-down': 'complaint',
    'ticket:trev-switched-off': 'off',
  },
  resolved_roots: {
    'ticket:the-share-down': 'after',
    'ticket:trev-switched-off': 'off-done',
  },
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
    {
      id: 'off',
      npc_line: 'It will not have me at all. It is not asking me for a '
        + 'password and telling me it is wrong - it stops me before that, and '
        + 'the message is about the account. I have driven forty minutes.',
      options: [
        {
          label: 'Ask him when he last managed to sign in',
          next: 'off-when',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the account in the directory',
          effects: [
            {
              reveal: 'The account is DISABLED rather than locked. Somebody '
                + 'switched it off in the spring, when Trev going part-time '
                + 'was heard as Trev retiring - so an unlock has nothing to '
                + 'act on and a new password would let nobody in either.',
            },
          ],
        },
        { label: 'Tell him you will find out what it is refusing him for' },
      ],
    },
    {
      id: 'off-when',
      npc_line: 'Before the summer, I should think. I am in one day a week and '
        + 'half of those I do not need the computer. It worked then.',
      options: [{ label: 'Go and read the account' }],
    },
    {
      id: 'off-done',
      npc_line: 'In. Thank you. Somebody decided I had gone, then. I shall try '
        + 'not to take it personally, and I shall mention it to Vernon.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const VERNON: DialogueTree = {
  id: 'dialogue/bodge-vernon',
  speaker: BODGE_IDS.vernon,
  // And the renewal that has to be printed by three (E11, 0.34.0 slice 2). The
  // same man, the same shape: a deadline he has known about for a month, said
  // out loud for the first time this afternoon, in front of a fault that takes
  // ten seconds.
  tickets: ['ticket:vernon-mouse', 'ticket:yard-printer-unplugged'],
  root: 'complaint',
  roots: {
    'ticket:vernon-mouse': 'complaint',
    'ticket:yard-printer-unplugged': 'renewal',
  },
  resolved_roots: {
    'ticket:vernon-mouse': 'after',
    'ticket:yard-printer-unplugged': 'renewal-done',
  },
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
    {
      id: 'renewal',
      npc_line: 'The printer is dead and the insurance renewal has to be '
        + 'signed and back with the broker by three. Not my problem how. That '
        + 'is what I pay for.',
      options: [
        {
          label: 'Ask him what the printer does when he sends something to it',
          next: 'renewal-lights',
          effects: [{ asks: true }],
        },
        {
          label: 'Go out to the yard and look at the printer',
          next: 'renewal-socket',
          effects: [
            {
              reveal: 'The printer has no power going into it. There is one '
                + 'socket at that end of the yard, the pressure washer was on '
                + 'it this morning, and the printer went back against the wall '
                + 'and not back on. Nothing else about it is wrong.',
            },
          ],
        },
        { label: 'Tell him you are going out to it now' },
      ],
    },
    {
      id: 'renewal-lights',
      npc_line: 'It does nothing. There are no lights on it. I am not going to '
        + 'stand in the yard describing a printer to you, I have a broker.',
      options: [
        { label: 'Back to the top', next: 'renewal' },
        { label: 'Go out to the yard' },
      ],
    },
    {
      id: 'renewal-socket',
      npc_line: 'The washer. Right. I will have a word with Baz. Get it going, '
        + 'and I do not want a note about sockets, I want a renewal.',
      options: [
        { label: 'Back to the top', next: 'renewal' },
        { label: 'Bring the printer back up and tell him what it was' },
      ],
    },
    {
      id: 'renewal-done',
      npc_line: 'It is printing. Good. And it has gone off to the broker with '
        + 'twenty minutes to spare, which I shall be remembering as my doing.',
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
