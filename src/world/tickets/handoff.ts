/**
 * The escalation handoff: the form, and what L2 does with a thin one.
 *
 * Escalating is not failure - it is a workflow, and the workflow has required
 * content: what the user reported, and what you already tried. A handoff
 * without those is the single most real mistake a first-line tech makes, so it
 * is not refused here. It is accepted, sent, and sent straight back with a
 * note, which is what actually happens.
 *
 * "What I tried" is not typed by anybody: it is filled in from what the player
 * DID to this ticket's nodes, recorded onto the ticket as they did it. Pure
 * functions over readable state, all of it.
 */

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
  [HELPDESK_ACTIONS.accountEnable]: 'Enabled the account again',
  [HELPDESK_ACTIONS.accountAddToGroup]: 'Added the account to a group',
  [HELPDESK_ACTIONS.accountRemoveFromGroup]: 'Removed the account from a group',
  [HELPDESK_ACTIONS.accountVerifyIdentity]: 'Verified who they were first',
  [HELPDESK_ACTIONS.accountRegisterMfa]: 'Enrolled a new authenticator',
  [HELPDESK_ACTIONS.accountRevokeSessions]: 'Signed every device out',
  [HELPDESK_ACTIONS.accountAssignLicence]: 'Gave the account a licence seat',
  [HELPDESK_ACTIONS.accountRevokeLicence]: 'Took a licence seat back',
  [HELPDESK_ACTIONS.serviceRestart]: 'Restarted the service',
  [HELPDESK_ACTIONS.serviceRenewCertificate]: 'Renewed the certificate',
  [HELPDESK_ACTIONS.deviceForgetCredentials]: 'Cleared the stored password',
  [HELPDESK_ACTIONS.mailRuleEnable]: 'Switched the mail rule on',
  [HELPDESK_ACTIONS.facilitiesStickyNote]: 'Got a note put on the socket',
  [HELPDESK_ACTIONS.securityFollowLink]: 'Followed the link. Yes. That one',
  [HELPDESK_ACTIONS.machineSetDisplayRotation]: 'Put the display back round',
  [HELPDESK_ACTIONS.machineReboot]: 'Rebooted it, obviously',
  [HELPDESK_ACTIONS.devicePowerCycle]: 'Turned it off and on again',
  [HELPDESK_ACTIONS.deviceReplaceBattery]: 'Replaced the battery',
  [HELPDESK_ACTIONS.shareGrantAccess]: 'Granted access to the share',
  [HELPDESK_ACTIONS.printerClearQueue]: 'Cleared the print queue',
  [HELPDESK_ACTIONS.ticketAddWorknote]: 'Wrote a work note',
  [HELPDESK_ACTIONS.ticketAddComment]: 'Put a question to the reporter',
  [HELPDESK_ACTIONS.ticketReplyToReporter]: 'Wrote back to the reporter',
  [HELPDESK_ACTIONS.ticketSetWaiting]: 'Parked it on the reporter',
  [HELPDESK_ACTIONS.ticketClearWaiting]: 'Took it back off the reporter',
  [HELPDESK_ACTIONS.ticketClassify]: 'Triaged it',
  [HELPDESK_ACTIONS.ticketLinkArticle]: 'Linked the knowledge article',
  [HELPDESK_ACTIONS.ticketLinkToParent]: 'Attached it to a parent incident',
};

export function actionSummary(id: string): string {
  return ACTION_SUMMARIES[id] ?? id;
}

/**
 * What counts as having been TRIED on the fault.
 *
 * The ticket's own bookkeeping is not work on the problem: triaging one,
 * writing a note about one and escalating one are things done to the ticket,
 * and a handoff that lists them is a handoff that says "I filled this form in"
 * where second line asked what happens when you power-cycle it.
 */
