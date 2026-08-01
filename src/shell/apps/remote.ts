import type { FieldValue, ReadOnlyGraphNode } from '../../engine-api';
import { FULL_BATTERY, HELPDESK_ACTIONS } from '../../world/actions';
import {
  DEVICE_TYPES,
  FIELDS,
  isRestartable,
  isRotation,
  isService,
  type Rotation,
  ROTATIONS,
  SERVICE_CLASSES,
  serviceClassOf,
  SERVICE_STATUS,
  STARTUP_TYPE_LABELS,
  type StartupType,
  STARTUP_TYPES,
  startupTypeOf,
} from '../../world/fields';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import { programImage } from './processes';
import type { AppDef, AppInstance, GameApi } from './types';
import {
  definitionRow,
  element,
  type KeyedRow,
  KeyedRows,
  nodeKey,
  osButton,
  outcomeLine,
  refusalLine,
  resolveSelection,
  setAvailability,
  setFlag,
  setText,
  textValue,
  withFocusRestored,
} from './ui';

export function machineKey(id: string): string {
  return nodeKey(id);
}

function hostnameOf(machine: Readonly<ReadOnlyGraphNode>): string {
  return textValue(machine.fields[FIELDS.hostname], machineKey(machine.id));
}

function rotationOf(machine: Readonly<ReadOnlyGraphNode>): Rotation {
  const rotation = machine.fields[FIELDS.displayRotation];
  return isRotation(rotation) ? rotation : 0;
}

/** One workstation on the left-hand list, as data. */
interface MachineRow {
  readonly id: string;
  readonly key: string;
  readonly hostname: string;
  readonly owner: string;
  readonly sideways: boolean;
  readonly selected: boolean;
}

const STATUS_LABELS: Readonly<Record<string, string>> = {
  [SERVICE_STATUS.running]: 'Running',
  [SERVICE_STATUS.stopped]: 'Stopped',
  [SERVICE_STATUS.wedged]: 'Not responding',
};

/** What a column says when the machine has no answer for it. */
const NOTHING = '-';

/**
 * Why this service will not be restarted, said before the click, in the same
 * terms `helpdesk.service.restart` would refuse it in afterwards.
 *
 * Five reasons and all five are true of the thing they are about: three about
 * WHAT it is, one about what the next boot intends, one about what it is doing
 * now. The order matches the engine's guards, because a button that gives a
 * different reason from the world is a button that is guessing.
 */
function restartRefusal(
  fields: Readonly<Record<string, FieldValue>>,
  status: string,
  startup: StartupType | null,
  backlog: number | null,
): string | null {
  switch (serviceClassOf(fields[FIELDS.serviceClass])) {
    case SERVICE_CLASSES.hardware:
      return 'This is hardware with a status light, not software. You cannot '
        + 'turn a fan off and on again. Well. You can. It will not help.';
    case SERVICE_CLASSES.appliance:
      return 'This is somebody else\'s box answering over the wire, not a '
        + 'service on that machine. There is nothing here to stop and nothing '
        + 'to start.';
    case SERVICE_CLASSES.system:
      return 'The service manager will not take a stop control for this one: '
        + 'half of what is running on that box is holding it open.';
    default:
      break;
  }

  if (startup === STARTUP_TYPES.disabled) {
    return 'This one is set to Disabled. Nothing starts it while it is - not '
      + 'this button, not a reboot - and the fix is its startup type.';
  }

  if (status === SERVICE_STATUS.running) {
    return 'This one is running. Restarting a healthy service in front of the '
      + 'user is how a small ticket becomes a big one.';
  }

  return backlog === null
    ? null
    : `${String(backlog)} job(s) are still queued behind it. It will just `
      + 'choke on the same job again. Clearing that queue stops this service '
      + 'and drops the files; this button is the step after.';
}

/** The workstation signed out to the person this session dispatches as. */
function ownMachineId(api: Pick<GameApi, 'graph' | 'actor'>): string | null {
  return api.graph
    .neighbors(api.actor, { direction: 'out', edgeKind: 'owns' })
    .find((node) => node.kind === 'machine')
    ?.id ?? null;
}

