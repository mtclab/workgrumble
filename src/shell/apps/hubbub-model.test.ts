/**
 * The window's arithmetic, held without a DOM: the sidebar badges, the thread
 * grouping, and the read ledger's one write.
 *
 * The journey these protect is the slice gate's: a message arrives on its
 * room, the room's badge says so (and says the @ louder), opening the room
 * clears it, and reading it twice does not grow the save. The render half of
 * that journey lives in `e2e/hubbub.spec.ts` on the built artifact.
 */

import { describe, expect, it } from 'vitest';

import {
  channelMessageAt,
  type ChannelMessageSlot,
  CHANNELS,
  unreadIds,
} from '../../world/channels';
import { COMPANY_IDS } from '../../world/company';
import type { WindowsState } from '../app-state';
import {
  channelFeed,
  channelRows,
  readAfterOnScreen,
  readAfterSeeing,
  threadBlocks,
  totalUnread,
  windowOnScreen,
} from './hubbub-model';

function message(over: Partial<ChannelMessageSlot> = {}) {
  return channelMessageAt(1, {
    id: 'hub:fixture',
    channel: 'chan:helpdesk',
    author: COMPANY_IDS.owen,
    body: 'A fixture, saying something.',
    minute: 10 * 60,
    ...over,
  });
}

const FEED = [
  message({ id: 'hub:hello', channel: 'chan:announcements', minute: 9 * 60 + 5 }),
  message({ id: 'hub:ask', minute: 9 * 60 + 40, mentionsPlayer: true }),
  message({ id: 'hub:answer', minute: 9 * 60 + 48, replyTo: 'hub:ask' }),
];

describe('the sidebar', () => {
  it('badges each room with its own unread, and flags the @', () => {
    const rows = channelRows(CHANNELS, FEED, [], 'chan:helpdesk');

    expect(rows.map((row) => row.id)).toEqual(CHANNELS.map((c) => c.id));

    const announcements = rows.find((row) => row.id === 'chan:announcements');
    const helpdesk = rows.find((row) => row.id === 'chan:helpdesk');
    const empty = rows.find((row) => row.id === 'chan:water-cooler');

    expect(announcements?.unread).toBe(1);
    expect(announcements?.mention).toBe(false);
    expect(helpdesk?.unread).toBe(2);
    expect(helpdesk?.mention).toBe(true);
    expect(helpdesk?.selected).toBe(true);
    expect(empty?.unread).toBe(0);
    expect(empty?.mention).toBe(false);
  });

  it('clears the badge - and the @ - once the room has been on screen', () => {
    const read = readAfterSeeing([], channelFeed(FEED, 'chan:helpdesk'));
    const rows = channelRows(CHANNELS, FEED, read, null);
    const helpdesk = rows.find((row) => row.id === 'chan:helpdesk');

    expect(helpdesk?.unread).toBe(0);
    expect(helpdesk?.mention).toBe(false);
    // The other room's badge is not this room's business.
    expect(rows.find((row) => row.id === 'chan:announcements')?.unread).toBe(1);
    expect(totalUnread(FEED, read)).toBe(1);
  });
});

describe('the threads', () => {
  it('groups replies under their root, one level deep, oldest first', () => {
    const blocks = threadBlocks(channelFeed(FEED, 'chan:helpdesk'));

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.root.id).toBe('hub:ask');
    expect(blocks[0]?.replies.map((reply) => reply.id)).toEqual(['hub:answer']);
  });

  it('keeps rooms apart: a feed filtered to a room holds only that room', () => {
    expect(channelFeed(FEED, 'chan:announcements').map((m) => m.id))
      .toEqual(['hub:hello']);
    expect(channelFeed(FEED, 'chan:water-cooler')).toEqual([]);
  });

  it('renders an orphan reply as a root rather than dropping it', () => {
    const orphan = message({ id: 'hub:lost', replyTo: 'hub:never-arrived' });
    const blocks = threadBlocks([orphan]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.root.id).toBe('hub:lost');
  });
});

describe('the ledger\'s one write', () => {
  it('unions without duplicating, and answers the same array when nothing is new', () => {
    const seen = channelFeed(FEED, 'chan:helpdesk');
    const once = readAfterSeeing([], seen);

    expect(once).toEqual(['hub:ask', 'hub:answer']);

    // Reading the room again must not grow the save by a copy of the room -
    // and the SAME array back is what lets the window skip the write.
    const twice = readAfterSeeing(once, seen);
    expect(twice).toBe(once);

    const more = readAfterSeeing(once, FEED);
    expect(more).toEqual(['hub:ask', 'hub:answer', 'hub:hello']);
  });
});

/**
 * The bug this pins: the pane paints on every clock tick whether or not the
 * player can see it, so a minimized Hubbub would go on marking arrivals read -
 * clearing badges the player never looked at, and clearing them BEFORE the
 * meter tick that bills the sprawl, reading the attention cost away for free.
 *
 * The goal, not the call: not "the write was skipped" but "the message is still
 * unread and still billable while the window is hidden, and becomes read the
 * moment it is on screen again". `unreadIds(feed, read)` is exactly what the
 * driver hands the attention drip (`scripted-week.test.ts` wires it that way),
 * so asserting on it is asserting on the charge.
 *
 * Teeth: revert `readAfterOnScreen` to ignore the window list (return
 * `readAfterSeeing(read, seen)` unconditionally) and the minimized leg reds -
 * the arrival goes read, the badge clears, and `unreadIds` empties.
 */
describe('a minimized Hubbub does not read the room it cannot show', () => {
  const helpdesk = channelFeed(FEED, 'chan:helpdesk');
  const helpdeskIds = helpdesk.map((message) => message.id);
  const focused: WindowsState = {
    open: [{ appId: 'hubbub', minimized: false }],
    focusedId: 'hubbub',
  };
  const minimized: WindowsState = {
    open: [{ appId: 'hubbub', minimized: true }],
    focusedId: null,
  };
  const closed: WindowsState = { open: [], focusedId: null };

  it('knows on screen from open-and-not-minimized, closed, and absent', () => {
    expect(windowOnScreen(focused, 'hubbub')).toBe(true);
    expect(windowOnScreen(minimized, 'hubbub')).toBe(false);
    expect(windowOnScreen(closed, 'hubbub')).toBe(false);
    // Another app being up is not this window being up.
    expect(windowOnScreen(
      { open: [{ appId: 'mail', minimized: false }], focusedId: 'mail' },
      'hubbub',
    )).toBe(false);
  });

  it('leaves the arrival unread and billable while minimized, read once shown', () => {
    // The tick that lands the room's messages while the window is minimized.
    let read: readonly string[] = [];
    read = readAfterOnScreen(read, helpdesk, minimized, 'hubbub');

    // Nothing was read - the badge still counts them, and the drip still sees
    // the whole pile unread, so the sprawl is charged rather than dodged.
    expect(read).toEqual([]);
    expect(unreadIds(helpdesk, read)).toEqual(helpdeskIds);

    // The player restores the window. The very next paint - same messages, same
    // selected room - now actually sees them, and only now are they read.
    read = readAfterOnScreen(read, helpdesk, focused, 'hubbub');
    expect(read).toEqual(helpdeskIds);
    expect(unreadIds(helpdesk, read)).toEqual([]);
  });
});
