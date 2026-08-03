/**
 * The after-hours ping tail, driven through the shipped driver and the shipped
 * engine (slice 0.3.6, Part 1).
 *
 * The claim is the JOURNEY, not the call: a ping lands overnight, it is read on
 * the next morning's brief, answering it costs its honest point of stress for
 * its honest point of reputation, and the world enforces the trade once. Every
 * assertion below is what the player would meet - the surface list the brief
 * draws, and the meters the answer actually moves - reached by playing a whole
 * Monday into a Tuesday morning through the real day loop.
 *
 * Nothing here touches the DOM.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { AFTER_HOURS_REPUTATION, AFTER_HOURS_STRESS } from '../world/after-hours';
import { COMPANY_IDS } from '../world/company';
import { FIELDS } from '../world/fields';
import { createWorldSession, type WorldSession } from '../world/session';
import { isUnresolved } from '../world/sla';
import { findWorldTicket } from '../world/tickets';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
}

function harness(): Harness {
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

  return { driver, session };
}

/** Every open ticket closed the way its own content says it can be. */
function workTheQueue(driver: DayDriver, session: WorldSession): void {
  for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket)) {
      continue;
    }

    for (const step of findWorldTicket(ticket.id)?.paths[0]?.steps ?? []) {
      driver.dispatch(step.action, COMPANY_IDS.player, step.target, {
        ...step.params,
      });
    }
  }
}

/**
 * The whole of a day, WORKED to its end and clocked off.
 *
 * The queue is cleared as it arrives rather than left to pile up, because an
 * unworked Monday saturates stress at the ceiling by lunch - and a meter pinned
 * at 100 cannot show the point a ping adds, which is the thing under test. A
 * worked day keeps the meters in the middle of their range, where a move of one
 * is a move of one.
 */
function playDay(driver: DayDriver, session: WorldSession): void {
  driver.startShift();

  let turns = 0;

  while (driver.state() === 'shift') {
    driver.step(TICK_INTERVAL_MS);
    turns += 1;

    if (turns % 60 === 0) {
      workTheQueue(driver, session);
    }

    if (turns > 200_000) {
      throw new Error('The day never ended.');
    }
  }

  workTheQueue(driver, session);
  driver.clockOff();
}

function meter(session: WorldSession, field: string): number {
  const value = session.engine.graph.getField(COMPANY_IDS.player, field);
  return typeof value === 'number' ? value : 0;
}

describe('the ping that landed after you clocked off', () => {
  it('is not on the very first morning - there was no night before it', () => {
    const { driver } = harness();

    expect(driver.day()).toBe(1);
    expect(driver.state()).toBe('morning_brief');
    expect(driver.afterHoursPings()).toEqual([]);
  });

  it('is on the next morning, unanswered, from the person who sent it', () => {
    const { driver, session } = harness();

    playDay(driver, session);

    expect(driver.day()).toBe(2);
    expect(driver.state()).toBe('morning_brief');

    const pings = driver.afterHoursPings();

    expect(pings.map((ping) => ping.slot.id)).toEqual(['after:owen-monitor']);
    expect(pings[0]?.slot.speaker).toBe(COMPANY_IDS.owen);
    expect(pings[0]?.answered).toBe(false);
  });

  it('costs a point of stress for a point of reputation when answered', () => {
    const { driver, session } = harness();

    playDay(driver, session);

    const repBefore = meter(session, FIELDS.reputation);
    const stressBefore = meter(session, FIELDS.stress);

    expect(driver.answerAfterHours('after:owen-monitor')).toEqual({ ok: true });

    expect(meter(session, FIELDS.reputation))
      .toBe(repBefore + AFTER_HOURS_REPUTATION);
    expect(meter(session, FIELDS.stress))
      .toBe(stressBefore + AFTER_HOURS_STRESS);

    // And the surface strikes it through rather than losing it.
    expect(driver.afterHoursPings()[0]?.answered).toBe(true);
  });

  it('is answered ONCE, and the world enforces it - a second press is refused', () => {
    const { driver, session } = harness();

    playDay(driver, session);

    expect(driver.answerAfterHours('after:owen-monitor').ok).toBe(true);

    const repAfterOne = meter(session, FIELDS.reputation);
    const stressAfterOne = meter(session, FIELDS.stress);

    const second = driver.answerAfterHours('after:owen-monitor');

    expect(second.ok).toBe(false);
    // Not a second point of either: the trade happened once.
    expect(meter(session, FIELDS.reputation)).toBe(repAfterOne);
    expect(meter(session, FIELDS.stress)).toBe(stressAfterOne);
  });

  it('leaving it is free of both meters', () => {
    const { driver, session } = harness();

    playDay(driver, session);

    const repBefore = meter(session, FIELDS.reputation);
    const stressBefore = meter(session, FIELDS.stress);

    // Read the surface, start the shift, do not answer. Nothing moved.
    expect(driver.afterHoursPings().length).toBe(1);
    driver.startShift();

    expect(meter(session, FIELDS.reputation)).toBe(repBefore);
    expect(meter(session, FIELDS.stress)).toBe(stressBefore);
  });

  it('is turned away by an overnight Do Not Disturb', () => {
    const { driver } = harness();

    driver.startShift();
    // The dot set during Monday's shift persists across the night, which is the
    // overnight status the arrival reads.
    expect(driver.setPresence('dnd').ok).toBe(true);

    let turns = 0;

    while (driver.state() === 'shift') {
      driver.step(TICK_INTERVAL_MS);
      turns += 1;

      if (turns > 200_000) {
        throw new Error('The day never ended.');
      }
    }

    driver.clockOff();

    expect(driver.day()).toBe(2);
    expect(driver.presence()).toBe('dnd');
    // Owen's ping is declinable, so a Do Not Disturb dot turned it away and the
    // surface is empty - you told them.
    expect(driver.afterHoursPings()).toEqual([]);
  });

  it('cannot be answered once the shift has started', () => {
    const { driver, session } = harness();

    playDay(driver, session);
    driver.startShift();

    expect(driver.state()).toBe('shift');
    expect(driver.answerAfterHours('after:owen-monitor').ok).toBe(false);
  });
});
