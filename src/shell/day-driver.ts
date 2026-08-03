/**
 * The day driver: the one place real time turns into simulation time.
 *
 * The clock in the engine counts whole ticks and nothing else - no speed, no
 * pause, no wall clock - because that is what makes a day replayable. Speed
 * and pause live here instead, on this side of the boundary, where they are a
 * property of how fast the player wants to watch rather than of the world.
 *
 * It also owns the shape of the day around those ticks: starting the shift,
 * dropping the scheduled arrivals in as their minute comes round, ending the
 * day at 17:00, and taking the checkpoint that lets the dispatch log start
 * again each morning.
 */

import type {
  DispatchResult,
  EngineApi,
  NodeId,
  ReadOnlyGraphNode,
} from '../engine-api';
import {
  DAY_ACTIONS,
  HELPDESK_ACTIONS,
  WORLD_ACTIONS,
} from '../world/actions';
import {
  type BossPing,
  type BossVisit,
  buildPatrolSchedule,
  CAUGHT_MINUTES,
  caughtBy,
  EMPTIES_SUSPICION_BUMP,
  emptiesNoticed,
  type PatrolPhase,
  type PatrolSchedule,
  patrolPhase,
  PING_STRESS,
  pingsBetween,
  TELEGRAPH_TICKS,
  ticksToArrival,
  visitsArrivingBetween,
  visitsTelegraphingBetween,
} from '../world/boss';
import {
  type AfterHoursArrival,
  AFTER_HOURS_REPUTATION,
  AFTER_HOURS_STRESS,
  afterHoursArrivals,
} from '../world/after-hours';
import {
  crashStartsAt,
  crashStress,
  DRINK_PRICE_PENCE,
  type DrinkState,
  drinkState,
  nextTolerance,
  NO_RUN,
} from '../world/consumables';
import {
  arrivalsBetween,
  buildDaySchedule,
  clockRuns,
  tickAtMinute,
  type DaySchedule,
  type DayState,
  dayForTick,
  dayLedger,
  dayOpensTick,
  daySlip,
  dueTransition,
  type PaySlip,
  isDayState,
  isLunchtime,
  shiftStartTick,
  type TickWindow,
} from '../world/day';
import {
  type ConductReading,
  conductLine,
  conductSummary,
  readConductFile,
} from '../world/conduct';
import { socialEngineeringDue, staleLogonsDue } from '../world/fallout';
import { findIncident } from '../world/incidents';
import {
  arrivalStress,
  buildInterruptionSchedule,
  declineWithdrawn,
  dodgesUnderDnd,
  INTERRUPTION_SOURCES,
  type InterruptionSource,
  type InterruptionEntry,
  type InterruptionLedger,
  type InterruptionPlan,
  type InterruptionSchedule,
  isBenign,
  placeInterruptions,
} from '../world/interruptions';
import { matrixSummary, poolStanding } from '../world/pool';
import {
  AWAY_NOTICED_REPUTATION,
  DND_WORKING_TICKS,
  type DndBeatReading,
  dndBeat,
  dndEvidence,
  type Presence,
  presenceCode,
  readPresence,
} from '../world/presence';
import {
  beatAt,
  type PressureBeat,
  type PressureReading,
  PROBATION_WEEK,
  pressureSummary,
  seasonAt,
  telegraph,
} from '../world/pressure';
import {
  caughtScene,
  DND_CAUGHT_SCENE,
  GENERIC_CAUGHT_SCENE,
  PRESENCE_CAUGHT_KEY,
} from '../world/scenes';
import {
  afterHoursOn,
  dayPlan,
  directMessagesOn,
  incidentsOn,
  interruptionPlanFor,
  isReviewDay,
  isReviewOutcome,
  isWeekDay,
  noHelloOn,
  patrolSeedFor,
  type ReviewOutcome,
  REVIEW_PASS_PERFORMANCE,
  reviewOutcomeFor,
  reviewTick,
  type WeekScorecard,
  weekScorecard,
  walkUpsOn,
  weekStanding,
  weekWorkThrough,
} from '../world/week';
import {
  stillTyping,
  typingLine,
  typingMinutesLeft,
} from '../world/no-hello';
import { FIELDS } from '../world/fields';
import { seedForAttempt } from '../world/session';
import {
  isMeterTick,
  meterDeltas,
  type MeterState,
  movesAnything,
} from '../world/meters';
import { isActiveWork, isUnresolved, needsResponse } from '../world/sla';
import {
  bounceLandsAt,
  cascadeComment,
  cascadesDue,
  countsAsWork,
  findWorldTicket,
  followUpTo,
  HANDOFF_BOUNCE,
  resolveCredit,
  spawnWorldTicket,
  ticketNodes,
  ticketTitle,
  triedFromTouches,
  withTouch,
} from '../world/tickets';

/** Real milliseconds one simulated minute takes at normal speed. */
export const TICK_INTERVAL_MS = 1_000;

/** How often the driver is asked to convert. Shorter than a tick so a faster
 * clock is a faster clock rather than a burst once a second. */
export const DRIVER_INTERVAL_MS = 250;

/**
 * What the three verbs answer when nothing is on the screen to answer about.
 *
 * A refusal rather than a throw, because the buttons that reach them live in a
 * window that can outlive the call it was opened for: a player still looking at
 * a conversation that ended a minute ago is a normal thing to be, and it is not
 * a reason to take the tab down.
 */
export const NOTHING_RINGING = 'Nothing is interrupting you. Whatever this '
  + 'was about, it has stopped being about it.';

/**
 * What the world says to anything the player tries to DO while a block owns
 * the screen.
 *
 * It is a refusal from the driver rather than a disabled button, and that is
 * the whole point of it. Making the desk unreachable with pointer-events was
 * making it unreachable with a MOUSE: a terminal that still had the keyboard
 * when the meeting started would take a command and Enter would still submit
 * it, so the half hour nobody can work through was a half hour anybody could
 * work through as long as they did not click anything. A rule that only holds
 * for one input device is a rule the product does not have.
 */
export const IN_A_MEETING_REASON = 'You are in a meeting. Not at the desk, '
  + 'not near the desk, and not in a position to do anything about any of it '
  + 'until the room empties - which is the entire cost of the half hour and '
  + 'is why everybody dreads it.';

/**
 * And what it says while the workstation is having its own morning.
 *
 * The same seam and the same rule - one sentence for everything the desk can
 * be asked to do while something else owns it - because the alternative is a
 * mechanic that holds for the mouse and not for the keyboard. The desk is
 * gone; the Start menu, the clock and the pause button are not, which is
 * 0.3.0's rule about a meeting taking the desk rather than the machine.
 */
export const INSTALLING_UPDATES_REASON = 'The workstation is installing '
  + 'updates. It said so. It is not sorry.';

/**
 * The sources that take the DESK rather than merely the attention, and the
 * sentence each of them refuses in.
 *
 * One table rather than a switch, because three different places have to agree
 * about it: the driver, which refuses every verb aimed at the desk; the shell,
 * which must not put a queued window up in front of a takeover; and the
 * harnesses, which wait a block out the way a person does. A meeting is a room
 * you are not at your desk during and a workstation is a desk that is not
 * there, so they refuse in different words - and a ringing phone is
 * deliberately in neither, because being on the phone has never been a defence
 * for anything.
 */
export const DESK_HELD_REASONS: Readonly<
  Partial<Record<InterruptionSource, string>>
> = {
  meeting: IN_A_MEETING_REASON,
  machine: INSTALLING_UPDATES_REASON,
};

/** What the desk answers with while this source holds it, or null. */
export function deskHeldReason(
  source: InterruptionSource | undefined,
): string | null {
  return source === undefined ? null : DESK_HELD_REASONS[source] ?? null;
}

/** Whether this source takes the desk at all. */
export function holdsTheDesk(source: InterruptionSource | undefined): boolean {
  return deskHeldReason(source) !== null;
}

/**
 * Which window an interruption is drawn in.
 *
 * Three sources, three surfaces, and they are genuinely different things: a
 * person on a phone, a room with people in it, and a machine that has decided.
 * It is a function rather than a conditional at each call site because the two
 * call sites are "open it" and "close it", and a window opened by one rule and
 * closed by another is a window left standing on the desk after the thing it
 * was about has finished - which is precisely the failure this exists to make
 * impossible.
 *
 * Every one of them is a screen the DAY opens and the DAY closes. None of them
 * is desk furniture: they have no desktop icon, they are not in the window
 * list a minute after the thing they were about ended, and the player never
 * asks for one.
 */
export function windowFor(source: InterruptionSource): string {
  switch (source) {
    case 'meeting':
      return 'meeting';
    case 'machine':
      return 'reboot';
    default:
      return 'call';
  }
}

/** The windows the day puts up for an interruption, and takes away again. */
export const TAKEOVER_WINDOWS: readonly string[] = Object.freeze([
  ...new Set(INTERRUPTION_SOURCES.map((source) => windowFor(source))),
]);

export const SPEEDS = [1, 2, 4] as const;

export type Speed = (typeof SPEEDS)[number];

export function isSpeed(value: unknown): value is Speed {
  return SPEEDS.some((speed) => speed === value);
}

/**
 * The speed the day drops to when something synchronous lands on it.
 *
 * x1 rather than a pause, because the thing that landed is a thing that is
 * HAPPENING: a phone rings for the minutes its row says whether or not
 * anybody is watching, a meeting is half an hour of the shift, and every
 * clock in this game runs through both. Stopping the world would be a
 * different mechanic and a kinder one than the game is about.
 */
export const EVENT_SPEED: Speed = 1;

/**
 * Whether an interruption of this source drops the clock when it ARRIVES.
 *
 * At x4 a six-minute ring window is a second and a half of real time, which is
 * not long enough for three buttons to be a choice - so the family of things
 * that are a CHOICE, or that simply take the screen, hand the player back
 * seconds they can use.
 *
 * Derived from the two families the shell already names rather than from a
 * second list of sources, because a second list is a list that can disagree:
 * `holdsTheDesk` is the meeting and the workstation, and `windowFor` is which
 * screen everything else is drawn on. Every source in this world is one or the
 * other, which is the correct answer rather than a coincidence - a source
 * nobody has to decide about is a source that does not interrupt anybody.
 *
 * What is NOT in it is the grace between a spent postpone and the arrival it
 * bought: those minutes are the player's desk time, paid for deliberately, and
 * they keep whatever speed the player chose. Nothing arrives during them, so
 * the exemption is a property of firing on the arrival EDGE rather than a case
 * this function has to carry - and the test that pins it is the proof.
 */
export function slowsTheClock(
  source: InterruptionSource | undefined,
): boolean {
  return source !== undefined
    && (holdsTheDesk(source) || windowFor(source) === 'call');
}

export interface ElapsedTicks {
  readonly ticks: number;
  /** Real time that did not add up to a whole tick yet. */
  readonly carriedMs: number;
}

/**
 * How many whole ticks a stretch of real time buys, and what is left over.
 *
 * The remainder is kept rather than dropped: throwing away 750ms four times a
 * second is a clock that runs slow, and at x4 it is a clock that runs at x3.
 */
export function ticksFromElapsed(
  elapsedMs: number,
  speed: number,
  carriedMs: number,
): ElapsedTicks {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new TypeError('Elapsed real time must be a non-negative number.');
  }

  if (!isSpeed(speed)) {
    throw new TypeError('The clock runs at x1, x2 or x4.');
  }

  if (!Number.isFinite(carriedMs) || carriedMs < 0) {
    throw new TypeError('Carried real time must be a non-negative number.');
  }

  const total = carriedMs + elapsedMs * speed;

  return {
    ticks: Math.floor(total / TICK_INTERVAL_MS),
    carriedMs: total % TICK_INTERVAL_MS,
  };
}

/** Where the lead is, as the taskbar needs to know it. */
export interface BossView {
  readonly phase: PatrolPhase;
  /** Minutes left to do something about it, while there are any. */
  readonly ticksToArrival: number | null;
}

/**
 * What is currently taking the screen off the player, as the two windows need
 * to know it.
 *
 * Every field is derived - from the day's seeded schedule and from the three
 * lists the world keeps of what was decided - and nothing about it is
 * remembered here. That is the whole reason a save taken mid-call restores
 * mid-call and a save taken mid-meeting restores mid-meeting: occupancy is
 * `f(schedule, world, tick)`, so there is nothing to save and nothing to get
 * out of step.
 */
export interface InterruptionView {
  readonly entry: InterruptionEntry;
  /** Minutes since it started, which is what a meeting is read by. */
  readonly minutesIn: number;
  /** Whether this is a later arrival, which is nobody's to decline. */
  readonly callback: boolean;
  /**
   * How many pushes are left in it, which is what an arrival has to be able to
   * say out loud: three, then two, then one, then nothing.
   *
   * Derived from the entry's authored budget and the ledger the world keeps,
   * so it is the same number on both sides of a save and there is nothing here
   * for a driver to get out of step with.
   */
  readonly postponesLeft: number;
  /** Whether the player has picked it up and the conversation is running. */
  readonly answered: boolean;
  /**
   * Whether it is about the work in hand RIGHT NOW - which is the cost model,
   * and which is a live question rather than a property of the row.
   */
  readonly benign: boolean;
  /** The ticket the touch log says the player is on, or nothing. */
  readonly ticketInHand: string | null;
}

/**
 * Somebody mid-greeting: they have said hello, they have not said what they
 * want, and the dots are going.
 *
 * Every field is derived from the week's table and the clock, so there is
 * nothing here to save and nothing to get out of step across a load. It is
 * about ONE person, because a window shows one conversation and a view of
 * "everybody currently typing" would be a list the chat panel had to search.
 */
export interface TypingView {
  readonly speaker: NodeId;
  /** The minute the greeting landed. */
  readonly landedAt: number;
  /** How long they take altogether, which is the week's number. */
  readonly typingMinutes: number;
  readonly minutesWaited: number;
  /** And how many are left, which is what the window says out loud. */
  readonly minutesLeft: number;
  /** What the indicator reads this minute, blank frames included. */
  readonly line: string;
}

/**
 * A workstation that has been pushed back, before it comes round again.
 *
 * It exists for exactly one surface and is deliberately narrow: the minutes
 * between the push and the return are the minutes the player BOUGHT, something
 * has to say how many are left, and it cannot be `interruption()` - that
 * answers what owns the screen NOW, and the whole point of a spent postpone is
 * that nothing does.
 *
 * There is no flag here for "has this been pushed", because an entry nobody
 * has pushed is not one of these at all: `pendingRestart` filters before it
 * selects, so an unmet call standing between now and the reboot cannot become
 * the answer and then be thrown away by a caller.
 *
 * Every field is derived from the day's schedule and the world's own ledger,
 * so it is the same answer on both sides of a save and there is nothing here
 * for a driver to get out of step with.
 */
export interface UpcomingInterruption {
  readonly entry: InterruptionEntry;
  /** Minutes until it takes the screen. Always one or more. */
  readonly ticksAway: number;
  /** How many pushes are left in it, which is what the countdown says. */
  readonly postponesLeft: number;
}

/**
 * One phone that did not ring, as the world recorded it.
 *
 * The entry is the AUTHORED row - the caller, the subject, the ticket it was
 * about - and the tick is the minute the dot sent it away, which is the only
 * thing that was not already content. `gaveUp` is the far end of the same
 * record: an entry that ran out of day and went into the missed list without
 * ever ringing, which is the one case where a slide is the last thing that
 * happened to somebody's problem.
 */
