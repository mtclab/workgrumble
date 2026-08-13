/**
 * How heavy today is, said out loud - the reading the morning brief gains
 * (E11, 0.34.0 slice 3, D-E11-5).
 *
 * 0.31.0 made the `load` column arithmetic (`load.ts`): a day is worth the
 * committed minutes of the shift it asks for, and the roster refuses a day
 * whose authored number disagrees with what it actually deals. That bought a
 * budget the generator can sample against and a gate nobody can quietly drift
 * past, and it bought the player exactly nothing - the number is real, checked
 * and invisible. This is the half that reaches the desk.
 *
 * THREE RULES, and each of them was the argument rather than the typing.
 *
 * BANDS, NEVER NUMBERS. "Today commits four hundred and twelve minutes" is a
 * spreadsheet talking, and a spreadsheet is not what a lead standing at your
 * desk before nine sounds like. It is also a promise the arithmetic cannot
 * keep: the total is a WORST CASE with a partition factor on it, not a
 * timetable, and printing it would invite a player to plan against a figure
 * that is deliberately pessimistic. The band is what the number is FOR - one is
 * a day you can breathe in, four is the Thursday - so the band is what gets
 * said. `validateLoadVoice` refuses a digit anywhere in this file, which is the
 * rule made mechanical rather than remembered.
 *
 * A FORECAST, NOT A MANIFEST. The arithmetic prices the heavier branch of every
 * favour: a walk-up, a direct message and a linked request each carry a ticket
 * they raise IF the player sends the person to the form, and `dealtOrRaised`
 * counts them because the honest budget prices the branch that costs more. So
 * some of the minutes behind a reading are minutes the player can refuse into
 * existence or talk out of it. Every line below is therefore written as a
 * reading of the DAY rather than an inventory of it - "there is a fair bit on"
 * is true whichever way the favours go, where "three walk-ups are coming" would
 * be a lie half the time and a spoiler the other half. Nothing here mentions
 * walk-ups, pages, takeovers or anybody's name but the staff who are saying it:
 * the brief reads the schedule, and the schedule is not the future.
 *
 * ONE TABLE, FOUR SHOPS. The register is a COMPARATIVE decision - the probation
 * lead does not talk like the MSP's board, and the only way to see that is to
 * read them next to each other - so the voices live in one file rather than one
 * per employer module. Desmond has been through the board and has views;
 * Vernon has not been through anything and says so anyway; Fettle & Crane has
 * no lead on the desk at all, because the queue is the boss, so its reading is
 * the board's; Halcyon's comes down from the exec floor via Denise, with Ivor's
 * priorities attached to it.
 *
 * A shop this file has no voice for says NOTHING - the brief hides the line -
 * rather than borrowing the probation lead's words, for the same reason
 * `runsBossPings` exists: Desmond is a person in one building, and putting his
 * sentences into a world he is not in is worse than silence. Every SHIPPED shop
 * is checked at module load, so silence can only ever mean a fixture.
 *
 * Nothing here dispatches, mutates, reads a clock or consumes the RNG.
 */

import { EMPLOYER_IDS } from './employers';
import { LOAD_BAND_TOPS } from './load';

/** How many bands the arithmetic has, which is how many lines a shop owes. */
export const LOAD_BANDS = LOAD_BAND_TOPS.length;

/** One shop's readings, lightest first: index `band - 1`. */
export type LoadVoice = readonly string[];

/**
 * The four shops, in the order a career meets them.
 *
 * Read down a column rather than across a row to check the register: every
 * shop says something about band one, and no two of them sound like the same
 * person doing it.
 */
