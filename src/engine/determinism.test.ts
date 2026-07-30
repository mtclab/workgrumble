import { describe, expect, it } from 'vitest';

import {
  ActionRegistry,
  type ActionDef,
  type DispatchLogEntry,
  type ValidationContext,
} from './actions';
import { SimClock } from './clock';
import { EntityGraph } from './graph';
import { createRng } from './rng';
import {
  type FieldValue,
  isFieldValue,
  type NodeKind,
} from './schema';

const GOLDEN_SCENARIO_HASH = '4a07e554b7acbd22';
const ROTATIONS = [0, 90, 180, 270] as const;
const SERVICE_STATES = ['running', 'stopped', 'wedged'] as const;

interface Scenario {
  graph: EntityGraph;
  clock: SimClock;
  registry: ActionRegistry;
}

interface ScriptStep {
  advance: number;
  id: string;
  target: string;
  params: Record<string, FieldValue>;
}

const SCRIPT: readonly ScriptStep[] = [
  {
    advance: 0,
    id: 'service.jostle',
    target: 'service:spooler',
    params: {},
  },
  {
    advance: 0,
    id: 'account.roll-lock',
    target: 'account:ada',
    params: {},
  },
  {
    advance: 1,
    id: 'machine.rotate',
    target: 'machine:ada',
    params: {},
  },
  {
    advance: 0,
    id: 'device.toggle',
    target: 'device:printer',
    params: {},
  },
  {
    advance: 2,
    id: 'field.set',
    target: 'share:common',
    params: { field: 'quota_gb', value: 12 },
  },
  {
    advance: 0,
    id: 'service.jostle',
    target: 'service:spooler',
    params: {},
  },
  {
    advance: 1,
    id: 'account.roll-lock',
    target: 'account:ada',
    params: {},
  },
  {
    advance: 0,
    id: 'machine.rotate',
    target: 'machine:ada',
    params: {},
  },
  {
    advance: 3,
    id: 'field.set',
    target: 'machine:ada',
    params: { field: 'resolution', value: '1024x768' },
  },
  {
    advance: 0,
    id: 'device.toggle',
    target: 'device:printer',
    params: {},
  },
  {
    advance: 0,
    id: 'service.jostle',
    target: 'service:spooler',
    params: {},
  },
  {
    advance: 1,
    id: 'field.set',
    target: 'account:ada',
    params: { field: 'note', value: 'checked by scripted replay' },
  },
  {
    advance: 0,
    id: 'account.roll-lock',
    target: 'account:ada',
    params: {},
  },
  {
    advance: 2,
    id: 'machine.rotate',
    target: 'machine:ada',
    params: {},
  },
  {
    advance: 0,
    id: 'field.set',
    target: 'share:common',
    params: { field: 'archived', value: false },
  },
];

function targetKindReason(
  context: ValidationContext,
  kind: NodeKind,
): string | null {
  if (context.target === null) {
    return 'Target is required.';
  }

  const target = context.graph.getNode(context.target);
  return target?.kind === kind ? null : `Target must be ${kind}.`;
}

function setFieldParams(
  params: Readonly<Record<string, FieldValue>>,
): { field: string; value: FieldValue } | undefined {
  const field = params.field;
  const value = params.value;

  if (
    typeof field !== 'string'
    || field.length === 0
    || !isFieldValue(value)
  ) {
    return undefined;
  }

  return { field, value };
}

function scenarioActions(): ActionDef[] {
  return [
    {
      id: 'service.jostle',
      tier: 1,
      validate: (context) => targetKindReason(context, 'service'),
      apply: ({ graph, rng, target }) => {
        if (target !== null) {
          graph.setField(target, 'status', rng.pick(SERVICE_STATES));
        }
      },
    },
    {
      id: 'account.roll-lock',
      tier: 1,
      validate: (context) => targetKindReason(context, 'account'),
      apply: ({ graph, rng, target }) => {
        if (target !== null) {
          graph.setField(target, 'locked', rng.int(0, 1) === 1);
        }
      },
    },
    {
      id: 'machine.rotate',
      tier: 1,
      validate: (context) => targetKindReason(context, 'machine'),
      apply: ({ graph, rng, target }) => {
        if (target !== null) {
          graph.setField(target, 'display_rotation', rng.pick(ROTATIONS));
        }
      },
    },
    {
      id: 'device.toggle',
      tier: 1,
      validate: (context) => {
        const kindReason = targetKindReason(context, 'device');

        if (kindReason !== null || context.target === null) {
          return kindReason;
        }

        return typeof context.graph.getField(context.target, 'powered') === 'boolean'
          ? null
          : 'Device requires a powered field.';
      },
      apply: ({ graph, target }) => {
        if (target === null) {
          return;
        }

        const powered = graph.getField(target, 'powered');
        if (typeof powered === 'boolean') {
          graph.setField(target, 'powered', !powered);
        }
      },
    },
    {
      id: 'field.set',
      tier: 1,
      validate: (context) => {
        if (
          context.target === null
          || context.graph.getNode(context.target) === undefined
        ) {
          return 'Existing target is required.';
        }

        return setFieldParams(context.params) === undefined
          ? 'Field and value params are required.'
          : null;
      },
      apply: ({ graph, params, target }) => {
        const parsed = setFieldParams(params);

        if (target !== null && parsed !== undefined) {
          graph.setField(target, parsed.field, parsed.value);
        }
      },
    },
  ];
}

