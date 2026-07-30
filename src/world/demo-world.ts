import type {
  ActionContext,
  ActionDef,
  ActionRegistry,
} from '../engine/actions';
import type { EntityGraph } from '../engine/graph';
import type { TicketDef } from '../engine/tickets';

/**
 * The M1 fixture world. It is deliberately tiny: enough graph for the demo
 * apps to read something true, and one ticket so the ticket engine is wired
 * end to end rather than constructed and ignored.
 */
export const WORLD_IDS = {
  player: 'person:pat',
  account: 'account:pat',
  machine: 'machine:beige-box',
  monitor: 'device:monitor',
  fan: 'service:chassis-fan',
  ticket: 'ticket:fan-noise',
} as const;

export const DEMO_ACTIONS = {
  diagnostics: 'demo.run_diagnostics',
  reseatFan: 'demo.reseat_fan',
} as const;

export const DEMO_TIER = 1;

export function seedDemoWorld(graph: EntityGraph): void {
  graph.addNode({
    id: WORLD_IDS.player,
    kind: 'person',
    fields: { name: 'Pat Pending' },
  });
  graph.addNode({
    id: WORLD_IDS.account,
    kind: 'account',
    fields: { username: 'ppending', locked: false, enabled: true },
  });
  graph.addNode({
    id: WORLD_IDS.machine,
    kind: 'machine',
    fields: {
      hostname: 'BEIGE-BOX',
      display_rotation: 0,
      resolution: '1024x768',
    },
  });
  graph.addNode({
    id: WORLD_IDS.monitor,
    kind: 'device',
    fields: { name: 'Trinitrend 15"', type: 'monitor', powered: true },
  });
  graph.addNode({
    id: WORLD_IDS.fan,
    kind: 'service',
    fields: { name: 'Chassis fan', status: 'running' },
  });

  graph.addEdge({
    from: WORLD_IDS.player,
    to: WORLD_IDS.account,
    kind: 'owns',
  });
  graph.addEdge({
    from: WORLD_IDS.player,
    to: WORLD_IDS.machine,
    kind: 'owns',
  });
  graph.addEdge({
    from: WORLD_IDS.monitor,
    to: WORLD_IDS.machine,
    kind: 'connected_to',
  });
  graph.addEdge({
    from: WORLD_IDS.fan,
    to: WORLD_IDS.machine,
    kind: 'runs_on',
  });
}

/** The ticket that the About app's percussive maintenance button resolves. */
export const DEMO_TICKET: TicketDef = {
  id: WORLD_IDS.ticket,
  archetype: 'hidden_cause',
  flavor: {
    title: 'PC sounds like a hornet in a biscuit tin',
    body:
      'Reporter says the noise started "around the time the cleaner came '
      + 'through". Reporter is, as usual, correct about the timing and wrong '
      + 'about the cause.',
  },
  reporter: WORLD_IDS.player,
  setup: [
    {
      op: 'setField',
      id: WORLD_IDS.fan,
      field: 'status',
      value: 'wedged',
    },
  ],
  resolved_when: {
    op: 'eq',
    selector: { id: WORLD_IDS.fan },
    field: 'status',
    value: 'running',
  },
  sla_ticks: 240,
  reward: { reputation: 3, money: 12 },
  kb_ref: 'kb/chassis-fan',
};

function numberParam(context: Readonly<ActionContext>, name: string): number {
  const value = context.params[name];

  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`Action parameter "${name}" must be a tick number.`);
  }

  return value;
}

const DEMO_ACTION_DEFS: readonly ActionDef[] = [
  {
    id: DEMO_ACTIONS.diagnostics,
    tier: DEMO_TIER,
    validate: (context) => {
      if (context.graph.getNode(WORLD_IDS.machine) === undefined) {
        return 'There is no workstation here to diagnose.';
      }

      if (typeof context.params.tick !== 'number') {
        return 'Diagnostics need a timestamp to stamp the report with.';
      }

      return null;
    },
    apply: (context) => {
      context.graph.setField(
        WORLD_IDS.machine,
        'last_diagnostic',
        numberParam(context, 'tick'),
      );
    },
  },
  {
    id: DEMO_ACTIONS.reseatFan,
    tier: DEMO_TIER,
    validate: (context) => {
      const status = context.graph.getField(WORLD_IDS.fan, 'status');

      if (status === undefined) {
        return 'No chassis fan is registered on this workstation.';
      }

      if (status === 'running') {
        return 'The fan already spins freely. Hitting it again is just violence.';
      }

      return null;
    },
    apply: (context) => {
      context.graph.setField(WORLD_IDS.fan, 'status', 'running');
    },
  },
];

export function registerDemoActions(registry: ActionRegistry): void {
  for (const definition of DEMO_ACTION_DEFS) {
    registry.register(definition);
  }
}
