import { describe, expect, it } from 'vitest';

import type { ReadOnlyGraphNode } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../../world/actions';
import { cadenceIntervalFor } from '../../world/cadence';
import { COMPANY_IDS } from '../../world/company';
import { FIELDS } from '../../world/fields';
import { createWorldSession } from '../../world/session';
import { prioritySourceOf, ticketClocks } from '../../world/sla';
import { spawnWorldTicket } from '../../world/tickets';
import { DayDriver, TICK_INTERVAL_MS } from '../day-driver';
import { carryForStart } from '../start';
import {
  answeredLine,
  breachedTicketCount,
  cadenceLine,
  prioritySourceLine,
  responseLine,
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

  /**
   * The untriaged sentence says two things and they used to contradict each
   * other (0.37.1): it called the number on the screen the reporter's claim,
   * two rows under a badge reading "Untriaged (treated as P3)" - the desk's
   * default, which is what the number actually is. The claim is a thing the
   * reporter made and nobody has read; the number is the desk's, until
   * somebody triages it. Both facts are true and they are different facts.
   */
  it('calls an untriaged number the desk\'s default, and a triaged one '
    + 'the matrix\'s', () => {
    const session = createWorldSession();
    spawnWorldTicket(session.engine, FAN_TICKET);

    const untriaged = prioritySourceLine(
      prioritySourceOf(nodeOf(session, FAN_TICKET)),
    );

    expect(untriaged).toBe(
      'The reporter made a claim about how urgent this is and nobody has '
      + 'read it yet. The number above is not that claim - it is the desk\'s '
      + 'default for anything untriaged, and it stands until somebody '
      + 'triages this one.',
    );
    // The badge two rows up says the same thing in three words, and the
    // sentence may never disagree with it.
    expect(untriaged).toContain('untriaged');
    expect(untriaged).toContain('default');
    expect(untriaged).not.toContain('The number on this one is the reporter');

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

/**
 * The update-cadence row, and the addition it used to leave to the player
 * (0.37.1).
 *
 * It printed the promised gap and the windows already missed. Turning that
 * into "when does silence start costing me" needs the anchor, the count, and
 * a calendar that skips a night and an hour of lunch - so in practice nobody
 * did it and everybody found out afterwards. The row now says the minute.
 */
describe('the update-cadence row', () => {
  const CADENCE_TICKET = 'ticket:fontaine-matter-access';
  /** A silver P3's promise, off the table in `world/cadence.ts`. */
  const SILVER_P3 = 120;

  it('says when this window closes, and moves it when words re-anchor', () => {
    // The MSP's Monday deals this one itself, so it is already in the world.
    const session = createWorldSession(carryForStart('systems_engineer'));

    const node = (): Readonly<ReadOnlyGraphNode> => {
      const found = session.engine.graph.getNode(CADENCE_TICKET);
      if (found === undefined) {
        throw new Error(`${CADENCE_TICKET} is not in the world.`);
      }
      return found;
    };

    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      COMPANY_IDS.player,
      CADENCE_TICKET,
      { impact: 2, urgency: 2, priority: 3 },
    )).toEqual({ ok: true });
    expect(cadenceIntervalFor('silver', 3)).toBe(SILVER_P3);

    // The ticket arrived on the minute the world opened, so its first window
    // is two DESK hours after the shift starts at nine: eleven o'clock, said
    // as a time rather than as a sum for the reader to do.
    const line = cadenceLine(node(), SILVER_P3);

    expect(line).toContain('An update every 2h');
    expect(line).toContain('This window closes at 11:00.');
    expect(line).not.toContain('of silence');

    // Words to the reporter re-anchor the window, and the row says so - the
    // whole point of printing a minute rather than a gap. Said at ten, so the
    // next window is two desk hours from ten rather than from nine.
    session.engine.advance(120);
    expect(session.engine.dispatch(
      HELPDESK_ACTIONS.ticketReplyToReporter,
      COMPANY_IDS.player,
      CADENCE_TICKET,
      { comment: 'The matter list is rebuilding - I will come back to you.' },
    )).toEqual({ ok: true });

    expect(cadenceLine(node(), SILVER_P3))
      .toContain('This window closes at 12:00.');
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

describe('the cadence sentence only promises a minute where one is charged (0.37.1)', () => {
  const node = (state: string, missed?: number) => ({
    id: 'ticket:synthetic',
    kind: 'ticket',
    fields: {
      state,
      spawned_at: 480,
      sla_tier: 'silver',
      priority: 3,
      ...(missed === undefined ? {} : { cadence_missed: missed }),
    },
  }) as never;

  it('names a closing minute on a live ticket', () => {
    expect(cadenceLine(node('open'), 120)).toContain('This window closes at');
  });

  it('says held, not a minute, on a parked ticket - waiting is excused', () => {
    const line = cadenceLine(node('waiting_on_user'), 120);
    expect(line).toContain('Parked, so the clock is held');
    expect(line).not.toContain('This window closes at');
  });

  it('says history, not a minute, on a closed ticket', () => {
    const line = cadenceLine(node('resolved', 2), 120);
    expect(line).toContain('Closed now');
    expect(line).not.toContain('This window closes at');
    expect(line).toContain('2 windows of silence');
  });
});

/**
 * W-04, the September walk: the pane printed `Response SLA: Answered, in time`
 * four rows above `Nothing has been put to the reporter. As far as they know,
 * nobody has looked.` Both sentences were reading a true model with one word
 * doing two jobs - `responded_at` is the first TOUCH, and in the trade a first
 * response is a communication to the customer.
 *
 * So there are two rows now, and this is what each of them is allowed to say.
 */
describe('the answered row (0.42.0, W-04)', () => {
  const node = (fields: Record<string, unknown>) => ({
    id: 'ticket:synthetic',
    kind: 'ticket',
    fields: {
      state: 'open',
      spawned_at: 60,
      priority: 3,
      ...fields,
    },
  }) as never;

  /** The minute the pane is read in, well inside the first shift. */
  const NOW = 200;

  it('never calls a touch an answer', () => {
    const clocks = ticketClocks(node({ responded_at: 90 }), NOW);
    const line = responseLine(clocks);

    expect(line).toContain('Touched, in time');
    // The word that was the whole finding. It belongs to the row below, which
    // is about somebody having been spoken to.
    expect(line).not.toContain('Answered');
  });

  it('says outright that a silently fixed ticket told nobody', () => {
    const line = answeredLine(
      node({ state: 'resolved', responded_at: 90 }),
      ticketClocks(node({ state: 'resolved', responded_at: 90 }), NOW),
    );

    expect(line).toContain('Nothing was ever put to the reporter');
    expect(line).toContain('fixed in silence');
  });

  it('says the clock above is waiting for a touch, not for words', () => {
    expect(answeredLine(node({}), ticketClocks(node({}), NOW)))
      .toContain('Nothing has been put to the reporter yet');
  });

  it('names the minute they heard, and how long after the touch it was', () => {
    const fields = { responded_at: 90, answered_at: 120 };
    const line = answeredLine(node(fields), ticketClocks(node(fields), NOW));

    // The world opens at 08:00, so tick 120 is ten o'clock - and the half
    // hour between somebody picking it up and the reporter finding out is the
    // gap the two rows exist to make readable.
    expect(line).toContain('First words to the reporter at 10:00 (Day 1)');
    expect(line).toContain('30m after it was first touched.');
  });
});
