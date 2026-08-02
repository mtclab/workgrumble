import { describe, expect, it } from 'vitest';

import { buildPatrolSchedule, patrolWindows } from './boss';
import {
  lunchWindow,
  SHIFT_END_MINUTE,
  shiftWindow,
  type TickWindow,
  tickAtMinute,
} from './hours';
import {
  buildInterruptionSchedule,
  byCodepoint,
  declineWithdrawn,
  DEFER_MINUTES,
  deferredArrival,
  EMPTY_INTERRUPTION_PLAN,
  entryWindow,
  INTERRUPTION_OPENS_AFTER,
  type InterruptionEntry,
  type InterruptionPlan,
  type InterruptionSlot,
  interruptionAt,
  interruptionsArrivingBetween,
  interruptionsClearOf,
  interruptionWindow,
  isBenign,
  isInterruptionSource,
  placeDeferred,
  postponeBudget,
  slideToClearTick,
  windowsOverlap,
  worstCaseEndTick,
  worstCaseWindows,
} from './interruptions';

const SEED = 0x5eed_0303;
const DAY = 2;

function slot(
  id: string,
  minute: number,
  extra: Partial<InterruptionSlot> = {},
): InterruptionSlot {
  return {
    id,
    source: 'call',
    minute,
    minutes: 6,
    relatedTicket: null,
    declinable: true,
    severity: 2,
    flavor: {
      caller: 'Somebody in accounts',
      subject: 'The printer again',
      opens: 'ringing',
    },
    ...extra,
  };
}

/** The one shape with words of its own: a block, and the room it is in. */
const MEETING: Partial<InterruptionSlot> = {
  source: 'meeting',
  minutes: 30,
  flavor: { scene: 'meeting/somewhere', subject: 'Half an hour of it' },
};

function plan(
  slots: readonly InterruptionSlot[],
  blocked: readonly TickWindow[] = [],
): InterruptionPlan {
  return { slots, blocked };
}

function at(day: number, hour: number, minute = 0): number {
  return tickAtMinute(day, hour * 60 + minute);
}

function ids(entries: readonly InterruptionEntry[]): readonly string[] {
  return entries.map((entry) => entry.id);
}

