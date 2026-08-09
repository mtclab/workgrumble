/**
 * The customer's reading of the sheet, out of fixtures (0.30.0, slice 2).
 *
 * `shell/invoice.test.ts` plays the whole thing on a real week. This proves the
 * model itself, one claim at a time, because the properties that matter here
 * are properties of the ARITHMETIC and a driven week can only ever show that
 * they held once:
 *
 *  - an honest sheet cannot flag. Not "does not on the shipped week" - CANNOT,
 *    on any sheet, on the worst day anybody ever had, because every pattern is
 *    gated on a claim exceeding what the records derived and an unedited claim
 *    is the derivation.
 *  - each pattern answers from ONE named record, and says which.
 *  - the standing decays, and today is never a clean day.
 *  - the ladder is sequential, escapable, and its last rung is about time at
 *    the top rather than about one more point.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { PLAYER_TIERS } from './fields';
import { shiftStartTick } from './hours';
import {
  breakdownLines,
  deliveredRungs,
  encodeRung,
  formerClients,
  type InvoiceRecords,
  invoiceLadderDue,
  invoiceThreads,
  isRoundClaim,
  rungDelivered,
  rungForScrutiny,
  scrutinyByCustomer,
  scrutinyFlags,
  withDeliveredRung,
} from './invoice';
import {
  deriveTimesheet,
  encodeSegment,
  segmentsFrom,
  type Timesheet,
  type TimesheetClaim,
  timesheetSheet,
} from './timesheet';

beforeAll(() => {
  loadEngineForTests();
});

const ARDEN = 'customer:arden';
const ELMWOOD = 'customer:elmwood';

/** Half nine on a given day, which is where every fixture morning starts. */
function morning(day: number): number {
  return shiftStartTick(day) + 30;
}

/**
 * A sheet with real derived minutes on it: one stretch per customer per day,
 * through the shipped derivation rather than through a literal, so a change to
 * how minutes are counted moves these fixtures with it.
 */
function sheetOf(
  worked: readonly { day: number; customer: string; minutes: number }[],
  claims: readonly TimesheetClaim[],
  now: number,
): Timesheet {
  const lines = worked.flatMap((entry) => [
    encodeSegment(
      morning(entry.day),
      { kind: 'customer', id: entry.customer },
      morning(entry.day) + entry.minutes,
    ),
  ]);

  return timesheetSheet(
    deriveTimesheet(segmentsFrom(lines.join('\n')), now),
    claims,
    {
      tier: PLAYER_TIERS.systemsEngineer,
      submittedAt: null,
      submittedAuto: false,
      labelOf: (_kind, id) => id,
    },
  );
}

function claim(
  day: number,
  customer: string,
  minutes: number,
): TimesheetClaim {
  return { day, bucket: `customer|${customer}`, minutes, detail: 'detailed' };
}

/** Records that answer whatever the case in hand needs them to. */
function records(
  input: Readonly<{
    caught?: readonly number[];
    active?: readonly { customer: string; day: number }[];
  }> = {},
): InvoiceRecords {
  const caught = new Set(input.caught ?? []);
  const active = new Set(
    (input.active ?? []).map((entry) => `${entry.customer}@${String(entry.day)}`),
  );

  return {
    customerOf: (bucket: string) =>
      bucket.startsWith('customer|') ? bucket.slice('customer|'.length) : null,
    caughtOn: (day: number) => caught.has(day),
    activeOn: (customer: string, day: number) =>
      active.has(`${customer}@${String(day)}`),
  };
}

describe('an honest sheet', () => {
  it('flags nothing on the worst day anybody ever had', () => {
    // Every condition that could possibly matter is against the player here:
    // their estate logged nothing all week, and the shop wrote them up on
    // every single day. The one thing missing is a claim over the records.
    const sheet = sheetOf(
      [1, 2, 3, 4, 5].map((day) => ({ day, customer: ARDEN, minutes: 60 })),
      [],
      shiftStartTick(5) + 400,
    );
    const seen = records({ caught: [1, 2, 3, 4, 5] });

    expect(scrutinyFlags(sheet, seen, 5)).toEqual([]);
    expect([...scrutinyByCustomer(sheet, seen, 5).values()]).toEqual([]);
    expect(invoiceLadderDue(sheet, seen, [], 5)).toEqual([]);
  });

  it('flags nothing when the player claims exactly what was recorded', () => {
    const sheet = sheetOf(
      [1, 2, 3].map((day) => ({ day, customer: ARDEN, minutes: 60 })),
      [1, 2, 3].map((day) => claim(day, ARDEN, 90)),
      shiftStartTick(3) + 400,
    );

    // 90 is what a sixty-minute stretch derives - the work plus the tail
    // nobody could have written anything else down in - so this is a player
    // typing the true figure into three lines. It is a round number on three
    // days and it still flags nothing, because nothing was added.
    expect(sheet.days[0]?.lines[0]?.derived).toBe(90);
    expect(scrutinyFlags(sheet, records(), 3)).toEqual([]);
  });
});

