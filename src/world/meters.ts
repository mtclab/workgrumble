/**
 * The pressure layer, as arithmetic nobody argues with.
 *
 * Three numbers live on the player node - stress, suspicion, reputation - and
 * this module is the only place that decides how far they move. It is pure: it
 * is handed a description of the world as it stands and answers with the
 * DELTAS. Applying them is the op language's job, dispatched at a fixed
 * cadence by the day driver, so the numbers are replayed rather than
 * recomputed from a wall clock nobody recorded.
 *
 * Why a tick every five minutes rather than every minute: a meter that moves
 * on every simulated minute is 480 dispatches a day in the log, and a change
 * of one is invisible on a bar. Five minutes is the smallest interval in which
 * every rate below is a whole number of points, which is what keeps the
 * arithmetic exact all the way through - see `METER_INTERVAL_TICKS`.
 */

import { DND_WORKING_SUSPICION } from './presence';

/** Simulated minutes between meter ticks. */
export const METER_INTERVAL_TICKS = 5;

export const METER_FLOOR = 0;
export const METER_CEILING = 100;

/** Where the day starts, before the queue has had a word with anybody. */
export const STARTING_REPUTATION = 50;

/** Above this, the hands stop doing what they are told. */
export const FUMBLE_THRESHOLD = 80;

/**
 * How long it takes to find your place again after an interruption that had
 * nothing to do with the work in hand.
 *
 * Twenty-three minutes is the figure the research is built on ([chi08]), and
 * it is used literally rather than rounded to something tidier: the mechanic
 * IS the citation made visible, and a number nobody can point at is a number
 * somebody will quietly tune until the point is gone.
 */
export const REFOCUS_TICKS = 23;

/**
 * And what a phone you did NOT pick up costs, which is not nothing.
 *
 * Eleven, which is fewer than half of twenty-three and is deliberately
 * conservative - OVERSEER TUNING KNOB. The science this whole family is built
 * on is about attention residue rather than about conversations: the ringing
 * pulls the thread whether or not anybody answers, and the reason a shorter
 * window is right is that there was no conversation to have to come back from,
 * not that the interruption did not happen.
 *
 * It exists because the alternative is a game in which ignoring the phone is
 * free and therefore always correct, which would make the three answers
 * decoration. Answering still costs more than ignoring - that is the honest
 * ordering, and it is why the ring-out leaves a RECORD as well: the minutes
 * are cheaper and the evidence is worse.
 */
export const RING_OUT_REFOCUS_TICKS = 11;

/**
 * What the debuff is worth: the fumble threshold, lowered, for that window.
 *
 * Deliberately conservative - OVERSEER TUNING KNOB. Ten points means the
 * debuff is felt by a player who was already having a bad morning (71 to 80
 * stress) and is invisible to one who was not, which is the honest shape of
 * "you are worse at this for a bit" and not a punishment for being
 * interrupted. It moves nothing in the shipped week until content authors an
 * interruption against these rails.
 */
export const REFOCUS_FUMBLE_DROP = 10;

/**
 * Whether the player is still looking for their place, given what the graph
 * holds in `refocus_until` and what minute it is.
 *
 * Absent, or anything that is not a minute, is "no" - which is what every
 * player who has never been interrupted carries, and what the field looks like
 * on a save written before this existed.
 */
export function isRefocusing(refocusUntil: unknown, now: number): boolean {
  return typeof refocusUntil === 'number'
    && Number.isSafeInteger(refocusUntil)
    && Number.isSafeInteger(now)
    && now < refocusUntil;
}

/**
 * The stress the hands start going at, given whether the last interruption is
 * still being recovered from.
 *
 * One function rather than two constants read in two places: the desk, the
 * terminal and the can all have to agree about where the line is, and a
 * threshold each surface derives for itself is a threshold that drifts.
 */
export function fumbleThreshold(refocusing = false): number {
  return refocusing
    ? Math.max(METER_FLOOR, FUMBLE_THRESHOLD - REFOCUS_FUMBLE_DROP)
    : FUMBLE_THRESHOLD;
}

export function isFumbling(stress: number, refocusing = false): boolean {
  return stress > fumbleThreshold(refocusing);
}

/* -- the rates ------------------------------------------------------------ */

/**
 * Tickets you can hold in your head at once. Up to here the queue is a job;
 * past here it is a queue, and each extra one costs a point every interval.
 */
