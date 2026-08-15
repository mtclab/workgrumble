import { beforeAll, describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from './actions';
import {
  QUEUE_JUMP_TEAM_REPUTATION,
  QUEUE_JUMP_VIP_SUSPICION,
} from './actions/vip';
import { HALCYON_IDS } from './corporate-company';
import { FIELDS } from './fields';
import { SUSPICION_CLEAN_DRAIN } from './meters';
import { SLA_TARGETS, UNTRIAGED_SLA_TICKS } from './priority';
import { employerFor } from './employers';
import { createWorldSession, type WorldSession } from './session';
import { ticketClocks } from './sla';
import {
  findWorldTicket,
  spawnWorldTicket,
  trueClassification,
  WORLD_TICKETS,
} from './tickets';
import {
  VIP_DEVICE_EXCEPTION,
  VIP_EARBUDS_TICKET,
  VIP_FORCED_PRIORITY,
  VIP_LEDGER_TICKET,
  VIP_SHADOW_EARBUDS_TICKET,
  VIP_TABLET_TICKET,
} from './vip';
import { DayDriver, TICK_INTERVAL_MS } from '../shell/day-driver';
import { loadEngineForTests } from '../engine-api/load-node';

/**
 * The VIP tier (E8, 0.26.0), driven through the REAL session, the REAL dispatch
 * path and the REAL clock - E8's last mechanic and its quietest injustice.
 *
 * The goal, not the call. The mechanic is: a flagged caller's ticket is forced up
 * the queue regardless of what broke; a trivial one of those arrives in the same
 * minute as an ordinary user's real problem; both clocks run and there is one
 * desk; and whichever is left waiting costs something real. So the assertions are
 * about what the player is actually holding - the priority on the ticket, the
 * deadline the engine will breach on, the state the dispatches leave, the meters
 * the wait moves - never about a verb returning ok:
 *
 *  - the flag FORCES the priority and the CLOCK: the earbuds land at P2 with the
 *    forced priority's budget, while the world's own reading of them is the
 *    bottom of the table;
 *  - TEETH (a): take the flag off the caller and the same ticket, byte for byte,
 *    lands untriaged and drops to its true P4 with the loosest clock there is -
 *    and with the flag ON, an honest low/low triage is accepted and the priority
 *    and deadline do not move, which is the forcing rather than a badge;
 *  - the COLLISION presents both with both clocks running, on the same deadline
 *    to the minute, one earned and one flagged;
 *  - working either first is possible - both close through their own paths;
 *  - TEETH (b): whichever waits, a real cost lands, and they are different costs.
 *    Work the earbuds first and the ledger breaches: the fallout is on the ledger
 *    and the standing goes with it. Work the ledger first and the earbuds breach:
 *    the exec goes over your head and the suspicion is charged exactly. There is
 *    no order that costs nothing;
 *  - TEETH (c): the unmanaged device REFUSES the normal management verb by name,
 *    the same verb works on the enrolled phone beside it, and the honest route
 *    (walk it through by hand, get the exception signed) is the only way it closes;
 *  - and nothing else moved: exactly one person on the estate is flagged, and no
 *    ticket written before this is raised by him.
 */

beforeAll(() => {
  loadEngineForTests();
});

interface Notice {
  readonly title: string;
  readonly body: string;
}

function corporate(): WorldSession {
  return createWorldSession({
    farmFund: 0,
    attempt: 1,
    arcWeek: 1,
    employer: 'corporate',
  });
}

/**
 * A driver over the Halcyon session, collecting the notices the day loop raises.
 *
 * It ADOPTS the corporate employer, exactly as a load does: this suite runs the
 * clock forward, and a driver still holding the probation default would spend
 * those minutes dealing the probation shop's week into a building none of those
 * people work in.
 */
function driverFor(session: WorldSession, notices: Notice[] = []): DayDriver {
  const driver = new DayDriver(session.engine, HALCYON_IDS.player, session.seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onNotice: (title, body) => {
      notices.push({ title, body });
    },
  });
  const employer = employerFor('corporate');
  driver.adoptEmployer(
    employer.week,
    employer.channels,
    employer.runsBossPings,
    employer.arc,
  );
  return driver;
}

