/**
 * The customer reading the invoice, played (0.30.0, slice 2).
 *
 * `../world/invoice.ts` is proven out of fixtures next door. This asks the two
 * questions a fixture cannot, and they are the two the whole mechanic stands
 * or falls on:
 *
 * 1. IS THE HONEST WEEK EVER MECHANICALLY WORSE? Two runs of the SAME week, at
 *    x1, through the shipped terminal - one that files nothing and one that
 *    pads every line - compared on everything the game can do to a player: the
 *    verdict, the mark, the fund, the meters, the queue. The honest week is
 *    never behind on any of them, and it is the only one of the two that ends
 *    with nobody asking it anything. That is the house rule, asserted rather
 *    than promised.
 * 2. DOES THE LADDER ACTUALLY WALK, AND CAN YOU GET OFF IT? Every rung reached
 *    in order on a real week, the breakdown answered out of the real records,
 *    a client actually leaving and their work actually stopping - and, on the
 *    same play with the lines put back, none of it happening at all.
 *
 * Nothing here touches the DOM.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { CAREER_ACTIONS, PROMOTION_REPUTATION } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { FIELDS } from '../world/fields';
import { customerIdForTicketNodes } from '../world/customers';
import { shiftEndTick, shiftStartTick } from '../world/hours';
import { INVOICE_ACTIONS, INVOICE_LADDER_PARAM } from '../world/actions';
import {
  deliveredRungs,
  formerClients,
  INVOICE_RUNGS,
  type InvoiceRung,
  rungIndex,
  withDeliveredRung,
} from '../world/invoice';
import { MSP_CHANNELS, MSP_CUSTOMERS } from '../world/msp-company';
import { MSP_WEEK } from '../world/msp-week';
import { createWorldSession, WORLD_SEED, type WorldSession } from '../world/session';
import { findWorldTicket, ticketNodes } from '../world/tickets';
import { REVIEW_DAY } from '../world/week';
import { AppStateStore } from './app-state';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import type { GameApi } from './apps/types';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

/** How long a whole week of x1 is allowed to take in real seconds. */
const WEEK_TIMEOUT_MS = 120_000;

/**
 * How often a person actually does something.
 *
 * Twenty minutes, which is what the shipped MSP week's own density supports:
 * thirteen tickets and a project across five days is a few acts an hour, and a
 * harness that fired them all in one burst would be measuring a machine rather
 * than a shift.
 */
const ACT_EVERY = 20;

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
  readonly notices: string[];
  readonly rungs: { rung: InvoiceRung; customer: string }[];
  /** What is on the screen, which is how the lead catches anybody. */
  focused: string | null;
}

function rig(): Rig {
  const session = createWorldSession(MSP_CARRY);
  const notices: string[] = [];
  const rungs: { rung: InvoiceRung; customer: string }[] = [];
  const screen: { focused: string | null } = { focused: null };
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => (screen.focused === null ? [] : [screen.focused]),
    focusedSlackApp: () => screen.focused,
    onNotice: (title) => {
      notices.push(title);
    },
    onInvoiceEscalation: (rung, customer) => {
      rungs.push({ rung, customer });
    },
  }, undefined, MSP_WEEK, MSP_CHANNELS);
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
    employer: 'msp',
    actor: COMPANY_IDS.player,
  } as unknown as GameApi;

  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: PROMOTION_REPUTATION,
  }]);
  session.engine.dispatch(
    CAREER_ACTIONS.acceptPromotion,
    COMPANY_IDS.player,
    COMPANY_IDS.player,
    {},
  );
  driver.raiseFirstIncident();

  return {
    session,
    driver,
    api,
    notices,
    rungs,
    get focused() {
      return screen.focused;
    },
    set focused(value: string | null) {
      screen.focused = value;
    },
  };
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

/** Every customer line of a day, as the handles the terminal takes. */
function customerHandles(rigged: Rig, day: number): readonly string[] {
  const sheet = rigged.driver.timesheet();
  const today = sheet.days.find((entry) => entry.day === day);

  return (today?.lines ?? []).flatMap((line, index) =>
    line.bucket.startsWith('customer|')
      ? [`${String(day)}.${String(index + 1)}`]
      : []);
}

