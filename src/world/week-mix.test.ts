import { describe, expect, it } from 'vitest';

import { EMPLOYER_IDS, employerFor } from './employers';
import { contentFor, type EmployerContent } from './pools';
import { BUILT_RUNGS, TITLE_TABLE, WORK_KINDS, type Rung } from './titles';
import type { DayScript } from './week';
import {
  generateWeek,
  mixAfforded,
  mixBoundsFor,
  PRODUCT_WINDOW,
} from './week-gen';
import { mixOfWeek } from './work-kinds';

/**
 * D2 MADE REAL: the rung the player is on decides what KIND of work the week
 * deals them (E9, 0.35.0 slice 3).
 *
 * The claim under test is not "the generator accepts a rung". It is that an
 * engineer's week at the MSP is a DIFFERENT WEEK from a junior's - fewer
 * password jobs, fewer desk jobs, the servers left where the shop put them -
 * and that the password jobs do not go away, because the decision was a blend
 * and not a wall. Both halves are asserted against weeks the product can
 * actually deal, at the window the product actually draws under.
 */

const WEEKS = Array.from({ length: 20 }, (_, index) => index + 2);

function weeksFor(
  content: EmployerContent,
  employer: string,
  rung: Rung,
): readonly (readonly DayScript[])[] {
  return WEEKS.map((arcWeek) => generateWeek(
    { employer, attempt: 1, arcWeek, rung },
    content,
    { window: PRODUCT_WINDOW },
  ));
}

function totalMix(weeks: readonly (readonly DayScript[])[]): Record<string, number> {
  const totals: Record<string, number> = {
    access: 0, device: 0, server: 0, project: 0,
  };

  for (const week of weeks) {
    const mix = mixOfWeek(week);

    for (const kind of WORK_KINDS) {
      totals[kind] = (totals[kind] ?? 0) + mix[kind];
    }
  }

  return totals;
}

describe('the engineer\'s week is not the junior\'s week', () => {
  const content = contentFor(employerFor('msp'));
  const junior = weeksFor(content, 'msp', 'sd_junior');
  const engineer = weeksFor(content, 'msp', 'systems_engineer');

  /**
   * THE TEETH, and they are teeth by revert: set the engineer row's access and
   * device factors back to one - which is what "the table does nothing" looks
   * like - and these two assertions are the ones that go red, because the two
   * rungs then draw the same weeks from the same seeds.
   */
  it('deals a promoted player less of the work below them', () => {
    const below = totalMix(junior);
    const above = totalMix(engineer);

    expect(above.access).toBeLessThan(below.access ?? 0);
    expect(above.device).toBeLessThan(below.device ?? 0);
  });

  it('and does not thin the servers, which are the rung\'s own work', () => {
    // The other side of the same claim: this is a SHAPE change, not a smaller
    // week. Server work is at factor one for the engineer, so it holds up while
    // the desk classes come down.
    expect(totalMix(engineer).server ?? 0)
      .toBeGreaterThan(totalMix(junior).server ?? 0);
  });

  it('still resets the odd password, every single week', () => {
    // D2 in one assertion: lessened, never gone. A ceiling met by dealing none
    // would be the decision reversed by arithmetic.
    for (const [index, week] of engineer.entries()) {
      expect(mixOfWeek(week).access, `week ${String(index + 2)}`)
        .toBeGreaterThanOrEqual(1);
    }
  });

  it('holds every drawn week inside the blend the row asks for', () => {
    const bounds = mixBoundsFor(content, 'systems_engineer');

    expect(bounds).not.toBeNull();

    for (const [index, week] of engineer.entries()) {
      const mix = mixOfWeek(week);
      const arrivals = WORK_KINDS.reduce((sum, kind) => sum + mix[kind], 0);

      for (const kind of WORK_KINDS) {
        const bound = bounds?.[kind];

        if (bound === undefined) {
          continue;
        }

        expect(mix[kind], `week ${String(index + 2)} ${kind}`)
          .toBeGreaterThanOrEqual(bound.least);
        expect(mix[kind], `week ${String(index + 2)} ${kind}`)
          .toBeLessThanOrEqual(Math.ceil(bound.share * arrivals));
      }
    }
  });

  it('deals a week that is still a week: the same days, the same ramp', () => {
    for (const week of engineer) {
      expect(week).toHaveLength(5);

      for (let day = 1; day < 4; day += 1) {
        expect(week[day]?.load ?? 0)
          .toBeGreaterThanOrEqual(week[day - 1]?.load ?? 0);
      }
    }
  });
});

