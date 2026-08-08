/**
 * The change-request authorisation moment (0.10.0), as the pure functions that
 * file one, decide it, and read where its review has got to.
 *
 * 0.8.0 made an out-of-scope action a flat REFUSAL. In reality risky work is not
 * forbidden, it is GATED: you file a change request that states the scope, the
 * risk and the rollback, it goes for approval, and only then may you act - inside
 * a window. This module is that turned into world data. A change request is a
 * first-class node (kind `change_request`, `schema.rs`); a verb files one for a
 * specific (target, verb) pair; and the scope pre-flight consults it before it
 * refuses.
 *
 * Everything here is pure and deterministic. The APPROVAL is not a fake instant
 * yes and not a Math.random coin toss: the decision is baked at file time from
 * what the contract actually allows (a server touch a helpdesk contract does not
 * cover is approvable; a monitoring-only remediation is not - that is a contract
 * change, not a change request), and the review delay and the window are seeded
 * off the request id, so a save mid-review reloads to the same minute the
 * paperwork was always going to clear on. The LIVE lifecycle - under review,
 * approved-but-not-in-window, open, closed, rejected - is derived from those
 * baked ticks against the clock, the read-never-copy discipline the monitoring
 * board keeps, so the status a surface shows cannot drift from the review it is
 * in.
 *
 * The line the arc turns on is kept sharp here: a change request unlocks the
 * risky/out-of-scope work a contract has a change path for (helpdesk reaching
 * for a server; co-managed work their IT signs off). It does NOT unlock a
 * monitoring-only account - a watch-only contract stays notify-and-escalate, and
 * a request filed against it is REJECTED with that reason, never approved.
 */

import type {
  ReadOnlyGraphNode,
  ReadOnlyGraphView,
  SetupOp,
} from '../engine-api';
import { HELPDESK_ACTIONS, SYSTEMD_ACTIONS } from './actions';
import { isRiskyProductionChange } from './change-control';
import {
  CHANGE_REQUEST_DECISIONS,
  CHANGE_REQUEST_KINDS,
  CHANGE_REQUEST_STATUSES,
  type ChangeRequestDecision,
  changeRequestDecisionOf,
  FIELDS,
  type MachineRole,
  machineRoleOf,
} from './fields';
import {
  customerIdOfAccount,
  customerIdOfMachine,
  customerName,
  scopeOfCustomer,
  type ScopeVerdict,
  scopeRefusalLines,
  scopeVerdict,
} from './customers';
import { dayForTick, minuteOfDay } from './hours';

/* -- the timing, deterministic and seeded off the request id -------------- */

/**
 * How long a change request sits under review, in sim-minutes: a floor plus a
 * span scattered by the request id. Not instant (there is no fake yes) and not
 * random (the id seeds it), so two requests filed the same minute can clear at
 * different times and the same request always clears at the same one.
 */
const CR_REVIEW_MIN_MINUTES = 30;
const CR_REVIEW_SPAN_MINUTES = 30;

/**
 * The lead before an approved change's window opens, and how long the window
 * lasts. The lead is the maintenance slot at an hour nobody wanted; the window
 * is the few minutes you actually have. Both bounded so the worst case still
 * lands inside a shift a test - or a player - can reach.
 */
const CR_WINDOW_LEAD_MIN_MINUTES = 15;
const CR_WINDOW_LEAD_SPAN_MINUTES = 30;
const CR_WINDOW_MINUTES = 30;

/**
 * FNV-1a to a 32-bit number - the same construction `monitoring.ts` and
 * `cmd-net.ts` use to make a deterministic value out of an id. Kept local so the
 * world layer does not reach up into the shell for it; it is six lines and it is
 * the standard one.
 */
function crHash(value: string): number {
  let hash = 0x811c_9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }

  return hash;
}

/** A tick as a face a refusal can name: `Day 2 14:05`. */
function clockLabel(tick: number): string {
  const minute = minuteOfDay(tick);
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `Day ${String(dayForTick(tick))} ${
    String(hours).padStart(2, '0')
  }:${String(minutes).padStart(2, '0')}`;
}

/* -- resolving what a target IS, for scope + decision --------------------- */

/**
 * The machine behind a target, for reading its customer and role - the box
 * itself, or the box a service or unit runs on, or the box a device is plugged
 * into. The same walk `cmd-run.ts`'s pre-flight does, kept here so a request can
 * be decided from the target id alone.
 */
