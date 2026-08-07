/**
 * Change control for the engineer's server work (E6, 0.18.0): the planned-risk
 * discipline that governs a change to a PRODUCTION service, and its emergency
 * counterpart.
 *
 * 0.10.0 built the change-request artifact - scope, risk, rollback, an approval
 * and a maintenance WINDOW - for a customer's out-of-scope server. 0.18.0 turns
 * the same machinery on the engineer's OWN infrastructure, where the wall is not
 * a contract but the ITIL/SRE discipline every admin lives by:
 *
 *  - A NORMAL change is risk-assessed and needs a change request + a window: a
 *    RISKY verb (restart/stop) on a LIVE, customer-facing PRODUCTION service, in
 *    business hours, with people on it. Doing it on your own say-so at 2pm is
 *    refused; the refusal NAMES the change path, and an approved request opens a
 *    window (an hour nobody wanted) to act in. This module CLASSIFIES the change
 *    and the shell's systemctl gate reuses `changeRequestAuthorises` (0.10.0) to
 *    let an approved-and-in-window action through.
 *  - A STANDARD change is pre-approved and boring by design: everything else -
 *    bringing a stopped unit UP (`start`), working a non-production unit, or the
 *    same risky verb OUT of hours (that IS the window). It proceeds, silent on
 *    success the way systemd is. Knowing which is which is the judgment the tier
 *    teaches, and it is a pure function here.
 *  - BREAK-GLASS is the emergency override (`day-driver.ts` / `cmd-unix.ts`): a
 *    service ACTIVELY DOWN in an incident is a fire, and the fix is outside the
 *    normal window, audited loudly. The one thing that makes break-glass
 *    legitimate is a REAL active incident - a failed unit on the box - and this
 *    module holds that predicate. Breaking the glass with nothing on fire is
 *    abuse, and it reads at the review the way suspicion already does.
 *
 * The line the tier turns on is kept sharp: a DOWN service is a fire you fix NOW
 * (0.17.0 on-call, never gated by change control); an UP service you CHANGE under
 * control. The gate keys on the unit being LIVE, which is exactly why the on-call
 * restart of a failed unit is never blocked - a failed unit is not live, so the
 * gate does not fire and the fix flows.
 *
 * Everything here is pure and deterministic - no `Math.random`, no DOM, no
 * dispatch. The numbers are one place on purpose: the balance table of the
 * mechanic, conservative, every one an OVERSEER TUNING KNOB.
 */

import type { ReadOnlyGraphNode, ReadOnlyGraphView } from '../engine-api';
import { SYSTEMD_ACTIONS } from './actions/ids';
import {
  FIELDS,
  isServerRole,
  machineOsOf,
  MACHINE_OS,
  machineRoleOf,
  SYSTEMD_STATES,
} from './fields';
import { minuteOfDay, SHIFT_END_MINUTE, SHIFT_START_MINUTE } from './hours';

/* -- the tunables --------------------------------------------------------- */

/**
 * What breaking the glass with nothing on fire costs, in whole suspicion points.
 *
 * THREE - the cheapest slack window you can be CAUGHT at, because this is that:
 * an emergency override pulled for routine work is exactly the thing a review
 * looks for, and it reads at the review the way being seen with a forum up does.
 * It is charged on the REFUSED attempt (the glass did not actually break - there
 * was no fire behind it), off the world's own abuse record, and it is felt as a
 * cost rather than a wall. OVERSEER TUNING KNOB, conservative.
 */
export const BREAK_GLASS_ABUSE_SUSPICION = 3;

/**
 * The systemd verbs that are RISKY on a live production service - the ones that
 * take a running service DOWN or BOUNCE it, dropping its open sessions.
 *
 * `restart` and `stop` are the changes; `start` is not here on purpose - bringing
 * a stopped or failed unit UP is remediation, the low-risk routine move, and a
 * standard change by definition. It is the same split systemd's own risk model
 * makes: you do not need a maintenance window to start a service that is down.
 */
