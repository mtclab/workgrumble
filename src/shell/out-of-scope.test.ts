/**
 * The out-of-scope ask, driven headlessly through the shipped driver, the
 * shipped registry and the shipped tickets (E9, 0.38.0).
 *
 * The claim under test is not "three verbs return ok". It is that the player is
 * offered a REAL three-way - three answers to one request with three honestly
 * different costs - and that each cost is a thing the world actually does:
 *
 *  - REFUSE-AND-OFFER closes the ticket, spends no minutes, moves no meter and
 *    leaves nothing behind. It is the industry's own script and it is free.
 *  - QUOTE-AND-WAIT costs the shift `SCOPE_QUOTE_MINUTES`, parks the ticket on
 *    the customer with the estimate in the stream they can see, and then the
 *    CUSTOMER answers within the day - approved at one firm, declined at the
 *    other, off a content fact and never a roll. Approved, the work is a real
 *    billable task; declined, the ticket closes with nothing owed.
 *  - JUST DO IT closes it in the minute it is pressed, which is why anybody
 *    would - and the minutes land UNBILLED on the sheet with the customer's own
 *    name on them, and the customer comes back ninety minutes later asking for
 *    more, with the precedent quoted in the notice.
 *
 * And the load-bearing one, which is the whole reason the slice exists: the
 * TICKET outcome of refusing and of obliging is identical (both resolved, both
 * paid the same reputation for closing), so a gate that only read the queue
 * would call the two answers the same move. The LEDGER is where they differ,
 * and the test at the bottom holds them apart in one world pair.
 *
 * TEETH, each proven by reverting the thing and watching the named test go red:
 *
 *  - drop `settleScopeRecurrence` from the driver's minute and "they come back,
 *    once, bigger" reds - the sequel never arrives.
 *  - make `attributionFor` return `{ kind: 'customer' }` for an obliged ask and
 *    "the minutes are unbilled, with their name on them" reds - the favour goes
 *    on the invoice.
 *  - drop the `owedMinutes_ += SCOPE_QUOTE_MINUTES` in `dispatch` and "the
 *    estimate costs the shift its minutes" reds - quoting becomes free.
 *  - drop the `scope_ask` guard from `ASK_GUARDS` and "the verbs refuse an
 *    ordinary fault" reds - every ticket in the game becomes closable by
 *    pointing at a contract.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../world/actions';
import { FIELDS, PLAYER_TIERS } from '../world/fields';
import { MSP_CUSTOMERS, MSP_IDS, mspOnboardingSetup } from '../world/msp-company';
import {
  QUOTE_ANSWER_MINUTES,
  SCOPE_ASKS,
  SCOPE_OBLIGE_REPUTATION,
  SCOPE_OUTCOMES,
  SCOPE_QUOTE_MINUTES,
  SCOPE_RECURRENCE_MINUTES,
  scopeAskFor,
} from '../world/out-of-scope';
import { createWorldSession } from '../world/session';
import { spawnWorldTicket, WORLD_TICKETS } from '../world/tickets';
import { bucketOf } from '../world/timesheet';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

/** The floor build at the helpdesk-scope law firm. They will not pay for it. */
const WIFI = 'ticket:fontaine-new-office-wifi';
/** And what it becomes if somebody does it for nothing. */
const CABLING = 'ticket:fontaine-new-office-cabling';
/** The migration at the co-managed accountancy. They will pay for it. */
const MIGRATION = 'ticket:pennington-practice-migration';

interface Notice {
  readonly title: string;
  readonly body: string;
}

interface World {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
  readonly notices: Notice[];
}

/**
 * A Fettle & Crane world with the player at the ENGINEER rung.
 *
 * The rung matters here and only here: the desk's sheet is one bucket a day by
 * design (the joke), and the engineer's is a line per customer - which is the
 * only shape in which "whose free afternoon was that" is a readable sentence.
 * Everything else in this file behaves identically at either rung.
 */
