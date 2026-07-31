/**
 * The thing that actually writes the log.
 *
 * The engine already announces every mutation it makes, with the tick it made
 * it on, because that is what determinism requires. This turns that stream
 * into the log a machine keeps about itself - which is the whole of the Event
 * Viewer, and it is why the app costs almost nothing: the data has been there
 * since M0 and nobody was writing it down.
 *
 * Two rules it obeys, both of which are the difference between a diagnosis
 * surface and a novelty:
 *
 * - It records the WORLD changing, not the player clicking. A service that
 *   goes down in a ticket's setup ops is a crash and gets logged like one;
 *   nothing here reads the dispatch log, so it does not matter whether the
 *   change came from a button, a terminal, a spawn or tomorrow's content.
 * - It writes through a dispatched action, like every other change. The whole
 *   bounded field is computed here and sent as one value, so a replay writes
 *   the identical string.
 */

import type {
  EngineApi,
  FieldValue,
  GraphMutation,
  NodeId,
  ReadOnlyGraphNode,
  ReadOnlyGraphView,
} from '../../engine-api';
import { HELPDESK_ACTIONS } from '../actions/ids';
import { DEVICE_TYPES, FIELDS, SERVICE_STATUS } from '../fields';
import { ticketNodes, ticketTitle } from '../tickets';
import {
  accountDisabledMessage,
  accountEnabledMessage,
  accountLockedMessage,
  accountUnlockedMessage,
  countEvents,
  devicePoweredMessage,
  EVENT_IDS,
  EVENT_SOURCES,
  type EventLevel,
  logonFailedMessage,
  type MachineEvent,
  passwordResetMessage,
  printFailedMessage,
  printQueueClearedMessage,
  readEventLog,
  rebootedMessage,
  serviceCrashedMessage,
  serviceRunningMessage,
  slaMissedMessage,
  withEvent,
} from './log';

/** An event before it knows which box it happened to, or how many times. */
interface Draft {
  readonly level: EventLevel;
  readonly source: string;
  readonly id: number;
  /** Built once the machine's own history is known, for the "N time(s)". */
  message(times: number): string;
}

function draft(
  level: EventLevel,
  source: string,
  id: number,
  message: string,
): Draft {
  return { level, source, id, message: () => message };
}

function label(node: Readonly<ReadOnlyGraphNode> | undefined): string {
  const value = node?.fields[FIELDS.hostname]
    ?? node?.fields[FIELDS.name]
    ?? node?.fields[FIELDS.username];

  return typeof value === 'string' && value.length > 0
    ? value
    : node?.id ?? 'something';
}

/**
 * Which machines an event about this node belongs on.
 *
 * The estate answers it: a service is on the box it runs on, a device on the
 * box it is plugged into, an account on whatever its owner sits at. A node
 * nobody can trace to a machine writes nowhere, which is correct - there is no
 * Event Viewer for a group.
 */
export function machinesFor(
  graph: ReadOnlyGraphView,
  id: NodeId,
): readonly string[] {
  const node = graph.getNode(id);

  if (node === undefined) {
    return [];
  }

  switch (node.kind) {
    case 'machine':
      return [node.id];
    case 'service':
      return graph
        .neighbors(node.id, { direction: 'out', edgeKind: 'runs_on' })
        .filter((host) => host.kind === 'machine')
        .map((host) => host.id);
    case 'device':
      return graph
        .neighbors(node.id, { direction: 'out', edgeKind: 'connected_to' })
        .filter((host) => host.kind === 'machine')
        .map((host) => host.id);
    case 'account':
      // The desk the person sits at. An account with no machine - a service
      // account, a leaver whose kit went back - writes nowhere, and that is
      // the honest answer rather than a guess.
      return graph
        .neighbors(node.id, { direction: 'in', edgeKind: 'owns' })
        .filter((owner) => owner.kind === 'person')
        .flatMap((owner) => graph
          .neighbors(owner.id, { direction: 'out', edgeKind: 'owns' })
          .filter((owned) => owned.kind === 'machine')
          .map((owned) => owned.id));
    default:
      return [];
  }
}

/** Whether a service status means the thing has fallen over. */
function isDown(value: FieldValue | undefined): boolean {
  return value === SERVICE_STATUS.stopped || value === SERVICE_STATUS.wedged;
}

/**
 * What one field change is worth writing down, or nothing.
 *
 * Deliberately a small list. An event log that recorded every mutation would
 * be a mutation log with a filter on it, and the point of this surface is that
 * a human can read thirty lines and see a pattern - so it holds the things a
 * real System or Security log holds and not the things a debugger would.
 */
