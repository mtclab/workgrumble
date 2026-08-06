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
      'Know what YOUR reset button does. In a real directory the reset '
        + 'dialog puts two tick boxes beside the new password - unlock the '
        + 'account, and make them change it at next logon - and both are '
        + 'choices somebody makes. This desk has no boxes: the button always '
        + 'does all three, every time, whether or not there was a lockout to '
        + 'clear. That is a property of this tool, not of resets.',
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
      + 'else. A reset issues a new password, and on this desk it is wired to '
      + 'clear the lockout and set must-change alongside it - which is why it '
      + 'looks like a cure-all and is not: it does nothing '
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
        + 'behind whatever jammed, and what the spooler reports.',
      'Those jobs are files, and files are in a directory. "dir '
        + '\\\\PRINT-01\\C$\\WINDOWS\\SYSTEM32\\SPOOL\\PRINTERS" is the same '
        + 'backlog with a date and a size on every line of it - and four '
        + 'files of exactly the same size are four copies of the same '
        + 'delivery note, which is the thing the reporter has not told you.',
      'STOP THE SPOOLER, then empty the queue. The queued jobs are files on '
        + 'disk and the running service has them open, which is exactly when '
        + 'deleting them fails. On this estate those are one control - '
        + '"clearqueue <printer>", or the hardware panel in Remote Assist - '
        + 'and it stops the service before it drops anything.',
      'Start the spooler again: "restart spooler", or its taskbar entry on '
        + 'the print server. It is deliberately left stopped until you do, '
        + 'because that is the third step and it is yours.',
      'Starting it before the queue is empty is refused, and the refusal says '
        + 'why: it would be handed the same bad job within seconds.',
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
      'So the order is stop, clear, start - not start and hope, and not clear '
      + 'while it is still running either. A service that is up owns those '
      + 'spool files, and the delete is the operation that fails. Starting it '
      + 'in front of the backlog is refused by this workstation, and the '
      + 'refusal says which printer is still holding how many jobs, which is '
      + 'the number the reporter is about to ask you for anyway.',
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
    summary: 'The binding went with the old handset. Prove who you are '
      + 'talking to through a channel the account already has, then enrol a '
      + 'new one and tell them you did.',
    state: 'published',
    issue: 'I have a new phone. The code app is installed and it is empty, and '
      + 'now the sign-in wants a code I do not have. I need this today.',
    environment: 'Any account on the estate; everybody was enrolled in the '
      + 'June rollout, which is also where the callback number and the '
      + 'recovery code came from. Applies to a lost, stolen, wiped or '
      + 'traded-in handset.',
    resolution: [
      'Read the account first. If the second factor is still enrolled, the '
        + 'problem is the app or the clock on the phone, not the account.',
      'PROVE WHO YOU ARE TALKING TO before you enrol anything, and prove it '
        + 'with something the ACCOUNT has rather than something the caller '
        + 'can tell you. Four channels count on this estate: a callback to '
        + 'the number the directory already holds, the recovery code issued '
        + 'in the June envelope, an in-person check, or a recovery contact '
        + 'nominated in advance.',
      'A payroll number, a hiring manager and a desk are NOT any of those. '
        + 'They are on a payslip, on the company website and on a seating '
        + 'plan. Somebody ringing to take an account off you will have all '
        + 'three, and will be apologetic about only having three.',
      'Record which channel you used - "verify callback <account>", or the '
        + 'option in the conversation. "Verified" is not an answer to how, '
        + 'and how is what the incident report asks.',
      'Enrol the new device. That invalidates the old binding, and it sends '
        + 'the account owner a notice that their authenticator was '
        + 're-registered - which is the one control that still works after a '
        + 'desk has been talked into the rest of it. Do not switch that off '
        + 'because somebody finds it annoying.',
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
      'So the guidance everybody\'s policy is copied from - NIST SP 800-63B '
      + 'on account recovery - does not say "check something only they '
      + 'know". It says use what was arranged BEFORE the loss: a prearranged '
      + 'recovery code or contact, a retained authenticator, an address of '
      + 'record you already hold, or identity proofing done again from '
      + 'scratch. And it says NOTIFY the subscriber when a recovery happens, '
      + 'through a channel that is already on file, because that is the only '
      + 'step an attacker cannot be charming past.',
      'Facts about a person are not authentication. Knowledge that is '
      + 'discoverable is knowledge the caller can have, and a desk that '
      + 'accepts it has a control that only works on people who were not '
      + 'trying. The channel is the whole control. It is a minute, nothing in '
      + 'this system enforces it, no ticket has ever been reopened for want '
      + 'of it, and the day it matters you will not know it mattered until '
      + 'somebody else\'s report lands with your name in the timeline.',
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
    id: 'kb/saved-into-temp',
    title: 'The file has not gone anywhere. It is in TEMP.',
    summary: 'Save wrote back to where the file was opened from.',
    state: 'published',
    issue: 'I worked on it all afternoon, I definitely saved it, and this '
      + 'morning it is not in My Documents and it is not in the mail either. '
      + 'Has the machine thrown it away?',
    environment: 'Any workstation. Classically an attachment somebody opened '
      + 'out of a mail, worked on, and saved with the button rather than with '
      + 'Save As.',
    resolution: [
      'Ask what they OPENED it from, not where they saved it. "Out of an '
        + 'email" and "off the P: drive" are two different answers with two '
        + 'different directories behind them.',
      'Look in the temp directory on their box before you look anywhere '
        + 'else: "dir \\\\<host>\\C$\\WINDOWS\\TEMP". The file will be there, '
        + 'under whatever the sender called it, stamped the minute they last '
        + 'pressed Save.',
      'Prove it is the right one before you touch it - "type" the file and '
        + 'read a line of it back to them. A temp directory has more than one '
        + 'thing in it and none of them is labelled.',
      'Move it where they thought it was: "move <file> <directory>". Move '
        + 'rather than copy, because two copies of a spreadsheet is a '
        + 'fortnight of somebody editing the wrong one.',
      'Tell them what happened in one sentence, and tell them the temp '
        + 'directory is cleared out. This is the ticket you get twice from '
        + 'the same person if you only fix it.',
    ],
    cause: [
      'A mail client cannot open an attachment where it lives, because an '
      + 'attachment does not live anywhere: it is inside the message. So it '
      + 'writes a copy into the temp directory and opens THAT, and the '
      + 'program doing the opening has no idea it is looking at a temporary '
      + 'anything.',
      'Save writes back to where the file was opened from. Every time. That '
      + 'is not a bug and it is not a mistake anybody made - it is the only '
      + 'thing Save could possibly mean - and it is why the reporter is '
      + 'completely right that they saved it, nine times, and completely '
      + 'wrong about where it went.',
      'The reason this is worth a ticket rather than a shrug is the second '
      + 'half: the machine treats that directory as disposable and clears it '
      + 'out without asking. Nothing had been lost when they rang. Something '
      + 'would have been.',
    ],
    see_also: ['kb/one-directory-ate-the-drive', 'kb/reading-the-error'],
  },
  {
    id: 'kb/one-directory-ate-the-drive',
    title: 'One directory has eaten the drive',
    summary: 'It is never the user\'s files. It is something automatic.',
    state: 'published',
    issue: 'It says there is not enough disk space. I have saved about four '
      + 'things on this computer in my life, so it cannot be full of mine.',
    environment: 'Any box, and most often one running software nobody in this '
      + 'building has thought about since it was installed.',
    resolution: [
      'Get the free space first: the last line of any listing on that drive '
        + 'says it. "dir \\\\<host>\\C$" - the footer is the fact, and the '
        + 'reporter\'s description is not.',
      'Walk the drive for the pile: "tree \\\\<host>\\C$" for the shape of '
        + 'it, then "dir" on anything that looks like it belongs to a '
        + 'program rather than to a person. The footer of each listing '
        + 'reports what that directory holds; one of them will be an order of '
        + 'magnitude larger than the space you are short of.',
      'Read the software\'s own configuration before you delete a byte. It '
        + 'says where it writes, how often, and what happens to the output '
        + 'afterwards - and "uploaded the same night" is the sentence that '
        + 'makes what is left a second copy.',
      'Empty the one that is a second copy, and only that one: "purge '
        + '<directory>". The data directory next door with the same software\'s '
        + 'name on it is usually the only copy of something the business runs '
        + 'on, and this desk does not delete those.',
      'Then say out loud, on the ticket, that the software will do it again '
        + 'next month. A drive emptied by hand is a ticket with a date on it, '
        + 'not a fix.',
    ],
    cause: [
      'People fill drives with documents at a few kilobytes an afternoon. '
      + 'Programs fill drives with output at tens of megabytes a month, on a '
      + 'schedule, at two minutes to midnight, and nothing anywhere ever '
      + 'deletes any of it. That is why the reporter is right that it is not '
      + 'their files, and why "what have you been saving" is the wrong first '
      + 'question.',
      'What a full drive does is worse than not saving. A machine with no '
      + 'room cannot write a temporary file, cannot spool a print job and '
      + 'cannot always write its own log - so the box goes quiet at exactly '
      + 'the moment you most want to know what it thinks is wrong, and the '
      + 'symptoms arrive as three unrelated tickets from three people.',
      'The judgement, and it is the whole job: output that has already gone '
      + 'somewhere else is a second copy and may go. Anything that is the '
      + 'only copy of anything may not, whatever it is called and however old '
      + 'it looks. If the software cannot tell you which of those you are '
      + 'looking at, you have not finished reading yet.',
    ],
    see_also: ['kb/saved-into-temp', 'kb/event-log'],
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
  {
    id: 'kb/the-one-that-lands-at-five',
    title: 'The request that arrives five minutes before you go home',
    summary: 'It is not late tonight. It is late tomorrow morning, and the '
      + 'clock says so in business minutes.',
    state: 'published',
    issue: 'A request lands at five to five with an hour on the response '
      + 'clock. Nobody is here to do it and the queue looks like it is '
      + 'already failing.',
    environment: 'Any ticket raised inside the last hour of the shift, and '
      + 'every clock this helpdesk keeps.',
    resolution: [
      'Read the deadline rather than the arrival. Both clocks on a ticket are '
        + 'counted in working minutes, so five minutes of tonight plus '
        + 'fifty-five of tomorrow is an hour, and the hour runs out at 09:55 '
        + 'rather than at 17:55.',
      'Decide whether it is genuinely tonight. Almost none of them are: the '
        + 'test is whether somebody cannot work tomorrow morning, not whether '
        + 'they said it was urgent at five to five.',
      'If it is not, leave it, and leave it deliberately - untriaged, in the '
        + 'queue, with the deadline the world gave it. A ticket carried '
        + 'overnight is not a ticket ignored.',
      'If it is, say so on the ticket before you go. A first line written '
        + 'tonight stops the response clock tonight, and it is the only thing '
        + 'you can do at five to five that is worth anything tomorrow.',
      'Do it first thing. The whole of the risk in this class is that a '
        + 'deadline sitting in the middle of tomorrow morning is a deadline '
        + 'nobody looks at until tomorrow afternoon.',
    ],
    cause: [
      'Service clocks count the hours somebody is at the desk, which is the '
      + 'only honest way to count them: a target of one hour would otherwise '
      + 'be missed by every ticket raised after four o\'clock, every day, '
      + 'for reasons no helpdesk in the world has any control over. So the '
      + 'minutes stop at seventeen hundred and start again at nine.',
      'What that means in practice is that a request landing five minutes '
      + 'before close carries almost all of its window into the next morning, '
      + 'and the queue on a Thursday morning is quietly holding a Wednesday '
      + 'deadline that runs out before most people have read their mail. It '
      + 'is not a trick and it is not a punishment; it is the arithmetic '
      + 'working exactly as it is written down.',
      'The reason it feels like a trap is the person, not the clock. Somebody '
      + 'raising a ticket at five to five has usually just found out about it '
      + 'themselves, is about to leave, and will be back before you are - so '
      + 'the ticket is read by them first thing and by you second thing, '
      + 'which is the wrong way round and the whole of the problem.',
    ],
    see_also: ['kb/print-permissions'],
  },
  {
    id: 'kb/the-restart-nobody-does',
    title: 'It has been asking to restart since last week',
    summary: 'Updates are staged until the machine goes round once. Nothing '
      + 'else is wrong with it.',
    state: 'published',
    issue: 'A machine has been showing a restart prompt for days. The person '
      + 'using it has been clicking Later since the prompt appeared.',
    environment: 'Any workstation on the estate with staged updates, which is '
      + 'most of them by the end of a month.',
    resolution: [
      'Check the machine actually has updates staged before you restart '
        + 'anything. A prompt somebody half-remembers is not evidence, and a '
        + 'restart that fixes nothing has still cost them their afternoon.',
      'Ask when they are not in a call. This is the entire job on a sales '
        + 'floor and it is not a courtesy: a machine restarted mid-call is a '
        + 'ticket about you rather than about updates.',
      'Restart it from Remote Assist. The staged updates finish on the way '
        + 'back up and the prompt is gone.',
      'Ask for a ticket if there was not one. It takes them a minute, it '
        + 'takes you none, and it is the only record that the work happened '
        + 'at all.',
    ],
    cause: [
      'Updates on this estate are staged rather than applied: they download, '
      + 'they sit, and they wait for the machine to go round once, because '
      + 'applying them live to a machine somebody is working on is how you '
      + 'take a floor out at half past two. The prompt is the only thing that '
      + 'ever asks, and it asks in a dialog with a Later button on it.',
      'Later is a perfectly rational answer for a person whose day is made of '
      + 'calls, and it is the right answer several days running, which is how '
      + 'a machine ends up a week behind with a prompt it has stopped being '
      + 'able to see. Nothing is broken and nothing will break; the machine '
      + 'is simply carrying a set of updates that will apply the moment '
      + 'anybody lets it.',
    ],
    see_also: ['kb/power-cycle'],
  },
  {
    id: 'kb/document-checkout-lock',
    title: 'A document is stuck "checked out" to somebody who is not there',
    summary: 'A document management check-out is a lock one user holds; a client '
      + 'that closed uncleanly never released it. An admin releases the '
      + 'check-out.',
    state: 'published',
    issue: 'Nobody can edit a document in the document management system - '
      + 'iManage or NetDocuments - because it is checked out to a colleague who '
      + 'is out, off, or swears they closed it. It is read-only to everyone '
      + 'else and there is a deadline on it.',
    environment: 'A law firm or professional-services estate running a document '
      + 'management system (iManage Work, NetDocuments) with check-in/check-out '
      + 'version control.',
    resolution: [
      'Confirm who holds the check-out and that they genuinely are not working '
        + 'on it. Releasing a lock somebody is actively editing throws away '
        + 'their unsaved changes, which is a worse ticket than the one you have.',
      'Release the stale check-out from the admin tool: iManage Control Center '
        + '(Unlock / Check In on behalf of), or the NetDocuments admin console. '
        + 'This is an administrator action, not a server login.',
      'Tell the person waiting that the document is editable again, and note '
        + 'whose check-out it was in case the client keeps doing it.',
    ],
    cause: [
      'A document management system marks a document checked out to whoever '
      + 'has it open, so that two people cannot silently overwrite each other. '
      + 'The check-out is released when the user checks the document back in - '
      + 'which a client that is closed cleanly does for them, and a client '
      + 'that crashes or is killed by shutting the lid does not.',
      'So the lock outlives the editing: the document stays held by a session '
      + 'that no longer exists, read-only to everyone else, until an '
      + 'administrator releases it. Nothing is corrupted and nothing needs '
      + 'restoring; the hold is simply still there and has to be taken off.',
    ],
    see_also: ['kb/matter-workspace-access', 'kb/saved-into-temp'],
  },
  {
    id: 'kb/matter-workspace-access',
    title: 'A new starter cannot open a matter they have been staffed on',
    summary: 'Matter workspaces are per-matter security groups because the '
      + 'ethical wall is; a new starter is in none of them until somebody adds '
      + 'them.',
    state: 'published',
    issue: 'Somebody - usually a new associate or a fee-earner just staffed on '
      + 'a case - cannot see a matter workspace or shared drive at all, when '
      + 'everyone else on the matter can.',
    environment: 'A law firm document management or file-share estate where '
      + 'access is granted per matter, with conflicts / ethical-wall screening '
      + 'in front of it.',
    resolution: [
      'Check the request has been through the conflicts system before you '
        + 'grant anything. A matter\'s access list is an ethical wall - the '
        + 'firm can be sanctioned for putting a screened lawyer on the wrong '
        + 'side of one - so "please add me" is not on its own authority to add.',
      'Once it is cleared, add the person to that matter\'s security group. '
        + 'Membership is per matter, not global: being on one matter grants '
        + 'nothing about any other.',
      'Confirm they can now open the workspace, and leave the grant on record '
        + 'against the matter.',
    ],
    cause: [
      'Access to a matter is a security group of its own, because the ethical '
      + 'wall is drawn per matter: a firm has to be able to say exactly who can '
      + 'and cannot see a given case, and the only honest way to enforce that '
      + 'is one group per matter with a controlled membership.',
      'A new starter, therefore, is in none of them - not because anything is '
      + 'broken but because they have not been added to any yet. The grant is '
      + 'the whole of the fix, and the only thing that makes it more than an '
      + 'ordinary permission is the check that has to come before it.',
    ],
    see_also: ['kb/document-checkout-lock', 'kb/shared-mailbox-permissions'],
  },
  {
    id: 'kb/e-filing-pdf-rejected',
    title: 'The court e-filing system keeps rejecting the PDF',
    summary: 'CM/ECF rejects PDFs with document security set or no text layer. '
      + 'The fix is the flattened, OCR\'d PDF/A - and using the right file.',
    state: 'published',
    issue: 'An attorney cannot file a document before a court deadline because '
      + 'CM/ECF rejects the upload - "malformed or contains security settings" - '
      + 'and the deadline will not move for a technical failure.',
    environment: 'A law firm filing into a federal court via CM/ECF (or a state '
      + 'e-filing portal with the same PDF rules), under a statutory deadline '
      + 'the court does not excuse for filer-side problems.',
    resolution: [
      'Read the rejection. "Security settings" means the PDF has document '
        + 'restrictions (a permissions password / encryption) applied - often '
        + 'from a "print to PDF" of a secured draft. "Not a valid PDF" or a '
        + 'size failure usually means a scan with no text layer.',
      'Get an acceptable copy. The correct artifact is a flattened PDF/A with '
        + 'the security removed and a text layer present (OCR the scan if it is '
        + 'an image). Very often the paralegal already exported one - check '
        + 'where the "Save As PDF/A" dialog actually put it before remaking it.',
      'Make sure the CM/ECF upload dialog is pointed at that file and not the '
        + 'rejected draft, and confirm the docket entry once it goes through.',
      'Because the clock is real: do the fastest safe thing first. If the '
        + 'good file exists, place it; only regenerate if it does not.',
    ],
    cause: [
      'CM/ECF enforces the court\'s document rules at upload: a PDF with '
      + 'security restrictions cannot be processed (the court has to be able to '
      + 'stamp and manipulate it), and a scanned image with no text layer fails '
      + 'the searchable-PDF requirement. A draft printed with security on, or a '
      + 'scan run without OCR, hits exactly these and bounces.',
      'The trap under a deadline is that the acceptable copy frequently already '
      + 'exists - somebody exported a flattened PDF/A earlier - but the export '
      + 'landed somewhere nobody thought to look, so the office keeps '
      + 're-uploading the one file that will never be accepted. The fix is as '
      + 'much finding the right file as making one, and it is genuinely urgent '
      + 'because the court does not care whose fault the format was.',
    ],
    see_also: ['kb/saved-into-temp', 'kb/document-checkout-lock'],
  },
  {
    id: 'kb/okta-app-assignment',
    title: 'The SSO tile just bounces back to the dashboard',
    summary: 'An app login loop after an SSO change is usually a missing group '
      + 'assignment: Okta authenticates, finds no app, and returns you.',
    state: 'published',
    issue: 'A user clicks an application in Okta (or another SSO portal) and is '
      + 'returned straight to the dashboard - no error, no login, a loop - '
      + 'while their colleagues reach the same app fine.',
    environment: 'An estate using Okta (or Entra ID / OneLogin) with '
      + 'group-based application assignment, typically just after an app\'s SSO '
      + 'integration was rebuilt or migrated.',
    resolution: [
      'Check the user\'s assignment to the app in the admin console. A loop '
        + 'with no error is the signature of an authenticated user who has no '
        + 'assignment to the app they clicked.',
      'If the app is assigned via a group, add the user to that group (or fix '
        + 'the group rule that should have caught them). A migration that '
        + 'rebuilds an app on a new group routinely leaves stragglers behind.',
      'Have them retry from a fresh tile. Confirm they land in the app rather '
        + 'than back on the dashboard.',
    ],
    cause: [
      'SSO does two separate things: it proves who you are, and it decides '
      + 'which applications you are entitled to. The login loop is what happens '
      + 'when the first succeeds and the second finds nothing - the identity '
      + 'provider authenticates the user, sees no assignment to the requested '
      + 'app, and has nowhere to send them but back to the dashboard.',
      'That is why it looks like a broken password and is not one. When an app '
      + 'is rebuilt on a new group-based assignment, anyone not carried into '
      + 'the new group is authenticated-but-unassigned, and the fix is the '
      + 'membership, not the credential.',
    ],
    see_also: ['kb/offboarding-access-gap', 'kb/sso-mfa-lockout'],
  },
  {
    id: 'kb/offboarding-access-gap',
    title: 'A leaver still has access they should have lost',
    summary: 'Disabling an account does not strip its group memberships. A '
      + 'leaver keeps app and admin access until somebody removes the groups.',
    state: 'published',
    issue: 'An access review turns up somebody who has left - a contractor, a '
      + 'former employee - still in a sensitive application or admin group, '
      + 'able to reach things a non-employee should not.',
    environment: 'Any estate with SSO / directory group-based access (Okta, '
      + 'Entra ID, Active Directory) where offboarding disabled accounts but '
      + 'did not fully deprovision them.',
    resolution: [
      'Confirm the person really has left and the account is genuinely a '
        + 'leaver\'s, not a rename or a shared one. Removing access from the '
        + 'wrong account is its own incident.',
      'Remove the lingering group memberships - the app and admin groups the '
        + 'review flagged. Disabling the sign-in earlier did not touch these.',
      'Note it against the offboarding process: a gap that turned up once is a '
        + 'gap the next leaver will have too until the checklist is fixed.',
    ],
    cause: [
      'Disabling an account stops the person signing in, and it is easy to '
      + 'assume that is the whole of offboarding. It is not: group memberships '
      + 'are separate facts about the account, and nothing removes them when '
      + 'the account is disabled - they simply persist.',
      'So a half-finished offboarding leaves a disabled account that is still '
      + 'a member of everything it ever was, and if the account is later '
      + 're-enabled, or the access is evaluated by group rather than by '
      + 'sign-in state, the leaver\'s reach is exactly what it was the day they '
      + 'left. The finding is real and the fix is to strip the groups.',
    ],
    see_also: ['kb/okta-app-assignment', 'kb/licence-seats'],
  },
  {
    id: 'kb/sso-mfa-lockout',
    title: 'Okta has locked the account after too many failed sign-ins',
    summary: 'An SSO/MFA lockout is a lockout: the platform shut the door after '
      + 'a failed run, and an admin unlocks it from the console.',
    state: 'published',
    issue: 'A user cannot get into anything through SSO - the authenticator '
      + 'stopped taking its code, they retried, and now the identity platform '
      + 'has locked the account outright.',
    environment: 'An estate using Okta (or Entra ID / Duo) with an account '
      + 'lockout threshold on failed authentication attempts.',
    resolution: [
      'Read the state before you touch it: locked is not the same as a broken '
        + 'factor or a disabled account, and each has its own fix. This one is '
        + 'a lockout - the door is shut after a failed run.',
      'Unlock the account from the admin console. The lockout clears and the '
        + 'user can sign in again.',
      'If the authenticator itself was the reason the sign-ins failed, that is '
        + 'a separate question - a factor reset - to answer after they are '
        + 'back in, not a reason to leave them locked out now.',
    ],
    cause: [
      'An identity platform counts failed sign-ins and, past a threshold, '
      + 'locks the account - the same defence Active Directory has, in a '
      + 'different console. A user whose authenticator is misbehaving will trip '
      + 'it quickly, because each rejected code is another failed attempt.',
      'The lockout is working as designed and the fix is simply to unlock it. '
      + 'What it is not is a password reset or a re-enrolment: those solve '
      + 'different faults that happen to arrive at the same login box, and '
      + 'reaching for the wrong one leaves the user exactly as stuck.',
    ],
    see_also: ['kb/account-lockout', 'kb/second-factor'],
  },
  {
    id: 'kb/msp-scope-escalation',
    title: 'It is a server / it is production and you are the helpdesk',
    summary: 'A helpdesk contract covers workstations and users, not servers. A '
      + 'prod issue on a box you do not manage is escalated, fast and clean.',
    state: 'published',
    issue: 'A customer asks the desk to fix something on a server - "just '
      + 'restart the app server", "the product is down" - and the box is out '
      + 'of the contract, out of your operating system, or both.',
    environment: 'An MSP service desk on a helpdesk (workstations-and-users) '
      + 'contract, where a customer also runs servers - often Linux production '
      + 'boxes - that another team or the customer\'s own infrastructure owns.',
    resolution: [
      'Recognise the boundary before you reach for a tool. A helpdesk contract '
        + 'covers workstations and user accounts; servers, and especially '
        + 'production, are not in it. Workstation credentials do not cross into '
        + 'the server tier, which is why the attempt is refused and not merely '
        + 'discouraged.',
      'Do not try to work around it. On a Linux prod box a Windows tech has no '
        + 'console anyway, so the refusal is doubled - wrong contract and wrong '
        + 'toolset - and forcing it is how a Tier-1 tech ends up in an incident '
        + 'review.',
      'Escalate it fast and clean: hand it to the team that owns the box - the '
        + 'customer\'s infrastructure team or the field engineers - with what '
        + 'is known and what was checked. A quick correct escalation beats a '
        + 'slow wrong fix, and on production it beats it by a lot.',
    ],
    cause: [
      'Scope on an MSP is enforced, not advisory: the contract decides what the '
      + 'desk may touch, the same way delegated admin decides what an account '
      + 'may reach. A server on a helpdesk contract is out of scope on purpose, '
      + 'because the people who own it need to know who changed it and when.',
      'When the server is also a different operating system - a Linux box to a '
      + 'Windows service desk - the wall is doubled: there is no contract to '
      + 'act under and no tool to act with. Being refused and escalating is not '
      + 'a failure of the desk; it is the shape of the job, and on a customer-'
      + 'facing outage it is the fastest route to the people who can actually '
      + 'fix it.',
    ],
    see_also: ['kb/backup-verification-gap', 'kb/monitoring-only-alerts'],
  },
  {
    id: 'kb/backup-verification-gap',
    title: 'A backup that "succeeded" is not a backup you can restore from',
    summary: 'Monitoring the backup JOB is not testing the RESTORE. A failed '
      + 'job is raised; a green job that was never restore-tested is the real '
      + 'risk.',
    state: 'published',
    issue: 'A monitoring alert reports a backup job failed on a server. On a '
      + 'monitoring-only account the desk may only acknowledge and escalate - '
      + 'and the deeper worry is what the green nights were hiding.',
    environment: 'A monitoring-only MSP account where the MSP watches backup '
      + 'job status but does not run or verify the backups themselves, and does '
      + 'not perform test restores.',
    resolution: [
      'Acknowledge the alert and escalate it to whoever performs the customer\'s '
        + 'remediation. On a monitoring-only contract that is the whole of the '
        + 'job: the fix is not the desk\'s to make.',
      'Say clearly in the escalation that the backup FAILED, so it is treated '
        + 'as data-at-risk and not a noisy alert. A clinic or a firm losing a '
        + 'night of backups is a real exposure.',
      'Flag the standing gap when you raise it: nobody is test-restoring these. '
        + 'A run of green nights is not evidence the data can be recovered, only '
        + 'that the job reported success.',
    ],
    cause: [
      'A backup job reporting success means the job ran and thought it wrote '
      + 'its data. It does not mean the data is complete, uncorrupted, or '
      + 'restorable - the only thing that proves that is actually restoring it, '
      + 'and monitoring the job status never does.',
      'So the failed alert in front of you is the honest one; the dangerous '
      + 'case is the long stretch of green before it, which everybody read as '
      + '"backups are fine" when all it ever said was "the job did not error". '
      + 'A monitoring-only contract watches the job and no more, which is why '
      + 'escalating the failure loudly - and naming the untested-restore gap - '
      + 'is the value the account is paying for.',
    ],
    see_also: ['kb/monitoring-only-alerts', 'kb/msp-scope-escalation'],
  },
  {
    id: 'kb/monitoring-only-alerts',
    title: 'On a monitoring-only account you raise it, you do not fix it',
    summary: 'A threshold alert - expiring cert, filling disk - on a '
      + 'monitoring-only contract is escalated in time, not remediated. Early '
      + 'is the point.',
    state: 'published',
    issue: 'A monitoring board flags a threshold on a customer\'s server - a '
      + 'TLS certificate near expiry, a disk crossing its low-space line - and '
      + 'the instinct is to renew it or clear it, which is out of contract.',
    environment: 'A monitoring-only MSP account: the MSP watches the estate and '
      + 'notifies, and remediation is explicitly out of scope until authorised '
      + 'as separate billable work.',
    resolution: [
      'Acknowledge the alert. Do not renew the certificate or clear the disk - '
        + 'both are remediation, and remediation is not what this contract '
        + 'covers. The desk will be refused if it tries, which is the contract '
        + 'working, not a bug.',
      'Escalate to whoever does the customer\'s fixes, with the specifics: the '
        + 'expiry date, the free-space number, the box. A threshold alert is '
        + 'only worth anything if it is raised with enough runway to act on.',
      'Raise it EARLY. The entire value of watching a threshold rather than an '
        + 'outage is the head start; an alert escalated the morning the cert '
        + 'expires or the disk fills has thrown that head start away.',
    ],
    cause: [
      'A monitoring-only contract buys eyes, not hands: the MSP watches and '
      + 'notifies, and the customer keeps their own remediation (or buys it '
      + 'separately). A threshold alert is the product working exactly as sold '
      + '- it fires before the thing breaks, so somebody who can act still has '
      + 'time to.',
      'That is why the honest move is to escalate rather than to reach in. A '
      + 'certificate renewed or a disk cleared by the desk is out-of-scope work '
      + 'that nobody agreed to and nobody is billing, and it hides the fact '
      + 'that the customer\'s own process is not keeping up. Raising it in good '
      + 'time is both what the contract allows and what actually protects them.',
    ],
    see_also: ['kb/expired-certificate', 'kb/backup-verification-gap'],
  },
  {
    id: 'kb/dfs-namespace-down',
    title: 'The shared drive is there but empty: DFS wedged on the server',
    summary: 'A mapped drive whose folders all vanish is usually the Distributed '
      + 'File System service on the file server, wedged. On a fully-managed '
      + 'contract the server is yours to restart.',
    state: 'published',
    issue: 'A whole office loses a mapped drive at once - the letter is still '
      + 'mapped but every folder under it is empty or errors - and it is the same '
      + 'for everyone, which points at the server rather than any one desk.',
    environment: 'A fully-managed MSP customer where the MSP runs the entire '
      + 'estate, including a Windows file server that publishes the shared drive '
      + 'through a DFS namespace.',
    resolution: [
      'Confirm it is everyone, not one machine. A drive that is empty on every '
        + 'desk at once is a server-side fault, not a per-workstation mapping - '
        + 'which is what tells you to look at the server rather than reconnect a '
        + 'drive letter.',
      'Check the Distributed File System service on the file server. A wedged '
        + 'service reports running while the namespace it serves resolves to '
        + 'nothing, so the drive maps and then shows empty.',
      'Restart the service on the server. On a fully-managed contract the server '
        + 'is in scope, so this is the fix - not an escalation. The shares come '
        + 'back the moment the namespace is answering again.',
    ],
    cause: [
      'A DFS namespace is the layer that turns a friendly share path into the '
      + 'real servers behind it. When the Distributed File System service on the '
      + 'host wedges, the mapping still resolves to a drive letter but the '
      + 'namespace underneath returns nothing, so every folder reads as empty at '
      + 'once and on every machine - which is the tell that it is the server, not '
      + 'the desk.',
      'This is a server-side fix, and that is the whole point of the tier. At a '
      + 'helpdesk customer a server is out of contract and the move would be to '
      + 'escalate; on a fully-managed contract the MSP owns the server, so '
      + 'restarting the wedged service on it is the desk\'s job and the honest, '
      + 'fastest route back to a working shared drive.',
    ],
    see_also: ['kb/print-spooler', 'kb/msp-scope-escalation'],
  },
  {
    id: 'kb/co-managed-raci',
    title: 'Co-managed: hand the user resets back to their own helpdesk',
    summary: 'On a co-managed contract, day-to-day user support is the '
      + 'customer\'s internal IT. A routine reset that lands in the MSP queue is '
      + 'handed back, not double-handled.',
    state: 'published',
    issue: 'A routine daytime user issue - a lockout, a password reset - reaches '
      + 'the MSP queue from a co-managed customer, often because a user mailed '
      + 'the wrong address, and the instinct is to just fix it.',
    environment: 'A co-managed MSP customer that keeps its own internal IT team. '
      + 'A RACI split divides the work: their team owns day-to-day user support, '
      + 'the MSP owns servers, after-hours, and specialist or project work.',
    resolution: [
      'Read who owns the work before you touch it. Under a co-managed RACI, '
        + 'day-to-day user support - lockouts, resets, the ordinary desk stuff - '
        + 'is the customer\'s internal team\'s responsibility, not the MSP\'s.',
      'Do not just do it because you can. Resetting their user from the MSP side '
        + 'poaches their team\'s job and risks two desks acting on one account - '
        + 'the "I thought you had it" double-work the split exists to prevent.',
      'Hand it back to their helpdesk, cleanly, with a note of what it is and why '
        + 'it is theirs. A correct hand-back is the resolution here, exactly as a '
        + 'correct escalation is on an out-of-scope server.',
    ],
    cause: [
      'Co-managed is not fully-managed with extra steps: it is a genuine division '
      + 'of labour between two IT teams, written down as a RACI so both sides '
      + 'know who is Responsible for what. Day-to-day user support sitting with '
      + 'the customer\'s own team is the commonest split, and it is deliberate - '
      + 'their people are on site and know the users.',
      'When a user-support ticket lands in the MSP queue anyway, the value the '
      + 'desk adds is knowing it is not theirs and routing it back, not quietly '
      + 'fixing it. Two teams both resetting the same account is how people get '
      + 'locked out twice and how the account of who did what falls apart, which '
      + 'is precisely the failure the co-managed boundary is drawn to avoid.',
    ],
    see_also: ['kb/co-managed-coordination', 'kb/msp-scope-escalation'],
  },
  {
    id: 'kb/co-managed-coordination',
    title: 'Co-managed: notify their IT first, then act',
    summary: 'On a co-managed contract the MSP can act on the customer\'s estate '
      + '- but not unilaterally. Notify their own IT before you touch a shared '
      + 'box, then do the work.',
    state: 'published',
    issue: 'An after-hours or specialist job on a co-managed customer is the '
      + 'MSP\'s to do - a wedged service on a server their team has left for the '
      + 'night - but acting on their box without a word is caught by the scope '
      + 'engine.',
    environment: 'A co-managed MSP customer with its own internal IT. Servers, '
      + 'after-hours and specialist work are the MSP\'s under the RACI, but the '
      + 'estate is shared, so both teams can reach the same boxes.',
    resolution: [
      'Confirm the work is yours under the split - after-hours, a server, a '
        + 'specialist task - so you know coordinating is the last gate, not a way '
        + 'of dodging a hand-back that should go to their team.',
      'Notify their IT first ("notify <service>"). This files the heads-up that '
        + 'the MSP is on the box, so their team is not surprised by a change and '
        + 'nobody trips over anybody on a shared server. It clears the action.',
      'Then do the work - restart the wedged service, make the change. The notify '
        + 'is what turns a refused unilateral action into a coordinated one; for '
        + 'genuinely risky work a change request with their IT as sign-off is the '
        + 'heavier version of the same idea.',
    ],
    cause: [
      'A shared estate is the defining fact of co-managed: two teams can both '
      + 'reach the same servers, so an unannounced change by one is a change the '
      + 'other did not know about. Coordinating first - a simple heads-up that '
      + 'the MSP is on the box - is what keeps two teams working the same '
      + 'infrastructure from standing on each other.',
      'That is why acting unilaterally is refused rather than allowed with a '
      + 'warning: the "I thought you had it" gap is the exact risk the contract '
      + 'exists to close, and a coordination step you can skip is a coordination '
      + 'step that gets skipped. Notify, then act - and for risky work, route it '
      + 'through a change request their IT signs off, which is the same '
      + 'coordination with a bigger paper trail.',
    ],
    see_also: ['kb/co-managed-raci', 'kb/the-restart-nobody-does'],
  },
];