describe('the interruption schedule', () => {
  it('is empty for a day nobody has authored anything into', () => {
    const schedule = buildInterruptionSchedule(SEED, DAY);

    expect(schedule.entries).toEqual([]);
    expect(schedule.dropped).toEqual([]);
    expect(schedule.day).toBe(DAY);
    expect(schedule.shift).toEqual(shiftWindow(DAY));
  });

  /**
   * The determinism contract, stated as bytes rather than as a feeling: the
   * same seed and the same day produce the identical schedule, and a save
   * restored mid-day recomputes it rather than carrying it.
   */
  it('is the same schedule every time it is asked, for the same seed', () => {
    const slots = [
      slot('call:accounts', 10 * 60 + 15, { jitter: 11 }),
      slot('meeting:hygiene', 10 * 60 + 30, MEETING),
      slot('call:warehouse', 14 * 60 + 5, { jitter: 9 }),
    ];

    const first = buildInterruptionSchedule(SEED, DAY, plan(slots));
    const second = buildInterruptionSchedule(SEED, DAY, plan(slots));

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('moves with the seed, so a second attempt at a week is not the first', () => {
    const slots = [slot('call:accounts', 10 * 60 + 15, { jitter: 15 })];
    const ticks = new Set(
      [SEED, SEED + 1, SEED + 2, SEED + 3, SEED + 4].map(
        (seed) => buildInterruptionSchedule(seed, DAY, plan(slots))
          .entries[0]?.tick,
      ),
    );

    // Not "all different" - a jitter is allowed to land twice - but a schedule
    // that ignored the seed would put every one of them on the same minute.
    expect(ticks.size).toBeGreaterThan(1);
  });

  it('leaves an announced hour exactly where the brief said it was', () => {
    const meeting = slot('meeting:hygiene', 10 * 60 + 30, {
      ...MEETING,
      declinable: false,
    });
    const schedule = buildInterruptionSchedule(SEED, DAY, plan([meeting]));

    expect(schedule.entries[0]?.tick).toBe(at(DAY, 10, 30));
    expect(schedule.entries[0]?.slidFrom).toBeNull();
    expect(schedule.entries[0]?.endsTick).toBe(at(DAY, 11, 0));
  });

  it('carries the authored payload through untouched', () => {
    const authored = slot('call:reporter', 11 * 60, {
      source: 'chat',
      relatedTicket: 'ticket:locked-account',
      declinable: false,
      severity: 3,
      flavor: { caller: 'Ada Mchale', line: 'It is doing it again.' },
    });
    const entry = buildInterruptionSchedule(
      SEED,
      DAY,
      plan([authored]),
    ).entries[0];

    expect(entry?.source).toBe('chat');
    expect(entry?.relatedTicket).toBe('ticket:locked-account');
    expect(entry?.declinable).toBe(false);
    expect(entry?.severity).toBe(3);
    expect(entry?.flavor).toEqual({
      caller: 'Ada Mchale',
      line: 'It is doing it again.',
    });
  });
});

/**
 * Two ids on one minute, ordered by the only ordering that is the same
 * everywhere.
 *
 * The tie-break lives inside a SEEDED schedule, so its answer is part of what
 * "the same seed gives the same week" means. `localeCompare` was here, and it
 * answers according to the reader's locale: in most English collations a
 * lower-case letter sorts before an upper-case one, and by codepoint it does
 * not. Two players on one seed would have got two different weeks, in the one
 * place nobody would ever have looked.
 */
describe('the tie-break, which is part of the seed', () => {
  it('orders equal minutes by codepoint rather than by the reader', () => {
    expect(byCodepoint('Zed', 'alpha')).toBeLessThan(0);
    expect('Zed'.localeCompare('alpha')).toBeGreaterThan(0);

    const schedule = buildInterruptionSchedule(SEED, DAY, plan([
      slot('call:alpha', 11 * 60),
      slot('call:Zed', 11 * 60),
    ]));

    // Upper case first, because 'Z' is 90 and 'a' is 97 - and because that is
    // the answer on every machine rather than on this one.
    expect(ids(schedule.entries)).toEqual(['call:Zed', 'call:alpha']);
  });
});

describe('precedence: one takeover at a time', () => {
  /**
   * The collision, constructed rather than hunted for. A call is authored into
   * the exact minutes a caught scene owns, and the assertion is not that the
   * function returned - it is that the player gets BOTH beats, in order, with
   * nothing on the screen twice and nothing lost.
   */
  it('slides a call that was due inside a caught scene', () => {
    const scene: TickWindow = { from: at(DAY, 11, 0), to: at(DAY, 11, 14) };
    const schedule = buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('call:accounts', 11 * 60 + 4)], [scene]),
    );

    const entry = schedule.entries[0];

    expect(schedule.dropped).toEqual([]);
    expect(entry?.tick).toBe(scene.to);
    expect(entry?.slidFrom).toBe(at(DAY, 11, 4));
    expect(windowsOverlap(entryWindow(entry as InterruptionEntry), scene))
      .toBe(false);
  });

  it('slides a call that was due while the lead was at the desk', () => {
    const patrol = buildPatrolSchedule(DAY, SEED);
    const blocked = patrolWindows(patrol);
    const visit = patrol.visits[0];

    expect(visit).toBeDefined();

    const schedule = buildInterruptionSchedule(
      SEED,
      DAY,
      plan(
        [slot('call:accounts', 0, { minute: 9 * 60 + 30 })],
        blocked,
      ),
    );

    // Whatever the seed did with the rounds, the answer is the same shape:
    // nothing on this schedule shares a minute with a patrol.
    expect(interruptionsClearOf(schedule, blocked)).toBeNull();
  });

  it('slides a meeting off a patrol - the boss is in the meeting too', () => {
    const round: TickWindow = { from: at(DAY, 10, 26), to: at(DAY, 10, 40) };
    const schedule = buildInterruptionSchedule(
      SEED,
      DAY,
      plan(
        [slot('meeting:hygiene', 10 * 60 + 30, {
          ...MEETING,
          declinable: false,
        })],
        [round],
      ),
    );

    expect(schedule.entries[0]?.tick).toBe(round.to);
    expect(interruptionsClearOf(schedule, [round])).toBeNull();
  });

  it('never puts two interruptions on the screen at once', () => {
    const schedule = buildInterruptionSchedule(
      SEED,
      DAY,
      plan([
        slot('call:one', 10 * 60, { minutes: 12 }),
        slot('call:two', 10 * 60 + 3, { minutes: 12 }),
        slot('call:three', 10 * 60 + 5, { minutes: 12 }),
      ]),
    );

    expect(ids(schedule.entries)).toEqual(['call:one', 'call:two', 'call:three']);
    expect(schedule.entries[1]?.tick).toBe(schedule.entries[0]?.endsTick);
    expect(schedule.entries[2]?.tick).toBe(schedule.entries[1]?.endsTick);
    expect(interruptionsClearOf(schedule, [])).toBeNull();
  });

  it('does not ring during the half hour nobody is looking for you', () => {
    const lunch = lunchWindow(DAY);
    const schedule = buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('call:accounts', 12 * 60 + 5)]),
    );

    expect(schedule.entries[0]?.tick).toBe(lunch.to);
    expect(interruptionsClearOf(schedule, [])).toBeNull();
  });

  it('pulls a call that was authored before the day opens into the window', () => {
    const window = interruptionWindow(DAY);
    const schedule = buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('call:early', 9 * 60 + 2)]),
    );

    expect(schedule.entries[0]?.tick).toBe(window.from);
    expect(window.from).toBe(shiftWindow(DAY).from + INTERRUPTION_OPENS_AFTER);
  });

  it('drops one that cannot fit rather than squeezing it into the last minute', () => {
    const shift = shiftWindow(DAY);
    const schedule = buildInterruptionSchedule(
      SEED,
      DAY,
      plan(
        [slot('call:late', 16 * 60 + 30, { minutes: 20 })],
        [{ from: at(DAY, 16, 20), to: shift.to }],
      ),
    );

    expect(schedule.entries).toEqual([]);
    expect(schedule.dropped).toEqual(['call:late']);
  });

  it('refuses a day that schedules one id twice', () => {
    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('call:accounts', 10 * 60), slot('call:accounts', 14 * 60)]),
    )).toThrow('share the record');
  });

  it('refuses a takeover nobody could read', () => {
    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('call:blink', 10 * 60, { minutes: 0 })]),
    )).toThrow('not a takeover');
  });
});

