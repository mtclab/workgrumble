/**
 * The escalation handoff: what makes one complete, and what a thin one costs.
 *
 * The completeness rule is the whole mechanic - it is the single most real
 * lesson on a first-line desk - so it is asserted on its own, and then again
 * through the engine, where the difference between a handoff that goes and one
 * that comes back is a ticket state and a reputation.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatchLogEntry } from '../../engine-api';
import { loadEngineForTests } from '../../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { STARTING_REPUTATION } from '../meters';
import { createWorldSession } from '../session';
import {
  actionSummary,
  bounceLandsAt,
  HANDOFF_BOUNCE,
  isCompleteHandoff,
  joinLines,
  triedFromLog,
  whyThin,
} from './handoff';

beforeAll(() => {
  loadEngineForTests();
});

const TICKET = 'ticket:fan-noise';

function entry(overrides: Partial<DispatchLogEntry> = {}): DispatchLogEntry {
  return {
    tick: 0,
    id: HELPDESK_ACTIONS.serviceRestart,
    actor: COMPANY_IDS.player,
    target: COMPANY_IDS.spooler,
    params: {},
    ok: true,
    ...overrides,
  };
}

describe('what makes a handoff complete', () => {
  it('needs a symptom AND something tried', () => {
    expect(isCompleteHandoff({ reported: 'It hums.', tried: ['Rebooted it'] }))
      .toBe(true);
    expect(isCompleteHandoff({ reported: '', tried: ['Rebooted it'] }))
      .toBe(false);
    expect(isCompleteHandoff({ reported: 'It hums.', tried: [] })).toBe(false);
    expect(isCompleteHandoff({ reported: '', tried: [] })).toBe(false);
  });

  it('does not accept whitespace as either half', () => {
    expect(isCompleteHandoff({ reported: '   ', tried: ['Rebooted it'] }))
      .toBe(false);
    expect(isCompleteHandoff({ reported: 'It hums.', tried: ['  ', ''] }))
      .toBe(false);
  });

  it('says which half is missing, in the order a form is filled in', () => {
    expect(whyThin({ reported: '', tried: [] }))
      .toContain('what the user reported');
    expect(whyThin({ reported: 'It hums.', tried: [] }))
      .toContain('what I tried');
    expect(whyThin({ reported: 'It hums.', tried: ['Rebooted it'] }))
      .toBeNull();
  });

  it('joins the lines it keeps and drops the ones it does not', () => {
    expect(joinLines(['One', '', '  ', 'Two'])).toBe('One\nTwo');
    expect(joinLines([])).toBe('');
  });
});

describe('reading "what I tried" off the dispatch log', () => {
  it('keeps only what was aimed at this ticket\'s own estate', () => {
    const log = [
      entry(),
      entry({ target: 'account:ada', id: HELPDESK_ACTIONS.accountUnlock }),
      entry({ target: null }),
    ];

    const tried = triedFromLog(log, [COMPANY_IDS.spooler]);
    expect(tried).toHaveLength(1);
    expect(tried[0]?.text).toBe(actionSummary(HELPDESK_ACTIONS.serviceRestart));
  });

  /** What did NOT work is required content on a real handoff form. */
  it('keeps the refusals, and says they refused', () => {
    const tried = triedFromLog(
      [entry({ ok: false, tick: 12 })],
      [COMPANY_IDS.spooler],
    );

    expect(tried[0]?.worked).toBe(false);
    expect(tried[0]?.text).toContain('refused');
    expect(tried[0]?.tick).toBe(12);
  });

  /** Triaging a ticket is not something that was tried on the problem. */
  it('leaves the ticket\'s own bookkeeping out of it', () => {
    const log = [
      entry({ id: HELPDESK_ACTIONS.ticketClassify, target: TICKET }),
      entry({ id: HELPDESK_ACTIONS.ticketAddWorknote, target: TICKET }),
      entry({ id: HELPDESK_ACTIONS.ticketEscalate, target: TICKET }),
    ];

    expect(triedFromLog(log, [TICKET])).toHaveLength(0);
  });

  it('has nothing to say about a ticket nobody has touched', () => {
    expect(triedFromLog([], [COMPANY_IDS.spooler])).toHaveLength(0);
    expect(triedFromLog([entry()], [])).toHaveLength(0);
  });

  it('names every verb the player has, so no line reads as an id', () => {
    for (const id of Object.values(HELPDESK_ACTIONS)) {
      const summary = actionSummary(id);

      if (summary === id) {
        // The ones deliberately left out of a handoff never reach a form.
        expect([
          HELPDESK_ACTIONS.ticketEscalate,
          HELPDESK_ACTIONS.ticketRecordResponse,
          HELPDESK_ACTIONS.ticketBounceHandoff,
        ]).toContain(id);
      }
    }
  });
});

