import { describe, expect, it } from 'vitest';

import { CAUGHT_MINUTES } from './boss';
import { EMPLOYER_IDS, employerFor } from './employers';
import { SHIFT_MINUTES } from './hours';
import {
  assertWeekLoads,
  dayLoad,
  dealtOrRaised,
  expectedTicketMinutes,
  LOAD_BAND_MINUTES,
  type LoadTicket,
  loadForMinutes,
  type NamedWeek,
  partitionFactor,
  requiredSteps,
} from './load';
import { findWorldTicket, WORLD_TICKETS } from './tickets';
import { WORK_SEGMENT_MINUTES } from './timesheet';
import type { DayScript } from './week';

const lookup = (id: string): LoadTicket | undefined => findWorldTicket(id);

/**
 * THE COMMITTED TABLE: what the four shipped weeks actually ask for.
 *
 * The measurement the spike asked slice 1 to produce, pinned here so that a
 * content change which makes a day heavier is a diff somebody reads rather than
 * a number that drifts. Every row is `[committed minutes, the band it falls
 * in]` and every band is the `load` its day is now authored with - the roster
 * gate refuses the pair coming apart, and this table is what the pair IS.
 *
 * The headline of the measurement, and it is the reason the arithmetic was
 * worth doing: TWELVE of the twenty shipped days disagreed with their own
 * column. The probation week was nearly right (one day out, and out by being
 * heavier than it claimed); the other three shops were authored as ramps and
 * are, in minutes, flat and light. The corrections are in the week tables with
 * a sentence each.
 */
const COMMITTED: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  // The one week that was written against a full shift. Tuesday is the day the
  // column was wrong about, and wrong the interesting way: two people ask for a
  // favour, either answer is work, so the day is heavier than four rows look.
  workgrumble: [[275, 1], [416, 3], [503, 3], [543, 4], [379, 2]],
  // Five tickets in a week. The authored ramp (1/2/3/2/1) was a shape rather
  // than a measurement: Bodgeworth is one long light week with a joke in it.
  bodgeworth: [[120, 1], [70, 1], [60, 1], [60, 1], [30, 1]],
  // Four tickets a day and nothing that takes the screen: the busiest-LOOKING
  // week in the game is a little over half a shift. The creative vertical
  // (0.32.0) put a fifth arrival on Wednesday and Thursday, which is what a
  // customer being added to a week looks like in minutes: 330 apiece, over
  // band one, and the ramp the week always claimed to have.
  msp: [[270, 1], [270, 1], [330, 2], [330, 2], [270, 1]],
  // The exec week is about what you are asked to do, not how much of it there
  // is. Thursday's recertification is six dispatches - the longest ticket in
  // the game - and it is still only the second band. Friday moved from 70 to
  // 135 when the shadow VIP was added to it (E9, 0.37.0): a second arrival on a
  // day that had one takes the partition factor from x1 to x1.5, which is the
  // count term doing its job on the lightest day in the shop. Still band one,
  // and still the day the week ends quietly on.
  corporate: [[60, 1], [60, 1], [290, 1], [330, 2], [135, 1]],
};

/** A ticket fixture with a given number of required dispatches. */
function ticketOf(id: string, steps: number): LoadTicket {
  return {
    def: { id },
    paths: [{ steps: Array.from({ length: steps }, () => ({})) }],
  };
}

/** A day fixture: the columns the arithmetic reads, and nothing else. */
function script(day: number, patch: Partial<DayScript> = {}): DayScript {
  return {
    day,
    label: `Day ${String(day)}`,
    inherited: [],
    drip: [],
    patrolSeed: 0,
    load: 1,
    ...patch,
  };
}

