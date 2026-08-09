/**
 * The solvability gate: every shipped ticket, every advertised path, driven.
 *
 * This is the milestone's signature gate and it is deliberately paranoid,
 * because the failure it exists to catch is the worst one this product has. A
 * ticket that cannot be closed is not a crash and not a wrong number: it is a
 * row in a queue, with a clock on it, in front of somebody who has read the
 * article, tried the thing the article says, watched it be refused, and
 * concluded that they have misunderstood their own job. Nothing else in the
 * build can find that, because from every other angle the content looks fine.
 *
 * So it asserts the OUTCOME rather than the call. For each ticket and each of
 * the ways its own content advertises closing it:
 *
 * - the ticket spawns OPEN. Nothing in this world ships an archetype that
 *   arrives already solved, so a ticket that resolves the moment it is raised
 *   is content whose fault does not exist yet - the commonest way a rewritten
 *   setup goes wrong, and invisible in play except as a free point;
 * - every step of the path is DRIVEN, through the shipped action registry,
 *   against the shipped world, in order, with the shipped guards;
 * - every step but the last leaves it open;
 * - the last one closes it;
 * - and every step is LEFT OUT once, from a fresh world, and the ticket must
 *   not close without it.
 *
 * That last claim is the one this file was rebuilt for. Without it the gate
 * proved only that a path ENDS in a close, so a path of
 * `[some unrelated mutation that works, the actual fix]` passed: the target
 * was open after step one because step one had nothing to do with it, and
 * resolved after step two because step two was the whole repair. Every
 * decorative step in the roster would have been invisible, and "this is how
 * you close it" would have been teaching a ritual.
 *
 * A chain is built by RESOLVING ITS PREDECESSOR through the shipped day driver
 * rather than by spawning the follower directly. Send-As was being tested in a
 * world where the mailbox ticket had never happened, which is not a state the
 * game can be in - and the state it can be in is the one where the grant that
 * raised it has already been made.
 *
 * It runs at the graph level and not through the UI on purpose: this is the
 * proof that the CONTENT is coherent, and a UI test would be proving the
 * buttons as well and failing for two reasons at once. The buttons have their
 * own journeys.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import type { ReadOnlyGraphView, TicketDef } from '../../engine-api';
import { DayDriver } from '../../shell/day-driver';
import { HELPDESK_ACTIONS } from '../actions';
import { CAUGHT_MINUTES } from '../boss';
import { COMPANY_IDS } from '../company';
import { buildDaySchedule, shiftStartTick } from '../day';
import { FIELDS } from '../fields';
import { spoolDisagreements, storedDisagreements } from '../fs';
import {
  lunchWindow,
  minuteOfDay,
  serviceDeadline,
  shiftWindow,
  type TickWindow,
} from '../hours';
import {
  buildInterruptionSchedule,
  clearMinutes,
  type InterruptionSlot,
  worstCaseWindows,
} from '../interruptions';
import {
  DEFAULT_PRESENCE,
  type Presence,
  PRESENCE_VALUES,
} from '../presence';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { TICKET_HYGIENE_SYNC } from '../scenes/meeting';
import { createWorldSession, seedForAttempt, type WorldSession } from '../session';
import { type Employer, EMPLOYER_IDS, employerFor } from '../employers';
import { dayPlan, interruptionPlanFor, WEEK_DAYS } from '../week';
import { BODGE_TICKETS } from './bodge';
import { CORPORATE_TICKETS } from './corporate';
import { mspOnboardingSetup } from '../msp-company';
import { ardenEdgeKickoffSetup } from '../project';
import { MSP_TICKETS } from './msp';
import {
  ARDEN_EDGE_TASKS,
  PROJECT_TASK_TICKETS,
  PROJECT_TICKETS,
} from './project';
import {
  defForSpawn,
  findWorldTicket,
  ticketsNeededFor,
  WORLD_TICKETS,
  spawnWorldTicket,
} from './index';
import type { TicketActionStep, WorldTicket } from './types';

beforeAll(() => {
  loadEngineForTests();
});

/**
 * How long a sweep that stands up a world PER TICKET is allowed to take.
 *
 * The roster is four employers deep now and every row below gets its own fresh
 * estate. Five seconds was the default and the content crossed it, which is a
 * fact about how much of this game there is rather than about anything being
 * slow - and a gate that fitted inside a default by covering fewer rows would
 * be worse than a slow one.
 */
const ROSTER_SWEEP_MS = 30_000;

/** A driver over a session, wired to nothing: this gate watches the graph. */
function driverFor(session: WorldSession): DayDriver {
  return new DayDriver(session.engine, COMPANY_IDS.player, session.seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
  });
}

/**
 * A world with this ticket in it, raised the way the game raises it.
 *
 * A summoned ticket is NOT spawned: it is earned. Its predecessor is put into
 * the world, driven to a close through the shipped driver, and the driver
 * raises the follower in the same minute - which is both the mechanism and the
 * only state a player can meet this ticket in. Spawning it directly tested
 * Send-As against a mailbox nobody had ever been given access to, so the
 * ticket the player actually gets - the one where the grant has been made and
 * only the second permission is missing - was never driven at all.
 *
 * Everything else is spawned, along with anything its own steps name: a
 * duplicate is attached to a parent and then closed with it, so the parent has
 * to have been raised, which is true in play because a flood arrives together.
 */
/**
 * The employer a ticket belongs to (0.6.0 slice 3). The roster is shared across
 * both shops, so a ticket has to be spawned into the estate it is about - a
 * Bodgeworth fault into the Bodgeworth world, or the reporter and the nodes it
 * names do not exist. Only one world is ever stood up per session; this is how
 * the gate stands up the RIGHT one for each row.
 */
