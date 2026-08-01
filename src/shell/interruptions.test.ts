/**
 * Being taken off the work, driven through the shipped driver and the shipped
 * engine, on the days the shipped week authors it into.
 *
 * The unit tests one floor down (`world/interruptions.test.ts`,
 * `world/actions/interruptions.test.ts`) prove the schedule is stateless and
 * the three verbs are guarded. What they cannot prove is the thing the player
 * actually meets: that a phone rings on the minute the table says, that the
 * cost model charges the right half of itself, that a deferred call genuinely
 * comes back, that a meeting nobody could skip leaves something readable
 * behind, and that a save taken in the middle of any of it is a save that
 * lands back in the middle of it.
 *
 * So every assertion below is about a state the PLAYER reaches - the ticket
 * carries the call as evidence, the inbox holds the minutes, the second
 * arrival cannot be waved off - rather than about a dispatch having returned.
 *
 * Nothing here touches the DOM. The driver runs exactly as it does in the
 * browser, minus the browser.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { DAY_ACTIONS, HELPDESK_ACTIONS } from '../world/actions';
import {
  ALREADY_DEFERRED_REASON,
  NOT_DECLINABLE_REASON,
} from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { arrivedAt, findMailThread } from '../world/mail';
import { MEETING_MAIL } from '../world/mail/threads';
import { isRefocusing, REFOCUS_TICKS } from '../world/meters';
import {
  ARRIVAL_STRESS_PER_SEVERITY,
  buildInterruptionSchedule,
  DEFER_MINUTES,
  type InterruptionEntry,
} from '../world/interruptions';
import { TICKET_HYGIENE_SYNC } from '../world/scenes';
import { createWorldSession, type WorldSession } from '../world/session';
import { isUnresolved } from '../world/sla';
import { findWorldTicket, triedFromTouches } from '../world/tickets';
import { interruptionPlanFor } from '../world/week';
import { DayDriver, type InterruptionView, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

const SPOOLER = 'ticket:wedged-spooler';

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
  /** Every interruption the driver announced, in the minute it announced it. */
  readonly arrivals: InterruptionView[];
  readonly ended: InterruptionEntry[];
}

/**
 * A driver standing at the start of a given day's shift.
 *
 * The days before it are PLAYED rather than skipped - the clock is run to five
 * and clocked off, night and all - because an interruption on the Thursday is
 * only reachable from a world that has had a Monday in it, and because the
 * schedule is built at the day boundary the same way the browser builds it.
 */
function harnessOn(day: number): Harness {
  const session = createWorldSession();
  const arrivals: InterruptionView[] = [];
  const ended: InterruptionEntry[] = [];
  const driver = new DayDriver(
    session.engine,
    COMPANY_IDS.player,
    session.seed,
    {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
      onInterruption: (view) => {
        arrivals.push(view);
      },
      onInterruptionEnded: (entry) => {
        ended.push(entry);
      },
    },
  );

  for (let played = 1; played < day; played += 1) {
    driver.startShift();
    // Worked rather than watched: a week nobody touches saturates every meter
    // by the Wednesday, and a test about what an arrival COSTS cannot be run
    // against a stress level that is already at its ceiling.
    runTo(driver, session, shiftStartTick(played) + 90);
    workTheQueue(driver, session);
    runTo(driver, session, shiftStartTick(played) + 300);
    workTheQueue(driver, session);
    runTo(driver, session, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  // What the days before it did is not what this test is about.
  arrivals.length = 0;
  ended.length = 0;
  return { driver, session, arrivals, ended };
}

/** Every open ticket closed the way its own content says it can be. */
function workTheQueue(driver: DayDriver, session: WorldSession): void {
  for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket)) {
      continue;
    }

    for (const step of findWorldTicket(ticket.id)?.paths[0]?.steps ?? []) {
      driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      );
    }
  }
}

function runTo(
  driver: DayDriver,
  session: WorldSession,
  tick: number,
): void {
  while (session.engine.now() < tick && driver.state() === 'shift') {
    driver.step(TICK_INTERVAL_MS);
  }
}

/** The minute the shipped seed puts an authored interruption on. */
function entryOn(session: WorldSession, day: number, id: string): InterruptionEntry {
  const schedule = buildInterruptionSchedule(
    session.seed,
    day,
    interruptionPlanFor(day, session.seed),
  );
  const entry = schedule.entries.find((candidate) => candidate.id === id);

  if (entry === undefined) {
    throw new Error(`Day ${String(day)} does not schedule "${id}".`);
  }

  return entry;
}

