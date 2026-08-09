/**
 * The project phase machine (0.29.0, E10): work that is not a ticket, as a pure
 * derivation.
 *
 * A ticket is one fault with one clock on it. A PROJECT is a phased piece of
 * delivery - audit, staging, cutover, the scream test and the handover - whose
 * tasks ride the ordinary ticket lifecycle (so touch evidence, the SLA
 * semantics and the handoff form all come free) and whose PHASES are something
 * else entirely. This module is that something else, and it is built the way
 * `change-request.ts` is built, one scale up:
 *
 *  - the SCHEDULE is baked ONCE, at kickoff, out of the business-hours calendar
 *    (`serviceDeadline`, which already rolls a deadline across nights). Three
 *    working days is arithmetic, done in one place, written onto the project
 *    node as ticks;
 *  - the LIVE PHASE is never stored. It is read - every time anybody asks -
 *    off those baked ticks, the clock, and the state of the estate. A save
 *    taken halfway through the staging phase reloads into the identical
 *    derivation, because there was never anything to save;
 *  - a GATE is a fact about the world, not a flag somebody sets. "The audit is
 *    done" is "the old box has been read"; "staging is done" is "no rule anybody
 *    knows about is still missing from the new box"; "the cutover happened" is
 *    "the circuit is plugged into the new box", which is an EDGE. That is what
 *    makes the rollback a real verb: move the cable back and the derivation
 *    says the cutover has not happened, without anything having to remember to
 *    un-say it.
 *
 * The gates use exactly the two shapes the assertion language can honestly
 * carry (the spec's own constraint, and the reason this version ships no new
 * grammar): equality on a field, and universal-quantification-by-negation -
 * `not(exists(kind, where))`, which is what "nothing is left on the old thing"
 * looks like when you cannot count. Every gate below is built here as an `Expr`
 * and used TWICE - once as a phase ticket's `resolved_when`, once as this
 * module's own read - so the ticket that closes and the board that says the
 * phase is done cannot disagree.
 *
 * Nothing here mutates, dispatches, reads a wall clock or consumes the RNG.
 */

import type {
  Expr,
  ReadOnlyGraphNode,
  ReadOnlyGraphView,
  SetupOp,
} from '../engine-api';
import { PROJECT_ACTIONS } from './actions/ids';
import { changeRequestAuthorises } from './change-request';
import { AUDIT_SOURCES, type AuditSource, auditSourceOf, FIELDS } from './fields';
import {
  ARDEN_EDGE_PROJECT,
  ARDEN_EDGE_PROJECT_NAME,
  MSP_CUSTOMERS,
  MSP_IDS,
} from './msp-company';
import {
  dayForTick,
  minuteOfDay,
  serviceDeadline,
  serviceMinutesBetween,
} from './hours';

/* -- the phases ----------------------------------------------------------- */

/**
 * The ordered chain, in the words the trade uses. It is the canonical phase
 * chain every source in the research converges on, minus the ones an MSP does
 * not do inside three days: discovery/audit -> configure -> cutover -> the
 * stabilisation window -> handover.
 *
 * `handover` is the terminal state rather than a fifth thing to do: a project
 * whose scream test is quiet and whose rules are all carried is a project that
 * is finished, and the sign-off is the ticket that says so.
 */
export const PROJECT_PHASES = [
  'audit',
  'staging',
  'cutover',
  'scream_test',
  'handover',
] as const;

export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const PROJECT_PHASE_LABELS: Readonly<Record<ProjectPhase, string>> = {
  audit: 'Audit',
  staging: 'Staging config',
  cutover: 'Cutover',
  scream_test: 'Scream test',
  handover: 'Handover',
};

/**
 * Why the phase in front of you cannot be worked THIS MINUTE.
 *
 * Blocked is derived like everything else and it is deliberately not a phase:
 * a project waiting on a change window has not moved to a different stage of
 * the work, it is standing in the same one with its hands in its pockets,
 * which is exactly what a stalled project looks like from the outside. Naming
 * the reason is the whole value - "no longer moving" with no sentence attached
 * is the status report this game is a parody of.
 */
export type ProjectBlock = 'awaiting_change_window' | 'in_change_window';