const BODGE_TICKET_IDS = new Set(BODGE_TICKETS.map((entry) => entry.def.id));
const BODGE_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'bodgeworth',
});
const MSP_TICKET_IDS = new Set(MSP_TICKETS.map((entry) => entry.def.id));
const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});
const CORPORATE_TICKET_IDS = new Set(
  CORPORATE_TICKETS.map((entry) => entry.def.id),
);
const CORPORATE_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'corporate',
});

const PROJECT_TICKET_IDS = new Set(
  PROJECT_TICKETS.map((entry) => entry.def.id),
);

/**
 * The project's world (E10, 0.29.0): the MSP, plus the project itself stood up.
 *
 * The ESTATE a project task touches is seeded with the customer, so the boxes,
 * the circuit and the rule set are already there - but the PROJECT node is not,
 * because its dates are baked against the minute somebody was handed the job.
 * The gate stands it up the way the day driver does, at the world's own clock,
 * for the same reason it stands the signed-up onboarding client up: a task is
 * proven solvable against the world it is actually met in, and a cutover with no
 * project to stamp is a state the game cannot be in.
 *
 * The PARENT delivery ticket gets one thing more: its four tasks, in the world
 * with it. Its rule is an enumeration over them by name (the assertion language
 * cannot quantify), so a world without them is a world where the parent could
 * never close - and the ARRIVAL of those tasks is proven separately and
 * properly, by the chain gate below, which closes each one's predecessor through
 * the shipped driver and requires the next to turn up.
 */
function projectWorld(entry: Readonly<WorldTicket>): WorldSession {
  const session = createWorldSession(MSP_CARRY);
  session.engine.applySetup(ardenEdgeKickoffSetup(session.engine.now()));

  if (entry.def.id === ARDEN_EDGE_TASKS.parent) {
    for (const id of PROJECT_TASK_TICKETS) {
      if (id !== entry.def.id) {
        spawnWorldTicket(session.engine, id);
      }
    }
  }

  return session;
}

function carryFor(entry: Readonly<WorldTicket>): WorldSession {
  if (PROJECT_TICKET_IDS.has(entry.def.id)) {
    return projectWorld(entry);
  }

  if (BODGE_TICKET_IDS.has(entry.def.id)) {
    return createWorldSession(BODGE_CARRY);
  }

  if (CORPORATE_TICKET_IDS.has(entry.def.id)) {
    return createWorldSession(CORPORATE_CARRY);
  }

  if (MSP_TICKET_IDS.has(entry.def.id)) {
    const session = createWorldSession(MSP_CARRY);
    // The onboarding customer (0.13.0) signs mid-week and is not in the boot
    // estate, so a ticket about it - the backup discovery - has no reporter or
    // estate to spawn against until the event has fired. The gate proves every
    // ticket solvable against the estate it is ABOUT, so it stands the signed-up
    // client up the way the day driver does, then spawns the ticket into it.
    session.engine.applySetup(mspOnboardingSetup());
    return session;
  }

  return createWorldSession();
}

function freshWorld(entry: Readonly<WorldTicket>): WorldSession {
  return carryFor(entry);
}

function worldFor(entry: Readonly<WorldTicket>): WorldSession {
  const session = freshWorld(entry);

  if (entry.follows !== undefined) {
    raiseByFixing(session, entry.follows, entry.def.id);
    return session;
  }

  for (const id of ticketsNeededFor(entry)) {
    if (session.engine.graph.getNode(id) === undefined) {
      spawnWorldTicket(session.engine, id);
    }
  }

  return session;
}

/** Closes the predecessor through the driver, so it raises the follower. */
function raiseByFixing(
  session: WorldSession,
  predecessorId: string,
  expected: string,
): void {
  const predecessor = findWorldTicket(predecessorId);

  if (predecessor === undefined) {
    throw new Error(`Nobody wrote "${predecessorId}".`);
  }

  const driver = driverFor(session);

  // A chain longer than two, walked from its own beginning (E10, 0.29.0). A
  // project's phases are a four-link chain - audit raises staging raises cutover
  // raises handover - and driving only the immediate predecessor tested the
  // staging config in a world where nobody had ever audited the box, which is
  // not a state the game can be in and which the staging verbs correctly refuse.
  // So the predecessor is itself raised the way IT is raised, all the way back
  // to the link nobody follows, and each is spawned only if the fix before it
  // has not already put it there.
  if (predecessor.follows !== undefined) {
    raiseByFixing(session, predecessor.follows, predecessorId);
  }

  if (session.engine.graph.getNode(predecessorId) === undefined) {
    spawnWorldTicket(session.engine, predecessorId);
  }

  const first = predecessor.paths[0];

  if (first === undefined) {
    throw new Error(`"${predecessorId}" advertises no way to close it.`);
  }

  for (const step of first.steps) {
    const result = driver.dispatch(
      step.action,
      COMPANY_IDS.player,
      step.target,
      { ...step.params },
    );

    if (!result.ok) {
      throw new Error(
        `Closing "${predecessorId}" to raise "${expected}" was refused at `
        + `"${step.action}": ${result.reason}`,
      );
    }
  }

  if (session.engine.ticketState(predecessorId) !== 'resolved') {
    throw new Error(
      `"${predecessorId}" did not close, so "${expected}" was never raised.`,
    );
  }

  if (session.engine.graph.getNode(expected) === undefined) {
    throw new Error(
      `Closing "${predecessorId}" did not raise "${expected}". The chain is `
      + 'declared and the day loop did not act on it.',
    );
  }
}

interface StepOutcome {
  readonly ok: boolean;
  readonly reason: string;
}

