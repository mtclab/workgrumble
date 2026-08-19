import type {
  ActionData,
  GuardData,
  NodeRefData,
  OpData,
  PredData,
} from '../../engine-api';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR } from '../meters';
import { SCOPE_OBLIGE_REPUTATION, SCOPE_OUTCOMES } from '../out-of-scope';
import { fieldIs, HELPDESK_TIER, not, TARGET, targetGuards } from './helpers';
import { HELPDESK_ACTIONS, WORLD_ACTIONS } from './ids';

/**
 * The three answers to an ask nobody signed for (E9, 0.38.0), and the two the
 * customer gives back.
 *
 * The architecture is the 0.5.0 request trio's, deliberately: three verbs
 * rather than one with a kind parameter, each writing the SAME fact - which way
 * this ask went - and differing only in what that costs. What is new here is
 * that the three costs are not three sizes of the same coin. Refusing spends
 * nothing and earns nothing. Quoting spends the estimate's minutes (charged by
 * the driver, the way converting a request is) and then WAITS, on the shipped
 * hold rails, for an answer that may be no. Obliging spends nothing at the
 * moment of pressing, pays a point of goodwill, and bills the customer for none
 * of it - the sheet says `unbilled` beside those minutes - and it comes back
 * ninety minutes later as a bigger ask with your own precedent on it.
 *
 * EVERY ONE OF THEM REFUSES A TICKET THAT IS NOT AN ASK. The `scope_ask` stamp
 * is the guard, so a verb that closes a ticket by pointing at a contract cannot
 * be aimed at the printer fault next to it - which is the one thing a
 * three-way this cheap must never become.
 *
 * The work itself is ONE verb (`scope.do_work`) rather than two, and that is
 * the honest shape: doing the job is the same act whether or not anybody is
 * paying for it, and which of those it was was decided before the player got
 * here. The verb reads the ticket to find out - approved, and the minutes are
 * the customer's; unanswered, and they are nobody's and they train the customer
 * to ask again.
 */

const ACTOR: NodeRefData = { ref: 'actor' };

/** Whether the target is one of the shipped out-of-scope asks at all. */
const IS_ASK: PredData = fieldIs(TARGET, FIELDS.scopeAsk, true);

/** Whether this ask has been answered one way or another already. */
function outcomeIs(outcome: string): PredData {
  return fieldIs(TARGET, FIELDS.scopeOutcome, outcome);
}

const UNANSWERED: PredData = {
  pred: 'field_missing',
  node: TARGET,
  field: FIELDS.scopeOutcome,
};

export const SCOPE_NOT_AN_ASK_REASON = '"{target.label}" is an ordinary piece '
  + 'of work, not a request for something outside the agreement. The contract '
  + 'has nothing to say about it and neither has this: fix it.';

export const SCOPE_CLOSED_REASON = 'That one is settled. The ask was answered, '
  + 'the ticket is closed, and answering it a second way now would be '
  + 'rewriting a decision somebody has already been told about.';

export const SCOPE_ANSWERED_REASON = 'You have already answered that ask. '
  + 'Whichever way it went, it went - and a second answer to one request is how '
  + 'a customer ends up holding two versions of what they are getting.';

export const SCOPE_QUOTE_OUT_REASON = 'The estimate is with them and they have '
  + 'not come back on it. Doing the work now answers your own question and '
  + 'gives away the thing you just put a price on; refusing it now, after '
  + 'quoting, is the same conversation twice.';

export const SCOPE_NOT_QUOTED_REASON = 'Nobody has put a price in front of '
  + 'that customer, so there is nothing for them to be answering.';

/** The guards all three of the player's answers share. */
const ASK_GUARDS: readonly GuardData[] = [
  ...targetGuards('ticket'),
  { when: { pred: 'ticket_untracked', node: TARGET }, reason: 'That ticket is '
    + 'not on the helpdesk system, so there is no request behind it and '
    + 'nothing here to answer.' },
  { when: not(IS_ASK), reason: SCOPE_NOT_AN_ASK_REASON },
  { when: fieldIs(TARGET, FIELDS.state, 'resolved'), reason: SCOPE_CLOSED_REASON },
];