function ownerOf(
  api: Pick<GameApi, 'graph'>,
  machine: Readonly<ReadOnlyGraphNode>,
): ReadOnlyGraphNode | undefined {
  return api.graph
    .neighbors(machine.id, { direction: 'in', edgeKind: 'owns' })
    .find((node) => node.kind === 'person');
}

/** What runs on a box, in the order a services window lists it: by name. */
function servicesOn(
  api: Pick<GameApi, 'graph'>,
  machine: Readonly<ReadOnlyGraphNode>,
): readonly ReadOnlyGraphNode[] {
  return api.graph
    .neighbors(machine.id, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'service')
    .sort((left, right) => textValue(left.fields[FIELDS.name], left.id)
      .localeCompare(textValue(right.fields[FIELDS.name], right.id)));
}

function devicesOn(
  api: Pick<GameApi, 'graph'>,
  machine: Readonly<ReadOnlyGraphNode>,
): readonly ReadOnlyGraphNode[] {
  return api.graph
    .neighbors(machine.id, { direction: 'in', edgeKind: 'connected_to' })
    .filter((node) => node.kind === 'device');
}

/**
 * The service on the other end of a printer's wire, if the estate models one.
 *
 * Written down as an edge rather than guessed from "whatever else is plugged
 * into that box": the VPN concentrator shares the print server and has nothing
 * to do with anybody's backlog.
 */
function spoolerFeeding(
  api: Pick<GameApi, 'graph'>,
  printer: Readonly<ReadOnlyGraphNode>,
): string | null {
  return api.graph
    .neighbors(printer.id, { direction: 'in', edgeKind: 'connected_to' })
    .find((node) => node.kind === 'service')
    ?.id ?? null;
}

export interface RemoteService {
  readonly id: string;
  readonly name: string;
  /** What the machine calls it, or a dash for the things it has never heard of. */
  readonly service: string;
  readonly status: string;
  readonly statusLabel: string;
  /** Automatic, Automatic (Delayed Start), Manual, Disabled - or a dash. */
  readonly startupLabel: string;
  /**
   * Whether this belongs in a SERVICES list at all. A fan and a licence pool
   * report a status and are not services, so they sit under the table rather
   * than in it - which is the difference between a list a player can trust and
   * a list with a lump of spinning plastic in the middle of it.
   */
  readonly listed: boolean;
  readonly restartable: boolean;
  /** Jobs still queued on whatever it feeds, or nothing waiting. */
  readonly backlog: number | null;
  /**
   * Why the restart button is not a button, in the same terms the engine would
   * refuse it in - or null when it is one.
   *
   * It is computed here, in the model, rather than in the row that draws it:
   * a control disabled for a reason nobody can read is the dead end the house
   * rules forbid, and this is the sentence the tooltip carries.
   */
  readonly blocked: string | null;
}

/** One window somebody has open, seen from outside their machine. */
export interface RemoteProgram {
  readonly key: string;
  readonly image: string;
  readonly title: string;
  readonly minimized: boolean;
}

export interface RemoteDevice {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly type: string;
  readonly printer: boolean;
  readonly queue: number;
  /**
   * The service that owns this printer's spool files, when the estate has one
   * written down. Emptying the queue means stopping it, so the control has to
   * be able to name it.
   */
  readonly spooler: string | null;
  readonly battery: number | null;
  readonly powered: boolean;
  readonly wedged: boolean;
}

export interface RemoteSessionView {
  readonly picked: Rotation | null;
  readonly outcome: string | null;
  readonly refusal: string | null;
}

