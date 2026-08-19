/**
 * The timesheet model (0.30.0, slice 1), held to the four claims it makes.
 *
 * 1. THERE IS ONE DERIVATION. Minutes are produced in exactly one place, from
 *    exactly one record, and the ledger the driver writes and the ledger the
 *    engine's own dispatch log implies go through the identical attribution.
 *    `../shell/timesheet.test.ts` proves that over a real driven day; this file
 *    proves the pieces it is built out of.
 * 2. THE CLAIM NEVER TOUCHES THE TRUTH. Every edit writes the claim field, the
 *    ledger comes back byte-identical, and a bucket nobody worked can still be
 *    claimed on - because moving an hour onto a quiet account is the move the
 *    whole mechanic exists to be able to see.
 * 3. SLACK LANDS UNATTRIBUTED. Not by a rule about slacking - there is none in
 *    the derivation - but because a slack segment owns the minutes and owning
 *    them is what stops them being on anybody's invoice.
 * 4. THE TIER SHAPES THE SHEET. One bucket a day at the service desk, a line
 *    per customer plus the project code for an engineer, off the same records.
 *
 * Every graph read runs against the shipped engine and the shipped content.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import type { DispatchLogEntry } from '../engine-api';
import { COMPANY_IDS } from './company';
import { FIELDS, PLAYER_TIERS, type PlayerTier } from './fields';
import {
  shiftEndTick,
  shiftStartTick,
  WORKING_MINUTES_PER_DAY,
  workingMinutesAt,
  workingMinutesBetween,
} from './hours';
import { ARDEN_EDGE_PROJECT, MSP_CUSTOMERS, MSP_IDS } from './msp-company';
import { ardenEdgeKickoffSetup } from './project';
import { createWorldSession, type WorldSession } from './session';
import { ARDEN_EDGE_TASKS } from './tickets/project';
import { ticketNodes, ticketProjectOf } from './tickets';
import {
  attributionFor,
  bucketOf,
  claimsFrom,
  deriveTimesheet,
  encodeSegment,
  hoursLabel,
  lineAt,
  segmentsFrom,
  segmentsFromLog,
  SERVICE_DESK_BUCKET,
  type SegmentRef,
  timesheetLines,
  timesheetSheet,
  utilisationLine,
  utilisationOf,
  TIMESHEET_LOG_LIMIT,
  type TimesheetClaim,
  withClaim,
  withSegment,
  WORK_SEGMENT_MINUTES,
  type WorkResolver,
  type WorkSegment,
} from './timesheet';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

const RESOLVER: WorkResolver = {
  projectOfTicket: ticketProjectOf,
  nodesOfTicket: ticketNodes,
};

const ARDEN = { kind: 'customer', id: MSP_CUSTOMERS.arden } as const;
const PROJECT = { kind: 'project', id: ARDEN_EDGE_PROJECT } as const;

function mspWorld(): WorldSession {
  const session = createWorldSession(MSP_CARRY);
  session.engine.applySetup(ardenEdgeKickoffSetup(shiftStartTick(3)));
  return session;
}

/** Nine o'clock on day one, which is where every segment below is measured. */
const MONDAY = shiftStartTick(1);

function ledger(...segments: readonly (readonly [number, SegmentRef])[]): string {
  return segments
    .map(([tick, ref]) => encodeSegment(tick, ref))
    .join('\n');
}

function labels(): (kind: string, id: string) => string {
  return (kind, id) => `${kind}:${id}`;
}

function sheetOf(
  segments: readonly WorkSegment[],
  now: number,
  claims: readonly TimesheetClaim[] = [],
  tier: PlayerTier = PLAYER_TIERS.systemsEngineer,
): ReturnType<typeof timesheetSheet> {
  return timesheetSheet(deriveTimesheet(segments, now), claims, {
    tier,
    submittedAt: null,
    submittedAuto: false,
    labelOf: labels(),
  });
}

/* -- the arithmetic underneath it ----------------------------------------- */

