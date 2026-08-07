/**
 * The determinism harness.
 *
 * It began as a dual-engine gate - the Rust core beside the TypeScript engine
 * it replaced, step for step - and the TypeScript engine is gone. What is left
 * is SELF-consistency, and it is worth being honest about the difference: two
 * `WasmEngine` instances are the same implementation run twice, so agreeing
 * proves the engine carries no hidden state between instances and no
 * dependence on time, iteration order or allocation - not that two independent
 * implementations agree. The real cross-check is the golden hash, which was
 * measured on the retired engine and has to keep coming out of this one.
 *
 * So: the golden hash, log replay including its refusals, and the whole
 * shipped world driven twice. Same script, same refusals, same events, same
 * hash, or the day is not replayable and nothing else here can be trusted.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  type DispatchResult,
  type EngineApi,
  type EngineEvent,
  type Expr,
  type FieldValue,
  type SetupOp,
  WasmEngine,
} from '../engine-api';
import {
  DAY_ACTIONS,
  helpdeskActionPayload,
  HELPDESK_ACTIONS,
  HELPDESK_TIER,
  KIND_LABELS,
} from '../world/actions';
import { companySetup, COMPANY_IDS } from '../world/company';
import { BODGE_TICKETS } from '../world/tickets/bodge';
import { CORPORATE_TICKETS } from '../world/tickets/corporate';
import { MSP_TICKETS } from '../world/tickets/msp';
import { DEMO_ACTION_DATA, DEMO_ACTIONS, WORLD_IDS } from '../world/demo-world';
import { FIELDS } from '../world/fields';
import { WORLD_TICKETS } from '../world/tickets';

/**
 * The probation shop's tickets only (0.6.0 slice 3, 0.8.0). Parity stands up the
 * probation estate (`companySetup`), and the shared roster now also carries
 * Bodgeworth's and the MSP's tickets, which name a different estate's nodes -
 * registering one here would fail for a reporter this world does not have. The
 * engine-parity claim is about the engine, and the probation roster exercises it
 * fully.
 */
const OTHER_EMPLOYER_TICKET_IDS = new Set(
  [...BODGE_TICKETS, ...MSP_TICKETS, ...CORPORATE_TICKETS]
    .map((entry) => entry.def.id),
);
const PROBATION_TICKETS = WORLD_TICKETS.filter(
  (entry) => !OTHER_EMPLOYER_TICKET_IDS.has(entry.def.id),
);
import {
  GOLDEN_ACTION_DATA,
  GOLDEN_ACTOR,
  GOLDEN_SCENARIO_HASH,
  GOLDEN_SCRIPT,
  GOLDEN_SEED,
  GOLDEN_SETUP,
  type ScriptStep,
} from './golden-fixture';

const SEED = 0x5eed_1c01;
const ACTOR = COMPANY_IDS.player;
/**
 * A `ticket` node with no record behind it. Seeded into both worlds because
 * the refusal it produces is the one that used to be a crash.
 */
const ORPHAN_TICKET = 'ticket:orphan';

const ORPHAN_SETUP: readonly SetupOp[] = [
  {
    op: 'addNode',
    node: {
      id: ORPHAN_TICKET,
      kind: 'ticket',
      fields: {
        state: 'open',
        spawned_at: 0,
        sla_deadline: 600,
        breached: false,
        question_asked: true,
      },
    },
  },
];

interface Step {
  readonly label: string;
  readonly advance?: number;
  readonly id: string;
  readonly target: string | null;
  readonly params?: Record<string, FieldValue>;
}

interface Frame {
  readonly label: string;
  readonly result: DispatchResult;
  readonly hash: string;
  readonly tick: number;
  readonly events: readonly EngineEvent[];
}

interface Harness {
  readonly engine: EngineApi;
  readonly events: EngineEvent[];
}

function collect(engine: EngineApi): Harness {
  const events: EngineEvent[] = [];
  engine.onEvent((event) => {
    events.push(event);
  });
  return { engine, events };
}

