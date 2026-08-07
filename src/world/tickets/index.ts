import type {
  ReadOnlyGraphNode,
  ReadOnlyGraphView,
  TicketDef,
} from '../../engine-api';
import {
  FS_ACTION_IDS,
  HELPDESK_ACTION_IDS,
  INCIDENT_ACTION_IDS,
  SYSTEMD_ACTION_IDS,
} from '../actions';
import { companySetup } from '../company';
import { FIELDS } from '../fields';
import { DEMO_ACTIONS, DEMO_TICKET, WORLD_IDS } from '../demo-world';
import {
  type Classification,
  classify,
  tierResolutionTicks,
  trueImpact,
  UNTRIAGED_SLA_TICKS,
} from '../priority';
import { slaTierForTicketNodes } from '../customers';
import { ACCESS_TICKETS } from './access';
import { ARC_TICKETS } from './arc';
import { BODGE_TICKETS } from './bodge';
import { BOSS_PHONE } from './boss-trash';
import { CHANNEL_REQUEST_TICKETS } from './channel-requests';
import { COLLEAGUE_TICKETS } from './colleagues';
import { DESK_TICKETS } from './desk';
import { DRIVE_TICKETS } from './drive';
import { TIDIED_LIST } from './drip';
import { acceptsEscalation } from './escalation';
import { FLOOD_TICKETS } from './flood';
import { IDENTITY_TICKETS } from './identity';
import { acceptsParent } from './parent';
import { PILOT_TICKETS } from './pilot';
import { MSP_TICKETS } from './msp';
import { assertPathsAimAtRealNodes, seededNodeIds } from './solvable';
import type { WorldTicket } from './types';
import { mspSetup } from '../msp-company';
import { MSP_WEEK } from '../msp-week';
import { bodgeSetup } from '../second-company';
import { SECOND_WEEK } from '../second-week';
import { assertWeekTickets, WEEK } from '../week';

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
  // The systemd verbs (E6, Pass B): a fix path may restart a unit over ssh.
  ...SYSTEMD_ACTION_IDS,
  // The characteristic-incident fixes (E6, 0.19.0): a fix path vacuums a runaway
  // journal, renews an expired cert, or files the blameless postmortem.
  ...INCIDENT_ACTION_IDS,
  // The filesystem-permission verbs (E6, 0.21.0): the permission-denied fix path
  // chowns/chmods a config file readable before it restarts the unit.
  ...FS_ACTION_IDS,
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
  // in front of a player rather than as an error in front of us. The estate is
  // the UNION of both employers' worlds (0.6.0 slice 3): the roster is shared,
  // so a Bodgeworth ticket's path aims at a Bodgeworth node, and both sets of
  // ids have to count as real - only one world is ever stood up at a time, but
  // the load-time id check spans them both.
  assertPathsAimAtRealNodes(
    entries,
    new Set([
      ...seededNodeIds(companySetup()),
      ...seededNodeIds(bodgeSetup()),
      ...seededNodeIds(mspSetup()),
    ]),
  );
  assertChainsAreChains(entries);

  return Object.freeze([...entries]);
}

/**
 * The `follows` graph, checked for being a graph.
 *
 * Three things can be wrong with it and none of them looks wrong in the file.
 * A ticket that follows one nobody wrote never arrives at all, and the only
 * symptom is a chain that stops - which reads as a quiet afternoon. Two
 * tickets following the SAME one is a chain with a coin toss in it: the day
 * loop asks for "the follower" and gets whichever the roster happens to list
 * first, so the ticket the player is dealt depends on the order of an array.
 * And a cycle is a queue that fills itself: every close raises the next one,
 * for ever, in a game with an SLA on everything.
 */
function assertChainsAreChains(entries: readonly WorldTicket[]): void {
  const known = new Set(entries.map(({ def }) => def.id));
  const followedBy = new Map<string, string>();

  for (const entry of entries) {
    const { follows } = entry;

    if (follows === undefined) {
      continue;
    }

    if (!known.has(follows)) {
      throw new Error(
        `Ticket "${entry.def.id}" follows "${follows}", which nobody wrote. It `
        + 'would never be raised, and the only symptom is a chain that stops.',
      );
    }

    const already = followedBy.get(follows);

    if (already !== undefined) {
      throw new Error(
        `"${follows}" is followed by both "${already}" and "${entry.def.id}". `
        + 'The day loop raises THE follower, so which of the two a player is '
        + 'dealt would depend on the order of an array.',
      );
    }

    followedBy.set(follows, entry.def.id);
  }

  // And no chain eats its own tail. Walking forwards from each start settles
  // it in one pass per chain, which is all a roster this size needs.
  for (const start of followedBy.keys()) {
    const seen = new Set<string>([start]);

    for (
      let next = followedBy.get(start);
      next !== undefined;
      next = followedBy.get(next)
    ) {
      if (seen.has(next)) {
        throw new Error(
          `The chain through "${start}" comes back to "${next}". A close that `
          + 'raises a ticket that closes and raises it again is a queue that '
          + 'fills itself.',
        );
      }

      seen.add(next);
    }
  }
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
    ...DRIVE_TICKETS,
    ...COLLEAGUE_TICKETS,
    ...CHANNEL_REQUEST_TICKETS,
    // The second employer's queue (0.6.0 slice 3). It is in the one roster
    // because the roster is what the solvability, path and dialogue gates read;
    // its tickets are proven against the second employer's week below.
    ...BODGE_TICKETS,
    // The MSP's skeleton queue (0.8.0), proven against the MSP's week below.
    ...MSP_TICKETS,
  ]),
  // Every employer's week, so every ticket in the shared roster is proven to
  // arrive on SOME shop's day rather than shipping dead - the probation
  // twenty-eight, Bodgeworth's five, and the MSP's three.
  [WEEK, SECOND_WEEK, MSP_WEEK],
);

/**
 * The ticket a fix raises, if it raises one. The day loop asks after every
 * dispatch, which is what makes a follow-up arrive in the minute its parent
 * closed rather than at the top of the next one.
 *
 * "The" follower is exact rather than convenient: the loader refuses a roster
 * in which two tickets follow the same one, so there is never a second
 * candidate for this to pick between.
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
  engine: {
    registerTicket(def: TicketDef): void;
    readonly graph: ReadOnlyGraphView;
  },
  id: string,
): void {
  const entry = findWorldTicket(id);

  if (entry === undefined) {
    throw new Error(`Nobody wrote a ticket called "${id}".`);
  }

  engine.registerTicket(defForTier(entry, engine.graph));
}

/**
 * The ticket def as it goes to the engine, with its customer's SLA tier folded
 * in (0.12.0).
 *
 * The tier is read off the estate the ticket is about - which is already in the
 * graph when it spawns - and it sets two things: the tier is STAMPED on the def
 * so the engine writes it onto the ticket node (where the clock, the display and
 * the breach cost all read it), and the RESOLUTION budget the ticket lands with
 * is the tier's, so a Gold ticket's deadline is tighter than a Bronze one's from
 * the minute it arrives.
 *
 * An in-house ticket resolves no tier, so this returns the authored def UNTOUCHED
 * - same object, same `sla_ticks`, no `sla_tier` - which is exactly why the
 * probation and Bodgeworth goldens do not move.
 */
function defForTier(
  entry: WorldTicket,
  graph: ReadOnlyGraphView,
): TicketDef {
  const tier = slaTierForTicketNodes(graph, entry.nodes);

  if (tier === null) {
    return entry.def;
  }

  return {
    ...entry.def,
    sla_ticks: tierResolutionTicks(tier),
    sla_tier: tier,
  };
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
