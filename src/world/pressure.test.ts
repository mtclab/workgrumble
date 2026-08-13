/**
 * The catalogue, the arc and the four-beat contract, checked the way content
 * is checked in this codebase: at the boundaries the loader refuses.
 *
 * Everything refused here is a bug that would look like a quiet season rather
 * than a broken one. An entry with no notice signal is a round that arrives
 * without an announcement. A season in week two is a redundancy round shown to
 * somebody who has never had a normal week. Two seasons overlapping is real
 * life and is unplayable. None of those throw where they happen - they produce
 * a career that feels arbitrary six weeks later, which is the kind of bug that
 * ships.
 */

import { describe, expect, it } from 'vitest';

import {
  arcDate,
  ARC_WEEKS,
  beatAt,
  beatsFiredBy,
  cutsBothWays,
  DAYS_PER_CALENDAR_WEEK,
  EMPLOYER_ARC,
  type EmployerArc,
  findPressure,
  isQuietWeek,
  NOTICE_DAYS_MINIMUM,
  noticeDate,
  noticeDays,
  PRESSURE_BEATS,
  PRESSURE_CATALOGUE,
  PRESSURE_IDS,
  PROBATION_WEEK,
  QUIET_WEEKS_AFTER,
  QUIET_WEEKS_BEFORE,
  REDUNDANCY_ROUND,
  seasonAt,
  seasonlessArc,
  telegraph,
  validateArc,
  validateCatalogue,
  whyNotTelegraphed,
} from './pressure';
import { WEEK_DAYS } from './week';

const ALWAYS = (): boolean => true;

function arc(over: Partial<EmployerArc> = {}): EmployerArc {
  return { employer: 'Test Ltd', weeks: 12, seasons: [], ...over };
}

function season(over: Partial<typeof REDUNDANCY_ROUND> = {}): typeof
  REDUNDANCY_ROUND {
  return { ...REDUNDANCY_ROUND, ...over };
}

describe('the pressure catalogue', () => {
  it('is the nine the research names, each described from the chair', () => {
    expect(PRESSURE_CATALOGUE).toHaveLength(PRESSURE_IDS.length);
    expect(PRESSURE_CATALOGUE.map((entry) => entry.id))
      .toEqual([...PRESSURE_IDS]);

    for (const entry of PRESSURE_CATALOGUE) {
      expect(entry.chairView.length, entry.id).toBeGreaterThan(20);
      expect(entry.changes.length, entry.id).toBeGreaterThan(20);
    }
  });

  it('gives every entry all four beats before anybody schedules it', () => {
    for (const entry of PRESSURE_CATALOGUE) {
      for (const beat of PRESSURE_BEATS) {
        expect(entry.signals[beat].length, `${entry.id}/${beat}`)
          .toBeGreaterThan(20);
      }
    }
  });

  /**
   * Six of nine, and it is a design constraint rather than a count.
   *
   * A catalogue of threats only is a misery simulator, and a career that never
   * contains one piece of weather the player ends up better for is a game
   * about being rained on. This is the assertion that goes red the day
   * somebody adds a tenth entry that is only ever bad news.
   */
  it('lets six of the nine cut both ways', () => {
    expect(cutsBothWays()).toHaveLength(6);
    expect(cutsBothWays().length * 2).toBeGreaterThanOrEqual(
      PRESSURE_CATALOGUE.length,
    );
  });

  it('ships one of them and says so about the other eight', () => {
    const built = PRESSURE_CATALOGUE.filter((entry) => entry.implemented);

    expect(built.map((entry) => entry.id)).toEqual(['redundancy_round']);
    expect(findPressure('redundancy_round')?.effect).toBe('positional_bar');
    expect(findPressure('nothing_at_all')).toBeUndefined();
  });

  it('refuses an entry with a beat missing', () => {
    expect(() => validateCatalogue(PRESSURE_CATALOGUE.map((entry) => (
      entry.id === 'merger'
        ? { ...entry, signals: { ...entry.signals, notice: '' } }
        : entry
    )))).toThrow('no notice signal');
  });

  it('refuses a catalogue with one of the nine left out', () => {
    expect(() => validateCatalogue(
      PRESSURE_CATALOGUE.filter((entry) => entry.id !== 'merger'),
    )).toThrow('missing "merger"');
  });
});