describe('working minutes', () => {
  it('is the shift with the canteen taken out of it', () => {
    // A service level counts the whole eight hours, because a printer does not
    // start working because somebody went to eat. A timesheet counts seven and
    // a half. Two questions, two numbers, and this is where they part.
    expect(WORKING_MINUTES_PER_DAY).toBe(450);
    expect(workingMinutesBetween(shiftStartTick(1), shiftEndTick(1)))
      .toBe(WORKING_MINUTES_PER_DAY);
  });

  it('counts no minute of the night and no minute of lunch', () => {
    // Nine on Monday to nine on Tuesday is one working day, not two and a
    // night: the same closed form the service clock uses, one term shorter.
    expect(workingMinutesBetween(shiftStartTick(1), shiftStartTick(2)))
      .toBe(WORKING_MINUTES_PER_DAY);
    expect(workingMinutesAt(shiftStartTick(1))).toBe(0);
    // Noon to half past is half an hour of clock and none of anybody's week.
    expect(workingMinutesBetween(MONDAY + 180, MONDAY + 210)).toBe(0);
  });
});

/* -- the ledger ----------------------------------------------------------- */

describe('the ledger', () => {
  it('writes a line only when what the player is doing changes', () => {
    const first = withSegment('', MONDAY, ARDEN);
    const again = withSegment(first, MONDAY + 12, ARDEN);

    // Working one customer's queue for a quarter of an hour is ONE line - the
    // same line, with its last act moved on. A ledger that grew per act would
    // be a save that grew per click.
    expect(segmentsFrom(again)).toEqual([
      { tick: MONDAY, last: MONDAY + 12, ref: ARDEN, source: null },
    ]);
    expect(withSegment(again, MONDAY + 12, ARDEN)).toBe(again);

    const moved = withSegment(again, MONDAY + 20, PROJECT);
    expect(segmentsFrom(moved).map((segment) => segment.ref.id)).toEqual([
      MSP_CUSTOMERS.arden,
      ARDEN_EDGE_PROJECT,
    ]);
  });

  it('starts a new line when coming back is coming back', () => {
    const worked = withSegment('', MONDAY, ARDEN);
    const later = withSegment(worked, MONDAY + WORK_SEGMENT_MINUTES + 60, ARDEN);
    const segments = segmentsFrom(later);

    // Two lines, not one stretched across the hour in between. Stretching it
    // would put an hour nobody worked onto the same customer's invoice, which
    // is the single most expensive way this model could be wrong.
    expect(segments).toHaveLength(2);
    expect(
      deriveTimesheet(segments, MONDAY + WORK_SEGMENT_MINUTES + 61).days[0]
        ?.attributed,
    ).toBe(WORK_SEGMENT_MINUTES + 1);
  });

  it('does not let an interruption earn a player MORE billable time', () => {
    // The trap a capped-per-segment model walks into: work solidly, and one
    // long line is capped; slack in the middle, and the cap resets. A player
    // who went to the forum must never come out of it with more hours than the
    // one who did not, and that is asserted rather than reasoned about.
    let solid = '';
    let broken = '';

    for (let minute = 0; minute <= 120; minute += 10) {
      solid = withSegment(solid, MONDAY + minute, ARDEN);
      broken = minute === 60
        ? withSegment(broken, MONDAY + minute, { kind: 'slack', id: 'browser' })
        : withSegment(broken, MONDAY + minute, ARDEN);
    }

    const worked = deriveTimesheet(segmentsFrom(solid), MONDAY + 130);
    const slacked = deriveTimesheet(segmentsFrom(broken), MONDAY + 130);

    expect(slacked.days[0]?.attributed)
      .toBeLessThan(worked.days[0]?.attributed ?? 0);
  });

  it('lets one minute hold one thing, however much was done in it', () => {
    const paused = [ARDEN, PROJECT, { kind: 'customer', id: MSP_CUSTOMERS.fontaine }]
      .reduce<string>(
        (field, ref) => withSegment(field, MONDAY, ref as SegmentRef),
        '',
      );

    // Three acts in the same minute is one minute, so it is one line, and it
    // is the last thing done - six zero-length segments would be six lines
    // saying nothing at all.
    const segments = segmentsFrom(paused);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.ref.id).toBe(MSP_CUSTOMERS.fontaine);
  });

  it('drops the front once it is full, and only then', () => {
    let field = '';

    for (let index = 0; index < TIMESHEET_LOG_LIMIT + 5; index += 1) {
      field = withSegment(field, MONDAY + index, {
        kind: 'customer',
        id: `customer:${String(index)}`,
      });
    }

    const segments = segmentsFrom(field);
    expect(segments).toHaveLength(TIMESHEET_LOG_LIMIT);
    expect(segments[0]?.ref.id).toBe('customer:5');
  });

  /**
   * REFUSED, NOT DROPPED (0.38.1). This used to assert the opposite - the
   * unreadable lines were skipped and the readable ones came back - and the
   * reason given was that an invented line would be an hour on somebody's
   * invoice that nothing produced. That is true and it is only half of it: a
   * line silently REMOVED is an hour somebody worked that nothing pays for,
   * and its only symptom is a total that does not add up to a day.
   *
   * The four bad shapes are one class - a line that is not a segment - and the
   * sheet now refuses to be built out of any of them. The load preflight is
   * where that refusal is caught, which is the test below it.
   */
  it('refuses a line this build cannot read rather than dropping it', () => {
    const good = [
      encodeSegment(MONDAY, ARDEN),
      encodeSegment(MONDAY + 2, PROJECT),
    ];

    expect(segmentsFrom(good.join('\n'))).toHaveLength(2);

    for (const bad of [
      'nonsense',
      '|customer|customer:x',
      `${String(MONDAY + 1)}|invented|customer:x`,
      // The six-field line: an id with a bar of its own. It was the quiet one
      // - four fields short of nothing and five fields short of a refusal, so
      // it fell through the count check and out of the sheet.
      `${String(MONDAY + 1)}|customer|customer:x|${String(MONDAY + 1)}|a|b`,
    ]) {
      expect(() => segmentsFrom([good[0], bad, good[1]].join('\n')), bad)
        .toThrow();
    }
  });

  /**
   * And the other half: the game cannot WRITE one. Teeth: drop `unbarred` from
   * `encodeSegment` and this reds, and a bar in an id becomes a stretch of
   * minutes that reads back as corruption.
   */
  it('refuses to write a field with the separator in it', () => {
    expect(() => encodeSegment(MONDAY, { kind: 'customer', id: 'a|b' }))
      .toThrow('cannot contain');
    expect(() => encodeSegment(MONDAY, ARDEN, MONDAY, 'ticket:a|b'))
      .toThrow('cannot contain');
  });
});

