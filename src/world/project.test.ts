/**
 * The phase machine (E10, 0.29.0), held to the four claims it makes.
 *
 * 1. THE PHASE IS DERIVED. Every gate is read twice - once by this module and
 *    once by the engine, evaluating the same `Expr` as a phase ticket's
 *    resolution rule - and the two have to agree at every step of a walked
 *    project. Two answers to one question is the whole failure mode a derived
 *    status exists to prevent, so it is asserted rather than reasoned about.
 * 2. A SAVE RELOADS INTO THE IDENTICAL DERIVATION. The change-request property
 *    at a longer scale: serialise mid-phase, restore into a fresh engine, and
 *    the phase, its date and the minutes left have to be the same numbers -
 *    because the dates were baked once and nothing since has been stored.
 * 3. THE ROLLBACK IS REAL AND HONEST. Moving the cable back moves the phase
 *    back, with no bookkeeping; it does not un-spend the window and it does not
 *    delete anything the outage raised.
 * 4. THE MORNING AFTER IS QUIET WHEN IT SHOULD BE. The scream test is a pure
 *    read of what is due, and it is due for exactly the rules nobody carried -
 *    including, reachably, none of them.
 *
 * Everything runs against the shipped engine, the shipped verbs and the shipped
 * content. Nothing here touches the DOM.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { WasmEngine } from '../engine-api/wasm-engine';
import type { EngineApi, Expr } from '../engine-api';
import { PROJECT_ACTIONS, PROJECT_CIRCUIT_PARAM, PROJECT_FROM_PARAM, PROJECT_PARAM } from './actions';
import { COMPANY_IDS } from './company';
import { AUDIT_SOURCES, FIELDS } from './fields';
import { shiftStartTick } from './hours';
import { MSP_IDS } from './msp-company';
import {
  ARDEN_EDGE_ESTATE,
  ardenEdgeKickoffSetup,
  auditGate,
  cutoverGate,
  handoverGate,
  PROJECT_BUDGETS,
  projectBoardLines,
  projectRules,
  projectStatus,
  screamTestDue,
  stagingGate,
} from './project';
import { createWorldSession, type WorldSession } from './session';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

/** Day three at nine o'clock: the minute a real kickoff lands on. */
const KICKOFF = shiftStartTick(3);

function world(startedAt: number = KICKOFF): WorldSession {
  const session = createWorldSession(MSP_CARRY);
  session.engine.advance(startedAt - session.engine.now());
  session.engine.applySetup(ardenEdgeKickoffSetup(session.engine.now()));
  return session;
}

function act(
  engine: EngineApi,
  action: string,
  target: string | null,
  params: Readonly<Record<string, string>> = {},
): void {
  const result = engine.dispatch(action, COMPANY_IDS.player, target, params);

  if (!result.ok) {
    throw new Error(`${action} on ${String(target)} was refused: ${result.reason}`);
  }
}

const CUTOVER_PARAMS = {
  [PROJECT_CIRCUIT_PARAM]: ARDEN_EDGE_ESTATE.circuitId,
  [PROJECT_FROM_PARAM]: ARDEN_EDGE_ESTATE.edgeBoxId,
  [PROJECT_PARAM]: ARDEN_EDGE_ESTATE.projectId,
};

const ROLLBACK_PARAMS = {
  [PROJECT_CIRCUIT_PARAM]: ARDEN_EDGE_ESTATE.circuitId,
  [PROJECT_FROM_PARAM]: ARDEN_EDGE_ESTATE.newBoxId,
  [PROJECT_PARAM]: ARDEN_EDGE_ESTATE.projectId,
};

function carryEverything(session: WorldSession): void {
  for (const rule of projectRules(
    session.engine.graph,
    ARDEN_EDGE_ESTATE.projectId,
  )) {
    act(session.engine, PROJECT_ACTIONS.migrateRule, rule.id);
  }
}

