/**
 * CHURN BY SILENCE, PLAYED (E9, 0.39.0).
 *
 * `../world/patience.ts` is proven out of a real world's stamps next door. This
 * asks the questions a derivation cannot, and they are the ones the whole lane
 * stands or falls on:
 *
 * 1. IS THE HONEST WEEK EVER WORSE? A week worked at a person's pace, through
 *    the shipped driver, ends with nobody asking anything - no rung, no post,
 *    no line on the Friday card - and the same week abandoned does not. That is
 *    the house rule, asserted rather than promised.
 * 2. DOES THE LADDER WALK ON A REAL WEEK, AND CAN YOU GET OFF IT? The question
 *    arrives on a week that earned it; a clean week after it takes it back.
 * 3. DOES A CLIENT ACTUALLY LEAVE? The notice goes out through the settler, the
 *    letter is in the real inbox, the Friday card says so - and the MONDAY
 *    AFTER, stood up the way the shipped stay button stands one up, has no
 *    trace of their estate in it and deals none of their work, while everybody
 *    else is untouched and a remnant that names them is refused honestly.
 *
 * The only things put into these worlds by hand are ledgers the settler itself
 * would have written in an earlier week, dispatched through the settler's own
 * verb with the settler's own encoder. Nothing else is a fixture.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { CAREER_ACTIONS, PATIENCE_ACTIONS, PATIENCE_LEDGER_PARAM } from '../world/actions';
import { readCarried } from '../world/carry';
import { carryForAnotherWeek } from '../world/career';
import { COMPANY_IDS } from '../world/company';
import { customerOfTicket } from '../world/estate-index';
import { employerFor } from '../world/employers';
import { FIELDS } from '../world/fields';
import { MSP_CHANNELS, MSP_CUSTOMERS, MSP_IDS } from '../world/msp-company';
import {
  encodeLedger,
  entryFor,
  patienceLedger,
  PATIENCE_THRESHOLDS,
  type PatienceRung,
} from '../world/patience';
import {
  createWorldSession,
  WORLD_SEED,
  type WeekCarry,
  type WorldSession,
} from '../world/session';
import { findWorldTicket } from '../world/tickets';
import { REVIEW_DAY } from '../world/week';
import { offeredAtFor } from '../world/titles';
import { AppStateStore } from './app-state';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import type { GameApi } from './apps/types';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY: WeekCarry = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
};

/** How long a whole week of x1 is allowed to take in real seconds. */
const WEEK_TIMEOUT_MS = 180_000;

/** How often a person actually does something - the invoice suite's figure. */
const ACT_EVERY = 20;

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
  readonly notices: string[];
  readonly rungs: { rung: PatienceRung; customer: string }[];
}

function rig(carry: Readonly<WeekCarry> = MSP_CARRY): Rig {
  const session = createWorldSession(carry);
  const notices: string[] = [];
  const rungs: { rung: PatienceRung; customer: string }[] = [];
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onNotice: (title) => {
      notices.push(title);
    },
    onPatienceStep: (rung, customer) => {
      rungs.push({ rung, customer });
    },
  }, undefined, session.week, MSP_CHANNELS);
  const api = {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    day: driver,
    dispatch: (
      id: string,
      actor: string,
      target: string | null,
      params: Record<string, string | number | boolean | null>,
    ) => driver.dispatch(id, actor, target, params),
    dispatchLog: () => session.engine.dispatchLog(),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener: (tick: number) => void) =>
        session.engine.onTick(listener),
    },
    onWorldChange: (listener: () => void) => session.engine.onEvent(() => {
      listener();
    }),
    notify: () => {},
    report: () => Promise.resolve({ ok: true as const, value: undefined }),
    openApp: () => {},
    closeApp: () => {},
    hasApp: () => false,
    installApp: () => ({ ok: true as const }),
    uninstallApp: () => ({ ok: true as const }),
    setDesktop: () => ({ ok: true as const }),
    restartWeek: () => {},
    acceptOffer: () => {},
    stayAnotherWeek: () => {},
    employer: 'msp',
    actor: COMPANY_IDS.player,
  } as unknown as GameApi;

  // The MSP desk is an engineer's, the way the invoice suite stands one up:
  // the customer axis is what this is about and the promotion is the road to
  // it, taken through the shipped verb rather than by writing a tier.
  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: offeredAtFor('systems_engineer'),
  }]);
  session.engine.dispatch(
    CAREER_ACTIONS.acceptPromotion,
    COMPANY_IDS.player,
    COMPANY_IDS.player,
    {},
  );
  driver.raiseFirstIncident();

  return { session, driver, api, notices, rungs };
}

