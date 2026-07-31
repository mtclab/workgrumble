import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Expr, TicketDef } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import {
  DAY_ACTIONS,
  fieldLines,
  HELPDESK_ACTIONS,
} from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import {
  buildDaySchedule,
  DAY_RATE_PENCE,
  dayLedger,
  dayOpensTick,
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
import { dayPlan, dayScript, inheritedTicketIds } from '../world/week';
import {
  SLA_TARGETS,
  UNTRIAGED_PRIORITY,
  UNTRIAGED_SLA_TICKS,
} from '../world/priority';
import { serviceDeadline } from '../world/hours';
import { isActiveWork, ticketClocks } from '../world/sla';
import {
  actionSummary,
  closesWithParent,
  HANDOFF_BOUNCE,
  linkNote,
  spawnWorldTicket,
  triedFromTouches,
} from '../world/tickets';
import {
  DayDriver,
  TICK_INTERVAL_MS,
  ticksFromElapsed,
} from './day-driver';

const MONDAY = dayScript(1);

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

/**
 * A driver over a world with the named tickets already dealt.
 *
 * Monday's own queue is one ticket - the week spreads the rest across five
 * days - so a test about a particular ticket deals it here, exactly as the
 * driver would on the day the week says it turns up. The ticket brings its own
 * fault with it, which is why this is a spawn rather than a fixture.
 */
function harness(...ticketIds: readonly string[]): Harness {
  const { engine } = createWorldSession();

  for (const id of ticketIds) {
    if (engine.graph.getNode(id) === undefined) {
      spawnWorldTicket(engine, id);
    }
  }
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

/** Monday's mid-morning arrival: the ticket you filed about your own desk. */
const DRIP_TICKET = MONDAY.drip[0]?.ticketId ?? '';

/**
 * The minute it lands, from the shipped seed. Not a magic number: the week
 * names the minute, `buildDaySchedule` jitters it, and the test asserts the
 * driver deals it on the one that comes out.
 */
const DRIP_ARRIVAL_TICK = buildDaySchedule(1, WORLD_SEED, dayPlan(1))
  .arrivals.find((entry) => entry.ticketId === DRIP_TICKET)?.tick ?? -1;

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

    // A second day banks on top of the first rather than replacing it, and
    // exactly on top: the fund is yesterday's take-home plus today's, counted
    // off the day Tuesday actually had rather than off a rule of thumb.
    driver.startShift();
    driver.step(realMs(shiftEndTick(2)));
    const tuesday = daySlip(dayLedger(engine.graph.nodesOfKind('ticket'), 2));
    driver.clockOff();
    // Nobody worked either day, and Tuesday has six tickets on it now: the
    // shift is still paid and the missed deadlines are what the gap is made
    // of. Pinning a number here would be pinning the week's ramp in a test
    // about banking, which is the golden week's job.
    expect(tuesday.net).toBeGreaterThan(0);
    expect(tuesday.net).toBeLessThan(DAY_RATE_PENCE);
    expect(engine.graph.getField(COMPANY_IDS.player, FIELDS.farmFund))
      .toBe(slip.net + tuesday.net);
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
    // Mid-morning: the queue has had half an hour to settle first, and there
    // is most of a shift left to do something about it.
    expect(DRIP_ARRIVAL_TICK).toBeGreaterThan(shiftStartTick(1) + 30);
    expect(DRIP_ARRIVAL_TICK).toBeLessThan(lunchWindow(1).from);

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
    // Three open tickets, which is one more than a person can hold in their
    // head: the rate is charged on the excess, so a comfortable queue is a
    // queue that costs nothing and proves nothing.
    const { driver, engine } = harness(
      'ticket:locked-account',
      'ticket:wedged-spooler',
    );
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
    const { driver, engine } = harness('ticket:wedged-spooler');
    // One minute short of the response deadline, which is an interval
    // boundary: the old sweep would have recorded this touch at the deadline
    // and called it late. The deadline is an hour of DESK TIME after the
    // ticket arrived, so on a ticket inherited at eight it is ten o'clock.
    driver.step(realMs(
      serviceDeadline(0, SLA_TARGETS[UNTRIAGED_PRIORITY].response) - 1,
    ));
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
    const { driver, engine } = harness('ticket:locked-account');
    driver.startShift();
    driver.step(realMs(
      serviceDeadline(0, SLA_TARGETS[UNTRIAGED_PRIORITY].response)
      + 5 - engine.now(),
    ));
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
    const { driver, engine } = harness(
      'ticket:wedged-spooler',
      'ticket:fan-noise',
    );
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
    const { driver, engine, slack } = harness(
      'ticket:locked-account',
      'ticket:wedged-spooler',
    );
    driver.startShift();
    show(slack, []);

    // Eleven o'clock, with the morning's arrival already in the queue so that
    // nothing else lands while the meter is being read. Triage the ticket
    // that has been sitting since eight as a P1: an hour of desk time from
    // 09:00 ran out at ten, so classifying it now breaches it on the spot -
    // the consequence of mis-triage, mechanical rather than narrated.
    driver.step(realMs(3 * 60 - engine.now()));
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

    // Read at the minute it is charged for, not five minutes earlier: the
    // week drips a ticket into this morning, and a queue measured before it
    // arrived is a queue the meter has stopped agreeing with.
    const excess = engine.graph.nodesOfKind('ticket').filter(isActiveWork).length
      - COMFORTABLE_QUEUE;
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
    const { driver, engine, notices } = harness('ticket:fan-noise');
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
    const { driver, engine } = harness('ticket:fan-noise');
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

/**
 * The service clock, which is the day driver's other job.
 *
 * The engine has no idea what a shift is; the day state does, and it lives in
 * the graph. The driver keeps the two in step, and every one of the moments
 * below is one where they could quietly stop agreeing - a boot, a transition,
 * a night that passes inside one call, a load.
 */
describe('the clock the deadlines are measured against', () => {
  it('follows the day through every state it has', () => {
    const { driver, engine } = harness();

    // Eight in the morning. Nobody is being paid and no clock is running.
    expect(driver.state()).toBe('morning_brief');
    expect(engine.slaRunning()).toBe(false);

    driver.startShift();
    expect(engine.now()).toBe(shiftStartTick(1));
    expect(engine.slaRunning()).toBe(true);

    driver.step(realMs(shiftEndTick(1) - engine.now()));
    expect(driver.state()).toBe('day_end');
    expect(engine.slaRunning()).toBe(false);

    driver.clockOff();
    expect(driver.state()).toBe('morning_brief');
    expect(engine.slaRunning()).toBe(false);
  });

  /**
   * The carried M3 flag, fixed and gated: a ticket that was waiting in the
   * queue at 08:00 used to spawn one minute of clock away from its own
   * response deadline, because the hour before the shift was charged to it.
   */
  it('does not charge an inherited ticket for the hour before the shift', () => {
    const { driver, engine } = harness();
    const inherited = inheritedTicketIds(1)[0] ?? '';
    const spawned = engine.graph.getField(inherited, FIELDS.spawnedAt);
    expect(spawned).toBe(0);

    const clocksNow = (): ReturnType<typeof ticketClocks> => {
      const node = engine.graph.getNode(inherited);

      if (node === undefined) {
        throw new Error(`The morning has no "${inherited}" in it.`);
      }

      return ticketClocks(node, engine.now());
    };

    const target = SLA_TARGETS[UNTRIAGED_PRIORITY];
    // At 08:00 it owes an answer by 10:00 and a fix by one in the afternoon -
    // a full untriaged clock, all of it inside a shift somebody is at.
    expect(clocksNow().response.dueAt).toBe(serviceDeadline(0, target.response));
    expect(clocksNow().resolution.remaining).toBe(target.resolution);

    // And the whole morning brief costs it nothing at all.
    driver.startShift();
    expect(engine.now()).toBe(shiftStartTick(1));
    expect(clocksNow().response.breached).toBe(false);
    expect(clocksNow().resolution.remaining).toBe(target.resolution);
    expect(engine.graph.getField(inherited, FIELDS.offHoursTicks)).toBe(60);
  });

  /**
   * A night, and a save taken on either side of it.
   *
   * The service clock is world state, so it is in the save - and a load has to
   * put the driver back in step with it rather than assume the day it left.
   * Restoring a checkpoint into a fresh driver is exactly what a reloaded tab
   * does, and getting it wrong means the first minute of the new session
   * charges a ticket for the night it just slept through.
   */
  it('keeps a carried ticket whole across the night, and across a load', () => {
    const { driver, engine } = harness();
    driver.startShift();

    // Three in the afternoon, and something lands with four desk hours on it:
    // two of them are today's and the rest belong to tomorrow morning.
    driver.step(realMs(shiftStartTick(1) + 360 - engine.now()));
    spawnWorldTicket(engine, 'ticket:wedged-spooler');

    driver.step(realMs(shiftEndTick(1) - engine.now()));
    expect(driver.state()).toBe('day_end');

    const spooler = (world: typeof engine): ReturnType<typeof ticketClocks> => {
      const node = world.graph.getNode('ticket:wedged-spooler');

      if (node === undefined) {
        throw new Error('The spooler ticket went missing.');
      }

      return ticketClocks(node, world.now());
    };

    const atClockOff = spooler(engine).resolution.remaining;
    expect(atClockOff).toBeGreaterThan(0);

    driver.clockOff();
    // Sixteen hours of clock and not one minute of anybody's service level.
    expect(engine.now()).toBe(dayOpensTick(2));
    expect(spooler(engine).resolution.remaining).toBe(atClockOff);
    expect(engine.ticketState('ticket:wedged-spooler')).toBe('open');

    // And the same again through a save: a new session, handed the file and
    // nothing else, agrees about the clock and about the ticket.
    const saved = engine.serialize();
    const reloaded = harness();
    reloaded.engine.restore(saved);
    reloaded.driver.resync();

    expect(reloaded.engine.slaRunning()).toBe(false);
    expect(reloaded.driver.state()).toBe('morning_brief');
    expect(spooler(reloaded.engine).resolution.remaining).toBe(atClockOff);
    expect(reloaded.engine.snapshotHash()).toBe(engine.snapshotHash());

    // Tuesday morning costs it nothing either, and the shift costs it minutes.
    reloaded.driver.startShift();
    expect(spooler(reloaded.engine).resolution.remaining).toBe(atClockOff);
    reloaded.driver.step(realMs(30));
    expect(spooler(reloaded.engine).resolution.remaining).toBe(atClockOff - 30);
  });

  /** One entry per transition, not one a minute: the log is a save file. */
  it('writes the clock into the log only when it moves', () => {
    const { driver, engine } = harness();
    driver.startShift();
    driver.step(realMs(120));

    const moves = engine.dispatchLog().filter(
      (entry) => entry.id === DAY_ACTIONS.slaClockRun
        || entry.id === DAY_ACTIONS.slaClockHold,
    );

    // Held at the boot, started when the shift did. Nothing since.
    expect(moves.map((entry) => entry.id)).toEqual([
      DAY_ACTIONS.slaClockHold,
      DAY_ACTIONS.slaClockRun,
    ]);
  });
});

/**
 * The flood, through the shipped driver.
 *
 * The fixture duplicates are registered straight into the world the session
 * built - the driver neither knows nor cares where a ticket came from - so
 * what is on trial here is the DRIVER's half: that it notices a parent has
 * closed, tells every child, and does it once.
 */
describe('duplicates closing with their parent', () => {
  const PARENT = 'ticket:fixture-parent';
  const CHILD = 'ticket:fixture-child';

  /** Nothing on this desk fixes one person's certificate. */
  const PER_USER: Expr = {
    op: 'eq',
    selector: { id: COMPANY_IDS.vpn },
    field: 'reissued_per_user',
    value: true,
  };

  const VPN_BACK: Expr = {
    op: 'eq',
    selector: { id: COMPANY_IDS.vpn },
    field: FIELDS.status,
    value: 'running',
  };

  function fixture(
    id: string,
    resolvedWhen: Expr,
    setup: TicketDef['setup'] = [],
  ): TicketDef {
    return {
      id,
      archetype: 'flood',
      flavor: { title: `Fixture ${id}`, body: 'Fixture ticket.' },
      reporter: COMPANY_IDS.ada,
      setup,
      resolved_when: resolvedWhen,
      sla_ticks: UNTRIAGED_SLA_TICKS,
      reward: { reputation: 1, money: 1 },
      kb_ref: 'kb/power-cycle',
    };
  }

  function flood(): Harness {
    const world = harness();
    // The outage the flood is about: the concentrator is down, and putting it
    // back is the one fix that closes anything.
    world.engine.registerTicket(fixture(PARENT, VPN_BACK, [
      {
        op: 'setField',
        id: COMPANY_IDS.vpn,
        field: FIELDS.status,
        value: 'stopped',
      },
    ]));
    world.engine.registerTicket(
      fixture(CHILD, closesWithParent(CHILD, PER_USER)),
    );
    world.driver.startShift();

    expect(
      world.driver.dispatch(
        HELPDESK_ACTIONS.ticketLinkToParent,
        COMPANY_IDS.player,
        CHILD,
        { parent: PARENT, note: linkNote('The VPN certificate', PARENT) },
      ).ok,
    ).toBe(true);

    return world;
  }

  it('tells the child\'s reporter in the minute the parent closed', () => {
    const world = flood();

    world.driver.dispatch(
      HELPDESK_ACTIONS.ticketAddComment,
      COMPANY_IDS.player,
      PARENT,
      { comment: 'Certificate replaced. Remote access is back.' },
    );
    // The parent's own fix, which is a change to the world and nothing else.
    world.driver.dispatch(
      HELPDESK_ACTIONS.serviceRestart,
      COMPANY_IDS.player,
      COMPANY_IDS.vpn,
      {},
    );

    expect(world.engine.ticketState(PARENT)).toBe('resolved');
    expect(world.engine.ticketState(CHILD)).toBe('resolved');
    expect(
      fieldLines(world.engine.graph.getField(CHILD, FIELDS.customerVisible)),
    ).toEqual([
      expect.stringContaining('Certificate replaced.') as unknown as string,
    ]);
  });

  /**
   * And it settles from the TICK as well, because a parent can close without
   * anybody dispatching anything at it - a colleague's fix, a scripted world
   * event, tomorrow's content.
   */
  it('settles on the next tick when nothing was dispatched', () => {
    const world = flood();

    world.engine.dispatch(
      HELPDESK_ACTIONS.serviceRestart,
      COMPANY_IDS.player,
      COMPANY_IDS.vpn,
      {},
    );
    expect(world.engine.ticketState(PARENT)).toBe('resolved');
    expect(world.engine.ticketState(CHILD)).toBe('open');

    world.driver.step(realMs(1));

    expect(world.engine.ticketState(CHILD)).toBe('resolved');

    // Once, however many minutes go past afterwards.
    world.driver.step(realMs(30));
    expect(
      fieldLines(world.engine.graph.getField(CHILD, FIELDS.customerVisible)),
    ).toHaveLength(1);
  });
});
