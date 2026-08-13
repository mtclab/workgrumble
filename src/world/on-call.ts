/**
 * On-call: the 3am page, as data (E6, 0.17.0).
 *
 * The signature sysadmin beat. Once the promotion crosses the player to the
 * engineer tier they carry the pager after hours, and a service on a Linux box
 * falls over in the small hours - a REAL page, a "you are woken now" beat rather
 * than a ping read at the next morning's brief. The answer is the sysadmin fix
 * the last two versions built: ssh in, read the unit (`systemctl status` /
 * `journalctl -u`), `systemctl restart`, and the unit flips back to
 * active(running) - which is the uptime saved and the page cleared.
 *
 * The truest on-call beat, and the one this module is really about, is the page
 * that CLEARS ITSELF. The research the design is built on (PagerDuty delays the
 * notification precisely because most alerts self-resolve; the 3am page that is
 * green again before you have the laptop open) is the boy-who-cried-wolf cost of
 * jumping fully awake for every page: a flapping check settles on its own if you
 * wait a beat, and ssh-ing in to restart a service that would have come back by
 * itself is effort spent for nothing. The REAL ones do not settle and need the
 * fix. The skill - and the joke - is telling them apart at 3am.
 *
 * Which a given page is, is DETERMINISTIC and seeded off the page id and the
 * night (FNV-1a, the same construction `cmd-net.ts`/`day.ts` make their derived
 * facts from; the engine bans `Math.random`), so a save mid-night, a reload and
 * a replay all agree, and a week played again after a firing - a fresh attempt
 * seed - can flip which night flapped. A self-resolving page carries its own
 * clear-time on the same seed, so it clears on a clock the world can replay
 * rather than one somebody rolled.
 *
 * Nothing here dispatches, touches the DOM or reads the time of day. It is the
 * played twin of `after-hours.ts` (the overnight ping) and `monitoring.ts` (the
 * board's self-clearing noise): pure data and pure functions the driver applies
 * and a surface draws.
 */

import { playerTierOf } from './fields';
import { rowFor } from './titles';

/**
 * How loud the page is. A sev-1 is a customer-facing service down (the portal
 * nobody can log into); a sev-2 is a degraded-but-serving fault. Flavour the
 * surface prints, not a gameplay axis - the cost is the uptime, not the label.
 */
export type OnCallSeverity = 'sev1' | 'sev2';

export const ON_CALL_SEVERITIES = ['sev1', 'sev2'] as const;

/** How the pager spells a severity: the real short label a NOC uses. */
export function severityLabel(severity: OnCallSeverity): string {
  return severity === 'sev1' ? 'SEV-1' : 'SEV-2';
}

/**
 * One page authored to fire on a given night's on-call rotation.
 *
 * Authored world data - which box, which unit, which real page-ticket to raise
 * when it is a genuine fire - exactly as the tickets and the after-hours pings
 * are authored. It is NOT the fault's status (that is a real node state the
 * ticket's setup or the flap writes); it is the description of what the pager
 * would say. `ticket` is spawned only when the page is a real one; a flap raises
 * no ticket, the same way a monitoring flap raises none.
 */
export interface OnCallPage {
  /** Stable across the week: the world records what was done against this id. */
  readonly id: string;
  readonly severity: OnCallSeverity;
  /** The box the page is about, by machine node id - the box you ssh to. */
  readonly box: string;
  /** The unit that falls over, by unit node id - the thing `systemctl` names. */
  readonly unit: string;
  /** What the service IS, in a phrase, for the pager line: "client portal". */
  readonly service: string;
  /** One line of what the pager woke you for, read on the page surface. */
  readonly note: string;
  /**
   * The journal the failed unit carries, as `systemctl status`/`journalctl` will
   * print it: the crash cascade the diagnosing engineer reads. One string per
   * line, in the real `MMM DD HH:MM:SS host process[pid]: message` shape. A real
   * fire writes this onto the unit when it fires; a flap writes it too, because a
   * flap that a `systemctl status` could tell from a fire at a glance would not
   * be a flap you had to LOOK at - the difference is that the flap settles and
   * the fire does not.
   */
  readonly journal: readonly string[];
}

/**
 * What the page turned out to BE once the night's seed is read: a real fire that
 * needs the fix, or a flap that clears itself. Two words rather than a boolean
 * so the surface, the driver and a test all name it the same way.
 */
