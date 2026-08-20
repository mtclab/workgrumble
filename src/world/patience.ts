/**
 * CHURN BY SILENCE (E9, 0.39.0): the customers who stop calling, and the one
 * who leaves.
 *
 * The design gate this answers is "how does the game model a relationship
 * without inventing a relationship meter", and the answer is that it does not
 * invent one. Customer patience is the per-customer scrutiny shape the invoice
 * ladder already established (`invoice.ts`): a count that ACCRUES on events the
 * engine already records, DECAYS on clean weeks, and shows itself as a ladder
 * of consequences rather than as a bar. There is no patience gauge anywhere on
 * any screen, and that is the design rather than an omission - the customer
 * tells you, which is how it happens.
 *
 * WHAT IT IS FED BY, and every one of them is a stamp already on a ticket:
 *
 *  - the ACK clock (`FIELDS.ackMissed`, 0.37.0). The contract's promise is
 *    about being answered, and the stamp is the settler's own record that it
 *    was not. Read, never re-derived.
 *  - the UPDATE CADENCE (`FIELDS.cadenceMissed`, 0.37.0). One missed window is
 *    a busy hour; the threshold below is where it becomes silence.
 *  - the RESOLUTION BREACH on a tiered ticket. D4 took this out of the review's
 *    mark on purpose - resolution is best-effort at every vendor checked - and
 *    that is exactly why it belongs here instead: the customer does not care
 *    what the contract binds, they care that it is still broken.
 *  - the OBLIGED out-of-scope answer (`SCOPE_OUTCOMES.obliged`, 0.38.0). The
 *    reporter is delighted in the minute; the firm gets a supplier who does not
 *    hold a line, and comes back with a bigger ask. Being trained is also being
 *    disappointed, and the recurrence the 0.38.0 engine already deals is the
 *    evidence.
 *  - and the DISPUTED INVOICE, when the padding rail has got that far. The
 *    scrutiny ladder's own escalation, read rather than recomputed.
 *
 * ONE DEBIT PER TICKET, however many of those a single ticket collects. It is a
 * count of the JOBS the customer was let down on, which is what a client's own
 * account of a bad month sounds like ("three of ours just sat there"), and it
 * is what keeps the arithmetic below tractable: a customer sees two to four
 * arrivals in a week, so a week where every one of them was abandoned is three
 * or four, and no single ticket can walk the whole ladder by itself.
 *
 * THE LADDER, and it never punishes a single miss (see THE ARITHMETIC below):
 *
 *  1. ASKING. The account manager forwards a one-line mail - "everything ok
 *     over there?" He heard it from the customer, not from a dashboard, which
 *     is the only way anybody in an MSP ever hears it. Informational; a clean
 *     week walks it back.
 *  2. QUIET. Their tickets stop coming. The drip and surplus pool DEWEIGHTS
 *     their entries (`week-gen.ts`), so the queue thins on that account and
 *     nobody announces it. Silence made mechanical: the player notices the
 *     queue, which is truer than a number going down. A clean week walks it
 *     back too.
 *  3. LEAVING. The letter arrives, in the account manager's voice, naming the
 *     pattern off the file - the same answerable-from-records rule the invoice
 *     breakdown and the timesheet audit keep. The customer's estate leaves the
 *     world at the NEXT week boundary (`session.ts`), and the notice is
 *     irreversible: nothing walks a sent notice back.
 *
 * THE ARITHMETIC, worked out rather than felt (thresholds below):
 *
 *   grace/rungs   asking 2, quiet 4, leaving 6, decay 1 per clean week.
 *
 *   An honest-but-imperfect week is ONE ticket let down at an account - the
 *   Thursday that got away - which is a standing of 1 and stands on no rung at
 *   all. Two such weeks running reach the first rung, which is a question and
 *   not a punishment, and one clean week takes it away again. A BAD week at an
 *   account is every one of its two-to-four arrivals abandoned; two of those
 *   reach the second rung and the third reaches the notice, which is the
 *   "sustained neglect inside an arc" the design asks for. Nothing gets there
 *   faster: the settler hands over one rung at a time, and the notice
 *   additionally requires the deweight to have been standing since a previous
 *   day, so the shortest possible route from a clean account to a lost one is
 *   three separate deliveries across two days of ruinous weeks.
 *
 * Nothing here mutates, dispatches, reads a wall clock or consumes the RNG.
 */