function ticketState(session: WorldSession, id: string): unknown {
  return session.engine.graph.getField(id, FIELDS.state);
}

/** The minutes a ticket landed with: its deadline measured from its arrival. */
function budgetOf(session: WorldSession, id: string): number {
  const deadline = session.engine.graph.getField(id, FIELDS.slaDeadline);
  const spawned = session.engine.graph.getField(id, FIELDS.spawnedAt);

  if (typeof deadline !== 'number' || typeof spawned !== 'number') {
    throw new Error(`"${id}" has no clock on it.`);
  }

  return deadline - spawned;
}

function meter(session: WorldSession, field: string): number {
  const value = session.engine.graph.getField(HALCYON_IDS.player, field);
  return typeof value === 'number' ? value : 0;
}

/** The two clocks as the queue and the engine read them, for one ticket. */
function clocksOf(session: WorldSession, id: string) {
  const node = session.engine.graph.getNode(id);

  if (node === undefined) {
    throw new Error(`"${id}" is not in the world.`);
  }

  return ticketClocks(node, session.engine.now());
}

/** Drive one of a ticket's advertised paths through the real dispatch, in order. */
function drivePath(
  driver: DayDriver,
  ticketId: string,
  pathId: string,
): readonly boolean[] {
  const entry = findWorldTicket(ticketId);
  const path = entry?.paths.find((candidate) => candidate.id === pathId);

  if (path === undefined) {
    throw new Error(`No path "${pathId}" on "${ticketId}".`);
  }

  return path.steps.map((step) => driver.dispatch(
    step.action,
    HALCYON_IDS.player,
    step.target,
    { ...step.params },
  ).ok);
}

/** Step the shift clock a fixed number of simulated minutes. */
function stepMinutes(driver: DayDriver, minutes: number): void {
  for (let i = 0; i < minutes && driver.state() === 'shift'; i += 1) {
    driver.step(TICK_INTERVAL_MS);
  }
}

/**
 * Run the shift on, a minute at a time, until the wait on this ticket has been
 * billed - and stop in the minute it was.
 *
 * The meters are read in that minute on purpose. Suspicion bleeds away on its
 * own while there is nothing on the screen to hide (`SUSPICION_CLEAN_DRAIN`), so
 * a test that ran on for another hour and then looked would be measuring the
 * drain rather than the charge, and would go green with the charge deleted.
 */
function stepUntilBilled(
  driver: DayDriver,
  session: WorldSession,
  ticketId: string,
): void {
  for (let i = 0; i < 8 * 60 && driver.state() === 'shift'; i += 1) {
    driver.step(TICK_INTERVAL_MS);

    if (typeof session.engine.graph.getField(
      ticketId,
      FIELDS.queueJumpFalloutAt,
    ) === 'number') {
      return;
    }
  }

  throw new Error(`The wait on "${ticketId}" was never billed.`);
}

/**
 * The collision, dealt the way the week deals it: the shift open, both tickets
 * arriving in the same minute, and the clocks running from there.
 */
function collisionReady(): {
  session: WorldSession;
  driver: DayDriver;
  notices: Notice[];
} {
  const session = corporate();
  const notices: Notice[] = [];
  const driver = driverFor(session, notices);
  driver.startShift();
  spawnWorldTicket(session.engine, VIP_EARBUDS_TICKET);
  spawnWorldTicket(session.engine, VIP_LEDGER_TICKET);
  return { session, driver, notices };
}

