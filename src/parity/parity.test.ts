import { beforeEach, describe, expect, it } from 'vitest';

import type { ActionDef } from '../engine/actions';
import {
  type DispatchResult,
  type EngineApi,
  type EngineEvent,
  type Expr,
  type FieldValue,
  type SetupOp,
  WasmEngine,
} from '../engine-api';
import { TsEngine } from '../engine-api/ts-engine';
import {
  helpdeskActionPayload,
  HELPDESK_ACTIONS,
  HELPDESK_TIER,
  KIND_LABELS,
} from '../world/actions';
import { companySetup, COMPANY_IDS } from '../world/company';
import { DEMO_ACTION_DATA, DEMO_ACTIONS, WORLD_IDS } from '../world/demo-world';
import { FIELDS } from '../world/fields';
import { acceptsEscalation, WORLD_TICKETS } from '../world/tickets';
import {
  GOLDEN_ACTION_DATA,
  GOLDEN_ACTOR,
  GOLDEN_SCENARIO_HASH,
  GOLDEN_SCRIPT,
  GOLDEN_SEED,
  GOLDEN_SETUP,
  goldenActionDefs,
} from './golden-fixture';
import { DEMO_ACTION_DEFS, legacyHelpdeskActions } from './legacy';

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

  for (const entry of WORLD_TICKETS) {
    engine.registerTicket(entry.def);
  }

  return harness;
}

function tsWorld(): Harness {
  const engine = new TsEngine(SEED, HELPDESK_TIER);
  const harness = collect(engine);

  engine.applySetup(companySetup());
  engine.applySetup(ORPHAN_SETUP);
  engine.registerActionDefs([
    ...DEMO_ACTION_DEFS,
    ...legacyHelpdeskActions({
      tickets: engine.ticketEngine,
      // The same rule the core reads off the ticket itself: can setting
      // `escalated` close it? Anything else would be comparing two different
      // policies rather than two implementations of one.
      allowsEscalation: (id) => {
        const entry = WORLD_TICKETS.find((ticket) => ticket.def.id === id);
        return entry !== undefined && acceptsEscalation(entry.def.resolved_when);
      },
      isRegistered: (id) => engine.isTicketRegistered(id),
    }),
  ]);

  for (const entry of WORLD_TICKETS) {
    engine.registerTicket(entry.def);
  }

  return harness;
}

function goldenWasm(): Harness {
  const engine = new WasmEngine(GOLDEN_SEED);
  const harness = collect(engine);

  engine.applySetup(GOLDEN_SETUP);
  engine.registerActions({ actions: GOLDEN_ACTION_DATA });
  return harness;
}

