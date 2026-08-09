/**
 * The plan surface, proven through the REAL path (E10, 0.29.0, slice 2).
 *
 * There is no DOM in this suite, so - exactly as `monitor.test.ts` drives the
 * board's own functions rather than a rendered window - these drive the two
 * halves the Projects app is made of, against a real MSP world with a real
 * promoted engineer standing in it:
 *
 *  - `day.projectPlan()`, the model the window draws: a row per phase with its
 *    baked date and the signed working minutes to it, the task each phase is
 *    worked through and whether it has ARRIVED, and the rule set as far as
 *    anybody has established one;
 *  - the four mapping functions the app renders that model with, which is where
 *    "late", "tight", "locked" and "waiting on a window" become sentences.
 *
 * Nothing here is a view model somebody made up for the test. The world is
 * driven by the shipped terminal, minute by minute, and every assertion is a
 * fact about a project that was actually worked - which is the only way this
 * file can fail when the surface starts lying.
 *
 * Each assertion has teeth. Take the `ruleIsKnown` filter out and the two rules
 * nobody has found appear on the board before anybody has read the box; derive
 * a phase row's state from the gates instead of from the chain and the rollback
 * case goes red; drop the milestone lock and the staging task is no longer
 * locked on the Monday morning.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { CAREER_ACTIONS, PROMOTION_REPUTATION } from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { AUDIT_SOURCES, FIELDS } from '../../world/fields';
import { shiftEndTick, shiftStartTick } from '../../world/hours';
import { MSP_CHANNELS, MSP_IDS } from '../../world/msp-company';
import { MSP_WEEK } from '../../world/msp-week';
import {
  ARDEN_EDGE_ESTATE,
  projectClockLabel,
  projectRules,
} from '../../world/project';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import { AppStateStore } from '../app-state';
import {
  DayDriver,
  type ProjectPhaseRow,
  type ProjectPlanView,
  TICK_INTERVAL_MS,
} from '../day-driver';
import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import { blockedLine, slackLine, slipOf, taskLine } from './projects';
import type { GameApi } from './types';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = Object.freeze({
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
});

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
}

/** A promoted engineer at the MSP, mid-Monday-morning, project assigned. */
function rig(): Rig {
  const session = createWorldSession(MSP_CARRY);
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onNotice: () => {},
  }, undefined, MSP_WEEK, MSP_CHANNELS);
  const api = {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    day: driver,
    dispatch: (
      id: string,
      actor: string,
      target: string | null,
      params: Record<string, never>,
    ) => driver.dispatch(id, actor, target, params),
    dispatchLog: () => session.engine.dispatchLog(),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener: (tick: number) => void) => session.engine
        .onTick(listener),
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
    employer: 'msp',
    actor: COMPANY_IDS.player,
  } as unknown as GameApi;

  // The promotion through the real verb: the tier is the gate on the whole
  // mechanic, so a rig that faked it would be proving a surface against a
  // player who could never open it.
  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: PROMOTION_REPUTATION,
  }]);
  session.engine.dispatch(
    CAREER_ACTIONS.acceptPromotion,
    COMPANY_IDS.player,
    COMPANY_IDS.player,
    {},
  );
  driver.startShift();

  return { session, driver, api };
}

/** A line typed at the shipped terminal, through the shipped parser. */
function run(rigged: Rig, input: string): readonly string[] {
  return executeCommand(parseCommand(input), rigged.api).lines;
}