describe('the arc this employer ships', () => {
  it('takes the arc it ships, and says whose it is', () => {
    expect(() => validateArc(EMPLOYER_ARC)).not.toThrow();
    expect(EMPLOYER_ARC.seasons).toHaveLength(1);
    // The one seam a season's ownership hangs on (#59a): the arc names the
    // shop, and `employers.ts` refuses at load to hand it to another one.
    expect(EMPLOYER_ARC.employer).toBe('workgrumble');
    expect(EMPLOYER_ARC.weeks).toBe(ARC_WEEKS);
  });

  /**
   * The shape of a shop that has not written any weather yet.
   *
   * Not a switched-off arc - the same twelve weeks, climbing, drawing and
   * reviewing exactly as the probation shop's do. What it does not have is a
   * season, which is what the other three employers have truthfully had all
   * along everywhere except in the one field they shared.
   */
  it('gives a shop with no season the same twelve quiet weeks', () => {
    const bare = seasonlessArc('bodgeworth');

    expect(bare.employer).toBe('bodgeworth');
    expect(bare.weeks).toBe(EMPLOYER_ARC.weeks);
    expect(bare.seasons).toHaveLength(0);

    for (let week = 1; week <= bare.weeks; week += 1) {
      expect(seasonAt(week, bare), `week ${String(week)}`).toBeNull();
      expect(isQuietWeek(week, bare), `week ${String(week)}`).toBe(true);
    }

    // And the week the round is loudest at the shop that owns it is a week
    // like any other here.
    expect(seasonAt(REDUNDANCY_ROUND.decision, bare)).toBeNull();
    expect(seasonAt(REDUNDANCY_ROUND.decision, EMPLOYER_ARC)).not.toBeNull();
  });

  it('leaves the probation week and the two after it alone', () => {
    expect(isQuietWeek(PROBATION_WEEK, EMPLOYER_ARC)).toBe(true);

    for (let week = 1; week <= PROBATION_WEEK + QUIET_WEEKS_BEFORE; week += 1) {
      expect(seasonAt(week, EMPLOYER_ARC), `week ${String(week)}`).toBeNull();
    }

    expect(seasonAt(REDUNDANCY_ROUND.weather, EMPLOYER_ARC)?.id)
      .toBe('redundancy_round');
  });

  it('leaves two clear weeks after the conversation', () => {
    for (
      let week = REDUNDANCY_ROUND.decision + 1;
      week <= EMPLOYER_ARC.weeks;
      week += 1
    ) {
      expect(isQuietWeek(week, EMPLOYER_ARC), `week ${String(week)}`).toBe(true);
    }

    expect(EMPLOYER_ARC.weeks - REDUNDANCY_ROUND.decision)
      .toBeGreaterThanOrEqual(QUIET_WEEKS_AFTER);
  });

  it('announces itself further out than the law would make it', () => {
    expect(noticeDays(REDUNDANCY_ROUND))
      .toBeGreaterThanOrEqual(NOTICE_DAYS_MINIMUM);
    // The announcement is a Monday and the conversation is a Friday, both
    // dated on the estate's own calendar, so the mail can quote them.
    expect(noticeDate(REDUNDANCY_ROUND)).toMatch(/^\d\d\/\d\d\/\d{4}$/);
    expect(arcDate(1, 1)).toBe('07/09/1998');
    expect(arcDate(2, 1)).toBe('14/09/1998');
    expect(arcDate(1, 1 + DAYS_PER_CALENDAR_WEEK)).toBe(arcDate(2, 1));
  });

  it('names the beat a week is, and only one of them', () => {
    expect(beatAt(REDUNDANCY_ROUND, 3)).toBeNull();
    expect(beatAt(REDUNDANCY_ROUND, REDUNDANCY_ROUND.weather)).toBe('weather');
    expect(beatAt(REDUNDANCY_ROUND, REDUNDANCY_ROUND.notice)).toBe('notice');
    expect(beatAt(REDUNDANCY_ROUND, REDUNDANCY_ROUND.criteriaFrom))
      .toBe('criteria');
    expect(beatAt(REDUNDANCY_ROUND, REDUNDANCY_ROUND.criteriaTo))
      .toBe('criteria');
    expect(beatAt(REDUNDANCY_ROUND, REDUNDANCY_ROUND.decision))
      .toBe('decision');
    expect(beatAt(REDUNDANCY_ROUND, EMPLOYER_ARC.weeks)).toBeNull();
  });
});

/**
 * The pacing rules, as the refusals they are.
 *
 * Every one of these is a rule stated in the research that cannot be checked
 * by playing, because what it forbids is a season that felt arbitrary a month
 * later. They are asserted here as boot failures with the reason in the text.
 */
