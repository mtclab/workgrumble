import type { FieldValue } from '../../engine-api';
import type { TicketDef } from '../../engine-api';
import type { TicketArrival } from '../day';
import type { Level } from '../priority';

/** Where a solution path is played. Lane B owns `chat` and `remote`. */
export type TicketPathApp =
  | 'about'
  | 'chat'
  | 'cmd'
  | 'directory'
  | 'remote'
  | 'tickets';

export interface TicketActionStep {
  readonly action: string;
  readonly target: string;
  readonly params?: Readonly<Record<string, FieldValue>>;
}

/**
 * One advertised way to close a ticket, as the sequence of registered actions
 * it comes down to. The UI path and the terminal path differ in skin only, so
 * the same steps stand behind both - and every one of them is driven at graph
 * level by `paths.test.ts`, which is what "advertised" has to mean.
 */
export interface TicketPath {
  readonly id: string;
  readonly app: TicketPathApp;
  readonly label: string;
  readonly steps: readonly TicketActionStep[];
}

export interface WorldTicket {
  readonly def: TicketDef;
  /**
   * The estate this ticket is about: what is broken, and anything broken with
   * it. Three things read it - the impact walk (how many people hang off
   * these), the response clock (a dispatched action aimed at one of these is a
   * touch) and the handoff form (which of the day's dispatches were about THIS
   * problem) - so it is written down once, per ticket, as content.
   */
  readonly nodes: readonly string[];
  /**
   * How urgent the reporter says it is, and how urgent it actually is.
   *
   * They are two fields because they are two different things, and the gap
   * between them is the priority trap: everybody who has ever raised a ticket
   * has raised a high-urgency one. The claim is what the player is shown; the
   * truth is what the review compares their triage against.
   */
  readonly claimed_urgency: Level;
  readonly true_urgency: Level;
  /**
   * When this ticket joins the day: waiting in the queue at 08:00, or arriving
   * during the shift. Declared per ticket rather than decided by the scheduler
   * because it is a content decision - the inherited pile is written to be the
   * first thing a player reads.
   */
  readonly arrival: TicketArrival;
  /**
   * Whether this ticket may be attached to a parent incident as a duplicate.
   *
   * It is a content decision and it is checked against the ticket's own
   * resolution rule at load: a duplicate carries an `or` branch on its
   * `parent_resolved` marker (see `closesWithParent`), and a ticket without
   * one can never be bulk-closed. The two have to agree, because the flag is
   * what the queue offers and the rule is what the engine enforces - and a
   * queue offering a close the engine refuses is a player left holding a
   * button that lies.
   */
  readonly duplicate?: boolean;
  /**
   * The ticket whose FIX raises this one.
   *
   * A chain, declared by the ticket at the end of it. Granting somebody access
   * to a shared mailbox is not the end of that job, it is the middle: an hour
   * later they are back because sending from it is a second permission with a
   * different name in a different place, and that follow-up cannot be a slot in
   * a day script because nobody knows when the first one will be fixed. So the
   * roster says which ticket raises it and the day loop raises it in the minute
   * that one closes.
   *
   * A ticket with this set arrives `summoned`: the week deals it no slot, for
   * the same reason it deals none to the concern the lead raises by mentioning
   * it.
   */
  readonly follows?: string;
  /** The real cause, for KB articles and chat reveals (lane B). */
  readonly cause: string;
  /** Dialogue tree id the reporter answers with. Lane B renders it. */
  readonly dialogue_ref: string;
  readonly paths: readonly TicketPath[];
}
