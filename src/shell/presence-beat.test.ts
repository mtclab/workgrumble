/**
 * The two things the dot puts on a SCREEN, driven through the shipped driver
 * and the shipped engine.
 *
 * Lane A proved the world half: the filter slides a call, the drip charges
 * suspicion, `dndBeat` is a predicate over evidence. What is here is the half
 * the player actually meets - the lead coming down the corridor to ask about a
 * status, and the record of a phone that never rang being readable afterwards
 * - and every assertion is about a state somebody REACHES rather than about a
 * dispatch having returned.
 *
 * No DOM: the windows that draw these are e2e's, and what a window can draw is
 * decided here.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { CAUGHT_SUSPICION_FLOOR } from '../world/boss';
import { conductEntries } from '../world/conduct';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { buildInterruptionSchedule, readsTheDot } from '../world/interruptions';
import { METER_INTERVAL_TICKS } from '../world/meters';
import {
  DND_BEAT_MINUTES,
  DND_BEAT_SUSPICION,
  DND_WORKING_SUSPICION,
} from '../world/presence';
import { PRESENCE_CAUGHT_KEY } from '../world/scenes';
import { dndEvidence } from '../world/presence';
import { createWorldSession, type WorldSession } from '../world/session';
import { isUnresolved, needsResponse } from '../world/sla';
import { findWorldTicket, ticketNodes } from '../world/tickets';
import { interruptionPlanFor } from '../world/week';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
  /** Every scene the day put in front of the player, by what it was about. */
  readonly scenes: string[];
  /** The reading each of those scenes was handed, where there was one. */
  readonly evidence: (number | null)[];
  /** Everybody who had a thought about the Away dot. */
  readonly noticed: string[];
  /** What is on the screen, which the meters read for themselves. */
  readonly slack: string[];
}

function harnessOn(day: number): Harness {
  const session = createWorldSession();
  const scenes: string[] = [];
  const evidence: (number | null)[] = [];
  const noticed: string[] = [];
  const slack: string[] = [];
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, session.seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [...slack],
    focusedSlackApp: () => null,
    onCaught: (appId, _tick, minutes) => {
      scenes.push(appId);
      evidence.push(minutes);
    },
    onPresenceNoticed: (reporter) => {
      noticed.push(reporter);
    },
  });

  for (let played = 1; played < day; played += 1) {
    driver.startShift();
    runTo(driver, session, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  scenes.length = 0;
  evidence.length = 0;
  noticed.length = 0;
  return { driver, session, scenes, evidence, noticed, slack };
}

function runTo(driver: DayDriver, session: WorldSession, tick: number): void {
  while (session.engine.now() < tick && driver.state() === 'shift') {
    driver.step(TICK_INTERVAL_MS);
  }
}

/**
 * A dispatch that is unmistakably work and changes nothing, aimed at a
 * ticket's own estate - the same trick lane A's suite uses, and it is a
 * REFUSED one on purpose: a refusal is still a touch, so the evidence is
 * exactly what the drip reads and the queue never runs out.
 */
function pretendToWork(driver: DayDriver, session: WorldSession): boolean {
  for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
    const node = isUnresolved(ticket) ? ticketNodes(ticket.id)[0] : undefined;

    if (node === undefined) {
      continue;
    }

    driver.dispatch(
      HELPDESK_ACTIONS.machineSetDisplayRotation,
      COMPANY_IDS.player,
      node,
      { rotation: 999 },
    );
    return true;
  }

  return false;
}

/**
 * One dispatch that is unmistakably work, aimed at a ticket's own estate, and
 * that the world ACCEPTS - which is what the Away sting reads, because the lie
 * is a desk demonstrably doing the job while its dot says otherwise.
 */
function doSomething(driver: DayDriver, session: WorldSession): boolean {
  for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket)) {
      continue;
    }

    const step = findWorldTicket(ticket.id)?.paths[0]?.steps[0];

    if (step === undefined) {
      continue;
    }

    return driver.dispatch(
      step.action,
      COMPANY_IDS.player,
      step.target,
      { ...step.params },
    ).ok;
  }

  return false;
}

