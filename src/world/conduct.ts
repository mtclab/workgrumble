/**
 * The file, and who has a reason to open it.
 *
 * Being seen with a forum up used to cost six points of reputation, and 0.2.5
 * took the last thing that read those points away from the review. So the
 * conversation in the corridor had a price with nothing on the other end of
 * it, which is the worst of both: a mechanic that looks like it matters and
 * does not.
 *
 * What replaces it is what actually happens in a service organisation, and it
 * is documented at length in `docs/research/review-scoring.md` sections 2.4 to
 * 2.6. Conduct is not scored beside performance - it is held on a separate
 * track, as a dated record that accumulates and does nothing. Contact-centre
 * QA reviews one to three percent of interactions; the rest is covered by
 * TRIGGER-BASED review, which is to say somebody complains and then somebody
 * goes and looks. A longitudinal study of internet monitoring records "the
 * relative scarcity of enforced sanctions": most firms monitor and do not act.
 * And what decides whether the looking hurts is Hollander's idiosyncrasy
 * credit - contribution buys latitude, and the latitude is spent by deviating.
 *
 * Three things live here and nothing else does:
 *
 * - THE FILE. One dated line per thing the lead noticed, written in the voice
 *   the building writes these in, which is the passive voice. It costs no
 *   points and is readable all week in `A quick word`.
 * - THE TRIGGERS. Three reasons somebody opens it, each a pure function of the
 *   ticket nodes and each nameable to the player before it fires. Never a die
 *   roll: the determinism gate forbids it and legibility forbids it twice.
 * - THE BAR. The mark Friday has to clear, which starts at the published
 *   figure and is raised by the file - but only once somebody has looked.
 *
 * Nothing here touches the DOM, dispatches, or reads the time of day.
 */

import type { ReadOnlyGraphNode } from '../engine-api';
import { BOSS_TRAP_TICKET } from './boss';
import { FIELDS } from './fields';
import { dayForTick, minuteOfDay } from './hours';
import { ticketTitle } from './tickets';
import {
  dayScript,
  isWeekDay,
  REVIEW_PASS_PERFORMANCE,
  WEEK,
} from './week';

/* -- the file -------------------------------------------------------------- */

/**
 * What was noticed. Four things can be, and they are different observations:
 * the lead can find something on the screen, he can find nothing on the screen
 * and count the cans instead, he can find nothing anywhere and read the STATUS
 * - a dot saying one thing over a dispatch log saying another - and he can read
 * the SOFTWARE audit, which is not on the screen at all: a program on the list
 * of installs this workstation has no business holding.
 *
 * The status one is not a screen and must not be filed as one: "screen observed
 * to be non-work-related" about a morning of closed tickets is a line that is
 * simply untrue, and the whole point of this file is that every line in it can
 * be traced to the minute it is about. The software one is the same rule again:
 * it is a record IT holds, not a window anybody saw, and it says so.
 */
export const CONDUCT_KINDS = [
  'screen',
  'desk',
  'status',
  'software',
  // The fifth, and the only one that is about a person rather than a machine or
  // a status: the lead was standing there when a user got told where to go. It
  // is not a screen and not a status inference - he heard it - and it must not
  // be filed as either.
  'conduct',
] as const;

export type ConductKind = (typeof CONDUCT_KINDS)[number];

export interface ConductEntry {
  /** The minute it was noticed in. */
  readonly tick: number;
  readonly kind: ConductKind;
  /** The line as the file holds it, already written. */
  readonly text: string;
}

/**
 * The stamp a line carries, in the shape a personnel note carries one.
 *
 * Day name rather than "Day 3", because the file is a thing a human wrote and
 * humans write Wednesday. Outside the probation week there is no name to use,
 * which is a state nothing shipped can reach and is answered rather than
 * thrown at: a file is not a place to have an exception.
 */
export function conductStamp(tick: number): string {
  const day = dayForTick(tick);
  const label = isWeekDay(day) ? dayScript(day).label : `Day ${String(day)}`;
  const minute = minuteOfDay(tick);

  return `${label} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${
    String(minute % 60).padStart(2, '0')
  }`;
}

