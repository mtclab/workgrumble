import { beforeAll, describe, expect, it, vi } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import {
  buildDaySchedule,
  DAY_RATE_PENCE,
  dayLedger,
  daySlip,
  lunchWindow,
  shiftEndTick,
  shiftStartTick,
} from '../world/day';
import { FIELDS } from '../world/fields';
import { BOSS_TRAP_TICKET, buildPatrolSchedule } from '../world/boss';
import { NO_RUN } from '../world/consumables';
import {
  COMFORTABLE_QUEUE,
  METER_CEILING,
  METER_INTERVAL_TICKS,
  STARTING_REPUTATION,
  STRESS_PER_BREACH,
  STRESS_PER_EXCESS_TICKET,
} from '../world/meters';
import { createWorldSession, WORLD_SEED } from '../world/session';
import { SLA_TARGETS, UNTRIAGED_PRIORITY } from '../world/priority';
import { isActiveWork, ticketClocks } from '../world/sla';
import {
  actionSummary,
  HANDOFF_BOUNCE,
  ticketArrivalPool,
  TIDIED_LIST,
  triedFromTouches,
} from '../world/tickets';
import {
  DayDriver,
  TICK_INTERVAL_MS,
  ticksFromElapsed,
} from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Harness {
  readonly driver: DayDriver;
  readonly engine: ReturnType<typeof createWorldSession>['engine'];
  readonly boundaries: () => number;
  readonly notices: () => readonly string[];
  /** What the shell would say is on screen. The tests move it about. */
  readonly slack: Screen;
}

/**
 * The screen, as the driver is allowed to see it: what is up, and which one
 * the player is in. Two questions rather than one, because the meters ask two.
 */
interface Screen {
  open: readonly string[];
  focused: string | null;
}

/** Opening windows: the last one opened is the one in front. */
function show(slack: Screen, apps: readonly string[]): void {
  slack.open = apps;
  slack.focused = apps[apps.length - 1] ?? null;
}

function harness(): Harness {
  const { engine } = createWorldSession();
  const onDayBoundary = vi.fn();
  const notices: string[] = [];
  const slack: Screen = { open: [], focused: null };
  const driver = new DayDriver(engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary,
    openSlackApps: () => slack.open,
    focusedSlackApp: () => slack.focused,
    onNotice: (title) => {
      notices.push(title);
    },
  });

  return {
    driver,
    engine,
    boundaries: () => onDayBoundary.mock.calls.length,
    notices: () => notices,
    slack,
  };
}

/** The one ticket that is not waiting for the player at 08:00. */
const DRIP_TICKET = TIDIED_LIST.def.id;

/**
 * The minute it lands on day one, from the shipped seed. Not a magic number:
 * `buildDaySchedule` produces it, and the test asserts the driver deals it on
 * the same one.
 */
const DRIP_ARRIVAL_TICK = buildDaySchedule(1, WORLD_SEED, ticketArrivalPool())
  .arrivals.find((entry) => entry.ticketId === TIDIED_LIST.def.id)?.tick ?? -1;

/** When the lead sends his first message on day one of the shipped seed. */
const FIRST_PING_TICK = buildPatrolSchedule(1, WORLD_SEED).pings[0]?.tick ?? 0;

/** Real milliseconds that buy `ticks` simulated minutes at normal speed. */
function realMs(ticks: number): number {
  return ticks * TICK_INTERVAL_MS;
}