/** The honest triage of the ledger: medium impact, high urgency, which is a P2. */
function triageLedgerHonestly(driver: DayDriver): boolean {
  return driver.dispatch(
    HELPDESK_ACTIONS.ticketClassify,
    HALCYON_IDS.player,
    VIP_LEDGER_TICKET,
    { impact: 2, urgency: 3, priority: 2 },
  ).ok;
}

describe('the VIP flag forces the priority and the clock (slice 1)', () => {
  it('lands the exec\'s earbuds at the forced priority on the forced budget, '
    + 'while the world\'s own reading of them is the bottom of the table', () => {
    const session = corporate();
    spawnWorldTicket(session.engine, VIP_EARBUDS_TICKET);

    const clocks = clocksOf(session, VIP_EARBUDS_TICKET);

    // Nobody has triaged anything. The priority is the flag's, and the queue can
    // say so - which is the difference between a mechanic and a grumble.
    expect(clocks.vip).toBe(true);
    expect(clocks.priority).toBe(VIP_FORCED_PRIORITY);
    expect(clocks.target).toEqual(SLA_TARGETS[VIP_FORCED_PRIORITY]);

    // And the clock is the forced priority's, from the minute it arrived: TWO
    // hours to resolve rather than the four an untriaged ticket gets.
    expect(budgetOf(session, VIP_EARBUDS_TICKET))
      .toBe(SLA_TARGETS[VIP_FORCED_PRIORITY].resolution);
    expect(SLA_TARGETS[VIP_FORCED_PRIORITY].resolution)
      .toBeLessThan(UNTRIAGED_SLA_TICKS);

    // While what the estate actually supports is one person and no urgency at
    // all - the bottom of the matrix. The gap between these two numbers is the
    // whole of the mechanic.
    expect(trueClassification(session.engine.graph, VIP_EARBUDS_TICKET))
      .toEqual({ impact: 1, urgency: 1, priority: 4 });
  });

  it('stamps the flag from the CALLER, not from the ticket - the ordinary '
    + 'reporter\'s real outage arrives untriaged with the untriaged budget', () => {
    const session = corporate();
    spawnWorldTicket(session.engine, VIP_LEDGER_TICKET);

    const clocks = clocksOf(session, VIP_LEDGER_TICKET);

    expect(clocks.vip).toBe(false);
    expect(clocks.priority).toBeNull();
    expect(budgetOf(session, VIP_LEDGER_TICKET)).toBe(UNTRIAGED_SLA_TICKS);

    // And it is genuinely the worse problem: four people downstream of it, and
    // the reporter is not exaggerating - honestly triaged it is a P2.
    expect(trueClassification(session.engine.graph, VIP_LEDGER_TICKET))
      .toEqual({ impact: 2, urgency: 3, priority: 2 });
  });
});