/** The clock, at x1, to a tick or the end of the shift. */
function runTo(rigged: Rig, tick: number): void {
  while (rigged.session.engine.now() < tick
    && rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

/** Anything owning the screen is waited out, the way a person would. */
function waitOutMeetings(rigged: Rig): void {
  for (let waited = 0; waited < 60; waited += 1) {
    if (rigged.driver.interruption()?.entry.source !== 'meeting') {
      return;
    }

    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

function plan(rigged: Rig): ProjectPlanView {
  const view = rigged.driver.projectPlan();

  if (view === null) {
    throw new Error('There is no project on this desk.');
  }

  return view;
}

function row(view: Readonly<ProjectPlanView>, phase: string): ProjectPhaseRow {
  const found = view.phases.find((candidate) => candidate.phase === phase);

  if (found === undefined) {
    throw new Error(`The plan has no "${phase}" row.`);
  }

  return found;
}

/** Carry every rule the audit established, a minute each. */
function carryEverything(rigged: Rig): void {
  for (const rule of projectRules(
    rigged.session.engine.graph,
    ARDEN_EDGE_ESTATE.projectId,
  )) {
    waitOutMeetings(rigged);
    const short = rule.fields[FIELDS.serviceName];
    run(rigged, `fw migrate ${typeof short === 'string' ? short : rule.id}`);
    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

/** Clock off, sleep the night, and start tomorrow. */
function nextDay(rigged: Rig): void {
  runTo(rigged, shiftEndTick(rigged.driver.day()));

  while (rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }

  rigged.driver.clockOff();
  rigged.driver.startShift();
}

describe('the plan surface reads the project the world is actually in', () => {
  it('opens on the audit, with the rest of the plan dated and locked', () => {
    const rigged = rig();
    const view = plan(rigged);

    expect(view.name).toContain('edge');
    expect(view.customer).toContain('ARDEN');
    // Four rows, in the chain's order. The sign-off is not one of them: it is
    // the project being finished rather than a fifth thing to do.
    expect(view.phases.map((phase) => phase.phase))
      .toEqual(['audit', 'staging', 'cutover', 'scream_test']);
    expect(view.phases.map((phase) => phase.state))
      .toEqual(['now', 'ahead', 'ahead', 'ahead']);

    // Every row has a DATE and a signed count to it, which is the whole design
    // job: three days out is not legible without both halves.
    for (const phase of view.phases) {
      expect(phase.due, phase.phase).not.toBeNull();
      expect(phase.dueLabel, phase.phase).toMatch(/^Day \d+ \d\d:\d\d$/);
      expect(phase.minutesLeft, phase.phase).toBeGreaterThan(0);
      expect(phase.late, phase.phase).toBe(false);
    }

    // The plan is in order and it is a REAL plan: each date is STRICTLY later
    // than the one before it. Strictly, because the failure this catches is a
    // row measured against the wrong one of the four baked dates, and two rows
    // sharing a date is exactly what that looks like from outside.
    const dates = view.phases.map((phase) => phase.due ?? 0);

    for (const [index, due] of dates.entries()) {
      if (index > 0) {
        expect(due, view.phases[index]?.phase).toBeGreaterThan(
          dates[index - 1] ?? 0,
        );
      }
    }

    // The delivery row and the first task are on the desk; the other three
    // have not arrived, which is what the milestone lock IS.
    expect(view.delivery.arrived).toBe(true);
    expect(row(view, 'audit').task?.arrived).toBe(true);
    expect(row(view, 'staging').task?.arrived).toBe(false);
    expect(row(view, 'cutover').task?.arrived).toBe(false);
    expect(row(view, 'scream_test').task?.arrived).toBe(false);

    // A locked row is a row that has not arrived, named and explained - never a
    // dead row and never a refusal.
    expect(taskLine(row(view, 'staging').task!))
      .toContain('arrives when the task before it closes');
    expect(row(view, 'staging').task?.title).toContain('task 2');
  });

  it('shows only the rules anybody knows about until the box is read', () => {
    const rigged = rig();
    const before = plan(rigged);

    // The pack, and nothing else. The two rules that exist only in the live
    // configuration are the whole beat - a board that listed them here would
    // hand the player the answer the audit is the question about.
    expect(before.ruleSource).toBeNull();
    expect(before.rules).toHaveLength(4);
    expect(before.rules.every((rule) => rule.documented)).toBe(true);
    expect(before.rules.map((rule) => rule.short))
      .not.toContain('vpn-brenmark');
    expect(before.rules.map((rule) => rule.short)).not.toContain('nat-scanners');

    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-01');

    const after = plan(rigged);

    expect(after.ruleSource).toBe(AUDIT_SOURCES.config);
    expect(after.rules).toHaveLength(6);
    expect(after.rules.map((rule) => rule.short)).toContain('vpn-brenmark');
    expect(
      after.rules.find((rule) => rule.short === 'vpn-brenmark')?.documented,
    ).toBe(false);
    expect(after.rules.every((rule) => !rule.migrated)).toBe(true);
  });

  it('keeps the pack\'s four when the pack is taken as the audit', () => {
    const rigged = rig();

    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw pack ARD-FW-01');

    const view = plan(rigged);

    // The shortcut passes the gate and the board follows it honestly: four
    // rules, because four is what anybody established.
    expect(view.ruleSource).toBe(AUDIT_SOURCES.pack);
    expect(view.rules).toHaveLength(4);
    expect(row(view, 'audit').state).toBe('done');
    expect(row(view, 'staging').state).toBe('now');
  });

  it('moves the board with the work, and unlocks each task as it arrives', () => {
    const rigged = rig();

    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-01');

    const staging = plan(rigged);

    expect(staging.phases.map((phase) => phase.state))
      .toEqual(['done', 'now', 'ahead', 'ahead']);
    // The lock opened the minute the gate passed, and the row that was a line
    // on the plan is now a ticket on the desk.
    expect(row(staging, 'staging').task?.arrived).toBe(true);
    expect(row(staging, 'staging').task?.state).toBe('open');
    expect(taskLine(row(staging, 'staging').task!)).toBe('On the desk.');
    expect(row(staging, 'audit').task?.resolved).toBe(true);
    expect(taskLine(row(staging, 'audit').task!)).toBe('Closed.');
    // A phase that is done stops counting down: it says so and it cannot be
    // late, whatever the clock does afterwards.
    expect(slackLine(row(staging, 'audit'))).toBe('Done.');
    expect(slipOf(row(staging, 'audit'))).toBe('done');
    expect(row(staging, 'cutover').task?.arrived).toBe(false);

    carryEverything(rigged);

    const cutover = plan(rigged);

    expect(cutover.rules.every((rule) => rule.migrated)).toBe(true);
    expect(cutover.status.phase).toBe('cutover');
    expect(row(cutover, 'cutover').state).toBe('now');
    expect(row(cutover, 'cutover').task?.arrived).toBe(true);
  });

  it('says the change window in words, on both sides of it', () => {
    const rigged = rig();

    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-01');
    carryEverything(rigged);

    const waiting = plan(rigged);

    expect(waiting.status.blocked).toBe('awaiting_change_window');
    expect(blockedLine(waiting)).toContain('Waiting on a change window');
    // The refusal is not a dead end: the sentence names the paperwork that
    // opens the slot.
    expect(blockedLine(waiting)).toContain('file the change');

    run(rigged, 'changereq file ARD-FW-02');

    // Wait the slot out a minute at a time, exactly as a player does.
    for (let minute = 0; minute < 240; minute += 1) {
      if (rigged.driver.state() !== 'shift'
        || rigged.driver.projectView()?.blocked === 'in_change_window') {
        break;
      }

      waitOutMeetings(rigged);
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    const open = plan(rigged);

    expect(open.status.blocked).toBe('in_change_window');
    expect(blockedLine(open)).toContain('Inside the change window');
  });

  it('stamps the cable moving, and follows it back on a rollback', () => {
    const rigged = rig();

    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-01');
    carryEverything(rigged);
    run(rigged, 'changereq file ARD-FW-02');

    let moved = false;

    for (let minute = 0; minute < 240 && !moved; minute += 1) {
      if (rigged.driver.state() !== 'shift') {
        break;
      }

      waitOutMeetings(rigged);
      moved = run(rigged, 'fw cutover ARD-FW-02')
        .join('\n')
        .includes('Circuit moved:');
      rigged.driver.step(TICK_INTERVAL_MS);
    }

    expect(moved, 'the window opened and the cutover was taken').toBe(true);

    const after = plan(rigged);

    expect(after.status.cutoverAt).not.toBeNull();
    expect(after.status.phase).toBe('scream_test');
    expect(row(after, 'cutover').state).toBe('done');
    expect(row(after, 'scream_test').state).toBe('now');
    expect(row(after, 'scream_test').task?.arrived).toBe(true);

    run(rigged, 'fw rollback ARD-FW-01');

    const back = plan(rigged);

    // The board goes BACKWARDS with the cable, because the phase it draws is
    // the first gate that has not passed and the gate is the edge itself. And
    // no row after the one you are standing in claims to be done - a plan that
    // said the scream test was behind you while the site was on the old box
    // would be the one lie this mechanic must not tell.
    expect(back.status.rolledBackAt).not.toBeNull();
    expect(back.status.phase).toBe('cutover');
    expect(row(back, 'cutover').state).toBe('now');
    expect(row(back, 'scream_test').state).toBe('ahead');
  });

  it('goes late in the surface before it is fatal in the world', () => {
    const rigged = rig();
    const due = row(plan(rigged), 'audit').due ?? 0;

    // An hour before the audit's date, with nobody having read anything: the
    // row is not late yet, and it is already TIGHT - which is the whole of
    // "visible before it is fatal". A board that only went red at the deadline
    // would be a report rather than a warning.
    runTo(rigged, due - 45);

    const tight = row(plan(rigged), 'audit');

    expect(tight.late).toBe(false);
    expect(tight.minutesLeft).toBeLessThanOrEqual(60);
    expect(tight.minutesLeft).toBeGreaterThan(0);
    expect(slipOf(tight)).toBe('tight');
    expect(slackLine(tight)).toContain('of working time');

    runTo(rigged, due + 30);

    const late = row(plan(rigged), 'audit');

    expect(late.late).toBe(true);
    expect(late.minutesLeft).toBeLessThan(0);
    expect(slipOf(late)).toBe('late');
    expect(slackLine(late)).toContain('past its date');
    // The project itself agrees, because both are the same read: the phase you
    // are standing in is the one the plan is late on.
    expect(plan(rigged).status.late).toBe(true);
  });

  it('is still the plan it was after a night, and after the phase moved', () => {
    const rigged = rig();
    const monday = plan(rigged);

    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-01');
    nextDay(rigged);

    const tuesday = plan(rigged);

    // The dates were baked once, at kickoff, and a night does not move them.
    // Everything else about the row moves: the count is a day smaller, and the
    // phase in front of the player is the one the work left it in.
    expect(tuesday.phases.map((phase) => phase.due))
      .toEqual(monday.phases.map((phase) => phase.due));
    expect(tuesday.status.phase).toBe('staging');
    expect(row(tuesday, 'staging').minutesLeft)
      .toBeLessThan(row(monday, 'staging').minutesLeft);
  });

  it('says the same dates and the same phase as the terminal does', () => {
    const rigged = rig();

    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-01');

    const view = plan(rigged);
    const board = rigged.driver.projectBoard().join('\n');

    // The board and `fw status` are two drawings of one derivation, and this is
    // the standing gate on that: every phase's date is on the terminal's OWN
    // line for that phase, and the phase they call NOW is the same phase. It is
    // per line rather than per file on purpose - point one row at a different
    // baked date and a whole-output search would still find the string, printed
    // by the row it actually belongs to.
    for (const phase of view.phases) {
      const line = rigged.driver.projectBoard().find(
        // The terminal's own ROW for this phase - `[done] Staging config ...` -
        // rather than the header line that also names the phase you are in.
        (printed) => printed.trimStart().startsWith('[')
          && printed.includes(phase.label),
      );

      expect(line, phase.phase).toBeDefined();
      expect(line, phase.phase).toContain(phase.dueLabel);
      expect(phase.dueLabel).toBe(projectClockLabel(phase.due ?? 0));
    }

    expect(board).toContain(`[NOW ] ${row(view, 'staging').label}`);
    expect(board).toContain(`Now: ${row(view, 'staging').label}`);
  });

  it('has no project to show a service-desk player at the same desk', () => {
    // The tier is the line, and the same world without the promotion proves it:
    // the estate is there, the boxes are there, and no project is - which is
    // the state the window has its own sentence for.
    const session = createWorldSession(MSP_CARRY);
    const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    }, undefined, MSP_WEEK, MSP_CHANNELS);

    driver.startShift();

    expect(session.engine.graph.getNode(MSP_IDS.ardenEdgeOld)).toBeDefined();
    expect(driver.projectPlan()).toBeNull();
  });
});
