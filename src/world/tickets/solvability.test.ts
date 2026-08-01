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
import type { TicketDef } from '../../engine-api';
import { DayDriver } from '../../shell/day-driver';
import { HELPDESK_ACTIONS } from '../actions';
import { CAUGHT_MINUTES } from '../boss';
import { COMPANY_IDS } from '../company';
import { buildDaySchedule, shiftEndTick, shiftStartTick } from '../day';
import { FIELDS } from '../fields';
import { spoolDisagreements, storedDisagreements } from '../fs';
import { lunchWindow, minuteOfDay, serviceDeadline, type TickWindow } from '../hours';
import {
  buildInterruptionSchedule,
  clearMinutes,
  type InterruptionSlot,
  worstCaseWindows,
} from '../interruptions';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import { TICKET_HYGIENE_SYNC } from '../scenes/meeting';
import { createWorldSession, seedForAttempt, type WorldSession } from '../session';
import { dayPlan, interruptionPlanFor } from '../week';
import {
  findWorldTicket,
  ticketsNeededFor,
  WORLD_TICKETS,
  spawnWorldTicket,
} from './index';
import type { TicketActionStep, WorldTicket } from './types';

beforeAll(() => {
  loadEngineForTests();
});

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
function worldFor(entry: Readonly<WorldTicket>): WorldSession {
  const session = createWorldSession();

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
  spawnWorldTicket(session.engine, predecessorId);

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
    const session = createWorldSession();
    const solvedOnArrival: string[] = [];

    for (const entry of WORLD_TICKETS) {
      if (session.engine.graph.getNode(entry.def.id) === undefined) {
        spawnWorldTicket(session.engine, entry.def.id);
      }

      if (session.engine.ticketState(entry.def.id) === 'resolved') {
        solvedOnArrival.push(entry.def.id);
      }
    }

    expect(solvedOnArrival).toEqual([]);
  });

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

function dealtOn(day: number, seed: number): readonly Dealt[] {
  return buildDaySchedule(day, seed, dayPlan(day)).arrivals.map((arrival) => {
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
      due: serviceDeadline(arrival.tick, entry.def.sla_ticks),
    };
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
  extra: readonly InterruptionSlot[] = [],
  // The lead's rounds, overridable ONLY so the meta-test below can construct
  // a day whose bookings it chose. Every real caller takes the day's own.
  rounds?: readonly TickWindow[],
): readonly string[] {
  const plan = interruptionPlanFor(day, seed);
  const blocked = rounds ?? plan.blocked;
  const schedule = buildInterruptionSchedule(seed, day, {
    slots: [...plan.slots, ...extra],
    blocked,
  });
  const booked = [...blocked, ...worstCaseWindows(schedule, blocked)];

  return dealtOn(day, seed).flatMap((ticket) => {
    // The window a player could work it in: from the minute it lands to the
    // minute the deadline runs out, and never past the end of the shift -
    // tomorrow's minutes are a different day's problem and this day's ticket
    // has to have been reachable today.
    const clear = clearMinutes(
      ticket.workableFrom,
      Math.min(ticket.due, shiftEndTick(day)),
      booked,
    );

    return clear >= CLEAR_MINUTES_NEEDED
      ? []
      : [
        `${ticket.id} has ${String(clear)} clear minute(s) between arriving `
        + `and going red, against the ${String(CLEAR_MINUTES_NEEDED)} it `
        + 'needs. The day is spoken for and the ticket is not reachable.',
      ];
  });
}

describe('every advertised path is reachable under the worst schedule', () => {
  const seed = seedForAttempt(1);

  it.each([1, 2, 3, 4, 5])('day %i leaves clear air on everything it deals', (day) => {
    expect(auditDayTiming(day, seed)).toEqual([]);
  });

  /**
   * And the week deals something on every one of its days, so the block above
   * is not five assertions about empty lists. `describe.each` over nothing
   * passes in silence, and so does a day whose queue went missing.
   */
  it('is asking about a week that has tickets in it', () => {
    for (const day of [1, 2, 3, 4, 5]) {
      expect(dealtOn(day, seed).length, `day ${String(day)}`)
        .toBeGreaterThan(0);
    }
  });

  /**
   * The teeth, and the no-op discipline applied: the same function, pointed
   * at a day with an interruption on it that is meant to swallow a ticket.
   *
   * A four-hour block starting the minute the shift does takes every minute
   * a morning ticket could have been worked in. If this gate ever stops
   * saying so, it has stopped being a gate - and the two assertions are both
   * needed, because "returns a complaint" and "names the ticket that caused
   * it" are different claims and only the second is useful at four in the
   * afternoon.
   */
  /**
   * The teeth, and the no-op discipline applied: the same function, pointed at
   * a day whose blocks are built to swallow one ticket whole.
   *
   * The two fixture blocks are computed FROM the ticket rather than typed, so
   * the meta-test cannot quietly stop covering anything when the seed moves
   * the drip by a minute - and the lead's rounds are handed in empty, because
   * this is a claim about the arithmetic rather than about Monday.
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
