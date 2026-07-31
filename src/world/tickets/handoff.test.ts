/**
 * The escalation handoff: what makes one complete, and what a thin one costs.
 *
 * The completeness rule is the whole mechanic - it is the single most real
 * lesson on a first-line desk - so it is asserted on its own, and then again
 * through the engine, where the difference between a handoff that goes and one
 * that comes back is a ticket state and a reputation.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { STARTING_REPUTATION } from '../meters';
import { createWorldSession } from '../session';
import {
  actionSummary,
  bounceLandsAt,
  countsAsWork,
  encodeTouch,
  HANDOFF_BOUNCE,
  isCompleteHandoff,
  joinLines,
  TOUCH_LOG_LIMIT,
  triedFromTouches,
  whyThin,
  withTouch,
} from './handoff';

beforeAll(() => {
  loadEngineForTests();
});

const TICKET = 'ticket:fan-noise';

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

describe('reading "what I tried" off the ticket', () => {
  it('reads back the touches it was given, newest last', () => {
    const log = [
      encodeTouch(4, HELPDESK_ACTIONS.serviceRestart, true),
      encodeTouch(9, HELPDESK_ACTIONS.printerClearQueue, true),
    ].join('\n');
    const tried = triedFromTouches(log);

    expect(tried).toHaveLength(2);
    expect(tried[0]?.tick).toBe(4);
    expect(tried[0]?.text).toBe(actionSummary(HELPDESK_ACTIONS.serviceRestart));
    expect(tried[1]?.tick).toBe(9);
  });

  /** What did NOT work is required content on a real handoff form. */
  it('keeps the refusals, and says they refused', () => {
    const tried = triedFromTouches(
      encodeTouch(12, HELPDESK_ACTIONS.serviceRestart, false),
    );

    expect(tried[0]?.worked).toBe(false);
    expect(tried[0]?.text).toContain('refused');
    expect(tried[0]?.tick).toBe(12);
  });

  /** Triaging a ticket is not something that was tried on the problem. */
  it('leaves the ticket\'s own bookkeeping out of it', () => {
    expect(countsAsWork(HELPDESK_ACTIONS.ticketClassify)).toBe(false);
    expect(countsAsWork(HELPDESK_ACTIONS.ticketAddWorknote)).toBe(false);
    expect(countsAsWork(HELPDESK_ACTIONS.ticketEscalate)).toBe(false);
    expect(countsAsWork(HELPDESK_ACTIONS.ticketRecordTouch)).toBe(false);
    expect(countsAsWork(HELPDESK_ACTIONS.serviceRestart)).toBe(true);
  });

  it('has nothing to say about a ticket nobody has touched', () => {
    expect(triedFromTouches(undefined)).toHaveLength(0);
    expect(triedFromTouches('')).toHaveLength(0);
    expect(triedFromTouches(12)).toHaveLength(0);
  });

  /**
   * The field lives in a save file on somebody's own machine. A line this
   * build cannot read is dropped rather than rendered as `undefined -
   * refused`, and the lines around it still arrive.
   */
  it('drops a line it cannot read rather than showing nonsense', () => {
    const tried = triedFromTouches([
      'not a touch',
      '|service.restart|1',
      '4|service.restart|7',
      '-3|service.restart|1',
      encodeTouch(6, HELPDESK_ACTIONS.serviceRestart, true),
    ].join('\n'));

    expect(tried).toHaveLength(1);
    expect(tried[0]?.tick).toBe(6);
  });

  /**
   * Bounded, because this is a field in every save from here on. The oldest
   * go: what a handoff wants is what was tried most recently.
   */
  it('keeps the last twenty touches and no more', () => {
    let log = '';

    for (let touch = 0; touch < TOUCH_LOG_LIMIT + 5; touch += 1) {
      log = withTouch(log, touch, HELPDESK_ACTIONS.serviceRestart, true);
    }

    const tried = triedFromTouches(log);
    expect(tried).toHaveLength(TOUCH_LOG_LIMIT);
    expect(tried[0]?.tick).toBe(5);
    expect(tried[TOUCH_LOG_LIMIT - 1]?.tick).toBe(TOUCH_LOG_LIMIT + 4);
  });

  it('names every verb the player has, so no line reads as an id', () => {
    for (const id of Object.values(HELPDESK_ACTIONS)) {
      const summary = actionSummary(id);

      if (summary === id) {
        // The ones deliberately left out of a handoff never reach a form.
        expect([
          HELPDESK_ACTIONS.ticketEscalate,
          HELPDESK_ACTIONS.ticketRecordResponse,
          HELPDESK_ACTIONS.ticketRecordTouch,
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
