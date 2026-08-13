/**
 * A week with a redundancy round on it, driven headlessly through the shipped
 * driver and the shipped engine.
 *
 * `scripted-week.test.ts` asks whether a week replays. This asks a different
 * question and therefore lives in its own file: whether a SEASON decides, and
 * whether it is allowed to decide anything at all. The same five profiles are
 * played, on the same five days, with the same seed - and the week they are
 * played in is week ten of the employer arc rather than week one, which is the
 * only difference between the two files and the whole subject of this one.
 *
 * Four things are gated here and each of them fails in a different place:
 *
 * - THE LEGIBILITY CONTRACT. Four beats - weather, notice, criteria, decision
 *   - in order, each of them something the player could have looked at, or the
 *   round changes nothing. It is asserted twice over: once by walking a week
 *   where all four landed, and once by walking the identical week with the
 *   announcement made unreadable, which must produce the ending the week would
 *   have had with no round on at all. A gate that only checks the happy path
 *   is a gate with the teeth on the wrong side.
 * - THE PACING RULES, over the arc rather than over a week.
 * - THE FIVE PROFILES, against a pool of six with two going - which is where
 *   the layer earns its place: the week that kept the job on probation does
 *   not keep it in a round, and the week that closed everything with the forum
 *   up survives with the file read out loud for the first time.
 * - `redundant` AS AN OUTCOME: the fund kept, the notice paid, and a route
 *   that is not the retry loop.
 *
 * Nothing below touches the DOM, so the real driver runs exactly as it does in
 * the browser, minus the browser.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { EngineApi } from '../engine-api';
import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { FIRST_EMPLOYER } from '../world/employers';
import { conductEntries } from '../world/conduct';
import { shiftEndTick, shiftStartTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { messageTick, visibleMail } from '../world/mail';
import { SELECTION_POOL } from '../world/pool';
import {
  beatsFiredBy,
  decisionDate,
  EMPLOYER_ARC,
  isQuietWeek,
  noticeDays,
  NOTICE_DAYS_MINIMUM,
  PRESSURE_BEATS,
  PROBATION_WEEK,
  QUIET_WEEKS_AFTER,
  REDUNDANCY_ROUND,
  seasonAt,
} from '../world/pressure';
import { createWorldSession } from '../world/session';
import { isUnresolved } from '../world/sla';
import { findWorldTicket } from '../world/tickets';
import {
  REDUNDANCY_PAYMENT_PENCE,
  REVIEW_DAY,
  REVIEW_PASS_PERFORMANCE,
  type ReviewOutcome,
  reviewTick,
  WEEK,
} from '../world/week';
import type { WeekSource } from '../world/week-source';
import { AppStateStore } from './app-state';
import { APP_MANIFEST } from './apps';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

const SLACK_APPS: ReadonlySet<string> = new Set(
  APP_MANIFEST.filter((app) => app.slack).map((app) => app.id),
);

/** The week of the arc the conversation is had in. */
const DECISION = REDUNDANCY_ROUND.decision;

/** And a week in the middle of consultation, where nothing is decided. */
const CONSULTATION = REDUNDANCY_ROUND.criteriaFrom;

const WALK_TIMEOUT_MS = 30_000;

/** An hour before the conversation, which is when the player still has one. */
const ONE_HOUR = 60;

interface Week {
  readonly driver: DayDriver;
  readonly engine: EngineApi;
  readonly appState: AppStateStore;
}

/**
 * The probation table, held fixed while the ARC POSITION moves.
 *
 * Until 0.34.0 this was what the seam handed back at every arc position anyway,
 * because the generator was clamped to week one and no career could reach week
 * two. Now the clamp is gone and week ten is a drawn week - which is right for
 * the product and wrong for this file, because this file is about a SEASON and
 * nothing else. Its five profiles, its marks, its bars and its ranking are the
 * same five profiles the probation goldens pin, played in a week where a round
 * is on; letting the composition move as well would mean any drift in the
 * numbers had two possible causes and no way to tell them apart.
 *
 * So the week is pinned and the arc position is the variable, which is what the
 * header above has always claimed is the only difference between this file and
 * `scripted-week.test.ts`. The DRAWN weeks have their own gates: the sampler's
 * in `week-gen.test.ts`, their feasibility in the hundred-week sweep, and the
 * career that reaches them in `week-two.test.ts`.
 */