/* -- the shipped world, on each engine ----------------------------------- */

function wasmWorld(): Harness {
  const engine = new WasmEngine(SEED);
  const harness = collect(engine);

  engine.setTier(HELPDESK_TIER);
  engine.applySetup(companySetup());
  engine.applySetup(ORPHAN_SETUP);
  engine.registerActions({
    kind_labels: KIND_LABELS,
    actions: DEMO_ACTION_DATA,
  });
  engine.registerActions(helpdeskActionPayload());

  for (const entry of PROBATION_TICKETS) {
    engine.registerTicket(entry.def);
  }

  return harness;
}

function goldenWasm(seed: number = GOLDEN_SEED): Harness {
  const engine = new WasmEngine(seed);
  const harness = collect(engine);

  engine.applySetup(GOLDEN_SETUP);
  engine.registerActions({ actions: GOLDEN_ACTION_DATA });
  return harness;
}

function drive(harness: Harness, steps: readonly Step[], actor: string): Frame[] {
  const frames: Frame[] = [];

  for (const step of steps) {
    if (step.advance !== undefined) {
      harness.engine.advance(step.advance);
    }

    harness.events.length = 0;
    const result = harness.engine.dispatch(
      step.id,
      actor,
      step.target,
      step.params ?? {},
    );

    frames.push({
      label: step.label,
      result,
      hash: harness.engine.snapshotHash(),
      tick: harness.engine.now(),
      events: [...harness.events],
    });
  }

  return frames;
}

/* -- the script: every verb, accepted and refused ------------------------ */