function draftFor(
  graph: ReadOnlyGraphView,
  mutation: Readonly<GraphMutation>,
): Draft | null {
  if (mutation.type !== 'field:set' || mutation.previous === mutation.value) {
    return null;
  }

  const node = graph.getNode(mutation.id);

  if (node === undefined) {
    return null;
  }

  const name = label(node);

  if (node.kind === 'service' && mutation.field === FIELDS.status) {
    if (isDown(mutation.value)) {
      return {
        level: 'error',
        source: EVENT_SOURCES.scm,
        id: EVENT_IDS.serviceCrashed,
        message: (times) => serviceCrashedMessage(name, times),
      };
    }

    return mutation.value === SERVICE_STATUS.running && isDown(mutation.previous)
      ? draft(
        'information',
        EVENT_SOURCES.scm,
        EVENT_IDS.serviceRunning,
        serviceRunningMessage(name),
      )
      : null;
  }

  if (node.kind === 'machine' && mutation.field === FIELDS.uptimeSince) {
    return draft(
      'information',
      EVENT_SOURCES.kernel,
      EVENT_IDS.rebooted,
      rebootedMessage(name),
    );
  }

  if (node.kind === 'account') {
    if (mutation.field === FIELDS.locked) {
      return mutation.value === true
        ? draft(
          'warning',
          EVENT_SOURCES.security,
          EVENT_IDS.accountLocked,
          accountLockedMessage(name),
        )
        : draft(
          'information',
          EVENT_SOURCES.security,
          EVENT_IDS.accountUnlocked,
          accountUnlockedMessage(name),
        );
    }

    if (mutation.field === FIELDS.enabled) {
      return mutation.value === false
        ? draft(
          'warning',
          EVENT_SOURCES.security,
          EVENT_IDS.accountDisabled,
          accountDisabledMessage(name),
        )
        : draft(
          'information',
          EVENT_SOURCES.security,
          EVENT_IDS.accountEnabled,
          accountEnabledMessage(name),
        );
    }

    if (
      mutation.field === FIELDS.badPwCount
      && typeof mutation.value === 'number'
      && mutation.value > (typeof mutation.previous === 'number'
        ? mutation.previous
        : 0)
    ) {
      // Only upwards. A count going back to nought is a tech clearing the
      // lockout, which the unlock line already says.
      return draft(
        'warning',
        EVENT_SOURCES.security,
        EVENT_IDS.logonFailed,
        logonFailedMessage(name, mutation.value),
      );
    }

    if (mutation.field === FIELDS.passwordResetAt) {
      return draft(
        'information',
        EVENT_SOURCES.security,
        EVENT_IDS.passwordReset,
        passwordResetMessage(name),
      );
    }
  }

  if (node.kind === 'device') {
    if (
      mutation.field === FIELDS.queueLen
      && typeof mutation.value === 'number'
    ) {
      return mutation.value === 0
        ? draft(
          'information',
          EVENT_SOURCES.print,
          EVENT_IDS.printQueueCleared,
          printQueueClearedMessage(name),
        )
        : draft(
          'warning',
          EVENT_SOURCES.print,
          EVENT_IDS.printFailed,
          printFailedMessage(name, mutation.value),
        );
    }

    if (
      mutation.field === FIELDS.powered
      && mutation.value === true
      && node.fields[FIELDS.type] === DEVICE_TYPES.printer
    ) {
      return draft(
        'information',
        EVENT_SOURCES.kernel,
        EVENT_IDS.devicePowered,
        devicePoweredMessage(name),
      );
    }
  }

  return null;
}

/**
 * Starts writing the log, and hands back the way to stop.
 *
 * The world subscribes as it is built, BEFORE the first tickets are dealt, so
 * that a fault which arrives with a ticket's setup ops is in the machine's
 * history like any other - a spooler that was already down when the player sat
 * down still fell over, and the log is the only place that says when.
 */
export function watchMachineEvents(
  engine: EngineApi,
  actor: NodeId,
): () => void {
  const record = (subject: string, machineId: string, entry: Draft): void => {
    const machine = engine.graph.getNode(machineId);

    if (machine === undefined) {
      return;
    }

    const log = readEventLog(machine.fields[FIELDS.eventLog]);
    const event: MachineEvent = {
      tick: engine.now(),
      level: entry.level,
      source: entry.source,
      id: entry.id,
      subject,
      message: entry.message(countEvents(log, entry.id, subject) + 1),
    };

    engine.dispatch(
      HELPDESK_ACTIONS.machineRecordEvent,
      actor,
      machineId,
      { events: withEvent(machine.fields[FIELDS.eventLog], event) },
    );
  };

  return engine.onEvent((event) => {
    if (event.type === 'graph:mutated') {
      const { mutation } = event;

      // The log writing itself is not news, and reacting to it would be a
      // machine that fills its own history with the fact that it has one.
      if (mutation.type === 'field:set' && mutation.field === FIELDS.eventLog) {
        return;
      }

      const entry = draftFor(engine.graph, mutation);

      if (entry === null || mutation.type !== 'field:set') {
        return;
      }

      for (const machineId of machinesFor(engine.graph, mutation.id)) {
        record(mutation.id, machineId, entry);
      }

      return;
    }

    if (event.type === 'ticket:breached') {
      // A missed service level is not something a machine did, and the agent
      // logs it on the machines the incident is ABOUT - which is where a tech
      // chasing "why does this box keep coming up in reviews" would look.
      const entry = draft(
        'warning',
        EVENT_SOURCES.agent,
        EVENT_IDS.slaMissed,
        slaMissedMessage(ticketTitle(event.id)),
      );
      const machines = new Set(
        ticketNodes(event.id).flatMap((id) => machinesFor(engine.graph, id)),
      );

      for (const machineId of machines) {
        record(event.id, machineId, entry);
      }
    }
  });
}