export interface DodgedInterruption {
  readonly entry: InterruptionEntry;
  /** The minute the dot turned it away. */
  readonly tick: number;
  /** Whether it never came back at all. */
  readonly gaveUp: boolean;
}

/**
 * What the apps and the taskbar may ask of the day. Reading is free; the
 * things that MOVE it - starting the shift, clocking off, opening a can,
 * clearing the desk - all go through the engine's action registry like every
 * other change to the world.
 */
export interface DayApi {
  day(): number;
  state(): DayState;
  schedule(): DaySchedule;
  paused(): boolean;
  speed(): Speed;
  setPaused(paused: boolean): void;
  setSpeed(speed: Speed): void;
  startShift(): void;
  clockOff(): void;
  /** Where the lead is this minute. Reading it is free and changes nothing. */
  boss(): BossView;
  /**
   * What is taking the screen off you this minute, or nothing at all.
   *
   * Free to read and changes nothing, like `boss()` above and for the same
   * reason: it is a function of the day's schedule and of what the world
   * already holds, so every surface that asks gets the same answer and none of
   * them can be showing a call the world has finished with.
   */
  interruption(): InterruptionView | null;
  /**
   * And the workstation that is coming back, if one has been pushed.
   *
   * Free to read and changes nothing, like everything else on this half of the
   * interface. The countdown that runs while a reboot is pushed back is the
   * only caller: the desk is the player's for those minutes and something has
   * to be counting them.
   */
  pendingRestart(): UpcomingInterruption | null;
  /**
   * The dot the office can see, which is `available` until somebody says
   * otherwise.
   *
   * Free to read and changes nothing, like everything else on this half of the
   * interface: it is a field on the player node, so the tray, the taskbar and
   * the lead all read the same one and none of them can be showing a status
   * the world has stopped holding.
   */
  presence(): Presence;
  /**
   * And setting it, which the world may refuse - outside a shift there is
   * nobody at a desk to show a dot to, and a desk that is currently a meeting
   * room refuses in the sentence the meeting already owns.
   *
   * A refusal rather than a throw, for the same reason the three interruption
   * answers are: it is a sentence the player reads.
   */
  setPresence(to: Presence): DispatchResult;
  /**
   * What the lead would have to go on if he asked about the status this
   * minute: the dot, the meter, and the minutes of do-not-disturb-while-working
   * the world has actually written down.
   *
   * Free to read and changes nothing. The scene it arms is the caught-scene
   * class's; what is here is the PREDICATE and the evidence under it, because
   * a telling-off nobody can trace to a number is a random scold and this game
   * does not have those.
   */
  dndBeat(): DndBeatReading;
  /**
   * Every phone that did not ring today, oldest first.
   *
   * Free to read and changes nothing: it is the world's own ledger
   * (`interruption_dodged`, one `id@tick` line per slide) joined back to the
   * schedule those ids came out of, so a surface can name the caller and the
   * subject without learning anything the world has not already written down.
   *
   * It exists because a filter with no surface is a mechanic the player pays
   * suspicion for and never sees work - and because the honest record of a
   * call nobody took is a thing that ought to be readable at five o'clock,
   * exactly as the missed list is.
   */
  dodgedInterruptions(): readonly DodgedInterruption[];
  /**
   * The pings that landed after you clocked off last night, to be read on this
   * morning's brief - each with whether it has already been answered.
   *
   * Free to read and changes nothing: it is the authored night joined to the
   * dot the save carries and the answered record the world keeps, so the surface
   * that draws it, a test and a reload all get the same list. Empty off the
   * morning brief, empty on a morning with no night behind it (the first day),
   * and short a ping wherever an overnight Do Not Disturb turned a declinable one
   * away - which is the dot reaching across the night, not a fourth cost.
   */
  afterHoursPings(): readonly AfterHoursArrival[];
  /**
   * Answering one, from that surface. Answers rather than throws, like every
   * other verb on this half: a second answer is refused in a sentence the player
   * reads, and the world enforces the "once" off its own record.
   */
  answerAfterHours(id: string): DispatchResult;
  /**
   * Whether this person is mid-greeting: they have said hello, they have not
   * said what they want, and the dots are going.
   *
   * Free to read and changes nothing. It is arithmetic on the week's table and
   * the clock rather than a flag anybody sets, so the chat window painting it
   * and a save reloading into the middle of it are the same question with the
   * same answer.
   */
  typing(speaker: string): TypingView | null;
  /**
   * The choice grammar, aimed at whatever is on the screen right now.
   *
   * All three answer rather than throw: a refusal is a sentence the player
   * reads - the junior who cannot skip the sync, the callback that is not
   * declinable - and the refusals are the teaching, so they have to reach a
   * surface rather than a console.
   */
  answerInterruption(): DispatchResult;
  deferInterruption(): DispatchResult;
  declineInterruption(): DispatchResult;
  /**
   * The desk. Both answer rather than throw: a refused can is a sentence the
   * player reads, not a crash, and the shell is the half that knows WHEN a can
   * is a bad idea while the engine is the half that knows whether it is legal.
   */
  drink(): DispatchResult;
  tidyDesk(): DispatchResult;
  /**
   * The bottle at the end of the week. Locked until a review says otherwise,
   * which is the engine's opinion rather than the button's - so this answers
   * with the refusal a player can read.
   */
  beer(): DispatchResult;
  /**
   * The week as the review would read it if it happened this minute: a mark
   * out of a hundred, half of it the queue closed and half of it the deadlines
   * kept, weighted toward how the week has been ending.
   */
  weekReading(): number;
  /**
   * The conduct file, and what it would be worth if somebody opened it this
   * minute. Free to read and changes nothing, which is the whole point of it
   * being on this interface: the file, the three reasons somebody might come
   * looking and the bar they would produce are readable all week, in a window,
   * before any of it decides anything.
   */
  conductReading(): ConductReading;
  /** The file itself, one line per thing that was noticed. */
  conductFile(): string;
  /**
   * The weather: which season is live, which of its four beats has landed, and
   * where the player stands in the pool if there is one to stand in.
   *
   * Free to read and changes nothing, for the same reason the conduct reading
   * is on this interface: the ranking, the line and the three scores that make
   * them are on a screen for three weeks before any of it decides anything.
   */
  pressureReading(): PressureReading;
  /** The same thing as the sentence the screens print. */
  pressureSummary(): string;
  /** How Friday at three went, as the world recorded it. */
  reviewOutcome(): ReviewOutcome;
  /** Whether the week has been clocked off for the last time. */
  weekEnded(): boolean;
  /** Five days, added up out of the tickets they were made of. */
  weekScorecard(): WeekScorecard;
  /** Fires when the day, its state, the pause or the speed changed. */
  onChanged(listener: () => void): () => void;
}

export interface DayDriverHandlers {
  /**
   * A day boundary has been crossed and the log has been checkpointed: the
   * moment a save is worth writing, and the cheapest one - the log is empty.
   */
  onDayBoundary(): void;
  /**
   * Slack apps with a window open and NOT minimised, by app id.
   *
   * The driver cannot see the screen and has no business doing so; the shell
   * can, and this is the one thing about it the pressure layer needs. A
   * minimised game is a game nobody is playing and nobody can catch you at,
   * which is why it is not in this list.
   */
  openSlackApps(): readonly string[];
  /**
   * The slack app the player is actually working in, or null when the window
   * with the keyboard in it is work - or when there is no window at all.
   *
   * The difference matters because the two meters ask different questions. The
   * lead sees every window that is up; the player is only being calmed down by
   * the one they are in.
   */
  focusedSlackApp(): string | null;
  /**
   * Whether there is a desktop session for any of this to be happening in.
   *
   * The clock does not convert real time while there is not, and that is not a
   * nicety: tick zero is 08:00 and one simulated minute costs one real second,
   * so a new player spending a minute on the login screen walked into a shift
   * that had started without them, and nine minutes anywhere near the boot
   * sequence was the whole day. Tickets breached before anybody had seen a
   * desktop, read the brief, or been given the pause button - which is on the
   * desktop, and is the one control the spec promises is always available.
   *
   * It is a QUESTION rather than a flag the shell sets, for the same reason
   * the two above it are: the driver cannot see a screen, the shell can, and a
   * mirrored copy is a copy that can be left disagreeing with the world. A
   * headless harness omits it and is at the desk by construction.
   *
   * The player's own pause is a separate thing and is deliberately untouched
   * by this, so logging off and back on lands on the pause state it left.
   */
  atDesk?(): boolean;
  /** Something the player ought to be told about. */
  onNotice?(title: string, body: string): void;
  /**
   * The clock was just dropped to x1, and by what.
   *
   * Fired ONLY on a real drop - a takeover landing while the clock is already
   * at x1 fires nothing - and never on the way back up, because there is no way
   * back up but the player's own hand. It is a telegraph rather than a notice
   * about the interruption: those exist already, and this is the separate fact
   * that the SPEED the afternoon was chosen at is gone and will not come back on
   * its own. The shell shows it self-dismissing; the cause is here so it can say
   * what came in.
   */
  onClockDropped?(cause: InterruptionSource | 'boss'): void;
  /**
   * The lead has arrived and there was something on the screen. The world has
   * already been told - suspicion, reputation and the count are moved before
   * this is called - and what is left is the scene, which is the shell's.
   */
  onCaught?(appId: string, tick: number, evidence: number | null): void;
  /**
   * He has sent one of his messages. The chat thread is the shell's memory of
   * what was said, so the driver hands over the line and the node the
   * conversation should be standing on rather than writing it itself.
   */
  onBossPing?(ping: Readonly<BossPing>): void;
  /**
   * Somebody who is not the lead has messaged you directly, asking for a
   * favour instead of raising a ticket. Same shape and the same reason: the
   * transcript is screen state, so the driver says who and the shell opens the
   * conversation on the node their tree keeps for being summoned.
   */
  onDirectMessage?(speaker: NodeId, tick: number): void;
  /**
   * Somebody has opened a chat with the word "Hi." and nothing else.
   *
   * The same shape as the message above and for the same reason - the
   * transcript is screen state - with one difference that is the whole beat:
   * there is no question in it yet. The shell opens the conversation on the
   * node their tree keeps for a bare greeting, and the option on that node is
   * the player asking what they want.
   */
  onNoHello?(speaker: NodeId, tick: number): void;
  /**
   * And the minute they finish typing it, for a player who waited.
   *
   * It fires whether or not anybody waited, because the driver has no opinion
   * about a chat transcript: the shell is the half that knows where the
   * conversation is standing, and moves it only if it is still standing on the
   * greeting. A player who asked already had the question minutes ago and must
   * not be handed it twice.
   */
  onNoHelloQuestion?(speaker: NodeId, tick: number): void;
  /**
   * Something has taken the screen off the player: a phone ringing, or the
   * half hour that was in the summons mail on Monday.
   *
   * The world has already been told whatever the ARRIVAL costs - the stress a
   * malignant one charges for being reachable at all - and what is left is the
   * surface, which is a window like every other scene here. The three answers
   * are the player's and go back through `answerInterruption` and its two
   * siblings, so nothing about the decision is decided in the shell.
   */
  onInterruption?(view: Readonly<InterruptionView>): void;
  /**
   * And the minute the screen is the player's again, however it ended: picked
   * up, waved off, pushed twenty minutes out, or simply rung out.
   *
   * The driver has already settled everything the world owes for it by the
   * time this fires - the meeting has been sat through and minuted - so all
   * this is for is the window closing behind it.
   */
  onInterruptionEnded?(entry: Readonly<InterruptionEntry>): void;
  /**
   * A phone that did not ring, because the dot said not to.
   *
   * The world has already recorded the slide - and, if there was nowhere left
   * in the day for it to slide to, that it went unanswered - so there is
   * nothing here to decide. It exists because the player has to be able to
   * find out that the dot is doing something: a filter with no surface is a
   * mechanic the player pays suspicion for and never sees work.
   */
  onInterruptionDodged?(entry: Readonly<InterruptionEntry>, tick: number): void;
  /**
   * Somebody who has been waiting for a first word noticing that the desk they
   * are waiting on says Away and is demonstrably working.
   *
   * The world has already taken the reputation and written down that this
   * person has had their one thought about it today. What is left is what they
   * SAY, which is a chat line and therefore content.
   */
  onPresenceNoticed?(reporter: NodeId, ticketId: string, tick: number): void;
  /**
   * Friday, three o'clock, decided. The world already holds the outcome - the
   * reputation was read and the verb was dispatched - and what is left is the
   * conversation, which is a window like every other scene in this game.
   */
  onReview?(outcome: ReviewOutcome, tick: number): void;
  /**
   * Five o'clock on a Friday that went well: the probation is over and there
   * is a bottle in the fridge with your name on it. Fires once, at the day
   * end, and only when the review passed.
   */
  onBeerUnlocked?(): void;
  /** The week is over. There is no Saturday, so there is a screen instead. */
  onWeekEnd?(outcome: ReviewOutcome): void;
}

/**
 * The half of the driver a save touches. Narrow on purpose: the save system
 * has no business starting shifts or moving clocks.
 */
export interface DriverSaveSeam {
  driverState(): DriverState;
  restoreDriverState(state: Readonly<DriverState>): void;
}

/** What a save carries about how the player was watching. */
export interface DriverState {
  readonly paused: boolean;
  readonly speed: Speed;
}

export function parseDriverState(value: unknown): DriverState | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { paused, speed } = value as Record<string, unknown>;

  return typeof paused === 'boolean' && isSpeed(speed)
    ? { paused, speed }
    : null;
}

export class DayDriver implements DayApi {
  private schedule_: DaySchedule;
  private patrol_: PatrolSchedule;
  private interruptions_: InterruptionSchedule;
  /** The minutes the day had already booked when the schedule was built. */
  private interruptionsBlocked_: readonly TickWindow[];
  private seed_: number;
  private paused_ = false;
  private speed_: Speed = 1;
  private carriedMs = 0;
  /**
   * Minutes of this shift that have been spent on somebody standing at the
   * desk and are not yet off the clock.
   *
   * It is never anything but nought between two calls to `step`: the drain is
   * in the same loop as the minute that created it, so nothing about a
   * conversation survives a save, a pause or a load. That is on purpose - the
   * cost is paid at the moment it is incurred, and a debt in driver state
   * would be a debt the world could not replay.
   */
  private owedMinutes_ = 0;
  private readonly listeners = new Set<() => void>();

  public constructor(
    private readonly engine: EngineApi,
    private readonly actor: NodeId,
    seed: number,
    private readonly handlers: Readonly<DayDriverHandlers>,
    /**
     * Where a day's interruptions come from.
     *
     * The shipped week, in the shipped game, and it is a parameter for the
     * same reason the seed is one: a rule about what happens when two
     * takeovers collide, or when a countdown runs out of postpones, is a rule
     * about the MACHINERY, and pinning it to whichever row the week happens to
     * carry this month would be testing the content instead. A harness hands
     * in the day it needs; nothing else ever passes this.
     */
    private readonly plans: (
      day: number,
      seed: number,
    ) => InterruptionPlan = interruptionPlanFor,
  ) {
    this.seed_ = seed;
    this.schedule_ = this.scheduleFor(this.day());
    this.patrol_ = this.patrolFor(this.day());
    const plan = this.interruptionPlan(this.day());
    this.interruptionsBlocked_ = plan.blocked;
    this.interruptions_ = this.interruptionsFor(this.day(), plan);
    this.syncSlaClock();
  }