/** Works with the dot on red until the lead has something to say, or gives up. */
function workUntilArmed(world: Harness, rounds = 60): boolean {
  for (let round = 0; round < rounds; round += 1) {
    if (world.driver.dndBeat().armed) {
      return true;
    }

    pretendToWork(world.driver, world.session);
    runTo(
      world.driver,
      world.session,
      world.session.engine.now() + METER_INTERVAL_TICKS,
    );
  }

  return world.driver.dndBeat().armed;
}

/**
 * And then carries on working behind the dot until he actually turns up.
 *
 * Working THROUGH the wait rather than sitting still, because that is the
 * morning the beat is about and because the meter is a live thing: a desk that
 * goes quiet stops dripping and starts draining, and a player who worked all
 * morning behind a red dot and then stopped for half an hour has genuinely
 * stopped being the person this conversation is about.
 */
function workUntilSpokenTo(world: Harness, minutes = 240): void {
  for (
    let minute = 0;
    minute < minutes
      && world.scenes.length === 0
      && world.driver.state() === 'shift';
    minute += 5
  ) {
    pretendToWork(world.driver, world.session);
    runTo(
      world.driver,
      world.session,
      world.session.engine.now() + METER_INTERVAL_TICKS,
    );
  }
}

/** Everybody still waiting for a first word, which is who the sting reads. */
function waitingReporters(session: WorldSession): readonly string[] {
  return session.engine.graph
    .nodesOfKind('ticket')
    .filter((ticket) => isUnresolved(ticket) && needsResponse(ticket))
    .map((ticket) => findWorldTicket(ticket.id)?.def.reporter ?? '');
}

/** Works one ticket that is not the player's own, which answers its reporter. */
function answerSomebodyElse(driver: DayDriver, session: WorldSession): void {
  for (const ticket of session.engine.graph.nodesOfKind('ticket')) {
    const world = findWorldTicket(ticket.id);

    if (
      !isUnresolved(ticket)
      || world === undefined
      || world.def.reporter === COMPANY_IDS.player
    ) {
      continue;
    }

    for (const step of world.paths[0]?.steps ?? []) {
      driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      );
    }
  }
}

function player(session: WorldSession, field: string): unknown {
  return session.engine.graph.getField(COMPANY_IDS.player, field);
}

function number(session: WorldSession, field: string): number {
  const value = player(session, field);
  return typeof value === 'number' ? value : 0;
}

/* -- the lead, asking about the status ------------------------------------- */