function drive(
  session: WorldSession,
  step: Readonly<TicketActionStep>,
): StepOutcome {
  const result = session.engine.dispatch(
    step.action,
    COMPANY_IDS.player,
    step.target,
    { ...step.params },
  );

  return result.ok
    ? { ok: true, reason: '' }
    : { ok: false, reason: result.reason };
}

/**
 * One ticket, one advertised path, every claim it makes - as a list of the
 * ones it broke.
 *
 * A list rather than an assertion so the same function can be pointed at a
 * fixture that is MEANT to break, which is the only way to know this gate has
 * teeth. See the meta-test at the bottom of the file.
 */
export function auditPath(
  entry: Readonly<WorldTicket>,
  pathId: string,
  build: (entry: Readonly<WorldTicket>) => WorldSession = worldFor,
): readonly string[] {
  const path = entry.paths.find((candidate) => candidate.id === pathId);

  if (path === undefined) {
    return [`"${entry.def.id}" has no path called "${pathId}".`];
  }

  const ticketId = entry.def.id;
  const complaints: string[] = [];
  const session = build(entry);

  if (session.engine.ticketState(ticketId) !== 'open') {
    complaints.push(
      `${ticketId} did not arrive open: it is `
      + `${String(session.engine.ticketState(ticketId))}. A ticket about a `
      + 'fault that is not there is a free point.',
    );
    return complaints;
  }

  path.steps.forEach((step, index) => {
    const outcome = drive(session, step);

    if (!outcome.ok) {
      complaints.push(
        `${ticketId}/${path.id} step ${String(index + 1)} `
        + `("${step.action}" on "${step.target}") was refused: `
        + outcome.reason,
      );
      return;
    }

    // Every step, not only the ones about printing: the queue and the spool
    // directory are two windows onto one pile, and the mutation that takes
    // them apart is exactly the one nobody thinks to look at afterwards.
    //
    // The same question of the other pile the world holds twice: what a
    // directory a program fills LISTS, against the byte total the drive gets
    // back when somebody empties it. A purge that moved one and not the other
    // would be a drive that had gained three hundred megabytes and a listing
    // that still said where they were.
    complaints.push(...[
      ...spoolDisagreements(session.engine.graph),
      ...storedDisagreements(session.engine.graph),
    ].map(
      (complaint) => `${ticketId}/${path.id} after step `
        + `${String(index + 1)}: ${complaint}`,
    ));

    const state = session.engine.ticketState(ticketId);
    const last = index === path.steps.length - 1;

    if (last && state !== 'resolved') {
      complaints.push(
        `${ticketId}/${path.id} ran out of steps and the ticket is still `
        + `${String(state)}.`,
      );
    }

    if (!last && state === 'resolved') {
      complaints.push(
        `${ticketId}/${path.id} closed at step ${String(index + 1)}, with `
        + `${String(path.steps.length - index - 1)} step(s) still advertised.`,
      );
    }
  });

  complaints.push(...auditNecessity(entry, pathId, build));
  return complaints;
}

/**
 * Every step left out once, from a fresh world.
 *
 * This is the half that proves the path is a path rather than a ritual. A step
 * the close does not depend on either has to say so on itself - and then it is
 * checked the other way round, so the claim cannot be a way of silencing a
 * real failure - or it is a decorative step, which is a lie about how the job
 * is done written into the only place the player is told how to do it.
 */
function auditNecessity(
  entry: Readonly<WorldTicket>,
  pathId: string,
  build: (entry: Readonly<WorldTicket>) => WorldSession,
): readonly string[] {
  const path = entry.paths.find((candidate) => candidate.id === pathId);

  if (path === undefined || path.steps.length < 2) {
    return [];
  }

  const ticketId = entry.def.id;
  const complaints: string[] = [];

  path.steps.forEach((omitted, index) => {
    const session = build(entry);

    for (const [position, step] of path.steps.entries()) {
      if (position === index) {
        continue;
      }

      drive(session, step);
    }

    const closed = session.engine.ticketState(ticketId) === 'resolved';

    if (omitted.optional_for_closure === true && !closed) {
      complaints.push(
        `${ticketId}/${path.id} step ${String(index + 1)} `
        + `("${omitted.action}") is declared not to matter to the close, and `
        + 'without it the ticket does not close. The declaration is wrong, '
        + 'which means the gate was being told to look away from a real step.',
      );
      return;
    }

    if (omitted.optional_for_closure !== true && closed) {
      complaints.push(
        `${ticketId}/${path.id} closes without step ${String(index + 1)} `
        + `("${omitted.action}" on "${omitted.target}"). A step the close does `
        + 'not depend on is a ritual the article is teaching, unless it is '
        + 'declared `optional_for_closure` and means it.',
      );
    }
  });

  return complaints;
}

