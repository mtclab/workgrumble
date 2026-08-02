/**
 * The three colleagues payloads, driven through the shipped driver and the
 * shipped engine.
 *
 * Every assertion here is about something a PLAYER reaches rather than about a
 * dispatch having returned: the machine is actually restarted, the ticket
 * actually exists (or actually does not), the Friday card actually counts it,
 * and the request raised at five to five is actually still answerable
 * tomorrow. The windows that draw all of this are e2e's; what a window is
 * allowed to draw is decided here.
 *
 * No DOM.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { buildDaySchedule, shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { dayForTick, minuteOfDay, serviceDeadline } from '../world/hours';
import {
  buildInterruptionSchedule,
  dodgesUnderDnd,
  INTERRUPTION_SOURCES,
  READS_THE_DOT,
} from '../world/interruptions';
import { createWorldSession, type WorldSession } from '../world/session';
import { ticketClocks } from '../world/sla';
import { findWorldTicket } from '../world/tickets';
import {
  dayPlan,
  interruptionPlanFor,
  noHelloOn,
  walkUpsOn,
  weekWorkThrough,
} from '../world/week';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

/** The Friday walk-up, which is the only one the week ships. */
const WALK_UP_DAY = 5;
/** And the Wednesday request, which is the only 4:55 ticket the week ships. */
const CLOSE_DAY = 3;

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
  /** Everything that took the screen, in the minute it took it. */
  readonly took: string[];
  /** Everybody who said hello without saying anything else. */
  readonly hellos: number[];
  /** And the minute each of them finally got round to the question. */
  readonly questions: number[];
}

