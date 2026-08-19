/**
 * The out-of-scope ask (E9, 0.38.0): the request whose whole content is work
 * nobody signed for, and the three answers a real MSP is told to give it.
 *
 * This is NOT the scope wall. The wall (`customers.ts`, 0.11.0) is about a BOX:
 * a helpdesk contract does not reach a server, and the estate refuses the
 * command. Nothing here refuses anything - the ask arrives as an ordinary
 * ticket, from an ordinary customer, and every one of the three answers is
 * allowed. What differs is what each of them costs, and the costs are sourced
 * rather than invented (`docs/research/titles-customer-types.md` 3.5, with 3.3
 * on tier-limit overruns as an upgrade conversation and 5.1 on the man who
 * became "the most expensive Level 1 helpdesk agent in town"):
 *
 *  - REFUSE-AND-OFFER is the script the industry actually publishes: point at
 *    the signed agreement, and in the same breath offer to prepare a quote. It
 *    costs nothing, it earns nothing, and the reporter is mildly deflated
 *    rather than angry. The script exists because it works.
 *  - QUOTE-AND-WAIT is the same script taken up: "inform, estimate time and
 *    cost, get approval before proceeding". Writing the estimate is WORK -
 *    `SCOPE_QUOTE_MINUTES` off the shift, on the customer's own line of the
 *    timesheet - and then the ticket parks on the customer through the shipped
 *    hold rails while they decide. Approved, the work is a real billable task.
 *    Declined, the ticket closes with nothing owed and the estimate was the
 *    afternoon you spent on it.
 *  - JUST DO IT is the fun one and the one that costs you. It resolves in the
 *    minute it is pressed, which is why anybody does it. The minutes are
 *    UNBILLED - the sheet says `unbilled` beside them, real work on nobody's
 *    invoice - and it TRAINS THE CUSTOMER: the same shape of ask comes back,
 *    once and bigger, with "you did it last time" written on it. Scope creep
 *    is defined in the sources as exactly that: "the tiny request your client
 *    asks you to do once, outside your agreed-upon contract, that can balloon
 *    into many requests for which you aren't compensated."
 *
 * WHAT IS AND IS NOT IN HERE. This module is the world's arithmetic: the words
 * an outcome can be, the two clocks the middle states start, and the pure reads
 * the day driver settles off. The VERBS are `actions/scope.ts`, the ASKS are
 * content (`tickets/msp.ts`), and the only thing authored here is the table
 * below, which says which of the shipped asks the customer will pay for and
 * which one they will not.
 *
 * Nothing here reads a wall clock, mutates anything, or consumes the RNG. The
 * approval is a CONTENT FACT keyed by ticket id, not a roll: the engine bans
 * `Math.random`, and a quote whose answer depended on when you pressed it would
 * be a mechanic nobody could learn.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { FIELDS } from './fields';

/* -- which way it went ---------------------------------------------------- */

/**
 * The six words the outcome field can hold, and the seam between them.
 *
 * Four are TERMINAL - the ticket's own resolution rule watches for them, so
 * reaching one closes the ticket - and two are not, which is the whole of what
 * makes the quote a wait rather than a slower yes.
 */
export const SCOPE_OUTCOMES = {
  /** Pointed at the agreement, offered the quote. Closed, nothing owed. */
  refused: 'refused',
  /** The estimate is written and with them. Parked on the customer. */
  quoted: 'quoted',
  /** They said yes. Open again, and now it is a job somebody is paying for. */
  approved: 'approved',
  /** They said no. Closed, nothing owed, the estimate spent. */
  declined: 'declined',
  /** Done anyway, off contract: unbilled, and they will be back. */
  obliged: 'obliged',
  /** Done on an approved quote: the same work, on somebody's invoice. */
  delivered: 'delivered',
} as const;

export type ScopeOutcome = (typeof SCOPE_OUTCOMES)[keyof typeof SCOPE_OUTCOMES];

/** The outcomes that CLOSE the ticket, which is what a resolution rule reads. */
export const TERMINAL_SCOPE_OUTCOMES: readonly ScopeOutcome[] = Object.freeze([
  SCOPE_OUTCOMES.refused,
  SCOPE_OUTCOMES.declined,
  SCOPE_OUTCOMES.obliged,
  SCOPE_OUTCOMES.delivered,
]);

