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
  /** The real cause, for KB articles and chat reveals (lane B). */
  readonly cause: string;
  /** Dialogue tree id the reporter answers with. Lane B renders it. */
  readonly dialogue_ref: string;
  readonly paths: readonly TicketPath[];
}
