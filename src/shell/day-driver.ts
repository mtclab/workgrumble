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

import type { EngineApi, NodeId, ReadOnlyGraphNode } from '../engine-api';
import { DAY_ACTIONS, HELPDESK_ACTIONS } from '../world/actions';
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
  isDayState,
  isLunchtime,
  shiftStartTick,
} from '../world/day';
import { FIELDS } from '../world/fields';
import {
  isMeterTick,
  meterDeltas,
  type MeterState,
  movesAnything,
} from '../world/meters';
import { needsResponse } from '../world/sla';
import {
  bounceLandsAt,
  findWorldTicket,
  HANDOFF_BOUNCE,
  resolveCredit,
  ticketArrivalPool,
  ticketNodes,
  ticketTitle,
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

/**
 * What the apps and the taskbar may ask of the day. Reading is free; the two
 * things that MOVE it are the two the player does - start the shift, clock
 * off - and both go through the engine's action registry like everything else.
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
  /** Something the player ought to be told about. */
  onNotice?(title: string, body: string): void;
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
      const before = this.engine.now();
      this.engine.advance(1);
      const now = this.engine.now();

      if (now === before) {
        return;
      }

      this.spawnArrivals(before, now);
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

    this.dispatchDay(DAY_ACTIONS.startShift, {});
    const start = shiftStartTick(this.day());
    const now = this.engine.now();

    if (now < start) {
      this.engine.advance(start - now);
      this.spawnArrivals(now, this.engine.now());
    }

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
    const slip = daySlip(dayLedger(this.engine.graph.nodesOfKind('ticket'), day));
    const banked = this.farmFund() + slip.net;

    this.dispatchDay(DAY_ACTIONS.clockOff, { banked });

    const morning = dayOpensTick(day + 1);
    const now = this.engine.now();

    if (now < morning) {
      this.engine.advance(morning - now);
    }

    this.schedule_ = this.scheduleFor(day + 1);
    this.spawnArrivals(now, this.engine.now());
    this.carriedMs = 0;
    this.engine.checkpoint();
    this.announce();
    this.handlers.onDayBoundary();
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

  private scheduleFor(day: number): DaySchedule {
    return buildDaySchedule(day, this.seed, ticketArrivalPool());
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

      const entry = findWorldTicket(arrival.ticketId);

      if (entry === undefined) {
        throw new Error(
          `The day schedule names a ticket nobody wrote: "${arrival.ticketId}".`,
        );
      }

      this.engine.registerTicket(entry.def);
    }
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
   * The order matters and is not arbitrary. Response marks first, so a ticket
   * touched this minute is not still counted as untouched; bounces next, so
   * the reputation they cost is in the world before anything reads it; the
   * meters last, so they see the day as it actually stands.
   */
  private applyPressure(now: number): void {
    if (this.state() !== 'shift' || !isMeterTick(now)) {
      return;
    }

    this.recordResponses();
    this.settleBounces(now);
    this.tickMeters(now);
  }

  private tickets(): readonly ReadOnlyGraphNode[] {
    return this.engine.graph.nodesOfKind('ticket');
  }

  /**
   * The other way a response clock stops: not a word to the reporter, but a
   * dispatched action on the thing that is broken. Somebody who fixed the
   * printer without saying anything did respond - they just did it in the
   * order techs actually do it.
   */
  private recordResponses(): void {
    const log = this.engine.dispatchLog();

    for (const ticket of this.tickets()) {
      if (!needsResponse(ticket)) {
        continue;
      }

      const nodes = new Set(ticketNodes(ticket.id));

      if (nodes.size === 0) {
        continue;
      }

      const touched = log.some(
        (entry) => entry.ok && entry.target !== null && nodes.has(entry.target),
      );

      if (touched) {
        this.engine.dispatch(
          HELPDESK_ACTIONS.ticketRecordResponse,
          this.actor,
          ticket.id,
          {},
        );
      }
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
      // A parked ticket is not on your plate this minute, which is half the
      // reason parking one is a relief rather than a formality.
      openTickets: tickets.filter(
        (ticket) => ticket.fields[FIELDS.state] === 'open',
      ).length,
      breachedTickets: tickets.filter(
        (ticket) => ticket.fields[FIELDS.breached] === true,
      ).length,
      breachesCharged: state.breachesCharged,
      resolveCredit: resolveCredit(tickets),
      resolveCreditPaid: state.resolveCreditPaid,
      openSlackApps: this.handlers.openSlackApps(),
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
    this.announce();
    return due === 'day_end';
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