describe('a handoff through the engine', () => {
  it('goes when it is complete, and does not come back', () => {
    const { engine } = createWorldSession();

    expect(engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      COMPANY_IDS.player,
      TICKET,
      {
        reported: 'It sounds like a hornet in a biscuit tin.',
        tried: 'Reseated the fan\nListened to it, at length',
      },
    )).toEqual({ ok: true });

    expect(engine.graph.getField(TICKET, FIELDS.escalated)).toBe(true);
    expect(engine.graph.getField(TICKET, FIELDS.handoffBouncedAt))
      .toBeUndefined();
    expect(engine.graph.getField(TICKET, FIELDS.handoffReported))
      .toContain('hornet');
  });

  /**
   * A thin one is not refused - it is sent, and sent straight back, which is
   * what actually happens. The ticket never leaves: there is nothing to
   * un-escalate, because it was never escalated.
   */
  it('is marked for the return journey when it is thin', () => {
    const { engine } = createWorldSession();

    engine.advance(9);
    expect(engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      COMPANY_IDS.player,
      TICKET,
      { reported: 'It is broken.', tried: '' },
    )).toEqual({ ok: true });

    expect(engine.graph.getField(TICKET, FIELDS.escalated)).toBeUndefined();
    expect(engine.graph.getField(TICKET, FIELDS.handoffBouncedAt)).toBe(9);
    expect(engine.ticketState(TICKET)).toBe('open');
    expect(bounceLandsAt(9)).toBe(9 + HANDOFF_BOUNCE.delayTicks);
  });

  it('costs a reputation and a work note when it lands, once', () => {
    const { engine } = createWorldSession();

    engine.dispatch(HELPDESK_ACTIONS.ticketEscalate, COMPANY_IDS.player, TICKET, {
      reported: '',
      tried: '',
    });
    engine.advance(HANDOFF_BOUNCE.delayTicks);

    expect(engine.dispatch(
      HELPDESK_ACTIONS.ticketBounceHandoff,
      COMPANY_IDS.player,
      TICKET,
      {},
    )).toEqual({ ok: true });

    expect(engine.graph.getField(COMPANY_IDS.player, FIELDS.reputation))
      .toBe(STARTING_REPUTATION - HANDOFF_BOUNCE.reputationCost);
    expect(engine.graph.getField(TICKET, FIELDS.worknotes))
      .toContain('Returned by second line');
    expect(engine.graph.getField(TICKET, FIELDS.handoffSettledAt))
      .toBe(HANDOFF_BOUNCE.delayTicks);

    // Once is the arrangement.
    const second = engine.dispatch(
      HELPDESK_ACTIONS.ticketBounceHandoff,
      COMPANY_IDS.player,
      TICKET,
      {},
    );
    expect(second.ok).toBe(false);
    expect(engine.graph.getField(COMPANY_IDS.player, FIELDS.reputation))
      .toBe(STARTING_REPUTATION - HANDOFF_BOUNCE.reputationCost);
  });

  it('refuses to settle a bounce that never happened', () => {
    const { engine } = createWorldSession();
    const result = engine.dispatch(
      HELPDESK_ACTIONS.ticketBounceHandoff,
      COMPANY_IDS.player,
      TICKET,
      {},
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('Nothing has bounced');
  });

  /** The ticket came back, so the second attempt is a real one. */
  it('lets a bounced ticket be escalated again, properly', () => {
    const { engine } = createWorldSession();

    engine.dispatch(HELPDESK_ACTIONS.ticketEscalate, COMPANY_IDS.player, TICKET, {
      reported: '',
      tried: '',
    });
    engine.advance(HANDOFF_BOUNCE.delayTicks);
    engine.dispatch(
      HELPDESK_ACTIONS.ticketBounceHandoff,
      COMPANY_IDS.player,
      TICKET,
      {},
    );

    expect(engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      COMPANY_IDS.player,
      TICKET,
      { reported: 'It hums.', tried: 'Reseated the fan' },
    )).toEqual({ ok: true });
    expect(engine.ticketState(TICKET)).toBe('resolved');
  });
});
