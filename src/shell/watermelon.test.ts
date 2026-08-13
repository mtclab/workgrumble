/**
 * The watermelon, played (0.30.0, slice 3).
 *
 * `../world/watermelon.ts` is proven out of fixtures next door. This drives the
 * real thing: the shipped terminal filing a colour, the shipped driver settling
 * what the org owes an answer to at the next start of shift, and the shipped
 * project derivation deciding whether a date has actually gone past.
 *
 * THE ASSERTION THE GATE ASKS FOR is the second journey: a green filed on the
 * Monday, a Monday spent not doing the audit, and a Tuesday morning where the
 * question arrives. It has teeth against exactly one class of mistake, which is
 * the one this slice could most easily have made - storing a second copy of the
 * truth beside the claim. A build that decided where the project was by reading
 * the report would find a green project on the Tuesday and ask nothing, and
 * this file would go red.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { CAREER_ACTIONS } from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { FIELDS } from '../world/fields';
import { shiftEndTick } from '../world/hours';
import { MSP_CHANNELS } from '../world/msp-company';
import { ARDEN_EDGE_ESTATE, projectRules } from '../world/project';
import { MSP_WEEK } from '../world/msp-week';
import { createWorldSession, WORLD_SEED, type WorldSession } from '../world/session';
import {
  reportsFrom,
  type WatermelonBeat,
} from '../world/watermelon';
import { AppStateStore } from './app-state';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import type { GameApi } from './apps/types';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';
import { offeredAtFor } from '../world/titles';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
  readonly beats: WatermelonBeat[];
  readonly said: string[];
}

function rig(): Rig {
  const session = createWorldSession(MSP_CARRY);
  const beats: WatermelonBeat[] = [];
  const said: string[] = [];
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onWatermelon: (entry, lines) => {
      beats.push(entry.beat);
      said.push(lines.join(' '));
    },
  }, undefined, MSP_WEEK, MSP_CHANNELS);
  const api = {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    day: driver,
    dispatch: (
      id: string,
      actor: string,
      target: string | null,
      params: Record<string, string | number | boolean | null>,
    ) => driver.dispatch(id, actor, target, params),
    dispatchLog: () => session.engine.dispatchLog(),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener: (tick: number) => void) =>
        session.engine.onTick(listener),
    },
    onWorldChange: (listener: () => void) => session.engine.onEvent(() => {
      listener();
    }),
    notify: () => {},
    report: () => Promise.resolve({ ok: true as const, value: undefined }),
    openApp: () => {},
    closeApp: () => {},
    hasApp: () => false,
    installApp: () => ({ ok: true as const }),
    uninstallApp: () => ({ ok: true as const }),
    setDesktop: () => ({ ok: true as const }),
    restartWeek: () => {},
    acceptOffer: () => {},
    stayAnotherWeek: () => {},
    employer: 'msp',
    actor: COMPANY_IDS.player,
  } as unknown as GameApi;

  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: offeredAtFor('systems_engineer'),
  }]);
  session.engine.dispatch(
    CAREER_ACTIONS.acceptPromotion,
    COMPANY_IDS.player,
    COMPANY_IDS.player,
    {},
  );
  driver.raiseFirstIncident();

  return { session, driver, api, beats, said };
}

function run(rigged: Rig, input: string): readonly string[] {
  return executeCommand(parseCommand(input), rigged.api).lines;
}

/** The rest of today, then tomorrow morning. */
function sleep(rigged: Rig): void {
  while (rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }

  rigged.driver.clockOff();
  rigged.driver.startShift();
}

describe('filing a colour', () => {
  it('files it beside the plan and says what the plan says', () => {
    const rigged = rig();
    rigged.driver.startShift();

    const filed = run(rigged, 'fw report amber').join('\n');

    expect(filed).toContain('Status filed: AMBER.');
    expect(filed).toContain('Reported today: AMBER');
    expect(filed).toContain('The plan says:');
    // The report changed nothing about the project. It cannot: the phase is
    // the first gate that has not passed and nothing here touches a gate.
    expect(rigged.driver.projectView()?.phase).toBe('audit');
    expect(reportsFrom(
      rigged.session.engine.graph.getField(
        COMPANY_IDS.player,
        FIELDS.projectReport,
      ),
    )).toEqual([{ day: 1, rag: 'amber', tick: rigged.session.engine.now() }]);
  });

  it('refuses a colour that is not one, and says which three are', () => {
    const rigged = rig();
    rigged.driver.startShift();

    expect(run(rigged, 'fw report puce').join('\n'))
      .toContain('is not a status. It is green, amber or red');
    expect(rigged.driver.projectReports()).toEqual([]);
  });

  it('keeps the last thing said on a day, not the first', () => {
    const rigged = rig();
    rigged.driver.startShift();
    run(rigged, 'fw report green');
    rigged.driver.step(TICK_INTERVAL_MS);
    run(rigged, 'fw report red');

    expect(rigged.driver.projectReports().map((report) => report.rag))
      .toEqual(['red']);
  });
});