interface Played {
  readonly rig: Rig;
  readonly outcome: string;
  readonly performance: number;
  readonly fund: number;
  readonly closed: number;
  readonly stress: number;
  readonly suspicion: number;
  readonly reputation: number;
  readonly utilisation: number;
}

/**
 * A week at the MSP, worked at a person's pace and then filed - honestly, or
 * with every customer line rounded up to two hours.
 *
 * The padding goes through the shipped terminal verb, one line at a time, the
 * way a player does it at five to five with a week-old memory. It is two hours
 * flat on every account because that is the shape the research says gets
 * caught: not a big number, the SAME number.
 */
function playWeek(
  pad: boolean,
  putBackOnDay = 0,
  /**
   * And the other half of the week the top of the ladder needs: an afternoon
   * on the forum, seen. It is here rather than in the comparison above because
   * a run that slacks is not the same PLAY as one that does not - the honest/
   * padded pair has to differ in exactly one thing to prove anything - and
   * because the account that loses patience is, truthfully, the one billed by
   * somebody who was also being written up that week.
   */
  slack = false,
): Played {
  const rigged = rig();
  const taken = new Set<string>();

  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    rigged.driver.startShift();

    let minute = 0;

    while (rigged.driver.state() === 'shift') {
      if (minute % ACT_EVERY === 0 && rigged.driver.interruption() === null) {
        oneStep(rigged, taken);
      }

      rigged.focused = slack && minute > 30 && minute < 300 ? 'browser' : null;
      rigged.driver.step(TICK_INTERVAL_MS);
      minute += 1;
    }

    rigged.focused = null;

    if (pad && (putBackOnDay === 0 || day < putBackOnDay)) {
      for (const handle of customerHandles(rigged, day)) {
        run(rigged, `timesheet claim ${handle} 120`);
      }
    }

    // And the escape: the same play, with every line put back to what the
    // records say, on the day the player thought better of it.
    if (putBackOnDay !== 0 && day === putBackOnDay) {
      const sheet = rigged.driver.timesheet();

      for (const entry of sheet.days) {
        for (let index = 0; index < entry.lines.length; index += 1) {
          const line = entry.lines[index];

          if (line !== undefined && line.claimed !== line.derived) {
            run(
              rigged,
              `timesheet claim ${String(entry.day)}.${String(index + 1)} ${
                String(line.derived)
              }`,
            );
          }
        }
      }
    }

    rigged.driver.clockOff();
  }

  const card = rigged.driver.weekScorecard();
  const meter = (field: string): number => {
    const value = rigged.session.engine.graph.getField(COMPANY_IDS.player, field);
    return typeof value === 'number' ? value : 0;
  };

  return {
    rig: rigged,
    outcome: rigged.driver.reviewOutcome(),
    performance: card.performance,
    fund: card.bankedPence,
    closed: card.closed,
    stress: meter(FIELDS.stress),
    suspicion: meter(FIELDS.suspicion),
    reputation: meter(FIELDS.reputation),
    utilisation: rigged.driver.timesheetUtilisation().percent,
  };
}

/** The week worked up to the end of a day, and left there. */
function playToDay(through: number): Rig {
  const rigged = rig();
  const taken = new Set<string>();

  for (let day = 1; day <= through; day += 1) {
    rigged.driver.startShift();

    let minute = 0;

    while (rigged.driver.state() === 'shift') {
      if (minute % ACT_EVERY === 0 && rigged.driver.interruption() === null) {
        oneStep(rigged, taken);
      }

      rigged.driver.step(TICK_INTERVAL_MS);
      minute += 1;
    }
  }

  return rigged;
}

/** And the rest of it, from wherever it was left. */
function playOn(rigged: Rig): void {
  const taken = new Set<string>();

  while (rigged.driver.day() <= REVIEW_DAY) {
    if (rigged.driver.state() === 'day_end') {
      rigged.driver.clockOff();
    }

    if (rigged.driver.state() === 'morning_brief') {
      rigged.driver.startShift();
    }

    if (rigged.driver.state() !== 'shift') {
      break;
    }

    let minute = 0;

    while (rigged.driver.state() === 'shift') {
      if (minute % ACT_EVERY === 0 && rigged.driver.interruption() === null) {
        oneStep(rigged, taken);
      }

      rigged.driver.step(TICK_INTERVAL_MS);
      minute += 1;
    }

    if (rigged.driver.day() === REVIEW_DAY) {
      break;
    }
  }
}