function run(rigged: Rig, input: string): readonly string[] {
  return executeCommand(parseCommand(input), rigged.api).lines;
}

/** The next step of the queue nobody has taken yet, dispatched. */
function oneStep(rigged: Rig, taken: Set<string>): void {
  for (const ticket of rigged.session.engine.graph.nodesOfKind('ticket')) {
    if (ticket.fields[FIELDS.state] === 'resolved') {
      continue;
    }

    const path = findWorldTicket(ticket.id)?.paths[0];

    if (path === undefined) {
      continue;
    }

    for (let index = 0; index < path.steps.length; index += 1) {
      const key = `${ticket.id}#${String(index)}`;
      const step = path.steps[index];

      if (taken.has(key) || step === undefined) {
        continue;
      }

      taken.add(key);
      rigged.driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      );

      return;
    }
  }
}

/**
 * A week at the MSP, worked or not worked.
 *
 * `worked` is the honest play: a step of the queue every twenty minutes, which
 * is what the shipped week's own density supports. `false` is the week where
 * the player is at their desk and the queue is not - which is exactly what
 * silence looks like from the customer's side, and the only thing the whole
 * mechanic ever measures.
 */
function playWeek(rigged: Rig, worked: boolean, actEvery = ACT_EVERY): Rig {
  const taken = new Set<string>();

  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    rigged.driver.startShift();

    let minute = 0;

    while (rigged.driver.state() === 'shift') {
      if (worked && minute % actEvery === 0
        && rigged.driver.interruption() === null) {
        oneStep(rigged, taken);
      }

      rigged.driver.step(TICK_INTERVAL_MS);
      minute += 1;
    }

    rigged.driver.clockOff();
  }

  return rigged;
}

/** The ledger the world is holding, as the settler wrote it. */
function ledgerOf(rigged: Rig): ReturnType<typeof patienceLedger> {
  return patienceLedger(
    rigged.session.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.customerPatience,
    ),
  );
}

/**
 * A history the settler would have written in an earlier week, written the way
 * it writes one: through the ladder's own verb, with the ladder's own encoder.
 */
function seedHistory(
  rigged: Rig,
  entries: readonly Parameters<typeof encodeLedger>[0][number][],
): void {
  const result = rigged.session.engine.dispatch(
    PATIENCE_ACTIONS.record,
    COMPANY_IDS.player,
    null,
    { [PATIENCE_LEDGER_PARAM]: encodeLedger(entries) },
  );

  expect(result.ok).toBe(true);
}

/** The Monday after, stood up the way the shipped stay button stands one up. */
function nextWeek(rigged: Rig, arcWeek: number): WorldSession {
  return createWorldSession(carryForAnotherWeek(
    {
      reputation: 60,
      title: 'Systems Engineer',
      farmFund: 0,
      trail: null,
      tier: 'systems_engineer',
    },
    'msp',
    arcWeek,
    readCarried(rigged.session.engine.graph, employerFor('msp').carries),
  ));
}

/* -- the honest week ------------------------------------------------------- */