describe('the flag ACTUALLY forces the priority (teeth a)', () => {
  it('drops the same ticket to its true low priority and the loosest clock in '
    + 'the table once the caller is off the VIP list', () => {
    const session = corporate();
    // The one field, cleared before the ticket is raised: same estate, same
    // ticket, same fault - the caller is simply no longer on the list.
    session.engine.applySetup([
      {
        op: 'setField',
        id: HALCYON_IDS.ceo,
        field: FIELDS.vip,
        value: false,
      },
    ]);
    const driver = driverFor(session);
    driver.startShift();
    spawnWorldTicket(session.engine, VIP_EARBUDS_TICKET);

    // Nothing forced: no flag on the ticket, no priority, and the untriaged
    // budget every ordinary ticket lands with.
    const arrived = clocksOf(session, VIP_EARBUDS_TICKET);
    expect(arrived.vip).toBe(false);
    expect(arrived.priority).toBeNull();
    expect(budgetOf(session, VIP_EARBUDS_TICKET)).toBe(UNTRIAGED_SLA_TICKS);

    // Triaged honestly - one desk, no urgency - it is a P4 with eight hours on
    // it, which is what the fault is actually worth.
    expect(driver.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      HALCYON_IDS.player,
      VIP_EARBUDS_TICKET,
      { impact: 1, urgency: 1, priority: 4 },
    ).ok).toBe(true);

    const triaged = clocksOf(session, VIP_EARBUDS_TICKET);
    expect(triaged.priority).toBe(4);
    expect(triaged.target).toEqual(SLA_TARGETS[4]);
    expect(triaged.resolution.dueAt)
      .toBeGreaterThan(SLA_TARGETS[VIP_FORCED_PRIORITY].resolution);
  });

  it('puts the priority back when the desk triages a flagged ticket honestly - '
    + 'the cell is kept, the number is the flag\'s', () => {
    const session = corporate();
    const driver = driverFor(session);
    driver.startShift();
    spawnWorldTicket(session.engine, VIP_EARBUDS_TICKET);

    const dueBefore = clocksOf(session, VIP_EARBUDS_TICKET).resolution.dueAt;

    // The honest triage of a pair of earbuds, filed and accepted: low impact,
    // low urgency, which the matrix makes a P4.
    expect(driver.dispatch(
      HELPDESK_ACTIONS.ticketClassify,
      HALCYON_IDS.player,
      VIP_EARBUDS_TICKET,
      { impact: 1, urgency: 1, priority: 4 },
    ).ok).toBe(true);

    // The player's reading of the fault is kept exactly as filed - the scorecard
    // grades that, and it was right.
    expect(session.engine.graph.getField(VIP_EARBUDS_TICKET, FIELDS.impact))
      .toBe(1);
    expect(session.engine.graph.getField(VIP_EARBUDS_TICKET, FIELDS.urgency))
      .toBe(1);

    // And the priority is the flag's anyway, on the flag's clock. Nobody gets to
    // triage their way out of the VIP list.
    expect(session.engine.graph.getField(VIP_EARBUDS_TICKET, FIELDS.priority))
      .toBe(VIP_FORCED_PRIORITY);

    const after = clocksOf(session, VIP_EARBUDS_TICKET);
    expect(after.priority).toBe(VIP_FORCED_PRIORITY);
    expect(after.resolution.dueAt).toBe(dueBefore);
  });
});

describe('the collision: two tickets, one desk, both clocks running (slice 2)', () => {
  it('presents both on the same deadline to the minute - one earned it and one '
    + 'was given it', () => {
    const { session, driver } = collisionReady();

    // Both live, both unresolved, both counting.
    expect(ticketState(session, VIP_EARBUDS_TICKET)).toBe('open');
    expect(ticketState(session, VIP_LEDGER_TICKET)).toBe('open');
    expect(clocksOf(session, VIP_EARBUDS_TICKET).resolution.running).toBe(true);
    expect(clocksOf(session, VIP_LEDGER_TICKET).resolution.running).toBe(true);

    // The desk does the right thing by the real one: reads the estate, files the
    // honest cell, and the matrix makes it a P2.
    expect(triageLedgerHonestly(driver)).toBe(true);

    const earbuds = clocksOf(session, VIP_EARBUDS_TICKET);
    const ledger = clocksOf(session, VIP_LEDGER_TICKET);

    // And there it is: the same priority, the same targets, the same minute to
    // resolve by. One of them is four people who cannot pay anybody, and one of
    // them is a pair of earbuds belonging to a man whose name is on a list.
    expect(ledger.priority).toBe(earbuds.priority);
    expect(ledger.target).toEqual(earbuds.target);
    expect(ledger.resolution.dueAt).toBe(earbuds.resolution.dueAt);
    expect(earbuds.vip).toBe(true);
    expect(ledger.vip).toBe(false);
  });

  it('lets either be worked first, and both are legitimately closeable', () => {
    const first = collisionReady();
    expect(drivePath(first.driver, VIP_EARBUDS_TICKET, 'reset-the-earbuds')
      .every(Boolean)).toBe(true);
    expect(ticketState(first.session, VIP_EARBUDS_TICKET)).toBe('resolved');
    // And the other one is still there, still open, still counting - which is
    // the whole of what "you can only do one first" means.
    expect(ticketState(first.session, VIP_LEDGER_TICKET)).toBe('open');

    const second = collisionReady();
    expect(drivePath(second.driver, VIP_LEDGER_TICKET, 'unlock-and-restart')
      .every(Boolean)).toBe(true);
    expect(ticketState(second.session, VIP_LEDGER_TICKET)).toBe('resolved');
    expect(ticketState(second.session, VIP_EARBUDS_TICKET)).toBe('open');

    // Neither is a trap: the ledger really is fixed - the account unlocked and
    // the service running - and the earbuds really do work again.
    expect(second.session.engine.graph.getField(
      HALCYON_IDS.svcLedgerAccount,
      FIELDS.locked,
    )).toBe(false);
    expect(first.session.engine.graph.getField(
      HALCYON_IDS.ceoEarbuds,
      FIELDS.wedged,
    )).toBe(false);
  });
});

