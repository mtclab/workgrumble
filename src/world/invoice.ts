/**
 * The OTHER reader of the timesheet (0.30.0, slice 2): the customer.
 *
 * The org reads utilisation once a week and cannot check a word of it. The
 * customer reads the invoice, has their own records, and checks. That is the
 * whole asymmetry this module is, and every check in it is answerable from a
 * record this game already keeps - the sheet's own derivation, the customer's
 * estate event log, and the conduct file. Nothing here surveils anything new.
 *
 * THREE THINGS, and the seams between them are the design:
 *
 *  - the PATTERNS (`scrutinyFlags`). Scrutiny turns on the SHAPE of a claim,
 *    not on its size, because that is what the research found: a finance team
 *    going through an invoice line by line is looking for the same round figure
 *    every week, for hours booked when their own systems say nobody was in
 *    them, and for a day they have some other reason to doubt. Every pattern
 *    requires the claim to EXCEED what the records derived, which is the one
 *    line that makes honesty mechanically safe: a sheet nobody edited claims
 *    exactly what the engine recorded, so it cannot flag, ever, on any account.
 *  - the ACCRUAL (`scrutinyByCustomer`). Per customer, per day, with decay -
 *    so the rare small pad on a busy account is invisible and the habitual pad
 *    on the quiet one is the one that gets caught. It is DERIVED rather than
 *    counted: there is no scrutiny meter anywhere in the save, the number is a
 *    fold over the claim and the records, and a reload recomputes it exactly.
 *  - the LADDER (`invoiceLadderDue`, `INVOICE_RUNGS`). Five rungs, delivered
 *    one per morning on the `fallout.ts` rail - a pure "what is due now" read
 *    the day driver settles at the start of shift. What is written down is only
 *    which rung has been DELIVERED, because a beat must not be delivered twice;
 *    where the account stands is derived, every time, off the sheet as it
 *    currently stands.
 *
 * WHY THE CUSTOMER CAN SEE A SHEET THAT HAS NOT BEEN SUBMITTED. Because they
 * can: every PSA in the research puts time entries in front of the client as
 * they are filed, and weekly approval before invoicing is named as the practice
 * that stops the argument happening later. So the ladder walks during the week,
 * which is also what makes it escapable - a line put back before Friday is a
 * line the pattern stops seeing, the scrutiny decays, and the next rung never
 * comes.
 *
 * Nothing here mutates, dispatches, reads a wall clock or consumes the RNG.
 */

import type { ReadOnlyGraphNode, ReadOnlyGraphView } from '../engine-api';
import { conductEntries } from './conduct';
import { customerIdOfNode } from './customers';
import { readEventLog } from './events';
import { FIELDS } from './fields';
import { dayForTick } from './hours';
import {
  bucketParts,
  hoursLabel,
  type SheetLine,
  type Timesheet,
} from './timesheet';

/* -- the patterns --------------------------------------------------------- */

/**
 * The three checks, and each of them is a sentence somebody in accounts payable
 * has actually said.
 *
 *  - `round_number`: "it is two hours every single week". The tell that a
 *    figure was decided rather than measured.
 *  - `quiet_day`: "our systems show nobody was in them that day". The one the
 *    customer can answer entirely from their own side.
 *  - `caught_day`: "that is the afternoon your own management wrote up". Not
 *    the customer's record - it is the shop's, and it is what makes a padded
 *    line on a bad day worse than the same line on a good one.
 */
export type ScrutinyPattern = 'round_number' | 'quiet_day' | 'caught_day';

/**
 * How many days the same round figure has to turn up on before it is a
 * PATTERN rather than a coincidence.
 *
 * Three, because two is a pair and everybody has had two two-hour days.
 * OVERSEER TUNING KNOB.
 */
export const ROUND_NUMBER_DAYS = 3;

/** A figure is "round" when it is a whole number of hours and not nothing. */
export function isRoundClaim(minutes: number): boolean {
  return minutes > 0 && minutes % 60 === 0;
}