export interface RemoteSession {
  readonly id: string;
  readonly hostname: string;
  readonly owner: string;
  readonly rotation: Rotation;
  /** What the dropdown is standing on, which is upright until it is moved. */
  readonly picked: Rotation;
  readonly resolution: string;
  readonly booted: string;
  readonly updates: boolean;
  /** Whether this is the machine signed out to the player. */
  readonly own: boolean;
  readonly services: readonly RemoteService[];
  /**
   * What is OPEN on that box, when it is a box this session can see the
   * windows of - which is the player's own, and only the player's own.
   *
   * Everybody else's taskbar is empty here rather than furnished with invented
   * windows: this game does not simulate what Ada has open, and a parody
   * desktop that made something up would be teaching the player to read a
   * screen that cannot be read.
   */
  readonly programs: readonly RemoteProgram[];
  readonly devices: readonly RemoteDevice[];
  readonly outcome: string | null;
  readonly refusal: string | null;
}

/**
 * Their screen and everything on it, as data.
 *
 * The session pane reads this and reads nothing else, which is what makes it
 * comparable: two of these being equal is the whole reason the pane - and the
 * rotation dropdown in it - can be left standing through a repaint.
 *
 * The remote taskbar CLOCK is deliberately absent. It is the one thing in that
 * window which moves with the minute, and it is written straight into its own
 * element on every tick; putting it here would make every minute a rebuild,
 * which is the bug this model exists to fix.
 */
export function remoteSession(
  api: Pick<GameApi, 'graph' | 'appState' | 'actor'>,
  machine: Readonly<ReadOnlyGraphNode>,
  view: Readonly<RemoteSessionView>,
): RemoteSession {
  // Guarded, not merely typed: `formatSimTime` throws on a negative or
  // fractional tick, and the render this feeds has run inside the clock
  // listener, where one throw would stop every other tick listener with it.
  const uptime = machine.fields[FIELDS.uptimeSince];
  const ownDesk = ownMachineId(api) === machine.id;

  return {
    id: machine.id,
    hostname: hostnameOf(machine),
    owner: textValue(ownerOf(api, machine)?.fields[FIELDS.name], 'Unassigned'),
    rotation: rotationOf(machine),
    picked: view.picked ?? 0,
    resolution: textValue(
      machine.fields[FIELDS.resolution],
      'Whatever the driver felt like',
    ),
    booted: typeof uptime === 'number'
      && Number.isSafeInteger(uptime)
      && uptime >= 0
      ? formatSimTime(uptime).time
      : 'Some time before the merger',
    updates: machine.fields[FIELDS.pendingUpdates] === true,
    own: ownDesk,
    services: servicesOn(api, machine).map((service) => {
      const status = textValue(service.fields[FIELDS.status], 'unknown');
      // Whatever this service feeds, and whether it is still backed up:
      // starting it in front of a full queue only jams it again.
      const backlog = api.graph
        .neighbors(service.id, { direction: 'out', edgeKind: 'connected_to' })
        .map((device) => device.fields[FIELDS.queueLen])
        .find((queued) => typeof queued === 'number' && queued > 0);

      const startup = startupTypeOf(service.fields[FIELDS.startupType]);
      const queued = typeof backlog === 'number' ? backlog : null;

      return {
        id: service.id,
        name: textValue(service.fields[FIELDS.name], service.id),
        service: textValue(service.fields[FIELDS.serviceName], NOTHING),
        status,
        statusLabel: STATUS_LABELS[status] ?? status,
        startupLabel: startup === null
          ? NOTHING
          : STARTUP_TYPE_LABELS[startup],
        listed: isService(service.fields[FIELDS.serviceClass]),
        restartable: isRestartable(service.fields[FIELDS.serviceClass]),
        backlog: queued,
        blocked: restartRefusal(service.fields, status, startup, queued),
      };
    }),
    programs: ownDesk
      ? api.appState.get().windows.open.map((window) => {
        const program = programImage(window.appId);

        return {
          key: window.appId,
          image: program.image,
          title: program.title,
          minimized: window.minimized,
        };
      })
      : [],
    devices: devicesOn(api, machine).map((device) => {
      const queue = device.fields[FIELDS.queueLen];
      const battery = device.fields[FIELDS.batteryPct];

      return {
        id: device.id,
        key: nodeKey(device.id),
        name: textValue(device.fields[FIELDS.name], device.id),
        type: textValue(device.fields[FIELDS.type], 'device'),
        printer: device.fields[FIELDS.type] === DEVICE_TYPES.printer,
        queue: typeof queue === 'number' ? queue : 0,
        spooler: spoolerFeeding(api, device),
        battery: typeof battery === 'number' ? battery : null,
        powered: device.fields[FIELDS.powered] === true,
        wedged: device.fields[FIELDS.wedged] === true,
      };
    }),
    outcome: view.outcome,
    refusal: view.refusal,
  };
}