describe('the three patterns', () => {
  it('reads the quiet day off the customer\'s own estate', () => {
    const sheet = sheetOf(
      [{ day: 1, customer: ARDEN, minutes: 30 }],
      [claim(1, ARDEN, 240)],
      shiftStartTick(1) + 400,
    );

    expect(scrutinyFlags(sheet, records(), 1).map((flag) => flag.pattern))
      .toEqual(['quiet_day']);
    expect(scrutinyFlags(sheet, records(), 1)[0]?.evidence)
      .toContain('logged nothing at all');

    // And it does not fire on a day their systems DID record something. A day
    // with a service down and back on it is a day the customer can see
    // somebody was in there, whatever the entry says.
    expect(
      scrutinyFlags(sheet, records({ active: [{ customer: ARDEN, day: 1 }] }), 1),
    ).toEqual([]);
  });

  it('reads the caught day off the shop\'s own conduct file', () => {
    const sheet = sheetOf(
      [{ day: 2, customer: ARDEN, minutes: 30 }],
      [claim(2, ARDEN, 240)],
      shiftStartTick(2) + 400,
    );
    const seen = records({
      caught: [2],
      active: [{ customer: ARDEN, day: 2 }],
    });

    expect(scrutinyFlags(sheet, seen, 2).map((flag) => flag.pattern))
      .toEqual(['caught_day']);
    expect(scrutinyFlags(sheet, seen, 2)[0]?.evidence).toContain('conduct file');
  });

  it('needs three days of the same figure, then counts every one after', () => {
    const worked = [1, 2, 3, 4].map(
      (day) => ({ day, customer: ELMWOOD, minutes: 10 }),
    );
    const claims = [1, 2, 3, 4].map((day) => claim(day, ELMWOOD, 120));
    const active = [1, 2, 3, 4].map((day) => ({ customer: ELMWOOD, day }));
    const seen = records({ active });

    expect(isRoundClaim(120)).toBe(true);
    expect(isRoundClaim(125)).toBe(false);

    const twoDays = sheetOf(worked.slice(0, 2), claims.slice(0, 2), shiftStartTick(2) + 400);
    const fourDays = sheetOf(worked, claims, shiftStartTick(4) + 400);

    // Two identical entries are a pair. Three are a habit, and the fourth is
    // another instance of it rather than the same news twice.
    expect(scrutinyFlags(twoDays, seen, 2)).toEqual([]);
    expect(
      scrutinyFlags(fourDays, seen, 4)
        .filter((flag) => flag.pattern === 'round_number')
        .map((flag) => flag.day),
    ).toEqual([3, 4]);
  });

  it('is evaluated as of a day rather than over the week', () => {
    const worked = [1, 2, 3].map(
      (day) => ({ day, customer: ELMWOOD, minutes: 10 }),
    );
    const claims = [1, 2, 3].map((day) => claim(day, ELMWOOD, 120));
    const sheet = sheetOf(worked, claims, shiftStartTick(3) + 400);
    const seen = records({
      active: [1, 2, 3].map((day) => ({ customer: ELMWOOD, day })),
    });

    // The third identical Tuesday is a pattern on the Wednesday and was not
    // one on the Monday. A ladder built off a week-shaped read would deliver
    // every beat it owed at once on the Friday.
    expect(scrutinyFlags(sheet, seen, 2)).toEqual([]);
    expect(scrutinyFlags(sheet, seen, 3)).toHaveLength(1);
  });
});

