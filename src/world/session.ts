import { ActionRegistry } from '../engine/actions';
import { SimClock } from '../engine/clock';
import { createEngineEventBus, type EngineEventBus } from '../engine/events';
import { EntityGraph } from '../engine/graph';
import { createRng } from '../engine/rng';
import { TicketEngine } from '../engine/tickets';
import { HELPDESK_TIER, registerHelpdeskActions } from './actions';
import { seedCompanyWorld } from './company';
import { registerDemoActions } from './demo-world';
import { allowsEscalation, WORLD_TICKETS } from './tickets';

/** Fixed seed: the working day is replayable. */
export const WORLD_SEED = 0x5eed_1c01;

export interface WorldSession {
  readonly bus: EngineEventBus;
  readonly graph: EntityGraph;
  readonly clock: SimClock;
  readonly registry: ActionRegistry;
  readonly tickets: TicketEngine;
  readonly tier: number;
}

/**
 * One way to stand up a working day: the same wiring the browser boots and the
 * same wiring the tests drive. A test that builds its own world is a test that
 * can pass while the shipped one is broken.
 */
export function createWorldSession(seed: number = WORLD_SEED): WorldSession {
  const bus = createEngineEventBus();
  const graph = new EntityGraph(bus);
  const clock = new SimClock();
  const registry = new ActionRegistry(
    graph,
    createRng(seed),
    clock,
    HELPDESK_TIER,
  );
  const tickets = new TicketEngine(graph, clock, bus);

  /**
   * Which ticket ids the engine is actually tracking. The engine does not
   * publish its register and does not need to: it announces every spawn, so
   * the session keeps the list it already broadcasts. Validation asks this
   * before touching the engine, because a `ticket` node with no record behind
   * it makes `setWaiting` throw - and an action must refuse, never throw.
   */
  const registeredTickets = new Set<string>();
  bus.on('ticket:spawned', ({ id }) => {
    registeredTickets.add(id);
  });

  seedCompanyWorld(graph);
  registerDemoActions(registry);
  registerHelpdeskActions(registry, {
    tickets,
    allowsEscalation,
    isRegistered: (id) => registeredTickets.has(id),
  });

  for (const entry of WORLD_TICKETS) {
    tickets.spawn(entry.def);
  }

  return {
    bus,
    graph,
    clock,
    registry,
    tickets,
    tier: HELPDESK_TIER,
  };
}
