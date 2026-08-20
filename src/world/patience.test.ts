/**
 * CHURN BY SILENCE, out of fixtures (E9, 0.39.0).
 *
 * The arithmetic half. `shell/patience.test.ts` plays it - a real MSP week
 * through the real driver, a real notice, a real Monday with a client missing -
 * and this proves the things a played week cannot get at cheaply: that a debit
 * is only ever a stamp somebody actually earned, that the ladder cannot skip a
 * rung or punish a single miss, that a clean week walks it back, that a notice
 * does not walk back, and that the estate a departure takes with it is the
 * whole estate and nothing else.
 *
 * The stamps are set on a REAL world's tickets rather than on a fixture graph:
 * the whole claim of this mechanic is that it reads what the contract settler
 * already wrote, and a stub graph that answered whatever the test wanted would
 * prove the arithmetic and nothing about the reading.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import type { SetupOp } from '../engine-api';
import {
  contentAfterChurn,
  customersOfEntry,
  NORMAL_WEIGHT,
  QUIET_WEIGHT,
  withoutDeparted,
} from './departure';
import { customerOfTicket } from './estate-index';
import { employerFor } from './employers';
import { FIELDS } from './fields';
import { dayOpensTick } from './hours';
import type { DeliveredRung } from './invoice';
import { MSP_CUSTOMERS, MSP_IDS, mspSetup } from './msp-company';
import { SCOPE_OUTCOMES } from './out-of-scope';
import {
  debitsByCustomer,
  departedCustomers,
  encodeLedger,
  entryFor,
  foldPatience,
  leavingThisWeek,
  patienceDebits,
  patienceLadderDue,
  patienceLedger,
  patienceStanding,
  patienceThreads,
  PATIENCE_CADENCE_MISSES,
  PATIENCE_DECAY,
  PATIENCE_RUNGS,
  PATIENCE_THRESHOLDS,
  quietCustomers,
  rungForPatience,
  withPatienceEntry,
  type PatienceEntry,
} from './patience';
import { contentFor } from './pools';
import { findWorldTicket } from './tickets';
import { DEFAULT_RUNG } from './titles';
import { generateWeek, PRODUCT_WINDOW } from './week-gen';
import type { WeekRequest } from './week-source';
import { createWorldSession } from './session';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

/** A real MSP world with its Monday pile on the desk. */
function world(): ReturnType<typeof createWorldSession> {
  return createWorldSession(MSP_CARRY);
}

/** The first ticket in the world that belongs to a customer with a contract. */
function contractedTicket(
  session: ReturnType<typeof createWorldSession>,
): { readonly id: string; readonly customer: string } {
  for (const node of session.engine.graph.nodesOfKind('ticket')) {
    const customer = customerOfTicket(node.id);

    if (customer !== null
      && typeof node.fields[FIELDS.customerSlaTier] === 'string') {
      return { id: node.id, customer };
    }
  }

  throw new Error('The MSP Monday deals no contracted ticket.');
}

function stamp(
  session: ReturnType<typeof createWorldSession>,
  ops: readonly SetupOp[],
): void {
  session.engine.applySetup([...ops]);
}

/* -- the debits ----------------------------------------------------------- */