describe('the slide itself', () => {
  it('hops past every booking it meets, in order, and stops at clear air', () => {
    const blocked: TickWindow[] = [
      { from: 20, to: 30 },
      { from: 10, to: 14 },
      { from: 30, to: 41 },
    ];

    // 11 wants eight minutes: [11,19) meets [10,14), [14,22) meets [20,30),
    // [30,38) meets [30,41), and [41,49) is finally its own.
    expect(slideToClearTick(11, 8, blocked, 100)).toBe(41);
    // The bookings arrived out of order on purpose: the hop is only bounded
    // if each one moves past bookings it can never meet again.
    expect(blocked[0]).toEqual({ from: 20, to: 30 });
  });

  it('leaves a tick alone when nothing wanted those minutes', () => {
    expect(slideToClearTick(50, 5, [{ from: 20, to: 30 }], 100)).toBe(50);
  });

  it('treats a window as half-open: ending as one begins is not a clash', () => {
    expect(slideToClearTick(15, 5, [{ from: 20, to: 30 }], 100)).toBe(15);
  });

  it('answers null when the last legal start has gone by', () => {
    expect(slideToClearTick(11, 5, [{ from: 10, to: 40 }], 30)).toBeNull();
  });

  it('is given in whole minutes or not at all', () => {
    expect(() => slideToClearTick(0, 0, [], 10)).toThrow('whole number');
    expect(() => slideToClearTick(0, 1.5, [], 10)).toThrow('whole number');
  });
});

