/**
 * The watermelon, out of fixtures (0.30.0, slice 3).
 *
 * The one property this file exists to hold is the one the gate names: the
 * green-lie's consequence lands on the DERIVED truth and never on a second
 * stored copy of it. So the beat is asked for against a status object built by
 * `world/project.ts` and a report ledger that holds nothing but colours and
 * days - and the test that would go red if anybody ever wrote the truth down
 * beside the claim is `it('reads the slip off the plan')`, which moves the
 * PLAN and expects the answer to move with it while the report stays put.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { shiftStartTick } from './hours';
import type { ProjectStatus } from './project';
import {
  answeredBeats,
  beatKey,
  encodeReport,
  honestRag,
  honestRagFor,
  isProjectRag,
  latestReport,
  reportForDay,
  reportsFrom,
  slipFor,
  TIGHT_MINUTES,
  watermelonDue,
  watermelonLines,
  watermelonReadout,
  withAnsweredBeat,
  withReport,
} from './watermelon';

beforeAll(() => {
  loadEngineForTests();
});

/**
 * A project status, as `projectStatus` would answer it - the same object, so a
 * change to that shape moves these fixtures rather than leaving them agreeing
 * with a game that has moved on.
 */
function status(
  input: Readonly<{ late?: boolean; minutesLeft?: number; due?: number;
    complete?: boolean }>,
): ProjectStatus {
  return {
    id: 'project:arden-edge',
    phase: 'staging',
    blocked: null,
    due: input.due ?? shiftStartTick(2) + 300,
    late: input.late ?? false,
    minutesLeft: input.minutesLeft ?? 400,
    cutoverAt: null,
    rolledBackAt: null,
    complete: input.complete ?? false,
  };
}

describe('the colour the plan would carry', () => {
  it('reads the slip off the plan and nothing else', () => {
    expect(slipFor({ done: false, late: false, minutesLeft: 400 })).toBe('ahead');
    expect(slipFor({ done: false, late: false, minutesLeft: TIGHT_MINUTES }))
      .toBe('tight');
    expect(slipFor({ done: false, late: true, minutesLeft: -30 })).toBe('late');
    // A phase somebody finished is finished, whatever the date says.
    expect(slipFor({ done: true, late: true, minutesLeft: -300 })).toBe('done');

    expect(honestRag('ahead')).toBe('green');
    expect(honestRag('tight')).toBe('amber');
    expect(honestRag('late')).toBe('red');
    expect(honestRag('done')).toBe('green');

    // And the whole point: it is a function of the STATUS. Move the plan and
    // the honest colour moves with it, because there is nowhere else for it to
    // come from. A build that stored "it was fine when they said it was" would
    // keep answering green here.
    expect(honestRagFor(status({}))).toBe('green');
    expect(honestRagFor(status({ minutesLeft: 20 }))).toBe('amber');
    expect(honestRagFor(status({ late: true, minutesLeft: -60 }))).toBe('red');
  });
});

describe('the claim', () => {
  it('keeps one colour a day, and the last thing said on a day is it', () => {
    const first = withReport('', { day: 2, rag: 'amber', tick: 100 });
    const second = withReport(first, { day: 2, rag: 'red', tick: 400 });
    const third = withReport(second, { day: 3, rag: 'green', tick: 900 });

    expect(reportsFrom(third)).toEqual([
      { day: 2, rag: 'red', tick: 400 },
      { day: 3, rag: 'green', tick: 900 },
    ]);
    expect(reportForDay(reportsFrom(third), 2)?.rag).toBe('red');
    expect(reportForDay(reportsFrom(third), 9)).toBeNull();
    expect(latestReport(reportsFrom(third))?.day).toBe(3);
    expect(latestReport([])).toBeNull();
  });

  it('drops a line this build cannot read rather than guessing', () => {
    const field = [
      encodeReport({ day: 1, rag: 'green', tick: 5 }),
      'nonsense',
      '2|puce|9',
      '|red|9',
      '3|red|',
    ].join('\n');

    expect(reportsFrom(field)).toEqual([{ day: 1, rag: 'green', tick: 5 }]);
    expect(isProjectRag('green')).toBe(true);
    expect(isProjectRag('puce')).toBe(false);
  });

  it('writes down which beats have been answered, once each', () => {
    const once = withAnsweredBeat('', beatKey('red_answered', 2));

    expect(answeredBeats(withAnsweredBeat(once, beatKey('red_answered', 2))))
      .toEqual(new Set(['red_answered@2']));
    expect(answeredBeats(withAnsweredBeat(once, beatKey('green_questioned', 2))).size)
      .toBe(2);
  });
});

