import { COMPANY } from '../../world/company';
import { DEMO_ACTIONS, WORLD_IDS } from '../../world/demo-world';
import { FIELDS } from '../../world/fields';
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

/** How long the box has been up, in the words a person answers that in. */
function uptime(api: GameApi): string {
  const booted = api.graph.getField(WORLD_IDS.machine, FIELDS.uptimeSince);

  if (typeof booted !== 'number' || !Number.isSafeInteger(booted)
    || booted < 0) {
    // Absent is not "unknown": nothing has rebooted this machine since this
    // log starts, and saying so is truer than a number nobody wrote down.
    return 'Not rebooted since this log starts, and nobody is volunteering';
  }

  const minutes = Math.max(0, api.clock.now() - booted);
  const hours = Math.floor(minutes / 60);

  return `${
    hours > 0 ? `${String(hours)} h ${String(minutes % 60)} min` : `${
      String(minutes)
    } min`
  } (since ${formatSimTime(booted).time})`;
}

/**
 * The About dialog, which is now an About dialog.
 *
 * It used to report "world records: 214 entities" and how many tickets were
 * waiting - debug readouts from the M1 demo, wearing a system-information
 * window. Neither is a thing a workstation knows about itself: the queue owns
 * the ticket count and nothing in this building has ever counted an entity.
 *
 * So every line below is a fact about the MACHINE, read live off the same
 * fields `systeminfo` prints, and the comedy lives in the hardware rather than
 * in invented telemetry - which is where the comedy in this building has
 * always actually been.
 */
const PROPERTY_ROWS: readonly PropertyRow[] = [
  {
    label: 'Version',
    read: () => '4.10.1998 (Service Pack declined, twice)',
  },
  {
    label: 'Registered to',
    read: (api) => `${text(
      api.graph.getField(WORLD_IDS.player, FIELDS.name),
      'Unregistered drone',
    )}, probationary technician`,
  },
  {
    label: 'Workstation',
    read: (api) => text(
      api.graph.getField(WORLD_IDS.machine, FIELDS.hostname),
      'UNNAMED',
    ),
  },
  {
    label: 'Logged on as',
    read: (api) => `${COMPANY.domain.toLowerCase()}\\${text(
      api.graph.getField(WORLD_IDS.account, FIELDS.username),
      'nobody',
    )}`,
  },
  {
    label: 'Processor',
    read: (api) => text(
      api.graph.getField(WORLD_IDS.machine, FIELDS.processor),
      'one, presumably',
    ),
  },
  {
    label: 'Memory',
    read: (api) => text(
      api.graph.getField(WORLD_IDS.machine, FIELDS.memory),
      'as much as it shipped with, which nobody wrote down',
    ),
  },
  {
    label: 'Display',
    read: (api) => text(
      api.graph.getField(WORLD_IDS.machine, FIELDS.resolution),
      'unknown',
    ),
  },
  { label: 'Uptime', read: uptime },
  // The fan stays, because it is hardware and this dialog is about hardware -
  // and because the button below it is the one thing in this game that is
  // fixed by hitting it.
  { label: 'Chassis fan', read: (api) => fanStatus(api) },
  {
    label: 'Last diagnostic',
    read: (api) => {
      const stamp = api.graph.getField(WORLD_IDS.machine, 'last_diagnostic');
      return typeof stamp === 'number'
        ? formatSimTime(stamp).time
        : 'never (bold)';
    },
  },
  {
    label: 'Licence',
    read: () => 'One desk, two apps and a bold amount of confidence',
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
    note.textContent = 'Support contract expired before you were hired. '
      + 'Everything above is read off this workstation; what the queue is '
      + 'doing is the queue\'s business.';

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
        api.actor,
        WORLD_IDS.machine,
        {},
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
        api.actor,
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
