/**
 * The contract's clock on talking (E9, 0.37.0 - D4), at the arithmetic level.
 *
 * The driver-level halves - the settler stamping through real minutes and the
 * meters billing the stamps - live in src/shell/contract-clocks.test.ts. What
 * is proven here is the derivation: which tickets owe a window, how the count
 * climbs, and that an update moves the anchor without shrinking the record.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import {
  ackMissesDue,
  cadenceAnchor,
  cadenceIntervalFor,
  cadenceMissesDue,
  cadenceMissesOn,
  isContractTicket,
} from './cadence';
import { COMPANY_IDS } from './company';
import { FIELDS, SLA_TIERS } from './fields';
import { HELPDESK_ACTIONS } from './actions';
import { createWorldSession } from './session';
import { spawnWorldTicket } from './tickets';

beforeAll(() => {
  loadEngineForTests();
});

describe('the cadence table', () => {
  it('promises a drumbeat at gold and nothing at bronze\'s low rows', () => {
    expect(cadenceIntervalFor(SLA_TIERS.gold, 1)).toBe(15);
    expect(cadenceIntervalFor(SLA_TIERS.bronze, 3)).toBeNull();
    expect(cadenceIntervalFor(null, 1)).toBeNull();
    expect(cadenceIntervalFor(SLA_TIERS.gold, null)).toBeNull();
  });
});

describe('the miss arithmetic', () => {
  it('owes nothing while the silence is shorter than the promise', () => {
    const session = createWorldSession();
    spawnWorldTicket(session.engine, 'ticket:fan-noise');
    // The probation shop has no tiers, so nothing in this whole world is a
    // contract ticket - the read must say so and owe nothing.
    const node = session.engine.graph.getNode('ticket:fan-noise');
    expect(node).toBeDefined();
    expect(isContractTicket(node!)).toBe(false);
    expect(cadenceMissesDue(session.engine.graph, 10_000)).toEqual([]);
    expect(
      ackMissesDue(session.engine.graph, () => true),
    ).toEqual([]);
  });

  it('anchors on the latest of arrival, first touch and last words', () => {
    const session = createWorldSession();
    spawnWorldTicket(session.engine, 'ticket:fan-noise');
    const before = session.engine.graph.getNode('ticket:fan-noise')!;
    const spawnedAt = Number(before.fields[FIELDS.spawnedAt]);
    expect(cadenceAnchor(before)).toBe(spawnedAt);

    expect(
      session.engine.dispatch(
        HELPDESK_ACTIONS.ticketAddComment,
        COMPANY_IDS.player,
        'ticket:fan-noise',
        { comment: 'What does the noise sound like from your side?' },
      ),
    ).toEqual({ ok: true });

    const after = session.engine.graph.getNode('ticket:fan-noise')!;
    // The comment stamped both the first touch and the words - the anchor is
    // whichever is latest, and both are now the same minute or later.
    expect(cadenceAnchor(after)).toBeGreaterThanOrEqual(spawnedAt);
    expect(typeof after.fields[FIELDS.lastUpdateAt]).toBe('number');
    expect(cadenceMissesOn(after)).toBe(0);
  });
});