function player(session: WorldSession, field: string): unknown {
  return session.engine.graph.getField(COMPANY_IDS.player, field);
}

function stress(session: WorldSession): number {
  const value = player(session, FIELDS.stress);
  return typeof value === 'number' ? value : Number.NaN;
}

/* -- the malignant half ---------------------------------------------------- */

describe('a call about something that is not the work in hand', () => {
  /**
   * The Tuesday call, taken by somebody who is not on the Tuesday ticket.
   *
   * It is the SAME row as the benign case further down - the one that carries
   * `ticket:wedged-spooler` - and it costs, because the cost model reads what
   * the player is doing rather than what the table says. That is the whole
   * design in one pair of tests: benign is earned by being on the work, not
   * declared by content.
   */
  it('rings on the authored minute, and costs the arrival before anything is decided', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    runTo(world.driver, world.session, entry.tick - 1);
    const before = stress(world.session);
    expect(world.driver.interruption()).toBeNull();

    runTo(world.driver, world.session, entry.tick);

    const ringing = world.driver.interruption();
    expect(ringing?.entry.id).toBe('call:spooler');
    // Nothing has been touched yet this morning, so the call about the
    // printer is about nothing anybody is holding.
    expect(ringing?.ticketInHand).toBeNull();
    expect(ringing?.benign).toBe(false);
    expect(ringing?.answered).toBe(false);
    expect(ringing?.callback).toBe(false);
    // The price of being reachable, charged whatever is done about it next.
    expect(stress(world.session) - before)
      .toBe(entry.severity * ARRIVAL_STRESS_PER_SEVERITY);
  });

  /**
   * The whole point of the debuff, asserted as the player meets it: answering
   * costs a window in which the hands are worse, and the window ENDS on its
   * own without anybody managing it.
   */
  it('leaves a refocus window behind, which expires quietly', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick);
    expect(world.driver.answerInterruption()).toEqual({ ok: true });

    const answeredAt = world.session.engine.now();
    const until = player(world.session, FIELDS.refocusUntil);

    expect(until).toBe(answeredAt + REFOCUS_TICKS);
    expect(isRefocusing(until, answeredAt)).toBe(true);

    runTo(world.driver, world.session, answeredAt + REFOCUS_TICKS - 1);
    expect(isRefocusing(until, world.session.engine.now())).toBe(true);

    runTo(world.driver, world.session, answeredAt + REFOCUS_TICKS);
    expect(isRefocusing(until, world.session.engine.now())).toBe(false);
    // Nothing cleared it and nothing extended it: it is a cost, not a state.
    expect(player(world.session, FIELDS.refocusUntil)).toBe(until);
  });

  it('hands the screen straight back when it is waved off', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick);
    const focus = player(world.session, FIELDS.refocusUntil);
    expect(world.driver.declineInterruption()).toEqual({ ok: true });

    // The minutes it would have taken are the player's again, in the same
    // minute, which is the whole of what declining buys - and it started no
    // refocus window, because there was no conversation to come back from.
    // (Wednesday's meeting left one behind and it is long expired; the claim
    // is that this call did not write another.)
    expect(world.driver.interruption()).toBeNull();
    expect(player(world.session, FIELDS.refocusUntil)).toBe(focus);
  });
});

/* -- the benign half ------------------------------------------------------- */

describe('a call about the ticket already in hand', () => {
  /**
   * The other half of the cost model, and the half the shipped golden week
   * never reaches - the scripted profiles sweep the queue in one pass rather
   * than sitting on one ticket - so it is driven here instead.
   *
   * Being on the ticket is expressed the way the world expresses it: a touch,
   * through the driver, which is what puts the minute on the ticket's log.
   */
  it('costs no focus, and lands on the ticket as evidence', () => {
    const world = harnessOn(2);
    const entry = entryOn(world.session, 2, 'call:spooler');

    runTo(world.driver, world.session, entry.tick - 5);
    // On the printer, and the touch log says so. It is the first step of the
    // ticket's own advertised path, which leaves it open - somebody halfway
    // through a job is exactly who this call is for.
    world.driver.dispatch(
      HELPDESK_ACTIONS.printerClearQueue,
      COMPANY_IDS.player,
      COMPANY_IDS.printer,
      { spooler: COMPANY_IDS.spooler },
    );

    const before = stress(world.session);
    runTo(world.driver, world.session, entry.tick);

    const ringing = world.driver.interruption();
    expect(ringing?.ticketInHand).toBe(SPOOLER);
    expect(ringing?.benign).toBe(true);
    // Nothing for the arrival: it is the job, arriving by phone.
    expect(stress(world.session)).toBe(before);

    expect(world.driver.answerInterruption()).toEqual({ ok: true });

    // The goal: the ticket carries the call, and the player is not worse at
    // their job for having taken it.
    const touched = triedFromTouches(
      world.session.engine.graph.getField(SPOOLER, FIELDS.touchLog),
    );
    expect(touched.some(
      (touch) => touch.text.length > 0 && touch.tick === world.session.engine.now(),
    )).toBe(true);
    expect(player(world.session, FIELDS.refocusUntil)).toBeUndefined();
    expect(world.driver.interruption()?.answered).toBe(true);
  });
});

