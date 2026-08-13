/**
 * Playing the week again after they have taken your lanyard off you.
 *
 * A firing does not end the game, because the game is not about the job. It is
 * about the farm, and the joke the whole thing hangs on is that the fund
 * SURVIVES every firing: they can have the desk back, the queue back and the
 * probation back, and the money towards twelve acres is still yours. So a
 * retry keeps three things and throws the rest away.
 *
 *  - The farm fund, in whole pence, because that is the joke.
 *  - The article the player had left up, because knowing where the answer is
 *    written down is the only thing a week at a helpdesk actually teaches, and
 *    taking it back would make a second attempt a memory test rather than a
 *    second attempt.
 *  - Which attempt this is, because that is what moves the seed: the same
 *    week, the same tickets, the same review on Friday, and not the same
 *    minutes.
 *
 * The MAIL is deliberately not on that list, and it used to be. A thread that
 * is still marked read on the Monday of a new week is a thread with its unread
 * cue taken off - the security incident report and the maintenance notice both
 * arrive again, both matter again, and both arrived looking like something
 * already dealt with. Knowing an article exists is a skill; having already
 * opened this week's post is not.
 *
 * Everything else - the world, the meters, the queue, the reputation that got
 * you fired - is built again from nothing.
 *
 * The record lives in its own storage slot rather than in the save file: the
 * save is a world that no longer exists, and the first thing a retry does is
 * throw it away.
 */

import type { AppState, AppStateStore } from './app-state';
import { createAppState } from './app-state';
import type { SaveOutcome } from './save';
import { type CarriedValue, parseCarried } from '../world/carry';
import { FRESH_CAREER_TIER } from '../world/career';
import { FIRST_EMPLOYER } from '../world/employers';
import { playerTierOf, type PlayerTier } from '../world/fields';
import { PROBATION_WEEK } from '../world/pressure';
import type { WeekCarry } from '../world/session';

export const RETRY_KEY = 'workgrumble/retry';

export interface RetryRecord {
  /** Which attempt the NEXT week is, counting from 1. */
  readonly attempt: number;
  readonly farmFund: number;
  /** The article that was up in the knowledge base, if there was one. */
  readonly kbSelected: string | null;
  /**
   * And WHICH week of the employer arc is being attempted again.
   *
   * A retry is the same week over: the attempt moves, the arc does not. It is
   * carried rather than assumed because assuming it is the probation week is
   * only true while the probation week is the only week there is - and the
   * day the second one exists, a firing in week five would silently restart a
   * career rather than a Monday.
   */
  readonly arcWeek: number;
  /**
   * And WHICH employer the fired week was at, so the retry replays the SAME
   * shop (0.6.0, P1-5).
   *
   * A firing does not move you to a new company - it puts you back on the
   * Monday of the one you were at - so the retry has to carry the employer the
   * same way it carries the attempt and the arc week. It is carried rather than
   * assumed because assuming it is the probation shop is only true while there
   * is one shop: the day the second exists, a firing at Bodgeworth that dropped
   * this would silently restart the probation week over a Bodgeworth career.
   * Absent (a record written before the switch existed) is the first employer,
   * the only one those saves could have been at - the same back-compat rule the
   * carry reads forwards.
   */
  readonly employer: string;
  /**
   * And the TIER and TITLE the fired player held (E9, 0.35.0).
   *
   * A firing dents the standing and leaves the tier - `career.ts` says so out
   * loud about the switch, "a Systems Engineer who is let go is still a Systems
   * Engineer at the next desk" - and until this record carried them, the one
   * door that did not honour it was the door a firing actually goes through.
   * The retry rebuilt the world from a carry with no career on it, so an
   * engineer fired on the Thursday came back to the same Monday as a service
   * desk player: the ssh gate shut, the pager silent, the incidents on the desk
   * unfixable, and nothing anywhere saying why.
   *
   * It was reachable before this version (be promoted, be fired) and it is a
   * first-week experience after it (the start select hires straight onto the
   * tier), which is why it is fixed here rather than filed. Absent is the desk
   * and no title, which is every record any earlier build wrote and every
   * probationer's - so a junior's retry writes the same bytes it always did.
   */
  readonly tier: PlayerTier;
  readonly title: string | null;
  /**
   * And the estate the fired week was STOOD UP with (E11, 0.34.0).
   *
   * The start-of-week delta, not the end-of-week one, and the difference is the
   * whole reason this is on the record rather than read off the graph at the
   * moment of the firing. A retry is the same week again: "everything else -
   * the world, the meters, the queue, the reputation that got you fired - is
   * built again from nothing". A firing therefore does not hand you the damage
   * you did in the week you were fired for, and it does not hand you the
   * repairs either - it hands you the building as it stood on the Monday you
   * lost. The live world cannot answer that question by the Friday, so the
   * session carries what it was seeded with and the save file keeps it
   * (schema 5).
   *
   * Empty on every retry of a week that carried nothing, which is every retry
   * this game has ever handled.
   */
  readonly estate: readonly CarriedValue[];
}

