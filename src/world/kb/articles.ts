import type { KbArticle } from './types';

/**
 * The knowledge base. Two audiences, one text: the veteran skims Resolution
 * for the fix, the learner reads Cause and comes away actually knowing what a
 * print spooler is. So the jokes never sit in the place where the truth goes -
 * the explanation is honest, and the comedy is in the office around it.
 *
 * Every article is filed in the four KCS sections, which is not decoration: it
 * is what makes an article skimmable under a deadline and readable afterwards,
 * and it is the shape the player will meet in every shop they ever work in.
 */
export const KB_ARTICLES: readonly KbArticle[] = [
  {
    id: 'kb/display-rotation',
    title: 'The screen that went sideways on its own',
    summary: 'Rotated displays are a keyboard shortcut, not an intruder.',
    state: 'published',
    issue: 'The picture on my monitor has turned ninety degrees and I did not '
      + 'do anything. It happened overnight. Should we be calling somebody?',
    environment: 'Any workstation on the estate, any monitor. Most often one '
      + 'that somebody else has been standing at.',
    resolution: [
      'Confirm what the reporter is seeing: the picture is turned, the mouse '
        + 'still moves the way it always did, and nothing else is wrong.',
      'Set the rotation back to 0 - "rotate <host> 0" in the terminal, or the '
        + 'control on the remote screen in Remote Assist. Both do the same '
        + 'thing to the same machine.',
      'Tell the reporter, out loud, that nothing was accessed and their '
        + 'password is fine. They have spent the morning assuming otherwise.',
      'Mention the shortcut - Control, Alt and an arrow key - so the next '
        + 'person who leans on their keyboard knows what they have done.',
    ],
    cause: [
      'Graphics drivers can turn the picture 0, 90, 180 or 270 degrees so a '
      + 'monitor can be mounted on its side. On most machines that setting '
      + 'has a keyboard shortcut, usually Control and Alt with an arrow key.',
      'Nobody sets out to press it. People lean on keyboards, cats walk on '
      + 'them, and helpful colleagues demonstrate shortcuts they only half '
      + 'remember. The picture turns, the mouse still moves the way it always '
      + 'did, and the whole thing feels supernatural from the user side.',
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
    state: 'published',
    issue: 'It says my password is wrong. It is not wrong. I have typed it '
      + 'the same way for four years and now the machine has decided it is '
      + 'not good enough.',
    environment: 'Any account in Active Dictionary. Classically somebody back '
      + 'from leave, or somebody whose phone is still holding an old password.',
    resolution: [
      'Read the account in Active Dictionary, or "net user <username>". Look '
        + 'at the state, the bad password count and the time it locked.',
      'If it is locked, unlock it - the button in Active Dictionary or '
        + '"unlock <username>". Do not reset the password as well: a reset '
        + 'they did not need is a sticky note by lunchtime.',
      'If the password is genuinely forgotten, reset it. The account then '
        + 'wants a new one at next logon, which is the flag doing its job and '
        + 'not a second fault.',
      'Ask what else signs in as them - a phone, a mapped drive, a machine in '
        + 'a cupboard. An account that relocks in ten minutes has something '
        + 'still trying the old password.',
    ],
    cause: [
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
    ],
    see_also: ['kb/reading-the-error', 'kb/three-ways-an-account-says-no'],
  },
  {
    id: 'kb/three-ways-an-account-says-no',
    title: 'Locked, disabled, expired: three faults, three fixes',
    summary: 'Same complaint from the user, three different jobs for you.',
    state: 'published',
    issue: 'I cannot get in. It just says no. It said no yesterday as well '
      + 'and somebody in your team did something and then it worked.',
    environment: 'Active Dictionary, any account. The state is on the account '
      + 'record; the terminal prints the same three words.',
    resolution: [
      'Read the state before you touch anything: Active Dictionary says '
        + 'Locked out, Disabled or Password expired, and so does '
        + '"net user <username>".',
      'Locked out: unlock it. The lockout counter tripped; the password is '
        + 'still the password.',
      'Disabled: somebody switched the account off on purpose - a leaver, a '
        + 'security hold, a contract that ended. Enable it only when you know '
        + 'who turned it off and why. Unlocking it does nothing at all.',
      'Password expired: reset the password. The account is fine, the '
        + 'credential is out of date, and unlocking an account nobody locked '
        + 'is a button press with no effect on anything.',
      'Write the state you found onto the ticket. "Fixed" tells the next '
        + 'person nothing; "was disabled on the 3rd by the leavers process" '
        + 'tells them everything.',
    ],
    cause: [
      'Three different mechanisms wear the same face at the login box. A '
      + 'LOCKOUT is automatic and temporary: the directory counted the bad '
      + 'attempts and shut the door. A DISABLED account is deliberate and '
      + 'permanent until somebody reverses it: an administrator ticked a box, '
      + 'usually because the person left. An EXPIRED password is a policy '
      + 'clock running out on the credential while the account itself is '
      + 'perfectly healthy.',
      'The tools are just as specific. Unlock clears a lockout and nothing '
      + 'else. A reset issues a new password and clears the lockout with it, '
      + 'which is why it looks like a cure-all and is not: it does nothing '
      + 'whatever for a disabled account. Enabling puts back an account '
      + 'somebody switched off, and it is the one action here that deserves a '
      + 'moment of thought, because somebody meant to switch it off.',
      'The reason this matters more than it looks: the wrong fix on the wrong '
      + 'state is not a harmless miss. Resetting the password of somebody who '
      + 'was only locked out sends them looking for a sticky note, and '
      + 'enabling an account the leavers process disabled is a security '
      + 'incident with your name in the audit log.',
    ],
    see_also: ['kb/account-lockout', 'kb/reading-the-error'],
  },
  {
    id: 'kb/print-spooler',
    title: 'The print spooler, and why the queue goes first',
    summary: 'Stop it, empty the queue it choked on, then start it again.',
    state: 'published',
    issue: 'The printer is haunted. It hums, it flashes, it prints nothing, '
      + 'and everybody has now sent the same document four times.',
    environment: 'PRINT-01 and the Hercules 400 hanging off it. Applies to '
      + 'any spooler and any queue.',
    resolution: [
      'Look at the queue: "queue <printer>" says how many jobs are stacked up '
        + 'behind whatever jammed.',
      'Empty the queue FIRST - "clearqueue <printer>", or the hardware panel '
        + 'in Remote Assist.',
      'Then restart the spooler - "restart spooler", or its taskbar entry on '
        + 'the print server. Doing it the other way round is refused, and the '
        + 'refusal says why.',
      'Tell the reporter which jobs were dropped, because somebody always '
        + 're-sent the same delivery note four times and all four are gone.',
    ],
    cause: [
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
      'So the order is stop, clear, start - not start and hope. Doing it the '
      + 'other way round is refused by this workstation, and the refusal says '
      + 'which printer is still holding how many jobs, which is the number '
      + 'the reporter is about to ask you for anyway.',
    ],
    see_also: ['kb/power-cycle'],
  },
  {
    id: 'kb/chassis-fan',
    title: 'A fan that sounds like a hornet in a biscuit tin',
    summary: 'Dust, a fouled blade, or a fan on its way out.',
    state: 'published',
    issue: 'My computer has started screaming. It began around the time the '
      + 'cleaner came through, which I am sure is a coincidence.',
    environment: 'Any tower under a desk in this building. The carpets are '
      + 'older than the network and the fans know it.',
    resolution: [
      'Listen to it, and get the reporter to say when it started. A noise '
        + 'that arrived with a house move is a cable in the blade.',
      'Free the blade: reseat the fan, or shift whatever it is rubbing '
        + 'against. About This Workstation has the one honest button for it.',
      'If the noise survives that, the bearing is going. Escalate it with a '
        + 'symptom and what you tried, because that is a part, a screwdriver '
        + 'and somebody on site.',
      'Do not leave it running hot and quiet. A machine that overheats '
        + 'silently is a worse ticket than one that buzzes loudly.',
    ],
    cause: [
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
    state: 'published',
    issue: 'Anything wedged, stuck, confused, or behaving in a way nobody can '
      + 'reproduce and everybody can describe.',
    environment: 'Every device, every service, every machine - and the point '
      + 'of the article is knowing when NOT to.',
    resolution: [
      'Ask what is running on it before you restart anything shared. The '
        + 'print server in this building also carries the VPN.',
      'Restart the smallest thing that could be at fault: the service before '
        + 'the machine, the machine before the floor.',
      'Check what was already written down - queues, settings, files - '
        + 'because a restart hands all of it straight back to you.',
      'If the same box wedges every Friday, stop restarting it and start '
        + 'reading its event log. That is a standing appointment, not support.',
    ],
    cause: [
      'Restarting a device throws away the state it was only holding in '
      + 'memory: the work in flight, a wedged driver, a network card that has '
      + 'stopped believing in the network. It comes back in the one '
      + 'configuration anybody tested properly, which is the state it starts '
      + 'in.',
      'What was written down survives, and that is the half people forget. '
      + 'Settings, files, licence keys and anything already queued on disk '
      + 'are all still there afterwards - which is exactly why a restart does '
      + 'not empty a print queue, and why the job that jammed the spooler is '
      + 'waiting for it when it comes back up.',
      'That is why it works so often, and it is not a cop-out. Most support '
      + 'problems are not broken hardware; they are a device stuck in a '
      + 'state its makers never thought about. It clears the confusion and '
      + 'hands back everything that was already wrong.',
      'It is also why it is not a fix. If the same machine wedges every '
      + 'Friday afternoon, restarting it every Friday afternoon is not '
      + 'support, it is a standing appointment. Find what puts it in that '
      + 'state, and write down what you find.',
    ],
    see_also: ['kb/print-spooler', 'kb/event-log'],
  },
  {
    id: 'kb/event-log',
    title: 'The machine wrote down what happened to it',
    summary: 'Read the log before you believe anybody, including yourself.',
    state: 'published',
    issue: 'It did that by itself. Nobody touched it. It has been doing it '
      + 'for weeks and it always seems to be around the same time.',
    environment: 'Event Viewer, per machine. Services, reboots, lockouts and '
      + 'anything the service desk agent felt strongly about.',
    resolution: [
      'Open Event Viewer and pick the machine the reporter is actually on, '
        + 'not the one they said.',
      'Filter to Error and Warning first. Information is where the truth '
        + 'lives, but Error is where the morning goes.',
      'Read the TIMES, not just the messages. Two failures at the same minute '
        + 'on different days is a pattern, and a pattern has a cause with a '
        + 'timetable - a backup, a shift change, a cleaner and a socket.',
      'Put what you found on the ticket in the words the log used, event id '
        + 'and all. It is the difference between a fix and a diagnosis.',
    ],
    cause: [
      'Every service that starts, stops or falls over writes a line, and so '
      + 'does every reboot and every lockout. The machine has therefore been '
      + 'keeping a diary of the fault the whole time somebody has been trying '
      + 'to describe it to you over the phone.',
      'The famous one is 7031, "the service terminated unexpectedly", which '
      + 'helpfully counts how many times it has done it. A service that has '
      + 'crashed four times is not a mystery, it is a schedule, and the count '
      + 'is the single most useful number on the screen.',
      'The reason this beats asking is not that people lie. It is that people '
      + 'remember what they noticed, and a machine records what happened, and '
      + 'those are different lists. Somebody who swears the printer broke on '
      + 'Monday is telling you the truth about Monday, which was the day they '
      + 'finally cared.',
    ],
    see_also: ['kb/print-spooler', 'kb/power-cycle'],
  },
  {
    id: 'kb/reading-the-error',
    title: 'The error message is usually the answer',
    summary: 'Read the whole message, out loud, including the second line.',
    state: 'published',
    issue: 'It threw up an error. I closed it. It said something about a '
      + 'problem. Can you just come and look?',
    environment: 'Every screen in the building, including the ones on this '
      + 'workstation.',
    resolution: [
      'Ask the reporter to read the message out word for word, including the '
        + 'part that looks like small print.',
      'Read your own tools the same way: a refusal here always says what it '
        + 'refused and why, and the reason line is the diagnosis.',
      'Write the answer into the ticket, not just into the fix.',
    ],
    cause: [
      'People read the first line of an error and stop, because the first '
      + 'line is the bad news and the rest looks like small print. The rest '
      + 'is the instructions.',
      'It sounds pedantic and it closes tickets: "the password is wrong" and '
      + '"this account has been locked out" are different problems with '
      + 'different fixes, and only one of them is on the screen.',
      'And write the answer into the ticket, not just into the fix. The next '
      + 'person to see this symptom is you, in three weeks, with no memory '
      + 'of any of it.',
    ],
    see_also: ['kb/account-lockout'],
  },
  {
    id: 'kb/mail-on-a-phone',
    title: 'A phone that has stopped getting mail',
    summary: 'It is almost never the phone, and almost always a group.',
    state: 'published',
    issue: 'My phone has stopped getting email. It works on my desktop. I '
      + 'have the eleven o\'clock and I need this fixed now.',
    environment: 'Any account; remote mail on this estate is gated behind the '
      + 'VPN group.',
    resolution: [
      'Check whether mail is arriving anywhere else. Desktop fine, phone not, '
        + 'means the mailbox is fine and the path to it is not.',
      'Check group membership in Active Dictionary before touching the '
        + 'handset. Remote mail here needs VPN Users.',
      'Put the account back in the group and say so on the ticket in the '
        + 'words of what happened.',
      'Only then look at the phone - and remember that re-adding an account '
        + 'destroys the evidence along with the twenty minutes.',
    ],
    cause: [
      'A phone does not hold a mailbox; it holds a connection to one. When '
      + 'mail stops arriving on the handset and keeps arriving on the desktop, '
      + 'the mailbox is fine and the path to it is not - which means the '
      + 'answer is on the account, not on the device the reporter is waving '
      + 'at you.',
      'Group membership is the single most likely thing to have changed '
      + 'underneath somebody: tidy-ups, leavers processes and well-meaning '
      + 'scripts all take people out of groups without ever telling them what '
      + 'they took.',
      'Urgency and importance are not the same field, and a phone is where '
      + 'that difference shows up hardest. One handset not syncing affects one '
      + 'person, however loudly that person mentions their eleven o\'clock. '
      + 'File it honestly, fix it in order, and let the matrix take the '
      + 'argument for you.',
    ],
    see_also: ['kb/account-lockout'],
  },
  {
    id: 'kb/print-permissions',
    title: 'When the printer works for everybody except one person',
    summary: 'One desk failing is a permission; every desk failing is a fault.',
    state: 'published',
    issue: 'The printer works for everyone except me. I have watched the '
      + 'person at the next desk print the same document. I am not making '
      + 'this up.',
    environment: 'The print server checks Print Users before it accepts a '
      + 'job. Any account outside that group, any printer on the estate.',
    resolution: [
      'Ask who else is affected. One desk means permissions; the whole floor '
        + 'means the spooler.',
      'Check the group in Active Dictionary against somebody who CAN print, '
        + 'rather than against what you expect to see.',
      'Add the account back to Print Users.',
      'Record it as what happened - "re-added to Print Users" - because the '
        + 'next person to read this ticket is three weeks away and it is you.',
    ],
    cause: [
      'A printer that has stopped for the whole floor is broken. A printer '
      + 'that has stopped for exactly one person is working perfectly and has '
      + 'been told not to serve them, which is a different job with a '
      + 'different answer - and the two get confused constantly, because from '
      + 'the reporter\'s chair they look identical.',
      'On this estate the print server checks membership of Print Users '
      + 'before it accepts a job. An account outside that group gets no '
      + 'error worth reading: the job leaves the machine, arrives nowhere, '
      + 'and the queue on the printer never hears about it. That silence is '
      + 'the symptom, and it is why the reporter starts sending it again.',
      'Memberships change without anybody telling the person they changed '
      + 'for. Leavers processes, tidy-ups and scripts written by people who '
      + 'have themselves left all remove names from groups; none of them send '
      + 'the user an email about it, and the user experiences it months later '
      + 'as a printer with a grudge.',
    ],
    see_also: ['kb/print-spooler', 'kb/mail-on-a-phone'],
  },
  {
    /**
     * The draft. Every knowledge base has one: started by somebody who was
     * about to leave, never validated, and still sitting in the same list as
     * the articles that were. It is flagged on screen rather than hidden,
     * because hiding it would be a kinder lie than the shelf tells.
     */
    id: 'kb/vpn-on-the-print-server',
    title: 'VPN concentrator (DRAFT - do not follow step 2 yet)',
    summary: 'Unvalidated. Started in March, abandoned in March.',
    state: 'draft',
    issue: 'Remote users cannot connect, or the VPN is described as "down" '
      + 'by somebody who has not said which building they are in.',
    environment: 'PRINT-01, which carries the VPN concentrator as well as the '
      + 'print spooler, because it was the box with a free slot.',
    resolution: [
      'Check the concentrator is actually running: "services PRINT-01".',
      'Reboot the print server. [Editor: no. Do not do this in working hours. '
        + 'Half the building is printing through this box and this step was '
        + 'written by somebody whose notice period had already started.]',
      'Restart the concentrator service on its own, which is what step 2 was '
        + 'trying to say.',
    ],
    cause: [
      'The VPN concentrator shares the print server because it was the only '
      + 'box with a free slot the week the VPN arrived, and nothing has moved '
      + 'since. That is load-bearing beige: two unrelated services on one '
      + 'machine, so an outage in either one arrives as a complaint about the '
      + 'other, and anybody restarting the box for one of them has taken the '
      + 'other one down without noticing.',
      'This article is a draft, which is why it says so in the title. Nobody '
      + 'has validated it, the second step is wrong, and it is still in the '
      + 'list because a draft that nobody can see is a draft nobody will ever '
      + 'finish. Read it as a warning about the estate rather than as '
      + 'instructions.',
    ],
    see_also: ['kb/power-cycle', 'kb/print-spooler'],
  },
];
