import type { ReadOnlyGraphNode } from '../../engine-api';
import {
  EVENT_LEVELS,
  type EventLevel,
  isEventLevel,
  type MachineEvent,
  readEventLog,
} from '../../world/events';
import { FIELDS } from '../../world/fields';
import { formatSimTime } from '../clock-format';
import type { AppDef, AppInstance } from './types';
import {
  element,
  nodeKey,
  textValue,
  withFocusRestored,
} from './ui';

/** How each level reads on a row, and how a filter offers it. */
const LEVEL_LABELS: Readonly<Record<EventLevel, string>> = {
  information: 'Information',
  warning: 'Warning',
  error: 'Error',
};

const ALL_LEVELS = 'all';

function hostnameOf(machine: Readonly<ReadOnlyGraphNode>): string {
  return textValue(machine.fields[FIELDS.hostname], nodeKey(machine.id));
}

/**
 * Event Viewer - the diagnosis surface.
 *
 * Every box in this building has been writing down what happened to it the
 * whole time somebody has been describing it to you over the phone. This is
 * where that gets read: time, level, source, event id and the sentence, per
 * machine, newest last so a pattern reads down the page the way a log does.
 *
 * It writes nothing. There is no button in here that fixes anything, and that
 * is the point - it is the tool that tells you WHICH thing to fix, and the
 * only tool in the estate that can tell you a fault has a timetable.
 */
export const EVENTS_APP: AppDef = {
  id: 'events',
  title: 'Event Viewer',
  icon: 'icon-events',
  tier_required: 1,
  slack: false,
  mount: (host, api): AppInstance => {
    let selectedId: string | null = null;
    let level: EventLevel | typeof ALL_LEVELS = ALL_LEVELS;

    const root = element('section', 'app-page events-app', 'events-app');

    const toolbar = element('div', 'events-toolbar');
    const filterLabel = element('label', 'events-filter-label');
    const filterText = element('span');
    filterText.textContent = 'Level';
    const filter = element('select', 'os-select', 'events-filter');
    filter.setAttribute('aria-label', 'Filter by level');

    const everything = element('option');
    everything.value = ALL_LEVELS;
    everything.textContent = 'Everything';
    filter.append(everything);

    for (const option of EVENT_LEVELS) {
      const entry = element('option');
      entry.value = option;
      entry.textContent = LEVEL_LABELS[option];
      filter.append(entry);
    }

    filterLabel.append(filterText, filter);
    const count = element('span', 'events-count', 'events-count');
    const note = element('span', 'events-note');
    note.textContent = 'It wrote all this down while nobody was reading.';
    toolbar.append(filterLabel, count, note);

    const machineList = element('ul', 'events-machines', 'events-machines');
    const table = element('div', 'events-table', 'events-table');
    const columns = element('div', 'events-columns');
    columns.append(machineList, table);
    root.append(toolbar, columns);

    const machines = (): readonly ReadOnlyGraphNode[] => api.graph
      .nodesOfKind('machine');

    const logFor = (machineId: string): readonly MachineEvent[] => readEventLog(
      api.graph.getField(machineId, FIELDS.eventLog),
    );

    const visible = (log: readonly MachineEvent[]): readonly MachineEvent[] => (
      level === ALL_LEVELS
        ? log
        : log.filter((entry) => entry.level === level)
    );

    const renderMachines = (nodes: readonly ReadOnlyGraphNode[]): void => {
      machineList.replaceChildren();

      for (const machine of nodes) {
        const item = element('li');
        const row = element(
          'button',
          'events-machine',
          `events-machine-${nodeKey(machine.id)}`,
        );
        row.type = 'button';
        row.dataset.selected = String(machine.id === selectedId);

        const name = element('strong');
        name.textContent = hostnameOf(machine);
        const summary = element('span', 'events-machine-meta');
        const log = logFor(machine.id);
        const worst = log.some((entry) => entry.level === 'error')
          ? 'error'
          : log.some((entry) => entry.level === 'warning')
            ? 'warning'
            : 'information';
        // The worst thing in the log, on the row: a list of machines that all
        // look identical is a list nobody reads twice.
        row.dataset.worst = log.length === 0 ? 'none' : worst;
        summary.textContent = log.length === 0
          ? 'Nothing logged'
          : `${String(log.length)} event(s)`;
        row.append(name, summary);

        row.addEventListener('click', () => {
          selectedId = machine.id;
          render();
        });
        item.append(row);
        machineList.append(item);
      }
    };

    const renderTable = (machine: ReadOnlyGraphNode | undefined): void => {
      table.replaceChildren();

      if (machine === undefined) {
        const empty = element('p', 'events-placeholder', 'events-empty');
        empty.textContent = 'There are no machines in this estate, which is '
          + 'either a very good day or a very bad one.';
        table.append(empty);
        count.textContent = '';
        return;
      }

      const log = logFor(machine.id);
      const rows = visible(log);
      count.textContent = `${String(rows.length)} of ${
        String(log.length)
      } event(s) on ${hostnameOf(machine)}`;

      const header = element('div', 'events-row events-head');

      for (const heading of ['Time', 'Level', 'Source', 'Event', 'Message']) {
        const cell = element('span');
        cell.textContent = heading;
        header.append(cell);
      }

      table.append(header);

      if (rows.length === 0) {
        const empty = element('p', 'events-placeholder', 'events-log-empty');
        empty.textContent = log.length === 0
          ? `${hostnameOf(machine)} has nothing to report. Either it has been `
            + 'behaving, or nobody has asked it to do anything yet.'
          : `Nothing at that level on ${hostnameOf(machine)}. The quiet ones `
            + 'are usually where it started.';
        table.append(empty);
        return;
      }

      for (const [index, entry] of rows.entries()) {
        const row = element(
          'div',
          'events-row',
          `events-row-${String(index)}`,
        );
        row.dataset.level = entry.level;
        row.dataset.event = String(entry.id);

        const time = element('span', 'events-time');
        time.textContent = formatSimTime(entry.tick).time;
        const day = element('span', 'events-day');
        day.textContent = formatSimTime(entry.tick).day;
        time.append(day);

        const levelCell = element('span', 'events-level');
        levelCell.textContent = LEVEL_LABELS[entry.level];
        const source = element('span', 'events-source');
        source.textContent = entry.source;
        const id = element('span', 'events-id');
        id.textContent = String(entry.id);
        const message = element('span', 'events-message');
        message.textContent = entry.message;

        row.append(time, levelCell, source, id, message);
        table.append(row);
      }
    };

    const render = (): void => {
      withFocusRestored(root, () => {
        const nodes = machines();

        if (
          selectedId === null
          || !nodes.some((machine) => machine.id === selectedId)
        ) {
          selectedId = nodes[0]?.id ?? null;
        }

        renderMachines(nodes);
        renderTable(nodes.find((machine) => machine.id === selectedId));
      });
    };

    filter.addEventListener('change', () => {
      level = isEventLevel(filter.value) ? filter.value : ALL_LEVELS;
      render();
    });

    host.replaceChildren(root);
    render();

    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });

    return {
      receiveIntent: (intent): void => {
        // The same intent Remote Assist takes, because "look at this box" is
        // one request and the player should not have to find it twice.
        if (intent.kind !== 'remote-machine') {
          return;
        }

        if (api.graph.getNode(intent.id)?.kind === 'machine') {
          selectedId = intent.id;
          render();
        }
      },
      unmount: (): void => {
        unsubscribeWorld();
        root.remove();
      },
    };
  },
};
