import { describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { FIELDS } from '../../world/fields';
import { createWorldSession } from '../../world/session';
import {
  breachedTicketCount,
  ticketStateLabel,
  wasBreached,
} from './tickets';

const FAN_TICKET = 'ticket:fan-noise';
const ROTATED_TICKET = 'ticket:rotated-screen';
/** What every untriaged ticket arrives with: P3's four hours. */
const UNTRIAGED_SLA_TICKS = 240;

/**
 * A breach is a thing that happened, and closing the ticket afterwards does
 * not unhappen it. Reading the CURRENT state alone forgives every missed SLA
 * the moment the work is finished, which is a day score the player cannot
 * see coming and a review they cannot argue with.
 */
describe('a breached ticket that gets closed', () => {
  it('keeps saying it breached, in the queue and in the tally', () => {
    const session = createWorldSession();

    // Every untriaged ticket runs on the same clock now, so the one that is
    // going to survive the morning is the one somebody triaged: filed low and
    // low, the matrix makes it a P4 and its deadline moves to eight hours.
    expect(
      session.engine.dispatch(
        HELPDESK_ACTIONS.ticketClassify,
        COMPANY_IDS.player,
        ROTATED_TICKET,
        { impact: 1, urgency: 1, priority: 4 },
      ),
    ).toEqual({ ok: true });

    session.engine.advance(UNTRIAGED_SLA_TICKS);
    expect(session.engine.ticketState(FAN_TICKET)).toBe('breached');
    expect(session.engine.ticketState(ROTATED_TICKET)).toBe('open');

    // Then do the work anyway: this is the honest ending, late.
    expect(
      session.engine.dispatch(
        HELPDESK_ACTIONS.ticketEscalate,
        COMPANY_IDS.player,
        FAN_TICKET,
        {
          reported: 'It makes a noise like a bag of spanners.',
          tried: 'Turned it off and on again',
        },
      ),
    ).toEqual({ ok: true });
    expect(session.engine.ticketState(FAN_TICKET)).toBe('resolved');

    const nodes = session.engine.graph.nodesOfKind('ticket');
    const closed = nodes.find((node) => node.id === FAN_TICKET);
    const clean = nodes.find((node) => node.id === ROTATED_TICKET);

    expect(closed?.fields[FIELDS.breached]).toBe(true);
    expect(closed === undefined ? '' : ticketStateLabel(closed))
      .toBe('Closed (breached)');
    expect(closed !== undefined && wasBreached(closed)).toBe(true);

    // A ticket that never breached is not smeared with somebody else's miss.
    expect(clean === undefined ? '' : ticketStateLabel(clean)).toBe('Open');
    expect(clean !== undefined && wasBreached(clean)).toBe(false);

    // And the day's tally still counts it, because the day still counts it -
    // alongside the two the player never got to, and not the P4 that had
    // another four hours on it.
    expect(breachedTicketCount(nodes)).toBe(3);
    expect(nodes.filter((node) => !wasBreached(node)).map((node) => node.id))
      .toEqual([ROTATED_TICKET]);
  });

  it('counts nothing on a queue that has missed nothing', () => {
    const session = createWorldSession();

    expect(breachedTicketCount(session.engine.graph.nodesOfKind('ticket'))).toBe(0);
  });
});
