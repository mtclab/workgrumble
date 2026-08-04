/**
 * The rooms as data, checked the way content is checked: at the boundaries the
 * loader refuses, and against the clock the shell reads them by.
 *
 * The arrival mechanic here is a FILTER, not an event - a message has arrived
 * when the clock has passed its tick - so the tests hold the filter itself:
 * the minute before, the minute of, the day after. Every refusal below is a
 * bug that would look like a quiet room rather than a broken one, which is
 * exactly why it fails the boot instead.
 */

import { describe, expect, it } from 'vitest';

import {
  channelById,
  channelMessageAt,
  type ChannelMessageSlot,
  CHANNELS,
  isChannelId,
  unreadCount,
  unreadMention,
  validateChannelSlots,
} from './channels';
import { COMPANY_IDS } from './company';
import { tickAtMinute } from './hours';
import { channelFeedThrough, channelMessagesOn, WEEK } from './week';

function slot(over: Partial<ChannelMessageSlot> = {}): ChannelMessageSlot {
  return {
    id: 'hub:fixture',
    channel: 'chan:helpdesk',
    author: COMPANY_IDS.owen,
    body: 'A fixture, saying something.',
    minute: 10 * 60,
    ...over,
  };
}

function validate(...slots: readonly ChannelMessageSlot[]): void {
  validateChannelSlots(1, slots, new Set());
}

describe('the rooms', () => {
  it('are named, described, and unique', () => {
    const ids = new Set(CHANNELS.map((channel) => channel.id));

    expect(CHANNELS.length).toBeGreaterThanOrEqual(3);
    expect(ids.size).toBe(CHANNELS.length);

    for (const channel of CHANNELS) {
      expect(channel.name.startsWith('#'), channel.id).toBe(true);
      expect(channel.topic.trim().length, channel.id).toBeGreaterThan(10);
      expect(channelById(channel.id)).toBe(channel);
      expect(isChannelId(channel.id)).toBe(true);
    }

    expect(channelById('chan:shadow-it')).toBeUndefined();
    expect(isChannelId('chan:shadow-it')).toBe(false);
  });

  it('keeps one shipped room empty, which is the honest empty state', () => {
    const posted = new Set(
      WEEK.flatMap((script) => script.channels ?? [])
        .map((message) => message.channel),
    );

    expect(CHANNELS.some((channel) => !posted.has(channel.id))).toBe(true);
  });
});

describe('a message arriving', () => {
  it('arrives on its channel at its tick, and not a minute before', () => {
    const monday = channelMessagesOn(1);
    const welcome = monday.find((message) => message.id === 'hub:welcome');

    expect(welcome).toBeDefined();

    const at = tickAtMinute(1, welcome?.minute ?? 0);

    // The whole arrival mechanism is one inclusive comparison, so both sides
    // of it are held: the tick before is silence, the tick itself is arrival.
    expect(
      channelFeedThrough(at - 1).some((message) => message.id === 'hub:welcome'),
    ).toBe(false);
    expect(
      channelFeedThrough(at).some((message) => message.id === 'hub:welcome'),
    ).toBe(true);
  });

  it('stays in the room on the days after: the rooms keep their history', () => {
    const tuesday = tickAtMinute(2, 9 * 60);
    const feed = channelFeedThrough(tuesday);

    for (const posted of channelMessagesOn(1)) {
      expect(
        feed.some((message) => message.id === posted.id),
        posted.id,
      ).toBe(true);
    }
  });

  it('reads oldest first, and resolves what its slot left implicit', () => {
    const friday = channelFeedThrough(tickAtMinute(5, 17 * 60));
    const ticks = friday.map((message) => message.tick);

    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);

    const resolved = channelMessageAt(1, slot({ minute: 9 * 60 + 5 }));
    expect(resolved.tick).toBe(tickAtMinute(1, 9 * 60 + 5));
    expect(resolved.day).toBe(1);
    expect(resolved.mentionsPlayer).toBe(false);
    expect(resolved.relatedTicket).toBeNull();
    expect(resolved.replyTo).toBeNull();
  });

  it('carries the week\'s own seam content: the mention, the coat, the thread', () => {
    const monday = channelMessagesOn(1);
    const ask = monday.find((message) => message.id === 'hub:gary-account');
    const reply = monday.find((message) => message.id === 'hub:owen-reply');

    expect(ask?.mentionsPlayer).toBe(true);
    expect(ask?.relatedTicket).toBe('ticket:locked-account');
    expect(reply?.replyTo).toBe('hub:gary-account');
    expect(reply?.channel).toBe(ask?.channel);
  });
});

