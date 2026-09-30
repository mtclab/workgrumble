/**
 * Which version this browser has already been told about.
 *
 * It lives in its own storage slot rather than in the save file, and that is a
 * decision worth writing down because the spec asked for the save.
 *
 * The window it gates is a FIRST-BOOT window: it goes up before anybody has
 * logged on, in front of a session that is a fresh Monday. The save is not
 * read at boot - this game starts a new week and the player loads if they want
 * to - so a flag inside the save file would be a flag nothing looks at when
 * the question is asked, and the window would go up on every single reload.
 *
 * It is also the more honest model of what the fact IS. "This browser has seen
 * the notes for 0.2.0" is true of the browser and the person at it, not of a
 * week: loading an older save does not un-read a changelog, and a save synced
 * from another machine should not re-announce an update somebody already read.
 *
 * The slot is written in the same guarded way as the save and the retry: a
 * browser that will not keep it is a browser that gets told about the same
 * update twice, which is a joke rather than a lost week.
 */

import type { ReleaseNote } from '../world/releases';
import { compareVersions, releasesSince } from '../world/releases';

export { SEEN_VERSION_KEY, VersionSlot } from '../shared/versions';

/**
 * The notes to put on screen at boot, given what this browser last saw.
 *
 * Three cases, and the first one is the one that matters:
 *
 *  - NOTHING RECORDED is a workstation nobody has updated, not one that is
 *    behind. An update window on a machine that has only ever run this version
 *    would be announcing an update that did not happen, and it would put a
 *    window in front of every player's first boot forever. The version is
 *    recorded and nothing is shown; the notes stay readable from the Update
 *    history entry, which is where a changelog belongs.
 *  - A VERSION OLDER THAN THIS ONE is the case the window exists for.
 *  - THE SAME VERSION, or a newer one - which is a downgrade, or a machine
 *    whose stored value somebody edited - shows nothing.
 */
export function updateOnBoot(
  seen: string | null,
  current: string,
): readonly ReleaseNote[] {
  if (seen === null || compareVersions(current, seen) <= 0) {
    return [];
  }

  return releasesSince(seen);
}