export type OnCallPageKind = 'real' | 'self_resolving';

/**
 * What scrambling for a page that would have cleared itself costs, in whole
 * stress points.
 *
 * THREE, and deliberately more than the after-hours ping's one
 * (`AFTER_HOURS_STRESS`): a ping followed you into the morning, a page got you
 * out of bed at 3am and put you on a laptop to restart a service that did not
 * need it. It is the alert-fatigue cost made a number - the price of not
 * trusting the board and jumping every time - and it is charged ONCE per flap,
 * off the world's own scrambled record, so a jittery hand cannot pay it twice.
 * OVERSEER TUNING KNOB, and conservative: it is felt by a bad night, not a
 * punishment for engaging.
 *
 * Answering a REAL page has no constant here on purpose: the reward is the
 * ticket's own (the uptime saved is the unit back up and the page-ticket
 * closed), and the cost of MISSING one is that ticket breaching - both the
 * existing ticket/SLA/review machinery, measured the sysadmin way (did you catch
 * it) rather than as a second bespoke number.
 */
export const ON_CALL_SCRAMBLE_STRESS = 3;

/**
 * What answering a real page is worth, in whole reputation points: the uptime
 * saved and the standing up for the fire.
 *
 * FOUR - more than the after-hours ping's one, because a page got you out of bed
 * and you brought a customer-facing service back, and less than a full ticket's
 * five, because there is no queue triage in it, just the fix. It is the "you
 * caught it" the version is measured on, awarded once per page off the world's
 * own settled record when the downed unit is answering again. OVERSEER TUNING
 * KNOB.
 */
export const ON_CALL_ANSWERED_REPUTATION = 4;

/**
 * And what a page you never got to costs, in whole reputation points: the
 * downtime, read at the review the way a missed deadline already is.
 *
 * FIVE - a shade sharper than answering is worth, and sharper than a breach's
 * three, because a page that stayed failed is a service that was down the whole
 * on-call day with your name on the rotation. It is charged once per page, at the
 * clock-off that ends the on-call day, if the unit is still failed and nobody
 * fixed it. Never for a flap (a flap settles itself; leaving it is correct) and
 * never for a page a desk player was never sent - the cost is the missed fire,
 * not the tone. OVERSEER TUNING KNOB.
 */
export const ON_CALL_MISS_REPUTATION = 5;

/**
 * How often a page is a flap rather than a fire, as a percentage of the seeded
 * hash space. Just under half: enough that "wait and see" is a real skill and
 * "jump every time" is a real cost, not so much that the pager is noise. OVERSEER
 * TUNING KNOB.
 */
const SELF_RESOLVE_PERCENT = 45;

/** The window a flap can settle in, in minutes into the on-call morning. */
const SELF_CLEAR_MIN_MINUTES = 5;
const SELF_CLEAR_MAX_MINUTES = 25;

/** The small hours a page can land in, in minutes past midnight (02:00-05:29). */
const PAGE_EARLIEST_MINUTE = 2 * 60;
const PAGE_LATEST_MINUTE = 5 * 60 + 29;

/**
 * One page as the page surface meets it on the morning after: the authored page,
 * the night it fired on, what the seed made it (fire or flap), the minute it
 * woke you, whether its unit is still down this minute, and how it was settled
 * (or null while it is still in the air). A pure join the driver builds and the
 * brief draws - the surface learns nothing the world has not written down.
 */
export interface OnCallPageArrival {
  readonly page: OnCallPage;
  readonly night: number;
  readonly kind: OnCallPageKind;
  readonly pagedAt: number;
  readonly unitFailed: boolean;
  readonly outcome: OnCallOutcome | null;
}

/**
 * How a page ended up, once the on-call day is done with it. Four words, one per
 * way a page is closed: the real fire ANSWERED (fixed, uptime saved) or MISSED
 * (left failed, downtime), and the flap CLEARED (it settled on its own, correct
 * to leave) or SCRAMBLED (you got up and restarted it, and it had already
 * settled). The surface reads them, the settled record stores them `id@outcome`,
 * and only ANSWERED/MISSED/SCRAMBLED move a meter - CLEARED is the free one.
 */