function start(): World {
  const session = createWorldSession({
    farmFund: 0,
    attempt: 1,
    arcWeek: 1,
    employer: 'msp',
    playerTier: PLAYER_TIERS.systemsEngineer,
  });
  const { engine } = session;
  const notices: Notice[] = [];
  // The session's OWN week and rooms, threaded the way the shell threads them
  // (0.6.0, P1-2): a driver left on the probation default would deal that
  // shop's week over this estate and spawn a ticket about a node Fettle &
  // Crane does not have.
  const driver = new DayDriver(
    engine,
    MSP_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
      onNotice: (title, body) => {
        notices.push({ title, body });
      },
    },
    undefined,
    session.week,
    session.channels,
    session.runsBossPings,
  );

  // The onboarding customer signs mid-week, the way the day driver stands it
  // up: spawning any MSP ticket walks an estate that expects to be whole.
  engine.applySetup(mspOnboardingSetup());
  driver.startShift();

  return { driver, engine, notices };
}

/** The world with one of the asks in it, on the shift, mid-morning. */
function withAsk(ticketId: string): World {
  const world = start();

  // Out of the SURPLUS rather than off the authored week (see
  // `world/spares/msp.ts`), so it is put in the world the same way the sampler
  // would - through the shipped spawn seam, which folds in the customer's tier.
  spawnWorldTicket(world.engine, ticketId);
  expect(world.engine.ticketState(ticketId)).toBe('open');

  return world;
}

function answer(world: World, action: string, ticketId: string): void {
  const result = world.driver.dispatch(action, MSP_IDS.player, ticketId, {});
  expect(result.ok, result.ok ? '' : result.reason).toBe(true);
}

function outcome(world: World, ticketId: string): unknown {
  return world.engine.graph.getField(ticketId, FIELDS.scopeOutcome);
}

function reputation(world: World): number {
  const value = world.engine.graph.getField(MSP_IDS.player, FIELDS.reputation);
  return typeof value === 'number' ? value : Number.NaN;
}

