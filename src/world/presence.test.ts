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
  dndEvidence,
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
  dndWorkingMinutes: 0,
  dndWorkingTicks: 0,
  dndSuspicionCharged: 0,
};

function deltas(overrides: Partial<MeterInputs>): ReturnType<typeof meterDeltas> {
  return meterDeltas({ ...QUIET, ...overrides });
}

/**
 * The drip, as an INTEGRAL over minutes rather than a sample at a boundary.
 *
 * What arrives here is a count of minutes that genuinely were
 * do-not-disturb-while-working: the dot, the touch log and lunch are all read
 * a minute at a time by the driver, which is the half that has the clock. What
 * this module decides is what a bank of those minutes is worth and how much of
 * it has already been paid - and the answer has to be exact however the
 * minutes are chopped up, because the whole point of the rewrite is that the
 * phase of somebody's clicking is worth nothing.
 */
describe('do not disturb while the log says working', () => {
  it('charges a full interval of it exactly what an interval is worth', () => {
    const dripping = deltas({ dndWorkingMinutes: METER_INTERVAL_TICKS });

    expect(dripping.suspicionUp).toBe(DND_WORKING_SUSPICION);
    // The same rule the slack windows keep: an interval that charged is not an
    // interval that also drains.
    expect(dripping.suspicionDown).toBe(0);
    expect(dripping.suspicionEvent).toBe(true);
    expect(dripping.dndWorkingTicks).toBe(METER_INTERVAL_TICKS);
    expect(dripping.dndSuspicionCharged).toBe(DND_WORKING_SUSPICION);
  });

  /**
   * The exploit this shape exists to close, stated as arithmetic: the same
   * minutes cost the same points however they are cut up, so there is no
   * pattern of clicking that is cheaper than any other.
   */
  it('charges the same for the minutes however they arrive', () => {
    let banked = 0;
    let charged = 0;

    for (let minute = 0; minute < 4 * METER_INTERVAL_TICKS; minute += 1) {
      const step = deltas({
        dndWorkingMinutes: 1,
        dndWorkingTicks: banked,
        dndSuspicionCharged: charged,
      });

      banked += step.dndWorkingTicks;
      charged = step.dndSuspicionCharged;
    }

    const wholesale = deltas({ dndWorkingMinutes: 4 * METER_INTERVAL_TICKS });

    expect(banked).toBe(4 * METER_INTERVAL_TICKS);
    expect(charged).toBe(wholesale.suspicionUp);
    expect(charged).toBe(4 * DND_WORKING_SUSPICION);
  });

  /**
   * And the fractions are kept rather than dropped. A minute is worth two
   * fifths of a point, which is not a point - the bank is what is charged, so
   * nothing is free and nothing is rounded up into a punishment.
   */
  it('keeps the fraction of a point a single minute is worth', () => {
    const oneMinute = deltas({ dndWorkingMinutes: 1 });

    expect(oneMinute.suspicionUp).toBe(0);
    expect(oneMinute.dndWorkingTicks).toBe(1);
    // Not a drain either: the minute was a lie, and a lie that earned back a
    // point would be worth having.
    expect(oneMinute.suspicionDown).toBe(0);

    const fifth = deltas({
      dndWorkingMinutes: 1,
      dndWorkingTicks: METER_INTERVAL_TICKS - 1,
      dndSuspicionCharged: 0,
    });

    expect(fifth.suspicionUp).toBe(DND_WORKING_SUSPICION);
  });

  it('costs nothing when none of the minutes were the dot', () => {
    const still = deltas({ dndWorkingMinutes: 0 });

    expect(still.suspicionUp).toBe(0);
    expect(still.suspicionDown).toBe(SUSPICION_CLEAN_DRAIN);
    expect(still.dndWorkingTicks).toBe(0);
    expect(still.dndSuspicionCharged).toBe(0);
  });

  it('never bills the same minutes twice', () => {
    const settled = deltas({
      dndWorkingMinutes: 0,
      dndWorkingTicks: 4 * METER_INTERVAL_TICKS,
      dndSuspicionCharged: 4 * DND_WORKING_SUSPICION,
    });

    expect(settled.suspicionUp).toBe(0);
    expect(settled.dndSuspicionCharged).toBe(4 * DND_WORKING_SUSPICION);
  });

  it('stacks with what is on the screen rather than replacing it', () => {
    const both = deltas({
      dndWorkingMinutes: METER_INTERVAL_TICKS,
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

  /**
   * The words the lead uses for the number the world keeps.
   *
   * Two properties and they are both content rules rather than arithmetic: it
   * never says a number out loud, because nobody has ever been asked "were you
   * on Do Not Disturb for fifty-five minutes"; and it never says less of the
   * morning than the record holds, because a phrase that shrank as the morning
   * grew would be the one line of this scene that was not true.
   */
  /**
   * The band that was a lie: the beat arms at half an hour and the shift's
   * morning is four of them, so the SMALLEST reading this can ever be handed
   * used to render as "half the morning" - a scene whose entire job is to be
   * traceable to a number, overstating its own evidence fourfold.
   */
  it('never claims more of the morning than the minutes bought', () => {
    const morning = 4 * 60;

    for (const minutes of [DND_BEAT_MINUTES, 44, 45, 74, 75, 134, 209, 240]) {
      const said = dndEvidence(minutes);

      if (said.includes('whole morning')) {
        expect(minutes, said).toBeGreaterThanOrEqual(morning * 0.85);
      }

      if (said.includes('most of the morning')) {
        expect(minutes, said).toBeGreaterThanOrEqual(morning / 2);
      }

      if (said.includes('best part of an hour')) {
        expect(minutes, said).toBeGreaterThanOrEqual(45);
        expect(minutes, said).toBeLessThan(90);
      }

      if (said.includes('over an hour')) {
        expect(minutes, said).toBeGreaterThan(60);
      }
    }

    // And the floor of the whole thing - the smallest reading the beat can
    // ever be armed with - claims a half hour and nothing more.
    expect(dndEvidence(DND_BEAT_MINUTES)).toBe('about half an hour');
    expect(dndEvidence(DND_BEAT_MINUTES)).not.toContain('morning');
  });

  it('says how much of the morning it was without saying a number', () => {
    const phrases = [30, 59, 60, 119, 120, 179, 180, 400]
      .map((minutes) => dndEvidence(minutes));

    for (const phrase of phrases) {
      expect(phrase).not.toMatch(/\d/u);
      expect(phrase.length).toBeGreaterThan(8);
    }

    // It never goes backwards: each threshold says at least as much as the
    // one below it, which is what makes it a reading of the same record.
    expect(new Set(phrases).size).toBeGreaterThan(2);
    expect(dndEvidence(DND_BEAT_MINUTES)).toBe(dndEvidence(DND_BEAT_MINUTES + 1));
    expect(dndEvidence(400)).toContain('whole');
  });

  it('keeps the working window inside the beat it earns', () => {
    // Half an hour of evidence is at least two windows of work, so a beat
    // cannot arm off one interrupted-looking interval.
    expect(DND_BEAT_MINUTES).toBeGreaterThan(DND_WORKING_TICKS);
    expect(DND_SLIDE_MINUTES).toBeGreaterThan(0);
    expect(DND_BEAT_SUSPICION).toBeLessThan(100);
  });
});
