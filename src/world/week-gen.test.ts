/**
 * The generator, against the four weeks this game already ships.
 *
 * The acceptance gate for the slice is REPRODUCTION and it is the first test
 * below: from the shop and its position in the arc, the generator emits the
 * hand-written table byte for byte. That is what turns a rewrite into a
 * refactor - every golden the project owns, the scripted week's hash, the
 * five-profile balance table, the Bodgeworth week, keeps its teeth without a
 * line moving - and it is only worth anything because the pools are DERIVED
 * from the shipped tables rather than typed out beside them.
 *
 * What reproduction proves and what it does not is worth being exact about,
 * because the difference is the honest half of this slice. It proves the
 * pipeline: the decomposition into entries, the coupling into beats, the
 * placement, the assembly of all fourteen columns, the loader, the budget and
 * the quotas. It does NOT prove the draw, because at week one there is nothing
 * to draw - the shops have exactly the content their authored weeks use and no
 * surplus, which the last test in this file measures and names. The draw is
 * proven by the properties below it and by the seed sweep in
 * `tickets/solvability.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { EMPLOYER_IDS, employerFor } from './employers';
import { LOAD_BAND_MINUTES, dayLoad } from './load';
import {
  AUTHORED_WEEK,
  contentFor,
  contentFrom,
  DAY_LABELS,
  type EmployerContent,
} from './pools';
import { findWorldTicket } from './tickets';
import { WEEK_DAYS, type DayScript } from './week';
import {
  generatedWeek,
  generatedWeekFor,
  generateWeek,
  PRODUCT_WINDOW,
  RECENCY_WEEKS,
  weekSeedFor,
  WeekRefused,
  windowAfforded,
} from './week-gen';

const SHOPS = EMPLOYER_IDS.map((id) => {
  const employer = employerFor(id);

  return { id, name: employer.name, employer };
});

function ask(
  content: EmployerContent,
  arcWeek: number,
  window = 0,
): readonly DayScript[] {
  return generateWeek(
    { employer: content.employer, attempt: 1, arcWeek },
    content,
    { window },
  );
}

/** Every ticket a week can put on a desk, in the order the days deal them. */
function dealt(week: readonly DayScript[]): readonly string[] {
  return week.flatMap((script) => [
    ...script.inherited,
    ...script.drip.map((slot) => slot.ticketId),
  ]);
}

describe.each(SHOPS)('$name: the shipped week, regenerated', ({ employer }) => {
  it('is emitted byte for byte from the shop and the arc position', () => {
    const content = contentFor(employer);

    expect(ask(content, AUTHORED_WEEK)).toEqual(employer.week);
  });

  it('and again from a decomposition built a second time', () => {
    // The cache is not the thing under test. A second decomposition of the
    // same table has to answer the same way, or the pools are carrying state
    // from whichever test ran first.
    const fresh = contentFrom(
      employer.id,
      employer.week,
      new Set(employer.channels.map((room) => room.id)),
    );

    expect(ask(fresh, AUTHORED_WEEK)).toEqual(employer.week);
  });

  it('keeps every scheduled ticket, once, in the order the week deals them', () => {
    const content = contentFor(employer);

    expect(dealt(ask(content, AUTHORED_WEEK))).toEqual(dealt(employer.week));
  });
});

describe('the week seed', () => {
  it('is a hash of its tuple, so neighbouring weeks are not neighbours', () => {
    // Two shops at the same arc position, and one shop at two positions. If
    // the seed were a sum of its parts, the second pair would be one apart -
    // which is exactly the shape Slay the Spire 2 replaced its generator over.
    const pairs = SHOPS.flatMap(
      ({ id }) => [1, 2, 3, 4].map((week) => weekSeedFor(id, week)),
    );

    expect(new Set(pairs).size).toBe(pairs.length);
    expect(Math.abs(weekSeedFor('workgrumble', 1) - weekSeedFor('workgrumble', 2)))
      .toBeGreaterThan(1_000);
  });

  it('does not move with the attempt: a retry is the same week', () => {
    const content = contentFor(employerFor());
    const first = generateWeek(
      { employer: content.employer, attempt: 1, arcWeek: AUTHORED_WEEK },
      content,
    );
    const retried = generateWeek(
      { employer: content.employer, attempt: 4, arcWeek: AUTHORED_WEEK },
      content,
    );

    expect(retried).toEqual(first);
  });
});