describe('what a day is asking for', () => {
  it('prices a ticket at the tail it owns plus its further dispatches', () => {
    // One dispatch is the half hour the timesheet already gives a stretch of
    // work; each further one is the ten clear minutes the feasibility auditor
    // already calls the least a ticket needs. Nothing here is a new number.
    expect(expectedTicketMinutes(ticketOf('t', 1))).toBe(WORK_SEGMENT_MINUTES);
    expect(expectedTicketMinutes(ticketOf('t', 3)))
      .toBe(WORK_SEGMENT_MINUTES + 2 * CAUGHT_MINUTES);

    // The CHEAPEST advertised path, because that is the one somebody who knows
    // the job takes.
    expect(requiredSteps({
      def: { id: 't' },
      paths: [
        { steps: [{}, {}, {}, {}] },
        { steps: [{}, {}] },
      ],
    })).toBe(2);

    // And a step the close does not depend on is not charged for: the
    // solvability gate proves the ticket closes without it, so a budget that
    // charged for it would be charging for the check rather than the work.
    expect(requiredSteps({
      def: { id: 't' },
      paths: [{ steps: [{}, { optional_for_closure: true }] }],
    })).toBe(1);

    // A ticket with no advertised path still has to be read and answered.
    expect(expectedTicketMinutes({ def: { id: 't' }, paths: [] }))
      .toBe(WORK_SEGMENT_MINUTES);
  });

  it('counts what the day can be MADE to deal, not only what it deals', () => {
    const day = script(2, {
      inherited: ['a'],
      drip: [{ ticketId: 'b', minute: 600 }],
      dms: [{
        speaker: 'person:terry',
        minute: 630,
        raises: 'c',
        filesAfter: 30,
        doneWhen: { node: 'account:terry', field: 'password_reset_at' },
      }],
    });

    // The favour is the point: either the player does it, which costs the
    // conversation, or they send the person to the form, which costs a ticket.
    // The heavier branch is what the day is priced at, the same way the
    // feasibility auditor puts every takeover at the latest minute it can land.
    expect(dealtOrRaised(day)).toEqual(['a', 'b', 'c']);
  });

  it('charges more for the same minutes cut into more pieces', () => {
    const one = script(1, { inherited: ['big'] });
    const many = script(1, {
      inherited: ['small', 'small2'],
      drip: [
        { ticketId: 'small3', minute: 600 },
        { ticketId: 'small4', minute: 660 },
      ],
    });
    const pool = (id: string): LoadTicket | undefined => (
      id === 'big' ? ticketOf('big', 10) : ticketOf(id, 1)
    );

    // 120 minutes of work either way - one ten-dispatch ticket, or four
    // one-dispatch ones - and they are not the same day. Five tickets is five
    // triages, five response clocks and five times finding your place again.
    expect(dayLoad(one, pool).ticketMinutes)
      .toBe(dayLoad(many, pool).ticketMinutes);
    expect(dayLoad(many, pool).committedMinutes)
      .toBeGreaterThan(dayLoad(one, pool).committedMinutes);
    expect(partitionFactor(1)).toBe(1);
    expect(partitionFactor(2)).toBe(1.5);
    expect(partitionFactor(6)).toBe(2);
    expect(partitionFactor(7)).toBe(2.5);
    expect(partitionFactor(15)).toBe(4);
  });

  it('puts a total in a band, and refuses to name one for a day nobody could work', () => {
    const [one, two, three, four] = LOAD_BAND_MINUTES as [
      number,
      number,
      number,
      number,
    ];

    expect(LOAD_BAND_MINUTES).toEqual([312, 408, 504, 624]);
    expect(loadForMinutes(0)).toBe(1);
    expect(loadForMinutes(one)).toBe(1);
    expect(loadForMinutes(one + 1)).toBe(2);
    expect(loadForMinutes(two)).toBe(2);
    expect(loadForMinutes(three)).toBe(3);
    expect(loadForMinutes(three + 1)).toBe(4);
    expect(loadForMinutes(four)).toBe(4);
    // Past the ceiling there is no honest number, which is what the ceiling is
    // for: it is the refusal a generated week gets.
    expect(loadForMinutes(four + 1)).toBeNull();
    expect(four).toBeGreaterThan(SHIFT_MINUTES);
  });
});

