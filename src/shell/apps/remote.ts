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
import type { AppDef, AppInstance } from './types';
import {
  definitionRow,
  element,
  nodeKey,
  osButton,
  outcomeLine,
  refusalLine,
  resolveSelection,
  setAvailability,
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

const STATUS_LABELS: Readonly<Record<string, string>> = {
  [SERVICE_STATUS.running]: 'Running',
  [SERVICE_STATUS.stopped]: 'Stopped',
  [SERVICE_STATUS.wedged]: 'Not responding',
};

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

    const ownerOf = (
      machine: Readonly<ReadOnlyGraphNode>,
    ): ReadOnlyGraphNode | undefined => api.graph
      .neighbors(machine.id, { direction: 'in', edgeKind: 'owns' })
      .find((node) => node.kind === 'person');

    const servicesOn = (
      machine: Readonly<ReadOnlyGraphNode>,
    ): readonly ReadOnlyGraphNode[] => api.graph
      .neighbors(machine.id, { direction: 'in', edgeKind: 'runs_on' })
      .filter((node) => node.kind === 'service');

    const devicesOn = (
      machine: Readonly<ReadOnlyGraphNode>,
    ): readonly ReadOnlyGraphNode[] => api.graph
      .neighbors(machine.id, { direction: 'in', edgeKind: 'connected_to' })
      .filter((node) => node.kind === 'device');

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

    const renderMachines = (nodes: readonly ReadOnlyGraphNode[]): void => {
      machineList.replaceChildren();

      for (const machine of nodes) {
        const item = element('li');
        const row = element(
          'button',
          'remote-machine',
          `remote-machine-${machineKey(machine.id)}`,
        );
        row.type = 'button';
        row.dataset.selected = String(machine.id === selectedId);

        const name = element('strong');
        name.textContent = hostnameOf(machine);
        const owner = element('span', 'remote-machine-owner');
        owner.textContent = textValue(
          ownerOf(machine)?.fields[FIELDS.name],
          'Nobody admits to it',
        );
        row.append(name, owner);

        if (rotationOf(machine) !== 0) {
          const tilted = element('span', 'remote-machine-flag');
          tilted.textContent = 'Sideways';
          row.append(tilted);
        }

        row.addEventListener('click', () => {
          selectMachine(machine.id);
          render();
        });
        item.append(row);
        machineList.append(item);
      }
    };

    /** The parody desktop: their screen, drawn from their machine's state. */
    const renderScreen = (machine: Readonly<ReadOnlyGraphNode>): HTMLElement => {
      const rotation = rotationOf(machine);
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
      dialogTitle.textContent = machine.fields[FIELDS.pendingUpdates] === true
        ? 'Updates are ready when you are'
        : 'System Notice';
      const dialogBody = element('p');
      dialogBody.textContent = machine.fields[FIELDS.pendingUpdates] === true
        ? 'Your workstation will restart at a time chosen by somebody who '
          + 'does not use it.'
        : 'Nothing needs your attention, which is itself suspicious.';
      dialog.append(dialogTitle, dialogBody);

      wallpaper.append(icons, dialog);

      const taskbar = element('div', 'remote-taskbar', 'remote-taskbar');
      const start = element('span', 'remote-start');
      start.textContent = 'Start';
      taskbar.append(start);

      const services = servicesOn(machine);

      for (const service of services) {
        const status = textValue(service.fields[FIELDS.status], 'unknown');
        // Whatever this service feeds, and whether it is still backed up:
        // starting it in front of a full queue only jams it again.
        const backlog = api.graph
          .neighbors(service.id, {
            direction: 'out',
            edgeKind: 'connected_to',
          })
          .find((device) => {
            const queued = device.fields[FIELDS.queueLen];
            return typeof queued === 'number' && queued > 0;
          });
        const chip = element(
          'div',
          'remote-service',
          `remote-service-${nodeKey(service.id)}`,
        );
        chip.dataset.status = status;
        const label = element('span', 'remote-service-name');
        label.textContent = textValue(service.fields[FIELDS.name], service.id);
        const state = element('span', 'remote-service-status');
        state.textContent = STATUS_LABELS[status] ?? status;

        const restart = osButton(
          'Restart',
          `remote-restart-${nodeKey(service.id)}`,
          { compact: true },
        );
        setAvailability(
          restart,
          service.fields[FIELDS.restartable] !== true
            ? 'This is hardware with a status light, not software. You cannot '
              + 'turn a fan off and on again. Well. You can. It will not help.'
            : status === SERVICE_STATUS.running
              ? 'This one is running. Restarting a healthy service in front '
                + 'of the user is how a small ticket becomes a big one.'
              : backlog !== undefined
                ? `${String(backlog.fields[FIELDS.queueLen])} job(s) are `
                  + 'still queued behind it. It will just choke on the same '
                  + 'job again. Empty the queue first.'
                : null,
        );
        restart.addEventListener('click', () => {
          run(
            HELPDESK_ACTIONS.serviceRestart,
            service.id,
            {},
            `${textValue(service.fields[FIELDS.name], service.id)} started `
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
      machine: Readonly<ReadOnlyGraphNode>,
    ): HTMLElement => {
      const panel = element('div', 'remote-panel', 'remote-display-panel');
      const heading = element('h3');
      heading.textContent = 'Display';
      panel.append(heading);

      const facts = element('dl', 'remote-facts');
      definitionRow(facts, 'Resolution', 'remote-resolution').textContent = textValue(
        machine.fields[FIELDS.resolution],
        'Whatever the driver felt like',
      );
      definitionRow(facts, 'Rotation', 'remote-rotation-state').textContent = `${String(rotationOf(machine))} degrees`;
      // Guarded, not merely typed: `formatSimTime` throws on a negative or
      // fractional tick, and this render runs inside the clock listener,
      // where one throw would stop every other tick listener with it.
      const uptime = machine.fields[FIELDS.uptimeSince];
      definitionRow(facts, 'Booted', 'remote-uptime').textContent = typeof uptime === 'number'
        && Number.isSafeInteger(uptime)
        && uptime >= 0
        ? formatSimTime(uptime).time
        : 'Some time before the merger';
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

      const current = rotationOf(machine);
      // Default the picker to upright: the overwhelmingly common fix is
      // "put it back", and it should be one click away.
      const chosen = pickedRotation ?? 0;
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
          machine.id,
          { rotation: chosen },
          `Screen set to ${String(chosen)} degrees. They will say it was like `
            + 'that all along.',
        );
      });

      const reboot = osButton('Reboot the machine', 'remote-reboot');
      reboot.addEventListener('click', () => {
        run(
          HELPDESK_ACTIONS.machineReboot,
          machine.id,
          {},
          'Rebooted. Ask what they had open only after it comes back.',
        );
      });

      controls.append(picker, apply, reboot);
      panel.append(controls);
      return panel;
    };

    const renderHardwarePanel = (
      machine: Readonly<ReadOnlyGraphNode>,
    ): HTMLElement => {
      const panel = element('div', 'remote-panel', 'remote-hardware-panel');
      const heading = element('h3');
      heading.textContent = 'Attached hardware';
      panel.append(heading);

      const devices = devicesOn(machine);

      if (devices.length === 0) {
        const empty = element('p', 'remote-placeholder', 'remote-no-devices');
        empty.textContent = 'Nothing is plugged into this one, which is its '
          + 'own kind of achievement.';
        panel.append(empty);
        return panel;
      }

      for (const device of devices) {
        const key = nodeKey(device.id);
        const card = element('div', 'remote-device', `remote-device-${key}`);
        const name = element('strong');
        name.textContent = textValue(device.fields[FIELDS.name], device.id);
        const kind = element('span', 'remote-device-type');
        kind.textContent = textValue(device.fields[FIELDS.type], 'device');
        card.append(name, kind);

        const queue = device.fields[FIELDS.queueLen];

        if (device.fields[FIELDS.type] === DEVICE_TYPES.printer) {
          const depth = typeof queue === 'number' ? queue : 0;
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

        const battery = device.fields[FIELDS.batteryPct];

        if (typeof battery === 'number') {
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
          device.fields[FIELDS.powered] === true
            && device.fields[FIELDS.wedged] !== true
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

    const renderSession = (
      machine: ReadOnlyGraphNode | undefined,
    ): void => {
      session.replaceChildren();

      if (machine === undefined) {
        const empty = element('p', 'remote-placeholder', 'remote-empty');
        empty.textContent = 'Pick a workstation to connect to. They have all '
          + 'agreed to this in the handbook nobody read.';
        session.append(empty);
        return;
      }

      const head = element('div', 'remote-head');
      const heading = element('h2', undefined, 'remote-hostname');
      heading.textContent = hostnameOf(machine);
      const owner = element('span', 'remote-owner', 'remote-owner');
      owner.textContent = textValue(
        ownerOf(machine)?.fields[FIELDS.name],
        'Unassigned',
      );
      head.append(heading, owner);

      session.append(head, renderScreen(machine));

      const panels = element('div', 'remote-panels');
      panels.append(
        renderDisplayPanel(machine),
        renderHardwarePanel(machine),
      );
      session.append(panels);

      session.append(
        outcomeLine('remote-outcome', outcome),
        refusalLine('remote-refusal', refusal, createIcon('icon-lock')),
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
      withFocusRestored(root, () => {
        renderMachines(nodes);
        renderSession(nodes.find((machine) => machine.id === selectedId));
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