/**
 * One line of the file, written at the moment it is noticed.
 *
 * The whole sentence arrives built, from here, exactly as a machine's own
 * event log does and for the same reason: a replay writes the identical string
 * rather than recomputing it against a clock nobody saved. The pipe-separated
 * stamp in front of it is not decoration either - the legibility gate has to
 * be able to prove every line predates the review, and a sentence is not a
 * number.
 */
export function conductLine(
  tick: number,
  kind: ConductKind,
  subject: string,
): string {
  const said = subject.replaceAll('|', '/').trim();

  const text = kind === 'screen'
    ? `${conductStamp(tick)} - Screen observed to be non-work-related on `
      + `passing (${said}). Employee spoken to informally. No further action `
      + 'at this time.'
    : kind === 'desk'
      ? `${conductStamp(tick)} - Desk observed with ${said} standing on it. `
        + 'Not raised with the employee.'
      : kind === 'status'
        // The one written by somebody who has put two records side by side,
        // which is why it is the only line in the file that cites both.
        ? `${conductStamp(tick)} - Availability status recorded as ${said} `
          + 'during a period of logged activity on the queue. Employee spoken '
          + 'to informally. No further action at this time.'
        : kind === 'software'
          // The one written off the install audit: not a window anybody saw, a
          // line on the list of software this workstation holds against policy.
          ? `${conductStamp(tick)} - Unauthorised software recorded on this `
            + `workstation against installation policy (${said}). Retained on `
            + 'the audit. Employee spoken to informally. No further action at '
            + 'this time.'
          // And the one about a person: the lead heard it. Passive and dry, the
          // way a file is, and specific about what it was without repeating it.
          : `${conductStamp(tick)} - Employee overheard addressing a user in `
            + `terms recorded as ${said}. Employee spoken to informally. No `
            + 'further action at this time.';

  return `${String(tick)}|${kind}|${text}`;
}

function isConductKind(value: string): value is ConductKind {
  return CONDUCT_KINDS.some((kind) => kind === value);
}

/**
 * The file, read back out of the field, in the order it was written.
 *
 * Order is the field's own - `append_line` puts each line after the last - and
 * it is left alone rather than sorted, because a file that reordered itself
 * would be a file that could not be checked against the clock.
 */
export function conductEntries(value: unknown): readonly ConductEntry[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }

  const entries: ConductEntry[] = [];

  for (const line of value.split('\n')) {
    const [stamp, kind, ...rest] = line.split('|');
    const tick = Number(stamp);

    if (
      stamp === undefined
      || kind === undefined
      || rest.length === 0
      || !isConductKind(kind)
      || !Number.isSafeInteger(tick)
      || tick < 0
    ) {
      continue;
    }

    entries.push({ tick, kind, text: rest.join('|') });
  }

  return Object.freeze(entries);
}

/** How thick the file is, which is the only thing the bar reads off it. */
export function conductFileSize(value: unknown): number {
  return conductEntries(value).length;
}

/* -- who has a reason to look ---------------------------------------------- */

export const CONDUCT_TRIGGERS = ['customer', 'colleague', 'lead'] as const;

export type ConductTriggerId = (typeof CONDUCT_TRIGGERS)[number];

export interface ConductTrigger {
  readonly id: ConductTriggerId;
  /** The ticket that gave them the reason, which the player could see go red. */
  readonly ticketId: string;
  /** What the player is told, on the screen, all week. */
  readonly headline: string;
}

/**
 * What the player is told BEFORE anything fires: the three reasons, in the
 * order they are checked, each with the thing that would cause it.
 *
 * This is beat three of the legibility contract - the criteria, stated in the
 * fiction's own words - and it is on screen from Monday morning rather than
 * being explained at the verdict. A rule first seen in the sentence that
 * applies it is a rule nobody could have played toward.
 */
export const CONDUCT_TRIGGER_CRITERIA: Readonly<
  Record<ConductTriggerId, string>