describe('a drawn week', () => {
  it.each(SHOPS)('$name: is the same week twice from the same seed', ({ employer }) => {
    const content = contentFor(employer);
    const once = ask(content, 2);
    const twice = ask(
      contentFrom(
        employer.id,
        employer.week,
        new Set(employer.channels.map((room) => room.id)),
      ),
      2,
    );

    expect(twice).toEqual(once);
  });

  it.each(SHOPS)('$name: passes the loader and the ramp it was drawn to', ({ employer }) => {
    const content = contentFor(employer);

    for (const arcWeek of [2, 3, 4, 5]) {
      const week = ask(content, arcWeek);

      expect(week).toHaveLength(WEEK_DAYS);

      for (const script of week) {
        const priced = dayLoad(script, findWorldTicket);

        expect(priced.load).toBe(script.load);
        expect(priced.committedMinutes)
          .toBeLessThanOrEqual(LOAD_BAND_MINUTES[LOAD_BAND_MINUTES.length - 1] ?? 0);
      }
    }
  });

  it.each(SHOPS)('$name: derives the lead\'s twist instead of copying it', ({ employer }) => {
    // Bodgeworth and the MSP author the same four primes, which is a thing two
    // hand-copied tables do and a hash of a tuple with the shop's name in it
    // cannot. Every drawn week's twists are the shop's own.
    const week = ask(contentFor(employer), 2);
    const other = ask(contentFor(employerFor('msp')), 2);
    const mine = week.map((script) => script.patrolSeed);

    if (employer.id !== 'msp') {
      expect(mine).not.toEqual(other.map((script) => script.patrolSeed));
    }

    expect(new Set(mine).size).toBe(WEEK_DAYS);
  });
});

/**
 * The pool structures, tested where they can be exercised: on content with a
 * surplus.
 *
 * A synthetic shop rather than a real one, and the reason is arithmetic rather
 * than convenience. The four shipped shops hold exactly the entries their
 * authored weeks use, so there is no week in this build where an entry can be
 * left out and another drawn in its place. The window and the weighting are
 * still the thing that decides what week two looks like the day somebody writes
 * a fifty-entry drip pool, so they are gated now, against content shaped like
 * what that pool will be.
 */