describe('reading the schedule', () => {
  const built = buildInterruptionSchedule(
    SEED,
    DAY,
    plan([
      slot('call:one', 10 * 60, { minutes: 10 }),
      slot('call:two', 14 * 60, { minutes: 10 }),
    ]),
  );

  it('says which one owns this minute, and nothing at the minute it ends', () => {
    const first = built.entries[0];

    expect(interruptionAt(built, first?.tick ?? 0)?.id).toBe('call:one');
    expect(interruptionAt(built, (first?.endsTick ?? 0) - 1)?.id)
      .toBe('call:one');
    expect(interruptionAt(built, first?.endsTick ?? 0)).toBeNull();
  });

  it('hands a clock step exactly what started inside it', () => {
    const first = built.entries[0];
    const tick = first?.tick ?? 0;

    expect(ids(interruptionsArrivingBetween(built, tick - 1, tick)))
      .toEqual(['call:one']);
    expect(interruptionsArrivingBetween(built, tick, tick + 5)).toEqual([]);
    expect(ids(interruptionsArrivingBetween(built, 0, Number.MAX_SAFE_INTEGER)))
      .toEqual(['call:one', 'call:two']);
  });
});

describe('the callback', () => {
  it('comes back at a fixed distance, and is not declinable the second time', () => {
    const first = buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('call:accounts', 10 * 60, { declinable: true })]),
    ).entries[0] as InterruptionEntry;

    const again = deferredArrival(first);

    expect(again.tick).toBe(first.tick + DEFER_MINUTES);
    expect(again.endsTick - again.tick).toBe(first.endsTick - first.tick);
    expect(again.declinable).toBe(false);
    expect(again.slidFrom).toBe(first.tick);
    expect(again.id).toBe(first.id);
    expect(again.flavor).toEqual(first.flavor);
  });
});

/* -- the postpone budget --------------------------------------------------- */

/** The one thing nobody may wave off and everybody may push: the update. */
const REBOOT: Partial<InterruptionSlot> = {
  source: 'machine',
  minutes: 12,
  declinable: false,
  severity: 3,
  postpones: [10, 5, 2],
  flavor: { subject: 'Security updates, deferred since March' },
};