describe('every shipped ticket is solvable', () => {
  describe.each(WORLD_TICKETS.map((entry) => [entry.def.id, entry] as const))(
    '%s',
    (ticketId, entry) => {
      it.each(entry.paths.map((path) => [path.id, path] as const))(
        'closes through the %s path, and needs every step of it',
        (pathId) => {
          expect(auditPath(entry, pathId), ticketId).toEqual([]);
        },
      );

      /**
       * And it does not close on its own. A minute of clock, no dispatches:
       * anything that resolves here has a resolution rule the world already
       * satisfies, which is a ticket about a fault that is not there.
       */
      it('stays open until somebody actually does something', () => {
        const session = worldFor(entry);
        session.engine.advance(1);
        expect(session.engine.ticketState(ticketId)).toBe('open');
      });
    },
  );

  /**
   * The same claim once more over the whole roster, in one assertion, so the
   * failure message names every offender at once rather than the first.
   *
   * No archetype in this world ships pre-solved. If one ever does - a ticket
   * that exists to be triaged and closed with a word, say - this is the test
   * that has to say so out loud, by naming it, rather than being deleted.
   */
  it('ships nothing that is already fixed when it arrives', () => {
    const solvedOnArrival: string[] = [];

    // Each ticket into its own employer's world (0.6.0 slice 3): a Bodgeworth
    // fault spawned into the probation estate would fail to raise for a missing
    // reporter, which is a different bug from the one this gate is about.
    for (const entry of WORLD_TICKETS) {
      const session = freshWorld(entry);

      if (session.engine.graph.getNode(entry.def.id) === undefined) {
        spawnWorldTicket(session.engine, entry.def.id);
      }

      if (session.engine.ticketState(entry.def.id) === 'resolved') {
        solvedOnArrival.push(entry.def.id);
      }
    }

    expect(solvedOnArrival).toEqual([]);
  }, ROSTER_SWEEP_MS);

  /**
   * Every ticket in the roster gets driven by the block above. Asserted rather
   * than assumed, because `describe.each` over an empty list passes in silence
   * and a filter typed into this file at four in the afternoon would turn the
   * milestone's signature gate into a test that runs nothing.
   */
  it('covers the whole roster and more than one way through it', () => {
    expect(WORLD_TICKETS.length).toBeGreaterThanOrEqual(20);
    expect(
      WORLD_TICKETS.flatMap((entry) => entry.paths).length,
    ).toBeGreaterThan(WORLD_TICKETS.length);
  });

  /** And every chain in the roster is raised by its own predecessor. */
  it('drives every summoned ticket through the fix that raises it', () => {
    const chained = WORLD_TICKETS.filter(
      (entry) => entry.follows !== undefined,
    );

    expect(chained.length).toBeGreaterThan(0);

    for (const entry of chained) {
      const session = worldFor(entry);
      // The predecessor is closed and this one is open, in the same world.
      expect(session.engine.ticketState(entry.follows ?? ''), entry.def.id)
        .toBe('resolved');
      expect(session.engine.ticketState(entry.def.id), entry.def.id)
        .toBe('open');
    }
  });
});

/* -- solvable under the worst schedule the week can deal ------------------- */

/**
 * The other half of solvable, and the half a timeless audit cannot see.
 *
 * Everything above proves a path CLOSES its ticket. It says nothing about
 * whether the player was ever at the desk to drive it, and 0.3.0 puts things
 * on the calendar that take the screen away: a call, a callback twenty minutes
 * later, and half an hour in a room nobody can leave. A ticket whose entire
 * service window is spoken for is not a hard ticket - it is a row with a clock
 * on it that the player was never given a minute to touch, which is precisely
 * the failure the whole solvability gate exists for, arriving by a door the
 * gate did not have.
 *
 * So: for every ticket the week deals, against the WORST schedule the day can
 * produce - every interruption taken at the latest minute it can be taken at,
 * on top of the lead's rounds and lunch - there has to be clear air inside the
 * ticket's own service window.
 *
 * It is arithmetic against the shipped content rather than a walked world on
 * purpose. The question is about the CALENDAR, and a world would answer it
 * with one week of one seed while the calendar answers it for the week as
 * authored.
 */

/**
 * The clear minutes a ticket needs inside its own deadline before this gate
 * calls it reachable.
 *
 * `CAUGHT_MINUTES` - ten - and it is borrowed rather than invented, because
 * this world already has a unit for "a chunk of the shift somebody lost": it
 * is what a conversation in the corridor costs. A ticket with less clear air
 * than one telling-off is a ticket the day did not really deal.
 */
const CLEAR_MINUTES_NEEDED = CAUGHT_MINUTES;

/** When a ticket the week deals turns up, when anybody could start it, and
 * when the clock on it runs out. */
interface Dealt {
  readonly id: string;
  /** The first minute of the shift it could be worked in. */
  readonly workableFrom: number;
  readonly due: number;
}

/**
 * A shop's world, stood up once and read for its clocks.
 *
 * The deadline a ticket actually lands with is settled at SPAWN, against the
 * estate it is about: a Gold customer's fault gets three hours where the
 * authored line says four, a flagged caller's gets two. So the feasibility
 * arithmetic cannot be done off `def.sla_ticks` - that is the number for an
 * in-house ticket in an in-house shop, and two of the four shipped weeks are
 * neither. It reads the world the shop opens with, plus whatever signs during
 * the week, because a customer taken on on Wednesday is on a real contract by
 * Wednesday afternoon and their tickets are on its clock.
 *
 * Cached per employer: four worlds for the whole gate rather than one per day
 * per dot, which would be sixty.
 */
const ESTATES = new Map<string, ReadOnlyGraphView>();

function estateOf(employer: Employer): ReadOnlyGraphView {
  const cached = ESTATES.get(employer.id);

  if (cached !== undefined) {
    return cached;
  }

  const session = createWorldSession({
    farmFund: 0,
    attempt: 1,
    arcWeek: 1,
    employer: employer.id,
  });

  if (employer.id === MSP_CARRY.employer) {
    session.engine.applySetup(mspOnboardingSetup());
  }

  ESTATES.set(employer.id, session.engine.graph);

  return session.engine.graph;
}