  public day(): number {
    return dayForTick(this.engine.now());
  }

  /**
   * The day state, read from the graph every time rather than mirrored here.
   * A copy on this side is a copy that a load, a replay or a refused dispatch
   * can leave disagreeing with the world.
   */
  public state(): DayState {
    const state = this.engine.graph.getField(this.actor, FIELDS.dayState);

    if (!isDayState(state)) {
      throw new Error(
        'The player node carries no day state. The world was seeded wrong.',
      );
    }

    return state;
  }

  public schedule(): DaySchedule {
    return this.schedule_;
  }

  /**
   * Where the lead is this minute, worked out from the day's seeded schedule
   * rather than from anything the driver has been remembering - which is why
   * a save carries no boss state and a load lands him exactly where the day
   * says he is.
   */
  public boss(): BossView {
    if (this.state() !== 'shift') {
      return { phase: 'clear', ticksToArrival: null };
    }

    const now = this.engine.now();

    return {
      phase: patrolPhase(this.patrol_, now),
      ticksToArrival: ticksToArrival(this.patrol_, now),
    };
  }

  /**
   * Opening a can. The shell decides which can of the run it is - a pure
   * function of the graph and the clock - and the engine decides what that
   * does to the desk, the money and the minute the crash is measured from.
   */
  public drink(): DispatchResult {
    const held = this.takeoverRefusal();

    if (held !== null) {
      return { ok: false, reason: held };
    }

    const now = this.engine.now();

    return this.engine.dispatch(DAY_ACTIONS.consumableDrink, this.actor, null, {
      tolerance: nextTolerance(this.drinkRun(), now),
      pence: DRINK_PRICE_PENCE,
    });
  }

  public tidyDesk(): DispatchResult {
    const held = this.takeoverRefusal();

    return held !== null
      ? { ok: false, reason: held }
      : this.engine.dispatch(DAY_ACTIONS.deskTidy, this.actor, null, {});
  }

  /**
   * The dot, read off the player node every time rather than mirrored here.
   *
   * Absent is `available`, which is what everybody who has never touched the
   * tray is showing - and the reason no scripted walk in this suite writes the
   * field at all.
   */
  public presence(): Presence {
    return readPresence(this.engine.graph.getField(this.actor, FIELDS.presence));
  }

  /**
   * Setting it, through the same seam every other verb goes through.
   *
   * The takeover check is here rather than in the world for the same reason
   * `drink` and `tidyDesk` have it: the world knows there is a shift on, and
   * the DRIVER is the half that knows the desk is currently half an hour in a
   * room nobody can leave. A status changed from inside the sync would be a
   * dot set by somebody who is not at the desk it is about.
   */
  public setPresence(to: Presence): DispatchResult {
    // The books first, whatever happens next. The minutes the dot has been
    // showing are banked at the minute somebody reaches for the control, so a
    // status changed between two meter ticks costs exactly the minutes it was
    // up - and a refusal below leaves the record just as true, because what
    // was banked is what actually happened.
    this.settleDrip(this.engine.now());

    const held = this.takeoverRefusal();

    if (held !== null) {
      return { ok: false, reason: held };
    }

    return this.announced(this.engine.dispatch(
      DAY_ACTIONS.presenceSet,
      this.actor,
      null,
      { dot: presenceCode(to) },
    ));
  }

  /** What the lead has to go on about the status, this minute. */
  public dndBeat(): DndBeatReading {
    return dndBeat(
      this.presence(),
      this.playerNumber(FIELDS.suspicion),
      this.playerNumber(FIELDS.dndWorkingTicks),
    );
  }

  /**
   * The phones that did not ring, read back off the world.
   *
   * Two lists joined, both of them the world's: the `id@tick` slides and the
   * ids nobody is going to hear from again. The AUTHORED half - who was
   * ringing and what about - comes off today's schedule by id, which is the
   * same place the ringing window would have got it, so this surface knows
   * precisely what a phone call knows and nothing else.
   *
   * Ids the schedule no longer holds are dropped rather than guessed at: a
   * save carried across a content change can name a call this build does not
   * author, and a line about a caller nobody can name is worse than a shorter
   * list.
   */
  public dodgedInterruptions(): readonly DodgedInterruption[] {
    const missed = new Set(
      this.playerText(FIELDS.interruptionMissed)
        .split('\n')
        .filter((id) => id.length > 0),
    );
    const dodged: DodgedInterruption[] = [];

    for (const [id, ticks] of Object.entries(this.stampedLines(FIELDS.interruptionDodged))) {
      const entry = this.interruptions_.entries.find(
        (candidate) => candidate.id === id,
      );

      if (entry === undefined) {
        continue;
      }

      // Giving up is a property of the LAST attempt rather than of the id. The
      // missed list is one line per call that never got through, so reading it
      // against every slide made a morning of a caller trying again and again
      // render as five separate people who did not try again - contradicted by
      // the very next line of the same list.
      const last = Math.max(...ticks);

      for (const tick of ticks) {
        dodged.push({ entry, tick, gaveUp: missed.has(id) && tick === last });
      }
    }

    return dodged.sort((left, right) => left.tick - right.tick);
  }

  /**
   * The pings from last night, as this morning's brief meets them.
   *
   * A pure read: the night just gone is `day - 1`, the authored pings for it are
   * joined to the dot the player left on and the answers already given, and the
   * result is the same on both sides of a save. Nothing here is written - the
   * dodge under Do Not Disturb is a filter rather than a record, which is the
   * round-trip the tail deliberately saves, and the only thing the world holds
   * is the answer.
   */
  public afterHoursPings(): readonly AfterHoursArrival[] {
    if (this.state() !== 'morning_brief') {
      return [];
    }

    const night = this.day() - 1;

    if (!isWeekDay(night)) {
      return [];
    }

    const answered = new Set(
      this.playerText(FIELDS.afterHoursAnswered)
        .split('\n')
        .filter((id) => id.length > 0),
    );

    return afterHoursArrivals(afterHoursOn(night), this.presence(), answered);
  }

  /**
   * Answering one, through the same seam every other verb goes through.
   *
   * The two numbers are the world's constants rather than anything the surface
   * chose - the shell knows it is a ping being answered, the world knows what a
   * ping is worth and what it costs - and the world refuses a second answer off
   * its own list, so this is a dispatch and a repaint and nothing the shell has
   * to remember.
   */
  public answerAfterHours(id: string): DispatchResult {
    return this.announced(this.engine.dispatch(
      DAY_ACTIONS.afterHoursAnswer,
      this.actor,
      null,
      {
        id,
        rep_up: AFTER_HOURS_REPUTATION,
        stress_up: AFTER_HOURS_STRESS,
      },
    ));
  }

  /**
   * Everything the player does to the world, and what it meant to the queue.
   *
   * The shell dispatches through here rather than at the engine directly so
   * that the two things a touch IS - the minute somebody first did something
   * about this ticket, and the line about it on a handoff form - are written in
   * the same minute as the action itself. Both used to be reconstructed later,
   * one from a five-minute sweep and one from the dispatch log, and both were
   * wrong in the same way: the record said when it was NOTICED rather than
   * when it happened, and the log is drained every night.
   */
  public dispatch(
    id: string,
    actor: NodeId,
    target: NodeId | null,
    params: Record<string, string | number | boolean | null>,
  ): DispatchResult {
    const held = this.takeoverRefusal();

    if (held !== null) {
      return { ok: false, reason: held };
    }

    // Read BEFORE: this dispatch may resolve the ticket it is about, and a
    // fix that closes a ticket is still the first time anybody touched it.
    const witnesses = target === null ? [] : this.ticketsAbout(target);
    const result = this.engine.dispatch(id, actor, target, params);
    this.recordTouches(id, witnesses, result.ok);
    // And, if the dot says Away while that was going on, the one person who
    // can see both halves of it.
    this.settleAwayNoticed(id, result.ok);
    // A fix that closed a parent has closed forty other people's tickets as
    // well, and they should hear about it in the minute it happened rather
    // than at the top of the next one.
    this.settleParentCascade();
    // And a fix that finished one half of a chain has just raised the other
    // half. The new starter is back before the window has repainted, which is
    // both the joke and, in every shop this is drawn from, the truth.
    this.settleFollowUps();
    return result;
  }

  public paused(): boolean {
    return this.paused_;
  }

  public speed(): Speed {
    return this.speed_;
  }

  public setPaused(paused: boolean): void {
    if (this.paused_ === paused) {
      return;
    }

    this.paused_ = paused;
    // Part-converted real time belongs to the stretch it was converted in.
    // Keeping it would let a paused clock hand over a tick on resume.
    this.carriedMs = 0;
    this.announce();
  }

  public setSpeed(speed: Speed): void {
    if (this.speed_ === speed) {
      return;
    }

    this.speed_ = speed;
    this.announce();
  }

  /**
   * Something is happening, so the day is handed back at a speed a person can
   * read it at.
   *
   * ON THE ARRIVAL EDGE, once, and never continuously. The player who puts the
   * clock back up to x4 with a phone still ringing has decided something about
   * their own afternoon, and a rule that dropped it again on the next minute
   * would be a control that fights the hand on it. The same reason there is no
   * automatic restore at the far end: the day slowed down because something
   * happened, which is legible, and a clock that re-accelerates behind the
   * player is not.
   *
   * Pause is untouched in both directions. A day that was stopped when the
   * phone rang is still stopped, and it is still stopped at x1.
   *
   * And the drop says so. The only signal it used to leave was the speed button
   * moving under nobody's hand, so an afternoon chosen at x4 could be run at x1
   * for the rest of the day without the player ever registering that it had
   * been dropped - and the no-auto-restore rule made that permanent. The
   * telegraph fires exactly when the clock ACTUALLY drops (a takeover that lands
   * while the clock is already at x1 changes nothing and says nothing), naming
   * what came in, so the change is a fact the player was told rather than one
   * they have to notice.
   */
  private slowDown(cause: InterruptionSource | 'boss'): void {
    const was = this.speed_;
    this.setSpeed(EVENT_SPEED);

    if (was !== EVENT_SPEED) {
      this.handlers.onClockDropped?.(cause);
    }
  }

  /** True while the clock is actually converting real time into ticks. */
  public running(): boolean {
    return this.atDesk() && !this.paused_ && clockRuns(this.state());
  }

  /**
   * Whether anybody is at the desk. Absent handler means yes: the headless
   * harnesses ARE the player, and there is no screen for them to be away from.
   */
  public atDesk(): boolean {
    return this.handlers.atDesk?.() !== false;
  }

  /**
   * One turn of the real clock. Ticks are applied one at a time so that
   * everything a tick causes - an arrival, a breach, the end of the day -
   * happens in the minute it belongs to rather than at the end of a batch.
   *
   * A minute can cost more than a minute. Being caught takes `CAUGHT_MINUTES`
   * off the shift, and they are spent HERE, through the same machinery every
   * other minute goes through: a conversation the clock skipped over would be
   * a conversation during which no ticket arrived, no deadline ran out and no
   * meter moved, which is not what standing at somebody's desk is like.
   */
  public step(elapsedMs: number): void {
    if (!this.running()) {
      this.carriedMs = 0;
      return;
    }

    const elapsed = ticksFromElapsed(elapsedMs, this.speed_, this.carriedMs);
    this.carriedMs = elapsed.carriedMs;

    for (let tick = 0; tick < elapsed.ticks; tick += 1) {
      if (!this.spendMinute()) {
        return;
      }

      // The rounds are `PATROL_MIN_GAP` apart and a conversation is shorter
      // than that, so this cannot cascade - but a drain whose bound is an
      // invariant somewhere else is a loop nobody has bounded, and the clock
      // is not the place to find out.
      for (let spent = 0; this.owedMinutes_ > 0 && spent < CAUGHT_MINUTES;) {
        this.owedMinutes_ -= 1;
        spent += 1;

        if (!this.spendMinute()) {
          return;
        }
      }
    }
  }

  /**
   * One simulated minute, spent, with everything it causes settled inside it.
   *
   * Answers whether the clock may keep going: false when the day ended in this
   * minute (the rest of the batch belongs to a tomorrow nobody has started) or
   * when the engine refused to move at all.
   */
  private spendMinute(): boolean {
    // Before the minute is spent, not after: the engine decides whether the
    // minute it is about to step counts against every open deadline, and it
    // decides it from the state the day is in as that minute begins.
    this.syncSlaClock();
    const before = this.engine.now();
    this.engine.advance(1);
    const now = this.engine.now();

    if (now === before) {
      return false;
    }

    this.spawnArrivals(before, now);
    // Before the floor and before the queue: the world breaking is not
    // something the player did, and everything else this minute has to see
    // the world as it now is.
    this.applyIncidents(before, now);
    this.settleDirectMessages(before, now);
    this.settleNoHello(before, now);
    this.settleStaleAuth(now);
    this.settleFollowUps();
    this.walkTheFloor(before, now);
    // After the corridor, in the same minute: the lead arriving is a takeover
    // too, and the assert inside this one is entitled to see it. Before the
    // meters, because being taken off the work is a thing that happened to
    // this minute and the interval that charges for the queue has to read a
    // world the interruption has already moved.
    this.settleInterruptions(before, now);
    // After it, because a walk-up's ask is measured from the minute she walked
    // away - which is a fact about where the interruption ended up, and the
    // pass above is what settles that.
    this.settleWalkUps(before, now);
    // Before the meters read the queue: a child closed by its parent is a
    // ticket off the pile this minute, and charging stress for it would be
    // charging for work that is finished.
    this.settleParentCascade();
    // And BOTH of these before the conversation at three o'clock. The mark the
    // review reads has to be the mark the minute has finished producing: a
    // ticket closed at 14:59 is paid at 15:00, a deadline crossed at 15:00 is
    // charged at 15:00, and a review that ran first read a number that was one
    // meter tick out of date. In the one direction that is somebody fired for
    // work they had already done.
    this.applyPressure(now);
    this.settleReview(before, now);

    if (this.applyDueTransition()) {
      // The day ended inside this batch, and the minutes anybody still owed
      // for a conversation go with it: there is no shift left to take them off.
      this.owedMinutes_ = 0;
      this.carriedMs = 0;
      return false;
    }

    return true;
  }

  /**
   * Starts the shift on the player's say-so and puts the clock on nine.
   *
   * Reading the brief is not paid time. Whatever is left of the morning is
   * skipped rather than sat through, which is also what makes the journey
   * land on 09:00 exactly however long the player spent reading.
   */
  public startShift(): void {
    if (this.state() !== 'morning_brief') {
      return;
    }

    // The clock is moved to nine BEFORE the shift is started, and the two
    // lines are in that order for a reason a player would notice: whatever is
    // left of the morning is time nobody is being paid for, so it must not
    // come off anybody's SLA. Starting the shift first would sell the last
    // fifty minutes of the brief as working hours.
    const start = shiftStartTick(this.day());
    const now = this.engine.now();

    if (now < start) {
      this.syncSlaClock();
      // Same as the night, and the same reason: the brief is not paid time.
      this.engine.advanceOffHours(start - now);
      this.spawnArrivals(now, this.engine.now());
      // A window that opens at nine opens at nine, whether the player spent
      // the hour reading the brief or skipped it in four seconds.
      this.applyIncidents(now, this.engine.now());
    }

    // Yesterday's shortcut, arriving in this morning's post. It is settled at
    // the start of the shift rather than at last night's clock-off because a
    // day is how long it takes somebody else to notice, and because a
    // consequence that landed in the same evening would read as a punishment
    // for the click rather than as the cost of the omission.
    this.settleSecurityFallout();
    this.dispatchDay(DAY_ACTIONS.startShift, {});
    this.syncSlaClock();
    this.carriedMs = 0;
    this.announce();
  }

