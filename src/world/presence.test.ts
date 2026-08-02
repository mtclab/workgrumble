/**
 * The dot, as arithmetic: what it is, what it exempts, what it drips and where
 * it puts a call it slid past.
 *
 * Everything here is pure - the schedule and the meters are both modules that
 * take a description of the world and answer with numbers - so this is the
 * floor the driver's journeys stand on. What it cannot prove is that a player
 * ever meets any of it; that is `shell/presence.test.ts`, and it asserts
 * states rather than calls.
 */

import { describe, expect, it } from 'vitest';

import {
  buildInterruptionSchedule,
  dodgeLandings,
  dodgesUnderDnd,
  type InterruptionPlan,
  type InterruptionSlot,
  placeDeferred,
  placeInterruptions,
  worstCaseWindows,
} from './interruptions';
import { shiftEndTick, shiftStartTick, tickAtMinute } from './hours';
import {
  type MeterInputs,
  METER_INTERVAL_TICKS,
  meterDeltas,
  SUSPICION_CLEAN_DRAIN,
} from './meters';
import {
  AWAY_NOTICED_REPUTATION,
  DEFAULT_PRESENCE,
  DND_BEAT_MINUTES,
  DND_BEAT_SUSPICION,
  DND_SLIDE_MINUTES,
  DND_WORKING_SUSPICION,
  DND_WORKING_TICKS,
  dndBeat,
  isPresence,
  PRESENCE_VALUES,
  type Presence,
  presenceCode,
  readPresence,
} from './presence';

const DAY = 2;
const SEED = 4_242;

/** One declinable call, authored where the day has room for it. */
function call(minute: number, minutes = 6): InterruptionSlot {
  return {
    id: 'call:fixture',
    source: 'call',
    minute,
    minutes,
    relatedTicket: null,
    declinable: true,
    severity: 1,
    flavor: {
      caller: 'person:nobody',
      subject: 'A fixture, and not a call anybody takes',
      opens: 'ringing-fixture',
    },
  };
}

function scheduleOf(slots: readonly InterruptionSlot[]): ReturnType<
  typeof buildInterruptionSchedule
> {
  const plan: InterruptionPlan = { slots, blocked: [] };
  return buildInterruptionSchedule(SEED, DAY, plan);
}

/* -- the vocabulary -------------------------------------------------------- */

describe('the dot', () => {
  it('is available for anybody who has never touched the tray', () => {
    expect(DEFAULT_PRESENCE).toBe('available');
    // Absent, and everything a save from another build could hold.
    expect(readPresence(undefined)).toBe('available');
    expect(readPresence(null)).toBe('available');
    expect(readPresence('')).toBe('available');
    expect(readPresence('invisible')).toBe('available');
    expect(readPresence(2)).toBe('available');
  });

  it('reads back the three the office knows about', () => {
    for (const presence of PRESENCE_VALUES) {
      expect(isPresence(presence)).toBe(true);
      expect(readPresence(presence)).toBe(presence);
      // The number the verb takes is the index, and the round trip is what
      // stops a surface and the world from disagreeing about which is which.
      expect(PRESENCE_VALUES[presenceCode(presence)]).toBe(presence);
    }

    expect(isPresence('busy')).toBe(false);
    expect(isPresence(0)).toBe(false);
  });
});

/* -- what it may and may not touch ----------------------------------------- */

describe('the filter', () => {
  const entry = { source: 'call', declinable: true } as const;

  it('is the dot on do not disturb and nothing else', () => {
    expect(dodgesUnderDnd(entry, 'dnd')).toBe(true);
    expect(dodgesUnderDnd(entry, 'available')).toBe(false);
    // Away is a lie rather than a filter. It changes nothing about what
    // arrives, which is the whole reason it costs what it costs.
    expect(dodgesUnderDnd(entry, 'away')).toBe(false);
  });

  /**
   * The two exemptions, and they are the point of the mechanic rather than a
   * limitation of it: the Wednesday sync and the Thursday reboot stay
   * undodgeable however the tray is set, because neither of them is a person
   * who can read a status.
   */
  it('cannot touch the meeting or the workstation', () => {
    expect(dodgesUnderDnd({ source: 'meeting', declinable: false }, 'dnd'))
      .toBe(false);
    expect(dodgesUnderDnd({ source: 'machine', declinable: false }, 'dnd'))
      .toBe(false);
    // Not even one authored the other way round, which the loader refuses
    // anyway - the rule is stated three times so it survives a fourth source.
    expect(dodgesUnderDnd({ source: 'meeting', declinable: true }, 'dnd'))
      .toBe(false);
    expect(dodgesUnderDnd({ source: 'machine', declinable: true }, 'dnd'))
      .toBe(false);
  });

  it('cannot touch a callback, because that is them ringing back', () => {
    expect(dodgesUnderDnd({ source: 'call', declinable: false }, 'dnd'))
      .toBe(false);
  });
});

/* -- where a slid call ends up --------------------------------------------- */