import type { ReadOnlyGraphNode, ReadOnlyGraphView } from '../engine-api';
import { cadenceMissesOn } from './cadence';
import { customerOfTicket } from './estate-index';
import { FIELDS, slaTierOf } from './fields';
import { dayForTick } from './hours';
import {
  type DeliveredRung,
  rungDelivered,
  rungIndex as invoiceRungIndex,
} from './invoice';
import { SCOPE_OUTCOMES } from './out-of-scope';

/* -- the debits ----------------------------------------------------------- */

/**
 * How many update windows a ticket may miss before the customer counts it.
 *
 * TWO. One window is the hour somebody was on another fault, and a contract
 * that charged for it would be a drumbeat rather than a promise. Two in a row
 * is nobody having said anything for twice as long as the tier was sold on,
 * which is what "they went quiet on us" means from the other side of it.
 * OVERSEER TUNING KNOB.
 */
export const PATIENCE_CADENCE_MISSES = 2;

/** Why one ticket cost the account something, in the words the letter uses. */
export type PatienceReason =
  | 'ack'
  | 'cadence'
  | 'breach'
  | 'obliged'
  | 'disputed';

export const PATIENCE_REASON_LINES: Readonly<Record<PatienceReason, string>> = {
  ack: 'raised and not acknowledged inside the response the contract sells',
  cadence: 'left without an update for longer than the tier promises',
  breach: 'still open when the resolution target went past',
  obliged: 'work done off contract rather than quoted, and asked for again',
  disputed: 'an invoice they could not reconcile to their own records',
};

/** One thing the account has against the desk, and the job it happened on. */
export interface PatienceDebit {
  readonly customer: string;
  /** The ticket it happened on, or the empty string for the invoice. */
  readonly ticket: string;
  readonly reasons: readonly PatienceReason[];
}

/**
 * Everything a ticket cost the account, or nothing.
 *
 * READS THE STAMPS. Every clause is a field the contract settler, the SLA
 * engine or the scope verbs already wrote, so this cannot disagree with the
 * pane that showed the player the same fact at the time - which is the whole
 * of why nothing here re-derives a clock.
 */
function reasonsOn(node: Readonly<ReadOnlyGraphNode>): readonly PatienceReason[] {
  const reasons: PatienceReason[] = [];
  const contracted = slaTierOf(node.fields[FIELDS.customerSlaTier]) !== null;

  if (contracted && node.fields[FIELDS.ackMissed] === true) {
    reasons.push('ack');
  }

  if (contracted && cadenceMissesOn(node) >= PATIENCE_CADENCE_MISSES) {
    reasons.push('cadence');
  }

  if (contracted && node.fields[FIELDS.breached] === true) {
    reasons.push('breach');
  }

  if (node.fields[FIELDS.scopeOutcome] === SCOPE_OUTCOMES.obliged) {
    reasons.push('obliged');
  }

  return reasons;
}

/**
 * The rung of the invoice ladder at which the padding argument stops being a
 * question and starts being a grievance.
 *
 * The dispute is where the client says out loud that they cannot account for
 * what they are paying for, which is the sentence the churn research puts at
 * the top of every list of reasons an MSP contract ends. Below it they are
 * asking; at it and above they are unhappy with the supplier.
 */
const DISPUTED_FROM = invoiceRungIndex('dispute');

/**
 * Everything standing against every account THIS WEEK, off the world.
 *
 * A pure derivation, so a reload recomputes it exactly and a replay walks the
 * identical ladder. The ticket-to-customer answer is injected for the reason
 * every other reader of content injects one: a fixture week deals tickets the
 * shipped roster has never heard of, and a read that could only answer for the
 * shipped roster would make every fixture unmeasurable.
 */
export function patienceDebits(
  graph: ReadOnlyGraphView,
  delivered: readonly Readonly<DeliveredRung>[] = [],
  customerOf: (ticketId: string) => string | null = customerOfTicket,
): readonly PatienceDebit[] {
  const debits: PatienceDebit[] = [];

  for (const node of graph.nodesOfKind('ticket')) {
    const customer = customerOf(node.id);

    if (customer === null) {
      continue;
    }

    const reasons = reasonsOn(node);

    if (reasons.length > 0) {
      debits.push({ customer, ticket: node.id, reasons });
    }
  }

  // And the one debit that is not about a ticket. Read off the delivered
  // ledger rather than off the sheet, because what the account is unhappy
  // about is the CONVERSATION having reached a dispute - which is a fact about
  // what has been said, and the ledger is the only record of that.
  for (const node of graph.nodesOfKind('customer')) {
    if (invoiceRungIndex(rungDelivered(delivered, node.id)) >= DISPUTED_FROM) {
      debits.push({ customer: node.id, ticket: '', reasons: ['disputed'] });
    }
  }

  return Object.freeze(
    debits.sort((left, right) => left.customer.localeCompare(right.customer)
      || left.ticket.localeCompare(right.ticket)),
  );
}