describe('what an account counts against you', () => {
  it('counts nothing at all on a world nobody has let down', () => {
    const session = world();

    expect(patienceDebits(session.engine.graph)).toEqual([]);
  });

  it('counts the ack the contract settler stamped, not one it re-derives', () => {
    const session = world();
    const ticket = contractedTicket(session);

    expect(patienceDebits(session.engine.graph)).toEqual([]);

    stamp(session, [{
      op: 'setField',
      id: ticket.id,
      field: FIELDS.ackMissed,
      value: true,
    }]);

    const debits = patienceDebits(session.engine.graph);

    expect(debits).toHaveLength(1);
    expect(debits[0]?.customer).toBe(ticket.customer);
    expect(debits[0]?.reasons).toEqual(['ack']);
  });

  it('lets one missed update window go, and counts the second', () => {
    const session = world();
    const ticket = contractedTicket(session);

    stamp(session, [{
      op: 'setField',
      id: ticket.id,
      field: FIELDS.cadenceMissed,
      value: PATIENCE_CADENCE_MISSES - 1,
    }]);

    // One window is the hour somebody was on another fault. The threshold is
    // where it stops being that, and it is the whole of "never a single miss".
    expect(patienceDebits(session.engine.graph)).toEqual([]);

    stamp(session, [{
      op: 'setField',
      id: ticket.id,
      field: FIELDS.cadenceMissed,
      value: PATIENCE_CADENCE_MISSES,
    }]);

    expect(patienceDebits(session.engine.graph)[0]?.reasons).toEqual(['cadence']);
  });

  it('counts a tiered resolution breach the review deliberately does not', () => {
    const session = world();
    const ticket = contractedTicket(session);

    stamp(session, [{
      op: 'setField',
      id: ticket.id,
      field: FIELDS.breached,
      value: true,
    }]);

    expect(patienceDebits(session.engine.graph)[0]?.reasons).toEqual(['breach']);
  });

  it('counts an obliged out-of-scope answer, contract or no contract', () => {
    const session = world();
    const ticket = contractedTicket(session);

    stamp(session, [{
      op: 'setField',
      id: ticket.id,
      field: FIELDS.scopeOutcome,
      value: SCOPE_OUTCOMES.obliged,
    }]);

    expect(patienceDebits(session.engine.graph)[0]?.reasons).toEqual(['obliged']);
  });

  it('charges ONE debit per job however many ways it went wrong', () => {
    const session = world();
    const ticket = contractedTicket(session);

    stamp(session, [
      { op: 'setField', id: ticket.id, field: FIELDS.ackMissed, value: true },
      {
        op: 'setField',
        id: ticket.id,
        field: FIELDS.cadenceMissed,
        value: PATIENCE_CADENCE_MISSES,
      },
      { op: 'setField', id: ticket.id, field: FIELDS.breached, value: true },
    ]);

    const debits = patienceDebits(session.engine.graph);

    // Three reasons, one job, one debit. A count of jobs is what a client's own
    // account of a bad month is; a count of stamps would let a single abandoned
    // ticket walk most of the ladder by itself.
    expect(debits).toHaveLength(1);
    expect(debits[0]?.reasons).toEqual(['ack', 'cadence', 'breach']);
    expect(debitsByCustomer(debits).get(ticket.customer)).toBe(1);
  });

  it('counts a disputed invoice off the ladder that recorded it', () => {
    const session = world();
    const disputed: readonly DeliveredRung[] = [
      { customer: MSP_CUSTOMERS.holloway, rung: 'dispute', tick: 10 },
    ];
    const asked: readonly DeliveredRung[] = [
      { customer: MSP_CUSTOMERS.holloway, rung: 'query', tick: 10 },
    ];

    // A question about one line is a question. Holding the invoice is the
    // sentence the churn research puts at the top of every list.
    expect(patienceDebits(session.engine.graph, asked)).toEqual([]);

    const debits = patienceDebits(session.engine.graph, disputed);

    expect(debits).toHaveLength(1);
    expect(debits[0]?.customer).toBe(MSP_CUSTOMERS.holloway);
    expect(debits[0]?.reasons).toEqual(['disputed']);
  });

  it('charges an in-house world nothing, whatever is stamped on it', () => {
    const session = createWorldSession();

    for (const node of session.engine.graph.nodesOfKind('ticket')) {
      stamp(session, [
        { op: 'setField', id: node.id, field: FIELDS.ackMissed, value: true },
        { op: 'setField', id: node.id, field: FIELDS.breached, value: true },
      ]);
    }

    // The probation shop has no customers, so nobody is disappointed in
    // anybody: the whole mechanic is inert rather than merely switched off.
    expect(patienceDebits(session.engine.graph)).toEqual([]);
  });
});

/* -- the ladder ----------------------------------------------------------- */

const ACCOUNT = MSP_CUSTOMERS.fontaine;

function ledgerOf(...entries: readonly PatienceEntry[]): readonly PatienceEntry[] {
  return entries;
}

function debits(count: number): ReadonlyMap<string, number> {
  return new Map(count === 0 ? [] : [[ACCOUNT, count]]);
}

