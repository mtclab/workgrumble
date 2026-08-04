/**
 * The same question, arriving everywhere at once.
 *
 * A linked request is one human asking one thing in several places on the same
 * morning - a mail, a one-to-one chat, and a post in a Hubbub room - because
 * the modern office gives them three ways to reach you and no reason to pick
 * one. This module is the DATA that says those three arrivals are ONE request
 * (0.5.0 slice 2, issue #22), and the truth the player is meant to learn from
 * it: the copies are noise, answering the human anywhere satisfies them, and
 * only the TICKET path is worth anything on Friday.
 *
 * The three answers the player has, and what each is worth:
 *
 * - CONVERT it into a real ticket. The correct play: it keeps the human happy
 *   AND it earns the credit, because a ticket is the one intake the review can
 *   see. It costs the minutes of raising it, and it is the conversational-
 *   ticketing countermeasure made playable.
 * - ANSWER the human, here, off the books. They are grateful - a point of
 *   reputation - and there is no ticket, so the work is invisible on the
 *   scorecard exactly as a direct-message favour is. The DM-bypass truth,
 *   generalised to the whole intake surface.
 * - DEFLECT: ask them to raise a ticket themselves. It keeps your time and
 *   costs a little goodwill, and it is a legitimate answer rather than a
 *   punished one.
 *
 * All three RESOLVE the request, and resolving it once quietens every copy -
 * that is the dedupe. Answering the same request in three separate places
 * wastes three lots of minutes for one credit, which is the whole of what the
 * player is here to stop doing.
 *
 * Deliberately NOT here, like the channel seam it rides on: nothing DISPATCHES
 * on arrival. A linked request that the player never touches writes nothing
 * into the world - the copies just sit there as unread noise, which is slice
 * 3's attention question - so a scripted week that ignores it is byte-identical
 * to one from before it existed. Only an explicit convert/answer/deflect writes
 * anything, and that write is the world's own (`request.convert` and its two
 * siblings), keyed on the request id so all three surfaces read one answer.
 */

import { SHIFT_END_MINUTE, SHIFT_START_MINUTE } from './hours';

/* -- the three answers ----------------------------------------------------- */

/**
 * What the player did about a request, in the order of how well it went for
 * them on Friday: convert is the credited one, answer is the grateful-but-
 * invisible one, deflect is the one that costs goodwill and keeps your time.
 */
export const REQUEST_KINDS = ['convert', 'answer', 'deflect'] as const;

export type RequestKind = (typeof REQUEST_KINDS)[number];

export function isRequestKind(value: unknown): value is RequestKind {
  return typeof value === 'string'
    && REQUEST_KINDS.some((kind) => kind === value);
}

/**
 * The gratitude an off-the-books answer buys, in points of reputation.
 *
 * Small, and a tuning knob rather than a law: the point of it is that the human
 * is pleased, not that it moves the needle. It is a reputation-meter blip and
 * emphatically NOT review credit - the review reads how much of the week's
 * ticketed work was closed, and an answer raises no ticket - so this is exactly
 * the "grateful, and invisible on Friday" the DM bypass already teaches, said
 * one register over. Flagged, conservative, re-judged when the week presses it.
 */
export const REQUEST_ANSWER_REPUTATION = 1;

/**
 * And what sending them to the form costs, in the same points.
 *
 * Deflecting is legitimate - it is how a desk protects its own time and it is
 * the honest thing to do with a request that should have been a ticket in the
 * first place - but it is a small social cost, because you have made somebody
 * do the thing they were trying not to. A negative, and it is larger than the
 * answer's gain on purpose: keeping your afternoon is not free, which is what
 * keeps the three answers a real triangle rather than a dominant strategy.
 */
export const REQUEST_DEFLECT_REPUTATION = -2;

/** The meter move each answer is worth, or nought for convert. */
export function requestReputationDelta(kind: RequestKind): number {
  switch (kind) {
    case 'answer':
      return REQUEST_ANSWER_REPUTATION;
    case 'deflect':
      return REQUEST_DEFLECT_REPUTATION;
    default:
      return 0;
  }
}

/* -- the request, as a day's table authors it ------------------------------ */

/**
 * One human asking one thing in several places, and the ticket it becomes if
 * you do the right thing with it.
 *
 * The three copies are surface-flavoured on purpose - the same person phrases a
 * mail, a chat and a room post a little differently, which is exactly how you
 * FAIL to notice at first that they are the same request - but they share an
 * `id`, and the id is the whole mechanic. The Hubbub copy is not authored here:
 * it is a `ChannelMessageSlot` in the day's `channels` column that carries this
 * `request` id, so the room draws it natively and the loader checks that
 * exactly one such message exists.
 */
export interface LinkedRequestSlot {
  /** Unique across the week: what the resolution ledger is keyed on. */
  readonly id: string;
  /** The person node doing the asking, in all three places. */
  readonly reporter: string;
  /** The through-line: what the request is ABOUT, in a few words. */
  readonly subject: string;
  /**
   * The summoned ticket that CONVERT mints. It must be a real ticket nobody's
   * day schedules - a request that becomes a ticket only if you choose to make
   * it one - which the roster gate enforces.
   */
  readonly raises: string;
  /** The minute the mail and the chat copies land, on the clock the player reads. */
  readonly minute: number;
  /** What the mail copy says. */
  readonly mail: string;
  /** What the one-to-one chat copy says. */
  readonly chat: string;
}