/** How many debits each account has taken this week. */
export function debitsByCustomer(
  debits: readonly Readonly<PatienceDebit>[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const debit of debits) {
    counts.set(debit.customer, (counts.get(debit.customer) ?? 0) + 1);
  }

  return counts;
}

/* -- the ladder ----------------------------------------------------------- */

/**
 * Three rungs and a floor, in the order the churn research says an external
 * account walks them: somebody asks, the work stops arriving, the notice comes.
 *
 * The asymmetry #48 named is the whole shape of it: an INTERNAL customer
 * escalates loudly and never leaves, because they cannot. An external one goes
 * quiet, and the quiet is the signal.
 */
export const PATIENCE_RUNGS = ['none', 'asking', 'quiet', 'leaving'] as const;

export type PatienceRung = (typeof PATIENCE_RUNGS)[number];

/** How a notice names each rung. */
export const PATIENCE_RUNG_LABELS: Readonly<Record<PatienceRung, string>> = {
  none: 'Nothing outstanding',
  asking: 'The account manager, asking',
  quiet: 'Their work has stopped coming',
  leaving: 'Notice given on the contract',
};

/**
 * THE THRESHOLDS, in one table, per the arithmetic in the module docblock.
 *
 * OVERSEER TUNING KNOBS, all three, and they are the difficulty of this whole
 * mechanic. Everything else about it is derivation.
 */
export const PATIENCE_THRESHOLDS: Readonly<Record<PatienceRung, number>> = {
  none: 0,
  /** One let-down job is a Tuesday. Two is a question. */
  asking: 2,
  /** A bad week and then another one. */
  quiet: 4,
  /** And a third, or a second that was worse. */
  leaving: 6,
};

/**
 * What a clean week is worth off the count.
 *
 * ONE, the same figure and the same reasoning as `SCRUTINY_DECAY`: a week of
 * doing the job properly takes a week of pressure off, which is what makes
 * every rung below the notice escapable and what stops the rare bad Thursday
 * ever arriving anywhere. OVERSEER TUNING KNOB.
 */
export const PATIENCE_DECAY = 1;

export function patienceRungIndex(rung: PatienceRung): number {
  return PATIENCE_RUNGS.indexOf(rung);
}

/** The rung a standing of this size stands on. */
export function rungForPatience(standing: number): PatienceRung {
  let answer: PatienceRung = 'none';

  for (const rung of PATIENCE_RUNGS) {
    if (standing >= PATIENCE_THRESHOLDS[rung]) {
      answer = rung;
    }
  }

  return answer;
}

/* -- the ledger ----------------------------------------------------------- */

const SEPARATOR = '|';

/** One account's history with the desk: what it carried in, and what was said. */
export interface PatienceEntry {
  readonly customer: string;
  /** The count carried INTO this week. This week's debits are never in here. */
  readonly standing: number;
  readonly rung: PatienceRung;
  /** The minute the rung was handed over this week, or 0 for one carried in. */
  readonly tick: number;
}

function isRung(value: string): value is PatienceRung {
  return PATIENCE_RUNGS.some((rung) => rung === value);
}

export function encodePatience(entry: Readonly<PatienceEntry>): string {
  return [
    entry.customer,
    String(entry.standing),
    entry.rung,
    String(entry.tick),
  ].join(SEPARATOR);
}

function decodePatience(line: string): PatienceEntry | null {
  const parts = line.split(SEPARATOR);

  if (parts.length !== 4) {
    return null;
  }

  const [customer, held, rung, stamp] = parts;
  const standing = held === undefined || held.length === 0
    ? Number.NaN
    : Number(held);
  const tick = stamp === undefined || stamp.length === 0
    ? Number.NaN
    : Number(stamp);

  if (
    customer === undefined || customer.length === 0
    || rung === undefined || !isRung(rung)
    || !Number.isSafeInteger(standing) || standing < 0
    || !Number.isSafeInteger(tick) || tick < 0
  ) {
    return null;
  }

  return { customer, standing, rung, tick };
}