function refuse(reason: string): SaveOutcome<never> {
  return { ok: false, reason };
}

/** What the session that was fired hands to the session that replaces it. */
export function recordFrom(
  attempt: number,
  farmFund: number,
  screens: Readonly<AppState>,
  arcWeek: number = PROBATION_WEEK,
  employer: string = FIRST_EMPLOYER,
  estate: readonly CarriedValue[] = [],
  /** The career the firing does not take off you: the tier, and the title. */
  tier: PlayerTier = FRESH_CAREER_TIER,
  title: string | null = null,
): RetryRecord {
  return {
    attempt: attempt + 1,
    farmFund: Math.max(0, farmFund),
    kbSelected: screens.kb.selectedId,
    arcWeek: Math.max(PROBATION_WEEK, arcWeek),
    employer: employer.length > 0 ? employer : FIRST_EMPLOYER,
    estate,
    tier,
    title: title === null || title.length === 0 ? null : title,
  };
}

export function parseRetryRecord(value: unknown): RetryRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const {
    attempt,
    farmFund,
    kbSelected,
    arcWeek,
    employer,
    estate,
    tier,
    title,
  } = value as Record<string, unknown>;
  const whole = (candidate: unknown, least: number): number | null => (
    typeof candidate === 'number'
      && Number.isSafeInteger(candidate)
      && candidate >= least
      ? candidate
      : null
  );
  const nextAttempt = whole(attempt, 1);
  const fund = whole(farmFund, 0);
  const selected = kbSelected === null || typeof kbSelected === 'string'
    ? kbSelected
    : undefined;

  // A delta that will not parse is a REFUSED record rather than a record with
  // an empty one: an empty estate is a real answer (every retry before week two
  // existed) and it must not be the answer a corrupt one falls back to, or a
  // hand-edited file would silently rebuild the Monday without last week's
  // repairs and nothing on any screen would say which half went missing.
  const delta = parseCarried(estate);

  if (
    nextAttempt === null || fund === null || selected === undefined
    || delta === null
  ) {
    return null;
  }

  // Anything else in the record - a `mailRead` list written by a build that
  // still carried one - is read past rather than refused: a carry-over from
  // yesterday's build is still a fund somebody earned. A record with no arc
  // week in it was written by a build that only had one, so it is the
  // probation week, which is the same rule read the other way round.
  return {
    attempt: nextAttempt,
    farmFund: fund,
    kbSelected: selected,
    arcWeek: whole(arcWeek, PROBATION_WEEK) ?? PROBATION_WEEK,
    // Absent or empty means a record from before the switch existed, which
    // could only have been the first employer - the same rule the carry reads.
    employer: typeof employer === 'string' && employer.length > 0
      ? employer
      : FIRST_EMPLOYER,
    estate: delta,
    // The same back-compat courtesy the tier gets everywhere else it is read:
    // absent, or a word this build does not know, is the service desk - which
    // is what every record written before this field existed was.
    tier: playerTierOf(tier),
    title: typeof title === 'string' && title.length > 0 ? title : null,
  };
}

/** What the new world is seeded with. */
export function carryFrom(record: Readonly<RetryRecord>): WeekCarry {
  return {
    farmFund: record.farmFund,
    attempt: record.attempt,
    arcWeek: record.arcWeek,
    // The retried week stands up the SAME shop it was fired at, not a fall-back
    // to the probation one (0.6.0, P1-5).
    employer: record.employer,
    // The career a firing does not take: an engineer comes back to the Monday
    // an engineer. Written only when there is something to write, so a
    // probationer's retry emits exactly the ops it always did.
    ...(record.tier === FRESH_CAREER_TIER ? {} : { playerTier: record.tier }),
    ...(record.title === null ? {} : { title: record.title }),
    // And the building as it stood on the Monday that was lost, which is empty
    // for every retry of a first week.
    ...(record.estate.length === 0 ? {} : { estate: record.estate }),
  };
}

/**
 * The screens a retried week opens with: a clean session with the article
 * still up. The windows are deliberately NOT carried - a new week opens on a
 * desktop, not on the four windows the last one was fired in front of - and
 * neither is the post, which is a new week's post.
 */
