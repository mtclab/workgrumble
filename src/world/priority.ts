/**
 * Triage: impact x urgency -> priority, the way the real forms do it.
 *
 * Priority is not a thing anybody picks. The reporter supplies an urgency (and
 * every reporter on earth supplies "high"); the impact is a fact about the
 * estate - how many people sit downstream of the broken thing -
 * and the player is the one who has to look. The pair goes into a 3x3 lookup
 * and the priority falls out, which is what makes triage a decision with a
 * wrong answer rather than a mood.
 *
 * Everything here is pure. The graph is only ever READ, the matrix is a table,
 * and the SLA targets are data - so the same numbers drive the ticket app, the
 * action guards and the scorecard without anybody writing them out twice.
 */

import type { ReadOnlyGraphNode, ReadOnlyGraphView } from '../engine-api';
import { SLA_TIERS, type SlaTier } from './fields';

/** 1 low, 2 medium, 3 high - for both axes. */
export const LEVELS = [1, 2, 3] as const;

export type Level = (typeof LEVELS)[number];

export function isLevel(value: unknown): value is Level {
  return typeof value === 'number' && LEVELS.some((level) => level === value);
}

export const PRIORITIES = [1, 2, 3, 4] as const;

export type Priority = (typeof PRIORITIES)[number];

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'number'
    && PRIORITIES.some((priority) => priority === value);
}

export const LEVEL_LABELS: Readonly<Record<Level, string>> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

export interface MatrixCell {
  readonly impact: Level;
  readonly urgency: Level;
  readonly priority: Priority;
}

/**
 * The lookup, written out rather than computed, because a table is what the
 * real thing is and an arithmetic shortcut is a table nobody can argue with.
 *
 * It is the ServiceNow-family default (high/high critical, low/low bottom of
 * the pile) with the fifth priority folded onto the fourth: a helpdesk with a
 * "planning" tier is a helpdesk with a queue nobody ever reaches, and this one
 * has four days in it.
 */
export const PRIORITY_MATRIX: readonly MatrixCell[] = Object.freeze([
  { impact: 3, urgency: 3, priority: 1 },
  { impact: 3, urgency: 2, priority: 2 },
  { impact: 3, urgency: 1, priority: 3 },
  { impact: 2, urgency: 3, priority: 2 },
  { impact: 2, urgency: 2, priority: 3 },
  { impact: 2, urgency: 1, priority: 4 },
  { impact: 1, urgency: 3, priority: 3 },
  { impact: 1, urgency: 2, priority: 4 },
  { impact: 1, urgency: 1, priority: 4 },
]);

export function priorityFor(impact: Level, urgency: Level): Priority {
  const cell = PRIORITY_MATRIX.find(
    (entry) => entry.impact === impact && entry.urgency === urgency,
  );

  if (cell === undefined) {
    // Unreachable while the table covers all nine cells - which is exactly
    // what the unit suite asserts, so this is the sentence that would say the
    // table had been edited down rather than a silent default priority.
    throw new Error(
      `The priority matrix has no cell for impact ${String(impact)} and `
      + `urgency ${String(urgency)}.`,
    );
  }

  return cell.priority;
}

/* -- the SLA table -------------------------------------------------------- */

export interface SlaTarget {
  /** Minutes allowed before the ticket has to have been touched. */
  readonly response: number;
  /** Minutes allowed before it has to be finished. */
  readonly resolution: number;
}

/**
 * Response and resolution targets per priority, in simulated minutes.
 *
 * The real ladder is 15 minutes / 4 hours at P1 down to 8 business hours / 3
 * days at P4. Three days does not fit in a shift, so the ladder is compressed
 * into one: every priority can still be missed inside a working day, which is
 * the only property the game needs from it, and the ORDER - each tier twice
 * the last - is the part that teaches anything.
 */
export const SLA_TARGETS: Readonly<Record<Priority, SlaTarget>> = {
  1: { response: 15, resolution: 60 },
  2: { response: 30, resolution: 120 },
  3: { response: 60, resolution: 240 },
  4: { response: 120, resolution: 480 },
};

/**
 * What an untriaged ticket is treated as until somebody classifies it.
 *
 * A ticket nobody has looked at cannot be free of a clock - that would make
 * ignoring the queue the winning move - so it sits at the middle of the ladder
 * and the app says so out loud.
 */
export const UNTRIAGED_PRIORITY: Priority = 3;