/** Writing which way it went - the one fact all five verbs are about. */
function recordOutcome(outcome: string): OpData {
  return {
    op: 'set_field',
    node: TARGET,
    field: FIELDS.scopeOutcome,
    value: { const: outcome },
  };
}

/** A reputation move, clamped to the meter, exactly as the request trio's is. */
function reputation(by: number): OpData {
  return {
    op: 'set_field',
    node: ACTOR,
    field: FIELDS.reputation,
    value: {
      add: {
        node: ACTOR,
        field: FIELDS.reputation,
        by: { const: by },
        clamp: { min: METER_FLOOR, max: METER_CEILING },
      },
    },
  };
}

/**
 * What the customer can see having been said to them - the line that makes the
 * park honest.
 *
 * The CYA rule (`ticket.set_waiting`) is that a clock stops because the
 * reporter was asked something they could actually have seen, and a quote is
 * the purest example of one: the estimate IS the question. So the verb writes
 * it into the customer-visible stream itself rather than trusting whichever
 * surface pressed it to have said something first, and the sentence is a
 * constant so a replay writes the identical string.
 */
const ESTIMATE_SENT: OpData = {
  op: 'set_field',
  node: TARGET,
  field: FIELDS.customerVisible,
  value: {
    append_line: {
      node: TARGET,
      field: FIELDS.customerVisible,
      value: {
        const: 'This falls outside the services in your agreement, so we have '
          + 'prepared an estimate for it as additional work. Nothing will be '
          + 'started until somebody there approves it.',
      },
    },
  },
};

/**
 * Taking the ticket back off the customer, and writing the park off the
 * cadence clock.
 *
 * The second half is `ticket.clear_waiting`'s own rule, said again because this
 * is the same event: the minutes a ticket spent parked on a decision are
 * excused minutes, and a customer-tiered ticket whose watermark stood still
 * through the park would be charged for the silence the hold rules asked for.
 * Tier-guarded like every cadence write, so an in-house ticket cannot grow the
 * field.
 */
const UNPARK: readonly OpData[] = [
  { op: 'set_waiting', node: TARGET, waiting: false },
  { op: 'clear_field', node: TARGET, field: FIELDS.holdReason },
  {
    op: 'when',
    cond: not({
      pred: 'field_missing',
      node: TARGET,
      field: FIELDS.customerSlaTier,
    }),
    ops: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.cadenceCountedTo,
        value: { now: true },
      },
    ],
  },
];

