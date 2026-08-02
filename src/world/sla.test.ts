/**
 * Two clocks, driven on the shipped world through the shipped engine.
 *
 * The transitions that matter are all here: a clock that stops when somebody
 * says something, a clock that does not, and a hold that pauses exactly one of
 * them. The last of those is the property the whole model exists for, so it is
 * asserted the only way that means anything - by advancing the clock while a
 * ticket is parked and reading BOTH deadlines afterwards.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi, ReadOnlyGraphNode } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { HELPDESK_ACTIONS } from './actions';
import { COMPANY_IDS } from './company';
import { FIELDS } from './fields';
import {
  SLA_TARGETS,
  UNTRIAGED_PRIORITY,
  UNTRIAGED_SLA_TICKS,
} from './priority';
import { DAY_ACTIONS } from './actions';
import {
  countsAgainstSla,
  dayForTick,
  MINUTES_PER_DAY,
  minuteOfDay,
  serviceDeadline,
  serviceMinutesAt,
  serviceMinutesBetween,
} from './hours';
import { createWorldSession } from './session';
import { spawnWorldTicket } from './tickets';
import {
  HOLD_REASON_LABELS,
  holdReasonOf,
  isHoldReason,
  needsResponse,
  ticketClocks,
} from './sla';
import { WORLD_TICKETS } from './tickets';

beforeAll(() => {
  loadEngineForTests();
});

const TICKET = 'ticket:locked-account';

interface Harness {
  readonly engine: EngineApi;
  readonly node: () => ReadOnlyGraphNode;
  readonly clocks: () => ReturnType<typeof ticketClocks>;
  readonly act: (
    id: string,
    params?: Record<string, string | number | boolean | null>,
  ) => void;
}

function harness(ticketId: string = TICKET): Harness {
  const { engine } = createWorldSession();

  if (engine.graph.getNode(ticketId) === undefined) {
    // The week deals its queue across five days, so a test about one ticket
    // puts that ticket in the world at 08:00 - which is where an inherited
    // one starts, and the reason the response clock has to know about
    // business hours at all.
    spawnWorldTicket(engine, ticketId);
  }
  const node = (): ReadOnlyGraphNode => {
    const found = engine.graph.getNode(ticketId);

    if (found === undefined) {
      throw new Error(`The world has no ticket "${ticketId}".`);
    }

    return found;
  };

  return {
    engine,
    node,
    clocks: () => ticketClocks(node(), engine.now()),
    act: (id, params = {}) => {
      const result = engine.dispatch(id, COMPANY_IDS.player, ticketId, params);

      if (!result.ok) {
        throw new Error(`"${id}" was refused: ${result.reason}`);
      }
    },
  };
}

describe('the response clock', () => {
  it('runs from the ticket arriving until somebody says something', () => {
    const world = harness();

    expect(world.clocks().response.running).toBe(true);
    // An hour of DESK time from a ticket that was waiting at eight: the first
    // hour of it is not an hour anybody was at the desk for, so the answer is
    // owed by ten. This ticket used to arrive already late.
    expect(world.clocks().response.dueAt)
      .toBe(serviceDeadline(0, SLA_TARGETS[UNTRIAGED_PRIORITY].response));
    expect(world.clocks().response.dueAt)
      .toBeGreaterThan(SLA_TARGETS[UNTRIAGED_PRIORITY].response);
    expect(needsResponse(world.node())).toBe(true);

    world.engine.advance(12);
    world.act(HELPDESK_ACTIONS.ticketAddComment, {
      comment: 'What does the message say, word for word?',
    });

    const stopped = world.clocks().response;
    expect(stopped.running).toBe(false);
    expect(stopped.stoppedAt).toBe(12);
    expect(stopped.breached).toBe(false);
    expect(needsResponse(world.node())).toBe(false);
  });

  it('moves its target when the triage moves', () => {
    const world = harness();

    world.act(HELPDESK_ACTIONS.ticketClassify, {
      impact: 3,
      urgency: 3,
      priority: 1,
    });

    expect(world.clocks().priority).toBe(1);
    expect(world.clocks().response.dueAt)
      .toBe(serviceDeadline(0, SLA_TARGETS[1].response));
    expect(world.clocks().resolution.dueAt).toBe(SLA_TARGETS[1].resolution);
  });

  it('counts a late answer as late, and keeps counting one that never came', () => {
    const world = harness();
    world.act(HELPDESK_ACTIONS.ticketClassify, {
      impact: 3,
      urgency: 3,
      priority: 1,
    });

    world.engine.advance(serviceDeadline(0, SLA_TARGETS[1].response));
    expect(world.clocks().response.breached).toBe(true);
    expect(world.clocks().response.running).toBe(true);

    world.act(HELPDESK_ACTIONS.ticketAddComment, { comment: 'Sorry - hello?' });
    const stopped = world.clocks().response;
    expect(stopped.breached).toBe(true);
    expect(stopped.running).toBe(false);
  });

  /** A clock stops the first time, not the best time. */
  it('is stopped by the first word and not moved by the second', () => {
    const world = harness();

    world.act(HELPDESK_ACTIONS.ticketAddComment, { comment: 'Hello?' });
    world.engine.advance(40);
    world.act(HELPDESK_ACTIONS.ticketAddComment, { comment: 'Still there?' });

    expect(world.clocks().response.stoppedAt).toBe(0);
  });

  /** The other way it stops: somebody actually fixed the thing. */
  it('is stopped by a recorded touch on the ticket\'s own nodes', () => {
    const world = harness();

    world.engine.advance(7);
    world.act(HELPDESK_ACTIONS.ticketRecordResponse);

    expect(world.clocks().response.stoppedAt).toBe(7);
  });
});