export function targetsFor(priority: Priority | null): SlaTarget {
  return SLA_TARGETS[priority ?? UNTRIAGED_PRIORITY];
}

/* -- the tier x severity SLA table (0.12.0) ------------------------------- */

/**
 * Response and resolution targets per (SLA tier, priority), in simulated
 * minutes - the table that makes a customer's tier mean something.
 *
 * The shape is the one the research names (docs/design/msp-arc.md): P1 tight,
 * P4 loose, and Gold much tighter than Bronze at every severity - the response
 * targets run a clean 4x from Gold to Bronze (a Gold P1 answered in ten minutes,
 * a Bronze in forty). Every cell is an authored integer rather than a multiplier
 * on the default ladder, because a table is what a real SLA schedule is and a
 * float rounded per cell is a table nobody can argue with - and because the
 * numbers have to stay deterministic sim-minutes the engine can breach against.
 *
 * It is DECOUPLED from `SLA_TARGETS`: that ladder is the tier-less default the
 * in-house probation and Bodgeworth worlds keep, and it does not move. This is
 * the separate ladder a customer buys into. Every column is strictly monotone -
 * Gold < Silver < Bronze at each priority, P1 < P2 < P3 < P4 within each tier -
 * so "a Gold ticket is on a tighter clock than a Bronze one of the same
 * severity" is true by construction, which is what the tier is FOR.
 */
export const TIER_SLA_TARGETS:
  Readonly<Record<SlaTier, Readonly<Record<Priority, SlaTarget>>>> = {
    [SLA_TIERS.gold]: {
      1: { response: 10, resolution: 45 },
      2: { response: 20, resolution: 90 },
      3: { response: 40, resolution: 180 },
      4: { response: 80, resolution: 360 },
    },
    [SLA_TIERS.silver]: {
      1: { response: 20, resolution: 60 },
      2: { response: 40, resolution: 120 },
      3: { response: 80, resolution: 240 },
      4: { response: 160, resolution: 420 },
    },
    [SLA_TIERS.bronze]: {
      1: { response: 40, resolution: 90 },
      2: { response: 80, resolution: 180 },
      3: { response: 160, resolution: 300 },
      4: { response: 240, resolution: 480 },
    },
  };

/**
 * The targets a ticket's clock runs on: its customer's tier crossed with its
 * severity. A `null` tier is the in-house case and returns the default ladder
 * byte-for-byte - so a probation ticket's clock is the number it always was, and
 * only a ticket at a customer reads the tiered table.
 */
export function tierTargetsFor(
  tier: SlaTier | null,
  priority: Priority | null,
): SlaTarget {
  return tier === null
    ? targetsFor(priority)
    : TIER_SLA_TARGETS[tier][priority ?? UNTRIAGED_PRIORITY];
}

/**
 * The resolution budget a ticket SPAWNS with, given its tier.
 *
 * The resolution deadline is fixed at spawn, before any triage, so it is read
 * at the untriaged priority the way `UNTRIAGED_SLA_TICKS` is - a Gold ticket
 * lands with a tighter budget than a Bronze one, and a tier-less in-house ticket
 * lands with exactly `UNTRIAGED_SLA_TICKS`, unchanged.
 */
export function tierResolutionTicks(tier: SlaTier | null): number {
  return tierTargetsFor(tier, null).resolution;
}

/**
 * The clock every ticket arrives with, before anybody has looked at it.
 *
 * Content names THIS rather than a number of its own. A ticket written with
 * its own `sla_ticks` is a ticket whose two clocks disagree: the app says
 * "untriaged, treated as P3" and prints P3's response target beside a
 * resolution deadline nobody can find in the table - the spooler said P3 and
 * had six hours, which is the tier above.
 */
export const UNTRIAGED_SLA_TICKS: number = targetsFor(null).resolution;

export function priorityLabel(priority: Priority | null): string {
  return priority === null ? 'Untriaged' : `P${String(priority)}`;
}

/* -- impact, read off the estate ------------------------------------------ */

/**
 * The blast radius of a broken thing: how many PEOPLE sit downstream of it.
 *
 * Downstream means, in one sentence: everything attached to it, everything
 * running on it, whoever owns it - and, when the broken thing is a service or
 * a device, everything sharing the machine it lives on. That last clause is
 * what makes a wedged print spooler an office-wide outage instead of a
 * conversation between a service and a printer, and leaving it out was the
 * difference between "impact 3" and "impact 0" on the one ticket that has any.
 *
 * The walk is deliberately NOT symmetric. Following every edge both ways makes
 * the estate one component and every ticket maximally important, which is a
 * measure of the office rather than of the fault.
 */