function dealtOn(
  day: number,
  seed: number,
  employer: Employer = employerFor(),
): readonly Dealt[] {
  const graph = estateOf(employer);

  return buildDaySchedule(day, seed, dayPlan(day, employer.week)).arrivals
    .map((arrival) => {
      const entry = findWorldTicket(arrival.ticketId);

      if (entry === undefined) {
        throw new Error(
          `Day ${String(day)} deals "${arrival.ticketId}", which nobody wrote.`,
        );
      }

      return {
        id: arrival.ticketId,
        // A ticket inherited at eight o'clock is a ticket nobody is paid to
        // look at until nine, so the window it can be WORKED in starts at the
        // shift even though the clock on it started earlier.
        workableFrom: Math.max(arrival.tick, shiftStartTick(day)),
        // Through the same function the spawner uses, so the gate and the game
        // cannot hold two opinions about when this ticket goes red.
        due: serviceDeadline(
          arrival.tick,
          defForSpawn(entry, graph, arrival.tick).sla_ticks,
        ),
      };
    });
}

/** A ticket the day dealt, and how many minutes of it nobody else had. */
interface ClearAir {
  readonly id: string;
  readonly clear: number;
}

/**
 * The arithmetic, before it is turned into a complaint.
 *
 * Separated from `auditDayTiming` so the numbers can be asserted on directly.
 * A gate that only ever sees "complaint or no complaint" cannot tell the
 * difference between a ticket with eleven clear minutes and one with two
 * hundred, and one of the two bugs in this file's history was exactly that
 * distinction: minutes counted on a day the week does not have still cleared
 * the bar, so the miscount was invisible from the outside.
 */
export function clearAirOn(
  day: number,
  seed: number,
  /**
   * WHOSE five days are being audited.
   *
   * It used to be nobody's and therefore the probation shop's: `dayPlan` and
   * `interruptionPlanFor` both default to `WEEK`, so a gate that never named a
   * week was asking about the first employer's Monday four times and calling it
   * coverage. Three shipped weeks - Bodgeworth, the MSP, Halcyon Grange - had
   * never been through this arithmetic once, and a shop whose calendar swallows
   * a ticket is exactly as broken as the probation shop would be, with the
   * additional problem that nobody was looking.
   *
   * The whole employer rather than its `week` table, because a week is only
   * half of what decides whether a ticket is reachable: the other half is the
   * estate it is about and the clock that estate buys.
   */
  employer: Employer = employerFor(),
  extra: readonly InterruptionSlot[] = [],
  // The lead's rounds, overridable ONLY so the meta-test below can construct
  // a day whose bookings it chose. Every real caller takes the day's own.
  rounds?: readonly TickWindow[],
  /**
   * And the dot the day is walked under.
   *
   * A status is a thing the player holds all day if they like, so "the worst
   * schedule" is three different questions and the gate has to ask all three.
   * Do not disturb is the only one that moves anything, and it moves it by
   * sliding declinable calls - which frees the minutes they were going to
   * take and books later ones instead, and either of those can be the thing
   * that makes a ticket unreachable.
   */
  presence: Presence = DEFAULT_PRESENCE,
  /**
   * How many nights the audit is allowed to look past the arriving day.
   *
   * Two by default, which is one more than the longest target in the ladder
   * can span. It is a parameter ONLY so the meta-test below can ask the older,
   * narrower question - "is this reachable today" - and watch the 4:55 class
   * fail it, which is the proof that the class genuinely needs tomorrow and
   * that the gate has not simply been widened until everything passes.
   */
  daysAhead = 2,
): readonly ClearAir[] {
  /**
   * The minutes somebody else has already spoken for on a given day.
   *
   * The day UNDER TEST takes the fixtures - the extra blocks a meta-test hands
   * in, the rounds it chose - and every day after it takes its own, because
   * they are real days of the same week and a ticket carried into one of them
   * is competing with whatever that day actually holds.
   */
  const bookedOn = (on: number): readonly TickWindow[] => {
    const dayPlanned = interruptionPlanFor(on, seed, employer.week);
    const dayBlocked = on === day ? rounds ?? dayPlanned.blocked : dayPlanned.blocked;
    const schedule = buildInterruptionSchedule(seed, on, {
      slots: on === day ? [...dayPlanned.slots, ...extra] : dayPlanned.slots,
      blocked: dayBlocked,
    });

    return [
      ...dayBlocked,
      ...worstCaseWindows(schedule, dayBlocked, presence),
    ];
  };

  return dealtOn(day, seed, employer).map((ticket) => {
    // The window a player could work it in: from the minute it lands to the
    // minute the deadline runs out - counted a SHIFT AT A TIME, because both
    // clocks on a ticket are counted in working minutes and a night is not a
    // minute anybody could have used.
    //
    // It used to stop at the end of the arriving day, with the reasoning that
    // tomorrow's minutes are a different day's problem. That reasoning is
    // exactly what `arrives_minutes_before_close` breaks, on purpose and
    // honestly: a request raised at five to five carries fifty-five of its
    // sixty minutes into tomorrow morning, so "reachable" for it means
    // reachable tomorrow, and a gate that refused to look at tomorrow would be
    // refusing to look at the only place the answer is. Nothing about the
    // same-day case moves - a deadline inside the shift never reaches the
    // second pass - so every other ticket in the roster is measured exactly as
    // it was.
    let clear = 0;

    // Bounded rather than "until the deadline": the longest target in the
    // ladder is eight working hours, so nothing in this world can span more
    // than two nights, and a loop whose only bound is a deadline is a loop
    // bounded by a number somebody else can change.
    //
    // And bounded at the END OF THE WEEK, which is the bound it was missing.
    // `shiftWindow` will hand back a sixth and a seventh shift quite happily
    // and `interruptionPlanFor` reports them empty, so a Friday-afternoon
    // ticket whose clock runs past five was being credited with a clear
    // Saturday - a hundred-odd minutes of a day this game does not have, on
    // the one day of the week where "there is always tomorrow" is false. The
    // MSP's Friday portal request is exactly that shape. It passes on the
    // Friday alone; it was passing partly on a weekend, and a gate that
    // measures work in minutes nobody could ever sit at the desk for is not
    // measuring anything.
    const last = Math.min(day + daysAhead, WEEK_DAYS);

    for (let on = day; on <= last; on += 1) {
      const shift = shiftWindow(on);
      const from = Math.max(ticket.workableFrom, shift.from);
      const to = Math.min(ticket.due, shift.to);

      if (from < to) {
        clear += clearMinutes(from, to, bookedOn(on));
      }

      if (ticket.due <= shift.to) {
        break;
      }
    }

    return { id: ticket.id, clear };
  });
}