describe('the postpone budget', () => {
  /**
   * 0.3.0's rule, said as data, and the reason its tests did not have to move:
   * a call the player may wave off has always had exactly one push of twenty
   * minutes, and a block they may not has always had none.
   */
  it('is one twenty-minute window for anything anybody may wave off', () => {
    expect(postponeBudget({ declinable: true })).toEqual([DEFER_MINUTES]);
    expect(postponeBudget({ declinable: false })).toEqual([]);
    // And an authored budget is the authored budget, whichever way the flag
    // reads - which is the whole of what the reboot needed.
    expect(postponeBudget({ declinable: false, postpones: [10, 5, 2] }))
      .toEqual([10, 5, 2]);
    expect(postponeBudget({ declinable: true, postpones: [] })).toEqual([]);
  });

  it('lands on the entry, so no reader has to know the default', () => {
    const schedule = buildInterruptionSchedule(SEED, DAY, plan([
      slot('machine:reboot', 14 * 60 + 10, REBOOT),
      slot('call:accounts', 10 * 60),
    ]));

    expect(schedule.entries.find((entry) => entry.id === 'machine:reboot')
      ?.postpones).toEqual([10, 5, 2]);
    expect(schedule.entries.find((entry) => entry.id === 'call:accounts')
      ?.postpones).toEqual([DEFER_MINUTES]);
  });

  /**
   * The mechanic, as the player meets it: each push buys less than the last,
   * and the minutes are counted from where the thing NOW is rather than from
   * where it first was.
   */
  it('shrinks, and each push is measured from where the last one left it', () => {
    const schedule = buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('machine:reboot', 14 * 60 + 10, REBOOT)]),
    );
    const first = schedule.entries[0] as InterruptionEntry;
    const after = (spends: number): number => (
      placeDeferred(first, schedule, [], spends)?.tick ?? -1
    );

    expect(first.tick).toBe(at(DAY, 14, 10));
    expect(after(1)).toBe(first.tick + 10);
    expect(after(2)).toBe(first.tick + 15);
    expect(after(3)).toBe(first.tick + 17);
    // And a push past the end of the list does not conjure a fourth window:
    // the last one is the last one, and refusing the spend is the world's job.
    expect(after(4)).toBe(first.tick + 19);
  });

  /**
   * The far end of the budget still has to obey the day. A landing that would
   * sit on top of something else slides, exactly as a first arrival does -
   * and, because the loader refused anything whose worst case leaks past the
   * shift, the slide has somewhere to go.
   */
  it('slides its final landing off anything the day had already booked', () => {
    const schedule = buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('machine:reboot', 14 * 60 + 10, REBOOT)]),
    );
    const first = schedule.entries[0] as InterruptionEntry;
    // The lead, standing at the desk over the minutes the last push wanted.
    const booked: TickWindow = { from: first.tick + 17, to: first.tick + 25 };
    const clear = placeDeferred(first, schedule, [], 3) as InterruptionEntry;
    const last = placeDeferred(first, schedule, [booked], 3) as InterruptionEntry;

    // Later than it would have been, off the booking entirely, and still
    // inside the day - which is the property, and which is what the loader's
    // refusal is there to keep true however the day slides it.
    expect(last.tick).toBeGreaterThan(clear.tick);
    expect(windowsOverlap(entryWindow(last), booked)).toBe(false);
    expect(last.endsTick).toBeLessThanOrEqual(schedule.shift.to);
    expect(interruptionsClearOf(
      { ...schedule, entries: [last] },
      [booked],
    )).toBeNull();
  });

  /**
   * Solvability reads the worst case, and the worst case for a reboot is
   * every window spent. Reading it as "one push, if it is declinable" - which
   * is what 0.3.0 could say - would model a day that cannot happen.
   */
  it('is what the worst case spends, for anything that carries one', () => {
    const schedule = buildInterruptionSchedule(SEED, DAY, plan([
      slot('machine:reboot', 14 * 60 + 10, REBOOT),
      slot('meeting:sync', 10 * 60 + 30, { ...MEETING, declinable: false }),
    ]));
    const reboot = schedule.entries.find(
      (entry) => entry.id === 'machine:reboot',
    ) as InterruptionEntry;
    const meeting = schedule.entries.find(
      (entry) => entry.id === 'meeting:sync',
    ) as InterruptionEntry;
    const worst = worstCaseWindows(schedule, []);

    expect(worst).toContainEqual({
      from: reboot.tick + 17,
      to: reboot.tick + 17 + 12,
    });
    // The half hour nobody may push is still the half hour it was booked for.
    expect(worst).toContainEqual(entryWindow(meeting));
    expect(worst.every((window) => window.to <= schedule.shift.to)).toBe(true);
  });
});

describe('the loader, holding a reboot to the day it is in', () => {
  /**
   * Both sides of one minute.
   *
   * The entry nobody can wave off has to fit with every postpone spent,
   * because the worst case is the player's to CHOOSE - and an entry that ran
   * out of day would either vanish without a word or hand the desk back after
   * everybody had gone home. Quiet wrongness is the enemy, so it is a refusal
   * at load rather than a surprise at ten to five.
   */
  it('refuses one whose worst case leaks past close, and takes the one that fits', () => {
    const shift = shiftWindow(DAY);
    // 17 minutes of pushes and 12 of updates: the last minute it may start on
    // is close minus 29.
    const latest = SHIFT_END_MINUTE - 29;

    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('machine:reboot', latest, REBOOT)]),
    )).not.toThrow();

    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('machine:reboot', latest + 1, REBOOT)]),
    )).toThrow(/past the end of the shift/u);

    // The arithmetic it is refusing on, said out loud: every window, then the
    // minutes the thing itself takes.
    expect(worstCaseEndTick(slot('machine:reboot', latest, REBOOT), DAY))
      .toBe(shift.to);
    expect(worstCaseEndTick(slot('machine:reboot', latest + 1, REBOOT), DAY))
      .toBe(shift.to + 1);
  });

  /**
   * Jitter counts against the budget, because jitter is minutes the day may
   * spend without asking. A row that fits only when the seed is kind is a row
   * that is wrong one week in four.
   */
  it('spends the wander before it spends the postpones', () => {
    const latest = SHIFT_END_MINUTE - 29;

    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('machine:reboot', latest - 4, { ...REBOOT, jitter: 4 })]),
    )).not.toThrow();
    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('machine:reboot', latest - 4, { ...REBOOT, jitter: 5 })]),
    )).toThrow(/past the end of the shift/u);
  });

  /** A call may ring out. That is the difference, and it is not a loophole. */
  it('leaves the ones anybody may wave off alone', () => {
    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('call:late', SHIFT_END_MINUTE - 46, { declinable: true })]),
    )).not.toThrow();
  });

  it('refuses a postpone that buys nothing at all', () => {
    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('machine:reboot', 14 * 60, { ...REBOOT, postpones: [10, 0] })]),
    )).toThrow(/buys no time/u);
  });
});

