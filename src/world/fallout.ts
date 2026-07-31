/**
 * Two things the world keeps doing after you have stopped looking at it.
 *
 * A tablet in a warehouse cupboard offers a password that was changed in the
 * spring, every few minutes, forever, and the directory counts. And an
 * enrolment that nobody verified turns into somebody else's incident report,
 * about a day later, which is exactly how long it takes.
 *
 * Both are pure reads. They answer "what is due right now" and the day loop
 * dispatches the verbs, for the same reason everything else in this codebase is
 * shaped that way: a replay has to arrive at the same numbers, and it can only
 * do that if the decision is a function of the world and the tick.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { dayForTick, SHIFT_MINUTES } from './hours';
import { FIELDS, LOCKOUT_THRESHOLD } from './fields';

/**
 * How long a check of who somebody is stays good for.
 *
 * A working day, which is what the desk means when it says "I have already
 * checked who you are today" - and deliberately not longer. A verification
 * done speculatively on Monday used to satisfy an enrolment on Wednesday
 * forever, which is not a security control, it is a box that was ticked once.
 */
export const IDENTITY_VERIFICATION_TICKS = SHIFT_MINUTES;

/**
 * The ways somebody at this desk may prove who they are before an
 * authenticator is bound to a new device.
 *
 * All four are the same shape and it is the shape that matters: the evidence
 * was arranged BEFORE the call, and it is held by the account rather than
 * offered by the caller. A payroll number, a hiring manager and the desk
 * somebody sits at are none of those things - they are on a payslip, a company
 * blog and a seating plan, and the person ringing at ten to five in a hurry can
 * have all three.
 *
 * The list is short on purpose. A desk with nine approved channels has no
 * approved channels.
 */
export const VERIFICATION_METHODS = {
  /** Ring them back on the number the directory already holds. */
  callback: 'registered_callback',
  /** A one-time code issued at enrolment, before anybody needed it. */
  recoveryCode: 'recovery_code',
  /** They are standing in front of you with a pass on. */
  inPerson: 'in_person',
  /** A person nominated in advance, confirming it is them. */
  recoveryContact: 'recovery_contact',
} as const;

export type VerificationMethod =
  (typeof VERIFICATION_METHODS)[keyof typeof VERIFICATION_METHODS];

export const VERIFICATION_METHOD_LABELS: Readonly<
  Record<VerificationMethod, string>
> = {
  [VERIFICATION_METHODS.callback]: 'a callback to the number on file',
  [VERIFICATION_METHODS.recoveryCode]: 'the recovery code issued at enrolment',
  [VERIFICATION_METHODS.inPerson]: 'an in-person check at the desk',
  [VERIFICATION_METHODS.recoveryContact]: 'a confirmed recovery contact',
};

export function isVerificationMethod(
  value: unknown,
): value is VerificationMethod {
  return typeof value === 'string'
    && Object.values(VERIFICATION_METHODS).some((method) => method === value);
}

/** What the account carries: one approved channel per line. */
export function verificationChannels(
  methods: readonly VerificationMethod[],
): string {
  return methods.join('\n');
}

/**
 * How often something with a stored password tries it.
 *
 * Five minutes, which is short enough that a player who unlocks the account and
 * does nothing else watches it shut again inside their own shift - the whole
 * point of the ticket - and long enough that the Event Viewer reads as a
 * pattern rather than as a wall.
 */
export const STALE_LOGON_INTERVAL = 5;

export interface StaleLogon {
  readonly device: string;
  readonly account: string;
  /** What the directory's count becomes when this attempt is written. */
  readonly count: number;
}

/** The account at the desk a device is plugged into, if there is one. */
function accountBehind(
  graph: ReadOnlyGraphView,
  deviceId: string,
): string | undefined {
  return graph
    .neighbors(deviceId, { direction: 'out', edgeKind: 'connected_to' })
    .filter((host) => host.kind === 'machine')
    .flatMap((host) => graph
      .neighbors(host.id, { direction: 'in', edgeKind: 'owns' })
      .filter((owner) => owner.kind === 'person'))
    .flatMap((owner) => graph
      .neighbors(owner.id, { direction: 'out', edgeKind: 'owns' })
      .filter((owned) => owned.kind === 'account'))
    .map(({ id }) => id)[0];
}

/**
 * Every wrong password something is about to try, this minute.
 *
 * Only on the interval, and only against an account that is currently open: a
 * device does not stop offering the password when the door shuts, but the
 * directory has nothing left to count, and a log filling up with attempts
 * against an already-locked account is noise on the one screen that has to
 * stay readable.
 */
export function staleLogonsDue(
  graph: ReadOnlyGraphView,
  now: number,
): readonly StaleLogon[] {
  if (now % STALE_LOGON_INTERVAL !== 0) {
    return [];
  }

  return graph.nodesOfKind('device').flatMap((device) => {
    if (device.fields[FIELDS.storedCredential] !== true) {
      return [];
    }

    const account = accountBehind(graph, device.id);

    if (account === undefined
      || graph.getField(account, FIELDS.locked) === true) {
      return [];
    }

    const seen = graph.getField(account, FIELDS.badPwCount);
    const count = (typeof seen === 'number' && seen >= 0 ? seen : 0) + 1;

    return [{ device: device.id, account, count: Math.min(count, LOCKOUT_THRESHOLD) }];
  });
}

/**
 * Every enrolment that is about to come back on somebody.
 *
 * The condition is the whole lesson written as a query: a second factor was
 * bound to a new device, nobody checked who they were talking to first, and it
 * has been long enough for the person it was NOT to have used it. A day, which
 * is why the day is in the test - firing it the same evening would make it a
 * punishment for the click rather than a consequence of the omission.
 *
 * "Nobody checked" is read off the LATCH the enrolment wrote rather than off
 * the account's verification stamp, and that is the load-bearing half. The
 * stamp can be written at any time, so reading it later answered a different
 * question - "has anybody ever checked" - and the answer to that one could be
 * changed after the fact by verifying the next morning, which cancelled a
 * consequence that had already been earned.
 */
export function socialEngineeringDue(
  graph: ReadOnlyGraphView,
  now: number,
): readonly string[] {
  const today = dayForTick(now);

  return graph.nodesOfKind('account').flatMap((account) => {
    const enrolled = account.fields[FIELDS.mfaEnrolledAt];

    if (typeof enrolled !== 'number' || dayForTick(enrolled) >= today) {
      return [];
    }

    return account.fields[FIELDS.mfaEnrolmentVerified] === true
      || typeof account.fields[FIELDS.securityFalloutAt] === 'number'
      ? []
      : [account.id];
  });
}