function createScenario(): Scenario {
  const graph = new EntityGraph();
  graph.addNode({
    id: 'person:tech',
    kind: 'person',
    fields: { name: 'Player Tech' },
  });
  graph.addNode({
    id: 'person:ada',
    kind: 'person',
    fields: { name: 'Ada User' },
  });
  graph.addNode({
    id: 'account:ada',
    kind: 'account',
    fields: { username: 'ada', locked: true },
  });
  graph.addNode({
    id: 'machine:ada',
    kind: 'machine',
    fields: {
      hostname: 'ADA-PC',
      display_rotation: 0,
      resolution: '800x600',
    },
  });
  graph.addNode({
    id: 'device:printer',
    kind: 'device',
    fields: { name: 'Printer', type: 'printer', powered: true },
  });
  graph.addNode({
    id: 'service:spooler',
    kind: 'service',
    fields: { name: 'Print Spooler', status: 'wedged' },
  });
  graph.addNode({
    id: 'group:print-users',
    kind: 'group',
    fields: { name: 'Print Users' },
  });
  graph.addNode({
    id: 'share:common',
    kind: 'share',
    fields: { name: 'Common', path: '/common' },
  });
  graph.addEdge({
    from: 'person:ada',
    to: 'account:ada',
    kind: 'owns',
  });
  graph.addEdge({
    from: 'person:ada',
    to: 'machine:ada',
    kind: 'owns',
  });
  graph.addEdge({
    from: 'account:ada',
    to: 'group:print-users',
    kind: 'member_of',
  });
  graph.addEdge({
    from: 'account:ada',
    to: 'share:common',
    kind: 'has_access',
  });
  graph.addEdge({
    from: 'device:printer',
    to: 'machine:ada',
    kind: 'connected_to',
  });
  graph.addEdge({
    from: 'service:spooler',
    to: 'machine:ada',
    kind: 'runs_on',
  });

  const clock = new SimClock();
  const registry = new ActionRegistry(graph, createRng(0x5eed1234), clock);

  for (const definition of scenarioActions()) {
    registry.register(definition);
  }

  return { graph, clock, registry };
}

function runScript(scenario: Scenario): readonly DispatchLogEntry[] {
  for (const step of SCRIPT) {
    scenario.clock.advance(step.advance);
    const result = scenario.registry.dispatch(
      step.id,
      'person:tech',
      step.target,
      step.params,
    );

    if (!result.ok) {
      throw new Error(`Scenario action failed: ${result.reason}`);
    }
  }

  return scenario.registry.log;
}

describe('determinism gate', () => {
  it('repeats the scripted scenario and matches the committed golden hash', () => {
    const first = createScenario();
    const second = createScenario();
    const firstLog = runScript(first);
    const secondLog = runScript(second);
    const firstHash = first.graph.snapshotHash();
    const secondHash = second.graph.snapshotHash();

    expect(firstLog).toHaveLength(15);
    expect(secondLog).toEqual(firstLog);
    expect(secondHash).toBe(firstHash);
    expect(firstHash).toBe(GOLDEN_SCENARIO_HASH);
  });
});

describe('dispatch replay', () => {
  it('replays run A into fresh graph B and reaches the same snapshot hash', () => {
    const runA = createScenario();
    const capturedLog = runScript(runA);
    const runB = createScenario();

    runB.registry.replay(capturedLog);

    expect(runB.registry.log).toEqual(capturedLog);
    expect(runB.clock.now()).toBe(runA.clock.now());
    expect(runB.graph.snapshotHash()).toBe(runA.graph.snapshotHash());
  });
});
