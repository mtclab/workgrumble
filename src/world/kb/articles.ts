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
    id: 'kb/second-factor',
    title: 'A new phone, and an authenticator with nothing in it',
    summary: 'The binding went with the old handset. Check who you are '
      + 'talking to, then enrol a new one.',
    state: 'published',
    issue: 'I have a new phone. The code app is installed and it is empty, and '
      + 'now the sign-in wants a code I do not have. I need this today.',
    environment: 'Any account on the estate; everybody was enrolled in the '
      + 'June rollout. Applies to a lost, stolen, wiped or traded-in handset.',
    resolution: [
      'Read the account first. If the second factor is still enrolled, the '
        + 'problem is the app or the clock on the phone, not the account.',
      'VERIFY WHO YOU ARE TALKING TO before you enrol anything. Not their '
        + 'name - their name is on the ticket. Something only they have: the '
        + 'payroll number, the manager who hired them, the desk they sit at.',
      'Enrol the new device. The old binding is gone the moment the new one '
        + 'exists, which is what makes this both the fix and the risk.',
      'Write on the ticket HOW you verified them. "Verified" is not evidence; '
        + '"confirmed payroll number and start date with HR" is.',
      'Do not revoke their sessions to "clear it out". That signs them out of '
        + 'the one place they can still get in from.',
    ],
    cause: [
      'A second factor is a binding between an account and a device, not a '
      + 'setting on the account. Restoring a phone from a backup does not '
      + 'always carry it across, because the whole design of the thing is that '
      + 'it cannot be copied - which is the property everybody wants until the '
      + 'Tuesday they buy a new handset.',
      'That is why re-enrolment is the fix and also the risk. Anybody who can '
      + 'convince a service desk to bind a new device to an account has just '
      + 'been handed that account, and they will not do it by hacking '
      + 'anything: they will ring at ten to five, in a hurry, from a number '
      + 'that is not on file, apologising for being a nuisance.',
      'The check is the whole control. It is thirty seconds, nothing in the '
      + 'system enforces it, no ticket has ever been reopened for want of it, '
      + 'and the day it matters you will not know it mattered until somebody '
      + 'else\'s report lands with your name in the timeline.',
    ],
    see_also: ['kb/three-ways-an-account-says-no', 'kb/reading-the-error'],
  },
  {
    id: 'kb/the-account-that-relocks',
    title: 'The account that locks itself again ten minutes later',
    summary: 'Something is still typing the old password, and it is not a '
      + 'person.',
    state: 'published',
    issue: 'You unlocked it yesterday and it locked itself again. I have '
      + 'changed my password twice. What am I doing wrong?',
    environment: 'Any account, and the thing at the other end is usually a '
      + 'device: a tablet, a handset, a mapped drive, a machine in a cupboard.',
    resolution: [
      'Unlock it, then look at the bad password count over the next few '
        + 'minutes. A count that climbs while the user is not typing is the '
        + 'whole diagnosis.',
      'Open Event Viewer on the machines around them and read the 4625s. The '
        + 'interval between them is the giveaway: people are irregular, and a '
        + 'device is not.',
      'Find what holds the old credential - the tablet in the cupboard, the '
        + 'scanner, the account on the shared machine - and clear it.',
      'THEN unlock the account. Doing it the other way round works too, and '
        + 'you will do it the other way round once, and then never again.',
      'Tell the user what it was. They have spent a fortnight believing they '
        + 'type their own password wrong.',
    ],
    cause: [
      'A lockout counter does not care who is typing. It counts failed '
      + 'attempts against the account, and a device that was set up with a '
      + 'password months ago will offer that password every few minutes, '
      + 'forever, with the patience of something that does not know it is '
      + 'wrong.',
      'So the shape is unmistakable once you have seen it once: unlock, ten '
      + 'quiet minutes, locked again, at the same interval, all day. The user '
      + 'is not doing anything and cannot stop doing it, which is why they '
      + 'start apologising and changing their password, which achieves '
      + 'nothing except making the tablet more wrong than it was.',
      'The kit that does this is always kit nobody remembers: it was set up '
      + 'for a project, it works, and it has therefore not been thought about '
      + 'since. Ask what else signs in as this person and then go and look, '
      + 'because the answer to "what else" is always "nothing" and is always '
      + 'wrong.',
    ],
    see_also: ['kb/account-lockout', 'kb/event-log'],
  },
  {
    id: 'kb/shared-mailbox-permissions',
    title: 'Full Access and Send As are two permissions',
    summary: 'Granting the mailbox does not grant sending from it. Do both, or '
      + 'expect the second ticket.',
    state: 'published',
    issue: 'You added me to the shared mailbox and I can see everything, but '
      + 'when I try to reply it will not let me send.',
    environment: 'Shared mailboxes on this estate. Access is a permission on '
      + 'the mailbox; sending as it is membership of a group beside it.',
    resolution: [
      'Grant Full Access on the mailbox. That is what lets somebody open it, '
        + 'read it and file things in it.',
      'Then ask the question the request did not: will they be REPLYING from '
        + 'it? If anybody answers yes, they need Send As as well.',
      'Add the account to the Send As group for that mailbox. On this estate '
        + 'that is where the permission lives.',
      'Say both out loud on the ticket. The next person to read the request '
        + 'will read it exactly as literally as you did.',
    ],
    cause: [
      'Opening a mailbox and sending from an address are different operations '
      + 'and the mail system treats them as such, because they are different '
      + 'risks: one lets somebody read what a department is saying, and the '
      + 'other lets them say things as that department to a customer.',
      'The trouble is that nobody outside IT has ever been told there are two, '
      + 'so requests are written as "please add me to the Sales mailbox" and '
      + 'granted exactly as written. The request is satisfied, the ticket '
      + 'closes, and forty minutes later the same person is back, apologising '
      + 'for coming back.',
      'It is worth grating your teeth about, because it is the cheapest '
      + 'possible repeat ticket and it is caused by doing the job correctly. '
      + 'The fix is a habit rather than a setting: whenever a mailbox is '
      + 'granted, ask what they intend to do with it, and grant the pair.',
    ],
    see_also: ['kb/print-permissions', 'kb/reading-the-error'],
  },
  {
    id: 'kb/licence-seats',
    title: 'No free seats, and the man who left in April',
    summary: 'Disabling an account does not hand its licence back. Somebody '
      + 'has to.',
    state: 'published',
    issue: 'The new starter cannot open the accounts package. It says it '
      + 'cannot obtain a licence. Everything else on the machine is fine.',
    environment: 'The Accounts Suite licence pool on the file server, and any '
      + 'other pool with a fixed number of seats.',
    resolution: [
      'Read the pool before you touch an account: how many seats exist and '
        + 'how many are free. Nought free is not a fault, it is arithmetic.',
      'Find who is holding them. Sort the directory by the licence flag and '
        + 'look for accounts that are disabled - a leaver holding a seat is '
        + 'the classic, and there is almost always one.',
      'Take the seat back off the leaver. Then assign it to the new starter. '
        + 'That order, because the second one is refused until the first has '
        + 'happened.',
      'Raise the underlying problem separately: the leavers process should be '
        + 'reclaiming these, and it is not, and that is a ticket about a '
        + 'process rather than about a person.',
    ],
    cause: [
      'Licences of this kind are counted, not granted: the company bought six '
      + 'seats and the software will hand out six. It has no opinion about '
      + 'whether the six people holding them still work here, because it has '
      + 'no way of knowing and nobody has ever told it.',
      'Disabling an account is a directory operation. It stops somebody '
      + 'signing in and it does nothing whatever to a licence pool on another '
      + 'system, which continues to count that seat as used for as long as '
      + 'anybody keeps paying for it. Leavers processes almost always stop one '
      + 'step short of this, because the step is on a different console.',
      'The symptom is therefore always somebody innocent: a new starter, on '
      + 'their first morning, in front of the manager who hired them, holding '
      + 'a machine that works perfectly and one program that does not. The '
      + 'cause is six months old and belongs to nobody in the room.',
    ],
    see_also: ['kb/three-ways-an-account-says-no'],
  },
  {
    id: 'kb/expired-certificate',
    title: 'Running perfectly and refusing everybody',
    summary: 'An expired certificate is not an outage and does not restart '
      + 'away.',
    state: 'published',
    issue: 'Nobody working from home can connect. The client says the '
      + 'connection could not be verified. It worked yesterday.',
    environment: 'The VPN concentrator on PRINT-01, and anything else on the '
      + 'estate that presents a certificate.',
    resolution: [
      'Check the service is actually running before you believe anybody. In '
        + 'this case it will be, and that is the diagnosis.',
      'Read the certificate expiry. "Could not be verified", "not trusted" '
        + 'and "the name on the certificate does not match" are three '
        + 'different messages and only one of them is this.',
      'Renew the certificate. Do NOT restart the service first: it comes back '
        + 'with the same expired certificate and forty more people notice.',
      'Raise the renewal date somewhere a human will see it. Certificates are '
        + 'the only fault in this building that sends you a warning and picks '
        + 'the date itself.',
    ],
    cause: [
      'A certificate is a statement with an end date on it, and every client '
      + 'checks the end date before it will talk. When the date passes, the '
      + 'service carries on running, listening and answering, and refuses '
      + 'every connection politely - which is the worst possible failure mode '
      + 'to diagnose, because every monitoring check you have says it is up.',
      'This is why the flood arrives all at once and why restarting is the '
      + 'first thing everybody tries: the service looks healthy, so the '
      + 'instinct is to make it more healthy. It comes back in four seconds '
      + 'with the same expired certificate, which reads as "the restart did '
      + 'not fix it" rather than as "you fixed the wrong thing".',
      'It also expires at a time nobody chose, which is why these land at '
      + 'half past nine on a Thursday and not during a change window. The '
      + 'renewal date was set by whoever issued it, a year ago, and the '
      + 'reminder went to an address belonging to somebody who has left.',
    ],
    see_also: ['kb/power-cycle', 'kb/vpn-on-the-print-server'],
  },
  {
    id: 'kb/announced-maintenance',
    title: 'It was announced, and it is still broken',
    summary: 'A window that was announced can still leave a fault behind. '
      + 'Check the clock before you close anybody down.',
    state: 'published',
    issue: 'The common drive has gone. All my files have been deleted. It has '
      + 'been like this all morning and nobody has said anything.',
    environment: 'Any announced maintenance window, and the flood of reports '
      + 'that arrives during one regardless of what was announced.',
    resolution: [
      'Read your own inbox first. If there is a window, note when it OPENS '
        + 'and when it CLOSES; the second one is the number that matters.',
      'Inside the window: attach the reports to one parent incident, reply '
        + 'with the announcement and the time it ends, and stop there.',
      'Past the closing time: it is a fault, whatever the mail said. Check '
        + 'the service actually came back and start it if it did not.',
      'Close the duplicates with the parent so every reporter gets the same '
        + 'sentence at the same minute. Forty different explanations of one '
        + 'outage is how a service desk loses an argument it was winning.',
    ],
    cause: [
      'People do not read maintenance announcements, and telling them to read '
      + 'maintenance announcements has never once worked. The announcement is '
      + 'still worth sending, because its job is not to prevent the tickets - '
      + 'it is to be the thing you can point at, in one sentence, forty times, '
      + 'without composing forty explanations.',
      'The genuinely dangerous half is the opposite mistake: assuming every '
      + 'report during a window is the window. A maintenance job that takes a '
      + 'service down and does not bring it back leaves an outage that looks '
      + 'exactly like the planned one and is not, and the complaints about it '
      + 'are correct while the announcement is also correct.',
      'So the discipline is the clock rather than the mail. Before the closing '
      + 'time, it is expected. After it, somebody has to check the thing came '
      + 'back - and "somebody" is not named in the announcement, which is how '
      + 'a two-hour window becomes a five-hour one.',
    ],
    see_also: ['kb/event-log', 'kb/power-cycle'],
  },
  {
    id: 'kb/the-same-thing-every-week',
    title: 'The same fault, the same evening, every week',
    summary: 'Two timestamps that match are a timetable. Find whose.',
    state: 'published',
    issue: 'The warehouse printer was dead again when I came in. Not jammed. '
      + 'Off. It was like this on Tuesday as well.',
    environment: 'Anything on a socket somebody else can reach: corridors, '
      + 'store rooms, the space under a desk, the warehouse.',
    resolution: [
      'Stop fixing it. Open the Event Viewer for the machine and write down '
        + 'the times it went down, not just the dates.',
      'Compare them. Two outages at the same minute on different days is not '
        + 'a coincidence and is not a hardware fault; it is somebody\'s round.',
      'Work out whose round. Cleaning, security, deliveries and the people '
        + 'who service the vending machine all have timetables, and Facilities '
        + 'know all of them.',
      'Fix it where the cause is: a note by the socket, a socket cover, or a '
        + 'different socket. Then write down what it was, because the next '
        + 'person to see this will not have the timestamps.',
    ],
    cause: [
      'Kit in shared spaces shares those spaces with people doing jobs that '
      + 'have nothing to do with computers, and those jobs need power. A '
      + 'cleaner needs a socket for twenty minutes, finds one with something '
      + 'beige plugged into it that nobody has ever mentioned, and gives it '
      + 'back afterwards. Nobody has done anything wrong at any point.',
      'What makes it a legendary sort of fault rather than an ordinary one is '
      + 'that it is invisible to everything IT normally looks at. The machine '
      + 'is healthy, the logs are clean apart from a power event nobody reads, '
      + 'and the only witness is a pattern of timestamps across days - which '
      + 'is exactly the thing an event log is for and exactly the thing nobody '
      + 'looks at while a printer is down and a warehouse is waiting.',
      'The repair is not technical and that is the point of writing it down. A '
      + 'note on the wall by the socket ends it permanently, costs nothing, '
      + 'and is the single highest-value thing anybody will do this week.',
    ],
    see_also: ['kb/event-log', 'kb/power-cycle'],
  },
  {
    id: 'kb/known-since-spring',
    title: 'Broken since March, needed by three',
    summary: 'The deadline is not the same thing as the age. Fix it or hand it '
      + 'on, and record both dates.',
    state: 'published',
    issue: 'The headcount report has not run since March and I need it for a '
      + 'board pack at three o\'clock this afternoon.',
    environment: 'Scheduled jobs on the file server, and every long-broken '
      + 'thing that becomes urgent because somebody upstream has a meeting.',
    resolution: [
      'Find out when it actually broke, and put that date on the ticket in '
        + 'the first work note. It is the most useful sentence on the record.',
      'Check whether it is fixable from here. A scheduled job that has been '
        + 'stopped since a maintenance window usually just needs starting.',
      'If it is not - if it needs rewriting, or data nobody has - hand it on '
        + 'with the date it broke and the deadline side by side, and say '
        + 'plainly which of the two you can meet.',
      'Either way, tell the requester what is possible before three, not at '
        + 'three. The deadline is theirs; the surprise does not have to be.',
    ],
    cause: [
      'Things that have been broken for months are not broken more slowly than '
      + 'things that broke this morning; they are broken in a way everybody '
      + 'has found a manual workaround for, which is why nobody raised them. '
      + 'The workaround is somebody\'s Sunday, and it stays invisible right up '
      + 'until the day the manual version cannot be done in time.',
      'That is what makes the deadline feel unreasonable and what makes it '
      + 'real anyway. The person asking is not being unfair - they have '
      + 'genuinely only just been given the meeting - and the fact that it '
      + 'could have been raised in March is true and is nobody in the room\'s '
      + 'fault either.',
      'The professional move is to separate the two dates on the record and '
      + 'then work the deadline. "Broken since 14 March, needed 15:00 today" '
      + 'is a sentence that fixes the process later without spending the '
      + 'afternoon arguing about it now.',
    ],
    see_also: ['kb/reading-the-error', 'kb/event-log'],
  },
  {
    id: 'kb/somebody-reported-a-phish',
    title: 'Somebody reported a suspicious mail. Reward that.',
    summary: 'Verify it, quarantine the sender, and thank them in writing.',
    state: 'published',
    issue: 'Probably nothing, but this email asking me to re-enter my password '
      + 'looks wrong to me. Sorry to bother you.',
    environment: 'Mail, everywhere, forever. The transport rules live beside '
      + 'the mailbox settings.',
    resolution: [
      'Do not click the link. Not to check, not in a private window, not on '
        + 'the spare machine. There is nothing at the other end you need.',
      'Verify it from the headers and the sender domain: a lookalike domain, '
        + 'a reply-to that does not match, an urgency that does not fit the '
        + 'sender.',
      'Quarantine the sender - the transport rule is where that is done - and '
        + 'check whether it went to anybody else.',
      'REPLY TO THE REPORTER, in words, saying they were right to send it. '
        + 'This is the step people skip and it is the one that pays.',
    ],
    cause: [
      'A phishing mail costs nothing to send and works on volume, so the only '
      + 'defence that scales is people forwarding the odd ones to you. That '
      + 'defence is made entirely of goodwill: nobody is paid to report mail, '
      + 'and everybody who does it is briefly worried they are wasting your '
      + 'time.',
      'Which is why the reply matters more than the rule. Somebody who gets a '
      + 'thank-you reports the next one; somebody who gets silence, or a '
      + 'terse "yes that is spam", does not - and the next one is the one that '
      + 'goes to forty people in Finance on a Friday afternoon.',
      'As for clicking it to see: the link is not a link, it is a page '
      + 'designed to look like your sign-in, and the only information it gives '
      + 'you is information you already had. It also confirms, to the person '
      + 'who sent it, that this address is real and reads its mail.',
    ],
    see_also: ['kb/reading-the-error', 'kb/second-factor'],
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
