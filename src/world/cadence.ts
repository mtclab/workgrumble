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
import { serviceMinutesBetween } from './day';
import { FIELDS, SLA_TIERS, type SlaTier, slaTierOf } from './fields';
import { isPriority, type Priority } from './priority';

/**
 * Desk minutes between required customer-visible updates, per tier and
 * priority, or null where the contract makes no promise about talking.
 *
 * Scaled to the game's compressed SLA table (TIER_SLA_TARGETS - a gold P1
 * resolves in 45 game-minutes), not to the real-world numbers the research
 * cites: the SHAPE is the sourced part - the top tier's top severity is a
 * drumbeat, the ladder loosens fast, and the bottom tier stops promising
 * anything below its top rows.
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
    const countedTo = numberField(node, FIELDS.cadenceCountedTo) ?? 0;
    const counted = countedTo <= anchor
      ? 0
      : Math.floor(serviceMinutesBetween(anchor, countedTo) / interval);

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
