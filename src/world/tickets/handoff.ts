/**
 * The escalation handoff: the form, and what L2 does with a thin one.
 *
 * Escalating is not failure - it is a workflow, and the workflow has required
 * content: what the user reported, and what you already tried. A handoff
 * without those is the single most real mistake a first-line tech makes, so it
 * is not refused here. It is accepted, sent, and sent straight back with a
 * note, which is what actually happens.
 *
 * "What I tried" is not typed by anybody: the engine already keeps a dispatch
 * log for determinism, so the form is filled in from what the player DID to
 * this ticket's nodes. Pure functions over readable state, all of it.
 */

import type { DispatchLogEntry } from '../../engine-api';
import { HELPDESK_ACTIONS } from '../actions/ids';

/** One line of the "what I tried" list, as it goes onto the form. */
export interface TriedEntry {
  readonly tick: number;
  readonly text: string;
  /** False for the things that refused - which belong on the form too. */
  readonly worked: boolean;
}

/**
 * How each verb reads once it is a line on a handoff rather than a button.
 *
 * Written out because "account.unlock" is an id and a handoff is a sentence
 * somebody at L2 has to read at four in the afternoon. An action with no entry
 * falls back to its id, which is ugly on purpose: it is a content bug and it
 * should look like one.
 */
const ACTION_SUMMARIES: Readonly<Record<string, string>> = {
  [HELPDESK_ACTIONS.accountUnlock]: 'Unlocked the account',
  [HELPDESK_ACTIONS.accountResetPassword]: 'Reset the password',
  [HELPDESK_ACTIONS.accountAddToGroup]: 'Added the account to a group',
  [HELPDESK_ACTIONS.accountRemoveFromGroup]: 'Removed the account from a group',
  [HELPDESK_ACTIONS.serviceRestart]: 'Restarted the service',
  [HELPDESK_ACTIONS.machineSetDisplayRotation]: 'Put the display back round',
  [HELPDESK_ACTIONS.machineSetResolution]: 'Set the resolution',
  [HELPDESK_ACTIONS.machineReboot]: 'Rebooted it, obviously',
  [HELPDESK_ACTIONS.devicePowerCycle]: 'Turned it off and on again',
  [HELPDESK_ACTIONS.deviceReplaceBattery]: 'Replaced the battery',
  [HELPDESK_ACTIONS.mailRuleDelete]: 'Deleted the mail rule',
  [HELPDESK_ACTIONS.shareGrantAccess]: 'Granted access to the share',
  [HELPDESK_ACTIONS.printerClearQueue]: 'Cleared the print queue',
  [HELPDESK_ACTIONS.ticketAddWorknote]: 'Wrote a work note',
  [HELPDESK_ACTIONS.ticketAddComment]: 'Put a question to the reporter',
  [HELPDESK_ACTIONS.ticketSetWaiting]: 'Parked it on the reporter',
  [HELPDESK_ACTIONS.ticketClearWaiting]: 'Took it back off the reporter',
  [HELPDESK_ACTIONS.ticketClassify]: 'Triaged it',
};

export function actionSummary(id: string): string {
  return ACTION_SUMMARIES[id] ?? id;
}

/**
 * The "what I tried" list, read off the dispatch log.
 *
 * Only entries aimed at this ticket's own nodes count: the log is the whole
 * day, and "I restarted a service on the other side of the building" is not
 * evidence about this fault. The ticket's own bookkeeping verbs are left out
 * for the same reason - triaging a ticket is not something that was tried on
 * the problem.
 */
const NOT_WORK: ReadonlySet<string> = new Set<string>([
  HELPDESK_ACTIONS.ticketClassify,
  HELPDESK_ACTIONS.ticketEscalate,
  HELPDESK_ACTIONS.ticketAddWorknote,
]);

export function triedFromLog(
  log: readonly DispatchLogEntry[],
  nodes: readonly string[],
): readonly TriedEntry[] {
  const aimedHere = new Set(nodes);

  return log
    .filter((entry) => entry.target !== null
      && aimedHere.has(entry.target)
      && !NOT_WORK.has(entry.id))
    .map((entry) => ({
      tick: entry.tick,
      text: entry.ok
        ? actionSummary(entry.id)
        : `${actionSummary(entry.id)} - refused`,
      worked: entry.ok,
    }));
}

/** The form, as the player is about to send it. */
export interface Handoff {
  /** What the user reported, in the player's words. */
  readonly reported: string;
  readonly tried: readonly string[];
}

/**
 * Whether L2 will keep it.
 *
 * Both halves are required and neither is negotiable: a handoff with no
 * symptom is a ticket number, and one with nothing tried is a ticket number
 * with a name on it.
 */
export function isCompleteHandoff(handoff: Readonly<Handoff>): boolean {
  return handoff.reported.trim().length > 0
    && handoff.tried.some((line) => line.trim().length > 0);
}

export function whyThin(handoff: Readonly<Handoff>): string | null {
  if (handoff.reported.trim().length === 0) {
    return 'Nothing in "what the user reported". L2 will read the title and '
      + 'send it back, and they will be right to.';
  }

  if (!handoff.tried.some((line) => line.trim().length > 0)) {
    return 'Nothing in "what I tried". Sending that is asking somebody else '
      + 'to do the first ten minutes as well as the last.';
  }

  return null;
}

/** The lines the form joins into one field. */
export function joinLines(lines: readonly string[]): string {
  return lines.filter((line) => line.trim().length > 0).join('\n');
}

/* -- the bounce ----------------------------------------------------------- */

export interface BounceRule {
  /** Minutes L2 takes to not read it. */
  readonly delayTicks: number;
  /** What it costs when it lands back. */
  readonly reputationCost: number;
  /** The work note L2 writes on the way past. */
  readonly worknote: string;
  /** The mail thread that carries the bad news. */
  readonly mailRef: string;
}

export const HANDOFF_BOUNCE: BounceRule = Object.freeze({
  delayTicks: 20,
  reputationCost: 5,
  worknote: 'Returned by second line: handoff incomplete. Reproduce, record '
    + 'what you tried, then send it back with the words in it.',
  mailRef: 'mail/handoff-bounce',
});

/** When a bounce that was raised at `bouncedAt` actually lands. */
export function bounceLandsAt(bouncedAt: number): number {
  return bouncedAt + HANDOFF_BOUNCE.delayTicks;
}