function machineBehind(
  graph: ReadOnlyGraphView,
  targetId: string,
): Readonly<ReadOnlyGraphNode> | null {
  const node = graph.getNode(targetId);

  if (node === undefined) {
    return null;
  }

  if (node.kind === 'machine') {
    return node;
  }

  if (node.kind === 'service' || node.kind === 'unit') {
    return graph
      .neighbors(node.id, { direction: 'out', edgeKind: 'runs_on' })
      .find((owner) => owner.kind === 'machine') ?? null;
  }

  if (node.kind === 'device') {
    return graph
      .neighbors(node.id, { direction: 'out', edgeKind: 'connected_to' })
      .find((owner) => owner.kind === 'machine') ?? null;
  }

  return null;
}

interface TargetContext {
  readonly customerId: string | null;
  readonly role: MachineRole | null;
  readonly verdict: ScopeVerdict;
}

/**
 * The customer, role and scope verdict a target resolves to - the exact triple
 * the scope engine decides on, computed from the target id. An account is
 * user-and-identity work (a null role, never a server); a machine-backed target
 * carries the box's role; anything with no customer behind it verdicts
 * `allowed`, which is the in-house case a change request is never needed for.
 */
function targetContext(
  graph: ReadOnlyGraphView,
  targetId: string,
): TargetContext {
  const node = graph.getNode(targetId);

  if (node?.kind === 'account') {
    const customerId = customerIdOfAccount(node);
    return {
      customerId,
      role: null,
      verdict: scopeVerdict(scopeOfCustomer(graph, customerId ?? ''), null),
    };
  }

  const machine = machineBehind(graph, targetId);
  const customerId = machine === null ? null : customerIdOfMachine(machine);
  const role = machine === null
    ? null
    : machineRoleOf(machine.fields[FIELDS.machineRole]);

  return {
    customerId,
    role,
    verdict: scopeVerdict(
      customerId === null ? null : scopeOfCustomer(graph, customerId),
      role,
    ),
  };
}

/* -- the decision: what the authority the real one needs would say -------- */

/**
 * The decision a change request for this verdict is filed at, and the reason
 * that goes with it. Baked at file time and deterministic - it is a function of
 * what the contract allows, not of chance:
 *
 *  - a helpdesk contract reaching for a SERVER, or co-managed work: APPROVE - the
 *    risky/out-of-scope work a change process exists to authorise. Approved by
 *    the customer (their own IT, for co-managed).
 *  - monitoring-only remediation: REJECT - a watch-only contract cannot be turned
 *    into a remediation one by a change request; that is a contract change. The
 *    move stays notify-and-escalate.
 *  - `allowed`: no request is needed, so there is no decision to make (the caller
 *    never files one).
 */
function decisionForVerdict(
  verdict: ScopeVerdict,
  customerLabel: string,
): { readonly decision: ChangeRequestDecision; readonly reason: string } | null {
  switch (verdict) {
    case 'allowed':
      return null;
    case 'helpdesk_server':
      return {
        decision: CHANGE_REQUEST_DECISIONS.approve,
        reason: `Approved by ${customerLabel}: server work, out of the helpdesk `
          + 'contract as day-to-day but authorised as a change - to be done '
          + 'inside the window, with the rollback ready.',
      };
    case 'co_managed':
      return {
        decision: CHANGE_REQUEST_DECISIONS.approve,
        reason: `Approved by ${customerLabel}'s own IT: co-managed work signed `
          + 'off through the change process, which is the coordination the '
          + 'contract asks for.',
      };
    case 'monitoring_only':
      return {
        decision: CHANGE_REQUEST_DECISIONS.reject,
        reason: 'Monitoring-only is notify-and-escalate. A change request cannot '
          + 'turn a watch-only contract into a remediation one - that is a '
          + 'contract change, not a change request. Escalate the alert instead.',
      };
  }
}

/* -- the risk and rollback, authored per verb ----------------------------- */

/**
 * The paperwork a change request carries for its verb: the honest risk of the
 * action and the honest way back. Authored per verb rather than free-typed at a
 * terminal - the world knows what bouncing a production service costs and how it
 * is undone, and a change form that made the junior invent the risk would be a
 * change form nobody could trust.
 */