export function screensFrom(record: Readonly<RetryRecord>): AppState {
  const fresh = createAppState();

  return {
    ...fresh,
    kb: { selectedId: record.kbSelected },
  };
}

/**
 * One retry slot in whatever storage it is handed, written the same way the
 * save slot is: storage is passed in, and a browser that refuses to keep it
 * is a sentence rather than an exception.
 */
export class RetrySlot {
  public constructor(
    private readonly storage: Storage,
    private readonly key: string = RETRY_KEY,
  ) {}

  public write(record: Readonly<RetryRecord>): SaveOutcome {
    try {
      // Field by field rather than by spreading the record, so a probationer's
      // retry writes exactly the bytes it has always written and only a career
      // with something on it grows the file. Nothing that reads an older record
      // has to learn a new shape.
      this.storage.setItem(this.key, JSON.stringify({
        attempt: record.attempt,
        farmFund: record.farmFund,
        kbSelected: record.kbSelected,
        arcWeek: record.arcWeek,
        employer: record.employer,
        estate: record.estate,
        ...(record.tier === FRESH_CAREER_TIER ? {} : { tier: record.tier }),
        ...(record.title === null ? {} : { title: record.title }),
      }));
      return { ok: true, value: undefined };
    } catch {
      return refuse(
        'The browser would not keep the one thing worth keeping. Storage is '
        + 'full, or this window is not allowed any.',
      );
    }
  }

  /**
   * Reads and LEAVES IT THERE.
   *
   * A carry-over is used once, but "used" means the new week has been written
   * down somewhere that survives the tab - not that a variable in this session
   * has read it. Clearing it here destroyed the only copy of the fund before
   * anything had been saved: a refresh, a crash or a closed laptop in the
   * seconds between boot and the first day boundary came back as attempt one
   * with nothing in the fund, which is the one joke this game cannot afford to
   * get wrong. The caller acknowledges it once the new attempt is durable.
   */
  public peek(): RetryRecord | null {
    let raw: string | null;

    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return null;
    }

    if (raw === null) {
      return null;
    }

    try {
      return parseRetryRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  public clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // A slot that cannot be cleared is a slot that was never written.
    }
  }
}

/** Puts a carried-over week's reading back on screen. */
export function hydrateFromRetry(
  store: AppStateStore,
  record: Readonly<RetryRecord>,
): void {
  store.hydrate(screensFrom(record));
}

/**
 * Letting go of the carry-over, once the week it started is durable.
 *
 * The order is the whole of it, and it is a transaction rather than three
 * lines that happen to be next to each other - which is what it used to be.
 * Boot read the slot and CLEARED it, then built the week; between those two
 * moments the only record of the fund was a value in a variable, so a refresh,
 * a crash or a shut laptop at any point before the first day boundary came
 * back as attempt one with nothing banked. The fund surviving a firing is the
 * one joke this game is built on.
 *
 * So: the new week is written to the save slot FIRST, and the record is only
 * dropped once that write says it worked. A browser with no storage left keeps
 * its carry-over and gets asked again next boot, which is the honest failure.
 *
 * AND IT NEVER MAKES THE NEW WEEK DURABLE BY WRITING OVER AN OLD ONE. That is
 * the third answer and it used to be missing, which made this function the one
 * place in the product that could destroy a saved week without anybody clicking
 * anything. A carry-over is written by `retryWeek`/`switchEmployer`, and both of
 * those CLEAR the slot on their way out, so at a normal boot the slot is empty
 * and nothing here changes. The slot is not empty in exactly one shipped case:
 * the arrival's own write failed (storage full - the honest failure above), the
 * player was told, they carried on playing that week and saved it by hand, and
 * the browser found room by the time they reloaded. Boot then reads the record
 * that is still sitting there, stands a fresh Monday up, and - before this - put
 * that Monday straight over the week they had saved. The record is worth one
 * refused save; somebody's week is not.
 *
 * So a slot that already holds a save is left exactly as it is, and the record
 * is kept rather than dropped, because a carry-over nobody has written down is
 * still a carry-over. The player is told, and Load has their week in it.
 *
 * Answers rather than throws, and says whether the record was let go of, so a
 * caller can be tested on the difference.
 */
export function acknowledgeCarry(
  record: { clear(): void },
  save: () => SaveOutcome,
  slot: { exists(): boolean },
): boolean {
  if (slot.exists()) {
    return false;
  }

  const written = save();

  if (!written.ok) {
    return false;
  }

  record.clear();
  return true;
}