describe('the beat the dot arms', () => {
  /**
   * The journey: a morning worked behind a red dot ends with a man at the desk
   * asking about it, and the thing he says is traceable to a minute.
   */
  it('brings the lead down about the dot, with the record behind him', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    expect(workUntilArmed(world), 'the beat never armed').toBe(true);

    const armedAt = world.driver.dndBeat();

    // Nothing has been said yet: arming is evidence, not a conversation.
    expect(world.scenes).toEqual([]);

    // The corridor decides WHEN, exactly as it does for a screen with a game
    // on it - so this waits for him rather than summoning him.
    workUntilSpokenTo(world);

    expect(world.scenes).toEqual([PRESENCE_CAUGHT_KEY]);

    // THE RECORD: a line on the file, in the file's own passive voice, naming
    // the status and how much of the morning it was - which is the half a
    // player can still read on Friday.
    const file = conductEntries(player(world.session, FIELDS.conductFile));
    const status = file.filter((entry) => entry.kind === 'status');

    expect(status).toHaveLength(1);
    expect(status[0]?.text).toContain('Do Not Disturb');
    expect(status[0]?.text).toContain('logged activity');
    // How much of the morning it was, in words. A raw count of minutes on a
    // personnel line is a spreadsheet talking, and every phrase this world
    // uses for it is about the morning or the hour.
    expect(status[0]?.text).toMatch(/morning|hour/u);
    expect(status[0]?.text).not.toMatch(/\d+ minutes/u);
    // It is a SCREEN line that would have been the lie: nothing was on the
    // screen, and the file must not say there was.
    expect(file.some((entry) => entry.kind === 'screen')).toBe(false);

    // THE READING THE SCENE WAS HANDED, and it is the one the file was written
    // from rather than a fresh one: the surfaces are given a captured number
    // because the record itself is closed by the conversation, and two
    // surfaces recomputing a running total would print two accounts of one
    // morning.
    expect(world.evidence).toHaveLength(1);
    expect(world.evidence[0]).toBeGreaterThanOrEqual(DND_BEAT_MINUTES);
    expect(status[0]?.text).toContain(dndEvidence(world.evidence[0] ?? 0));

    // And the morning is SPENT. What it was evidence of has been said out
    // loud, so the record starts again - anything still on it is minutes that
    // have gone by since he walked away.
    expect(number(world.session, FIELDS.dndWorkingTicks))
      .toBeLessThan(armedAt.minutes);
    expect(world.driver.dndBeat().minutes)
      .toBeLessThan(DND_BEAT_MINUTES);
  });

  /**
   * The staleness this closes, said as a journey: a morning that has already
   * been the subject of a conversation cannot buy a second one, and neither
   * can a morning that happened yesterday.
   *
   * Before the fix the evidence was a WEEK-cumulative counter and the meter
   * beside it was generic suspicion, so a Monday spent behind the dot sat on
   * the record all week and any later afternoon that happened to push the
   * meter back over the mark re-armed the beat with no fresh dot behind it at
   * all - a telling-off about this morning, delivered on the strength of a
   * different one.
   */
  it('needs a fresh half hour rather than a morning already spoken about', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    expect(workUntilArmed(world)).toBe(true);
    workUntilSpokenTo(world);

    expect(world.scenes).toHaveLength(1);

    // The meter put back over the mark by something that is not the dot: a
    // browser open on the second screen all afternoon.
    world.slack.push('browser');

    for (let round = 0; round < 40; round += 1) {
      runTo(
        world.driver,
        world.session,
        world.session.engine.now() + METER_INTERVAL_TICKS,
      );
    }

    expect(number(world.session, FIELDS.suspicion))
      .toBeGreaterThanOrEqual(DND_BEAT_SUSPICION);
    expect(world.driver.presence()).toBe('dnd');
    // A meter over the mark, the dot still up, and nothing new to say: the
    // half hour it would be about has already been had.
    expect(world.driver.dndBeat().armed).toBe(false);
  });

  /**
   * And the same claim across a night: evidence is about a morning, so the
   * morning ends it.
   */
  it('does not carry yesterday\'s minutes into today', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });

    for (let round = 0; round < 12; round += 1) {
      pretendToWork(world.driver, world.session);
      runTo(
        world.driver,
        world.session,
        world.session.engine.now() + METER_INTERVAL_TICKS,
      );
    }

    const banked = number(world.session, FIELDS.dndWorkingTicks);

    expect(banked).toBeGreaterThan(0);

    runTo(world.driver, world.session, shiftEndTick(1));
    world.driver.clockOff();
    world.driver.startShift();

    expect(world.driver.presence()).toBe('dnd');
    expect(number(world.session, FIELDS.dndWorkingTicks)).toBe(0);
    expect(world.driver.dndBeat().minutes).toBe(0);
  });

  /**
   * And it cannot drum. Being spoken to puts suspicion on the floor a
   * spoken-to person sits at, which is below the threshold that armed it - so
   * the next conversation costs another morning of the same behaviour rather
   * than the next time he walks past.
   */
  it('is one conversation, not one per corridor', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    expect(workUntilArmed(world)).toBe(true);

    workUntilSpokenTo(world);

    expect(world.scenes).toHaveLength(1);
    // Being spoken to puts the meter back down to the floor a spoken-to
    // person sits at. It is not exactly the floor by the time this reads it -
    // the conversation costs minutes, and those minutes are still a morning
    // behind a red dot - but it is well under the mark that armed the beat,
    // which is the property that stops it drumming.
    expect(number(world.session, FIELDS.suspicion))
      .toBeLessThan(DND_BEAT_SUSPICION);
    expect(number(world.session, FIELDS.suspicion))
      .toBeGreaterThanOrEqual(CAUGHT_SUSPICION_FLOOR);
    expect(world.driver.dndBeat().armed).toBe(false);

    // The rest of the day, with the dot still on and nobody working: he walks
    // past again and has nothing new to say.
    runTo(world.driver, world.session, shiftEndTick(1));

    expect(world.driver.presence()).toBe('dnd');
    expect(world.scenes).toHaveLength(1);
    expect(
      conductEntries(player(world.session, FIELDS.conductFile))
        .filter((entry) => entry.kind === 'status'),
    ).toHaveLength(1);
  });

  /**
   * The one that would make it a random scold. A whole day of the corridor
   * with an honest dot on it is a day nobody says anything about.
   */
  it('never fires unarmed, however often he comes past', () => {
    const world = harnessOn(1);

    for (let round = 0; round < 60; round += 1) {
      pretendToWork(world.driver, world.session);
      runTo(
        world.driver,
        world.session,
        world.session.engine.now() + METER_INTERVAL_TICKS,
      );
    }

    expect(world.driver.presence()).toBe('available');
    expect(world.scenes).toEqual([]);
    expect(
      conductEntries(player(world.session, FIELDS.conductFile))
        .some((entry) => entry.kind === 'status'),
    ).toBe(false);
  });
});

