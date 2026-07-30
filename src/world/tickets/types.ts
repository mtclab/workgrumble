import type { FieldValue } from '../../engine-api';
import type { TicketDef } from '../../engine-api';
import type { TicketArrival } from '../day';

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
