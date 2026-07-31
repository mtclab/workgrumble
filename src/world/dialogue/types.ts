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
  /** Where a conversation starts while the ticket is still open. */
  readonly root: string;
  /**
   * The ticket this conversation is about, if any. It is what a `reveal`
   * writes to, and what decides which root the thread opens on.
   */
  readonly ticket?: string;
  /** Where a conversation starts once that ticket is closed. */
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