const SCRIPT: readonly Step[] = [
  { label: 'unknown action', id: 'nothing.at.all', target: null },
  {
    label: 'unlock without a target',
    id: HELPDESK_ACTIONS.accountUnlock,
    target: null,
  },
  {
    label: 'unlock a node that does not exist',
    id: HELPDESK_ACTIONS.accountUnlock,
    target: 'account:nobody',
  },
  {
    label: 'unlock the wrong kind',
    id: HELPDESK_ACTIONS.accountUnlock,
    target: COMPANY_IDS.playerMachine,
  },
  {
    label: 'unlock an account that is not locked',
    id: HELPDESK_ACTIONS.accountUnlock,
    target: COMPANY_IDS.adaAccount,
  },
  {
    label: 'unlock the locked payroll account',
    id: HELPDESK_ACTIONS.accountUnlock,
    target: COMPANY_IDS.garyAccount,
  },
  {
    label: 'unlock it twice',
    id: HELPDESK_ACTIONS.accountUnlock,
    target: COMPANY_IDS.garyAccount,
  },
  {
    label: 'reset a password',
    advance: 4,
    id: HELPDESK_ACTIONS.accountResetPassword,
    target: COMPANY_IDS.garyAccount,
  },
  {
    label: 'add to a group with no group named',
    id: HELPDESK_ACTIONS.accountAddToGroup,
    target: COMPANY_IDS.garyAccount,
  },
  {
    label: 'add to a group that is not a group',
    id: HELPDESK_ACTIONS.accountAddToGroup,
    target: COMPANY_IDS.garyAccount,
    params: { group: COMPANY_IDS.commonShare },
  },
  {
    label: 'add to a group that does not exist',
    id: HELPDESK_ACTIONS.accountAddToGroup,
    target: COMPANY_IDS.garyAccount,
    params: { group: 'group:nowhere' },
  },
  {
    label: 'add to the vpn group',
    id: HELPDESK_ACTIONS.accountAddToGroup,
    target: COMPANY_IDS.garyAccount,
    params: { group: COMPANY_IDS.vpnUsers },
  },
  {
    label: 'add to it again',
    id: HELPDESK_ACTIONS.accountAddToGroup,
    target: COMPANY_IDS.garyAccount,
    params: { group: COMPANY_IDS.vpnUsers },
  },
  {
    label: 'remove from a group they are not in',
    id: HELPDESK_ACTIONS.accountRemoveFromGroup,
    target: COMPANY_IDS.bevAccount,
    params: { group: COMPANY_IDS.vpnUsers },
  },
  {
    label: 'remove from the vpn group',
    id: HELPDESK_ACTIONS.accountRemoveFromGroup,
    target: COMPANY_IDS.garyAccount,
    params: { group: COMPANY_IDS.vpnUsers },
  },
  {
    label: 'restart a healthy service',
    id: HELPDESK_ACTIONS.serviceRestart,
    target: COMPANY_IDS.vpn,
  },
  {
    label: 'restart the fan, which is not software',
    id: HELPDESK_ACTIONS.serviceRestart,
    target: COMPANY_IDS.fan,
  },
  {
    label: 'restart the spooler in front of the backlog that jammed it',
    id: HELPDESK_ACTIONS.serviceRestart,
    target: COMPANY_IDS.spooler,
  },
  {
    label: 'rotate a screen to an impossible angle',
    id: HELPDESK_ACTIONS.machineSetDisplayRotation,
    target: COMPANY_IDS.adaMachine,
    params: { rotation: 45 },
  },
  {
    label: 'rotate a screen to the angle it already has',
    id: HELPDESK_ACTIONS.machineSetDisplayRotation,
    target: COMPANY_IDS.adaMachine,
    params: { rotation: 0 },
  },
  {
    label: 'rotate a screen',
    id: HELPDESK_ACTIONS.machineSetDisplayRotation,
    target: COMPANY_IDS.adaMachine,
    params: { rotation: 180 },
  },
  {
    label: 'reboot something that is not a workstation',
    id: HELPDESK_ACTIONS.machineReboot,
    target: COMPANY_IDS.printer,
  },
  {
    label: 'reboot a workstation',
    advance: 3,
    id: HELPDESK_ACTIONS.machineReboot,
    target: COMPANY_IDS.garyMachine,
  },
  {
    label: 'power cycle a device that is behaving',
    id: HELPDESK_ACTIONS.devicePowerCycle,
    target: COMPANY_IDS.monitor,
  },
  {
    label: 'replace batteries in a mains device',
    id: HELPDESK_ACTIONS.deviceReplaceBattery,
    target: COMPANY_IDS.printer,
  },
  {
    label: 'replace batteries in the flat mouse',
    id: HELPDESK_ACTIONS.deviceReplaceBattery,
    target: COMPANY_IDS.adaMouse,
  },
  {
    label: 'replace fresh batteries',
    id: HELPDESK_ACTIONS.deviceReplaceBattery,
    target: COMPANY_IDS.adaMouse,
  },
  {
    label: 'clear the queue on something with no queue',
    id: HELPDESK_ACTIONS.printerClearQueue,
    target: COMPANY_IDS.monitor,
  },
  {
    label: 'clear the backlog',
    id: HELPDESK_ACTIONS.printerClearQueue,
    target: COMPANY_IDS.printer,
  },
  {
    label: 'clear an empty queue',
    id: HELPDESK_ACTIONS.printerClearQueue,
    target: COMPANY_IDS.printer,
  },
  {
    label: 'restart the spooler now the queue is empty',
    id: HELPDESK_ACTIONS.serviceRestart,
    target: COMPANY_IDS.spooler,
  },
  {
    label: 'grant access with no account named',
    id: HELPDESK_ACTIONS.shareGrantAccess,
    target: COMPANY_IDS.commonShare,
  },
  {
    label: 'grant access to the share',
    id: HELPDESK_ACTIONS.shareGrantAccess,
    target: COMPANY_IDS.commonShare,
    params: { account: COMPANY_IDS.garyAccount },
  },
  {
    label: 'grant it again',
    id: HELPDESK_ACTIONS.shareGrantAccess,
    target: COMPANY_IDS.commonShare,
    params: { account: COMPANY_IDS.garyAccount },
  },
  {
    label: 'park an untracked ticket',
    id: HELPDESK_ACTIONS.ticketSetWaiting,
    target: ORPHAN_TICKET,
  },
  {
    label: 'un-park an untracked ticket',
    id: HELPDESK_ACTIONS.ticketClearWaiting,
    target: ORPHAN_TICKET,
  },
  {
    label: 'stop the clock on an untracked ticket',
    id: HELPDESK_ACTIONS.ticketRecordResponse,
    target: ORPHAN_TICKET,
  },
  {
    label: 'park a ticket nobody has asked anything',
    id: HELPDESK_ACTIONS.ticketSetWaiting,
    target: 'ticket:locked-account',
  },
  {
    label: 'ask the reporter something',
    id: HELPDESK_ACTIONS.ticketAddComment,
    target: 'ticket:locked-account',
    params: { comment: 'What does the message on your screen say?' },
  },
  {
    label: 'ask the same thing again',
    id: HELPDESK_ACTIONS.ticketAddComment,
    target: 'ticket:locked-account',
    params: { comment: 'What does the message on your screen say?' },
  },
  {
    label: 'triage it as a cell nobody could arrive at',
    id: HELPDESK_ACTIONS.ticketClassify,
    target: 'ticket:locked-account',
    params: { impact: 1, urgency: 1, priority: 1 },
  },
  {
    label: 'triage it properly',
    id: HELPDESK_ACTIONS.ticketClassify,
    target: 'ticket:locked-account',
    params: { impact: 1, urgency: 3, priority: 3 },
  },
  {
    label: 'park the ticket',
    id: HELPDESK_ACTIONS.ticketSetWaiting,
    target: 'ticket:locked-account',
  },
  {
    label: 'park it twice',
    id: HELPDESK_ACTIONS.ticketSetWaiting,
    target: 'ticket:locked-account',
  },
  {
    label: 'let the parked clock run',
    advance: 5,
    id: HELPDESK_ACTIONS.ticketClearWaiting,
    target: 'ticket:locked-account',
  },
  {
    label: 'un-park it twice',
    id: HELPDESK_ACTIONS.ticketClearWaiting,
    target: 'ticket:locked-account',
  },
  {
    label: 'write a work note with no words in it',
    id: HELPDESK_ACTIONS.ticketAddWorknote,
    target: 'ticket:locked-account',
    params: { note: '   ' },
  },
  {
    label: 'write a work note',
    id: HELPDESK_ACTIONS.ticketAddWorknote,
    target: 'ticket:locked-account',
    params: { note: '  He was at the desk on Friday.  ' },
  },
  {
    label: 'write a second work note',
    id: HELPDESK_ACTIONS.ticketAddWorknote,
    target: 'ticket:locked-account',
    params: { note: 'And he typed it wrong three times.' },
  },
  {
    label: 'write the first work note again',
    id: HELPDESK_ACTIONS.ticketAddWorknote,
    target: 'ticket:locked-account',
    params: { note: 'He was at the desk on Friday.' },
  },
  {
    label: 'escalate something fixable from the desk',
    id: HELPDESK_ACTIONS.ticketEscalate,
    target: 'ticket:locked-account',
    params: { reported: 'He cannot log in.', tried: 'Unlocked the account' },
  },
  {
    label: 'run the diagnostics demo verb',
    advance: 2,
    id: DEMO_ACTIONS.diagnostics,
    target: null,
  },
  {
    label: 'reseat a fan that spins freely',
    id: DEMO_ACTIONS.reseatFan,
    target: null,
  },
  {
    label: 'escalate the hardware ticket on a thin handoff',
    id: HELPDESK_ACTIONS.ticketEscalate,
    target: WORLD_IDS.ticket,
    params: { reported: 'It is broken.', tried: '' },
  },
  {
    label: 'let second line send it back',
    advance: 20,
    id: HELPDESK_ACTIONS.ticketBounceHandoff,
    target: WORLD_IDS.ticket,
  },
  {
    label: 'settle the same bounce twice',
    id: HELPDESK_ACTIONS.ticketBounceHandoff,
    target: WORLD_IDS.ticket,
  },
  {
    label: 'escalate it properly',
    id: HELPDESK_ACTIONS.ticketEscalate,
    target: WORLD_IDS.ticket,
    params: {
      reported: 'It makes a noise like a bag of spanners.',
      tried: 'Turned it off and on again',
    },
  },
  {
    label: 'escalate it again, now that it is closed',
    id: HELPDESK_ACTIONS.ticketEscalate,
    target: WORLD_IDS.ticket,
    params: { reported: 'Still broken.', tried: 'Everything' },
  },
  {
    label: 'park a closed ticket',
    id: HELPDESK_ACTIONS.ticketSetWaiting,
    target: WORLD_IDS.ticket,
  },
  {
    label: 'ask a closed ticket',
    id: HELPDESK_ACTIONS.ticketAddComment,
    target: WORLD_IDS.ticket,
    params: { comment: 'Are you still there?' },
  },
  {
    label: 'write a work note on a closed ticket',
    id: HELPDESK_ACTIONS.ticketAddWorknote,
    target: WORLD_IDS.ticket,
    params: { note: 'Too late.' },
  },
  {
    label: 'run a meter interval',
    id: DAY_ACTIONS.metersTick,
    target: null,
    params: {
      stress_up: 4,
      stress_down: 1,
      suspicion_up: 3,
      suspicion_down: 0,
      reputation_up: 2,
      reputation_down: 3,
      suspicion_events_up: 1,
      breaches_charged: 0,
      resolve_credit_paid: 2,
    },
  },
  {
    label: 'run one with a meter delta nobody could have meant',
    id: DAY_ACTIONS.metersTick,
    target: null,
    params: {
      stress_up: -4,
      stress_down: 1,
      suspicion_up: 0,
      suspicion_down: 0,
      reputation_up: 0,
      reputation_down: 0,
      suspicion_events_up: 0,
      breaches_charged: 0,
      resolve_credit_paid: 2,
    },
  },
];

