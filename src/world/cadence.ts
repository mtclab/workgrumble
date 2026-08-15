/**
 * The update-cadence clock (E9, 0.37.0) - the contract's clock on TALKING.
 *
 * D4's finding, from the customer-axis research: published external SLAs bind
 * the ACKNOWLEDGMENT and the update cadence; resolution is "best effort" at
 * every vendor checked. The premium tiers sell a promise about being spoken
 * to - Salesforce's Signature plan is a fifteen-minute update cadence on a
 * Sev-1, a clock that runs out on silence, not on the fault. So a tiered
 * ticket's binding clocks are the response clock the desk already keeps and
 * this one; the resolution target it spawns with becomes the goal it always
 * really was.
 *
 * Everything here is derivation over the graph, in the shape the shipped
 * scrutiny reads set (invoice.ts): stamp monotone facts on the ticket, derive
 * every charge. Nothing writes; the contract settler dispatches the stamps.
 */

import type { ReadOnlyGraphNode, ReadOnlyGraphView } from '../engine-api';
import { serviceDeadline, serviceMinutesBetween } from './day';
import { FIELDS, SLA_TIERS, type SlaTier, slaTierOf } from './fields';
import { isPriority, type Priority, UNTRIAGED_PRIORITY } from './priority';
import { VIP_FORCED_PRIORITY } from './vip';

/**
 * Desk minutes between required customer-visible updates, per tier and
 * priority, or null where the contract makes no promise about talking.
 *
 * ONE CELL OF THIS TABLE IS SOURCED. The research records a single published
 * update cadence: Salesforce's Signature plan, its top tier, promising an
 * update every fifteen minutes on a Sev-1 and hourly on a Sev-2. That is the
 * gold column's top row and the reason this mechanic exists at all. Every
 * other number here is the game's extrapolation, and saying otherwise would be
 * this file citing a table nobody published.
 *
 * The extrapolation has the shape it has for two reasons, both of them about
 * what the sourced point implies rather than about what any vendor ships:
 *
 *  - IT LOOSENS FAST DOWN THE SEVERITY LADDER, doubling each step - gentler
 *    than the one real ladder found, which quadruples between its two
 *    published rows (fifteen minutes to sixty) and because a cadence is an interruption - a
 *    drumbeat on a P4 would be a promise that costs the customer more than it
 *    buys them.
 *  - IT THINS OUT DOWN THE TIERS, halving the drumbeat and then dropping the
 *    bottom rows entirely, a step FURTHER than the tier
 *    research goes - the vendors checked move only the top severity row
 *    between plans - taken because a game tier that changes one row of one
 *    clock would be a difficulty knob nobody can feel. The sourced part is
 *    the direction: the cheap tier's answer to a small problem is no promise
 *    at all rather than a slower one.
 *
 * The absolute numbers are scaled to the game's compressed SLA table
 * (TIER_SLA_TARGETS - a gold P1 resolves in 45 game-minutes), so they are not
 * the real-world minutes either, and the fifteen in the top-left is the real
 * fifteen only by coincidence of that scaling.
 */
const UPDATE_CADENCE:
  Readonly<Record<SlaTier, Readonly<Record<Priority, number | null>>>> = {
    [SLA_TIERS.gold]: { 1: 15, 2: 30, 3: 60, 4: 120 },
    [SLA_TIERS.silver]: { 1: 30, 2: 60, 3: 120, 4: 240 },
    [SLA_TIERS.bronze]: { 1: 60, 2: 120, 3: null, 4: null },
  };

/**
 * The priority the CONTRACT's clocks run at (0.37.1, third round).
 *
 * Forced for a flagged caller, the filed cell once one exists, and the
 * untriaged default until then - the same P3 the response and resolution
 * clocks already run at, said out loud on the pane ("the desk treats an
 * unread claim as P3"). The first cut made the cadence clock wait for the
 * player's own triage, which a verifier measured as the loophole it is: a
 * tiered ticket nobody triaged was invisible to the review's contract term,
 * so answering once and abandoning scored like keeping every promise - and
 * the eventual triage billed every window since the last words in one
 * minute. A contract does not wait for the desk's paperwork, and neither do
 * the other two clocks.
 */
export function cadencePriorityOf(
  node: Readonly<ReadOnlyGraphNode>,
): Priority {
  if (node.fields[FIELDS.vip] === true) {
    return VIP_FORCED_PRIORITY;
  }

  const stored = node.fields[FIELDS.priority];
  return isPriority(stored) ? stored : UNTRIAGED_PRIORITY;
}

/** The promised gap for this tier and priority, or null for no promise. */
export function cadenceIntervalFor(
  tier: SlaTier | null,
  priority: Priority | null,
): number | null {
  if (tier === null || priority === null) {
    return null;
  }

  return UPDATE_CADENCE[tier][priority];
}

