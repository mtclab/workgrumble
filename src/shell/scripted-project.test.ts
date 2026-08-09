/**
 * The first project, played (E10, 0.29.0).
 *
 * `project.test.ts` proves the derivation and `solvability.test.ts` proves every
 * phase gate is reachable through registered actions. This asks the question
 * neither of them can, and it is the one the epic lives or dies on: with the
 * clock running at x1, on the authored MSP week, with that week's queue and
 * interruptions on top, does the project actually FINISH inside the three
 * working days it was given?
 *
 * It is its own file rather than a case in `scripted-week.test.ts` for the same
 * reason the sysadmin walk is its own run: the project is engineer-tier content
 * at a different employer, and the week golden is the probation week - a
 * byte-for-byte hash of five days at Workgrumble Ltd that this content must not
 * be able to move and does not appear in. A golden that could host this would be
 * a golden that had stopped being the thing it is.
 *
 * Two journeys, and they are the two halves of the beat:
 *
 *  - THE JOB DONE PROPERLY. Read the box, carry all six rules, cut over inside
 *    a window signed off by the customer's own IT, write the as-built. Every
 *    task closes, the parent closes on its enumeration, and the morning after is
 *    QUIET - which has to be reachable or the mechanic is a punishment.
 *  - THE PACK TAKEN AS READ. The same three days, four rules instead of six, the
 *    same gates passed - and two tickets on the morning after, each naming the
 *    rule nobody carried, raised by the settler rather than by a script.
 *
 * Nothing here touches the DOM: the real driver, the real engine, the real
 * terminal, minus the browser.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import {
  CAREER_ACTIONS,
  PROJECT_ACTIONS,
  PROMOTION_REPUTATION,
} from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { FIELDS } from '../world/fields';
import { shiftEndTick, shiftStartTick } from '../world/hours';
import { MSP_CHANNELS } from '../world/msp-company';
import { MSP_WEEK } from '../world/msp-week';
import { ARDEN_EDGE_ESTATE, projectRules, projectStatus } from '../world/project';
import { actionSummary, triedFromTouches } from '../world/tickets';
import { ARDEN_EDGE_TASKS } from '../world/tickets/project';
import { createWorldSession, WORLD_SEED, type WorldSession } from '../world/session';
import { AppStateStore } from './app-state';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import type { GameApi } from './apps/types';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

/** How long a whole journey is allowed to take in real seconds. */
const WALK_TIMEOUT_MS = 60_000;

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
  readonly notices: string[];
}

/** A promoted engineer at the MSP, on the Monday, before the shift starts. */
function rig(): Rig {
  const session = createWorldSession(MSP_CARRY);
  const notices: string[] = [];
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onNotice: (title) => {
      notices.push(title);
    },
  }, undefined, MSP_WEEK, MSP_CHANNELS);
  const api: GameApi = {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    day: driver,
    dispatch: (id, actor, target, params) => driver.dispatch(
      id,
      actor,
      target,
      params,
    ),
    dispatchLog: () => session.engine.dispatchLog(),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener) => session.engine.onTick(listener),
    },
    onWorldChange: (listener) => session.engine.onEvent(() => {
      listener();
    }),
    notify: () => {},
    report: () => Promise.resolve({ ok: true, value: undefined }),
    openApp: () => {},
    closeApp: () => {},
    hasApp: () => false,
    installApp: () => ({ ok: true }),
    uninstallApp: () => ({ ok: true }),
    setDesktop: () => ({ ok: true }),
    restartWeek: () => {},
    acceptOffer: () => {},
    employer: 'msp',
    actor: COMPANY_IDS.player,
  };

  // The promotion, earned and taken through the real verb - the tier IS the
  // gate on every project verb below, so a rig that faked it would be proving
  // the content against a player who could not reach it.
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
  driver.raiseFirstIncident();

  return { session, driver, api, notices };
}