describe('the org answering it', () => {
  it('answers a red with three meetings, the next morning, once', () => {
    const rigged = rig();
    rigged.driver.startShift();
    run(rigged, 'fw report red');

    // Nothing on the day it was filed.
    expect(rigged.beats).toEqual([]);

    sleep(rigged);

    expect(rigged.beats).toEqual(['red_answered']);
    expect(rigged.said.join(' ')).toContain('three meetings');
    expect(rigged.said.join(' ')).toContain('Nobody is annoyed with you');

    // And the day after that, and every day after that, silence: a beat that
    // fired every morning would be a punishment for having been honest once.
    sleep(rigged);
    expect(rigged.beats).toEqual(['red_answered']);
  });

  it('asks about a green the morning the date it covered goes past', () => {
    const rigged = rig();
    rigged.driver.startShift();
    run(rigged, 'fw report green');

    // A Monday spent not doing the audit. The plan said noon.
    while (rigged.session.engine.now() < shiftEndTick(1)
      && rigged.driver.state() === 'shift') {
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    const monday = rigged.driver.projectView();

    expect(monday?.phase).toBe('audit');
    expect(monday?.late).toBe(true);
    // Late all afternoon and nobody said a word: the miss is not public until
    // the day it happened on is over.
    expect(rigged.beats).toEqual([]);

    sleep(rigged);

    expect(rigged.beats).toEqual(['green_questioned']);

    const said = rigged.said.join(' ');

    // Grounded in BOTH records, and the question is the one the research says
    // gets asked: not why it is late, but why you said it was not.
    expect(said).toContain('GREEN');
    expect(said).toContain('day 1');
    expect(said).toContain('why you said it was not');

    // TEETH. This is the assertion that fails if the consequence is ever moved
    // onto a stored copy of the truth: the report says green, the DERIVATION
    // says the audit is past its date, and the beat exists because the second
    // of those is what was consulted. A build that read the colour to decide
    // where the project was would find a healthy project here and say nothing.
    expect(rigged.driver.projectHonestRag()).toBe('red');
    expect(rigged.driver.projectReports()[0]?.rag).toBe('green');
    expect(rigged.driver.projectReportReadout().join('\n'))
      .toContain('The plan says:  RED');

    sleep(rigged);
    expect(rigged.beats).toEqual(['green_questioned']);
  });

  it('never asks about a green on a project that keeps its dates', () => {
    const rigged = rig();
    rigged.driver.startShift();
    run(rigged, 'fw report green');
    run(rigged, 'fw audit ARD-FW-01');

    // And the rest of the Monday's work, so the staging date is kept too. A
    // green is only honest for as long as the dates behind it are.
    for (const rule of projectRules(
      rigged.session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
    )) {
      const short = rule.fields[FIELDS.serviceName];

      run(rigged, `fw migrate ${typeof short === 'string' ? short : rule.id}`);
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    sleep(rigged);

    // Both of Monday's dates were met, so the Tuesday is quiet. Reporting
    // green over a project that is actually green costs nothing, ever - which
    // is what stops the mechanic being a tax on filing anything at all.
    expect(rigged.driver.projectView()?.phase).toBe('cutover');
    expect(rigged.driver.projectView()?.late).toBe(false);
    expect(rigged.beats).toEqual([]);
  });

  it('rides a save and does not answer the same report twice', () => {
    const rigged = rig();
    rigged.driver.startShift();
    run(rigged, 'fw report red');
    sleep(rigged);

    expect(rigged.beats).toEqual(['red_answered']);

    const saved = rigged.session.engine.serialize();
    const loaded = rig();

    loaded.session.engine.restore(saved);
    loaded.driver.resync();

    // The colour and the fact that it has been answered are both world state,
    // so a reload lands on a morning where the meeting has already happened.
    expect(loaded.driver.projectReports().map((report) => report.rag))
      .toEqual(['red']);

    while (loaded.driver.state() === 'shift') {
      loaded.driver.step(TICK_INTERVAL_MS);
    }

    loaded.driver.clockOff();
    loaded.driver.startShift();

    expect(loaded.beats).toEqual([]);
  });
});