function paperworkFor(
  verb: string,
): { readonly risk: string; readonly rollback: string } {
  if (verb === HELPDESK_ACTIONS.serviceRestart) {
    return {
      risk: 'Bouncing this service drops its open sessions and anything unsaved '
        + 'on it. On a server that is customer-visible: the box stays up, the '
        + 'service does not, for as long as the restart takes.',
      rollback: 'Start the service again; it comes back in its last-tested '
        + 'configuration. If it does not come back clean, escalate to the '
        + 'customer\'s infrastructure team with the service name and the minute.',
    };
  }

  if (verb === SYSTEMD_ACTIONS.unitRestart || verb === SYSTEMD_ACTIONS.unitStop) {
    const bounces = verb === SYSTEMD_ACTIONS.unitStop;
    return {
      risk: bounces
        ? 'Stopping this unit takes a live production service down and holds it '
          + 'down: everyone on it drops, and it stays gone until it is started '
          + 'again. Ten thousand people can be depending on it.'
        : 'Restarting this unit bounces a live production service: its open '
          + 'connections drop and it is unavailable for as long as the restart '
          + 'takes. On prod, in hours, that is felt by everyone on it.',
      rollback: 'systemctl start the unit; it comes back on its last-good '
        + 'config. If it does not come back active(running), read journalctl for '
        + 'the why and escalate before the window closes.',
    };
  }

  return {
    risk: 'This action changes a system the contract does not cover day-to-day; '
      + 'the impact is whatever the change touches.',
    rollback: 'Undo the change if it does not land clean, and escalate with what '
      + 'was done and when.',
  };
}

/* -- the request node's lifecycle, derived against the clock -------------- */

export type ChangeRequestState =
  | 'under_review'
  | 'rejected'
  | 'approved_pending'
  | 'approved_open'
  | 'approved_closed';

function numberField(
  node: Readonly<ReadOnlyGraphNode>,
  field: string,
): number | null {
  const value = node.fields[field];
  return typeof value === 'number' ? value : null;
}

/**
 * Where a change request's review has got to, this minute. Pure: read off the
 * baked ticks and the decision, never a stored "approved" flag that could drift
 * from the clock. Under review until the decision lands; then rejected, or
 * approved and either waiting for its window, inside it, or past it.
 */
export function changeRequestState(
  node: Readonly<ReadOnlyGraphNode>,
  now: number,
): ChangeRequestState {
  const reviewUntil = numberField(node, FIELDS.crReviewUntil) ?? 0;

  if (now < reviewUntil) {
    return 'under_review';
  }

  if (changeRequestDecisionOf(node.fields[FIELDS.crDecision])
    === CHANGE_REQUEST_DECISIONS.reject) {
    return 'rejected';
  }

  const open = numberField(node, FIELDS.crWindowOpen);
  const close = numberField(node, FIELDS.crWindowClose);

  if (open === null || close === null) {
    // An approved request with no window is a request nobody wrote a slot for;
    // treat it as still pending rather than silently letting the action through.
    return 'approved_pending';
  }

  if (now < open) {
    return 'approved_pending';
  }

  return now < close ? 'approved_open' : 'approved_closed';
}

/** A change request node, by whether it is one. */
export function isChangeRequest(
  node: Readonly<ReadOnlyGraphNode>,
): boolean {
  return node.kind === 'change_request';
}

/**
 * Whether this node is the CYA / manager-override RISK ACCEPTANCE variant (E8,
 * 0.24.0) rather than the 0.10.0 SCOPE change request. Both are `change_request`
 * nodes - that is the reuse - so the scope machinery below (the pre-flight, the
 * window lifecycle, the listing) tells them apart by `cr_kind` and skips the
 * risk-acceptance kind: it is not the maintenance-window mechanic, it authorises
 * no terminal verb, and it is signed rather than reviewed.
 */
export function isRiskAcceptance(
  node: Readonly<ReadOnlyGraphNode>,
): boolean {
  return node.fields[FIELDS.crKind] === CHANGE_REQUEST_KINDS.riskAcceptance;
}

/**
 * Whether this node is the ROLLBACK RECORD variant (E8, 0.25.0) rather than the
 * 0.10.0 SCOPE change request. Same reuse as `isRiskAcceptance`, same reason: the
 * rollback record is a `change_request` node so it shares the append-only storage
 * and the node kind, but it is not the maintenance-window mechanic - it
 * authorises no terminal verb and books no window - so the scope pre-flight and
 * the change-request listing skip it by this marker, exactly as they skip the
 * sign-off.
 */
export function isRollbackRecord(
  node: Readonly<ReadOnlyGraphNode>,
): boolean {
  return node.fields[FIELDS.crKind] === CHANGE_REQUEST_KINDS.rollbackRecord;
}