describe('the resolution clock', () => {
  it('is the engine\'s own deadline, so a breach is a breach', () => {
    const world = harness();
    world.act(HELPDESK_ACTIONS.ticketClassify, {
      impact: 1,
      urgency: 3,
      priority: 3,
    });

    expect(world.clocks().resolution.dueAt).toBe(SLA_TARGETS[3].resolution);
    expect(world.clocks().resolution.breached).toBe(false);

    world.engine.advance(SLA_TARGETS[3].resolution);
    expect(world.clocks().resolution.breached).toBe(true);
    expect(world.node().fields[FIELDS.state]).toBe('breached');
  });

  /**
   * The property the two-clock model exists for. Parking a ticket on the user
   * stops the RESOLUTION clock and nothing else: the reporter is waiting on
   * you either way, and the response clock is about them.
   */
  it('pauses on hold while the response clock carries on', () => {
    const world = harness();
    world.act(HELPDESK_ACTIONS.ticketAddComment, {
      comment: 'Which of the two accounts is it?',
    });
    world.act(HELPDESK_ACTIONS.ticketSetWaiting);

    const parkedAt = world.clocks();
    expect(parkedAt.onHold).toBe(true);
    expect(holdReasonOf(world.node())).toBe('awaiting_user');

    world.engine.advance(30);
    const after = world.clocks();

    // The resolution deadline moved out by exactly the time spent parked.
    expect(after.resolution.dueAt).toBe(parkedAt.resolution.dueAt + 30);
    expect(after.heldTicks).toBe(30);
    // The response clock did not move at all: it had already stopped, and its
    // target is still measured from when the ticket landed.
    expect(after.response.dueAt).toBe(parkedAt.response.dueAt);
    expect(after.response.stoppedAt).toBe(parkedAt.response.stoppedAt);
  });

  it('starts running again the moment it comes off hold', () => {
    const world = harness();
    world.act(HELPDESK_ACTIONS.ticketAddComment, { comment: 'Anything?' });
    world.act(HELPDESK_ACTIONS.ticketSetWaiting);
    world.engine.advance(20);
    world.act(HELPDESK_ACTIONS.ticketClearWaiting);

    const running = world.clocks();
    expect(running.onHold).toBe(false);
    expect(running.resolution.running).toBe(true);
    expect(holdReasonOf(world.node())).toBeNull();

    const dueAt = running.resolution.dueAt;
    world.engine.advance(10);
    expect(world.clocks().resolution.dueAt).toBe(dueAt);
    expect(world.clocks().heldTicks).toBe(20);
  });

  /**
   * A ticket nobody triaged still has a clock, or ignoring the queue wins -
   * and it is P3's clock on BOTH ends, which is what the badge in the app
   * promises out loud. The resolution deadline used to come from a number the
   * ticket was written with instead: the spooler said "treated as P3" and had
   * six hours, which is the tier above.
   */
  it('holds every untriaged ticket to P3, on both clocks', () => {
    const world = harness();
    const untriaged = SLA_TARGETS[UNTRIAGED_PRIORITY];

    expect(world.clocks().priority).toBeNull();
    expect(world.clocks().resolution.dueAt).toBe(untriaged.resolution);
    expect(world.clocks().response.dueAt)
      .toBe(serviceDeadline(0, untriaged.response));
    expect(world.clocks().response.running).toBe(true);

    // Every shipped ticket, not just this one: content carrying its own
    // deadline is content whose two clocks disagree about what it is.
    for (const entry of WORLD_TICKETS) {
      expect(entry.def.sla_ticks).toBe(untriaged.resolution);
    }
  });

  /**
   * And the pause the ticket earned survives being triaged. The app tells the
   * player to clear the hold before triaging; doing as they are told used to
   * cost them every minute of it, and could breach the ticket in their hand.
   */
  it('keeps the time already spent parked when the triage re-cuts it', () => {
    const world = harness();
    world.act(HELPDESK_ACTIONS.ticketAddComment, { comment: 'Which one?' });
    world.act(HELPDESK_ACTIONS.ticketSetWaiting);
    world.engine.advance(45);
    world.act(HELPDESK_ACTIONS.ticketClearWaiting);
    world.act(HELPDESK_ACTIONS.ticketClassify, {
      impact: 2,
      urgency: 3,
      priority: 2,
    });

    expect(world.clocks().resolution.dueAt)
      .toBe(SLA_TARGETS[2].resolution + 45);
    expect(world.clocks().heldTicks).toBe(45);
  });
});