export interface ScrutinyFlag {
  readonly day: number;
  readonly customer: string;
  readonly pattern: ScrutinyPattern;
  readonly bucket: string;
  /** What the sheet says. */
  readonly claimed: number;
  /** What the records say. */
  readonly derived: number;
  /** The record that answers it, in the words the query would use. */
  readonly evidence: string;
}

/**
 * The records a customer can hold a line up against - all three of them
 * shipped, and handed in as functions so this module is drivable from a
 * fixture with two claims in it rather than from a whole estate.
 */
export interface InvoiceRecords {
  /** Whose account a sheet line is against, or null for nobody's. */
  readonly customerOf: (bucket: string) => string | null;
  /** Whether the shop wrote the player up on this day. */
  readonly caughtOn: (day: number) => boolean;
  /** Whether this customer's own estate recorded anything at all that day. */
  readonly activeOn: (customer: string, day: number) => boolean;
}

/** One over-claimed line: what the sheet says, over what the records say. */
interface OverClaim {
  readonly day: number;
  readonly customer: string;
  readonly line: SheetLine;
}

/**
 * The lines a customer could argue with: an account of theirs, on a day, where
 * the sheet claims MORE than the engine's own records derived.
 *
 * The `claimed > derived` test is the load-bearing line of this whole module.
 * It is not a leniency and it is not a tuning choice: an untouched sheet claims
 * exactly what was derived, a line put back to the truth claims exactly what
 * was derived, and neither can be over it. So no pattern below can fire on an
 * honest week however the week went, and that is proven rather than promised
 * (`invoice.test.ts`, and again on a driven week in `shell/timesheet.test.ts`).
 */
function overClaims(
  sheet: Readonly<Timesheet>,
  records: Readonly<InvoiceRecords>,
): readonly OverClaim[] {
  return sheet.days.flatMap((day) => day.lines.flatMap((line) => {
    const customer = records.customerOf(line.bucket);

    return customer === null || line.claimed <= line.derived
      ? []
      : [{ day: day.day, customer, line }];
  }));
}

/**
 * Every flag standing against every customer, through a day.
 *
 * Evaluated AS OF that day rather than over the whole week, because a pattern
 * is a thing that has emerged by a point in time: the third identical Tuesday
 * is a pattern on the Wednesday and was not one on the Monday, and a ladder
 * built off a week-shaped read would deliver its beats in the wrong order or
 * all at once on the Friday.
 */
