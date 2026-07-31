import type {
  ReadOnlyGraphNode,
  ReadOnlyGraphView,
  TicketDef,
} from '../../engine-api';
import { HELPDESK_ACTION_IDS } from '../actions';
import type { ScheduledTicket } from '../day';
import { FIELDS } from '../fields';
import { DEMO_ACTIONS, DEMO_TICKET, WORLD_IDS } from '../demo-world';
import { type Classification, classify, trueImpact } from '../priority';
import { BOSS_PHONE } from './boss-trash';
import { acceptsEscalation } from './escalation';
import { PILOT_TICKETS } from './pilot';
import type { WorldTicket } from './types';

export { BOSS_PHONE } from './boss-trash';
export { acceptsEscalation } from './escalation';
export {
  actionSummary,
  bounceLandsAt,
  type BounceRule,
  type Handoff,
  HANDOFF_BOUNCE,
  isCompleteHandoff,
  joinLines,
  triedFromLog,
  type TriedEntry,
  whyThin,
} from './handoff';
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
  arrival: 'morning',
  // The fan and the box it is bolted into. The machine is in the set because
  // it is what a tech actually touches while chasing a noise - and it is what
  // makes "what I tried" on the handoff form have anything in it.
  nodes: [WORLD_IDS.fan, WORLD_IDS.machine],
  // You filed it yourself, about your own desk, and you were annoyed enough
  // at the time to tick the middle box. It has been making that noise for a
  // fortnight.
  claimed_urgency: 2,
  true_urgency: 1,
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
        {
          action: 'ticket.escalate',
          target: WORLD_IDS.ticket,
          // Second line take tickets on a form. A path that skips it is a
          // path that bounces, which is not a way to close anything.
          params: {
            reported: 'It sounds like a hornet in a biscuit tin.',
            tried: 'Reseated the fan\nListened to it, at length',
          },
        },
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

    // Without a node set there is no impact to read off the estate, no way to
    // tell which of the day's dispatches were about this fault, and no
    // response clock. A ticket about nothing is a ticket nobody can triage.
    if (entry.nodes.length === 0) {
      throw new Error(`Ticket "${def.id}" names no nodes it is about.`);
    }

    if (entry.nodes.some((id) => id.length === 0)) {
      throw new Error(`Ticket "${def.id}" names an empty node id.`);
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

/** Everything the shipped world can put on the desk, in spawn order. */
export const WORLD_TICKETS: readonly WorldTicket[] = validateWorldTickets([
  FAN_TICKET,
  ...PILOT_TICKETS,
  BOSS_PHONE,
]);

export const WORLD_TICKET_DEFS: readonly TicketDef[] = Object.freeze(
  WORLD_TICKETS.map(({ def }) => def),
);

export function findWorldTicket(id: string): WorldTicket | undefined {
  return WORLD_TICKETS.find((entry) => entry.def.id === id);
}

/**
 * The shipped content as the day scheduler reads it.
 *
 * Everything here arrives in the morning today: four tickets is the pile you
 * inherit at 08:00, and the shift's own arrivals are what the M4 content lands
 * into. The scheduler does not care - it deals whatever the pool declares.
 */
export function ticketArrivalPool(): readonly ScheduledTicket[] {
  // A summoned ticket has no slot in anybody's day: it turns up when the man
  // who raised it decides it has, and the boss system is what puts it on the
  // desk. Handing it to the scheduler at all would be a slot the scheduler
  // then had to know to ignore.
  return WORLD_TICKETS
    .filter((entry) => entry.arrival !== 'summoned')
    .map((entry) => ({
      id: entry.def.id,
      arrival: entry.arrival,
    }));
}

/** The tickets that are already in the queue when the player sits down. */
export const MORNING_TICKET_DEFS: readonly TicketDef[] = Object.freeze(
  WORLD_TICKETS
    .filter((entry) => entry.arrival === 'morning')
    .map(({ def }) => def),
);

export function ticketTitle(id: string): string {
  return findWorldTicket(id)?.def.flavor.title ?? id;
}

/**
 * What every resolved ticket in this list is worth in reputation, in total.
 *
 * A total rather than a count because the credit is archetype-weighted - the
 * spooler outage is worth more than a rotated screen - and because a total is
 * what the meters can compare against a watermark: what has been earned so
 * far, minus what has already been paid out.
 */
export function resolveCredit(
  tickets: readonly Readonly<ReadOnlyGraphNode>[],
): number {
  return tickets.reduce((total, ticket) => {
    const resolved = ticket.fields[FIELDS.state] === 'resolved';
    const reward = findWorldTicket(ticket.id)?.def.reward.reputation ?? 0;
    return resolved ? total + Math.max(0, reward) : total;
  }, 0);
}

/** The estate a ticket is about, or nothing when nobody wrote it down. */
export function ticketNodes(ticketId: string): readonly string[] {
  return findWorldTicket(ticketId)?.nodes ?? [];
}

/**
 * The triage the world supports: impact read off the estate, urgency read off
 * the content. It is what the scorecard compares the player's cell against,
 * and it is deliberately not the reporter's opinion - theirs is the claim.
 */
export function trueClassification(
  graph: ReadOnlyGraphView,
  ticketId: string,
): Classification | null {
  const entry = findWorldTicket(ticketId);

  return entry === undefined
    ? null
    : classify(trueImpact(graph, entry.nodes), entry.true_urgency);
}

/** The escalate policy the ticket actions ask before allowing an escalation. */
export function allowsEscalation(ticketId: string): boolean {
  const entry = findWorldTicket(ticketId);

  return entry !== undefined
    && acceptsEscalation(entry.def.resolved_when, entry.def.id);
}