describe('the ladder', () => {
  it('stands on nothing for the week that let one job get away', () => {
    expect(rungForPatience(0)).toBe('none');
    expect(rungForPatience(PATIENCE_THRESHOLDS.asking - 1)).toBe('none');
    expect(patienceLadderDue([], debits(1), 1)).toEqual([]);
  });

  it('asks at the first threshold and asks only once', () => {
    const due = patienceLadderDue([], debits(PATIENCE_THRESHOLDS.asking), 1);

    expect(due).toEqual([{
      customer: ACCOUNT,
      rung: 'asking',
      standing: PATIENCE_THRESHOLDS.asking,
    }]);

    const asked = ledgerOf({
      customer: ACCOUNT,
      standing: 0,
      rung: 'asking',
      tick: 60,
    });

    expect(patienceLadderDue(asked, debits(PATIENCE_THRESHOLDS.asking), 1))
      .toEqual([]);
  });

  it('never skips a rung, however badly the week went', () => {
    // Straight to a standing past the notice. What is due is the QUESTION.
    const due = patienceLadderDue([], debits(PATIENCE_THRESHOLDS.leaving + 4), 1);

    expect(due.map((step) => step.rung)).toEqual(['asking']);

    const asked = ledgerOf({
      customer: ACCOUNT,
      standing: 0,
      rung: 'asking',
      tick: 60,
    });

    expect(
      patienceLadderDue(asked, debits(PATIENCE_THRESHOLDS.leaving + 4), 1)
        .map((step) => step.rung),
    ).toEqual(['quiet']);
  });

  it('will not write the letter on the day the work stopped coming', () => {
    const wentQuiet = ledgerOf({
      customer: ACCOUNT,
      standing: 0,
      rung: 'quiet',
      tick: dayOpensTick(2) + 30,
    });
    const today = 2;

    // Their work stopped coming this morning. The notice is a question about
    // whether it is STILL true, and today cannot answer it.
    expect(patienceLadderDue(wentQuiet, debits(PATIENCE_THRESHOLDS.leaving), today))
      .toEqual([]);

    expect(
      patienceLadderDue(wentQuiet, debits(PATIENCE_THRESHOLDS.leaving), today + 1)
        .map((step) => step.rung),
    ).toEqual(['leaving']);
  });

  it('lets a carried deweight be answered the same week the notice lands', () => {
    // A rung carried in from an earlier week has no tick, so there is no day
    // for the notice to be waiting on: the pattern is already weeks old.
    const carried = ledgerOf({
      customer: ACCOUNT,
      standing: PATIENCE_THRESHOLDS.leaving,
      rung: 'quiet',
      tick: 0,
    });

    expect(patienceLadderDue(carried, debits(0), 1).map((step) => step.rung))
      .toEqual(['leaving']);
  });

  it('is escapable right up to the morning the letter would land', () => {
    const wentQuiet = ledgerOf({
      customer: ACCOUNT,
      standing: PATIENCE_THRESHOLDS.leaving - 1,
      rung: 'quiet',
      tick: 30,
    });

    // Still a day short of the notice's threshold, on a later day: nothing is
    // due, and nothing ever will be if the week stays like this.
    expect(patienceLadderDue(wentQuiet, debits(0), 5)).toEqual([]);
  });
});

/* -- the fold ------------------------------------------------------------- */