describe('turning real time into ticks', () => {
  it('keeps the remainder instead of losing it four times a second', () => {
    expect(ticksFromElapsed(250, 1, 0)).toEqual({ ticks: 0, carriedMs: 250 });
    expect(ticksFromElapsed(250, 1, 750)).toEqual({ ticks: 1, carriedMs: 0 });

    // A quarter-second at x4 is a whole minute; at x2 it is half of one.
    expect(ticksFromElapsed(250, 4, 0)).toEqual({ ticks: 1, carriedMs: 0 });
    expect(ticksFromElapsed(250, 2, 0)).toEqual({ ticks: 0, carriedMs: 500 });

    // Four quarter-seconds at x2 are two minutes, not one and a bit lost.
    let carriedMs = 0;
    let ticks = 0;

    for (let step = 0; step < 4; step += 1) {
      const converted = ticksFromElapsed(250, 2, carriedMs);
      ticks += converted.ticks;
      carriedMs = converted.carriedMs;
    }

    expect(ticks).toBe(2);
    expect(carriedMs).toBe(0);
  });

  it('refuses time and speeds that are not either', () => {
    expect(() => ticksFromElapsed(-1, 1, 0)).toThrow(TypeError);
    expect(() => ticksFromElapsed(Number.NaN, 1, 0)).toThrow(TypeError);
    expect(() => ticksFromElapsed(250, 3, 0)).toThrow(TypeError);
    expect(() => ticksFromElapsed(250, 1, -5)).toThrow(TypeError);
  });
});

