/**
 * The timesheet (0.30.0, slice 1): what the week actually was, and what you say
 * it was.
 *
 * The whole mechanic stands on one fact about this codebase, which is that THE
 * GAME ALREADY KNOWS. Every act the player commits goes through one dispatch,
 * against one target, at one minute; the engine writes it down; the world can
 * say whose estate that target belongs to. So the honest sheet is not typed by
 * anybody - it is READ - and what the player gets to do is disagree with it.
 *
 * Three pieces, and the seams between them are the design:
 *
 *  - the LEDGER (`FIELDS.timesheetLog`). One line per stretch of the day the
 *    player spent on one thing: `tick|kind|id|last`, where the last field is the
 *    minute they were last seen doing it. It is written as it happens, by the
 *    same driver hook that writes a ticket's touch evidence, and it exists for
 *    precisely the reason that field exists - the dispatch log is drained at
 *    every day boundary and a timesheet is a week long. It is not a second copy
 *    of the truth: `segmentsFromLog` below rebuilds it from the engine's own log
 *    through the SAME attribution function the recorder uses, which is how the
 *    two are held to each other by a test rather than by a promise.
 *  - the DERIVATION (`deriveTimesheet`). Pure arithmetic over the ledger and the
 *    clock: a stretch owns the working minutes from when it started until the
 *    next one begins or half an hour after the last act in it, whichever comes
 *    first, clipped to its own shift and with lunch taken out. Slack owns
 *    nothing, which is how an hour on the forum becomes an hour nobody can bill
 *    without anything having to punish it.
 *  - the CLAIM (`FIELDS.timesheetClaim`). What the player says, stored beside
 *    the truth and never over it, as minutes AND a detail level - because the
 *    research is clear that granularity is the defence, not honesty: a padded
 *    line carrying date, name, task and hours survives a challenge and a vague
 *    line does not, whichever of them was true.
 *
 * Nothing here mutates, dispatches, reads a wall clock or consumes the RNG.
 */

import type {
  DispatchLogEntry,
  NodeId,
  ReadOnlyGraphView,
} from '../engine-api';
import { customerIdForTicketNodes, customerIdOfNode } from './customers';
import { FIELDS, PLAYER_TIERS, type PlayerTier } from './fields';
import { SCOPE_OUTCOMES } from './out-of-scope';
import {
  dayForTick,
  shiftEndTick,
  shiftStartTick,
  WORKING_MINUTES_PER_DAY,
  workingMinutesBetween,
} from './hours';

/* -- what a minute can be spent on ---------------------------------------- */

export const SEGMENT_KINDS = [
  /** Somebody's estate, by customer id. Billable. */
  'customer',
  /** A project, by project node id - the 0.29.0 project code. Billable. */
  'project',
  /** The employer's own kit, or a world with no customers in it. Not billable. */
  'internal',
  /**
   * Work done for a customer that no contract covers (E9, 0.38.0), by customer
   * id. Real work, on nobody's invoice.
   *
   * A kind of its own rather than `internal`, and the difference is the whole
   * point of it: internal minutes are the shop's own kit and they were never
   * anybody's to bill, while these are an afternoon somebody at a client asked
   * for and got. Keeping the customer's id on them is what lets the sheet say
   * WHOSE free work it was, which is the sentence the mechanic exists to put in
   * front of the player - and keeping them off the `customer` kind is what
   * keeps them off that customer's invoice, where they have no business being:
   * nobody agreed a price, so there is nothing to bill and nothing to dispute.
   *
   * They are COUNTED, unlike slack. The hour is on the sheet, in the day, at
   * full length - it is simply not billable, so the day looks accounted for and
   * the billable share does not move. That gap is the cost of obliging, said as
   * a number rather than as a punishment.
   */
  'unbilled',
  /** The browser, a toy, the thing that is not work. Attributable to nobody. */
  'slack',
] as const;

export type SegmentKind = (typeof SEGMENT_KINDS)[number];

export interface SegmentRef {
  readonly kind: SegmentKind;
  readonly id: string;
}

/**
 * One stretch of the day, as the ledger keeps it: when it started, and when the
 * player was last seen doing it.
 *
 * The second half is load-bearing and it is the whole difference between a
 * timesheet and a guess. A segment with only a start would have to be given
 * everything up to the next one, and there is no honest length for "the last
 * thing you did before lunch": counting it all bills the walk, and capping it
 * bills a solid two hours as half an hour. Carrying the last act instead means
 * a segment owns the time it was actually being worked, plus the tail nobody
 * could have written anything else down in.
 */
export interface WorkSegment {
  readonly tick: number;
  /** The last minute an act on this landed. Never before `tick`. */
  readonly last: number;
  readonly ref: SegmentRef;
  /**
   * WHAT the minutes were spent on - the node the attribution was read off,
   * which is a ticket for anything a ticket witnessed and the target itself
   * otherwise. Null for slack (a browser is not a node) and for a line written
   * by a build that did not record one.
   *
   * It exists because a bucket is not enough to correct a bucket (E9, 0.38.0
   * verifier round). The ledger is written at act-time, and the answer to "is
   * this billable" can arrive AFTER the minutes: an out-of-contract ask worked
   * for half an hour and refused at eleven has thirty minutes already on the
   * customer's billable line, and `customer|fontaine` alone cannot say which
   * of that customer's tickets they were for. Keeping the source means the
   * stretch that has to move can be found and moved, so the ledger stays what
   * `segmentsFromLog` would rebuild from the engine's own records rather than
   * quietly disagreeing with it.
   *
   * The sheet never reads it. Minutes bucket by `bucketOf(ref)` exactly as
   * they did - this is provenance, not a fourth dimension of the timesheet.
   */
  readonly source: string | null;
}