> = Object.freeze({
  customer: 'Somebody whose ticket went red and who was never told anything '
    + 'at all. They ring the lead, because you were the other option.',
  colleague: 'Somebody on this floor who asked you directly, was sent to the '
    + 'form, and is still waiting. They mention it, at length, in the kitchen.',
  lead: 'The lead\'s own ticket, left to go red. He does not ring anybody. He '
    + 'walks down here.',
});

/**
 * The tickets that only exist because somebody was sent to the form.
 *
 * Read off the week rather than named here, because the direct-message beats
 * are content: a second colleague who would rather not use the form is a row
 * in `WEEK`, and this has to know about them without being edited.
 */
export function favourTicketIds(): readonly string[] {
  // The probation week's DM-raised tickets. Conduct is a probation-week
  // teaching system - its day labels are Monday-Friday, which every employer's
  // week shares, and a second employer's favour ids (it authors none) are inert
  // in a world that does not contain them - so it reads the probation `WEEK`
  // directly rather than threading a per-employer one.
  return WEEK.flatMap((script) => (script.dms ?? []).map((dm) => dm.raises));
}

function isResolved(ticket: Readonly<ReadOnlyGraphNode>): boolean {
  return ticket.fields[FIELDS.state] === 'resolved';
}

function hasBreached(ticket: Readonly<ReadOnlyGraphNode>): boolean {
  return ticket.fields[FIELDS.breached] === true;
}

