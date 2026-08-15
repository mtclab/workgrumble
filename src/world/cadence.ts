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
import { isPriority, type Priority } from './priority';

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
 *  - IT LOOSENS FAST DOWN THE SEVERITY LADDER, doubling each step, because the
 *    one real ladder found does exactly that between its two published rows
 *    (fifteen minutes to sixty) and because a cadence is an interruption - a
 *    drumbeat on a P4 would be a promise that costs the customer more than it
 *    buys them.
 *  - IT THINS OUT DOWN THE TIERS, halving the drumbeat and then dropping the
 *    bottom rows entirely, because that is what the tier research says money
 *    buys everywhere it was checked: only the TOP severity row moves between
 *    plans, and the cheap tier's answer to a small problem is no promise at
 *    all rather than a slower one.
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
 * How many windows on this ticket's CURRENT anchor have already been counted.
 *
 * The record on the node is a lifetime total across every anchor the ticket
 * has had, and a re-anchor - a word to the reporter - starts the windows
 * again. This is the count since the anchor standing now, which is the only
 * count either the due-read or the pane can do arithmetic with.
 */
function countedSinceAnchor(
  node: Readonly<ReadOnlyGraphNode>,
  interval: number,
  anchor: number,
): number {
  const countedTo = numberField(node, FIELDS.cadenceCountedTo) ?? 0;

  return countedTo <= anchor
    ? 0
    : Math.floor(serviceMinutesBetween(anchor, countedTo) / interval);
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
  const anchor = cadenceAnchor(node);

  return serviceDeadline(
    anchor,
    interval * (countedSinceAnchor(node, interval, anchor) + 1),
  );
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

    const priority = node.fields[FIELDS.priority];
    const interval = cadenceIntervalFor(
      tier,
      isPriority(priority) ? priority : null,
    );

    if (interval === null) {
      continue;
    }

    const anchor = cadenceAnchor(node);

    if (now <= anchor) {
      continue;
    }

    const windows = Math.floor(serviceMinutesBetween(anchor, now) / interval);
    const counted = countedSinceAnchor(node, interval, anchor);

    if (windows > counted) {
      cadences.push({
        ticket: node.id,
        misses: cadenceMissesOn(node) + (windows - counted),
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
