/**
 * The first PROJECT's tasks (E10, 0.29.0): ARDEN-MFG's edge firewall
 * replacement, as ordinary tickets.
 *
 * They are tickets on purpose and it is the whole architectural bet, taken from
 * the one PSA whose model this engine already is: in HaloPSA a project IS a
 * ticket type with project-task child tickets, and milestone two is locked until
 * milestone one completes. Modelled that way, a project task inherits the entire
 * ticket lifecycle for free - the queue row, the touch evidence, the handoff
 * form, the resolution rule the engine grades against the graph - and what is
 * left for the project layer to own is exactly the thing a ticket cannot say:
 * the ORDER, the DATES, and what may not be started yet.
 *
 * The chain below is that order, and it is the milestone lock: each phase task
 * `follows` the one before it, so it is raised in the minute that one closes and
 * not before. A locked task is therefore not a row with a clock on it that the
 * player is forbidden to touch - it is a row that has not arrived, which is what
 * "locked" means to anybody who has ever waited on a milestone, and which is the
 * only version of the lock that cannot produce a breach for work nobody was
 * allowed to do.
 *
 * The PARENT is the delivery ticket, and it closes by ENUMERATION over the four:
 * `and(eq(t1, state, resolved), ...)`. That is not elegance, it is the honest
 * limit of an assertion language that cannot quantify - and this version ships
 * no new grammar, so the authored set is enumerated by name.
 *
 * Every task's rule is a GATE built in `world/project.ts` and shared with the
 * phase derivation, so the board that says a phase is done and the ticket that
 * closes when it is are reading one sentence.
 *
 * The clocks are the other deliberate difference from every other ticket in this
 * roster. A service ticket arrives untriaged and is graded against the customer
 * SLA ladder; a project task arrives with a PLANNED date on it, which is the
 * whole distinction between proactive and reactive work ("Projects are proactive
 * and planned. Tickets are often created in response to a customer issue" -
 * Autotask's own line). So these carry the project's phase budget instead, and
 * the loader lets them, because a three-day task on a four-hour Silver clock
 * would be a ticket that breaches on the afternoon it is issued.
 */

import { PROJECT_ACTIONS, PROJECT_CIRCUIT_PARAM, PROJECT_FROM_PARAM, PROJECT_PARAM } from '../actions';
import { AUDIT_SOURCES, FIELDS } from '../fields';
import {
  ARDEN_EDGE_PROJECT,
  ARDEN_SCREAM_TICKETS,
  MSP_IDS,
} from '../msp-company';
import { UNTRIAGED_SLA_TICKS } from '../priority';
import {
  ARDEN_EDGE_ESTATE,
  auditGate,
  cutoverGate,
  handoverGate,
  PROJECT_BUDGETS,
  stagingGate,
} from '../project';
import type { TicketActionStep, TicketPath, WorldTicket } from './types';

/** The four task ids, named once so the parent can enumerate them. */
export const ARDEN_EDGE_TASKS = {
  parent: 'ticket:arden-fw-project',
  audit: 'ticket:arden-fw-audit',
  staging: 'ticket:arden-fw-staging',
  cutover: 'ticket:arden-fw-cutover',
  handover: 'ticket:arden-fw-handover',
} as const;

/** The rules, by id, in the order canon carries them. */
const RULES = [
  'service:ard-fw-01/wan-default',
  'service:ard-fw-01/nat-portal',
  'service:ard-fw-01/policy-plant',
  'service:ard-fw-01/vpn-coalport',
  'service:ard-fw-01/vpn-brenmark',
  'service:ard-fw-01/nat-scanners',
] as const;

/** Carrying one rule across, as a step. */
function carry(ruleId: string): TicketActionStep {
  return { action: PROJECT_ACTIONS.migrateRule, target: ruleId };
}

/** The cable, into the new box - the three ids the verb needs named. */
const CUTOVER_STEP: TicketActionStep = {
  action: PROJECT_ACTIONS.cutover,
  target: MSP_IDS.ardenEdgeNew,
  params: {
    [PROJECT_CIRCUIT_PARAM]: MSP_IDS.ardenCircuit,
    [PROJECT_FROM_PARAM]: MSP_IDS.ardenEdgeOld,
    [PROJECT_PARAM]: ARDEN_EDGE_PROJECT,
  },
};