/**
 * Whether a risk acceptance is SIGNED for the given target (E8, 0.24.0): a
 * risk-acceptance change_request aimed at exactly this account whose approval
 * decision - the ordering manager's signature - is on it. Composes the 0.10.0
 * `changeRequestDecisionOf` (the approval is the SAME decision) rather than
 * re-deciding what "approved" means; the CYA test reads it to assert the artifact
 * is a genuinely-signed change request and not a bespoke flag.
 */
export function riskAcceptanceSignedFor(
  node: Readonly<ReadOnlyGraphNode>,
  targetId: string,
): boolean {
  return isChangeRequest(node)
    && isRiskAcceptance(node)
    && node.fields[FIELDS.crTarget] === targetId
    && changeRequestDecisionOf(node.fields[FIELDS.crDecision])
      === CHANGE_REQUEST_DECISIONS.approve;
}

/**
 * Whether this request AUTHORISES the given action right now: it is for exactly
 * this (target, verb) and it is approved and inside its window. The single
 * question the scope pre-flight asks before it lets an out-of-scope action
 * through - and the one a revert would have to break to wrongly allow one.
 */
export function changeRequestAuthorises(
  node: Readonly<ReadOnlyGraphNode>,
  targetId: string,
  verb: string,
  now: number,
): boolean {
  return isChangeRequest(node)
    && node.fields[FIELDS.crTarget] === targetId
    && node.fields[FIELDS.crVerb] === verb
    && changeRequestState(node, now) === 'approved_open';
}

/** Every request filed for exactly this (target, verb), newest first. */
function requestsFor(
  graph: ReadOnlyGraphView,
  targetId: string,
  verb: string,
): readonly Readonly<ReadOnlyGraphNode>[] {
  return graph
    .nodesOfKind('change_request')
    .filter((node) => !isRiskAcceptance(node)
      && !isRollbackRecord(node)
      && node.fields[FIELDS.crTarget] === targetId
      && node.fields[FIELDS.crVerb] === verb)
    .sort((left, right) =>
      (numberField(right, FIELDS.crSubmittedAt) ?? 0)
      - (numberField(left, FIELDS.crSubmittedAt) ?? 0));
}

/* -- the consult: what the scope pre-flight asks before refusing ---------- */

export interface ChangeRequestConsult {
  readonly graph: ReadOnlyGraphView;
  readonly now: number;
  readonly targetId: string;
  readonly verb: string;
  readonly verdict: ScopeVerdict;
}

/**
 * The branch the 0.8.0 scope pre-flight gains (slice 2, the heart): before it
 * refuses an out-of-scope action, it consults approvals.
 *
 *  - If an APPROVED change request covers this exact (target, verb) and is inside
 *    its window -> ALLOWED. The action proceeds.
 *  - Monitoring-only stays notify-and-escalate: a change request never unlocks it
 *    (its decision is always reject), so the refusal is the plain escalate one -
 *    the CR path is deliberately NOT named, because it is not the path.
 *  - Otherwise the refusal now NAMES THE PATH rather than dead-ending: file a
 *    change request; or, if one is already filed, where its review has got to
 *    (under review, approved-but-not-yet, the window closed, rejected).
 *
 * Returns `{ allowed: true }` to let the action through, or the refusal lines.
 * Fails CLOSED: without an approved-and-in-window request it always refuses, so
 * reverting the authorises check wrongly lets an unapproved action dispatch -
 * which is exactly what the teeth test proves goes red.
 */