/* -- whose minute was it -------------------------------------------------- */

describe('attribution', () => {
  it('reads a customer off the box, the account and the service on it', () => {
    const { engine } = mspWorld();
    const machine = engine.graph
      .nodesOfKind('machine')
      .find((node) => node.fields[FIELDS.machineCustomer] === MSP_CUSTOMERS.arden);

    expect(machine).toBeDefined();
    expect(attributionFor(engine.graph, machine?.id ?? '', RESOLVER)).toEqual({
      kind: 'customer',
      id: MSP_CUSTOMERS.arden,
    });
  });

  it('reads the PROJECT off a rule being carried, which no ticket can', () => {
    const { engine } = mspWorld();
    const rule = engine.graph
      .nodesOfKind('service')
      .find((node) => node.fields[FIELDS.fwRuleProject] === ARDEN_EDGE_PROJECT);

    expect(rule).toBeDefined();
    // `fw migrate` is aimed at the rule, and a rule belongs to a PROJECT
    // rather than to the estate its box sits in - so an attribution that went
    // through the ticket would read the customer off the box and put the whole
    // staging phase on the customer's loose line instead of on the project
    // code the invoice is raised against.
    expect(attributionFor(engine.graph, rule?.id ?? '', RESOLVER)).toEqual({
      kind: 'project',
      id: ARDEN_EDGE_PROJECT,
    });
  });

  it('reads the project off a project TASK, and the customer off the rest', () => {
    const { engine } = mspWorld();

    engine.applySetup([
      {
        op: 'addNode',
        node: {
          id: ARDEN_EDGE_TASKS.staging,
          kind: 'ticket',
          fields: {
            [FIELDS.state]: 'open',
            [FIELDS.spawnedAt]: 0,
            [FIELDS.slaDeadline]: 240,
          },
        },
      },
      {
        op: 'addNode',
        node: {
          id: 'ticket:not-a-project',
          kind: 'ticket',
          fields: {
            [FIELDS.state]: 'open',
            [FIELDS.spawnedAt]: 0,
            [FIELDS.slaDeadline]: 240,
          },
        },
      },
    ]);

    expect(attributionFor(engine.graph, ARDEN_EDGE_TASKS.staging, RESOLVER))
      .toEqual({ kind: 'project', id: ARDEN_EDGE_PROJECT });
    // A ticket nobody authored has no estate, so it belongs to no customer -
    // and internal is the honest answer rather than a guess.
    expect(attributionFor(engine.graph, 'ticket:not-a-project', RESOLVER))
      .toEqual({ kind: 'internal', id: 'internal' });
  });

  it('says nobody for an act aimed at nothing', () => {
    const { engine } = mspWorld();

    // Clocking on, setting the dot, waving a meeting off. They are not work on
    // an estate and a bucket opened for them would be somebody billed for the
    // player's own admin.
    expect(attributionFor(engine.graph, null, RESOLVER)).toBeNull();
    expect(attributionFor(engine.graph, 'node:invented', RESOLVER)).toBeNull();
  });

  it('rebuilds the same ledger from the engine\'s own log', () => {
    const { engine } = mspWorld();
    const box = MSP_IDS.ardenEdgeOld;
    const entries: DispatchLogEntry[] = [
      {
        tick: MONDAY,
        id: 'x',
        actor: COMPANY_IDS.player,
        target: box,
        params: {},
        ok: true,
      },
      // Refused, so it is not time anybody worked - and it is aimed at another
      // customer's box, which is exactly the minute that must not reach an
      // invoice.
      {
        tick: MONDAY + 5,
        id: 'x',
        actor: COMPANY_IDS.player,
        target: MSP_IDS.fontaineDc,
        params: {},
        ok: false,
      },
      {
        tick: MONDAY + 9,
        id: 'x',
        actor: COMPANY_IDS.player,
        target: null,
        params: {},
        ok: true,
      },
    ];

    expect(segmentsFromLog(engine.graph, entries, RESOLVER)).toEqual([
      {
        tick: MONDAY,
        last: MONDAY,
        ref: { kind: 'customer', id: MSP_CUSTOMERS.arden },
        // The audit carries the node it read the attribution off, exactly as
        // the recorder does - which is what lets the ledger be corrected
        // against it when the world's answer about that node changes.
        source: box,
      },
    ]);
  });
});