/**
 * The tail an act owns after it, and the gap that ends a stretch of work.
 *
 * One number doing two jobs, because they are the same judgement said twice:
 * half an hour after the last thing you did is the longest anybody can claim
 * they were still on it, and half an hour without doing anything to it is the
 * point at which coming back is coming BACK rather than carrying on. It is what
 * stops a player who fixed one printer at half nine and went for a walk from
 * billing the morning to whoever owned the printer.
 *
 * Half an hour because that is the granularity a real timesheet is written at,
 * and because beyond it nobody - including the person who was there - can
 * honestly say the time was that job.
 *
 * OVERSEER TUNING KNOB. It is the single number that decides how much of an
 * honest day lands attributed, which is the gap the utilisation reading in the
 * next slice is about.
 */
export const WORK_SEGMENT_MINUTES = 30;

/**
 * How many lines the ledger keeps, oldest dropped once it is full.
 *
 * Bounded for the reason `TOUCH_LOG_LIMIT` is bounded: this is a field in every
 * save from here on. It is bounded generously rather than tightly because
 * dropping the front of the week is dropping Monday, and a sheet that quietly
 * forgot Monday would be the one kind of dishonesty this whole mechanic is
 * against - the ledger only grows when the player CHANGES what they are doing,
 * so a hard week of context-switching is a few hundred lines and this is well
 * clear of it. `timesheet.test.ts` drives a real day and asserts the margin.
 */
export const TIMESHEET_LOG_LIMIT = 600;

/** Friday. The sheet accumulates all week and is due at the end of it. */
export const TIMESHEET_DUE_DAY = 5;

const SEPARATOR = '|';

/** The bucket a segment's minutes land in - the key a claim is filed against. */
export function bucketOf(ref: Readonly<SegmentRef>): string {
  return `${ref.kind}${SEPARATOR}${ref.id}`;
}

/** The single bucket a service-desk sheet has, and the whole of its shape. */
export const SERVICE_DESK_BUCKET = 'desk|service_desk';
export const SERVICE_DESK_LABEL = 'Service Desk';

function isSegmentKind(value: string): value is SegmentKind {
  return SEGMENT_KINDS.some((kind) => kind === value);
}

export function encodeSegment(
  tick: number,
  ref: Readonly<SegmentRef>,
  last: number = tick,
  source: string | null = null,
): string {
  const head = [String(tick), ref.kind, ref.id, String(last)];

  // The fifth field is OPTIONAL and absent when there is nothing to say, which
  // is what keeps a slack line and every line a pre-0.38.0 save carries exactly
  // the string this build would write for them.
  return (source === null || source.length === 0
    ? head
    : [...head, source]).join(SEPARATOR);
}

function decodeSegment(line: string): WorkSegment | null {
  const parts = line.split(SEPARATOR);
  const [stamp, kind, id, said, source] = parts;
  // `Number('')` is zero, which is a perfectly good tick and not what an empty
  // field means - the same trap `decodeTouch` sidesteps, for the same reason.
  const tick = stamp === undefined || stamp.length === 0
    ? Number.NaN
    : Number(stamp);
  const last = said === undefined || said.length === 0
    ? Number.NaN
    : Number(said);

  if (
    (parts.length !== 4 && parts.length !== 5)
    || kind === undefined
    || id === undefined
    || id.length === 0
    || !isSegmentKind(kind)
    || !Number.isSafeInteger(tick)
    || tick < 0
    || !Number.isSafeInteger(last)
    || last < tick
  ) {
    return null;
  }

  return {
    tick,
    last,
    ref: { kind, id },
    source: source === undefined || source.length === 0 ? null : source,
  };
}

/**
 * The ledger, read back off the field.
 *
 * A line this build cannot read is dropped rather than guessed at: a save is a
 * file on the player's machine and a sheet built on an invented line would be a
 * sheet claiming hours nobody worked, which is the one failure mode the whole
 * mechanic exists to make legible.
 */
export function segmentsFrom(value: unknown): readonly WorkSegment[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map(decodeSegment)
      .filter((segment): segment is WorkSegment => segment !== null),
  );
}

/**
 * The ledger with this minute's work folded into it - or unchanged, which is
 * the common case and the reason the field does not grow once a minute.
 *
 * Four rules, all of them about writing down each fact exactly once:
 *
 *  - carrying ON with what the line on the end is about EXTENDS it: its last
 *    act moves to this minute and no line is added. A player working one
 *    customer's queue all morning writes ONE line, however many acts it took.
 *  - coming BACK to it after longer than `WORK_SEGMENT_MINUTES` starts a new
 *    line, because that is coming back rather than carrying on, and the gap
 *    between them is time the sheet must not claim.
 *  - a change inside a minute REPLACES the line that minute already holds.
 *    Doing six things in one minute is doing them in one minute however many
 *    they were, and six zero-length segments would be six lines saying nothing.
 *  - SLACK never extends. Its minutes are never counted, so a browser left
 *    focused for an hour has nothing to update and must not write sixty
 *    dispatches to say so.
 *
 * Pure: the caller dispatches the result, so the whole field is one value in
 * the log and a replay writes exactly the same string.
 */