export function changeRequestConsult(
  input: ChangeRequestConsult,
): { readonly allowed: true } | { readonly allowed: false; readonly lines: readonly string[] } {
  const { graph, now, targetId, verb, verdict } = input;
  const base = scopeRefusalLines(verdict) ?? [];

  // Monitoring-only is the sharp line: watch-only is not made into remediation
  // by paperwork. The escalate refusal stands, and it does not offer a CR.
  if (verdict === 'monitoring_only') {
    return { allowed: false, lines: base };
  }

  const requests = requestsFor(graph, targetId, verb);

  if (requests.some((node) => changeRequestAuthorises(node, targetId, verb, now))) {
    return { allowed: true };
  }

  const latest = requests[0];

  if (latest === undefined) {
    return {
      allowed: false,
      lines: [
        ...base,
        '',
        'This is not a dead end. Work like this is GATED, not forbidden:',
        'file a change request - "changereq file <service>" - and it records the',
        'scope, the risk and the rollback, goes for review, and clears you to act',
        'inside a window once it is approved.',
      ],
    };
  }

  const state = changeRequestState(latest, now);
  const reason = typeof latest.fields[FIELDS.crReason] === 'string'
    ? latest.fields[FIELDS.crReason] as string
    : '';
  const reviewUntil = numberField(latest, FIELDS.crReviewUntil) ?? now;
  const open = numberField(latest, FIELDS.crWindowOpen);
  const close = numberField(latest, FIELDS.crWindowClose);

  switch (state) {
    case 'under_review':
      return {
        allowed: false,
        lines: [
          'A change request for this is filed and under review - the decision',
          `is due about ${clockLabel(reviewUntil)}. You are not authorised yet;`,
          'the emergency waits on the paperwork, which is the whole of the point.',
        ],
      };
    case 'approved_pending':
      return {
        allowed: false,
        lines: open === null
          ? ['A change request is approved but has no window; escalate it.']
          : [
            'Authorised - but not now. The change window is',
            `${clockLabel(open)} to ${
              close === null ? 'later' : clockLabel(close)
            }. Come back then; that is the hour the change was booked for,`,
            'whether or not it is the hour anyone wanted.',
          ],
      };
    case 'approved_closed':
      return {
        allowed: false,
        lines: [
          `That change window has closed${
            close === null ? '' : ` (it ended ${clockLabel(close)})`
          }.`,
          'An approval is for its window and no later. File a fresh request.',
        ],
      };
    case 'rejected':
      return {
        allowed: false,
        lines: [
          'A change request for this was filed and REJECTED:',
          ...(reason.length > 0 ? [reason] : []),
        ],
      };
    case 'approved_open':
      // Handled by the authorises check above; if we reach here the window is
      // open and the action is allowed.
      return { allowed: true };
  }
}

/* -- filing: the verb that puts a change request into the world ----------- */

export type ChangeRequestFiling =
  | { readonly kind: 'not_needed'; readonly lines: readonly string[] }
  | {
    readonly kind: 'filed';
    readonly ops: readonly SetupOp[];
    readonly lines: readonly string[];
  };

/**
 * Plans the filing of a change request for a (target, verb): the setup ops that
 * add the node, and the lines the terminal prints. It decides the outcome
 * deterministically - an in-scope or in-house target needs no request; an
 * out-of-scope one is filed with the decision the authority the real one needs
 * would reach (approve for server/co-managed work, reject for a monitoring-only
 * remediation) baked in, along with the review delay and, when approved, the
 * window. The DRIVER applies the ops; nothing here mutates.
 */
