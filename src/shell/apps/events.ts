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
  type KeyedRow,
  KeyedRows,
  nodeKey,
  setFlag,
  setText,
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

/** One machine on the left-hand list, as data. */
interface MachineRow {
  readonly id: string;
  readonly key: string;
  readonly hostname: string;
  readonly summary: string;
  readonly worst: string;
  readonly selected: boolean;
}

/** One line of the log, as data. The table is append-only, so a row keeps its
 * element for as long as the machine keeps writing underneath it. */
interface LogRow {
  readonly key: string;
  readonly time: string;
  readonly day: string;
  readonly level: EventLevel;
  readonly levelLabel: string;
  readonly source: string;
  readonly id: string;
  readonly message: string;
}

function worstLevel(log: readonly MachineEvent[]): string {
  if (log.length === 0) {
    return 'none';
  }

  if (log.some((entry) => entry.level === 'error')) {
    return 'error';
  }

  return log.some((entry) => entry.level === 'warning')
    ? 'warning'
    : 'information';
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

    const machineRow = (
      first: Readonly<MachineRow>,
    ): KeyedRow<MachineRow, HTMLLIElement> => {
      const id = first.id;
      const item = element('li');
      const row = element(
        'button',
        'events-machine',
        `events-machine-${first.key}`,
      );
      row.type = 'button';
      const name = element('strong');
      const summary = element('span', 'events-machine-meta');
      row.append(name, summary);

      row.addEventListener('click', () => {
        selectedId = id;
        render();
      });
      item.append(row);

      return {
        element: item,
        update: (next: Readonly<MachineRow>): void => {
          setFlag(row, 'selected', String(next.selected));
          // The worst thing in the log, on the row: a list of machines that
          // all look identical is a list nobody reads twice.
          setFlag(row, 'worst', next.worst);
          setText(name, next.hostname);
          setText(summary, next.summary);
        },
      };
    };

    const machineRows = new KeyedRows<MachineRow, HTMLLIElement>(
      machineList,
      (model) => model.id,
      machineRow,
    );

    const renderMachines = (nodes: readonly ReadOnlyGraphNode[]): void => {
      machineRows.sync(nodes.map((machine) => {
        const log = logFor(machine.id);

        return {
          id: machine.id,
          key: nodeKey(machine.id),
          hostname: hostnameOf(machine),
          summary: log.length === 0
            ? 'Nothing logged'
            : `${String(log.length)} event(s)`,
          worst: worstLevel(log),
          selected: machine.id === selectedId,
        };
      }));
    };

    // Built once. The header is a fixed sticky row, the two placeholders are
    // copy, and the log itself is keyed by position - which is what a log is:
    // a list that only ever grows at the bottom.
    const header = element('div', 'events-row events-head');

    for (const heading of ['Time', 'Level', 'Source', 'Event', 'Message']) {
      const cell = element('span');
      cell.textContent = heading;
      header.append(cell);
    }

    const noMachines = element('p', 'events-placeholder', 'events-empty');
    noMachines.textContent = 'There are no machines in this estate, which is '
      + 'either a very good day or a very bad one.';
    const noEntries = element('p', 'events-placeholder', 'events-log-empty');

    const logRow = (
      first: Readonly<LogRow>,
    ): KeyedRow<LogRow, HTMLDivElement> => {
      const row = element('div', 'events-row', `events-row-${first.key}`);
      const time = element('span', 'events-time');
      const clock = element('span');
      const day = element('span', 'events-day');
      time.append(clock, day);
      const levelCell = element('span', 'events-level');
      const source = element('span', 'events-source');
      const id = element('span', 'events-id');
      const message = element('span', 'events-message');
      row.append(time, levelCell, source, id, message);

      return {
        element: row,
        update: (next: Readonly<LogRow>): void => {
          setFlag(row, 'level', next.level);
          setFlag(row, 'event', next.id);
          setText(clock, next.time);
          setText(day, next.day);
          setText(levelCell, next.levelLabel);
          setText(source, next.source);
          setText(id, next.id);
          setText(message, next.message);
        },
      };
    };

    const logRows = new KeyedRows<LogRow, HTMLDivElement>(
      // The header never moves and is never rebuilt: it is put back in front
      // of whatever the list is showing, as the same element.
      { replaceChildren: (...rows) => { table.replaceChildren(header, ...rows); } },
      (model) => model.key,
      logRow,
    );

    const renderTable = (machine: ReadOnlyGraphNode | undefined): void => {
      if (machine === undefined) {
        count.textContent = '';
        logRows.sync([], noMachines);
        return;
      }

      const log = logFor(machine.id);
      const rows = visible(log);
      count.textContent = `${String(rows.length)} of ${
        String(log.length)
      } event(s) on ${hostnameOf(machine)}`;
      noEntries.textContent = log.length === 0
        ? `${hostnameOf(machine)} has nothing to report. Either it has been `
          + 'behaving, or nobody has asked it to do anything yet.'
        : `Nothing at that level on ${hostnameOf(machine)}. The quiet ones `
          + 'are usually where it started.';

      logRows.sync(
        rows.map((entry, index) => ({
          key: String(index),
          time: formatSimTime(entry.tick).time,
          day: formatSimTime(entry.tick).day,
          level: entry.level,
          levelLabel: LEVEL_LABELS[entry.level],
          source: entry.source,
          id: String(entry.id),
          message: entry.message,
        })),
        noEntries,
      );
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