describe('the pacing rules', () => {
  it('refuses anything at all in the probation week', () => {
    expect(() => validateArc(arc({
      seasons: [season({ weather: PROBATION_WEEK })],
    }))).toThrow('probation week carries none');
  });

  it('refuses a season that starts before the player has a baseline', () => {
    expect(() => validateArc(arc({
      seasons: [season({ weather: PROBATION_WEEK + QUIET_WEEKS_BEFORE })],
    }))).toThrow('quiet weeks after the probation week');
  });

  it('refuses beats out of order', () => {
    expect(() => validateArc(arc({
      seasons: [season({ notice: REDUNDANCY_ROUND.decision + 1 })],
    }))).toThrow('not after the beat before it');
  });

  it('refuses weather that is not two weeks out', () => {
    expect(() => validateArc(arc({
      seasons: [season({ weather: REDUNDANCY_ROUND.notice - 1 })],
    }))).toThrow('two or more weeks out');
  });

  it('refuses an announcement shorter than the law would make it', () => {
    expect(() => validateArc(arc({
      seasons: [season({
        notice: REDUNDANCY_ROUND.decision - 2,
        criteriaFrom: REDUNDANCY_ROUND.decision - 1,
        criteriaTo: REDUNDANCY_ROUND.decision - 1,
      })],
    }))).toThrow('less legible than employment law');
  });

  it('refuses a season with no quiet after it', () => {
    expect(() => validateArc(arc({
      weeks: REDUNDANCY_ROUND.decision,
      seasons: [season()],
    }))).toThrow('clear weeks');
  });

  it('refuses two seasons in one employer arc', () => {
    expect(() => validateArc(arc({
      weeks: 40,
      seasons: [season(), season()],
    }))).toThrow('One employer gets one season');
  });

  /**
   * And the overlap check, which the one-season rule makes unreachable through
   * the shipped arc and which is asserted directly rather than left as a
   * comment: the day somebody raises the per-arc limit, this is the rule that
   * has to still be standing underneath it.
   */
  it('refuses two seasons live at once, whatever the limit is', () => {
    const two: EmployerArc = {
      employer: 'Test Ltd',
      weeks: 40,
      seasons: [season(), season({ weather: REDUNDANCY_ROUND.decision + 1 })],
    };

    expect(() => validateArc({ ...two, seasons: [two.seasons[0]!] }))
      .not.toThrow();
    expect(() => validateArc({
      ...two,
      seasons: two.seasons.map((entry, index) => index === 1
        ? { ...entry, weather: REDUNDANCY_ROUND.weather + 1 }
        : entry),
    })).toThrow(/One employer gets one season|live at the same time/);
  });

  it('refuses an entry nobody has built', () => {
    expect(() => validateArc(arc({
      seasons: [season({ id: 'merger' })],
    }))).toThrow('written down but not built');
  });

  it('refuses a round nobody survives', () => {
    expect(() => validateArc(arc({
      seasons: [season({ cut: 6, pool: 6 })],
    }))).toThrow('not a round anybody survives');
  });
});

/**
 * THE LEGIBILITY CONTRACT.
 *
 * Four beats, in order, each of them something the player could have looked
 * at, or the event changes nothing. The type is the enforcement - `telegraph`
 * is the only thing that produces the argument the decision takes, and the
 * brand it stamps is keyed on a symbol this module does not export - so what
 * is left to test is that it says no in every direction it is supposed to.
 */
describe('the four-beat contract', () => {
  it('says yes only in the decision week, with everything readable', () => {
    expect(telegraph(REDUNDANCY_ROUND, REDUNDANCY_ROUND.decision, ALWAYS))
      .not.toBeNull();
    expect(whyNotTelegraphed(
      REDUNDANCY_ROUND,
      REDUNDANCY_ROUND.decision,
      ALWAYS,
    )).toBeNull();
  });

  it('says no in every week before it', () => {
    for (let week = 1; week < REDUNDANCY_ROUND.decision; week += 1) {
      expect(
        telegraph(REDUNDANCY_ROUND, week, ALWAYS),
        `week ${String(week)}`,
      ).toBeNull();
    }
  });

  it('says no when a beat fired and left nothing to read', () => {
    for (const missing of PRESSURE_BEATS) {
      const readable = (beat: string): boolean => beat !== missing;

      expect(
        telegraph(REDUNDANCY_ROUND, REDUNDANCY_ROUND.decision, readable),
        missing,
      ).toBeNull();
      expect(whyNotTelegraphed(
        REDUNDANCY_ROUND,
        REDUNDANCY_ROUND.decision,
        readable,
      )).toBe(`the ${missing} beat fired and left nothing the player could read`);
    }
  });

  it('reports the beats that have fired, in order, cumulatively', () => {
    expect(beatsFiredBy(REDUNDANCY_ROUND, 1)).toEqual([]);
    expect(beatsFiredBy(REDUNDANCY_ROUND, REDUNDANCY_ROUND.weather))
      .toEqual(['weather']);
    expect(beatsFiredBy(REDUNDANCY_ROUND, REDUNDANCY_ROUND.notice))
      .toEqual(['weather', 'notice']);
    expect(beatsFiredBy(REDUNDANCY_ROUND, REDUNDANCY_ROUND.criteriaTo))
      .toEqual(['weather', 'notice', 'criteria']);
    expect(beatsFiredBy(REDUNDANCY_ROUND, REDUNDANCY_ROUND.decision))
      .toEqual([...PRESSURE_BEATS]);
  });

  /**
   * The one that has to keep being true when somebody adds the tenth entry:
   * the contract is asked of the SEASON rather than of the redundancy round,
   * so a new event type inherits it by existing.
   */
  it('holds a season that has not been announced back, whatever it is', () => {
    const unannounced = season({ notice: REDUNDANCY_ROUND.decision + 5 });

    expect(whyNotTelegraphed(
      unannounced,
      REDUNDANCY_ROUND.decision,
      ALWAYS,
    )).toBe(`the notice beat has not fired by week ${
      String(REDUNDANCY_ROUND.decision)
    }`);
  });

  it('counts the notice in days a human could diarise', () => {
    expect(noticeDays(season({ notice: 1, decision: 2 })))
      .toBe(DAYS_PER_CALENDAR_WEEK + WEEK_DAYS - 1);
  });
});