/** The outcome on a ticket, or null for every ticket that is not one of these. */
export function scopeOutcomeOf(
  graph: ReadOnlyGraphView,
  ticketId: string,
): ScopeOutcome | null {
  const value = graph.getField(ticketId, FIELDS.scopeOutcome);

  return typeof value === 'string'
    && Object.values<string>(SCOPE_OUTCOMES).includes(value)
    ? value as ScopeOutcome
    : null;
}

/* -- the prices ----------------------------------------------------------- */

/**
 * What writing the estimate costs, in minutes off the shift.
 *
 * OVERSEER TUNING KNOB, and it is the one number that makes the middle answer
 * a real choice rather than a strictly better refusal. Charged exactly the way
 * `REQUEST_CONVERT_MINUTES` is - owed against the clock and drained by the
 * driver's own machinery - because it is the same kind of cost: the correct
 * play is correct precisely because you did the paperwork, and the paperwork
 * takes minutes the shift does not get back.
 *
 * TEN, against convert's two, because these are not the same job. Minting a
 * ticket from a chat is copying out something you already understand; scoping a
 * piece of work you have not done, in a building you have not seen, with a
 * number on the end somebody may sign, is the afternoon it sounds like.
 */
export const SCOPE_QUOTE_MINUTES = 10;

/**
 * How long the customer takes to answer an estimate, in minutes.
 *
 * Within the day, deliberately: the whole point of the middle answer is that it
 * is playable in the shift it was chosen in, and a decision that arrived on
 * Thursday would be a mechanic the player never sees the end of. Forty-five
 * minutes is somebody reading a number, asking the other partner, and coming
 * back - which is what it takes at the size of firm these customers are.
 *
 * A quote written at ten to five is answered the next morning, because the
 * settler runs on shift minutes and there are none left. That is honest rather
 * than a hole: nobody signs off a piece of work at 17:05 either.
 */
export const QUOTE_ANSWER_MINUTES = 45;

/**
 * How long the trained customer takes to come back, in minutes.
 *
 * NINETY, and the reasoning is the same as the answer above: it has to land
 * inside a shift somebody is playing, and it has to be long enough that the
 * ticket which closed at half ten is not still on the screen when its sequel
 * arrives. Obliged late in the afternoon, it arrives at the top of the next
 * morning - which is the version of this that every MSP writes about anyway.
 *
 * ONCE. The recurrence is authored per ask and the recurrence itself names no
 * successor, so obliging twice teaches the customer twice and still ends. A
 * chain that fed itself would be a grief loop, and the lesson is over as soon
 * as it has been made.
 */
export const SCOPE_RECURRENCE_MINUTES = 90;

/**
 * What obliging is worth to the person who asked, in reputation.
 *
 * POSITIVE, and it has to be. "Just do it" is the answer that feels best, and a
 * mechanic that punished it at the moment of pressing would be teaching the
 * player a rule rather than letting them find one out: the reporter is
 * delighted, says so, and the bill for it - unbilled minutes on the sheet, and
 * a bigger ask later with your own precedent quoted back at you - arrives
 * afterwards, from somewhere else, which is exactly how it happens in the
 * trade.
 */
export const SCOPE_OBLIGE_REPUTATION = 2;

/* -- the asks the build ships --------------------------------------------- */

/**
 * One out-of-scope ask, as the two facts about it the graph cannot hold.
 *
 * Both are CONTENT and both are per ticket, which is what keeps this
 * deterministic: the same ask is answered the same way in every session, on
 * every seed, in a replay and in a test.
 */
export interface ScopeAsk {
  /** The ticket the ask arrives as. */
  readonly ticket: string;
  /**
   * Whether the customer signs the estimate.
   *
   * Authored per ask rather than rolled, and the two shipped asks disagree on
   * purpose: one firm wants the work and will pay for it, the other wanted it
   * for free and says so the moment there is a number attached. A player who
   * met only the yes would learn that quoting is a slower way of doing it.
   */
  readonly approves: boolean;
  /**
   * The bigger ask that arrives if this one was obliged, or nothing at the end
   * of a chain.
   *
   * A ticket id rather than a flag, because the recurrence is authored content
   * with its own reporter, its own flavour and its own three answers - the
   * training is that they come back for MORE, and "more" is a thing somebody
   * has to write.
   */
  readonly recurrence?: string;
}

/**
 * The shipped asks: two arrivals, and the bigger sequel each of them earns.
 *
 * The recurrences are asks in their own right - they arrive out of scope, they
 * take the same three answers - and neither of them names a successor, which is
 * where the chain stops.
 */