export function planChangeRequestFiling(
  graph: ReadOnlyGraphView,
  targetId: string,
  verb: string,
  now: number,
): ChangeRequestFiling {
  // The in-house PRODUCTION change first (E6, 0.18.0): a risky verb on the
  // engineer's own live customer-facing prod is a NORMAL change - approvable
  // with a window, signed off for internal risk by the infrastructure lead, not
  // by a customer. It carries no customer, so it is caught here BEFORE the 0.8.0
  // customer branch treats an in-house target as needing nothing. Everything
  // else - the timing, the deterministic review and window - is the shared body
  // below, so the window a systemctl gate consults is the exact 0.10.0 one.
  const prodChange = isRiskyProductionChange(graph, targetId, verb)
    ? {
      customerId: null as string | null,
      label: 'the infrastructure lead',
      outcome: {
        decision: CHANGE_REQUEST_DECISIONS.approve,
        reason: 'Approved by the infrastructure lead: risky work on our own '
          + 'production, signed off as a change - to be done inside the window, '
          + 'with the rollback ready.',
      },
    }
    : null;

  let customerId: string | null;
  let label: string;
  let outcome: { readonly decision: ChangeRequestDecision; readonly reason: string } | null;

  if (prodChange !== null) {
    ({ customerId, label, outcome } = prodChange);
  } else {
    const context = targetContext(graph, targetId);

    if (context.customerId === null || context.verdict === 'allowed') {
      return {
        kind: 'not_needed',
        lines: [
          'No change request needed - this is in scope from this desk.',
          'A change request is for the work the contract does not cover. This is',
          'work it does; just do it.',
        ],
      };
    }

    customerId = context.customerId;
    label = customerName(graph, context.customerId);
    outcome = decisionForVerdict(context.verdict, label);
  }

  if (outcome === null) {
    // Unreachable for the refusing verdicts above, but a null decision is not a
    // licence to silently do nothing.
    return {
      kind: 'not_needed',
      lines: ['No change request needed - this is in scope from this desk.'],
    };
  }

  const { risk, rollback } = paperworkFor(verb);
  const crId = `changereq:${targetId}@${String(now)}`;
  const reviewUntil = now
    + CR_REVIEW_MIN_MINUTES
    + (crHash(crId) % CR_REVIEW_SPAN_MINUTES);
  const approved = outcome.decision === CHANGE_REQUEST_DECISIONS.approve;
  const windowOpen = reviewUntil
    + CR_WINDOW_LEAD_MIN_MINUTES
    + (crHash(`${crId}:window`) % CR_WINDOW_LEAD_SPAN_MINUTES);
  const windowClose = windowOpen + CR_WINDOW_MINUTES;

  const fields: Record<string, string | number> = {
    [FIELDS.name]: `Change request: ${targetId}`,
    [FIELDS.crTarget]: targetId,
    [FIELDS.crVerb]: verb,
    [FIELDS.crStatus]: CHANGE_REQUEST_STATUSES.submitted,
    [FIELDS.crDecision]: outcome.decision,
    [FIELDS.crReason]: outcome.reason,
    [FIELDS.crRisk]: risk,
    [FIELDS.crRollback]: rollback,
    [FIELDS.crSubmittedAt]: now,
    [FIELDS.crReviewUntil]: reviewUntil,
    // A customer id only when there is one: an in-house production change is
    // filed against no customer, so the field is genuinely absent rather than a
    // null the queue would have to special-case.
    ...(customerId === null ? {} : { [FIELDS.crCustomer]: customerId }),
    // The window is written ONLY when approved, so it is genuinely empty until
    // then - a rejected request never carries a slot to act in.
    ...(approved
      ? { [FIELDS.crWindowOpen]: windowOpen, [FIELDS.crWindowClose]: windowClose }
      : {}),
  };

  const lines = [
    `Change request filed with ${label}.`,
    `  Action:   ${verb} on ${targetId}`,
    `  Risk:     ${risk}`,
    `  Rollback: ${rollback}`,
    '',
    ...(approved
      ? [
        `Under review; the decision is due about ${clockLabel(reviewUntil)}.`,
        'If approved, a change window opens - you will be told the hour, and it',
        'will not be the one you wanted. Until then the action is still refused.',
      ]
      : [
        'This one is headed for rejection, and it should be:',
        outcome.reason,
        'Filed for the record; escalate the alert - that is the contracted move.',
      ]),
  ];

  return {
    kind: 'filed',
    ops: [{ op: 'addNode', node: { id: crId, kind: 'change_request', fields } }],
    lines,
  };
}

/**
 * One line per change request for a listing, newest first: what it authorises,
 * where its review has got to, and the window when there is one. The terminal's
 * `changereq list` reads it; a pure function of the graph and the clock, so a
 * test and the screen agree.
 */
export function changeRequestListing(
  graph: ReadOnlyGraphView,
  now: number,
): readonly string[] {
  const requests = [...graph.nodesOfKind('change_request')]
    .filter((node) => !isRiskAcceptance(node) && !isRollbackRecord(node))
    .sort(
      (left, right) => (numberField(right, FIELDS.crSubmittedAt) ?? 0)
        - (numberField(left, FIELDS.crSubmittedAt) ?? 0),
    );

  if (requests.length === 0) {
    return [
      'No change requests filed.',
      'File one for work the contract does not cover: "changereq file <service>".',
    ];
  }

  return requests.flatMap((node) => {
    const state = changeRequestState(node, now);
    const target = typeof node.fields[FIELDS.crTarget] === 'string'
      ? node.fields[FIELDS.crTarget] as string
      : '(unknown)';
    const verb = typeof node.fields[FIELDS.crVerb] === 'string'
      ? node.fields[FIELDS.crVerb] as string
      : '(unknown)';
    const open = numberField(node, FIELDS.crWindowOpen);
    const close = numberField(node, FIELDS.crWindowClose);
    const window = open !== null && close !== null
      ? ` (window ${clockLabel(open)}-${clockLabel(close)})`
      : '';

    return [`${STATE_LABELS[state]}  ${verb} on ${target}${window}`];
  });
}

const STATE_LABELS: Readonly<Record<ChangeRequestState, string>> = {
  under_review: '[under review]  ',
  approved_pending: '[approved]      ',
  approved_open: '[window open]   ',
  approved_closed: '[window closed] ',
  rejected: '[rejected]      ',
};