export const COMFORTABLE_QUEUE = 2;
export const STRESS_PER_EXCESS_TICKET = 1;

/** A missed deadline arrives all at once, because that is how it feels. */
export const STRESS_PER_BREACH = 10;

/** Half an hour where nobody is looking for you. */
export const STRESS_LUNCH_RELIEF = 2;

/**
 * What one slack window is worth per interval while it is genuinely on screen.
 *
 * Per app, because the apps are not the same: a puzzle you can look away from
 * is not the same medicine as one that eats the whole screen, and the thing
 * that calms you down fastest is the thing that gets you caught fastest. The
 * default is what an app nobody has rated is worth.
 */
export interface SlackRate {
  readonly stressRelief: number;
  readonly suspicion: number;
}

export const DEFAULT_SLACK_RATE: SlackRate = { stressRelief: 2, suspicion: 3 };

export const SLACK_RATES: Readonly<Record<string, SlackRate>> = {
  // A puzzle you can look away from. Small window, small relief, and the one
  // thing on this list you can plausibly claim was a morale exercise.
  bubbles: { stressRelief: 2, suspicion: 3 },
  // A forum thread and a page of cat pictures. It is the better medicine and
  // it is the worse hiding place: text fills the window, it is legible from
  // the doorway, and nobody has ever mistaken it for work.
  browser: { stressRelief: 3, suspicion: 5 },
};

export function slackRate(appId: string): SlackRate {
  return SLACK_RATES[appId] ?? DEFAULT_SLACK_RATE;
}

/** Suspicion bleeds away while the screen has nothing to hide on it. */
export const SUSPICION_CLEAN_DRAIN = 1;

/**
 * And the drip the dot costs, which is the same arithmetic wearing a different
 * hat.
 *
 * A slack window charges because a man walking past would SEE it. This charges
 * because two records disagree: the status says do not disturb and the touch
 * log says the queue is being worked, and the lead can read both without
 * leaving his office. The rate and the window are `world/presence.ts`'s - one
 * balance table for the whole triangle - and what this module owns is the
 * consequence, which is that a dripping interval is a dirty one and the clean
 * drain does not run in it.
 */

/** What a missed deadline costs, and what closing something is worth. */
export const REPUTATION_PER_BREACH = 3;

/* -- the decision --------------------------------------------------------- */

/**
 * Everything the meters are allowed to know. All of it is readable from the
 * graph and the shell's own window list, which is what keeps this pure and the
 * driver dumb.
 */
export interface MeterInputs {
  /** Tickets that are neither closed nor parked - the live pile. */
  readonly openTickets: number;
  /** Tickets that have EVER breached, total, however they ended. */
  readonly breachedTickets: number;
  /** How many of those the meters have already been billed for. */
  readonly breachesCharged: number;
  /** Reputation earned by everything resolved so far, in total. */
  readonly resolveCredit: number;
  /** How much of that has already been paid out. */
  readonly resolveCreditPaid: number;
  /** Slack apps with a window open and not minimised, by app id. */
  readonly openSlackApps: readonly string[];
  /**
   * The one the player is actually IN, when it is one of those.
   *
   * Suspicion is about what a man walking past would see, so every visible
   * window charges for itself. Relief is about what the player is doing, and
   * nobody is being soothed by a browser behind the ticket queue they are
   * typing into: a second window used to double the medicine while the work
   * carried on in front of it, which made the safest thing to do with the boss
   * key the opposite of what it is for.
   */
  readonly focusedSlackApp: string | null;
  /** Whether the half hour nobody is watching is on. */
  readonly lunch: boolean;
  /**
   * Minutes since the last watermark that were do-not-disturb AND working AND
   * not lunch - counted one minute at a time, not sampled at this instant.
   *
   * It arrives as a COUNT rather than as a status plus a flag, and that is the
   * whole of the fix this input exists for. Reading the dot and the touch log
   * at the boundary made the drip a rule about two instants a day: a player
   * who raised the dot just after each meter tick and dropped it just before
   * the next one was never once observed holding it, dodged every call in
   * between, and paid nothing. What is billed now is the integral, so a dot
   * flipped for one minute costs one minute and the phase of the flipping is
   * worth nothing at all.
   */
  readonly dndWorkingMinutes: number;
  /** Minutes already banked in this evidence window, before these ones. */
  readonly dndWorkingTicks: number;
  /** Suspicion already billed against that bank. */
  readonly dndSuspicionCharged: number;
}