/* -- asking them to call back ---------------------------------------------- */

describe('"can I call you back"', () => {
  it('comes back, later, and is not declinable the second time', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick);
    expect(world.driver.deferInterruption()).toEqual({ ok: true });
    // The screen is the player's for the minutes they bought.
    expect(world.driver.interruption()).toBeNull();

    runTo(world.driver, world.session, entry.tick + DEFER_MINUTES);

    const again = world.driver.interruption();
    expect(again?.entry.id).toBe('call:annexe-printer');
    expect(again?.callback).toBe(true);
    expect(again?.entry.slidFrom).toBe(entry.tick);
    // And this time it is the conversation.
    expect(world.driver.declineInterruption()).toEqual({
      ok: false,
      reason: ALREADY_DEFERRED_REASON,
    });
    expect(world.driver.deferInterruption()).toEqual({
      ok: false,
      reason: ALREADY_DEFERRED_REASON,
    });
    expect(world.driver.answerInterruption()).toEqual({ ok: true });
  });

  /**
   * The runtime half of precedence, and the only entry this family places at
   * runtime. A callback is put back on the day by `placeDeferred`, which has
   * to get out of the way of everything the day had already booked - so the
   * assertion is the property rather than a minute: whatever the callback
   * lands on, nothing else owns the screen while it does.
   */
  it('never comes back on top of something else', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick);
    world.driver.deferInterruption();
    // Right through to the end of the shift: the assert inside the driver
    // throws if two takeovers ever share a minute, so a clean run IS the
    // claim, and the callback is proven to have happened by the arrival list.
    runTo(world.driver, world.session, shiftEndTick(4));

    expect(world.arrivals.map((view) => view.entry.id))
      .toEqual(['call:annexe-printer', 'call:annexe-printer']);
    expect(world.arrivals[1]?.callback).toBe(true);
  });
});

/* -- the half hour nobody chose -------------------------------------------- */

describe('the mandatory sync', () => {
  it('is neither declinable nor deferrable, and says why', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    runTo(world.driver, world.session, entry.tick);

    const block = world.driver.interruption();
    expect(block?.entry.source).toBe('meeting');
    expect(block?.entry.declinable).toBe(false);

    // The refusal is the teaching, so it has to be the WORLD's sentence
    // rather than a missing button - and BOTH of them, because catching up on
    // it afterwards is skipping it said more politely.
    expect(world.driver.declineInterruption()).toEqual({
      ok: false,
      reason: NOT_DECLINABLE_REASON,
    });
    expect(world.driver.deferInterruption()).toEqual({
      ok: false,
      reason: NOT_DECLINABLE_REASON,
    });
    // And it is still there afterwards, which is the point of a refusal.
    expect(world.driver.interruption()?.entry.id).toBe('meeting:hygiene-sync');
  });

  /**
   * The journey rather than the transition: the player sits through half an
   * hour they could not refuse, and what they have afterwards is the meeting
   * itself, in an inbox, with nothing taken out of it.
   */
  it('ends with the minutes in the inbox, and every clock still running', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');
    const recap = findMailThread(MEETING_MAIL.recap);

    expect(recap).toBeDefined();

    runTo(world.driver, world.session, entry.tick);
    // Before: the minutes of a meeting nobody has been to are not readable.
    expect(arrivedAt(
      recap ?? { id: '', subject: '', messages: [] },
      world.session.engine.graph,
    )).toBeNull();

    runTo(world.driver, world.session, entry.endsTick);

    expect(world.driver.interruption()).toBeNull();
    expect(world.ended.map((ended) => ended.id)).toContain('meeting:hygiene-sync');
    // The clock ran for every minute of it: the block took exactly the
    // minutes it booked and gave none of them back.
    expect(world.session.engine.now()).toBe(entry.endsTick);
    expect(world.session.engine.now() - entry.tick)
      .toBe(entry.endsTick - entry.tick);

    const landed = arrivedAt(
      recap ?? { id: '', subject: '', messages: [] },
      world.session.engine.graph,
    );

    expect(landed).toBe(entry.endsTick);
    // And it IS the meeting: every line that was said in the room is in it.
    const body = recap?.messages[0]?.body.join('\n') ?? '';

    for (const beat of TICKET_HYGIENE_SYNC.beats) {
      expect(body).toContain(beat.line);
    }
  });

  it('leaves the player looking for their place afterwards', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    runTo(world.driver, world.session, entry.endsTick);

    // Answered at the END rather than at the start, which is what makes the
    // twenty-three minutes start from the minute the room emptied.
    expect(player(world.session, FIELDS.interruptionAnswered))
      .toBe('meeting:hygiene-sync');
    expect(player(world.session, FIELDS.refocusUntil))
      .toBe(entry.endsTick + REFOCUS_TICKS);
  });
});