  /**
   * Ends the day: pays it, banks it, sleeps through the night, and draws the
   * line the dispatch log starts again from.
   *
   * The checkpoint goes here because this is the one moment the history behind
   * it is finished with - the day has been scored and the money is in the
   * graph - so a save from tomorrow morning carries a baseline and an empty
   * log rather than every click of a career.
   */
  public clockOff(): void {
    if (this.state() !== 'day_end') {
      return;
    }

    const day = this.day();

    if (isReviewDay(day)) {
      // A week that has already ended stays ended. The button is still on the
      // screen - the scorecard does not vanish when it is pressed - and a
      // second press must be a no-op rather than a refusal the driver throws.
      if (!this.weekEnded()) {
        this.endWeek(day);
      }

      return;
    }

    // The same slip the scorecard is showing, vending machine and all: a
    // banked total that disagreed with the screen it was read off would be a
    // lie the player could only catch by adding it up themselves.
    const banked = this.farmFund() + this.slipFor(day).net;

    // The day, folded into the week, before the world moves on to the next
    // one. It is written at the boundary rather than continuously because a
    // DAY is the unit the review weighs: an afternoon is not a day, and a
    // reading taken every five minutes would weigh the long days heaviest.
    this.recordWeekReading();
    this.dispatchDay(DAY_ACTIONS.clockOff, { banked });

    const morning = dayOpensTick(day + 1);
    const now = this.engine.now();

    if (now < morning) {
      // The night, in one call. Nobody is at the desk for any of it and the
      // service clock is held, so the only thing those nine hundred minutes do
      // is push every open deadline out by nine hundred - and living that a
      // minute at a time was most of the wait between clocking off and seeing
      // tomorrow morning.
      this.engine.advanceOffHours(morning - now);
    }

    this.schedule_ = this.scheduleFor(day + 1);
    this.patrol_ = this.patrolFor(day + 1);
    this.rebuildInterruptions(day + 1);
    this.spawnArrivals(now, this.engine.now());
    this.carriedMs = 0;
    this.engine.checkpoint();
    this.announce();
    this.handlers.onDayBoundary();
  }

  /**
   * Friday's clock-off, which is a different thing entirely.
   *
   * There is no night to sleep through and no queue to deal, because there is
   * no Saturday: the clock stays on Friday evening, the fund takes the last
   * day's pay, and what happens next is a screen rather than a morning. The
   * checkpoint is still taken - it is the cheapest save there is - and the
   * week is announced so the shell can put the scorecard up.
   */
  private endWeek(day: number): void {
    const banked = this.farmFund() + this.slipFor(day).net;

    this.recordWeekReading();
    this.dispatchDay(DAY_ACTIONS.endWeek, { banked });
    this.carriedMs = 0;
    this.engine.checkpoint();
    this.announce();
    this.handlers.onDayBoundary();
    this.handlers.onWeekEnd?.(this.reviewOutcome());
  }

  /** How the conversation on Friday went, as the world recorded it. */
  public reviewOutcome(): ReviewOutcome {
    const value = this.engine.graph.getField(this.actor, FIELDS.reviewOutcome);
    return isReviewOutcome(value) ? value : 'pending';
  }

  public weekEnded(): boolean {
    return this.engine.graph.getField(this.actor, FIELDS.weekEnded) === true;
  }

  /** The week, added up out of the days it was made of. */
  public weekScorecard(): WeekScorecard {
    const outcome = this.reviewOutcome();
    // The same rule the mark obeys, for the same reason. Before three o'clock
    // the honest answer is what the file WOULD be worth if somebody opened it
    // now; afterwards it is what it was worth when somebody did, because the
    // queue carries on all afternoon and a reason that had gone away would be
    // printed above the verdict it caused.
    const reading = this.conductReading();

    return weekScorecard(this.engine.graph.nodesOfKind('ticket'), {
      banked: this.farmFund(),
      opening: this.playerNumber(FIELDS.weekOpeningFund),
      bar: outcome === 'pending'
        ? reading.bar
        : this.playerNumber(FIELDS.reviewBar, REVIEW_PASS_PERFORMANCE),
      conduct: outcome === 'pending'
        ? conductSummary(reading)
        : this.playerText(FIELDS.reviewConduct),
      // The same rule again, for the same reason: live while there is still a
      // week to play, and the snapshot the ranking was actually read as once
      // somebody has read it. A closed ticket on a Friday afternoon moves the
      // player's own performance line, and a card that re-derived the matrix
      // would print a position that had moved since it decided anything.
      //
      // A finished week with nothing snapshotted is a week where no round was
      // ever on, and there the live sentence IS the honest one - it is the
      // same constant it was all week, because there was nothing to move.
      criteria: outcome === 'pending'
        ? this.pressureSummary()
        : this.playerText(FIELDS.reviewCriteria) || this.pressureSummary(),
      // The mark the conversation was decided on, which stopped moving when
      // the conversation happened. Reading it live let the week screen print
      // "37 of 45 needed" directly above "Probation: passed", because the week
      // carries on being worked all Friday afternoon. Before three o'clock
      // there is nothing to snapshot and the live number is the honest one -
      // it is what the review WOULD read.
      performance: outcome === 'pending'
        ? this.weekReading()
        : this.playerNumber(FIELDS.reviewReputation, this.weekReading()),
      outcome,
    });
  }

  /** The bottle in the fridge with your name on it. */
  public beer(): DispatchResult {
    const held = this.takeoverRefusal();

    return held !== null
      ? { ok: false, reason: held }
      : this.engine.dispatch(DAY_ACTIONS.consumableBeer, this.actor, null, {});
  }

  public driverState(): DriverState {
    return { paused: this.paused_, speed: this.speed_ };
  }

  /** Puts back how the player was watching, after a load. */
  public restoreDriverState(state: Readonly<DriverState>): void {
    this.paused_ = state.paused;
    this.speed_ = state.speed;
    this.resync();
  }

  /**
   * Picks the day back up from whatever the world now says it is. A load
   * replaces the clock and the day state wholesale, so the schedule this
   * driver was walking belongs to a session that is no longer running.
   */
  public resync(): void {
    // The seed first: everything below is built from it, and a load may have
    // replaced this session's week with a later attempt at the same one.
    this.seed_ = this.seedFromWorld();
    this.schedule_ = this.scheduleFor(this.day());
    this.patrol_ = this.patrolFor(this.day());
    this.rebuildInterruptions(this.day());
    // A save carries the service clock, so this is a check rather than a
    // correction - but it is the check that catches a world restored into a
    // day it does not agree with, which is the one place the two halves could
    // drift apart without anybody seeing it happen.
    this.syncSlaClock();
    this.carriedMs = 0;
    this.announce();
  }

  public onChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    let subscribed = true;

    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  /**
   * Keeps the engine's service clock in step with the day the world is in.
   *
   * The day state is the single truth - it is in the graph, it is saved, it is
   * replayed - and the engine's flag is the consequence of it. Deriving the
   * flag here rather than hanging it off the transitions is what makes a load,
   * a replay and a cold boot all agree: a session that starts at 08:00 on
   * Monday has to start with the clock stopped, and nothing transitioned to
   * get there.
   *
   * It dispatches only when the two disagree, so the log carries the moments
   * the clock started and stopped rather than one entry a minute.
   */
  private syncSlaClock(): void {
    const shouldRun = this.state() === 'shift';

    if (this.engine.slaRunning() === shouldRun) {
      return;
    }

    this.dispatchDay(
      shouldRun ? DAY_ACTIONS.slaClockRun : DAY_ACTIONS.slaClockHold,
      {},
    );
  }

  /**
   * Friday, three o'clock.
   *
   * The world decides which way it goes - both verbs are guarded on the mark
   * that earns them - so all this does is offer the one the week supports and
   * hand the answer to the shell, which is where a scene lives.
   * Reading the outcome back off the graph rather than trusting the dispatch
   * is what makes a refused review a review that did not happen.
   */
  private settleReview(after: number, now: number): void {
    const day = this.day();

    if (!isReviewDay(day) || this.state() !== 'shift') {
      return;
    }

    const due = reviewTick(day);

    if (due <= after || due > now || this.reviewOutcome() !== 'pending') {
      return;
    }

    // Friday's own day, folded in before anybody reads the file: the review
    // happens at three and the clock-off that would otherwise record it is two
    // hours away, so without this the conversation would be about a week that
    // stopped on Thursday evening.
    this.recordWeekReading();
    // And then somebody opens the file, which is a separate event with its own
    // verb: whether anybody had a reason to, what was in it, and what the bar
    // became are all written into the world in the minute before the
    // conversation, so the guards below compare against a number the world is
    // carrying and the window afterwards prints the world's own sentence.
    this.readTheFile();
    // And somebody scoring the pool, in the same minute and by the same rule:
    // written into the world BEFORE the conversation, so the guards compare
    // fields rather than arithmetic. In a quiet week it writes nothing, which
    // is what makes the two review verbs behave exactly as they did.
    const inTheCut = this.readTheMatrix();
    const outcome = reviewOutcomeFor(
      this.playerNumber(FIELDS.weekReputation),
      this.playerNumber(FIELDS.reviewBar, REVIEW_PASS_PERFORMANCE),
      inTheCut,
    );
    const result = this.engine.dispatch(
      outcome === 'passed'
        ? DAY_ACTIONS.reviewPassed
        : outcome === 'redundant'
          ? DAY_ACTIONS.reviewRedundant
          : DAY_ACTIONS.reviewFired,
      this.actor,
      null,
      {},
    );

    if (!result.ok) {
      throw new Error(`The review could not happen: ${result.reason}`);
    }

    this.announce();
    this.handlers.onReview?.(this.reviewOutcome(), due);
  }

  /**
   * The conduct file as it stands, and what it would be worth if somebody
   * opened it this minute.
   *
   * Free to call and changes nothing, which is the whole point: the caught
   * window shows it all week, the day scorecard says every evening whether
   * anybody has a reason to look, and neither of them is being shown a
   * different rule from the one that applies. Nothing here may fire from a
   * state the player could not read first.
   */
  public conductReading(): ConductReading {
    return readConductFile(
      this.tickets(),
      this.engine.graph.getField(this.actor, FIELDS.conductFile),
    );
  }

  /** The file itself, as the world holds it. */
  public conductFile(): string {
    return this.playerText(FIELDS.conductFile);
  }

  /**
   * Which week of the career this is. Week one is the probation week.
   *
   * Private because nothing outside needs the number on its own: what a screen
   * wants is the reading below, which carries the week INSIDE it beside the
   * season and the ranking, and a second way to ask the same question is a
   * second answer waiting to disagree.
   */
  private arcWeek(): number {
    return this.playerNumber(FIELDS.arcWeek, PROBATION_WEEK);
  }

  /**
   * The season, the beat and the ranking, worked out from the arc and the
   * world and nothing else.
   *
   * The matrix is only built once the criteria beat has landed, which is the
   * whole legibility rule in one condition: before the announcement there is
   * no pool, because there is nothing anybody has been told they are in.
   */
  public pressureReading(): PressureReading {
    const week = this.arcWeek();
    const season = seasonAt(week);
    const beat = season === null ? null : beatAt(season, week);
    const scored = season !== null
      && (beat === 'criteria' || beat === 'decision');

    return {
      week,
      season,
      beat,
      standing: scored && season !== null
        ? poolStanding(
          {
            performance: this.weekReading(),
            file: this.engine.graph.getField(this.actor, FIELDS.conductFile),
            arcWeek: week,
          },
          season.cut,
        )
        : null,
    };
  }

  public pressureSummary(): string {
    return pressureSummary(this.pressureReading(), (person) => this.nameOf(person));
  }

  /** Somebody's name, as the graph holds it, for a screen that names them. */
  private nameOf(person: string): string {
    const value = this.engine.graph.getField(person, FIELDS.name);
    return typeof value === 'string' && value.length > 0 ? value : person;
  }

  /**
   * Whether a beat of the season actually left something the player could
   * look at, which is the half of the contract a calendar cannot answer.
   *
   * Two of the four are mail, and mail in this game is gated on a field: no
   * field, no thread, and the inbox does not show anybody an announcement
   * about a round nobody has announced. The third is the matrix, which is
   * readable exactly when there is a pool to score. The fourth is the
   * conversation itself, which is a scene on a Friday at three.
   */
  private readableBeat(beat: PressureBeat): boolean {
    if (beat === 'weather') {
      return typeof this.engine.graph
        .getField(this.actor, FIELDS.pressureWeatherAt) === 'number';
    }

    if (beat === 'notice') {
      return typeof this.engine.graph
        .getField(this.actor, FIELDS.pressureNoticeAt) === 'number';
    }

    if (beat === 'criteria') {
      return (this.pressureReading().standing?.rows.length ?? 0) > 1;
    }

    return isReviewDay(this.day());
  }

  /**
   * Somebody scoring the pool, in the minute before the conversation, and only
   * if the season has been telegraphed.
   *
   * `telegraph` is the gate and it is a TYPE gate: it answers null unless all
   * four beats have fired in order and each of them left something readable,
   * and nothing below can be reached without the season it returns. So a round
   * that was never announced, or announced into an inbox that does not hold
   * the mail, writes no ranking - and a review with no ranking in the world is
   * the review this game has always had.
   *
   * Answers whether the player is in the cut, which is what the driver needs
   * to know which verb to offer.
   */
  private readTheMatrix(): boolean {
    const reading = this.pressureReading();
    const { season, standing } = reading;

    if (season === null || standing === null || reading.beat !== 'decision') {
      return false;
    }

    const telegraphed = telegraph(
      season,
      reading.week,
      (beat) => this.readableBeat(beat),
    );

    if (telegraphed === null) {
      return false;
    }

    const result = this.engine.dispatch(
      DAY_ACTIONS.reviewMatrixRead,
      this.actor,
      null,
      {
        position: standing.position,
        cut_from: standing.cutFrom,
        criteria: matrixSummary(standing, (person) => this.nameOf(person)),
      },
    );

    if (!result.ok) {
      throw new Error(`The pool could not be scored: ${result.reason}`);
    }

    return standing.inTheCut;
  }

  /**
   * Somebody opening it, in the minute before the conversation.
   *
   * The reading is taken here and written down, because everything it is
   * computed from carries on moving all Friday afternoon: a ticket closed at
   * half past three retires the customer whose grievance caused the whole
   * thing, and a window that re-derived the reason would print one that no
   * longer existed above a verdict it had caused.
   */
  private readTheFile(): void {
    const reading = this.conductReading();
    const result = this.engine.dispatch(
      DAY_ACTIONS.reviewFileRead,
      this.actor,
      null,
      { bar: reading.bar, conduct: conductSummary(reading) },
    );

    if (!result.ok) {
      throw new Error(`Nobody could open the file: ${result.reason}`);
    }
  }

