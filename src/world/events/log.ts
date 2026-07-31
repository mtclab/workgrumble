/**
 * The event log a machine keeps about itself.
 *
 * Every box in this building has been writing down what happened to it the
 * whole time somebody has been trying to describe it to you over the phone:
 * services that stopped, services that stopped again, reboots, lockouts, print
 * queues that gave up. Reading that back is the difference between a fix and a
 * diagnosis, and it is the one surface where a recurring fault stops being a
 * story the reporter tells and becomes two timestamps four days apart.
 *
 * It lives on the MACHINE as a bounded field, the same shape and for the same
 * reasons as a ticket's touch log: the dispatch log is drained at every day
 * boundary, and a Thursday that could not see Tuesday would defeat the whole
 * point. Bounded because it is in every save from here on, and thirty entries
 * is already more than anybody reads before lunch.
 *
 * Everything here is pure. The writing is done by dispatched actions, like
 * every other change to the world.
 */

/** How much of its own history a machine keeps. */
export const EVENT_LOG_LIMIT = 30;

export const EVENT_LEVELS = ['information', 'warning', 'error'] as const;

export type EventLevel = (typeof EVENT_LEVELS)[number];

export function isEventLevel(value: unknown): value is EventLevel {
  return typeof value === 'string'
    && EVENT_LEVELS.some((level) => level === value);
}

/** The subsystems that write to it, named the way the real ones are. */
export const EVENT_SOURCES = {
  scm: 'Service Control Manager',
  print: 'PrintService',
  security: 'Security',
  kernel: 'Kernel-General',
  /** The monitoring agent nobody remembers agreeing to install. */
  agent: 'WorkgrumbleAgent',
} as const;

/**
 * The event ids. Real ones, because they are what a tech would search for and
 * because a made-up number in a column headed "Event ID" is the kind of detail
 * that looks right to nobody who knows.
 */
export const EVENT_IDS = {
  /** The service terminated unexpectedly. The famous one. */
  serviceCrashed: 7031,
  /** The service entered the running state. */
  serviceRunning: 7036,
  /** The system has been restarted. */
  rebooted: 1074,
  /** The device came back after being turned off and on again. */
  devicePowered: 6005,
  /** An account failed to log on. The one that comes in fives. */
  logonFailed: 4625,
  /** A user account was locked out. */
  accountLocked: 4740,
  /** A user account was unlocked. */
  accountUnlocked: 4767,
  /** An attempt was made to reset an account's password. */
  passwordReset: 4724,
  /** A user account was disabled. */
  accountDisabled: 4725,
  /** A user account was enabled. */
  accountEnabled: 4722,
  /** The document failed to print. */
  printFailed: 372,
  /** The print queue was emptied. */
  printQueueCleared: 307,
  /** The agent, noticing a service level nobody else was watching. */
  slaMissed: 1101,
} as const;

export interface MachineEvent {
  /** The minute it happened, on the same clock everything else uses. */
  readonly tick: number;
  readonly level: EventLevel;
  readonly source: string;
  readonly id: number;
  /**
   * The node it is ABOUT - the service that fell over, the account that
   * locked. Kept as its own column because it is what makes "this has happened
   * four times" countable, and because a row that says which of the three
   * services on this box it means is a row worth reading.
   */
  readonly subject: string;
  readonly message: string;
}

const SEPARATOR = '|';

/** Nothing may contain the separator or a newline: the field is one string. */
function clean(value: string): string {
  return value.replace(/[|\n]/gu, ' ');
}

/** One event, as the machine keeps it: `tick|level|source|id|subject|text`. */
export function encodeEvent(event: Readonly<MachineEvent>): string {
  return [
    String(event.tick),
    event.level,
    clean(event.source),
    String(event.id),
    clean(event.subject),
    clean(event.message),
  ].join(SEPARATOR);
}

