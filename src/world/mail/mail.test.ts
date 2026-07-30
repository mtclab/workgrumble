import { describe, expect, it } from 'vitest';

import { formatSimTime } from '../../shell/clock-format';
import { COMPANY_IDS } from '../company';
import { createWorldSession } from '../session';
import {
  findMailThread,
  latestTick,
  mailKey,
  validateMailThreads,
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
        expect(session.graph.getNode(message.from)?.kind).toBe('person');
      }
    }
  });

  it('stamps every message at a time the shift clock can show', () => {
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
    })).toBe(40);
  });
});
