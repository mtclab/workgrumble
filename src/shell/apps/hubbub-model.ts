/**
 * Hubbub's window, modelled before it is drawn.
 *
 * Same rule as every other list in this shell: the row is data first, so the
 * badge arithmetic, the mention flag and the thread grouping are functions a
 * node test can hold down without booting a DOM - and so a repaint driven by
 * something happening elsewhere in the building can be seen for what it
 * usually is, every one of these values unchanged.
 *
 * Everything here reads the world module's `ChannelMessage` (the 0.5.0 intake
 * seam) plus the shell-owned read ledger, and nothing else.
 */

import {
  type ChannelDef,
  type ChannelMessage,
  unreadCount,
  unreadMention,
} from '../../world/channels';
import type { WindowsState } from '../app-state';

/** One room in the sidebar: the name, the noise, and whether it is up. */
export interface ChannelRowModel {
  readonly id: string;
  readonly name: string;
  readonly topic: string;
  /** Arrived and never had on screen. What the badge says. */
  readonly unread: number;
  /** Whether anything unread in here names the player. */
  readonly mention: boolean;
  readonly selected: boolean;
}

/** The messages of one room, oldest first. */
export function channelFeed(
  feed: readonly ChannelMessage[],
  channelId: string,
): readonly ChannelMessage[] {
  return feed.filter((message) => message.channel === channelId);
}

/** The sidebar, one row per room, in the order the rollout created them. */
export function channelRows(
  channels: readonly ChannelDef[],
  feed: readonly ChannelMessage[],
  read: readonly string[],
  selectedId: string | null,
): readonly ChannelRowModel[] {
  return channels.map((channel) => {
    const inRoom = channelFeed(feed, channel.id);

    return {
      id: channel.id,
      name: channel.name,
      topic: channel.topic,
      unread: unreadCount(inRoom, read),
      mention: unreadMention(inRoom, read),
      selected: channel.id === selectedId,
    };
  });
}

/**
 * One thread: the root message and the pile under it.
 *
 * One level deep by construction - the loader refuses a reply to a reply -
 * so this is the whole shape, not the first page of one.
 */
export interface ThreadBlock {
  readonly root: ChannelMessage;
  readonly replies: readonly ChannelMessage[];
}

/**
 * A room's arrived messages, grouped into threads, oldest root first.
 *
 * Replies ride under their root in arrival order. A reply whose root has not
 * arrived cannot happen through the loader (a reply is later than its root by
 * validation, and both are on one day) - but a hand-fed list is still
 * answered honestly rather than dropped: an orphan renders as a root, because
 * a message the player cannot see is worse than one drawn unindented.
 */
export function threadBlocks(
  messages: readonly ChannelMessage[],
): readonly ThreadBlock[] {
  const roots = messages.filter((message) => (
    message.replyTo === null
    || !messages.some((candidate) => candidate.id === message.replyTo)
  ));

  return roots.map((root) => ({
    root,
    replies: messages.filter((message) => message.replyTo === root.id),
  }));
}

/**
 * The ledger after a room's arrived messages have been on screen.
 *
 * A union rather than an append: reading a room twice must not grow the save
 * by a copy of the room. Answers the SAME array when nothing is new, so a
 * caller can skip the write - and the store write is what a badge clearing
 * hangs off, which is why this is a function and not two lines in the window.
 */
export function readAfterSeeing(
  read: readonly string[],
  seen: readonly ChannelMessage[],
): readonly string[] {
  const unseen = seen.filter((message) => !read.includes(message.id));

  return unseen.length === 0
    ? read
    : [...read, ...unseen.map((message) => message.id)];
}

/**
 * Whether this app's window is genuinely on the player's screen: open, and NOT
 * minimized.
 *
 * Minimizing does not unmount a window - it hides a still-mounted one, which
 * goes on rendering on every clock tick behind the scenes. A window nobody can
 * see is not a window a message has been read in, so the read ledger has to ask
 * this before it records anything as seen. Absent from the open set (closed, or
 * never opened) is "not on screen" too: the same courtesy an unmounted app gets.
 */
export function windowOnScreen(
  windows: Readonly<WindowsState>,
  appId: string,
): boolean {
  const own = windows.open.find((entry) => entry.appId === appId);

  return own !== undefined && !own.minimized;
}

/**
 * The ledger after a room's arrived messages have been on screen - marking them
 * read ONLY when the window genuinely WAS on screen.
 *
 * This is the seam where "read = was actually on screen" (the invariant slice 1
 * stated) becomes true. The pane paints on every tick whether or not the player
 * can see it, so a message that lands in the selected room while Hubbub is
 * minimized would be marked read by a window nobody is looking at - clearing its
 * badge and, worse, clearing it before the meter tick that would have billed it
 * for attention, so a minimized window would read the sprawl away for free. When
 * the window is off screen this answers the ledger UNCHANGED: the arrival stays
 * unread, the badge keeps counting it, and the attention drip still bills it,
 * until the player restores the window and the next paint actually sees it.
 */
export function readAfterOnScreen(
  read: readonly string[],
  seen: readonly ChannelMessage[],
  windows: Readonly<WindowsState>,
  appId: string,
): readonly string[] {
  return windowOnScreen(windows, appId)
    ? readAfterSeeing(read, seen)
    : read;
}

/** The toolbar's arithmetic: every room's unread, added up. */
export function totalUnread(
  feed: readonly ChannelMessage[],
  read: readonly string[],
): number {
  return unreadCount(feed, read);
}