export function scrutinyFlags(
  sheet: Readonly<Timesheet>,
  records: Readonly<InvoiceRecords>,
  throughDay: number,
): readonly ScrutinyFlag[] {
  const claims = overClaims(sheet, records)
    .filter((claim) => claim.day <= throughDay);
  const flags: ScrutinyFlag[] = [];

  for (const claim of claims) {
    const { day, customer, line } = claim;

    // THE QUIET DAY. Hours grown on an account whose own estate recorded
    // nothing at all that day - no service went down or came back, nothing
    // rebooted, no account was locked or unlocked, no queue moved. It is the
    // one check the customer can answer entirely from their own side, which is
    // exactly why it is the one that gets used: their monitoring wrote the day
    // down, and the day is empty.
    //
    // It is not "you did nothing" and it does not say that. A day of reading
    // and diagnosing leaves no trace on anybody's estate and is perfectly
    // honest - which is why the over-claim above is required first. What this
    // catches is hours ADDED to a day that left no mark.
    if (!records.activeOn(customer, day)) {
      flags.push({
        day,
        customer,
        pattern: 'quiet_day',
        bucket: line.bucket,
        claimed: line.claimed,
        derived: line.derived,
        evidence: `Day ${String(day)}: our own systems logged nothing at all `
          + `that day, and the entry has grown from ${hoursLabel(line.derived)
          } to ${hoursLabel(line.claimed)}.`,
      });
    }

    // THE DAY THEY WERE WRITTEN UP. The shop's own conduct file has a line
    // with this day's tick on it, and the sheet grew hours on the same day.
    if (records.caughtOn(day)) {
      flags.push({
        day,
        customer,
        pattern: 'caught_day',
        bucket: line.bucket,
        claimed: line.claimed,
        derived: line.derived,
        evidence: `Day ${String(day)}: there is a line in your own conduct `
          + 'file with that afternoon on it.',
      });
    }
  }

  // THE SAME ROUND NUMBER. Cross-day by nature, so it is counted over the
  // account rather than over the line: the same whole number of hours, filed
  // against the same customer, on three separate days.
  const byCustomer = new Map<string, Map<number, Set<number>>>();

  for (const claim of claims) {
    if (!isRoundClaim(claim.line.claimed)) {
      continue;
    }

    const figures = byCustomer.get(claim.customer) ?? new Map<number, Set<number>>();
    const days = figures.get(claim.line.claimed) ?? new Set<number>();

    days.add(claim.day);
    figures.set(claim.line.claimed, days);
    byCustomer.set(claim.customer, figures);
  }

  for (const [customer, figures] of byCustomer) {
    for (const [minutes, days] of figures) {
      const ordered = [...days].sort((left, right) => left - right);

      // Every day FROM the one that made it a pattern, not only that one. The
      // third identical Tuesday is what turns a coincidence into a habit, and
      // the fourth is another instance of the habit rather than the same news
      // twice - which is also why a run of them climbs the ladder and a single
      // repeat never leaves the ground.
      for (let index = ROUND_NUMBER_DAYS - 1; index < ordered.length; index += 1) {
        const day = ordered[index];
        const claim = claims.find(
          (entry) => entry.customer === customer
            && entry.day === day
            && entry.line.claimed === minutes,
        );

        if (day === undefined) {
          continue;
        }

        flags.push({
          day,
          customer,
          pattern: 'round_number',
          bucket: claim?.line.bucket ?? '',
          claimed: minutes,
          derived: claim?.line.derived ?? 0,
          evidence: `${hoursLabel(minutes)}, to the minute, on ${
            String(index + 1)
          } separate days.`,
        });
      }
    }
  }

  return Object.freeze(
    flags.sort((left, right) =>
      left.day - right.day
      || left.customer.localeCompare(right.customer)
      || left.pattern.localeCompare(right.pattern)),
  );
}

/* -- the accrual ---------------------------------------------------------- */

/**
 * What a clean day is worth off the count.
 *
 * One, so a week of behaving takes a week of pressure off - which is what
 * makes every rung of the ladder escapable and what keeps the rare small pad
 * from ever arriving anywhere. OVERSEER TUNING KNOB.
 */
export const SCRUTINY_DECAY = 1;

/**
 * Where every account stands, this minute, as a number - folded day by day so
 * that a clean day genuinely takes pressure OFF rather than merely not adding
 * any.
 *
 * Derived, never stored. There is no scrutiny field in any save: the number is
 * a function of the sheet, the estate and the conduct file, so a reload
 * recomputes the identical figure and a replay walks the identical ladder.
 */
export function scrutinyByCustomer(
  sheet: Readonly<Timesheet>,
  records: Readonly<InvoiceRecords>,
  today: number,
): ReadonlyMap<string, number> {
  const standing = new Map<string, number>();
  const seen = new Set<string>();

  for (let day = 1; day <= today; day += 1) {
    const flags = scrutinyFlags(sheet, records, day)
      .filter((flag) => flag.day === day);

    for (const flag of flags) {
      seen.add(flag.customer);
    }

    for (const customer of seen) {
      const raised = flags.filter((flag) => flag.customer === customer).length;
      const before = standing.get(customer) ?? 0;

      if (raised > 0) {
        standing.set(customer, before + raised);
        continue;
      }

      // TODAY is not a clean day yet. It is a day that has not finished, and a
      // fold that decayed on it would take the pressure off every morning
      // before the post arrived - the ladder would stall on its first rung and
      // a player would never see the second. A day only counts as clean once
      // it is over.
      if (day < today) {
        standing.set(customer, Math.max(0, before - SCRUTINY_DECAY));
      }
    }
  }

  return standing;
}