describe('whichever waits, a real cost lands (teeth b)', () => {
  it('charges the desk\'s standing when the exec goes first and the team sits '
    + 'blocked', () => {
    const { session, driver, notices } = collisionReady();
    triageLedgerHonestly(driver);

    const before = meter(session, FIELDS.reputation);
    const suspicionBefore = meter(session, FIELDS.suspicion);

    // The earbuds first - the queue's own ordering, and a defensible choice.
    expect(drivePath(driver, VIP_EARBUDS_TICKET, 'reset-the-earbuds')
      .every(Boolean)).toBe(true);

    // And then the morning, spent. The ledger's clock runs out.
    stepUntilBilled(driver, session, VIP_LEDGER_TICKET);

    expect(session.engine.graph.getField(VIP_LEDGER_TICKET, FIELDS.breached))
      .toBe(true);
    // The cost landed on the one that waited, once.
    expect(typeof session.engine.graph.getField(
      VIP_LEDGER_TICKET,
      FIELDS.queueJumpFalloutAt,
    )).toBe('number');
    expect(notices.some((notice) => notice.title === 'The floor noticed'))
      .toBe(true);

    // In standing, and by more than a plain missed deadline: the resolved
    // earbuds pay back credit and the breach charges its usual three, so a drop
    // this size cannot be reached without the queue-jump's own charge.
    expect(before - meter(session, FIELDS.reputation))
      .toBeGreaterThanOrEqual(QUEUE_JUMP_TEAM_REPUTATION);
    // And nobody rang anybody about you: this cost is standing, not scrutiny.
    expect(meter(session, FIELDS.suspicion)).toBe(suspicionBefore);
  });

  it('charges suspicion when the real outage goes first and the flagged caller '
    + 'goes over your head', () => {
    const { session, driver, notices } = collisionReady();
    triageLedgerHonestly(driver);

    const suspicionBefore = meter(session, FIELDS.suspicion);

    // The ledger first - the right call by impact, and the one that leaves an
    // executive standing at your desk.
    expect(drivePath(driver, VIP_LEDGER_TICKET, 'unlock-and-restart')
      .every(Boolean)).toBe(true);

    stepUntilBilled(driver, session, VIP_EARBUDS_TICKET);

    expect(session.engine.graph.getField(VIP_EARBUDS_TICKET, FIELDS.breached))
      .toBe(true);

    // He does not complain to you. He mentions it to the Head of IT, which is
    // exactly what the flag is for - and it is charged as scrutiny, in the
    // minute the clock ran out. The band is the one minute of clean-screen
    // drain that can be billed in the same minute; nothing without the charge
    // reaches it, because nothing else in this world moves suspicion at all.
    expect(meter(session, FIELDS.suspicion))
      .toBeGreaterThanOrEqual(
        suspicionBefore + QUEUE_JUMP_VIP_SUSPICION - SUSPICION_CLEAN_DRAIN,
      );
    expect(meter(session, FIELDS.suspicion))
      .toBeLessThanOrEqual(suspicionBefore + QUEUE_JUMP_VIP_SUSPICION);
    expect(notices.some(
      (notice) => notice.title === 'The exec has gone over your head',
    )).toBe(true);
  });

  it('charges once, however long the ticket is left', () => {
    const { session, driver, notices } = collisionReady();
    triageLedgerHonestly(driver);
    drivePath(driver, VIP_LEDGER_TICKET, 'unlock-and-restart');

    stepUntilBilled(driver, session, VIP_EARBUDS_TICKET);
    const billedAt = session.engine.graph.getField(
      VIP_EARBUDS_TICKET,
      FIELDS.queueJumpFalloutAt,
    );
    const told = notices.filter(
      (notice) => notice.title === 'The exec has gone over your head',
    ).length;

    // Another hour of it sitting there breached bills nothing further: the
    // latch on the ticket is what stops a wait being charged for every minute
    // of itself, and he only rings your manager once.
    stepMinutes(driver, 60);
    expect(session.engine.graph.getField(
      VIP_EARBUDS_TICKET,
      FIELDS.queueJumpFalloutAt,
    )).toBe(billedAt);
    expect(notices.filter(
      (notice) => notice.title === 'The exec has gone over your head',
    ).length).toBe(told);
    expect(told).toBe(1);
  });
});

