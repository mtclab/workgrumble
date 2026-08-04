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
} from '../../world/channels';
import { COMPANY_IDS } from '../../world/company';
import {
  channelFeed,
  channelRows,
  readAfterSeeing,
  threadBlocks,
  totalUnread,
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
