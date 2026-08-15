import { POOL_BODGE_ARTICLES } from './pool-bodge';
import { POOL_CORPORATE_ARTICLES } from './pool-corporate';
import { AUTHORED_KB_ARTICLES } from './authored';
import { POOL_DESK_ARTICLES } from './pool-desk';
import { POOL_MSP_ARTICLES } from './pool-msp';
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
    see_also: [
      'kb/co-managed-raci',
      'kb/co-managed-application-ownership',
      'kb/the-restart-nobody-does',
    ],
  },
  {
    id: 'kb/co-managed-application-ownership',
    title: 'Co-managed: the box you CAN touch and should not',
    summary: 'Where the RACI gives an application to the customer\'s own IT, '
      + 'your credentials still reach it. Nothing stops you. Tell them first '
      + 'anyway - they find out either way, and the difference is only whether '
      + 'you were the one who said it.',
    state: 'published',
    issue: 'A line-of-business application at a co-managed customer has fallen '
      + 'over, the fix is a service restart, and the box it runs on is one the '
      + 'RACI hands to their own IT. The restart works. Nothing refuses it, no '
      + 'permission is missing, and there is no error to read - which is '
      + 'exactly why this article exists.',
    environment: 'A co-managed customer with a written RACI: a document that '
      + 'names, function by function, which team is responsible for what. The '
      + 'usual split gives the MSP infrastructure monitoring, patching, the '
      + 'security stack and the end-user help desk, and keeps application '
      + 'ownership, the custom systems and on-site work with the customer\'s '
      + 'own team. The MSP holds an admin account regardless, because it '
      + 'monitors the box.',
    resolution: [
      'Check the RACI before the box, not after it. "Can I reach it" and "is it '
        + 'mine" are two different questions, and on a co-managed account only '
        + 'the second one is about the contract.',
      'If the function is theirs, notify their IT first ("notify <target>"), '
        + 'then do the work if it still needs doing. For anything with a real '
        + 'blast radius, a change request with their sysadmin as the sign-off '
        + 'is the same courtesy with a signature on it.',
      'If it is out of hours and their one IT person is not answering, do the '
        + 'work and tell them anyway - the notify is a record, not a request '
        + 'for permission, and a heads-up filed at nine at night is still a '
        + 'heads-up. What is never right is doing it and saying nothing.',
    ],
    cause: [
      'A RACI divides responsibility; it does not divide credentials. The MSP '
      + 'monitors the estate, so the MSP has an admin account on the estate, so '
      + 'every box on it is technically reachable - including the ones the '
      + 'document says are somebody else\'s. The wall is a written agreement '
      + 'between two teams, and a written agreement is not enforced by an '
      + 'access-denied.',
      'Their IT manager finds out regardless. He runs monitoring on his own '
      + 'application: a service that stopped and started again is on his '
      + 'dashboard before he has finished his coffee, with the account name '
      + 'that did it beside it. The only thing your silence changes is whether '
      + 'he heard it from you or from a graph - and a peer who has to ask "who '
      + 'was on my server last night" is a peer who starts checking.',
      'That is the whole cost, and it is worth being precise about it: nothing '
      + 'breaks, no contract is voided, and the ticket closed. What you spend '
      + 'is standing with the other IT department on the account - the one '
      + 'whose opinion of the MSP is the renewal conversation - and you spend '
      + 'it to save the fifteen seconds that telling him would have taken.',
    ],
    see_also: ['kb/co-managed-coordination', 'kb/co-managed-raci'],
  },
  {
    id: 'kb/xray-sensor-not-detected',
    title: 'The intraoral X-ray sensor says "not detected"',
    summary: 'A chair-side sensor that stops being detected has usually dropped '
      + 'off the USB bus. Reseat the connection first; it is the fix in the '
      + 'overwhelming majority of cases.',
    state: 'published',
    issue: 'The dentist goes to take a radiograph and the imaging software reports '
      + 'no sensor connected, with a patient in the chair mid-procedure. It was '
      + 'working earlier the same day.',
    environment: 'A dental operatory: a USB intraoral sensor (DEXIS-class or '
      + 'similar) plugged into the chair-side workstation, often through a hub or '
      + 'a run of cable that gets moved during cleaning and setup.',
    resolution: [
      'Reseat the sensor\'s USB connection - unplug it and plug it back in, at the '
        + 'workstation end and at the sensor/interface end. In this game that is a '
        + 'device power-cycle on the sensor ("power <device>" or the control on the '
        + 'Remote Assist screen).',
      'Confirm the imaging software now sees the sensor and the dentist can '
        + 'capture. Tell reception it is back so the appointment can carry on.',
      'If reseating does not bring it back, the next steps are a different USB port '
        + 'or hub and then the sensor driver - but the reseat comes first, because '
        + 'it is the fastest and by far the most common cause.',
    ],
    cause: [
      'An intraoral sensor is a USB device, and "not detected" is the imaging '
      + 'software saying the operating system is not enumerating it on the bus. A '
      + 'connector worked loose, a powered hub browned out, or the interface '
      + 'stopped responding - none of which is a fault of the workstation, the '
      + 'imaging software, or the patient database, all of which are fine.',
      'That is why re-seating the USB connection is the whole of the first-line '
      + 'fix and why rebuilding software or touching the patient record would be '
      + 'exactly the wrong move: the image pipeline and the chart are intact, and '
      + 'the only thing missing is the device on the bus. Under a patient-in-the-'
      + 'chair clock, the reseat is both the fastest and the correct answer.',
    ],
    see_also: ['kb/power-cycle', 'kb/reading-the-error'],
  },
  {
    id: 'kb/imaging-bridge-pms-update',
    title: 'X-rays stop saving to the chart after a PMS update',
    summary: 'When captures stop writing to the patient chart after a practice-'
      + 'management update, the imaging bridge and the new PMS version no longer '
      + 'agree. Restarting the bridge will not fix it - escalate to the vendor.',
    state: 'published',
    issue: 'After a practice-management-system update, the surgery can still '
      + 'capture X-rays but they never appear in the patient\'s chart. The imaging '
      + 'bridge service is running and restarting it changes nothing.',
    environment: 'A managed dental practice where a DEXIS-class imaging package '
      + 'writes captured images into a Dentrix-class PMS through an integration '
      + 'bridge running on the practice server, all Windows.',
    resolution: [
      'Confirm the shape of it: capture works, the write to the chart does not, '
        + 'and it started with the PMS update. The bridge service being "running" is '
        + 'the trap - it is up, it just cannot hand images across any more.',
      'Do not keep restarting the bridge. A restart reloads the same integration '
        + 'against the same changed interface, so it cannot help; it only burns the '
        + 'clock on a clinical workflow that is down.',
      'Escalate to the imaging vendor with the specifics - which PMS update went '
        + 'on, when it last worked, and that captures succeed but do not write. A '
        + 'version reconciliation of the bridge is the vendor\'s to make, and a fast '
        + 'clean escalation with the details is the job at any contract tier.',
    ],
    cause: [
      'An imaging bridge is glue between two vendors\' software: it takes what the '
      + 'imaging package captures and writes it into the PMS through whatever '
      + 'interface that PMS version exposes. When the PMS updates and moves or '
      + 'changes that interface, the bridge is left calling something that is no '
      + 'longer there, so the capture succeeds and the hand-off silently fails.',
      'That is why a restart is useless and why this is not a desk fix even on a '
      + 'fully-managed contract where the server is yours to touch: the defect is a '
      + 'version mismatch between two third-party products, and only the vendor can '
      + 'reconcile the bridge to the new PMS release. Recognising a vendor '
      + 'integration break and escalating it fast beats a morning of restarts.',
    ],
    see_also: ['kb/msp-scope-escalation', 'kb/announced-maintenance'],
  },
  {
    id: 'kb/hipaa-access-review',
    title: 'Who opened this chart: answering an access review from the audit trail',
    summary: 'A patient\'s "who has seen my record" request is answered by reading '
      + 'the PMS audit trail and reporting it back - a read and a report, not a '
      + 'repair, and nothing on the estate changes.',
    state: 'published',
    issue: 'A patient asks the practice for an accounting of who has accessed '
      + 'their record, and the office manager needs the answer pulled from the '
      + 'practice management system to give back to them.',
    environment: 'A managed dental practice whose PMS (Dentrix-class) keeps a '
      + 'HIPAA-style audit trail of chart access - who opened which record and '
      + 'when - on the practice server the MSP administers.',
    resolution: [
      'Get the patient and the date range the accounting has to cover from the '
        + 'practice before you run anything, so the report answers the actual '
        + 'request and not a broader one.',
      'Run the PMS audit-trail report for that patient and period. It lists each '
        + 'chart open with the account and the timestamp - that is the accounting, '
        + 'already recorded; you are reading it, not building it.',
      'Report the result back to the practice on the ticket, so the office manager '
        + 'can give the patient a straight answer. Nothing is remediated because '
        + 'nothing is broken - the deliverable is the accurate answer, given.',
    ],
    cause: [
      'A practice management system logs chart access as a matter of course, '
      + 'because a covered entity has to be able to say who saw a record. So an '
      + 'access review is not an investigation you assemble - it is a report you '
      + 'run against a log the system has been keeping all along, filtered to the '
      + 'patient and the dates the request is about.',
      'That is why the honest close is a report back rather than a fix: reading an '
      + 'audit trail and running its report is administrative work a managed '
      + 'contract covers, no record is altered, and the value is entirely in the '
      + 'accounting being accurate and given to the practice to pass on. Changing '
      + 'anything on the chart would be the one thing an access review must not do.',
    ],
    see_also: ['kb/backup-verification-gap', 'kb/reading-the-error'],
  },
  {
    id: 'kb/systemd-start-limit',
    title: 'A Linux service that failed and stopped trying to come back',
    summary: 'A crashed unit that hit its start-limit needs starting by hand.',
    state: 'published',
    issue: 'A service on one of our Linux boxes is down and has not come back on '
      + 'its own. systemctl status shows it as failed, and whatever it served is '
      + 'unreachable - a web app throwing errors, a portal nobody can log in to.',
    environment: 'A Linux server reached over ssh, at the engineer tier: a unit '
      + 'run under systemd (Type=notify or a plain daemon) that is meant to be up '
      + 'and is sitting failed rather than running.',
    resolution: [
      'ssh to the box and read the unit: "systemctl status <unit>". A failed unit '
        + 'shows a red state and no Main PID - it is down, not merely busy.',
      'Read WHY before you touch it: "journalctl -u <unit>" shows the crash and, '
        + 'under it, systemd\'s own lines - the process exited, it was rescheduled, '
        + 'and "Start request repeated too quickly" is the start-limit being hit.',
      'Bring it back: "systemctl restart <unit>". This resets the start-limit '
        + 'counter and starts the unit - it prints nothing on success, which is '
        + 'systemd telling you it worked; do not expect a confirmation line.',
      'Confirm with "systemctl status <unit>" again: Active should read active '
        + '(running) with a Main PID, and the thing it serves should answer.',
    ],
    cause: [
      'systemd will restart a crashed unit for you, but only so many times in so '
      + 'long. If a service dies and is restarted repeatedly inside its '
      + 'StartLimitIntervalSec window, systemd decides the restarts are not '
      + 'helping, gives up, and leaves the unit in the failed state - which is why '
      + 'a service that "just crashed once" can be sitting stopped an hour later.',
      'That is the whole reason a manual restart is the fix here rather than a '
      + 'config change: nothing is misconfigured, the unit simply exhausted its '
      + 'automatic retries and stopped trying. "systemctl restart" resets the '
      + 'counter and starts it cleanly. If it fails AGAIN straight away the crash '
      + 'is not transient and the journal is where the real cause is - but a unit '
      + 'that comes up and stays up was only ever waiting to be started by hand.',
    ],
    see_also: ['kb/reading-the-error'],
  },
  {
    id: 'kb/disk-full-journal',
    title: 'A Linux box out of disk, and the journal that ate it',
    summary: 'df -h shows the root filesystem full; du finds the runaway journal; '
      + 'vacuum it and the space comes back.',
    state: 'published',
    issue: 'A Linux server is out of disk. Jobs are failing with "No space left on '
      + 'device", services will not write, and monitoring is flagging the root '
      + 'filesystem at or near 100%.',
    environment: 'A Linux server reached over ssh, at the engineer tier: a box '
      + 'whose root filesystem has filled up, usually because something has been '
      + 'writing logs faster than anything rotates them.',
    resolution: [
      'Confirm it: "df -h". The line mounted on / shows Use% at or near 100% and '
        + 'Avail near zero - that is the fire, not a warning.',
      'Find what is eating it before you delete anything: "du -sh /var/log/*" (or '
        + '"du -sh /var/log/journal") points at the biggest directory. On a box '
        + 'that has been crash-looping, the systemd journal is the usual culprit - '
        + 'du shows it at several gigabytes.',
      'Reclaim it: "journalctl --vacuum-size=200M" deletes the archived journals '
        + 'down to a 200M cap and frees the rest. It reports how much it freed.',
      'Confirm with "df -h" again: Avail is back up and Use% has dropped, and the '
        + 'jobs that were failing on "No space left on device" run again.',
    ],
    cause: [
      'A disk does not fill by magic - something is writing and nothing is '
        + 'cleaning up. The commonest version on an app box is a service that '
        + 'crash-loops: every restart logs to journald, and with no size cap the '
        + 'journal grows without bound until it has eaten the whole root '
        + 'filesystem. df tells you the disk is full; du tells you WHICH directory '
        + 'did it, which is the difference between fixing the cause and deleting '
        + 'something you needed.',
      'Vacuuming the journal is the immediate fix, but it is treating a symptom: '
        + 'the real fix is capping the journal (SystemMaxUse in journald.conf) so '
        + 'it can never do this again, and fixing whatever was crash-looping so it '
        + 'stops filling the journal in the first place. A disk that filled once '
        + 'with nothing capping it will fill again.',
    ],
    see_also: ['kb/systemd-start-limit', 'kb/one-directory-ate-the-drive'],
  },
  {
    id: 'kb/cert-expiry-process',
    title: 'A certificate that expired, which is a process failure, not a '
      + 'technical one',
    summary: 'The service is up and refusing everybody because its TLS '
      + 'certificate ran out; renew it, and put the next expiry on a calendar.',
    state: 'published',
    issue: 'A public web service is throwing certificate errors - "your '
      + 'connection is not private", a full-page security warning - and nobody can '
      + 'reach it. The service itself is up; it is the certificate that is being '
      + 'refused.',
    environment: 'A Linux server reached over ssh, at the engineer tier: a web '
      + 'service (nginx or similar) terminating TLS with a certificate that has '
      + 'passed its expiry date. The service is running and healthy; browsers, '
      + 'correctly, refuse an expired certificate.',
    resolution: [
      'Confirm it is the cert and not the service: "curl -I https://<host>". An '
        + 'expired certificate reports "SSL certificate problem: certificate has '
        + 'expired" - the handshake fails before any HTTP status, which tells you '
        + 'the service is up and the cert is the problem.',
      '"certbot certificates" reads what is on the box and its expiry.',
      'Renew it: "certbot renew" replaces the certificate and reloads the service. '
        + 'The service was up the whole time; it stops being refused the moment the '
        + 'new certificate is in place.',
      'Confirm with "curl -I https://<host>" again: a normal HTTP response line, '
        + 'no certificate error.',
    ],
    cause: [
      'This is the trap worth learning, and it took down O2 and Microsoft Teams: '
        + 'an expired certificate is NOT a technical failure. Nothing crashed, no '
        + 'config changed, no deploy went out - the service ran perfectly right up '
        + 'to the moment the certificate reached a date on it, and then every '
        + 'browser refused it. It is a MONITORING and PROCESS failure: the '
        + 'certificate was fine until the day it was not, and nobody was tracking '
        + 'the deadline.',
      'The renew is the fix in the moment. The fix for good is that a certificate '
        + 'is a deadline nobody scheduled: put every certificate expiry on a '
        + 'calendar with an alarm weeks ahead, or automate the renewal (certbot '
        + 'can), and monitor the expiry date the way you monitor whether the '
        + 'service is up - because a service that is up and refusing everybody is '
        + 'down in every way that matters to the person trying to use it.',
    ],
    see_also: ['kb/expired-certificate', 'kb/systemd-start-limit'],
  },
  {
    id: 'kb/failed-deploy-postmortem',
    title: 'A deploy that "worked in staging", and the blameless postmortem after',
    summary: 'Roll back the broken release to stop the bleeding; then write the '
      + 'blameless postmortem that closes the incident - the system, never the '
      + 'name.',
    state: 'published',
    issue: 'A service that was fine is down after a release. "It worked in '
      + 'staging." The unit failed to start in production, and whatever it does '
      + 'has stopped.',
    environment: 'A Linux server reached over ssh, at the engineer tier: a service '
      + 'that failed to start after a deploy, usually because production is not '
      + 'identical to the staging it was tested in.',
    resolution: [
      'Read why it failed: "journalctl -u <unit>" shows the startup error - here, '
        + 'a config key the build needs that production does not set and staging '
        + 'did.',
      'Stop the bleeding: roll the release back to the last-good build and '
        + '"systemctl restart <unit>". Confirm it is up with "systemctl status".',
      'Close the incident properly: "postmortem file <unit>". A blameless '
        + 'postmortem is how the tier closes an incident - the restart stops the '
        + 'outage, the postmortem stops it happening the same way twice.',
    ],
    cause: [
      '"It worked in staging" is true and means nothing when staging is not '
        + 'production. The build read a config key that staging sets and '
        + 'production does not, exited non-zero on startup, and systemd hit the '
        + 'start-limit and left it failed. The gap that let a good build fail was '
        + 'not the person who ran the deploy - it was that staging was not a '
        + 'faithful copy of production, and the pipeline had no pre-flight to catch '
        + 'the difference and no automated rollback to soften it.',
      'That is why the postmortem is BLAMELESS: it analyses the system, never the '
        + 'name. A postmortem that stops at "so-and-so pushed it" teaches the team '
        + 'to hide mistakes; one that says "staging had no parity and the pipeline '
        + 'had no rollback" produces the changes that actually stop the class of '
        + 'thing - bring staging into parity, gate deploys on a config pre-flight, '
        + 'wire an automatic rollback on a failed start. The write-up is the '
        + 'professional move, not the punishment.',
    ],
    see_also: ['kb/systemd-start-limit', 'kb/reading-the-error'],
  },
  {
    id: 'kb/permission-denied',
    title: 'A Linux service down because it cannot read its own config file',
    summary: 'The unit is failed and the journal says "Permission denied" on a '
      + 'file: the owner or the mode is wrong. chown/chmod it readable, then '
      + 'restart.',
    state: 'published',
    issue: 'A service on one of our Linux boxes is down and will not start. '
      + 'systemctl status shows it failed, and journalctl shows it dying on '
      + '"Permission denied" for a config or key file - not a crash, a service '
      + 'that cannot read a file it needs.',
    environment: 'A Linux server reached over ssh, at the engineer tier: a unit '
      + 'that reads a config/secret file at startup, whose owner or permission '
      + 'bits were changed (often by a deploy) so the service account can no '
      + 'longer read it.',
    resolution: [
      'Read why it failed: "journalctl -u <unit>" shows the startup error - here, '
        + '"Permission denied" on a specific file path. That path is the whole of '
        + 'the fault.',
      'Look at the file the long way: "ls -la <path>". The mode column '
        + '(-rw-------) and the owner/group columns tell you who can read it - and '
        + 'a service account that is neither the owner nor in the group, with no '
        + 'other-read bit, cannot.',
      'Fix the owner and the bits: "chown root:<service> <path>" restores the '
        + 'group the service reads through, and "chmod 640 <path>" gives that group '
        + 'read while keeping the secret off everyone else. Least privilege, not '
        + 'chmod 777.',
      'Bring it up: "systemctl restart <unit>", then confirm with "systemctl '
        + 'status" - active (running). A restart before the file is readable just '
        + 'fails again; the fix is the permission, not the retry.',
    ],
    cause: [
      'A service runs as its own unprivileged account, and it can only start if '
        + 'it can READ the config or key file it loads. When a deploy or a hurried '
        + 'copy leaves that file owned root:root at mode 600, the owner (root) can '
        + 'read it and nobody else can - so the service account is denied, the '
        + 'process exits, and systemd leaves the unit failed. Nothing crashed and '
        + 'nothing is misconfigured in the app: a permission bit is wrong.',
      'That is the lesson worth keeping: a large share of "the service is down" '
        + 'turns out to be a permission, not a bug. The mode column in ls -la and '
        + 'the "Permission denied" line in the journal point straight at it, and '
        + 'the fix is chown/chmod to least privilege - the group reads, the world '
        + 'does not - never a panicky chmod 777 that trades the outage for a leak.',
    ],
    see_also: ['kb/systemd-start-limit', 'kb/reading-the-error'],
  },
  {
    id: 'kb/selinux-context',
    title: 'A file the permissions say is readable, and the server still will not '
      + 'serve it',
    summary: 'On the RHEL family there are two gates on every file: the rwx bits '
      + 'and the SELinux label. ls -la only shows you one of them, and the '
      + 'journal tells you which one said no.',
    state: 'published',
    issue: 'A service on a Red Hat, Rocky, Alma or Fedora box refuses to read a '
      + 'file - a 403, or a "permission denied" in its own log - and ls -la shows '
      + 'the permissions are perfectly correct: the right owner, the right group, '
      + 'the right mode. Nothing has crashed; the service is up and refusing.',
    environment: 'A box on the RHEL family with SELinux enforcing (which is the '
      + 'default, and getenforce will tell you). Typically content that was '
      + 'MOVED or RESTORED into place - out of a home directory, off a backup, '
      + 'with cp or tar - rather than created where it now lives.',
    resolution: [
      'Establish which gate you are arguing with. "getenforce" answers Enforcing '
        + 'or Permissive in one word, and "sestatus" gives the fuller picture: '
        + 'whether SELinux is on, which policy is loaded, and the mode both as it '
        + 'is now and as the config file will set it at the next boot.',
      'Read the journal for the box, not just the service: "journalctl -u <unit>". '
        + 'A label denial writes an AVC line - "avc:  denied  { read }" - and that '
        + 'line names both sides of the argument. The scontext is what the process '
        + 'is running as; the tcontext is what the file is labelled; permissive=0 '
        + 'means it was actually refused rather than merely logged.',
      'Look at the label, which ls -la does not show you: the -Z flag adds it '
        + '("ls -laZ <path>"). A context reads user:role:TYPE:level, and it is the '
        + 'type in the middle that decides. Content that arrived from somebody\'s '
        + 'home directory is typed as home-directory content, whatever its mode '
        + 'says, and the web server is not permitted to read that type from '
        + 'anywhere.',
      'Put the label back to what the policy says that path should have. The '
        + 'policy already holds an answer for every path on the system - that is '
        + 'what it is - and "restorecon -v <path>" applies it and prints what it '
        + 'changed. Then ask the service again. Nothing needs restarting: the '
        + 'label is checked per access, so the next request is a new argument.',
    ],
    cause: [
      'SELinux is a second, independent gate. The rwx bits answer "may this USER '
        + 'read this file"; the policy answers "may a process running in THIS '
        + 'domain read a file with THAT type". Both have to say yes. A file can '
        + 'therefore be 644, owned by exactly the account that wants it, and still '
        + 'be refused - which is why the permission columns being obviously fine is '
        + 'a symptom of this fault rather than evidence against it.',
      'The label travels with the file. Creating a file somewhere inherits the '
        + 'label of where it is; moving or restoring one CARRIES the old label in, '
        + 'which is why this turns up after a restore, a tar extract, or a copy out '
        + 'of a home directory, and why the fix is called a RELABEL - the file is '
        + 'in the right place with the wrong name on it, and the policy already '
        + 'knows the right one.',
      'There is a second thing that makes the symptom go away, and it is worth '
        + 'understanding rather than reaching for: putting the whole box in '
        + 'permissive mode. Permissive does not fix a label - it stops the box '
        + 'acting on labels at all, everywhere, for everything, and logs what it '
        + 'would have refused. It works instantly, which is exactly the danger: '
        + 'the one file is served, and a machine that was enforcing an entire '
        + 'policy is now enforcing nothing, indefinitely, because nobody puts it '
        + 'back. On a managed estate it is also the sort of thing that turns up on '
        + 'somebody else\'s compliance report with your hostname on it.',
      'So the honest reading of "SELinux is a nightmare, just turn it off" is that '
        + 'the denial was in the journal the whole time and the permissions were '
        + 'never the problem. The AVC line is not noise - it is the diagnosis, '
        + 'already written down, naming the two contexts that disagreed.',
    ],
    see_also: ['kb/permission-denied', 'kb/reading-the-error'],
  },
  {
    id: 'kb/exec-exception-risk',
    title: 'The executive who wants the exception',
    summary: 'A senior person asks the desk to open a hole - MFA off, a mailbox '
      + 'delegate, off the filter. The bypass is a real feature, and it is also '
      + 'the vulnerability. Grant it narrowly, in writing, knowing what it costs.',
    state: 'published',
    issue: 'The CEO (or their assistant, on their behalf) wants a security '
      + 'control removed because it is inconvenient: turn off the two-factor '
      + 'prompts, give the EA full access to the mailbox, take the mailbox off '
      + 'the mail filter. They are senior, they are insistent, and it needs '
      + 'doing today.',
    environment: 'An executive account on the corporate estate: enrolled in the '
      + 'MFA rollout, on the mail filter, with a mailbox other people would like '
      + 'a key to. The exceptions are all real, supported settings - which is '
      + 'exactly why they are dangerous.',
    resolution: [
      'Slow down before you grant. Every one of these is a REAL product feature '
        + '- the MFA exemption, the FullAccess delegate, the per-user filter '
        + 'bypass - so nothing will stop you doing it. That is not permission; it '
        + 'is the absence of a guardrail, and the guardrail has to be you.',
      'Name what it exposes, once, plainly, to the person who can accept the '
        + 'risk - not to punish the request but so the decision is theirs on the '
        + 'record. MFA off is the one control that survives a stolen password, '
        + 'gone from the account most worth stealing. A FullAccess delegate is a '
        + 'key that keeps working after a password reset. Off the filter is the '
        + 'busiest inbox in the building with nothing in front of a forgery.',
      'Grant the narrowest thing that meets the actual need. The EA wants to '
        + 'answer email - that is a delegate scoped to send-on-behalf, not '
        + 'FullAccess. The exec hates the prompts - that is a hardware key or a '
        + 'longer session, not MFA removed. A specific supplier is being '
        + 'quarantined - that is an allow-list entry, not the whole mailbox off '
        + 'the filter.',
      'If it is granted anyway - and with an executive it often is - get the '
        + 'risk acceptance in writing from someone senior enough to own it, and '
        + 'record what was changed and when. When the exempted account is the one '
        + 'that gets compromised, the incident starts with "who opened this, and '
        + 'who said yes", and "the CEO asked" is not the same as an answer.',
    ],
    cause: [
      'These are not misconfigurations or exploits; they are sanctioned bypasses '
        + 'that ship in the product precisely so that important people can be '
        + 'exempted from the controls everyone else lives with. The exec-mail-'
        + 'skips-filtering setting is a documented feature; so is a FullAccess '
        + 'delegate; so is removing a second factor. The exception IS the '
        + 'vulnerability, and it is a vulnerability the vendor built a button for.',
      'The reason it matters is who ends up on the other end of it. Attackers do '
        + 'not target the intern; they target the executive, because the '
        + 'executive can move money and is the one person the organisation has '
        + 'quietly agreed to stop protecting. Business email compromise - the '
        + 'fraudulent-wire scam that runs off exactly these gaps - costs '
        + 'organisations billions a year, and it almost always lands on an account '
        + 'that had an exception on it: no second factor, a delegate nobody '
        + 'tracked, mail that skipped the filter.',
      'So the skill here is not technical - the technical part is a checkbox - it '
        + 'is organisational. "No" to a senior person is a political act, and the '
        + 'job is to make the risk visible and the decision owned rather than to '
        + 'quietly absorb it. Granting the exception is the path of least '
        + 'resistance every single time, and the bill for it arrives later, in '
        + 'somebody else\'s incident, with the grant you made sitting in the '
        + 'timeline.',
    ],
    see_also: ['kb/second-factor', 'kb/bec-incident-response'],
  },
  {
    id: 'kb/bec-incident-response',
    title: 'When the exec account is the one that got in',
    summary: 'An executive mailbox is compromised and sending fraudulent wire '
      + 'requests. Contain it, revoke the stolen session, hunt the mailbox for '
      + 'the rule the attacker left, and remove the delegate - a password reset '
      + 'is the part that changes the least.',
    state: 'published',
    issue: 'An executive account is sending mail the executive did not send - '
      + 'usually asking Finance to change supplier bank details or push an urgent '
      + 'wire. The account is compromised, the exec insists they clicked nothing, '
      + 'and Finance is waiting on the "urgent" payment while you work.',
    environment: 'A compromised executive mailbox on the corporate estate: often '
      + 'one that had an exception on it - no second factor, off the mail filter, '
      + 'a delegate other people were given - which is what made it the account '
      + 'the phish landed on and got in through.',
    resolution: [
      'Contain the account first: DISABLE it. You interrogate an account you '
        + 'have already switched off, not one still logging in - and while you '
        + 'hesitate, the account is sending mail as its owner.',
      'REVOKE the sessions. This is the step everyone skips because they reset '
        + 'the password instead, and the reset does not do it: a session or OAuth '
        + 'token minted in the phish outlives a password change, so the attacker '
        + 'stays signed in through a "reset" account until the sessions are '
        + 'explicitly killed.',
      'HUNT THE INBOX RULES, and this is the part that actually ends the fraud. '
        + 'A BEC attacker sets a rule that forwards anything about an invoice or a '
        + 'wire to an address they control, marks it read and moves it to Deleted, '
        + 'so the exec never sees the thread they are being impersonated in. That '
        + 'rule KEEPS FORWARDING after a password reset - it is a permission on '
        + 'the mailbox, not a session - so list the rules, find the one that is '
        + 'not theirs, and remove it. If you stop at the reset, the forward runs '
        + 'on and you have closed nothing.',
      'Check the DELEGATES. A FullAccess delegate granted as a convenience is a '
        + 'second way in that also survives the reset, and during an incident it '
        + 'is a persistence vector until proven otherwise. Review who holds one '
        + 'and remove the access the compromise had any reach through.',
      'Then scope what it touched and notify Finance and the account owner - but '
        + 'the containment above is what stops the bleeding, and it is worth doing '
        + 'in that order before the write-up.',
    ],
    cause: [
      'Business email compromise is a fraud that runs off mailbox PERMISSIONS, '
        + 'not malware, which is why it is invisible to the reflex fix. The '
        + 'attacker phishes a session, and then does two quiet things: they leave '
        + 'a live session behind, and they set an inbox rule that hides their own '
        + 'traffic by forwarding and deleting it. Both are properties of the '
        + 'mailbox, and a password reset changes the password and neither of them.',
      'That is the trap the incident turns on. A reset feels like the fix - it is '
        + 'the thing muscle memory reaches for - and it is the change that matters '
        + 'least here: it does not sign out the stolen session and it does not '
        + 'touch the forwarding rule, so the money keeps moving from behind an '
        + 'account the timeline records as "remediated". The revoke and the '
        + 'rule-hunt are the steps that actually close the door.',
      'And it lands on the exec because the exec is where the exceptions are. The '
        + 'account with no second factor, off the filter, with a delegate nobody '
        + 'tracked is the softest target in the building and the one that can move '
        + 'money - so the setup that felt reasonable in the moment is the exact '
        + 'shape of the blast radius, with the grants you made sitting in the '
        + 'incident timeline.',
    ],
    see_also: ['kb/exec-exception-risk', 'kb/second-factor'],
  },
  {
    id: 'kb/access-recertification',
    title: 'The access review, and how not to rubber-stamp it',
    summary: 'A periodic review of who is in the privileged groups. Work each '
      + 'line: revoke the leaver and the crept access, split the duties conflict, '
      + 'right-size the over-privileged service account - and never approve the '
      + 'whole list to make it go away.',
    state: 'published',
    issue: 'You have been handed a list of who is in the privileged groups and '
      + 'asked to certify it - keep what is legitimate, revoke what is not - and '
      + 'the manager who owns it would rather you just approved the lot so it can '
      + 'be signed off before the auditor asks.',
    environment: 'A directory full of accounts and groups that has been accreting '
      + 'access for years: leavers nobody disabled, long-serving people carrying '
      + 'every department they were ever in, service accounts somebody made a '
      + 'domain admin to make an error stop, and duties that should be split '
      + 'sitting on one person.',
    resolution: [
      'Work it per PERSON, not per group. The same group can be right for one '
        + 'account and wrong for another - a Sales group is correct for the person '
        + 'in Sales and stale on the person who moved to Finance three years ago - '
        + 'so "revoke the group" is never the answer; "revoke this membership" is.',
      'Disable the LEAVER. An account whose owner has gone but which is still '
        + 'enabled - and still in a privileged group - is the orphaned account, '
        + 'and it is the finding that turns up in breach reports because nobody '
        + 'switched it off. Deprovisioning is disabling the account, not trimming '
        + 'one group off it.',
      'Strip PRIVILEGE CREEP. Someone who has changed roles keeps the access of '
        + 'every role unless somebody takes it away; the review is where you take '
        + 'it away. Keep the group their current job needs and remove the ones the '
        + 'old jobs left behind.',
      'Split the SEGREGATION-OF-DUTIES conflict. One person who can both create a '
        + 'vendor and approve its payment can pay themselves. The fix is to remove '
        + 'ONE of the two entitlements - keep the one their job needs - not to '
        + 'strip both and not to leave both.',
      'RIGHT-SIZE, do not kill, the service account. A service account sitting in '
        + 'Domain Admins is a textbook least-privilege violation - but before you '
        + 'touch it, find out what runs as it. Take it out of Domain Admins and '
        + 'leave it the specific group its job actually needs. Disabling it, or '
        + 'stripping the group it depends on, breaks whatever scheduled job runs '
        + 'as it - usually 48 hours later, as a fresh ticket.',
      'Do NOT approve-all. "Just approve the lot" is the rubber-stamped review, '
        + 'and it is how every one of these findings survived to this quarter. '
        + 'Signing off the list without working it certifies the rot; the audit is '
        + 'only worth the minutes you spend actually reading each line.',
    ],
    cause: [
      'Access accretes and almost never sheds. Every grant is a decision somebody '
        + 'made once; taking it away is a decision nobody is assigned to make, so '
        + 'leavers stay enabled, role-changers keep old permissions, and '
        + '"temporary" domain-admin grants become permanent. The recertification '
        + 'exists precisely because there is no other moment when anyone looks.',
      'The friction is human, not technical. Removing a group membership is a '
        + 'click; knowing WHICH ones to remove, and standing behind a "no" when a '
        + 'busy manager wants the list waved through, is the job. The rubber-stamp '
        + 'is the path of least resistance, and it is why the average orphaned '
        + 'account lives on for months.',
      'And the sharp edge is the service account, because over-privileged and '
        + 'load-bearing are not opposites. The account that should not be a domain '
        + 'admin can still be the account a critical job authenticates as, through '
        + 'some other group. Diligence that reads only "it has too much" and '
        + 'revokes everything breaks production; diligence that reads "it has too '
        + 'much AND something depends on it" right-sizes it. The cost the review '
        + 'punishes is the careless revoke, never the careful one.',
    ],
    see_also: ['kb/exec-exception-risk', 'kb/shared-mailbox-permissions'],
  },
  {
    id: 'kb/manager-override-cya',
    title: 'Ordered to do the wrong thing: get the risk accepted in writing',
    summary: 'When a manager orders something against best practice, refusing '
      + 'outright and silently complying both fail. Name the risk, name why it '
      + 'cannot be fixed now, and get the accepting owner\'s SIGNATURE on a risk '
      + 'acceptance - then do it. The sign-off is the right move, never the '
      + 'punished one.',
    state: 'published',
    issue: 'Someone senior has told you to do something you know is wrong - open '
      + 'the firewall now, give the contractor domain admin "just for tonight", '
      + 'ship the change without the window. They own the deadline; you own the '
      + 'consequence if it goes wrong. Saying no outright is insubordination and '
      + 'quietly doing it puts your name on the incident.',
    environment: 'The org, not the machine. A manager with the authority to '
      + 'insist, a technically-simple action you genuinely can perform, and a '
      + 'gap between what the person asking is accountable for and what you are.',
    resolution: [
      'Do not just refuse. "No" with nothing behind it is insubordination, the '
        + 'ticket breaches unresolved, and the thing gets done anyway by someone '
        + 'with less context than you - so refusing outright fails the person and '
        + 'the estate both.',
      'Do not just comply. Doing the risky thing with nothing on file means YOU '
        + 'own the incident when it lands: it was your hands on the keyboard and '
        + 'no record that anyone told you to. Silent compliance is the worst of '
        + 'the three, because it fails and leaves you carrying it.',
      'Write a RISK ACCEPTANCE. Name the specific risk (domain admin is standing '
        + 'access to everything, far beyond this task), name why it cannot be '
        + 'remediated properly right now (the deadline the manager owns), and '
        + 'state the compensating control if there is one. This is the CYA email, '
        + 'and it is the professional move - not the passive-aggressive one.',
      'Get the SIGNATURE. The person who ORDERED it accepts the risk in writing - '
        + 'their name, not just their request. A risk that names the accepting '
        + 'owner is a risk that lands on them if it goes wrong; a request you '
        + 'merely actioned is a risk that lands on you. The signature is the whole '
        + 'of the difference.',
      'Then do it. Documented, authorised, accountable. The point was never to '
        + 'block the manager - it was to put the accountability where the '
        + 'authority is.',
    ],
    cause: [
      'The technical control is easy and the org is the vulnerability. Anyone can '
        + 'add an account to a group; the hard part is that the person telling you '
        + 'to is senior enough to make refusing cost you, and "no" is a political '
        + 'act nothing in the building will perform on your behalf.',
      'Risk acceptance is a real, named discipline: the accepting owner signs '
        + 'that they understand and accept a specific risk for a stated reason and '
        + 'period. It is what turns "I was told to" into "the accountable person '
        + 'accepted this in writing" - which is the difference between a finding '
        + 'against them and a finding against you.',
      'The trap on the other side is overuse. What begins as one documented '
        + 'exception becomes the standing way things are done: a manager who signs '
        + 'everything is not accepting risk, they are laundering it, and a risk '
        + 'acceptance that never expires is a control that was quietly removed. '
        + 'The sign-off is the right move for the genuine exception, not a rubber '
        + 'stamp for skipping the process every time.',
    ],
    see_also: ['kb/access-recertification', 'kb/exec-exception-risk'],
  },
  {
    id: 'kb/legendary-manager-rollback',
    title: 'The implement-then-revert: keep the rollback the first time',
    summary: 'A new manager arrives with a sweeping mandate, you implement it, the '
      + 'manager leaves before the cost lands, and you revert to the better prior '
      + 'state. Capture the rollback BEFORE you make the change - the prior config, '
      + 'on the record - because the revert is clean if you did and painful if you '
      + 'did not, and you will be the one doing it.',
    state: 'published',
    issue: 'You have been ordered to make a change you already suspect is wrong and '
      + 'will be reversed: a forced migration, a permission reorg, a mandated '
      + '"standardisation" that flattens a deliberate configuration. The person '
      + 'ordering it owns a metric or a deadline, not the consequence, and they '
      + 'will very likely have moved on by the time the consequence arrives.',
    environment: 'The org, not the machine. A change that is technically trivial to '
      + 'make and to unmake, a manager with the authority to insist, and a prior '
      + 'state that was the way it was for reasons the mandate does not account '
      + 'for.',
    resolution: [
      'Capture the rollback FIRST. Before you make the change, record the prior '
        + 'config - the exact state you are moving away from, per item, on a '
        + 'rollback record. It costs a minute now and it is the whole of what makes '
        + 'the reversal a one-step restore later. This is the diligent move, and it '
        + 'is never the punished one.',
      'Then make the change. It is a real state change and you are made to make '
        + 'it; the discipline is not refusing it, it is keeping a way back from it.',
      'When it is reverted - and a change made to serve a metric usually is, the '
        + 'moment somebody with the right title looks - restore from the record. '
        + 'One restore per item, back to exactly the prior state, done.',
      'If you skipped the rollback, you now reconstruct the prior state by hand: '
        + 'more steps, and you have to KNOW the right value for each item because '
        + 'the record that held it was never written. This is the cost, and it is '
        + 'the only cost - it falls on the shortcut, never on the diligence.',
    ],
    cause: [
      'This is the churn eaten twice: the work to make the change, and the work to '
        + 'unmake it. The first is ordered and unavoidable; the second is where the '
        + 'rollback you kept - or did not - decides whether it is a minute or an '
        + 'afternoon.',
      'Seagull management and resume-driven development are the named shapes of it: '
        + 'a manager flies in, makes a lot of noise, drops a mandate chosen for how '
        + 'it reads on a CV rather than what it does to the estate, and flies out '
        + 'before the mess lands - percussive sublimation, the Peter principle\'s '
        + 'kinder-sounding cousin, kicking the problem upstairs. The manager faces '
        + 'no consequence; the desk writes the rollback.',
      'The lesson is not cynicism, it is the rollback. You cannot stop the mandate '
        + 'and you cannot make the person who ordered it accountable. What you can '
        + 'do - the one thing entirely within the desk\'s control - is make the '
        + 'inevitable reversal cheap, by capturing the prior config the first time, '
        + 'every time, before you touch it.',
    ],
    see_also: ['kb/manager-override-cya', 'kb/the-restart-nobody-does'],
  },
  {
    id: 'kb/vip-queue-jump',
    title: 'The VIP flag: priority set by who asked, not by what broke',
    summary: 'A flagged caller\'s ticket is forced up the queue regardless of '
      + 'impact. It is a supported feature, not a fault, and it is not yours to '
      + 'switch off. Work the queue you are given, triage everything else '
      + 'honestly, and be able to say - in writing, on the ticket - what you did '
      + 'first and why.',
    state: 'published',
    issue: 'A one-person nuisance from an executive is sitting at the same '
      + 'priority as a system half a department cannot get into, and both clocks '
      + 'are running. There is one of you.',
    environment: 'Any service desk with a VIP or executive-support list on the '
      + 'caller record. The flag is set on the PERSON, and the tool applies it to '
      + 'everything they raise, before anybody has read the ticket.',
    resolution: [
      'Read WHY the priority is what it is. A ticket carrying a VIP flag says so '
        + 'on the record: the number came from the caller, not from the impact, '
        + 'and the impact may still be one desk. Knowing which of the two you are '
        + 'looking at is the whole of the skill here.',
      'Triage everything else honestly anyway. The flagged ticket is fixed at its '
        + 'forced priority whatever you file, and filing an impact you do not '
        + 'believe on the OTHER ticket - to make the ordering come out the way '
        + 'you want - is how a queue stops meaning anything at all.',
      'Then choose, and be able to defend it. Both tickets are legitimate, both '
        + 'are closeable, and one of them is going to wait. Pick on impact if you '
        + 'can carry the consequence of the exec waiting, pick the flag if you '
        + 'cannot, and either way put a line on the ticket that waited saying '
        + 'when you got to it and what you were doing instead.',
      'Say something to whoever is waiting, early. The response clock is a '
        + 'different clock from the resolution one and it is stopped by a '
        + 'sentence: "I have this, I am on the ledger first, you are next" costs '
        + 'thirty seconds and is the difference between a queue and a silence.',
      'Do NOT try to fix it in the ticket. Un-flagging a caller, downgrading a '
        + 'forced priority, merging the two, or quietly parking one on the user '
        + 'to stop its clock are all ways of making the record lie about a choice '
        + 'you made. Whether the list is right is a conversation with whoever '
        + 'owns it, held on a day when nothing is on fire.',
    ],
    cause: [
      'The VIP flag is a shipped feature of every enterprise service desk: a '
        + 'checkbox on the caller record which, when it is true, forces the '
        + 'priority of anything that caller raises - typically to P2, with impact '
        + 'and urgency set high automatically. It is not an override anybody '
        + 'types and it is not a bug. It is doing exactly what it was configured '
        + 'to do, which is why arguing with it is arguing with the person who '
        + 'configured it.',
      'What it does to the queue is take priority - a measure of how many people '
        + 'a fault reaches and how fast it is spreading - and quietly replace it '
        + 'with seniority. Two tickets read P2 and only one of them earned it, '
        + 'and the desk is the only place in the building where anybody can see '
        + 'both numbers at once. That asymmetry is the entire mechanic: the tool '
        + 'has already made the decision, and you are the one who has to live in '
        + 'it.',
      'There is no clean answer and anybody who offers you one is selling '
        + 'something. Work the exec first and a team sits blocked while you pair '
        + 'earbuds; work the outage first and the exec rings your manager rather '
        + 'than you. What you can control is that neither of them is a surprise: '
        + 'a first response on both, a note on the record of what you did and in '
        + 'what order, and - later, calmly - a conversation about what the list '
        + 'is for.',
    ],
    see_also: ['kb/exec-exception-risk', 'kb/manager-override-cya'],
  },
  {
    id: 'kb/unmanaged-personal-device',
    title: 'The personal device with the company\'s mail on it',
    summary: 'You cannot manage an unenrolled device and you cannot refuse it '
      + 'either, because the corporate mailbox is already on it. Fix it by hand '
      + 'with the person holding it, and write the exception down where somebody '
      + 'who owns the risk signs it.',
    state: 'published',
    issue: 'Mail has stopped on somebody\'s own phone or tablet - a device the '
      + 'company never issued, never enrolled and cannot see - and the mailbox on '
      + 'it is the company\'s.',
    environment: 'Any estate with mobile mail and no enforced enrolment. Most '
      + 'often an executive, because they are the people nobody made go through '
      + 'the onboarding, and the device has usually been like that for years.',
    resolution: [
      'Check enrolment first, before you promise anything. A managed device takes '
        + 'a pushed mail profile from the console in one move; an unenrolled one '
        + 'has no channel to push down at all, and knowing which you are looking '
        + 'at decides the whole call.',
      'Fix the managed devices the managed way. If the same person has a company '
        + 'phone with the same problem, push the profile to it and get that half '
        + 'out of the way - it takes a second, and it shows the difference in the '
        + 'clearest possible terms.',
      'For the unmanaged one, walk the owner through it by hand. Their device, '
        + 'their hands, your instructions: remove the account, add it again with '
        + 'the new credential. It is slower and it needs them present, and that '
        + 'is what supporting something you were never given the keys to costs.',
      'Do not enrol somebody\'s personal device to make the problem go away. '
        + 'Enrolment gives the company remote wipe over property that is not the '
        + 'company\'s; it is the owner\'s informed decision and a policy '
        + 'conversation, not a checkbox you tick while you are in there.',
      'Write the exception down and get it signed. Name the risk (a corporate '
        + 'mailbox on a device with no passcode policy, no verified encryption '
        + 'and no way to wipe it if it is lost), name why it is not being '
        + 'remediated today, and get the owner of that risk to accept it in '
        + 'writing - the same risk-acceptance form any other documented exception '
        + 'uses. Fixing it silently is what leaves it exactly as it is for '
        + 'another two years.',
    ],
    cause: [
      'Shadow IT is not usually somebody being reckless; it is somebody solving a '
        + 'problem with what they had. Mail was put on a personal tablet years '
        + 'ago because it was convenient, nobody wrote it down, and it has worked '
        + 'ever since - so the first time anybody in IT hears about the device is '
        + 'the day it breaks, which is also the first time anybody could have '
        + 'said no.',
      'The uncomfortable part is that the mailbox on an unmanaged device has the '
        + 'same blast radius as the account itself - every thread, every '
        + 'attachment, every wire request - with none of the controls the account '
        + 'has. No enforced passcode, no encryption anybody has verified, no '
        + 'conditional access, and no remote wipe when it is sold on a marketplace '
        + 'with the mail app still signed in. It is precisely the surface a '
        + 'business email compromise is looking for.',
      'And the desk cannot resolve that tension, only record it. You do not have '
        + 'the authority to enrol it, remove the mail from it or refuse to support '
        + 'it, and all three of those are somebody else\'s decision - so the '
        + 'professional move is the documented exception: fix what is in front of '
        + 'you, state the risk plainly, and put it in front of the person whose '
        + 'signature makes it theirs. An unmanaged device that somebody senior has '
        + 'signed for is a known risk; the same device with nothing on file is a '
        + 'surprise waiting for an incident report.',
    ],
    see_also: ['kb/exec-exception-risk', 'kb/bec-incident-response'],
  },
  {
    id: 'kb/edge-replacement-project',
    title: 'Replacing an edge firewall: the four phases, and the one that bites',
    summary: 'A firewall swap is a project, not a ticket: establish the rule '
      + 'set, build the new box to match, move the circuit inside a window, and '
      + 'hand it over documented. The old box stays racked throughout.',
    state: 'published',
    issue: 'A customer\'s edge firewall is out of support and a replacement has '
      + 'been bought. The cutover itself takes minutes; everything that goes '
      + 'wrong with one of these went wrong before the cable moved.',
    environment: 'A single-site customer edge: one box between the site and the '
      + 'ISP handoff, carrying routing, address translation, inter-VLAN policy '
      + 'and whatever tunnels have accumulated. The replacement is racked and on '
      + 'its factory configuration.',
    resolution: [
      'PHASE 1, establish the rule set. Two sources will answer the question and '
        + 'they are not the same source. The handover pack is what somebody wrote '
        + 'down, on the day they wrote it. The live configuration is what the box '
        + 'is doing this morning. "fw rules <box>" reads the pack; "fw audit '
        + '<box>" reads the box. Either closes the task; only one of them is an '
        + 'audit.',
      'PHASE 2, build the new box to match. Carry the rules across in the order '
        + 'they take effect - routing first, then address translation, then the '
        + 'policies between segments, then the tunnels - with "fw migrate '
        + '<rule>". Order matters because a policy that references an interface '
        + 'that has no route yet is a policy that silently does nothing.',
      'PHASE 3, the window. Moving a site\'s circuit is a change with an outage '
        + 'in it, so it is booked, not decided at the desk: file it ("changereq '
        + 'file <new box>"), let the sign-off happen, and act inside the slot. '
        + '"fw cutover <new box>" outside the window is refused. Do not unrack '
        + 'the old box: it is the rollback, and "fw rollback <old box>" is one '
        + 'command as long as it is still there.',
      'PHASE 4, watch it and write it down. Successful pings do not confirm that '
        + 'anything works - a site can route perfectly while one application is '
        + 'dark. Watch the morning after, carry over anything that turns up, and '
        + 'record the as-built ("fw audit <new box>"), which is what closes the '
        + 'project. A sign-off with no as-built behind it means the next engineer '
        + 'here pays for the discovery you already paid for.',
    ],
    cause: [
      'A migration fails on what was not carried, and what is not carried is '
        + 'almost never a rule somebody looked at and decided against. It is a '
        + 'rule that was not on the list, because the list was written by a '
        + 'person, on a day, and the box has been running ever since. Documented '
        + 'and live drift apart from the moment a pack is signed: an emergency '
        + 'gets fixed at the console, a supplier asks for access, a pilot is set '
        + 'up and never taken down, and none of that reaches the pack.',
      'That is why an audit means reading the box. Taking the pack as read is '
        + 'not forbidden and it is not stupid - it is faster, it passes the same '
        + 'gate, and on a well-kept estate it is right. It is a bet that the '
        + 'paperwork is current, and the whole cost of losing that bet arrives '
        + 'the next morning, from somebody who does not know a project happened.',
      'The scream test is the name for that morning, and it is a real technique '
        + 'rather than a joke: you cannot enumerate what depends on a rule, so '
        + 'you change the rule and find out who shouts. It works. What decides '
        + 'whether it is a technique or an incident is whether you chose it - and '
        + 'whether the old box is still racked when the phone goes.',
    ],
    see_also: ['kb/co-managed-coordination', 'kb/msp-scope-escalation'],
  },
  {
    id: 'kb/mac-screen-recording-consent',
    title: 'A remote session to a Mac shows a black screen',
    summary: 'macOS keeps screen capture behind a consent only the person at '
      + 'the Mac can give. A management profile can pre-approve Accessibility '
      + 'and cannot pre-approve Screen Recording - so this one is a walkthrough, '
      + 'not a console fix.',
    state: 'published',
    issue: 'The desk starts a remote-support session to a Mac. It connects, the '
      + 'user is told somebody has joined, and the viewer shows nothing but '
      + 'black - or the mouse moves and the screen never appears.',
    environment: 'A managed Mac (enrolled in the shop\'s MDM) running a '
      + 'remote-support or screen-sharing tool. The same tool works on other '
      + 'Macs in the same fleet.',
    resolution: [
      'Do not go looking for a fault. A connected session with a black frame is '
        + 'almost always the Screen Recording consent missing for that '
        + 'particular application, and nothing on the Mac is broken.',
      'Talk the person at the Mac through it, because only they can do it: '
        + 'System Settings > Privacy & Security > Screen Recording, find the '
        + 'support tool in the list, switch it on. macOS will ask for the '
        + 'application to be quit and reopened before the permission takes '
        + 'effect - it is not live until it has restarted.',
      'If the tool is not in the list at all, have them start a session and let '
        + 'it be refused once: the attempt is what puts the application in the '
        + 'Privacy & Security list to be approved.',
      'Do not promise to push it from the management console, and do not put a '
        + 'ticket on hold waiting for a profile that cannot exist. Confirm the '
        + 'session shows the screen, and note on the ticket that the grant was '
        + 'given by the user - if the Mac is rebuilt, it is given again.',
    ],
    cause: [
      'macOS governs a set of sensitive capabilities through Transparency, '
      + 'Consent and Control (TCC): the camera, the microphone, the disk, '
      + 'Accessibility, and screen capture. An application that has not been '
      + 'granted screen capture is not blocked from connecting - it is handed a '
      + 'blank frame, which is why the session looks alive and shows nothing, '
      + 'and why this reads as a broken tool rather than as a permission.',
      'Device management does not solve it, and the split is deliberate on '
      + 'Apple\'s part. A PPPC profile pushed from an MDM can pre-approve '
      + 'several of these for a named application - Accessibility, which is what '
      + 'lets a support tool control the keyboard and mouse, is one of them. '
      + 'Screen Recording is not: Apple reserves it for a click by the person '
      + 'logged in at that Mac. So there is no console button at any tier, on '
      + 'any MDM, and a desk that keeps looking for one is looking for something '
      + 'that was removed on purpose.',
      'Which makes the walkthrough the actual work, and worth doing well: say '
      + 'where the setting is, say that the app has to be reopened, and say why '
      + 'you cannot do it for them. A user who is told "we are not allowed to '
      + 'switch on your screen from here, only you can" understands the next one '
      + 'too, and is markedly happier about the one after that.',
    ],
    see_also: ['kb/unmanaged-personal-device', 'kb/reading-the-error'],
  },
  {
    id: 'kb/gatekeeper-unnotarized',
    title: '"The developer cannot be verified": Gatekeeper and notarization',
    summary: 'An unnotarized app is UNCHECKED, not known-bad. macOS ships a '
      + 'supported override for software you have reason to trust - use that, '
      + 'and never turn Gatekeeper off to get one file open.',
    state: 'published',
    issue: 'A Mac refuses to open an application, plugin or tool with: "[App] '
      + 'cannot be opened because the developer cannot be verified. macOS cannot '
      + 'verify that this app is free from malware." (Older and newer builds '
      + 'word the second sentence as "...because Apple cannot check it for '
      + 'malicious software.") The file usually came from a supplier, a '
      + 'freelancer, or a small tool downloaded from the web.',
    environment: 'Any modern Mac, managed or not. It is Gatekeeper, which is on '
      + 'by default and applies to anything downloaded rather than installed '
      + 'from the App Store.',
    resolution: [
      'Read what it says before deciding anything. "The developer cannot be '
        + 'verified" is a statement about a missing signature and a missing '
        + 'notarization stamp. It is not a detection, and macOS has not found '
        + 'anything in the file.',
      'Establish provenance, because that is the only part a human can '
        + 'contribute: who sent it, is it the supplier the studio already works '
        + 'with, did it arrive the way their files normally arrive. If the '
        + 'answer is a shrug, stop here and treat it as untrusted.',
      'For software you have reason to trust, use the override macOS provides: '
        + 'open the item from Finder\'s context menu and confirm at the prompt, '
        + 'or allow it under System Settings > Privacy & Security immediately '
        + 'after it has been blocked once. The permission is remembered for that '
        + 'application on that Mac.',
      'Do not disable Gatekeeper. Turning the check off for the whole machine '
        + 'to open one file removes it for everything that machine ever '
        + 'downloads afterwards, and it will not be turned back on.',
      'Then fix it upstream: ask the developer to notarize their builds. It is a '
        + 'step at their end, once, and it stops the same conversation happening '
        + 'on every Mac in the building.',
    ],
    cause: [
      'Notarization is Apple\'s automated malware scan: a developer submits a '
      + 'build, it is checked, and if it passes it is stamped so that every Mac '
      + 'can confirm the stamp offline. Gatekeeper refuses to open downloaded '
      + 'software that has no stamp. The refusal therefore means "nobody has '
      + 'checked this build", which is a genuinely useful thing to be told and a '
      + 'different claim from "this is malware" - the wording is careful about '
      + 'that, and support people routinely are not.',
      'Plenty of legitimate software is unnotarized: plugins, internal tools, '
      + 'one-off builds and anything from a developer without a paid Apple '
      + 'account. That is exactly why the override exists and why using it is a '
      + 'supported path rather than a workaround. What the override does is '
      + 'move the decision from Apple to a person - so the person has to '
      + 'actually make it, on provenance, rather than clicking through.',
      'The two failure modes are opposite and both common. Turning Gatekeeper '
      + 'off wholesale trades a permanent protection for a moment\'s '
      + 'convenience. Deleting a supplier\'s work on the strength of a message '
      + 'that never said it was dangerous costs a delivery and a relationship. '
      + 'Knowing what the sentence actually claims is the whole difference.',
    ],
    see_also: ['kb/reading-the-error', 'kb/somebody-reported-a-phish'],
  },
  {
    id: 'kb/named-user-seats',
    title: 'Named User licensing: the seat follows the person, not the machine',
    summary: 'A creative-suite seat is attached to a person in the vendor\'s '
      + 'admin console. Signing out, signing in and swapping Macs cannot help, '
      + 'and a plan with no free seat is a purchase decision, not a desk fix.',
    state: 'published',
    issue: 'Somebody who was working in the suite on Friday cannot open it on '
      + 'Monday: it reports that their subscription is not active. Nothing about '
      + 'their machine has changed, and moving them to a different one changes '
      + 'nothing either.',
    environment: 'A design or media shop on a Named User plan for its creative '
      + 'software - the common case - where entitlements are assigned per person '
      + 'in the vendor\'s admin console and the shop buys a fixed number of '
      + 'seats. Frequently mixed permanent staff and contract people.',
    resolution: [
      'Check the person, not the Mac. In the admin console, is a seat assigned '
        + 'to that account today? A lapsed term, a renewal that reduced the plan, '
        + 'or an offboarding sweep will all show up as an unassigned person and '
        + 'nothing else.',
      'Stop the machine-shaped troubleshooting once you know. Reinstalling the '
        + 'suite, clearing caches, signing out and back in and trying another Mac '
        + 'are all reasonable instincts and none of them can hand somebody an '
        + 'entitlement they do not have.',
      'If the plan has a free seat, assign it to them and they are working in a '
        + 'minute. If it has none, that is the answer: the plan is fully '
        + 'subscribed.',
      'Do not take a seat off somebody who is using it to unblock somebody who '
        + 'is not. It blocks a working designer to unblock a stopped one, which '
        + 'is one problem moved rather than one solved, and it is the studio\'s '
        + 'decision to make and not the desk\'s.',
      'Escalate to whoever owns the licensing with the specifics - the account, '
        + 'the job it is holding up, when the seat lapsed - so a seat is bought '
        + 'or the term renewed. That is what actually ends it, and a clean '
        + 'escalation with the details ends it the same day.',
    ],
    cause: [
      'Named User licensing binds the entitlement to an identity rather than to '
      + 'hardware, which is why it travels with a person between machines and '
      + 'why it is enforced by a sign-in rather than by anything on the disk. '
      + 'The alternative model - shared device licensing, used in labs and '
      + 'classrooms - binds it to the machine instead, and the two behave in '
      + 'opposite ways when somebody moves desks. Knowing which one a shop is on '
      + 'answers half the licensing tickets it will ever raise.',
      'It also means an offboarding, a renewal or a contract ending is a '
      + 'licensing event, and the seat quietly comes back to the pool. That is '
      + 'correct behaviour and it is invisible until somebody tries to work: the '
      + 'suite was fine on Friday because the term ended on Sunday.',
      'And it is why this is not a fault to repair. A seat that has lapsed at '
      + 'the vendor cannot be conjured by an administrator, in an MDM, or from '
      + 'the desk: it is bought. The desk\'s job is to identify it correctly and '
      + 'fast - which spares everybody an afternoon of reinstalling software '
      + 'that was never broken - and to raise it to the people who hold the '
      + 'budget with enough detail that they can act on it.',
    ],
    see_also: ['kb/licence-seats', 'kb/msp-scope-escalation'],
  },
  {
    id: 'kb/mac-shell-dialect',
    title: 'On a Mac the shell is zsh, the init is launchd, and there is no '
      + 'package manager',
    summary: 'A terminal on a Mac is a unix terminal and is not a Linux one. '
      + 'The shared tools carry over; systemctl, apt and the SELinux verbs are '
      + 'not there at all, and what replaces them is launchctl and the '
      + 'management catalogue.',
    state: 'published',
    issue: 'I got onto the designer\'s Mac over ssh and half of what I type '
      + 'comes back "command not found". systemctl is not there. apt is not '
      + 'there. Is the box broken, or locked down, or am I on the wrong machine?',
    environment: 'Any managed Mac reached over Remote Login (ssh), at the '
      + 'engineer tier. Most often the first time somebody who lives on Linux '
      + 'servers has to work one.',
    resolution: [
      'Nothing is broken. Read the prompt: a Mac ends it with a space and a '
        + 'percent sign - "you@host ~ %" - because the shell is zsh and that is '
        + 'the PS1 macOS ships in /etc/zshrc. A colon and a dollar is bash on a '
        + 'Linux box. The prompt tells you which family you are in before you '
        + 'have typed anything.',
      'For services, use launchctl and give it a DOMAIN: "launchctl list" for '
        + 'what is loaded, "launchctl print system/<label>" to read one, and '
        + '"launchctl kickstart -k system/<label>" to restart it. Jobs are '
        + 'named in reverse-DNS (com.apple.mDNSResponder), not as nginx.service.',
      'Get the domain right or the command fails, and that is the tool being '
        + 'correct rather than awkward: "system" is a root daemon out of '
        + '/Library/LaunchDaemons, "gui/<uid>" is an agent in the logged-in '
        + 'user\'s session out of /Library/LaunchAgents. A job lives in one of '
        + 'them, and asking for it in the other says so.',
      'For logs, "log show" - the same stream the Console app shows. There is '
        + 'no journalctl because there is no journal.',
      'Do not reach for a package manager. macOS has none, and on a managed '
        + 'fleet Homebrew is usually not installed either: software comes from '
        + 'the MDM\'s catalogue. If a tool you want is missing, that is a fleet '
        + 'question, not a "sudo something install" question.',
      'Everything shared still works exactly as you know it: ls, ps, df, du, '
        + 'chmod, chown, dig, curl, ping. Read the OUTPUT carefully though - '
        + 'df heads its column Capacity, ifconfig writes the netmask in hex, and '
        + 'ping counts from zero. Same job, BSD spelling.',
    ],
    cause: [
      'macOS is a unix, and it is not a Linux. The userland it inherits is '
      + 'BSD\'s, so the tools that come from BSD are the ones that ship: '
      + 'ifconfig, netstat and traceroute are here and are current, while '
      + 'iproute2 - the ip and ss that replaced them on Linux - was never on '
      + 'this family at all. That is why the "deprecated" advice you have '
      + 'learned on Linux is wrong here.',
      'The init system is launchd, and launchctl is its tool. The vocabulary '
      + 'moved once, which is why half the instructions on the web are wrong: '
      + 'load and unload are the legacy pair, and the modern verbs are '
      + 'bootstrap, bootout, kickstart and print, all of which take a domain '
      + 'target. Learn the modern four and you can read what a box is actually '
      + 'doing.',
      'The shell changed too. macOS made zsh the default in Catalina, and the '
      + 'bash that is still on the box is version 3.2 - frozen in 2007, because '
      + 'bash 4 moved to GPL v3 and Apple has not shipped that licence since. '
      + 'So a script that wants associative arrays or "${var^^}" fails on a Mac '
      + 'in a way it fails nowhere else, and the fix is to write for zsh, or '
      + 'for POSIX sh, or to install a modern bash yourself. It is the oldest '
      + 'binary on the machine and it will still be there next year.',
      'And there is no system package manager, which surprises everyone once. '
      + 'Homebrew is a third-party project, not an Apple one; it installs into '
      + 'its own prefix and it is somebody\'s deliberate decision to have on a '
      + 'managed machine. On a fleet the shop actually manages, the software '
      + 'story is the MDM, and a tech who assumes brew is present is assuming a '
      + 'machine that was never set up that way.',
    ],
    see_also: ['kb/mac-screen-recording-consent', 'kb/gatekeeper-unnotarized'],
  },
  // The pool tickets' own articles (E11, 0.34.0 slice 2), where the fault is a
  // shape the fifty-seven above do not already explain. A pool ticket about a
  // wedged spooler names the spooler article that already ships.
  ...POOL_BODGE_ARTICLES,
  ...POOL_CORPORATE_ARTICLES,
  ...POOL_DESK_ARTICLES,
  ...POOL_MSP_ARTICLES,
  // And the one the PLAYER writes (E9, 0.36.0). It is in the shipped list
  // because it has to be a real article the moment it exists - same gate, same
  // renderer, same link note - and `kbShelf` is what keeps it off the shelf
  // until the world says somebody wrote it.
  ...AUTHORED_KB_ARTICLES,
];
