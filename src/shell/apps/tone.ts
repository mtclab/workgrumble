import {
  type DialogueEffectsOutcome,
  type DialogueOption,
  isSocialEffect,
} from '../../world/dialogue';

/**
 * The one thing on this surface: what witnessing a rude reply needs from the
 * day. Narrowed to a single method so the shared settle below is trivial to
 * test and cannot reach anything else.
 */
export interface RudeWitness {
  witnessedRudeReply(): boolean;
}

/**
 * The social half of an aggressive reply, shared by EVERY surface that plays a
 * dialogue option.
 *
 * This exists because the boss consequence used to live inline in the chat app,
 * so a rude reply sent from a CALL - same DialogueOption data, same effects -
 * never fired the caught-scene beat even with the lead at your shoulder. The
 * reputation and the reporter's reaction ride the `reporter.rebuff` effect and
 * so were always paid; the WITNESS was the part a surface could forget. Routing
 * it through one function means a third surface added later gets it for free and
 * cannot silently skip it.
 *
 * It fires only when the option is actually aggressive AND its social effect
 * genuinely landed (`played.done` carries the rebuff) - a refused rebuff is not
 * a snap the lead can have heard. It answers with the note to show, or null.
 */
export function settleAggressiveTone(
  day: RudeWitness,
  option: Readonly<DialogueOption>,
  played: Readonly<DialogueEffectsOutcome>,
): string | null {
  if (option.tone !== 'aggressive' || !played.done.some(isSocialEffect)) {
    return null;
  }

  // The fix has already happened - the effect list is the neutral one plus the
  // rebuff - so this is only the social half: reputation is gone, the reporter
  // has reacted, and if the lead was in the room he heard it.
  return day.witnessedRudeReply()
    ? 'Said, and the ticket still fixed. The lead was standing right there, '
      + 'and it has gone on your file.'
    : 'Said, and the ticket still fixed. It cost you reputation, and they will '
      + 'remember the tone.';
}