function goldenTs(): Harness {
  const engine = new TsEngine(GOLDEN_SEED);
  const harness = collect(engine);

  engine.applySetup(GOLDEN_SETUP);
  engine.registerActionDefs(goldenActionDefs() as readonly ActionDef[]);
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
    label: 'set a resolution that is not one',
    id: HELPDESK_ACTIONS.machineSetResolution,
    target: COMPANY_IDS.adaMachine,
    params: { resolution: 'as big as possible' },
  },
  {
    label: 'set the resolution it already runs at',
    id: HELPDESK_ACTIONS.machineSetResolution,
    target: COMPANY_IDS.adaMachine,
    params: { resolution: '1024x768' },
  },
  {
    label: 'set a resolution',
    id: HELPDESK_ACTIONS.machineSetResolution,
    target: COMPANY_IDS.adaMachine,
    params: { resolution: '800x600' },
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
    label: 'mark an untracked ticket asked',
    id: HELPDESK_ACTIONS.ticketMarkAsked,
    target: ORPHAN_TICKET,
  },
  {
    label: 'park a ticket nobody has asked anything',
    id: HELPDESK_ACTIONS.ticketSetWaiting,
    target: 'ticket:locked-account',
  },
  {
    label: 'ask the reporter something',
    id: HELPDESK_ACTIONS.ticketMarkAsked,
    target: 'ticket:locked-account',
  },
  {
    label: 'ask again, which changes nothing',
    id: HELPDESK_ACTIONS.ticketMarkAsked,
    target: 'ticket:locked-account',
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
    label: 'write a clue with no words in it',
    id: HELPDESK_ACTIONS.ticketAddClue,
    target: 'ticket:locked-account',
    params: { clue: '   ' },
  },
  {
    label: 'write a clue',
    id: HELPDESK_ACTIONS.ticketAddClue,
    target: 'ticket:locked-account',
    params: { clue: '  He was at the desk on Friday.  ' },
  },
  {
    label: 'write a second clue',
    id: HELPDESK_ACTIONS.ticketAddClue,
    target: 'ticket:locked-account',
    params: { clue: 'And he typed it wrong three times.' },
  },
  {
    label: 'write the first clue again',
    id: HELPDESK_ACTIONS.ticketAddClue,
    target: 'ticket:locked-account',
    params: { clue: 'He was at the desk on Friday.' },
  },
  {
    label: 'escalate something fixable from the desk',
    id: HELPDESK_ACTIONS.ticketEscalate,
    target: 'ticket:locked-account',
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
    label: 'escalate the hardware ticket',
    id: HELPDESK_ACTIONS.ticketEscalate,
    target: WORLD_IDS.ticket,
  },
  {
    label: 'escalate it again, now that it is closed',
    id: HELPDESK_ACTIONS.ticketEscalate,
    target: WORLD_IDS.ticket,
  },
  {
    label: 'park a closed ticket',
    id: HELPDESK_ACTIONS.ticketSetWaiting,
    target: WORLD_IDS.ticket,
  },
  {
    label: 'ask a closed ticket',
    id: HELPDESK_ACTIONS.ticketMarkAsked,
    target: WORLD_IDS.ticket,
  },
  {
    label: 'write a clue on a closed ticket',
    id: HELPDESK_ACTIONS.ticketAddClue,
    target: WORLD_IDS.ticket,
    params: { clue: 'Too late.' },
  },
  {
    label: 'delete something that is not a mail rule',
    id: HELPDESK_ACTIONS.mailRuleDelete,
    target: COMPANY_IDS.garyAccount,
  },
  {
    label: 'delete the mail rule',
    id: HELPDESK_ACTIONS.mailRuleDelete,
    target: COMPANY_IDS.garyMailRule,
  },
];