/** The four gates, as the engine sees them, on the world as it stands. */
function engineSays(session: WorldSession): Readonly<Record<string, boolean>> {
  const ask = (expr: Expr): boolean => session.engine.evaluate(expr);

  return {
    audit: ask(auditGate(ARDEN_EDGE_ESTATE.edgeBoxId)),
    staging: ask(stagingGate(
      ARDEN_EDGE_ESTATE.projectId,
      ARDEN_EDGE_ESTATE.edgeBoxId,
    )),
    cutover: ask(cutoverGate(
      ARDEN_EDGE_ESTATE.circuitId,
      ARDEN_EDGE_ESTATE.newBoxId,
    )),
    handover: ask(handoverGate(ARDEN_EDGE_ESTATE)),
  };
}

/** And the same four, as the phase read sees them. */
function readSays(session: WorldSession): Readonly<Record<string, boolean>> {
  const status = projectStatus(
    session.engine.graph,
    ARDEN_EDGE_ESTATE,
    session.engine.now(),
  );
  const order = ['audit', 'staging', 'cutover', 'scream_test', 'handover'];
  const reached = order.indexOf(status?.phase ?? 'audit');

  return {
    audit: reached > 0,
    staging: reached > 1,
    cutover: reached > 2,
    handover: reached > 3,
  };
}