/**
 * The same request with its arrival resolved and its answer read: what the
 * shell draws on every surface.
 *
 * Every field is derived - the slot, the graph the reporter's name is on, the
 * ticket title, and the world's own resolution ledger - so there is nothing
 * here to save and a reload rebuilds the identical view. `resolvedAs` is the
 * dedupe made visible: null while the request is live, and one of the three
 * answers once ANY copy has been dealt with.
 */
export interface LinkedRequest {
  readonly id: string;
  readonly reporter: string;
  readonly subject: string;
  readonly raises: string;
  readonly minute: number;
  readonly mail: string;
  readonly chat: string;
  readonly day: number;
  /** null while unresolved; the answer once any surface resolved it. */
  readonly resolvedAs: RequestKind | null;
}

/* -- reading the resolution ledger ----------------------------------------- */

/**
 * The ids the player has resolved, out of the bare-id set the guard reads.
 *
 * The world keeps two records of the same fact for the reason the interruption
 * family does: a SET of bare ids, which `line_in_field` can refuse a second
 * resolution against, and an `id@kind` ledger the surfaces read to say WHICH
 * way it went. This reads the first.
 */
export function resolvedIds(field: unknown): ReadonlySet<string> {
  return new Set(splitLines(field));
}

/** Whether this request has been resolved at all, on the bare-id set. */
export function isRequestResolved(id: string, field: unknown): boolean {
  return resolvedIds(field).has(id);
}

/**
 * How each resolved request went, out of the `id@kind` ledger: `id` -> kind.
 *
 * A line the reader does not understand - a kind this build never wrote, a save
 * carried across a content change - is dropped rather than guessed at, exactly
 * as the dodged-call reader drops an id the schedule no longer holds.
 */
export function resolutionsBy(field: unknown): ReadonlyMap<string, RequestKind> {
  const map = new Map<string, RequestKind>();

  for (const line of splitLines(field)) {
    const at = line.lastIndexOf('@');

    if (at <= 0) {
      continue;
    }

    const id = line.slice(0, at);
    const kind = line.slice(at + 1);

    if (isRequestKind(kind)) {
      map.set(id, kind);
    }
  }

  return map;
}

/** The `id@kind` line the driver stamps and the world appends. */
export function resolutionLine(id: string, kind: RequestKind): string {
  return `${id}@${kind}`;
}

function splitLines(field: unknown): readonly string[] {
  return typeof field === 'string'
    ? field.split('\n').filter((line) => line.length > 0)
    : [];
}

/* -- the loader's half ------------------------------------------------------ */

/** A minute of the day as the clock on the taskbar writes it. */
function clockAt(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:`
    + `${String(minute % 60).padStart(2, '0')}`;
}

/**
 * One day's linked requests, refused at boot rather than debugged in play.
 *
 * Everything here is a bug that would look like a quiet morning rather than a
 * broken one: a request with no id shares the resolution ledger with the empty
 * string, a duplicate id arrives already resolved with its twin, a request from
 * nobody or about nothing renders as a blank card, and one that lands after
 * home time is a card nobody is at the desk to see. `seen` is the week-wide id
 * set, owned by the week loader, because the resolution ledger the ids key is
 * not cleared overnight.
 *
 * The two halves the loader CANNOT check here - that the Hubbub copy exists and
 * that the ticket it raises is a real summoned one - are checked in `week.ts`,
 * where the channels column and the roster are both in scope.
 */
export function validateRequestSlots(
  day: number,
  slots: readonly LinkedRequestSlot[],
  seen: Set<string>,
): void {
  for (const slot of slots) {
    const where = `Day ${String(day)}'s linked request "${slot.id}"`;

    if (slot.id.trim().length === 0) {
      throw new Error(
        `Day ${String(day)} carries a linked request with no id, and the `
        + 'resolution ledger has nothing to hold it by.',
      );
    }

    if (seen.has(slot.id)) {
      throw new Error(
        `"${slot.id}" is asked twice in one week. Two requests with one id `
        + 'share the record of whether they were resolved, so the second '
        + 'arrives already dealt with.',
      );
    }

    if (slot.reporter.trim().length === 0) {
      throw new Error(`${where} is from nobody.`);
    }

    if (slot.subject.trim().length === 0) {
      throw new Error(`${where} is about nothing.`);
    }

    if (slot.raises.trim().length === 0) {
      throw new Error(`${where} becomes no ticket when you convert it.`);
    }

    for (const [surface, body] of [
      ['mail', slot.mail],
      ['chat', slot.chat],
    ] as const) {
      if (body.trim().length === 0) {
        throw new Error(
          `${where} says nothing in ${surface}. An empty copy is a surface `
          + 'the player cannot tell is the same request as the others.',
        );
      }
    }

    if (slot.minute < SHIFT_START_MINUTE || slot.minute > SHIFT_END_MINUTE) {
      throw new Error(
        `${where} arrives at ${clockAt(slot.minute)}, which is outside the `
        + 'hours anybody is at the desk to read it.',
      );
    }

    seen.add(slot.id);
  }
}