  /**
   * The week as the review will read it, right now.
   *
   * The mark for the week to date - how much of what arrived was closed, and
   * how much of it never went red - folded into the days behind it, each of
   * those worth half of the one after. Free to call and changes nothing, which
   * is what lets the day scorecard show the player the number they are being
   * judged on every evening rather than for the first time on a Friday.
   */
  public weekReading(): number {
    return weekStanding(
      this.playerNumber(FIELDS.weekReputation),
      weekWorkThrough(this.engine.graph.nodesOfKind('ticket'), this.day()),
    );
  }

  /**
   * The same number, written into the world.
   *
   * Computed here and decided there, exactly as the meters are: the shell can
   * read the graph, the world says where a number stops, and the dispatch log
   * carries what was actually written so a replay arrives at the same Friday
   * instead of recomputing one.
   */
  private recordWeekReading(): void {
    const reading = this.weekReading();
    const result = this.engine.dispatch(
      DAY_ACTIONS.weekReading,
      this.actor,
      null,
      { reading },
    );

    if (!result.ok) {
      throw new Error(`The week could not be read: ${result.reason}`);
    }
  }

  /** What a day is worth, vending machine and all. */
  private slipFor(day: number): PaySlip {
    return daySlip(
      dayLedger(this.engine.graph.nodesOfKind('ticket'), day),
      this.playerNumber(FIELDS.consumableSpend),
    );
  }

  private scheduleFor(day: number): DaySchedule {
    // Off the end of the week there is nothing left to deal: the world stops
    // on Friday evening, and a driver asked for Saturday's queue is a driver
    // that has been left running past the end of its own week.
    return buildDaySchedule(
      day,
      this.seed_,
      isWeekDay(day) ? dayPlan(day) : { inherited: [], drip: [] },
    );
  }

  private patrolFor(day: number): PatrolSchedule {
    return buildPatrolSchedule(
      day,
      isWeekDay(day) ? patrolSeedFor(day, this.seed_) : this.seed_,
    );
  }

  /**
   * What the day authored, and the minutes it had already spoken for.
   *
   * The blocked half is kept beside the schedule rather than thrown away,
   * because a callback is placed at RUNTIME - twenty minutes after somebody
   * asked for one - and it has to get out of the way of exactly the same
   * bookings the authored entries did.
   */
  private interruptionPlan(day: number): InterruptionPlan {
    return this.plans(day, this.seed_);
  }

  private interruptionsFor(
    day: number,
    plan: Readonly<InterruptionPlan>,
  ): InterruptionSchedule {
    return buildInterruptionSchedule(this.seed_, day, plan);
  }

  /** Both halves of the day's interruptions, rebuilt for a new day or a load. */
  private rebuildInterruptions(day: number): void {
    const plan = this.interruptionPlan(day);
    this.interruptionsBlocked_ = plan.blocked;
    this.interruptions_ = this.interruptionsFor(day, plan);
  }

  /**
   * Which week this is, and therefore which minutes it deals.
   *
   * Read off the graph rather than remembered, because the graph is the half
   * that survives a load: the attempt number is written into the world when
   * the week is built, and a driver that kept its own copy handed a restored
   * second attempt the first attempt's drip jitter and the first attempt's
   * patrols. The engine restored the right world and the schedule beside it
   * belonged to a week nobody was playing.
   */
  private seedFromWorld(): number {
    return seedForAttempt(Math.max(1, this.playerNumber(FIELDS.weekAttempt, 1)));
  }

  private farmFund(): number {
    const banked = this.engine.graph.getField(this.actor, FIELDS.farmFund);
    return typeof banked === 'number' && Number.isSafeInteger(banked) && banked >= 0
      ? banked
      : 0;
  }

  /**
   * Spawns everything the clock has just passed. A ticket that is already in
   * the world is left alone: the shipped pool is the same four tickets every
   * day until M4's content arrives, and a queue that re-spawns yesterday's
   * work would be a lie about the day rather than a busy one.
   */
  private spawnArrivals(after: number, upTo: number): void {
    for (const arrival of arrivalsBetween(this.schedule_, after, upTo)) {
      if (this.engine.graph.getNode(arrival.ticketId) !== undefined) {
        continue;
      }

      spawnWorldTicket(this.engine, arrival.ticketId);
    }
  }

  /* -- what the world does to itself -------------------------------------- */

  /**
   * The cleaner's trolley, and the maintenance window.
   *
   * Dispatched straight at the engine rather than through this driver's own
   * `dispatch`, because that one records touches and stops response clocks -
   * and a printer losing power in another building is emphatically not
   * somebody working a ticket. No jitter either: the whole of the recurring arc
   * is two outages at the SAME minute two days apart, and a schedule that
   * wandered would be a schedule with the clue taken out of it.
   */
  private applyIncidents(after: number, now: number): void {
    const day = this.day();

    for (const slot of incidentsOn(day)) {
      const at = tickAtMinute(day, slot.minute);

      if (at <= after || at > now) {
        continue;
      }

      const incident = findIncident(slot.incidentId);

      if (incident === undefined) {
        continue;
      }

      for (const step of incident.steps) {
        this.engine.dispatch(
          step.action,
          this.actor,
          step.target,
          { ...step.params },
        );
      }

      if (incident.notice !== null) {
        this.handlers.onNotice?.(incident.notice.title, incident.notice.body);
      }
    }
  }

  /**
   * Somebody asking a favour, and the ticket they raise when you say no.
   *
   * Both halves are here because they are one beat with a gap in it. The
   * message lands, and ten minutes later either the world shows the favour was
   * done - a password actually reset, whichever surface did it - or the person
   * has got round to the form and there is a ticket, a clock and a resolution
   * worth eight points. Neither answer is punished and the scorecard is where
   * the difference shows up, which is the whole of the lesson.
   */
  private settleDirectMessages(after: number, now: number): void {
    const day = this.day();

    for (const slot of directMessagesOn(day)) {
      const asked = tickAtMinute(day, slot.minute);
      const files = tickAtMinute(day, slot.minute + slot.filesAfter);

      if (asked > after && asked <= now) {
        this.handlers.onDirectMessage?.(slot.speaker, asked);
      }

      if (files <= after || files > now) {
        continue;
      }

      const done = this.engine.graph.getField(
        slot.doneWhen.node,
        slot.doneWhen.field,
      );

      // Done for them, off the books, since they asked: there is nothing left
      // to raise and nothing on the scorecard either.
      if (typeof done === 'number' && done >= asked) {
        continue;
      }

      if (this.engine.graph.getNode(slot.raises) === undefined) {
        spawnWorldTicket(this.engine, slot.raises);
      }
    }
  }

  /**
   * Where a walk-up STOOD, whatever was then decided about it.
   *
   * It is deliberately not `liveInterruptions`, and that is a fix rather than
   * a preference: the live list drops everything in the declined ledger, so a
   * player who said "not now" made the entry vanish, the settlement below
   * never found an end tick, and the ticket was never raised at all. Declining
   * was therefore strictly cheaper than every other answer - cheaper than
   * doing the job, cheaper than sending them to the form, and cheaper even
   * than ignoring them, which files correctly - which is an exploit rather
   * than a choice, in the one beat of this slice that is entirely about the
   * choice being real.
   *
   * So the placement is asked with this entry's decline taken back out of the
   * ledger: where would it be if nobody had waved it off. Everything else the
   * ledger holds - the pushes, the slides, the OTHER entries' decisions -
   * stays exactly as it is, because those genuinely move the day.
   */
  private walkUpStood(id: string): InterruptionEntry | null {
    const ledger = this.interruptionLedger();

    return placeInterruptions(
      this.interruptions_,
      this.interruptionsBlocked_,
      {
        ...ledger,
        declined: ledger.declined.filter((declined) => declined !== id),
      },
    ).find((entry) => entry.id === id) ?? null;
  }

  /**
   * Somebody who came to the desk instead of raising one, and the ticket they
   * raise when the job does not get done.
   *
   * The same beat as the message above, standing up, and settled by the same
   * rule for the same reason: the question is whether the WORLD shows the
   * favour was done, not which button was pressed. Restarting his machine from
   * Remote Assist an hour later counts; saying you will get to it and not
   * getting to it does not; being told not now does not; and ignoring somebody
   * standing at your desk is not a way of making the job go away either. That
   * is what makes every answer legitimate and exactly one of them credited.
   *
   * The minutes are read off the PLACED entry rather than off the authored
   * row, and that is not tidiness: a walk-up slides out of the lead's way and
   * can be pushed twenty minutes, so the minute he walks away is a fact about
   * the day rather than about the table. A ticket that arrived while he was
   * still standing there would be a conversation that decided nothing.
   */
  private settleWalkUps(after: number, now: number): void {
    const day = this.day();

    for (const walkUp of walkUpsOn(day)) {
      const entry = this.walkUpStood(walkUp.slot.id);

      if (entry === null) {
        continue;
      }

      const files = entry.endsTick + walkUp.filesAfter;

      if (files <= after || files > now) {
        continue;
      }

      const done = this.engine.graph.getField(
        walkUp.doneWhen.node,
        walkUp.doneWhen.field,
      );

      // Done for him, off the books, since he asked: there is nothing left to
      // raise and nothing on the scorecard either, which IS the trade rather
      // than an oversight.
      if (typeof done === 'number' && done >= entry.tick) {
        continue;
      }

      if (this.engine.graph.getNode(walkUp.raises) !== undefined) {
        continue;
      }

      spawnWorldTicket(this.engine, walkUp.raises);

      // The one authored variant this beat gets, and it is spent on the answer
      // that used to be free. Being told not now is not being told no: he goes
      // back to his desk and raises it himself, and the sentence says who did
      // the raising rather than pretending the queue produced it.
      if (this.hasDecided(FIELDS.interruptionDeclined, walkUp.slot.id)) {
        this.handlers.onNotice?.(
          'They raised it themselves',
          'You said not now, and "not now" is not "no". It is in the queue '
          + 'with their name on it, a clock on it, and a subject line that '
          + 'mentions what time they came over.',
        );
      }
    }
  }

  /**
   * "Hi." - and then, several minutes later, the question.
   *
   * Both halves are here because they are one beat with a gap in it, exactly
   * as the favour is. Neither half costs the world anything: what a no-hello
   * charges is the minutes somebody spends watching a typing indicator, and
   * minutes are charged by the clock rather than by a meter. So this is two
   * announcements and no dispatch at all, which is why nothing about it moves
   * a hash.
   */
  private settleNoHello(after: number, now: number): void {
    const day = this.day();

    for (const slot of noHelloOn(day)) {
      const said = tickAtMinute(day, slot.minute);
      const asked = said + slot.typingMinutes;

      if (said > after && said <= now) {
        this.handlers.onNoHello?.(slot.speaker, said);
      }

      if (asked > after && asked <= now) {
        this.handlers.onNoHelloQuestion?.(slot.speaker, asked);
      }
    }
  }

  /**
   * Whether this person is currently typing at you, and how far into it.
   *
   * Free to read and changes nothing, like every other view on this
   * interface: it is arithmetic on the week's own table and the clock, so the
   * chat window, a test and a save all get the same answer and none of them
   * has to remember anything. Null for everybody who is not mid-greeting,
   * which is everybody, almost always.
   */
  public typing(speaker: NodeId): TypingView | null {
    const day = this.day();
    const now = this.engine.now();

    for (const slot of noHelloOn(day)) {
      if (slot.speaker !== speaker) {
        continue;
      }

      const said = tickAtMinute(day, slot.minute);
      const waited = now - said;

      if (!stillTyping(waited, slot.typingMinutes)) {
        continue;
      }

      return {
        speaker,
        landedAt: said,
        typingMinutes: slot.typingMinutes,
        minutesWaited: waited,
        minutesLeft: typingMinutesLeft(waited, slot.typingMinutes),
        line: typingLine(waited, slot.typingMinutes),
      };
    }

    return null;
  }

  /**
   * The tablet in the cupboard, offering the password it was set up with.
   *
   * It is the world typing rather than a person, so it goes through the world's
   * own verb and never through this driver's `dispatch`: a response clock
   * stopped by a scanner would be a clock stopped by nobody.
   */
  private settleStaleAuth(now: number): void {
    for (const attempt of staleLogonsDue(this.engine.graph, now)) {
      this.engine.dispatch(
        WORLD_ACTIONS.staleLogon,
        this.actor,
        attempt.account,
        { count: attempt.count },
      );
    }
  }

  /** The other half of a chain, raised by the fix that finished the first. */
  private settleFollowUps(): void {
    for (const ticket of this.tickets()) {
      if (ticket.fields[FIELDS.state] !== 'resolved') {
        continue;
      }

      const next = followUpTo(ticket.id);

      if (next === undefined || this.engine.graph.getNode(next) !== undefined) {
        continue;
      }

      spawnWorldTicket(this.engine, next);
      this.handlers.onNotice?.(
        'They are back',
        `${ticketTitle(next)} - raised by the same person, about the same `
        + 'request, forty minutes after you closed it.',
      );
    }
  }

  /**
   * The bill for an enrolment nobody checked, arriving the next morning.
   *
   * The world decides whether there is one: the verb refuses an account that
   * was verified, an account with nothing enrolled, and an account that has
   * already been charged, so this is a read followed by a dispatch rather than
   * a decision made here.
   */
  private settleSecurityFallout(): void {
    for (const account of socialEngineeringDue(this.engine.graph, this.engine.now())) {
      const result = this.engine.dispatch(
        WORLD_ACTIONS.securityFallout,
        this.actor,
        null,
        { account },
      );

      if (result.ok) {
        this.handlers.onNotice?.(
          'Security incident report',
          'Somebody else\'s incident report has landed with your name in the '
          + 'timeline. An authenticator was enrolled yesterday for a person '
          + 'nobody checked the identity of, and it was not the person whose '
          + 'account it was.',
        );
      }
    }
  }

  /* -- the lead, doing his rounds ---------------------------------------- */

  /**
   * Everything the boss did in the minutes just gone: footsteps, arrivals, and
   * the messages he sends instead of raising tickets.
   *
   * All of it is keyed to the day's seeded schedule, and all of it is decided
   * against the world as it stands AT THE ARRIVAL - which is the mechanic: the
   * player's move is what is on their screen when he gets there, made several
   * minutes earlier, when the floor started creaking.
   */
  private walkTheFloor(after: number, now: number): void {
    if (this.state() !== 'shift') {
      return;
    }

    if (visitsTelegraphingBetween(this.patrol_, after, now).length > 0) {
      this.announceFootsteps();
    }

    for (const visit of visitsArrivingBetween(this.patrol_, after, now)) {
      this.settleVisit(visit);
    }

    for (const ping of pingsBetween(this.patrol_, after, now)) {
      this.settlePing(ping);
    }
  }

  private announceFootsteps(): void {
    this.handlers.onNotice?.(
      'Footsteps',
      'Somebody is coming down the corridor at the pace of a man who has '
      + `nothing to do and a floor to walk. You have ${
        String(TELEGRAPH_TICKS)
      } minutes and one key.`,
    );
    // The taskbar and the door reflection are driven off `boss()`, which is a
    // function of the clock - so all this has to do is ask for a repaint.
    this.announce();
  }