/**
 * The complaint a day earns, or nothing. A list rather than an assertion for
 * the same reason `auditPath` is: it is the only way to point the gate at a
 * day that is MEANT to fail and watch it say so.
 */
export function auditDayTiming(
  day: number,
  seed: number,
  employer: Employer = employerFor(),
  extra: readonly InterruptionSlot[] = [],
  rounds?: readonly TickWindow[],
  presence: Presence = DEFAULT_PRESENCE,
  daysAhead = 2,
): readonly string[] {
  return clearAirOn(day, seed, employer, extra, rounds, presence, daysAhead)
    .filter((air) => air.clear < CLEAR_MINUTES_NEEDED)
    .map(
      (air) => `${air.id} has ${String(air.clear)} clear minute(s) between `
        + `arriving and going red, against the ${String(CLEAR_MINUTES_NEEDED)} `
        + 'it needs. The day is spoken for and the ticket is not reachable.',
    );
}

/**
 * Every week this build ships, read off the employer registry rather than
 * listed here.
 *
 * Listed here it would be a second table, and a second table is how the third
 * employer's week went two versions without an audit: the gate named no week,
 * the readers default to the probation shop's, and "days 1 to 5" looked like
 * coverage while it was one shop asked five times. Registered employers are
 * the closed set of shops a career can be at, so a fifth one arrives inside
 * this gate on the commit that registers it.
 */
const SHIPPED_WEEKS = EMPLOYER_IDS.map((id) => {
  const employer = employerFor(id);

  return { id, name: employer.name, employer };
});

/**
 * The days a shipped week deliberately deals nothing at all.
 *
 * Bodgeworth's Friday is five tickets' worth of week running out on the
 * Thursday, and that is authored - the shop's whole contrast with probation is
 * that there is not enough work in it. It is named here rather than tolerated
 * by a weaker assertion, so a day that goes empty by ACCIDENT - a drip moved, a
 * pool that drew nothing - is still a failure, and making a day empty on
 * purpose costs a line in this map and the sentence that justifies it.
 */
const DEALS_NOTHING: Readonly<Record<string, readonly number[]>> = {
  bodgeworth: [5],
};

describe.each(SHIPPED_WEEKS)(
  '$name: every advertised path is reachable under the worst schedule',
  ({ id, employer }) => {
    const seed = seedForAttempt(1);

    it.each([1, 2, 3, 4, 5])('day %i leaves clear air on everything it deals', (day) => {
      expect(auditDayTiming(day, seed, employer)).toEqual([]);
    });

    /**
     * And the same five days under each of the three dots.
     *
     * The status is a thing the player can hold all week, so "solvable under
     * the worst schedule" is three questions rather than one. Two of them are
     * the same question - Away changes nothing about what arrives, which is the
     * whole of what makes it a lie rather than a filter - and do not disturb is
     * the one that moves the calendar: a declinable call slides instead of
     * ringing, which frees the minutes it would have taken and books later ones
     * instead, and either half of that can be what makes a ticket unreachable.
     *
     * The dnd model is deliberately WORSE than any day a player can produce.
     * Every minute a slid call could ever land on is booked at once, because
     * nothing can enumerate which of them the player's dot happened to allow -
     * so clear air found under it is clear air that is genuinely there, on every
     * day the presence machinery can create.
     */
    it.each(
      [1, 2, 3, 4, 5].flatMap(
        (day) => PRESENCE_VALUES.map((presence) => [day, presence] as const),
      ),
    )('day %i is still solvable on %s', (day, presence) => {
      expect(auditDayTiming(day, seed, employer, [], undefined, presence))
        .toEqual([]);
    });

    /**
     * And this week has tickets in it, on the days it claims to.
     *
     * `it.each` over five empty lists passes in silence, and so does a week
     * whose queue went missing. The days a shop deliberately leaves empty are
     * named above; everything else has to deal something.
     */
    it('deals something on every day it does not deliberately leave empty', () => {
      const empty = DEALS_NOTHING[id] ?? [];
      const dealtNothing = [1, 2, 3, 4, 5].filter(
        (day) => dealtOn(day, seed, employer).length === 0,
      );

      // Both directions, because the map is a claim rather than a waiver: a
      // day that stops being empty has to lose its line here too, or the next
      // reader is told a lie about the shop.
      expect(dealtNothing).toEqual([...empty]);
    });

    /**
     * And Friday is the end of the week, so the audit may not spend a minute
     * of a day this game does not have.
     *
     * `shiftWindow(6)` answers, cheerfully and wrongly, and `interruptionPlanFor`
     * calls that day completely free - so a Friday-afternoon ticket whose clock
     * runs past five o'clock was being credited with a clear Saturday morning.
     * The MSP's portal request at a quarter to three is exactly that shape and
     * was being handed a hundred and five minutes of weekend.
     *
     * Asserted on the NUMBERS rather than on the complaint, because both
     * readings clear the ten-minute bar today and a pass/fail assertion could
     * not tell them apart - which is precisely how the miscount survived. Every
     * week is asked, because "does this shop have a Friday ticket that spans"
     * is content that moves.
     */
    it('counts no minute past the end of the week', () => {
      expect(
        clearAirOn(WEEK_DAYS, seed, employer, [], undefined, DEFAULT_PRESENCE, 2),
      ).toEqual(
        clearAirOn(WEEK_DAYS, seed, employer, [], undefined, DEFAULT_PRESENCE, 0),
      );
    });

    /**
     * The teeth, per week, and computed rather than typed.
     *
     * A gate nobody has watched fail on THIS week is a gate nobody knows covers
     * it - and "the probation week's fixture complains" says nothing about
     * whether the Halcyon table is being read at all. So: the tightest window
     * this shop's five days contain, booked end to end by the lead's rounds,
     * and the audit has to name that exact ticket. The rounds are the lever
     * because they go in as blocked minutes without going through the
     * interruption builder - a fixture takeover would have to be placed around
     * whatever the day already holds, which is a different week's problem on
     * every week.
     */
    it('says so when this week\'s calendar swallows one of its own tickets', () => {
      const tightest = [1, 2, 3, 4, 5]
        .flatMap(
          (day) => dealtOn(day, seed, employer).map((ticket) => ({ day, ticket })),
        )
        // Same-day deadlines only: a ticket that carries into tomorrow is
        // measured against tomorrow's calendar too, and one day's rounds
        // cannot swallow it.
        .filter(({ day, ticket }) => ticket.due <= shiftWindow(day).to)
        .sort(
          (left, right) => (left.ticket.due - left.ticket.workableFrom)
            - (right.ticket.due - right.ticket.workableFrom),
        )[0];

      expect(tightest).toBeDefined();

      const day = tightest?.day ?? 1;
      const complaints = auditDayTiming(day, seed, employer, [], [{
        from: tightest?.ticket.workableFrom ?? 0,
        to: tightest?.ticket.due ?? 0,
      }]);

      expect(complaints.join('\n')).toContain('not reachable');
      // And it names the ticket, because "something is unreachable" is not a
      // sentence anybody can act on at four in the afternoon.
      expect(complaints.some(
        (line) => line.startsWith(tightest?.ticket.id ?? ''),
      )).toBe(true);
    });
  },
);

