import type { Node } from './graph';

export const NODE_KINDS = [
  'person',
  'account',
  'machine',
  'device',
  'service',
  'share',
  'group',
  'mail_rule',
  'ticket',
] as const;

export const EDGE_KINDS = [
  'owns',
  'member_of',
  'connected_to',
  'runs_on',
  'has_access',
] as const;

export const TICKET_STATES = [
  'open',
  'resolved',
  'breached',
  'waiting_on_user',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type TicketState = (typeof TICKET_STATES)[number];
export type FieldValue = string | number | boolean | null;

export interface PersonFields {
  name?: string;
}

export interface AccountFields {
  username?: string;
  locked?: boolean;
  enabled?: boolean;
}

export interface MachineFields {
  hostname?: string;
  display_rotation?: 0 | 90 | 180 | 270;
  resolution?: string;
}

export interface DeviceFields {
  name?: string;
  type?: string;
  powered?: boolean;
}

export interface ServiceFields {
  name?: string;
  status?: 'running' | 'stopped' | 'wedged';
}

export interface ShareFields {
  name?: string;
  path?: string;
}

export interface GroupFields {
  name?: string;
}

export interface MailRuleFields {
  name?: string;
  enabled?: boolean;
  target?: string;
}

export interface TicketFields {
  state: TicketState;
  spawned_at: number;
  sla_deadline: number;
  breached?: boolean;
}

export interface NodeFieldsByKind {
  person: PersonFields;
  account: AccountFields;
  machine: MachineFields;
  device: DeviceFields;
  service: ServiceFields;
  share: ShareFields;
  group: GroupFields;
  mail_rule: MailRuleFields;
  ticket: TicketFields;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === 'string'
    && NODE_KINDS.some((kind) => kind === value);
}

export function isEdgeKind(value: unknown): value is EdgeKind {
  return typeof value === 'string'
    && EDGE_KINDS.some((kind) => kind === value);
}

export function isTicketState(value: unknown): value is TicketState {
  return typeof value === 'string'
    && TICKET_STATES.some((state) => state === value);
}

export function isFieldValue(value: unknown): value is FieldValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function assertOptionalType(
  fields: Record<string, FieldValue>,
  field: string,
  predicate: (value: FieldValue) => boolean,
  expected: string,
): void {
  const value = fields[field];

  if (value !== undefined && !predicate(value)) {
    throw new TypeError(`Field "${field}" must be ${expected}.`);
  }
}

function isString(value: FieldValue): value is string {
  return typeof value === 'string';
}

function isBoolean(value: FieldValue): value is boolean {
  return typeof value === 'boolean';
}

function isNumber(value: FieldValue): value is number {
  return typeof value === 'number';
}

function assertKnownFields(
  kind: NodeKind,
  fields: Record<string, FieldValue>,
): void {
  switch (kind) {
    case 'person':
      assertOptionalType(fields, 'name', isString, 'a string');
      return;
    case 'account':
      assertOptionalType(fields, 'username', isString, 'a string');
      assertOptionalType(fields, 'locked', isBoolean, 'a boolean');
      assertOptionalType(fields, 'enabled', isBoolean, 'a boolean');
      return;
    case 'machine':
      assertOptionalType(fields, 'hostname', isString, 'a string');
      assertOptionalType(
        fields,
        'display_rotation',
        (value) => typeof value === 'number'
          && [0, 90, 180, 270].some((rotation) => rotation === value),
        'one of 0, 90, 180, or 270',
      );
      assertOptionalType(fields, 'resolution', isString, 'a string');
      return;
    case 'device':
      assertOptionalType(fields, 'name', isString, 'a string');
      assertOptionalType(fields, 'type', isString, 'a string');
      assertOptionalType(fields, 'powered', isBoolean, 'a boolean');
      return;
    case 'service':
      assertOptionalType(fields, 'name', isString, 'a string');
      assertOptionalType(
        fields,
        'status',
        (value) => value === 'running'
          || value === 'stopped'
          || value === 'wedged',
        '"running", "stopped", or "wedged"',
      );
      return;
    case 'share':
      assertOptionalType(fields, 'name', isString, 'a string');
      assertOptionalType(fields, 'path', isString, 'a string');
      return;
    case 'group':
      assertOptionalType(fields, 'name', isString, 'a string');
      return;
    case 'mail_rule':
      assertOptionalType(fields, 'name', isString, 'a string');
      assertOptionalType(fields, 'enabled', isBoolean, 'a boolean');
      assertOptionalType(fields, 'target', isString, 'a string');
      return;
    case 'ticket': {
      assertOptionalType(fields, 'state', isTicketState, 'a ticket state');
      assertOptionalType(fields, 'spawned_at', isNumber, 'a number');
      assertOptionalType(fields, 'sla_deadline', isNumber, 'a number');
      assertOptionalType(fields, 'breached', isBoolean, 'a boolean');

      if (!isTicketState(fields.state)) {
        throw new TypeError('Ticket nodes require a valid "state" field.');
      }

      const spawnedAt = fields.spawned_at;
      if (
        typeof spawnedAt !== 'number'
        || !Number.isSafeInteger(spawnedAt)
        || spawnedAt < 0
      ) {
        throw new TypeError(
          'Ticket nodes require a non-negative integer "spawned_at" field.',
        );
      }

      const slaDeadline = fields.sla_deadline;
      if (
        typeof slaDeadline !== 'number'
        || !Number.isSafeInteger(slaDeadline)
        || slaDeadline < 0
      ) {
        throw new TypeError(
          'Ticket nodes require a non-negative integer "sla_deadline" field.',
        );
      }
    }
  }
}

export function validateNode(value: unknown): Node {
  if (!isRecord(value)) {
    throw new TypeError('Node must be an object.');
  }

  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new TypeError('Node id must be a non-empty string.');
  }

  if (!isNodeKind(value.kind)) {
    throw new TypeError('Node kind is not supported.');
  }

  if (!isRecord(value.fields)) {
    throw new TypeError('Node fields must be an object.');
  }

  const fields: Record<string, FieldValue> = {};

  for (const [field, fieldValue] of Object.entries(value.fields)) {
    if (!isFieldValue(fieldValue)) {
      throw new TypeError(`Field "${field}" has an unsupported value.`);
    }

    fields[field] = fieldValue;
  }

  assertKnownFields(value.kind, fields);

  return {
    id: value.id,
    kind: value.kind,
    fields,
  };
}

export function isNode(value: unknown): value is Node {
  try {
    validateNode(value);
    return true;
  } catch {
    return false;
  }
}