export function withSegment(
  existing: unknown,
  tick: number,
  ref: Readonly<SegmentRef>,
  source: string | null = null,
): string {
  const lines = typeof existing === 'string' && existing.length > 0
    ? existing.split('\n').filter((line) => line.length > 0)
    : [];
  const open = decodeSegment(lines[lines.length - 1] ?? '');

  // Same bucket AND the same thing (0.38.0 verifier round). Two tickets at one
  // customer used to extend one line, which merged them past telling apart -
  // and the re-bucket below has to be able to move ONE of them. Splitting the
  // stretch costs the derivation nothing: a segment owns the minutes up to the
  // next one, so two adjacent lines and one long one are the same arithmetic,
  // and they land in the same bucket either way.
  if (
    open !== null
    && bucketOf(open.ref) === bucketOf(ref)
    && open.source === source
  ) {
    if (ref.kind === 'slack' || tick <= open.last) {
      return lines.join('\n');
    }

    if (workingMinutesBetween(open.last, tick) > WORK_SEGMENT_MINUTES) {
      return appended(lines, encodeSegment(tick, ref, tick, source));
    }

    lines[lines.length - 1] = encodeSegment(open.tick, ref, tick, source);
    return lines.join('\n');
  }

  if (open !== null && open.tick === tick) {
    lines[lines.length - 1] = encodeSegment(tick, ref, tick, source);
    return lines.join('\n');
  }

  return appended(lines, encodeSegment(tick, ref, tick, source));
}

/**
 * The ledger with every stretch of work on one SOURCE re-bucketed - the
 * correction that keeps the recorder honest when the answer arrives after the
 * minutes (E9, 0.38.0 verifier round).
 *
 * The bug it exists for: `attributionFor` reads a ticket's scope outcome LIVE,
 * so `segmentsFromLog` - the audit, rebuilt from the engine's own log - says an
 * out-of-contract ask's minutes are unbilled the moment the answer lands. The
 * ledger said what was true when the minute was worked, which for every minute
 * spent BEFORE the answer was `customer`. Half an hour reading an ask you then
 * correctly refuse went onto that customer's billable line and stayed there,
 * and the two readings the whole mechanic claims are "one source by
 * construction" disagreed about it.
 *
 * So when the world's answer about a node changes, the lines that node wrote
 * are re-read against it. Not a rebuild from the log - the log holds the
 * WORLD's own acts too, and slack is in the ledger and in no log at all - but
 * the narrowest correction there is: same ticks, same lengths, same source, the
 * bucket the attribution says today.
 *
 * Lines this build cannot decode are passed through untouched rather than
 * dropped: a save is a file on the player's machine, and quietly rewriting a
 * field to delete what it could not read is a worse answer than leaving it.
 */
export function rebucketSource(
  existing: unknown,
  source: string,
  ref: Readonly<SegmentRef>,
): string {
  if (typeof existing !== 'string' || existing.length === 0) {
    return '';
  }

  let changed = false;
  const lines = existing.split('\n').map((line) => {
    const segment = decodeSegment(line);

    if (
      segment === null
      || segment.source !== source
      || bucketOf(segment.ref) === bucketOf(ref)
    ) {
      return line;
    }

    changed = true;
    return encodeSegment(segment.tick, ref, segment.last, source);
  });

  return changed ? lines.join('\n') : existing;
}

function appended(lines: readonly string[], line: string): string {
  return [...lines, line].slice(-TIMESHEET_LOG_LIMIT).join('\n');
}

/* -- whose minute was it -------------------------------------------------- */

/**
 * The two things about a ticket the world knows and the graph does not say
 * out loud: which project it is a task of, and which estate nodes it is about.
 *
 * Both are authored content (`world/tickets`), so they arrive as functions
 * rather than as a graph read - which also keeps this module drivable from a
 * test with three lines of fixture instead of a roster.
 */
export interface WorkResolver {
  readonly projectOfTicket: (ticketId: string) => string | null;
  readonly nodesOfTicket: (ticketId: string) => readonly string[];
}

/**
 * Whose time an act aimed at this target was, or null when it was nobody's.
 *
 * ONE function, used twice and deliberately: the driver calls it in the minute
 * the player acts, to write the ledger, and `segmentsFromLog` calls it over the
 * engine's own dispatch log to rebuild the same answer from the same evidence.
 * That is what "one source by construction" means here - not that the two
 * agree, but that there is only one of them, and `timesheet.test.ts` drives a
 * real day through the shipped driver and holds the two readings identical.
 *
 * Null is the honest answer for an act aimed at nothing - clocking on, setting
 * the dot, waving off a meeting invitation. Those are not work on an estate,
 * they leave the segment they interrupted running, and a sheet that opened a
 * bucket for them would be a sheet billing somebody for the player's own
 * admin.
 */
