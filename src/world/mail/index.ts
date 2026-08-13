import type { ReadOnlyGraphView } from '../../engine-api';
import { isEmployerId } from '../employers';
import { EMPLOYER_ARC } from '../pressure';
import { MAIL_THREADS } from './threads';
import type { MailContent, MailThread } from './types';

export type {
  MailArrival,
  MailContent,
  MailMessage,
  MailThread,
} from './types';

/**
 * Load-time content gate. Mail is harmless right up until a thread has no
 * messages, two messages claim the same id, or a stamp is a negative tick the
 * shift clock cannot render - at which point the inbox throws in a player's
 * face instead of in a test.
 */
export function validateMailThreads(
  threads: readonly MailThread[],
): readonly MailThread[] {
  const threadIds = new Set<string>();
  const messageIds = new Set<string>();

  for (const thread of threads) {
    if (thread.id.length === 0) {
      throw new Error('Mail thread id must be a non-empty string.');
    }

    if (threadIds.has(thread.id)) {
      throw new Error(`Duplicate mail thread "${thread.id}".`);
    }

    threadIds.add(thread.id);

    /**
     * The world it was written for, checked against the closed set of shops
     * this build ships.
     *
     * A thread whose employer nobody ships would be invisible everywhere,
     * which is the quiet half of the same defect: a typo in an id would delete
     * a thread from the game and nothing would say so. Refused at load, in the
     * same breath as a thread with no subject.
     */
    const addressee: string = thread.employer;

    if (!isEmployerId(addressee)) {
      throw new Error(
        `Thread "${thread.id}" is addressed to "${addressee}", which is not an `
        + 'employer this build ships. Mail belongs to one building; a thread '
        + 'with no building is a thread nobody can be sent.',
      );
    }

    if (thread.subject.trim().length === 0) {
      throw new Error(`Thread "${thread.id}" has no subject.`);
    }

    if (thread.messages.length === 0) {
      throw new Error(`Thread "${thread.id}" has no messages.`);
    }

    let previousTick = -1;

    for (const message of thread.messages) {
      if (messageIds.has(message.id)) {
        throw new Error(`Duplicate mail message "${message.id}".`);
      }

      messageIds.add(message.id);

      if (message.from.length === 0) {
        throw new Error(`Message "${message.id}" has no sender.`);
      }

      if (!Number.isSafeInteger(message.tick) || message.tick < 0) {
        throw new Error(
          `Message "${message.id}" is stamped outside the shift clock.`,
        );
      }

      if (message.tick < previousTick) {
        throw new Error(
          `Thread "${thread.id}" runs backwards at "${message.id}".`,
        );
      }

      previousTick = message.tick;

      if (message.body.length === 0
        || message.body.some((paragraph) => paragraph.trim().length === 0)) {
        throw new Error(`Message "${message.id}" has an empty paragraph.`);
      }
    }
  }

  return Object.freeze([...threads]);
}

export const WORLD_MAIL: readonly MailThread[] = assertPressureSignals(
  validateMailThreads(MAIL_THREADS),
);

/**
 * The second half of the four-beat contract, checked where content refers to
 * content: a season whose announcement nobody wrote.
 *
 * Two of the four beats ARE mail - the weather and the notice - and the
 * contract says an event may not change an outcome unless each beat left
 * something the player could read. A season naming a thread this inbox does
 * not hold would satisfy the calendar and fail the player, silently, in the
 * one week it mattered. So it is a boot failure instead, exactly like a day
 * that schedules a ticket nobody wrote.
 */
export function assertPressureSignals(
  threads: readonly MailThread[],
): readonly MailThread[] {
  const known = new Set(threads.map((thread) => thread.id));

  for (const season of EMPLOYER_ARC.seasons) {
    for (const id of [season.weatherThread, season.noticeThread]) {
      if (!known.has(id)) {
        throw new Error(
          `"${season.id}" announces itself as "${id}", which nobody wrote. `
          + 'Four beats or no effect, and a beat with nothing to read is a '
          + 'beat that did not fire.',
        );
      }
    }
  }

  return threads;
}

export function findMailThread(id: string): MailThread | undefined {
  return WORLD_MAIL.find((thread) => thread.id === id);
}

/**
 * When a gated thread arrived, or null while it has not.
 *
 * The field either holds a tick or it does not exist, and "does not exist" is
 * the whole answer: an inbox that shows a bounce-back before second line have
 * bounced anything is telling the player their future.
 */
export function arrivedAt(
  thread: Readonly<MailContent>,
  graph: ReadOnlyGraphView,
): number | null {
  if (thread.arrival === undefined) {
    return 0;
  }

  const value = graph.getField(thread.arrival.node, thread.arrival.field);

  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/** Every thread written for one shop, arrived or not. */
export function mailFor(employer: string): readonly MailThread[] {
  return WORLD_MAIL.filter((thread) => thread.employer === employer);
}

/**
 * The threads that exist right now, in THIS building: the ones this employer's
 * fiction wrote, gated ones included once the world says they landed.
 *
 * Two questions, and they are deliberately different ones. WHOSE mail this is
 * is a fact about the content and is answered by the content; WHETHER it has
 * happened yet is a fact about the world and is answered by the graph. Folding
 * the first into the second - an arrival gate pointed at some per-shop anchor -
 * would have made "does this thread belong here" and "has it arrived" the same
 * field, and a thread that belongs here is not the same claim as a thread that
 * has happened.
 *
 * The employer is handed in rather than read off the graph because an
 * employer's identity is deliberately NOT a graph field (a field on the player
 * node would move the probation goldens); the session knows which shop it stood
 * up, and every surface that draws an inbox already carries it.
 */
export function visibleMail(
  graph: ReadOnlyGraphView,
  employer: string,
): readonly MailThread[] {
  return mailFor(employer)
    .filter((thread) => arrivedAt(thread, graph) !== null);
}

/** When each message in a thread landed, absolute, gate or no gate. */
export function messageTick(
  thread: Readonly<MailContent>,
  offset: number,
  graph: ReadOnlyGraphView,
): number {
  return (arrivedAt(thread, graph) ?? 0) + offset;
}

/** When a thread last saw traffic - what the inbox list sorts and stamps by. */
export function latestTick(
  thread: Readonly<MailContent>,
  graph: ReadOnlyGraphView,
): number {
  return thread.messages.reduce(
    (latest, message) => Math.max(latest, messageTick(thread, message.tick, graph)),
    0,
  );
}

/** `mail/queue-nag` -> `queue-nag`, for element ids and test hooks. */
export function mailKey(id: string): string {
  return id.startsWith('mail/') ? id.slice('mail/'.length) : id;
}