/**
 * Writing the as-built down, which is the same act as reading a box: an edge's
 * documentation IS its configuration, recorded. One verb, pointed at the new
 * box instead of the old one - and the last step of the whole project, because
 * documentation is a phase with budget and it is the first thing dropped.
 */
const DOCUMENT_STEP: TicketActionStep = {
  action: PROJECT_ACTIONS.auditConfig,
  target: MSP_IDS.ardenEdgeNew,
};

/* -- the parent: the delivery ticket, closed by its four tasks ------------ */

const EDGE_PROJECT: WorldTicket = {
  arrival: 'summoned',
  project: { of: ARDEN_EDGE_PROJECT, due: FIELDS.projectHandoverDue },
  nodes: [
    MSP_IDS.ardenEdgeOld,
    MSP_IDS.ardenEdgeNew,
    MSP_IDS.ardenCircuit,
    MSP_IDS.ardenServer,
  ],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: ARDEN_EDGE_TASKS.parent,
    archetype: 'read_the_screen',
    flavor: {
      title: 'Arden: replace the edge firewall (ARD-FW-01 -> ARD-FW-02)',
      body:
        'The project row. ARD-FW-01 has run the plant\'s edge since 2014 and is '
        + 'out of support; ARD-FW-02 has been racked in the comms cabinet for '
        + 'six weeks on its factory configuration. Three working days: '
        + 'establish what the old box is actually doing, build the new one to '
        + 'match, move the circuit inside an approved window, and hand it over '
        + 'documented. This row closes when its four tasks do - there is '
        + 'nothing to do TO it. "fw status" is the plan against the clock.',
    },
    reporter: MSP_IDS.ardenContact,
    setup: [],
    // Enumeration, by name, over the authored set. `Expr` cannot say "all the
    // children of this", so the parent says which four it means - which is
    // exactly as brittle as it sounds and exactly as honest: add a fifth task
    // and this line is where you find out you have to say so.
    resolved_when: {
      op: 'and',
      exprs: [
        ARDEN_EDGE_TASKS.audit,
        ARDEN_EDGE_TASKS.staging,
        ARDEN_EDGE_TASKS.cutover,
        ARDEN_EDGE_TASKS.handover,
      ].map((id) => ({
        op: 'eq' as const,
        selector: { id },
        field: FIELDS.state,
        value: 'resolved',
      })),
    },
    sla_ticks: PROJECT_BUDGETS.handover,
    reward: { reputation: 8 },
    kb_ref: 'kb/edge-replacement-project',
  },
  cause: 'Nothing is broken. This is planned work: an unsupported edge box '
    + 'replaced by one that was bought for the purpose, which is a project '
    + 'rather than a ticket because it has interdependent tasks, a maintenance '
    + 'window and a piece of hardware in it.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: [
    {
      id: 'the-whole-project',
      app: 'cmd',
      label: 'Read the box, carry every rule, cut over, write it up',
      steps: [
        { action: PROJECT_ACTIONS.auditConfig, target: MSP_IDS.ardenEdgeOld },
        ...RULES.map(carry),
        CUTOVER_STEP,
        DOCUMENT_STEP,
      ],
    },
  ],
};

/* -- phase one: the audit, and the two ways to sign one off --------------- */

const EDGE_AUDIT: WorldTicket = {
  arrival: 'summoned',
  project: { of: ARDEN_EDGE_PROJECT, due: FIELDS.projectAuditDue },
  nodes: [MSP_IDS.ardenEdgeOld],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: ARDEN_EDGE_TASKS.audit,
    archetype: 'read_the_screen',
    flavor: {
      title: 'Arden edge, task 1: establish the rule set on ARD-FW-01',
      body:
        'Before anything is built on the new box, somebody has to say what the '
        + 'old one is doing. Dev has sent over the handover pack from the '
        + 'contractor who installed it - four rules, one page, last revised in '
        + '2019. "fw rules ARD-FW-01" reads the pack. "fw audit ARD-FW-01" '
        + 'reads the box. Either closes this task.',
      preChew: {
        tried: 'The portal offered the customer\'s own asset register, which '
          + 'lists ARD-FW-01 as "Firewall (see pack)".',
        stillBroken: 'The pack is the thing being asked about.',
      },
    },
    reporter: MSP_IDS.ardenContact,
    setup: [],
    resolved_when: auditGate(MSP_IDS.ardenEdgeOld),
    sla_ticks: PROJECT_BUDGETS.audit,
    reward: { reputation: 3 },
    kb_ref: 'kb/edge-replacement-project',
  },
  cause: 'Nothing is broken. The task is discovery, and the only question in it '
    + 'is which source the answer comes from: the handover pack, or the box.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: [
    {
      id: 'read-the-box',
      app: 'cmd',
      label: 'Read the live configuration off ARD-FW-01',
      steps: [
        { action: PROJECT_ACTIONS.auditConfig, target: MSP_IDS.ardenEdgeOld },
      ],
    },
    {
      id: 'take-the-pack',
      app: 'cmd',
      label: 'Take the handover pack\'s rule list as the audit',
      steps: [
        { action: PROJECT_ACTIONS.auditPack, target: MSP_IDS.ardenEdgeOld },
      ],
    },
  ],
};