export function attributionFor(
  graph: ReadOnlyGraphView,
  target: NodeId | null,
  resolve: WorkResolver,
): SegmentRef | null {
  if (target === null) {
    return null;
  }

  const node = graph.getNode(target);

  if (node === undefined) {
    return null;
  }

  if (node.kind === 'project') {
    return { kind: 'project', id: node.id };
  }

  // A firewall rule carries the project it is being carried across for, which
  // is the one attribution a ticket cannot supply: `fw migrate` is aimed at the
  // rule, and the rule is not on the staging task's estate list.
  const ruleProject = node.fields[FIELDS.fwRuleProject];

  if (typeof ruleProject === 'string' && ruleProject.length > 0) {
    return { kind: 'project', id: ruleProject };
  }

  if (node.kind === 'ticket') {
    const project = resolve.projectOfTicket(node.id);

    if (project !== null) {
      return { kind: 'project', id: project };
    }

    const customer = customerIdForTicketNodes(graph, resolve.nodesOfTicket(node.id));

    if (customer === null) {
      return { kind: 'internal', id: 'internal' };
    }

    // The out-of-scope favour (E9, 0.38.0): work OBLIGED outside the agreement
    // is real work for a real customer that nobody is going to pay for, so it
    // keeps the customer's id and loses the invoice. It is read off the ticket
    // rather than remembered by the recorder, which is what makes the audit
    // read (`segmentsFromLog`) land on the same bucket from the same evidence -
    // and what makes it true of every act on that ticket rather than only of
    // the minute somebody pressed the button.
    // Declined and refused join obliged (0.38.0 review, twice): work on an
    // ask the contract does not cover never bills, whatever the answer -
    // the estimate on a declined quote is the afternoon the design copy
    // says it was, and minutes spent reading an ask you then correctly
    // refuse must not make the industry-script answer the one that quietly
    // earns. Only the QUOTED wait and an APPROVED quote's delivery are
    // billable: approval makes them retroactively true, and the other
    // three outcomes re-bucket the minute they land.
    const outcome = graph.getField(node.id, FIELDS.scopeOutcome);

    return outcome === SCOPE_OUTCOMES.obliged
      || outcome === SCOPE_OUTCOMES.declined
      || outcome === SCOPE_OUTCOMES.refused
      ? { kind: 'unbilled', id: customer }
      : { kind: 'customer', id: customer };
  }

  // An account carries its customer directly; a box, service or unit resolves
  // one through the machine it lives on. Both go through the shipped readers so
  // the sheet and the scope pre-flight cannot disagree about whose box it is.
  const direct = customerIdOfNode(node);
  const customer = direct ?? customerIdForTicketNodes(graph, [target]);

  return customer === null
    ? { kind: 'internal', id: 'internal' }
    : { kind: 'customer', id: customer };
}

/**
 * The ledger as the engine's OWN log would have written it - the audit read.
 *
 * The dispatch log is drained nightly, so this can only ever speak for what is
 * still in it; that is exactly what makes it the right thing to check the
 * ledger against, because within one day the two are answering an identical
 * question from an identical source and any difference is a recorder bug.
 *
 * Refusals are left out on both sides. A refused act took no time worth
 * charging anybody for, and one aimed at the wrong customer's box would
 * otherwise put a minute on an invoice for an estate that was never touched.
 */
export function segmentsFromLog(
  graph: ReadOnlyGraphView,
  entries: readonly Readonly<DispatchLogEntry>[],
  resolve: WorkResolver,
): readonly WorkSegment[] {
  let field = '';

  for (const entry of entries) {
    if (!entry.ok) {
      continue;
    }

    const ref = attributionFor(graph, entry.target, resolve);

    if (ref !== null && entry.target !== null) {
      field = withSegment(field, entry.tick, ref, entry.target);
    }
  }

  return segmentsFrom(field);
}

/* -- the derivation ------------------------------------------------------- */

export interface TimesheetLine {
  /** The key a claim is filed against: `${kind}|${id}`. */
  readonly bucket: string;
  readonly kind: SegmentKind;
  readonly id: string;
  /** Minutes, as the records have them. Never edited by anybody. */
  readonly minutes: number;
  /** Whether it is somebody's invoice. Internal time is not. */
  readonly billable: boolean;
}

export interface TimesheetDay {
  readonly day: number;
  readonly lines: readonly TimesheetLine[];
  readonly attributed: number;
  /**
   * The rest of the working day - the browser, the walk, the twenty minutes
   * after the phone call where nothing got written down.
   *
   * It is the SECOND cost of slacking, and it is a subtraction rather than a
   * penalty: nothing is charged for it, it simply is not on anybody's invoice.
   */
  readonly unattributed: number;
  /** Working minutes of this day that have actually gone by. */
  readonly elapsed: number;
}

export interface TimesheetTruth {
  readonly days: readonly TimesheetDay[];
}

/** Working minutes of a given day that have gone by at `now`. */
export function workingMinutesOfDay(day: number, now: number): number {
  return workingMinutesBetween(
    shiftStartTick(day),
    Math.min(now, shiftEndTick(day)),
  );
}

/**
 * Where the week's minutes went, off the ledger and the clock and nothing else.
 *
 * A segment owns the working time between it and the next one, clipped at the
 * end of its own shift (a night is not billable to anybody and the ledger does
 * not need a marker to say so) and capped at `WORK_SEGMENT_MINUTES`. Slack owns
 * nothing at all: it is recorded so that it ENDS the segment before it, which
 * is the whole of the mechanism - opening the forum stops the clock on the
 * ticket you were working, honestly, with no rule about slacking anywhere in
 * this function.
 */