describe('the fold at the end of the week', () => {
  it('adds a bad week and takes a clean one off', () => {
    const after = foldPatience([], debits(3));

    // The standing moves and the RUNG does not: the fold only ever walks a
    // rung back. Handing one over is the ladder's job and the ladder does it
    // one at a time, so a fold that raised one would be the skip the settler
    // refuses, taken through the back door.
    expect(after).toEqual([{
      customer: ACCOUNT,
      standing: 3,
      rung: 'none',
      tick: 0,
    }]);

    const decayed = foldPatience(after, debits(0));

    expect(decayed[0]?.standing).toBe(3 - PATIENCE_DECAY);
  });

  it('walks a rung back when the standing decays under it', () => {
    const asked = ledgerOf({
      customer: ACCOUNT,
      standing: PATIENCE_THRESHOLDS.asking,
      rung: 'asking',
      tick: 240,
    });
    const clean = foldPatience(asked, debits(0));

    expect(clean[0]?.standing).toBe(PATIENCE_THRESHOLDS.asking - PATIENCE_DECAY);
    expect(clean[0]?.rung).toBe('none');
    // And the ladder can ask again later, because it was given back rather
    // than merely stopped: that is what makes the first rungs escapable.
    expect(patienceLadderDue(clean, debits(2), 1).map((step) => step.rung))
      .toEqual(['asking']);
  });

  it('never walks a notice back, however good the fortnight after it', () => {
    const notice = ledgerOf({
      customer: ACCOUNT,
      standing: PATIENCE_THRESHOLDS.leaving,
      rung: 'leaving',
      tick: 240,
    });
    let folded = foldPatience(notice, debits(0));

    for (let week = 0; week < 20; week += 1) {
      folded = foldPatience(folded, debits(0));
    }

    expect(folded[0]?.standing).toBe(0);
    expect(folded[0]?.rung).toBe('leaving');
    expect(departedCustomers(folded)).toEqual([ACCOUNT]);
  });

  it('takes every clock off, because a tick does not cross a Friday', () => {
    const stamped = ledgerOf({
      customer: ACCOUNT,
      standing: 4,
      rung: 'quiet',
      tick: 305,
    });

    expect(foldPatience(stamped, debits(1))[0]?.tick).toBe(0);
    // And it is what makes the notice week-scoped news: the letter is in this
    // week's post and next week it is history.
    expect(leavingThisWeek(stamped)).toEqual([]);
  });

  it('writes nothing at all for a shop nobody has a history with', () => {
    expect(foldPatience([], new Map())).toEqual([]);
    expect(encodeLedger(foldPatience([], new Map()))).toBe('');
  });

  it('drops an account that has folded all the way back to nothing', () => {
    const one = ledgerOf({
      customer: ACCOUNT,
      standing: 1,
      rung: 'none',
      tick: 0,
    });

    expect(foldPatience(one, debits(0))).toEqual([]);
  });
});

/* -- the reachability arithmetic ------------------------------------------ */

describe('the exit is reachable by neglect and by nothing else', () => {
  it('is three ruinous weeks away and not one', () => {
    const bad = 3;
    let ledger: readonly PatienceEntry[] = [];
    const weeks: number[] = [];

    for (let week = 1; week <= 3; week += 1) {
      ledger = foldPatience(ledger, debits(bad));
      weeks.push(entryFor(ledger, ACCOUNT).standing);
    }

    // Two to four arrivals an account, all of them abandoned: the standing
    // climbs three a week, so the notice's threshold is inside the arc and
    // nowhere near inside one week.
    expect(weeks).toEqual([3, 6, 9]);
    expect(weeks[0]).toBeLessThan(PATIENCE_THRESHOLDS.leaving);
    expect(weeks[1]).toBeGreaterThanOrEqual(PATIENCE_THRESHOLDS.leaving);
  });

  it('never arrives for a week that let one job get away and then behaved', () => {
    let ledger: readonly PatienceEntry[] = [];

    for (let week = 1; week <= 12; week += 1) {
      ledger = foldPatience(ledger, debits(week % 2 === 1 ? 1 : 0));
      expect(rungForPatience(entryFor(ledger, ACCOUNT).standing)).toBe('none');
    }
  });

  it('keeps the rungs in the order the research says they are walked', () => {
    expect([...PATIENCE_RUNGS]).toEqual(['none', 'asking', 'quiet', 'leaving']);
    expect(PATIENCE_THRESHOLDS.asking).toBeLessThan(PATIENCE_THRESHOLDS.quiet);
    expect(PATIENCE_THRESHOLDS.quiet).toBeLessThan(PATIENCE_THRESHOLDS.leaving);
  });
});

/* -- the ledger ----------------------------------------------------------- */

