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
  type InterruptionEntry,
  type InterruptionPlan,
  type InterruptionSchedule,
  isBenign,
  placeDeferred,
} from '../world/interruptions';
import { matrixSummary, poolStanding } from '../world/pool';
import {
  beatAt,
  type PressureBeat,
  type PressureReading,
  PROBATION_WEEK,
  pressureSummary,
  seasonAt,
  telegraph,
} from '../world/pressure';
import { caughtScene, GENERIC_CAUGHT_SCENE } from '../world/scenes';
import {
  dayPlan,
  directMessagesOn,
  incidentsOn,
  interruptionPlanFor,
  isReviewDay,
  isReviewOutcome,
  isWeekDay,
  patrolSeedFor,
  type ReviewOutcome,
  REVIEW_PASS_PERFORMANCE,
  reviewOutcomeFor,
  reviewTick,
  type WeekScorecard,
  weekScorecard,
  weekStanding,
  weekWorkThrough,
} from '../world/week';
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

export const SPEEDS = [1, 2, 4] as const;

export type Speed = (typeof SPEEDS)[number];

export function isSpeed(value: unknown): value is Speed {
  return SPEEDS.some((speed) => speed === value);
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
  /** Whether this is the second arrival, which is nobody's to decline. */
  readonly callback: boolean;
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
   * The lead has arrived and there was something on the screen. The world has
   * already been told - suspicion, reputation and the count are moved before
   * this is called - and what is left is the scene, which is the shell's.
   */
  onCaught?(appId: string, tick: number): void;
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
    if (this.blockedByTakeover()) {
      return { ok: false, reason: IN_A_MEETING_REASON };
    }

    const now = this.engine.now();

    return this.engine.dispatch(DAY_ACTIONS.consumableDrink, this.actor, null, {
      tolerance: nextTolerance(this.drinkRun(), now),
      pence: DRINK_PRICE_PENCE,
    });
  }

  public tidyDesk(): DispatchResult {
    return this.blockedByTakeover()
      ? { ok: false, reason: IN_A_MEETING_REASON }
      : this.engine.dispatch(DAY_ACTIONS.deskTidy, this.actor, null, {});
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
    if (this.blockedByTakeover()) {
      return { ok: false, reason: IN_A_MEETING_REASON };
    }

    // Read BEFORE: this dispatch may resolve the ticket it is about, and a
    // fix that closes a ticket is still the first time anybody touched it.
    const witnesses = target === null ? [] : this.ticketsAbout(target);
    const result = this.engine.dispatch(id, actor, target, params);
    this.recordTouches(id, witnesses, result.ok);
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
    this.settleStaleAuth(now);
    this.settleFollowUps();
    this.walkTheFloor(before, now);
    // After the corridor, in the same minute: the lead arriving is a takeover
    // too, and the assert inside this one is entitled to see it. Before the
    // meters, because being taken off the work is a thing that happened to
    // this minute and the interval that charges for the queue has to read a
    // world the interruption has already moved.
    this.settleInterruptions(before, now);
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
    return this.blockedByTakeover()
      ? { ok: false, reason: IN_A_MEETING_REASON }
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
    return interruptionPlanFor(day, this.seed_);
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
        },
      );

      if (result.ok) {
        // And the price, which is the clock rather than the scoreboard: he is
        // here now, and getting back to what you were doing is the rest of it.
        this.owedMinutes_ += CAUGHT_MINUTES;
        this.handlers.onCaught?.(caught, visit.arrivalTick);
        this.handlers.onNotice?.(
          `That is ${String(CAUGHT_MINUTES)} minutes`,
          'He was at the desk for a while and the queue was not. The shift is '
          + `${String(CAUGHT_MINUTES)} minutes shorter than it was and not one `
          + 'deadline moved with it. Nothing came off your reputation. A line '
          + 'has gone on your file, which you can read.',
        );
      }
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
        answered: this.hasDecided(FIELDS.interruptionAnswered, entry.id),
        benign: isBenign(entry, ticketInHand),
        ticketInHand,
      };
    }

    return null;
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
    const live: InterruptionEntry[] = [];

    for (const entry of this.interruptions_.entries) {
      // Declining is the one answer that hands the screen straight back, so a
      // declined entry owns no minutes at all from the minute it was refused.
      if (this.hasDecided(FIELDS.interruptionDeclined, entry.id)) {
        continue;
      }

      // WHERE it is comes first, and it is asked of the world rather than of
      // what has been decided since. An entry somebody pushed back lives at
      // the minute the callback was placed on, and it goes on living there
      // once it has been answered - the conversation is happening, and it is
      // happening in the callback's window rather than in the one twenty
      // minutes earlier that nobody was in.
      //
      // Reading those two questions in the wrong order is a real bug and was
      // one: an answered callback fell back to the ORIGINAL entry, whose
      // minutes were long past, so `interruption()` went null the instant the
      // player picked the phone up and the conversation vanished out from
      // under them.
      const placed = this.hasDecided(FIELDS.interruptionDeferred, entry.id)
        ? placeDeferred(entry, this.interruptions_, this.interruptionsBlocked_)
        : entry;

      // A callback with nowhere left in the day to go is a call that never
      // came back, which is a thing that happens.
      if (placed !== null) {
        live.push(placed);
      }
    }

    return live;
  }

  /**
   * Whether something is holding the screen in a way that makes work
   * impossible rather than merely awkward.
   *
   * A MEETING does. A ringing phone deliberately does not: a call is a window,
   * the normal rules keep applying underneath one, and being on the phone has
   * never been a defence for anything. The line is drawn on the source rather
   * than on "is a takeover on" so that the two stay different things.
   *
   * It is checked in the driver rather than in each surface because the shell
   * has five ways to reach a verb and a rule enforced in four of them is a
   * rule with a hole in it - which is exactly what the pointer-events version
   * of this was: a terminal with the keyboard still submitted commands.
   */
  private blockedByTakeover(): boolean {
    return this.interruption()?.entry.source === 'meeting';
  }

  /** Whether an id is in one of the three lists the world keeps. */
  private hasDecided(field: string, id: string): boolean {
    return this.playerText(field).split('\n').includes(id);
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

    for (const entry of this.liveInterruptions()) {
      if (entry.tick > after && entry.tick <= now) {
        this.arrive(entry);
      }

      // The far side of it, whatever happened in between. The meeting settles
      // what it owes the world here, which is why this runs on the END rather
      // than on a button: nobody presses "the meeting is over".
      if (entry.endsTick > after && entry.endsTick <= now) {
        this.finish(entry);
      }
    }
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

    const benign = isBenign(entry, this.ticketInHand());
    const stress = arrivalStress(entry, benign);

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

    return this.engine.dispatch(
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
    );
  }

  public deferInterruption(): DispatchResult {
    const view = this.interruption();

    return view === null
      ? { ok: false, reason: NOTHING_RINGING }
      : this.engine.dispatch(DAY_ACTIONS.interruptionDefer, this.actor, null, {
        id: view.entry.id,
        // The same flag decline is given, because it answers the same
        // question: an interruption nobody may wave off is not one anybody
        // may push twenty minutes out either.
        declinable: view.entry.declinable ? 1 : 0,
      });
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

    return this.engine.dispatch(
      DAY_ACTIONS.interruptionDecline,
      this.actor,
      null,
      {
        id: view.entry.id,
        declinable: view.entry.declinable && !view.callback ? 1 : 0,
      },
    );
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
    });
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
