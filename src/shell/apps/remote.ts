import type { FieldValue, ReadOnlyGraphNode } from '../../engine-api';
import { FULL_BATTERY, HELPDESK_ACTIONS } from '../../world/actions';
import {
  DEVICE_TYPES,
  FIELDS,
  isRestartable,
  isRotation,
  isService,
  MACHINE_OS,
  type MachineOs,
  machineOsOf,
  type Rotation,
  ROTATIONS,
  SERVICE_CLASSES,
  serviceClassOf,
  SERVICE_STATUS,
  STARTUP_TYPE_LABELS,
  RACI_OWNER_LABELS,
  raciOwnerOf,
  type StartupType,
  STARTUP_TYPES,
  startupTypeOf,
} from '../../world/fields';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import { programImage } from './processes';
import {
  dispatchRemediation,
  refusalOf,
  type RemediationStrips,
} from './remediation';
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
  /**
   * What is actually running on the far end (#55, 0.33.0).
   *
   * Read off the box rather than assumed, which is the whole of the bug this
   * closes: since 0.7.0 the viewer drew the Windows caricature - My Documents,
   * a Recycle bin, a Start button - onto EVERY machine, including Meridian's
   * Linux fleet and, from 0.32.0, a studio full of Macs. The estate was honest
   * on the wire the entire time and the one surface that draws a screen was
   * not.
   */
  readonly os: MachineOs;
  /**
   * Whether the support tool holds Screen Recording consent on this Mac, and
   * NULL on every box that does not carry the consent at all.
   *
   * Three values rather than two, and the null is load-bearing: "this Mac has
   * not granted it" and "this box has no such thing" are different sentences,
   * and only the first of them is a black frame. It is the same field the MDM
   * refusal reads (`tcc_screen_recording`), read here for the first time -
   * 0.32.0 shipped the mechanic and the ticket that turns it off, and the
   * viewer never once looked at it, which is the half of #55 that is a fiction
   * hole rather than a wrong picture.
   */
  readonly screenRecording: boolean | null;
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
  const consent = machine.fields[FIELDS.tccScreenRecording];

  return {
    id: machine.id,
    hostname: hostnameOf(machine),
    owner: textValue(ownerOf(api, machine)?.fields[FIELDS.name], 'Unassigned'),
    os: machineOsOf(machine.fields[FIELDS.machineOs]),
    // Absent is NULL, not false: a box with no consent field has no consent to
    // be missing, and reading the absence as "denied" would black out every
    // Windows screen in the estate.
    screenRecording: typeof consent === 'boolean' ? consent : null,
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

/* -- what is on the far end's screen (#55, 0.33.0) ------------------------- */

/**
 * The Windows caricature's furniture, by TEST ID.
 *
 * Named here because two things read the list and they must not drift: the
 * renderer, which writes these ids onto the elements it builds, and the
 * standing gate, which walks every machine in every shipped world and fails if
 * a face that is not a Windows one would put any of them on screen. A gate
 * written against copies of these strings would go green the day somebody
 * renamed one.
 */
export const WINDOWS_FURNITURE = Object.freeze({
  /** My Documents, the Q4 file, the Recycle bin. */
  icons: 'remote-desktop-icons',
  /** The little system dialog nobody has read since 1997. */
  dialog: 'remote-dialog',
  /** The Start button, which is the sharpest single tell of the three. */
  start: 'remote-start',
});

/**
 * What the viewer draws, as DATA rather than as three branches in a render.
 *
 * This exists in this shape because of what #55 actually was: not a missing
 * feature, but a renderer that KNEW how to draw one desktop and drew it at
 * everything. A face computed here and built mechanically below cannot make
 * that mistake again - there is no Windows branch to fall through into,
 * because the furniture only exists as fields on this object, and those fields
 * are empty for anything that is not a Windows box.
 *
 * Every face is minimal on purpose. This game does not model what is on
 * somebody else's screen; what it models is the machine. So each face draws
 * only what is TRUE of the family it belongs to, and where a family's screen
 * is genuinely unknowable the face says so in a sentence rather than filling
 * the space with invented furniture.
 */
export interface RemoteFace {
  readonly os: MachineOs;
  /**
   * The desktop icons, which are the Windows caricature's and nobody else's.
   * Empty is not "we did not get round to it" - it is the honest answer for a
   * headless server and for a Mac whose desktop this estate does not model.
   */
  readonly icons: readonly string[];
  /** The system dialog, on the one face that has one. */
  readonly dialog: {
    readonly title: string;
    readonly body: string;
  } | null;
  /**
   * The bar along the bottom, and which kind: a taskbar with a Start button on
   * it, a dock silhouette, or - on a box with no graphical session at all -
   * nothing.
   */
  readonly bar: 'taskbar' | 'dock' | null;
  /** The strip along the top, which only the Mac family has. */
  readonly menuBar: boolean;
  /** The clock, which is a thing the world genuinely knows. */
  readonly clock: boolean;
  /**
   * The console line a box with no desktop shows instead of one, or null on a
   * box that has a desktop to draw.
   */
  readonly console: string | null;
  /**
   * The frame a Mac hands a viewer that has not been granted Screen Recording:
   * black, and nothing else on it at all.
   */
  readonly blackout: boolean;
}

/**
 * The face for a session - one per OS family, and the TCC state on top.
 *
 * The blackout is checked FIRST and clears everything with it, because that is
 * what the mechanic is: the session connects, the tool runs, and the frame it
 * is handed is black. A blackout drawn over a dock silhouette would be this
 * window showing a player a screen it has just said it cannot see.
 */
export function remoteFace(model: Readonly<RemoteSession>): RemoteFace {
  const blackout = model.os === MACHINE_OS.mac && model.screenRecording === false;

  if (blackout) {
    return {
      os: model.os,
      icons: [],
      dialog: null,
      bar: null,
      menuBar: false,
      clock: false,
      console: null,
      blackout: true,
    };
  }

  if (model.os === MACHINE_OS.mac) {
    // The read-only caricature: the two layout facts the chrome slice already
    // ships (a menu bar over a dock), and not one thing more. No Finder, no
    // desktop furniture, no invented documents - the estate models a Mac's
    // hardware and its jobs, and has never held anything about its desktop.
    return {
      os: model.os,
      icons: [],
      dialog: null,
      bar: 'dock',
      menuBar: true,
      clock: true,
      console: null,
      blackout: false,
    };
  }

  if (model.os === MACHINE_OS.linux) {
    // The honest one, and the smallest. Every Linux box in this estate is a
    // server - a NAS, an app server, a database, an edge firewall - and a
    // server has no graphical session on it: what a screen plugged into one
    // shows is a login prompt, and what the work is actually done over is ssh.
    // Drawing a desktop here would be a picture of a machine that does not
    // exist. (`remote-face.test.ts` keeps the estate honest about that: a
    // Linux WORKSTATION seeded into any world fails there rather than being
    // quietly libelled here.)
    return {
      os: model.os,
      icons: [],
      dialog: null,
      bar: null,
      menuBar: false,
      clock: false,
      console: `${model.hostname} login:`,
      blackout: false,
    };
  }

  return {
    os: model.os,
    // The caricature this window has always drawn, unchanged - the Windows
    // boxes are the ones this face was always right about.
    icons: ['My Documents', 'Q4 (final) (final2)', 'Recycle'],
    dialog: model.updates
      ? {
        title: 'Updates are ready when you are',
        body: 'Your workstation will restart at a time chosen by somebody who '
          + 'does not use it.',
      }
      : {
        title: 'System Notice',
        body: 'Nothing needs your attention, which is itself suspicious.',
      },
    bar: 'taskbar',
    menuBar: false,
    clock: true,
    console: null,
    blackout: false,
  };
}

/**
 * This window's write path: every control that CHANGES something on the remote
 * box goes through here, and nothing in here decides whether it may.
 *
 * The decision is the shared seam's, which is the whole of #64's P1-3. For nine
 * versions this window sent the same verbs at the same customer boxes as the
 * terminal and met none of the customer walls: a Restart here on a
 * monitoring-only estate simply worked, and one on a co-managed customer's own
 * box closed the ticket and left no trail, so nobody's sysadmin ever wrote in
 * the next morning. Every wall the game teaches was a property of the TERMINAL
 * rather than of the game, and one window away from not existing.
 *
 * A refusal comes back before anything is dispatched, so a refused remediation
 * leaves the box exactly as the player found it. What this window still decides
 * is where the answer goes: its own refusal strip, in the shipped words, at the
 * place the click happened.
 *
 * It is out here, rather than inside the mount, because it is the window's
 * behaviour rather than its furniture - so the gate can play these controls
 * without a browser, and so that taking the seam back out of this function
 * turns those tests red. The machine LIST is deliberately not gated by any of
 * it: seeing an estate is not touching it, and a monitoring-only customer is
 * one you are paid to watch.
 */
export function remoteRemediation(
  api: GameApi,
  action: string,
  target: string,
  params: Record<string, string | number>,
  success: string,
): RemediationStrips {
  const result = dispatchRemediation(api, action, target, params);

  return {
    refusal: refusalOf(result),
    outcome: result.kind === 'done' ? success : null,
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
 *
 * And from 0.33.0 (#55) it is a parody of the RIGHT desktop: the face is
 * chosen by what the box actually runs, because for six versions this window
 * drew My Documents and a Recycle bin onto Linux servers and, latterly, onto a
 * studio full of Macs. See `remoteFace` for the three faces and for what each
 * one refuses to invent.
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

    /**
     * Every control in this window that CHANGES something on that box, and the
     * only way any of them reaches the world: `remoteRemediation` above, then
     * the two strips it answers with, then a repaint.
     */
    const run = (
      action: string,
      target: string,
      params: Record<string, string | number> = {},
      success = 'Done.',
    ): void => {
      const strips = remoteRemediation(api, action, target, params, success);
      refusal = strips.refusal;
      outcome = strips.outcome;
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

    /**
     * The clock that lives in whichever strip this face keeps one in - the
     * Windows taskbar, or the Mac's menu bar, which is where a Mac keeps it.
     *
     * It is built here rather than inline in both, because it is the one
     * element in this window that is repainted on its own every tick, and
     * `remoteTray` has to point at exactly one of them.
     */
    const renderClock = (): HTMLElement => {
      const tray = element('span', 'remote-tray', 'remote-tray');
      tray.textContent = formatSimTime(api.clock.now()).time;
      remoteTray = tray;
      return tray;
    };

    /**
     * The bar along the bottom, filled with what is OPEN on that machine -
     * which is a question this session can only honestly answer about the
     * player's own box.
     *
     * Shared by the taskbar and the dock, because the honest content is the
     * same content: a Mac dock with invented windows in it would be exactly
     * the lie a Windows taskbar with invented windows in it is. Only the
     * chrome around them differs, which is the whole point of the split.
     */
    const renderBar = (
      model: Readonly<RemoteSession>,
      face: Readonly<RemoteFace>,
    ): HTMLElement => {
      const dock = face.bar === 'dock';
      const bar = element(
        'div',
        dock ? 'remote-taskbar remote-dock' : 'remote-taskbar',
        dock ? 'remote-dock' : 'remote-taskbar',
      );

      if (!dock) {
        const start = element('span', 'remote-start', WINDOWS_FURNITURE.start);
        start.textContent = 'Start';
        bar.append(start);
      }

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
        bar.append(button);
      }

      if (model.programs.length === 0) {
        const none = element('span', 'remote-taskbar-empty');
        none.textContent = model.own
          ? 'Nothing open. Suspicious in itself.'
          : 'This session cannot see what they have open. Only the boss can '
            + 'do that, and he does it by walking.';
        bar.append(none);
      }

      if (face.clock && !face.menuBar) {
        bar.append(renderClock());
      }

      return bar;
    };

    /**
     * Their screen, drawn from their machine's state AND from what their
     * machine actually is (#55).
     *
     * Everything below is built off `RemoteFace`, which is the fix: the
     * furniture exists as FIELDS on that object, so a face that declares none
     * puts none in the document - there is no Windows branch left for a
     * non-Windows box to fall into. The frame, the viewport and the rotation
     * transform are shared, because a screen is a screen whatever is drawing
     * it and the rotation field is true of any box that has one.
     */
    const renderScreen = (model: Readonly<RemoteSession>): HTMLElement => {
      const face = remoteFace(model);
      const rotation = model.rotation;
      const frame = element('div', 'remote-frame', 'remote-frame');
      const viewport = element('div', 'remote-viewport', 'remote-viewport');
      viewport.dataset.rotation = String(rotation);
      viewport.style.setProperty('--remote-rotation', `${String(rotation)}deg`);
      // What kind of screen this is, on the element, so the stylesheet can lay
      // out three faces without a class per family and so a test can ask the
      // document which one it got.
      viewport.dataset.face = face.os;
      viewport.dataset.blackout = String(face.blackout);

      // The black frame, and NOTHING else in the viewport. Said plainly and
      // without diagnosing it: the reporter's own description is "it connects
      // and then it is black", and which consent is missing is the ticket's
      // question rather than this window's answer.
      if (face.blackout) {
        const black = element('div', 'remote-blackout', 'remote-blackout');
        const note = element('p', 'remote-blackout-note');
        note.textContent = 'Connected. The screen is black.';
        black.append(note);
        viewport.append(black);
        frame.append(viewport);
        return frame;
      }

      if (face.menuBar) {
        // The top strip: a silhouette of the bar the chrome slice ships, and
        // the clock, which is the one thing in it this game genuinely knows.
        // No app name - that would be a claim about what somebody else has
        // open, which is exactly what the taskbar below refuses to invent.
        const menuBar = element('div', 'remote-menu-bar', 'remote-menu-bar');
        menuBar.append(renderClock());
        viewport.append(menuBar);
      }

      if (face.console !== null) {
        // A box with no graphical session, drawn as what it actually shows.
        const consolePane = element('div', 'remote-console', 'remote-console');
        const prompt = element(
          'p',
          'remote-console-prompt',
          'remote-console-prompt',
        );
        prompt.textContent = face.console;
        const note = element('p', 'remote-console-note');
        note.textContent = 'No graphical session on this one. A screen plugged '
          + 'into it shows this, and the work happens over ssh - which is why '
          + 'there is nothing here to point at.';
        consolePane.append(prompt, note);
        viewport.append(consolePane);
        frame.append(viewport);
        return frame;
      }

      const wallpaper = element('div', 'remote-wallpaper');

      if (face.icons.length > 0) {
        const icons = element(
          'ul',
          'remote-desktop-icons',
          WINDOWS_FURNITURE.icons,
        );

        for (const label of face.icons) {
          const icon = element('li', 'remote-desktop-icon');
          icon.textContent = label;
          icons.append(icon);
        }

        wallpaper.append(icons);
      }

      if (face.dialog !== null) {
        const dialog = element(
          'div',
          'remote-dialog',
          WINDOWS_FURNITURE.dialog,
        );
        const dialogTitle = element('strong');
        dialogTitle.textContent = face.dialog.title;
        const dialogBody = element('p');
        dialogBody.textContent = face.dialog.body;
        dialog.append(dialogTitle, dialogBody);
        wallpaper.append(dialog);
      }

      viewport.append(wallpaper);

      if (face.bar !== null) {
        viewport.append(renderBar(model, face));
      }

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

      // The RACI marker, where the wall lives (0.37.1 second round): the KB
      // tells the player the per-box owner map is the document made
      // mechanical, and until this line the map was a field only the guards
      // could read. It prints on the box the map says something about and is
      // absent everywhere else, so its presence is itself the teaching.
      const raci = raciOwnerOf(
        api.graph.getField(model.id, FIELDS.raciOwner),
      );

      if (raci !== null) {
        const marker = element('span', 'remote-raci', 'remote-raci');
        marker.dataset.raci = raci;
        marker.textContent = RACI_OWNER_LABELS[raci];
        head.append(marker);
      }

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