export function deriveTimesheet(
  segments: readonly Readonly<WorkSegment>[],
  now: number,
): TimesheetTruth {
  const byDay = new Map<number, Map<string, TimesheetLine>>();
  const today = dayForTick(now);

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment === undefined) {
      continue;
    }

    const day = dayForTick(segment.tick);
    const next = segments[index + 1];
    // Up to the next thing the player did, the end of the shift, this minute,
    // or half an hour after the last act on this - whichever comes first. The
    // last of those four is the only one that is a judgement, and it is the
    // one that keeps a walk off somebody's invoice.
    const until = Math.min(
      next?.tick ?? now,
      shiftEndTick(day),
      now,
      segment.last + WORK_SEGMENT_MINUTES,
    );
    const minutes = workingMinutesBetween(segment.tick, until);

    if (segment.ref.kind === 'slack' || minutes <= 0) {
      continue;
    }

    const bucket = bucketOf(segment.ref);
    const lines = byDay.get(day) ?? new Map<string, TimesheetLine>();
    const existing = lines.get(bucket);

    lines.set(bucket, {
      bucket,
      kind: segment.ref.kind,
      id: segment.ref.id,
      minutes: (existing?.minutes ?? 0) + minutes,
      // Billable is what somebody agreed to pay for, which is two of the four
      // counted kinds: a customer's own work and a project's. Internal never
      // was, and `unbilled` is the one that had to be said out loud (E9,
      // 0.38.0) - it is a customer's work with no agreement behind it, so it
      // counts as time and not as money.
      billable: segment.ref.kind === 'customer' || segment.ref.kind === 'project',
    });
    byDay.set(day, lines);
  }

  const days: TimesheetDay[] = [];

  for (let day = 1; day <= today; day += 1) {
    const elapsed = workingMinutesOfDay(day, now);

    if (elapsed <= 0) {
      continue;
    }

    const lines = [...(byDay.get(day)?.values() ?? [])].sort(
      (left, right) => left.bucket.localeCompare(right.bucket),
    );
    const attributed = lines.reduce((total, line) => total + line.minutes, 0);

    days.push({
      day,
      lines: Object.freeze(lines),
      attributed,
      unattributed: Math.max(0, elapsed - attributed),
      elapsed,
    });
  }

  return { days: Object.freeze(days) };
}

/* -- the claim ------------------------------------------------------------ */

/**
 * How much of a line the player actually wrote down.
 *
 * Two objects rather than one, because the research says they behave
 * differently under challenge and not because one of them is a lie: "14/09,
 * A. Whitlock, ARD-FW-02 staging config, 2h" survives a finance team going
 * through the invoice line by line, and "consulting" does not, whether or not
 * either of them was true. The player's choice is therefore not only how many
 * minutes to claim but how much of a sentence to write beside them.
 */
export const CLAIM_DETAILS = ['detailed', 'vague'] as const;

export type ClaimDetail = (typeof CLAIM_DETAILS)[number];

export interface TimesheetClaim {
  readonly day: number;
  readonly bucket: string;
  readonly minutes: number;
  readonly detail: ClaimDetail;
}

function isClaimDetail(value: string): value is ClaimDetail {
  return CLAIM_DETAILS.some((detail) => detail === value);
}

/**
 * One claim line: `day|kind|id|minutes|detail`.
 *
 * The bucket is written out rather than escaped because the bucket already
 * contains the separator - it is `${kind}|${id}` - and a reader that split on
 * a fixed count and rejoined the middle would be a reader that quietly ate an
 * id with a bar in it. Five fields, all of them fixed-position.
 */
export function encodeClaim(claim: Readonly<TimesheetClaim>): string {
  return [
    String(claim.day),
    claim.bucket,
    String(claim.minutes),
    claim.detail,
  ].join(SEPARATOR);
}

function decodeClaim(line: string): TimesheetClaim | null {
  const parts = line.split(SEPARATOR);

  if (parts.length !== 5) {
    return null;
  }

  const [stamp, kind, id, said, detail] = parts;
  const day = stamp === undefined || stamp.length === 0
    ? Number.NaN
    : Number(stamp);
  const minutes = said === undefined || said.length === 0
    ? Number.NaN
    : Number(said);

  if (
    kind === undefined
    || id === undefined
    || id.length === 0
    || detail === undefined
    || !isClaimDetail(detail)
    || !Number.isSafeInteger(day)
    || day < 1
    || !Number.isSafeInteger(minutes)
    || minutes < 0
  ) {
    return null;
  }

  return { day, bucket: `${kind}${SEPARATOR}${id}`, minutes, detail };
}

export function claimsFrom(value: unknown): readonly TimesheetClaim[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map(decodeClaim)
      .filter((claim): claim is TimesheetClaim => claim !== null),
  );
}

/**
 * The claim field with one entry written into it, replacing any earlier claim
 * on the same day and bucket.
 *
 * Replacing rather than appending because a claim is a STATEMENT rather than an
 * event: the player says two hours, then thinks better of it and says one, and
 * the sheet that goes in says one. What happened is in the ledger, untouched,
 * and a customer asking the awkward question is answered from there.
 */
export function withClaim(
  existing: unknown,
  claim: Readonly<TimesheetClaim>,
): string {
  const kept = claimsFrom(existing).filter(
    (line) => line.day !== claim.day || line.bucket !== claim.bucket,
  );

  return [...kept, claim]
    .sort((left, right) =>
      left.day - right.day || left.bucket.localeCompare(right.bucket))
    .map(encodeClaim)
    .join('\n');
}

/* -- the sheet, as the tier shapes it ------------------------------------- */

export type SheetShape = 'single_bucket' | 'per_customer';

export interface SheetLine {
  readonly bucket: string;
  readonly label: string;
  readonly billable: boolean;
  /** What the records say. */
  readonly derived: number;
  /** What the sheet says, which is the same until somebody edits it. */
  readonly claimed: number;
  readonly detail: ClaimDetail;
  /** Whether a claim was actually filed, as opposed to standing as derived. */
  readonly edited: boolean;
}