/* -- the ladder ----------------------------------------------------------- */

/**
 * Five rungs and a floor, in the order the research says every segment walks
 * them: nobody notices -> the requester complains -> a named intermediary
 * intervenes -> the money is challenged -> the relationship ends.
 *
 * Sequential by construction: the settler below hands over ONE rung at a time,
 * so there is no way to arrive at a disputed invoice without having been asked
 * about the line first. That is the difference between a ladder and a verdict.
 */
export const INVOICE_RUNGS = [
  'none',
  'query',
  'breakdown',
  'dispute',
  'account_manager',
  'left',
] as const;

export type InvoiceRung = (typeof INVOICE_RUNGS)[number];

/** How the notice names each rung. */
export const INVOICE_RUNG_LABELS: Readonly<Record<InvoiceRung, string>> = {
  none: 'Nothing outstanding',
  query: 'A question about one line',
  breakdown: 'An itemised breakdown, requested',
  dispute: 'The invoice, disputed',
  account_manager: 'The account manager, in your chat',
  left: 'The account, gone',
};

/**
 * The one nobody chases.
 *
 * A single flag against an account is not a ladder, it is a Tuesday: the
 * research is explicit that the rare small pad is invisible and the habitual
 * pad on the quiet account is the one that gets caught, and this constant is
 * where that is true rather than merely said. OVERSEER TUNING KNOB.
 */
export const SCRUTINY_GRACE = 1;

/**
 * The rung a standing of this size is on - which stops at the account manager
 * and never reaches the last one.
 *
 * Leaving is not one more point of annoyance and the ladder must not treat it
 * as one. A client who has disputed an invoice and put their account manager
 * on it has already said everything they are going to say; what decides
 * whether they go is whether it is STILL true tomorrow. So the top of this
 * scale is the escalation, and the departure is a question about time rather
 * than about size (`invoiceLadderDue`).
 */
export function rungForScrutiny(scrutiny: number): InvoiceRung {
  const index = Math.min(
    Math.max(scrutiny - SCRUTINY_GRACE, 0),
    rungIndex('account_manager'),
  );

  return INVOICE_RUNGS[index] ?? 'none';
}

export function rungIndex(rung: InvoiceRung): number {
  return INVOICE_RUNGS.indexOf(rung);
}

/* -- what has already been delivered -------------------------------------- */

const SEPARATOR = '|';

/** One rung, delivered: `customer|rung|tick`. */
export interface DeliveredRung {
  readonly customer: string;
  readonly rung: InvoiceRung;
  readonly tick: number;
}

function isRung(value: string): value is InvoiceRung {
  return INVOICE_RUNGS.some((rung) => rung === value);
}

export function encodeRung(entry: Readonly<DeliveredRung>): string {
  return [entry.customer, entry.rung, String(entry.tick)].join(SEPARATOR);
}

function decodeRung(line: string): DeliveredRung | null {
  const parts = line.split(SEPARATOR);

  if (parts.length !== 3) {
    return null;
  }

  const [customer, rung, stamp] = parts;
  const tick = stamp === undefined || stamp.length === 0
    ? Number.NaN
    : Number(stamp);

  if (
    customer === undefined
    || customer.length === 0
    || rung === undefined
    || !isRung(rung)
    || !Number.isSafeInteger(tick)
    || tick < 0
  ) {
    return null;
  }

  return { customer, rung, tick };
}

/**
 * Which rungs have actually been handed over, off the field.
 *
 * This is the ONLY thing about the ladder that is written down, and it is
 * written down for one reason: a beat must not be delivered twice. Where an
 * account stands is derived; what has already been said to the player is not
 * derivable from anything, because it is a fact about the past.
 */
export function deliveredRungs(value: unknown): readonly DeliveredRung[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map(decodeRung)
      .filter((entry): entry is DeliveredRung => entry !== null),
  );
}

export function withDeliveredRung(
  existing: unknown,
  entry: Readonly<DeliveredRung>,
): string {
  return [...deliveredRungs(existing), entry].map(encodeRung).join('\n');
}