/**
 * The ledger, off the field.
 *
 * A line that will not parse is DROPPED rather than refusing the whole ledger,
 * which is the opposite of what `parseCarried` does and is right for the
 * opposite reason: a carry is a world half-rebuilt and must be all or nothing,
 * where this is a history, and half a history is still every account whose line
 * is intact. The account with the corrupt line reads as one nobody has a
 * history with, which is the honest fallback - it starts again at nought and
 * can only ever be treated better than the record says.
 */
export function patienceLedger(value: unknown): readonly PatienceEntry[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map(decodePatience)
      .filter((entry): entry is PatienceEntry => entry !== null),
  );
}

export function encodeLedger(
  entries: readonly Readonly<PatienceEntry>[],
): string {
  return [...entries]
    .sort((left, right) => left.customer.localeCompare(right.customer))
    .map(encodePatience)
    .join('\n');
}

/** One account's line, or the empty history every account starts with. */
export function entryFor(
  ledger: readonly Readonly<PatienceEntry>[],
  customer: string,
): PatienceEntry {
  return ledger.find((entry) => entry.customer === customer)
    ?? { customer, standing: 0, rung: 'none', tick: 0 };
}

/** The ledger with one account's line replaced or added. */
export function withPatienceEntry(
  existing: unknown,
  entry: Readonly<PatienceEntry>,
): string {
  return encodeLedger([
    ...patienceLedger(existing).filter(
      (held) => held.customer !== entry.customer,
    ),
    entry,
  ]);
}

/**
 * The accounts whose work the pool DEWEIGHTS - the ones that have gone quiet
 * and not yet gone.
 */
export function quietCustomers(
  ledger: readonly Readonly<PatienceEntry>[],
): readonly string[] {
  return Object.freeze(
    ledger.filter((entry) => entry.rung === 'quiet').map(({ customer }) => customer),
  );
}

/**
 * The accounts that have given notice.
 *
 * THE DEPARTURE FACT, and the only one there is. Read at a world build it is
 * the estate to leave out; read during the week it is the letter that has gone.
 * There is no second list of departed customers anywhere, because a second list
 * is a list that can disagree with this one - which is the failure this project
 * has spent two versions closing on two other mechanics.
 */
export function departedCustomers(
  ledger: readonly Readonly<PatienceEntry>[],
): readonly string[] {
  return Object.freeze(
    ledger.filter((entry) => entry.rung === 'leaving').map(({ customer }) => customer),
  );
}

/** The accounts whose notice went out in THIS week - what the Friday names. */
export function leavingThisWeek(
  ledger: readonly Readonly<PatienceEntry>[],
): readonly string[] {
  return Object.freeze(
    ledger
      .filter((entry) => entry.rung === 'leaving' && entry.tick > 0)
      .map(({ customer }) => customer),
  );
}

/* -- where each account stands right now ---------------------------------- */

export interface PatienceStanding {
  readonly customer: string;
  /** What it carried in, plus everything this week has put on it. */
  readonly standing: number;
  /** This week's half of that, on its own. */
  readonly debits: number;
  /** Where that standing puts them. */
  readonly rung: PatienceRung;
  /** And the furthest rung actually handed over. */
  readonly delivered: PatienceRung;
}

/**
 * Every account with a history or a bad week, and where it stands this minute.
 *
 * The live figure is the carried standing PLUS this week's debits and never
 * minus anything: a week is only clean once it is over, which is the same rule
 * `scrutinyByCustomer` keeps about a day and for the same reason - a fold that
 * decayed mid-week would take the pressure off before the post arrived and the
 * ladder would stall on its first rung forever.
 */
export function patienceStanding(
  ledger: readonly Readonly<PatienceEntry>[],
  debits: ReadonlyMap<string, number>,
): readonly PatienceStanding[] {
  const accounts = new Set<string>([
    ...ledger.map((entry) => entry.customer),
    ...debits.keys(),
  ]);

  return Object.freeze([...accounts]
    .map((customer) => {
      const held = entryFor(ledger, customer);
      const owed = debits.get(customer) ?? 0;
      const standing = held.standing + owed;

      return {
        customer,
        standing,
        debits: owed,
        rung: rungForPatience(standing),
        delivered: held.rung,
      };
    })
    .sort((left, right) => left.customer.localeCompare(right.customer)));
}

