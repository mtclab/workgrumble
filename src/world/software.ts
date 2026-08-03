/**
 * The web store's cost model: what unauthorised software costs a locked-down
 * desk, and where the lead's beat about it arms.
 *
 * The register is The Website Is Down: you CAN install things now, and the
 * building has an opinion. Installing under a locked-down policy is not blocked
 * - the consequence is social, not a wall - but it (a) drips suspicion while the
 * app sits on the machine, because IT can see what is installed the same as it
 * can see what is open, and (b) writes an audit record the lead's beat arms off,
 * never at random.
 *
 * Nothing here dispatches, touches the DOM or reads the clock. The numbers are
 * all in one place on purpose: they are the balance table of the whole
 * mechanic, they are deliberately conservative, and every one of them is an
 * OVERSEER TUNING KNOB. Same shape as `world/presence.ts`, which is the sibling
 * this file was built next to.
 */

import type { InstallPolicy } from './company';
import type { SlackRate } from './meters';

/* -- the tunables --------------------------------------------------------- */

/**
 * What one interval of an installed-against-policy app sitting on the machine is
 * worth in suspicion.
 *
 * Two, the same as the do-not-disturb drip and below the cheapest slack window
 * you can actually be CAUGHT at (three) - because this is not being caught at
 * something, it is unauthorised software the audit can see whether or not the
 * window is even open. It is a background price the app pays for being present,
 * charged per installed app per interval, and it is what makes the honest
 * tradeoff of a locked-down shop "better relief at higher audit risk".
 *
 * OVERSEER TUNING KNOB, conservative, and untested by the shipped week: lane A
 * ships no in-fiction way to install one, so nothing presses it until lane B's
 * web store exists. Re-evaluate on the run that actually installs a toy.
 */
export const INSTALL_PRESENT_SUSPICION = 2;

/**
 * How many logged installs it takes for the lead to have something to say.
 *
 * ONE, deliberately: a single unauthorised install under a locked-down policy
 * is already the whole of the evidence, and a threshold higher than that would
 * make the first one free - which is the trap a background drip with no beat
 * behind it becomes. The beat still only arms under the locked-down policy, so
 * a wild-west employer's installs never trip it however many there are.
 *
 * OVERSEER TUNING KNOB.
 */
export const INSTALL_BEAT_RECORDS = 1;

/**
 * The other way it arms: minutes an app has sat installed against policy.
 *
 * A record count catches the player who installs a dozen things; this catches
 * the one who installs a single toy and leaves it there all afternoon. Ninety
 * minutes is long enough that a quick install-use-uninstall never trips it and
 * short enough that "it has been on there for most of the afternoon" is a true
 * sentence when it does. OVERSEER TUNING KNOB.
 */
export const INSTALL_BEAT_MINUTES = 90;

/**
 * What an installed toy is worth as relief, once lane B makes one a slack app.
 *
 * Stronger medicine than the ambient Browser slack (`SLACK_RATES.browser` is
 * `{ stressRelief: 3, suspicion: 5 }`) AND a worse hiding place - which is the
 * whole tradeoff the locked-down shop offers: a real toy calms you down faster
 * than reading a forum, and the audit risk is the bill for it. It lives here,
 * in the balance table, as the number lane B's toys key their slack rate on;
 * lane A ships no slack toy, so nothing reads it yet. OVERSEER TUNING KNOB.
 */
export const INSTALLED_TOY_SLACK_RATE: SlackRate = { stressRelief: 4, suspicion: 6 };

/* -- reading the audit trail ---------------------------------------------- */

/**
 * One install, as the trail remembers it: which app, and the minute it went on.
 */
export interface InstallRecord {
  readonly id: string;
  readonly at: number;
}

/**
 * The `id@tick` lines of an audit field, parsed into records.
 *
 * The same parsing the driver does for the interruption ledgers, kept here as
 * well because both the beat and lane B's audit surface read this trail and a
 * second copy of the split is a second answer to "which minute did that happen
 * on" waiting to disagree with the first. A line with no stamp, or a stamp that
 * is not a whole number, is skipped rather than trusted - an edited save cannot
 * put a fake minute on the record.
 */
export function parseInstallLedger(value: unknown): readonly InstallRecord[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  const records: InstallRecord[] = [];

  for (const line of value.split('\n')) {
    if (line.length === 0) {
      continue;
    }

    const mark = line.lastIndexOf('@');

    if (mark <= 0) {
      continue;
    }

    const id = line.slice(0, mark);
    const at = Number(line.slice(mark + 1));

    if (!Number.isSafeInteger(at)) {
      continue;
    }

    records.push({ id, at });
  }

  return records;
}

/** How many installs the trail holds. What the beat's record threshold reads. */
export function installAuditCount(value: unknown): number {
  return parseInstallLedger(value).length;
}

/**
 * The longest any single install has sat on the machine by `now`, in minutes.
 *
 * The max across records rather than the sum, because the beat's minutes are
 * about "how long has something been on there", not "how much installing has
 * gone on in total" - one toy left up all afternoon is the sentence, and two
 * five-minute installs are not it. A record stamped in the future (a nonsense
 * save) contributes nothing rather than a negative.
 */
export function longestInstalledMinutes(value: unknown, now: number): number {
  return parseInstallLedger(value).reduce(
    (longest, record) => Math.max(longest, Math.max(0, now - record.at)),
    0,
  );
}

/* -- what the boss reads --------------------------------------------------- */

/**
 * The policy, the trail and the minutes behind it: everything the caught-scene
 * class needs to decide whether the lead has something to say about the software
 * on this machine, and nothing it needs to invent.
 *
 * `armed` is a PREDICATE over evidence the world wrote down, exactly like
 * `dndBeat`: a manager appearing to ask about an install that never happened is
 * the random scold this game does not have. It only arms under the locked-down
 * policy - a wild-west employer's installs are logged and cost nothing - and
 * only on real evidence, either enough installs on the trail or one that has sat
 * there long enough.
 */
export interface InstallAuditReading {
  readonly policy: InstallPolicy;
  /** Installs on the trail. */
  readonly records: number;
  /** Minutes the longest-standing one has been on the machine. */
  readonly minutesInstalled: number;
  readonly armed: boolean;
}

export function installAuditBeat(
  policy: InstallPolicy,
  records: number,
  minutesInstalled: number,
): InstallAuditReading {
  return {
    policy,
    records,
    minutesInstalled,
    armed: policy === 'locked_down'
      && (records >= INSTALL_BEAT_RECORDS
        || minutesInstalled >= INSTALL_BEAT_MINUTES),
  };
}