describe('the loader', () => {
  it('takes a well-formed day, thread and all', () => {
    expect(() => validate(
      slot({ id: 'hub:a' }),
      slot({ id: 'hub:b', minute: 10 * 60 + 5, replyTo: 'hub:a' }),
    )).not.toThrow();
  });

  it('refuses a message with no id, no author or nothing to say', () => {
    expect(() => validate(slot({ id: '  ' }))).toThrow('no id');
    expect(() => validate(slot({ author: ' ' }))).toThrow('from nobody');
    expect(() => validate(slot({ body: ' ' }))).toThrow('says nothing');
  });

  it('refuses the same id twice in one week, across days too', () => {
    expect(() => validate(slot({ id: 'hub:twice' }), slot({ id: 'hub:twice' })))
      .toThrow('posted twice');

    // The ledger the ids key is not cleared overnight, so the set is week-wide.
    const seen = new Set<string>();
    validateChannelSlots(1, [slot({ id: 'hub:monday' })], seen);
    expect(() => validateChannelSlots(2, [slot({ id: 'hub:monday' })], seen))
      .toThrow('posted twice');
  });

  it('refuses a room nobody created', () => {
    expect(() => validate(slot({ channel: 'chan:shadow-it' })))
      .toThrow('nobody created');
  });

  it('refuses a minute nobody is at the desk for', () => {
    expect(() => validate(slot({ minute: 8 * 60 + 59 }))).toThrow('outside');
    expect(() => validate(slot({ minute: 17 * 60 + 1 }))).toThrow('outside');
    expect(() => validate(slot({ minute: 9 * 60 }))).not.toThrow();
    expect(() => validate(slot({ minute: 17 * 60 }))).not.toThrow();
  });

  it('refuses a thread drawn under nothing, across rooms, or two levels deep', () => {
    expect(() => validate(slot({ replyTo: 'hub:ghost' })))
      .toThrow('has not been posted');

    expect(() => validate(
      slot({ id: 'hub:a', channel: 'chan:announcements' }),
      slot({ id: 'hub:b', replyTo: 'hub:a' }),
    )).toThrow('across rooms');

    expect(() => validate(
      slot({ id: 'hub:a' }),
      slot({ id: 'hub:b', minute: 10 * 60 + 1, replyTo: 'hub:a' }),
      slot({ id: 'hub:c', minute: 10 * 60 + 2, replyTo: 'hub:b' }),
    )).toThrow('replies to a reply');

    // And an answer cannot land before its question was asked.
    expect(() => validate(
      slot({ id: 'hub:a', minute: 11 * 60 }),
      slot({ id: 'hub:b', minute: 10 * 60, replyTo: 'hub:a' }),
    )).toThrow('before it');
  });

  it('holds the shipped week to all of it', () => {
    // The shipped table booted, which is the assertion - but say so here so
    // a broken sample fails a test named after the content rather than only
    // the module import.
    expect(WEEK.flatMap((script) => script.channels ?? []).length)
      .toBeGreaterThanOrEqual(3);
  });
});

describe('what a badge is worth', () => {
  const feed = [
    channelMessageAt(1, slot({ id: 'hub:a' })),
    channelMessageAt(1, slot({ id: 'hub:b', mentionsPlayer: true })),
    channelMessageAt(1, slot({ id: 'hub:c' })),
  ];

  it('counts what the ledger has not seen, and nothing else', () => {
    expect(unreadCount(feed, [])).toBe(3);
    expect(unreadCount(feed, ['hub:a'])).toBe(2);
    expect(unreadCount(feed, ['hub:a', 'hub:b', 'hub:c'])).toBe(0);
    // A ledger entry for a message not in the pile counts nothing: reading
    // yesterday does not read today.
    expect(unreadCount(feed, ['hub:z'])).toBe(3);
  });

  it('flags a mention only while it is unread: a read @ is a spent @', () => {
    expect(unreadMention(feed, [])).toBe(true);
    expect(unreadMention(feed, ['hub:b'])).toBe(false);
    expect(unreadMention(feed, ['hub:a', 'hub:c'])).toBe(true);
  });
});