  /**
   * The arrival: two observations, settled independently.
   *
   * Being caught is decided on what is genuinely on the screen. The empties
   * are a second, cheaper conversation about a desk that told the story on its
   * own - and a man who has just found a browser open does not stop noticing
   * the cans. Settling only the first one made the screen a hiding place for
   * the desk, which is the wrong way round.
   */
  private settleVisit(visit: Readonly<BossVisit>): void {
    const caught = caughtBy(this.handlers.openSlackApps());

    if (caught !== null) {
      const result = this.engine.dispatch(
        DAY_ACTIONS.bossCaught,
        this.actor,
        null,
        {
          file_line: conductLine(
            visit.arrivalTick,
            'screen',
            caughtScene(caught)?.fileSubject ?? GENERIC_CAUGHT_SCENE.fileSubject,
          ),
          // A conversation about a screen leaves the dot's own record exactly
          // where it was. He has not mentioned the status and has no reason
          // to: the morning it is evidence of is still going on.
          status_evidence_spent: 0,
        },
      );

      if (result.ok) {
        // A scene has just opened on somebody who was looking at something
        // else, and it is the third member of the family the ring rule names.
        // It is not an interruption ENTRY - the corridor is its own schedule -
        // so it says so here rather than through `slowsTheClock`, which is a
        // question about sources.
        this.slowDown('boss');
        // And the price, which is the clock rather than the scoreboard: he is
        // here now, and getting back to what you were doing is the rest of it.
        this.owedMinutes_ += CAUGHT_MINUTES;
        this.handlers.onCaught?.(caught, visit.arrivalTick, null);
        this.handlers.onNotice?.(
          `That is ${String(CAUGHT_MINUTES)} minutes`,
          'He was at the desk for a while and the queue was not. The shift is '
          + `${String(CAUGHT_MINUTES)} minutes shorter than it was and not one `
          + 'deadline moved with it. Nothing came off your reputation. A line '
          + 'has gone on your file, which you can read.',
        );
      }
    }

    // One conversation at a time, which is the precedence discipline the
    // takeover family already keeps: a man who has just found a forum open is
    // having THAT conversation, and the dot will still be there tomorrow.
    if (caught === null) {
      this.settleStatusBeat(visit);
    }

    const cans = this.playerNumber(FIELDS.deskCans);

    if (!emptiesNoticed(cans)) {
      return;
    }

    const noticed = this.engine.dispatch(
      DAY_ACTIONS.bossNoticedEmpties,
      this.actor,
      null,
      {
        suspicion_up: EMPTIES_SUSPICION_BUMP,
        file_line: conductLine(
          visit.arrivalTick,
          'desk',
          `${String(cans)} empty cans`,
        ),
      },
    );

    if (noticed.ok) {
      this.handlers.onNotice?.(
        'He counted them',
        caught === null
          ? 'The lead looked at your screen, found nothing to say about it, '
            + 'and then looked at the cans. He did not mention the cans, '
            + 'which is worse than mentioning them.'
          : 'On his way back up the corridor he did the arithmetic on the '
            + 'cans as well. He did not mention those either.',
      );
    }
  }

  /**
   * The other thing he can find, which is not on the screen at all.
   *
   * The status beat, and it is the CAUGHT-SCENE CLASS rather than a new one:
   * the same verb, the same line on the file, the same minutes off the shift,
   * the same closeable window with the same button on it. What differs is what
   * he found - a dot saying busy over a dispatch log saying working - and that
   * is a sentence, not a mechanic.
   *
   * Three things keep it from being a random scold, and all three are the
   * world's rather than this driver's:
   *
   * - It fires on ARRIVAL, in the corridor's own schedule, so it is telegraphed
   *   exactly as every other conversation at this desk is.
   * - `armed` is a predicate over evidence the world wrote down: the dot is on
   *   NOW, the meter has actually climbed, and there is half an hour of
   *   do-not-disturb-while-working on the record.
   * - It cannot drum. `boss.caught` puts suspicion on the floor a spoken-to
   *   person sits at, which is below the threshold that armed it - so the next
   *   one costs another morning of the same behaviour rather than the next
   *   time he walks past.
   */
  private settleStatusBeat(visit: Readonly<BossVisit>): void {
    const beat = this.dndBeat();

    if (!beat.armed) {
      return;
    }

    // ONE reading, captured here, and both surfaces are handed it: the line
    // that goes on the file and the scene the player reads are two sentences
    // about the same morning, and a scene that recomputed the number live
    // would drift from the file the moment another minute of the dot went by.
    // The world is about to clear the record anyway - being spoken to closes
    // the morning it was about - so a live read afterwards is a read of
    // nothing at all.
    const minutes = beat.minutes;
    const result = this.engine.dispatch(DAY_ACTIONS.bossCaught, this.actor, null, {
      // The quantity goes on the FILE, where a quantity belongs; the scene
      // says the same thing in the words a man standing there would use.
      file_line: conductLine(
        visit.arrivalTick,
        'status',
        `${DND_CAUGHT_SCENE.fileSubject} for ${dndEvidence(minutes)}`,
      ),
      // And the morning is spent by having been mentioned.
      status_evidence_spent: 1,
    });

    if (!result.ok) {
      return;
    }

    this.slowDown('boss');
    this.owedMinutes_ += CAUGHT_MINUTES;
    this.handlers.onCaught?.(PRESENCE_CAUGHT_KEY, visit.arrivalTick, minutes);
    this.handlers.onNotice?.(
      `That is ${String(CAUGHT_MINUTES)} minutes`,
      'He did not find anything on your screen. He read your status instead, '
      + 'held it against a morning of dispatches, and came down to ask about '
      + `it. The shift is ${String(CAUGHT_MINUTES)} minutes shorter and a line `
      + 'has gone on your file, which you can read.',
    );
  }

  private settlePing(ping: Readonly<BossPing>): void {
    if (ping.ticketId !== null) {
      this.raiseSummonedTicket(ping.ticketId);
    }

    const result = this.engine.dispatch(
      DAY_ACTIONS.bossPing,
      this.actor,
      null,
      { stress_up: PING_STRESS },
    );

    if (result.ok) {
      this.handlers.onBossPing?.(ping);
    }
  }

  /** A ticket the day scheduler was never given a slot for. */
  private raiseSummonedTicket(ticketId: string): void {
    if (this.engine.graph.getNode(ticketId) !== undefined) {
      return;
    }

    spawnWorldTicket(this.engine, ticketId);
  }

  /* -- being taken off the work ------------------------------------------ */

  /**
   * What is taking the screen off the player this minute.
   *
   * Derived on every call rather than remembered, from three things that all
   * survive a save: the day's seeded schedule, the clock, and the three lists
   * the world keeps of what was decided. That is what makes the mid-state
   * promise cheap - a save taken while the phone is ringing restores with the
   * phone ringing, because there was never anything to save.
   *
   * A declined entry stops owning the screen the minute it is declined, which
   * is the point of declining; a deferred one stops owning it and comes back
   * at the minute `placeDeferred` puts it, which is twenty minutes out and
   * clear of everything else the day had booked.
   */
  public interruption(): InterruptionView | null {
    if (this.state() !== 'shift') {
      return null;
    }

    const now = this.engine.now();

    for (const entry of this.liveInterruptions()) {
      if (now < entry.tick || now >= entry.endsTick) {
        continue;
      }

      const ticketInHand = this.ticketInHand();

      return {
        entry,
        minutesIn: now - entry.tick,
        callback: this.hasDecided(FIELDS.interruptionDeferred, entry.id),
        postponesLeft: Math.max(
          0,
          entry.postpones.length - this.postponesSpent(entry.id),
        ),
        answered: this.hasDecided(FIELDS.interruptionAnswered, entry.id),
        benign: isBenign(entry, ticketInHand),
        ticketInHand,
      };
    }

    return null;
  }

  /**
   * The workstation that has been pushed back and is on its way, if there is
   * one.
   *
   * FILTERED FIRST, selected after, and the order is the whole of the
   * contract. Asked for "the next interruption" and then filtered by the
   * caller, an unmet call sitting between now and a postponed reboot is the
   * nearest entry - so the answer would be the call, the caller would discard
   * it, and the countdown the player was promised would blink out until the
   * phone rang. What the surfaces want is not "what is next" but "when does
   * the workstation take the desk", which is a question about one entry.
   *
   * A machine nobody has pushed yet is deliberately not one of them: an entry
   * the player has not met is a surprise the week is entitled to keep, and a
   * chip counting down to it would be the seeded schedule reading itself out
   * loud.
   *
   * Same sources as `interruption()` and the same absence of memory: the
   * seeded schedule, the clock, and the ledger of what has been spent. A
   * countdown drawn off this comes back from a save on the same minute with
   * the same number on it, because the number was never written down.
   */
  public pendingRestart(): UpcomingInterruption | null {
    if (this.state() !== 'shift') {
      return null;
    }

    const now = this.engine.now();
    const ledger = this.interruptionLedger();
    let soonest: InterruptionEntry | null = null;

    for (const entry of this.liveInterruptions()) {
      const spends = ledger.spentAt[entry.id] ?? [];

      if (
        entry.tick <= now
        || entry.source !== 'machine'
        || spends.length === 0
      ) {
        continue;
      }

      if (soonest === null || entry.tick < soonest.tick) {
        soonest = entry;
      }
    }

    if (soonest === null) {
      return null;
    }

    return {
      entry: soonest,
      ticksAway: soonest.tick - now,
      postponesLeft: Math.max(
        0,
        soonest.postpones.length - this.postponesSpent(soonest.id),
      ),
    };
  }

  /**
   * Every entry of the day as it now stands: the ones nobody has settled at
   * their authored minute, and the ones somebody pushed at the minute they
   * come back on.
   *
   * Settled is answered or declined - both are decisions, and neither of them
   * rings twice. Deferred is not settled, which is the whole of what deferring
   * means, and a callback with nowhere left in the day to go is dropped rather
   * than squeezed into the last minute of the shift.
   */
  private liveInterruptions(): readonly InterruptionEntry[] {
    // WHERE everything is comes first, and it is asked of the world rather
    // than of what has been decided since. An entry somebody pushed back lives
    // at the minute the callback was placed on, and it goes on living there
    // once it has been answered - the conversation is happening, and it is
    // happening in the callback's window rather than in the one twenty minutes
    // earlier that nobody was in.
    //
    // Reading those two questions in the wrong order is a real bug and was
    // one: an answered callback fell back to the ORIGINAL entry, whose minutes
    // were long past, so `interruption()` went null the instant the player
    // picked the phone up and the conversation vanished out from under them.
    //
    // The whole day is placed in ONE call rather than one entry at a time, and
    // that is the other real bug: two callbacks pushed from different minutes
    // can want the same minute, and two placements that each looked at the
    // other's ORIGINAL window would both take it - which the runtime assert
    // then reports as a crashed clock. `placeInterruptions` books each
    // placement against the last, so the collision is impossible rather than
    // caught.
    //
    // Every input is the world's: the minutes the pushes were pressed at and
    // the ids that were waved off. Nothing here is remembered, which is what
    // makes a mid-countdown save land back on the same minute with the same
    // budget left.
    return placeInterruptions(
      this.interruptions_,
      this.interruptionsBlocked_,
      this.interruptionLedger(),
    );
  }

  /**
   * What the world has recorded about today's interruptions.
   *
   * Two lists, both off the player node, both written by the verbs: the minute
   * every push was pressed, and the ids nobody is going to hear from again. It
   * is rebuilt on every call rather than cached, because a cache is a number a
   * load can leave disagreeing with the world - which is the whole reason none
   * of this lives in the driver.
   */
  private interruptionLedger(): InterruptionLedger {
    const spentAt = this.stampedLines(FIELDS.interruptionSpentAt);

    // A push the ids-only ledger knows about and this one has no minute for
    // is a record from a save written before the minute was kept - or from a
    // caller that dispatched the verb without stamping one. It is NOT lost:
    // it falls back to the arrival, which is 0.3.0's arithmetic exactly, and
    // which is exactly right for every save that can carry one (a call has a
    // budget of one window, so one unstamped push is one window from the
    // arrival). Losing it would be worse than any of that: an entry the world
    // says was pushed and the schedule cannot place is an entry that quietly
    // stops existing.
    for (const entry of this.interruptions_.entries) {
      const known = spentAt[entry.id] ?? [];
      const spent = this.postponesSpent(entry.id);

      for (let missing = known.length; missing < spent; missing += 1) {
        known.unshift(entry.tick);
      }

      if (known.length > 0) {
        spentAt[entry.id] = known;
      }
    }

    return {
      spentAt,
      declined: this.playerText(FIELDS.interruptionDeclined)
        .split('\n')
        .filter((id) => id.length > 0),
      // The dot's own ledger, read the same way and kept apart for the same
      // reason it is written apart: a slide is not a push, it spends no
      // budget, and a morning on do not disturb must not quietly eat a
      // workstation's postpones.
      dodgedAt: this.stampedLines(FIELDS.interruptionDodged),
    };
  }

  /**
   * An `id@tick` list off the player node, as minutes by id.
   *
   * One reader for both ledgers rather than two, because they are the same
   * shape written by two verbs, and a second copy of this parsing is a second
   * answer to "which minute did that happen on" waiting to disagree with the
   * first.
   */
  private stampedLines(field: string): Record<string, number[]> {
    const stamped: Record<string, number[]> = {};

    for (const line of this.playerText(field).split('\n')) {
      const mark = line.lastIndexOf('@');

      if (mark <= 0) {
        continue;
      }

      const id = line.slice(0, mark);
      const at = Number(line.slice(mark + 1));

      if (!Number.isSafeInteger(at)) {
        continue;
      }

      (stamped[id] ??= []).push(at);
    }

    return stamped;
  }

  /**
   * What the desk answers with while something is holding it in a way that
   * makes work impossible rather than merely awkward - and null while the desk
   * is the player's.
   *
   * A MEETING holds it, and so does a workstation installing updates, and they
   * refuse in different words because they are different rooms to be locked
   * out of: one is a meeting you are not at your desk during, the other is a
   * desk that is not there. A ringing phone deliberately holds nothing: a call
   * is a window, the normal rules keep applying underneath one, and being on
   * the phone has never been a defence for anything. The line is drawn on the
   * source rather than on "is a takeover on" so that the two stay different
   * things.
   *
   * It is checked in the driver rather than in each surface because the shell
   * has five ways to reach a verb and a rule enforced in four of them is a
   * rule with a hole in it - which is exactly what the pointer-events version
   * of this was: a terminal with the keyboard still submitted commands.
   */
  private takeoverRefusal(): string | null {
    return deskHeldReason(this.interruption()?.entry.source);
  }

  /** Whether an id is in one of the lists the world keeps. */
  private hasDecided(field: string, id: string): boolean {
    return this.playerText(field).split('\n').includes(id);
  }

  /**
   * How many postpones this interruption has had spent on it, counted off the
   * world's ledger.
   *
   * One line per push, so the count is the number of lines that ARE this id.
   * Nothing here caches it: it is asked every minute, on both sides of a save,
   * and a driver that kept its own tally would be a driver handing a restored
   * countdown its budget back.
   */
  private postponesSpent(id: string): number {
    return this.playerText(FIELDS.interruptionPostpones)
      .split('\n')
      .filter((line) => line === id)
      .length;
  }