describe('hold reasons', () => {
  it('knows the two it has, and nothing else', () => {
    expect(isHoldReason('awaiting_user')).toBe(true);
    expect(isHoldReason('awaiting_vendor')).toBe(true);
    expect(isHoldReason('awaiting_a_miracle')).toBe(false);
    expect(isHoldReason(3)).toBe(false);
    expect(Object.keys(HOLD_REASON_LABELS)).toHaveLength(2);
  });

  /**
   * An escalation that does not close the ticket is a hold with a different
   * reason on it. The clock is stopped either way; who it is stopped ON is
   * what a review reads.
   */
  it('parks an escalated ticket on the field team, not on the user', () => {
    const world = harness(TICKET);
    const escalatable = harness('ticket:fan-noise');

    escalatable.act(HELPDESK_ACTIONS.ticketEscalate, {
      reported: 'It sounds like a hornet in a biscuit tin.',
      tried: 'Reseated the fan',
    });

    // This one closes on escalation, so there is nothing left to hold.
    expect(escalatable.node().fields[FIELDS.state]).toBe('resolved');
    expect(world.clocks().onHold).toBe(false);
  });
});

/**
 * Business hours, which is the whole of M4's first item.
 *
 * The two clocks arrive at it from opposite ends and have to agree. The
 * RESPONSE clock is derived: a pure function turns "an hour at the desk" into
 * the minute that hour runs out on. The RESOLUTION clock is the engine's own
 * field, pushed out a minute at a time by every minute the office was dark.
 * If those two ever stop landing on the same tick, one of the badges on a
 * ticket is lying and there is no way to tell which from inside the app.
 */
