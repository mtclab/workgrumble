import type { FieldValue } from '../../engine/schema';
import { HELPDESK_ACTION_IDS, HELPDESK_ACTIONS } from '../actions';
import { type DialogueEffect, isRevealEffect } from './types';

export type DialogueEffectResult =
  | { ok: true }
  | { ok: false; reason: string };

/** How an effect reaches the world: the shell hands over its own dispatch. */
export type EffectDispatch = (
  action: string,
  target: string,
  params: Record<string, FieldValue>,
) => DialogueEffectResult;

export interface DialogueEffectContext {
  /** The ticket a `reveal` writes to. Absent for a chat with no ticket. */
  readonly ticket?: string | undefined;
  readonly dispatch: EffectDispatch;
}

/**
 * The allowlist is the helpdesk action registry itself, not a second list
 * beside it: a dialogue file cannot invent a verb the player does not have.
 */
const ALLOWED: ReadonlySet<string> = new Set<string>(HELPDESK_ACTION_IDS);

export function isDispatchableAction(action: string): boolean {
  return ALLOWED.has(action);
}

/**
 * Runs one dialogue effect. A reveal is not a special engine power - it is the
 * `ticket.add_clue` action, dispatched like everything else, so it validates,
 * refuses and shows up in the dispatch log the same way a button click does.
 */
export function applyDialogueEffect(
  effect: Readonly<DialogueEffect>,
  context: Readonly<DialogueEffectContext>,
): DialogueEffectResult {
  if (isRevealEffect(effect)) {
    if (context.ticket === undefined) {
      return {
        ok: false,
        reason: 'There is no ticket open for this conversation, so there is '
          + 'nowhere to write that down.',
      };
    }

    return context.dispatch(
      HELPDESK_ACTIONS.ticketAddClue,
      context.ticket,
      { clue: effect.reveal },
    );
  }

  if (!isDispatchableAction(effect.action)) {
    return {
      ok: false,
      reason: `"${effect.action}" is not something this workstation knows how `
        + 'to do. Somebody wrote a conversation cheque the helpdesk cannot '
        + 'cash.',
    };
  }

  return context.dispatch(
    effect.action,
    effect.target,
    { ...effect.params },
  );
}