const NOT_WORK: ReadonlySet<string> = new Set<string>([
  HELPDESK_ACTIONS.ticketClassify,
  HELPDESK_ACTIONS.ticketEscalate,
  HELPDESK_ACTIONS.ticketAddWorknote,
  HELPDESK_ACTIONS.ticketRecordTouch,
  HELPDESK_ACTIONS.ticketRecordResponse,
  // Reading the knowledge base is not something that was done to the fault,
  // and it is emphatically not contact with the reporter: a handoff listing
  // "linked an article" where L2 asked what happens when you power-cycle it is
  // a form that answers the wrong question, and a response clock stopped by it
  // would be a clock stopped by somebody reading.
  HELPDESK_ACTIONS.ticketLinkArticle,
  // Bookkeeping on the ticket rather than work on the fault: attaching a
  // duplicate to its parent is filing, and the parent's own close is the day
  // loop telling forty people at once.
  HELPDESK_ACTIONS.ticketLinkToParent,
  HELPDESK_ACTIONS.ticketResolveWithParent,
  // A machine writing its own history is not somebody working the fault, and
  // it must never be: the event log is written as the world moves, by the
  // world, and a response clock stopped by a machine noticing its own spooler
  // had fallen over would be a clock stopped by nobody.
  HELPDESK_ACTIONS.machineRecordEvent,
]);

export function countsAsWork(actionId: string): boolean {
  return !NOT_WORK.has(actionId);
}

/**
 * How much of it a ticket keeps.
 *
 * The evidence lives on the ticket rather than in the dispatch log because the
 * log is drained at every day boundary - see the checkpoint policy - and a
 * ticket worked on Monday and escalated on Tuesday would otherwise reach
 * second line claiming nobody had ever looked at it. It is bounded for the
 * same reason the log is: this is a field in every save from here on, and the
 * last twenty things you did to a printer is already more than anybody at L2
 * is going to read.
 */
export const TOUCH_LOG_LIMIT = 20;

const TOUCH_SEPARATOR = '|';

/** One touch, as the ticket keeps it: `tick|action|ok`. */
export function encodeTouch(
  tick: number,
  actionId: string,
  ok: boolean,
): string {
  return [String(tick), actionId, ok ? '1' : '0'].join(TOUCH_SEPARATOR);
}

function decodeTouch(line: string): TriedEntry | null {
  const parts = line.split(TOUCH_SEPARATOR);
  const [tick, actionId, ok] = parts;
  // `Number('')` is zero, which is a perfectly good tick and not what an empty
  // field means.
  const at = tick === undefined || tick.length === 0 ? Number.NaN : Number(tick);

  if (
    parts.length !== 3
    || actionId === undefined
    || actionId.length === 0
    || (ok !== '0' && ok !== '1')
    || !Number.isSafeInteger(at)
    || at < 0
  ) {
    return null;
  }

  const worked = ok === '1';

  return {
    tick: at,
    text: worked ? actionSummary(actionId) : `${actionSummary(actionId)} - refused`,
    worked,
  };
}

/**
 * The "what I tried" list, read off the ticket's own record of it.
 *
 * A line this build cannot read is dropped rather than shown: a save is a file
 * on the player's machine, anything can have been at it, and a handoff form
 * that renders `undefined - refused` is worse than one line shorter.
 */
export function triedFromTouches(value: unknown): readonly TriedEntry[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map(decodeTouch)
      .filter((entry): entry is TriedEntry => entry !== null),
  );
}

/**
 * The ticket's evidence with one more touch on the end, oldest dropped once it
 * is full. Pure: the caller dispatches the result, so the whole field is one
 * value in the log and a replay writes exactly the same string.
 */
export function withTouch(
  existing: unknown,
  tick: number,
  actionId: string,
  ok: boolean,
): string {
  const lines = typeof existing === 'string' && existing.length > 0
    ? existing.split('\n').filter((line) => line.length > 0)
    : [];

  lines.push(encodeTouch(tick, actionId, ok));
  return lines.slice(-TOUCH_LOG_LIMIT).join('\n');
}

/** The form, as the player is about to send it. */
export interface Handoff {
  /** What the user reported, in the player's words. */
  readonly reported: string;
  readonly tried: readonly string[];
}

/**
 * What is missing, or null when nothing is.
 *
 * The reason this is the primitive and "is it complete" is derived from it:
 * the form has to TELL the player which half is missing, so the rule and the
 * sentence explaining it must be the same piece of code. Two of them drift.
 */
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

/**
 * Whether L2 will keep it. Both halves are required and neither is
 * negotiable: a handoff with no symptom is a ticket number, and one with
 * nothing tried is a ticket number with a name on it.
 */
export function isCompleteHandoff(handoff: Readonly<Handoff>): boolean {
  return whyThin(handoff) === null;
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
