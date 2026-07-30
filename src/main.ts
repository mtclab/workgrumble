import { createReadOnlyGraphView } from './engine/graph-view';
import { APP_MANIFEST } from './shell/apps';
import type { ShellContext } from './shell/context';
import { Shell } from './shell/shell';
import { COMPANY, COMPANY_IDS } from './world/company';
import { createWorldSession } from './world/session';
import { ticketTitle } from './world/tickets';

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
  const { bus, graph, clock, registry, tier } = createWorldSession();

  const context: ShellContext = {
    manifest: APP_MANIFEST,
    tier,
    graph: createReadOnlyGraphView(graph),
    clock,
    user: {
      displayName: 'Pat Pending',
      account: `${COMPANY.domain}\\ppending`,
      passwordHint: 'Hint: it is on the sticky note under the keyboard. '
        + 'Any password works; nobody has checked since 1998.',
      node: COMPANY_IDS.player,
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
      `${ticketTitle(id)} - closed. Reputation nudged upward by an amount `
        + 'nobody will mention.',
    );
  });
  bus.on('ticket:breached', ({ id }) => {
    shell.notify(
      'SLA breached',
      `${ticketTitle(id)} - the timer ran out. An escalation mail is already `
        + 'being drafted about you.',
    );
  });

  shell.start();
  window.setInterval(() => {
    clock.advance(1);
  }, TICK_INTERVAL_MS);
}

boot();