describe('the phase machine derives, and the engine agrees', () => {
  /**
   * The two readers, walked in step through a whole project.
   *
   * A phase gate exists twice on purpose - as a ticket's resolution rule and as
   * the read a board draws from - and this is the assertion that keeps them one
   * claim. Every step of the walk compares all four, so a gate that drifted in
   * either direction is caught at the step that moved it rather than at the end.
   */
  it('agrees with the engine at every step of a project', () => {
    const session = world();
    const agree = (where: string): void => {
      expect(readSays(session), where).toEqual(engineSays(session));
    };

    agree('at kickoff');
    expect(engineSays(session)).toEqual({
      audit: false,
      staging: false,
      cutover: false,
      handover: false,
    });

    act(session.engine, PROJECT_ACTIONS.auditConfig, MSP_IDS.ardenEdgeOld);
    agree('after the audit');
    expect(engineSays(session).audit).toBe(true);
    expect(engineSays(session).staging).toBe(false);

    carryEverything(session);
    agree('after the staging config');
    expect(engineSays(session).staging).toBe(true);

    act(
      session.engine,
      PROJECT_ACTIONS.cutover,
      MSP_IDS.ardenEdgeNew,
      CUTOVER_PARAMS,
    );
    agree('after the cutover');
    expect(engineSays(session).cutover).toBe(true);
    // And NOT handed over: the as-built is not written, which is the phase
    // every project drops and the one the gate refuses to drop for it.
    expect(engineSays(session).handover).toBe(false);

    act(session.engine, PROJECT_ACTIONS.auditConfig, MSP_IDS.ardenEdgeNew);
    agree('after the as-built');
    expect(engineSays(session).handover).toBe(true);
    expect(projectStatus(
      session.engine.graph,
      ARDEN_EDGE_ESTATE,
      session.engine.now(),
    )?.complete).toBe(true);
  });

  /**
   * The plan is three working days, and it says so in dates rather than in a
   * duration nobody can plan against.
   *
   * Kicked off at nine on the Wednesday: the audit is due at noon that day, the
   * configuration by the end of it, the cutover in the middle of Thursday, and
   * the sign-off with an hour in hand before Friday's review. Asserted as the
   * actual ticks, because "three days" is exactly the kind of claim that turns
   * out to be four when somebody counts the nights.
   */
  it('bakes a three-day plan out of the business-hours calendar', () => {
    const session = world();
    const at = (field: string): number => {
      const value = session.engine.graph.getField(
        ARDEN_EDGE_ESTATE.projectId,
        field,
      );
      return typeof value === 'number' ? value : Number.NaN;
    };

    // Day 3 12:00, day 3 17:00, day 4 15:00, day 5 14:00.
    expect(at(FIELDS.projectStartedAt)).toBe(KICKOFF);
    expect(at(FIELDS.projectAuditDue)).toBe(3_120);
    expect(at(FIELDS.projectStagingDue)).toBe(3_420);
    expect(at(FIELDS.projectCutoverDue)).toBe(4_740);
    expect(at(FIELDS.projectHandoverDue)).toBe(6_120);
    // Three working days and not a minute more: the last date is inside the
    // fifth day, which is the whole of Fork A.
    expect(at(FIELDS.projectHandoverDue) - at(FIELDS.projectStartedAt))
      .toBeLessThan(3 * 24 * 60);
  });

  /**
   * A project mid-phase, saved and reloaded, is the same project.
   *
   * This is the change-request property at a longer scale and it is the reason
   * the phase is not stored: the engine's own serialise/restore is driven, into
   * a FRESH engine, and the phase, the date it is gating on and the minutes left
   * all have to come back identical. Storing the phase would pass this test and
   * fail the interesting one - so the walk continues afterwards in the restored
   * world and has to land on the same gates.
   */
  it('reloads mid-phase into the identical derivation', () => {
    const session = world();
    act(session.engine, PROJECT_ACTIONS.auditConfig, MSP_IDS.ardenEdgeOld);
    const rules = projectRules(
      session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
    );
    act(session.engine, PROJECT_ACTIONS.migrateRule, rules[0]?.id ?? '');
    act(session.engine, PROJECT_ACTIONS.migrateRule, rules[1]?.id ?? '');
    session.engine.advance(37);

    const before = projectStatus(
      session.engine.graph,
      ARDEN_EDGE_ESTATE,
      session.engine.now(),
    );

    const reloaded = new WasmEngine(session.seed);
    reloaded.restore(session.engine.serialize());

    const after = projectStatus(
      reloaded.graph,
      ARDEN_EDGE_ESTATE,
      reloaded.now(),
    );

    expect(before?.phase).toBe('staging');
    expect(after).toEqual(before);

    // And it is still the same project on the other side: the rest of the walk
    // lands on the same gates in the restored world.
    for (const rule of projectRules(reloaded.graph, ARDEN_EDGE_ESTATE.projectId)) {
      if (rule.fields[FIELDS.fwRuleMigrated] !== true) {
        act(reloaded, PROJECT_ACTIONS.migrateRule, rule.id);
      }
    }

    expect(projectStatus(reloaded.graph, ARDEN_EDGE_ESTATE, reloaded.now())?.phase)
      .toBe('cutover');
  });

  /**
   * The shortcut passes the same gates, and asks for a shorter list.
   *
   * Signing the audit off on the handover pack is not refused anywhere, which is
   * the design: it clears the audit gate, and the staging gate then wants only
   * the four rules the pack lists. Both halves are asserted, because a world
   * that quietly required all six would have no shortcut in it and no beat.
   */
  it('lets the pack close the audit, and asks only for what the pack listed', () => {
    const session = world();
    act(session.engine, PROJECT_ACTIONS.auditPack, MSP_IDS.ardenEdgeOld);

    expect(engineSays(session).audit).toBe(true);
    expect(session.engine.graph.getField(
      MSP_IDS.ardenEdgeOld,
      FIELDS.fwAuditSource,
    )).toBe(AUDIT_SOURCES.pack);

    for (const rule of projectRules(
      session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
    )) {
      if (rule.fields[FIELDS.fwRuleDocumented] === true) {
        act(session.engine, PROJECT_ACTIONS.migrateRule, rule.id);
      }
    }

    expect(engineSays(session).staging).toBe(true);
    // And the cutover is allowed, with two rules still only on the old box.
    // That is not a bug being tolerated - it is the beat, and the morning after
    // is where it is paid for.
    act(
      session.engine,
      PROJECT_ACTIONS.cutover,
      MSP_IDS.ardenEdgeNew,
      CUTOVER_PARAMS,
    );
    expect(engineSays(session).cutover).toBe(true);
    expect(engineSays(session).handover).toBe(false);
  });

  /**
   * The teeth on the cutover guard: a KNOWN rule left behind stops the cable.
   *
   * The pack path is allowed to cut over with two rules missing because nobody
   * ever knew about them. A rule that IS on the list and has not been carried is
   * a different thing entirely, and the verb refuses it - so the beat cannot be
   * reached by simply not doing the work.
   */
  it('refuses a cutover that leaves a rule anybody knew about behind', () => {
    const session = world();
    act(session.engine, PROJECT_ACTIONS.auditConfig, MSP_IDS.ardenEdgeOld);

    const result = session.engine.dispatch(
      PROJECT_ACTIONS.cutover,
      COMPANY_IDS.player,
      MSP_IDS.ardenEdgeNew,
      CUTOVER_PARAMS,
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('does not carry everything');
    expect(engineSays(session).cutover).toBe(false);
  });

  /** And the staging config refuses to start off a rule list nobody confirmed. */
  it('refuses to carry a rule before anybody has established the set', () => {
    const session = world();
    const rule = projectRules(
      session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
    )[0];

    const result = session.engine.dispatch(
      PROJECT_ACTIONS.migrateRule,
      COMPANY_IDS.player,
      rule?.id ?? '',
      {},
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toContain('audit first');
  });
});

describe('the rollback, and what it does not undo', () => {
  it('moves the phase back with no bookkeeping, and keeps the record', () => {
    const session = world();
    act(session.engine, PROJECT_ACTIONS.auditConfig, MSP_IDS.ardenEdgeOld);
    carryEverything(session);
    act(
      session.engine,
      PROJECT_ACTIONS.cutover,
      MSP_IDS.ardenEdgeNew,
      CUTOVER_PARAMS,
    );

    const cutoverAt = session.engine.graph.getField(
      ARDEN_EDGE_ESTATE.projectId,
      FIELDS.projectCutoverAt,
    );

    expect(cutoverAt).toBe(session.engine.now());
    session.engine.advance(4);
    act(
      session.engine,
      PROJECT_ACTIONS.rollback,
      MSP_IDS.ardenEdgeOld,
      ROLLBACK_PARAMS,
    );

    // The derivation follows the cable, and nothing had to remember to move it.
    expect(engineSays(session).cutover).toBe(false);
    expect(projectStatus(
      session.engine.graph,
      ARDEN_EDGE_ESTATE,
      session.engine.now(),
    )?.phase).toBe('cutover');

    // The window is SPENT: the minute the cable moved is still on the record,
    // which is what the morning after reads. A rollback that un-stamped it
    // would be a free undo, and then it would be the correct move every time.
    expect(session.engine.graph.getField(
      ARDEN_EDGE_ESTATE.projectId,
      FIELDS.projectCutoverAt,
    )).toBe(cutoverAt);
    expect(session.engine.graph.getField(
      ARDEN_EDGE_ESTATE.projectId,
      FIELDS.projectRolledBackAt,
    )).toBe(session.engine.now());
    // And no data went anywhere: every rule the project carried is still
    // carried, and the estate is whole.
    expect(projectRules(session.engine.graph, ARDEN_EDGE_ESTATE.projectId)
      .every((rule) => rule.fields[FIELDS.fwRuleMigrated] === true)).toBe(true);
  });
});

describe('the scream test is due for exactly what was missed', () => {
  const nextMorning = (session: WorldSession): number => {
    session.engine.advance(shiftStartTick(4) - session.engine.now());
    return session.engine.now();
  };

  it('raises nothing at all on a project that carried everything', () => {
    const session = world();
    act(session.engine, PROJECT_ACTIONS.auditConfig, MSP_IDS.ardenEdgeOld);
    carryEverything(session);
    act(
      session.engine,
      PROJECT_ACTIONS.cutover,
      MSP_IDS.ardenEdgeNew,
      CUTOVER_PARAMS,
    );

    expect(screamTestDue(
      session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
      nextMorning(session),
    )).toEqual([]);
  });

  it('names the rules the pack never had, and each ticket names its rule', () => {
    const session = world();
    act(session.engine, PROJECT_ACTIONS.auditPack, MSP_IDS.ardenEdgeOld);

    for (const rule of projectRules(
      session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
    )) {
      if (rule.fields[FIELDS.fwRuleDocumented] === true) {
        act(session.engine, PROJECT_ACTIONS.migrateRule, rule.id);
      }
    }

    act(
      session.engine,
      PROJECT_ACTIONS.cutover,
      MSP_IDS.ardenEdgeNew,
      CUTOVER_PARAMS,
    );

    // Nothing on the afternoon it happened. A consequence that landed in the
    // same hour would read as a punishment for the keystroke.
    expect(screamTestDue(
      session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
      session.engine.now(),
    )).toEqual([]);

    const due = screamTestDue(
      session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
      nextMorning(session),
    );

    expect(due).toEqual([
      {
        rule: 'service:ard-fw-01/vpn-brenmark',
        ticket: 'ticket:arden-fw-scream-brenmark',
      },
      {
        rule: 'service:ard-fw-01/nat-scanners',
        ticket: 'ticket:arden-fw-scream-scanners',
      },
    ]);

    // Once each: the latch the world verb writes is what stops the same factory
    // ringing every minute of the morning.
    for (const finding of due) {
      act(session.engine, PROJECT_ACTIONS.screamNoticed, finding.rule);
    }

    expect(screamTestDue(
      session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
      session.engine.now(),
    )).toEqual([]);
  });

  /** And carrying the rule at last is what closes it. */
  it('stops being due once the rule is carried', () => {
    const session = world();
    act(session.engine, PROJECT_ACTIONS.auditPack, MSP_IDS.ardenEdgeOld);
    carryEverything(session);
    act(
      session.engine,
      PROJECT_ACTIONS.cutover,
      MSP_IDS.ardenEdgeNew,
      CUTOVER_PARAMS,
    );

    expect(screamTestDue(
      session.engine.graph,
      ARDEN_EDGE_ESTATE.projectId,
      nextMorning(session),
    )).toEqual([]);
    expect(engineSays(session).handover).toBe(false);
    act(session.engine, PROJECT_ACTIONS.auditConfig, MSP_IDS.ardenEdgeNew);
    expect(engineSays(session).handover).toBe(true);
  });
});

/** The plan on a screen: a date three days out, and the slip before it is fatal. */
describe('the board a surface draws', () => {
  it('prints every phase against the clock, and marks the one you are in', () => {
    const session = world();
    const board = session.engine.graph.getNode(ARDEN_EDGE_ESTATE.projectId) === undefined
      ? []
      : [...projectBoard(session)];

    expect(board[0]).toContain('ARDEN-MFG');
    expect(board.join('\n')).toContain('Day 3 12:00');
    expect(board.join('\n')).toContain('Day 4 15:00');
    expect(board.join('\n')).toContain('Day 5 14:00');
    expect(board.join('\n')).toContain('[NOW ] Audit');
    // The number that makes slipping visible before it is fatal: working
    // minutes, signed, on every phase that is still open.
    expect(board.join('\n')).toContain('+180 working min');
  });

  it('goes negative while there is still a project to save', () => {
    const session = world();
    // Half past three on the kickoff day: the audit was due at noon and the
    // cutover is not until tomorrow afternoon, so one number is red and the
    // rest are not - which is the whole of the legibility claim.
    session.engine.advance(shiftStartTick(3) + 390 - session.engine.now());

    const board = projectBoard(session).join('\n');

    expect(board).toContain('- LATE');
    expect(board).toMatch(/Audit\s+Day 3 12:00\s+-210 working min/u);
    expect(board).toContain('Cutover');
  });
});

function projectBoard(session: WorldSession): readonly string[] {
  return projectBoardLines(
    session.engine.graph,
    ARDEN_EDGE_ESTATE,
    session.engine.now(),
  );
}

/** The budgets are the dates, and the dates are the budgets. */
describe('the plan is one set of numbers', () => {
  it('measures every phase from the start rather than from the last one', () => {
    expect(PROJECT_BUDGETS.audit).toBeLessThan(PROJECT_BUDGETS.staging);
    expect(PROJECT_BUDGETS.staging).toBeLessThan(PROJECT_BUDGETS.cutover);
    expect(PROJECT_BUDGETS.cutover).toBeLessThan(PROJECT_BUDGETS.handover);
  });
});
