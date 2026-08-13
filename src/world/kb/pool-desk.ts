/**
 * Articles the pool tickets name (E11, 0.34.0 slice 2), for the fault shapes
 * the shipped fifty-seven do not already cover. A pool ticket whose fault is
 * one an existing article already explains reuses that article: a second copy
 * of "the print spooler, and why the queue goes first" would be two answers to
 * one question.
 *
 * Four of them, and each one is a shape the shelf genuinely had nothing for.
 * The estate is twenty-odd Windows services per box and the shipped articles
 * explain exactly one of them (the spooler, and only when its queue has jammed),
 * so a stopped service and a disabled one - two different faults with two
 * different fixes, both arriving as "it worked yesterday" - had no page at all.
 * The clock is the third: the one fault on a domain where the machine that is
 * wrong is not the machine anybody is complaining about. And the fourth is the
 * share ACL, which is the print-permissions lesson standing somewhere the print
 * server has never heard of.
 */

import type { KbArticle } from './types';

export const POOL_DESK_ARTICLES: readonly KbArticle[] = [
  {
    id: 'kb/the-service-that-stopped',
    title: 'Automatic and not running is a fault. Manual and not running is not',
    summary: 'Twenty-odd lines, one of them wrong, and the column that says '
      + 'which.',
    state: 'published',
    issue: 'One thing on this machine has stopped working and everything else '
      + 'is fine. I have not changed anything and it worked yesterday.',
    environment: 'Any Windows box on the estate. Every one of them runs the '
      + 'same twenty-odd baseline services, and a handful of them are stopped '
      + 'on purpose.',
    resolution: [
      'List the services on the machine the reporter is actually on - '
        + '"services <host>" - rather than the one they said, and read the '
        + 'STARTUP TYPE column beside the status.',
      'Find the line that is Automatic and not running. That is the fault. A '
        + 'Manual service sitting stopped is a service waiting to be asked for, '
        + 'and there are three of them on every workstation in this building.',
      'Match the service to the symptom before you start anything: the Print '
        + 'Spooler is printing from that desk, Workstation is every mapped '
        + 'drive on it, Computer Browser is what fills Network Neighbourhood, '
        + 'Task Scheduler is everything anybody set to run overnight.',
      'Start it - "restart <host>\\<service>", or the services panel in Remote '
        + 'Assist - and get the reporter to try the thing that failed while you '
        + 'are still on the line.',
      'Then read the event log on that box. A service that stopped once is an '
        + 'incident; a service that has stopped four times is a schedule, and '
        + 'restarting it a fifth time is not support.',
    ],
    cause: [
      'A Windows box runs dozens of services and almost none of them are worth '
      + 'a thought until the day one of them is not there. Each one carries a '
      + 'startup type as well as a status, and the two columns together are the '
      + 'whole of the diagnosis: Automatic means the machine starts it at boot '
      + 'and intends it to be running, Manual means something asks for it when '
      + 'it is needed, and Disabled means nothing may start it at all.',
      'So a stopped service is only a fault when the machine meant to be '
      + 'running it. Three of the baseline services on every workstation in '
      + 'this building are Manual and stopped and have been for years, and '
      + 'three more are Disabled, which is why "there are things stopped in the '
      + 'list" is not a finding - learning to walk past those six is half of '
      + 'reading the list at all.',
      'What stops an Automatic one is nearly always mundane: it crashed and '
      + 'nothing restarted it, or somebody stopped it while chasing something '
      + 'else and never put it back. The user never sees any of that. They see '
      + 'one thing that has quietly stopped working on a machine where '
      + 'everything else is fine, which is exactly the shape of a fault people '
      + 'blame on the network, the server, or themselves.',
    ],
    see_also: ['kb/event-log', 'kb/power-cycle', 'kb/disabled-is-not-stopped'],
  },
  {
    id: 'kb/disabled-is-not-stopped',
    title: 'Disabled is not stopped, and starting it is refused for a reason',
    summary: 'Two columns, two decisions: set the startup type, then start it.',
    state: 'published',
    issue: 'The service is not running, I have tried to start it, and it will '
      + 'not start. Nothing happens and nothing says why.',
    environment: 'Any Windows service on the estate. Three of the baseline '
      + 'services on every box are Disabled, on purpose, by policies nobody '
      + 'can find the paperwork for.',
    resolution: [
      'Read the startup type before you press anything. Disabled and stopped '
        + 'look identical to Manual and stopped in the status column, and they '
        + 'are two different jobs.',
      'Find out WHO disabled it and why, if you can. Three services on every '
        + 'box in this building are Disabled deliberately, and re-enabling one '
        + 'of those is undoing somebody\'s decision rather than fixing a fault.',
      'Set the startup type back to what the box is meant to run it as - '
        + 'Automatic for most, Automatic (Delayed Start) for the update '
        + 'service, Manual for the ones that are asked for.',
      'THEN start it. Setting the startup type does not start anything: it '
        + 'tells the machine what to do at the next boot, and the service is '
        + 'still sitting there stopped until somebody starts it.',
      'Write both halves on the ticket. "Set to Automatic and started" is the '
        + 'record; "started it" is a note that will confuse the next person '
        + 'when the same box comes back after a reboot.',
    ],
    cause: [
      'Disabled is not a status, it is an instruction. The status column says '
      + 'what the service is doing now; the startup type says what the machine '
      + 'is permitted to do about it, and Disabled means nothing may start it - '
      + 'not a restart, not a reboot, not the application that depends on it '
      + 'asking politely at half past nine.',
      'That is why a start control against a disabled service does nothing '
      + 'useful and why this workstation refuses it outright rather than '
      + 'pretending: a button that appeared to work and changed nothing would '
      + 'send somebody back to the reporter with a fix that was never applied.',
      'The fix is therefore two decisions rather than one, and they are two '
      + 'because they answer two questions. What should this box run at boot, '
      + 'and is it running now. Do the first and go home and the machine comes '
      + 'back correct tomorrow with the fault still on the screen today; do the '
      + 'second only and the fault comes back at the next reboot with nobody '
      + 'left who remembers why.',
    ],
    see_also: ['kb/the-service-that-stopped', 'kb/three-ways-an-account-says-no'],
  },
  {
    id: 'kb/the-clock-is-the-fault',
    title: 'A domain has one clock, and one machine has stopped agreeing',
    summary: 'Logons and portals refusing a box whose time has drifted.',
    state: 'published',
    issue: 'It keeps signing me out, it says my session has expired, and one '
      + 'system insists I filled in a form at a time I was not here.',
    environment: 'Any domain member on this estate. The domain controller is '
      + 'the clock everything else is meant to be following.',
    resolution: [
      'Compare the time on the machine with the time on DC-01 before you '
        + 'believe any part of the reporter\'s description. Minutes matter '
        + 'here; a machine three minutes out has no symptoms and a machine ten '
        + 'minutes out cannot log on.',
      'Check the Time Service on the box - it is Automatic on every machine '
        + 'here - and start it if it has stopped. That is what has let the '
        + 'clock drift; the drift itself is the hardware doing what cheap '
        + 'hardware does when nobody is correcting it.',
      'Get the reporter to sign out and back in once the service is running, '
        + 'because the credential they are holding was issued against the '
        + 'wrong time and will keep being refused until it is reissued.',
      'Say plainly on the ticket which machine was wrong. Every symptom of '
        + 'this points at the server, and the server was right the whole time.',
    ],
    cause: [
      'Domain logons are timestamped, and the directory refuses anything '
      + 'timestamped too far from its own clock - about five minutes, which is '
      + 'deliberately tight, because the whole reason a logon carries a time is '
      + 'to stop somebody replaying yesterday\'s. So a machine whose clock has '
      + 'drifted past that window stops being able to prove who it is talking '
      + 'for, and everything that depends on the directory starts saying no.',
      'The Time Service is what keeps that from happening: it asks the domain '
      + 'controller what time it is and nudges the machine back into line, '
      + 'quietly, for ever. A workstation with that service stopped is left '
      + 'with the battery-backed clock on the board, and those drift - minutes '
      + 'a week on a box this old, faster in a warm room.',
      'What makes it hard to see is that nothing says "the time is wrong". '
      + 'The messages are all about credentials, sessions and permissions, and '
      + 'they all point at the server, because from the machine\'s point of '
      + 'view the server is the thing that has started refusing it. The one '
      + 'machine in the conversation that is telling the truth is the one '
      + 'everybody is blaming.',
    ],
    see_also: ['kb/the-service-that-stopped', 'kb/reading-the-error'],
  },
  {
    id: 'kb/the-share-nobody-granted',
    title: 'A drive that has never worked, for exactly one person',
    summary: 'A share is an ACL. Never having had it looks just like losing it.',
    state: 'published',
    issue: 'Everybody keeps telling me to put it on the common drive and the '
      + 'common drive will not let me in. It says access is denied.',
    environment: 'Any share on this estate. The common drive and the Sales '
      + 'mailbox both carry their own list of who may open them.',
    resolution: [
      'Ask who else cannot reach it. One person is an access list; the whole '
        + 'floor is the server, and the two have nothing in common but the '
        + 'sentence the reporter uses.',
      'Read the share\'s own access list rather than the group memberships. A '
        + 'share is granted per account here, so somebody can be in every group '
        + 'in the directory and still not be on it.',
      'Find out whether they have EVER had it. "It has stopped working" and '
        + '"I have never been able to" are the same sentence from a user and '
        + 'two different jobs for you.',
      'Grant the access, and put on the ticket that it was never there. A '
        + 'ticket that reads "restored access" invites the next person to go '
        + 'looking for what removed it.',
    ],
    cause: [
      'A share is not a folder somebody can see; it is a list of accounts that '
      + 'may open it, checked by the machine holding it every single time. '
      + 'Nothing about being in the building, being on the domain or being in '
      + 'the right groups puts anybody on that list - somebody has to have '
      + 'added them, once, deliberately, and if nobody ever did then the '
      + 'refusal is the server working exactly as intended.',
      'That is why these sit unreported for years. Everybody assumes access to '
      + 'the drive everybody uses, so the person who has not got it works round '
      + 'it - mail, a memory stick, asking somebody else to save it for them - '
      + 'and only raises it the week the workaround stops being possible. The '
      + 'ticket then arrives as a fault, with a date on it that is nothing to '
      + 'do with anything.',
      'The trap is the word "again". A user says the drive has stopped working '
      + 'because that is how a person describes something they cannot do today, '
      + 'and a tech who takes it literally spends the morning looking for what '
      + 'changed. Ask when it last worked. If the answer is a shrug, nothing '
      + 'has broken and the job is one grant.',
    ],
    see_also: ['kb/print-permissions', 'kb/shared-mailbox-permissions'],
  },
];