describe('the ledger on the player node', () => {
  it('round-trips, and reads a hand-edited line as no history at all', () => {
    const written = withPatienceEntry(
      withPatienceEntry('', {
        customer: MSP_CUSTOMERS.arden,
        standing: 2,
        rung: 'asking',
        tick: 90,
      }),
      { customer: ACCOUNT, standing: 5, rung: 'quiet', tick: 0 },
    );

    expect(patienceLedger(written)).toEqual([
      { customer: MSP_CUSTOMERS.arden, standing: 2, rung: 'asking', tick: 90 },
      { customer: ACCOUNT, standing: 5, rung: 'quiet', tick: 0 },
    ]);

    expect(patienceLedger(`${written}\nrubbish`)).toHaveLength(2);
    expect(patienceLedger(undefined)).toEqual([]);
    expect(entryFor([], 'customer:nobody')).toEqual({
      customer: 'customer:nobody',
      standing: 0,
      rung: 'none',
      tick: 0,
    });
  });

  it('answers quiet and departed off the one list, and never two', () => {
    const ledger = patienceLedger(encodeLedger([
      { customer: MSP_CUSTOMERS.arden, standing: 4, rung: 'quiet', tick: 0 },
      { customer: ACCOUNT, standing: 7, rung: 'leaving', tick: 200 },
      { customer: MSP_CUSTOMERS.meridian, standing: 1, rung: 'none', tick: 0 },
    ]));

    expect(quietCustomers(ledger)).toEqual([MSP_CUSTOMERS.arden]);
    expect(departedCustomers(ledger)).toEqual([ACCOUNT]);
    expect(leavingThisWeek(ledger)).toEqual([ACCOUNT]);
  });

  it('reads the live standing as what was carried in plus this week', () => {
    const ledger = ledgerOf({
      customer: ACCOUNT,
      standing: 3,
      rung: 'asking',
      tick: 0,
    });
    const [account] = patienceStanding(ledger, debits(2));

    expect(account?.standing).toBe(5);
    expect(account?.debits).toBe(2);
    expect(account?.delivered).toBe('asking');
  });
});

/* -- the post ------------------------------------------------------------- */

describe('the account manager', () => {
  it('writes only about a rung handed over THIS week', () => {
    const carried = ledgerOf({
      customer: ACCOUNT,
      standing: 4,
      rung: 'quiet',
      tick: 0,
    });

    expect(patienceThreads({
      ledger: [...carried],
      debits: [],
      labelOf: () => 'FONTAINE-LAW',
      accountManager: MSP_IDS.mspLead,
    })).toEqual([]);
  });

  it('names the jobs off the file when the notice goes out', () => {
    const notice = ledgerOf({
      customer: ACCOUNT,
      standing: 6,
      rung: 'leaving',
      tick: 300,
    });
    const [thread] = patienceThreads({
      ledger: [...notice],
      debits: [
        { customer: ACCOUNT, ticket: 'ticket:one', reasons: ['ack'] },
        { customer: ACCOUNT, ticket: 'ticket:two', reasons: ['cadence', 'breach'] },
      ],
      labelOf: () => 'FONTAINE-LAW',
      accountManager: MSP_IDS.mspLead,
    });

    expect(thread?.messages[0]?.from).toBe(MSP_IDS.mspLead);
    expect(thread?.messages[0]?.tick).toBe(300);

    const body = thread?.messages[0]?.body.join('\n') ?? '';

    // Answerable from the records, like every other accusation in this game.
    expect(body).toContain('ticket:one');
    expect(body).toContain('ticket:two');
    expect(body).toContain('acknowledged');
  });
});

/* -- what leaves the world ------------------------------------------------ */

/** Every node id an op list builds. */
function nodesIn(ops: readonly SetupOp[]): ReadonlySet<string> {
  return new Set(
    ops.flatMap((op) => (op.op === 'addNode' ? [op.node.id] : [])),
  );
}

