import { loadEngine } from './engine-api';
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

async function boot(): Promise<void> {
  // The engine is wasm now, so it has to be fetched before a world exists.
  // Same-origin, alongside the bundle, and nothing renders until it is here.
  await loadEngine();

  const { engine, tier } = createWorldSession();

  const context: ShellContext = {
    manifest: APP_MANIFEST,
    tier,
    graph: engine.graph,
    clock: {
      now: () => engine.now(),
      onTick: (listener) => engine.onTick(listener),
    },
    user: {
      displayName: 'Pat Pending',
      account: `${COMPANY.domain}\\ppending`,
      passwordHint: 'Hint: it is on the sticky note under the keyboard. '
        + 'Any password works; nobody has checked since 1998.',
      node: COMPANY_IDS.player,
    },
    dispatch: (id, actor, target, params) => engine.dispatch(
      id,
      actor,
      target,
      params,
    ),
    onWorldChange: (listener) => engine.onEvent((event) => {
      if (event.type === 'graph:mutated') {
        listener();
      }
    }),
  };

  const shell = new Shell(mountPoint(), context);

  engine.onEvent((event) => {
    if (event.type === 'ticket:resolved') {
      shell.notify(
        'Ticket resolved',
        `${ticketTitle(event.id)} - closed. Reputation nudged upward by an `
          + 'amount nobody will mention.',
      );
    }

    if (event.type === 'ticket:breached') {
      shell.notify(
        'SLA breached',
        `${ticketTitle(event.id)} - the timer ran out. An escalation mail is `
          + 'already being drafted about you.',
      );
    }
  });

  shell.start();
  window.setInterval(() => {
    engine.advance(1);
  }, TICK_INTERVAL_MS);
}

void boot();