describe('a call the dot slid past', () => {
  it('comes back a fixed window after the minute it slid at', () => {
    const schedule = scheduleOf([call(10 * 60)]);
    const entry = schedule.entries[0];

    expect(entry).toBeDefined();

    const placed = placeDeferred(
      entry ?? { id: '' } as never,
      schedule,
      [],
      [],
      [entry?.tick ?? 0],
    );

    expect(placed?.tick).toBe((entry?.tick ?? 0) + DND_SLIDE_MINUTES);
    // And it is still a call somebody can say no to. Nobody asked them to ring
    // back - the phone did not ring at all - so the three answers are all
    // still on the table when it does.
    expect(placed?.declinable).toBe(true);
  });

  it('spends none of the postpone budget doing it', () => {
    const schedule = scheduleOf([call(10 * 60)]);
    const entry = schedule.entries[0];
    const placed = placeDeferred(
      entry ?? { id: '' } as never,
      schedule,
      [],
      [],
      [entry?.tick ?? 0, (entry?.tick ?? 0) + DND_SLIDE_MINUTES],
    );

    // Two slides, and the budget the row was authored with is untouched: a
    // morning on do not disturb must not quietly eat a workstation's windows.
    expect(placed?.postpones).toEqual(entry?.postpones);
  });

  /**
   * The drop, which is the honest end of a call that never got through: it was
   * declinable, the day ran out, and the world is left holding the record
   * rather than the call.
   */
  it('is dropped when there is no day left to slide into', () => {
    const schedule = scheduleOf([call(10 * 60)]);
    const entry = schedule.entries[0];
    const slides: number[] = [];
    let at = entry?.tick ?? 0;

    for (let slide = 0; slide < 200; slide += 1) {
      slides.push(at);

      const placed = placeDeferred(
        entry ?? { id: '' } as never,
        schedule,
        [],
        [],
        slides,
      );

      if (placed === null) {
        break;
      }

      at = placed.tick;
      expect(at).toBeLessThan(shiftEndTick(DAY));
    }

    expect(placeDeferred(entry ?? { id: '' } as never, schedule, [], [], slides))
      .toBeNull();
    // It took a whole morning and afternoon of slides to get there, which is
    // what makes the drop an outcome rather than a shortcut.
    expect(slides.length).toBeGreaterThan(5);
  });

  it('keeps out of the way of everything the day already booked', () => {
    // A slide that lands on lunch is pushed past it, exactly as an authored
    // entry is: the half hour nobody is looking for you is not a half hour
    // somebody rings you in.
    const schedule = scheduleOf([call(11 * 60 + 55)]);
    const entry = schedule.entries[0];
    const placed = placeDeferred(
      entry ?? { id: '' } as never,
      schedule,
      [],
      [],
      [entry?.tick ?? 0],
    );

    expect(placed).not.toBeNull();
    expect(placeInterruptions(schedule, [], {
      spentAt: {},
      declined: [],
      dodgedAt: { 'call:fixture': [entry?.tick ?? 0] },
    })).toHaveLength(1);
  });
});

/* -- the worst case the gate walks ----------------------------------------- */

describe('the worst schedule under a dot', () => {
  it('books every minute a slid call could ever land on', () => {
    const schedule = scheduleOf([call(10 * 60)]);
    const entry = schedule.entries[0];
    const landings = dodgeLandings(entry ?? { id: '' } as never, schedule, []);

    // The first is where it was actually due, because a dot the player sets at
    // ten past is a dot the first ring happened without.
    expect(landings[0]?.from).toBe(entry?.tick);
    expect(landings.length).toBeGreaterThan(5);

    for (const window of landings) {
      expect(window.to).toBeLessThanOrEqual(shiftEndTick(DAY));
      expect(window.from).toBeGreaterThanOrEqual(shiftStartTick(DAY));
    }

    // And the model is strictly bigger than the one without a dot, which is
    // what makes it a worst case rather than a different case.
    expect(worstCaseWindows(schedule, [], 'dnd').length)
      .toBeGreaterThan(worstCaseWindows(schedule, [], 'available').length);
  });

  it('leaves the undodgeable half of the week exactly where it was', () => {
    const sync: InterruptionSlot = {
      id: 'meeting:fixture',
      source: 'meeting',
      minute: 10 * 60 + 30,
      minutes: 30,
      relatedTicket: null,
      declinable: false,
      severity: 3,
      flavor: { scene: 'scene:fixture', subject: 'A fixture' },
    };
    const schedule = scheduleOf([sync]);

    expect(worstCaseWindows(schedule, [], 'dnd'))
      .toEqual(worstCaseWindows(schedule, [], 'available'));
    expect(worstCaseWindows(schedule, [], 'dnd')).toEqual([
      { from: tickAtMinute(DAY, 10 * 60 + 30), to: tickAtMinute(DAY, 11 * 60) },
    ]);
  });
});

/* -- what the dot costs the meters ----------------------------------------- */