describe('the estate a departure takes with it', () => {
  it('hands the same ops back when nobody has left', () => {
    const ops = mspSetup();

    // Identity, not equality: the byte-identical claim made structurally.
    expect(withoutDeparted(ops, new Set())).toBe(ops);
  });

  it('takes the customer, their boxes, and everything hanging off them', () => {
    const ops = mspSetup();
    const before = nodesIn(ops);
    const after = nodesIn(withoutDeparted(ops, new Set([MSP_CUSTOMERS.elmwood])));

    expect(before.has(MSP_CUSTOMERS.elmwood)).toBe(true);
    expect(after.has(MSP_CUSTOMERS.elmwood)).toBe(false);

    const gone = [...before].filter((id) => !after.has(id));

    // Their boxes went. So did the USB sensor plugged into one of them, which
    // carries no customer field of its own and would otherwise be left
    // hanging in a world with no clinic in it.
    expect(gone.some((id) => id.startsWith('machine:'))).toBe(true);
    expect(gone.some((id) => id.startsWith('device:'))).toBe(true);
    expect(gone.some((id) => id.startsWith('account:'))).toBe(true);
    expect(gone.some((id) => id.startsWith('person:'))).toBe(true);
  });

  it('leaves every other estate and the desk itself exactly as they were', () => {
    const ops = mspSetup();
    const kept = withoutDeparted(ops, new Set([MSP_CUSTOMERS.elmwood]));
    const after = nodesIn(kept);

    expect(after.has(MSP_IDS.player)).toBe(true);
    expect(after.has(MSP_IDS.playerMachine)).toBe(true);
    expect(after.has(MSP_IDS.mspLead)).toBe(true);

    for (const other of Object.values(MSP_CUSTOMERS)) {
      if (other === MSP_CUSTOMERS.elmwood || other === MSP_CUSTOMERS.tillman) {
        continue;
      }

      expect(after.has(other)).toBe(true);
    }
  });

  it('leaves no edge with an end that has gone', () => {
    const kept = withoutDeparted(mspSetup(), new Set([MSP_CUSTOMERS.marlowe]));
    const built = nodesIn(kept);

    for (const op of kept) {
      if (op.op === 'addEdge') {
        expect(built.has(op.edge.from)).toBe(true);
        expect(built.has(op.edge.to)).toBe(true);
      }
    }
  });

  it('stands a world up without them, and refuses their remnants honestly', () => {
    const ledger = encodeLedger([
      { customer: MSP_CUSTOMERS.marlowe, standing: 6, rung: 'leaving', tick: 0 },
    ]);
    const session = createWorldSession({
      ...MSP_CARRY,
      arcWeek: 2,
      estate: [{
        node: MSP_IDS.player,
        field: FIELDS.customerPatience,
        value: ledger,
      }],
    });
    const graph = session.engine.graph;

    expect(graph.getNode(MSP_CUSTOMERS.marlowe)).toBeUndefined();
    expect(
      graph.nodesOfKind('machine')
        .some((node) => node.fields[FIELDS.machineCustomer] === MSP_CUSTOMERS.marlowe),
    ).toBe(false);
    expect(
      graph.nodesOfKind('account')
        .some((node) => node.fields[FIELDS.machineCustomer] === MSP_CUSTOMERS.marlowe),
    ).toBe(false);

    // Everybody else is still in the building, desk included.
    expect(graph.getNode(MSP_CUSTOMERS.fontaine)).toBeDefined();
    expect(graph.getNode(MSP_IDS.playerMachine)).toBeDefined();

    // And the week they were dealt into deals none of their work.
    for (const day of session.week) {
      for (const id of [
        ...day.inherited,
        ...day.drip.map((slot) => slot.ticketId),
      ]) {
        expect(customerOfTicket(id)).not.toBe(MSP_CUSTOMERS.marlowe);
      }
    }
  });
});

/* -- what stops arriving --------------------------------------------------- */