function dependentsOf(
  graph: ReadOnlyGraphView,
  node: Readonly<ReadOnlyGraphNode>,
): readonly ReadOnlyGraphNode[] {
  // What hangs off a box is what is plugged into it and whoever it belongs to.
  // The services ON it are deliberately not walked: they are a machine's own
  // plumbing, twenty-odd per box, and following them measured the operating
  // system rather than the outage - a sideways monitor came out office-wide.
  // The walk still goes the other way, from a broken service to the box it is
  // on, which is what makes a wedged spooler everybody's problem.
  const hangingOff = (id: string): readonly ReadOnlyGraphNode[] => [
    ...graph.neighbors(id, { direction: 'in', edgeKind: 'connected_to' }),
    ...graph.neighbors(id, { direction: 'in', edgeKind: 'owns' }),
  ];

  const found = [...hangingOff(node.id)];

  if (node.kind === 'service' || node.kind === 'device') {
    const hosts = [
      ...graph.neighbors(node.id, { direction: 'out', edgeKind: 'connected_to' }),
      ...graph.neighbors(node.id, { direction: 'out', edgeKind: 'runs_on' }),
    ];

    for (const host of hosts) {
      found.push(host, ...hangingOff(host.id));
    }
  }

  return found;
}

/**
 * How many people a fault at these nodes reaches.
 *
 * It used to count services as well as people, which worked while a machine
 * had two of them on it. Now that every box in the building runs its real
 * twenty-odd - which is the point of a services list a player has to read -
 * that count measures the OS rather than the outage: a sideways monitor on one
 * desk reached twenty-three "affected services" and was read as an office-wide
 * incident. Impact is the number of users affected, which is what it is on
 * every real incident form, and services are how the walk gets from a fault to
 * the people who will ring about it.
 */
export function affectedCount(
  graph: ReadOnlyGraphView,
  nodes: readonly string[],
): number {
  const seeds = new Set(nodes);
  const seen = new Set(nodes);
  const queue = [...nodes];
  let affected = 0;

  while (queue.length > 0) {
    const id = queue.shift();

    if (id === undefined) {
      continue;
    }

    const node = graph.getNode(id);

    if (node === undefined) {
      continue;
    }

    if (!seeds.has(id) && node.kind === 'person') {
      affected += 1;
    }

    for (const next of dependentsOf(graph, node)) {
      if (!seen.has(next.id)) {
        seen.add(next.id);
        queue.push(next.id);
      }
    }
  }

  return affected;
}

/** Where the count stops being one desk and starts being a floor. */
export const IMPACT_BANDS: readonly { readonly from: number; readonly level: Level }[] =
  Object.freeze([
    { from: 6, level: 3 },
    { from: 3, level: 2 },
    { from: 0, level: 1 },
  ]);

export function impactForCount(affected: number): Level {
  return IMPACT_BANDS.find((band) => affected >= band.from)?.level ?? 1;
}

/** The impact the estate actually supports, whatever the player picked. */
export function trueImpact(
  graph: ReadOnlyGraphView,
  nodes: readonly string[],
): Level {
  return impactForCount(affectedCount(graph, nodes));
}

/* -- misclassification ---------------------------------------------------- */

export interface Classification {
  readonly impact: Level;
  readonly urgency: Level;
  readonly priority: Priority;
}

export function classify(impact: Level, urgency: Level): Classification {
  return { impact, urgency, priority: priorityFor(impact, urgency) };
}

/**
 * Whether the player's cell is the cell the world supports.
 *
 * It compares CELLS rather than priorities on purpose: two different mistakes
 * that happen to land on the same priority are still two mistakes, and the
 * review reads the classification, not just the number it produced.
 */
export function isMisclassified(
  assigned: Readonly<Classification> | null,
  truth: Readonly<Classification>,
): boolean {
  return assigned !== null
    && (assigned.impact !== truth.impact || assigned.urgency !== truth.urgency);
}

export function cellLabel(cell: Readonly<Classification>): string {
  return `${LEVEL_LABELS[cell.impact]} impact / `
    + `${LEVEL_LABELS[cell.urgency]} urgency (P${String(cell.priority)})`;
}