describe('a week that was worked', () => {
  it('ends with nobody asking anything at all', () => {
    const worked = playWeek(rig(), true);

    // No rung handed over, nothing in the post, nothing on the Friday card,
    // and no history to carry into next week. The mechanic is inert on a week
    // that did the job rather than merely quiet about it.
    expect(worked.rungs).toEqual([]);
    expect(worked.driver.patienceMail()).toEqual([]);
    expect(worked.driver.customersLeaving()).toEqual([]);
    expect(worked.driver.weekScorecard().departures).toEqual([]);

    // What it DOES leave is the honest-but-imperfect week the thresholds were
    // set with headroom for: a worked MSP week gets away from three accounts
    // by one job each, which is a standing of one apiece and stands on no rung
    // at all. That is the arithmetic in `patience.ts` measured on the shipped
    // week rather than argued, and one clean week takes even that off.
    for (const entry of ledgerOf(worked)) {
      expect(entry.rung).toBe('none');
      expect(entry.standing).toBeLessThan(PATIENCE_THRESHOLDS.asking);
    }
  }, WEEK_TIMEOUT_MS);
});

/* -- and the same week, worked slower -------------------------------------- */

/**
 * A step of the queue every HOUR - present, trying, and behind.
 *
 * Three times slower than the pace above, which is the pace the headroom claim
 * is measured at. It is not the abandoned week either: the player is at the
 * desk and working, they are simply not keeping up, and this is the shape of
 * week the whole difficulty question is about.
 */
const NEGLECT_PACE = 60;

describe('a week that was worked slowly', () => {
  /**
   * THE PACE IS THE DIFFICULTY, pinned rather than promised (0.39.0 verifier
   * round).
   *
   * `patience.ts` used to claim headroom as though it were a property of the
   * mechanic; it is a measurement AT ONE PACE, and the slower pace climbs the
   * ladder. That is the design - the boss can still pass the week, because the
   * review is the boss's opinion and this is the customer's - so what has to be
   * held is the SHAPE of the climb: one rung at a time, in order, a beat of
   * post at each rung, and nobody lost before the third week of it.
   *
   * A CHARACTERISATION GATE. It does not assert that churn must happen; it
   * asserts that when it does, it arrived the way the ladder says it arrives.
   * Move a threshold and this reds, which is the point: the thresholds are the
   * tuning knob, so a turn of one has to be a turn somebody made on purpose.
   */
  it('climbs the ladder in order, with the warnings in the post before the exit', () => {
    const first = playWeek(rig(), true, NEGLECT_PACE);

    // WEEK ONE IS QUESTIONS. A slower week leaves jobs behind at several
    // accounts, and the first thing that happens anywhere is somebody asking
    // about it - never a silence and never a letter.
    expect(first.rungs.length).toBeGreaterThan(0);
    expect(first.rungs.every((step) => step.rung === 'asking')).toBe(true);
    expect(first.driver.customersLeaving()).toEqual([]);

    // WEEK TWO IS SILENCE, at the accounts that did not get put right. Still
    // nobody has given notice: the letter needs a week that is not this one.
    const second = playWeek(rig(nextWeek(first, 2).carry), true, NEGLECT_PACE);

    expect(second.rungs.some((step) => step.rung === 'quiet')).toBe(true);
    expect(second.driver.customersLeaving()).toEqual([]);

    // WEEK THREE IS THE LETTER, for the account that has had all three beats.
    const third = playWeek(rig(nextWeek(second, 3).carry), true, NEGLECT_PACE);
    const leaving = third.rungs.find((step) => step.rung === 'leaving');

    expect(leaving).toBeDefined();
    expect(third.driver.customersLeaving().length).toBeGreaterThan(0);
    expect(third.driver.weekScorecard().departures.length).toBeGreaterThan(0);

    // AND THE WALK IS THE WHOLE WALK, in order and with nothing skipped: the
    // account that goes was asked about first and went quiet second, in earlier
    // weeks, and the notice is the third thing that ever happened to it.
    const walked = [...first.rungs, ...second.rungs, ...third.rungs]
      .filter((step) => step.customer === leaving?.customer)
      .map((step) => step.rung);

    expect(walked).toEqual(['asking', 'quiet', 'leaving']);

    // AND THE WARNING WAS IN THE POST FIRST. The week they were asked about has
    // the account manager's own mail on it, in his own words, and the week they
    // left has the letter. A player who read their post saw this coming.
    const threadIn = (rigged: Rig, customer: string): string => rigged.driver
      .patienceMail()
      .find((entry) => entry.id.includes(customer.replace(':', '-')))
      ?.messages[0]?.body.join('\n') ?? '';
    const asked = first.rungs.some(
      (step) => step.customer === leaving?.customer,
    ) ? first : second;

    expect(threadIn(asked, leaving?.customer ?? ''))
      .toContain('Everything ok over there?');
    expect(threadIn(third, leaving?.customer ?? '')).toContain('given notice');
  }, WEEK_TIMEOUT_MS * 3);
});