export interface ProjectStatus {
  readonly id: string;
  /** The phase this minute, derived - never read off the node. */
  readonly phase: ProjectPhase;
  /**
   * Why the phase in front of you cannot be worked this minute, or null when it
   * can. Only the cutover has one: it is the only phase whose permission lives
   * outside the project, on a change request whose window the clock decides.
   */
  readonly blocked: ProjectBlock | null;
  /** The baked tick this phase was due by, or null once there is none left. */
  readonly due: number | null;
  /** Whether the clock has already gone past that. */
  readonly late: boolean;
  /**
   * Working minutes between now and the due tick - the number that makes a
   * date three days out legible, and the one that goes negative BEFORE the
   * project is lost rather than after.
   */
  readonly minutesLeft: number;
  /** Whether the cable has moved, and whether it was moved back. */
  readonly cutoverAt: number | null;
  readonly rolledBackAt: number | null;
  /** Whether every phase gate has passed. */
  readonly complete: boolean;
}

/* -- the schedule, baked once --------------------------------------------- */

/**
 * The plan, in SERVICE minutes from the minute the project starts - which is
 * the only unit a plan can honestly be in here, because a night is not a
 * minute anybody could have used and `serviceDeadline` already knows that.
 *
 * Three working days, and the shape of them is the shape of the real job: the
 * audit is a morning, the configuration is the rest of the first day, the
 * cutover is booked for the middle of the second (a window, at an hour nobody
 * wanted), and the handover is signed on the third with an hour to spare before
 * the week's review. Kicked off at nine on a Wednesday, that reads: audit by
 * noon, staging by five, cutover by three on Thursday, signed off by two on
 * Friday.
 *
 * OVERSEER TUNING KNOBS, all four, and cumulative from the start rather than
 * per-phase: a plan is a set of DATES, and dates that were each measured from
 * the end of the last phase would move when the work did, which is precisely
 * the thing a deadline is not allowed to do.
 */
export const PROJECT_BUDGETS = Object.freeze({
  audit: 180,
  staging: 480,
  cutover: 840,
  handover: 1_260,
});

/** The four baked ticks, as a project node's schedule fields. */
export function projectSchedule(
  startedAt: number,
): Readonly<Record<string, number>> {
  return {
    [FIELDS.projectStartedAt]: startedAt,
    [FIELDS.projectAuditDue]: serviceDeadline(startedAt, PROJECT_BUDGETS.audit),
    [FIELDS.projectStagingDue]: serviceDeadline(
      startedAt,
      PROJECT_BUDGETS.staging,
    ),
    [FIELDS.projectCutoverDue]: serviceDeadline(
      startedAt,
      PROJECT_BUDGETS.cutover,
    ),
    [FIELDS.projectHandoverDue]: serviceDeadline(
      startedAt,
      PROJECT_BUDGETS.handover,
    ),
  };
}

/**
 * How many working days a project needs after the day it starts on. Two, and
 * it is read off the budget rather than typed: the last phase is due
 * `handover` service minutes out, and a shift is `SHIFT_MINUTES` long.
 *
 * The kickoff gate uses it to refuse to START a project that cannot finish -
 * a three-day plan begun on a Thursday is not a challenge, it is a project the
 * week has nowhere to put, and the carry across weeks is a later version's job.
 */
export const PROJECT_DAYS = 3;

/* -- reading the estate --------------------------------------------------- */

function numberField(
  node: Readonly<ReadOnlyGraphNode>,
  field: string,
): number | null {
  const value = node.fields[field];
  return typeof value === 'number' ? value : null;
}

/** Every rule this project is about, in the order canon migrates them in. */
export function projectRules(
  graph: ReadOnlyGraphView,
  projectId: string,
): readonly Readonly<ReadOnlyGraphNode>[] {
  return graph
    .nodesOfKind('service')
    .filter((node) => node.fields[FIELDS.fwRuleProject] === projectId)
    .sort((left, right) =>
      (numberField(left, FIELDS.fwRuleOrder) ?? 0)
      - (numberField(right, FIELDS.fwRuleOrder) ?? 0));
}

/**
 * Whether a rule is one anybody KNOWS about, which is the whole of the beat.
 *
 * A rule the handover pack lists is known to everybody who has read the pack.
 * A rule that exists only in the live configuration - the hole the machine
 * vendor asked for in 2019, the port the scanners call back on - is known only
 * if somebody actually read the box. Both are real rules and both break the
 * same way; the difference is entirely in whether anyone looked.
 */
export function ruleIsKnown(
  rule: Readonly<ReadOnlyGraphNode>,
  source: AuditSource | null,
): boolean {
  return rule.fields[FIELDS.fwRuleDocumented] === true
    || source === AUDIT_SOURCES.config;
}