/** The furthest rung this customer has been taken to. */
export function rungDelivered(
  delivered: readonly Readonly<DeliveredRung>[],
  customer: string,
): InvoiceRung {
  return delivered
    .filter((entry) => entry.customer === customer)
    .reduce<InvoiceRung>(
      (worst, entry) =>
        rungIndex(entry.rung) > rungIndex(worst) ? entry.rung : worst,
      'none',
    );
}

/** Every account that has actually gone. */
export function formerClients(value: unknown): ReadonlySet<string> {
  return new Set(
    deliveredRungs(value)
      .filter((entry) => entry.rung === 'left')
      .map((entry) => entry.customer),
  );
}

/* -- what is due now ------------------------------------------------------ */

export interface LadderStep {
  readonly customer: string;
  readonly rung: InvoiceRung;
  readonly scrutiny: number;
}

/**
 * The next rung due, per account - a pure "what is due right now" read on the
 * `fallout.ts` rail, settled by the day driver at the start of a shift.
 *
 * ONE rung at a time and never a skip, so the beats arrive in order however
 * badly the week went: an account whose standing jumped to four overnight is
 * asked about a line this morning and shown the breakdown tomorrow. The
 * morning rather than the minute for the reason every settler in this game
 * uses the morning - a day is how long it takes somebody else to notice, and a
 * consequence in the same afternoon reads as a punishment for the keystroke.
 *
 * An account that has been cleaned up answers nothing at all: its standing is
 * below what has already been said to it, there is no next rung, and the
 * silence IS the escape.
 */
export function invoiceLadderDue(
  sheet: Readonly<Timesheet>,
  records: Readonly<InvoiceRecords>,
  delivered: readonly Readonly<DeliveredRung>[],
  today: number,
): readonly LadderStep[] {
  const standing = scrutinyByCustomer(sheet, records, today);
  const due: LadderStep[] = [];

  for (const [customer, scrutiny] of standing) {
    const already = rungIndex(rungDelivered(delivered, customer));
    const wanted = rungIndex(rungForScrutiny(scrutiny));

    // THE LAST RUNG, which is not a threshold. They have disputed the invoice
    // and put their account manager on it, a day has gone by, and the entries
    // are still the entries. Nobody sends another email; the research is
    // explicit that the churn signal is silence. It is escapable right up to
    // the morning it lands - put the lines back and `wanted` falls below the
    // escalation, and this never fires.
    if (already === rungIndex('account_manager')) {
      const escalated = delivered.find(
        (entry) => entry.customer === customer
          && entry.rung === 'account_manager',
      );

      if (escalated !== undefined
        && dayForTick(escalated.tick) < today
        && wanted >= already) {
        due.push({ customer, rung: 'left', scrutiny });
      }

      continue;
    }

    if (wanted <= already) {
      continue;
    }

    const rung = INVOICE_RUNGS[already + 1];

    if (rung !== undefined) {
      due.push({ customer, rung, scrutiny });
    }
  }

  return Object.freeze(
    due.sort((left, right) => left.customer.localeCompare(right.customer)),
  );
}

/* -- the answer ----------------------------------------------------------- */

/**
 * The itemised breakdown, ANSWERED - which is the rung that costs, and it costs
 * nothing but being read.
 *
 * The game does not refuse the demand and it does not roll for it: it prints
 * the account's week out of the same derivation the sheet is built from, day by
 * day, with what was claimed beside what the records hold and the wording each
 * line goes out as. A padded line survives a challenge on granularity, per the
 * research, and a vague one does not - so the column that says which is which
 * is the whole exposure, and no sentence here tells the player off.
 */
