import type { DispatchResult } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../../world/actions';
import {
  type BoardRow,
  boardEscalation,
  monitorBoard,
} from '../../world/monitoring';
import type { AppStateStore } from '../app-state';
import type { AppDef, AppInstance, GameApi } from './types';
import { element, osButton, withFocusRestored } from './ui';

/**
 * The RMM / monitoring board (0.9.0): the surface the monitoring-only contract
 * is defined by.
 *
 * In 0.8.0 a monitoring-only customer was a wall - you reached to fix and were
 * refused. Here it is a played surface: for every monitoring-only customer the
 * board lists the watched things as rows with a live status read off the estate
 * (`monitorBoard`, world layer), and the player's whole verb set is ACKNOWLEDGE
 * (a seen-flag the shell carries) and ESCALATE (the 0.8.0 escalate verb, which
 * resolves the alert ticket). There is no fix button, by contract and by design
 * - and reaching for a fix anywhere else is still refused by the 0.8.0 scope
 * engine, unchanged.
 *
 * The status is READ, never copied: the board and the alert ticket are two
 * reads of one node and one ticket, so they cannot drift. Slice 3's noise - a
 * transient CPU spike, a flapping check - is mixed in deterministically and
 * clears itself; the skill is triaging it from the backup that genuinely
 * failed. It is not a slack app: watching a board is the job, not a way to
 * dodge it.
 */

/**
 * Marks an alert seen. Shell state, not world: it quiets the board's nag and
 * changes nothing that is TRUE. Dedupes, so acknowledging twice is once. This
 * is the exact call the Acknowledge button makes, exported so a test drives the
 * real path rather than a copy of it.
 */
export function acknowledgeBoardAlert(
  appState: AppStateStore,
  ackId: string,
): void {
  const seen = appState.get().monitor.acknowledged;

  if (seen.includes(ackId)) {
    return;
  }

  appState.patch('monitor', { acknowledged: [...seen, ackId] });
}

/**
 * Escalates a real alert - the contracted move on a monitoring-only account.
 *
 * It reuses the 0.8.0 escalate verb with a complete handoff, so the alert
 * ticket resolves exactly as it does from the terminal or the queue: the board
 * and the ticket agree because it is the same verb writing the same field. A
 * noise row carries no ticket and answers as such, rather than sending a van
 * after a flap. This is the exact call the Escalate button makes.
 */
export function escalateBoardAlert(
  api: Pick<GameApi, 'dispatch' | 'actor'>,
  row: Readonly<BoardRow>,
): DispatchResult {
  if (row.ticket === null) {
    return {
      ok: false,
      reason: 'This one clears itself. Acknowledge it if you like, but there '
        + 'is nothing here to escalate - a flap is not an outage.',
    };
  }

  const handoff = boardEscalation(row);
  return api.dispatch(HELPDESK_ACTIONS.ticketEscalate, api.actor, row.ticket, {
    reported: handoff.reported,
    tried: handoff.tried,
  });
}

const STATUS_LABELS: Readonly<Record<BoardRow['status'], string>> = {
  ok: 'OK',
  warning: 'WARNING',
  failed: 'FAILED',
};