describe('the shipped weeks, measured', () => {
  it.each(EMPLOYER_IDS)('prices %s to its committed table', (id) => {
    const expected = COMMITTED[id];

    if (expected === undefined) {
      throw new Error(`No committed load table for "${id}".`);
    }

    const week = employerFor(id).week;

    expect(week.map((day) => {
      const priced = dayLoad(day, lookup);
      return [priced.committedMinutes, priced.load] as const;
    })).toEqual(expected);

    // And the column each day is authored with is the band it measures at -
    // which is the thing the roster gate refuses at boot, asserted here as a
    // number rather than as the absence of a throw.
    expect(week.map((day) => day.load))
      .toEqual(expected.map(([, load]) => load));
  });

  it('leaves no shipped day past the ceiling', () => {
    for (const id of EMPLOYER_IDS) {
      for (const day of employerFor(id).week) {
        expect(loadForMinutes(dayLoad(day, lookup).committedMinutes), `${id} ${day.label}`)
          .not.toBeNull();
      }
    }
  });
});

describe('the roster gate refuses a column that has come loose', () => {
  const roster = WORLD_TICKETS;
  const weekOf = (...days: readonly DayScript[]): readonly NamedWeek[] => [
    { at: 'a test shop', week: days },
  ];
  const monday = (load: number): DayScript => script(1, {
    inherited: ['ticket:rotated-screen', 'ticket:locked-account'],
    load,
  });

  it('accepts a day whose number is the number it measures', () => {
    // Two one-dispatch tickets: 60 minutes times 1.5, plus the lead's rounds.
    expect(dayLoad(monday(1), lookup).committedMinutes).toBe(120);
    expect(() => assertWeekLoads(roster, weekOf(monday(1)))).not.toThrow();
  });

  it('refuses a day authored heavier than it is', () => {
    expect(() => assertWeekLoads(roster, weekOf(monday(3))))
      .toThrow(/authored load 3 and commits 120 minutes/);
  });

  it('refuses a ramp that goes backwards before Thursday', () => {
    const heavy = script(2, {
      // Six tickets, three of them three-dispatch: comfortably band 4.
      inherited: ['ticket:vpn-cert-dup-ada', 'ticket:vpn-cert-dup-gary'],
      drip: [
        { ticketId: 'ticket:share-dup-terry', minute: 600 },
        { ticketId: 'ticket:disk-full', minute: 610 },
        { ticketId: 'ticket:flat-mouse', minute: 620 },
        { ticketId: 'ticket:fan-noise', minute: 630 },
      ],
      load: 4,
    });
    const light = script(3, { inherited: ['ticket:rotated-screen'], load: 1 });

    expect(dayLoad(heavy, lookup).load).toBe(4);
    expect(() => assertWeekLoads(roster, weekOf(monday(1), heavy, light)))
      .toThrow(/is load 1 where the day before it is 4/);
    // And the same two days the right way round are fine, because the rule is
    // about the ramp rather than about either day.
    expect(() => assertWeekLoads(
      roster,
      weekOf(script(1, { inherited: ['ticket:rotated-screen'], load: 1 }), {
        ...heavy,
        day: 2,
      }),
    )).not.toThrow();
  });

  it('refuses a day nobody could have been given', () => {
    const impossible = script(1, {
      inherited: ['ticket:halcyon-recert', 'ticket:vpn-cert-dup-ada'],
      drip: Array.from({ length: 10 }, (_unused, index) => ({
        ticketId: [
          'ticket:vpn-cert-dup-gary',
          'ticket:share-dup-terry',
          'ticket:halcyon-mandate',
          'ticket:halcyon-ceo-tablet',
          'ticket:licence-exhausted',
          'ticket:wedged-spooler',
          'ticket:vacuum-thursday',
          'ticket:stale-device-relock',
          'ticket:phishing-report',
          'ticket:halcyon-override',
        ][index] ?? 'ticket:fan-noise',
        minute: 600 + index,
      })),
      load: 4,
    });

    expect(dayLoad(impossible, lookup).committedMinutes)
      .toBeGreaterThan(LOAD_BAND_MINUTES[3] ?? 0);
    expect(() => assertWeekLoads(roster, weekOf(impossible)))
      .toThrow(/no load says a day that heavy/);
  });

  it('refuses a day that deals a ticket nobody wrote', () => {
    expect(() => assertWeekLoads(
      roster,
      weekOf(script(1, { inherited: ['ticket:never-written'] })),
    )).toThrow(/does not hold it/);
  });
});
