/**
 * Hubbub, as data: the named rooms and the messages that arrive in them.
 *
 * Hubbub is the channel client the company rolled out on the Monday. Nobody
 * asked for it, which is the joke and the truth (0.5.0 slice 1, issue #22) -
 * and everything about it is a table for the same reason the week is one.
 * Which requests arrive on which channel is CONTENT, and content that lives in
 * a window is content nobody can validate, schedule or test without booting
 * the window.
 *
 * This module is the intake seam the rest of the version builds on. A channel
 * message has a channel, an author, a body, an arrival minute, and three
 * optional facts: that it names the player, that it is about a ticket, and
 * that it is a reply inside an existing thread. Slice 2 makes one authored
 * request arrive on several surfaces at once - which is a mail row, a chat
 * beat and one of THESE sharing a `relatedTicket` - and slice 3 prices the
 * unread pile. Neither of those changes this shape; both of them read it.
 *
 * Deliberately NOT here, and not by oversight:
 *
 * - Nothing dispatches. A message arriving in a room writes nothing into the
 *   graph, so a scripted week that never opens the window produces the same
 *   world, byte for byte, as it did before the app existed. Arrival is a
 *   READING - a message has arrived when the clock has passed its tick - and
 *   the golden weeks stand on that.
 * - Nothing reads the presence dot. A room is not a phone: a message lands on
 *   a red dot exactly as it lands on a green one, and whether a channel-source
 *   arrival should slide like a chat-source one is slice 3's attention
 *   question, decided where the meters are.
 *
 * Nothing here touches the DOM or the time of day; the shell asks with a tick.
 */

import { SHIFT_END_MINUTE, SHIFT_START_MINUTE, tickAtMinute } from './hours';

/* -- the rooms ------------------------------------------------------------- */

/**
 * One named room, and the sentence under its name.
 *
 * The topic is content rather than chrome: it is where the register lives -
 * enterprise chat that is very excited about itself - and a room whose topic
 * the window invented would be a room three surfaces could describe three
 * ways.
 */
export interface ChannelDef {
  readonly id: string;
  /** What the sidebar calls it, hash and all. */
  readonly name: string;
  /** The line under the name, in the product's own breathless voice. */
  readonly topic: string;
}

/**
 * The rooms the rollout created, in sidebar order.
 *
 * Three, and each one exists for a reason the version needs: #announcements is
 * the company talking to itself, #helpdesk is where slice 2's duplicate
 * arrivals will land, and #water-cooler is the room with nothing in it - the
 * empty state is a state the window has to be honest about, so the shipped
 * data keeps one room empty on purpose.
 */
export const CHANNELS: readonly ChannelDef[] = Object.freeze([
  Object.freeze({
    id: 'chan:announcements',
    name: '#announcements',
    topic: 'Wins, launches and learnings. This channel is your single source '
      + 'of truth!',
  }),
  Object.freeze({
    id: 'chan:helpdesk',
    name: '#helpdesk',
    topic: 'Got an IT question? Just drop it here - so much faster than a '
      + 'ticket!',
  }),
  Object.freeze({
    id: 'chan:water-cooler',
    name: '#water-cooler',
    topic: 'The fun one!! Memes, milestones and Monday motivation.',
  }),
]);

export function channelById(id: string): ChannelDef | undefined {
  return CHANNELS.find((channel) => channel.id === id);
}

export function isChannelId(value: string): boolean {
  return channelById(value) !== undefined;
}

/* -- the messages ---------------------------------------------------------- */

/**
 * One message, as a day's table authors it. THE SEAM.
 *
 * The optional fields are the hooks the later slices hang off, and they are on
 * the message rather than on any mechanism because the message is the unit
 * that travels:
 *
 * - `mentionsPlayer` is the @ - slice 1 flags it on the room and on the
 *   message, slice 3 prices it.
 * - `relatedTicket` is what makes a room an intake surface rather than a
 *   noticeboard: a message about a ticket is the same request wearing a third
 *   coat, which is slice 2's whole mechanic.
 * - `replyTo` is the thread: it names an EARLIER message in the same room on
 *   the same day, and the window draws it indented under that one. One level
 *   only - a reply to a reply is refused, because a channel client's threads
 *   are one level deep and so is the joke about them.
 */
export interface ChannelMessageSlot {
  /** Unique across the week: what the read ledger is keyed on. */
  readonly id: string;
  /** The room it lands in. One of `CHANNELS`. */
  readonly channel: string;
  /** The person node doing the posting. */
  readonly author: string;
  readonly body: string;
  /** Minute of the day, on the clock the player reads: 585 is 09:45. */
  readonly minute: number;
  /** Whether it names the player, which is what a badge will not shut up about. */
  readonly mentionsPlayer?: boolean;
  /** The ticket it is about, for a message that is a request in a third coat. */
  readonly relatedTicket?: string;
  /**
   * The linked request this message is the Hubbub copy OF, for a request that
   * arrived here as well as in the inbox and the chat (0.5.0 slice 2).
   *
   * It is what turns a room post into an intake surface the player can act on:
   * a message carrying it gets the convert / answer / deflect bar, and
   * resolving it here quietens the copies everywhere else. The loader checks
   * that the id names a real linked request that day, and that each request has
   * exactly one such copy.
   */
  readonly request?: string;
  /** The root message this answers, for a message living inside a thread. */
  readonly replyTo?: string;
}

