/**
 * The changelog, as an operating-system update, because that is what this
 * product is pretending to be.
 *
 * Every release of Workgrumble arrives in-fiction: DeskPro WorkGroup installs
 * an update overnight and the player reads about it in the morning, in the
 * voice of a knowledge-base article written by somebody who has been told not
 * to say "we forgot". The joke only works if the notes are TRUE - a fake
 * changelog is a comedy bit, a real one written in that voice is the product
 * telling you what changed while staying in character - so every line below
 * describes something that is actually in the build.
 *
 * The list is data, newest first, and it is also the version gate: the build
 * takes its number from `package.json`, and `releases.test.ts` fails if the
 * newest entry here disagrees with it. A build cannot announce a version whose
 * notes nobody wrote.
 */

import { BUILD_VERSION } from '../shared/build';

export interface ReleaseNote {
  /** `major.minor.patch`, matching the tag the build was cut at. */
  readonly version: string;
  /** ISO date the update went out. */
  readonly date: string;
  /** The one-line summary at the top of the window. */
  readonly summary: string;
  /** The article body: one bullet per change, in the house voice. */
  readonly lines: readonly string[];
}

export const RELEASES: readonly ReleaseNote[] = Object.freeze([
  {
    version: '0.3.5',
    date: '2026-08-02',
    summary: 'This update adds an assistant.',
    lines: Object.freeze([
      'A helpful assistant now lives on your desktop. It is a screen on a '
        + 'plinth with a face, it has opinions about what you are doing, and '
        + 'those opinions are wrong. This is not a limitation of the current '
        + 'version. It is the whole of the feature. The assistant has been '
        + 'carefully checked to make sure it never accidentally tells you how '
        + 'to fix anything, and it passed.',
      'The assistant can be dismissed. It remembers being dismissed. It will '
        + 'come back, and it will mention it. There is no number of times you '
        + 'can close it that it will not come back from, though after a while '
        + 'it stops counting out loud, which everyone agreed was for the best.',
      'The assistant does not speak during a meeting or while the workstation '
        + 'is installing updates. It knows when it is not wanted. It just does '
        + 'not act on that knowledge the rest of the time.',
    ]),
  },
  {
    version: '0.3.4',
    date: '2026-08-02',
    summary: 'This update adds colleagues.',
    lines: Object.freeze([
      'Colleagues may now approach your desk in person. There is no way to '
        + 'decline a person who is already standing at your desk; there is a '
        + 'button for saying "not now", and colleagues are advised that a '
        + 'colleague told "not now" will raise the request themselves, in '
        + 'writing, with a subject line that mentions you.',
      'Work done at your desk as a favour, off the record, is exactly as '
        + 'appreciated as it has always been, and exactly as invisible on '
        + 'Friday as it has always been. The person you helped will remember '
        + 'it warmly. The review will not remember it at all. Both of these '
        + 'are features.',
      'Some colleagues open a chat with "Hi." and then type for several '
        + 'minutes. The typing indicator now shows how long you are expected '
        + 'to wait, which is more than the message will turn out to justify. '
        + 'Replying "what is up?" skips the wait. There is a page on the '
        + 'intranet about this. A colleague will send it to you. It will not '
        + 'help.',
      'Some faults are reported five minutes before the end of the shift. '
        + 'The clock on such a fault runs for five minutes tonight and the '
        + 'rest tomorrow morning, which is the correct arithmetic and '
        + 'nobody\'s favourite fact. The fault was there all afternoon. The '
        + 'report was not. Personnel have declined to comment on the gap.',
    ]),
  },
  {
    version: '0.3.3',
    date: '2026-08-02',
    summary: 'This update adds presence.',
    lines: Object.freeze([
      'You now have a status. It is in the tray, it is one of Available, Do '
        + 'Not Disturb and Away, and it is visible to everybody, which is the '
        + 'part of this feature nobody asked for and everybody uses.',
      'Do Not Disturb holds your calls. It does not hold your meetings, and '
        + 'it does not hold the workstation, because neither of those has '
        + 'ever cared how busy you are. Colleagues whose calls did not ring '
        + 'are listed on the phone, with the time they tried. They know the '
        + 'dot was on. You know they know. This is called working culture.',
      'Please note that time spent on Do Not Disturb while visibly doing '
        + 'things is time your line manager can count. He rounds in neither '
        + 'direction. He has asked us to say that he is not angry, he is '
        + 'just interested in what the status was for.',
      'Setting yourself Away while demonstrably at your desk doing work is '
        + 'supported. The people waiting on that work can see it too. One of '
        + 'them will usually say something. This is not a bug in the status '
        + 'system; it is the status system working as originally intended, '
        + 'by someone who no longer works here.',
      'Available remains free of charge.',
    ]),
  },
  {
    version: '0.3.2',
    date: '2026-08-02',
    summary: 'This update adjusts the passage of time near events.',
    lines: Object.freeze([
      'Colleagues running their day at four times its natural speed have '
        + 'reported that telephone calls were over before they could be '
        + 'regretted, and meetings arrived, occurred and were summarised in '
        + 'the space of a breath. This has been addressed: when something '
        + 'lands on you - a call, a meeting, the workstation, the lead - the '
        + 'day now slows to its natural pace, so that whatever is about to '
        + 'happen to you happens at a speed at which you can be said to have '
        + 'been present for it.',
      'The day does not speed itself back up afterwards. It was slowed '
        + 'because something happened; deciding the rest of it should go '
        + 'faster is, as ever, yours to do and yours to answer for.',
      'The pause button is unaffected. It has always been unaffected. It is '
        + 'the one control in this building that does exactly what it says, '
        + 'and Personnel are monitoring it closely as a result.',
    ]),
  },
  {
    version: '0.3.1',
    date: '2026-08-02',
    summary: 'This update improves the delivery of updates.',
    lines: Object.freeze([
      'Your workstation now receives updates. Updates are important. When '
        + 'updates are ready, your workstation will tell you it is restarting '
        + 'in ten minutes, and those ten minutes are yours: the button '
        + 'postpones it, three times, for less time each time, which IT '
        + 'consider generous and the update considers negotiable. There is no '
        + 'button for not restarting. That option was withdrawn, and the '
        + 'dialog will explain whose fault that is (yours).',
      'While updates are installing, your workstation is not available. Your '
        + 'queue is. Every clock on it continues, which colleagues have '
        + 'described as unfair, and which Personnel have confirmed is '
        + 'accurate.',
      'Your work is restored after the restart. All of it, exactly as it '
        + 'was, every time. The screen will nevertheless say "Restoring your '
        + 'work... (most of it)", because the engineers who wrote that screen '
        + 'had lived a life before they came here, and nobody in this '
        + 'building has ever trusted a progress bar that told the whole '
        + 'truth.',
      'The percentage shown while installing is not connected to anything. '
        + 'The MINUTES are real - the percentage is a performance of them. It '
        + 'will hang at thirty for a while. This was specified.',
      'This update was itself delivered by the mechanism it describes. If '
        + 'you are reading this, the restart went fine, and your work came '
        + 'back. All of it. Whatever the screen said.',
    ]),
  },
  {
    version: '0.3.0',
    date: '2026-08-02',
    summary: 'This update adds interruptions.',
    lines: Object.freeze([
      'The telephone now works. Colleagues can call you while you are working '
        + 'on something else, which Personnel are advised is the normal use of '
        + 'a telephone. A call can be answered, asked to ring back, or '
        + 'declined, where the caller is somebody who can be declined. Asking '
        + 'somebody to ring back works once. The second call does not offer '
        + 'the button, for the reason you would expect.',
      'A call about the fault you are actually working is part of the work, '
        + 'and is treated as such: what is said in it lands on the ticket. A '
        + 'call about anything else costs you the place you were holding in '
        + 'what you were doing. IT are aware that finding your place again '
        + 'takes on average twenty-three minutes and have decided to describe '
        + 'this rather than fix it, as it is not a fault in any system they '
        + 'administer.',
      'A call that is allowed to ring until it stops is recorded as a call '
        + 'that was allowed to ring until it stopped. The record does not say '
        + 'anything else. It does not need to. You will also find you lost '
        + 'some of your place anyway, as the ringing was not nothing.',
      'Meetings have been introduced. Where a meeting concerns you it will be '
        + 'announced in the morning briefing and confirmed by mail, naming the '
        + 'hour. Attendance is expected. The meeting occupies the whole of '
        + 'your screen for the whole of its duration; your queue, and every '
        + 'clock on it, continues in your absence. This is not a fault. A '
        + 'summary mail is circulated afterwards containing the meeting, in '
        + 'full, for the benefit of those who were there.',
      'The Start menu now stays on the screen regardless of how much has been '
        + 'installed on this workstation. Items which were previously above '
        + 'the top of the screen can now be clicked. Colleagues who reported '
        + 'that the menu was "fine on my machine" are thanked for their '
        + 'contribution to the investigation.',
      'Known issue: the pace of the working day is under ongoing review '
        + 'following the addition of people to it.',
    ]),
  },
  {
    version: '0.2.7',
    date: '2026-08-01',
    summary: 'This update adds the consultation and selection screens '
      + 'required by our commitments on organisational change.',
    lines: Object.freeze([
      'Where a reduction in roles is proposed, the announcement will state '
        + 'the number of roles, the selection pool, the criteria and the date '
        + 'consultation closes. It will be sent to everybody at the site and '
        + 'it will be sent at least thirty days before any decision takes '
        + 'effect. This is longer than we are obliged to give at this '
        + 'headcount. It is what we are giving.',
      'Selection is scored on a published matrix with three criteria: your '
        + 'performance for the period, your disciplinary record where it is '
        + 'current and relevant, and your length of service. Performance is '
        + 'weighted heaviest. Length of service is capped at ten years, so '
        + 'that colleagues past that point are level with each other.',
      'Your own scores and everybody else\'s in the pool are visible to you '
        + 'from the day consultation opens, in the review window and on the '
        + 'day scorecard, and they update as the period goes on. Colleagues '
        + 'have asked whether the scores are visible before the decision. '
        + 'They are. That is the point of them.',
      'Where no reduction is proposed, all of the above screens say so. There '
        + 'is no round on during the probation week and there will not be one '
        + 'in the two weeks after any consultation closes.',
      'A role ending by redundancy is not a dismissal for conduct or '
        + 'capability and is not recorded as one. Notice is paid in lieu. '
        + 'Statutory redundancy pay requires two years of continuous service; '
        + 'below that, notice is what is owed, and for a colleague at this '
        + 'stage that is one week.',
      'Personnel confirm that a conduct file does not follow a colleague to a '
        + 'subsequent employer, as it is a record made by the people who made '
        + 'it. Colleagues have asked us to state this more prominently. It is '
        + 'stated here.',
      'Known issue: a week that comfortably clears the probation pass mark '
        + 'may still be the lowest-scoring week in a pool. The pass mark and '
        + 'the matrix answer different questions. Personnel confirm this is '
        + 'not an issue.',
    ]),
  },
  {
    version: '0.2.6',
    date: '2026-08-01',
    summary: 'This update clarifies how informal conduct discussions are '
      + 'recorded and used.',
    lines: Object.freeze([
      'Following the scoring correction in 0.2.5, conversations about what is '
        + 'open on your screen no longer affect any figure at the time they '
        + 'happen. They are recorded. A dated note is added to your file '
        + 'stating what was observed and when, in line with Personnel\'s '
        + 'documentation-first guidance, and the note is added whether or not '
        + 'anybody ever reads it.',
      'Your file is now available to you, under "A quick word" in the Start '
        + 'menu, at any time, in full. Colleagues have asked why this was not '
        + 'previously the case. Personnel have asked us to say that it now is.',
      'The same window states the circumstances in which your file would be '
        + 'consulted at review. There are three: a reported fault that passed '
        + 'its resolution target without the person who raised it being '
        + 'contacted at all; a colleague directed to the request form and not '
        + 'subsequently dealt with; and a fault raised by your own line '
        + 'manager left to pass its target. Where none of these applies, your '
        + 'file is not consulted and the review is decided on the percentage '
        + 'alone.',
      'Where your file IS consulted, the pass mark for the review rises by 5 '
        + 'for each note on it, to a maximum of 70 out of 100. The mark you '
        + 'have to reach is shown on the day scorecard every evening, in the '
        + 'review window, and on the week summary, together with the reason '
        + 'it is the number it is. It is never below 45.',
      'Time taken by these conversations is not credited back to the shift. A '
        + 'ten-minute discussion at your desk is ten minutes in which no fault '
        + 'was worked and no resolution target moved. This has always been the '
        + 'case and is now stated.',
      'The desk itself continues to be observed separately. Empties above the '
        + 'permitted number are noted on the same file and are not raised with '
        + 'the employee.',
      'Known issue: a note cannot be removed from a file by tidying anything. '
        + 'Personnel confirm this is not an issue.',
    ]),
  },
  {
    version: '0.2.5',
    date: '2026-08-01',
    summary: 'This update improves the consistency of probation review '
      + 'scoring.',
    lines: Object.freeze([
      'Addresses an issue in which the probation review was decided on a '
        + 'running total. Reviews are now scored as a percentage of the work '
        + 'the week actually received: half of it the proportion of the queue '
        + 'that was closed, half of it the proportion that never passed its '
        + 'resolution target. The pass mark is 45 out of 100.',
      'The previous method added points for each fault closed and took a '
        + 'fixed amount off for each conversation with a line manager about '
        + 'what was open on your screen. The first of those grew every time '
        + 'the fault catalogue grew and the second did not, so the standard '
        + 'required to pass fell slightly each time this department was given '
        + 'more to do. Personnel have asked that this be described as a '
        + 'scaling correction.',
      'The review percentage is now shown on the day scorecard, with the pass '
        + 'mark next to it and a sentence saying which side of it you are on. '
        + 'It was previously calculated and not displayed, which we accept is '
        + 'not the same thing as being told.',
      'The week summary now itemises both halves of the figure - closed '
        + 'against received, and deadlines kept against deadlines set - as '
        + 'fractions and as percentages, and states the number the reviewer '
        + 'read. That number is the one written down at three o\'clock and '
        + 'not the one the afternoon has moved since.',
      'The review window now states the figure your review was decided on. It '
        + 'is in the review window, at the review, in writing.',
      'Conversations about what is open on your screen no longer affect the '
        + 'review figure. They continue to be recorded, the corridor is '
        + 'unchanged, policy 4.1 is unchanged, and the time those '
        + 'conversations take out of your afternoon is unchanged.',
      'Known issue: a week in which nothing arrives at all cannot be scored, '
        + 'because there is nothing to take a percentage of. The reviewer '
        + 'will read whatever the previous week left him. This has not come '
        + 'up.',
    ]),
  },
  {
    version: '0.2.4',
    date: '2026-08-01',
    summary: 'This update improves the handling of files that were never lost.',
    lines: Object.freeze([
      'Addresses reports of documents disappearing after being saved. The '
        + 'documents had not disappeared. A file opened out of a mail is '
        + 'opened from C:\\WINDOWS\\TEMP, and Save writes it back to where '
        + 'it was opened from, every time, including the ninth time. Adds '
        + '"move <file> <directory>" to the Support Terminal for putting one '
        + 'back where the person who saved it believes it already is.',
      'The temp directory is now visible on every workstation, along with the '
        + 'note the build left in it in 1994 explaining that the machine '
        + 'treats everything in there as disposable. It has been doing that '
        + 'quietly for four years.',
      'Adds "purge <directory>" for a directory a program has filled and '
        + 'nobody has emptied. It will empty a directory whose contents have '
        + 'already been sent somewhere else, and it will refuse every other '
        + 'directory on the estate, including the one next door with the same '
        + 'software\'s name on it. That refusal is the feature.',
      'Resolves a condition in which a warehouse workstation reported '
        + 'insufficient disk space while containing four documents. It also '
        + 'contained twelve monthly scanner exports going back to 1997, '
        + 'totalling rather more than the drive had. Head office has had all '
        + 'twelve since the nights they were written.',
      'The print queue now lists its jobs rather than counting them: the job '
        + 'number, the size and the minute each one arrived, under the same '
        + 'numbers as the files in the spool folder. There are still no '
        + 'document names and no owners, because this spooler has never '
        + 'recorded either and this update will not invent them.',
      'The Event Viewer now dates each line the way the rest of the system '
        + 'dates a file. A log line and a directory listing describing the '
        + 'same evening now say so in the same words.',
      'Known issue: the pallet scanner will write next month\'s export next '
        + 'month. This update does not include a schedule for deleting them, '
        + 'because deleting things on a schedule is a change and a change '
        + 'needs a form.',
    ]),
  },
  {
    version: '0.2.3',
    date: '2026-08-01',
    summary: 'This update improves access to local and networked storage.',
    lines: Object.freeze([
      'Addresses an issue in which this workstation had no drive on it. Every '
        + 'machine on the estate now has a C: drive with the directories it '
        + 'was imaged with, the ones its job added, and a profile for whoever '
        + 'logs on to it.',
      'Adds "dir", "cd", "type" and "tree" to the Support Terminal. Listings '
        + 'include the volume header, the date and size of every entry, and '
        + 'what is left on the drive. Typing "cd" on its own reports where '
        + 'you are standing, which is the behaviour of this operating system '
        + 'and not an oversight.',
      'The Support Terminal now opens in C:\\SUPPORT and the prompt follows '
        + 'the directory you are in. A second terminal opens where a second '
        + 'terminal opens.',
      'Adds access to other machines through their administrative share, in '
        + 'the form \\\\PRINT-01\\C$. This works because the Server service '
        + 'is running on every box in this building, which you can see for '
        + 'yourself in any services list.',
      'The print queue is now a directory. Jobs stacked up behind a wedged '
        + 'spooler are files in the spool folder on the print server, with a '
        + 'size and a time on each, and emptying the queue empties the '
        + 'folder. Four files of the same size are four copies of the same '
        + 'delivery note.',
      'Each machine now keeps its event log as a file in '
        + 'C:\\WINDOWS\\SYSTEM32\\LOGFILES. It contains what the Event Viewer '
        + 'shows, because it is what the Event Viewer shows.',
      'Directories you have no rights to now report that they are directories '
        + 'you have no rights to. Payroll would like this noted as working as '
        + 'intended.',
      'Known issue: there is no "ls" on this workstation. There is no "ls" on '
        + 'any workstation in this building. This is not the sort of building '
        + 'that has one.',
    ]),
  },
  {
    version: '0.2.2',
    date: '2026-08-01',
    summary: 'This update improves the accuracy of workstation reporting.',
    lines: Object.freeze([
      'Addresses an issue in which a workstation reported one service. Every '
        + 'machine on the estate now lists the services it has been running '
        + 'since it was built, with the status and the startup type of each. '
        + 'Finding the one that is wrong is your job and always was.',
      'Adds startup types. A service set to Manual and stopped is a machine '
        + 'behaving itself; a service set to Automatic and stopped is the '
        + 'reason somebody has rung. The list now tells you which you are '
        + 'looking at.',
      'Adds "sc query" and "tasklist" to the Support Terminal. The first '
        + 'reports what the service manager holds on one service; the second '
        + 'reports what is open on this desk, browsers and morale exercises '
        + 'included. A minimised window remains a running program.',
      'Resolves a condition in which restarting a licence pool was refused in '
        + 'the words written for a chassis fan. Refusals now name what the '
        + 'thing actually is.',
      'Service names now require the machine they are on where more than one '
        + 'machine answers to the name, in the form PRINT-01\\Spooler. Every '
        + 'box in this building runs a print spooler, which was always true '
        + 'and is now visible.',
      'Adds a domain controller. The accounts, the group memberships and the '
        + 'lockouts have always been somewhere; they are now somewhere you '
        + 'can ping.',
      'About This Workstation is now an About dialog. It reports this '
        + 'machine - the processor, the memory, the display, the uptime and '
        + 'the licence - and no longer reports how many tickets are waiting '
        + 'for you. The queue was already doing that.',
      'Known issue: 48 MB of the memory in this workstation remains usable. '
        + 'Nobody knows why.',
    ]),
  },
  {
    version: '0.2.1',
    date: '2026-08-01',
    summary: 'This update improves the handling of workstation accounts.',
    lines: Object.freeze([
      'Addresses an issue in which logging on with a badge number that had no '
        + 'week saved against it started a new week without saying so. The '
        + 'workstation now states which of the two happened, on the same '
        + 'badge, before you have had time to wonder.',
      'Adds an account record to the log-on screen. Your badge number now '
        + 'shows the date it was issued and the date it was last used, which '
        + 'are the only two facts this company holds about you.',
      'Adds a retention period. IT clears out dormant accounts after six '
        + 'months, which is the most realistic thing in this building. '
        + 'Logging on or saving a day pushes the date another 180 days out; '
        + 'the date is on the log-on screen and it is not a threat.',
      'Known issue: this is still a helpdesk. No fix is planned.',
    ]),
  },
  {
    version: '0.1.0',
    date: '2026-07-31',
    summary: 'This update improves the reliability of the working day.',
    lines: Object.freeze([
      'Addresses an issue in which the working day did not exist. Days now '
        + 'run from 09:00 to 17:00 and end whether or not the queue does.',
      'Addresses an issue where reported faults arrived with no deadline '
        + 'attached. Response and resolution are now timed separately, and '
        + 'the first thing done to a ticket stops one of the two clocks.',
      'Adds the Active Dictionary, Remote Assist, Event Viewer, Chat, Mail, '
        + 'the Support Terminal and the Knowledge Base. Several of these were '
        + 'previously represented by an icon.',
      'Addresses an issue in which typing into the Support Terminal had no '
        + 'effect on the estate. Twenty-eight commands now do what their '
        + 'buttons do.',
      'Resolves a condition in which a print spooler could be restarted while '
        + 'still holding the files it was declining to print.',
      'Adds support for reporters who cannot describe the fault. Asking the '
        + 'right question now stops the reporter\'s clock; not asking one no '
        + 'longer does.',
      'Addresses an issue where workplace stress had no observable effects. '
        + 'Above 80, hand tremor is rendered. This is cosmetic. Every control '
        + 'continues to do exactly what it says it does.',
      'Adds corridor awareness. An approaching member of management is now '
        + 'indicated in the taskbar, in the reflection on the monitor, and in '
        + 'the floor. The Boss Key minimises all non-work windows.',
      'Adds desk consumables. Energy drinks are supported, including their '
        + 'documented aftermath. Beer is present and locked pending review, '
        + 'per policy 4.1 (probationary staff).',
      'Improves the accuracy of the payslip. Deductions are now itemised. '
        + 'The farm fund is displayed to the penny.',
      'Addresses an issue in which dismissal ended the session permanently. '
        + 'The farm fund is retained across terminations.',
      'Adds saved games. The week is written to this workstation, and to your '
        + 'badge number where one has been issued. Losing the badge loses the '
        + 'save; IT cannot look it up, which is the point.',
      'Known issue: this is still a helpdesk. No fix is planned.',
    ]),
  },
]);

