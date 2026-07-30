import { NODE_KINDS } from '../../engine/schema';
import { DEMO_ACTIONS, WORLD_IDS } from '../../world/demo-world';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import type { AppDef, GameApi } from './types';

interface PropertyRow {
  readonly label: string;
  read(api: GameApi): string;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function fanStatus(api: GameApi): string {
  const status = api.graph.getField(WORLD_IDS.fan, 'status');
  return text(status, 'unknown');
}

function worldRecordCount(api: GameApi): number {
  return NODE_KINDS.reduce(
    (total, kind) => total + api.graph.nodesOfKind(kind).length,
    0,
  );
}

function openTicketCount(api: GameApi): number {
  return api.graph.nodesOfKind('ticket').filter(
    (ticket) => ticket.fields.state === 'open'
      || ticket.fields.state === 'waiting_on_user',
  ).length;
}

const PROPERTY_ROWS: readonly PropertyRow[] = [
  {
    label: 'Registered to',
    read: (api) => `${text(
      api.graph.getField(WORLD_IDS.player, 'name'),
      'Unregistered drone',
    )}, probationary technician`,
  },
  {
    label: 'Workstation',
    read: (api) => text(
      api.graph.getField(WORLD_IDS.machine, 'hostname'),
      'UNNAMED',
    ),
  },
  {
    label: 'Display',
    read: (api) => text(
      api.graph.getField(WORLD_IDS.machine, 'resolution'),
      'unknown',
    ),
  },
  { label: 'Chassis fan', read: (api) => fanStatus(api) },
  {
    label: 'World records',
    read: (api) => `${String(worldRecordCount(api))} entities`,
  },
  {
    label: 'Tickets awaiting you',
    read: (api) => String(openTicketCount(api)),
  },
  {
    label: 'Shift clock',
    read: (api) => formatSimTime(api.clock.now()).time,
  },
  {
    label: 'Last diagnostic',
    read: (api) => {
      const stamp = api.graph.getField(WORLD_IDS.machine, 'last_diagnostic');
      return typeof stamp === 'number'
        ? formatSimTime(stamp).time
        : 'never (bold)';
    },
  },
];

/**
 * System-information gag page. Everything it prints is read live from the
 * world graph through the read-only view, and both buttons reach the world
 * only by dispatching registered actions.
 */
export const ABOUT_APP: AppDef = {
  id: 'about',
  title: 'About This Workstation',
  icon: 'icon-about',
  tier_required: 0,
  slack: false,
  mount: (host, api) => {
    const root = document.createElement('section');
    root.className = 'app-page about-app';
    root.dataset.testid = 'about-app';

    const masthead = document.createElement('header');
    masthead.className = 'about-masthead';
    const mark = document.createElement('span');
    mark.className = 'about-mark';
    const markIcon = createIcon('icon-about');
    markIcon.classList.add('svg-icon-lg');
    mark.append(markIcon);
    const headingGroup = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = 'DeskPro WorkGroup 98¾';
    const subheading = document.createElement('p');
    subheading.textContent = 'Professional-ish edition · build 0001.BEIGE';
    headingGroup.append(heading, subheading);
    masthead.append(mark, headingGroup);

    const status = document.createElement('div');
    status.className = 'about-status';
    status.dataset.testid = 'about-status';
    status.append(createIcon('icon-check'));
    const statusCopy = document.createElement('div');
    statusCopy.className = 'about-status-copy';
    const statusHeading = document.createElement('strong');
    const statusDetail = document.createElement('span');
    statusCopy.append(statusHeading, statusDetail);
    status.append(statusCopy);

    const properties = document.createElement('dl');
    properties.className = 'about-properties';
    const values = PROPERTY_ROWS.map((row) => {
      const term = document.createElement('dt');
      term.textContent = row.label;
      const value = document.createElement('dd');
      value.dataset.testid = `about-value-${row.label
        .toLowerCase()
        .replaceAll(' ', '-')}`;
      properties.append(term, value);
      return { row, value };
    });

    const note = document.createElement('p');
    note.className = 'about-note';
    note.textContent = 'Licensed for one desk, two apps and a bold amount of '
      + 'confidence. Support contract expired before you were hired.';

    const actions = document.createElement('div');
    actions.className = 'app-action-row';
    const diagnostics = document.createElement('button');
    diagnostics.type = 'button';
    diagnostics.className = 'os-button os-button-primary';
    diagnostics.dataset.testid = 'about-run-diagnostics';
    diagnostics.textContent = 'Run diagnostics';
    const percussion = document.createElement('button');
    percussion.type = 'button';
    percussion.className = 'os-button';
    percussion.dataset.testid = 'about-reseat-fan';
    percussion.textContent = 'Percussive maintenance';
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'os-button';
    refresh.dataset.testid = 'about-refresh';
    refresh.textContent = 'Refresh';
    const openBubbles = document.createElement('button');
    openBubbles.type = 'button';
    openBubbles.className = 'os-button';
    openBubbles.dataset.testid = 'about-open-bubbles';
    openBubbles.textContent = 'Open Bubble Break';
    actions.append(diagnostics, percussion, refresh, openBubbles);

    const render = (): void => {
      const wedged = fanStatus(api) !== 'running';
      statusHeading.textContent = wedged
        ? 'System is technically operational'
        : 'System is operating within its modest means';
      statusDetail.textContent = wedged
        ? 'The chassis fan is wedged. It is coping. You are coping.'
        : 'No smoke detected in the last simulation tick.';

      for (const { row, value } of values) {
        value.textContent = row.read(api);
      }
    };

    const onDiagnostics = (): void => {
      const result = api.dispatch(
        DEMO_ACTIONS.diagnostics,
        WORLD_IDS.player,
        WORLD_IDS.machine,
        { tick: api.clock.now() },
      );
      render();
      api.notify(
        'Diagnostics complete',
        result.ok
          ? `Report filed. Chassis fan reads "${fanStatus(api)}". `
            + 'Everything else is load-bearing beige.'
          : result.reason,
      );
    };
    const onPercussion = (): void => {
      const result = api.dispatch(
        DEMO_ACTIONS.reseatFan,
        WORLD_IDS.player,
        WORLD_IDS.fan,
        {},
      );
      render();
      api.notify(
        result.ok ? 'Fan reseated' : 'Maintenance refused',
        result.ok
          ? 'One firm tap. The hornet has left the biscuit tin.'
          : result.reason,
      );
    };
    const onRefresh = (): void => {
      render();
    };
    const onOpenBubbles = (): void => {
      api.openApp('bubbles');
    };

    diagnostics.addEventListener('click', onDiagnostics);
    percussion.addEventListener('click', onPercussion);
    refresh.addEventListener('click', onRefresh);
    openBubbles.addEventListener('click', onOpenBubbles);

    root.append(masthead, status, properties, note, actions);
    host.replaceChildren(root);
    render();

    return {
      unmount: (): void => {
        diagnostics.removeEventListener('click', onDiagnostics);
        percussion.removeEventListener('click', onPercussion);
        refresh.removeEventListener('click', onRefresh);
        openBubbles.removeEventListener('click', onOpenBubbles);
        root.remove();
      },
    };
  },
};