/**
 * The same message with its arrival resolved: which day dealt it and the tick
 * the clock has to pass before anybody has seen it. This is what the shell
 * reads - the slot is how a day says it, this is what it means.
 */
export interface ChannelMessage {
  readonly id: string;
  readonly channel: string;
  readonly author: string;
  readonly body: string;
  readonly mentionsPlayer: boolean;
  readonly relatedTicket: string | null;
  /** The linked request this is the Hubbub copy of, or null. */
  readonly request: string | null;
  readonly replyTo: string | null;
  readonly day: number;
  /** The world tick it arrives on. Arrived means `tick <= now`, inclusive. */
  readonly tick: number;
}

/** One reader for what a slot means on its day, so every surface agrees. */
export function channelMessageAt(
  day: number,
  slot: Readonly<ChannelMessageSlot>,
): ChannelMessage {
  return {
    id: slot.id,
    channel: slot.channel,
    author: slot.author,
    body: slot.body,
    mentionsPlayer: slot.mentionsPlayer ?? false,
    relatedTicket: slot.relatedTicket ?? null,
    request: slot.request ?? null,
    replyTo: slot.replyTo ?? null,
    day,
    tick: tickAtMinute(day, slot.minute),
  };
}

/* -- the loader's half ------------------------------------------------------ */

/** A minute of the day as the clock on the taskbar writes it. */
function clockAt(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:`
    + `${String(minute % 60).padStart(2, '0')}`;
}

/**
 * One day's channel column, refused at boot rather than debugged in play.
 *
 * Everything here is a bug that would look like a quiet room rather than a
 * broken one: a message in a room nobody created never renders anywhere, a
 * duplicate id shares the read ledger with its twin and arrives already read,
 * a reply to a message that has not arrived yet is a thread drawn under
 * nothing. `seen` is the week-wide id set, owned by the week loader, because
 * the read ledger the ids key is not cleared overnight.
 */
export function validateChannelSlots(
  day: number,
  slots: readonly ChannelMessageSlot[],
  seen: Set<string>,
): void {
  const today = new Map<string, ChannelMessageSlot>();

  for (const slot of slots) {
    const where = `Day ${String(day)}'s channel message "${slot.id}"`;

    if (slot.id.trim().length === 0) {
      throw new Error(
        `Day ${String(day)} posts a channel message with no id, and the read `
        + 'ledger has nothing to hold it by.',
      );
    }

    if (seen.has(slot.id)) {
      throw new Error(
        `"${slot.id}" is posted twice in one week. Two messages with one id `
        + 'share the record of whether they were read, so the second arrives '
        + 'already read.',
      );
    }

    if (!isChannelId(slot.channel)) {
      throw new Error(
        `${where} lands in "${slot.channel}", which is a room nobody created. `
        + 'A message in no room renders nowhere, which is a beat that '
        + 'silently does not happen.',
      );
    }

    if (slot.author.trim().length === 0) {
      throw new Error(`${where} is from nobody.`);
    }

    if (slot.body.trim().length === 0) {
      throw new Error(
        `${where} says nothing. An empty message is a badge with no content `
        + 'behind it, which is a charge for reading nothing.',
      );
    }

    if (slot.minute < SHIFT_START_MINUTE || slot.minute > SHIFT_END_MINUTE) {
      throw new Error(
        `${where} arrives at ${clockAt(slot.minute)}, which is outside the `
        + 'hours anybody is at the desk to read it.',
      );
    }

    if (slot.replyTo !== undefined) {
      const root = today.get(slot.replyTo);

      if (root === undefined) {
        throw new Error(
          `${where} replies to "${slot.replyTo}", which has not been posted `
          + 'earlier that day. A thread under a message nobody has seen is a '
          + 'thread drawn under nothing.',
        );
      }

      if (root.channel !== slot.channel) {
        throw new Error(
          `${where} replies across rooms, from "${slot.channel}" to `
          + `"${root.channel}". A thread lives in the room it started in.`,
        );
      }

      if (root.replyTo !== undefined) {
        throw new Error(
          `${where} replies to a reply. Threads here are one level deep - `
          + 'the root and the pile under it - and so is the joke about them.',
        );
      }

      if (slot.minute < root.minute) {
        throw new Error(
          `${where} answers "${root.id}" ${clockAt(slot.minute)} before it `
          + `was posted at ${clockAt(root.minute)}.`,
        );
      }
    }

    seen.add(slot.id);
    today.set(slot.id, slot);
  }
}

/* -- what a badge is worth -------------------------------------------------- */

/** How many of these messages the read ledger has not seen. */
export function unreadCount(
  messages: readonly ChannelMessage[],
  read: readonly string[],
): number {
  return messages.filter((message) => !read.includes(message.id)).length;
}

/** Whether anything UNREAD in here names the player. A read @ is a spent @. */
export function unreadMention(
  messages: readonly ChannelMessage[],
  read: readonly string[],
): boolean {
  return messages.some(
    (message) => message.mentionsPlayer && !read.includes(message.id),
  );
}