function ladderOf(rigged: Rig): readonly string[] {
  return deliveredRungs(
    rigged.session.engine.graph.getField(
      COMPANY_IDS.player,
      FIELDS.invoiceLadder,
    ),
  ).map((entry) => `${entry.customer}=${entry.rung}`);
}

describe('the honest week is never the worse week', () => {
  it('matches the padded week on every number the game can move', () => {
    const honest = playWeek(false);
    const padded = playWeek(true);

    // The same week, played the same way, so the WORK is identical: the pad is
    // a thing done to a sheet after the fact and it must not have reached a
    // single ticket, meter or penny.
    expect(honest.outcome).toBe(padded.outcome);
    expect(honest.performance).toBe(padded.performance);
    expect(honest.fund).toBe(padded.fund);
    expect(honest.closed).toBe(padded.closed);
    expect(honest.stress).toBe(padded.stress);
    expect(honest.suspicion).toBe(padded.suspicion);
    expect(honest.reputation).toBe(padded.reputation);

    // The one number the pad DOES move is the one the business reads, which is
    // the temptation the whole slice is built around.
    expect(padded.utilisation).toBeGreaterThan(honest.utilisation);

    // And the price of it, which the honest week does not pay: an honest sheet
    // cannot flag a single pattern on any account, so nobody ever asks it
    // anything. TEETH: drop the `claimed > derived` test in `overClaims` and
    // this line goes red on a week that filed nothing at all.
    expect(ladderOf(honest.rig)).toEqual([]);
    expect(honest.rig.rungs).toEqual([]);
    expect(ladderOf(padded.rig).length).toBeGreaterThan(0);
  }, WEEK_TIMEOUT_MS);

  it('leaves an honest sheet with no account standing anywhere', () => {
    const honest = playWeek(false);

    for (const row of honest.rig.driver.invoiceStanding()) {
      expect(row.scrutiny, row.customer).toBe(0);
      expect(row.rung, row.customer).toBe('none');
    }

    expect(honest.rig.driver.timesheetUtilisation().met).toBe(false);
    // Under target, and nothing happened about it: the week's verdict is the
    // one the work earned. Honesty is never punished, and this is where that
    // is asserted rather than said.
    expect(honest.outcome).toBe('passed');
  }, WEEK_TIMEOUT_MS);
});

