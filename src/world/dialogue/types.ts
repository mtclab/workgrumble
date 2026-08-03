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

/**
 * The register a reply is said in.
 *
 * `neutral` is how every line in the building has always been said, and an
 * option with no tone at all is neutral by omission - which is what keeps every
 * conversation written before this slice byte-for-byte the reply it was. The
 * enum is open on purpose: the parked tones design (wry / cheerful / sarcastic /
 * exhausted) slots more registers in later as CONTENT on this same framework,
 * and each one that arrives is a value here and a social effect beside it, never
 * a new power.
 */
export type DialogueTone = 'neutral' | 'aggressive';

/**
 * The registered actions that ARE a social consequence rather than ticket work.
 *
 * This is the load-bearing line of the whole tone framework. A toned option's
 * effects are the SAME ticket-work effects the neutral reply on that beat would
 * run, PLUS one of these - so the tone can only ever ADD a social cost and can
 * never change or drop the fix. The gate in `index.ts` reads this set to prove
 * it: the ticket-work effects of an aggressive option and its neutral twin on a
 * beat have to be identical, and the only thing allowed to differ is which of
 * these is on the end.
 */
export const SOCIAL_ACTIONS: ReadonlySet<string> = new Set<string>([
  'reporter.rebuff',
]);

/** Whether an effect is a social consequence rather than ticket work. */
export function isSocialEffect(effect: Readonly<DialogueEffect>): boolean {
  return 'action' in effect && SOCIAL_ACTIONS.has(effect.action);
}

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
  /**
   * The register the line is said in. Absent is `neutral`, and a neutral option
   * behaves exactly as it did before tones existed - no social effect, no cost,
   * no test that moves. An `aggressive` option is the same ticket work said
   * rudely, with a `reporter.rebuff` on the end to pay for it.
   */
  readonly tone?: DialogueTone;
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
   * And the same, per ticket: what they say about THAT fix.
   *
   * The reaction is where a conversation pays off - the woman who told two
   * people she had been hacked, the man whose mouse turns out to have had
   * batteries in it all along - and a person with three tickets who says the
   * same sentence after each of them is a person with one joke.
   */
  readonly resolved_roots?: Readonly<Record<string, string>>;
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
  /**
   * Where a CALL opens, for each interruption this person is scheduled to
   * make.
   *
   * A list rather than the single `summoned_root` above, and keyed by nothing:
   * a person can be summoned one way - the boss pings, Terry asks a favour -
   * and can also ring twice in a week about two different things, so the
   * interruption's own flavor names which of these nodes it opens on rather
   * than the tree deciding. Each one is an entry point nothing in the tree
   * points at, which is what keeps a conversation about a call that has not
   * happened unreachable from the chat window.
   */
  readonly call_roots?: readonly string[];
  /**
   * Where a conversation opens when they have said "Hi." and nothing else.
   *
   * An entry point of its own rather than a reuse of `summoned_root`, because
   * the two are different beats and a tree can carry both: being asked a
   * favour is a message with the whole question in it, and this is a message
   * with none of it. The node here says the greeting; its only option is the
   * player asking what they want, and its `next` is the question they were
   * going to get round to. Waiting gets the same node by the same road, several
   * minutes later, which is the joke and the cost.
   *
   * Nothing in the tree points at it, so it stays unreachable from the chat
   * window until the day drops the conversation on it.
   */
  readonly hello_root?: string;
  readonly nodes: readonly DialogueNode[];
}