/* -- the week that was not ------------------------------------------------- */

describe('a week that was not', () => {
  it('is asked about, by name, in the account manager\'s own words', () => {
    const ignored = playWeek(rig(), false);

    // Somebody rang him. Which accounts is decided by whose jobs were left,
    // and every one of them is a client with a contract on the record.
    expect(ignored.rungs.some((step) => step.rung === 'asking')).toBe(true);

    // And nobody gives notice on one bad week, however bad. The account that
    // lost the most jobs can be silenced by the Friday - four abandoned jobs
    // at one client is a pattern rather than a Tuesday - but the letter needs
    // the deweight to have been standing since a day that is not this one.
    expect(ignored.rungs.some((step) => step.rung === 'leaving')).toBe(false);

    const asked = ignored.rungs.find(
      (step) => step.rung === 'asking',
    )?.customer ?? '';
    const standing = ignored.driver.patienceStanding()
      .find((account) => account.customer === asked);

    expect(standing?.debits ?? 0)
      .toBeGreaterThanOrEqual(PATIENCE_THRESHOLDS.asking);

    // And it is in the post, from the account manager, at the minute it landed.
    const thread = ignored.driver.patienceMail()
      .find((entry) => entry.id.includes(asked.replace(':', '-')));

    expect(thread).toBeDefined();
    expect(thread?.messages[0]?.from).toBe(MSP_IDS.mspLead);
    expect(thread?.messages[0]?.body.join('\n'))
      .toContain('Everything ok over there?');

    // The question is not a departure and the card does not pretend it is.
    expect(ignored.driver.weekScorecard().departures).toEqual([]);
  }, WEEK_TIMEOUT_MS);

  it('is asked about in the MORNING, off a history the week did not earn', () => {
    const rigged = rig();

    // An account already over the threshold on the Monday, carried in from a
    // week that is not this one and with nothing yet stamped in this one. The
    // ladder is settled at the START of a shift as well as at clock-off - a
    // day is how long it takes somebody else to notice, and the account
    // manager reads his post before yours.
    rigged.session.engine.dispatch(
      PATIENCE_ACTIONS.record,
      COMPANY_IDS.player,
      null,
      {
        [PATIENCE_LEDGER_PARAM]: encodeLedger([{
          customer: MSP_CUSTOMERS.arden,
          standing: PATIENCE_THRESHOLDS.asking,
          rung: 'none',
          tick: 0,
        }]),
      },
    );

    expect(rigged.rungs).toEqual([]);

    rigged.driver.startShift();

    expect(rigged.rungs).toEqual([
      { rung: 'asking', customer: MSP_CUSTOMERS.arden },
    ]);
  }, WEEK_TIMEOUT_MS);

  it('folds what it came to onto the ledger the next Monday reads', () => {
    const ignored = playWeek(rig(), false);
    const carried = ledgerOf(ignored);

    expect(carried.length).toBeGreaterThan(0);

    for (const entry of carried) {
      expect(entry.standing).toBeGreaterThan(0);
    }

    // And the clocks come off on the way IN rather than on the way out, so the
    // Friday that earned the beat can still print it: a tick across a boundary
    // describes a minute that never happened, and the boundary is the Monday.
    const monday = nextWeek(ignored, 2);

    for (const entry of patienceLedger(
      monday.engine.graph.getField(MSP_IDS.player, FIELDS.customerPatience),
    )) {
      expect(entry.tick).toBe(0);
    }

    // And it is on the estate delta the stay button reads, which is the only
    // road any of this takes across a week boundary.
    const delta = readCarried(
      ignored.session.engine.graph,
      employerFor('msp').carries,
    );

    expect(delta.some(
      (value) => value.node === MSP_IDS.player
        && value.field === FIELDS.customerPatience,
    )).toBe(true);
  }, WEEK_TIMEOUT_MS);

  it('gives the question back after a week that was worked', () => {
    const ignored = playWeek(rig(), false);
    const asked = ledgerOf(ignored).find((entry) => entry.rung === 'asking');

    expect(asked).toBeDefined();

    // The same desk, the next week, worked properly. The standing decays, the
    // rung is handed back, and nothing is said to anybody.
    const after = playWeek(rig(nextWeek(ignored, 2).carry), true);
    const mended = entryFor(ledgerOf(after), asked?.customer ?? '');

    expect(mended.rung).toBe('none');
    expect(mended.standing).toBeLessThan(asked?.standing ?? 0);
    // Nothing more is said to THEM. The claim is about the account that was
    // put right rather than about the whole roster: a different week deals
    // different work, and an account nobody has mended yet is not evidence
    // about the one somebody has.
    expect(after.rungs.some((step) => step.customer === asked?.customer))
      .toBe(false);
  }, WEEK_TIMEOUT_MS * 2);
});

