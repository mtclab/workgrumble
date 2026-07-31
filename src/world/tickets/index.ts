import type {
  ReadOnlyGraphNode,
  ReadOnlyGraphView,
  TicketDef,
} from '../../engine-api';
import { HELPDESK_ACTION_IDS } from '../actions';
import { companySetup } from '../company';
import { FIELDS } from '../fields';
import { DEMO_ACTIONS, DEMO_TICKET, WORLD_IDS } from '../demo-world';
import {
  type Classification,
  classify,
  trueImpact,
  UNTRIAGED_SLA_TICKS,
} from '../priority';
import { ACCESS_TICKETS } from './access';
import { ARC_TICKETS } from './arc';
import { BOSS_PHONE } from './boss-trash';
import { DESK_TICKETS } from './desk';
import { TIDIED_LIST } from './drip';
import { acceptsEscalation } from './escalation';
import { FLOOD_TICKETS } from './flood';
import { IDENTITY_TICKETS } from './identity';
import { acceptsParent } from './parent';
import { PILOT_TICKETS } from './pilot';
import { assertPathsAimAtRealNodes, seededNodeIds } from './solvable';
import type { WorldTicket } from './types';
import { assertWeekTickets } from '../week';

export { BOSS_PHONE } from './boss-trash';
export { SHARE_PARENT, VPN_PARENT } from './flood';
export { TIDIED_LIST } from './drip';
export { acceptsEscalation } from './escalation';
export {
  acceptsParent,
  type Cascade,
  cascadeComment,
  cascadesDue,
  childrenOf,
  closesWithParent,
  linkNote,
  parentOf,
} from './parent';
export {
  actionSummary,
  bounceLandsAt,
  type BounceRule,
  countsAsWork,
  encodeTouch,
  type Handoff,
  HANDOFF_BOUNCE,
  isCompleteHandoff,
  joinLines,
  TOUCH_LOG_LIMIT,
  triedFromTouches,
  type TriedEntry,
  whyThin,
  withTouch,
} from './handoff';
export { PILOT_TICKETS } from './pilot';
export { ticketsNeededFor } from './solvable';
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
  dialogue_ref: 'dialogue/yourself',
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

    // Both clocks of an untriaged ticket come from the same place, and the
    // app says out loud which place that is. A ticket carrying its own
    // deadline is a ticket whose badge reads "treated as P3" next to a
    // resolution target from a tier the player was never shown.
    if (def.sla_ticks !== UNTRIAGED_SLA_TICKS) {
      throw new Error(
        `Ticket "${def.id}" arrives with ${String(def.sla_ticks)} minutes to `
        + `resolve; an untriaged ticket gets ${String(UNTRIAGED_SLA_TICKS)}, `
        + 'because that is what "treated as P3" means.',
      );
    }

    // The duplicate flag and the ticket's own rule have to agree. The flag is
    // what the queue offers; the rule is what the engine enforces, and a
    // button that offers a close the engine will refuse is worse than no
    // button at all - while a rule that quietly allows one the queue never
    // offers is a bulk close nobody can see coming.
    const closesWithAParent = acceptsParent(def.resolved_when, def.id);

    if ((entry.duplicate === true) !== closesWithAParent) {
      throw new Error(
        `Ticket "${def.id}" is ${
          entry.duplicate === true ? '' : 'not '
        }declared a duplicate, and its resolution rule ${
          closesWithAParent ? 'does' : 'does not'
        } accept a parent. Those are the same decision written twice.`,
      );
    }

    if (entry.paths.length === 0) {
      throw new Error(`Ticket "${def.id}" advertises no way to close it.`);
    }

    // A chain is two decisions written twice as well. A ticket raised by
    // another ticket's fix cannot also be dealt by a day script - the week
    // would deal it in the morning and the fix would find it already there -
    // so it has to arrive summoned, and the week gate is what enforces the
    // other half.
    if (entry.follows !== undefined && entry.arrival !== 'summoned') {
      throw new Error(
        `Ticket "${def.id}" follows "${entry.follows}" and arrives `
        + `"${entry.arrival}". A ticket a fix raises turns up when that fix `
        + 'happens, which is not a slot anybody can put in a day.',
      );
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

  // And the cheap half of the solvability gate, which is about ids rather than
  // about outcomes: a step aimed at a node nobody built arrives as a refusal
  // in front of a player rather than as an error in front of us.
  assertPathsAimAtRealNodes(entries, seededNodeIds(companySetup()));

  return Object.freeze([...entries]);
}

/**
 * Everything the shipped world can put on the desk, in spawn order.
 *
 * The week is checked against it here, where the roster exists: every ticket
 * the week deals has to be one of these, and every one of these that is not
 * summoned has to be dealt by some day. A ticket nobody's week includes is
 * content that ships dead, and a Thursday that schedules a ticket nobody wrote
 * is a Thursday with a hole in it - neither looks like a bug from the inside.
 */
export const WORLD_TICKETS: readonly WorldTicket[] = assertWeekTickets(
  validateWorldTickets([
    FAN_TICKET,
    ...PILOT_TICKETS,
    TIDIED_LIST,
    BOSS_PHONE,
    ...IDENTITY_TICKETS,
    ...ACCESS_TICKETS,
    ...FLOOD_TICKETS,
    ...ARC_TICKETS,
    ...DESK_TICKETS,
  ]),
);

/**
 * The ticket a fix raises, if it raises one. The day loop asks after every
 * dispatch, which is what makes a follow-up arrive in the minute its parent
 * closed rather than at the top of the next one.
 */
export function followUpTo(ticketId: string): string | undefined {
  return WORLD_TICKETS.find((entry) => entry.follows === ticketId)?.def.id;
}

export const WORLD_TICKET_DEFS: readonly TicketDef[] = Object.freeze(
  WORLD_TICKETS.map(({ def }) => def),
);

export function findWorldTicket(id: string): WorldTicket | undefined {
  return WORLD_TICKETS.find((entry) => entry.def.id === id);
}

/**
 * Puts one of the shipped tickets into a world.
 *
 * Every caller that spawns a ticket - the session dealing Monday's pile, the
 * day driver dealing a drip, the lead raising one by mentioning it - goes
 * through here, so "the day schedule names a ticket nobody wrote" is one
 * sentence in one place rather than three that could drift.
 */
export function spawnWorldTicket(
  engine: { registerTicket(def: TicketDef): void },
  id: string,
): void {
  const entry = findWorldTicket(id);

  if (entry === undefined) {
    throw new Error(`Nobody wrote a ticket called "${id}".`);
  }

  engine.registerTicket(entry.def);
}

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