describe('the shadow-IT tail: the device you cannot manage and cannot refuse '
  + '(slice 3)', () => {
  it('refuses the management verb on the unenrolled tablet and takes it on the '
    + 'enrolled phone - the same verb, the enrolment the whole difference '
    + '(teeth c)', () => {
    const session = corporate();
    const driver = driverFor(session);
    driver.startShift();
    spawnWorldTicket(session.engine, VIP_TABLET_TICKET);

    const refused = driver.dispatch(
      HELPDESK_ACTIONS.mdmPushProfile,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoTablet,
      {},
    );

    // Refused, and refused HONESTLY: the sentence names enrolment, which is the
    // thing the desk actually lacks. Nothing was written to the device.
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason).toContain('not enrolled');
    expect(session.engine.graph.getField(
      HALCYON_IDS.ceoTablet,
      FIELDS.mailProfileOk,
    )).toBe(false);

    // The same verb, one dispatch later, on the device the company owns: it
    // works, because that one is enrolled.
    expect(driver.dispatch(
      HELPDESK_ACTIONS.mdmPushProfile,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoPhone,
      {},
    ).ok).toBe(true);
    expect(session.engine.graph.getField(
      HALCYON_IDS.ceoPhone,
      FIELDS.mailProfileOk,
    )).toBe(true);

    // And the tablet is fixable, by hand, with the man holding it - which is
    // the only route there is, and it is a real state change.
    expect(driver.dispatch(
      HELPDESK_ACTIONS.deviceManualMailSetup,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoTablet,
      {},
    ).ok).toBe(true);
    expect(session.engine.graph.getField(
      HALCYON_IDS.ceoTablet,
      FIELDS.mailProfileOk,
    )).toBe(true);
  });

  it('closes only when the exception is on file as well - fixing it quietly is '
    + 'not closing it', () => {
    const quiet = corporate();
    const quietDriver = driverFor(quiet);
    quietDriver.startShift();
    spawnWorldTicket(quiet.engine, VIP_TABLET_TICKET);

    // Both devices working, nothing written down.
    expect(quietDriver.dispatch(
      HELPDESK_ACTIONS.mdmPushProfile,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoPhone,
      {},
    ).ok).toBe(true);
    expect(quietDriver.dispatch(
      HELPDESK_ACTIONS.deviceManualMailSetup,
      HALCYON_IDS.player,
      HALCYON_IDS.ceoTablet,
      {},
    ).ok).toBe(true);
    expect(ticketState(quiet, VIP_TABLET_TICKET)).not.toBe('resolved');

    // The signature is the rest of the job: the accepting owner's name against a
    // risk nobody else is going to carry.
    expect(quietDriver.dispatch(
      HELPDESK_ACTIONS.riskAcceptanceSign,
      HALCYON_IDS.player,
      VIP_DEVICE_EXCEPTION,
      {},
    ).ok).toBe(true);
    expect(quiet.engine.graph.getField(
      VIP_DEVICE_EXCEPTION,
      FIELDS.crAcceptedBy,
    )).toBe(HALCYON_IDS.managerAccount);
    expect(ticketState(quiet, VIP_TABLET_TICKET)).toBe('resolved');
  });

  it('is workable end to end on its advertised path', () => {
    const session = corporate();
    const driver = driverFor(session);
    driver.startShift();
    spawnWorldTicket(session.engine, VIP_TABLET_TICKET);

    expect(
      drivePath(driver, VIP_TABLET_TICKET, 'push-what-you-can-walk-what-you-cannot')
        .every(Boolean),
    ).toBe(true);
    expect(ticketState(session, VIP_TABLET_TICKET)).toBe('resolved');

    // And it is a VIP ticket too - the flag is about the caller, so the tablet
    // arrives at the forced priority exactly as the earbuds do.
    expect(clocksOf(session, VIP_TABLET_TICKET).vip).toBe(true);
  });
});