const RISKY_VERBS: ReadonlySet<string> = new Set([
  SYSTEMD_ACTIONS.unitRestart,
  SYSTEMD_ACTIONS.unitStop,
]);

/** Whether a systemd verb is a risky change (restart/stop) rather than routine. */
export function isRiskyVerb(verb: string): boolean {
  return RISKY_VERBS.has(verb);
}

/* -- reading the box behind a unit ---------------------------------------- */

/**
 * The machine a unit runs on, by the same `runs_on` walk the rest of the estate
 * reads it - so a change is classified from the unit id alone. Null when the
 * unit is orphaned or the id is not a unit, which the caller treats as "not a
 * production change" rather than guessing.
 */
export function boxOfUnit(
  graph: ReadOnlyGraphView,
  unitId: string,
): Readonly<ReadOnlyGraphNode> | null {
  const node = graph.getNode(unitId);

  if (node === undefined || node.kind !== 'unit') {
    return null;
  }

  return graph
    .neighbors(node.id, { direction: 'out', edgeKind: 'runs_on' })
    .find((owner) => owner.kind === 'machine') ?? null;
}

/** The units a box runs, by the `runs_on` edges into it. */
function unitsOn(
  graph: ReadOnlyGraphView,
  boxId: string,
): readonly Readonly<ReadOnlyGraphNode>[] {
  return graph
    .neighbors(boxId, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'unit');
}

/** The base of a unit name: `nginx.service` -> `nginx`, kept whole otherwise. */
function unitBase(unit: Readonly<ReadOnlyGraphNode>): string {
  const name = typeof unit.fields[FIELDS.unitName] === 'string'
    ? (unit.fields[FIELDS.unitName] as string).toLowerCase()
    : unit.id.toLowerCase();

  return name.endsWith('.service') ? name.slice(0, -'.service'.length) : name;
}

/**
 * Whether a unit is a CUSTOMER-FACING production service - the "ten thousand
 * people depend on it" tier the promotion dramatised being able to break.
 *
 * The web/app/db tier that actually serves users: nginx (the front door), the
 * product app behind it (`*app`/`*portal`, named by suffix so a new employer's
 * `<name>portal` is critical without editing this file), and the database
 * (postgres). The plumbing - journald, cron, the ssh you came in on - is not on
 * this list: restarting those is routine, a standard change, not the thing a
 * maintenance window exists for. Named by what the unit IS, the same way
 * `cmd-unix.ts`'s `listenersOf` decides what a unit binds, and honest for the
 * same reason: it is a fact about the service, not a naming convention.
 */
function isCustomerFacingUnit(unit: Readonly<ReadOnlyGraphNode>): boolean {
  const base = unitBase(unit);

  return base === 'nginx'
    || base === 'postgresql'
    || base.startsWith('postgresql@')
    || base.endsWith('app')
    || base.endsWith('portal');
}

/**
 * Whether a box is IN-HOUSE production infrastructure the engineer manages: a
 * Linux server that belongs to NO customer.
 *
 * A customer's server is governed by its CONTRACT (the 0.8.0 scope engine
 * refuses it before change control is even reached), so change control is for
 * the MSP's OWN prod - FC-RMM-01 and its like. Absent `customer` is the in-house
 * case, exactly as it is everywhere the customer dimension is read.
 */
function isInHouseProdBox(box: Readonly<ReadOnlyGraphNode>): boolean {
  const customer = box.fields[FIELDS.machineCustomer];
  const os = machineOsOf(box.fields[FIELDS.machineOs]);
  const role = machineRoleOf(box.fields[FIELDS.machineRole]);

  return customer === undefined
    && os === MACHINE_OS.linux
    && isServerRole(role);
}

/* -- the classification: standard vs normal ------------------------------- */

export type ChangeClass = 'standard' | 'normal';

/**
 * Whether an action is a RISKY PRODUCTION change - a risky verb aimed at a
 * customer-facing unit on in-house prod. This is what makes a change a NORMAL
 * one (needs a change request + window) and what a change request can be filed
 * for, independent of when it is attempted or what state the unit is in. Off a
 * unit id and its verb, so the CR filing and the gate agree on the same answer.
 */
