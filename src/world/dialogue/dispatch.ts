import type { DispatchResult } from '../../engine-api';
import type { FieldValue } from '../../engine-api';
import {
  HELPDESK_ACTION_IDS,
  HELPDESK_ACTIONS,
  isRemediationAction,
} from '../actions';
import { DIALOGUE_TREES } from './trees';
import {
  type DialogueEffect,
  type DialogueTree,
  isAskEffect,
  isRevealEffect,
} from './types';

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
 * The registry itself: a dialogue file cannot invent a verb the player does not
 * have. This is the check the load-time content gate makes, and it is about
 * TYPOS and content that has drifted off the verb set.
 */
const REGISTERED: ReadonlySet<string> = new Set<string>(HELPDESK_ACTION_IDS);

export function isRegisteredAction(action: string): boolean {
  return REGISTERED.has(action);
}

/** Every verb the shipped conversations dispatch, read off the trees at load. */
export function dialogueEffectVerbs(
  trees: readonly DialogueTree[],
): ReadonlySet<string> {
  const verbs = new Set<string>();

  for (const tree of trees) {
    for (const node of tree.nodes) {
      for (const option of node.options) {
        for (const effect of option.effects ?? []) {
          if (!isRevealEffect(effect) && !isAskEffect(effect)) {
            verbs.add(effect.action);
          }
        }
      }
    }
  }

  return verbs;
}

/**
 * The verbs a dialogue effect may actually send - the ones the shipped trees
 * use, and nothing else.
 *
 * It WAS the whole helpdesk registry, which read as "a conversation cannot
 * invent a verb" and meant "a conversation inherits every verb there is". The
 * difference is not theoretical: a dispatched effect goes through the shell's
 * own `dispatch` and NOT through the remediation seam, so the fifty-four-verb
 * allowlist quietly said that any scripted line could restart a service on a
 * customer's server with no tenant STOP, no contract wall and no RACI stamp in
 * front of it. Nothing shipped does - which is what made it a latent hole
 * rather than a bug - and a latent hole is a hole.
 *
 * DERIVED, not hard-coded, and that is load-bearing twice over. It cannot go
 * stale against the trees, and two people writing conversations in parallel
 * cannot collide on a list neither of them edited: a new verb in a tree is in
 * this set the moment the tree is.
 *
 * Which makes the RUNTIME refusal below a tautology for shipped content, and
 * that is stated rather than hidden (0.38.0 review): every shipped effect is
 * in this set by construction, so the check can only fire for dynamically
 * built dialogue no version ships yet - defence in depth, not the gate. The
 * gate with teeth is the load-time remediation check: a new NON-remediation
 * verb rides in silently by design (it moves nothing a wall protects), and a
 * remediation verb refuses to load without a named allowance.
 */
const ALLOWED: ReadonlySet<string> = dialogueEffectVerbs(DIALOGUE_TREES);

export function isDispatchableAction(action: string): boolean {
  return ALLOWED.has(action);
}

/**
 * The remediations conversation IS allowed to carry, each with the reason it
 * is not the hazard above.
 *
 * Derivation narrows the list; this is where the narrowing gets teeth. Every
 * one of these is in-house work - the corporate floor and the desk's own staff,
 * employers with no customers and therefore no contract, no tenant and no RACI
 * to be on the wrong side of - so the walls the seam applies have nothing to
 * say about them and routing them through it would change nothing.
 *
 * An MSP conversation offering a fix is the case this map exists to stop
 * arriving silently. It would land HERE, in a diff somebody has to write a
 * sentence into, and the honest sentence to write is not an entry in this map:
 * it is that the dialogue dispatcher needs the seam, which is a slice rather
 * than a line.
 */
const ALLOWED_REMEDIATIONS: ReadonlyMap<string, string> = new Map([
  [
    HELPDESK_ACTIONS.machineSetDisplayRotation,
    'Ada\'s rotated screen, on the corporate floor: the first joke in the '
      + 'game, on a desk the employer owns outright.',
  ],
  [
    HELPDESK_ACTIONS.machineReboot,
    'The turn-it-off-and-on-again beats, in-house on both floors.',
  ],
  [
    HELPDESK_ACTIONS.accountVerifyIdentity,
    'The caller-verification beat: the whole point is that it happens IN the '
      + 'conversation, with the person on the phone, and it is a colleague.',
  ],
  [
    HELPDESK_ACTIONS.accountRegisterMfa,
    'The other half of that call - enrolling the factor while they are on the '
      + 'line - and the same colleague.',
  ],
  [
    HELPDESK_ACTIONS.accountResetPassword,
    'The reset that follows a verification that actually happened, in-house.',
  ],
  [
    HELPDESK_ACTIONS.facilitiesStickyNote,
    'The sticky note on somebody\'s own monitor. It is a machine verb because '
      + 'the note is stuck to a machine, and it is nobody\'s estate but ours.',
  ],
]);

/**
 * Why this verb may not be a dialogue effect, or null when it may.
 *
 * The half of the load-time gate that knows about verbs; the content gate in
 * `index.ts` is the half that knows which tree and which option, and it puts
 * the two together in the throw - because the person reading that message is
 * the person who just wrote the option, and "which conversation" is the first
 * thing they will ask.
 */
export function dialogueRemediationRefusal(action: string): string | null {
  if (!isRemediationAction(action) || ALLOWED_REMEDIATIONS.has(action)) {
    return null;
  }

  return `"${action}" changes an estate the customer walls apply to. A `
    + 'dialogue effect does not go through the remediation seam, so it meets '
    + 'no tenant STOP, no contract scope and no RACI stamp. Widen the '
    + 'allowance in "dialogue/dispatch.ts" only if this conversation is '
    + 'in-house; otherwise the dispatcher needs the seam first.';
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