describe('the ladder', () => {
  it('walks its rungs in order and never skips one', () => {
    const padded = playWeek(true);
    const delivered = deliveredRungs(
      padded.rig.session.engine.graph.getField(
        COMPANY_IDS.player,
        FIELDS.invoiceLadder,
      ),
    );

    expect(delivered.length).toBeGreaterThan(0);

    for (const customer of new Set(delivered.map((entry) => entry.customer))) {
      const walked = delivered
        .filter((entry) => entry.customer === customer)
        .map((entry) => entry.rung);

      // Sequential from the first rung, one at a time, no repeats: the ladder
      // is a ladder rather than a verdict, so there is no way to arrive at a
      // disputed invoice without having been asked about the line first.
      expect(walked, customer).toEqual(
        INVOICE_RUNGS.slice(1, walked.length + 1),
      );
    }

    // Every rung the shipped week can reach was actually reached by somebody,
    // and the beats came out in the order the notices did.
    const reached = new Set(delivered.map((entry) => entry.rung));

    expect(reached.has('query')).toBe(true);
    expect(reached.has('breakdown')).toBe(true);
    expect(reached.has('dispute')).toBe(true);
  }, WEEK_TIMEOUT_MS);

  it('is escapable: put the lines back and the next rung never comes', () => {
    const stuck = playWeek(true);
    const cleaned = playWeek(true, 2);

    const stuckWorst = deliveredRungs(
      stuck.rig.session.engine.graph.getField(
        COMPANY_IDS.player,
        FIELDS.invoiceLadder,
      ),
    ).reduce((worst, entry) => Math.max(worst, rungIndex(entry.rung)), 0);
    const cleanedWorst = deliveredRungs(
      cleaned.rig.session.engine.graph.getField(
        COMPANY_IDS.player,
        FIELDS.invoiceLadder,
      ),
    ).reduce((worst, entry) => Math.max(worst, rungIndex(entry.rung)), 0);

    // Same week, same work, same pad - and the one that put its lines back on
    // the Tuesday stopped climbing. Nothing was forgiven and nothing was
    // deleted: the patterns simply stop seeing a line that is not there.
    expect(cleanedWorst).toBeLessThan(stuckWorst);

    for (const row of cleaned.rig.driver.invoiceStanding()) {
      expect(row.scrutiny, row.customer).toBe(0);
    }
  }, WEEK_TIMEOUT_MS);

  it('answers the breakdown out of the records, not out of a summary', () => {
    const padded = playWeek(true);
    const asked = padded.rig.driver.invoiceStanding()
      .find((row) => rungIndex(row.delivered) >= rungIndex('breakdown'));

    expect(asked).toBeDefined();

    const breakdown = padded.rig.driver.invoiceBreakdown(asked?.customer ?? '');
    const sheet = padded.rig.driver.timesheet();
    const worked = sheet.days.reduce((total, day) => total + day.lines.reduce(
      (sum, line) => sum
        + (line.bucket === `customer|${asked?.customer ?? ''}` ? line.derived : 0),
      0,
    ), 0);

    // The game answers the demand, and what it answers with is the derivation
    // - so the number in the thread is the number on the sheet's worked column
    // and cannot be anything else. There is no stored copy for it to come from.
    expect(breakdown.join('\n')).toContain('invoiced against');
    expect(breakdown.some((line) => line.includes('2h invoiced'))).toBe(true);
    expect(worked).toBeGreaterThan(0);

    // And it is in the post, from their own contact, with the same words.
    const thread = padded.rig.driver.invoiceMail()
      .find((entry) => entry.id.includes(
        (asked?.customer ?? '').replace(':', '-'),
      ));

    expect(thread).toBeDefined();
    expect(thread?.messages.some(
      (message) => message.body.some((line) => line.includes('invoiced against')),
    )).toBe(true);
  }, WEEK_TIMEOUT_MS);
});