/* -- phase two: the staging config ---------------------------------------- */

/**
 * Carrying the rules across, one at a time, in canon's order.
 *
 * The advertised path is the SIX, because the path is driven in a world where
 * the audit before it read the box - the gate proves a chain by closing its
 * predecessor through the shipped driver, and the audit's first advertised path
 * is the live-config read. A player who took the pack instead is asked for the
 * four the pack lists and closes this task on those; the gate says so in its own
 * words (`stagingGate`), and the two rules they were never told about are still
 * on the old box, waiting for Friday.
 */
const EDGE_STAGING: WorldTicket = {
  arrival: 'summoned',
  project: { of: ARDEN_EDGE_PROJECT, due: FIELDS.projectStagingDue },
  follows: ARDEN_EDGE_TASKS.audit,
  nodes: [MSP_IDS.ardenEdgeOld, MSP_IDS.ardenEdgeNew],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: ARDEN_EDGE_TASKS.staging,
    archetype: 'read_the_screen',
    flavor: {
      title: 'Arden edge, task 2: build ARD-FW-02 to match',
      body:
        'The new box is on the factory configuration: it will route nothing and '
        + 'let nothing through. Carry the rules over in the order they go in - '
        + 'routing, then NAT, then policies, then the tunnels - with "fw migrate '
        + '<rule>". This task closes when the new box carries everything the '
        + 'audit established, and not one rule more than that: what nobody '
        + 'established is not on anybody\'s list.',
    },
    reporter: MSP_IDS.ardenContact,
    setup: [],
    resolved_when: stagingGate(ARDEN_EDGE_PROJECT, MSP_IDS.ardenEdgeOld),
    sla_ticks: PROJECT_BUDGETS.staging - PROJECT_BUDGETS.audit,
    reward: { reputation: 4 },
    kb_ref: 'kb/edge-replacement-project',
  },
  cause: 'A new edge box has no rules on it. The work is copying a rule set '
    + 'across by hand, and the size of the job is decided entirely by how the '
    + 'rule set was established in the first place.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: [
    {
      id: 'carry-them-in-order',
      app: 'cmd',
      label: 'Carry every rule the audit found onto ARD-FW-02',
      steps: RULES.map(carry),
    },
  ],
};

/* -- phase three: the cutover, inside a window ---------------------------- */

const EDGE_CUTOVER: WorldTicket = {
  arrival: 'summoned',
  project: { of: ARDEN_EDGE_PROJECT, due: FIELDS.projectCutoverDue },
  follows: ARDEN_EDGE_TASKS.staging,
  nodes: [MSP_IDS.ardenEdgeNew, MSP_IDS.ardenCircuit, MSP_IDS.ardenEdgeOld],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: ARDEN_EDGE_TASKS.cutover,
    archetype: 'read_the_screen',
    flavor: {
      title: 'Arden edge, task 3: move the circuit to ARD-FW-02',
      body:
        'Two minutes of downtime and the plant is behind the new box. It goes '
        + 'in a window: Arden is co-managed, so file it - "changereq file '
        + 'ARD-FW-02" - let their IT sign it off, and cut over inside the slot '
        + 'you are given. "fw cutover ARD-FW-02" outside that slot is refused, '
        + 'and it should be. The old box stays racked; "fw rollback ARD-FW-01" '
        + 'puts the cable back if the new one does not hold.',
    },
    reporter: MSP_IDS.ardenContact,
    setup: [],
    resolved_when: cutoverGate(MSP_IDS.ardenCircuit, MSP_IDS.ardenEdgeNew),
    sla_ticks: PROJECT_BUDGETS.cutover - PROJECT_BUDGETS.staging,
    reward: { reputation: 5 },
    kb_ref: 'kb/edge-replacement-project',
  },
  cause: 'The cutover is one cable. Everything expensive about it happened '
    + 'before the cable moved, or does not happen at all.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: [
    {
      id: 'move-the-cable',
      app: 'cmd',
      label: 'Move the circuit from ARD-FW-01 into ARD-FW-02',
      steps: [CUTOVER_STEP],
    },
  ],
};