export const SCOPE_ASKS: readonly ScopeAsk[] = Object.freeze([
  {
    ticket: 'ticket:fontaine-new-office-wifi',
    // The law firm asked because it was easier than asking anybody else, and
    // the moment there is a number on it the answer is that they will "get
    // their guy" to do it. Declined, which is what makes the quote a real risk.
    approves: false,
    recurrence: 'ticket:fontaine-new-office-cabling',
  },
  {
    ticket: 'ticket:pennington-practice-migration',
    // The accountancy has budget, a deadline and an internal IT man who would
    // rather it were somebody else's weekend. Approved, and then it is a job.
    approves: true,
    recurrence: 'ticket:pennington-second-migration',
  },
  {
    ticket: 'ticket:fontaine-new-office-cabling',
    approves: false,
  },
  {
    ticket: 'ticket:pennington-second-migration',
    approves: true,
  },
]);

/** The ask a ticket is, or nothing for every other ticket in the game. */
export function scopeAskFor(ticketId: string): ScopeAsk | undefined {
  return SCOPE_ASKS.find((ask) => ask.ticket === ticketId);
}

/** Whether the customer signs this one. False for anything that is not an ask. */
export function scopeAskApproved(ticketId: string): boolean {
  return scopeAskFor(ticketId)?.approves ?? false;
}

/* -- what the day settles off --------------------------------------------- */

/** One thing the day driver has to do about an ask, and which ask it is about. */
export interface ScopeDue {
  readonly ticket: string;
  /** What the customer said, for the answer; the sequel, for the recurrence. */
  readonly answer: ScopeOutcome;
}

function stampOf(
  graph: ReadOnlyGraphView,
  ticketId: string,
  field: string,
): number | null {
  const value = graph.getField(ticketId, field);
  return typeof value === 'number' ? value : null;
}

/**
 * The estimates the customer has got round to answering, at this minute.
 *
 * A pure read over the shipped asks: an ask is due an answer when it is quoted,
 * the stamp on it is `QUOTE_ANSWER_MINUTES` old, and it is still parked. The
 * answer itself is the content fact, so the same quote gets the same reply
 * whatever minute it was written in.
 */
export function quoteAnswersDue(
  graph: ReadOnlyGraphView,
  now: number,
): readonly ScopeDue[] {
  const due: ScopeDue[] = [];

  for (const ask of SCOPE_ASKS) {
    if (graph.getNode(ask.ticket) === undefined) {
      continue;
    }

    if (scopeOutcomeOf(graph, ask.ticket) !== SCOPE_OUTCOMES.quoted) {
      continue;
    }

    const quoted = stampOf(graph, ask.ticket, FIELDS.scopeQuotedAt);

    if (quoted === null || now - quoted < QUOTE_ANSWER_MINUTES) {
      continue;
    }

    due.push({
      ticket: ask.ticket,
      answer: ask.approves ? SCOPE_OUTCOMES.approved : SCOPE_OUTCOMES.declined,
    });
  }

  return Object.freeze(due);
}

/**
 * The bigger asks that are due to arrive, because somebody obliged the smaller
 * one.
 *
 * Due when the ask was obliged, `SCOPE_RECURRENCE_MINUTES` have gone by, the
 * ask has a sequel written for it, and that sequel is not already in the world.
 * The last clause is what makes this arrive exactly once: it is the same
 * conditional-summon shape `recertFollowUpDue` and `legendaryRevertDue` use,
 * and it stops being due the moment the ticket it names exists.
 *
 * Nothing is due for a refusal, a quote, a decline or a delivery. Only the
 * unbilled favour trains anybody.
 */
export function scopeRecurrencesDue(
  graph: ReadOnlyGraphView,
  now: number,
): readonly string[] {
  const due: string[] = [];

  for (const ask of SCOPE_ASKS) {
    const { recurrence } = ask;

    if (recurrence === undefined || graph.getNode(ask.ticket) === undefined) {
      continue;
    }

    if (scopeOutcomeOf(graph, ask.ticket) !== SCOPE_OUTCOMES.obliged) {
      continue;
    }

    const obliged = stampOf(graph, ask.ticket, FIELDS.scopeObligedAt);

    if (obliged === null || now - obliged < SCOPE_RECURRENCE_MINUTES) {
      continue;
    }

    if (graph.getNode(recurrence) !== undefined) {
      continue;
    }

    due.push(recurrence);
  }

  return Object.freeze(due);
}
