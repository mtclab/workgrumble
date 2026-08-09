import type { ActionData, GuardData, PredData } from '../../engine-api';
import { AUDIT_SOURCES, FIELDS } from '../fields';
import {
  fieldIs,
  HELPDESK_TIER,
  not,
  param,
  paramNodeGuards,
  TARGET,
} from './helpers';
import { PROJECT_ACTIONS } from './ids';

/**
 * The edge-replacement verbs (E10, 0.29.0): what a firewall migration actually
 * comes down to, as five acts on the graph.
 *
 * Every one of them writes a FACT about the estate rather than a stage of a
 * plan. There is no "advance the project" verb here and there is not going to
 * be one: the phase is derived from what these leave behind (`world/project.ts`),
 * so nothing can be marked done that has not been done, and the rollback needs
 * no bookkeeping of its own - it moves a cable back and the derivation follows.
 *
 * The guards are the milestone lock's second half. The FIRST half is arrival:
 * a phase's tickets are raised by the close of the phase before it, so
 * downstream work is not in the queue with a clock on it while it is unworkable.
 * But a verb at a terminal exists whether or not a ticket does, so each of these
 * refuses out of order in its own sentence - configuring off an unconfirmed rule
 * list, and cutting over to a box that does not carry everything anybody knows
 * about. Both are read off the graph, which is the same place the phase read
 * looks, so the refusal and the board cannot drift.
 *
 * The one thing NOT guarded here is the change window. That is deliberate and it
 * is the shipped shape: the window lives on a `change_request` node whose
 * lifecycle is derived from baked ticks against the clock, and the consult that
 * reads it is `changeRequestAuthorises` - the same one the systemctl gate has
 * used since 0.18.0, run by the terminal before it ever reaches this verb. A
 * second, weaker copy of that rule inside a guard would be two answers to one
 * question.
 */

/** The circuit whose cable is moving, and the box it is moving off. */
export const PROJECT_CIRCUIT_PARAM = 'circuit';
export const PROJECT_FROM_PARAM = 'from';
/** The project node the one-off minutes are stamped on. */
export const PROJECT_PARAM = 'project';

export const AUDIT_TWICE_REASON = 'The rule set on "{target.label}" has already '
  + 'been established. Auditing it again would not find anything new - what '
  + 'would change the answer is migrating what it found.';

export const RULE_ALREADY_MIGRATED_REASON = '"{target.label}" is already on the '
  + 'new box. Carrying a rule twice writes the same rule twice, which is how a '
  + 'rule set ends up with two of everything and a policy nobody can read.';

export const RULE_BEFORE_AUDIT_REASON = 'Nothing has established what the box '
  + 'this rule is on is actually running yet. Configuring the new edge off a '
  + 'rule list nobody has confirmed is how the wrong box goes live: audit first, '
  + 'then carry what the audit found.';

export const CUTOVER_CIRCUIT_ELSEWHERE_REASON = 'The circuit is not plugged '
  + 'into "{p:from.label}". Whatever this cutover was going to move, it is not '
  + 'where the plan says it is - go and look before you pull anything.';

export const CUTOVER_INCOMPLETE_REASON = '"{target.label}" does not carry '
  + 'everything the box it is replacing does. There is at least one rule on the '
  + 'old edge that is in the pack, or that the audit found, and that has not '
  + 'been migrated - move the cable now and that is a phone call. Finish the '
  + 'staging config first.';

/**
 * Whether the box named by `from` still has a KNOWN rule nobody has carried.
 *
 * "Known" is the same two-branch question the staging gate asks, said in the
 * guard language instead of the assertion one: a rule the pack lists is known
 * to anybody who read the pack, and every rule at all is known once somebody
 * has read the live configuration. The traversal is `runs_on` INTO the old box,
 * which is where the rule set hangs.
 */
const CUTOVER_LEAVES_SOMETHING_BEHIND: PredData = {
  pred: 'neighbor_where',
  node: param(PROJECT_FROM_PARAM),
  direction: 'in',
  edge_kind: 'runs_on',
  bind: 'rule',
  matching: {
    pred: 'all',
    of: [
      { pred: 'kind_is', node: { bind: 'rule' }, kind: 'service' },
      fieldIs({ bind: 'rule' }, FIELDS.fwRuleMigrated, false),
      {
        pred: 'any',
        of: [
          fieldIs({ bind: 'rule' }, FIELDS.fwRuleDocumented, true),
          fieldIs(
            param(PROJECT_FROM_PARAM),
            FIELDS.fwAuditSource,
            AUDIT_SOURCES.config,
          ),
        ],
      },
    ],
  },
};