describe('the flag moves nothing that came before it', () => {
  it('is ticked for exactly one person, and no ticket written before this is '
    + 'raised by him', () => {
    const session = corporate();
    const flagged = session.engine.graph
      .nodesOfKind('person')
      .filter((person) => person.fields[FIELDS.vip] === true)
      .map((person) => person.id);

    expect(flagged).toEqual([HALCYON_IDS.ceo]);

    // Every ticket in the shared roster that the CEO reports is one of this
    // version's own. Nothing shipped before it can have had its priority forced,
    // because none of it is raised by the only person on the list.
    const his = WORLD_TICKETS
      .filter((entry) => entry.def.reporter === HALCYON_IDS.ceo)
      .map((entry) => entry.def.id);

    expect(his).toEqual([VIP_EARBUDS_TICKET, VIP_TABLET_TICKET]);
  });
});

/* -- the shadow VIP (E9, 0.37.0) ------------------------------------------ */

/**
 * The flag keys off the BENEFICIARY, driven on the shipped world.
 *
 * This is the half of the real rule the collision could not show, because both
 * of its tickets are typed by the person they are about. A VIP list covers the
 * executive AND whoever files for him: the flag is a fact about who the ticket
 * is FOR, so an assistant nobody has ever heard of raising a ticket for a man on
 * the list jumps the queue exactly as far as he does. It is the same lesson the
 * audit rung bills a junior for missing (`audit.ts`: "It keys off the
 * beneficiary"), made true at the seam that actually stamps the flag.
 *
 * TEETH: key the spawn back off `entry.def.reporter` and the first test here
 * goes red in three places at once - Denise is not on the list, so the ticket
 * lands unflagged, at no forced priority, on the untriaged clock. The last test
 * is the other direction: every ticket that names nobody is still the reporter's
 * own flag, so the change cannot have moved anything that came before it.
 */