/* -- the derivation ------------------------------------------------------- */

describe('the derivation', () => {
  it('gives a segment the working minutes up to the next one', () => {
    const truth = deriveTimesheet(
      segmentsFrom(ledger([MONDAY, ARDEN], [MONDAY + 20, PROJECT])),
      MONDAY + 25,
    );
    const day = truth.days[0];

    expect(day?.lines.map((line) => [line.bucket, line.minutes])).toEqual([
      [bucketOf(ARDEN), 20],
      [bucketOf(PROJECT), 5],
    ]);
    expect(day?.attributed).toBe(25);
    expect(day?.elapsed).toBe(25);
    expect(day?.unattributed).toBe(0);
  });

  it('caps what one act can own, so a walk is not billed to a printer', () => {
    const truth = deriveTimesheet(
      segmentsFrom(ledger([MONDAY, ARDEN])),
      MONDAY + 240,
    );

    // Four hours of clock is three and a half of working time - lunch is in
    // the middle of it - and half an hour of that is on somebody's invoice.
    expect(truth.days[0]?.attributed).toBe(WORK_SEGMENT_MINUTES);
    expect(truth.days[0]?.unattributed)
      .toBe(workingMinutesBetween(MONDAY, MONDAY + 240) - WORK_SEGMENT_MINUTES);
  });

  it('leaves lunch off the sheet entirely', () => {
    // Half past eleven to half past twelve is an hour of clock and half an hour
    // of working time, because nobody bills the canteen.
    const from = MONDAY + 150;
    const truth = deriveTimesheet(
      segmentsFrom(ledger([from, ARDEN])),
      from + 60,
    );

    expect(workingMinutesBetween(from, from + 60)).toBe(30);
    expect(truth.days[0]?.lines[0]?.minutes).toBe(30);
  });

  it('never lets a segment run through the night', () => {
    const truth = deriveTimesheet(
      segmentsFrom(ledger(
        [shiftEndTick(1) - 10, ARDEN],
        [shiftStartTick(2) + 5, PROJECT],
      )),
      shiftStartTick(2) + 15,
    );

    // Ten minutes on Monday, ten on Tuesday. A night is not a minute anybody
    // could have used and the ledger needs no marker to say so.
    expect(truth.days.map((day) => [day.day, day.attributed])).toEqual([
      [1, 10],
      [2, 10],
    ]);
  });

  it('lands slack as time on nobody\'s invoice', () => {
    const worked = deriveTimesheet(
      segmentsFrom(ledger([MONDAY, ARDEN])),
      MONDAY + 20,
    );
    const slacked = deriveTimesheet(
      segmentsFrom(ledger(
        [MONDAY, ARDEN],
        [MONDAY + 5, { kind: 'slack', id: 'browser' }],
      )),
      MONDAY + 20,
    );

    // The same twenty minutes. Five of them are billable and fifteen are an
    // hour on the forum in miniature - nothing was punished, the minutes simply
    // stopped belonging to a customer the moment the forum did.
    expect(worked.days[0]?.attributed).toBe(20);
    expect(slacked.days[0]?.attributed).toBe(5);
    expect(slacked.days[0]?.unattributed).toBe(15);
    expect(slacked.days[0]?.lines).toHaveLength(1);
  });

  it('counts a day that is over as a whole working day', () => {
    const truth = deriveTimesheet(
      segmentsFrom(ledger([MONDAY, ARDEN])),
      shiftEndTick(1),
    );

    expect(truth.days[0]?.elapsed).toBe(WORKING_MINUTES_PER_DAY);
    expect(workingMinutesAt(shiftEndTick(1)) - workingMinutesAt(MONDAY))
      .toBe(WORKING_MINUTES_PER_DAY);
  });

  it('shows a day nobody worked rather than leaving it off', () => {
    const truth = deriveTimesheet([], shiftEndTick(2));

    expect(truth.days.map((day) => day.day)).toEqual([1, 2]);
    expect(truth.days.every((day) => day.lines.length === 0)).toBe(true);
    expect(truth.days[0]?.unattributed).toBe(WORKING_MINUTES_PER_DAY);
  });
});