/**
 * How far each meter moves this interval, split into what pushed it up and
 * what pulled it down.
 *
 * Two non-negative numbers rather than one signed one, because that is what
 * the world can check: an action guard can insist a parameter is a whole
 * number at or above zero, and the pair reads back out of the dispatch log as
 * "the queue did this to you, the pint did that".
 */
export interface MeterDeltas {
  readonly stressUp: number;
  readonly stressDown: number;
  readonly suspicionUp: number;
  readonly suspicionDown: number;
  readonly reputationUp: number;
  readonly reputationDown: number;
  /** The new watermarks, so the next interval does not charge twice. */
  readonly breachesCharged: number;
  readonly resolveCreditPaid: number;
  /** Whether this interval is one the scorecard counts as suspicious. */
  readonly suspicionEvent: boolean;
  /**
   * Minutes of do-not-disturb-while-working this settle is adding to the
   * record: however many of them there actually were.
   *
   * It is the EVIDENCE half of the drip and it is separate from the meter on
   * purpose. Suspicion drains, and a beat armed off a meter alone could be
   * armed by a morning on the forum; the minutes do not drain inside their
   * window, and they are what makes "on Do Not Disturb all morning" a sentence
   * somebody can point at a number for.
   */
  readonly dndWorkingTicks: number;
  /**
   * And what has now been billed against the bank those minutes are in.
   *
   * The same watermark shape as the breaches, for the same reason: the rate is
   * two points per five minutes, so a minute is worth two fifths of a point
   * and only the accumulated total can be charged in whole ones. The
   * difference between what the total is worth and what has already been paid
   * is what this interval owes, which makes the arithmetic exact however the
   * minutes are chopped up.
   */
  readonly dndSuspicionCharged: number;
}