/* -- phase four: the scream test, and the handover ------------------------ */

const EDGE_HANDOVER: WorldTicket = {
  arrival: 'summoned',
  project: { of: ARDEN_EDGE_PROJECT, due: FIELDS.projectHandoverDue },
  follows: ARDEN_EDGE_TASKS.cutover,
  nodes: [MSP_IDS.ardenEdgeNew, MSP_IDS.ardenEdgeOld],
  claimed_urgency: 2,
  true_urgency: 2,
  def: {
    id: ARDEN_EDGE_TASKS.handover,
    archetype: 'read_the_screen',
    flavor: {
      title: 'Arden edge, task 4: stabilise and hand over',
      body:
        'The cable has moved. What is left is the part every project drops: '
        + 'watch it, carry over anything the morning finds, and write the '
        + 'as-built down - "fw audit ARD-FW-02" records what is actually on the '
        + 'new box, which is what documentation is. This task will not close '
        + 'while a single rule is still only on the old edge.',
    },
    reporter: MSP_IDS.ardenContact,
    setup: [],
    resolved_when: handoverGate(ARDEN_EDGE_ESTATE),
    sla_ticks: PROJECT_BUDGETS.handover - PROJECT_BUDGETS.cutover,
    reward: { reputation: 4 },
    kb_ref: 'kb/edge-replacement-project',
  },
  cause: 'Nothing is broken. The handover is the phase with budget that gets '
    + 'sacrificed, which is why the next engineer on this estate repeats the '
    + 'discovery somebody already paid for.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: [
    {
      id: 'write-the-as-built',
      app: 'cmd',
      label: 'Record what is actually on ARD-FW-02',
      steps: [DOCUMENT_STEP],
    },
  ],
};

/* -- the scream test: what the morning after finds ------------------------ */

/**
 * The two tickets a cutover done off the pack raises the next morning, one per
 * rule nobody carried, each naming its own rule.
 *
 * They are ORDINARY tickets and carry the customer's ordinary Silver clock,
 * because that is what they are: a customer ringing up about something that
 * stopped working. Only the planned work runs on the project's dates.
 *
 * Their `setup` states the world they arrive in - the audit was signed off the
 * pack - for the same reason every other ticket's setup states its fault: the
 * gate has to be able to spawn one into a fresh world and prove the fix closes
 * it, and the fix (carrying the rule over at last) is refused on a box whose
 * rule set nobody ever established. In play both fields are already exactly
 * this, because a config audit makes both of these tickets unreachable - the
 * cutover verb refuses to leave a known rule behind.
 */
function screamSetup(): WorldTicket['def']['setup'] {
  return [
    {
      op: 'setField',
      id: MSP_IDS.ardenEdgeOld,
      field: FIELDS.fwAudited,
      value: true,
    },
    {
      op: 'setField',
      id: MSP_IDS.ardenEdgeOld,
      field: FIELDS.fwAuditSource,
      value: AUDIT_SOURCES.pack,
    },
  ];
}

function carriedAtLast(ruleId: string): readonly TicketPath[] {
  return [
    {
      id: 'carry-it-now',
      app: 'cmd',
      label: 'Carry the missed rule onto ARD-FW-02',
      steps: [carry(ruleId)],
    },
  ];
}

