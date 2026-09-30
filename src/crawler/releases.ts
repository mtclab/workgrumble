/**
 * What changed in Helldesk, build to build, in the building's own voice.
 *
 * Helldesk versions itself. `package.json` is the office sim's number and
 * moves on the office sim's schedule; a crawler build that changed nothing in
 * the crawler would otherwise announce an update, and one that changed a great
 * deal would not. So the number is a constant here, and `releases.test.ts`
 * fails if the newest note below disagrees with it: a build cannot call itself
 * a version whose notes nobody wrote.
 *
 * The shape and the version arithmetic are the office sim's (`ReleaseNote`,
 * `compareVersions`), imported rather than copied, so the two changelogs can
 * never disagree about what `0.10.0` is bigger than. Every line below has to
 * be TRUE of the build it ships in: the joke is the voice, never the facts.
 *
 * The rules for when the notes are put in front of somebody are the office
 * sim's too (`updateOnBoot` in `src/shell/updates.ts`); `whatsNew` is the same
 * three cases over this list instead of that one.
 */

import { compareVersions, type ReleaseNote } from '../world/releases';
import { VersionSlot } from '../shell/updates';

/** What this Helldesk build calls itself. The newest note must agree. */
export const HELLDESK_VERSION = '0.2.0';

/**
 * Which Helldesk version this browser has already been told about. Its own
 * slot, not the save and not the office sim's slot: having read the notes is
 * true of the browser, not of a career, and the two games are different
 * builds with different numbers.
 */
export const HELLDESK_SEEN_VERSION_KEY = 'workgrumble-helldesk-seen-version';

export const HELLDESK_RELEASES: readonly ReleaseNote[] = Object.freeze([
  {
    version: '0.2.0',
    date: '2026-10-01',
    summary: 'The building now tells you before it hits you, the steam has '
      + 'somewhere to take you, and the whole thing runs on less machine.',
    lines: Object.freeze([
      'Everybody in the building winds up before they hit you: an arm or a '
        + 'shoulder draws back, something glows warm and a sound rises, for '
        + 'about half a second and longer for a boss. Where the blow lands is '
        + 'decided when it lands, so stepping back during the wind-up makes it '
        + 'a miss, and raising your block in the last quarter second of it is '
        + 'a parry that staggers them. PO bombs and the Auditor\'s lasers mark '
        + 'the carpet first. Facilities describe this as fairer.',
      'A hit now says where it came from. An arc on the edge of the screen '
        + 'points at whatever did it and fades; damage from the room itself '
        + 'shows as a faint ring all the way round. It was always the first '
        + 'question on the incident form.',
      'Holding the mouse button with a melee tool charges a heavy swing, and '
        + 'the heavy swing is all you get: the quick swing that used to go out '
        + 'first, free of charge, has been withdrawn, and the heavy one hits '
        + 'harder to make up for it. Tap for a quick swing. A swing at nothing '
        + 'whiffs and puffs dust, and a tool with nothing in it clicks dry and '
        + 'crosses out the crosshair for as long as you keep pulling.',
      'SUO. Take enough Löyly into a meter that is already nearly full and it '
        + 'spills over, and the steam takes you under: the room you are '
        + 'standing in becomes the bog for thirty seconds, the people in it '
        + 'become shapes, and out on the peat the Löylyhenki is waiting. Walk '
        + 'to it. Once a floor, once a weekend, never with somebody angry close '
        + 'behind you, and nothing is saved while you are down there. Short of '
        + 'Löyly, a rune can now be cast on sisu instead, paid for in sanity.',
      'A performance pass. The building no longer draws what the fog hides or '
        + 'the people standing behind a wall, compiles its shaders while the '
        + 'floor loads instead of the first time something new comes into '
        + 'view, and works out its ambient occlusion at half resolution. Same '
        + 'office, fewer frames lost to it.',
      'Clicking a key in the Control Panel and then leaving without pressing '
        + 'one no longer binds the next key you press in the game. The first W '
        + 'of the floor could become Strafe Right, saved, for good. Anybody '
        + 'still walking sideways will find the keys in the Control Panel, '
        + 'where they now stay put.',
      'New starters get an induction day: the first morning of a first career '
        + 'walks you through moving, talking, the ticket queue and a fight, one '
        + 'thing at a time, before the week is let loose on you. It counts as '
        + 'training.',
      'The menus answer the keyboard. The arrow keys move between the buttons '
        + 'on the title, pause and other screens, Enter picks one and Esc goes '
        + 'back. The mouse remains supported, as a courtesy.',
      'On its first launch the game looks at the machine it has been given and '
        + 'picks the graphics quality itself, rather than assuming the best. '
        + 'The Control Panel can overrule it, as it can most decisions made on '
        + 'your behalf.',
      'Building a floor now says that it is building a floor: a loading '
        + 'indicator is up while it happens, instead of a still frame that '
        + 'looks exactly like a hung machine.',
      'The Control Panel has accessibility options, for the parts of the game '
        + 'that were harder to see, read or keep up with than they needed to '
        + 'be.',
      'Helldesk has a version number, on the title screen and in Help, an '
        + 'Update History on every desk and in the backpack, and a note like '
        + 'this one the first time a newer build is opened.',
    ]),
  },
  {
    version: '0.1.0',
    date: '2026-09-29',
    summary: 'The first playtest build. An IT career, played on foot, up the '
      + 'floors of Workgrumble Ltd.',
    lines: Object.freeze([
      'A first- and third-person role-playing crawler through the office '
        + 'sim\'s building. One floor is one work week: the ticket queue at '
        + 'any computer, the people who bring their problems in person, a boss '
        + 'in the corner office, and the lift.',
      'Every Friday you drive to the mökki: salary, the performance review, '
        + 'sauna, lake, grill, fishing, sleep, the upgrade board and the '
        + 'Saunatonttu. On Monday you drive back to the next floor.',
      'Skills rise by use, a level is earned by resting, and the career ladder '
        + 'is the difficulty: every promotion makes the building fight harder '
        + 'and pay better. Perk trees, loot with rarity, quests with choices '
        + 'that come due later, and eight endings.',
      'Two tightropes, drink and caffeine, each with a narrow window that '
        + 'helps and a long way down either side of it. Mökki magic runs on '
        + 'Löyly. Saves live in this browser.',
    ]),
  },
]);