export function breakdownLines(
  sheet: Readonly<Timesheet>,
  records: Readonly<InvoiceRecords>,
  customer: string,
  label: string,
): readonly string[] {
  const rows = sheet.days.flatMap((day) => day.lines
    .filter((line) => records.customerOf(line.bucket) === customer)
    .map((line) => `  Day ${String(day.day)}: ${
      hoursLabel(line.claimed)
    } invoiced, ${hoursLabel(line.derived)} on our records${
      line.detail === 'vague' ? ', described as "consulting"' : ', itemised'
    }.`));

  if (rows.length === 0) {
    return [`There is nothing on the sheet against ${label}.`];
  }

  const claimed = sheet.days.reduce((total, day) => total + day.lines.reduce(
    (sum, line) => sum
      + (records.customerOf(line.bucket) === customer ? line.claimed : 0),
    0,
  ), 0);
  const derived = sheet.days.reduce((total, day) => total + day.lines.reduce(
    (sum, line) => sum
      + (records.customerOf(line.bucket) === customer ? line.derived : 0),
    0,
  ), 0);

  return [
    `${label}, line by line:`,
    ...rows,
    `  Week: ${hoursLabel(claimed)} invoiced against ${
      hoursLabel(derived)
    } of recorded work.`,
  ];
}

/* -- reading the world ---------------------------------------------------- */

/**
 * The three records, wired to the graph.
 *
 * Every one of them is a read of something that was already there: the customer
 * a bucket names, the shop's conduct file, and the customer's own estate event
 * log. The last is the one that makes the quiet-day check the CUSTOMER's rather
 * than ours - a clinic knows whether anything happened on its own machines,
 * because their monitoring wrote it down, and that is the record the query
 * quotes back.
 */
export function invoiceRecords(
  graph: ReadOnlyGraphView,
  conductFile: unknown,
  projectCustomerOf: (projectId: string) => string | null,
): InvoiceRecords {
  const caught = new Set(
    conductEntries(conductFile).map((entry) => dayForTick(entry.tick)),
  );
  const estates = new Map<string, ReadonlySet<number>>();

  const activeDays = (customer: string): ReadonlySet<number> => {
    const known = estates.get(customer);

    if (known !== undefined) {
      return known;
    }

    const days = new Set<number>();

    for (const machine of graph.nodesOfKind('machine')) {
      if (customerIdOfNode(machine) !== customer) {
        continue;
      }

      for (const event of readEventLog(machine.fields[FIELDS.eventLog])) {
        days.add(dayForTick(event.tick));
      }
    }

    estates.set(customer, days);
    return days;
  };

  return {
    customerOf: (bucket: string): string | null => {
      const parts = bucketParts(bucket);

      if (parts === null) {
        return null;
      }

      return parts.kind === 'customer'
        ? parts.id
        : parts.kind === 'project'
          ? projectCustomerOf(parts.id)
          : null;
    },
    caughtOn: (day: number): boolean => caught.has(day),
    activeOn: (customer: string, day: number): boolean =>
      activeDays(customer).has(day),
  };
}

/* -- the post ------------------------------------------------------------- */

/** `customer:elmwood` -> `mail/invoice-customer-elmwood`. */
function invoiceThreadId(customer: string): string {
  return `mail/invoice-${customer.replace(/:/gu, '-')}`;
}

export interface InvoiceThreadInput {
  readonly sheet: Timesheet;
  readonly records: InvoiceRecords;
  readonly delivered: readonly Readonly<DeliveredRung>[];
  readonly labelOf: (customer: string) => string;
  /** Who writes: their own contact, and the shop's own account side. */
  readonly contactOf: (customer: string) => string | null;
  readonly accountManager: string;
}

/**
 * The ladder, as the post it actually arrives as - DERIVED, every time, from
 * the ledger of what was delivered and the sheet as it currently stands.
 *
 * Nothing about these threads is stored. The rungs that have been handed over
 * are, because that is a fact about the past; the words are a function of the
 * customer, the rung and the records, and the breakdown message is the
 * derivation itself printed out loud - which is the exposure the whole ladder
 * is built to reach. A padded line looks exactly like a padded line next to the
 * log, and nobody in the thread says so.
 */