describe('the standing', () => {
  it('decays over a day that finished clean, and never over today', () => {
    const sheet = sheetOf(
      [
        { day: 1, customer: ARDEN, minutes: 30 },
        { day: 2, customer: ARDEN, minutes: 30 },
        { day: 3, customer: ARDEN, minutes: 30 },
      ],
      [claim(1, ARDEN, 240), claim(2, ARDEN, 240)],
      shiftStartTick(4) + 400,
    );
    const seen = records();

    // Two padded days, then a day that finished with nothing added: two up,
    // one back. The decay is read on the Thursday, because Wednesday only
    // counts as clean once it is over.
    expect(scrutinyByCustomer(sheet, seen, 2).get(ARDEN)).toBe(2);
    expect(scrutinyByCustomer(sheet, seen, 3).get(ARDEN)).toBe(2);
    expect(scrutinyByCustomer(sheet, seen, 4).get(ARDEN)).toBe(1);

    // And the morning of day two, before anything has been filed on it, is
    // NOT a clean day: a fold that decayed on today would take the pressure
    // off every single morning and the ladder would never leave its first
    // rung.
    const monday = sheetOf(
      [{ day: 1, customer: ARDEN, minutes: 30 }],
      [claim(1, ARDEN, 240)],
      shiftStartTick(2) + 30,
    );

    expect(scrutinyByCustomer(monday, seen, 2).get(ARDEN)).toBe(1);
  });

  it('lets one pad go, which is what makes the habit the mechanic', () => {
    expect(rungForScrutiny(0)).toBe('none');
    expect(rungForScrutiny(1)).toBe('none');
    expect(rungForScrutiny(2)).toBe('query');
    expect(rungForScrutiny(3)).toBe('breakdown');
    expect(rungForScrutiny(4)).toBe('dispute');
    expect(rungForScrutiny(5)).toBe('account_manager');
    // And it stops there. Leaving is not one more point of annoyance.
    expect(rungForScrutiny(50)).toBe('account_manager');
  });
});

describe('the ladder', () => {
  const worked = [1, 2, 3, 4, 5].map(
    (day) => ({ day, customer: ARDEN, minutes: 10 }),
  );
  const claims = [1, 2, 3, 4, 5].map((day) => claim(day, ARDEN, 120));

  it('hands over one rung at a time however far the standing has run', () => {
    const sheet = sheetOf(worked, claims, shiftStartTick(5) + 400);
    const seen = records({ caught: [1, 2, 3, 4, 5] });

    // The standing here is enormous - three patterns a day for five days - and
    // the ladder still offers exactly the first rung.
    expect((scrutinyByCustomer(sheet, seen, 5).get(ARDEN) ?? 0))
      .toBeGreaterThan(5);
    expect(invoiceLadderDue(sheet, seen, [], 5).map((step) => step.rung))
      .toEqual(['query']);
    expect(invoiceLadderDue(sheet, seen, [], 5)[0]?.customer).toBe(ARDEN);

    // And then the next one, and no further.
    const afterQuery = deliveredRungs(withDeliveredRung('', {
      customer: ARDEN,
      rung: 'query',
      tick: morning(1),
    }));

    expect(invoiceLadderDue(sheet, seen, afterQuery, 5).map((step) => step.rung))
      .toEqual(['breakdown']);
  });

  it('sends nobody anything once the lines are put back', () => {
    const sheet = sheetOf(worked, [], shiftStartTick(5) + 400);
    const seen = records({ caught: [1, 2, 3, 4, 5] });
    const stood = deliveredRungs([
      encodeRung({ customer: ARDEN, rung: 'query', tick: morning(1) }),
      encodeRung({ customer: ARDEN, rung: 'breakdown', tick: morning(2) }),
    ].join('\n'));

    // Two rungs already handed over, and the sheet now says exactly what the
    // records say. Nothing more is due, ever - which is the escape, and it is
    // silence rather than an apology.
    expect(invoiceLadderDue(sheet, seen, stood, 5)).toEqual([]);
    expect(rungDelivered(stood, ARDEN)).toBe('breakdown');
  });

  it('loses the client for time at the top, not for one more point', () => {
    const sheet = sheetOf(worked, claims, shiftStartTick(5) + 400);
    const seen = records({ caught: [1, 2, 3, 4, 5] });
    const sameDay = deliveredRungs([
      encodeRung({ customer: ARDEN, rung: 'query', tick: morning(1) }),
      encodeRung({ customer: ARDEN, rung: 'breakdown', tick: morning(2) }),
      encodeRung({ customer: ARDEN, rung: 'dispute', tick: morning(3) }),
      encodeRung({ customer: ARDEN, rung: 'account_manager', tick: morning(5) }),
    ].join('\n'));

    // Escalated this morning: nothing is due today, whatever the standing is.
    // A client does not give notice in the same afternoon they rang.
    expect(invoiceLadderDue(sheet, seen, sameDay, 5)).toEqual([]);

    const yesterday = deliveredRungs([
      encodeRung({ customer: ARDEN, rung: 'query', tick: morning(1) }),
      encodeRung({ customer: ARDEN, rung: 'breakdown', tick: morning(2) }),
      encodeRung({ customer: ARDEN, rung: 'dispute', tick: morning(3) }),
      encodeRung({ customer: ARDEN, rung: 'account_manager', tick: morning(4) }),
    ].join('\n'));

    expect(invoiceLadderDue(sheet, seen, yesterday, 5).map((step) => step.rung))
      .toEqual(['left']);

    // And the same escalation, on a sheet that was put right overnight: they
    // stay. It is escapable at the last possible morning, which is the only
    // place a mechanic like this is worth having.
    const mended = sheetOf(worked, [], shiftStartTick(5) + 400);

    expect(invoiceLadderDue(mended, seen, yesterday, 5)).toEqual([]);
  });
});