describe('the pool after the churn', () => {
  const content = contentFor(employerFor('msp'));

  it('hands the same content back when nothing has happened to anybody', () => {
    expect(contentAfterChurn(content)).toBe(content);
  });

  it('takes a departed account out of the pool entirely', () => {
    const after = contentAfterChurn(
      content,
      { departed: new Set([MSP_CUSTOMERS.holloway]), quiet: new Set() },
    );
    const theirs = (entries: readonly { readonly id: string }[]): number => entries
      .length;

    expect(theirs(after.pool)).toBeLessThan(theirs(content.pool));

    for (const entry of after.pool) {
      expect([...customersOfEntry(entry)]).not.toContain(MSP_CUSTOMERS.holloway);
    }
  });

  it('takes a beat WHOLE when the account it is about has gone', () => {
    // The MSP's one coupled beat is the signing and the discovery drip that
    // follows it, and both are TILLMAN's. Half of it is the arc with its point
    // taken out, so it goes together or not at all.
    const after = contentAfterChurn(
      content,
      { departed: new Set([MSP_CUSTOMERS.tillman]), quiet: new Set() },
    );

    expect(content.beats.length).toBeGreaterThan(0);
    expect(after.beats.length).toBeLessThan(content.beats.length);

    for (const entry of after.pool) {
      expect([...customersOfEntry(entry)]).not.toContain(MSP_CUSTOMERS.tillman);
    }
  });

  it('thins a quiet account rather than silencing it', () => {
    const after = contentAfterChurn(
      content,
      { departed: new Set(), quiet: new Set([MSP_CUSTOMERS.fontaine]) },
    );

    // Nothing is removed - their work still exists and can still be drawn.
    expect(after.pool).toHaveLength(content.pool.length);

    const weights = new Map(after.pool.map((entry) => [entry.id, entry.weight]));
    let thinned = 0;
    let ordinary = 0;

    for (const entry of content.pool) {
      const theirs = [...customersOfEntry(entry)]
        .includes(MSP_CUSTOMERS.fontaine);
      const weight = weights.get(entry.id);

      if (theirs) {
        expect(weight).toBe(entry.weight * QUIET_WEIGHT);
        thinned += 1;
      } else {
        expect(weight).toBe(entry.weight * NORMAL_WEIGHT);
        ordinary += 1;
      }
    }

    expect(thinned).toBeGreaterThan(0);
    expect(ordinary).toBeGreaterThan(0);
  });
});

/* -- the generator, after the churn ---------------------------------------- */

describe('the week a churned shop is dealt', () => {
  const content = contentFor(employerFor('msp'));
  const ACCOUNT_GONE = MSP_CUSTOMERS.meridian;
  /**
   * Far enough up the arc that nothing else in this file has drawn near it.
   *
   * The generator keeps a module-global cache and the defect this gate is
   * about is a cache-key one, so the week it asks about has to be one no
   * earlier test has already filed an answer for.
   */
  const FAR = 40;

  function request(departed: readonly string[]): WeekRequest {
    return {
      employer: 'msp',
      attempt: 1,
      arcWeek: FAR,
      rung: DEFAULT_RUNG,
      ...(departed.length === 0 ? {} : { departed }),
    };
  }

  it('never files itself under the week a whole shop would have had', () => {
    // The truth, composed with an injected pricer so it cannot be answered out
    // of the cache: this is the week a shop that lost nobody is dealt.
    const truth = generateWeek(request([]), content, {
      window: PRODUCT_WINDOW,
      price: findWorldTicket,
    });

    // A churned week at the same position. Building it generates the weeks
    // BEFORE it to fill the exclusion window, and those are the ones that used
    // to be filed under the unchurned shop's key.
    generateWeek(request([ACCOUNT_GONE]), content, { window: PRODUCT_WINDOW });

    // And the unchurned week, off the cached road. Take the churn out of the
    // key `drawnBefore` recurses with and this is a week built on a history
    // that never happened - at a shop where nobody has left.
    expect(generateWeek(request([]), content, { window: PRODUCT_WINDOW }))
      .toEqual(truth);
  });

  it('deals none of a departed account\'s work, at any position in the arc', () => {
    for (let arcWeek = 2; arcWeek <= 8; arcWeek += 1) {
      const week = generateWeek(
        {
          employer: 'msp',
          attempt: 1,
          arcWeek,
          rung: DEFAULT_RUNG,
          departed: [ACCOUNT_GONE],
        },
        content,
        { window: PRODUCT_WINDOW },
      );

      for (const script of week) {
        for (const id of [
          ...script.inherited,
          ...script.drip.map((slot) => slot.ticketId),
        ]) {
          expect(customerOfTicket(id)).not.toBe(ACCOUNT_GONE);
        }
      }
    }
  });
});