/* -- what is due now ------------------------------------------------------ */

export interface PatienceStep {
  readonly customer: string;
  readonly rung: PatienceRung;
  readonly standing: number;
}

/**
 * The next rung due, per account - the same "what is due right now" read the
 * invoice ladder is, settled by the day driver on the same morning-and-evening
 * rail.
 *
 * ONE RUNG AT A TIME AND NEVER A SKIP, so the beats arrive in order however
 * badly the week went: an account that fell off a cliff overnight is asked
 * about this morning and goes quiet this evening. And the NOTICE additionally
 * needs a day to have passed since the work stopped coming - the same shape the
 * invoice ladder's last rung has, and for the same reason: the last rung is a
 * question about whether it is STILL true, not one more point of annoyance.
 */
export function patienceLadderDue(
  ledger: readonly Readonly<PatienceEntry>[],
  debits: ReadonlyMap<string, number>,
  today: number,
): readonly PatienceStep[] {
  const due: PatienceStep[] = [];

  for (const account of patienceStanding(ledger, debits)) {
    const already = patienceRungIndex(account.delivered);
    const wanted = patienceRungIndex(account.rung);

    if (wanted <= already) {
      continue;
    }

    const next = PATIENCE_RUNGS[already + 1];

    if (next === undefined) {
      continue;
    }

    // THE NOTICE, which is not a threshold on its own. Their work stopped
    // coming, a day has gone by, and it is still true. Escapable right up to
    // the morning it lands: put the account right and `wanted` falls under the
    // deweight, and this never fires.
    if (next === 'leaving') {
      const held = entryFor(ledger, account.customer);

      if (held.tick > 0 && dayForTick(held.tick) >= today) {
        continue;
      }
    }

    due.push({
      customer: account.customer,
      rung: next,
      standing: account.standing,
    });
  }

  return Object.freeze(
    due.sort((left, right) => left.customer.localeCompare(right.customer)),
  );
}

/* -- the fold, at the end of the week ------------------------------------- */

/**
 * The ledger the next week carries, folded off this one.
 *
 * Three things happen here and nowhere else:
 *
 *  - THE ACCRUAL. A week with debits on an account adds them; a week with none
 *    takes `PATIENCE_DECAY` off, floored at nought. This is the only moment the
 *    standing moves, which is what makes the number a fold over weeks rather
 *    than a meter somebody has to remember to decrement.
 *  - THE WALK-BACK. A rung whose standing has decayed under it is given back,
 *    because the first two rungs are things somebody currently thinks rather
 *    than things that happened. `leaving` is exempt: a notice given is given,
 *    and a ladder that took one back would be the mechanic's whole point
 *    undone by a good fortnight.
 *  - THE CLOCK, taken off. Every tick goes to nought, per `carry.ts`: a stamp
 *    carried across a boundary describes a minute that has not happened.
 *
 * An account that folds to nothing at all - no standing, no rung - is DROPPED,
 * so a shop where nobody has ever been let down carries an empty ledger and
 * writes nothing, which is what keeps every world without one byte-identical.
 */
export function foldPatience(
  ledger: readonly Readonly<PatienceEntry>[],
  debits: ReadonlyMap<string, number>,
): readonly PatienceEntry[] {
  const accounts = new Set<string>([
    ...ledger.map((entry) => entry.customer),
    ...debits.keys(),
  ]);
  const folded: PatienceEntry[] = [];

  for (const customer of [...accounts].sort((left, right) =>
    left.localeCompare(right))) {
    const held = entryFor(ledger, customer);
    const owed = debits.get(customer) ?? 0;
    const standing = owed > 0
      ? held.standing + owed
      : Math.max(0, held.standing - PATIENCE_DECAY);
    const ceiling = rungForPatience(standing);
    const rung = held.rung === 'leaving'
      ? 'leaving'
      : patienceRungIndex(ceiling) < patienceRungIndex(held.rung)
        ? ceiling
        : held.rung;

    if (standing === 0 && rung === 'none') {
      continue;
    }

    folded.push({ customer, standing, rung, tick: 0 });
  }

  return Object.freeze(folded);
}

