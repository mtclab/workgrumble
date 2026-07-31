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
import { SLA_TARGETS, UNTRIAGED_PRIORITY } from './priority';
import { createWorldSession } from './session';
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
    expect(world.clocks().response.dueAt)
      .toBe(SLA_TARGETS[UNTRIAGED_PRIORITY].response);
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
    expect(world.clocks().response.dueAt).toBe(SLA_TARGETS[1].response);
    expect(world.clocks().resolution.dueAt).toBe(SLA_TARGETS[1].resolution);
  });

  it('counts a late answer as late, and keeps counting one that never came', () => {
    const world = harness();
    world.act(HELPDESK_ACTIONS.ticketClassify, {
      impact: 3,
      urgency: 3,
      priority: 1,
    });

    world.engine.advance(SLA_TARGETS[1].response);
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
    expect(world.clocks().response.dueAt).toBe(untriaged.response);
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