/**
 * The junior's weeks did not move, which is the other half of the slice.
 *
 * Its row is all ones (bar project work no week deals), so a request naming it
 * and a request naming nothing at all have to be the same week down to the
 * cell. If they are not, the table has started deciding something for the rung
 * whose whole point is that it decides nothing.
 */
describe('the junior draws exactly what it always drew', () => {
  it.each(EMPLOYER_IDS)('%s week two is the same with the rung and without', (id) => {
    const content = contentFor(employerFor(id));

    for (const arcWeek of [2, 3, 4]) {
      const named = generateWeek(
        { employer: id, attempt: 1, arcWeek, rung: 'sd_junior' },
        content,
        { window: PRODUCT_WINDOW },
      );
      const silent = generateWeek(
        { employer: id, attempt: 1, arcWeek },
        content,
        { window: PRODUCT_WINDOW },
      );

      expect(named).toEqual(silent);
    }
  });
});

/**
 * AND IT NEVER TAKES A WEEK AWAY. The blend yields to the week (`composeWeek`),
 * so no shop and no rung can leave a player with no Monday - which is what a
 * hard quota over content authored before the quota existed would eventually
 * have done, at a shop somebody reached six weeks into a career.
 */
describe('no rung is ever left without a week', () => {
  it('draws for every built rung at every shop this build ships', () => {
    for (const id of EMPLOYER_IDS) {
      const content = contentFor(employerFor(id));

      for (const rung of BUILT_RUNGS) {
        for (const arcWeek of [2, 3, 4]) {
          const week = generateWeek(
            { employer: id, attempt: 1, arcWeek, rung },
            content,
            { window: PRODUCT_WINDOW },
          );

          expect(week, `${id}/${rung}/${String(arcWeek)}`).toHaveLength(5);
        }
      }
    }
  }, 300_000);
});

/**
 * WHICH SHOPS CAN CARRY WHICH BLEND, measured and written down - the mix's
 * version of `PRODUCT_WINDOW`'s ratchet.
 *
 * The pairs a player reaches by playing the shipped arc are held to the blend
 * exactly. The rest are RECORDED at what the content affords today, so that a
 * shop's pool getting better is visible and a shop's pool getting worse is a
 * failure rather than a quiet fallback nobody notices.
 */
describe('the blend a shop\'s content can carry', () => {
  const AFFORDED: readonly (readonly [string, Rung, number])[] = [
    // The pair the start select ships: it carries the blend every week, and
    // this is the assertion that says so.
    ['msp', 'systems_engineer', 20],
    // The corporate desk is nearly all identity work by design (the exec weak
    // spot), so an engineer's thinner password share is only sometimes
    // expressible in it.
    ['corporate', 'systems_engineer', 10],
    // Bodgeworth deals five arrivals a week; a blend measured in whole tickets
    // is coarse at that size.
    ['bodgeworth', 'systems_engineer', 10],
    // And the probation shop's surplus is desk work almost all the way down -
    // no arrangement of it is an engineer's week, so an engineer promoted
    // before leaving plays the shop as it comes. Recorded rather than hidden.
    ['workgrumble', 'systems_engineer', 0],
  ];

  it.each(AFFORDED)('%s carries %s in at least %i weeks of twenty', (
    employer,
    rung,
    least,
  ) => {
    expect(mixAfforded(contentFor(employerFor(employer)), rung, 20))
      .toBeGreaterThanOrEqual(least);
  }, 300_000);

  it('takes the junior everywhere, because the junior is the shop', () => {
    for (const id of EMPLOYER_IDS) {
      expect(mixAfforded(contentFor(employerFor(id)), 'sd_junior', 10), id)
        .toBe(10);
    }
  }, 300_000);
});

/**
 * And the bounds themselves, read off the table rather than off a number typed
 * here: a shop that deals no work of a kind cannot owe a rung any of it, and a
 * rung that blends nothing is not held to anything.
 */
describe('the bounds a row makes', () => {
  it('asks for none of what the shop does not deal', () => {
    const bounds = mixBoundsFor(contentFor(employerFor('msp')), 'systems_engineer');

    // No shop's week deals project work (the phase machine raises it), so the
    // floor for it is nought however the row blends it.
    expect(bounds?.project.least).toBe(0);
    expect(bounds?.access.least).toBe(1);
  });

  it('holds a rung of all ones to nothing at all', () => {
    // Not "wide bounds" - none, so the fill is the fill it always was. The
    // junior row's project nought is the one thing that binds it, and it binds
    // a kind no week deals.
    expect(TITLE_TABLE.sd_junior.workMix.access).toBe(1);
    expect(mixBoundsFor(contentFor(employerFor('msp')), 'sd_junior')?.access.share)
      .toBe(1);
  });
});