function decodeEvent(line: string): MachineEvent | null {
  const parts = line.split(SEPARATOR);
  const [tick, level, source, id, subject, ...rest] = parts;
  const at = tick === undefined || tick.length === 0 ? Number.NaN : Number(tick);
  const eventId = id === undefined || id.length === 0 ? Number.NaN : Number(id);
  const message = rest.join(SEPARATOR);

  if (
    parts.length < 6
    || !isEventLevel(level)
    || source === undefined
    || source.length === 0
    || subject === undefined
    || message.length === 0
    || !Number.isSafeInteger(at)
    || at < 0
    || !Number.isSafeInteger(eventId)
  ) {
    return null;
  }

  return { tick: at, level, source, id: eventId, subject, message };
}

/**
 * The log, oldest first, with anything this build cannot read dropped rather
 * than shown - a save is a file on the player's machine, and a row rendering
 * `undefined` is worse than one row shorter.
 */
export function readEventLog(value: unknown): readonly MachineEvent[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map(decodeEvent)
      .filter((event): event is MachineEvent => event !== null),
  );
}

/**
 * The log with one more entry on the end, oldest dropped once it is full.
 *
 * Pure, so the caller dispatches the whole field as one value and a replay
 * writes exactly the same string - the same contract the ticket touch log
 * keeps, for the same determinism reasons.
 */
export function withEvent(
  existing: unknown,
  event: Readonly<MachineEvent>,
): string {
  const lines = typeof existing === 'string' && existing.length > 0
    ? existing.split('\n').filter((line) => line.length > 0)
    : [];

  lines.push(encodeEvent(event));
  return lines.slice(-EVENT_LOG_LIMIT).join('\n');
}

/** How many times this has already happened to this thing on this box. */
export function countEvents(
  log: readonly Readonly<MachineEvent>[],
  id: number,
  subject: string,
): number {
  return log.filter(
    (event) => event.id === id && event.subject === subject,
  ).length;
}

/* -- the words themselves -------------------------------------------------- */

/**
 * 7031, in full, because it is the funniest true sentence in Windows and
 * because the COUNT is the diagnosis: a service that has fallen over four
 * times is not a mystery, it is a timetable.
 */
export function serviceCrashedMessage(name: string, times: number): string {
  return `The ${name} service terminated unexpectedly. It has done this `
    + `${String(times)} time(s). It will do it again.`;
}

export function serviceRunningMessage(name: string): string {
  return `The ${name} service entered the running state.`;
}

export function rebootedMessage(hostname: string): string {
  return `The system ${hostname} has been restarted. Nothing that was written `
    + 'down has gone anywhere, which is the half people forget.';
}

export function devicePoweredMessage(name: string): string {
  return `${name} was turned off and on again, and came back in the one `
    + 'configuration anybody ever tested.';
}

export function accountLockedMessage(username: string): string {
  return `User account ${username} was locked out. Something is still trying `
    + 'the old password, and it is not always a person.';
}

export function logonFailedMessage(username: string, count: number): string {
  return `An account failed to log on: ${username}. Bad password count is now `
    + `${String(count)}. Whatever is typing them is not slowing down.`;
}

export function accountUnlockedMessage(username: string): string {
  return `User account ${username} was unlocked by the service desk.`;
}

export function passwordResetMessage(username: string): string {
  return `An attempt was made to reset the password of ${username}. It will `
    + 'be on a sticky note by lunchtime.';
}

export function accountDisabledMessage(username: string): string {
  return `User account ${username} was disabled. Somebody meant to do that.`;
}

export function accountEnabledMessage(username: string): string {
  return `User account ${username} was enabled.`;
}

export function printFailedMessage(name: string, queued: number): string {
  return `Jobs are stacking up on ${name}: ${String(queued)} queued and `
    + 'nothing moving. Four of them are the same delivery note.';
}

export function printQueueClearedMessage(name: string): string {
  return `The print queue on ${name} was emptied. Whatever was in it has gone `
    + 'wherever the odd socks go.';
}

export function slaMissedMessage(title: string): string {
  return `Service level objective missed for incident "${title}". This event `
    + 'is also being emailed to somebody who will read it on Monday.';
}