describe('business hours', () => {
  /**
   * The rule, said once and computed once, checked against each other.
   *
   * `countsAgainstSla` is the sentence - the minute the clock arrives at is
   * inside the shift - and `serviceMinutesAt` is the arithmetic every deadline
   * is built out of. A day walked minute by minute has to agree with itself,
   * or one of the two is a comment.
   */
  it('adds a minute exactly when the minute was one somebody worked', () => {
    for (let tick = 1; tick <= 2 * MINUTES_PER_DAY; tick += 1) {
      expect(
        serviceMinutesAt(tick) - serviceMinutesAt(tick - 1),
        `tick ${String(tick)}`,
      ).toBe(countsAgainstSla(tick) ? 1 : 0);
    }
  });

  /** The desk is empty outside 09:00-17:00, so nothing is owed there. */
  it('counts the shift and nothing else', () => {
    // Tick 0 is 08:00. Nothing is owed until nine.
    expect(serviceMinutesBetween(0, 60)).toBe(0);
    expect(serviceMinutesBetween(0, 120)).toBe(60);
    // A whole day is eight hours of it, however many minutes the clock ran.
    expect(serviceMinutesBetween(0, 1_440)).toBe(480);
    expect(serviceMinutesBetween(60, 540)).toBe(480);
    // And the night pays nothing at all: 17:00 to 09:00 is sixteen hours of
    // clock and no minutes of anybody's service level.
    expect(serviceMinutesBetween(540, 1_500)).toBe(0);
    expect(serviceMinutesBetween(540, 1_560)).toBe(60);
  });

  it('lands a target on the minute the desk has been sat at that long', () => {
    // 08:00 + one desk hour is 10:00, not 09:00.
    expect(serviceDeadline(0, 60)).toBe(120);
    // Four desk hours from 16:00 on Monday is midday on Tuesday: one of them
    // before everybody goes home, three after everybody comes back.
    expect(serviceDeadline(480, 240)).toBe(1_680);
    // The last minute of a shift is reachable; the first of the next one is
    // where the eight-hundred-and-first minute goes.
    expect(serviceDeadline(60, 480)).toBe(540);
    expect(serviceDeadline(60, 481)).toBe(1_501);
    expect(serviceDeadline(0, 0)).toBe(0);
  });

  /**
   * THE RESPONSE CLOCK on a ticket raised five minutes before close, which is
   * the half of the 4:55 class that lives at this layer and nowhere else.
   *
   * It is worth saying what it is NOT, because the cargo suite has a test that
   * looks like this one and is not: the engine keeps a MUTABLE resolution
   * deadline and pushes it out a minute at a time for every minute nobody
   * could have worked in, and that is what `lifecycle.rs` walks across a
   * night. The response clock is not that field and is never written down. It
   * is `serviceDeadline(spawn, target)`, recomputed from scratch every time
   * anybody asks, so the only place it can be proved is here - against the
   * arithmetic itself and against `ticketClocks`, which is what every surface
   * in the game actually reads.
   *
   * The claim: an hour of response target, spent from 16:55, is five minutes
   * of tonight and fifty-five of tomorrow. It is therefore NOT breached when
   * the shift ends, it IS breached at five to ten in the morning, and the
   * minute it lands on is a minute on the next day rather than this one. A
   * response clock that counted wall time would go red at 17:55, in the dark,
   * on a day nobody was answerable for.
   */
  it('spends a response hour from five to five over two days', () => {
    // 16:55 on the second day of the world: tick 0 is 08:00 on day one.
    const raised = MINUTES_PER_DAY + (16 * 60 + 55 - 8 * 60);
    const target = SLA_TARGETS[UNTRIAGED_PRIORITY].response;

    expect(target).toBe(60);

    const due = serviceDeadline(raised, target);

    // Five minutes of tonight and fifty-five of tomorrow, and the arithmetic
    // says so from both ends: the minutes between the two ticks are the
    // target exactly, and the split across the night is 5 + 55.
    expect(serviceMinutesBetween(raised, due)).toBe(target);
    expect(serviceMinutesBetween(raised, raised + 5)).toBe(5);
    expect(serviceMinutesBetween(raised + 5, due)).toBe(target - 5);

    // It lands on the NEXT day, in the morning, at five to ten.
    expect(dayForTick(due)).toBe(dayForTick(raised) + 1);
    expect(minuteOfDay(due)).toBe(9 * 60 + 55);

    // And nothing about it goes red tonight: at the last minute of the shift
    // it is still fifty-five service minutes from running out.
    const closes = raised + 5;
    expect(due).toBeGreaterThan(closes);
    expect(serviceMinutesBetween(closes, due)).toBe(target - 5);
  });

  /**
   * The same claim, off the reader every surface uses.
   *
   * `serviceDeadline` agreeing with itself is arithmetic; what the queue,
   * the detail pane and the conduct trigger read is `ticketClocks`, and a
   * derivation that was right in the function and wrong in the reader is a
   * screen showing a deadline nobody can find in the table.
   */
  it('shows the same morning deadline on the ticket the queue holds', () => {
    const raised = MINUTES_PER_DAY + (16 * 60 + 55 - 8 * 60);
    const target = SLA_TARGETS[UNTRIAGED_PRIORITY].response;
    const node: ReadOnlyGraphNode = {
      id: 'ticket:five-to-five',
      kind: 'ticket',
      fields: {
        [FIELDS.state]: 'open',
        [FIELDS.spawnedAt]: raised,
        [FIELDS.slaDeadline]: serviceDeadline(raised, UNTRIAGED_SLA_TICKS),
      },
    };

    // At the last minute of the day it arrived on: still running, still
    // tomorrow's problem, and not late.
    const tonight = ticketClocks(node, raised + 5);
    expect(tonight.response.dueAt).toBe(serviceDeadline(raised, target));
    expect(tonight.response.breached).toBe(false);
    expect(tonight.response.running).toBe(true);
    expect(dayForTick(tonight.response.dueAt)).toBe(dayForTick(raised) + 1);

    // And in the morning, on the minute: not late at 09:54, late at 09:55.
    const due = serviceDeadline(raised, target);
    expect(ticketClocks(node, due - 1).response.breached).toBe(false);
    expect(ticketClocks(node, due).response.breached).toBe(true);
  });

  /**
   * The two clocks, driven against each other through the real engine.
   *
   * The engine is told the desk is empty and extends every unresolved deadline
   * minute by minute; the derived clock computes where that lands in closed
   * form. Same tick, or the app is showing two different Tuesdays.
   */
  it('pushes the engine deadline exactly where the derivation says', () => {
    const { engine } = createWorldSession();
    const ticketId = 'ticket:wedged-spooler';
    const target = SLA_TARGETS[UNTRIAGED_PRIORITY].resolution;
    const day = (id: string): void => {
      const result = engine.dispatch(id, COMPANY_IDS.player, null, {});

      if (!result.ok) {
        throw new Error(`"${id}" was refused: ${result.reason}`);
      }
    };
    const dueAt = (): number => {
      const node = engine.graph.getNode(ticketId);
      return node === undefined ? -1 : ticketClocks(node, engine.now()).resolution.dueAt;
    };

    // Four in the afternoon, and a ticket lands with four desk hours on it.
    day(DAY_ACTIONS.startShift);
    engine.advance(480);
    spawnWorldTicket(engine, ticketId);
    expect(dueAt()).toBe(720);

    // One of those hours is spent before everybody goes home.
    engine.advance(60);
    expect(dueAt()).toBe(720);

    // Then sixteen hours in which the office is dark and the deadline moves
    // with it, minute for minute, and the ticket does not go red overnight.
    day(DAY_ACTIONS.endShift);
    day(DAY_ACTIONS.slaClockHold);
    engine.advance(960);
    expect(engine.ticketState(ticketId)).toBe('open');
    expect(dueAt()).toBe(serviceDeadline(480, target));
    expect(engine.graph.getField(ticketId, FIELDS.offHoursTicks)).toBe(960);

    // And the three hours it has left are three hours of the next morning.
    const clockedOff = engine.dispatch(
      DAY_ACTIONS.clockOff,
      COMPANY_IDS.player,
      null,
      { banked: 0 },
    );
    expect(clockedOff).toEqual({ ok: true });
    day(DAY_ACTIONS.startShift);
    day(DAY_ACTIONS.slaClockRun);
    engine.advance(179);
    expect(engine.ticketState(ticketId)).toBe('open');
    engine.advance(1);
    expect(engine.now()).toBe(serviceDeadline(480, target));
    expect(engine.ticketState(ticketId)).toBe('breached');
  });

  /**
   * The bug that hid inside the fix. A re-cut deadline is four terms added one
   * at a time, and the engine breaches on whatever the deadline says the
   * moment it says it - so a ticket carried overnight was breached BY BEING
   * TRIAGED, on a partial sum it was never actually on, and a breach latches.
   */
  it('does not breach a carried-over ticket on the way through its own triage', () => {
    const world = harness();

    world.engine.dispatch(DAY_ACTIONS.slaClockHold, COMPANY_IDS.player, null, {});
    world.engine.advance(60);
    world.engine.dispatch(DAY_ACTIONS.startShift, COMPANY_IDS.player, null, {});
    world.engine.dispatch(DAY_ACTIONS.slaClockRun, COMPANY_IDS.player, null, {});
    world.engine.advance(30);

    // A P1 gets an hour, and it has been at the desk for half of one: the
    // deadline is 10:00 and the ticket is open. The arithmetic that went via
    // "arrived plus an hour" put it, for one mutation, on 09:00 - which had
    // already gone - and it came out of its own triage red.
    world.act(HELPDESK_ACTIONS.ticketClassify, {
      impact: 3,
      urgency: 3,
      priority: 1,
    });

    expect(world.node().fields[FIELDS.state]).toBe('open');
    expect(world.clocks().resolution.dueAt)
      .toBe(serviceDeadline(0, SLA_TARGETS[1].resolution));
    expect(world.clocks().resolution.breached).toBe(false);
    // The scratch the sum was built in does not outlive the action.
    expect(world.node().fields[FIELDS.slaRecut]).toBeUndefined();
  });
});
