/**
 * The linked-request data, held down without a driver or a DOM: the shared id
 * across the three arrivals, the resolution ledger the surfaces read, and the
 * loader that refuses a request that would render as a blank card in play.
 *
 * The world-level HALF of slice 2's gate. That resolving one copy quietens all
 * three, that convert mints a ticket that counts, and that answering gives
 * gratitude-no-credit are journeys through the driver and the engine, and live
 * in `src/shell/requests.test.ts`; what is here is the arithmetic those
 * journeys stand on.
 */

import { describe, expect, it } from 'vitest';

import { COMPANY_IDS } from './company';
import {
  isRequestKind,
  isRequestResolved,
  type LinkedRequestSlot,
  REQUEST_ANSWER_REPUTATION,
  REQUEST_DEFLECT_REPUTATION,
  REQUEST_KINDS,
  requestReputationDelta,
  resolutionLine,
  resolutionsBy,
  resolvedIds,
  validateRequestSlots,
} from './requests';
import {
  findLinkedRequest,
  linkedRequestsOn,
  linkedRequestsThrough,
} from './week';
import { shiftStartTick, tickAtMinute } from './day';

const SLOT: LinkedRequestSlot = {
  id: 'req:test',
  reporter: COMPANY_IDS.bev,
  subject: 'A thing asked everywhere',
  raises: 'ticket:bev-vpn-request',
  minute: 9 * 60 + 50,
  mail: 'The formal version.',
  chat: 'the terse version',
};

function validated(slot: LinkedRequestSlot): void {
  validateRequestSlots(1, [slot], new Set<string>());
}

describe('the three answers', () => {
  it('names exactly convert, answer and deflect', () => {
    expect([...REQUEST_KINDS]).toEqual(['convert', 'answer', 'deflect']);
    expect(isRequestKind('convert')).toBe(true);
    expect(isRequestKind('resolve')).toBe(false);
    expect(isRequestKind(2)).toBe(false);
  });

  it('prices the two that move a meter, and leaves convert at nought', () => {
    // Convert's credit is the ticket it mints, not a meter here - so the verb
    // itself must move nothing, or the correct play would pay twice.
    expect(requestReputationDelta('convert')).toBe(0);
    expect(requestReputationDelta('answer')).toBe(REQUEST_ANSWER_REPUTATION);
    expect(requestReputationDelta('deflect')).toBe(REQUEST_DEFLECT_REPUTATION);
  });

  it('makes gratitude smaller than the goodwill deflecting costs', () => {
    // The triangle only holds if keeping your time is not free: answering buys
    // a little, deflecting costs a little more, and converting is the one that
    // pays on Friday.
    expect(REQUEST_ANSWER_REPUTATION).toBeGreaterThan(0);
    expect(REQUEST_DEFLECT_REPUTATION).toBeLessThan(0);
    expect(Math.abs(REQUEST_DEFLECT_REPUTATION))
      .toBeGreaterThan(REQUEST_ANSWER_REPUTATION);
  });
});

describe('the resolution ledger', () => {
  it('reads the bare-id set the guard refuses a second answer against', () => {
    const field = 'req:a\nreq:b';
    expect(resolvedIds(field)).toEqual(new Set(['req:a', 'req:b']));
    expect(isRequestResolved('req:a', field)).toBe(true);
    expect(isRequestResolved('req:c', field)).toBe(false);
    // Absent is nobody-resolved, which is what keeps a quiet week byte-identical.
    expect(isRequestResolved('req:a', undefined)).toBe(false);
    expect(resolvedIds(undefined).size).toBe(0);
  });

  it('reads which way each went, and drops a line it cannot understand', () => {
    const field = [
      resolutionLine('req:a', 'convert'),
      resolutionLine('req:b', 'answer'),
      'req:c@deflect',
      'req:d@sideways', // a kind this build never wrote
      'malformed',
    ].join('\n');
    const by = resolutionsBy(field);

    expect(by.get('req:a')).toBe('convert');
    expect(by.get('req:b')).toBe('answer');
    expect(by.get('req:c')).toBe('deflect');
    expect(by.has('req:d')).toBe(false);
    expect(by.has('malformed')).toBe(false);
  });

  it('stamps the line the driver hands the world', () => {
    expect(resolutionLine('req:bev-vpn', 'convert')).toBe('req:bev-vpn@convert');
  });
});

describe('the loader', () => {
  it('passes a well-formed request', () => {
    expect(() => validated(SLOT)).not.toThrow();
  });

  it('refuses a request the resolution ledger cannot hold by', () => {
    expect(() => validated({ ...SLOT, id: '  ' })).toThrow(/no id/);
  });

  it('refuses a second request under one id: it would arrive pre-resolved', () => {
    const seen = new Set<string>();
    validateRequestSlots(1, [SLOT], seen);
    expect(() => validateRequestSlots(2, [SLOT], seen)).toThrow(/asked twice/);
  });

  it('refuses a request from nobody, about nothing, or becoming no ticket', () => {
    expect(() => validated({ ...SLOT, reporter: ' ' })).toThrow(/from nobody/);
    expect(() => validated({ ...SLOT, subject: '' })).toThrow(/about nothing/);
    expect(() => validated({ ...SLOT, raises: '' })).toThrow(/no ticket/);
  });

  it('refuses a copy that says nothing - the player could not link it', () => {
    expect(() => validated({ ...SLOT, mail: '' })).toThrow(/nothing in mail/);
    expect(() => validated({ ...SLOT, chat: '   ' })).toThrow(/nothing in chat/);
  });

  it('refuses a request nobody is at the desk to read', () => {
    expect(() => validated({ ...SLOT, minute: 5 })).toThrow(/outside the hours/);
  });
});

describe('the shipped week carries one', () => {
  it('asks Bev the same question in three windows on the Tuesday', () => {
    const requests = linkedRequestsOn(2);
    expect(requests.map((request) => request.id)).toEqual(['req:bev-vpn']);
    expect(requests[0]?.reporter).toBe(COMPANY_IDS.bev);
    expect(requests[0]?.raises).toBe('ticket:bev-vpn-request');
  });

  it('finds it by id, week-wide, for the surface that resolves it', () => {
    const found = findLinkedRequest('req:bev-vpn');
    expect(found?.day).toBe(2);
    expect(found?.slot.subject).toContain('VPN');
    expect(findLinkedRequest('req:nobody')).toBeUndefined();
  });

  it('arrives as a reading of the clock, not before its minute', () => {
    const request = linkedRequestsOn(2)[0];

    if (request === undefined) {
      throw new Error('the Tuesday request went missing');
    }

    const arrives = tickAtMinute(2, request.minute);
    expect(linkedRequestsThrough(arrives - 1)).toHaveLength(0);
    expect(linkedRequestsThrough(arrives).map((entry) => entry.slot.id))
      .toEqual(['req:bev-vpn']);
    // Nothing lands before the Tuesday, either: Monday's shift start is empty.
    expect(linkedRequestsThrough(shiftStartTick(2) - 1)).toHaveLength(0);
  });
});