describe('the ledger of what was said', () => {
  it('round-trips, and drops a line this build cannot read', () => {
    const field = [
      encodeRung({ customer: ARDEN, rung: 'query', tick: 10 }),
      'nonsense',
      `${ELMWOOD}|not_a_rung|20`,
      `${ELMWOOD}|left|`,
      encodeRung({ customer: ELMWOOD, rung: 'left', tick: 30 }),
    ].join('\n');

    expect(deliveredRungs(field)).toEqual([
      { customer: ARDEN, rung: 'query', tick: 10 },
      { customer: ELMWOOD, rung: 'left', tick: 30 },
    ]);
    expect([...formerClients(field)]).toEqual([ELMWOOD]);
    expect([...formerClients(undefined)]).toEqual([]);
    expect(rungDelivered(deliveredRungs(field), ARDEN)).toBe('query');
    expect(rungDelivered(deliveredRungs(field), 'customer:nobody')).toBe('none');
  });
});

describe('the answer', () => {
  const sheet = sheetOf(
    [
      { day: 1, customer: ARDEN, minutes: 30 },
      { day: 2, customer: ARDEN, minutes: 30 },
    ],
    [claim(1, ARDEN, 240), { ...claim(2, ARDEN, 240), detail: 'vague' }],
    shiftStartTick(2) + 400,
  );
  const seen = records();

  it('itemises the week out of the derivation and says which lines are vague', () => {
    const answer = breakdownLines(sheet, seen, ARDEN, 'ARDEN-MFG').join('\n');

    // Both numbers on every row, and the wording each line goes out as. The
    // exposure is the comparison, and nothing in it tells the player off.
    expect(answer).toContain('ARDEN-MFG, line by line');
    expect(answer).toContain('4h invoiced, 1h on our records, itemised');
    expect(answer).toContain('described as "consulting"');
    expect(answer).toContain('8h invoiced against 2h of recorded work');
    expect(answer).not.toContain('should');
  });

  it('puts the same answer in the post, from the customer\'s own contact', () => {
    const threads = invoiceThreads({
      sheet,
      records: seen,
      delivered: deliveredRungs([
        encodeRung({ customer: ARDEN, rung: 'query', tick: 10 }),
        encodeRung({ customer: ARDEN, rung: 'breakdown', tick: 20 }),
      ].join('\n')),
      labelOf: () => 'ARDEN-MFG',
      contactOf: () => 'person:arden-dev',
      accountManager: 'person:fc-morgan',
    });

    expect(threads).toHaveLength(1);
    expect(threads[0]?.messages.map((message) => message.from))
      .toEqual(['person:arden-dev', 'person:arden-dev']);
    expect(threads[0]?.messages[1]?.body.join('\n'))
      .toContain('8h invoiced against 2h of recorded work');
    // The account manager's rung comes from the shop's own side, not theirs.
    expect(invoiceThreads({
      sheet,
      records: seen,
      delivered: deliveredRungs(encodeRung({
        customer: ARDEN,
        rung: 'account_manager',
        tick: 30,
      })),
      labelOf: () => 'ARDEN-MFG',
      contactOf: () => 'person:arden-dev',
      accountManager: 'person:fc-morgan',
    })[0]?.messages[0]?.from).toBe('person:fc-morgan');
  });

  it('says so plainly when there is nothing on the sheet against them', () => {
    expect(breakdownLines(sheet, seen, ELMWOOD, 'ELMWOOD-DENTAL'))
      .toEqual(['There is nothing on the sheet against ELMWOOD-DENTAL.']);
  });
});
