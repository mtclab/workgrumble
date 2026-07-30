import type { DispatchResult } from '../../engine-api';
import type { FieldValue } from '../../engine-api';
import { HELPDESK_ACTION_IDS, HELPDESK_ACTIONS } from '../actions';
import { type DialogueEffect, isAskEffect, isRevealEffect } from './types';

/**
 * The same answer a dispatched action gives, because that is exactly what an
 * effect is. Kept as an alias so a caller can hand its own `dispatch` over
 * without adapting between two identical shapes.
 */
export type DialogueEffectResult = DispatchResult;

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

  if (isAskEffect(effect)) {
    if (context.ticket === undefined) {
      return {
        ok: false,
        reason: 'There is no ticket behind this conversation, so there is '
          + 'no clock this question could ever stop.',
      };
    }

    return context.dispatch(
      HELPDESK_ACTIONS.ticketMarkAsked,
      context.ticket,
      {},
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

/** What a whole option did: the effects that landed, and the first that did not. */
export interface DialogueEffectsOutcome {
  readonly done: readonly DialogueEffect[];
  readonly refusal: string | null;
}

/**
 * Runs every effect an option carries, in written order.
 *
 * One refused effect does not cancel the rest: asking the right question both
 * counts as asking AND writes the answer down, and re-asking it must still
 * leave the first half true even though the second half refuses as a repeat.
 */
export function applyDialogueEffects(
  effects: readonly DialogueEffect[],
  context: Readonly<DialogueEffectContext>,
): DialogueEffectsOutcome {
  const done: DialogueEffect[] = [];
  let refusal: string | null = null;

  for (const effect of effects) {
    const result = applyDialogueEffect(effect, context);

    if (result.ok) {
      done.push(effect);
    } else if (refusal === null) {
      refusal = result.reason;
    }
  }

  return { done, refusal };
}