export interface SheetDay {
  readonly day: number;
  readonly lines: readonly SheetLine[];
  readonly derived: number;
  readonly claimed: number;
  readonly unattributed: number;
  /**
   * Working minutes of this day that have gone by - the denominator the
   * utilisation reading is against, carried through from the derivation rather
   * than recomputed by whoever is asking. A day is 450 of these once it is
   * over and fewer while it is running.
   */
  readonly elapsed: number;
}

export interface Timesheet {
  readonly shape: SheetShape;
  readonly days: readonly SheetDay[];
  readonly derived: number;
  readonly claimed: number;
  readonly submittedAt: number | null;
  readonly submittedAuto: boolean;
  readonly dueDay: number;
}

/** Which sheet a tier is asked for. The tier read rides the shipped field. */
export function shapeForTier(tier: PlayerTier): SheetShape {
  return tier === PLAYER_TIERS.systemsEngineer ? 'per_customer' : 'single_bucket';
}

export interface SheetState {
  readonly tier: PlayerTier;
  readonly submittedAt: number | null;
  readonly submittedAuto: boolean;
  /** How the sheet names a customer or a project. */
  readonly labelOf: (kind: SegmentKind, id: string) => string;
}

/**
 * The sheet: the derived truth and the player's claim, side by side, in the
 * shape the tier asks for.
 *
 * The two shapes are two different JOBS, which is why the tier decides and not
 * a preference:
 *
 *  - `single_bucket` is the service desk, and it is the joke. Nobody at a
 *    service desk attributes anything: the sheet is a headcount formality, one
 *    line a day at seven and a half hours, and it is finished before the sigh
 *    is. The ledger is not consulted, because there is nothing on it anybody
 *    would be asked about.
 *  - `per_customer` is the engineer, and it is the mechanic: one line per
 *    customer, the 0.29.0 project as an attributable line of its own with its
 *    project code on it, a billable flag, and the rest of the day sitting
 *    underneath as time that is on nobody's invoice.
 */
export function timesheetSheet(
  truth: Readonly<TimesheetTruth>,
  claims: readonly Readonly<TimesheetClaim>[],
  state: Readonly<SheetState>,
): Timesheet {
  const shape = shapeForTier(state.tier);
  const claimFor = (day: number, bucket: string): TimesheetClaim | undefined =>
    claims.find((claim) => claim.day === day && claim.bucket === bucket);

  const days = truth.days.map((day): SheetDay => {
    const derivedLines = shape === 'single_bucket'
      ? [{
        bucket: SERVICE_DESK_BUCKET,
        label: SERVICE_DESK_LABEL,
        billable: false,
        derived: WORKING_MINUTES_PER_DAY,
      }]
      : day.lines.map((line) => ({
        bucket: line.bucket,
        label: state.labelOf(line.kind, line.id),
        billable: line.billable,
        derived: line.minutes,
      }));

    // A bucket the player claimed on that the records know nothing about is
    // still a line: moving an hour onto a quiet account is the pad the whole
    // ladder is built to catch, and a sheet that refused to show it would be
    // refusing to show the thing it is about.
    const invented = claims
      .filter((claim) => claim.day === day.day
        && !derivedLines.some((line) => line.bucket === claim.bucket))
      .map((claim) => ({
        bucket: claim.bucket,
        label: labelForBucket(claim.bucket, state),
        // The same two-of-four rule the derivation uses, asked of a bucket
        // rather than of a segment: a line the player typed onto an internal or
        // an unbilled account is still not a line anybody is invoiced for, and
        // reading it off the kind rather than off one prefix is what stops the
        // out-of-scope bucket quietly counting as money.
        billable: billableBucket(claim.bucket),
        derived: 0,
      }));

    const lines = [...derivedLines, ...invented].map((line): SheetLine => {
      const claim = claimFor(day.day, line.bucket);

      return {
        ...line,
        claimed: claim?.minutes ?? line.derived,
        detail: claim?.detail ?? 'detailed',
        edited: claim !== undefined,
      };
    });

    const derived = lines.reduce((total, line) => total + line.derived, 0);
    const claimed = lines.reduce((total, line) => total + line.claimed, 0);

    return {
      day: day.day,
      lines: Object.freeze(lines),
      derived,
      claimed,
      unattributed: shape === 'single_bucket' ? 0 : day.unattributed,
      elapsed: day.elapsed,
    };
  });

  return {
    shape,
    days: Object.freeze(days),
    derived: days.reduce((total, day) => total + day.derived, 0),
    claimed: days.reduce((total, day) => total + day.claimed, 0),
    submittedAt: state.submittedAt,
    submittedAuto: state.submittedAuto,
    dueDay: TIMESHEET_DUE_DAY,
  };
}

/**
 * The `${kind}|${id}` a bucket is, taken back apart - or null for the desk's
 * one bucket, which is not a segment kind and never was.
 *
 * Exported because the customer's reading of the sheet (`invoice.ts`) has to
 * know WHOSE line it is looking at, and the bucket is where that is written. It
 * splits on the FIRST separator for the reason `decodeClaim` does not split at
 * all: an id may carry a bar, and a reader that rejoined the middle would be a
 * reader that quietly ate one.
 */
export function bucketParts(bucket: string): Readonly<SegmentRef> | null {
  const at = bucket.indexOf(SEPARATOR);

  if (at <= 0) {
    return null;
  }

  const kind = bucket.slice(0, at);
  const id = bucket.slice(at + 1);

  return isSegmentKind(kind) && id.length > 0 ? { kind, id } : null;
}