describe('the probation week, under the worst schedule it can deal', () => {
  const seed = seedForAttempt(1);

  /**
   * The dnd walk is genuinely walking something: the two shipped calls are the
   * only entries in the week a dot can touch, so a model that quietly stopped
   * booking their slides would pass the presence block above in silence.
   *
   * It stays a probation-week claim because the probation week is the only one
   * that ships a declinable call - the other three would assert nothing by
   * asserting the same number twice, which is a passing test about nothing.
   */
  it('books more of the week under a dot than without one', () => {
    const days = [1, 2, 3, 4, 5];
    const booked = (day: number, presence: Presence): number => {
      const plan = interruptionPlanFor(day, seed);
      const schedule = buildInterruptionSchedule(seed, day, plan);

      return worstCaseWindows(schedule, plan.blocked, presence)
        .reduce((total, window) => total + (window.to - window.from), 0);
    };

    const dnd = days.reduce((total, day) => total + booked(day, 'dnd'), 0);
    const available = days.reduce(
      (total, day) => total + booked(day, 'available'),
      0,
    );

    // Away is not a filter. It reads the same calendar Available does, and a
    // model that treated it as one would be modelling a mechanic this slice
    // deliberately does not have.
    expect(days.reduce((total, day) => total + booked(day, 'away'), 0))
      .toBe(available);
    expect(dnd).toBeGreaterThan(available);
  });

  /**
   * The 4:55 class, held to the older and narrower question.
   *
   * The audit above now counts clear air across the days a deadline actually
   * spans, and the honest worry about that is that it was widened until
   * everything passed. This is the answer: asked the question it used to ask -
   * "is this reachable TODAY" - the Wednesday request fails, by name, because
   * five minutes is five minutes. It passes the real gate because fifty-five
   * of its sixty minutes are tomorrow morning's and tomorrow morning is
   * genuinely clear, which is the whole claim the field makes.
   *
   * It is therefore two assertions in one: the generalization has teeth, and
   * the ticket it was made for is genuinely the shape it says it is.
   */
  it('would call the five-to-five request unreachable inside its own day', () => {
    const today = auditDayTiming(
      3,
      seed,
      employerFor(),
      [],
      undefined,
      DEFAULT_PRESENCE,
      0,
    );

    expect(today.some(
      (line) => line.startsWith('ticket:vpn-month-end'),
    )).toBe(true);
    // And the day it arrives on is otherwise fine, so the complaint is about
    // this ticket rather than about a Wednesday that has fallen over.
    expect(today).toHaveLength(1);
    expect(auditDayTiming(3, seed)).toEqual([]);
  });

  /**
   * The teeth, and the no-op discipline applied: the same function, pointed at
   * a day whose blocks are built to swallow one ticket whole.
   *
   * The two fixture blocks are computed FROM the ticket rather than typed, so
   * the meta-test cannot quietly stop covering anything when the seed moves the
   * drip by a minute - and the lead's rounds are handed in empty, because this
   * is a claim about the arithmetic rather than about Monday. The per-week
   * teeth above make the same claim through the rounds; this one makes it
   * through a TAKEOVER, which is the other half of what books a day.
   */
  it('says so when a ticket has nowhere left in the day to be worked', () => {
    const swallowed = dealtOn(1, seed).find(
      (ticket) => ticket.workableFrom > shiftStartTick(1),
    );

    expect(swallowed).toBeDefined();

    const at = (tick: number): number => minuteOfDay(tick);
    const block = (id: string, from: number, to: number): InterruptionSlot => ({
      id,
      source: 'meeting',
      minute: at(from),
      minutes: to - from,
      relatedTicket: null,
      declinable: false,
      severity: 3,
      flavor: {
        scene: TICKET_HYGIENE_SYNC.id,
        subject: 'A fixture, and not a meeting anybody sits in',
      },
    });

    const from = swallowed?.workableFrom ?? 0;
    const to = swallowed?.due ?? 0;
    const lunch = lunchWindow(1);
    const complaints = auditDayTiming(
      1,
      seed,
      employerFor(),
      [
        block('meeting:gate-fixture-before-lunch', from, lunch.from),
        block('meeting:gate-fixture-after-lunch', lunch.to, to),
      ],
      [],
    );

    expect(complaints.length).toBeGreaterThan(0);
    expect(complaints.join('\n')).toContain('not reachable');
    // And it names the ticket, because "something is unreachable" is not a
    // sentence anybody can act on at four in the afternoon.
    expect(complaints.some(
      (line) => line.startsWith(swallowed?.id ?? ''),
    )).toBe(true);
  });
});

