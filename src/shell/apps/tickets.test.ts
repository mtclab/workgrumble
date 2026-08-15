import { describe, expect, it } from 'vitest';

import type { ReadOnlyGraphNode } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { FIELDS } from '../../world/fields';
import { createWorldSession } from '../../world/session';
import { prioritySourceOf } from '../../world/sla';
import { spawnWorldTicket } from '../../world/tickets';
import { DayDriver, TICK_INTERVAL_MS } from '../day-driver';
import { carryForStart } from '../start';
import {
  breachedTicketCount,
  prioritySourceLine,
  type TicketRow,
  ticketRows,
  ticketStateLabel,
  vipRowLine,
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
    // A morning is at most two tickets now, so the pile this test is about -
    // three that get missed and one that was triaged out of trouble - is
    // dealt here rather than inherited. They are the same tickets the week
    // hands out across Monday to Thursday.
    for (const id of [FAN_TICKET, 'ticket:wedged-spooler']) {
      spawnWorldTicket(session.engine, id);
    }

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

/**
 * The queue as data, which is where the repaint question is actually decided.
 *
 * The rows are keyed by ticket id and the list app builds one element per key
 * (see `KeyedRows`), so what a minute is ALLOWED to change here is what a
 * minute changes on screen. If a passing tick moved anything but the countdown
 * - the title, the badge, the order, the key set - it would be a row rebuilt
 * once a second in front of somebody trying to tick three duplicates.
 */
describe('the queue between two minutes', () => {
  const view = { selectedId: null, picked: new Set<string>() };

  function rowsNow(
    session: ReturnType<typeof createWorldSession>,
  ): readonly TicketRow[] {
    return ticketRows(
      { graph: session.engine.graph },
      session.engine.graph.nodesOfKind('ticket'),
      session.engine.now(),
      view,
    );
  }

  it('moves the countdown and leaves every other cell alone', () => {
    const session = createWorldSession();
    spawnWorldTicket(session.engine, FAN_TICKET);

    const before = rowsNow(session);
    session.engine.advance(1);
    const after = rowsNow(session);

    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(before.length).toBeGreaterThan(1);

    for (const [index, row] of after.entries()) {
      const was = before[index];
      expect(was).toBeDefined();
      // Everything except the one cell the clock owns.
      expect({ ...row, sla: '' }).toEqual({ ...was, sla: '' });
    }

    // And the cell the clock owns did move, or this test proves nothing.
    expect(after.map((row) => row.sla))
      .not.toEqual(before.map((row) => row.sla));
  });

  it('keys every row by its ticket, so an arrival is the only new row', () => {
    const session = createWorldSession();
    const before = rowsNow(session);

    spawnWorldTicket(session.engine, FAN_TICKET);
    const after = rowsNow(session);

    const arrived = after
      .map((row) => row.id)
      .filter((id) => !before.some((row) => row.id === id));

    expect(arrived).toEqual([FAN_TICKET]);
    expect(new Set(after.map((row) => row.key)).size).toBe(after.length);
  });
});

/**
 * The row that names the lever (E9, 0.37.0).
 *
 * The pane prints one sentence beside the priority, and which sentence it is
 * comes from the ticket rather than from the app: an untriaged one is still
 * carrying the reporter's own opinion, and a triaged one is carrying the
 * matrix's. Asserted through the shipped classify verb on the shipped world,
 * because the claim is about what changed the number - a test that wrote the
 * priority field itself would be asserting the sentence against its own fixture.
 *
 * The VIP branch is the row's ABSENCE, and that is checked here too: the pane
 * already has a row saying the flag forced the number and that nobody can unpick
 * it, so a second sentence would read as a second lever.
 */
describe('the row that says which lever set the priority', () => {
  const nodeOf = (
    session: ReturnType<typeof createWorldSession>,
    id: string,
  ): ReadOnlyGraphNode => {
    const found = session.engine.graph.getNode(id);

    if (found === undefined) {
      throw new Error(`The world has no ticket "${id}".`);
    }

    return found;
  };

  it('calls an untriaged number the reporter\'s own claim, and a triaged one '
    + 'the matrix\'s', () => {
    const session = createWorldSession();
    spawnWorldTicket(session.engine, FAN_TICKET);

    expect(prioritySourceLine(prioritySourceOf(nodeOf(session, FAN_TICKET))))
      .toBe(
        'The number on this one is the reporter\'s own claim - nothing has '
        + 'been triaged yet, and the desk treats an unread claim as P3.',
      );

    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      FAN_TICKET,
      { impact: 1, urgency: 1, priority: 4 },
    )).toEqual({ ok: true });

    expect(prioritySourceLine(prioritySourceOf(nodeOf(session, FAN_TICKET))))
      .toBe(
        'Priority came out of the matrix - impact times urgency, the two '
        + 'dropdowns below, nobody\'s name involved.',
      );
  });

  it('says nothing of its own on a VIP ticket, because the row above it '
    + 'already has', () => {
    expect(prioritySourceLine('vip')).toBeNull();
  });
});

describe('the VIP row names whose flag it is (E9, 0.37.0)', () => {
  it('reads as the caller\'s own flag when nobody else is named', () => {
    expect(vipRowLine(undefined, 2)).toContain('The caller is on the VIP list');
    expect(vipRowLine(undefined, 2)).toContain('forced to P2');
  });

  it('names the beneficiary on the shadow VIP\'s ticket', () => {
    const line = vipRowLine('Roland Cushing-Vane, Chief Executive Officer', 2);
    expect(line).toContain('Raised on behalf of Roland Cushing-Vane');
    expect(line).toContain('keys off who it is FOR, not who typed it');
    expect(line).not.toContain('The caller is on the VIP list');
  });
});

describe('the source line refuses to credit the matrix for numbers it never made', () => {
  it('names the disagreement on a mis-filed audit ticket (0.37.1)', () => {
    // The marketing spooler is filed impact 1 / urgency 3 / P4; the matrix
    // cell for (1,3) is P3. The senior's whole queue is this shape, and the
    // pane used to assert the opposite on exactly these tickets.
    const session = createWorldSession(carryForStart('sd_senior'));
    const driver = new DayDriver(
      session.engine,
      COMPANY_IDS.player,
      session.seed,
      {
        onDayBoundary: () => {},
        openSlackApps: () => [],
        focusedSlackApp: () => null,
      },
      undefined,
      session.week,
      session.channels,
    );
    driver.startShift();
    driver.setSpeed(1);

    for (let minute = 0; minute < 340 && driver.state() === 'shift'; minute += 1) {
      driver.step(TICK_INTERVAL_MS);
    }

    const spooler = session.engine.graph.getNode('ticket:audit-marketing-spooler');
    expect(spooler).toBeDefined();
    expect(prioritySourceOf(spooler!)).toBe('off_matrix');
    expect(prioritySourceLine('off_matrix')).toContain('does not follow');

    // And a number the matrix DID make keeps its sentence.
    expect(prioritySourceLine('impact')).toContain('came out of the matrix');
  });
});