function harnessOn(day: number): Harness {
  const session = createWorldSession();
  const took: string[] = [];
  const hellos: number[] = [];
  const questions: number[] = [];
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, session.seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onInterruption: (view) => {
      took.push(view.entry.id);
    },
    onNoHello: (_speaker, tick) => {
      hellos.push(tick);
    },
    onNoHelloQuestion: (_speaker, tick) => {
      questions.push(tick);
    },
  });

  for (let played = 1; played < day; played += 1) {
    driver.startShift();
    runTo(driver, session, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  took.length = 0;
  hellos.length = 0;
  questions.length = 0;
  return { driver, session, took, hellos, questions };
}

function runTo(driver: DayDriver, session: WorldSession, tick: number): void {
  while (session.engine.now() < tick && driver.state() === 'shift') {
    driver.step(TICK_INTERVAL_MS);
  }
}

/** Where the walk-up actually landed on the shipped seed. */
function walkUpEntry(session: WorldSession): { tick: number; endsTick: number } {
  const plan = interruptionPlanFor(WALK_UP_DAY, session.seed);
  const schedule = buildInterruptionSchedule(session.seed, WALK_UP_DAY, plan);
  const entry = schedule.entries.find(
    (candidate) => candidate.id === 'walk_up:gary-restart',
  );

  if (entry === undefined) {
    throw new Error('The week no longer puts anybody at the desk on Friday.');
  }

  return { tick: entry.tick, endsTick: entry.endsTick };
}

/* -- the walk-up ----------------------------------------------------------- */

describe('somebody at the desk', () => {
  /**
   * THE EXEMPTION, as data and through the real path.
   *
   * The table is the contract - a `Record` over the source union, so a sixth
   * source cannot be authored without somebody answering this question - and
   * the second half is the one that would actually have been wrong: the
   * predicate every caller uses has to agree with it, including for a
   * declinable walk-up, which is the only entry in the shipped week where the
   * two could disagree.
   */
  it('does not check your dot, which is the table and not a comment', () => {
    expect(READS_THE_DOT.walk_up).toBe(false);
    expect(READS_THE_DOT.meeting).toBe(false);
    expect(READS_THE_DOT.machine).toBe(false);
    expect(READS_THE_DOT.call).toBe(true);

    // Every source has an answer. The point of a Record over the union is that
    // this cannot quietly become "and anything new dodges by default", which
    // is what the chain of inequalities it replaced actually did.
    for (const source of INTERRUPTION_SOURCES) {
      expect(typeof READS_THE_DOT[source], source).toBe('boolean');
    }

    // And the predicate agrees with the table for the one shape where a
    // mistake would be invisible: declinable, from a person, and still not
    // dodgeable.
    expect(dodgesUnderDnd(
      { source: 'walk_up', declinable: true },
      'dnd',
    )).toBe(false);
    expect(dodgesUnderDnd({ source: 'call', declinable: true }, 'dnd'))
      .toBe(true);
  });

  /**
   * The journey rather than the table: a red dot held all Friday morning, and
   * she arrives anyway.
   *
   * It is walked through the real driver because the filter is a runtime pass
   * over a live placement - a table that said the right thing while the pass
   * dodged it anyway is exactly the class of bug a data assertion cannot see.
   */
  it('arrives at the desk with the dot on red all morning', () => {
    const { driver, session, took } = harnessOn(WALK_UP_DAY);
    const at = walkUpEntry(session);

    expect(driver.setPresence('dnd').ok).toBe(true);
    runTo(driver, session, at.tick);

    expect(took).toContain('walk_up:gary-restart');
    expect(driver.interruption()?.entry.source).toBe('walk_up');
    // And nothing was recorded as having slid, which is the other half: a dot
    // that dodged it and then let it back in would look identical here.
    expect(driver.dodgedInterruptions().map((dodged) => dodged.entry.id))
      .not.toContain('walk_up:gary-restart');
  });

  /**
   * OFF THE BOOKS: the work happens and the world has no ticket for it.
   *
   * The honesty claim is the second half rather than the first. Doing the job
   * is easy to assert; what matters is that Friday's card genuinely cannot see
   * it - not "we chose not to show it", but there is no ticket, so `arrived`
   * does not move, `closed` does not move, and the fund is not paid.
   */
  it('does it off the books, and the week never learns it happened', () => {
    const { driver, session } = harnessOn(WALK_UP_DAY);
    const at = walkUpEntry(session);
    const walkUp = walkUpsOn(WALK_UP_DAY)[0];

    expect(walkUp).toBeDefined();
    runTo(driver, session, at.tick);

    const before = weekWorkThrough(session.engine.graph.nodesOfKind('ticket'), WALK_UP_DAY);
    const fundBefore = session.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.farmFund,
    );

    // Picking it up, and then the option that does it there and then. Both go
    // through the shipped verbs: the answer is the interruption's, the restart
    // is the dialogue effect's, and neither of them is special-cased here.
    expect(driver.answerInterruption().ok).toBe(true);
    expect(driver.dispatch(
      HELPDESK_ACTIONS.machineReboot,
      COMPANY_IDS.player,
      COMPANY_IDS.garyMachine,
      {},
    ).ok).toBe(true);

    // The world moved: the machine really did go round.
    expect(session.engine.graph.getField(
      COMPANY_IDS.garyMachine,
      FIELDS.pendingUpdates,
    )).toBe(false);

    // Past the minute he would have filed one, and well past it.
    runTo(driver, session, at.endsTick + (walkUp?.filesAfter ?? 0) + 30);

    expect(session.engine.graph.getNode('ticket:gary-restart')).toBeUndefined();

    const after = weekWorkThrough(session.engine.graph.nodesOfKind('ticket'), WALK_UP_DAY);
    expect(after.arrived).toBe(before.arrived);
    expect(after.closed).toBe(before.closed);
    expect(session.engine.graph.getField(COMPANY_IDS.player, FIELDS.farmFund))
      .toBe(fundBefore);
  });

  /**
   * FILED: the ticket exists, it is hers, and it counts like any other.
   *
   * "Counts like any other" is the whole claim of this half, so it is asserted
   * as arithmetic on the same card the review reads rather than as the ticket
   * merely being present.
   */
  it('sends him to the form, and the ticket counts like any other', () => {
    const { driver, session } = harnessOn(WALK_UP_DAY);
    const at = walkUpEntry(session);
    const walkUp = walkUpsOn(WALK_UP_DAY)[0];

    runTo(driver, session, at.tick);
    const before = weekWorkThrough(session.engine.graph.nodesOfKind('ticket'), WALK_UP_DAY);

    // Answered, and then nothing done about it - which is what "raise one and
    // I will pick it up" leaves in the world, because the world reads whether
    // the job happened rather than which button was pressed.
    expect(driver.answerInterruption().ok).toBe(true);
    runTo(driver, session, at.endsTick + (walkUp?.filesAfter ?? 0));

    const ticket = session.engine.graph.getNode('ticket:gary-restart');
    expect(ticket).toBeDefined();
    expect(session.engine.ticketState('ticket:gary-restart')).toBe('open');
    // Attributed to him rather than to nobody: it is HER ticket, raised
    // because he was asked to raise it, and the queue says so.
    expect(findWorldTicket('ticket:gary-restart')?.def.reporter)
      .toBe(COMPANY_IDS.gary);

    const dealt = weekWorkThrough(session.engine.graph.nodesOfKind('ticket'), WALK_UP_DAY);
    expect(dealt.arrived).toBe(before.arrived + 1);

    // And it closes by the route its own content advertises, and the card
    // counts the close.
    const path = findWorldTicket('ticket:gary-restart')?.paths[0];
    expect(path).toBeDefined();

    for (const step of path?.steps ?? []) {
      expect(driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      ).ok).toBe(true);
    }

    expect(session.engine.ticketState('ticket:gary-restart')).toBe('resolved');
    expect(weekWorkThrough(session.engine.graph.nodesOfKind('ticket'), WALK_UP_DAY).closed)
      .toBe(before.closed + 1);
  });

  /**
   * THE TRADEOFF, asserted rather than described.
   *
   * Neither answer may dominate, and the two halves of that are different
   * currencies on purpose:
   *
   * - off the books is FASTER TODAY. The job is done inside the conversation
   *   that was happening anyway, so nothing else is ever added to the queue -
   *   there is no second row to open, triage, work and close.
   * - filed is CREDITED ON FRIDAY. The same repair, done because a ticket
   *   asked for it, moves the numbers the review reads and pays the fund.
   *
   * Both are walked in the two cases above; what is asserted here is that the
   * two outcomes actually DIFFER, in both directions, so a slice that quietly
   * made one of them pointless would fail on the direction it removed.
   */
  it('makes the two answers cost and pay different things', () => {
    const offBook = harnessOn(WALK_UP_DAY);
    const filed = harnessOn(WALK_UP_DAY);
    const at = walkUpEntry(offBook.session);
    const walkUp = walkUpsOn(WALK_UP_DAY)[0];
    const until = at.endsTick + (walkUp?.filesAfter ?? 0) + 30;

    runTo(offBook.driver, offBook.session, at.tick);
    offBook.driver.answerInterruption();
    offBook.driver.dispatch(
      HELPDESK_ACTIONS.machineReboot,
      COMPANY_IDS.player,
      COMPANY_IDS.garyMachine,
      {},
    );
    runTo(offBook.driver, offBook.session, until);

    runTo(filed.driver, filed.session, at.tick);
    filed.driver.answerInterruption();
    runTo(filed.driver, filed.session, until);

    for (const step of findWorldTicket('ticket:gary-restart')?.paths[0]?.steps
      ?? []) {
      filed.driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      );
    }

    const quiet = weekWorkThrough(offBook.session.engine.graph.nodesOfKind('ticket'), WALK_UP_DAY);
    const proper = weekWorkThrough(filed.session.engine.graph.nodesOfKind('ticket'), WALK_UP_DAY);

    // The machine went round in both, so the COLLEAGUE got the same thing.
    for (const world of [offBook.session, filed.session]) {
      expect(world.engine.graph.getField(
        COMPANY_IDS.garyMachine,
        FIELDS.pendingUpdates,
      )).toBe(false);
    }

    // Friday can only see one of them. That is the cost of the quiet one.
    expect(proper.arrived).toBe(quiet.arrived + 1);
    expect(proper.closed).toBe(quiet.closed + 1);

    // And the quiet one genuinely left nothing behind: no row, no clock, no
    // deadline anybody could later be answerable for.
    expect(offBook.session.engine.graph.getNode('ticket:gary-restart'))
      .toBeUndefined();
    expect(filed.session.engine.graph.getNode('ticket:gary-restart'))
      .toBeDefined();
  });
});