describe('what the org owes an answer to', () => {
  const monday = shiftStartTick(1) + 60;
  const wednesday = shiftStartTick(3) + 30;

  it('answers a red the morning after, and only once', () => {
    const reports = reportsFrom(withReport('', { day: 1, rag: 'red', tick: monday }));
    const due = watermelonDue(status({}), reports, new Set(), shiftStartTick(2) + 5);

    expect(due.map((entry) => entry.beat)).toEqual(['red_answered']);
    expect(watermelonLines(due[0] ?? { beat: 'red_answered', report: reports[0]
      ?? { day: 1, rag: 'red', tick: 0 }, phase: 'staging', due: null })
      .join(' ')).toContain('three meetings');

    // Not on the day it was filed - a beat in the same afternoon reads as a
    // punishment for the keystroke - and not twice.
    expect(watermelonDue(status({}), reports, new Set(), monday + 10)).toEqual([]);
    expect(watermelonDue(
      status({}),
      reports,
      new Set([beatKey('red_answered', 1)]),
      shiftStartTick(2) + 5,
    )).toEqual([]);
  });

  it('says nothing at all about a green over a project that is fine', () => {
    const reports = reportsFrom(withReport('', { day: 1, rag: 'green', tick: monday }));

    // Free today and free forever, if it lands. That is the asymmetry the
    // whole mechanic is: telling the truth costs three meetings and the lie
    // costs nothing until the date does.
    expect(watermelonDue(status({}), reports, new Set(), wednesday)).toEqual([]);
    expect(watermelonDue(
      status({ minutesLeft: 10 }),
      reports,
      new Set(),
      wednesday,
    )).toEqual([]);
  });

  it('asks about the green the morning the date goes public', () => {
    const reports = reportsFrom(withReport('', { day: 1, rag: 'green', tick: monday }));
    const missed = shiftStartTick(2) + 300;
    const late = status({ late: true, minutesLeft: -120, due: missed });

    // Late this afternoon is not public: the phase went past its date today
    // and the morning it goes round the building is tomorrow.
    expect(watermelonDue(late, reports, new Set(), missed + 30)).toEqual([]);

    const due = watermelonDue(late, reports, new Set(), wednesday);

    expect(due.map((entry) => entry.beat)).toEqual(['green_questioned']);
    expect(due[0]?.report.day).toBe(1);

    const said = watermelonLines(due[0] ?? {
      beat: 'green_questioned',
      report: { day: 1, rag: 'green', tick: 0 },
      phase: 'staging',
      due: missed,
    }).join(' ');

    // Grounded in BOTH records, out loud: the colour with the day it was said
    // on, and the date with the day it went past.
    expect(said).toContain('day 2');
    expect(said).toContain('day 1');
    expect(said).toContain('GREEN');
    expect(said).toContain('why you said it was not');
  });

  it('does not ask about a green filed after the date had already gone', () => {
    const missed = shiftStartTick(2) + 300;
    const reports = reportsFrom(
      withReport('', { day: 4, rag: 'green', tick: shiftStartTick(4) + 10 }),
    );

    // A green filed on the Thursday about a date that went past on the Tuesday
    // is a different conversation - it is a lie about the present, and the one
    // this beat is about is the lie that was believed at the time.
    expect(watermelonDue(
      status({ late: true, minutesLeft: -600, due: missed }),
      reports,
      new Set(),
      shiftStartTick(5) + 5,
    )).toEqual([]);
  });

  it('has nothing to say when there is no project', () => {
    expect(watermelonDue(null, [], new Set(), wednesday)).toEqual([]);
    expect(watermelonReadout(null, [], 3)).toEqual([]);
  });
});

describe('the readout', () => {
  it('puts the two colours side by side and never merges them', () => {
    const reports = reportsFrom(
      withReport('', { day: 3, rag: 'green', tick: shiftStartTick(3) + 10 }),
    );
    const said = watermelonReadout(
      status({ late: true, minutesLeft: -30 }),
      reports,
      3,
    ).join('\n');

    expect(said).toContain('Reported today: GREEN');
    expect(said).toContain('The plan says:  RED');
    expect(watermelonReadout(status({}), [], 3).join('\n'))
      .toContain('nothing filed');
  });
});