/* -- what a minute of the dot costs ---------------------------------------- */

/**
 * The drip, integrated, and the two exploits an endpoint sample had in it.
 *
 * The old shape read the dot and the touch log ONCE per five-minute meter
 * boundary and charged for the whole interval or none of it. That made the
 * cost a rule about two instants a day while the BENEFIT - a call that slides
 * instead of ringing - was read at every arrival tick, and the asymmetry was
 * worth a whole morning of free quiet to anybody who noticed it.
 */
describe('the price of the dot, minute by minute', () => {
  /**
   * The dance: up for a minute, down for a minute, all morning. Under the
   * sample it was never once observed and cost nothing at all; under the
   * integral it costs the minutes it was actually up.
   */
  it('charges the minutes it was up, however they are chopped', () => {
    const world = harnessOn(1);

    for (let round = 0; round < 12; round += 1) {
      pretendToWork(world.driver, world.session);
      // Up for one minute, at a minute nobody would call a boundary...
      expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
      runTo(world.driver, world.session, world.session.engine.now() + 1);
      // ...and down again before the meters look.
      expect(world.driver.setPresence('available')).toEqual({ ok: true });
      runTo(
        world.driver,
        world.session,
        world.session.engine.now() + METER_INTERVAL_TICKS - 1,
      );
    }

    // Twelve minutes of it, on the record, banked at the minute each one
    // ended rather than at whatever the boundary happened to see.
    expect(number(world.session, FIELDS.dndWorkingTicks)).toBe(12);
    // And paid for: twelve minutes at two points per five is four whole
    // points, with the remainder kept rather than dropped.
    expect(number(world.session, FIELDS.suspicion))
      .toBeGreaterThanOrEqual(
        Math.floor((12 * DND_WORKING_SUSPICION) / METER_INTERVAL_TICKS),
      );
  });

  /**
   * The other half of the same asymmetry: dropping the dot a moment before a
   * boundary used to erase the minutes it had genuinely been up for, and
   * raising it a moment before one used to bank five minutes of Available.
   */
  it('bills a status by its own minutes rather than by the boundary', () => {
    const dropped = harnessOn(1);

    pretendToWork(dropped.driver, dropped.session);
    expect(dropped.driver.setPresence('dnd')).toEqual({ ok: true });
    runTo(
      dropped.driver,
      dropped.session,
      dropped.session.engine.now() + METER_INTERVAL_TICKS - 1,
    );
    expect(dropped.driver.setPresence('available')).toEqual({ ok: true });
    runTo(
      dropped.driver,
      dropped.session,
      dropped.session.engine.now() + METER_INTERVAL_TICKS,
    );

    // Four minutes were behind the dot and four minutes are on the record.
    expect(number(dropped.session, FIELDS.dndWorkingTicks))
      .toBe(METER_INTERVAL_TICKS - 1);

    const raised = harnessOn(1);

    pretendToWork(raised.driver, raised.session);
    runTo(
      raised.driver,
      raised.session,
      raised.session.engine.now() + METER_INTERVAL_TICKS - 1,
    );
    expect(raised.driver.setPresence('dnd')).toEqual({ ok: true });
    runTo(
      raised.driver,
      raised.session,
      raised.session.engine.now() + 1,
    );

    // One minute of it, not the five the boundary would have banked.
    expect(number(raised.session, FIELDS.dndWorkingTicks)).toBe(1);
  });

  /** And none of the minutes that were not a lie at all. */
  it('counts no minute the desk was quiet for', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    runTo(
      world.driver,
      world.session,
      world.session.engine.now() + METER_INTERVAL_TICKS * 4,
    );

    expect(player(world.session, FIELDS.dndWorkingTicks)).toBeUndefined();
    expect(number(world.session, FIELDS.suspicion)).toBe(0);
  });
});