export function isRiskyProductionChange(
  graph: ReadOnlyGraphView,
  unitId: string,
  verb: string,
): boolean {
  if (!isRiskyVerb(verb)) {
    return false;
  }

  const unit = graph.getNode(unitId);

  if (unit === undefined || unit.kind !== 'unit' || !isCustomerFacingUnit(unit)) {
    return false;
  }

  const box = boxOfUnit(graph, unitId);

  return box !== null && isInHouseProdBox(box);
}

/**
 * The change CLASS of an action: `normal` for a risky production change,
 * `standard` for everything else. A pure function of the action, not of the
 * clock - the timing is what decides whether a normal change is GATED (below),
 * not what it IS.
 */
export function changeClass(
  graph: ReadOnlyGraphView,
  unitId: string,
  verb: string,
): ChangeClass {
  return isRiskyProductionChange(graph, unitId, verb) ? 'normal' : 'standard';
}

/* -- business hours ------------------------------------------------------- */

/**
 * Whether a tick falls in BUSINESS HOURS - the shift, when people are on the
 * service and a bounce is felt. The morning brief (08:00) and everything after
 * clock-off are OUT of hours: that is when a maintenance window is booked and
 * when the on-call fire is fought, so a change there is not gated. The window an
 * approved change opens is deliberately off in this stretch.
 */
export function isBusinessHours(now: number): boolean {
  const minute = minuteOfDay(now);

  return minute >= SHIFT_START_MINUTE && minute < SHIFT_END_MINUTE;
}

/* -- the active incident: what makes a fire a fire ------------------------ */

/**
 * Whether the box has a REAL ACTIVE INCIDENT: a unit on it in the `failed`
 * state - the honest node state an incident or an on-call page writes when a
 * service falls over (`day-driver.ts`, `week.ts`). This is the one thing that
 * makes break-glass legitimate, and reverting it is what the teeth test proves
 * would authorise anything: with no failed unit there is no fire, and breaking
 * the glass is abuse.
 *
 * It reads a real node state rather than an invented "incident" flag on purpose:
 * the fire the on-call page lit and the fire change control has to tell from
 * routine are the SAME fact, so they cannot drift.
 */
export function hasActiveIncident(
  graph: ReadOnlyGraphView,
  boxId: string,
): boolean {
  return unitsOn(graph, boxId).some(
    (unit) => unit.fields[FIELDS.unitState] === SYSTEMD_STATES.failed,
  );
}

/** Whether a unit is LIVE - active(running), the state a change is a change TO. */
export function isUnitLive(unit: Readonly<ReadOnlyGraphNode>): boolean {
  return unit.fields[FIELDS.unitState] === SYSTEMD_STATES.activeRunning;
}

/* -- the gate: does this risky action need a change? ---------------------- */

export interface ChangeGate {
  readonly graph: ReadOnlyGraphView;
  readonly now: number;
  readonly unitId: string;
  readonly verb: string;
  /** Whether an approved change request already authorises this exact action. */
  readonly authorised: boolean;
}

/**
 * The change-control gate the shell's systemctl verb runs on the engineer's own
 * prod, after the customer scope guards. It answers whether the action needs a
 * change it does not have.
 *
 *  - A STANDARD change proceeds (allowed).
 *  - A NORMAL change on a unit that is DOWN is the FIRE, not a change - allowed,
 *    which is exactly why the on-call restart of a failed unit is never gated.
 *  - A NORMAL change OUT of business hours is in the window's stretch - allowed.
 *  - A NORMAL change on a LIVE unit in business hours needs an approved,
 *    in-window change request. With one (`authorised`), it proceeds; without,
 *    it is REFUSED and the refusal names the change path.
 *
 * Fails CLOSED: without authorisation a live in-hours risky change always
 * refuses, so reverting the `authorised` branch wrongly lets it through - which
 * is what the teeth test proves goes red.
 */