const SCREAM_BRENMARK: WorldTicket = {
  arrival: 'summoned',
  nodes: ['service:ard-fw-01/vpn-brenmark', MSP_IDS.ardenEdgeNew],
  claimed_urgency: 3,
  true_urgency: 3,
  def: {
    id: ARDEN_SCREAM_TICKETS.vendorTunnel,
    archetype: 'hidden_cause',
    flavor: {
      title: 'Arden: Brenmark cannot reach the press line',
      body:
        'Dev, first thing: "Brenmark rang the plant manager, not me. Their '
        + 'engineers cannot get into the press line PLC to read the fault codes '
        + 'and the line is running on a manual reset every twenty minutes. It '
        + 'worked on Tuesday. Nothing changed at their end." The tunnel was on '
        + 'ARD-FW-01 and it is not on ARD-FW-02: rule vpn-brenmark, IPsec, put '
        + 'in when the line was commissioned in 2019.',
      preChew: {
        tried: 'The portal asked whether Brenmark had been added as a supplier '
          + 'contact this year.',
        stillBroken: 'They have been a supplier since 2019, which is the point.',
      },
    },
    reporter: MSP_IDS.ardenContact,
    setup: screamSetup(),
    resolved_when: {
      op: 'eq',
      selector: { id: 'service:ard-fw-01/vpn-brenmark' },
      field: FIELDS.fwRuleMigrated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 4 },
    kb_ref: 'kb/edge-replacement-project',
  },
  cause: 'The vendor tunnel was never in the handover pack, so an audit that '
    + 'read the pack never saw it, so the staging config never carried it, so '
    + 'the cutover took it out. Nobody did anything wrong except not look.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: carriedAtLast('service:ard-fw-01/vpn-brenmark'),
};

const SCREAM_SCANNERS: WorldTicket = {
  arrival: 'summoned',
  nodes: ['service:ard-fw-01/nat-scanners', MSP_IDS.ardenEdgeNew],
  claimed_urgency: 2,
  true_urgency: 3,
  def: {
    id: ARDEN_SCREAM_TICKETS.scanners,
    archetype: 'hidden_cause',
    flavor: {
      title: 'Arden: goods-in scanners have stopped booking stock in',
      body:
        'Goods-in have been scanning all morning and nothing has appeared in '
        + 'the system; there is a pallet queue out to the yard. The scanners '
        + 'talk to a hosted service that calls BACK in on 5601 - a rule opened '
        + 'for a trial in the spring that everybody forgot was load-bearing. It '
        + 'is on ARD-FW-01. It is not on ARD-FW-02.',
    },
    reporter: MSP_IDS.ardenContact,
    setup: screamSetup(),
    resolved_when: {
      op: 'eq',
      selector: { id: 'service:ard-fw-01/nat-scanners' },
      field: FIELDS.fwRuleMigrated,
      value: true,
    },
    sla_ticks: UNTRIAGED_SLA_TICKS,
    reward: { reputation: 3 },
    kb_ref: 'kb/edge-replacement-project',
  },
  cause: 'A pilot that ended and a rule that did not. It was in the live '
    + 'configuration and in nobody\'s documentation, which is the whole reason '
    + 'a migration audit reads the box rather than the paperwork about it.',
  dialogue_ref: 'dialogue/msp-dev',
  paths: carriedAtLast('service:ard-fw-01/nat-scanners'),
};

/**
 * Everything the edge project puts on the desk. The four tasks and their parent
 * arrive with the project; the two screams arrive - if they arrive - on the
 * morning after a cutover that left something behind.
 */
export const PROJECT_TICKETS: readonly WorldTicket[] = [
  EDGE_PROJECT,
  EDGE_AUDIT,
  EDGE_STAGING,
  EDGE_CUTOVER,
  EDGE_HANDOVER,
  SCREAM_BRENMARK,
  SCREAM_SCANNERS,
];

/** The tickets the kickoff raises, in spawn order. The rest are earned. */
export const PROJECT_KICKOFF_TICKETS: readonly string[] = [
  ARDEN_EDGE_TASKS.parent,
  ARDEN_EDGE_TASKS.audit,
];

/** Every task of the project, for the gate that stands one up whole. */
export const PROJECT_TASK_TICKETS: readonly string[] = [
  ARDEN_EDGE_TASKS.parent,
  ARDEN_EDGE_TASKS.audit,
  ARDEN_EDGE_TASKS.staging,
  ARDEN_EDGE_TASKS.cutover,
  ARDEN_EDGE_TASKS.handover,
];
