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
  /**
   * What the player just said, word for word.
   *
   * An `asks` effect no longer sets a flag: it writes the question into the
   * ticket's customer-visible stream, and the question is the line the player
   * chose. Passing it in rather than duplicating it into every effect keeps
   * the conversation and the record of it the same sentence.
   */
  readonly said: string;
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
 * Runs one dialogue effect. Neither shorthand is a special engine power: a
 * reveal is `ticket.add_worknote` and an ask is `ticket.add_comment`,
 * dispatched like everything else, so both validate, refuse and show up in the
 * dispatch log the same way a button click does.
 *
 * They land in different streams on purpose. What the reporter let slip is
 * internal - it is what the player worked out, and it is nobody's business
 * outside the helpdesk. What the player ASKED is customer-visible, because
 * that is the only place a question the reporter could have seen can be, and
 * it is what buys the right to stop their clock.
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
      HELPDESK_ACTIONS.ticketAddWorknote,
      context.ticket,
      { note: effect.reveal },
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
      HELPDESK_ACTIONS.ticketAddComment,
      context.ticket,
      { comment: context.said },
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
