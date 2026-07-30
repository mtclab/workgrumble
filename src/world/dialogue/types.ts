import type { FieldValue } from '../../engine/schema';

/**
 * Dialogue is DATA. A tree is a bag of nodes with an entry point, and the only
 * things an option can do are: move to another node, dispatch a REGISTERED
 * action, or write a clue onto the ticket. There is no hook for "run this
 * function", because that is how a content file quietly becomes engine code.
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

export type DialogueEffect = DialogueActionEffect | DialogueRevealEffect;

export function isRevealEffect(
  effect: Readonly<DialogueEffect>,
): effect is DialogueRevealEffect {
  return 'reveal' in effect;
}

export interface DialogueOption {
  readonly label: string;
  /** Node to move to. Omitted means the conversation reaches an end. */
  readonly next?: string;
  readonly effect?: DialogueEffect;
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
  readonly nodes: readonly DialogueNode[];
}