/* -- the mid-state promise ------------------------------------------------- */

describe('a world picked back up in the middle of one', () => {
  /**
   * The claim the whole stateless-schedule design was for: occupancy is
   * `f(schedule, world, tick)`, so there is nothing to save and nothing to
   * restore. `resync` is what a load calls; if any part of this were being
   * remembered in the driver, the view would come back different.
   */
  it('is still in the same call, on the same minute, after a reload', () => {
    const world = harnessOn(4);
    const entry = entryOn(world.session, 4, 'call:annexe-printer');

    runTo(world.driver, world.session, entry.tick + 2);
    const before = world.driver.interruption();

    world.driver.resync();

    expect(world.driver.interruption()).toEqual(before);
    expect(before?.minutesIn).toBe(2);
  });

  it('is still in the same meeting, on the same minute, after a reload', () => {
    const world = harnessOn(3);
    const entry = entryOn(world.session, 3, 'meeting:hygiene-sync');

    runTo(world.driver, world.session, entry.tick + 11);
    const before = world.driver.interruption();

    world.driver.resync();

    expect(world.driver.interruption()).toEqual(before);
    expect(before?.entry.source).toBe('meeting');
    expect(before?.minutesIn).toBe(11);
  });
});

/* -- the hours nobody is at the desk --------------------------------------- */

describe('the shift, and only the shift', () => {
  it('rings nobody before the shift starts or after it ends', () => {
    const session = createWorldSession();
    const driver = new DayDriver(
      session.engine,
      COMPANY_IDS.player,
      session.seed,
      {
        onDayBoundary: () => {},
        openSlackApps: () => [],
        focusedSlackApp: () => null,
      },
    );

    // The morning brief, which is not paid time.
    expect(driver.state()).toBe('morning_brief');
    expect(driver.interruption()).toBeNull();

    driver.startShift();
    runTo(driver, session, shiftEndTick(1));
    expect(driver.state()).toBe('day_end');
    expect(driver.interruption()).toBeNull();
  });

  it('answers a verb aimed at nothing with a sentence rather than a crash', () => {
    const world = harnessOn(1);

    expect(world.driver.answerInterruption().ok).toBe(false);
    expect(world.driver.deferInterruption().ok).toBe(false);
    expect(world.driver.declineInterruption().ok).toBe(false);
    expect(world.driver.answerInterruption().ok).toBe(false);
  });
});

/* -- what the day loop is allowed to write --------------------------------- */

describe('the verbs the day loop drives', () => {
  it('records the meeting once, however long the day runs', () => {
    const world = harnessOn(3);

    runTo(world.driver, world.session, shiftEndTick(3));

    // A recap written twice would be a thread that arrived at two different
    // minutes, so the world refuses the second one - and the driver is not
    // allowed to depend on never asking.
    const second = world.session.engine.dispatch(
      DAY_ACTIONS.meetingRecap,
      COMPANY_IDS.player,
      null,
      {},
    );

    expect(second.ok).toBe(false);
    expect(world.ended.filter((entry) => entry.source === 'meeting'))
      .toHaveLength(1);
  });
});
