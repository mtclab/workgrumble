import type {
  GuardData,
  NodeKind,
  NodeRefData,
  OpData,
  PredData,
} from '../../engine-api';
import { FIELDS } from '../fields';

/** Every helpdesk action is tier 1: this is the job you were hired to do. */
export const HELPDESK_TIER = 1;

export const TARGET: NodeRefData = { ref: 'target' };

/**
 * How a refusal names each kind. The words belong to the world; the engine
 * only knows WHICH kind it is refusing, and asks for the label when it writes
 * the sentence.
 */
export const KIND_LABELS: Readonly<Record<NodeKind, string>> = {
  person: 'a person',
  account: 'an account',
  machine: 'a workstation',
  device: 'a device',
  service: 'a service',
  unit: 'a systemd unit',
  customer: 'a customer',
  change_request: 'a change request',
  coordination: 'a coordination notice',
  project: 'a project',
  share: 'a network share',
  group: 'a group',
  mail_rule: 'a mail rule',
  ticket: 'a ticket',
  directory: 'a directory',
  file: 'a file',
};

/**
 * The stamp that goes with EVERY write to the customer-visible stream (0.42.0).
 *
 * One fragment, exported, because the honesty of the "Answered" row is a
 * property of the whole registry rather than of one verb: the reporter has
 * heard from you the first time anything lands in front of them, whether it
 * was a question, a reply, a bulk close or a quote the scope verbs put there
 * on the world's behalf. Written once and never rewritten - the first words
 * are the answer, and the second question is not a faster first one.
 *
 * `actions.test.ts` walks the shipped registry and fails if an action writes
 * `customer_visible` without carrying this, so a sixth writer added later
 * cannot quietly leave the pane claiming nobody was told anything.
 */
export const ANSWERED_STAMP_OPS: readonly OpData[] = Object.freeze([
  {
    op: 'when',
    cond: not({
      pred: 'field_is_number',
      node: TARGET,
      field: FIELDS.answeredAt,
    }),
    ops: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.answeredAt,
        value: { now: true },
      },
    ],
  },
]);

export function param(name: string): NodeRefData {
  return { param: name };
}

export function not(of: PredData): PredData {
  return { pred: 'not', of };
}

export function fieldIs(
  node: NodeRefData,
  field: string,
  value: string | number | boolean | null,
): PredData {
  return { pred: 'field_eq', node, field, value: { const: value } };
}

/**
 * Refusals are written for the person reading them on screen, not for a log
 * file. They say what is wrong AND what the world actually looks like, because
 * "invalid target" has never once helped anybody fix anything.
 */
export function targetGuards(kind: NodeKind): readonly GuardData[] {
  const label = KIND_LABELS[kind];

  return [
    {
      when: { pred: 'target_missing' },
      reason: `Pick ${label} first. The action needs to know what it is `
        + 'aimed at.',
    },
    {
      when: { pred: 'node_missing', node: TARGET },
      reason: 'Nothing in the estate is called "{target.id}". '
        + 'It was decommissioned, renamed, or never existed.',
    },
    {
      when: not({ pred: 'kind_is', node: TARGET, kind }),
      reason: `"{target.label}" is {target.kind_label}, `
        + `and this action only works on ${label}.`,
    },
  ];
}

/** The same three refusals for a node named by a parameter. */
export function paramNodeGuards(
  name: string,
  kind: NodeKind,
): readonly GuardData[] {
  const label = KIND_LABELS[kind];

  return [
    {
      when: { pred: 'param_string_missing', param: name },
      reason: `This action needs ${label} in its "${name}" field, `
        + 'and it arrived empty.',
    },
    {
      when: { pred: 'node_missing', node: param(name) },
      reason: `There is no record of "{v:${name}}" anywhere in the estate.`,
    },
    {
      when: not({ pred: 'kind_is', node: param(name), kind }),
      reason: `"{p:${name}.label}" is {p:${name}.kind_label}, not ${label}.`,
    },
  ];
}