export const ON_CALL_OUTCOMES = {
  answered: 'answered',
  missed: 'missed',
  cleared: 'cleared',
  scrambled: 'scrambled',
} as const;

export type OnCallOutcome =
  (typeof ON_CALL_OUTCOMES)[keyof typeof ON_CALL_OUTCOMES];

/** The `id@outcome` line the settled-as record stores, and the surface reads. */
export function settledLine(pageId: string, outcome: OnCallOutcome): string {
  return `${pageId}@${outcome}`;
}

/**
 * A stable 32-bit hash of a string - FNV-1a, the same construction
 * `monitoring.ts` and `cmd-net.ts` use to make a derived fact a pure function of
 * an id. Kept local so the world layer does not reach up into the shell for it.
 */
function pageHash(value: string): number {
  let hash = 0x811c_9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }

  return hash;
}

/** The seed a page's derived facts are keyed on: the world seed, night and id. */
function pageKey(pageId: string, night: number, seed: number): number {
  return pageHash(`${String(seed)}:${String(night)}:${pageId}`);
}

/**
 * Whether this page clears itself, seeded off its id, the night and the world
 * seed - the whole distinction the version turns on. Deterministic and
 * replayable: the same three inputs always answer the same way, a fresh attempt
 * seed can flip a night, and nothing here rolls a die the world would forget.
 */
export function pageSelfResolves(
  pageId: string,
  night: number,
  seed: number,
): boolean {
  return pageKey(pageId, night, seed) % 100 < SELF_RESOLVE_PERCENT;
}

/** The kind a page is on this night: the boolean above, named. */
export function pageKind(
  pageId: string,
  night: number,
  seed: number,
): OnCallPageKind {
  return pageSelfResolves(pageId, night, seed) ? 'self_resolving' : 'real';
}

/**
 * The minute the pager went off, in minutes past midnight - flavour for the
 * "you are woken now" line, derived so the surface reads "03:14" rather than a
 * faked time. A pure function of the same seed, so the reload agrees.
 */
export function pagedAtMinute(
  pageId: string,
  night: number,
  seed: number,
): number {
  const span = PAGE_LATEST_MINUTE - PAGE_EARLIEST_MINUTE + 1;

  return PAGE_EARLIEST_MINUTE + (pageKey(`${pageId}:at`, night, seed) % span);
}

/**
 * How long a flapping page takes to settle on its own, in minutes into the
 * on-call morning. Bounded to a short window so "wait a beat" is a beat - a few
 * minutes of the morning clock, not an hour - and the auto-clear is a thing the
 * player can SEE happen. A real page has no such window: it never settles, which
 * is the whole difference the fix exists for.
 */
export function selfClearDelayMinutes(
  pageId: string,
  night: number,
  seed: number,
): number {
  const span = SELF_CLEAR_MAX_MINUTES - SELF_CLEAR_MIN_MINUTES + 1;

  return SELF_CLEAR_MIN_MINUTES + (pageKey(`${pageId}:clear`, night, seed) % span);
}

/** A minutes-past-midnight value as `HH:MM`, for the pager line. */
export function formatPageTime(minute: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(minute)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Whether this player carries the pager, which is a fact about their RUNG and
 * is therefore read off the rung table (E9, 0.35.0: `carriesPager`).
 *
 * The one gate the whole version rests on, and the whole of why a service-desk
 * player and every pre-promotion golden are byte-identical - a desk player is
 * never paged, so nothing fires, nothing is authored onto their save, and the
 * on-call column is inert. It used to ask whether the tier was Systems
 * Engineer, which was the same answer by coincidence of there being one rung
 * with a pager; the table says which rungs carry one, so the rung above the
 * engineer that also carries it will not need this line edited. Reads the raw
 * tier field with the back-compat default (absent is service desk), exactly as
 * the ssh gate does.
 */
export function isOnCall(playerTierValue: unknown): boolean {
  // The TIER alone, with no title beside it, and that is safe rather than
  // sloppy: two rungs share the service desk tier since 0.36.0 and neither
  // carries a pager, which `titles.test.ts` asserts of every tier rather than
  // leaving to be true by luck. The day a rung sharing a tier disagrees about
  // the pager, that gate goes red here rather than a senior analyst being
  // quietly paged at two in the morning.
  return rowFor(playerTierOf(playerTierValue)).carriesPager;
}