describe('the day driver', () => {
  it('runs the morning, and the player skips the rest of it', () => {
    const { driver, engine } = harness();

    expect(driver.day()).toBe(1);
    expect(driver.state()).toBe('morning_brief');
    expect(engine.now()).toBe(0);

    // The morning hour is real time: the player is at the desk, reading.
    driver.step(realMs(5));
    expect(engine.now()).toBe(5);
    expect(driver.state()).toBe('morning_brief');

    driver.startShift();
    expect(driver.state()).toBe('shift');
    expect(engine.now()).toBe(shiftStartTick(1));

    // And it cannot be started twice, from the button or from the clock.
    driver.startShift();
    expect(engine.now()).toBe(shiftStartTick(1));
  });

  it('starts the shift on its own at 09:00 for a player who dawdles', () => {
    const { driver, engine } = harness();

    driver.step(realMs(59));
    expect(driver.state()).toBe('morning_brief');

    driver.step(realMs(1));
    expect(engine.now()).toBe(shiftStartTick(1));
    expect(driver.state()).toBe('shift');
  });

  /**
   * 17:00 is a wall, not a milestone. A day end that kept converting would
   * scroll the player's own results past them, so the clock stops there and
   * only clocking off moves it.
   */
  it('stops the clock dead at the day end', () => {
    const { driver, engine } = harness();
    driver.startShift();

    driver.step(realMs(shiftEndTick(1)));
    expect(driver.state()).toBe('day_end');
    expect(engine.now()).toBe(shiftEndTick(1));

    driver.step(realMs(120));
    expect(engine.now()).toBe(shiftEndTick(1));
    expect(driver.state()).toBe('day_end');
  });

  it('pauses and changes speed without the engine clock knowing', () => {
    const { driver, engine } = harness();
    driver.startShift();
    const start = engine.now();

    driver.setPaused(true);
    driver.step(realMs(30));
    expect(engine.now()).toBe(start);

    driver.setPaused(false);
    driver.step(realMs(10));
    expect(engine.now()).toBe(start + 10);

    driver.setSpeed(4);
    driver.step(realMs(10));
    expect(engine.now()).toBe(start + 50);

    driver.setSpeed(2);
    driver.step(realMs(10));
    expect(engine.now()).toBe(start + 70);
  });

  /** A pause must not bank real time and hand it over as a jump on resume. */
  it('drops the part-converted time it was holding when it pauses', () => {
    const { driver, engine } = harness();
    driver.startShift();
    const start = engine.now();

    driver.step(750);
    driver.setPaused(true);
    driver.setPaused(false);
    driver.step(250);

    expect(engine.now()).toBe(start);
    driver.step(750);
    expect(engine.now()).toBe(start + 1);
  });

  /**
   * The day boundary: the day is paid, the money is banked in the graph, the
   * night passes, and the dispatch log starts again from a checkpoint.
   */
  it('pays the day, sleeps through the night and drains the log', () => {
    const { driver, engine, boundaries } = harness();
    driver.startShift();
    driver.step(realMs(shiftEndTick(1)));
    expect(driver.state()).toBe('day_end');

    const slip = daySlip(dayLedger(engine.graph.nodesOfKind('ticket'), 1));
    expect(engine.dispatchLog().length).toBeGreaterThan(0);
    expect(engine.logCheckpoint().hash).toBeNull();

    driver.clockOff();

    expect(engine.graph.getField(COMPANY_IDS.player, FIELDS.farmFund))
      .toBe(slip.net);
    expect(driver.day()).toBe(2);
    expect(driver.state()).toBe('morning_brief');
    expect(engine.now()).toBe(1_440);
    expect(boundaries()).toBe(1);

    // The log now starts from this morning, and the baseline is this world.
    expect(engine.dispatchLog()).toEqual([]);
    expect(engine.logCheckpoint()).toEqual({
      tick: 1_440,
      hash: engine.snapshotHash(),
      entries: 0,
    });

    // A second day banks on top of the first rather than replacing it.
    driver.startShift();
    driver.step(realMs(shiftEndTick(2)));
    driver.clockOff();
    expect(engine.graph.getField(COMPANY_IDS.player, FIELDS.farmFund))
      .toBeGreaterThanOrEqual(slip.net + DAY_RATE_PENCE - 500);
    expect(boundaries()).toBe(2);
  });

  /**
   * The other half of what a queue does to you: something arrives while you
   * are working. Everything else in the shipped world is waiting at 08:00,
   * which a player can read before the shift starts and plan around; this one
   * lands on a minute the seeded schedule picks, announces itself, and is in
   * the queue from then on.
   */
  it('drips the afternoon ticket in on the minute the schedule says', () => {
    const { driver, engine } = harness();
    const spawned: string[] = [];
    engine.onEvent((event) => {
      if (event.type === 'ticket:spawned' && event.id === DRIP_TICKET) {
        spawned.push(event.id);
      }
    });

    const arrival = driver.schedule().arrivals.find(
      (entry) => entry.ticketId === DRIP_TICKET,
    );
    expect(arrival?.tick).toBe(DRIP_ARRIVAL_TICK);
    // Early afternoon: after lunch is over, and with the rest of a shift left
    // to do something about it.
    expect(DRIP_ARRIVAL_TICK).toBeGreaterThan(lunchWindow(1).to);
    expect(DRIP_ARRIVAL_TICK).toBeLessThan(shiftEndTick(1) - 90);

    driver.startShift();
    driver.step(realMs(DRIP_ARRIVAL_TICK - engine.now() - 1));
    expect(engine.graph.getNode(DRIP_TICKET)).toBeUndefined();
    expect(spawned).toEqual([]);

    driver.step(realMs(1));
    expect(engine.now()).toBe(DRIP_ARRIVAL_TICK);
    expect(engine.ticketState(DRIP_TICKET)).toBe('open');
    expect(engine.graph.getField(DRIP_TICKET, FIELDS.spawnedAt))
      .toBe(DRIP_ARRIVAL_TICK);
    // One announcement, on the minute, which is what the shell turns into the
    // notification the player actually sees.
    expect(spawned).toEqual([DRIP_TICKET]);

    // And it stays in the queue rather than arriving again every minute.
    driver.step(realMs(60));
    expect(spawned).toEqual([DRIP_TICKET]);
  });

  it('ignores a clock-off that is not at the end of a day', () => {
    const { driver, engine, boundaries } = harness();
    driver.clockOff();

    expect(driver.day()).toBe(1);
    expect(driver.state()).toBe('morning_brief');
    expect(engine.now()).toBe(0);
    expect(boundaries()).toBe(0);
  });

  it('tells whoever is watching when the day moves', () => {
    const { driver } = harness();
    const listener = vi.fn();
    const unsubscribe = driver.onChanged(listener);

    driver.setSpeed(2);
    driver.setSpeed(2);
    expect(listener).toHaveBeenCalledTimes(1);

    driver.setPaused(true);
    driver.setPaused(false);
    expect(listener).toHaveBeenCalledTimes(3);

    driver.startShift();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    driver.setSpeed(4);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  /**
   * The schedule belongs to the day the world is on. After a load the driver
   * may be standing in a different day entirely, and walking yesterday's
   * schedule would drop today's arrivals on the wrong minute.
   */
  it('picks the day back up from the world after a load', () => {
    const { driver, engine } = harness();
    driver.startShift();
    driver.step(realMs(shiftEndTick(1)));
    driver.clockOff();
    const saved = engine.serialize();

    const fresh = harness();
    expect(fresh.driver.schedule().day).toBe(1);

    fresh.engine.restore(saved);
    fresh.driver.resync();

    expect(fresh.driver.day()).toBe(2);
    expect(fresh.driver.schedule().day).toBe(2);
    expect(fresh.driver.state()).toBe('morning_brief');
    expect(fresh.driver.paused()).toBe(false);
  });
});

/**
 * The pressure layer, as the driver actually runs it. The rates themselves are
 * `meters.test.ts`'s job; what is proved here is the WIRING - that it runs on
 * the simulation clock at the cadence it claims, only while the shift is on,
 * and that the numbers it sends reach the fields they are about.
 */
describe('the pressure layer on the clock', () => {
  const meter = (
    engine: Harness['engine'],
    field: string,
  ): number => {
    const value = engine.graph.getField(COMPANY_IDS.player, field);
    return typeof value === 'number' ? value : -1;
  };

  it('leaves the meters alone during the morning brief', () => {
    const { driver, engine, slack } = harness();
    show(slack, ['bubbles']);

    driver.step(realMs(20));

    expect(driver.state()).toBe('morning_brief');
    expect(meter(engine, FIELDS.suspicion)).toBe(0);
    expect(meter(engine, FIELDS.stress)).toBe(0);
  });

  it('charges suspicion for what is on screen, per interval', () => {
    const { driver, engine, slack } = harness();
    driver.startShift();
    show(slack, ['bubbles']);

    driver.step(realMs(METER_INTERVAL_TICKS));
    const afterOne = meter(engine, FIELDS.suspicion);
    expect(afterOne).toBeGreaterThan(0);

    driver.step(realMs(METER_INTERVAL_TICKS));
    expect(meter(engine, FIELDS.suspicion)).toBe(afterOne * 2);
    expect(meter(engine, FIELDS.suspicionEvents)).toBe(2);
  });

  /** Between the intervals nothing moves: the cadence is the cadence. */
  it('does not move a meter on a minute that is not an interval', () => {
    const { driver, engine, slack } = harness();
    driver.startShift();
    show(slack, ['bubbles']);

    driver.step(realMs(METER_INTERVAL_TICKS));
    const afterOne = meter(engine, FIELDS.suspicion);
    driver.step(realMs(METER_INTERVAL_TICKS - 1));

    expect(meter(engine, FIELDS.suspicion)).toBe(afterOne);
  });

  it('drains suspicion again once the screen is clean', () => {
    const { driver, engine, slack } = harness();
    driver.startShift();
    show(slack, ['bubbles']);
    driver.step(realMs(METER_INTERVAL_TICKS * 3));
    const dirty = meter(engine, FIELDS.suspicion);

    show(slack, []);
    driver.step(realMs(METER_INTERVAL_TICKS * 2));

    expect(meter(engine, FIELDS.suspicion)).toBeLessThan(dirty);
    // The MINUTES stand, though: a meter that drained back does not unhappen.
    expect(meter(engine, FIELDS.suspicionEvents)).toBe(3);
  });

  /** The queue is what does it to you, and it does it whether you look or not. */
  it('builds stress from a queue nobody is closing', () => {
    const { driver, engine } = harness();
    driver.startShift();

    driver.step(realMs(METER_INTERVAL_TICKS * 10));

    expect(meter(engine, FIELDS.stress)).toBeGreaterThan(0);
  });

  /**
   * The response clock's second stop condition, wired: nobody said a word to
   * the reporter, but somebody restarted the thing that was broken - and the
   * mark lands in the MINUTE they did it, not on the next interval boundary.
   * A touch one minute before the deadline used to be recorded at the
   * deadline, which is a breach the player did not commit.
   */
  it('stops a response clock in the minute the estate was touched', () => {
    const { driver, engine } = harness();
    // One minute short of the untriaged response target, which is an interval
    // boundary: the old sweep would have recorded this touch at the deadline
    // and called it late.
    driver.step(realMs(SLA_TARGETS[UNTRIAGED_PRIORITY].response - 1));
    const touchedAt = engine.now();

    expect(
      driver.dispatch(
        HELPDESK_ACTIONS.printerClearQueue,
        COMPANY_IDS.player,
        COMPANY_IDS.printer,
        {},
      ),
    ).toEqual({ ok: true });

    const spooler = engine.graph.getNode('ticket:wedged-spooler');
    expect(spooler?.fields[FIELDS.respondedAt]).toBe(touchedAt);
    expect(
      spooler === undefined ? true : ticketClocks(spooler, engine.now()).response.breached,
    ).toBe(false);

    // And it is the FIRST touch that counts, not the tidiest later one.
    driver.step(realMs(10));
    driver.dispatch(
      HELPDESK_ACTIONS.serviceRestart,
      COMPANY_IDS.player,
      COMPANY_IDS.spooler,
      {},
    );
    expect(engine.graph.getField('ticket:wedged-spooler', FIELDS.respondedAt))
      .toBe(touchedAt);
  });

  /**
   * Resetting somebody's password before they have raised a ticket about it is
   * not an answer to a ticket that does not exist yet. The old scan searched
   * the whole log with no idea when the ticket had arrived, so the day's first
   * housekeeping could be read back as a response to the afternoon's outage.
   */
  it('does not count a touch that happened before the ticket existed', () => {
    const { driver, engine } = harness();
    driver.startShift();

    // The trap ticket is about the lead's ACCOUNT, and it is raised by the
    // lead, mid-shift. Reset his password now, hours before he mentions it.
    expect(engine.graph.getNode(BOSS_TRAP_TICKET)).toBeUndefined();
    expect(
      driver.dispatch(
        HELPDESK_ACTIONS.accountResetPassword,
        COMPANY_IDS.player,
        COMPANY_IDS.bossAccount,
        {},
      ),
    ).toEqual({ ok: true });

    driver.step(realMs(FIRST_PING_TICK - engine.now()));
    expect(engine.graph.getNode(BOSS_TRAP_TICKET)).toBeDefined();
    expect(engine.graph.getField(BOSS_TRAP_TICKET, FIELDS.respondedAt))
      .toBeUndefined();
    expect(engine.graph.getField(BOSS_TRAP_TICKET, FIELDS.touchLog))
      .toBeUndefined();
  });

  /**
   * The one that was being forgiven. A fix that lands after the response
   * target is a LATE first response - and refusing to stamp it because the fix
   * also closed the ticket left no timestamp at all, which reads as "answered
   * in time" everywhere that counts.
   */
  it('records a late first touch even when that touch closes the ticket', () => {
    const { driver, engine } = harness();
    driver.startShift();
    driver.step(realMs(SLA_TARGETS[UNTRIAGED_PRIORITY].response + 5));
    const late = engine.now();

    expect(
      driver.dispatch(
        HELPDESK_ACTIONS.accountUnlock,
        COMPANY_IDS.player,
        COMPANY_IDS.garyAccount,
        {},
      ),
    ).toEqual({ ok: true });

    const closed = engine.graph.getNode('ticket:locked-account');
    expect(closed?.fields[FIELDS.state]).toBe('resolved');
    expect(closed?.fields[FIELDS.respondedAt]).toBe(late);
    expect(
      closed === undefined ? false : ticketClocks(closed, engine.now()).response.breached,
    ).toBe(true);
  });

  /**
   * The handoff form's evidence, written as it happens. The dispatch log knows
   * the same thing until tonight's checkpoint drains it; the ticket has to
   * still know tomorrow.
   */
  it('writes what was tried onto the ticket, refusals included', () => {
    const { driver, engine } = harness();
    driver.startShift();

    driver.dispatch(
      HELPDESK_ACTIONS.printerClearQueue,
      COMPANY_IDS.player,
      COMPANY_IDS.printer,
      {},
    );
    driver.dispatch(
      HELPDESK_ACTIONS.serviceRestart,
      COMPANY_IDS.player,
      COMPANY_IDS.fan,
      {},
    );

    const spooler = engine.graph.getField('ticket:wedged-spooler', FIELDS.touchLog);
    expect(triedFromTouches(spooler)).toHaveLength(1);
    expect(triedFromTouches(spooler)[0]?.worked).toBe(true);

    // A fan is not a service, so that one refused - and a refusal is exactly
    // the sort of thing second line want to know somebody had already tried.
    const fan = triedFromTouches(
      engine.graph.getField('ticket:fan-noise', FIELDS.touchLog),
    );
    expect(fan).toHaveLength(1);
    expect(fan[0]?.worked).toBe(false);
  });

  /**
   * A breached ticket is still a ticket. Both places that count the queue used
   * to drop it the moment it went red, so a missed deadline bought a quieter
   * afternoon and a scorecard reporting nothing left open.
   */
  it('keeps counting a breached ticket that nobody has fixed', () => {
    const { driver, engine, slack } = harness();
    driver.startShift();
    show(slack, []);

    // Triage one of the morning pile as a P1 and it blows its SLA on the
    // spot: it has been sitting since eight, and a P1 gets an hour.
    expect(
      driver.dispatch(
        HELPDESK_ACTIONS.ticketClassify,
        COMPANY_IDS.player,
        'ticket:rotated-screen',
        { impact: 3, urgency: 3, priority: 1 },
      ),
    ).toEqual({ ok: true });
    expect(engine.ticketState('ticket:rotated-screen')).toBe('breached');

    const tickets = engine.graph.nodesOfKind('ticket');
    const live = tickets.filter(
      (node) => node.fields[FIELDS.state] === 'open'
        || node.fields[FIELDS.state] === 'waiting_on_user',
    ).length;
    expect(dayLedger(tickets, 1).stillOpen).toBe(live + 1);
    expect(tickets.filter(isActiveWork)).toHaveLength(live + 1);

    // The interval the breach lands in pays for the breach as well, so the
    // one after it is where the queue's own rate is legible - and it counts
    // the red one, which is the whole point of not being able to ignore it.
    driver.step(realMs(METER_INTERVAL_TICKS));
    const before = meter(engine, FIELDS.stress);
    expect(before).toBeGreaterThanOrEqual(STRESS_PER_BREACH);

    const excess = tickets.filter(isActiveWork).length - COMFORTABLE_QUEUE;
    driver.step(realMs(METER_INTERVAL_TICKS));

    expect(meter(engine, FIELDS.stress) - before)
      .toBe(excess * STRESS_PER_EXCESS_TICKET);
    expect(meter(engine, FIELDS.stress)).toBeLessThan(METER_CEILING);
  });

  /**
   * The shift-tail rule, through the shipped verb rather than through the
   * button that greys itself out. It is refused, so there is no run for
   * clocking off to quietly wipe.
   */
  it('refuses a can too late in the shift to be paid for', () => {
    const { driver, engine } = harness();
    driver.startShift();
    driver.step(realMs(shiftEndTick(1) - engine.now() - 10));

    const refused = driver.drink();
    expect(refused.ok).toBe(false);
    expect(engine.graph.getField(COMPANY_IDS.player, FIELDS.drinkStartedAt))
      .toBe(NO_RUN);
    expect(meter(engine, FIELDS.consumableSpend)).toBe(0);

    driver.step(realMs(10));
    expect(driver.state()).toBe('day_end');
    driver.clockOff();
    expect(meter(engine, FIELDS.consumableSpend)).toBe(0);
  });

  /**
   * Second line, getting round to it. The delay is the driver's to enforce -
   * the action only knows that a bounce has not been settled yet.
   */
  it('lands a thin handoff back on the desk after the delay, once', () => {
    const { driver, engine, notices } = harness();
    driver.startShift();

    engine.dispatch(
      HELPDESK_ACTIONS.ticketEscalate,
      COMPANY_IDS.player,
      'ticket:fan-noise',
      { reported: '', tried: '' },
    );

    driver.step(realMs(METER_INTERVAL_TICKS));
    expect(engine.graph.getField('ticket:fan-noise', FIELDS.handoffSettledAt))
      .toBeUndefined();
    expect(notices()).toHaveLength(0);

    driver.step(realMs(HANDOFF_BOUNCE.delayTicks));
    expect(engine.graph.getField('ticket:fan-noise', FIELDS.handoffSettledAt))
      .toBeGreaterThan(0);
    expect(notices()).toEqual(['Returned by second line']);
    expect(meter(engine, FIELDS.reputation))
      .toBe(STARTING_REPUTATION - HANDOFF_BOUNCE.reputationCost);

    driver.step(realMs(HANDOFF_BOUNCE.delayTicks));
    expect(notices()).toHaveLength(1);
  });

  /**
   * The handoff form's evidence, a day later.
   *
   * Clocking off checkpoints the world and drains the dispatch log, which is
   * what stops a save growing for as long as a career does. The log was also
   * where "what I tried" came from, so a ticket worked on Monday and escalated
   * on Tuesday reached second line claiming nobody had ever looked at it - and
   * bounced, and cost the player reputation for work they had actually done.
   */
  it('still knows what was tried yesterday after the log is drained', () => {
    const { driver, engine } = harness();
    driver.startShift();

    expect(
      driver.dispatch(
        HELPDESK_ACTIONS.machineReboot,
        COMPANY_IDS.player,
        COMPANY_IDS.playerMachine,
        {},
      ),
    ).toEqual({ ok: true });

    const yesterday = triedFromTouches(
      engine.graph.getField('ticket:fan-noise', FIELDS.touchLog),
    );
    expect(yesterday).toHaveLength(1);

    // Out through 17:00 and off home. The log starts again in the morning.
    driver.step(realMs(shiftEndTick(1)));
    driver.clockOff();
    expect(engine.dispatchLog()).toEqual([]);
    expect(driver.day()).toBe(2);

    // Day two, and the form still has yesterday's work on it.
    const tried = triedFromTouches(
      engine.graph.getField('ticket:fan-noise', FIELDS.touchLog),
    );
    expect(tried).toEqual(yesterday);
    expect(tried[0]?.text).toBe(actionSummary(HELPDESK_ACTIONS.machineReboot));

    // So the escalation goes rather than bouncing: the handoff L2 keeps is
    // one with something in both halves, and this is the half nobody types.
    driver.startShift();
    expect(
      driver.dispatch(
        HELPDESK_ACTIONS.ticketEscalate,
        COMPANY_IDS.player,
        'ticket:fan-noise',
        {
          reported: 'It sounds like a hornet in a biscuit tin.',
          tried: tried.map((entry) => entry.text).join('\n'),
        },
      ),
    ).toEqual({ ok: true });
    expect(engine.graph.getField('ticket:fan-noise', FIELDS.handoffBouncedAt))
      .toBeUndefined();
    expect(engine.graph.getField('ticket:fan-noise', FIELDS.handoffTried))
      .toContain('Rebooted it');
  });

  /**
   * Determinism, which is what the whole design is for: the meters are moved
   * by dispatched actions on the simulation clock, so the same day walked the
   * same way twice arrives at the same numbers and the same graph hash.
   */
  it('arrives at the same meters when the same day is walked twice', () => {
    const walk = (): { hash: string; stress: number; suspicion: number } => {
      const world = harness();
      world.driver.startShift();
      show(world.slack, ['bubbles']);
      world.driver.step(realMs(METER_INTERVAL_TICKS * 6));
      show(world.slack, []);
      world.driver.step(realMs(METER_INTERVAL_TICKS * 6));

      return {
        hash: world.engine.snapshotHash(),
        stress: meter(world.engine, FIELDS.stress),
        suspicion: meter(world.engine, FIELDS.suspicion),
      };
    };

    expect(walk()).toEqual(walk());
  });
});