export function changeControlGate(
  input: ChangeGate,
): { readonly allowed: true } | { readonly allowed: false; readonly lines: readonly string[] } {
  const { graph, now, unitId, verb, authorised } = input;

  if (changeClass(graph, unitId, verb) !== 'normal') {
    return { allowed: true };
  }

  const unit = graph.getNode(unitId);

  if (unit === undefined) {
    return { allowed: true };
  }

  // A DOWN service is the fire (0.17.0), fixed NOW and never gated; only a LIVE
  // one is a change under control.
  if (!isUnitLive(unit)) {
    return { allowed: true };
  }

  // Out of hours is the window's own stretch - a change there is not the
  // 2pm-on-a-live-service problem the gate exists for.
  if (!isBusinessHours(now)) {
    return { allowed: true };
  }

  if (authorised) {
    return { allowed: true };
  }

  return { allowed: false, lines: normalChangeRefusalLines(graph, unitId, verb) };
}

/** How the terminal spells the verb in the change-path it names. */
function verbWord(verb: string): string {
  return verb === SYSTEMD_ACTIONS.unitStop ? 'stop' : 'restart';
}

/**
 * The refusal a NORMAL change gets in business hours with no approval: the true
 * reason, and the path named - file a change, it opens a window - plus the sharp
 * line that this is NOT a fire, so break-glass is not the tool for it.
 */
export function normalChangeRefusalLines(
  graph: ReadOnlyGraphView,
  unitId: string,
  verb: string,
): readonly string[] {
  const unit = graph.getNode(unitId);
  const name = unit !== undefined && typeof unit.fields[FIELDS.unitName] === 'string'
    ? (unit.fields[FIELDS.unitName] as string)
    : unitId;
  const base = name.endsWith('.service') ? name.slice(0, -'.service'.length) : name;
  const word = verbWord(verb);

  return [
    `${name} is a live production service, and it is business hours - people`,
    `are on it right now. A ${word} bounces it, and doing that on your own`,
    'say-so at 2pm is a NORMAL change, not something you just do.',
    '',
    'Raise a change and do it in the window:',
    `  changereq file ${base} ${word}`,
    'files it, it goes for review, and an approval opens a maintenance window',
    '(an hour nobody wanted) that clears you to act. Until then this refuses.',
    '("changereq list" shows where a filed one has got to.)',
    '',
    'This is not a fire. Break-glass is for a service that is actually DOWN in',
    'an incident; a healthy one in business hours is a change, and it waits for',
    'the window.',
  ];
}

/* -- break-glass: the lines the emergency prints -------------------------- */

/**
 * What breaking the glass on a real fire says: an emergency change, outside the
 * window, done NOW and logged loudly for the review after. The unit is being
 * brought back up as part of it.
 */
export function breakGlassLegitLines(
  unitName: string,
  auditLine: string,
): readonly string[] {
  return [
    `BREAK-GLASS: emergency change on ${unitName}, outside the normal window.`,
    `${unitName} is down in an active incident - this is a real fire, so the`,
    'glass breaks and you act now. It is brought back up, and the override is',
    'logged loudly for the review after:',
    `  ${auditLine}`,
    'Write the postmortem tomorrow; break-glass is never quiet.',
  ];
}

/**
 * What breaking the glass on a healthy service says: refused, because there is
 * no fire behind it, and logged as exactly the abuse a review looks for.
 */
export function breakGlassAbuseLines(
  unitName: string,
  boxName: string,
): readonly string[] {
  return [
    `BREAK-GLASS REFUSED: there is no active incident on ${boxName}.`,
    `Nothing here is on fire - ${unitName} is up and serving. Break-glass is the`,
    'emergency override for a real incident, not a way to skip the change window',
    'for routine work. Raise a change and use the window.',
    '',
    'This attempt is logged, and breaking the glass with no fire behind it is',
    'exactly what a review looks for - it reads the way a morning on Do Not',
    'Disturb does.',
  ];
}