/* -- the claim ------------------------------------------------------------ */

describe('the claim', () => {
  const claim = (
    day: number,
    bucket: string,
    minutes: number,
    detail: 'detailed' | 'vague' = 'detailed',
  ): TimesheetClaim => ({ day, bucket, minutes, detail });

  it('replaces the line for a day and bucket rather than stacking them', () => {
    const first = withClaim('', claim(1, bucketOf(ARDEN), 120));
    const second = withClaim(first, claim(1, bucketOf(ARDEN), 60));

    expect(claimsFrom(second)).toEqual([claim(1, bucketOf(ARDEN), 60)]);
  });

  it('keeps minutes and detail as two separate things about a line', () => {
    const field = withClaim('', claim(2, bucketOf(PROJECT), 90, 'vague'));
    const [line] = claimsFrom(field);

    expect(line?.minutes).toBe(90);
    expect(line?.detail).toBe('vague');
  });

  it('never touches the derived half', () => {
    const truth = ledger([MONDAY, ARDEN]);
    const claims = withClaim('', claim(1, bucketOf(ARDEN), 400));
    const sheet = sheetOf(segmentsFrom(truth), MONDAY + 20, claimsFrom(claims));

    // Both numbers, side by side, and the record is the one it was before
    // anybody typed anything. That separation IS the mechanic.
    expect(truth).toBe(ledger([MONDAY, ARDEN]));
    expect(sheet.days[0]?.lines[0]?.derived).toBe(20);
    expect(sheet.days[0]?.lines[0]?.claimed).toBe(400);
    expect(sheet.days[0]?.lines[0]?.edited).toBe(true);
  });

  it('shows a line the records know nothing about', () => {
    const quiet = bucketOf({
      kind: 'customer',
      id: MSP_CUSTOMERS.holloway,
    });
    const sheet = sheetOf(
      segmentsFrom(ledger([MONDAY, ARDEN])),
      MONDAY + 20,
      claimsFrom(withClaim('', claim(1, quiet, 180))),
    );
    const invented = sheet.days[0]?.lines.find((line) => line.bucket === quiet);

    // Three hours on the account nobody rang about. A sheet that refused to
    // show it would be refusing to show the thing the ladder is built to catch.
    expect(invented?.derived).toBe(0);
    expect(invented?.claimed).toBe(180);
  });

  it('drops a claim line this build cannot read', () => {
    const field = [
      '1|customer|customer:arden|120|detailed',
      '1|customer|customer:arden|120',
      '0|customer|customer:arden|120|detailed',
      '1|customer|customer:arden|-5|detailed',
      '1|customer|customer:arden|120|shouting',
    ].join('\n');

    expect(claimsFrom(field)).toHaveLength(1);
  });
});

