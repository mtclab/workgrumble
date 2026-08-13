import { describe, expect, it } from 'vitest';

import { EMPLOYER_IDS, employerFor } from './employers';
import { dayLoad, type LoadTicket } from './load';
import {
  LOAD_BANDS,
  type LoadVoice,
  loadReading,
  validateLoadVoice,
} from './load-voice';
import { findWorldTicket } from './tickets';

const lookup = (id: string): LoadTicket | undefined => findWorldTicket(id);

/** Every reading the shipped shops own, flattened. */
function everyReading(): readonly string[] {
  return EMPLOYER_IDS.flatMap((shop) => Array.from(
    { length: LOAD_BANDS },
    (_, index) => loadReading(shop, index + 1),
  )).filter((line): line is string => line !== null);
}

/** A voice table of the right shape, for the refusals to be broken against. */
function voiceOf(...lines: readonly string[]): Readonly<Record<string, LoadVoice>> {
  return Object.fromEntries(
    EMPLOYER_IDS.map((shop) => [shop, Object.freeze(lines)]),
  );
}

const FINE = ['light', 'ordinary', 'busy', 'heavy'];

describe('what the brief is allowed to say about the day', () => {
  /**
   * The completeness claim, and it is the one that matters on a real morning:
   * every day of every shipped week prices into a band, and every one of those
   * bands has a sentence at that shop. A hole here is a brief with a gap in it
   * on a Tuesday somebody actually plays.
   */
  it('has a reading for every day of every shipped week', () => {
    for (const shop of EMPLOYER_IDS) {
      for (const script of employerFor(shop).week) {
        const band = dayLoad(script, lookup).load;
        const reading = loadReading(shop, band);

        expect(reading, `${script.label} at ${shop}`).not.toBeNull();
        expect(reading?.trim().length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The reading is a function of the BAND and of nothing else, which is what
   * makes it checkable from outside: two days of the same weight at the same
   * shop say the same thing, and a day that weighs more says a different one.
   *
   * The probation week is the one that proves both halves in one pass - its
   * five days are bands 1, 3, 3, 4, 2 - so Tuesday and Wednesday are the same
   * sentence on purpose (some repetition is the job's texture) and the other
   * three are not.
   */
  it('says the same thing about two days of the same weight, and not otherwise', () => {
    const week = employerFor('workgrumble').week;
    const bands = week.map((script) => dayLoad(script, lookup).load);
    const readings = bands.map((band) => loadReading('workgrumble', band));

    expect(bands).toEqual([1, 3, 3, 4, 2]);
    expect(readings[1]).toBe(readings[2]);
    expect(new Set(readings).size).toBe(new Set(bands).size);
  });

  /**
   * No shop borrows another shop's words. The register is the whole point of
   * having four tables instead of one - the probation lead does not talk like
   * the MSP's board - and a copy-paste between two of them is exactly the way
   * that quietly stops being true.
   */
  it('gives every shop its own words', () => {
    const readings = everyReading();

    expect(readings).toHaveLength(EMPLOYER_IDS.length * LOAD_BANDS);
    expect(new Set(readings).size).toBe(readings.length);
  });

  /**
   * BANDS, NOT NUMBERS - the rule the surface exists to keep, and the one a
   * later line of copy is most likely to break. The minutes behind a band are a
   * worst case with a partition factor on them, so a figure on the screen would
   * be a promise the arithmetic never made.
   */
  it('never puts a figure on the screen', () => {
    for (const reading of everyReading()) {
      expect(reading).not.toMatch(/\d/);
    }
  });

  /**
   * AND IT NEVER LEAKS THE FUTURE. The brief reads the schedule; the walk-up at
   * half two, the lead's rounds and the pager are surprises the day is entitled
   * to keep. The band is allowed to be MADE of those minutes - the arithmetic
   * prices the heavier branch of every favour - but the sentence may not name
   * them, or it stops being a forecast and becomes a manifest that is wrong
   * whenever the player talks somebody out of raising anything.
   */
  it('names nothing the day has not dealt yet', () => {
    for (const reading of everyReading()) {
      expect(reading).not.toMatch(/walk-?up|ping|pager|takeover|ticket|minute/i);
    }
  });

  /** A shop nobody has written a voice for says nothing, rather than borrowing. */
  it('says nothing at all for a shop this build has no voice for', () => {
    for (let band = 1; band <= LOAD_BANDS; band += 1) {
      expect(loadReading('a-shop-that-never-was', band)).toBeNull();
    }
  });

  /**
   * The two edges. A band below one is nobody's day and answers with nothing;
   * a band ABOVE the top one is the day past the ceiling, which both loaders
   * refuse and only a harness can build - and the heaviest line is still true
   * of it, because "you cannot do all of this" is what band four already says.
   */
  it('reads a day past the ceiling as the heaviest band there is', () => {
    expect(loadReading('workgrumble', 0)).toBeNull();
    expect(loadReading('workgrumble', LOAD_BANDS + 1))
      .toBe(loadReading('workgrumble', LOAD_BANDS));
  });
});

describe('the content gate on the voices', () => {
  it('accepts a table with a line per band at every shipped shop', () => {
    expect(() => validateLoadVoice(voiceOf(...FINE))).not.toThrow();
  });

  it('refuses a shop that is short a band', () => {
    expect(() => validateLoadVoice(voiceOf('light', 'ordinary', 'busy')))
      .toThrow(/bands/);
  });

  it('refuses an empty reading', () => {
    expect(() => validateLoadVoice(voiceOf('light', ' ', 'busy', 'heavy')))
      .toThrow(/empty/);
  });

  it('refuses a figure in the copy', () => {
    expect(() => validateLoadVoice(
      voiceOf('light', 'ordinary', 'busy', 'about 412 minutes of it'),
    )).toThrow(/figure/);
  });

  it('refuses a build that ships a shop with no voice', () => {
    const missing = Object.fromEntries(
      EMPLOYER_IDS.slice(1).map((shop) => [shop, Object.freeze(FINE)]),
    );

    expect(() => validateLoadVoice(missing)).toThrow(/no voice/);
  });
});