export function ruleIsMigrated(rule: Readonly<ReadOnlyGraphNode>): boolean {
  return rule.fields[FIELDS.fwRuleMigrated] === true;
}

/* -- the gates, as expressions the tickets and this module share ---------- */

/**
 * The AUDIT gate: somebody has established what the old box is doing.
 *
 * Equality on one field, and it passes for BOTH answers - the live-config read
 * and the pack taken as read. That is on purpose and it is the hinge of the
 * whole project: signing off an audit you did not do is not refused by the
 * world, because in the trade it is not refused either. It comes back in two
 * days with a phone call from a factory.
 */
export function auditGate(edgeBoxId: string): Expr {
  return {
    op: 'eq',
    selector: { id: edgeBoxId },
    field: FIELDS.fwAudited,
    value: true,
  };
}

/**
 * The STAGING gate: every rule anybody knows about is on the new box.
 *
 * Universal-by-negation, twice, under an `or` on which audit was done - which
 * is how "every KNOWN rule" is said in a language that cannot quantify over a
 * predicate. Read a box properly and nothing at all may be left unmigrated;
 * take the pack as read and only what the pack lists is asked for, because
 * nothing else was ever on your list.
 *
 * It is the honest gate either way, and that is the point: the shortcut PASSES.
 */
export function stagingGate(projectId: string, edgeBoxId: string): Expr {
  const unmigrated = (extra: readonly { field: string; value: string | boolean }[]): Expr => ({
    op: 'not',
    expr: {
      op: 'exists',
      kind: 'service',
      where: [
        { field: FIELDS.fwRuleProject, value: projectId },
        { field: FIELDS.fwRuleMigrated, value: false },
        ...extra,
      ],
    },
  });

  return {
    op: 'or',
    exprs: [
      {
        op: 'and',
        exprs: [
          {
            op: 'eq',
            selector: { id: edgeBoxId },
            field: FIELDS.fwAuditSource,
            value: AUDIT_SOURCES.config,
          },
          unmigrated([]),
        ],
      },
      {
        op: 'and',
        exprs: [
          {
            op: 'eq',
            selector: { id: edgeBoxId },
            field: FIELDS.fwAuditSource,
            value: AUDIT_SOURCES.pack,
          },
          unmigrated([{ field: FIELDS.fwRuleDocumented, value: true }]),
        ],
      },
    ],
  };
}

/**
 * The CUTOVER gate: the circuit is in the new box.
 *
 * An edge, which is the most literal thing this language can say and exactly
 * what the job is - the ISP's handoff has one cable out of it and the cutover
 * is which box that cable is in. Nothing derived, nothing stamped: unplug it
 * again and this is false again, which is what makes the rollback honest.
 */
export function cutoverGate(circuitId: string, newBoxId: string): Expr {
  return {
    op: 'edge',
    from: { id: circuitId },
    to: { id: newBoxId },
    kind: 'connected_to',
  };
}

/**
 * The HANDOVER gate: the plant is behind the new box, NO rule at all is left
 * unmigrated - known or not, pack or no pack - and the as-built is written down.
 *
 * The middle clause is the completion shape the whole content was chosen for,
 * and it is deliberately the unfiltered one. Staging asks about the rules
 * anybody knew about, because that is all anybody could have carried; the
 * handover asks about the rules, because a plant that cannot reach its press
 * line does not care which piece of paper the tunnel was on.
 *
 * The third clause is the phase every project drops. Recording what is actually
 * on the new box is the same act as reading what was on the old one - it is the
 * same verb, pointed the other way - and it is last on purpose: a sign-off with
 * no as-built behind it is why the next engineer here pays for the discovery
 * twice.
 */
export function handoverGate(estate: ProjectEstate): Expr {
  return {
    op: 'and',
    exprs: [
      cutoverGate(estate.circuitId, estate.newBoxId),
      {
        op: 'not',
        expr: {
          op: 'exists',
          kind: 'service',
          where: [
            { field: FIELDS.fwRuleProject, value: estate.projectId },
            { field: FIELDS.fwRuleMigrated, value: false },
          ],
        },
      },
      {
        op: 'eq',
        selector: { id: estate.newBoxId },
        field: FIELDS.fwAudited,
        value: true,
      },
    ],
  };
}

/* -- the derivation ------------------------------------------------------- */