function breachedAt(ticket: Readonly<ReadOnlyGraphNode>): number | null {
  const value = ticket.fields[FIELDS.breachedAt];
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

/**
 * Earliest first, then by id: the aggrieved party is decided by the world
 * rather than by whatever order the graph happened to hand its nodes over in.
 */
function firstBy(
  tickets: readonly ReadOnlyGraphNode[],
): ReadOnlyGraphNode | null {
  return [...tickets].sort((left, right) => (
    (breachedAt(left) ?? Number.MAX_SAFE_INTEGER)
      - (breachedAt(right) ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id)
  ))[0] ?? null;
}

/**
 * Everybody who has a reason to go and look, worked out from the ticket nodes
 * and nothing else.
 *
 * Three sources, all of them already shipped, all of them things the player
 * did rather than things that happened to them - which is COPC's rule about
 * scoring people on controllable metrics, applied to the one place in this
 * game where it decides whether somebody keeps a job.
 */
export function conductTriggers(
  tickets: readonly ReadOnlyGraphNode[],
): readonly ConductTrigger[] {
  const triggers: ConductTrigger[] = [];

  // A customer whose ticket went red and who was never told a thing. It is
  // the pairing the CYA rule already teaches: the deadline is bad, and the
  // deadline missed in silence is what somebody rings about.
  const ignored = firstBy(tickets.filter(
    (ticket) => hasBreached(ticket)
      && ticket.fields[FIELDS.respondedAt] === undefined,
  ));

  if (ignored !== null) {
    triggers.push({
      id: 'customer',
      ticketId: ignored.id,
      headline: `"${ticketTitle(ignored.id)}" went red and nobody said a word `
        + 'to the person who raised it.',
    });
  }

  // A colleague who was sent to the form and is still on it. Being sent to the
  // form is legitimate - it is half the point of the beat - and being sent to
  // the form and then ignored for a week is a different thing entirely.
  const favours = new Set(favourTicketIds());
  const waiting = firstBy(tickets.filter(
    (ticket) => favours.has(ticket.id) && !isResolved(ticket),
  ));

  if (waiting !== null) {
    triggers.push({
      id: 'colleague',
      ticketId: waiting.id,
      headline: 'You sent somebody to the form and then left "'
        + `${ticketTitle(waiting.id)}" sitting on it.`,
    });
  }

  // And the lead's own, which he raised by not raising one. He does not need
  // anybody to tell him about this one.
  const his = tickets.find(
    (ticket) => ticket.id === BOSS_TRAP_TICKET && hasBreached(ticket),
  );

  if (his !== undefined) {
    triggers.push({
      id: 'lead',
      ticketId: his.id,
      headline: `The lead's own "${ticketTitle(his.id)}" went red, which he `
        + 'mentioned at the time and has not stopped mentioning.',
    });
  }

  return Object.freeze(triggers);
}

/* -- the bar --------------------------------------------------------------- */

/**
 * What one line on the file is worth to the bar, and the most a whole file is.
 *
 * Five points a line, to a ceiling of twenty-five, so one conversation a day
 * for a week is as bad as it ever gets - after that he has made his mind up
 * and there is nothing left to make it up with. The ceiling is the number it
 * is because of where it lands: the pass mark is 45, so a full file asks for
 * 70, and MetricNet's published distribution over hundreds of real service
 * desks puts 61 percent and above in the TOP QUARTILE. A thick file does not
 * mean he wants you gone. It means he now needs a top-quartile week to justify
 * the paperwork of keeping you, which is exactly what idiosyncrasy credit
 * says: the latitude is real, it is finite, and it is spent.
 */
export const CONDUCT_BAR_SHIFT_PER_LINE = 5;
export const CONDUCT_BAR_SHIFT_MAX = 25;

export interface ConductReading {
  /** Everybody who had a reason to look. Empty is the quiet week. */
  readonly triggers: readonly ConductTrigger[];
  /** How many lines were on the file when they did. */
  readonly lines: number;
  /** What the bar became, out of a hundred. */
  readonly bar: number;
}

/**
 * The whole rule, in one place: somebody looks, and what they find moves the
 * line the week has to clear.
 *
 * Two ways it comes to nothing and both are on the screen. NOBODY LOOKED: the
 * queue was dealt with, nobody was left in silence, and the file is a private
 * document that stays one. SOMEBODY LOOKED AND THERE WAS NOTHING TO READ: a
 * week that did half the job badly is still a week nobody was seen slacking
 * in, and the bar does not move for a blank page.
 *
 * And one way it lands: a thick file, read by somebody with a reason, against
 * a week that has not earned the latitude to survive being read.
 */
export function readConductFile(
  tickets: readonly ReadOnlyGraphNode[],
  file: unknown,
): ConductReading {
  const triggers = conductTriggers(tickets);
  const lines = conductFileSize(file);
  const shift = triggers.length === 0
    ? 0
    : Math.min(CONDUCT_BAR_SHIFT_MAX, lines * CONDUCT_BAR_SHIFT_PER_LINE);

  return {
    triggers,
    lines,
    bar: REVIEW_PASS_PERFORMANCE + shift,
  };
}

/**
 * The sentence the review prints beside the verdict, and the day scorecard
 * prints every evening.
 *
 * It says all four things the player is owed: whether anybody looked, why,
 * what was on the file, and what the bar became. A verdict without this is a
 * verdict the player has to take on trust, which is the one thing this layer
 * may never be.
 */
export function conductSummary(reading: Readonly<ConductReading>): string {
  const file = reading.lines === 0
    ? 'there is nothing on your file'
    : reading.lines === 1
      ? 'there is one line on your file'
      : `there are ${String(reading.lines)} lines on your file`;

  if (reading.triggers.length === 0) {
    return `Nobody has a reason to open your file, and ${file}. The week is `
      + `decided on the mark alone, against ${
        String(REVIEW_PASS_PERFORMANCE)
      }.`;
  }

  const who = reading.triggers.map((trigger) => trigger.headline).join(' ');

  return reading.bar === REVIEW_PASS_PERFORMANCE
    ? `Somebody has a reason to open your file. ${who} They will find that ${
      file
    }, so the week is decided on the mark alone, against ${
      String(REVIEW_PASS_PERFORMANCE)
    }.`
    : `Somebody has a reason to open your file. ${who} They will find that ${
      file
    }, and the week now has to reach ${String(reading.bar)} rather than ${
      String(REVIEW_PASS_PERFORMANCE)
    }.`;
}