/** Every advertised solution path, driven step by step. */
function pathSteps(): readonly Step[] {
  return PROBATION_TICKETS.flatMap((entry) => entry.paths.flatMap(
    (path) => path.steps.map((step, index) => ({
      label: `${entry.def.id}/${path.id}#${String(index)}`,
      id: step.action,
      target: step.target,
      ...(step.params === undefined ? {} : { params: { ...step.params } }),
    })),
  ));
}

const AMBIGUOUS: Expr = {
  op: 'eq',
  selector: { kind: 'machine', where: [{ field: FIELDS.pendingUpdates, value: true }] },
  field: FIELDS.pendingUpdates,
  value: true,
};

const UNAMBIGUOUS: Expr = {
  op: 'eq',
  selector: { kind: 'machine', where: [{ field: FIELDS.hostname, value: 'BEIGE-BOX' }] },
  field: FIELDS.pendingUpdates,
  value: false,
};

/**
 * A step the fixture refuses, appended to the golden script for the replay
 * test only: the golden hash is measured on the script above and nothing may
 * change it, and a refusal changes nothing by definition - which is exactly
 * what makes it the right thing to pin.
 */
const GOLDEN_REFUSAL: ScriptStep = {
  advance: 1,
  id: 'machine.rotate',
  target: 'service:spooler',
  params: {},
};
const GOLDEN_REFUSAL_REASON = 'Target must be machine.';