/**
 * The four gates, read against the graph rather than evaluated by the engine.
 *
 * They are read here rather than by asking the engine to evaluate the `Expr`
 * because a surface asks this question on every repaint and the engine's
 * evaluator is for resolution rules. The two ARE the same claim, which is a
 * thing that has to be PROVEN rather than asserted: `project.test.ts` drives
 * every gate both ways - through a phase ticket's own `resolved_when` and
 * through this read - and requires them to agree at every step.
 */
export interface ProjectEstate {
  readonly projectId: string;
  readonly edgeBoxId: string;
  readonly newBoxId: string;
  readonly circuitId: string;
}

function auditPassed(
  graph: ReadOnlyGraphView,
  estate: ProjectEstate,
): boolean {
  return graph.getField(estate.edgeBoxId, FIELDS.fwAudited) === true;
}

function stagingPassed(
  graph: ReadOnlyGraphView,
  estate: ProjectEstate,
): boolean {
  const source = auditSourceOf(
    graph.getField(estate.edgeBoxId, FIELDS.fwAuditSource),
  );

  if (source === null) {
    return false;
  }

  return projectRules(graph, estate.projectId).every(
    (rule) => ruleIsMigrated(rule) || !ruleIsKnown(rule, source),
  );
}

function cutoverPassed(
  graph: ReadOnlyGraphView,
  estate: ProjectEstate,
): boolean {
  return graph
    .neighbors(estate.circuitId, {
      direction: 'out',
      edgeKind: 'connected_to',
    })
    .some((node) => node.id === estate.newBoxId);
}

/**
 * The last gate: nothing left on the old box, and the new one written up.
 *
 * It does NOT ask whether a night has gone by. The night belongs to the scream
 * test's settler, which is a question about when a factory notices something -
 * and a project that carried everything is finished when it is finished, not
 * when the calendar says it may be.
 */
function handoverPassed(
  graph: ReadOnlyGraphView,
  estate: ProjectEstate,
): boolean {
  return projectRules(graph, estate.projectId).every(ruleIsMigrated)
    && graph.getField(estate.newBoxId, FIELDS.fwAudited) === true;
}

export function projectCutoverAt(
  graph: ReadOnlyGraphView,
  projectId: string,
): number | null {
  const value = graph.getField(projectId, FIELDS.projectCutoverAt);
  return typeof value === 'number' ? value : null;
}

export function projectRolledBackAt(
  graph: ReadOnlyGraphView,
  projectId: string,
): number | null {
  const value = graph.getField(projectId, FIELDS.projectRolledBackAt);
  return typeof value === 'number' ? value : null;
}

/**
 * Whether the cutover may be done THIS minute, read off the change request that
 * authorises it.
 *
 * The project does not get a private calendar, and this is the line where that
 * is enforced: the only thing that opens the cutover is the 0.10.0 change
 * request, filed through the ordinary flow against exactly this (box, verb),
 * approved by the customer's own IT, and inside the window the request baked at
 * filing time. `changeRequestAuthorises` is the same consult the systemctl gate
 * has run since 0.18.0 - one question, one answer, one place.
 *
 * "Blocked" is therefore the honest word for the whole of the cutover phase up
 * until the slot opens: the work is ready, the paperwork is in, and nothing can
 * happen for another forty minutes. That is what waiting on a window is, and a
 * board that showed it as progress would be the watermelon this game is about.
 */
function cutoverBlock(
  graph: ReadOnlyGraphView,
  estate: ProjectEstate,
  now: number,
): ProjectBlock {
  const open = graph
    .nodesOfKind('change_request')
    .some((node) => changeRequestAuthorises(
      node,
      estate.newBoxId,
      PROJECT_ACTIONS.cutover,
      now,
    ));

  return open ? 'in_change_window' : 'awaiting_change_window';
}

/** The tick a phase is due by, off the baked schedule. */
function dueFor(
  graph: ReadOnlyGraphView,
  projectId: string,
  phase: ProjectPhase,
): number | null {
  const field = {
    audit: FIELDS.projectAuditDue,
    staging: FIELDS.projectStagingDue,
    cutover: FIELDS.projectCutoverDue,
    scream_test: FIELDS.projectHandoverDue,
    handover: FIELDS.projectHandoverDue,
  }[phase];
  const value = graph.getField(projectId, field);

  return typeof value === 'number' ? value : null;
}