/** One watched thing, drawn as a NOC board draws a row. */
function renderRow(
  row: Readonly<BoardRow>,
  api: GameApi,
  repaint: () => void,
): HTMLElement {
  const item = element('li', 'monitor-row', `monitor-row-${row.id}`);
  item.dataset.status = row.status;
  item.dataset.firing = String(row.firing);
  item.dataset.kind = row.kind;
  item.dataset.escalated = String(row.escalated);
  item.dataset.acknowledged = String(row.acknowledged);

  const head = element('div', 'monitor-row-head');
  const badge = element('span', 'monitor-status', `monitor-status-${row.id}`);
  badge.dataset.status = row.status;
  badge.textContent = STATUS_LABELS[row.status];

  const name = element('strong', 'monitor-row-label');
  name.textContent = row.label;

  const target = element('span', 'monitor-row-target');
  target.textContent = `${row.target} · ${row.check}`;

  head.append(badge, name, target);

  // The state of the alert in words: firing, raised, or the noise clearing.
  const state = element('span', 'monitor-row-state', `monitor-state-${row.id}`);

  if (row.kind === 'noise') {
    state.textContent = 'Firing · clears on its own';
  } else if (row.escalated) {
    state.textContent = 'Raised · with their IT';
  } else if (row.firing) {
    state.textContent = row.acknowledged ? 'Firing · acknowledged' : 'Firing';
  } else {
    state.textContent = 'Healthy · last check just now';
  }

  head.append(state);

  const note = element('p', 'monitor-row-note');
  note.textContent = row.note;

  item.append(head, note);

  // Acknowledge + escalate, and nothing else: a board that is only paid to
  // watch has no third button, and its absence is the mechanic.
  if (row.firing) {
    const actions = element('div', 'app-action-row');

    const ack = osButton(
      row.acknowledged ? 'Acknowledged' : 'Acknowledge',
      `monitor-ack-${row.id}`,
      { compact: true },
    );
    ack.disabled = row.acknowledged;
    ack.title = 'Mark it seen so it stops nagging. Seeing it is not fixing it '
      + '- that is not ours to do.';
    ack.addEventListener('click', () => {
      acknowledgeBoardAlert(api.appState, row.ackId);
      repaint();
    });
    actions.append(ack);

    if (row.kind === 'alert') {
      const escalate = osButton(
        row.escalated ? 'Escalated' : 'Escalate to their IT',
        `monitor-escalate-${row.id}`,
        { compact: true, primary: !row.escalated },
      );
      escalate.disabled = !row.escalatable;
      escalate.title = row.escalated
        ? 'Already raised with the people whose box it is. Twice is just your '
          + 'name on it twice.'
        : 'Raise it to the customer\'s own IT - the contracted move. Monitoring '
          + 'only means notify and escalate, never remediate.';
      escalate.addEventListener('click', () => {
        const outcome = escalateBoardAlert(api, row);

        if (!outcome.ok) {
          api.notify('Not escalated', outcome.reason);
          return;
        }

        api.notify(
          `${row.label} escalated`,
          'Raised to their IT with what the board saw. It is theirs to fix; '
            + 'ours was to see it and say so.',
        );
        repaint();
      });
      actions.append(escalate);
    }

    item.append(actions);
  }

  return item;
}

export const MONITOR_APP: AppDef = {
  id: 'monitor',
  title: 'Monitoring',
  icon: 'icon-monitor',
  tier_required: 1,
  slack: false,
  mount: (host, api: GameApi): AppInstance => {
    const root = element('section', 'app-page monitor-app', 'monitor-app');

    const toolbar = element('div', 'monitor-toolbar');
    const heading = element('span', 'monitor-heading');
    heading.textContent = 'Monitoring board';
    const contract = element('span', 'monitor-contract', 'monitor-contract');
    contract.textContent = 'Eyes on glass. Acknowledge and escalate - no fixing '
      + 'from here, that is the contract.';
    toolbar.append(heading, contract);

    const viewport = element('div', 'monitor-viewport', 'monitor-viewport');
    root.append(toolbar, viewport);

    const render = (): void => {
      withFocusRestored(root, () => {
        const acknowledged = new Set(api.appState.get().monitor.acknowledged);
        const board = monitorBoard(api.graph, acknowledged, api.clock.now());

        const fresh = element('div', 'monitor-board');

        if (board.length === 0) {
          const empty = element('p', 'monitor-empty', 'monitor-empty');
          empty.textContent = 'No monitoring contracts on this desk. The board '
            + 'lights up for a monitoring-only customer; there is none here to '
            + 'watch.';
          fresh.append(empty);
          viewport.replaceChildren(fresh);
          return;
        }

        for (const customer of board) {
          const panel = element(
            'section',
            'monitor-customer',
            `monitor-customer-${customer.id}`,
          );
          const title = element('h2', 'monitor-customer-name');
          title.textContent = customer.name;
          panel.append(title);

          const list = element('ul', 'monitor-rows');

          for (const row of customer.rows) {
            list.append(renderRow(row, api, render));
          }

          panel.append(list);
          fresh.append(panel);
        }

        viewport.replaceChildren(fresh);
      });
    };

    host.replaceChildren(root);
    render();

    // The board moves for two reasons and it listens for both: a minute passing
    // (noise firing or clearing on its own clock) and a world change (an alert
    // node going bad, a ticket being escalated). Neither is a repaint the player
    // asked for, so both go through the same render.
    const unsubscribeTick = api.clock.onTick(() => {
      render();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    const unsubscribeState = api.appState.onReplaced(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeTick();
        unsubscribeWorld();
        unsubscribeState();
        root.remove();
      },
    };
  },
};
