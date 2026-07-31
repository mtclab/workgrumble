import type { ReadOnlyGraphNode } from '../../engine-api';
import { FULL_BATTERY, HELPDESK_ACTIONS } from '../../world/actions';
import {
  DEVICE_TYPES,
  FIELDS,
  isRotation,
  type Rotation,
  ROTATIONS,
  SERVICE_STATUS,
} from '../../world/fields';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
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

function ownerOf(
  api: Pick<GameApi, 'graph'>,
  machine: Readonly<ReadOnlyGraphNode>,
): ReadOnlyGraphNode | undefined {
  return api.graph
    .neighbors(machine.id, { direction: 'in', edgeKind: 'owns' })
    .find((node) => node.kind === 'person');
}

function servicesOn(
  api: Pick<GameApi, 'graph'>,
  machine: Readonly<ReadOnlyGraphNode>,
): readonly ReadOnlyGraphNode[] {
  return api.graph
    .neighbors(machine.id, { direction: 'in', edgeKind: 'runs_on' })
    .filter((node) => node.kind === 'service');
}

function devicesOn(
  api: Pick<GameApi, 'graph'>,
  machine: Readonly<ReadOnlyGraphNode>,
): readonly ReadOnlyGraphNode[] {
  return api.graph
    .neighbors(machine.id, { direction: 'in', edgeKind: 'connected_to' })
    .filter((node) => node.kind === 'device');
}

export interface RemoteService {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly restartable: boolean;
  /** Jobs still queued on whatever it feeds, or nothing waiting. */
  readonly backlog: number | null;
}

export interface RemoteDevice {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly type: string;
  readonly printer: boolean;
  readonly queue: number;
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
  readonly services: readonly RemoteService[];
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
  api: Pick<GameApi, 'graph'>,
  machine: Readonly<ReadOnlyGraphNode>,
  view: Readonly<RemoteSessionView>,
): RemoteSession {
  // Guarded, not merely typed: `formatSimTime` throws on a negative or
  // fractional tick, and the render this feeds has run inside the clock
  // listener, where one throw would stop every other tick listener with it.
  const uptime = machine.fields[FIELDS.uptimeSince];

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
    services: servicesOn(api, machine).map((service) => {
      const status = textValue(service.fields[FIELDS.status], 'unknown');
      // Whatever this service feeds, and whether it is still backed up:
      // starting it in front of a full queue only jams it again.
      const backlog = api.graph
        .neighbors(service.id, { direction: 'out', edgeKind: 'connected_to' })
        .map((device) => device.fields[FIELDS.queueLen])
        .find((queued) => typeof queued === 'number' && queued > 0);

      return {
        id: service.id,
        name: textValue(service.fields[FIELDS.name], service.id),
        status,
        statusLabel: STATUS_LABELS[status] ?? status,
        restartable: service.fields[FIELDS.restartable] === true,
        backlog: typeof backlog === 'number' ? backlog : null,
      };
    }),
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

      const taskbar = element('div', 'remote-taskbar', 'remote-taskbar');
      const start = element('span', 'remote-start');
      start.textContent = 'Start';
      taskbar.append(start);

      const services = model.services;

      for (const service of services) {
        const chip = element(
          'div',
          'remote-service',
          `remote-service-${nodeKey(service.id)}`,
        );
        chip.dataset.status = service.status;
        const label = element('span', 'remote-service-name');
        label.textContent = service.name;
        const state = element('span', 'remote-service-status');
        state.textContent = service.statusLabel;

        const restart = osButton(
          'Restart',
          `remote-restart-${nodeKey(service.id)}`,
          { compact: true },
        );
        setAvailability(
          restart,
          !service.restartable
            ? 'This is hardware with a status light, not software. You cannot '
              + 'turn a fan off and on again. Well. You can. It will not help.'
            : service.status === SERVICE_STATUS.running
              ? 'This one is running. Restarting a healthy service in front '
                + 'of the user is how a small ticket becomes a big one.'
              : service.backlog !== null
                ? `${String(service.backlog)} job(s) are `
                  + 'still queued behind it. It will just choke on the same '
                  + 'job again. Empty the queue first.'
                : null,
        );
        restart.addEventListener('click', () => {
          run(
            HELPDESK_ACTIONS.serviceRestart,
            service.id,
            {},
            `${service.name} started `
              + 'again, with nothing left waiting to jam it.',
          );
        });

        chip.append(label, state, restart);
        taskbar.append(chip);
      }

      if (services.length === 0) {
        const none = element('span', 'remote-taskbar-empty');
        none.textContent = 'No services registered on this box.';
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
          const clear = osButton('Clear queue', `remote-clear-${key}`, {
            compact: true,
          });
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
              {},
              `${String(depth)} job(s) dropped. They went wherever the odd `
                + 'socks go.',
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
      summary.textContent = `${String(nodes.length)} workstations · `
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
