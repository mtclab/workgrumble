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

/**
 * Whether this ticket runs on an external contract's clocks at all.
 *
 * The tier IS the fact: an in-house ticket carries none and keeps the tool's
 * resolution clock exactly as shipped.
 */
export function isContractTicket(node: Readonly<ReadOnlyGraphNode>): boolean {
  return slaTierOf(node.fields[FIELDS.customerSlaTier]) !== null;
}

/**
 * Every tiered, unresolved, unparked ticket whose silence has outrun the
 * promise, with the miss total its record should now show.
 *
 * The arithmetic: full windows elapsed since the anchor, capped against the
 * count already recorded. An update moves the anchor and the elapsed windows
 * fall back below the record - so the record HOLDS (misses already made stay
 * made) and nothing new is due until the silence stretches again. A parked
 * ticket is waiting on somebody who is not the desk, and the research's own
 * asymmetry applies: the clock on talking assumes there is something to say.
 */
export function cadenceMissesDue(
  graph: ReadOnlyGraphView,
  now: number,
): readonly CadenceDue[] {
  const due: CadenceDue[] = [];

  for (const node of graph.nodesOfKind('ticket')) {
    const state = node.fields[FIELDS.state];

    if (state === 'resolved' || state === 'waiting_on_user') {
      continue;
    }

    const tier = slaTierOf(node.fields[FIELDS.customerSlaTier]);
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

    // Windows elapsed since the LAST WORDS, less the windows of that same
    // silence already on the record - the counted-to watermark is what keeps
    // those two apart once an update has moved the anchor. Without it the
    // historic count swallowed every new window until the new silence had
    // outrun the whole record, which a driver test caught on the first try.
    const windows = Math.floor(serviceMinutesBetween(anchor, now) / interval);
    const countedTo = numberField(node, FIELDS.cadenceCountedTo) ?? 0;
    const counted = countedTo <= anchor
      ? 0
      : Math.floor(serviceMinutesBetween(anchor, countedTo) / interval);

    if (windows > counted) {
      due.push({
        ticket: node.id,
        misses: cadenceMissesOn(node) + (windows - counted),
      });
    }
  }

  return due;
}

/**
 * Every tiered ticket whose response clock has run out untouched and whose
 * record does not say so yet. The stamp is the settler's; this is the read.
 *
 * The response target is the acknowledgment promise - the one clock every
 * vendor checked actually binds - so running it out before the first touch is
 * the external miss that bills like a breach used to.
 */
export function ackMissesDue(
  graph: ReadOnlyGraphView,
  responseBreached: (node: Readonly<ReadOnlyGraphNode>) => boolean,
): readonly string[] {
  return graph.nodesOfKind('ticket')
    .filter((node) => isContractTicket(node)
      && node.fields[FIELDS.state] !== 'resolved'
      && node.fields[FIELDS.ackMissed] !== true
      && typeof node.fields[FIELDS.respondedAt] !== 'number'
      && responseBreached(node))
    .map((node) => node.id);
}