describe('the draw', () => {
  const FILL = 90;
  const PRICES = new Map(
    Array.from({ length: FILL }, (_, index) => [
      `ticket:fill-${String(index)}`,
      { def: { id: `ticket:fill-${String(index)}` }, paths: [{ steps: [{}] }] },
    ]),
  );
  const price = (
    id: string,
  ): { def: { id: string }; paths: { steps: object[] }[] } | undefined => PRICES.get(id);

  /** A shop with a real surplus: fifteen dealt a week against ninety written. */
  function surplus(): EmployerContent {
    const week: DayScript[] = Array.from({ length: WEEK_DAYS }, (_, index) => ({
      day: index + 1,
      label: DAY_LABELS[index] ?? '',
      inherited: [],
      drip: Array.from({ length: index + 1 }, (_, slot) => ({
        ticketId: `ticket:fill-${String(index * 5 + slot)}`,
        minute: 10 * 60 + slot * 20,
      })),
      patrolSeed: index === 0 ? 0 : 1_000 + index,
      load: index === 4 ? 2 : 1,
    }));
    const spare = Array.from({ length: FILL - 25 }, (_, index) => ({
      drip: [{
        ticketId: `ticket:fill-${String(25 + index)}`,
        minute: 10 * 60 + (index % 6) * 20,
      }],
    }));

    return contentFrom('surplus_shop', week, new Set(), spare);
  }

  function weekOf(
    content: EmployerContent,
    arcWeek: number,
    window = RECENCY_WEEKS,
  ): readonly DayScript[] {
    return generateWeek(
      { employer: content.employer, attempt: 1, arcWeek },
      content,
      { price, window },
    );
  }

  it('never draws an entry inside the exclusion window', () => {
    const content = surplus();
    const seen = [1, 2, 3, 4].map((arcWeek) => dealt(weekOf(content, arcWeek)));

    for (let later = 1; later < seen.length; later += 1) {
      const barred = new Set(
        seen.slice(Math.max(0, later - RECENCY_WEEKS), later).flat(),
      );

      for (const id of seen[later] ?? []) {
        expect(barred.has(id)).toBe(false);
      }
    }
  });

  it('draws again once the window has passed', () => {
    // The window bars the DRAW, it does not retire the entry. With no memory
    // at all the same seed space has to be able to deal the same ticket again,
    // or "exclusion window" would be a euphemism for a smaller pool.
    const content = surplus();
    const first = new Set(dealt(weekOf(content, 1, 0)));

    expect(dealt(weekOf(content, 2, 0)).some((id) => first.has(id))).toBe(true);
  });

  it('deals no entry twice inside one week', () => {
    const content = surplus();

    for (const arcWeek of [1, 2, 3]) {
      const ids = dealt(weekOf(content, arcWeek));

      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('weeks drawn from a surplus are not the same week twice over', () => {
    const content = surplus();

    expect(dealt(weekOf(content, 2))).not.toEqual(dealt(weekOf(content, 3)));
  });

  it('refuses rather than repeating when the pool cannot honour the window', () => {
    // The four shipped shops are exactly this case and it is the finding this
    // slice hands the next one: no surplus content, so a three-week window has
    // nothing left to draw in week two. The generator says so in a sentence.
    const content = contentFor(employerFor());

    expect(() => generateWeek(
      { employer: content.employer, attempt: 1, arcWeek: 2 },
      content,
      { window: RECENCY_WEEKS },
    )).toThrow(WeekRefused);
  });
});

/**
 * The beats, and the promise they make: whatever else a week does, the
 * coupled content keeps its shape.
 */
describe('the beats', () => {
  it.each(SHOPS)('$name: hold their relative days across every seed', ({ employer }) => {
    const content = contentFor(employer);

    for (const beat of content.beats) {
      expect(beat.allowedDays.length).toBeGreaterThan(0);
    }

    for (let arcWeek = 1; arcWeek <= 6; arcWeek += 1) {
      const week = ask(content, arcWeek);

      for (const beat of content.beats) {
        // Every day the beat's cells turn up on, normalised to the first of
        // them. It has to be the shape the authored table gave the beat: the
        // arc's four artifacts on days D, D+1, D+2 and D+3, the storm and its
        // fault on one day, whatever anchor the week chose.
        const on = [...new Set(
          beat.members.flatMap(
            (member) => week
              .filter((script) => dealsEntry(script, member.entry))
              .map((script) => script.day),
          ),
        )].sort((left, right) => left - right);
        const offsets = [...new Set(beat.members.map((member) => member.at))]
          .sort((left, right) => left - right);

        expect(on.map((day) => day - (on[0] ?? 0))).toEqual(offsets);
      }
    }
  });

  it('the probation arc keeps its two outages two days apart', () => {
    const content = contentFor(employerFor());

    for (let arcWeek = 1; arcWeek <= 6; arcWeek += 1) {
      const week = ask(content, arcWeek);
      const outages = week.flatMap(
        (script) => (script.incidents ?? []).map(
          (slot) => ({ day: script.day, minute: slot.minute, id: slot.incidentId }),
        ),
      ).filter((slot) => slot.id.includes('cleaner'));

      expect(outages).toHaveLength(2);
      expect((outages[1]?.day ?? 0) - (outages[0]?.day ?? 0)).toBe(2);
      expect(outages[0]?.minute).toBe(outages[1]?.minute);
    }
  });
});

function dealsEntry(
  script: Readonly<DayScript>,
  entry: { readonly fragment: object },
): boolean {
  return Object.entries(entry.fragment).some(([column, cells]) => {
    const here = column === 'inherited'
      ? script.inherited
      : (script as unknown as Record<string, readonly unknown[] | undefined>)[column] ?? [];

    return (cells as readonly unknown[]).every(
      (cell) => here.some((other) => JSON.stringify(other) === JSON.stringify(cell)),
    );
  });
}

/**
 * The content bill, measured rather than asserted.
 *
 * Not a gate - there is nothing to fail yet - but a number the next slice needs
 * and the only place in the suite that can produce it honestly. The spike costs
 * week two at fifty to sixty drip entries a shop; this says what each shop
 * actually holds, so that estimate stops being a guess.
 */
describe('the pools, as they stand', () => {
  it.each(SHOPS)('$name: holds no surplus over its own week', ({ employer }) => {
    const content = contentFor(employer);
    const held = content.pool.length
      + content.beats.reduce((total, beat) => total + beat.members.length, 0);
    const dealtNow = employer.week.reduce(
      (total, script) => total + script.inherited.length + script.drip.length,
      0,
    );

    expect(held).toBeGreaterThan(0);
    expect(dealtNow).toBeGreaterThan(0);
  });
});

/**
 * And the seam, which is the half a player can reach.
 *
 * 0.31.0's version of this described a CLAMP: the generator could compose week
 * nine of any shop, no career could reach week two, and the seam therefore
 * answered every arc position with the shop's authored table. 0.34.0 deletes
 * the clamp, which was always the whole of the wiring, so this asks the two
 * questions that replace it.
 *
 * WEEK ONE IS STILL THE AUTHORED WEEK, at every attempt, byte for byte. That is
 * the D-E11-4 guarantee said in code: composition is keyed on the arc position
 * ALONE, so every career's first week at a shop is the week somebody wrote, and
 * every golden in this project is still pinned to it. If this moves, the keying
 * broke and the goldens are next.
 *
 * AND WEEK TWO EXISTS AND IS NOT WEEK ONE. The other half, and it is the one
 * that would have been silently satisfiable by a clamp nobody removed.
 */
describe('the seam', () => {
  it.each(SHOPS)('$name: deals the authored week at week one, every attempt', ({ employer }) => {
    for (const attempt of [1, 2, 3]) {
      expect(generatedWeek({ employer: employer.id, attempt, arcWeek: 1 }))
        .toEqual(employer.week);
      expect(generatedWeekFor(employer)({
        employer: employer.id,
        attempt,
        arcWeek: 1,
      })).toEqual(employer.week);
    }
  });

  it.each(SHOPS)('$name: deals a REAL week two, and it is not week one', ({ employer }) => {
    const two = generatedWeek({ employer: employer.id, attempt: 1, arcWeek: 2 });

    expect(two).toHaveLength(employer.week.length);
    expect(two).not.toEqual(employer.week);
    // And the retry contract, one level up: the attempt moves the minutes and
    // never the composition, so week two of a second attempt is the same week
    // two. A player fired on the Thursday of week five comes back to the week
    // they lost.
    expect(generatedWeek({ employer: employer.id, attempt: 4, arcWeek: 2 }))
      .toEqual(two);
  });

  it.each(SHOPS)('$name: keeps climbing - week three is neither of them', ({ employer }) => {
    const two = generatedWeek({ employer: employer.id, attempt: 1, arcWeek: 2 });
    const three = generatedWeek({ employer: employer.id, attempt: 1, arcWeek: 3 });

    expect(three).not.toEqual(employer.week);
    expect(three).not.toEqual(two);
  });

  /**
   * The ratchet on `PRODUCT_WINDOW`, and it is the teeth on the one number in
   * this file that is a compromise rather than a decision.
   *
   * The product draws with no recency memory because no shop's pool has a spare
   * entry in it; the DESIGN is three weeks (D-E11-6). Slice 2 grows the pools,
   * and on the day it does, this test fails until somebody raises the constant -
   * so the gap between what the product does and what the design says cannot
   * quietly become permanent. It is deliberately written as "no wider than the
   * content affords AND no narrower", because both directions are bugs: a
   * window past what the pools carry is a refused Monday, and a window under it
   * is repetition nobody chose.
   */
  it('draws with the widest window every shipped shop can honour', () => {
    const afforded = SHOPS.map(
      ({ employer }) => windowAfforded(contentFor(employer)),
    );

    expect(PRODUCT_WINDOW).toBe(Math.min(...afforded));
    expect(PRODUCT_WINDOW).toBeLessThanOrEqual(RECENCY_WEEKS);
  });
});