/** Every advertised solution path, driven step by step. */
function pathSteps(): readonly Step[] {
  return WORLD_TICKETS.flatMap((entry) => entry.paths.flatMap(
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

describe('golden hash parity', () => {
  it('lands both engines on the committed hash from the same script', () => {
    const wasm = goldenWasm();
    const ts = goldenTs();

    for (const step of GOLDEN_SCRIPT) {
      for (const harness of [wasm, ts]) {
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
    expect(ts.engine.snapshotHash()).toBe(GOLDEN_SCENARIO_HASH);
    expect(wasm.engine.dispatchLog()).toEqual(ts.engine.dispatchLog());
    expect(wasm.engine.now()).toBe(ts.engine.now());
  });

  it('replays a captured log into the same hash on the core', () => {
    const source = goldenWasm();

    for (const step of GOLDEN_SCRIPT) {
      source.engine.advance(step.advance);
      source.engine.dispatch(step.id, GOLDEN_ACTOR, step.target, step.params);
    }

    const replay = goldenWasm();

    for (const entry of source.engine.dispatchLog()) {
      replay.engine.advance(entry.tick - replay.engine.now());
      const result = replay.engine.dispatch(
        entry.id,
        entry.actor,
        entry.target,
        entry.params,
      );
      expect(result.ok).toBe(entry.ok);
    }

    expect(replay.engine.snapshotHash()).toBe(source.engine.snapshotHash());
    expect(replay.engine.dispatchLog()).toEqual(source.engine.dispatchLog());
  });
});

describe('dual-engine parity over the shipped world', () => {
  let wasm: Harness;
  let ts: Harness;

  beforeEach(() => {
    wasm = wasmWorld();
    ts = tsWorld();
  });

  it('starts from the same world', () => {
    expect(wasm.engine.snapshotHash()).toBe(ts.engine.snapshotHash());
    expect(wasm.events).toEqual(ts.events);
  });

  it('agrees on every verb, accepted and refused, step for step', () => {
    const steps = SCRIPT;
    const wasmFrames = drive(wasm, steps, ACTOR);
    const tsFrames = drive(ts, steps, ACTOR);

    expect(steps.length).toBeGreaterThan(50);

    for (const [index, frame] of wasmFrames.entries()) {
      const other = tsFrames[index];
      expect(other, frame.label).toBeDefined();
      expect(frame.result, frame.label).toEqual(other?.result);
      expect(frame.hash, frame.label).toBe(other?.hash);
      expect(frame.tick, frame.label).toBe(other?.tick);
      expect(frame.events, frame.label).toEqual(other?.events);
    }

    expect(wasm.engine.dispatchLog()).toEqual(ts.engine.dispatchLog());
  });

  it('agrees on every advertised solution path', () => {
    const steps = pathSteps();
    const wasmFrames = drive(wasm, steps, ACTOR);
    const tsFrames = drive(ts, steps, ACTOR);

    expect(steps.length).toBeGreaterThan(5);

    for (const [index, frame] of wasmFrames.entries()) {
      expect(frame.result, frame.label).toEqual(tsFrames[index]?.result);
      expect(frame.hash, frame.label).toBe(tsFrames[index]?.hash);
      expect(frame.events, frame.label).toEqual(tsFrames[index]?.events);
    }
  });

  it('agrees while the clock runs the queue into breach', () => {
    for (let elapsed = 0; elapsed < 8; elapsed += 1) {
      wasm.events.length = 0;
      ts.events.length = 0;
      wasm.engine.advance(60);
      ts.engine.advance(60);

      expect(wasm.engine.snapshotHash()).toBe(ts.engine.snapshotHash());
      expect(wasm.events).toEqual(ts.events);
      expect(wasm.engine.now()).toBe(ts.engine.now());
    }

    for (const entry of WORLD_TICKETS) {
      expect(wasm.engine.ticketState(entry.def.id))
        .toBe(ts.engine.ticketState(entry.def.id));
      expect(wasm.engine.wasTicketBreached(entry.def.id))
        .toBe(ts.engine.wasTicketBreached(entry.def.id));
    }
  });

  it('agrees on tier gating and leaves the world untouched when it refuses', () => {
    wasm.engine.setTier(0);
    ts.engine.setTier(0);

    const before = wasm.engine.snapshotHash();
    const wasmRefusal = wasm.engine.dispatch(
      HELPDESK_ACTIONS.accountUnlock,
      ACTOR,
      COMPANY_IDS.garyAccount,
      {},
    );
    const tsRefusal = ts.engine.dispatch(
      HELPDESK_ACTIONS.accountUnlock,
      ACTOR,
      COMPANY_IDS.garyAccount,
      {},
    );

    expect(wasmRefusal).toEqual({
      ok: false,
      reason: `Action "${HELPDESK_ACTIONS.accountUnlock}" requires tier 1.`,
    });
    expect(wasmRefusal).toEqual(tsRefusal);
    expect(wasm.engine.snapshotHash()).toBe(before);
    expect(ts.engine.snapshotHash()).toBe(before);
  });

  it('agrees on assertion evaluation, ambiguous selectors included', () => {
    expect(wasm.engine.evaluate(AMBIGUOUS)).toBe(false);
    expect(ts.engine.evaluate(AMBIGUOUS)).toBe(false);
    expect(wasm.engine.evaluate(UNAMBIGUOUS)).toBe(true);
    expect(ts.engine.evaluate(UNAMBIGUOUS)).toBe(true);
  });

  it('agrees on what the read-only view shows', () => {
    expect(wasm.engine.graph.allNodes()).toEqual(ts.engine.graph.allNodes());
    expect(wasm.engine.graph.nodesOfKind('ticket'))
      .toEqual(ts.engine.graph.nodesOfKind('ticket'));
    expect(wasm.engine.graph.getNode(COMPANY_IDS.garyAccount))
      .toEqual(ts.engine.graph.getNode(COMPANY_IDS.garyAccount));
    expect(wasm.engine.graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked))
      .toEqual(ts.engine.graph.getField(COMPANY_IDS.garyAccount, FIELDS.locked));
    expect(
      wasm.engine.graph.neighbors(COMPANY_IDS.garyAccount, {
        direction: 'out',
        edgeKind: 'member_of',
      }),
    ).toEqual(
      ts.engine.graph.neighbors(COMPANY_IDS.garyAccount, {
        direction: 'out',
        edgeKind: 'member_of',
      }),
    );
  });
});