describe('the machine', () => {
  it('is a source of its own, and one nobody may wave off', () => {
    expect(isInterruptionSource('machine')).toBe(true);
    expect(declineWithdrawn({ source: 'machine' })).toBe(true);
    expect(declineWithdrawn({ source: 'meeting' })).toBe(false);

    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('machine:reboot', 14 * 60, { ...REBOOT, declinable: true })]),
    )).toThrow(/nobody on the other end/u);
  });

  it('cannot arrive without the line that says what it is doing', () => {
    expect(() => buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('machine:reboot', 14 * 60, { ...REBOOT, flavor: {} })]),
    )).toThrow(/carries no "subject"/u);
  });
});

describe('the cost model', () => {
  const related = buildInterruptionSchedule(
    SEED,
    DAY,
    plan([slot('call:reporter', 10 * 60, {
      relatedTicket: 'ticket:locked-account',
    })]),
  ).entries[0] as InterruptionEntry;

  const unrelated = buildInterruptionSchedule(
    SEED,
    DAY,
    plan([slot('call:printer', 10 * 60)]),
  ).entries[0] as InterruptionEntry;

  it('is benign only when it is about the ticket actually in hand', () => {
    expect(isBenign(related, 'ticket:locked-account')).toBe(true);
    expect(isBenign(related, 'ticket:rotated-screen')).toBe(false);
    expect(isBenign(related, null)).toBe(false);
  });

  it('is malignant whenever it is about no ticket at all', () => {
    expect(isBenign(unrelated, 'ticket:locked-account')).toBe(false);
    expect(isBenign(unrelated, null)).toBe(false);
  });
});

describe('the invariant checker', () => {
  it('catches a schedule that was built without it', () => {
    const good = buildInterruptionSchedule(
      SEED,
      DAY,
      plan([slot('call:one', 10 * 60, { minutes: 10 })]),
    );
    const entry = good.entries[0] as InterruptionEntry;

    expect(interruptionsClearOf(good, [])).toBeNull();
    expect(
      interruptionsClearOf(good, [{ from: entry.tick, to: entry.endsTick }]),
    ).toContain('already somebody else\'s');
    expect(interruptionsClearOf(
      { ...good, entries: [entry, { ...entry, id: 'call:two' }] },
      [],
    )).toContain('on the screen at once');
    expect(interruptionsClearOf(
      {
        ...good,
        entries: [{
          ...entry,
          tick: lunchWindow(DAY).from,
          endsTick: lunchWindow(DAY).from + 5,
        }],
      },
      [],
    )).toContain('through lunch');
    expect(interruptionsClearOf(
      {
        ...good,
        entries: [{
          ...entry,
          tick: good.shift.to - 2,
          endsTick: good.shift.to + 8,
        }],
      },
      [],
    )).toContain('past the end of the shift');
  });
});

describe('the empty plan', () => {
  it('is what a quiet day is made of, and cannot be edited into a loud one', () => {
    expect(EMPTY_INTERRUPTION_PLAN.slots).toEqual([]);
    expect(EMPTY_INTERRUPTION_PLAN.blocked).toEqual([]);
    expect(Object.isFrozen(EMPTY_INTERRUPTION_PLAN)).toBe(true);
    expect(Object.isFrozen(EMPTY_INTERRUPTION_PLAN.slots)).toBe(true);
  });
});
