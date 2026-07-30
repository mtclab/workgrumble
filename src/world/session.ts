import {
  type EngineApi,
  WasmEngine,
} from '../engine-api';
import {
  helpdeskActionPayload,
  HELPDESK_TIER,
  KIND_LABELS,
} from './actions';
import { companySetup } from './company';
import { DEMO_ACTION_DATA } from './demo-world';
import { WORLD_TICKETS } from './tickets';

/** Fixed seed: the working day is replayable. */
export const WORLD_SEED = 0x5eed_1c01;

export interface WorldSession {
  readonly engine: EngineApi;
  readonly tier: number;
}

/**
 * One way to stand up a working day: the same wiring the browser boots and the
 * same wiring the tests drive. A test that builds its own world is a test that
 * can pass while the shipped one is broken.
 *
 * The engine is the Rust core, and everything below is content handed to it as
 * DATA - the company as construction ops, the verb set as action definitions,
 * the tickets as definitions the engine spawns and then owns. Nothing outside
 * the engine holds a writable handle on the world.
 */
export function createWorldSession(
  seed: number = WORLD_SEED,
  engine: EngineApi = new WasmEngine(seed),
): WorldSession {
  engine.setTier(HELPDESK_TIER);
  engine.applySetup(companySetup());
  engine.registerActions({
    kind_labels: KIND_LABELS,
    actions: DEMO_ACTION_DATA,
  });
  engine.registerActions(helpdeskActionPayload());

  for (const entry of WORLD_TICKETS) {
    engine.registerTicket(entry.def);
  }

  return { engine, tier: HELPDESK_TIER };
}
