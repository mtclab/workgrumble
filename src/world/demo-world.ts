import type { ActionData, TicketDef } from '../engine-api';
import { COMPANY_IDS } from './company';
import { FIELDS, SERVICE_STATUS } from './fields';
import { UNTRIAGED_SLA_TICKS } from './priority';

/**
 * The M1 demo apps, still wired to the world - only now the world is the real
 * company seed (`company.ts`) instead of a fixture of its own. About This
 * Workstation reads the player's actual kit, and its percussive-maintenance
 * button still resolves a real ticket.
 */
export const WORLD_IDS = {
  player: COMPANY_IDS.player,
  account: COMPANY_IDS.playerAccount,
  machine: COMPANY_IDS.playerMachine,
  monitor: COMPANY_IDS.monitor,
  fan: COMPANY_IDS.fan,
  ticket: 'ticket:fan-noise',
} as const;

export const DEMO_ACTIONS = {
  diagnostics: 'demo.run_diagnostics',
  reseatFan: 'demo.reseat_fan',
} as const;

export const DEMO_TIER = 1;

/**
 * The hardware ticket. Two honest endings: fix the fan yourself (the About
 * app's percussive maintenance button, or anything else that unwedges it), or
 * escalate it to the field team - which is what escalation is FOR, and the
 * only ticket in M2 whose own rules accept one.
 */
export const DEMO_TICKET: TicketDef = {
  id: WORLD_IDS.ticket,
  archetype: 'hidden_cause',
  flavor: {
    title: 'PC sounds like a hornet in a biscuit tin',
    body:
      'Filed by you, about your own desk, because the process insists that '
      + 'work without a ticket did not happen. The noise started "around the '
      + 'time the cleaner came through", which is correct about the timing '
      + 'and wrong about the cause.',
  },
  reporter: WORLD_IDS.player,
  setup: [
    {
      op: 'setField',
      id: WORLD_IDS.fan,
      field: FIELDS.status,
      value: SERVICE_STATUS.wedged,
    },
  ],
  resolved_when: {
    op: 'or',
    exprs: [
      {
        op: 'eq',
        selector: { id: WORLD_IDS.fan },
        field: FIELDS.status,
        value: SERVICE_STATUS.running,
      },
      {
        op: 'eq',
        selector: { id: WORLD_IDS.ticket },
        field: FIELDS.escalated,
        value: true,
      },
    ],
  },
  sla_ticks: UNTRIAGED_SLA_TICKS,
  reward: { reputation: 3, money: 12 },
  kb_ref: 'kb/chassis-fan',
};

/**
 * The demo verbs, as data like every other action. Both of them aim at fixed
 * nodes rather than at a target, which the op language says with `id` refs.
 */
export const DEMO_ACTION_DATA: readonly ActionData[] = [
  {
    id: DEMO_ACTIONS.diagnostics,
    tier: DEMO_TIER,
    validate: [
      {
        when: { pred: 'node_missing', node: { id: WORLD_IDS.machine } },
        reason: 'There is no workstation here to diagnose.',
      },
    ],
    // The stamp comes from the simulation clock, not from a caller-supplied
    // parameter: a report is dated when it ran, not when the UI says so.
    apply: [
      {
        op: 'set_field',
        node: { id: WORLD_IDS.machine },
        field: 'last_diagnostic',
        value: { now: true },
      },
    ],
  },
  {
    id: DEMO_ACTIONS.reseatFan,
    tier: DEMO_TIER,
    validate: [
      {
        when: {
          pred: 'field_missing',
          node: { id: WORLD_IDS.fan },
          field: FIELDS.status,
        },
        reason: 'No chassis fan is registered on this workstation.',
      },
      {
        when: {
          pred: 'field_eq',
          node: { id: WORLD_IDS.fan },
          field: FIELDS.status,
          value: { const: SERVICE_STATUS.running },
        },
        reason: 'The fan already spins freely. Hitting it again is just violence.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: { id: WORLD_IDS.fan },
        field: FIELDS.status,
        value: { const: SERVICE_STATUS.running },
      },
    ],
  },
];