const VOICES: Readonly<Record<string, LoadVoice>> = Object.freeze({
  /**
   * Desmond Frisk, Service Delivery Lead, who has read the board before you
   * arrived and would like you to know that he has read the board.
   */
  workgrumble: Object.freeze([
    'Desmond has had the board up since half seven and calls today a quiet '
      + 'one, in the voice of a man who expects to be corrected by eleven.',
    'Desmond has read the board and calls today an ordinary one: enough to be '
      + 'getting on with, and nothing on it he would accept as an excuse.',
    'Desmond has read the board and says there is a fair bit on today. He is '
      + 'sure you will prioritise sensibly, which is as near to a warning as '
      + 'he goes.',
    'Desmond has read the board twice and says today looks heavy. He says it '
      + 'the way he says things he intends to be remembered for having said.',
  ]),

  /**
   * Vernon Bodgeworth, Owner, who has looked at the lorry calendar and nothing
   * else. The narrator carries the truth here, because Vernon does not deal in
   * it: he is right about today, and he is right the way a stopped clock is.
   */
  bodgeworth: Object.freeze([
    'Vernon puts his head round the door to say it is a quiet one today, '
      + 'which for once the week agrees with.',
    'Vernon says today is a normal day. He says that most days. Today it '
      + 'happens to be true.',
    'Vernon says there is a fair bit on today and that you will be all right. '
      + 'The first half of that is correct.',
    'Vernon says today is a heavy one and that this is exactly why they got '
      + 'somebody in. He is already walking away by the end of the sentence.',
  ]),

  /**
   * Fettle & Crane, where nobody stands at your desk in the morning: the board
   * is the lead, dispatch reads it out, and everything is measured against a
   * contract somebody else signed.
   */
  msp: Object.freeze([
    'The board is light this morning. Dispatch has it as a quiet shift, and '
      + 'would rather you did not say so out loud.',
    'The board is at its normal volume. Dispatch has it as an ordinary shift: '
      + 'contract hours, nothing flagged, one customer at a time.',
    'The board is busy this morning. Dispatch has it as a heavy shift and '
      + 'expects the response clocks to be the thing that goes first.',
    'The board is full before the desk opens. Dispatch has it as one of those '
      + 'shifts - more coming in than there are hours to put against it, and '
      + 'nobody spare to send.',
  ]),

  /**
   * Halcyon Grange, where the day is a diary rather than a queue: Denise reads
   * the exec floor's, Ivor attaches the priorities, and neither of them is
   * going to be the one who tells the executives that something slipped.
   */
  corporate: Object.freeze([
    'Denise has been through the diary and says the exec floor is quiet '
      + 'today. Ivor calls that a chance to catch up on the things nobody '
      + 'escalates.',
    'Denise has been through the diary and says it is a normal day upstairs. '
      + 'Ivor asks that you keep the floor happy and the queue moving, in that '
      + 'order, and he means the order.',
    'Denise has been through the diary and says there is a fair bit on today. '
      + 'Ivor would like the exec floor kept happy regardless, and has not '
      + 'said which of the rest may slip.',
    'Denise has been through the diary and says today is a heavy one, which '
      + 'the exec floor does not know. Ivor asks you to manage expectations, '
      + 'his phrase for the part of this he is not doing.',
  ]),
});

/**
 * The content gate, run at module load the way every other content table in
 * this codebase is gated.
 *
 * Three refusals, and the digit one is the interesting one: "bands, not
 * numbers" is the whole design of this surface, and a rule that lives only in
 * a comment is a rule the next line of copy breaks. A shop short of a line
 * would be a band that reads as an empty paragraph on a real morning, and a
 * SHIPPED shop with no voice at all would be silence that looks exactly like
 * the fixture case this module tolerates on purpose.
 */
export function validateLoadVoice(
  voices: Readonly<Record<string, LoadVoice>>,
): Readonly<Record<string, LoadVoice>> {
  for (const [shop, lines] of Object.entries(voices)) {
    if (lines.length !== LOAD_BANDS) {
      throw new Error(
        `The voice for "${shop}" has ${String(lines.length)} readings and the `
        + `arithmetic has ${String(LOAD_BANDS)} bands. A band nobody wrote a `
        + 'line for is a morning with a blank where the reading goes.',
      );
    }

    for (const line of lines) {
      if (line.trim().length === 0) {
        throw new Error(`The voice for "${shop}" has an empty reading in it.`);
      }

      if (/\d/.test(line)) {
        throw new Error(
          `The reading "${line}" at "${shop}" has a figure in it. The brief `
          + 'says how heavy a day is in bands, because the minutes behind the '
          + 'band are a worst case and not a timetable.',
        );
      }
    }
  }

  for (const shop of EMPLOYER_IDS) {
    if (voices[shop] === undefined) {
      throw new Error(
        `This build ships "${shop}" and nobody has written its lead a voice. `
        + 'A shop with no voice says nothing at all on the brief, which is the '
        + 'right answer for a fixture and a hole for an employer.',
      );
    }
  }

  return voices;
}

validateLoadVoice(VOICES);

/**
 * What this shop's lead says about a day in this band, or null when the shop
 * has no voice written.
 *
 * Tolerant of an id the registry has never heard of, exactly as `employerName`
 * is and for the same reason: a fixture employer built inside a test is a
 * legitimate thing to stand a brief up over, and a crash there would be the
 * surface deciding which worlds are allowed to exist. It answers with nothing
 * rather than with somebody else's sentences.
 *
 * A band above the top one is read as the top one. `loadForMinutes` returns
 * null past the ceiling and `dayLoad` says "one more than the last band" for
 * it, and a week like that cannot be loaded - both gates refuse it - so this
 * is reachable only from a harness. The heaviest line is still TRUE of it: a
 * day past the ceiling is a day you cannot do all of, which is precisely what
 * band four already says.
 */
export function loadReading(employer: string, band: number): string | null {
  const lines = VOICES[employer];

  if (lines === undefined || band < 1) {
    return null;
  }

  return lines[Math.min(band, LOAD_BANDS) - 1] ?? null;
}
