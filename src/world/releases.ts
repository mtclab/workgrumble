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
