import type { ValidationContext } from '../../engine/actions';
import type { ReadOnlyGraphNode } from '../../engine/graph-view';
import type { FieldValue, NodeKind } from '../../engine/schema';

/** Every helpdesk action is tier 1: this is the job you were hired to do. */
export const HELPDESK_TIER = 1;

export type Resolved =
  | { ok: true; node: ReadOnlyGraphNode }
  | { ok: false; reason: string };

/**
 * Refusals are written for the person reading them on screen, not for a log
 * file. They say what is wrong AND what the world actually looks like, because
 * "invalid target" has never once helped anybody fix anything.
 */
const KIND_LABELS: Readonly<Record<NodeKind, string>> = {
  person: 'a person',
  account: 'an account',
  machine: 'a workstation',
  device: 'a device',
  service: 'a service',
  share: 'a network share',
  group: 'a group',
  mail_rule: 'a mail rule',
  ticket: 'a ticket',
};

export function describeNode(node: Readonly<ReadOnlyGraphNode>): string {
  const label = node.fields.name
    ?? node.fields.hostname
    ?? node.fields.username;

  return typeof label === 'string' && label.length > 0 ? label : node.id;
}

export function resolveTarget(
  context: Readonly<ValidationContext>,
  kind: NodeKind,
): Resolved {
  if (context.target === null) {
    return {
      ok: false,
      reason: `Pick ${KIND_LABELS[kind]} first. The action needs to know what it is aimed at.`,
    };
  }

  const node = context.graph.getNode(context.target);

  if (node === undefined) {
    return {
      ok: false,
      reason: `Nothing in the estate is called "${context.target}". `
        + 'It was decommissioned, renamed, or never existed.',
    };
  }

  if (node.kind !== kind) {
    return {
      ok: false,
      reason: `"${describeNode(node)}" is ${KIND_LABELS[node.kind]}, `
        + `and this action only works on ${KIND_LABELS[kind]}.`,
    };
  }

  return { ok: true, node };
}

export function resolveParamNode(
  context: Readonly<ValidationContext>,
  param: string,
  kind: NodeKind,
): Resolved {
  const value = context.params[param];

  if (typeof value !== 'string' || value.length === 0) {
    return {
      ok: false,
      reason: `This action needs ${KIND_LABELS[kind]} in its "${param}" field, `
        + 'and it arrived empty.',
    };
  }

  const node = context.graph.getNode(value);

  if (node === undefined) {
    return {
      ok: false,
      reason: `There is no record of "${value}" anywhere in the estate.`,
    };
  }

  if (node.kind !== kind) {
    return {
      ok: false,
      reason: `"${describeNode(node)}" is ${KIND_LABELS[node.kind]}, `
        + `not ${KIND_LABELS[kind]}.`,
    };
  }

  return { ok: true, node };
}

export function field(
  node: Readonly<ReadOnlyGraphNode>,
  name: string,
): FieldValue | undefined {
  return node.fields[name];
}

export function stringParam(
  context: Readonly<ValidationContext>,
  name: string,
): string | undefined {
  const value = context.params[name];
  return typeof value === 'string' ? value : undefined;
}

export function numberParam(
  context: Readonly<ValidationContext>,
  name: string,
): number | undefined {
  const value = context.params[name];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * `apply` runs only after `validate` returned null, so a missing target there
 * is a broken action definition rather than a player mistake - and it should
 * blow up in a test, not silently do nothing in front of a player.
 */
export function requireTargetId(target: string | null): string {
  if (target === null) {
    throw new Error('Action applied without a target after validation passed.');
  }

  return target;
}