function numberField(
  node: Readonly<ReadOnlyGraphNode>,
  field: string,
): number | null {
  const value = node.fields[field];
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

/**
 * The minute the cadence clock measures from: the last time the reporter had
 * words put to them, or failing that the first touch, or failing that the
 * arrival. Monotone by construction - each candidate only ever moves forward -
 * which is what lets the miss count below only ever grow.
 */
export function cadenceAnchor(node: Readonly<ReadOnlyGraphNode>): number {
  return Math.max(
    numberField(node, FIELDS.lastUpdateAt) ?? 0,
    numberField(node, FIELDS.respondedAt) ?? 0,
    numberField(node, FIELDS.spawnedAt) ?? 0,
  );
}

/** How many misses are already on the record. */
export function cadenceMissesOn(node: Readonly<ReadOnlyGraphNode>): number {
  return numberField(node, FIELDS.cadenceMissed) ?? 0;
}

/**
 * The minute the CURRENT window is measured from: the later of the last words
 * and the last minute silence was accounted (charged, or written off by an
 * unpark).
 *
 * The second term is the 0.37.1 second-round fix, and it is what makes both
 * write-offs whole: the first arithmetic kept every window on the anchor's
 * grid, so a park or a charge mid-window left the REMAINDER of that window
 * running - a ticket parked for one hundred percent of a window could come
 * back and bill it. Measured from here, every window is a full window of
 * actual desk silence, whatever happened before it started.
 */
function windowStart(
  node: Readonly<ReadOnlyGraphNode>,
  anchor: number,
): number {
  return Math.max(anchor, numberField(node, FIELDS.cadenceCountedTo) ?? 0);
}

/**
 * The minute the update window now running closes on - the moment silence
 * starts costing something (0.37.1).
 *
 * The pane used to print the promised GAP and the windows already missed, and
 * left the player to do the addition against a clock that skips a night and an
 * hour of lunch. Nobody does that addition; what they do instead is find out
 * afterwards. It is `serviceDeadline` off the anchor, which is the same
 * arithmetic the response clock's own deadline is, so a window that closes at
 * ten to five does not silently close during the night.
 *
 * STATIC until the record or the anchor moves, which is why the row that
 * prints it is not on the per-minute repaint: it is a fact about the world
 * rather than a countdown, exactly like the deadline beside it.
 */
export function cadenceWindowClosesAt(
  node: Readonly<ReadOnlyGraphNode>,
  interval: number,
): number {
  return serviceDeadline(windowStart(node, cadenceAnchor(node)), interval);
}

export interface CadenceDue {
  readonly ticket: string;
  /** The total the record should now show - what the settler writes. */
  readonly misses: number;
}

export interface ContractStampsDue {
  /** Tickets whose acknowledgment clock ran out untouched, unstamped. */
  readonly acks: readonly string[];
  readonly cadences: readonly CadenceDue[];
}

/**
 * Both due-reads in ONE pass over the tickets, because this runs every
 * simulated minute: two separate scans through `nodesOfKind` were enough drag
 * to push three of the suite's minute-loop harnesses over their own timeouts
 * on the day this module landed. The response-clock predicate is injected so
 * this module stays a pure derivation with no opinion about clocks.
 */
const NOTHING_DUE: ContractStampsDue = Object.freeze({
  acks: Object.freeze([]),
  cadences: Object.freeze([]),
});

export function contractStampsDue(
  graph: ReadOnlyGraphView,
  now: number,
  responseBreached: (node: Readonly<ReadOnlyGraphNode>) => boolean,
): ContractStampsDue {
  // The early-out for every in-house world: a ticket only carries a tier if
  // a CUSTOMER did, and the customers are a handful of static estate nodes
  // where the tickets are dozens and this runs every simulated minute. A
  // world with no tiered customer can never owe a stamp - the probation
  // shop's whole day skips at the cost of one tiny scan.
  const contracted = graph.nodesOfKind('customer')
    .some((node) => slaTierOf(node.fields[FIELDS.customerSlaTier]) !== null);

  if (!contracted) {
    return NOTHING_DUE;
  }

  const acks: string[] = [];
  const cadences: CadenceDue[] = [];

  for (const node of graph.nodesOfKind('ticket')) {
    const tier = slaTierOf(node.fields[FIELDS.customerSlaTier]);

    if (tier === null || node.fields[FIELDS.state] === 'resolved') {
      continue;
    }

    if (
      node.fields[FIELDS.ackMissed] !== true
      && typeof node.fields[FIELDS.respondedAt] !== 'number'
      && responseBreached(node)
    ) {
      acks.push(node.id);
    }

    if (node.fields[FIELDS.state] === 'waiting_on_user') {
      continue;
    }

    const interval = cadenceIntervalFor(tier, cadencePriorityOf(node));

    if (interval === null) {
      continue;
    }

    const start = windowStart(node, cadenceAnchor(node));

    if (now <= start) {
      continue;
    }

    const windows = Math.floor(serviceMinutesBetween(start, now) / interval);

    if (windows > 0) {
      cadences.push({
        ticket: node.id,
        misses: cadenceMissesOn(node) + windows,
      });
    }
  }

  return { acks, cadences };
}

/**
 * Whether this ticket runs on an external contract's clocks at all.
 *
 * The tier IS the fact: an in-house ticket carries none and keeps the tool's
 * resolution clock exactly as shipped.
 */
export function isContractTicket(node: Readonly<ReadOnlyGraphNode>): boolean {
  return slaTierOf(node.fields[FIELDS.customerSlaTier]) !== null;
}