/* -- the shape the tier asks for ------------------------------------------ */

describe('the tier shape', () => {
  it('gives the service desk one bucket a day and nothing to decide', () => {
    const sheet = sheetOf(
      segmentsFrom(ledger([MONDAY, ARDEN])),
      shiftEndTick(2),
      [],
      PLAYER_TIERS.serviceDesk,
    );

    expect(sheet.shape).toBe('single_bucket');
    expect(sheet.days).toHaveLength(2);

    for (const day of sheet.days) {
      expect(day.lines).toHaveLength(1);
      expect(day.lines[0]?.bucket).toBe(SERVICE_DESK_BUCKET);
      expect(day.lines[0]?.derived).toBe(WORKING_MINUTES_PER_DAY);
      // Nothing is unattributed on a sheet that attributes nothing.
      expect(day.unattributed).toBe(0);
    }

    expect(sheet.derived).toBe(WORKING_MINUTES_PER_DAY * 2);
  });

  it('gives the engineer a line per customer, the project, and a flag', () => {
    const sheet = sheetOf(
      segmentsFrom(ledger(
        [MONDAY, ARDEN],
        [MONDAY + 20, PROJECT],
        [MONDAY + 40, { kind: 'internal', id: 'internal' }],
      )),
      MONDAY + 60,
    );
    const day = sheet.days[0];

    expect(sheet.shape).toBe('per_customer');
    expect(day?.lines.map((line) => [line.label, line.billable])).toEqual([
      [`customer:${MSP_CUSTOMERS.arden}`, true],
      ['internal:internal', false],
      [`project:${ARDEN_EDGE_PROJECT}`, true],
    ]);
  });

  it('finds a line by the handle the sheet prints beside it', () => {
    const sheet = sheetOf(
      segmentsFrom(ledger([MONDAY, ARDEN], [MONDAY + 20, PROJECT])),
      MONDAY + 40,
    );

    expect(lineAt(sheet, '1.1')?.line.bucket).toBe(bucketOf(ARDEN));
    expect(lineAt(sheet, '1.2')?.line.bucket).toBe(bucketOf(PROJECT));
    expect(lineAt(sheet, '4.9')).toBeNull();
  });

  it('prints both numbers on every row, and the unattributed rest', () => {
    const printed = timesheetLines(
      sheetOf(
        segmentsFrom(ledger(
          [MONDAY, ARDEN],
          [MONDAY + 10, { kind: 'slack', id: 'browser' }],
        )),
        MONDAY + 60,
        claimsFrom(withClaim('', {
          day: 1,
          bucket: bucketOf(ARDEN),
          minutes: 240,
          detail: 'vague',
        })),
      ),
      1,
    ).join('\n');

    expect(printed).toContain('worked');
    expect(printed).toContain('claimed');
    expect(printed).toContain('unattributed');
    expect(printed).toContain('(vague)');
    // Ten minutes worked, four hours claimed, and the sheet says both.
    expect(printed).toContain(hoursLabel(10));
    expect(printed).toContain(hoursLabel(240));
  });

  /* -- what the org makes of the total (0.30.0, slice 2) ------------------ */

  it('reads the ENGINEER against a billable target the honest week misses', () => {
    const worked = sheetOf(
      segmentsFrom(ledger([MONDAY, ARDEN], [MONDAY + 60, PROJECT])),
      shiftEndTick(1),
    );
    const honest = utilisationOf(worked, PLAYER_TIERS.systemsEngineer);

    expect(honest.basis).toBe('billable');
    expect(honest.target).toBe(75);
    expect(honest.availableMinutes).toBe(WORKING_MINUTES_PER_DAY);
    // An unedited sheet claims what the records hold, so the number the
    // business reads IS the derivation. It does not reach the target, and
    // nothing in the game does anything about that.
    expect(honest.billableMinutes).toBe(worked.derived);
    expect(honest.met).toBe(false);
  });

  it('moves only when the CLAIM moves, which is the whole temptation', () => {
    const segments = segmentsFrom(ledger([MONDAY, ARDEN]));
    const honest = sheetOf(segments, shiftEndTick(1));
    const padded = sheetOf(
      segments,
      shiftEndTick(1),
      claimsFrom(withClaim('', {
        day: 1,
        bucket: bucketOf(ARDEN),
        minutes: 400,
        detail: 'detailed',
      })),
    );

    expect(utilisationOf(padded, PLAYER_TIERS.systemsEngineer).percent)
      .toBeGreaterThan(utilisationOf(honest, PLAYER_TIERS.systemsEngineer).percent);
    // And the derivation did not move an inch under it.
    expect(padded.derived).toBe(honest.derived);
  });

  it('leaves internal time out of the engineer\'s number and in the desk\'s', () => {
    const internal = sheetOf(
      segmentsFrom(ledger([MONDAY, { kind: 'internal', id: 'internal' }])),
      shiftEndTick(1),
    );
    const reading = utilisationOf(internal, PLAYER_TIERS.systemsEngineer);

    // A morning on the shop's own kit is recorded and is on nobody's invoice,
    // and the two halves of the reading say exactly that.
    expect(reading.recorded).toBeGreaterThan(0);
    expect(reading.billable).toBe(0);
    expect(reading.percent).toBe(0);
  });

  it('hits the SERVICE DESK\'s target exactly, which is the joke', () => {
    const desk = sheetOf(
      segmentsFrom(ledger([MONDAY, ARDEN])),
      shiftEndTick(1),
      [],
      PLAYER_TIERS.serviceDesk,
    );
    const reading = utilisationOf(desk, PLAYER_TIERS.serviceDesk);

    // One bucket a day at seven and a half hours, over a day of seven and a
    // half hours. Nobody decided anything and the target is met to the minute.
    expect(reading.basis).toBe('recorded');
    expect(reading.target).toBe(100);
    expect(reading.percent).toBe(100);
    expect(reading.met).toBe(true);
    expect(utilisationLine(reading)).toContain('the business asks for');
  });

  it('says the number and the target and stops', () => {
    const said = utilisationLine(
      utilisationOf(
        sheetOf(segmentsFrom(ledger([MONDAY, ARDEN])), shiftEndTick(1)),
        PLAYER_TIERS.systemsEngineer,
      ),
    );

    // No advice, no verdict, no should. Being under target reads as being
    // under target, because that is all it is.
    expect(said).not.toContain('should');
    expect(said).not.toContain('need');
    expect(said).toContain('75%');
  });
});