/**
 * Where the project actually IS, this minute.
 *
 * The phase is the first gate that has not passed, which is the only definition
 * that cannot drift: there is no transition to miss, no state to forget to
 * advance, and a rollback moves it BACKWARDS for free because the gate it
 * un-satisfies is the one being read. The clock does two things and no more -
 * it decides whether the scream test has been sat, and it decides whether the
 * date the plan named has been passed.
 */
export function projectStatus(
  graph: ReadOnlyGraphView,
  estate: ProjectEstate,
  now: number,
): ProjectStatus | null {
  const project = graph.getNode(estate.projectId);

  if (project === undefined || project.kind !== 'project') {
    return null;
  }

  const phase = ((): ProjectPhase => {
    if (!auditPassed(graph, estate)) {
      return 'audit';
    }

    if (!stagingPassed(graph, estate)) {
      return 'staging';
    }

    if (!cutoverPassed(graph, estate)) {
      return 'cutover';
    }

    return handoverPassed(graph, estate) ? 'handover' : 'scream_test';
  })();

  const complete = phase === 'handover';
  const due = complete ? null : dueFor(graph, estate.projectId, phase);

  return {
    id: estate.projectId,
    phase,
    blocked: phase === 'cutover' ? cutoverBlock(graph, estate, now) : null,
    due,
    late: due !== null && now > due,
    minutesLeft: due === null
      ? 0
      : serviceMinutesBetween(now, due) - serviceMinutesBetween(due, now),
    cutoverAt: projectCutoverAt(graph, estate.projectId),
    rolledBackAt: projectRolledBackAt(graph, estate.projectId),
    complete,
  };
}

/* -- the scream test: what is due the morning after ----------------------- */

export interface ScreamTestFinding {
  /** The rule nobody carried over. */
  readonly rule: string;
  /** The ticket authored about exactly that rule. */
  readonly ticket: string;
}

/**
 * Every rule the cutover broke and nobody has heard about yet.
 *
 * A pure "what is due right now" read, exactly like `socialEngineeringDue` and
 * `selinuxAuditDue` and on the same rail: the world decides whether there is a
 * consequence, the day driver settles it at the next start of shift, and a
 * replay lands on the same tickets in the same minute because the decision is a
 * function of the world and the tick and nothing else.
 *
 * The condition is the lesson written as a query: the cable moved, a night has
 * gone by, this rule never made it onto the new box, and nobody has rung about
 * it yet. It says nothing about WHY the rule was missed - an audit that never
 * looked and a migration that ran out of afternoon break a factory the same
 * amount - and it is empty, on purpose and reachably, for a project that
 * carried everything: that morning is quiet, and the quiet is the reward.
 *
 * A rollback does not clear it. The window was spent and the tunnel was down
 * for the length of it; the tickets that came out of that are the record of
 * what the window found, and deleting them would be the one thing a rollback
 * must never do.
 */
export function screamTestDue(
  graph: ReadOnlyGraphView,
  projectId: string,
  now: number,
): readonly ScreamTestFinding[] {
  const cutoverAt = projectCutoverAt(graph, projectId);

  if (cutoverAt === null || dayForTick(cutoverAt) >= dayForTick(now)) {
    return [];
  }

  return projectRules(graph, projectId).flatMap((rule) => {
    const ticket = rule.fields[FIELDS.fwRuleScreamTicket];

    if (ruleIsMigrated(rule)
      || typeof ticket !== 'string'
      || typeof rule.fields[FIELDS.fwRuleScreamedAt] === 'number') {
      return [];
    }

    return [{ rule: rule.id, ticket }];
  });
}

/* -- the board, as lines a terminal prints -------------------------------- */

/** A tick as a face a plan can name: `Day 4 15:00`. */
export function projectClockLabel(tick: number): string {
  const minute = minuteOfDay(tick);

  return `Day ${String(dayForTick(tick))} ${
    String(Math.floor(minute / 60)).padStart(2, '0')
  }:${String(minute % 60).padStart(2, '0')}`;
}

/**
 * The plan against the clock, as the lines the terminal prints - the first
 * long-horizon deadline surface this game has had.
 *
 * The one design job the research says decides whether this mechanic is fun is
 * that a date three days out has to be LEGIBLE and slipping has to be visible
 * before it is fatal. So every phase prints its date AND the working minutes
 * between now and it, and the one you are standing in is marked. A negative
 * number is the whole warning: it appears while there is still a project to
 * save, which a red square at the end of the week would not.
 */