/** Steps the shift on by `minutes`, or until the day ends. */
function pass(world: World, minutes: number): void {
  for (let step = 0; step < minutes && world.driver.state() === 'shift'; step += 1) {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

/** Every line of this week's sheet, flattened - the sheet is the ledger here. */
function sheetLines(world: World): readonly {
  bucket: string;
  billable: boolean;
  derived: number;
}[] {
  return world.driver.timesheet().days.flatMap((day) => day.lines);
}

function minutesOn(world: World, bucket: string): number {
  return sheetLines(world)
    .filter((line) => line.bucket === bucket)
    .reduce((total, line) => total + line.derived, 0);
}

/* -- the content and the table agree -------------------------------------- */

describe('the shipped asks', () => {
  /**
   * The two halves of "this ticket is an ask" - the stamp the verbs are guarded
   * on and the table the driver settles off - have to name the same four
   * tickets. They are in two files because they answer two questions, and a
   * ticket in one and not the other is either a verb nobody can use or a quote
   * nobody ever answers.
   */
  it('carry the stamp the verbs are guarded on, and nothing else does', () => {
    const stamped = WORLD_TICKETS
      .filter((entry) => entry.def.scope_ask === true)
      .map((entry) => entry.def.id)
      .sort((left, right) => left.localeCompare(right));

    expect(stamped).toEqual(
      SCOPE_ASKS.map((ask) => ask.ticket)
        .sort((left, right) => left.localeCompare(right)),
    );
  });

  it('end the chain: a sequel has no sequel of its own', () => {
    const sequels = new Set(
      SCOPE_ASKS.flatMap((ask) => (ask.recurrence === undefined ? [] : [ask.recurrence])),
    );

    for (const id of sequels) {
      expect(scopeAskFor(id)?.recurrence, id).toBeUndefined();
    }
  });
});

/* -- answer one: the script ----------------------------------------------- */

describe('refuse and offer to price it', () => {
  it('closes the ticket, spends no minutes and moves no meter', () => {
    const world = withAsk(WIFI);
    const before = reputation(world);
    const at = world.engine.now();

    answer(world, HELPDESK_ACTIONS.scopeRefuse, WIFI);

    expect(outcome(world, WIFI)).toBe(SCOPE_OUTCOMES.refused);
    expect(world.engine.ticketState(WIFI)).toBe('resolved');

    // One turn of the clock is one minute: nothing is owed for a sentence.
    world.driver.step(TICK_INTERVAL_MS);
    expect(world.engine.now()).toBe(at + 1);
    // The reputation on the meter is the ticket's own resolution credit, which
    // every close pays. The ANSWER charged nothing on top of it either way.
    expect(reputation(world)).toBeGreaterThanOrEqual(before);
  });
});

/* -- answer two: the estimate --------------------------------------------- */

describe('quote and wait', () => {
  it('parks it on the customer with the estimate where they can see it', () => {
    const world = withAsk(MIGRATION);

    answer(world, HELPDESK_ACTIONS.scopeQuote, MIGRATION);

    expect(outcome(world, MIGRATION)).toBe(SCOPE_OUTCOMES.quoted);
    expect(world.engine.ticketState(MIGRATION)).toBe('waiting_on_user');
    expect(world.engine.graph.getField(MIGRATION, FIELDS.holdReason))
      .toBe('awaiting_user');
    // The park is honest by the shipped CYA rule: there is a question in the
    // stream the reporter can actually see, and it is the estimate itself.
    expect(
      String(world.engine.graph.getField(MIGRATION, FIELDS.customerVisible)),
    ).toContain('estimate');
  });

  /**
   * The goal, not the call: not "the quote verb returned ok" but "the shift is
   * shorter for having written it". Charged the way a converted request's
   * paperwork is - owed against the clock and drained inside `step` - so one
   * turn after a quote advances the sim by the ordinary minute PLUS the cost,
   * where one turn after a refusal advances by the plain minute.
   *
   * Teeth: drop the `owedMinutes_ += SCOPE_QUOTE_MINUTES` in `dispatch` and
   * this reds - the two legs advance by the same minute, so quoting is free.
   */
  it('costs the shift its minutes, where refusing does not', () => {
    const quoted = withAsk(MIGRATION);
    const beforeQuote = quoted.engine.now();
    answer(quoted, HELPDESK_ACTIONS.scopeQuote, MIGRATION);
    quoted.driver.step(TICK_INTERVAL_MS);
    expect(quoted.engine.now()).toBe(beforeQuote + 1 + SCOPE_QUOTE_MINUTES);

    const refused = withAsk(MIGRATION);
    const beforeRefusal = refused.engine.now();
    answer(refused, HELPDESK_ACTIONS.scopeRefuse, MIGRATION);
    refused.driver.step(TICK_INTERVAL_MS);
    expect(refused.engine.now()).toBe(beforeRefusal + 1);
  });

  it('is answered the same day, and the answer is the firm rather than a roll', () => {
    const world = withAsk(MIGRATION);
    answer(world, HELPDESK_ACTIONS.scopeQuote, MIGRATION);

    pass(world, QUOTE_ANSWER_MINUTES + SCOPE_QUOTE_MINUTES + 2);

    expect(outcome(world, MIGRATION)).toBe(SCOPE_OUTCOMES.approved);
    // Approved is not closed: it is a job now, and it still has to be done.
    expect(world.engine.ticketState(MIGRATION)).toBe('open');
    expect(world.engine.graph.getField(MIGRATION, FIELDS.holdReason))
      .toBeUndefined();
    expect(world.notices.some((notice) => notice.title.includes('signed')))
      .toBe(true);

    // And doing it closes it, with the minutes on the customer's own line -
    // which is the whole difference between this and the favour below.
    answer(world, HELPDESK_ACTIONS.scopeDoWork, MIGRATION);
    expect(outcome(world, MIGRATION)).toBe(SCOPE_OUTCOMES.delivered);
    expect(world.engine.ticketState(MIGRATION)).toBe('resolved');

    pass(world, 5);
    const billable = bucketOf({ kind: 'customer', id: MSP_CUSTOMERS.pennington });
    expect(minutesOn(world, billable)).toBeGreaterThan(0);
    expect(minutesOn(world, bucketOf({
      kind: 'unbilled',
      id: MSP_CUSTOMERS.pennington,
    }))).toBe(0);
  });

  it('is declined at the firm that was never going to pay, and closes', () => {
    const world = withAsk(WIFI);
    answer(world, HELPDESK_ACTIONS.scopeQuote, WIFI);

    pass(world, QUOTE_ANSWER_MINUTES + SCOPE_QUOTE_MINUTES + 2);

    expect(outcome(world, WIFI)).toBe(SCOPE_OUTCOMES.declined);
    expect(world.engine.ticketState(WIFI)).toBe('resolved');
    expect(world.engine.graph.getField(WIFI, FIELDS.holdReason)).toBeUndefined();
    expect(world.notices.some((notice) => notice.title.includes('declined')))
      .toBe(true);
  });
});

/* -- answer three: the favour --------------------------------------------- */

describe('just do it', () => {
  it('closes it now, and pays the goodwill that makes it tempting', () => {
    const world = withAsk(WIFI);
    const before = reputation(world);

    answer(world, HELPDESK_ACTIONS.scopeDoWork, WIFI);

    expect(outcome(world, WIFI)).toBe(SCOPE_OUTCOMES.obliged);
    expect(world.engine.ticketState(WIFI)).toBe('resolved');
    expect(reputation(world)).toBeGreaterThanOrEqual(
      before + SCOPE_OBLIGE_REPUTATION,
    );
  });

  /**
   * Teeth: make `attributionFor` return the plain `customer` ref for an obliged
   * ask and this reds on both halves - the minutes appear on the billable line
   * and the unbilled line disappears, which is the favour quietly invoiced.
   */
  it('stamps the minutes UNBILLED, with the customer\'s own name on them', () => {
    const world = withAsk(WIFI);
    answer(world, HELPDESK_ACTIONS.scopeDoWork, WIFI);
    pass(world, 20);

    const unbilled = bucketOf({
      kind: 'unbilled',
      id: MSP_CUSTOMERS.fontaine,
    });
    const line = sheetLines(world).find((entry) => entry.bucket === unbilled);

    expect(line, 'the obliged minutes are on nobody\'s invoice').toBeDefined();
    expect(line?.billable).toBe(false);
    expect(line?.derived).toBeGreaterThan(0);
    // And not on the customer's billable line, which is the same fact said
    // from the other side: nobody agreed a price, so there is nothing to bill.
    expect(minutesOn(world, bucketOf({
      kind: 'customer',
      id: MSP_CUSTOMERS.fontaine,
    }))).toBe(0);
  });

  /**
   * Teeth: drop the `settleScopeRecurrence` call from `spendMinute` and this
   * reds - the sequel never arrives, and "just do it" becomes free.
   */
  it('trains the customer: they come back, once, bigger', () => {
    const world = withAsk(WIFI);
    answer(world, HELPDESK_ACTIONS.scopeDoWork, WIFI);

    // Not yet. The lesson is delayed on purpose - it arrives from somewhere
    // else, later, rather than as a slap on the wrist for pressing the button.
    pass(world, SCOPE_RECURRENCE_MINUTES - 5);
    expect(world.engine.graph.getNode(CABLING)).toBeUndefined();

    pass(world, 10);
    expect(world.engine.graph.getNode(CABLING)).toBeDefined();
    expect(world.engine.ticketState(CABLING)).toBe('open');

    // And it says why, in the notice and on the ticket: the ask is bigger and
    // the reason it is being asked at all is the last one.
    const notice = world.notices.find((entry) => entry.title.includes('more'));
    expect(notice).toBeDefined();
    expect(notice?.body).toContain('for nothing');
    expect(String(world.engine.graph.getField(CABLING, FIELDS.state))).toBe('open');

    // Once. A second sequel would be a grief loop rather than a lesson.
    pass(world, SCOPE_RECURRENCE_MINUTES + 10);
    expect(
      WORLD_TICKETS.filter((entry) => entry.def.scope_ask === true
        && world.engine.graph.getNode(entry.def.id) !== undefined).length,
    ).toBe(2);
  });

  it('leaves nobody behind when the ask was refused instead', () => {
    const world = withAsk(WIFI);
    answer(world, HELPDESK_ACTIONS.scopeRefuse, WIFI);
    pass(world, SCOPE_RECURRENCE_MINUTES + 10);

    expect(world.engine.graph.getNode(CABLING)).toBeUndefined();
  });
});

/* -- and the three-way is a real three-way -------------------------------- */

describe('the ticket outcome is the same; the ledger is not', () => {
  /**
   * The structural guarantee this slice stands on, in one test and one pair of
   * worlds. Refusing and obliging END THE SAME WAY as far as the queue is
   * concerned - the ticket closes, the day counts it, the resolution credit is
   * paid - so anything reading the queue alone would call them the same answer.
   *
   * What separates them is the future, and only the future (0.38.0 review
   * recut): BOTH answers' minutes are unbilled now - a correctness round
   * proved the refused ask's reading minutes landing on Fontaine's invoice,
   * which made the industry-script answer the one that quietly earned - so
   * the sheet no longer tells them apart. What does is what the customer
   * learned: obliging trains them and the same shape comes back bigger;
   * refusing ends it. If the recurrence ever fires for both or neither, the
   * three-way has become a menu with one item on it.
   */
  it('refusing and obliging close the same ticket and cost different things', () => {
    const refused = withAsk(WIFI);
    answer(refused, HELPDESK_ACTIONS.scopeRefuse, WIFI);
    pass(refused, SCOPE_RECURRENCE_MINUTES + 10);

    const obliged = withAsk(WIFI);
    answer(obliged, HELPDESK_ACTIONS.scopeDoWork, WIFI);
    pass(obliged, SCOPE_RECURRENCE_MINUTES + 10);

    // The same, on the queue's own terms.
    expect(refused.engine.ticketState(WIFI)).toBe('resolved');
    expect(obliged.engine.ticketState(WIFI)).toBe('resolved');

    // Both off the invoice - out-of-contract work never bills, whatever the
    // answer - and neither on the billable line.
    const unbilled = bucketOf({ kind: 'unbilled', id: MSP_CUSTOMERS.fontaine });
    const billable = bucketOf({ kind: 'customer', id: MSP_CUSTOMERS.fontaine });
    expect(minutesOn(refused, billable)).toBe(0);
    expect(minutesOn(obliged, billable)).toBe(0);
    expect(minutesOn(obliged, unbilled)).toBeGreaterThan(0);

    // And not the same where it actually costs: the customer only learns
    // from the answer that obliged them.
    expect(refused.engine.graph.getNode(CABLING)).toBeUndefined();
    expect(obliged.engine.graph.getNode(CABLING)).toBeDefined();
  });
});

/* -- and it cannot be aimed at an ordinary fault --------------------------- */

describe('the scope verbs and the rest of the queue', () => {
  /**
   * Teeth: drop the `scope_ask` guard from `ASK_GUARDS` and this reds - every
   * ticket in the game becomes closable by pointing at a contract, which is the
   * one thing a three-way this cheap must never be.
   */
  it('refuse an ordinary fault, in words that say why', () => {
    const world = start();
    // One of Monday's own, already in the queue: an ordinary fault at the same
    // customer as the wifi ask, so the only thing separating them is the stamp.
    const ordinary = 'ticket:fontaine-matter-access';
    expect(world.engine.ticketState(ordinary)).toBe('open');

    for (const action of [
      HELPDESK_ACTIONS.scopeRefuse,
      HELPDESK_ACTIONS.scopeQuote,
      HELPDESK_ACTIONS.scopeDoWork,
    ]) {
      const result = world.driver.dispatch(
        action,
        MSP_IDS.player,
        ordinary,
        {},
      );

      expect(result.ok, action).toBe(false);
      expect(result.ok ? '' : result.reason).toContain('ordinary piece of work');
    }

    expect(world.engine.ticketState(ordinary)).toBe('open');
  });

  it('refuse a second answer to an ask that has already been answered', () => {
    const world = withAsk(WIFI);
    answer(world, HELPDESK_ACTIONS.scopeRefuse, WIFI);

    const again = world.driver.dispatch(
      HELPDESK_ACTIONS.scopeDoWork,
      MSP_IDS.player,
      WIFI,
      {},
    );

    expect(again.ok).toBe(false);
    expect(outcome(world, WIFI)).toBe(SCOPE_OUTCOMES.refused);
  });
});