function nonNegative(value: number, what: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${what} must be a non-negative safe integer.`);
  }

  return value;
}

/**
 * The whole pressure layer in one function.
 *
 * Breaches and resolutions are one-off events read against a watermark: the
 * world says how many there have EVER been and how many have already been
 * charged, and the difference is what this interval owes. That is what makes
 * the tick idempotent in the only way that matters - a day replayed from the
 * log arrives at the same meters, and a tick that runs twice on the same
 * minute cannot bill the same breach twice.
 */
export function meterDeltas(inputs: Readonly<MeterInputs>): MeterDeltas {
  const openTickets = nonNegative(inputs.openTickets, 'The open ticket count');
  const breached = nonNegative(inputs.breachedTickets, 'The breach count');
  const charged = nonNegative(inputs.breachesCharged, 'The charged breaches');
  const credit = nonNegative(inputs.resolveCredit, 'The resolution credit');
  const paid = nonNegative(inputs.resolveCreditPaid, 'The credit already paid');

  const newBreaches = Math.max(0, breached - charged);
  const newCredit = Math.max(0, credit - paid);
  const excess = Math.max(0, openTickets - COMFORTABLE_QUEUE);

  const rates = inputs.openSlackApps.map(slackRate);
  const relief = inputs.focusedSlackApp === null
    ? 0
    : slackRate(inputs.focusedSlackApp).stressRelief;
  // Lunch is the safe window: the drain doubles, and nobody is walking past
  // to notice what is on the screen. That is the tutorial, and it is why the
  // suspicion below is charged outside lunch only.
  const slackRelief = inputs.lunch ? relief * 2 : relief;
  // The dot's drip, integrated rather than sampled. The minutes arrive already
  // counted - lunch minutes and minutes nobody was working are not in them,
  // because a status nobody is reading costs nothing to be wrong about and a
  // dot held over a desk nobody is at is telling the truth - and what this
  // decides is what the accumulated bank is worth and how much of that has
  // already been paid.
  const banked = nonNegative(inputs.dndWorkingTicks, 'The banked dot minutes');
  const dripping = nonNegative(
    inputs.dndWorkingMinutes,
    'The minutes of the dot',
  );
  const dndCharged = nonNegative(
    inputs.dndSuspicionCharged,
    'The drip already billed',
  );
  const owed = Math.max(
    0,
    Math.floor(
      ((banked + dripping) * DND_WORKING_SUSPICION) / METER_INTERVAL_TICKS,
    ) - dndCharged,
  );
  const suspicionUp = (inputs.lunch
    ? 0
    : rates.reduce((total, rate) => total + rate.suspicion, 0))
    + owed;

  return {
    stressUp: excess * STRESS_PER_EXCESS_TICKET + newBreaches * STRESS_PER_BREACH,
    stressDown: slackRelief + (inputs.lunch ? STRESS_LUNCH_RELIEF : 0),
    suspicionUp,
    // The clean drain does not run in a window the dot was lying in, whether
    // or not the fractional arithmetic happened to bill a whole point in it -
    // otherwise a minute of do not disturb would be worth nothing twice over,
    // costing nought and earning a point back.
    suspicionDown: suspicionUp === 0 && dripping === 0
      ? SUSPICION_CLEAN_DRAIN
      : 0,
    reputationUp: newCredit,
    reputationDown: newBreaches * REPUTATION_PER_BREACH,
    breachesCharged: breached,
    resolveCreditPaid: credit,
    suspicionEvent: suspicionUp > 0,
    dndWorkingTicks: dripping,
    dndSuspicionCharged: dndCharged + owed,
  };
}

/* -- what the deltas do to the numbers ------------------------------------ */

/** The meters as they stand, watermarks and all. */
export interface MeterState {
  readonly stress: number;
  readonly suspicion: number;
  readonly reputation: number;
  readonly suspicionEvents: number;
  readonly breachesCharged: number;
  readonly resolveCreditPaid: number;
  /** Minutes the dot said busy while the log said working, this window. */
  readonly dndWorkingTicks: number;
  /** And the suspicion already billed against them. */
  readonly dndSuspicionCharged: number;
}

export function clampMeter(value: number): number {
  return Math.min(METER_CEILING, Math.max(METER_FLOOR, value));
}

/**
 * Where the meters land once the deltas are applied.
 *
 * It is deliberately the same shape as the action: add first and clamp, then
 * subtract and clamp again. Doing it in one step instead would let a hit of 30
 * against a meter at 95 come back down through the ceiling and land at 65 -
 * the ceiling would be a place a value passed through rather than a place it
 * stopped. The actions test drives this projection and the engine side by side
 * for exactly that reason.
 */
export function applyDeltas(
  state: Readonly<MeterState>,
  deltas: Readonly<MeterDeltas>,
): MeterState {
  const move = (value: number, up: number, down: number): number => (
    clampMeter(clampMeter(value + up) - down)
  );

  return {
    stress: move(state.stress, deltas.stressUp, deltas.stressDown),
    suspicion: move(state.suspicion, deltas.suspicionUp, deltas.suspicionDown),
    reputation: move(state.reputation, deltas.reputationUp, deltas.reputationDown),
    suspicionEvents: state.suspicionEvents + (deltas.suspicionEvent ? 1 : 0),
    breachesCharged: deltas.breachesCharged,
    resolveCreditPaid: deltas.resolveCreditPaid,
    dndWorkingTicks: state.dndWorkingTicks + deltas.dndWorkingTicks,
    dndSuspicionCharged: deltas.dndSuspicionCharged,
  };
}

/**
 * Whether this interval would change anything at all.
 *
 * The watermarks are part of the answer, not a detail: a breach that lands
 * while stress is already pinned at 100 moves no meter, and skipping the
 * dispatch would leave it uncharged and let it be billed all over again the
 * next time the meters had room.
 */
export function movesAnything(
  state: Readonly<MeterState>,
  deltas: Readonly<MeterDeltas>,
): boolean {
  const next = applyDeltas(state, deltas);

  return next.stress !== state.stress
    || next.suspicion !== state.suspicion
    || next.reputation !== state.reputation
    || next.suspicionEvents !== state.suspicionEvents
    || next.breachesCharged !== state.breachesCharged
    || next.resolveCreditPaid !== state.resolveCreditPaid
    // The evidence has to be in here as well as the meters. Suspicion pinned
    // at the ceiling moves no number at all, and an interval skipped for that
    // reason would be half an hour of the dot that the record never heard
    // about - which is exactly the half hour the beat is armed off.
    || next.dndWorkingTicks !== state.dndWorkingTicks
    || next.dndSuspicionCharged !== state.dndSuspicionCharged;
}

/** The ticks in a day a meter tick falls on. */
export function isMeterTick(tick: number): boolean {
  return Number.isSafeInteger(tick)
    && tick >= 0
    && tick % METER_INTERVAL_TICKS === 0;
}