const AUTHORED: WeekSource = () => WEEK;

function startWeek(arcWeek: number): Week {
  const { engine, seed } = createWorldSession(
    {
      farmFund: 0,
      attempt: 1,
      arcWeek,
    },
    undefined,
    undefined,
    AUTHORED,
  );
  const appState = new AppStateStore();
  const visible = (): readonly string[] => appState.get().windows.open
    .filter((entry) => !entry.minimized && SLACK_APPS.has(entry.appId))
    .map((entry) => entry.appId);
  const driver = new DayDriver(engine, COMPANY_IDS.player, seed, {
    onDayBoundary: () => {},
    openSlackApps: visible,
    focusedSlackApp: () => {
      const { focusedId } = appState.get().windows;
      return focusedId !== null && visible().includes(focusedId)
        ? focusedId
        : null;
    },
  });

  return { driver, engine, appState };
}

function show(world: Week, apps: readonly string[]): void {
  world.appState.patch('windows', {
    open: apps.map((appId) => ({ appId, minimized: false })),
    focusedId: apps[apps.length - 1] ?? null,
  });
}

function runTo(world: Week, tick: number): void {
  while (world.engine.now() < tick && world.driver.state() === 'shift') {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

/** The same competent play the week golden uses: the content's own paths. */
function workTheQueue(
  world: Week,
  skip: (id: string) => boolean = () => false,
): void {
  for (const ticket of world.engine.graph.nodesOfKind('ticket')) {
    if (!isUnresolved(ticket) || skip(ticket.id)) {
      continue;
    }

    for (const step of findWorldTicket(ticket.id)?.paths[0]?.steps ?? []) {
      world.driver.dispatch(
        step.action,
        COMPANY_IDS.player,
        step.target,
        { ...step.params },
      );
    }
  }
}

/** Half the roster, decided by the ticket's own id and therefore decided once. */
function halfTheRoster(id: string): boolean {
  let total = 0;

  for (const character of id) {
    total += character.charCodeAt(0);
  }

  return total % 2 === 1;
}

/**
 * The queue, worked at the first minute the player is actually at the desk.
 *
 * The Wednesday sync means it - nothing dispatched from a meeting reaches the
 * world - so competent play waits the block out, which is what a person does
 * and is exactly what the half hour costs. Waiting rather than typing a
 * different minute, so it stays right the day the meeting moves.
 */
function workWhenAble(
  world: Week,
  skip?: (id: string) => boolean,
): void {
  for (let waited = 0; waited < 60; waited += 1) {
    if (world.driver.interruption()?.entry.source !== 'meeting') {
      break;
    }

    world.driver.step(TICK_INTERVAL_MS);
  }

  workTheQueue(world, skip);
}

function sweeps(
  world: Week,
  day: number,
  skip?: (id: string) => boolean,
): void {
  const start = shiftStartTick(day);

  runTo(world, start + 90);
  workWhenAble(world, skip);
  runTo(world, start + 240);
  workWhenAble(world, skip);
  runTo(world, start + 400);
  workWhenAble(world, skip);
}

type Play = (world: Week, day: number) => void;

const PLAYS: Readonly<Record<string, Play>> = {
  worked: (world, day) => {
    const start = shiftStartTick(day);
    runTo(world, start + 90);
    workWhenAble(world);

    if (day === 3) {
      show(world, ['browser']);
      runTo(world, start + 150);
      show(world, []);
    }

    runTo(world, start + 240);
    workWhenAble(world);
    runTo(world, start + 400);
    workWhenAble(world);
  },
  half: (world, day) => {
    sweeps(world, day, halfTheRoster);
  },
  slack: (world, day) => {
    show(world, ['browser']);
    sweeps(world, day);
  },
  slackHalf: (world, day) => {
    show(world, ['browser']);
    sweeps(world, day, halfTheRoster);
  },
  idle: (world, day) => {
    if (day === 2) {
      show(world, ['bubbles']);
    }
  },
};

interface WalkedWeek {
  readonly outcome: ReviewOutcome;
  readonly mark: number;
  readonly bar: number;
  readonly filed: number;
  readonly fund: number;
  readonly criteria: string;
  /**
   * What the player could read an HOUR BEFORE the conversation. Everything the
   * round does at three o'clock has to already be in here, which is the whole
   * of the legibility gate: the beats that had fired, the ranking, the line,
   * and the announcement sitting in the inbox with a date on it.
   */
  readonly atTwo: {
    readonly beats: readonly string[];
    readonly beat: string | null;
    readonly position: number;
    readonly cutFrom: number;
    readonly line: number | null;
    readonly composite: number;
    readonly summary: string;
    readonly noticeInbox: string | null;
    readonly noticeTick: number | null;
  };
  /** The ranking the world was holding when it decided. */
  readonly position: number | null;
  readonly cutFrom: number | null;
}

function walk(
  arcWeek: number,
  play: Play,
  before?: (world: Week) => void,
): WalkedWeek {
  const world = startWeek(arcWeek);
  before?.(world);
  let atTwo: WalkedWeek['atTwo'] | null = null;

  for (let day = 1; day <= REVIEW_DAY; day += 1) {
    world.driver.startShift();
    play(world, day);

    if (day === REVIEW_DAY) {
      runTo(world, reviewTick(day) - ONE_HOUR);
      const reading = world.driver.pressureReading();
      const notice = visibleMail(world.engine.graph, FIRST_EMPLOYER).find(
        (thread) => thread.id === REDUNDANCY_ROUND.noticeThread,
      );

      atTwo = {
        beats: reading.season === null
          ? []
          : [...beatsFiredBy(reading.season, reading.week)],
        beat: reading.beat,
        position: reading.standing?.position ?? -1,
        cutFrom: reading.standing?.cutFrom ?? -1,
        line: reading.standing?.line ?? null,
        composite: reading.standing?.player.composite ?? -1,
        summary: world.driver.pressureSummary(),
        noticeInbox: notice?.messages[0]?.body.join(' ') ?? null,
        noticeTick: notice === undefined
          ? null
          : messageTick(notice, notice.messages[0]?.tick ?? 0, world.engine.graph),
      };
    }

    runTo(world, shiftEndTick(day));
    world.driver.clockOff();
  }

  if (atTwo === null) {
    throw new Error('The week never reached the Friday it is scored on.');
  }

  const field = (name: string): number | null => {
    const value = world.engine.graph.getField(COMPANY_IDS.player, name);
    return typeof value === 'number' ? value : null;
  };
  const card = world.driver.weekScorecard();

  return {
    outcome: world.driver.reviewOutcome(),
    mark: card.performance,
    bar: card.bar,
    filed: conductEntries(world.driver.conductFile()).length,
    fund: card.bankedPence,
    criteria: card.criteria,
    atTwo,
    position: field(FIELDS.reviewPosition),
    cutFrom: field(FIELDS.reviewCutFrom),
  };
}

/* -- the pacing rules, over the arc rather than over a week ---------------- */

describe('the season, paced', () => {
  it('leaves the probation week alone and never runs two at once', () => {
    expect(isQuietWeek(PROBATION_WEEK, EMPLOYER_ARC)).toBe(true);

    for (let week = 1; week <= EMPLOYER_ARC.weeks; week += 1) {
      const live = EMPLOYER_ARC.seasons.filter(
        (season) => week >= season.weather && week <= season.decision,
      );

      expect(live.length, `week ${String(week)}`).toBeLessThanOrEqual(1);
      expect(seasonAt(week, EMPLOYER_ARC), `week ${String(week)}`)
        .toBe(live[0] ?? null);
    }
  });

  it('gives the player a baseline first and quiet afterwards', () => {
    // Two weeks of ordinary work after the probation week before anything at
    // all, because a redundancy round means nothing to somebody who has never
    // had a normal week to compare it against.
    for (let week = 1; week < REDUNDANCY_ROUND.weather; week += 1) {
      expect(isQuietWeek(week, EMPLOYER_ARC), `week ${String(week)}`).toBe(true);
    }

    // And recovery scheduled rather than rolled for.
    for (
      let week = DECISION + 1;
      week <= DECISION + QUIET_WEEKS_AFTER;
      week += 1
    ) {
      expect(isQuietWeek(week, EMPLOYER_ARC), `week ${String(week)}`).toBe(true);
      expect(week).toBeLessThanOrEqual(EMPLOYER_ARC.weeks);
    }
  });

  it('announces itself further out than the law would make it', () => {
    expect(noticeDays(REDUNDANCY_ROUND))
      .toBeGreaterThanOrEqual(NOTICE_DAYS_MINIMUM);
  });
});

/* -- the season, played ---------------------------------------------------- */

describe('the week the round is decided in', () => {
  interface Profile {
    readonly name: string;
    readonly play: Play;
    /** The mark, which is the same mark this week scores in any other week. */
    readonly mark: number;
    readonly bar: number;
    readonly filed: number;
    /** Where the matrix put them, out of six. */
    readonly position: number;
    readonly outcome: ReviewOutcome;
  }

  /**
   * The five, and the two that moved.
   *
   * Every mark and every bar is the number the probation week produces for the
   * same play - they are asserted here as well as there, because the claim is
   * that the round changes WHO GOES rather than what the week was worth. What
   * moves is the ending of two of them:
   *
   *  - HALF THE ROSTER keeps the job on probation with eleven points to spare
   *    and is made redundant here, on a composite of 54 against Owen's 55. An
   *    honest week does not buy safety; it buys a position in the matrix.
   *  - WORKED WITH THE BROWSER UP survives at third of six, and the file is
   *    read out for the first time in the game: eighteen points of composite
   *    and two places, on a week that closed everything. That is the moment
   *    the latent record exists to produce.
   *
   * The two that were already going still go, and they go as FIRINGS rather
   * than as redundancies, because both missed the bar their own week set.
   * A round is not a way of dressing up a week somebody lost.
   */
  /**
   * The marks moved by a point in three of the five for 0.3.4, and not one of
   * them moved for a reason this file is about: the week gained two tickets -
   * a request raised five minutes before close on the Wednesday and a restart
   * somebody was asked to raise on the Friday - so every ratio the review
   * reads is now over a slightly larger denominator, and the half-roster
   * profiles skip a different half of it because the set is chosen by the
   * ticket's own id. The arithmetic and the
   * argument are in `scripted-week.test.ts`, where the goldens are; what is
   * asserted HERE is unchanged, which is the point of the file: the same five
   * weeks, the same bars, the same positions, and the same three endings.
   */
  /**
   * And the worked week's one line went in 0.31.0, with the seeded spreader's
   * finalizer: the lead's first Wednesday round now passes before the browser
   * goes up rather than during it, so nothing is seen and nothing is written
   * down. Nothing this file is about moved with it - the same mark, the same
   * bar, the same position and the same ending, which is exactly the claim,
   * because a folder with a line in it was never what the ranking read. The
   * move is enumerated as the NINETEENTH MOVE in `scripted-week.test.ts`.
   */
  const PROFILES: readonly Profile[] = [
    {
      name: 'worked properly',
      play: PLAYS.worked!,
      mark: 99,
      bar: 45,
      filed: 0,
      position: 1,
      outcome: 'passed',
    },
    {
      name: 'half the roster',
      play: PLAYS.half!,
      mark: 54,
      bar: 45,
      filed: 0,
      position: 5,
      outcome: 'redundant',
    },
    {
      name: 'worked, with the browser up all week',
      play: PLAYS.slack!,
      mark: 99,
      bar: 45,
      filed: 15,
      position: 3,
      outcome: 'passed',
    },
    {
      name: 'half the roster, with the browser up all week',
      play: PLAYS.slackHalf!,
      mark: 54,
      bar: 70,
      filed: 15,
      position: 6,
      outcome: 'fired',
    },
    {
      name: 'nothing at all',
      play: PLAYS.idle!,
      mark: 5,
      bar: 70,
      filed: 12,
      position: 6,
      outcome: 'fired',
    },
  ];

  const walked = new Map<string, WalkedWeek>();

  beforeAll(() => {
    for (const profile of PROFILES) {
      walked.set(profile.name, walk(DECISION, profile.play));
    }
  }, WALK_TIMEOUT_MS);

  it.each(PROFILES)('reads $name exactly as any other week does', (profile) => {
    const week = walked.get(profile.name);

    expect(week?.mark).toBe(profile.mark);
    expect(week?.bar).toBe(profile.bar);
    expect(week?.filed).toBe(profile.filed);
  });

  it.each(PROFILES)('puts $name at $position of six, and $outcome', (profile) => {
    const week = walked.get(profile.name);

    expect(week?.position).toBe(profile.position);
    expect(week?.cutFrom).toBe(REDUNDANCY_ROUND.pool - REDUNDANCY_ROUND.cut + 1);
    expect(week?.outcome).toBe(profile.outcome);
  });

  /**
   * THE MORAL SPINE, played rather than argued.
   *
   * Two people are in the cut in these five weeks and neither of them is made
   * redundant, because both missed the bar their own week set - and one person
   * who cleared her bar comfortably is made redundant, because two other
   * people scored higher. Cause ends the run; the weather changes the
   * employer; and the round is never the reason somebody who lost a week gets
   * a cheque.
   */
  it('never dresses up a week that was lost on the numbers', () => {
    for (const profile of PROFILES) {
      const week = walked.get(profile.name);
      const inTheCut = (week?.position ?? 0) >= (week?.cutFrom ?? 0);

      if (week?.outcome === 'redundant') {
        expect(inTheCut, profile.name).toBe(true);
        expect(week.mark, profile.name).toBeGreaterThanOrEqual(week.bar);
      }

      if (week?.outcome === 'fired') {
        expect(week.mark, profile.name).toBeLessThan(week.bar);
      }

      if (week?.outcome === 'passed') {
        expect(inTheCut, profile.name).toBe(false);
        expect(week.mark, profile.name).toBeGreaterThanOrEqual(week.bar);
      }
    }
  });

  /**
   * THE LEGIBILITY GATE, run on every profile rather than as a case of its
   * own, because it is not a property of one week: NOTHING at three o'clock
   * may come out of a state the player could not read at two.
   */
  it.each(PROFILES)('decides $name from nothing it had not shown', (profile) => {
    const week = walked.get(profile.name);
    const atTwo = week?.atTwo;

    // All four beats, in order, an hour before anything was decided.
    expect(atTwo?.beats).toEqual([...PRESSURE_BEATS]);
    expect(atTwo?.beat).toBe('decision');

    // Beat two, with a number in it and a date on it, in the inbox, stamped
    // before the conversation. This is the beat the research says is not
    // optional, and it is asserted as an artefact rather than as a flag.
    expect(atTwo?.noticeInbox).toContain(String(REDUNDANCY_ROUND.cut));
    expect(atTwo?.noticeInbox).toContain(decisionDate(REDUNDANCY_ROUND));
    expect(atTwo?.noticeTick ?? Number.MAX_SAFE_INTEGER)
      .toBeLessThan(reviewTick(REVIEW_DAY));

    // Beat three: the ranking the world used at three was the ranking the
    // screens were showing at two, off the same function, with the line and
    // the composite that produced it.
    expect(atTwo?.position).toBe(week?.position);
    expect(atTwo?.cutFrom).toBe(week?.cutFrom);
    expect(atTwo?.line).toBe(55);
    expect(atTwo?.summary).toContain(String(atTwo?.composite ?? ''));
    expect(atTwo?.summary).toContain('of 6');

    // Beat four: the reasons are printed beside the verdict rather than left
    // in the room, and they are the world's own sentence.
    expect(week?.criteria).toContain('of 6 on the matrix');
    expect(week?.criteria).toContain(String(profile.position));
  });

  it('names the people it is holding the player against', () => {
    const summary = walked.get('half the roster')?.atTwo.summary ?? '';

    // A ranking against named colleagues with visible standings is the whole
    // defence against this reading as a curve, so the name of the person one
    // place away is asserted to be on the screen.
    expect(summary).toContain('Owen');
    expect(SELECTION_POOL).toHaveLength(REDUNDANCY_ROUND.pool - 1);
  });

  /**
   * And what `redundant` actually does, which is the half that makes it not a
   * loss state: the fund survives, the notice is paid into it, and the week is
   * over rather than restarted.
   */
  it('pays the notice into the fund and keeps everything else', () => {
    const half = walked.get('half the roster');
    const worked = walked.get('worked properly');

    expect(half?.outcome).toBe('redundant');
    // The week's own earnings are in there too - being made redundant on the
    // Friday does not unpay the week - so the assertion is that the payment is
    // ON TOP, by exactly the week of notice the law owes somebody with nine
    // weeks of service and no more.
    expect(half?.fund).toBeGreaterThan(REDUNDANCY_PAYMENT_PENCE);
    expect(REDUNDANCY_PAYMENT_PENCE).toBeGreaterThan(0);

    // And the one that survived was paid nothing extra at all, because it did
    // not go anywhere: a redundancy payment is for leaving.
    expect(worked?.outcome).toBe('passed');
  });
});

/**
 * The same week with the announcement made unreadable, which is the assertion
 * with the teeth in it.
 *
 * The calendar still says the notice went out four weeks ago. The inbox does
 * not hold it - the arrival gate is a string rather than a tick, which is what
 * a lost mail looks like from in here - so the four-beat contract refuses, no
 * pool is scored, no ranking is written, and the week ends exactly as it would
 * have ended in a quiet week. A round nobody could see coming changes nothing.
 */
describe('a round that was never legibly announced', () => {
  it('changes nothing at all', () => {
    const week = walk(DECISION, PLAYS.half!, (world) => {
      world.engine.applySetup([{
        op: 'setField',
        id: COMPANY_IDS.player,
        field: FIELDS.pressureNoticeAt,
        value: 'lost in the post',
      }]);
    });

    // The same week, the same mark, the same bar - and the ending the week
    // would have had if nobody had ever proposed cutting anything.
    expect(week.mark).toBe(54);
    expect(week.bar).toBe(REVIEW_PASS_PERFORMANCE);
    expect(week.outcome).toBe('passed');
    // Nothing was written into the world about a pool, which is what "no
    // effect" has to mean: not a ranking that was ignored, but no ranking.
    expect(week.position).toBeNull();
    expect(week.cutFrom).toBeNull();
  }, WALK_TIMEOUT_MS);
});

/**
 * And a week in the middle of the consultation, where the matrix is on screen
 * and nothing is decided by it.
 *
 * This is the third of the four beats doing its actual job: three weeks in
 * which the player can see exactly where they stand, watch it move when they
 * work, and do something about it - which is the difference between a ranking
 * and a verdict.
 */
describe('a week in the middle of the consultation', () => {
  it('shows the ranking and decides nothing with it', () => {
    const week = walk(CONSULTATION, PLAYS.half!);

    expect(week.atTwo.beat).toBe('criteria');
    expect(week.atTwo.beats).toEqual(['weather', 'notice', 'criteria']);
    // The same standing the decision week produces, three weeks early and on
    // the same screens.
    expect(week.atTwo.position).toBe(5);
    expect(week.atTwo.line).toBe(55);
    expect(week.atTwo.summary).toContain('Consultation is open');

    // And the week is decided on the mark and the file alone, because the
    // decision beat has not fired.
    expect(week.outcome).toBe('passed');
    expect(week.position).toBeNull();
  }, WALK_TIMEOUT_MS);
});