function labelForBucket(bucket: string, state: Readonly<SheetState>): string {
  const parts = bucketParts(bucket);

  return parts === null ? bucket : state.labelOf(parts.kind, parts.id);
}

/** Whether a bucket is money: a customer's own work, or a project's. */
function billableBucket(bucket: string): boolean {
  const kind = bucketParts(bucket)?.kind;

  return kind === 'customer' || kind === 'project';
}

/**
 * The word at the end of a row: what this time IS, in the sheet's own three
 * registers. Exported because the terminal and the window both print it, and
 * two surfaces disagreeing about what an hour was is the bug this codebase
 * keeps refusing to ship.
 *
 * `unbilled` is the one worth having (E9, 0.38.0). Printing it as `internal`
 * would have been true about the money and a lie about the afternoon - it would
 * read as the shop's own kit rather than as an hour a named client got for
 * nothing, which is the whole thing the player is meant to see.
 */
export function lineFlag(line: Readonly<SheetLine>): string {
  if (line.billable) {
    return 'billable';
  }

  return bucketParts(line.bucket)?.kind === 'unbilled' ? 'unbilled' : 'internal';
}

/* -- what the ORG reads off it (0.30.0, slice 2) -------------------------- */

/**
 * Which number a tier's target is against, and the whole reason there are two.
 *
 * They are two different JOBS being measured, exactly as the two sheet shapes
 * are two different jobs being filled in:
 *
 *  - `recorded` is "is the sheet filled in" - every minute the sheet accounts
 *    for at all, billable or not. It is what a service desk is actually held
 *    to, and on a one-bucket sheet it is a hundred per cent by construction.
 *  - `billable` is utilisation in the trade's own sense - the minutes that are
 *    on somebody's invoice, over the minutes of the day. It is the engineer's
 *    number and it is the one padding moves.
 */
export type UtilisationBasis = 'recorded' | 'billable';

export interface UtilisationTarget {
  readonly basis: UtilisationBasis;
  readonly percent: number;
}

/**
 * What the business asks of each tier.
 *
 * OVERSEER TUNING KNOBS, both, and the second one is the design.
 *
 * The DESK's is a hundred against `recorded`, and it is the joke: the sheet is
 * one bucket a day at seven and a half hours, so it hits the target exactly,
 * every week, without anybody deciding anything. Nobody at a service desk
 * attributes anything and the number that measures them says so.
 *
 * The ENGINEER's is seventy-five against `billable`, which is the sourced
 * industry ask - "service executives aim for 75% billable ... and end up with
 * yearly averages in the mid-60s" (Promys, via `docs/research/
 * titles-projects-engine.md` 5.4). The honest week does not reach it, and that
 * is the whole of the mechanic: MEASURED on the shipped MSP week played
 * properly at x1, a week that closes its queue and carries its project lands
 * between about 35% and 50% billable depending on how the acts fall - the
 * engine only credits a minute somebody was demonstrably working, and the
 * authored week runs out of arrivals before Friday afternoon does. So the
 * target is not reachable honestly, missing it costs exactly nothing (that is
 * the house rule, asserted in `timesheet.test.ts`), and the only way to hit it
 * is to claim time nobody worked - which is what the customer reads.
 */
export const UTILISATION_TARGETS: Readonly<Record<PlayerTier, UtilisationTarget>> = {
  [PLAYER_TIERS.serviceDesk]: { basis: 'recorded', percent: 100 },
  [PLAYER_TIERS.systemsEngineer]: { basis: 'billable', percent: 75 },
};

export interface UtilisationReading {
  readonly basis: UtilisationBasis;
  /** The number the target is against, as a whole percentage. */
  readonly percent: number;
  /** Every minute the sheet accounts for, as a whole percentage. */
  readonly recorded: number;
  /** The minutes on somebody's invoice, as a whole percentage. */
  readonly billable: number;
  readonly target: number;
  readonly met: boolean;
  /** The minutes behind the ratio, so a surface can print the arithmetic. */
  readonly claimedMinutes: number;
  readonly billableMinutes: number;
  readonly availableMinutes: number;
}

function share(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.min(100, Math.round(100 * part / whole));
}

/**
 * The week as the ORG reads it: what you SAID, over the hours you were here.
 *
 * The claim rather than the record, deliberately and on both bases. A timesheet
 * is what the business has; nobody at the review is holding the dispatch log.
 * That is what makes padding move this number and what makes the customer's
 * reading of the same sheet the counterweight - one sheet, two readers, and the
 * gap between what each of them can check is the mechanic.
 *
 * One call over the SHEET, which is already the derivation and the claim side
 * by side, so there is no second arithmetic here to drift from it.
 */
export function utilisationOf(
  sheet: Readonly<Timesheet>,
  tier: PlayerTier,
): UtilisationReading {
  const target = UTILISATION_TARGETS[tier];
  const claimedMinutes = sheet.days.reduce((total, day) => total + day.claimed, 0);
  const billableMinutes = sheet.days.reduce(
    (total, day) => total + day.lines.reduce(
      (sum, line) => sum + (line.billable ? line.claimed : 0),
      0,
    ),
    0,
  );
  const availableMinutes = sheet.days.reduce(
    (total, day) => total + day.elapsed,
    0,
  );
  const recorded = share(claimedMinutes, availableMinutes);
  const billable = share(billableMinutes, availableMinutes);
  const percent = target.basis === 'recorded' ? recorded : billable;

  return {
    basis: target.basis,
    percent,
    recorded,
    billable,
    target: target.percent,
    met: percent >= target.percent,
    claimedMinutes,
    billableMinutes,
    availableMinutes,
  };
}

