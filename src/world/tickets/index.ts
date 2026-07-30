import type { TicketDef } from '../../engine-api';
import { HELPDESK_ACTION_IDS } from '../actions';
import { DEMO_ACTIONS, DEMO_TICKET, WORLD_IDS } from '../demo-world';
import { acceptsEscalation } from './escalation';
import { PILOT_TICKETS } from './pilot';
import type { WorldTicket } from './types';

export { acceptsEscalation } from './escalation';
export { PILOT_TICKETS } from './pilot';
export type {
  TicketActionStep,
  TicketPath,
  TicketPathApp,
  WorldTicket,
} from './types';

/** The hardware ticket: fix it yourself, or escalate it and mean it. */
const FAN_TICKET: WorldTicket = {
  def: DEMO_TICKET,
  cause: 'The chassis fan is fouled and has wedged itself against the case.',
  dialogue_ref: 'dialogue/fan-noise',
  paths: [
    {
      id: 'about-percussion',
      app: 'about',
      label: 'One firm tap, via About This Workstation',
      steps: [
        { action: DEMO_ACTIONS.reseatFan, target: WORLD_IDS.fan },
      ],
    },
    {
      id: 'escalate-to-field',
      app: 'tickets',
      label: 'Escalate it: this one wants a screwdriver and a spare part',
      steps: [
        { action: 'ticket.escalate', target: WORLD_IDS.ticket },
      ],
    },
  ],
};

const KNOWN_ACTION_IDS: ReadonlySet<string> = new Set<string>([
  ...HELPDESK_ACTION_IDS,
  ...Object.values(DEMO_ACTIONS),
]);

/**
 * Load-time content gate. A ticket that is malformed, duplicated, unreachable
 * by any registered action, or missing its KB reference is a content bug that
 * should stop the boot here rather than surface as a queue entry the player
 * cannot close. (The full solvability proof lands in M4; the per-path graph
 * tests in `paths.test.ts` are the M2 half of it.)
 */
function validateWorldTickets(
  entries: readonly WorldTicket[],
): readonly WorldTicket[] {
  const ids = new Set<string>();

  for (const entry of entries) {
    // Shape validation belongs to the engine now: it refuses a malformed
    // definition at spawn, in one place, for every world. What is left here is
    // what only the CONTENT knows - that a ticket is reachable and referenced.
    const { def } = entry;

    if (ids.has(def.id)) {
      throw new Error(`Duplicate ticket id "${def.id}".`);
    }

    ids.add(def.id);

    if (def.kb_ref.length === 0) {
      throw new Error(`Ticket "${def.id}" has no KB reference.`);
    }

    if (entry.paths.length === 0) {
      throw new Error(`Ticket "${def.id}" advertises no way to close it.`);
    }

    const pathIds = new Set<string>();

    for (const path of entry.paths) {
      if (pathIds.has(path.id)) {
        throw new Error(`Ticket "${def.id}" repeats path "${path.id}".`);
      }

      pathIds.add(path.id);

      if (path.steps.length === 0) {
        throw new Error(`Path "${path.id}" of "${def.id}" has no steps.`);
      }

      for (const step of path.steps) {
        if (!KNOWN_ACTION_IDS.has(step.action)) {
          throw new Error(
            `Path "${path.id}" of "${def.id}" uses unregistered action `
            + `"${step.action}".`,
          );
        }
      }
    }
  }

  return Object.freeze([...entries]);
}

/** Everything spawned into the shipped world, in spawn order. */
export const WORLD_TICKETS: readonly WorldTicket[] = validateWorldTickets([
  FAN_TICKET,
  ...PILOT_TICKETS,
]);

export const WORLD_TICKET_DEFS: readonly TicketDef[] = Object.freeze(
  WORLD_TICKETS.map(({ def }) => def),
);

export function findWorldTicket(id: string): WorldTicket | undefined {
  return WORLD_TICKETS.find((entry) => entry.def.id === id);
}

export function ticketTitle(id: string): string {
  return findWorldTicket(id)?.def.flavor.title ?? id;
}

/** The escalate policy the ticket actions ask before allowing an escalation. */
export function allowsEscalation(ticketId: string): boolean {
  const entry = findWorldTicket(ticketId);

  return entry !== undefined
    && acceptsEscalation(entry.def.resolved_when, entry.def.id);
}