describe('the golden hash', () => {
  it('lands two fresh engines on the committed hash from one script', () => {
    const wasm = goldenWasm();
    const replica = goldenWasm();

    for (const step of GOLDEN_SCRIPT) {
      for (const harness of [wasm, replica]) {
        harness.engine.advance(step.advance);
        expect(
          harness.engine.dispatch(
            step.id,
            GOLDEN_ACTOR,
            step.target,
            step.params,
          ),
        ).toEqual({ ok: true });
      }
    }

    expect(wasm.engine.snapshotHash()).toBe(GOLDEN_SCENARIO_HASH);
    expect(replica.engine.snapshotHash()).toBe(GOLDEN_SCENARIO_HASH);
    expect(wasm.engine.dispatchLog()).toEqual(replica.engine.dispatchLog());
    expect(wasm.engine.now()).toBe(replica.engine.now());
  });

  /**
   * A replay is only worth anything if it replays the WHOLE log, and a real
   * log is mostly not a list of things that worked. The refusal is pinned
   * exactly - the sentence, the log entry, the empty event list, the unchanged
   * hash - because a replay that quietly succeeded where the session was
   * refused would diverge from that point on and the final hash would be the
   * only thing that noticed.
   */
  it('replays a captured log, refusals included, into the same hash', () => {
    const source = goldenWasm();
    const script = [...GOLDEN_SCRIPT, GOLDEN_REFUSAL];

    for (const step of script) {
      source.engine.advance(step.advance);
      source.engine.dispatch(step.id, GOLDEN_ACTOR, step.target, step.params);
    }

    // The refusal is in the log, and it did not touch the world.
    expect(source.engine.snapshotHash()).toBe(GOLDEN_SCENARIO_HASH);

    const captured = source.engine.dispatchLog();
    const refused = captured.filter((entry) => !entry.ok);

    expect(refused).toEqual([
      {
        tick: source.engine.now(),
        id: GOLDEN_REFUSAL.id,
        actor: GOLDEN_ACTOR,
        target: GOLDEN_REFUSAL.target,
        params: {},
        ok: false,
        reason: GOLDEN_REFUSAL_REASON,
      },
    ]);

    const replay = goldenWasm();

    for (const entry of captured) {
      replay.engine.advance(entry.tick - replay.engine.now());
      replay.events.length = 0;
      const result = replay.engine.dispatch(
        entry.id,
        entry.actor,
        entry.target,
        entry.params,
      );

      expect(result.ok, entry.id).toBe(entry.ok);

      if (!entry.ok) {
        expect(result).toEqual({ ok: false, reason: entry.reason });
        expect(replay.events, 'a refusal announced something').toEqual([]);
      }
    }

    expect(replay.engine.snapshotHash()).toBe(source.engine.snapshotHash());
    expect(replay.engine.dispatchLog()).toEqual(captured);
  });

  /**
   * The seeds at the ends of the generator's range, and the floats at the ends
   * of a field's. Both are places where a boundary that coerces instead of
   * refusing produces a world that is almost the one asked for.
   */
  it('runs the fixture on the extreme seeds and the extreme numbers', () => {
    for (const seed of [0, 0xffff_ffff]) {
      const first = goldenWasm(seed);
      const second = goldenWasm(seed);

      for (const step of GOLDEN_SCRIPT) {
        for (const harness of [first, second]) {
          harness.engine.advance(step.advance);
          expect(
            harness.engine.dispatch(
              step.id,
              GOLDEN_ACTOR,
              step.target,
              step.params,
            ),
            `seed ${String(seed)}`,
          ).toEqual({ ok: true });
        }
      }

      expect(first.engine.snapshotHash()).toBe(second.engine.snapshotHash());
      expect(first.engine.dispatchLog()).toEqual(second.engine.dispatchLog());
      // A different seed is a different day. If it were not, the seed would be
      // decorative and the golden hash would prove nothing about the rng.
      expect(first.engine.snapshotHash()).not.toBe(GOLDEN_SCENARIO_HASH);
    }

    const extremes: readonly FieldValue[] = [
      Number.MIN_VALUE,
      -Number.MIN_VALUE,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      Number.MAX_SAFE_INTEGER,
      Number.EPSILON,
      0,
      -0,
    ];
    const first = goldenWasm();
    const second = goldenWasm();

    for (const value of extremes) {
      for (const harness of [first, second]) {
        expect(
          harness.engine.dispatch('field.set', GOLDEN_ACTOR, 'share:common', {
            field: 'quota_gb',
            value,
          }),
          String(value),
        ).toEqual({ ok: true });
      }

      // The number that came back is the number that went in, digit for digit,
      // on both engines - which is what the hash is made of.
      expect(first.engine.graph.getField('share:common', 'quota_gb'))
        .toBe(second.engine.graph.getField('share:common', 'quota_gb'));
      expect(first.engine.snapshotHash()).toBe(second.engine.snapshotHash());
    }

    // Negative zero is the one extreme JSON cannot carry: `JSON.stringify(-0)`
    // is `"0"`, so it reaches the engine as a positive zero. That is a
    // property of the wire, not a coercion the boundary chose, and both
    // engines see the same thing - which is all determinism asks. The engine's
    // own `Object.is` comparison still distinguishes the two internally.
    expect(Object.is(
      first.engine.graph.getField('share:common', 'quota_gb'),
      0,
    )).toBe(true);
  });
});