/* -- the request at five to five ------------------------------------------- */

describe('the ticket that arrives before close', () => {
  it('lands on the minute the field asks for, with no jitter on it', () => {
    const session = createWorldSession();
    const schedule = buildDaySchedule(CLOSE_DAY, session.seed, dayPlan(CLOSE_DAY));
    const arrival = schedule.arrivals.find(
      (candidate) => candidate.ticketId === 'ticket:vpn-month-end',
    );

    expect(arrival).toBeDefined();
    expect(minuteOfDay(arrival?.tick ?? 0)).toBe(16 * 60 + 55);
    // Five minutes of shift left, which is the content of the row rather than
    // a coincidence of the seed.
    expect(shiftEndTick(CLOSE_DAY) - (arrival?.tick ?? 0)).toBe(5);
  });

  /**
   * THE CROSS-DAY TRUTH, on the shipped ticket and through the shipped
   * arithmetic.
   *
   * The cargo suite proves the identity holds minute by minute across a night
   * (`carries_a_five_to_five_request_into_the_next_morning`). What is proved
   * here is that the shipped Wednesday actually produces one: the response
   * window opens on a Wednesday evening and closes on a Thursday morning, by
   * `serviceDeadline`, which is the same arithmetic the engine arrives at from
   * the other end.
   */
  it('carries its response window into the next morning', () => {
    const session = createWorldSession();
    const schedule = buildDaySchedule(CLOSE_DAY, session.seed, dayPlan(CLOSE_DAY));
    const arrival = schedule.arrivals.find(
      (candidate) => candidate.ticketId === 'ticket:vpn-month-end',
    );
    const at = arrival?.tick ?? 0;

    // An untriaged ticket is treated as P3, whose response target is an hour.
    const due = serviceDeadline(at, 60);

    expect(dayForTick(at)).toBe(CLOSE_DAY);
    expect(dayForTick(due)).toBe(CLOSE_DAY + 1);
    // Five of the sixty minutes are tonight and the other fifty-five are
    // tomorrow's, so it is not late until five to ten in the morning.
    expect(minuteOfDay(due)).toBe(9 * 60 + 55);
  });

  /**
   * And the same thing again, read off a LIVE world through the shipped
   * reader, because the arithmetic above is a function and the queue is a
   * screen: a ticket whose row said something else would still pass the test
   * above.
   */
  it('says so on the ticket the queue actually holds', () => {
    const { driver, session } = harnessOn(CLOSE_DAY);
    runTo(driver, session, shiftEndTick(CLOSE_DAY) - 1);

    const ticket = session.engine.graph.getNode('ticket:vpn-month-end');
    expect(ticket).toBeDefined();

    const clocks = ticketClocks(
      ticket ?? { id: '', kind: 'ticket', fields: {} },
      session.engine.now(),
    );

    expect(clocks.response.breached).toBe(false);
    expect(dayForTick(clocks.response.dueAt)).toBe(CLOSE_DAY + 1);
    // It is still open at the end of the day it arrived on, which is not a
    // failure: there were five minutes and the clock knows it.
    expect(session.engine.ticketState('ticket:vpn-month-end')).toBe('open');
  });
});

