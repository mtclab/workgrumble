import { describe, expect, it } from 'vitest';

import { formatSimTime } from '../../shell/clock-format';
import { COMPANY_IDS } from '../company';
import { createWorldSession } from '../session';
import {
  arrivedAt,
  findMailThread,
  latestTick,
  mailKey,
  messageTick,
  validateMailThreads,
  visibleMail,
  WORLD_MAIL,
} from './index';
import type { MailThread } from './types';

function thread(overrides: Partial<MailThread> = {}): MailThread {
  return {
    id: 'mail/fixture',
    subject: 'Fixture',
    messages: [
      {
        id: 'mail/fixture#1',
        from: COMPANY_IDS.boss,
        tick: 0,
        body: ['A message.'],
      },
    ],
    ...overrides,
  };
}

describe('mail content gate', () => {
  it('accepts the shipped inbox', () => {
    expect(validateMailThreads(WORLD_MAIL)).toHaveLength(WORLD_MAIL.length);
  });

  it('refuses duplicates and empty threads', () => {
    expect(() => validateMailThreads([thread(), thread()]))
      .toThrow('Duplicate mail thread');
    expect(() => validateMailThreads([thread({ messages: [] })]))
      .toThrow('no messages');
    expect(() => validateMailThreads([thread({ subject: '  ' })]))
      .toThrow('no subject');
  });

  it('refuses a stamp the shift clock cannot render', () => {
    expect(() => validateMailThreads([
      thread({
        messages: [
          {
            id: 'mail/fixture#1',
            from: COMPANY_IDS.boss,
            tick: -1,
            body: ['A message.'],
          },
        ],
      }),
    ])).toThrow('outside the shift clock');
  });

  it('refuses a thread that runs backwards', () => {
    expect(() => validateMailThreads([
      thread({
        messages: [
          {
            id: 'mail/fixture#1',
            from: COMPANY_IDS.boss,
            tick: 30,
            body: ['Later.'],
          },
          {
            id: 'mail/fixture#2',
            from: COMPANY_IDS.boss,
            tick: 5,
            body: ['Earlier.'],
          },
        ],
      }),
    ])).toThrow('runs backwards');
  });

  it('refuses a message with nothing in it', () => {
    expect(() => validateMailThreads([
      thread({
        messages: [
          {
            id: 'mail/fixture#1',
            from: COMPANY_IDS.boss,
            tick: 0,
            body: ['  '],
          },
        ],
      }),
    ])).toThrow('empty paragraph');
  });
});

describe('shipped inbox', () => {
  it('ships the onboarding thread and the boss nag', () => {
    expect(findMailThread('mail/onboarding')).toBeDefined();
    expect(findMailThread('mail/queue-nag')?.messages[0]?.from)
      .toBe(COMPANY_IDS.boss);
    expect(mailKey('mail/queue-nag')).toBe('queue-nag');
  });

  it('is sent by people who exist in the company', () => {
    const session = createWorldSession();

    for (const entry of WORLD_MAIL) {
      for (const message of entry.messages) {
        expect(session.engine.graph.getNode(message.from)?.kind).toBe('person');
      }
    }
  });

  it('stamps every message at a time the shift clock can show', () => {
    const { engine } = createWorldSession();

    for (const entry of WORLD_MAIL) {
      for (const message of entry.messages) {
        expect(formatSimTime(message.tick).time).toMatch(/^\d{2}:\d{2}$/);
      }
    }

    expect(latestTick({
      id: 'mail/x',
      subject: 'x',
      messages: [
        { id: 'a', from: COMPANY_IDS.boss, tick: 3, body: ['a'] },
        { id: 'b', from: COMPANY_IDS.boss, tick: 40, body: ['b'] },
      ],
    }, engine.graph)).toBe(40);
  });

  /**
   * A consequence cannot be stamped by a content file, because nobody knows
   * when the player will earn it. Until the field says otherwise the thread
   * does not exist - an inbox that shows a bounce-back before anything has
   * bounced is telling the player their future.
   */
  it('hides a gated thread until the world says it arrived, then stamps it', () => {
    const { engine } = createWorldSession();
    const gated: MailThread = {
      id: 'mail/gated',
      subject: 'Sent back',
      arrival: { node: 'ticket:fan-noise', field: 'handoff_settled_at' },
      messages: [
        { id: 'mail/gated#1', from: COMPANY_IDS.boss, tick: 0, body: ['No.'] },
      ],
    };

    expect(arrivedAt(gated, engine.graph)).toBeNull();
    expect(visibleMail(engine.graph).some((entry) => entry.arrival !== undefined))
      .toBe(false);

    // A thin handoff, followed by second line getting round to it.
    engine.dispatch('ticket.escalate', COMPANY_IDS.player, 'ticket:fan-noise', {
      reported: '',
      tried: '',
    });
    engine.advance(30);
    engine.dispatch(
      'ticket.bounce_handoff',
      COMPANY_IDS.player,
      'ticket:fan-noise',
      {},
    );

    const landed = arrivedAt(gated, engine.graph);
    expect(landed).toBe(30);
    expect(messageTick(gated, 0, engine.graph)).toBe(30);
    expect(latestTick(gated, engine.graph)).toBe(30);
    expect(visibleMail(engine.graph).some((entry) => entry.id === 'mail/x'))
      .toBe(false);
  });
});