/**
 * Remote Assist - the signature tool.
 *
 * The target machine's screen is drawn from its own graph state, inside this
 * window: the rotation field is a real CSS transform on the remote viewport,
 * so a "hacked" sideways screen is sideways in front of the player, and the
 * services on that box sit in its taskbar with their real status.
 *
 * There is no second window manager in there. It is a static-layout parody
 * desktop, and every control on it dispatches the same registered actions the
 * terminal and the directory use - one verb set, three skins.
 */
export const REMOTE_APP: AppDef = {
  id: 'remote',
  title: 'Remote Assist',
  icon: 'icon-remote',
  tier_required: 1,
  slack: false,
  mount: (host, api): AppInstance => {
    let selectedId: string | null = null;
    let pickedRotation: Rotation | null = null;
    let refusal: string | null = null;
    let outcome: string | null = null;
    /**
     * The clock on the remote taskbar. It is repainted on its own every tick
     * rather than through a full repaint: rebuilding the session once a
     * second would slam the rotation dropdown shut in the player's hand.
     */
    let remoteTray: HTMLElement | null = null;

    const root = element('section', 'app-page remote-app', 'remote-app');

    const toolbar = element('div', 'remote-toolbar');
    const summary = element('span', 'remote-summary', 'remote-summary');
    const note = element('span', 'remote-note');
    note.textContent = 'They can see everything you do. Behave accordingly.';
    toolbar.append(summary, note);

    const machineList = element('ul', 'remote-machines', 'remote-machines');
    const session = element('section', 'remote-session', 'remote-session');
    const columns = element('div', 'remote-columns');
    columns.append(machineList, session);
    root.append(toolbar, columns);

    const machines = (): readonly ReadOnlyGraphNode[] => api.graph
      .nodesOfKind('machine');

    const run = (
      action: string,
      target: string,
      params: Record<string, string | number> = {},
      success = 'Done.',
    ): void => {
      const result = api.dispatch(action, api.actor, target, params);
      refusal = result.ok ? null : result.reason;
      outcome = result.ok ? success : null;
      render();
    };

    const machineRow = (
      first: Readonly<MachineRow>,
    ): KeyedRow<MachineRow, HTMLLIElement> => {
      const id = first.id;
      const item = element('li');
      const row = element('button', 'remote-machine', `remote-machine-${first.key}`);
      row.type = 'button';
      const name = element('strong');
      const owner = element('span', 'remote-machine-owner');
      const tilted = element('span', 'remote-machine-flag');
      tilted.textContent = 'Sideways';
      row.append(name, owner, tilted);

      row.addEventListener('click', () => {
        selectMachine(id);
        render();
      });
      item.append(row);

      return {
        element: item,
        update: (next: Readonly<MachineRow>): void => {
          setFlag(row, 'selected', String(next.selected));
          setText(name, next.hostname);
          setText(owner, next.owner);
          tilted.hidden = !next.sideways;
        },
      };
    };

    const machineRows = new KeyedRows<MachineRow, HTMLLIElement>(
      machineList,
      (model) => model.id,
      machineRow,
    );

    const renderMachines = (nodes: readonly ReadOnlyGraphNode[]): void => {
      machineRows.sync(nodes.map((machine) => ({
        id: machine.id,
        key: machineKey(machine.id),
        hostname: hostnameOf(machine),
        owner: textValue(
          ownerOf(api, machine)?.fields[FIELDS.name],
          'Nobody admits to it',
        ),
        sideways: rotationOf(machine) !== 0,
        selected: machine.id === selectedId,
      })));
    };

    /** The parody desktop: their screen, drawn from their machine's state. */
    const renderScreen = (model: Readonly<RemoteSession>): HTMLElement => {
      const rotation = model.rotation;
      const frame = element('div', 'remote-frame', 'remote-frame');
      const viewport = element('div', 'remote-viewport', 'remote-viewport');
      viewport.dataset.rotation = String(rotation);
      viewport.style.setProperty('--remote-rotation', `${String(rotation)}deg`);

      const wallpaper = element('div', 'remote-wallpaper');
      const icons = element('ul', 'remote-desktop-icons');

      for (const label of ['My Documents', 'Q4 (final) (final2)', 'Recycle']) {
        const icon = element('li', 'remote-desktop-icon');
        icon.textContent = label;
        icons.append(icon);
      }

      const dialog = element('div', 'remote-dialog', 'remote-dialog');
      const dialogTitle = element('strong');
      dialogTitle.textContent = model.updates
        ? 'Updates are ready when you are'
        : 'System Notice';
      const dialogBody = element('p');
      dialogBody.textContent = model.updates
        ? 'Your workstation will restart at a time chosen by somebody who '
          + 'does not use it.'
        : 'Nothing needs your attention, which is itself suspicious.';
      dialog.append(dialogTitle, dialogBody);

      wallpaper.append(icons, dialog);

      // The taskbar is a taskbar: what is OPEN on that machine, which is a
      // question this session can only honestly answer about the player's own
      // box. The services used to sit here as chips, which read as "the print
      // spooler is a window Ada has open" - and there is now a services panel
      // below with the columns a services list actually has.
      const taskbar = element('div', 'remote-taskbar', 'remote-taskbar');
      const start = element('span', 'remote-start');
      start.textContent = 'Start';
      taskbar.append(start);

      for (const program of model.programs) {
        const button = element(
          'span',
          'remote-program',
          `remote-program-${program.key}`,
        );
        button.dataset.minimized = String(program.minimized);
        button.textContent = program.title;
        button.title = `${program.image}${
          program.minimized ? ', minimised - which is still running' : ''
        }`;
        taskbar.append(button);
      }

      if (model.programs.length === 0) {
        const none = element('span', 'remote-taskbar-empty');
        none.textContent = model.own
          ? 'Nothing open. Suspicious in itself.'
          : 'This session cannot see what they have open. Only the boss can '
            + 'do that, and he does it by walking.';
        taskbar.append(none);
      }

      const tray = element('span', 'remote-tray', 'remote-tray');
      tray.textContent = formatSimTime(api.clock.now()).time;
      taskbar.append(tray);
      remoteTray = tray;

      viewport.append(wallpaper, taskbar);
      frame.append(viewport);
      return frame;
    };

    const renderDisplayPanel = (
      model: Readonly<RemoteSession>,
    ): HTMLElement => {
      const panel = element('div', 'remote-panel', 'remote-display-panel');
      const heading = element('h3');
      heading.textContent = 'Display';
      panel.append(heading);

      const facts = element('dl', 'remote-facts');
      definitionRow(facts, 'Resolution', 'remote-resolution')
        .textContent = model.resolution;
      definitionRow(facts, 'Rotation', 'remote-rotation-state')
        .textContent = `${String(model.rotation)} degrees`;
      definitionRow(facts, 'Booted', 'remote-uptime')
        .textContent = model.booted;
      panel.append(facts);

      const controls = element('div', 'app-action-row');
      const picker = element(
        'select',
        'remote-rotation-picker',
        'remote-rotation-picker',
      );
      picker.setAttribute('aria-label', 'Screen rotation');

      for (const rotation of ROTATIONS) {
        const option = element('option');
        option.value = String(rotation);
        option.textContent = `${String(rotation)} degrees`;
        picker.append(option);
      }

      const current = model.rotation;
      // Default the picker to upright: the overwhelmingly common fix is
      // "put it back", and it should be one click away.
      const chosen = model.picked;
      picker.value = String(chosen);
      picker.addEventListener('change', () => {
        const value = Number(picker.value);
        pickedRotation = isRotation(value) ? value : null;
        render();
      });

      const apply = osButton('Set rotation', 'remote-apply-rotation', {
        primary: true,
      });
      setAvailability(
        apply,
        chosen === current
          ? `That screen is already at ${String(current)} degrees. Setting it `
            + 'again would be theatre.'
          : null,
      );
      apply.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.machineSetDisplayRotation,
          model.id,
          { rotation: chosen },
          `Screen set to ${String(chosen)} degrees. They will say it was like `
            + 'that all along.',
        );
      });

      const reboot = osButton('Reboot the machine', 'remote-reboot');
      reboot.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.machineReboot,
          model.id,
          {},
          'Rebooted. Ask what they had open only after it comes back.',
        );
      });

      controls.append(picker, apply, reboot);
      panel.append(controls);
      return panel;
    };

    /**
     * The services on that box, with the columns a services list actually has.
     *
     * Name, status and STARTUP TYPE, which is the column that turns a list
     * into a diagnosis: a stopped service set to Manual is a box behaving
     * itself, a stopped service set to Automatic is the line the ticket is
     * about, and until this column existed the two looked identical.
     *
     * Hardware and licence pools are below the table rather than in it,
     * because a fan is not a service and a services list that carries one is
     * teaching the player something false about every other line in it.
     */
    const renderServicesPanel = (
      model: Readonly<RemoteSession>,
    ): HTMLElement => {
      const panel = element('div', 'remote-panel', 'remote-services-panel');
      const heading = element('h3');
      const services = model.services.filter((service) => service.listed);
      const others = model.services.filter((service) => !service.listed);
      const running = services.filter(
        (service) => service.status === SERVICE_STATUS.running,
      ).length;
      heading.textContent = 'Services';
      const summary = element('p', 'remote-panel-note', 'remote-services-count');
      summary.textContent = `${String(services.length)} registered, ${
        String(running)
      } running`;
      panel.append(heading, summary);

      if (model.services.length === 0) {
        const empty = element('p', 'remote-placeholder', 'remote-no-services');
        empty.textContent = 'Nothing is registered as running on this one, '
          + 'which is either very clean or very wrong.';
        panel.append(empty);
        return panel;
      }

      const table = element('table', 'remote-services', 'remote-services');
      const head = element('thead');
      const headRow = element('tr');

      for (const column of ['Name', 'Status', 'Startup type', '']) {
        const cell = element('th');
        cell.scope = 'col';
        cell.textContent = column;
        headRow.append(cell);
      }

      head.append(headRow);
      const body = element('tbody');

      for (const service of services) {
        const key = nodeKey(service.id);
        const row = element('tr', 'remote-service', `remote-service-${key}`);
        row.dataset.status = service.status;
        row.dataset.startup = service.startupLabel;

        const name = element('td', 'remote-service-name');
        const display = element('strong');
        display.textContent = service.name;
        const short = element('span', 'remote-service-key');
        short.textContent = service.service;
        name.append(display, short);

        const state = element('td', 'remote-service-status');
        state.textContent = service.statusLabel;
        const startup = element('td', 'remote-service-startup');
        startup.textContent = service.startupLabel;

        const controls = element('td', 'remote-service-controls');
        const restart = osButton(
          'Restart',
          `remote-restart-${key}`,
          { compact: true },
        );
        setAvailability(restart, service.blocked);
        restart.addEventListener('click', () => {
          run(
            HELPDESK_ACTIONS.serviceRestart,
            service.id,
            {},
            `${service.name} started `
              + 'again, with nothing left waiting to jam it.',
          );
        });
        controls.append(restart);

        row.append(name, state, startup, controls);
        body.append(row);
      }

      table.append(head, body);
      panel.append(table);

      if (others.length > 0) {
        const note = element('p', 'remote-panel-note', 'remote-not-services');
        note.textContent = 'Also reporting a status on this box, and not '
          + 'services:';
        panel.append(note);

        const list = element('ul', 'remote-not-service-list');

        for (const other of others) {
          const key = nodeKey(other.id);
          const item = element('li', 'remote-service', `remote-service-${key}`);
          item.dataset.status = other.status;
          const label = element('span', 'remote-service-name');
          label.textContent = `${other.name} - ${other.statusLabel}`;
          const restart = osButton(
            'Restart',
            `remote-restart-${key}`,
            { compact: true },
          );
          setAvailability(restart, other.blocked);
          restart.addEventListener('click', () => {
            run(HELPDESK_ACTIONS.serviceRestart, other.id, {}, 'Done.');
          });
          item.append(label, restart);
          list.append(item);
        }

        panel.append(list);
      }

      return panel;
    };

    const renderHardwarePanel = (
      model: Readonly<RemoteSession>,
    ): HTMLElement => {
      const panel = element('div', 'remote-panel', 'remote-hardware-panel');
      const heading = element('h3');
      heading.textContent = 'Attached hardware';
      panel.append(heading);

      const devices = model.devices;

      if (devices.length === 0) {
        const empty = element('p', 'remote-placeholder', 'remote-no-devices');
        empty.textContent = 'Nothing is plugged into this one, which is its '
          + 'own kind of achievement.';
        panel.append(empty);
        return panel;
      }

      for (const device of devices) {
        const key = device.key;
        const card = element('div', 'remote-device', `remote-device-${key}`);
        const name = element('strong');
        name.textContent = device.name;
        const kind = element('span', 'remote-device-type');
        kind.textContent = device.type;
        card.append(name, kind);

        if (device.printer) {
          const depth = device.queue;
          const queueLine = element('span', 'remote-queue', `remote-queue-${key}`);
          queueLine.textContent = `${String(depth)} job(s) queued`;
          // The label is the whole procedure, because the button is: the
          // spool files belong to a running service, so the queue cannot be
          // dropped without stopping it first. Leaving that off is what made
          // the old lesson tell the player to delete files out from under a
          // service that still had them open.
          const clear = osButton(
            device.spooler === null ? 'Clear queue' : 'Stop spooler + clear queue',
            `remote-clear-${key}`,
            { compact: true },
          );
          setAvailability(
            clear,
            depth === 0
              ? 'The queue is already empty. There is nothing left to drop.'
              : null,
          );
          clear.addEventListener('click', () => {
            run(
              HELPDESK_ACTIONS.printerClearQueue,
              device.id,
              device.spooler === null ? {} : { spooler: device.spooler },
              device.spooler === null
                ? `${String(depth)} job(s) dropped. They went wherever the `
                  + 'odd socks go.'
                : `Spooler stopped, ${String(depth)} job(s) dropped, and the `
                  + 'spooler LEFT stopped - the files were its, and starting '
                  + 'it again is the third step and yours.',
            );
          });
          card.append(queueLine, clear);
        }

        const battery = device.battery;

        if (battery !== null) {
          const level = element('span', 'remote-battery', `remote-battery-${key}`);
          level.textContent = `Battery ${String(battery)}%`;
          const replace = osButton(
            'Replace battery',
            `remote-replace-battery-${key}`,
            { compact: true },
          );
          setAvailability(
            replace,
            battery >= FULL_BATTERY
              ? 'Those batteries are fresh. The cupboard budget is not.'
              : null,
          );
          replace.addEventListener('click', () => {
            run(
              HELPDESK_ACTIONS.deviceReplaceBattery,
              device.id,
              {},
              'Fresh batteries in. The cupboard budget disagrees.',
            );
          });
          card.append(level, replace);
        }

        const power = osButton('Power cycle', `remote-power-${key}`, {
          compact: true,
        });
        setAvailability(
          power,
          device.powered && !device.wedged
            ? 'It is on and behaving itself. Switching it off and on again '
              + 'now is superstition, not support.'
            : null,
        );
        power.addEventListener('click', () => {
          run(
            HELPDESK_ACTIONS.devicePowerCycle,
            device.id,
            {},
            'Off, then on. It works far more often than anybody likes.',
          );
        });
        card.append(power);

        panel.append(card);
      }

      return panel;
    };

    /**
     * The session is rebuilt only when what it SHOWS has changed.
     *
     * It holds the rotation dropdown - the one control this app exists for -
     * and it was being rebuilt on every world change. The tick was already
     * spared for exactly that reason; the meters moving every five minutes of
     * the shift were not, so the dropdown still shut in the player's hand,
     * just less often and less predictably.
     *
     * The remote clock in their taskbar is deliberately NOT in the model. It
     * moves every minute and it is repainted on its own, which is the whole
     * arrangement: if it were in here, every minute would be a rebuild again.
     */
    let painted: string | null = null;

    const renderSession = (model: RemoteSession | null): void => {
      const signature = JSON.stringify(model);

      if (signature === painted) {
        return;
      }

      painted = signature;
      session.replaceChildren();
      remoteTray = null;

      if (model === null) {
        const empty = element('p', 'remote-placeholder', 'remote-empty');
        empty.textContent = 'Pick a workstation to connect to. They have all '
          + 'agreed to this in the handbook nobody read.';
        session.append(empty);
        return;
      }

      const head = element('div', 'remote-head');
      const heading = element('h2', undefined, 'remote-hostname');
      heading.textContent = model.hostname;
      const owner = element('span', 'remote-owner', 'remote-owner');
      owner.textContent = model.owner;
      head.append(heading, owner);

      session.append(head, renderScreen(model));

      const panels = element('div', 'remote-panels');
      panels.append(
        renderDisplayPanel(model),
        renderServicesPanel(model),
        renderHardwarePanel(model),
      );
      session.append(panels);

      session.append(
        outcomeLine('remote-outcome', model.outcome),
        refusalLine('remote-refusal', model.refusal, createIcon('icon-lock')),
      );
    };

    /** Everything that only makes sense while looking at ONE machine. */
    const selectMachine = (id: string | null): void => {
      selectedId = id;
      pickedRotation = null;
      refusal = null;
      outcome = null;
    };

    const render = (): void => {
      const nodes = machines();
      const selection = resolveSelection(nodes, selectedId);

      if (selection.changed) {
        // A machine that vanished takes its pending rotation and its last
        // refusal with it: applying either against the next box would be a
        // fix aimed at the wrong screen.
        selectMachine(selection.id);
      }

      const sideways = nodes.filter(
        (machine) => rotationOf(machine) !== 0,
      ).length;
      // "Machines" rather than "workstations": three of the boxes on that list
      // are servers and one of them is the domain controller, and a tool that
      // calls them all workstations is a tool that has not looked.
      summary.textContent = `${String(nodes.length)} machines · `
        + `${String(sideways)} sideways`;

      // A repaint must not take the keyboard off the control the player is
      // standing on, the same rule the ticket queue follows.
      const machine = nodes.find((candidate) => candidate.id === selectedId);

      withFocusRestored(root, () => {
        renderMachines(nodes);
        renderSession(machine === undefined ? null : remoteSession(api, machine, {
          picked: pickedRotation,
          outcome,
          refusal,
        }));
      });
    };

    host.replaceChildren(root);
    render();

    // Only the remote clock moves on a tick. A full repaint every second
    // would destroy and rebuild the rotation dropdown under the player's
    // cursor, which is the one control this app exists for.
    const unsubscribeTick = api.clock.onTick((tick) => {
      if (remoteTray !== null) {
        remoteTray.textContent = formatSimTime(tick).time;
      }
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });

    return {
      receiveIntent: (intent): void => {
        if (intent.kind !== 'remote-machine') {
          return;
        }

        if (api.graph.getNode(intent.id)?.kind !== 'machine') {
          return;
        }

        selectMachine(intent.id);
        render();
      },
      unmount: (): void => {
        unsubscribeTick();
        unsubscribeWorld();
        root.remove();
      },
    };
  },
};