/** The notes, newest first, whatever order they were written in. */
export function helldeskReleasesNewestFirst(
  releases: readonly ReleaseNote[] = HELLDESK_RELEASES,
): readonly ReleaseNote[] {
  return [...releases].sort(
    (left, right) => compareVersions(right.version, left.version),
  );
}

/**
 * The notes to show on the title screen, given what this browser last saw.
 * The three cases of `updateOnBoot`, for the same reasons:
 *
 *  - NOTHING RECORDED is a first visit, not a player who is behind. A "what's
 *    new" in front of somebody who has never seen the old one tells them
 *    about changes to a game they never played. Nothing is shown.
 *  - AN OLDER VERSION shows everything after it up to this build, newest
 *    first. A stored value that is not a version at all sorts below every
 *    real one (`compareVersions`), so it is treated as the oldest and gets
 *    every note: telling somebody twice is a joke, not telling them is the
 *    failure.
 *  - THE SAME VERSION, or a newer one (a rollback), shows nothing.
 */
export function whatsNew(
  seen: string | null,
  current: string = HELLDESK_VERSION,
  releases: readonly ReleaseNote[] = HELLDESK_RELEASES,
): readonly ReleaseNote[] {
  if (seen === null || compareVersions(current, seen) <= 0) return [];
  return helldeskReleasesNewestFirst(releases).filter(
    (note) => compareVersions(note.version, seen) > 0
      && compareVersions(note.version, current) <= 0,
  );
}

/**
 * Asked once, at boot: what to show, and this build recorded as seen.
 *
 * Recorded now rather than when the panel is closed, as the office sim does:
 * a player who reloads with the panel up has still been shown it, and a
 * record that only lands when somebody clicks a button is a record that shows
 * the same notes on every visit until they do. `null` storage (a browser that
 * throws on the very mention of localStorage) shows nothing, because without
 * a record every visit would look like the first.
 */
export function takeWhatsNew(storage: Storage | null): readonly ReleaseNote[] {
  if (storage === null) return [];
  const slot = new VersionSlot(storage, HELLDESK_SEEN_VERSION_KEY);
  const notes = whatsNew(slot.read());
  slot.write(HELLDESK_VERSION);
  return notes;
}

/** This page's localStorage, or null where even reaching for it throws. */
export function browserStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
