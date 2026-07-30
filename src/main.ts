import { ActionRegistry } from './engine/actions';
import { SimClock } from './engine/clock';
import { createEngineEventBus } from './engine/events';
import { EntityGraph } from './engine/graph';
import { createRng } from './engine/rng';
import { TicketEngine } from './engine/tickets';
import { createReadOnlyGraphView } from './engine/graph-view';
import { APP_MANIFEST } from './shell/apps';
import type { ShellContext } from './shell/context';
import { Shell } from './shell/shell';
import {
  DEMO_TICKET,
  DEMO_TIER,
  registerDemoActions,
  seedDemoWorld,
  WORLD_IDS,
} from './world/demo-world';

/** Fixed seed: the demo day is replayable. */
const WORLD_SEED = 0x5eed_1c01;

/** Real milliseconds per simulation minute. */
const TICK_INTERVAL_MS = 1_000;

function mountPoint(): HTMLElement {
  const host = document.getElementById('app');

  if (!(host instanceof HTMLElement)) {
    throw new Error('The shell needs a #app mount point in index.html.');
  }

  return host;
}

function boot(): void {
  const bus = createEngineEventBus();
  const graph = new EntityGraph(bus);
  const clock = new SimClock();
  const rng = createRng(WORLD_SEED);
  const registry = new ActionRegistry(graph, rng, clock, DEMO_TIER);
  const tickets = new TicketEngine(graph, clock, bus);

  seedDemoWorld(graph);
  registerDemoActions(registry);
  tickets.spawn(DEMO_TICKET);

  const context: ShellContext = {
    manifest: APP_MANIFEST,
    tier: DEMO_TIER,
    graph: createReadOnlyGraphView(graph),
    clock,
    user: {
      displayName: 'Pat Pending',
      account: 'WORKGRUMBLE\\ppending',
      passwordHint: 'Hint: it is on the sticky note under the keyboard. '
        + 'Any password works; nobody has checked since 1998.',
      node: WORLD_IDS.player,
    },
    dispatch: (id, actor, target, params) => registry.dispatch(
      id,
      actor,
      target,
      params,
    ),
    onWorldChange: (listener) => bus.on('graph:mutated', () => {
      listener();
    }),
  };

  const shell = new Shell(mountPoint(), context);

  bus.on('ticket:resolved', ({ id }) => {
    shell.notify(
      'Ticket resolved',
      `${id === DEMO_TICKET.id ? DEMO_TICKET.flavor.title : id} - closed. `
        + 'Reputation nudged upward by an amount nobody will mention.',
    );
  });
  bus.on('ticket:breached', ({ id }) => {
    shell.notify(
      'SLA breached',
      `${id === DEMO_TICKET.id ? DEMO_TICKET.flavor.title : id} - the timer `
        + 'ran out. An escalation mail is already being drafted about you.',
    );
  });

  shell.start();
  window.setInterval(() => {
    clock.advance(1);
  }, TICK_INTERVAL_MS);
}

boot();
