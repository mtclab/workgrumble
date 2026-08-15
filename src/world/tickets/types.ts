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
  /**
   * A step this path takes that the CLOSE does not depend on.
   *
   * There is exactly one shape of these in this game and it is the whole of
   * the MFA ticket: checking who you are talking to before you bind a new
   * authenticator to their account. The enrolment closes the ticket either
   * way - that is the trap, and a world that refused the enrolment without a
   * check would be a world doing the checking - and the difference turns up a
   * day later in somebody else's incident report.
   *
   * It is declared rather than inferred because the solvability gate proves
   * NECESSITY: omit a step, and the ticket must not close. Without a way to
   * say "this one is different", the only ways to keep that gate green would
   * be to delete the check from the path or to weaken the gate, and both of
   * those are how a decorative step gets shipped.
   *
   * The flag is itself checked. A step marked this way MUST still close the
   * ticket when it is left out, or the claim is a lie and the gate says so -
   * so it cannot be sprinkled on a step to silence a real failure.
   */
  readonly optional_for_closure?: boolean;
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
   * WHO THE TICKET IS FOR, when that is not the person who typed it (E9,
   * 0.37.0) - the executive's assistant filing on the executive's behalf.
   *
   * A PERSON NODE rather than the display line the ticket ends up carrying,
   * because the whole point of naming them is that the VIP flag is read off
   * them: a name in a string cannot be asked whether it is on the list, and a
   * second authored copy of somebody's job title is a second answer to who
   * they are. The spawn seam resolves the line off the estate and stamps it, so
   * the ticket says whose it is and the flag beside it agrees by construction.
   *
   * This is the audit rung's own lesson made true at spawn (`audit.ts`: "It
   * keys off the beneficiary"). Absent on nearly everything, which is the
   * ordinary case - people mostly report their own problems.
   */
  readonly beneficiary?: string;
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
  /**
   * The PROJECT PHASE this task belongs to (E10, 0.29.0), when it is a project
   * task rather than a service ticket.
   *
   * It changes exactly one thing and the reason is the whole distinction the
   * epic is about: a project task is PLANNED work, so its clock is the phase's
   * BAKED DATE rather than a duration measured from whenever it happened to
   * arrive. A task raised at eleven because the phase before it finished early
   * is still due at three; a duration from spawn would quietly reward finishing
   * late, which is the exact opposite of what a deadline is for. It is also kept
   * off the customer's SLA ladder, which answers a different question - how fast
   * is a FAULT of theirs answered - that nobody asked about a scheduled job.
   *
   * Everything else about it is an ordinary ticket, deliberately: the queue row,
   * the touch evidence, the handoff form and the graph-matched resolution rule
   * all come free, which is the entire reason project tasks ARE tickets here.
   *
   * A reactive ticket the project causes - a factory ringing up because
   * something stopped working - is NOT one of these. That is a customer with a
   * fault, on the customer's clock, like every other fault in the queue.
   */
  readonly project?: {
    /** The project node whose schedule this task is measured against. */
    readonly of: string;
    /** Which baked date on it this task is due by. */
    readonly due: string;
  };
  /** The real cause, for KB articles and chat reveals (lane B). */
  readonly cause: string;
  /** Dialogue tree id the reporter answers with. Lane B renders it. */
  readonly dialogue_ref: string;
  readonly paths: readonly TicketPath[];
}