export function invoiceThreads(
  input: Readonly<InvoiceThreadInput>,
): readonly InvoiceThread[] {
  const customers = [...new Set(input.delivered.map((entry) => entry.customer))]
    .sort((left, right) => left.localeCompare(right));

  return Object.freeze(customers.flatMap((customer) => {
    const label = input.labelOf(customer);
    const contact = input.contactOf(customer);
    const rungs = input.delivered
      .filter((entry) => entry.customer === customer && entry.rung !== 'none')
      .sort((left, right) => rungIndex(left.rung) - rungIndex(right.rung));

    if (rungs.length === 0 || contact === null) {
      return [];
    }

    return [{
      id: invoiceThreadId(customer),
      subject: `${label}: a question about the invoice`,
      messages: rungs.map((entry) => ({
        id: `${invoiceThreadId(customer)}/${entry.rung}`,
        from: entry.rung === 'account_manager' ? input.accountManager : contact,
        tick: entry.tick,
        body: rungBody(entry.rung, label, customer, input),
      })),
    }];
  }));
}

/** The shape the mail app already draws, stated here so nothing imports it. */
export interface InvoiceThread {
  readonly id: string;
  readonly subject: string;
  readonly messages: readonly {
    readonly id: string;
    readonly from: string;
    readonly tick: number;
    readonly body: readonly string[];
  }[];
}

function rungBody(
  rung: InvoiceRung,
  label: string,
  customer: string,
  input: Readonly<InvoiceThreadInput>,
): readonly string[] {
  const flagged = scrutinyFlags(input.sheet, input.records, 5)
    .filter((flag) => flag.customer === customer);
  const first = flagged[0];

  switch (rung) {
    case 'query':
      return [
        'Morning - one from our side on the last lot of time entries.',
        first === undefined
          ? 'There is a line on there we cannot place against anything we asked '
            + 'for. Could you have a look?'
          : first.evidence,
        'Not a complaint, just want to get it straight before it goes through '
          + 'for payment.',
      ];
    case 'breakdown':
      return [
        'Thanks for coming back. Our finance people would like it itemised '
          + 'before they release it - date, who, what, and hours, per entry.',
        'Your own system has produced this, which I gather is what it holds:',
        ...breakdownLines(input.sheet, input.records, customer, label),
        'Have a read and tell me if I have it wrong.',
      ];
    case 'dispute':
      return [
        'We are holding the invoice.',
        'It is not the amount, it is that we cannot reconcile the entries to '
          + 'anything on our side, and we are not signing off hours we cannot '
          + 'account for.',
        'I have copied our account manager. Nothing goes out until it is '
          + 'sorted.',
      ];
    case 'account_manager':
      return [
        `${label} have escalated. They are not saying anybody has done `
          + 'anything - they are saying they cannot reconcile the time, which '
          + 'is worse, because it is the thing I have to answer.',
        'I have their finance director on Thursday. Between now and then I '
          + 'would like the entries on that account to be ones I can stand '
          + 'behind, and I would like not to have to ask you that twice.',
      ];
    case 'left':
      return [
        `${label} have given notice on the contract.`,
        'They have been polite about it and they have not put a reason in '
          + 'writing, which is its own answer. Their work stops coming; what '
          + 'is open stays open until it is closed properly.',
        'It is not the money. It is that they stopped being able to tell what '
          + 'they were paying for.',
      ];
    case 'none':
      return [];
  }
}

/**
 * The person at the customer who reads the invoice.
 *
 * Their own contact - the one whose account carries their customer id, which is
 * the same field every scope guard in the game reads. Answering the FIRST by id
 * keeps it stable across a reload; null for an account with nobody on it, which
 * is a beat that then goes out over the shop's own name.
 */
export function invoiceContact(
  graph: ReadOnlyGraphView,
  customer: string,
): string | null {
  const accounts = graph
    .nodesOfKind('account')
    .filter((node) => customerIdOfNode(node) === customer)
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const account of accounts) {
    const person = graph
      .neighbors(account.id, { direction: 'in', edgeKind: 'owns' })
      .find((node: Readonly<ReadOnlyGraphNode>) => node.kind === 'person');

    if (person !== undefined) {
      return person.id;
    }
  }

  return null;
}