  /**
   * The ticket the player is actually on, which is what the cost model reads.
   *
   * The touch log knows: it is the ticket somebody most recently did something
   * about and has not finished. A resolved one is deliberately not in the
   * running - a call about a ticket you closed ten minutes ago is a call about
   * something else now - and a world where nothing has been touched answers
   * nothing, which makes every interruption in it malignant. That is correct:
   * somebody who is not on anything has still lost their place.
   */
  private ticketInHand(): string | null {
    let held: string | null = null;
    let latest = -1;

    for (const ticket of this.tickets()) {
      if (!isUnresolved(ticket)) {
        continue;
      }

      const touches = triedFromTouches(ticket.fields[FIELDS.touchLog]);
      const last = touches[touches.length - 1];

      if (last !== undefined && last.tick > latest) {
        latest = last.tick;
        held = ticket.id;
      }
    }

    return held;
  }

  /**
   * Everything the schedule had to say about the minutes just gone.
   *
   * Arrivals are read off `liveInterruptions` rather than off the schedule, so
   * a callback the player asked for lands as an arrival exactly like a first
   * one - same window, same stress, same three buttons, minus the one that
   * says no. Interruptions fire during the shift and nowhere else: the morning
   * brief is not paid time and nobody rings a desk that has clocked off.
   */
  private settleInterruptions(after: number, now: number): void {
    if (this.state() !== 'shift') {
      return;
    }

    const settled = new Set<string>();
    const ended = new Set<string>();

    // The pass is a LOOP because a slide changes where everything else in the
    // day stands: the entry the dot pushed out stops being a booking, and
    // something that had been slid out of its way can come back to a minute
    // that is now clear - including this one. Walking a placement taken before
    // the slide would miss that arrival entirely.
    //
    // It terminates: a slide moves its own entry at least `DND_SLIDE_MINUTES`
    // later, so nothing can be slid twice in one minute, and the sets below
    // make each entry's arrival and end the driver's business exactly once.
    for (let pass = 0; pass <= this.interruptions_.entries.length; pass += 1) {
      let slid = false;

      for (const entry of this.liveInterruptions()) {
        if (
          entry.tick > after
          && entry.tick <= now
          && !settled.has(entry.id)
        ) {
          settled.add(entry.id);

          if (this.dodge(entry)) {
            slid = true;
            break;
          }

          this.arrive(entry);
        }

        // The far side of it, whatever happened in between. The meeting
        // settles what it owes the world here, which is why this runs on the
        // END rather than on a button: nobody presses "the meeting is over".
        if (
          entry.endsTick > after
          && entry.endsTick <= now
          && !ended.has(entry.id)
        ) {
          ended.add(entry.id);
          this.finish(entry);
        }
      }

      if (!slid) {
        return;
      }
    }
  }

  /**
   * The dot, doing the one thing it does: a phone that does not ring.
   *
   * Answers whether the day moved, because the caller has to re-read a
   * placement this changed. Nothing about the ARRIVAL happens - no stress, no
   * window, no three answers - which is exactly the trade: the quiet is real,
   * and what it costs is the drip the meters charge for showing a status that
   * disagrees with the log.
   *
   * A slide that runs out of day is a call that is simply not going to happen,
   * and it goes into the missed list like a phone that rang out - minus the
   * window, because nothing rang. The record is the honest trace of it: the
   * dot dodged it, and somebody can read later that this desk did not take it.
   */
  private dodge(entry: Readonly<InterruptionEntry>): boolean {
    if (!dodgesUnderDnd(entry, this.presence())) {
      return false;
    }

    const now = this.engine.now();
    const slid = this.engine.dispatch(
      DAY_ACTIONS.interruptionDodged,
      this.actor,
      null,
      {
        id: entry.id,
        // The whole line, stamped here because this is the only place that
        // knows the minute - the same contract the postpone ledger keeps, and
        // for the same reason: the schedule measures the next arrival from the
        // slide rather than from the minute it was originally due.
        dodged_at: `${entry.id}@${String(now)}`,
        declinable: entry.declinable ? 1 : 0,
      },
    );

    if (!slid.ok) {
      return false;
    }

    if (!this.liveInterruptions().some((live) => live.id === entry.id)) {
      this.engine.dispatch(DAY_ACTIONS.interruptionMissed, this.actor, null, {
        id: entry.id,
        benign: isBenign(entry, this.ticketInHand()) ? 1 : 0,
        // It never rang. The window a ring-out costs is the ringing itself,
        // and there was none of it - so the record is the whole of what this
        // one leaves behind.
        rang: 0,
      });
    }

    this.handlers.onInterruptionDodged?.(entry, now);
    this.announce();
    return true;
  }

  /**
   * One interruption, arriving.
   *
   * The precedence check is an ASSERT rather than a guard, and that is
   * deliberate: the schedule already guarantees one takeover at a time by
   * construction, so a second one here is not a case to handle - it is a bug
   * in the thing that placed them, and handling it quietly would be how that
   * bug ships. The only entry that is placed at runtime is a callback, and
   * `placeDeferred` gets it out of the way of the same bookings.
   */
  private arrive(entry: Readonly<InterruptionEntry>): void {
    this.assertOneTakeover(entry);

    if (slowsTheClock(entry.source)) {
      this.slowDown(entry.source);
    }

    const benign = isBenign(entry, this.ticketInHand());
    // An arrival the player pushed here themselves is the same dread coming
    // round again rather than new dread, so it is charged once - at the first
    // one. The world enforces it too, off the same ledger; this is only the
    // half that keeps a dispatch nobody could accept out of the log.
    const stress = this.postponesSpent(entry.id) > 0
      ? 0
      : arrivalStress(entry, benign);

    if (stress > 0) {
      this.engine.dispatch(
        DAY_ACTIONS.interruptionArrived,
        this.actor,
        null,
        { id: entry.id, stress_up: stress },
      );
    }

    // A meeting is not a choice, so the driver does not offer one: the block
    // simply starts, and the two refusals exist to say why when the player
    // presses them anyway.
    const view = this.interruption();

    if (view !== null) {
      this.handlers.onInterruption?.(view);
    }

    this.announce();
  }

  /**
   * The end of a block, and the only place the world learns a meeting
   * happened.
   *
   * `accept` is dispatched HERE for a meeting and at the button for a call,
   * and the difference is the refocus window rather than an inconsistency:
   * the twenty-three minutes are measured from the moment the player is handed
   * their desk back, and for a call that is the moment they pick the phone up
   * while for half an hour in a room it is the moment the room empties.
   */
  private finish(entry: Readonly<InterruptionEntry>): void {
    // The two nobody presses a button on. A meeting is sat through and a
    // workstation reboots itself, so the world learns they HAPPENED at the
    // minute they stop happening - which is also the minute the desk comes
    // back, and therefore the minute the refocus window is measured from.
    if (entry.source === 'machine') {
      this.engine.dispatch(DAY_ACTIONS.interruptionAccept, this.actor, null, {
        id: entry.id,
      });
    }

    if (entry.source === 'meeting') {
      this.engine.dispatch(DAY_ACTIONS.interruptionAccept, this.actor, null, {
        id: entry.id,
      });
      this.engine.dispatch(DAY_ACTIONS.meetingRecap, this.actor, null, {});
      this.handlers.onNotice?.(
        'That could have been an email',
        'The recap is in your inbox. It is the meeting, in full, with '
        + 'nothing taken out of it, because nothing was said that could be.',
      );
    }

    const benign = isBenign(entry, this.ticketInHand());

    if (this.hasDecided(FIELDS.interruptionAnswered, entry.id)) {
      // The screen is the player's again, and THIS is the minute the
      // twenty-three start from. A window opened when the phone was picked up
      // would have spent a third of itself recovering from a conversation that
      // had not finished happening.
      //
      // Benign is asked here rather than remembered from the answer, for the
      // same reason it is asked at both ends everywhere else in this family:
      // somebody who took a call about the ticket on their screen and is
      // still on it when they put the phone down did not lose their place.
      if (!benign) {
        this.engine.dispatch(DAY_ACTIONS.interruptionRefocus, this.actor, null, {
          id: entry.id,
        });
      }
    } else {
      // Nobody got to it. That is not a decision and it is not free: the
      // ringing pulled the thread whether or not anybody answered, and the
      // world keeps a record that this desk did not pick up - which is what
      // stops "ignore it" from being the correct answer to every phone.
      const missed = this.engine.dispatch(
        DAY_ACTIONS.interruptionMissed,
        this.actor,
        null,
        { id: entry.id, benign: benign ? 1 : 0 },
      );

      if (missed.ok) {
        this.handlers.onNotice?.(
          'You did not get to that one',
          'It rang out. Nobody is going to mention it, and it is written '
          + 'down, which is how most of the things nobody mentions work.',
        );
      }
    }

    this.handlers.onInterruptionEnded?.(entry);
    this.announce();
  }

  /**
   * The runtime half of "one takeover at a time".
   *
   * Two things can own the screen and neither of them is this module's to
   * place: the lead standing at the desk, and another interruption. Both are
   * already avoided by construction, so this throws rather than skipping -
   * a screen holding a manager and a ringing phone at once is a bug that
   * would otherwise present as a player being unable to read either.
   */
  private assertOneTakeover(entry: Readonly<InterruptionEntry>): void {
    const now = this.engine.now();
    const clash = this.liveInterruptions().find(
      (other) => other.id !== entry.id
        && now >= other.tick
        && now < other.endsTick,
    );

    if (clash !== undefined) {
      throw new Error(
        `"${entry.id}" arrived at ${String(now)} while "${clash.id}" still `
        + 'owned the screen. The schedule places one takeover at a time and '
        + 'something has put a second one on top of it.',
      );
    }

    if (patrolPhase(this.patrol_, now) === 'present') {
      throw new Error(
        `"${entry.id}" arrived at ${String(now)} with the lead at the desk. `
        + 'The rounds are handed to the schedule as minutes already spoken '
        + 'for, so this is a booking that was not passed on.',
      );
    }
  }

  /**
   * Picking it up.
   *
   * Benign is asked again HERE rather than remembered from the arrival, and
   * the two answers are allowed to disagree. Somebody who was on the ticket
   * when it rang and has wandered off by the time they answer has genuinely
   * lost their place, and somebody who opened the ticket while it rang has
   * genuinely turned a cold call into the job - both are the honest reading,
   * and neither is a state anybody has to store.
   */
  public answerInterruption(): DispatchResult {
    const view = this.interruption();

    if (view === null) {
      return { ok: false, reason: NOTHING_RINGING };
    }

    const target = view.benign ? view.entry.relatedTicket : null;
    const ticket = target === null
      ? undefined
      : this.tickets().find((node) => node.id === target);

    return this.announced(this.engine.dispatch(
      DAY_ACTIONS.interruptionAccept,
      this.actor,
      target,
      {
        id: view.entry.id,
        // The whole bounded field, built where the shape of a ticket's
        // evidence is known, exactly as `recordTouches` builds it - so a
        // replay writes the identical string instead of rebuilding it against
        // a clock nobody saved.
        touches: ticket === undefined
          ? ''
          : withTouch(
            ticket.fields[FIELDS.touchLog],
            this.engine.now(),
            DAY_ACTIONS.interruptionAccept,
            true,
          ),
      },
    ));
  }

  /**
   * A choice, made, and every screen told about it in the same breath.
   *
   * The three verbs change what the day LOOKS like - a pushed interruption
   * stops owning the desk that instant and starts being a countdown - and
   * nothing else announces it, so the taskbar used to wait for the next minute
   * to find out. That is a full second at normal speed and, with the clock
   * paused, for ever: a player who postponed and immediately paused saw no
   * countdown at all and a desk that still looked taken. The windows never had
   * the problem because they repaint on world changes; the desktop reads the
   * DAY, so the day has to say something.
   *
   * Only on success, because a refused verb changed nothing.
   */
  private announced(result: DispatchResult): DispatchResult {
    if (result.ok) {
      this.announce();
    }

    return result;
  }

  public deferInterruption(): DispatchResult {
    const view = this.interruption();

    return view === null
      ? { ok: false, reason: NOTHING_RINGING }
      : this.announced(this.engine.dispatch(
        DAY_ACTIONS.interruptionDefer,
        this.actor,
        null,
        {
          id: view.entry.id,
          // The minute the button was pressed, stamped here because this is
          // the only place that knows it. A window buys its minutes from the
          // press, so a push at 14:21 against an arrival at 14:10 must still
          // buy the whole ten - and the world cannot work that out from a
          // count.
          spent_at: `${view.entry.id}@${String(this.engine.now())}`,
          // The same flag decline is given, because it answers the same
          // question for everything that carries no budget: an interruption
          // nobody may wave off is not one anybody may push twenty minutes out
          // either.
          declinable: view.entry.declinable ? 1 : 0,
          // And the budget it was AUTHORED with, never what is left of it. How
          // many are left is the world's arithmetic - this length, minus the
          // ledger - and a driver that sent the remainder would be a driver
          // telling the world how much of its own record to believe.
          postpones: view.entry.postpones.length,
        },
      ));
  }

  /**
   * Saying no, which the world decides the legality of.
   *
   * `declinable` is passed as the entry's own flag rather than checked here,
   * because the refusal has to come out of the action registry like every
   * other refusal in this game - the sentence a junior reads about not being
   * able to skip the sync is the WORLD's sentence, and a shell that hid the
   * button would have taught the same rule without ever saying it.
   */
  public declineInterruption(): DispatchResult {
    const view = this.interruption();

    if (view === null) {
      return { ok: false, reason: NOTHING_RINGING };
    }

    return this.announced(this.engine.dispatch(
      DAY_ACTIONS.interruptionDecline,
      this.actor,
      null,
      {
        id: view.entry.id,
        declinable: view.entry.declinable && !view.callback ? 1 : 0,
        // Which of the two true reasons this one refuses with. A machine's
        // decline was WITHDRAWN rather than never offered, and the sentence
        // the player reads is the world's either way - the shell only says
        // which register the entry is in, and `declineWithdrawn` decides that
        // off the source rather than off a content row.
        withdrawn: declineWithdrawn(view.entry) ? 1 : 0,
      },
    ));
  }

  /* -- the pressure layer ------------------------------------------------ */

  /**
   * Everything the shift does to you, at a fixed cadence.
   *
   * It runs on the tick rather than on real time, and only during the shift:
   * the morning brief is not paid and the scorecard is not work. Because it is
   * keyed to the simulation clock, a day replayed from the dispatch log
   * arrives at the same meters - which is the whole reason the deltas are
   * computed here and applied by the engine rather than the other way round.
   *
   * The order matters and is not arbitrary. Bounces first, so the reputation
   * they cost is in the world before anything reads it; the meters last, so
   * they see the day as it actually stands. Response marks are NOT here: they
   * belong to the minute the player touched the ticket, which is `dispatch`.
   */
  private applyPressure(now: number): void {
    if (this.state() !== 'shift' || !isMeterTick(now)) {
      return;
    }

    this.settleBounces(now);
    this.settleCrash(now);
    this.tickMeters(now);
  }