/**
 * The utilisation row, in the words the review uses.
 *
 * It says the number, the target, and NOTHING ELSE. There is no "should", no
 * "needs to improve" and no consequence attached anywhere in this game: being
 * under target reads at the review as being under target, because the one thing
 * this mechanic must never do is make honesty the losing move. The sentence
 * that follows the number is arithmetic, not advice.
 */
export function utilisationLine(reading: Readonly<UtilisationReading>): string {
  const what = reading.basis === 'billable'
    ? 'billable'
    : 'of the day accounted for';

  return `${String(reading.percent)}% ${what}, against the ${
    String(reading.target)
  }% the business asks for. ${hoursLabel(
    reading.basis === 'billable'
      ? reading.billableMinutes
      : reading.claimedMinutes,
  )} of ${hoursLabel(reading.availableMinutes)} on the clock.`;
}

/* -- how it reads --------------------------------------------------------- */

/** Minutes as a person says them: `2h 30m`, `45m`, `0m`. */
export function hoursLabel(minutes: number): string {
  if (minutes <= 0) {
    // Nought is a number a sheet has to be able to say: a line the player
    // claimed on that the records know nothing about is worth exactly none of
    // anybody's afternoon, and a dash there would read as "not applicable".
    return '0m';
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return hours === 0
    ? `${String(rest)}m`
    : rest === 0
      ? `${String(hours)}h`
      : `${String(hours)}h ${String(rest)}m`;
}

/** The handle a terminal line is addressed by: day, then position. */
export function lineHandle(day: number, index: number): string {
  return `${String(day)}.${String(index + 1)}`;
}

/** The (day, bucket) a handle names, or null when it names nothing. */
export function lineAt(
  sheet: Readonly<Timesheet>,
  handle: string,
): { readonly day: number; readonly line: SheetLine } | null {
  for (const day of sheet.days) {
    for (let index = 0; index < day.lines.length; index += 1) {
      const line = day.lines[index];

      if (line !== undefined && lineHandle(day.day, index) === handle) {
        return { day: day.day, line };
      }
    }
  }

  return null;
}

/** The label column, wide enough for a project's own name and no wider. */
const LABEL_WIDTH = 38;

function pad(text: string, width: number): string {
  return text.length >= width ? text : text.padEnd(width);
}

/**
 * A label in its column, cut rather than allowed to shove the numbers along.
 *
 * Ragged columns on a sheet whose whole job is putting two numbers side by side
 * would defeat the sheet: the comparison has to be readable at a glance, and a
 * name three characters too long must not move the thing it is being compared
 * with.
 */
function column(text: string): string {
  return pad(
    text.length > LABEL_WIDTH ? `${text.slice(0, LABEL_WIDTH - 1)}~` : text,
    LABEL_WIDTH,
  );
}

/**
 * The sheet as the lines a terminal prints.
 *
 * Both numbers on every row, always. A sheet that showed only the claim would
 * be a sheet the player could forget they had padded, and the comedy the whole
 * mechanic was born from is filling it in on Friday at 16:55 from a week-old
 * memory - which only works if the thing you are disagreeing with is on the
 * screen next to you.
 */
export function timesheetLines(
  sheet: Readonly<Timesheet>,
  today: number,
  /**
   * The two things ANOTHER reader has to say about the same week (0.30.0,
   * slice 2): the org's utilisation row, and any account that has a question
   * about a line. Optional because the sheet is complete without them - a
   * fixture printing the model needs no readers - and appended rather than
   * woven in, because the sheet is the sheet and this is the post.
   */
  extras: Readonly<{
    readonly utilisation?: string;
    readonly accounts?: readonly string[];
  }> = {},
): readonly string[] {
  const head = sheet.submittedAt === null
    ? [
      `Timesheet - week to date. Due end of day ${String(sheet.dueDay)}${
        today >= sheet.dueDay ? ', which is today.' : '.'
      }`,
    ]
    : [
      `Timesheet - SUBMITTED${
        sheet.submittedAuto
          ? ' automatically at the end of the week, as it stood.'
          : '.'
      }`,
    ];

  if (sheet.days.length === 0) {
    return [...head, '  Nothing on it yet. The week has not started.'];
  }

  const rows = sheet.days.flatMap((day) => [
    `Day ${String(day.day)}`,
    ...day.lines.map((line, index) => `  ${
      pad(lineHandle(day.day, index), 6)
    }${column(line.label)}${
      pad(hoursLabel(line.derived), 9)
    }${pad(hoursLabel(line.claimed), 9)}${
      lineFlag(line)
    }${line.detail === 'vague' ? '  (vague)' : ''}`),
    ...(day.unattributed > 0
      ? [`  ${pad('', 6)}${column('unattributed')}${
        pad(hoursLabel(day.unattributed), 9)
      }${pad('-', 9)}nobody's`]
      : []),
  ]);

  return [
    ...head,
    `  ${pad('', 6)}${column('')}${pad('worked', 9)}${pad('claimed', 9)}`,
    ...rows,
    `  Week: ${hoursLabel(sheet.derived)} worked, ${
      hoursLabel(sheet.claimed)
    } claimed.`,
    ...(extras.utilisation === undefined
      ? []
      : [`  Utilisation: ${extras.utilisation}`]),
    ...(extras.accounts === undefined || extras.accounts.length === 0
      ? []
      : ['  Accounts with a question about a line:', ...extras.accounts]),
  ];
}