/* -- the gate's own teeth -------------------------------------------------- */

/**
 * A ticket that is not in the roster, whose advertised path carries a step the
 * close does not need.
 *
 * It is the exact shape the rebuilt gate exists to catch and the exact shape
 * the old one passed: a successful, unrelated mutation followed by the actual
 * fix. The target is open after step one because step one had nothing to do
 * with it, and resolved after step two because step two is the whole repair -
 * which is what "every step but the last leaves it open" was measuring.
 */
const DECORATIVE_FIX: WorldTicket = {
  arrival: 'morning',
  nodes: [COMPANY_IDS.warehousePrinter],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: 'ticket:gate-fixture-decorative',
    archetype: 'read_the_screen',
    flavor: {
      title: 'A fixture, and not a ticket anybody is dealt',
      body: 'It exists so the gate above can be pointed at something that is '
        + 'meant to fail, and be seen to fail on it.',
    },
    reporter: COMPANY_IDS.owen,
    setup: [
      {
        op: 'setField',
        id: COMPANY_IDS.warehousePrinter,
        field: FIELDS.powered,
        value: false,
      },
    ],
    resolved_when: {
      op: 'eq',
      selector: { id: COMPANY_IDS.warehousePrinter },
      field: FIELDS.powered,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 1 },
    kb_ref: 'kb/the-same-thing-every-week',
  } satisfies TicketDef,
  cause: 'Nothing. It is a fixture.',
  dialogue_ref: 'dialogue/late-shift',
  paths: [
    {
      id: 'ritual-then-fix',
      app: 'remote',
      label: 'Turn a screen round, which achieves nothing, then fix it',
      steps: [
        // Succeeds, changes the world, and has nothing whatever to do with
        // the printer this ticket is about.
        {
          action: HELPDESK_ACTIONS.machineSetDisplayRotation,
          target: COMPANY_IDS.warehousePrintServer,
          params: { rotation: 90 },
        },
        {
          action: HELPDESK_ACTIONS.devicePowerCycle,
          target: COMPANY_IDS.warehousePrinter,
        },
      ],
    },
  ],
};

describe('the solvability gate, pointed at something that is meant to fail', () => {
  /**
   * A gate nobody has watched fail is a gate nobody knows the shape of. This
   * drives the same function the roster is driven by, over a path whose first
   * step is decorative, and requires it to say so.
   */
  it('catches a step the close does not depend on', () => {
    const complaints = auditPath(
      DECORATIVE_FIX,
      'ritual-then-fix',
      (entry) => {
        const session = createWorldSession();
        session.engine.registerTicket(entry.def);
        return session;
      },
    );

    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toContain('closes without step 1');
    expect(complaints[0]).toContain('machine.set_display_rotation');
  });

  /**
   * And the escape hatch cannot be used as one. A step declared not to matter
   * to the close, which does in fact matter, is its own failure - otherwise
   * the flag would be a way of telling the gate to look away.
   */
  it('catches a step wrongly declared not to matter', () => {
    const lying: WorldTicket = {
      ...DECORATIVE_FIX,
      paths: [
        {
          ...(DECORATIVE_FIX.paths[0] ?? { id: '', app: 'remote', label: '', steps: [] }),
          steps: [
            DECORATIVE_FIX.paths[0]?.steps[0] ?? { action: '', target: '' },
            {
              action: HELPDESK_ACTIONS.devicePowerCycle,
              target: COMPANY_IDS.warehousePrinter,
              optional_for_closure: true,
            },
          ],
        },
      ],
    };

    const complaints = auditPath(lying, 'ritual-then-fix', (entry) => {
      const session = createWorldSession();
      session.engine.registerTicket(entry.def);
      return session;
    });

    expect(complaints.some(
      (line) => line.includes('is declared not to matter to the close'),
    )).toBe(true);
  });

  /** And it passes a path with nothing wrong with it. */
  it('says nothing about a path that earns every step', () => {
    const honest: WorldTicket = {
      ...DECORATIVE_FIX,
      paths: [
        {
          id: 'just-the-fix',
          app: 'remote',
          label: 'Fix it',
          steps: [
            {
              action: HELPDESK_ACTIONS.devicePowerCycle,
              target: COMPANY_IDS.warehousePrinter,
            },
          ],
        },
      ],
    };

    expect(auditPath(honest, 'just-the-fix', (entry) => {
      const session = createWorldSession();
      session.engine.registerTicket(entry.def);
      return session;
    })).toEqual([]);
  });
});