/** The box a rule is on has had its rule set established, one way or the other. */
const RULE_BOX_AUDITED: PredData = {
  pred: 'neighbor_where',
  node: TARGET,
  direction: 'out',
  edge_kind: 'runs_on',
  bind: 'edge_box',
  matching: fieldIs({ bind: 'edge_box' }, FIELDS.fwAudited, true),
};

/** The three guards both audits share: it is a box, and it is not done twice. */
function auditGuards(): GuardData[] {
  return [
    {
      when: { pred: 'target_missing' },
      reason: 'Pick the box being replaced first. An audit is of something.',
    },
    {
      when: { pred: 'node_missing', node: TARGET },
      reason: 'Nothing in the estate is called "{target.id}".',
    },
    {
      when: not({ pred: 'kind_is', node: TARGET, kind: 'machine' }),
      reason: '"{target.label}" is {target.kind_label}. An edge audit reads a '
        + 'box.',
    },
    {
      when: not(fieldIs(TARGET, FIELDS.machineRole, 'firewall')),
      reason: '"{target.label}" is not an edge box. There is no rule set on it '
        + 'to establish.',
    },
    { when: fieldIs(TARGET, FIELDS.fwAudited, true), reason: AUDIT_TWICE_REASON },
  ];
}

export const PROJECT_ACTION_DATA: readonly ActionData[] = [
  {
    // Reading the live configuration: the job done properly. It writes the same
    // two fields the shortcut does and one different word, and that word is the
    // whole difference between a quiet Friday and a phone call from a factory.
    id: PROJECT_ACTIONS.auditConfig,
    tier: HELPDESK_TIER,
    validate: auditGuards(),
    apply: [
      { op: 'set_field', node: TARGET, field: FIELDS.fwAudited, value: { const: true } },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.fwAuditSource,
        value: { const: AUDIT_SOURCES.config },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.fwAuditedAt,
        value: { now: true },
      },
    ],
  },
  {
    // Taking the handover pack as read. It is not refused, it is not punished
    // at the time, and it passes the gate - because in the trade it does.
    id: PROJECT_ACTIONS.auditPack,
    tier: HELPDESK_TIER,
    validate: auditGuards(),
    apply: [
      { op: 'set_field', node: TARGET, field: FIELDS.fwAudited, value: { const: true } },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.fwAuditSource,
        value: { const: AUDIT_SOURCES.pack },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.fwAuditedAt,
        value: { now: true },
      },
    ],
  },
  {
    // One rule, carried. The whole of the staging phase is this verb, six times
    // or four, and which of those it is was decided by the audit.
    id: PROJECT_ACTIONS.migrateRule,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: { pred: 'target_missing' },
        reason: 'Name the rule to carry over. They go in order: routing, then '
          + 'NAT, then policies, then the tunnels.',
      },
      {
        when: { pred: 'node_missing', node: TARGET },
        reason: 'There is no rule called "{target.id}" on this edge.',
      },
      {
        when: { pred: 'field_missing', node: TARGET, field: FIELDS.fwRuleProject },
        reason: '"{target.label}" is not part of an edge replacement. There is '
          + 'nowhere to carry it TO.',
      },
      {
        when: fieldIs(TARGET, FIELDS.fwRuleMigrated, true),
        reason: RULE_ALREADY_MIGRATED_REASON,
      },
      { when: not(RULE_BOX_AUDITED), reason: RULE_BEFORE_AUDIT_REASON },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.fwRuleMigrated,
        value: { const: true },
      },
    ],
  },
  {
    // The cable, into the new box. Two edges and a stamp, and the stamp is what
    // the morning after reads - not "the project is in the cutover phase", which
    // is derived, but the plain minute the plant changed hands.
    id: PROJECT_ACTIONS.cutover,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: { pred: 'target_missing' },
        reason: 'Name the box the circuit is moving INTO.',
      },
      {
        when: { pred: 'node_missing', node: TARGET },
        reason: 'Nothing in the estate is called "{target.id}".',
      },
      {
        when: not(fieldIs(TARGET, FIELDS.machineRole, 'firewall')),
        reason: '"{target.label}" is not an edge box. A site\'s circuit does '
          + 'not go into a workstation, however long the cable is.',
      },
      ...paramNodeGuards(PROJECT_CIRCUIT_PARAM, 'device'),
      ...paramNodeGuards(PROJECT_FROM_PARAM, 'machine'),
      ...paramNodeGuards(PROJECT_PARAM, 'project'),
      {
        when: not({
          pred: 'has_edge',
          from: param(PROJECT_CIRCUIT_PARAM),
          to: param(PROJECT_FROM_PARAM),
          kind: 'connected_to',
        }),
        reason: CUTOVER_CIRCUIT_ELSEWHERE_REASON,
      },
      {
        when: CUTOVER_LEAVES_SOMETHING_BEHIND,
        reason: CUTOVER_INCOMPLETE_REASON,
      },
    ],
    apply: [
      {
        op: 'remove_edge',
        from: param(PROJECT_CIRCUIT_PARAM),
        to: param(PROJECT_FROM_PARAM),
        kind: 'connected_to',
      },
      {
        op: 'add_edge',
        from: param(PROJECT_CIRCUIT_PARAM),
        to: TARGET,
        kind: 'connected_to',
      },
      {
        op: 'set_field',
        node: param(PROJECT_PARAM),
        field: FIELDS.projectCutoverAt,
        value: { now: true },
      },
    ],
  },
  {
    // And back. The old box is still racked - canon says never to unrack it
    // until the new one is proven - so the way back is the way out, reversed.
    //
    // Nothing is undone but the cable. The cutover minute STAYS stamped, which
    // is what makes the cost honest: the window was spent, the scream test still
    // runs on the morning after, and whatever the outage raised stands. A
    // rollback that erased the record would be a rollback that cost nothing, and
    // then it would be the correct move every time.
    id: PROJECT_ACTIONS.rollback,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: { pred: 'target_missing' },
        reason: 'Name the box the circuit is going back INTO.',
      },
      {
        when: { pred: 'node_missing', node: TARGET },
        reason: 'Nothing in the estate is called "{target.id}".',
      },
      ...paramNodeGuards(PROJECT_CIRCUIT_PARAM, 'device'),
      ...paramNodeGuards(PROJECT_FROM_PARAM, 'machine'),
      ...paramNodeGuards(PROJECT_PARAM, 'project'),
      {
        when: not({
          pred: 'has_edge',
          from: param(PROJECT_CIRCUIT_PARAM),
          to: param(PROJECT_FROM_PARAM),
          kind: 'connected_to',
        }),
        reason: CUTOVER_CIRCUIT_ELSEWHERE_REASON,
      },
    ],
    apply: [
      {
        op: 'remove_edge',
        from: param(PROJECT_CIRCUIT_PARAM),
        to: param(PROJECT_FROM_PARAM),
        kind: 'connected_to',
      },
      {
        op: 'add_edge',
        from: param(PROJECT_CIRCUIT_PARAM),
        to: TARGET,
        kind: 'connected_to',
      },
      {
        op: 'set_field',
        node: param(PROJECT_PARAM),
        field: FIELDS.projectRolledBackAt,
        value: { now: true },
      },
    ],
  },
  {
    // The world's own: somebody at the plant has noticed. It charges nothing -
    // the consequence is the ticket the driver raises beside it, with a factory
    // on the other end - and it exists so that the same rule cannot ring twice.
    id: PROJECT_ACTIONS.screamNoticed,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: { pred: 'node_missing', node: TARGET },
        reason: 'There is no rule called "{target.id}" to have gone missing.',
      },
      {
        when: fieldIs(TARGET, FIELDS.fwRuleMigrated, true),
        reason: 'That rule is on the new box. Nothing about it is broken, so '
          + 'nobody is ringing about it.',
      },
      {
        when: {
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.fwRuleScreamedAt,
        },
        reason: 'They have already rung about that one. Once is the '
          + 'arrangement, and the ticket is already open.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.fwRuleScreamedAt,
        value: { now: true },
      },
    ],
  },
];