/* -- "Hi." ----------------------------------------------------------------- */

describe('the bare greeting', () => {
  it('lands on the minute the week says, and burns what it claims', () => {
    const day = 1;
    const { driver, session, hellos, questions } = harnessOn(day);
    const slot = noHelloOn(day)[0];

    expect(slot).toBeDefined();
    const said = shiftStartTick(day) + ((slot?.minute ?? 0) - 9 * 60);

    runTo(driver, session, said);
    expect(hellos).toEqual([said]);
    // Nothing else has arrived yet. The gap is the mechanic and an
    // implementation that fired both halves together would have no gap in it.
    expect(questions).toEqual([]);

    // And the indicator says, all the way through, exactly how much of the
    // shift is left to spend on it.
    for (let waited = 1; waited < (slot?.typingMinutes ?? 0); waited += 1) {
      runTo(driver, session, said + waited);
      expect(driver.typing(slot?.speaker ?? '')?.minutesLeft)
        .toBe((slot?.typingMinutes ?? 0) - waited);
    }

    runTo(driver, session, said + (slot?.typingMinutes ?? 0));
    expect(questions).toEqual([said + (slot?.typingMinutes ?? 0)]);
    // Over, and the window has nothing left to show: a typing indicator over a
    // question that has arrived is a screen arguing with itself.
    expect(driver.typing(slot?.speaker ?? '')).toBeNull();
  });

  it('says nothing at all about anybody who is not mid-greeting', () => {
    const { driver } = harnessOn(1);
    expect(driver.typing(COMPANY_IDS.boss)).toBeNull();
    expect(driver.typing('person:nobody')).toBeNull();
  });
});