/** A line typed at the shipped terminal, through the shipped parser. */
function run(rigged: Rig, input: string): readonly string[] {
  return executeCommand(parseCommand(input), rigged.api).lines;
}

/** The clock, run at x1 until a tick or the end of the shift. */
function runTo(rigged: Rig, tick: number): void {
  while (rigged.session.engine.now() < tick
    && rigged.driver.state() === 'shift') {
    rigged.driver.step(TICK_INTERVAL_MS);
  }
}

/**
 * The minutes a meeting owns, waited out.
 *
 * Nothing dispatched from inside a screen takeover reaches the world, so
 * competent play waits - which is what a person does and exactly what the half
 * hour costs. Borrowed from `scripted-arc.test.ts` for the same reason it exists
 * there: a test that typed through a meeting would be testing a player who is
 * not in the room.
 */
function waitOutMeetings(rigged: Rig): void {
  for (let waited = 0; waited < 60; waited += 1) {
    if (rigged.driver.interruption()?.entry.source !== 'meeting') {
      return;
    }

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

function state(rigged: Rig, ticketId: string): string | undefined {
  return rigged.session.engine.ticketState(ticketId);
}

/**
 * The "what I tried" list off a ticket's own evidence, in the words the handoff
 * form would print - which is the surface the evidence exists FOR, so reading
 * it any other way would be reading a field rather than the claim.
 */
function tried(rigged: Rig, ticketId: string): readonly string[] {
  return triedFromTouches(
    rigged.session.engine.graph.getField(ticketId, FIELDS.touchLog),
  ).map((entry) => entry.text);
}

function phase(rigged: Rig): string | undefined {
  return projectStatus(
    rigged.session.engine.graph,
    ARDEN_EDGE_ESTATE,
    rigged.session.engine.now(),
  )?.phase;
}

/**
 * Carry the rules over, one command each, waiting out anything that takes the
 * screen. Answers how many actually landed, so a journey can say four or six
 * rather than assuming.
 */
function carry(rigged: Rig, only: 'documented' | 'all'): number {
  let carried = 0;

  for (const rule of projectRules(
    rigged.session.engine.graph,
    ARDEN_EDGE_ESTATE.projectId,
  )) {
    if (only === 'documented'
      && rule.fields[FIELDS.fwRuleDocumented] !== true) {
      continue;
    }

    waitOutMeetings(rigged);
    const short = rule.fields[FIELDS.serviceName];
    run(rigged, `fw migrate ${typeof short === 'string' ? short : rule.id}`);

    if (rigged.session.engine.graph.getField(
      rule.id,
      FIELDS.fwRuleMigrated,
    ) === true) {
      carried += 1;
    }

    // A minute each. A rule set is not carried across in one keystroke and the
    // afternoon this project has is measured in the ones it costs.
    rigged.driver.step(TICK_INTERVAL_MS);
  }

  return carried;
}

/**
 * The change window, waited for and then used.
 *
 * The request is filed through the ordinary terminal against the ordinary flow,
 * approved by the customer's own IT because the contract is co-managed, and the
 * slot it opens is somewhere the far side of an hour. This runs the clock a
 * minute at a time until the cutover is taken - and asserts on the way that it
 * was genuinely REFUSED before the window, which is the half that makes the
 * window a mechanic rather than a delay.
 */
function cutoverInsideTheWindow(rigged: Rig): {
  readonly refusedBefore: boolean;
  readonly done: boolean;
} {
  run(rigged, 'changereq file ARD-FW-02');

  const early = run(rigged, 'fw cutover ARD-FW-02').join('\n');
  const refusedBefore = !early.includes('Circuit moved:');

  for (let minute = 0; minute < 240; minute += 1) {
    if (rigged.driver.state() !== 'shift') {
      break;
    }

    waitOutMeetings(rigged);

    if (run(rigged, 'fw cutover ARD-FW-02').join('\n').includes('Circuit moved:')) {
      return { refusedBefore, done: true };
    }

    rigged.driver.step(TICK_INTERVAL_MS);
  }

  return { refusedBefore, done: false };
}

describe('the edge replacement, played at x1 on the authored week', () => {
  /**
   * The job done properly, inside its three days, with the week's own queue and
   * interruptions running on top of it.
   *
   * The assertions are OUTCOMES rather than transitions: every task resolved,
   * the parent closed on its enumeration, the project's own derivation complete,
   * the morning after quiet, and all of it before the Friday the plan named.
   */
  it('finishes in three working days, and the morning after is quiet', () => {
    const rigged = rig();

    // DAY ONE. The shift starts, the project is assigned, and the audit is the
    // first thing on it.
    rigged.driver.startShift();

    expect(rigged.notices).toContain(
      'Project assigned: ARDEN-MFG edge replacement',
    );
    expect(state(rigged, ARDEN_EDGE_TASKS.parent)).toBe('open');
    expect(state(rigged, ARDEN_EDGE_TASKS.audit)).toBe('open');
    // And the tasks that are LOCKED are not in the queue at all - which is what
    // a milestone lock is here, and why nothing downstream is sitting with a
    // clock on it that nobody is allowed to work.
    expect(state(rigged, ARDEN_EDGE_TASKS.staging)).toBeUndefined();
    expect(state(rigged, ARDEN_EDGE_TASKS.cutover)).toBeUndefined();

    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw rules ARD-FW-01');
    run(rigged, 'fw audit ARD-FW-01');

    expect(state(rigged, ARDEN_EDGE_TASKS.audit)).toBe('resolved');
    // The lock opens the moment the gate passes, and not a minute before.
    expect(state(rigged, ARDEN_EDGE_TASKS.staging)).toBe('open');
    expect(phase(rigged)).toBe('staging');

    expect(carry(rigged, 'all')).toBe(6);
    expect(state(rigged, ARDEN_EDGE_TASKS.staging)).toBe('resolved');
    expect(state(rigged, ARDEN_EDGE_TASKS.cutover)).toBe('open');

    // DAY TWO. The window: filed, waited for, used.
    nextDay(rigged);
    expect(rigged.driver.day()).toBe(2);

    // Standing in the cutover phase with the paperwork in and the slot not yet
    // open, the project reads BLOCKED and says which kind of waiting it is.
    // That is the field a board draws a stalled project with, and the whole
    // point of naming it: "no longer moving" with no sentence attached is the
    // status report this game is a parody of.
    expect(rigged.driver.projectView()?.blocked).toBe('awaiting_change_window');

    const window = cutoverInsideTheWindow(rigged);

    expect(window.refusedBefore).toBe(true);
    expect(window.done).toBe(true);
    expect(state(rigged, ARDEN_EDGE_TASKS.cutover)).toBe('resolved');
    expect(state(rigged, ARDEN_EDGE_TASKS.handover)).toBe('open');

    // DAY THREE. The morning after a cutover that carried everything: nothing.
    nextDay(rigged);
    expect(rigged.driver.day()).toBe(3);
    expect(rigged.notices).not.toContain('Arden are on the phone');

    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-02');

    expect(state(rigged, ARDEN_EDGE_TASKS.handover)).toBe('resolved');
    // The parent, closed by ENUMERATION over the four - nobody did anything TO
    // it, which is the whole of what a delivery row is.
    expect(state(rigged, ARDEN_EDGE_TASKS.parent)).toBe('resolved');
    expect(phase(rigged)).toBe('handover');

    // And inside the plan. The handover was due at 14:00 on the third working
    // day; this is the assertion that the three days are real rather than a
    // number in a comment.
    const status = projectStatus(
      rigged.session.engine.graph,
      ARDEN_EDGE_ESTATE,
      rigged.session.engine.now(),
    );

    expect(status?.complete).toBe(true);
    expect(rigged.session.engine.now()).toBeLessThan(6_120);
    // Nothing breached, either: a project task carries its planned date, so
    // three days of work on a Silver customer does not produce four red rows.
    for (const id of Object.values(ARDEN_EDGE_TASKS)) {
      expect(state(rigged, id), id).toBe('resolved');
    }
  }, WALK_TIMEOUT_MS);

  /**
   * The same three days off the handover pack.
   *
   * Every gate passes, the cutover is authorised and taken, and two rules that
   * were never on anybody's list go down with it. The tickets arrive on the
   * MORNING AFTER, raised by the settler off a pure read of the world, each
   * naming its own rule - and the project is not finished until they are carried.
   */
  it('raises the missed rules the morning after, and each one names its rule', () => {
    const rigged = rig();
    rigged.driver.startShift();

    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw pack ARD-FW-01');

    expect(state(rigged, ARDEN_EDGE_TASKS.audit)).toBe('resolved');
    expect(carry(rigged, 'documented')).toBe(4);
    expect(state(rigged, ARDEN_EDGE_TASKS.staging)).toBe('resolved');

    nextDay(rigged);
    expect(cutoverInsideTheWindow(rigged).done).toBe(true);
    // Not the same afternoon. A consequence that landed in the same hour would
    // read as a punishment for the keystroke.
    expect(state(rigged, 'ticket:arden-fw-scream-brenmark')).toBeUndefined();

    nextDay(rigged);

    expect(rigged.notices).toContain('Arden are on the phone');
    expect(state(rigged, 'ticket:arden-fw-scream-brenmark')).toBe('open');
    expect(state(rigged, 'ticket:arden-fw-scream-scanners')).toBe('open');
    // And the handover will not close over them: nothing left unmigrated is the
    // completion shape, and two things are.
    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-02');
    expect(state(rigged, ARDEN_EDGE_TASKS.handover)).toBe('open');

    // Carrying them at last closes both tickets and the project with them.
    run(rigged, 'fw migrate vpn-brenmark');
    run(rigged, 'fw migrate nat-scanners');

    expect(state(rigged, 'ticket:arden-fw-scream-brenmark')).toBe('resolved');
    expect(state(rigged, 'ticket:arden-fw-scream-scanners')).toBe('resolved');
    expect(state(rigged, ARDEN_EDGE_TASKS.handover)).toBe('resolved');
    expect(state(rigged, ARDEN_EDGE_TASKS.parent)).toBe('resolved');
  }, WALK_TIMEOUT_MS);

  /**
   * Every phase task, and whether the work that closes it leaves a mark ON it.
   *
   * This is the gate for a defect 0.29.0 shipped and nothing could see. A touch
   * is recorded against the unresolved tickets whose authored `nodes` contain
   * the node the verb was AIMED AT (`ticketsAbout`), and `fw migrate` is aimed
   * at a RULE - `service:ard-fw-01/vpn-coalport` - while the staging task
   * listed the two boxes and no rules. So an engineer could spend a whole
   * afternoon carrying a rule set across, close the task on it, and the task's
   * own evidence would be empty: a handoff form raised on it at four o'clock
   * would tell second line, in writing, that nobody had tried anything.
   *
   * It is asserted per PHASE rather than for the one ticket that was reported,
   * because "the ticket's nodes name what the work touches" is the class and
   * the staging task was one instance of it - the handover carries rules too.
   * The walk is the shipped terminal, the shipped parser and the shipped
   * driver: touch evidence is written by `DayDriver.dispatch`, so a test that
   * dispatched at the engine would prove nothing about the thing that broke.
   */
  it('writes touch evidence onto every phase task the work goes through', () => {
    const rigged = rig();
    rigged.driver.startShift();
    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);

    // Phase one: reading the old box is aimed at the old box, which the audit
    // task names. This half always worked, and it is here so the assertion
    // below is a comparison rather than a lone claim.
    run(rigged, 'fw audit ARD-FW-01');

    expect(tried(rigged, ARDEN_EDGE_TASKS.audit)).not.toEqual([]);
    expect(state(rigged, ARDEN_EDGE_TASKS.staging)).toBe('open');

    // Phase two: ONE rule carried across, with the task still open, so this is
    // about the evidence rather than about the close.
    const first = projectRules(
      rigged.session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
    )[0];

    expect(first).toBeDefined();
    run(rigged, `fw migrate ${String(first?.fields[FIELDS.serviceName])}`);

    expect(state(rigged, ARDEN_EDGE_TASKS.staging)).toBe('open');
    expect(tried(rigged, ARDEN_EDGE_TASKS.staging)).toContain(
      actionSummary(PROJECT_ACTIONS.migrateRule),
    );

    // And the rest of the project, so the two later phases are asked the same
    // question in the state a player actually reaches them in.
    carry(rigged, 'all');
    nextDay(rigged);
    expect(cutoverInsideTheWindow(rigged).done).toBe(true);
    expect(tried(rigged, ARDEN_EDGE_TASKS.cutover)).not.toEqual([]);

    nextDay(rigged);
    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-02');

    expect(state(rigged, ARDEN_EDGE_TASKS.handover)).toBe('resolved');
    expect(tried(rigged, ARDEN_EDGE_TASKS.handover)).not.toEqual([]);
  }, WALK_TIMEOUT_MS);

  /**
   * And the handover, whose work is ALSO a migrate - the same class, the other
   * instance, and the one a pack-read journey actually meets.
   *
   * "Carry over anything the morning finds" is the phase's own description of
   * itself, and what the morning finds is two rules nobody migrated. Those are
   * carried with `fw migrate`, aimed at a rule, on a task that had better name
   * the rules it is about.
   */
  it('writes the missed rules onto the handover that is waiting on them', () => {
    const rigged = rig();
    rigged.driver.startShift();
    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw pack ARD-FW-01');
    carry(rigged, 'documented');
    nextDay(rigged);
    expect(cutoverInsideTheWindow(rigged).done).toBe(true);
    nextDay(rigged);

    waitOutMeetings(rigged);
    run(rigged, 'fw audit ARD-FW-02');
    expect(state(rigged, ARDEN_EDGE_TASKS.handover)).toBe('open');

    // The evidence so far is the as-built read, aimed at the new box. Now the
    // rule the plant rang about, aimed at the rule.
    run(rigged, 'fw migrate vpn-brenmark');

    expect(tried(rigged, ARDEN_EDGE_TASKS.handover)).toContain(
      actionSummary(PROJECT_ACTIONS.migrateRule),
    );
  }, WALK_TIMEOUT_MS);

  /**
   * And the rollback, walked: the cable back, at the cost of the window.
   *
   * It is walked on the pack journey because that is the state a real engineer
   * pulls it in - something is wrong and you do not yet know what. What it
   * proves is that the derivation follows the cable backwards with no
   * bookkeeping, and that using it costs the window rather than the work.
   */
  it('puts the site back on the old box, and the window stays spent', () => {
    const rigged = rig();
    rigged.driver.startShift();
    runTo(rigged, shiftStartTick(1) + 30);
    waitOutMeetings(rigged);
    run(rigged, 'fw pack ARD-FW-01');
    carry(rigged, 'documented');
    nextDay(rigged);

    expect(cutoverInsideTheWindow(rigged).done).toBe(true);
    expect(phase(rigged)).toBe('scream_test');

    const back = run(rigged, 'fw rollback ARD-FW-01').join('\n');

    expect(back).toContain('Circuit moved back:');
    expect(phase(rigged)).toBe('cutover');
    // The window is spent and the morning after still comes: the cutover minute
    // is on the record, so the plant still rings about what went down while the
    // new box was live.
    nextDay(rigged);
    expect(rigged.notices).toContain('Arden are on the phone');
  }, WALK_TIMEOUT_MS);
});