/* -- the phone that did not ring ------------------------------------------- */

describe('the record of a call the dot turned away', () => {
  it('names who tried and the minute they tried it', () => {
    const world = harnessOn(2);
    const entry = buildInterruptionSchedule(
      world.session.seed,
      2,
      interruptionPlanFor(2, world.session.seed),
    ).entries.find((candidate) => candidate.id === 'call:spooler');

    expect(entry).toBeDefined();
    expect(world.driver.dodgedInterruptions()).toEqual([]);

    runTo(world.driver, world.session, (entry?.tick ?? 0) - 2);
    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    runTo(world.driver, world.session, (entry?.tick ?? 0) + 1);

    const dodged = world.driver.dodgedInterruptions();

    expect(dodged).toHaveLength(1);
    expect(dodged[0]?.entry.id).toBe('call:spooler');
    // The minute is the world's, not the schedule's: it is when the dot sent
    // them away, which is what the player is owed an account of.
    expect(dodged[0]?.tick).toBe(entry?.tick);
    // They have not given up - the same call is coming back.
    expect(dodged[0]?.gaveUp).toBe(false);
  });

  /**
   * Held all day, it runs out of day - and the record says so, which is the
   * one case where a slide is the last thing that happened to somebody.
   */
  it('says when nobody ever came back', () => {
    const world = harnessOn(2);

    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    runTo(world.driver, world.session, shiftEndTick(2));

    const dodged = world.driver.dodgedInterruptions();

    expect(dodged.length).toBeGreaterThan(3);
    // ONE of them gave up, and it is the last: every earlier slide was
    // followed by the same caller trying again, which the ledger itself
    // proves. Reading the missed list against every slide made a morning of
    // somebody ringing back render as five people who never tried again.
    expect(dodged.filter((record) => record.gaveUp)).toHaveLength(1);
    expect(dodged[dodged.length - 1]?.gaveUp).toBe(true);
    expect(dodged.slice(0, -1).some((record) => record.gaveUp)).toBe(false);
    // In order, oldest first, which is how a message pad by a phone reads.
    expect([...dodged].sort((left, right) => left.tick - right.tick))
      .toEqual(dodged);
  });

  it('is empty for a day nobody set a dot on', () => {
    const world = harnessOn(2);

    runTo(world.driver, world.session, shiftEndTick(2));

    expect(world.driver.dodgedInterruptions()).toEqual([]);
  });
});

/* -- the chat beat, the whole tradeoff walked ------------------------------ */

/**
 * The 0.4.3 journey (F4/F5), on the world half: a Thursday behind the dot that
 * dodges the chat message, collects the drip, and meets the lead about the dot
 * - all three, in one morning, off ONE authored beat.
 *
 * This is the run the 0.3.6 review said the constants had to be re-evaluated
 * ON. Before this beat the shipped week authored nothing a dot could wave off
 * on the days a player would think to try it, so Do Not Disturb could go a
 * whole probation reading as free. The chat message is the thing that presses
 * it: a red dot slides it (it READS_THE_DOT and it is declinable), and the
 * price of that quiet is the drip and, past the mark, the man at the desk.
 *
 * The golden walks it on Available - the message lands and costs its two points
 * - so the DODGE half lives here, where the dot is red, exactly as the slice
 * asked: the goldens move for the arrival, the focused test walks the dodge.
 */
