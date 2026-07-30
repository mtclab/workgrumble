import type { KbArticle } from './types';

/**
 * The knowledge base. Two audiences, one text: the veteran skims it for the
 * fix, the learner reads it and comes away actually knowing what a print
 * spooler is. So the jokes never sit in the place where the truth goes - the
 * explanation is honest, and the comedy is in the office around it.
 */
export const KB_ARTICLES: readonly KbArticle[] = [
  {
    id: 'kb/display-rotation',
    title: 'The screen that went sideways on its own',
    summary: 'Rotated displays are a keyboard shortcut, not an intruder.',
    body: [
      'Graphics drivers can turn the picture 0, 90, 180 or 270 degrees so a '
      + 'monitor can be mounted on its side. On most machines that setting '
      + 'has a keyboard shortcut, usually Control and Alt with an arrow key.',
      'Nobody sets out to press it. People lean on keyboards, cats walk on '
      + 'them, and helpful colleagues demonstrate shortcuts they only half '
      + 'remember. The picture turns, the mouse still moves the way it always '
      + 'did, and the whole thing feels supernatural from the user side.',
      'The fix is to set the rotation back to 0: Remote Assist has the '
      + 'control on the remote screen, and the terminal has "rotate '
      + '<host> 0". Both do exactly the same thing to the same machine.',
      'Worth saying out loud to the reporter: nothing was accessed, nothing '
      + 'was stolen, and their password is fine. A rotated screen is the '
      + 'cheapest possible false alarm, and it still costs them a morning.',
    ],
    see_also: ['kb/reading-the-error'],
  },
  {
    id: 'kb/account-lockout',
    title: 'Locked out is not the same as wrong password',
    summary: 'A lockout counter, not a forgotten password.',
    body: [
      'Directories count failed sign-ins. After a set number of wrong '
      + 'attempts the account locks itself for a while, or until support '
      + 'clears it. That is the lockout doing its job: it is what stops '
      + 'somebody guessing passwords all night.',
      'From the user side both failures look identical, because the login '
      + 'box says something bland about the password being wrong. The '
      + 'giveaway is the second sentence, the one nobody reads: "this '
      + 'account has been locked out".',
      'Two common causes: a fortnight away with a phone still trying the old '
      + 'password every ten minutes, or a mapped drive reconnecting with '
      + 'stale credentials. The user typed nothing wrong at all.',
      'Clear it with the unlock action in Active Dictionary, or "unlock '
      + '<username>" in the terminal. Reset the password only if it really '
      + 'is forgotten - a needless reset means a sticky note by lunchtime.',
    ],
    see_also: ['kb/reading-the-error'],
  },
  {
    id: 'kb/print-spooler',
    title: 'The print spooler, and why the queue goes first',
    summary: 'Stop it, empty the queue it choked on, then start it again.',
    body: [
      'The spooler is the service that accepts print jobs, stores them on '
      + 'disk and feeds them to the printer one at a time. Printing is slow '
      + 'and applications are impatient, so the spooler stands between them.',
      'When one malformed job jams the front of that queue, everything sent '
      + 'afterwards piles up behind it. The printer hums and flashes because '
      + 'it is still waiting for a job that will never make sense.',
      'Here is the part that catches people: the queued jobs are files on '
      + 'disk, and they survive a restart on purpose, so a crash does not eat '
      + 'somebody\'s hundred-page report. Start the service in front of that '
      + 'backlog and it is handed the same bad job within seconds.',
      'So the order is stop, clear, start - not start and hope. In this '
      + 'building that comes out as two moves: empty the queue, then restart '
      + 'the spooler. Remote Assist has both on the print server; the '
      + 'terminal spells them "clearqueue <printer>" and "restart spooler". '
      + 'Doing it the other way round is refused, and says why.',
      'Tell the reporter which jobs were dropped. Somebody always re-sends '
      + 'the same delivery note four times, and they deserve to know all '
      + 'four are gone.',
    ],
    see_also: ['kb/power-cycle'],
  },
  {
    id: 'kb/chassis-fan',
    title: 'A fan that sounds like a hornet in a biscuit tin',
    summary: 'Dust, a fouled blade, or a fan on its way out.',
    body: [
      'Case fans move air across hot components. They are cheap, they run '
      + 'constantly, and they collect dust in a building where the carpets '
      + 'are older than the network.',
      'Noise usually means the blade is fouled - a cable, a dust mat, or the '
      + 'tower having been shoved sideways so a cleaner could sweep behind '
      + 'it. Reseating the fan, or freeing whatever it is rubbing against, '
      + 'fixes most of them for nothing.',
      'If the bearing itself is going, no amount of percussive maintenance '
      + 'will save it. That is a part, a screwdriver and somebody on site: '
      + 'escalate it and say so plainly, because a machine that overheats '
      + 'quietly is a worse ticket than a machine that buzzes loudly.',
    ],
    see_also: ['kb/power-cycle'],
  },
  {
    id: 'kb/power-cycle',
    title: 'Have you tried turning it off and on again (and why it works)',
    summary: 'The joke is real engineering, and it has limits.',
    body: [
      'Restarting a device throws away every piece of state it was holding: '
      + 'half-finished jobs, wedged drivers, a network card that has stopped '
      + 'believing in the network. It comes back in the one configuration '
      + 'anybody tested properly, which is the state it starts in.',
      'That is why it works so often, and it is not a cop-out. Most support '
      + 'problems are not broken hardware; they are a device stuck in a '
      + 'state its makers never thought about.',
      'It is also why it is not a fix. If the same machine wedges every '
      + 'Friday afternoon, restarting it every Friday afternoon is not '
      + 'support, it is a standing appointment. Find what puts it in that '
      + 'state, and write down what you find.',
      'Before you power-cycle anything shared, ask what is running on it. '
      + 'The print server in this building also carries the VPN, because it '
      + 'was the box with a free slot the week the VPN arrived.',
    ],
    see_also: ['kb/print-spooler'],
  },
  {
    id: 'kb/reading-the-error',
    title: 'The error message is usually the answer',
    summary: 'Read the whole message, out loud, including the second line.',
    body: [
      'People read the first line of an error and stop, because the first '
      + 'line is the bad news and the rest looks like small print. The rest '
      + 'is the instructions.',
      'Ask the reporter to read the message out word for word. It sounds '
      + 'pedantic and it closes tickets: "the password is wrong" and "this '
      + 'account has been locked out" are different problems with different '
      + 'fixes, and only one of them is on the screen.',
      'Read your own tools the same way. A refusal from this workstation '
      + 'always says what it refused and why - the reason line is not '
      + 'decoration, it is the diagnosis you were about to go looking for.',
      'And write the answer into the ticket, not just into the fix. The next '
      + 'person to see this symptom is you, in three weeks, with no memory '
      + 'of any of it.',
    ],
    see_also: ['kb/account-lockout'],
  },
];
