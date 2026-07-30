import { MAIL_THREADS } from './threads';
import type { MailThread } from './types';

export type { MailMessage, MailThread } from './types';

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

export const WORLD_MAIL: readonly MailThread[] = validateMailThreads(
  MAIL_THREADS,
);

export function findMailThread(id: string): MailThread | undefined {
  return WORLD_MAIL.find((thread) => thread.id === id);
}

/** When a thread last saw traffic - what the inbox list sorts and stamps by. */
export function latestTick(thread: Readonly<MailThread>): number {
  return thread.messages.reduce(
    (latest, message) => Math.max(latest, message.tick),
    0,
  );
}

/** `mail/queue-nag` -> `queue-nag`, for element ids and test hooks. */
export function mailKey(id: string): string {
  return id.startsWith('mail/') ? id.slice('mail/'.length) : id;
}