const QUIET: MeterInputs = {
  openTickets: 0,
  breachedTickets: 0,
  breachesCharged: 0,
  resolveCredit: 0,
  resolveCreditPaid: 0,
  openSlackApps: [],
  focusedSlackApp: null,
  lunch: false,
  presence: 'available',
  working: false,
};

function deltas(overrides: Partial<MeterInputs>): ReturnType<typeof meterDeltas> {
  return meterDeltas({ ...QUIET, ...overrides });
}

describe('do not disturb while the log says working', () => {
  it('drips, and stops the drain that would have run', () => {
    const dripping = deltas({ presence: 'dnd', working: true });

    expect(dripping.suspicionUp).toBe(DND_WORKING_SUSPICION);
    // The same rule the slack windows keep: an interval that charged is not an
    // interval that also drains.
    expect(dripping.suspicionDown).toBe(0);
    expect(dripping.suspicionEvent).toBe(true);
    expect(dripping.dndWorkingTicks).toBe(METER_INTERVAL_TICKS);
  });

  it('costs nothing while the queue is untouched', () => {
    const still = deltas({ presence: 'dnd', working: false });

    expect(still.suspicionUp).toBe(0);
    expect(still.suspicionDown).toBe(SUSPICION_CLEAN_DRAIN);
    expect(still.dndWorkingTicks).toBe(0);
  });

  it('costs nothing at lunch, where nobody is reading anything', () => {
    const lunch = deltas({ presence: 'dnd', working: true, lunch: true });

    expect(lunch.suspicionUp).toBe(0);
    expect(lunch.dndWorkingTicks).toBe(0);
  });

  it('costs nothing at all on the other two dots', () => {
    for (const presence of ['available', 'away'] as const) {
      const clean = deltas({ presence, working: true });

      expect(clean.suspicionUp, presence).toBe(0);
      expect(clean.dndWorkingTicks, presence).toBe(0);
      expect(clean.suspicionDown, presence).toBe(SUSPICION_CLEAN_DRAIN);
    }
  });

  it('stacks with what is on the screen rather than replacing it', () => {
    const both = deltas({
      presence: 'dnd',
      working: true,
      openSlackApps: ['browser'],
      focusedSlackApp: 'browser',
    });
    const window = deltas({
      openSlackApps: ['browser'],
      focusedSlackApp: 'browser',
    });

    expect(both.suspicionUp).toBe(window.suspicionUp + DND_WORKING_SUSPICION);
  });
});

/* -- the beat, and the evidence under it ----------------------------------- */

describe('the status beat', () => {
  it('arms only on the dot, the meter and the minutes together', () => {
    expect(dndBeat('dnd', DND_BEAT_SUSPICION, DND_BEAT_MINUTES).armed)
      .toBe(true);
    // A meter without the minutes is a morning on the forum, which is a
    // different conversation this game already has.
    expect(dndBeat('dnd', DND_BEAT_SUSPICION, DND_BEAT_MINUTES - 1).armed)
      .toBe(false);
    // And the minutes without the meter are a quiet half hour nobody minded.
    expect(dndBeat('dnd', DND_BEAT_SUSPICION - 1, DND_BEAT_MINUTES).armed)
      .toBe(false);
  });

  it('never arms for a dot that is not on, whatever the record says', () => {
    for (const presence of ['available', 'away'] satisfies Presence[]) {
      expect(
        dndBeat(presence, 100, DND_BEAT_MINUTES * 10).armed,
        presence,
      ).toBe(false);
    }
  });

  it('says what it read, so a scene can name a number', () => {
    const reading = dndBeat('dnd', 51, 40);

    expect(reading.presence).toBe('dnd');
    expect(reading.suspicion).toBe(51);
    expect(reading.minutes).toBe(40);
  });
});

/* -- the balance table, held to being conservative ------------------------- */

describe('the numbers', () => {
  /**
   * A tuning knob is allowed to move; a knob that has quietly become the
   * loudest thing in the game is not. Each of these is a RELATION rather than
   * a value - the dot must stay cheaper than being seen, its window must stay
   * inside the working definition it is measured against - so a rebalance
   * moves them together or says why here.
   */
  it('keeps the dot cheaper than being seen at anything', () => {
    expect(DND_WORKING_SUSPICION).toBeLessThan(3);
    expect(DND_WORKING_SUSPICION).toBeGreaterThan(0);
    expect(AWAY_NOTICED_REPUTATION).toBeGreaterThan(0);
    expect(AWAY_NOTICED_REPUTATION).toBeLessThan(3);
  });

  it('keeps the working window inside the beat it earns', () => {
    // Half an hour of evidence is at least two windows of work, so a beat
    // cannot arm off one interrupted-looking interval.
    expect(DND_BEAT_MINUTES).toBeGreaterThan(DND_WORKING_TICKS);
    expect(DND_SLIDE_MINUTES).toBeGreaterThan(0);
    expect(DND_BEAT_SUSPICION).toBeLessThan(100);
  });
});