/* -- the post ------------------------------------------------------------- */

/** `customer:fontaine` -> `mail/patience-customer-fontaine`. */
function patienceThreadId(customer: string): string {
  return `mail/patience-${customer.replace(/:/gu, '-')}`;
}

export interface PatienceThreadInput {
  readonly ledger: readonly PatienceEntry[];
  readonly debits: readonly PatienceDebit[];
  readonly labelOf: (customer: string) => string;
  /** Who writes: the shop's own account side, in every rung. */
  readonly accountManager: string;
}

/** The shape the mail app already draws, stated here so nothing imports it. */
export interface PatienceThread {
  readonly id: string;
  readonly subject: string;
  readonly messages: readonly {
    readonly id: string;
    readonly from: string;
    readonly tick: number;
    readonly body: readonly string[];
  }[];
}

/**
 * The ladder as the post it arrives as - DERIVED, every time, off the ledger
 * and the week's own stamps.
 *
 * Only rungs handed over THIS WEEK have a thread, because the tick is what
 * stamps a message and a carried rung has none: last week's question is last
 * week's post, and this week's inbox is this week's. Every word of the body is
 * a function of the account, the rung and the debits on file - the notice reads
 * the jobs out, which is the answerable-from-records rule this game keeps
 * everywhere it lets somebody be accused of something.
 */
export function patienceThreads(
  input: Readonly<PatienceThreadInput>,
): readonly PatienceThread[] {
  return Object.freeze(
    [...input.ledger]
      .filter((entry) => entry.tick > 0 && entry.rung !== 'none')
      .sort((left, right) => left.customer.localeCompare(right.customer))
      .map((entry) => {
        const label = input.labelOf(entry.customer);

        return {
          id: patienceThreadId(entry.customer),
          subject: entry.rung === 'leaving'
            ? `${label}: notice on the contract`
            : `${label}`,
          messages: [{
            id: `${patienceThreadId(entry.customer)}/${entry.rung}`,
            from: input.accountManager,
            tick: entry.tick,
            body: rungBody(entry.rung, label, entry.customer, input.debits),
          }],
        };
      }),
  );
}

/**
 * What the file says about an account, as the lines a letter quotes.
 *
 * The same shape as the invoice breakdown and it is here for the same reason:
 * the notice is the one beat in this mechanic that accuses somebody of
 * something, so it says what of, off the record, and lets the player check.
 */
export function patienceRecordLines(
  debits: readonly Readonly<PatienceDebit>[],
  customer: string,
  titleOf: (ticket: string) => string = (ticket: string) => ticket,
): readonly string[] {
  return Object.freeze(
    debits
      .filter((debit) => debit.customer === customer)
      .map((debit) => `  ${debit.ticket === '' ? 'The invoice' : titleOf(debit.ticket)}: ${
        debit.reasons.map((reason) => PATIENCE_REASON_LINES[reason]).join('; ')
      }.`),
  );
}

function rungBody(
  rung: PatienceRung,
  label: string,
  customer: string,
  debits: readonly Readonly<PatienceDebit>[],
): readonly string[] {
  const jobs = patienceRecordLines(debits, customer);

  switch (rung) {
    case 'asking':
      return [
        `Forwarding this on - ${label} rang me rather than the desk, which is `
          + 'usually the tell.',
        '"Everything ok over there?" Nothing specific, no complaint, and they '
          + 'were perfectly pleasant about it.',
        'I have said it is all in hand. Have a look at their open ones when '
          + 'you get a minute.',
      ];
    case 'quiet':
      return [
        `${label} have gone quiet on me.`,
        'Nothing has been said and nothing has been escalated. What has '
          + 'happened is that they have stopped raising things - which at a '
          + 'firm that size does not mean their week got easier.',
        'They are doing it themselves or they are asking somebody else. Either '
          + 'way we are finding out about it last.',
      ];
    case 'leaving':
      return [
        `${label} have given notice on the contract. Thirty days, effective on `
          + 'the letter, and their work stops after this week.',
        'They have been polite about it and I am not going to pretend it is a '
          + 'surprise. This is what is on the file:',
        ...jobs,
        'None of that is a complaint anybody made at the time, which is the '
          + 'part I want you to sit with. They did not ring up and shout. They '
          + 'waited to see whether it would settle down, and then they went and '
          + 'found somebody else.',
      ];
    case 'none':
      return [];
  }
}