export function projectBoardLines(
  graph: ReadOnlyGraphView,
  estate: ProjectEstate,
  now: number,
): readonly string[] {
  const status = projectStatus(graph, estate, now);

  if (status === null) {
    return [];
  }

  const name = graph.getField(estate.projectId, FIELDS.name);
  const passed: Readonly<Record<ProjectPhase, boolean>> = {
    audit: auditPassed(graph, estate),
    staging: stagingPassed(graph, estate),
    cutover: cutoverPassed(graph, estate),
    scream_test: handoverPassed(graph, estate),
    handover: status.complete,
  };

  const rows = PROJECT_PHASES.filter((phase) => phase !== 'handover').map(
    (phase) => {
      const due = dueFor(graph, estate.projectId, phase);
      const left = due === null
        ? 0
        : serviceMinutesBetween(now, due) - serviceMinutesBetween(due, now);
      const mark = passed[phase] ? 'done' : phase === status.phase ? 'NOW ' : '    ';
      const when = due === null ? '' : projectClockLabel(due);
      const slack = passed[phase]
        ? ''
        : `  ${left < 0 ? '' : '+'}${String(left)} working min`;

      return `  [${mark}] ${PROJECT_PHASE_LABELS[phase].padEnd(14)}${when}${slack}`;
    },
  );

  return [
    typeof name === 'string' ? name : estate.projectId,
    status.complete
      ? '  Signed off. Nothing left on the old box.'
      : `  Now: ${PROJECT_PHASE_LABELS[status.phase]}${
        status.late ? ' - LATE' : ''
      }`,
    ...rows,
    ...(status.rolledBackAt === null
      ? []
      : [
        `  Rolled back at ${projectClockLabel(status.rolledBackAt)}. The window`,
        '  was spent; what it raised stands.',
      ]),
  ];
}

/* -- the kickoff ---------------------------------------------------------- */

/**
 * The project node, as the op that puts it into the world.
 *
 * Only the node: the ESTATE it is about - the two boxes, the circuit and the
 * rule set - is seeded with the customer, because a firewall that turned up the
 * morning the project started would be a firewall nobody had procured. The
 * thing that arrives at kickoff is the WORK, and the work is a schedule.
 *
 * Idempotent by the project node itself, the way `onboarding.ts` is idempotent
 * by its customer: the driver skips a kickoff whose project is already in the
 * graph, so a replay, a reload landing back inside the day, or a second start
 * of shift cannot stand the same project up twice or - worse - re-bake its
 * dates against a later minute.
 */
export function projectKickoffSetup(
  projectId: string,
  name: string,
  customerId: string,
  startedAt: number,
): readonly SetupOp[] {
  return [
    {
      op: 'addNode',
      node: {
        id: projectId,
        kind: 'project',
        fields: {
          [FIELDS.name]: name,
          [FIELDS.projectCustomer]: customerId,
          ...projectSchedule(startedAt),
        },
      },
    },
  ];
}

/* -- the one project this version ships ----------------------------------- */

/**
 * The four ids every read above takes, for ARDEN-MFG's edge replacement: the
 * project, the box being replaced, the box replacing it, and the circuit whose
 * cable decides which of the two the plant is actually behind.
 *
 * It lives here rather than beside the estate seed because the DIRECTION of the
 * dependency matters: the world's content knows nothing about projects, and the
 * project layer knows which content it is about. Turned the other way round, the
 * MSP's estate would import the phase machine, the phase machine would import
 * the change request, and the change request's action set would come back round
 * to the estate - which it does, and which is a boot that fails on a Tuesday.
 */
export const ARDEN_EDGE_ESTATE: ProjectEstate = Object.freeze({
  projectId: ARDEN_EDGE_PROJECT,
  edgeBoxId: MSP_IDS.ardenEdgeOld,
  newBoxId: MSP_IDS.ardenEdgeNew,
  circuitId: MSP_IDS.ardenCircuit,
});

/**
 * The project itself, as the ops the kickoff applies: the schedule, baked
 * against the minute it actually started.
 *
 * Only the project node. The estate is seeded with the customer, because the
 * boxes and the circuit were there before anybody scheduled anything; what
 * arrives on the day is the WORK, and the work is four dates.
 */
export function ardenEdgeKickoffSetup(startedAt: number): readonly SetupOp[] {
  return projectKickoffSetup(
    ARDEN_EDGE_PROJECT,
    ARDEN_EDGE_PROJECT_NAME,
    MSP_CUSTOMERS.arden,
    startedAt,
  );
}