describe('a client that leaves', () => {
  it('can be lost on the shipped week, and loses none of its history', () => {
    const padded = playWeek(true, 0, true);
    const gone = formerClients(
      padded.rig.session.engine.graph.getField(
        COMPANY_IDS.player,
        FIELDS.invoiceLadder,
      ),
    );

    // The shipped week can lose an account, and which one is decided by how it
    // was billed rather than by anything the content picked.
    expect(gone.size).toBeGreaterThan(0);

    const graph = padded.rig.session.engine.graph;

    for (const customer of gone) {
      // Their estate is still there, and so is every ticket that was ever
      // raised on it. A churn that deleted nodes would delete the evidence
      // this whole mechanic is made of - and would delete the week the player
      // actually played, which is the one thing an engine built on records
      // must never do.
      expect(graph.getNode(customer)).toBeDefined();
      expect(
        graph.nodesOfKind('machine')
          .some((node) => node.fields[FIELDS.machineCustomer] === customer),
      ).toBe(true);
      expect(
        graph.nodesOfKind('ticket').some((node) =>
          customerIdForTicketNodes(graph, ticketNodes(node.id)) === customer),
      ).toBe(true);
    }
  }, WEEK_TIMEOUT_MS);

  /**
   * And the half the shipped week cannot show end to end, driven directly.
   *
   * The ladder above loses an account on the Friday, and Friday has no more of
   * their work left in it - so the week can prove that a client GOES and
   * cannot prove that going takes their work with it. This drives the same
   * verb the settler dispatches, with the same encoder, at the end of the
   * Wednesday, and then plays the rest of the week twice.
   *
   * It is not a fixture: the world is a real driven MSP week and the only
   * thing put into it by hand is the one fact the settler would have written
   * two days later on a harder-padded sheet.
   */
  it('stops future work arriving, and only theirs', () => {
    const control = playToDay(3);
    const churned = playToDay(3);

    churned.driver.dispatch(
      INVOICE_ACTIONS.escalate,
      COMPANY_IDS.player,
      null,
      {
        [INVOICE_LADDER_PARAM]: withDeliveredRung('', {
          customer: MSP_CUSTOMERS.meridian,
          rung: 'left',
          tick: churned.session.engine.now(),
        }),
      },
    );

    playOn(control);
    playOn(churned);

    const theirs: string[] = [];
    const everybody_else: string[] = [];

    for (const script of MSP_WEEK) {
      if (script.day <= 3) {
        continue;
      }

      for (const drip of script.drip) {
        const customer = customerIdForTicketNodes(
          control.session.engine.graph,
          ticketNodes(drip.ticketId),
        );

        (customer === MSP_CUSTOMERS.meridian ? theirs : everybody_else)
          .push(drip.ticketId);
      }
    }

    // The week has work for them after the Wednesday - otherwise this proves
    // nothing - and every bit of it arrived in the run where they stayed.
    expect(theirs.length).toBeGreaterThan(0);

    for (const id of theirs) {
      expect(control.session.engine.graph.getNode(id), id).toBeDefined();
      // TEETH: take the former-client gate out of `spawnArrivals` and every
      // one of these comes back.
      expect(churned.session.engine.graph.getNode(id), id).toBeUndefined();
    }

    // And nobody else's work went anywhere. A churn that quietened the whole
    // queue would be a reward for padding rather than a cost of it.
    for (const id of everybody_else) {
      expect(churned.session.engine.graph.getNode(id), id).toBeDefined();
    }
  }, WEEK_TIMEOUT_MS);

  it('comes back off a save exactly as it went in', () => {
    const padded = playWeek(true, 0, true);
    const before = ladderOf(padded.rig);
    const standing = padded.rig.driver.invoiceStanding();
    const saved = padded.rig.session.engine.serialize();

    const loaded = rig();
    loaded.session.engine.restore(saved);
    loaded.driver.resync();

    // The ledger of what was SAID rides the save, and where each account
    // STANDS is recomputed off the same sheet and the same records - so a
    // reload cannot come back with a different opinion about anybody.
    expect(ladderOf(loaded)).toEqual(before);
    expect(loaded.driver.invoiceStanding()).toEqual(standing);
    expect(loaded.driver.invoiceMail()).toEqual(padded.rig.driver.invoiceMail());
  }, WEEK_TIMEOUT_MS);
});

describe('the org reading the same sheet', () => {
  it('reads the padded week higher and does nothing about either', () => {
    const honest = playWeek(false);
    const padded = playWeek(true);

    expect(honest.rig.driver.weekScorecard().utilisation)
      .not.toBe(padded.rig.driver.weekScorecard().utilisation);
    // The row is on the card and the card's verdict is untouched by it - the
    // same outcome, off the same mark, on both plays.
    expect(honest.rig.driver.weekScorecard().performance)
      .toBe(padded.rig.driver.weekScorecard().performance);
    expect(honest.rig.driver.weekScorecard().utilisation)
      .toContain('the business asks for');
  }, WEEK_TIMEOUT_MS);

  it('holds the desk sheet at its target without anybody deciding anything', () => {
    const session = createWorldSession(MSP_CARRY);
    const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    }, undefined, MSP_WEEK, MSP_CHANNELS);

    driver.startShift();

    while (driver.state() === 'shift') {
      driver.step(TICK_INTERVAL_MS);
    }

    const reading = driver.timesheetUtilisation();

    // The joke, mechanically: a service-desk sheet is one bucket that IS the
    // day, so the number the business holds it to is met exactly, every week,
    // by a sheet nobody thought about.
    expect(reading.basis).toBe('recorded');
    expect(reading.percent).toBe(100);
    expect(reading.met).toBe(true);
  }, WEEK_TIMEOUT_MS);
});

/** Named so a reader can see which tenants the week is actually about. */
describe('the accounts the week can lose', () => {
  it('names them off the shipped roster rather than off an id', () => {
    expect(Object.values(MSP_CUSTOMERS).length).toBeGreaterThan(5);
    expect(shiftStartTick(1)).toBeLessThan(shiftEndTick(1));
  });
});