  /**
   * The bill for the can, billed once against the run that bought it.
   *
   * The watermark is the minute the can was opened, so a crash cannot be paid
   * for twice however often this runs - the same shape the meters use for
   * breaches, and for the same reason: this is a repeating tick settling a
   * one-off event.
   */
  private settleCrash(now: number): void {
    const run = this.drinkRun();

    if (run.startedAt === null) {
      return;
    }

    if (this.playerNumber(FIELDS.drinkCrashCharged, NO_RUN) === run.startedAt) {
      return;
    }

    if (now < crashStartsAt(run.startedAt, run.tolerance)) {
      return;
    }

    const result = this.engine.dispatch(
      DAY_ACTIONS.consumableCrash,
      this.actor,
      null,
      {
        stress_up: crashStress(run.tolerance),
        charged_for: run.startedAt,
      },
    );

    if (result.ok) {
      this.handlers.onNotice?.(
        'That is the can, then',
        'The lights are suddenly quite bright and the queue has not moved. '
        + 'It wears off. Everything does.',
      );
    }
  }

  private drinkRun(): DrinkState {
    return drinkState(
      this.engine.graph.getField(this.actor, FIELDS.drinkStartedAt),
      this.engine.graph.getField(this.actor, FIELDS.drinkTolerance),
    );
  }

  /** Text off the player node, or nothing at all when it is not there. */
  private playerText(field: string): string {
    const value = this.engine.graph.getField(this.actor, field);
    return typeof value === 'string' ? value : '';
  }

  /** A number off the player node, or the fallback when it is not one. */
  private playerNumber(field: string, fallback = 0): number {
    const value = this.engine.graph.getField(this.actor, field);
    return typeof value === 'number' && Number.isSafeInteger(value)
      ? value
      : fallback;
  }

  private tickets(): readonly ReadOnlyGraphNode[] {
    return this.engine.graph.nodesOfKind('ticket');
  }

  /** The unresolved tickets this node is part of the story of. */
  private ticketsAbout(target: NodeId): readonly ReadOnlyGraphNode[] {
    return this.tickets().filter(
      (ticket) => isUnresolved(ticket) && ticketNodes(ticket.id).includes(target),
    );
  }

  /**
   * What one dispatch meant to the tickets it was aimed at.
   *
   * Two records, both written now rather than worked out later. The response
   * clock stops on the first touch, whether or not a word was said to the
   * reporter and whether or not that touch also closed the ticket - somebody
   * who fixed the printer without saying anything did respond, they just did
   * it in the order techs actually do it. And the touch itself goes onto the
   * ticket, refusals included, because that is the handoff form's evidence and
   * it has to survive tonight's checkpoint.
   */
  private recordTouches(
    id: string,
    witnesses: readonly ReadOnlyGraphNode[],
    ok: boolean,
  ): void {
    if (witnesses.length === 0 || !countsAsWork(id)) {
      return;
    }

    const now = this.engine.now();

    for (const ticket of witnesses) {
      this.engine.dispatch(
        HELPDESK_ACTIONS.ticketRecordTouch,
        this.actor,
        ticket.id,
        {
          touches: withTouch(ticket.fields[FIELDS.touchLog], now, id, ok),
        },
      );

      if (ok && needsResponse(ticket)) {
        this.engine.dispatch(
          HELPDESK_ACTIONS.ticketRecordResponse,
          this.actor,
          ticket.id,
          {},
        );
      }
    }
  }

  /**
   * The bulk close, once the fault behind a flood has actually been fixed.
   *
   * Nobody presses a button for this: the children were attached to a parent
   * by the player, the parent closed because the world was repaired, and the
   * duplicates close the way the real workflow closes them - with the parent's
   * own last word to its reporter copied onto each of them.
   *
   * It is driven rather than derived because a comment is a WRITE, and writes
   * go through dispatched verbs. Each child is settled once: the marker on the
   * child is the watermark, the same shape the meters use for breaches, so
   * running this every tick and after every dispatch costs nothing and cannot
   * tell anybody twice.
   */
  private settleParentCascade(): void {
    const tickets = this.tickets();

    for (const due of cascadesDue(tickets)) {
      const parent = tickets.find((ticket) => ticket.id === due.parent);

      if (parent === undefined) {
        continue;
      }

      this.engine.dispatch(
        HELPDESK_ACTIONS.ticketResolveWithParent,
        this.actor,
        due.child,
        {
          parent: due.parent,
          comment: cascadeComment(
            ticketTitle(parent.id),
            parent.fields[FIELDS.replyToReporter],
          ),
        },
      );
    }
  }

  /** Second line, getting round to it. */
  private settleBounces(now: number): void {
    for (const ticket of this.tickets()) {
      const bounced = ticket.fields[FIELDS.handoffBouncedAt];
      const settled = ticket.fields[FIELDS.handoffSettledAt];

      if (typeof bounced !== 'number' || typeof settled === 'number') {
        continue;
      }

      if (now < bounceLandsAt(bounced)) {
        continue;
      }

      const result = this.engine.dispatch(
        HELPDESK_ACTIONS.ticketBounceHandoff,
        this.actor,
        ticket.id,
        {},
      );

      if (result.ok) {
        this.handlers.onNotice?.(
          'Returned by second line',
          `${ticketTitle(ticket.id)} - ${HANDOFF_BOUNCE.worknote}`,
        );
      }
    }
  }

  /** What the meters read on the player node right now. */
  private meterState(): MeterState {
    const read = (field: string): number => {
      const value = this.engine.graph.getField(this.actor, field);
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : 0;
    };

    return {
      stress: read(FIELDS.stress),
      suspicion: read(FIELDS.suspicion),
      reputation: read(FIELDS.reputation),
      suspicionEvents: read(FIELDS.suspicionEvents),
      breachesCharged: read(FIELDS.breachesCharged),
      resolveCreditPaid: read(FIELDS.resolveCreditPaid),
      dndWorkingTicks: read(FIELDS.dndWorkingTicks),
      dndSuspicionCharged: read(FIELDS.dndSuspicionCharged),
    };
  }

  private tickMeters(now: number): void {
    const tickets = this.tickets();
    const state = this.meterState();
    const deltas = meterDeltas({
      // Everything that is still somebody's problem and is not parked - a
      // breached ticket very much included. The printer does not start working
      // because its SLA ran out, and a queue that stopped counting it would
      // pay the player to let the next one go the same way.
      openTickets: tickets.filter(isActiveWork).length,
      breachedTickets: tickets.filter(
        (ticket) => ticket.fields[FIELDS.breached] === true,
      ).length,
      breachesCharged: state.breachesCharged,
      resolveCredit: resolveCredit(tickets),
      resolveCreditPaid: state.resolveCreditPaid,
      openSlackApps: this.handlers.openSlackApps(),
      focusedSlackApp: this.handlers.focusedSlackApp(),
      lunch: isLunchtime(now),
      // The dot's minutes, COUNTED rather than sampled here: everything the
      // meters are told about the status is a number of minutes that actually
      // were do-not-disturb-while-working, read off the graph a minute at a
      // time between watermarks. The pair of instant readings this used to be
      // made a rule about two moments a day.
      dndWorkingMinutes: this.dndAccrued(now),
      dndWorkingTicks: state.dndWorkingTicks,
      dndSuspicionCharged: state.dndSuspicionCharged,
    });

    if (!movesAnything(state, deltas)) {
      return;
    }

    this.engine.dispatch(DAY_ACTIONS.metersTick, this.actor, null, {
      stress_up: deltas.stressUp,
      stress_down: deltas.stressDown,
      suspicion_up: deltas.suspicionUp,
      suspicion_down: deltas.suspicionDown,
      reputation_up: deltas.reputationUp,
      reputation_down: deltas.reputationDown,
      suspicion_events_up: deltas.suspicionEvent ? 1 : 0,
      breaches_charged: deltas.breachesCharged,
      resolve_credit_paid: deltas.resolveCreditPaid,
      // The evidence half of the drip. Nought on every interval of every day
      // nobody sets a dot on, and the world writes nothing for a nought -
      // which is what keeps this off the player node of a scripted week.
      dnd_ticks_up: deltas.dndWorkingTicks,
      dnd_charged: deltas.dndSuspicionCharged,
      dnd_billed_to: now,
    });
  }

  /**
   * How many of the minutes since the last watermark were the dot lying.
   *
   * The heart of the fix this slice needed after review: a minute counts when
   * the status was do not disturb, the touch log says the queue was being
   * worked, and it was not lunch - and it is counted ONE MINUTE AT A TIME
   * between two watermarks rather than read once at a meter boundary.
   *
   * The old shape sampled the pair at the boundary and charged for the whole
   * interval or none of it, which made the drip a rule about two instants a
   * day: a player who raised the dot just after each tick and dropped it just
   * before the next one dodged every call in the morning and paid nothing at
   * all for it, and one who dropped it a minute early erased five minutes they
   * had genuinely spent behind it. Every one of the inputs below is historical
   * - the touch log carries minutes, lunch is arithmetic, and the STATUS is
   * pinned to its own segment by `presence.set` moving the watermark - so the
   * question "how much of that window was a lie" has one answer, and it is the
   * same answer on both sides of a save.
   */
  private dndAccrued(now: number): number {
    if (this.presence() !== 'dnd') {
      return 0;
    }

    // Never earlier than this morning: a dot left on overnight is not a claim
    // about minutes nobody was at the desk for, and the record it is evidence
    // for is cleared every morning anyway.
    const from = Math.max(
      this.playerNumber(FIELDS.dndBilledTo),
      shiftStartTick(this.day()),
    );
    const touches = this.touchTicks();
    let minutes = 0;

    for (let tick = from + 1; tick <= now; tick += 1) {
      if (
        !isLunchtime(tick)
        && touches.some(
          (touch) => touch <= tick && tick - touch <= DND_WORKING_TICKS,
        )
      ) {
        minutes += 1;
      }
    }

    return minutes;
  }

  /** Every minute the queue was touched in, which is what "working" means. */
  private touchTicks(): readonly number[] {
    return this.tickets().flatMap(
      (ticket) => triedFromTouches(ticket.fields[FIELDS.touchLog])
        .map((touch) => touch.tick),
    );
  }

  /**
   * Closes the books on the status that is about to be replaced.
   *
   * Called before the dot changes, and that is what makes the integral above
   * exact: the minutes of the segment ending now are banked at the minute it
   * ends, so nothing about the next status can erase them and nothing about
   * the last one can be charged to it. It banks the MINUTES only - what they
   * are worth in suspicion is settled at the meter boundary off the total,
   * because the rate is two points per five minutes and a fraction of a point
   * is not a thing this world charges.
   */
  private settleDrip(now: number): void {
    const minutes = this.dndAccrued(now);
    const state = this.meterState();

    this.engine.dispatch(DAY_ACTIONS.metersTick, this.actor, null, {
      stress_up: 0,
      stress_down: 0,
      suspicion_up: 0,
      suspicion_down: 0,
      reputation_up: 0,
      reputation_down: 0,
      suspicion_events_up: 0,
      // Untouched: this is not the interval's settlement, it is the closing of
      // one status's books inside it, and handing back the watermarks it found
      // is what keeps it from billing anything twice.
      breaches_charged: state.breachesCharged,
      resolve_credit_paid: state.resolveCreditPaid,
      dnd_ticks_up: minutes,
      dnd_charged: state.dndSuspicionCharged,
      dnd_billed_to: now,
    });
  }

  /**
   * Somebody noticing the Away dot, which is what the Away dot costs.
   *
   * The trigger is a dispatch that COUNTS AS WORK - the same filter the touch
   * log uses - because the lie is not the status, it is the status held while
   * demonstrably doing the job on somebody else's ticket. Reading a knowledge
   * base article while away is being away.
   *
   * One person per dispatch and one per person per day, and the person is the
   * one who has been waiting longest for a first word. Stinging every waiting
   * reporter at once would be four reputation hits in one minute for one
   * click, which is the drumbeat the spec forbids; the queue has all afternoon
   * to work through them one at a time, which is also how it happens.
   */
  private settleAwayNoticed(id: string, ok: boolean): void {
    if (!ok || !countsAsWork(id) || this.presence() !== 'away') {
      return;
    }

    const already = this.playerText(FIELDS.presenceNoticed).split('\n');
    let waiting: { ticket: string; reporter: NodeId; since: number } | null = null;

    for (const ticket of this.tickets()) {
      if (!isUnresolved(ticket) || !needsResponse(ticket)) {
        continue;
      }

      const reporter = findWorldTicket(ticket.id)?.def.reporter;

      if (
        reporter === undefined
        // Nobody notices their own dot. The desk's own faults are raised by
        // the person sitting at it - the fan that has been grinding since
        // Monday is Pat's own ticket - and a reputation hit for keeping
        // YOURSELF waiting is a fine with nobody on the other end of it, plus
        // a chat line from the player to the player.
        || reporter === this.actor
        // The world keeps the same list and refuses the second one itself.
        // This is the driver picking somebody who has not already had their
        // thought rather than dispatching into a refusal, which is the only
        // reason it reads the record at all.
        || already.includes(reporter)
      ) {
        continue;
      }

      const since = ticket.fields[FIELDS.spawnedAt];
      const at = typeof since === 'number' ? since : 0;

      if (waiting === null || at < waiting.since) {
        waiting = { ticket: ticket.id, reporter, since: at };
      }
    }

    if (waiting === null) {
      return;
    }

    const noticed = this.engine.dispatch(
      WORLD_ACTIONS.presenceNoticed,
      this.actor,
      null,
      {
        // One parameter, and it is the person. The uniqueness key used to be a
        // `person@day` line assembled here, which put the world's own
        // once-per-day rule in the hands of whoever dispatched it; the record
        // is now cleared every morning by the shift starting, so the reporter
        // IS the key and there is nothing left to spell.
        reporter: waiting.reporter,
        reputation_down: AWAY_NOTICED_REPUTATION,
      },
    );

    if (!noticed.ok) {
      return;
    }

    this.handlers.onPresenceNoticed?.(
      waiting.reporter,
      waiting.ticket,
      this.engine.now(),
    );
    this.handlers.onNotice?.(
      'Somebody has noticed',
      `${ticketTitle(waiting.ticket)} - they can see the dot, they can see `
      + 'the ticket you just worked, and they have drawn the obvious '
      + 'conclusion about which of those two things you were doing instead of '
      + 'answering them.',
    );
  }

  /** Returns true when the transition it made ended the day. */
  private applyDueTransition(): boolean {
    const due = dueTransition(this.state(), this.engine.now());

    if (due === null) {
      return false;
    }

    this.dispatchDay(
      due === 'shift' ? DAY_ACTIONS.startShift : DAY_ACTIONS.endShift,
      {},
    );
    // The clock the deadlines are measured against follows the day it belongs
    // to, in the same breath as the transition rather than at the top of the
    // next minute: a shift that ended at 17:00 must not sell 17:01 as work.
    this.syncSlaClock();
    this.announce();

    if (due === 'day_end' && this.probationOver()) {
      this.handlers.onBeerUnlocked?.();
    }

    return due === 'day_end';
  }

  /** Friday evening, review passed: the fridge stops being a joke. */
  private probationOver(): boolean {
    return isReviewDay(this.day()) && this.reviewOutcome() === 'passed';
  }

  /**
   * A day verb the driver itself asked for. A refusal here is not a player
   * mistake the UI can explain away - it means the day state and the clock
   * disagree about what day it is, and every screen after it would be wrong.
   */
  private dispatchDay(id: string, params: Record<string, number>): void {
    const result = this.engine.dispatch(id, this.actor, null, params);

    if (!result.ok) {
      throw new Error(`The day could not move: ${result.reason}`);
    }
  }

  private announce(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