describe('a ticket raised on somebody else\'s behalf', () => {
  it('takes the flag from the person it is FOR, not from the person who typed '
    + 'it', () => {
    const session = corporate();
    const entry = findWorldTicket(VIP_SHADOW_EARBUDS_TICKET);

    // The reporter is an ordinary member of staff, and the estate says so. If
    // this ever stops being true the test below proves nothing.
    expect(entry?.def.reporter).toBe(HALCYON_IDS.ea);
    expect(session.engine.graph.getField(HALCYON_IDS.ea, FIELDS.vip))
      .not.toBe(true);
    expect(entry?.beneficiary).toBe(HALCYON_IDS.ceo);

    spawnWorldTicket(session.engine, VIP_SHADOW_EARBUDS_TICKET);

    const clocks = clocksOf(session, VIP_SHADOW_EARBUDS_TICKET);

    // Forced, on the arithmetic that matters: the flag on the ticket, the
    // priority both clocks are measured against, and the resolution budget it
    // actually landed with - two hours rather than the four an untriaged ticket
    // gets, before anybody has read a word of it.
    expect(clocks.vip).toBe(true);
    expect(clocks.priority).toBe(VIP_FORCED_PRIORITY);
    expect(budgetOf(session, VIP_SHADOW_EARBUDS_TICKET))
      .toBe(SLA_TARGETS[VIP_FORCED_PRIORITY].resolution);
    expect(budgetOf(session, VIP_SHADOW_EARBUDS_TICKET))
      .toBeLessThan(UNTRIAGED_SLA_TICKS);
  });

  it('says on the ticket whose it is, so the forced priority has a name', () => {
    const session = corporate();
    spawnWorldTicket(session.engine, VIP_SHADOW_EARBUDS_TICKET);

    // The line is resolved off the estate rather than authored twice, so it is
    // the name and title the directory carries for him.
    expect(session.engine.graph.getField(
      VIP_SHADOW_EARBUDS_TICKET,
      FIELDS.beneficiary,
    )).toBe('Roland Cushing-Vane, Chief Executive Officer');
  });

  it('is closeable on its advertised path, and it is a different pair of '
    + 'earbuds from Thursday\'s', () => {
    const session = corporate();
    const driver = driverFor(session);
    driver.startShift();
    spawnWorldTicket(session.engine, VIP_SHADOW_EARBUDS_TICKET);

    expect(
      drivePath(driver, VIP_SHADOW_EARBUDS_TICKET, 'reset-the-travel-earbuds')
        .every(Boolean),
    ).toBe(true);
    expect(ticketState(session, VIP_SHADOW_EARBUDS_TICKET)).toBe('resolved');

    // The first pair is untouched by it. Two tickets watching one device would
    // be one reset closing both, and the Friday beat would be Thursday's ticket
    // under another title.
    expect(findWorldTicket(VIP_SHADOW_EARBUDS_TICKET)?.nodes)
      .not.toContain(HALCYON_IDS.ceoEarbuds);
    expect(session.engine.graph.getField(
      HALCYON_IDS.ceoEarbuds,
      FIELDS.wedged,
    )).not.toBe(false);
  });

  it('leaves every ticket that names nobody keyed to its own reporter', () => {
    const session = corporate();
    spawnWorldTicket(session.engine, VIP_EARBUDS_TICKET);
    spawnWorldTicket(session.engine, VIP_LEDGER_TICKET);

    // The exec's own ticket: flagged, because he typed it, and carrying no
    // beneficiary at all - there is nobody it is raised on behalf of.
    expect(clocksOf(session, VIP_EARBUDS_TICKET).vip).toBe(true);
    expect(session.engine.graph.getField(
      VIP_EARBUDS_TICKET,
      FIELDS.beneficiary,
    )).toBeUndefined();

    // And the ordinary user's: not flagged, not stamped, exactly as before.
    expect(clocksOf(session, VIP_LEDGER_TICKET).vip).toBe(false);
    expect(session.engine.graph.getField(
      VIP_LEDGER_TICKET,
      FIELDS.beneficiary,
    )).toBeUndefined();

    // Said once for the whole roster: one ticket names a beneficiary, and it is
    // this one. A second would need its own reason to exist.
    expect(
      WORLD_TICKETS
        .filter((entry) => entry.beneficiary !== undefined)
        .map((entry) => entry.def.id),
    ).toEqual([VIP_SHADOW_EARBUDS_TICKET]);
  });
});
