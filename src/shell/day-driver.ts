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
import { DAY_ACTIONS, fieldLines, HELPDESK_ACTIONS } from '../world/actions';
import {
  type BossPing,
  type BossVisit,
  buildPatrolSchedule,
  CAUGHT_REPUTATION_COST,
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
} from '../world/day';
import {
  dayPlan,
  isReviewDay,
  isReviewOutcome,
  isWeekDay,
  patrolSeedFor,
  type ReviewOutcome,
  reviewOutcomeFor,
  reviewTick,
  type WeekScorecard,
  weekScorecard,
} from '../world/week';
import { FIELDS } from '../world/fields';
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
  HANDOFF_BOUNCE,
  resolveCredit,
  spawnWorldTicket,
  ticketNodes,
  ticketTitle,
  withTouch,
} from '../world/tickets';

/** Real milliseconds one simulated minute takes at normal speed. */
export const TICK_INTERVAL_MS = 1_000;

/** How often the driver is asked to convert. Shorter than a tick so a faster
 * clock is a faster clock rather than a burst once a second. */
export const DRIVER_INTERVAL_MS = 250;

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
  private paused_ = false;
  private speed_: Speed = 1;
  private carriedMs = 0;
  private readonly listeners = new Set<() => void>();

  public constructor(
    private readonly engine: EngineApi,
    private readonly actor: NodeId,
    private readonly seed: number,
    private readonly handlers: Readonly<DayDriverHandlers>,
  ) {
    this.schedule_ = this.scheduleFor(this.day());
    this.patrol_ = this.patrolFor(this.day());
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
    const now = this.engine.now();

    return this.engine.dispatch(DAY_ACTIONS.consumableDrink, this.actor, null, {
      tolerance: nextTolerance(this.drinkRun(), now),
      pence: DRINK_PRICE_PENCE,
    });
  }

  public tidyDesk(): DispatchResult {
    return this.engine.dispatch(DAY_ACTIONS.deskTidy, this.actor, null, {});
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
    // Read BEFORE: this dispatch may resolve the ticket it is about, and a
    // fix that closes a ticket is still the first time anybody touched it.
    const witnesses = target === null ? [] : this.ticketsAbout(target);
    const result = this.engine.dispatch(id, actor, target, params);
    this.recordTouches(id, witnesses, result.ok);
    // A fix that closed a parent has closed forty other people's tickets as
    // well, and they should hear about it in the minute it happened rather
    // than at the top of the next one.
    this.settleParentCascade();
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
    return !this.paused_ && clockRuns(this.state());
  }

  /**
   * One turn of the real clock. Ticks are applied one at a time so that
   * everything a tick causes - an arrival, a breach, the end of the day -
   * happens in the minute it belongs to rather than at the end of a batch.
   */
  public step(elapsedMs: number): void {
    if (!this.running()) {
      this.carriedMs = 0;
      return;
    }

    const elapsed = ticksFromElapsed(elapsedMs, this.speed_, this.carriedMs);
    this.carriedMs = elapsed.carriedMs;

    for (let tick = 0; tick < elapsed.ticks; tick += 1) {
      // Before the minute is spent, not after: the engine decides whether the
      // minute it is about to step counts against every open deadline, and it
      // decides it from the state the day is in as that minute begins.
      this.syncSlaClock();
      const before = this.engine.now();
      this.engine.advance(1);
      const now = this.engine.now();

      if (now === before) {
        return;
      }

      this.spawnArrivals(before, now);
      this.walkTheFloor(before, now);
      this.settleReview(before, now);
      // Before the meters read the queue: a child closed by its parent is a
      // ticket off the pile this minute, and charging stress for it would be
      // charging for work that is finished.
      this.settleParentCascade();
      this.applyPressure(now);

      if (this.applyDueTransition()) {
        // The day ended inside this batch. The rest of the batch belongs to
        // tomorrow, and tomorrow has not been started yet.
        this.carriedMs = 0;
        return;
      }
    }
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
      this.engine.advance(start - now);
      this.spawnArrivals(now, this.engine.now());
    }

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

    this.dispatchDay(DAY_ACTIONS.clockOff, { banked });

    const morning = dayOpensTick(day + 1);
    const now = this.engine.now();

    if (now < morning) {
      this.engine.advance(morning - now);
    }

    this.schedule_ = this.scheduleFor(day + 1);
    this.patrol_ = this.patrolFor(day + 1);
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
    return weekScorecard(this.engine.graph.nodesOfKind('ticket'), {
      banked: this.farmFund(),
      opening: this.playerNumber(FIELDS.weekOpeningFund),
      reputation: this.playerNumber(FIELDS.reputation),
      outcome: this.reviewOutcome(),
    });
  }

  /** The bottle in the fridge with your name on it. */
  public beer(): DispatchResult {
    return this.engine.dispatch(
      DAY_ACTIONS.consumableBeer,
      this.actor,
      null,
      {},
    );
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
    this.schedule_ = this.scheduleFor(this.day());
    this.patrol_ = this.patrolFor(this.day());
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
   * The world decides which way it goes - both verbs are guarded on the
   * reputation that earns them - so all this does is offer the one the meters
   * support and hand the answer to the shell, which is where a scene lives.
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

    const outcome = reviewOutcomeFor(this.playerNumber(FIELDS.reputation));
    const result = this.engine.dispatch(
      outcome === 'passed'
        ? DAY_ACTIONS.reviewPassed
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
      this.seed,
      isWeekDay(day) ? dayPlan(day) : { inherited: [], drip: [] },
    );
  }

  private patrolFor(day: number): PatrolSchedule {
    return buildPatrolSchedule(
      day,
      isWeekDay(day) ? patrolSeedFor(day, this.seed) : this.seed,
    );
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
        { reputation_cost: CAUGHT_REPUTATION_COST },
      );

      if (result.ok) {
        this.handlers.onCaught?.(caught, visit.arrivalTick);
      }
    }

    if (!emptiesNoticed(this.playerNumber(FIELDS.deskCans))) {
      return;
    }

    const noticed = this.engine.dispatch(
      DAY_ACTIONS.bossNoticedEmpties,
      this.actor,
      null,
      { suspicion_up: EMPTIES_SUSPICION_BUMP },
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
            fieldLines(parent.fields[FIELDS.customerVisible]),
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