describe('determinism over the shipped world', () => {
  let wasm: Harness;
  let replica: Harness;

  beforeEach(() => {
    wasm = wasmWorld();
    replica = wasmWorld();
  });

  it('starts from the same world every time', () => {
    expect(wasm.engine.snapshotHash()).toBe(replica.engine.snapshotHash());
    expect(wasm.events).toEqual(replica.events);
  });

  it('agrees with itself on every verb, accepted and refused', () => {
    const steps = SCRIPT;
    const wasmFrames = drive(wasm, steps, ACTOR);
    const replicaFrames = drive(replica, steps, ACTOR);

    expect(steps.length).toBeGreaterThan(50);

    for (const [index, frame] of wasmFrames.entries()) {
      const other = replicaFrames[index];
      expect(other, frame.label).toBeDefined();
      expect(frame.result, frame.label).toEqual(other?.result);
      expect(frame.hash, frame.label).toBe(other?.hash);
      expect(frame.tick, frame.label).toBe(other?.tick);
      expect(frame.events, frame.label).toEqual(other?.events);
    }

    expect(wasm.engine.dispatchLog()).toEqual(replica.engine.dispatchLog());
  });

  it('agrees on every advertised solution path', () => {
    const steps = pathSteps();
    const wasmFrames = drive(wasm, steps, ACTOR);
    const replicaFrames = drive(replica, steps, ACTOR);

    expect(steps.length).toBeGreaterThan(5);

    for (const [index, frame] of wasmFrames.entries()) {
      expect(frame.result, frame.label).toEqual(replicaFrames[index]?.result);
      expect(frame.hash, frame.label).toBe(replicaFrames[index]?.hash);
      expect(frame.events, frame.label).toEqual(replicaFrames[index]?.events);
    }
  });

  it('agrees while the clock runs the queue into breach', () => {
    for (let elapsed = 0; elapsed < 8; elapsed += 1) {
      wasm.events.length = 0;
      replica.events.length = 0;
      wasm.engine.advance(60);
      replica.engine.advance(60);

      expect(wasm.engine.snapshotHash()).toBe(replica.engine.snapshotHash());
      expect(wasm.events).toEqual(replica.events);
      expect(wasm.engine.now()).toBe(replica.engine.now());
    }

    for (const entry of PROBATION_TICKETS) {
      expect(wasm.engine.ticketState(entry.def.id))
        .toBe(replica.engine.ticketState(entry.def.id));
      expect(wasm.engine.wasTicketBreached(entry.def.id))
        .toBe(replica.engine.wasTicketBreached(entry.def.id));
    }
  });

  /**
   * Cause before consequence. The dual-engine harness caught the retired bus
   * delivering a mutation to later subscribers only AFTER the ticket engine
   * had reacted to it - the resolution arriving before the change that caused
   * it. An app that repaints from the world on `ticket:resolved` would have
   * read a world that had not been told yet.
   */
  it('reports a mutation before the ticket events it causes', () => {
    wasm.events.length = 0;
    expect(
      wasm.engine.dispatch(
        HELPDESK_ACTIONS.accountUnlock,
        ACTOR,
        COMPANY_IDS.garyAccount,
        {},
      ),
    ).toEqual({ ok: true });

    const types = wasm.events.map((event) => event.type);
    // The unlock makes several changes - the lock itself, the timestamp it
    // clears, the bad-password count it zeroes - and every one of them is in
    // the world before the ticket reacts to any of them. (What comes after is
    // the machine writing the unlock into its own event log, which is a
    // consequence of the consequence and belongs where it lands.)
    expect(types.filter((type) => type === 'ticket:resolved')).toHaveLength(1);
    const resolvedAt = types.indexOf('ticket:resolved');
    expect(resolvedAt).toBeGreaterThan(0);
    expect(types.slice(0, resolvedAt).every((type) => type === 'graph:mutated'))
      .toBe(true);

    const [cause] = wasm.events;
    expect(cause).toEqual({
      type: 'graph:mutated',
      mutation: {
        type: 'field:set',
        id: COMPANY_IDS.garyAccount,
        field: FIELDS.locked,
        previous: true,
        value: false,
      },
    });
  });

  it('gates by tier and leaves the world untouched when it refuses', () => {
    wasm.engine.setTier(0);
    replica.engine.setTier(0);

    const before = wasm.engine.snapshotHash();
    const wasmRefusal = wasm.engine.dispatch(
      HELPDESK_ACTIONS.accountUnlock,
      ACTOR,
      COMPANY_IDS.garyAccount,
      {},
    );
    const replicaRefusal = replica.engine.dispatch(
      HELPDESK_ACTIONS.accountUnlock,
      ACTOR,
      COMPANY_IDS.garyAccount,
      {},
    );

    expect(wasmRefusal).toEqual({
      ok: false,
      reason: `Action "${HELPDESK_ACTIONS.accountUnlock}" requires tier 1.`,
    });
    expect(wasmRefusal).toEqual(replicaRefusal);
    expect(wasm.engine.snapshotHash()).toBe(before);
    expect(replica.engine.snapshotHash()).toBe(before);
  });

  it('answers assertions the same way, ambiguous selectors included', () => {
    expect(wasm.engine.evaluate(AMBIGUOUS)).toBe(false);
    expect(replica.engine.evaluate(AMBIGUOUS)).toBe(false);
    expect(wasm.engine.evaluate(UNAMBIGUOUS)).toBe(true);
    expect(replica.engine.evaluate(UNAMBIGUOUS)).toBe(true);
  });

  it('shows the same world through the read-only view', () => {
    expect(wasm.engine.graph.allNodes()).toEqual(replica.engine.graph.allNodes());
    expect(wasm.engine.graph.nodesOfKind('ticket'))
      .toEqual(replica.engine.graph.nodesOfKind('ticket'));
    expect(wasm.engine.graph.getNode(COMPANY_IDS.garyAccount))
      .toEqual(replica.engine.graph.getNode(COMPANY_IDS.garyAccount));
    expect(wasm.engine.graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked))
      .toEqual(replica.engine.graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked));
    expect(
      wasm.engine.graph.neighbors(COMPANY_IDS.garyAccount, {
        direction: 'out',
        edgeKind: 'member_of',
      }),
    ).toEqual(
      replica.engine.graph.neighbors(COMPANY_IDS.garyAccount, {
        direction: 'out',
        edgeKind: 'member_of',
      }),
    );
  });
});
