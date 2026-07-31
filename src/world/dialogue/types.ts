import type { FieldValue } from '../../engine-api';

/**
 * Dialogue is DATA. A tree is a bag of nodes with an entry point, and the only
 * things an option can do are: move to another node, dispatch a REGISTERED
 * action, write a clue onto the ticket, or record that the reporter was
 * actually asked something. There is no hook for "run this function", because
 * that is how a content file quietly becomes engine code.
 *
 * `reveal` and `asks` are shorthands, not extra powers: both come out as
 * ordinary helpdesk actions aimed at the tree's ticket.
 */

/** Dispatch a registered helpdesk action. Unknown ids are refused, not run. */
export interface DialogueActionEffect {
  readonly action: string;
  readonly target: string;
  readonly params?: Readonly<Record<string, FieldValue>>;
}

/** Write a line onto the tree's ticket - the vague-ticket payoff. */
export interface DialogueRevealEffect {
  readonly reveal: string;
}

/**
 * Put this line to the reporter on the record - the option is a QUESTION
 * asked of them, not a statement made at them. It lands in the ticket's
 * customer-visible stream, which is what buys the right to park the SLA on
 * them, and the line it writes is the one the player picked.
 */
export interface DialogueAskEffect {
  readonly asks: true;
}

export type DialogueEffect =
  | DialogueActionEffect
  | DialogueRevealEffect
  | DialogueAskEffect;

export function isRevealEffect(
  effect: Readonly<DialogueEffect>,
): effect is DialogueRevealEffect {
  return 'reveal' in effect;
}

export function isAskEffect(
  effect: Readonly<DialogueEffect>,
): effect is DialogueAskEffect {
  return 'asks' in effect;
}

export interface DialogueOption {
  readonly label: string;
  /** Node to move to. Omitted means the conversation reaches an end. */
  readonly next?: string;
  /**
   * Run in order when the option is picked. A list rather than a single
   * effect because one line of dialogue routinely does two things at once -
   * the right question both counts as asking AND gets the truth out of them.
   */
  readonly effects?: readonly DialogueEffect[];
}

export interface DialogueNode {
  readonly id: string;
  readonly npc_line: string;
  readonly options: readonly DialogueOption[];
}

export interface DialogueTree {
  readonly id: string;
  /** Person node who does the talking. */
  readonly speaker: string;
  /**
   * Where a conversation starts when nothing more specific applies: the person
   * with nothing open, and the fallback for a person with exactly one ticket.
   */
  readonly root: string;
  /**
   * The tickets this person reports, in the order they arrive.
   *
   * A list rather than a single id, because a week long enough to be a week has
   * people in it who report more than one thing. The receptionist whose printing
   * was fixed on Tuesday is the same receptionist who cannot reach the share on
   * Wednesday; the new starter who was given the mailbox on Tuesday is the same
   * new starter who cannot send from it an hour later, and that chain is the
   * entire lesson of those two tickets. One tree per person is what makes the
   * contact list a list of PEOPLE, and it is the only shape in which the
   * follow-up can arrive in the same conversation the first one closed in.
   *
   * Empty for somebody who is in the building and never files anything -
   * Facilities, whose whole contribution is a note on a socket.
   */
  readonly tickets: readonly string[];
  /**
   * Where the conversation starts for each of those tickets, keyed by ticket
   * id. Required once a person has more than one, because two different
   * complaints opening on the same line is a person who has not noticed which
   * of their problems you are ringing about.
   */
  readonly roots?: Readonly<Record<string, string>>;
  /** Where a conversation starts once the ticket in hand is closed. */
  readonly resolved_root?: string;
  /**
   * Where another system may DROP this conversation, unasked.
   *
   * The boss pinging you is not something the player navigated to: the chat
   * window opens itself with a question already in it. A node named here is a
   * legitimate entry point that nothing in the tree points at - which is also
   * how it stays unreachable until that system says so, so a question about a
   * ticket nobody has raised yet cannot be asked early.
   */
  readonly summoned_root?: string;
  readonly nodes: readonly DialogueNode[];
}