/* -- the client that goes -------------------------------------------------- */

const LEAVING = MSP_CUSTOMERS.marlowe;

describe('the client that leaves', () => {
  /**
   * The state an account is in after two ruinous weeks: their work has stopped
   * coming (the deweight, handed over in a week that is not this one, so it
   * carries no tick) and the standing is at the notice's threshold. Everything
   * about it is what the settler writes; what this fixes is only WHICH week it
   * happened in, which no single played week can reach.
   */
  function onTheBrink(rigged: Rig): void {
    seedHistory(rigged, [{
      customer: LEAVING,
      standing: PATIENCE_THRESHOLDS.leaving,
      rung: 'quiet',
      tick: 0,
    }]);
  }

  it('gets the letter, and the Friday card says so', () => {
    const rigged = rig();

    onTheBrink(rigged);
    playWeek(rigged, true);

    // Worked or not, the pattern on the file is already two weeks old: the
    // notice is a question about whether it is still true, and it is.
    expect(rigged.rungs.some(
      (step) => step.rung === 'leaving' && step.customer === LEAVING,
    )).toBe(true);

    const thread = rigged.driver.patienceMail()
      .find((entry) => entry.id.includes(LEAVING.replace(':', '-')));
    const body = thread?.messages[0]?.body.join('\n') ?? '';

    expect(thread?.subject).toContain('notice on the contract');
    expect(body).toContain('given notice');
    // Answerable from the records, like every other accusation in this game.
    expect(body).toContain('This is what is on the file');

    expect(rigged.driver.customersLeaving()).toEqual(['MARLOWE-STUDIO']);
    expect(rigged.driver.weekScorecard().departures).toEqual(['MARLOWE-STUDIO']);
  }, WEEK_TIMEOUT_MS);

  it('takes their whole estate out of the Monday after, and nobody else\'s', () => {
    const rigged = rig();

    onTheBrink(rigged);
    playWeek(rigged, true);

    const monday = nextWeek(rigged, 2);
    const graph = monday.engine.graph;

    // Gone: the contract, the boxes, the accounts, the people.
    expect(graph.getNode(LEAVING)).toBeUndefined();
    expect(graph.nodesOfKind('machine').some(
      (node) => node.fields[FIELDS.machineCustomer] === LEAVING,
    )).toBe(false);
    expect(graph.nodesOfKind('account').some(
      (node) => node.fields[FIELDS.machineCustomer] === LEAVING,
    )).toBe(false);

    // Still here: everybody else, and the desk the player sits at.
    for (const other of Object.values(MSP_CUSTOMERS)) {
      if (other === LEAVING || other === MSP_CUSTOMERS.tillman) {
        continue;
      }

      expect(graph.getNode(other)).toBeDefined();
    }

    expect(graph.getNode(MSP_IDS.playerMachine)).toBeDefined();
    expect(graph.getNode(MSP_IDS.mspLead)).toBeDefined();

    // And the week deals none of their work - not on the Monday pile, not on
    // any day's drip.
    for (const script of monday.week) {
      for (const id of [
        ...script.inherited,
        ...script.drip.map((slot) => slot.ticketId),
      ]) {
        expect(customerOfTicket(id)).not.toBe(LEAVING);
      }
    }

    expect(graph.nodesOfKind('ticket').every(
      (node) => customerOfTicket(node.id) !== LEAVING,
    )).toBe(true);
  }, WEEK_TIMEOUT_MS);

  it('refuses a remnant that names them, honestly, and does not throw', () => {
    const rigged = rig();

    onTheBrink(rigged);
    playWeek(rigged, true);

    const monday = rig(nextWeek(rigged, 2).carry);

    // A name somebody read off a KB article or an old ticket, typed at a world
    // it is not in any more. The shell answers with what it does not have,
    // in its own words, rather than with a stack trace or a blank: history is
    // history, not a dangling pointer.
    expect(run(monday, 'audit customer:marlowe').join('\n'))
      .toContain('this desk has none by that name');
    expect(run(monday, 'restart MARL-WS-01\\Spooler').join('\n'))
      .toContain('Unknown host "MARL-WS-01"');

    // And the same verb at a client who is still here is the wall it was.
    expect(run(monday, 'restart FONT-FILE-01\\Spooler').join('\n'))
      .toMatch(/change request|changereq/i);
  }, WEEK_TIMEOUT_MS);

  it('does not put last week\'s letter in this week\'s post', () => {
    const rigged = rig();

    onTheBrink(rigged);
    playWeek(rigged, true);

    const monday = rig(nextWeek(rigged, 2).carry);

    // The notice stands - they are gone from the world - but the letter is
    // last week's news. A stamp that crossed the boundary would date a message
    // into a Monday it did not arrive on, and the card would announce the same
    // departure every week for the rest of the career.
    expect(monday.driver.patienceMail()).toEqual([]);
    expect(monday.driver.customersLeaving()).toEqual([]);
    expect(monday.driver.weekScorecard().departures).toEqual([]);
    expect(monday.session.engine.graph.getNode(LEAVING)).toBeUndefined();
  }, WEEK_TIMEOUT_MS);

  it('is irreversible: a spotless week does not bring them back', () => {
    const rigged = rig();

    onTheBrink(rigged);
    playWeek(rigged, true);

    const first = nextWeek(rigged, 2);

    expect(first.engine.graph.getNode(LEAVING)).toBeUndefined();

    // A whole week worked properly at the shop they left, and then another
    // Monday. The standing decays to nothing and the notice stands.
    const second = playWeek(rig(first.carry), true);
    const held = entryFor(ledgerOf(second), LEAVING);

    expect(held.rung).toBe('leaving');
    expect(nextWeek(second, 3).engine.graph.getNode(LEAVING)).toBeUndefined();
  }, WEEK_TIMEOUT_MS * 2);
});