describe('the chat beat the dot can wave off', () => {
  const CHAT_BEAT = 'chat:dennis-calendar';

  it('dodges the message, collects the drip, and meets the lead about it', () => {
    const world = harnessOn(4);
    const entry = buildInterruptionSchedule(
      world.session.seed,
      4,
      interruptionPlanFor(4, world.session.seed),
    ).entries.find((candidate) => candidate.id === CHAT_BEAT);

    // The beat exists, it reads the dot, and it can be waved off - the three
    // facts that make it the thing 0.3.3 was missing. A beat that was not
    // declinable, or came from a source the dot cannot see, would pass this
    // file and teach nothing.
    expect(entry, 'the Thursday chat beat is authored').toBeDefined();
    expect(entry ? readsTheDot(entry.source) : false).toBe(true);
    expect(entry?.declinable).toBe(true);

    // Behind the dot from the top of the shift, and working the whole time -
    // which is the morning the beat is about. `workUntilArmed` steps the clock
    // in meter intervals, so the chat message's arrival tick is crossed with
    // the dot red, and it slides rather than ringing.
    expect(world.driver.setPresence('dnd')).toEqual({ ok: true });
    expect(workUntilArmed(world), 'the beat never armed').toBe(true);

    // THE DODGE. The message is in the record of phones that did not ring, at
    // the minute the dot sent it away - which is the whole of what the dodge
    // SAVED: the two points of arrival stress the golden's Available week pays
    // for this exact beat were never charged, because it never arrived.
    expect(
      world.driver.dodgedInterruptions()
        .some((record) => record.entry.id === CHAT_BEAT),
      'the chat beat was waved off by the dot',
    ).toBe(true);

    // THE PRICE, which is the other half of the tradeoff: the drip put the
    // meter over the mark the beat arms on, off nothing but a dot that
    // disagreed with the log.
    expect(number(world.session, FIELDS.suspicion))
      .toBeGreaterThanOrEqual(DND_BEAT_SUSPICION);

    // Nothing has been SAID yet - arming is evidence, not a conversation - and
    // then the corridor decides when, exactly as it does for a game on a
    // screen.
    expect(world.scenes).toEqual([]);
    workUntilSpokenTo(world);

    // THE BEAT. The lead comes down about the dot, the caught-scene class, with
    // the morning behind him as a captured number of at least the half hour the
    // beat needs. That is the trade, whole: the message dodged for free at the
    // desk, paid for in the suspicion that armed this, in a currency the player
    // cannot be innocent of once the dot is red over a desk that is working.
    expect(world.scenes).toEqual([PRESENCE_CAUGHT_KEY]);
    expect(world.evidence[0] ?? 0).toBeGreaterThanOrEqual(DND_BEAT_MINUTES);
  });
});

/* -- who can be kept waiting ----------------------------------------------- */

describe('the Away sting', () => {
  /**
   * Nobody notices their own dot.
   *
   * The desk's own faults are raised by the person sitting at it - the fan
   * that has been grinding since the middle of Monday morning is Pat's own
   * ticket - and a reputation hit for keeping YOURSELF waiting is a fine with
   * nobody on the other end of it, plus a chat line from the player to the
   * player.
   *
   * The setup is deliberate rather than incidental: everybody else's ticket is
   * answered first, so the ONLY thing still waiting for a first word is the
   * player's own. That is the state the bug lived in, and a test that did not
   * build it would pass with the bug in place - somebody else is almost always
   * waiting longer.
   */
  it('is never taken by the player against the player', () => {
    const world = harnessOn(1);

    // Late enough for the desk's own fault to have arrived and be waiting.
    runTo(world.driver, world.session, shiftStartTick(1) + 120);

    for (let round = 0; round < 20; round += 1) {
      answerSomebodyElse(world.driver, world.session);
    }

    expect(waitingReporters(world.session)).toEqual([COMPANY_IDS.player]);

    world.noticed.length = 0;
    expect(world.driver.setPresence('away')).toEqual({ ok: true });

    // Demonstrable work, accepted by the world, with the dot on Away: the
    // exact shape that buys somebody their one thought about it.
    expect(
      world.driver.dispatch(
        HELPDESK_ACTIONS.machineSetDisplayRotation,
        COMPANY_IDS.player,
        COMPANY_IDS.adaMachine,
        { rotation: 90 },
      ).ok,
    ).toBe(true);

    expect(world.noticed).toEqual([]);
    expect(player(world.session, FIELDS.presenceNoticed)).toBeUndefined();
  });

  /**
   * And the same afternoon with somebody else waiting is answered, so the
   * assertion above is about WHO rather than about a sting that stopped
   * working.
   */
  it('is taken by whoever is actually waiting', () => {
    const world = harnessOn(1);

    expect(world.driver.setPresence('away')).toEqual({ ok: true });
    expect(doSomething(world.driver, world.session)).toBe(true);

    expect(world.noticed.length).toBe(1);
    expect(world.noticed).not.toContain(COMPANY_IDS.player);
  });
});