export const SCOPE_ACTION_DATA: readonly ActionData[] = [
  // REFUSE-AND-OFFER: the script the trade publishes, and the reason it is
  // first. It writes one word, closes the ticket, moves no meter and costs no
  // minutes - "no, and here is the door that is yes" is a complete answer, and
  // a game that charged goodwill for giving it would be teaching the player
  // that the correct professional move is the expensive one.
  {
    id: HELPDESK_ACTIONS.scopeRefuse,
    tier: HELPDESK_TIER,
    validate: [
      ...ASK_GUARDS,
      { when: outcomeIs(SCOPE_OUTCOMES.quoted), reason: SCOPE_QUOTE_OUT_REASON },
      { when: not(UNANSWERED), reason: SCOPE_ANSWERED_REASON },
    ],
    apply: [
      recordOutcome(SCOPE_OUTCOMES.refused),
      // The second half of the industry's own script, ON THE RECORD (0.38.0
      // review): the refusal without the offer is the half the research says
      // is routinely dropped, and this game's KB says so too - so the world
      // writes the offer where the customer can read it, rather than
      // trusting a button label to have said it.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.customerVisible,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.customerVisible,
            value: {
              const: 'This is outside what the agreement covers, so the desk '
                + 'cannot pick it up as a ticket - but it is real work and '
                + 'we would be glad to price it. Say the word and an '
                + 'estimate follows.',
            },
          },
        },
      },
    ],
  },
  // QUOTE-AND-WAIT: inform, estimate, get approval before proceeding. It does
  // not close anything - it PARKS, on the customer, with the estimate in the
  // stream they can see - and what happens next is theirs. The minutes it costs
  // are charged by the driver against the shift (`SCOPE_QUOTE_MINUTES`), the
  // same way the paperwork behind a converted request is.
  {
    id: HELPDESK_ACTIONS.scopeQuote,
    tier: HELPDESK_TIER,
    validate: [
      ...ASK_GUARDS,
      { when: outcomeIs(SCOPE_OUTCOMES.quoted), reason: 'That estimate is '
        + 'already with them. Sending a second one does not make the first '
        + 'arrive any faster.' },
      { when: not(UNANSWERED), reason: SCOPE_ANSWERED_REASON },
    ],
    apply: [
      recordOutcome(SCOPE_OUTCOMES.quoted),
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.scopeQuotedAt,
        value: { now: true },
      },
      ESTIMATE_SENT,
      { op: 'set_waiting', node: TARGET, waiting: true },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.holdReason,
        // `awaiting_user` rather than a register of its own, and the reason is
        // that it is TRUE: the ticket is stopped because the person who raised
        // it has been asked something and has not answered. A third hold reason
        // would be the same fact filed twice, and the two the world has are the
        // two a service desk has - the customer, or somebody else's engineer.
        value: { const: 'awaiting_user' },
      },
    ],
  },
  // JUST DO IT - or deliver what they approved, which is the same act. The
  // branch is on what the ticket already knows rather than on a parameter: an
  // approved estimate makes this a job somebody is paying for, and no answer at
  // all makes it a favour. The favour is the one that stamps a minute, because
  // the minute is what the customer's return is measured from.
  {
    id: HELPDESK_ACTIONS.scopeDoWork,
    tier: HELPDESK_TIER,
    validate: [
      ...ASK_GUARDS,
      { when: outcomeIs(SCOPE_OUTCOMES.quoted), reason: SCOPE_QUOTE_OUT_REASON },
      {
        when: not({
          pred: 'any',
          of: [UNANSWERED, outcomeIs(SCOPE_OUTCOMES.approved)],
        }),
        reason: SCOPE_ANSWERED_REASON,
      },
    ],
    apply: [
      {
        op: 'when',
        cond: outcomeIs(SCOPE_OUTCOMES.approved),
        ops: [recordOutcome(SCOPE_OUTCOMES.delivered)],
      },
      {
        op: 'when',
        cond: UNANSWERED,
        ops: [
          recordOutcome(SCOPE_OUTCOMES.obliged),
          {
            op: 'set_field',
            node: TARGET,
            field: FIELDS.scopeObligedAt,
            value: { now: true },
          },
          reputation(SCOPE_OBLIGE_REPUTATION),
        ],
      },
    ],
  },
  // And the customer, coming back on the estimate. Two verbs rather than one
  // with the answer as a parameter, for the reason there are three answers
  // above rather than one: they are two different things happening, they leave
  // the ticket in two different states, and the op language cannot be asked to
  // check that a string is one of two words.
  {
    id: WORLD_ACTIONS.scopeApproved,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      { when: not(IS_ASK), reason: SCOPE_NOT_AN_ASK_REASON },
      { when: not(outcomeIs(SCOPE_OUTCOMES.quoted)), reason: SCOPE_NOT_QUOTED_REASON },
    ],
    apply: [recordOutcome(SCOPE_OUTCOMES.approved), ...UNPARK],
  },
  {
    id: WORLD_ACTIONS.scopeDeclined,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      { when: not(IS_ASK), reason: SCOPE_NOT_AN_ASK_REASON },
      { when: not(outcomeIs(SCOPE_OUTCOMES.quoted)), reason: SCOPE_NOT_QUOTED_REASON },
    ],
    // Unparked FIRST and closed by the rule afterwards: a decision that ended
    // the wait ended it whichever way it went, and a resolved ticket still
    // carrying a hold reason would be a record saying it is waiting on somebody
    // who has already answered.
    apply: [...UNPARK, recordOutcome(SCOPE_OUTCOMES.declined)],
  },
];
