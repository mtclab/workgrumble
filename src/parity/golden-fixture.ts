import type {
  ActionData,
  FieldValue,
  GuardData,
  NodeKind,
  SetupOp,
} from '../engine-api';

/**
 * The M0 determinism fixture: the same eight nodes, the same fifteen scripted
 * dispatches, the same rng-consuming actions the TypeScript engine was
 * measured on. It has to land on `4a07e554b7acbd22` forever - the hash is the
 * proof that the serialization, the rng and the action semantics have not
 * drifted, and it outlived the engine it was taken from.
 */
export const GOLDEN_SCENARIO_HASH = '4a07e554b7acbd22';
export const GOLDEN_SEED = 0x5eed_1234;
export const GOLDEN_ACTOR = 'person:tech';

const ROTATIONS = [0, 90, 180, 270] as const;
const SERVICE_STATES = ['running', 'stopped', 'wedged'] as const;

export interface ScriptStep {
  advance: number;
  id: string;
  target: string;
  params: Record<string, FieldValue>;
}

export const GOLDEN_SCRIPT: readonly ScriptStep[] = [
  { advance: 0, id: 'service.jostle', target: 'service:spooler', params: {} },
  { advance: 0, id: 'account.roll-lock', target: 'account:ada', params: {} },
  { advance: 1, id: 'machine.rotate', target: 'machine:ada', params: {} },
  { advance: 0, id: 'device.toggle', target: 'device:printer', params: {} },
  {
    advance: 2,
    id: 'field.set',
    target: 'share:common',
    params: { field: 'quota_gb', value: 12 },
  },
  { advance: 0, id: 'service.jostle', target: 'service:spooler', params: {} },
  { advance: 1, id: 'account.roll-lock', target: 'account:ada', params: {} },
  { advance: 0, id: 'machine.rotate', target: 'machine:ada', params: {} },
  {
    advance: 3,
    id: 'field.set',
    target: 'machine:ada',
    params: { field: 'resolution', value: '1024x768' },
  },
  { advance: 0, id: 'device.toggle', target: 'device:printer', params: {} },
  { advance: 0, id: 'service.jostle', target: 'service:spooler', params: {} },
  {
    advance: 1,
    id: 'field.set',
    target: 'account:ada',
    params: { field: 'note', value: 'checked by scripted replay' },
  },
  { advance: 0, id: 'account.roll-lock', target: 'account:ada', params: {} },
  { advance: 2, id: 'machine.rotate', target: 'machine:ada', params: {} },
  {
    advance: 0,
    id: 'field.set',
    target: 'share:common',
    params: { field: 'archived', value: false },
  },
];

export const GOLDEN_SETUP: readonly SetupOp[] = [
  {
    op: 'addNode',
    node: {
      id: 'person:tech',
      kind: 'person',
      fields: { name: 'Player Tech' },
    },
  },
  {
    op: 'addNode',
    node: { id: 'person:ada', kind: 'person', fields: { name: 'Ada User' } },
  },
  {
    op: 'addNode',
    node: {
      id: 'account:ada',
      kind: 'account',
      fields: { username: 'ada', locked: true },
    },
  },
  {
    op: 'addNode',
    node: {
      id: 'machine:ada',
      kind: 'machine',
      fields: {
        hostname: 'ADA-PC',
        display_rotation: 0,
        resolution: '800x600',
      },
    },
  },
  {
    op: 'addNode',
    node: {
      id: 'device:printer',
      kind: 'device',
      fields: { name: 'Printer', type: 'printer', powered: true },
    },
  },
  {
    op: 'addNode',
    node: {
      id: 'service:spooler',
      kind: 'service',
      fields: { name: 'Print Spooler', status: 'wedged' },
    },
  },
  {
    op: 'addNode',
    node: {
      id: 'group:print-users',
      kind: 'group',
      fields: { name: 'Print Users' },
    },
  },
  {
    op: 'addNode',
    node: {
      id: 'share:common',
      kind: 'share',
      fields: { name: 'Common', path: '/common' },
    },
  },
  {
    op: 'addEdge',
    edge: { from: 'person:ada', to: 'account:ada', kind: 'owns' },
  },
  {
    op: 'addEdge',
    edge: { from: 'person:ada', to: 'machine:ada', kind: 'owns' },
  },
  {
    op: 'addEdge',
    edge: { from: 'account:ada', to: 'group:print-users', kind: 'member_of' },
  },
  {
    op: 'addEdge',
    edge: { from: 'account:ada', to: 'share:common', kind: 'has_access' },
  },
  {
    op: 'addEdge',
    edge: { from: 'device:printer', to: 'machine:ada', kind: 'connected_to' },
  },
  {
    op: 'addEdge',
    edge: { from: 'service:spooler', to: 'machine:ada', kind: 'runs_on' },
  },
];

function kindGuards(kind: NodeKind): GuardData[] {
  return [
    { when: { pred: 'target_missing' }, reason: 'Target is required.' },
    {
      when: {
        pred: 'any',
        of: [
          { pred: 'node_missing', node: { ref: 'target' } },
          {
            pred: 'not',
            of: { pred: 'kind_is', node: { ref: 'target' }, kind },
          },
        ],
      },
      reason: `Target must be ${kind}.`,
    },
  ];
}

/** The fixture verbs in the op language, for the Rust core. */
export const GOLDEN_ACTION_DATA: readonly ActionData[] = [
  {
    id: 'service.jostle',
    tier: 1,
    validate: kindGuards('service'),
    apply: [
      {
        op: 'set_field',
        node: { ref: 'target' },
        field: 'status',
        value: { rng_pick: [...SERVICE_STATES] },
      },
    ],
  },
  {
    id: 'account.roll-lock',
    tier: 1,
    validate: kindGuards('account'),
    apply: [
      {
        op: 'set_field',
        node: { ref: 'target' },
        field: 'locked',
        value: { eq: [{ rng_int: { min: 0, max: 1 } }, { const: 1 }] },
      },
    ],
  },
  {
    id: 'machine.rotate',
    tier: 1,
    validate: kindGuards('machine'),
    apply: [
      {
        op: 'set_field',
        node: { ref: 'target' },
        field: 'display_rotation',
        value: { rng_pick: [...ROTATIONS] },
      },
    ],
  },
  {
    id: 'device.toggle',
    tier: 1,
    validate: [
      ...kindGuards('device'),
      {
        when: {
          pred: 'not',
          of: {
            pred: 'field_is_bool',
            node: { ref: 'target' },
            field: 'powered',
          },
        },
        reason: 'Device requires a powered field.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: { ref: 'target' },
        field: 'powered',
        value: { not_field: { node: { ref: 'target' }, field: 'powered' } },
      },
    ],
  },
  {
    id: 'field.set',
    tier: 1,
    validate: [
      {
        when: {
          pred: 'any',
          of: [
            { pred: 'target_missing' },
            { pred: 'node_missing', node: { ref: 'target' } },
          ],
        },
        reason: 'Existing target is required.',
      },
      {
        when: {
          pred: 'any',
          of: [
            { pred: 'param_string_missing', param: 'field' },
            { pred: 'param_absent', param: 'value' },
          ],
        },
        reason: 'Field and value params are required.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: { ref: 'target' },
        field: { param: 'field' },
        value: { param: 'value' },
      },
    ],
  },
];