/**
 * Compares two `major.minor.patch` versions.
 *
 * Written out rather than compared as strings, because `'0.10.0' < '0.9.0'` is
 * true alphabetically and false in every other sense - and this decides
 * whether a player is shown an update window, which is the sort of thing that
 * goes unnoticed for exactly nine releases.
 *
 * Anything that is not three whole numbers sorts BELOW everything that is: an
 * unreadable stored version means "older than this build", which shows the
 * notes rather than hiding them.
 */
export function compareVersions(left: string, right: string): number {
  const parts = (value: string): readonly number[] => {
    const matched = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());

    return matched === null
      ? [-1, -1, -1]
      : [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  };

  const a = parts(left);
  const b = parts(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);

    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }

  return 0;
}

/** The notes, newest first, whatever order they were written in. */
export function releasesNewestFirst(): readonly ReleaseNote[] {
  return [...RELEASES].sort(
    (left, right) => compareVersions(right.version, left.version),
  );
}

/** Everything published after `version`, newest first. */
export function releasesSince(version: string): readonly ReleaseNote[] {
  return releasesNewestFirst().filter(
    (note) => compareVersions(note.version, version) > 0,
  );
}

/** What this build calls itself, for anything that needs to say it out loud. */
export const CURRENT_VERSION = BUILD_VERSION;
