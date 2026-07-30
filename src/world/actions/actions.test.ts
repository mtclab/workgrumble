import { beforeEach, describe, expect, it } from 'vitest';

import type {
  DispatchResult,
  Edge,
  EngineEvent,
  Expr,
  FieldValue,
  GraphNode,
  SetupOp,
  TicketDef,
} from '../../engine-api';
import { WasmEngine } from '../../engine-api';
import { FIELDS } from '../fields';
import { HELPDESK_ACTION_IDS, HELPDESK_ACTIONS } from './ids';
import { clueLines, helpdeskActionPayload } from './index';

const ACTOR = 'person:tech';
const ESCALATABLE_TICKET = 'ticket:hardware';
/** Escalation is necessary but not sufficient: it stays open after the call. */
const TWO_STEP_TICKET = 'ticket:hardware-two-step';
const PLAIN_TICKET = 'ticket:plain';
/**
 * A ticket node in the graph that the engine knows nothing about. Perfectly
 * valid content, and the engine throws if asked about it - so every action
 * that reaches for a ticket record has to refuse it in words.
 */
const ORPHAN_TICKET = 'ticket:orphan';

/** Never satisfied by anything in this file: keeps a fixture ticket open. */
const NEVER: Expr = {
  op: 'eq',
  selector: { id: 'share:common' },
  field: FIELDS.path,
  value: '/nowhere',
};

function escalatedExpr(ticketId: string): Expr {
  return {
    op: 'eq',
    selector: { id: ticketId },
    field: FIELDS.escalated,
    value: true,
  };
}

const FIXTURE_TICKETS: readonly { id: string; resolvedWhen: Expr }[] = [
  { id: PLAIN_TICKET, resolvedWhen: NEVER },
  {
    id: ESCALATABLE_TICKET,
    resolvedWhen: {
      op: 'or',
      exprs: [escalatedExpr(ESCALATABLE_TICKET), NEVER],
    },
  },
  {
    id: TWO_STEP_TICKET,
    resolvedWhen: {
      op: 'and',
      exprs: [escalatedExpr(TWO_STEP_TICKET), NEVER],
    },
  },
];

function addNode(ops: SetupOp[], node: GraphNode): void {
  ops.push({ op: 'addNode', node });
}

function addEdge(ops: SetupOp[], edge: Edge): void {
  ops.push({ op: 'addEdge', edge });
}

function fixtureSetup(): readonly SetupOp[] {
  const ops: SetupOp[] = [];
  addNode(ops, {
    id: ACTOR,
    kind: 'person',
    fields: { name: 'Pat Pending' },
  });
  addNode(ops, {
    id: 'account:ada',
    kind: 'account',
    fields: { username: 'ada', locked: true, enabled: true },
  });
  addNode(ops, {
    id: 'account:gone',
    kind: 'account',
    fields: { username: 'gone', locked: true, enabled: false },
  });
  addNode(ops, {
    id: 'group:print-users',
    kind: 'group',
    fields: { name: 'Print Users' },
  });
  addNode(ops, {
    id: 'group:vpn-users',
    kind: 'group',
    fields: { name: 'VPN Users' },
  });
  addNode(ops, {
    id: 'machine:ada',
    kind: 'machine',
    fields: {
      hostname: 'ADA-PC',
      display_rotation: 90,
      resolution: '800x600',
      pending_updates: true,
    },
  });
  addNode(ops, {
    id: 'device:printer',
    kind: 'device',
    fields: {
      name: 'Hercules 400',
      type: 'printer',
      powered: true,
      wedged: true,
      queue_len: 12,
    },
  });
  addNode(ops, {
    id: 'device:monitor',
    kind: 'device',
    fields: { name: 'Trinitrend 15"', type: 'monitor', powered: true },
  });
  addNode(ops, {
    id: 'device:mouse',
    kind: 'device',
    fields: {
      name: 'Reception mouse',
      type: 'mouse',
      powered: false,
      battery_pct: 0,
    },
  });
  addNode(ops, {
    id: 'service:spooler',
    kind: 'service',
    fields: { name: 'Print Spooler', status: 'wedged', restartable: true },
  });
  addNode(ops, {
    id: 'service:vpn',
    kind: 'service',
    fields: { name: 'VPN Concentrator', status: 'running', restartable: true },
  });
  // Hardware that reports a status. It looks exactly like a service in the
  // graph, which is the whole reason the truth has to be written down.
  addNode(ops, {
    id: 'service:fan',
    kind: 'service',
    fields: { name: 'Chassis fan', status: 'wedged', restartable: false },
  });
  addNode(ops, {
    id: 'share:common',
    kind: 'share',
    fields: { name: 'Common', path: '\\\\WORKGRUMBLE\\common' },
  });
  addNode(ops, {
    id: 'mail_rule:autofile',
    kind: 'mail_rule',
    fields: {
      name: 'File everything from the boss',
      enabled: true,
      target: 'Deleted Items',
    },
  });
  addNode(ops, {
    id: ORPHAN_TICKET,
    kind: 'ticket',
    fields: {
      state: 'open',
      spawned_at: 0,
      sla_deadline: 600,
      breached: false,
      // Even fully "asked", it has no record behind it and no clock to stop.
      question_asked: true,
    },
  });
  addEdge(ops, {
    from: 'account:ada',
    to: 'group:print-users',
    kind: 'member_of',
  });
  // What the spooler feeds, so a restart can see the backlog it would be
  // handed straight back.
  addEdge(ops, {
    from: 'service:spooler',
    to: 'device:printer',
    kind: 'connected_to',
  });

  return ops;
}

/**
 * The fixture runs on the shipped engine with the shipped verb set: no policy
 * callbacks, no hand-wired registry. Whether an escalation is allowed is read
 * off the ticket's own resolution rule, and whether a ticket is tracked is
 * something the engine already knows - which is the whole point of the port.
 */
function createFixture(): WasmEngine {
  const engine = new WasmEngine(0x1_2345);

  engine.applySetup(fixtureSetup());
  engine.registerActions(helpdeskActionPayload());

  for (const { id, resolvedWhen } of FIXTURE_TICKETS) {
    const def: TicketDef = {
      id,
      archetype: 'hidden_cause',
      flavor: { title: `Fixture ${id}`, body: 'Fixture ticket.' },
      reporter: ACTOR,
      setup: [],
      resolved_when: resolvedWhen,
      sla_ticks: 600,
      reward: { reputation: 1, money: 1 },
      kb_ref: 'kb/fixture',
    };
    engine.registerTicket(def);
  }

  return engine;
}

let fixture: WasmEngine;
let events: EngineEvent[];

/** Everything the engine announced since the last call, and a clean slate. */
function drainEvents(): readonly EngineEvent[] {
  const drained = [...events];
  events.length = 0;
  return drained;
}

function dispatch(
  id: string,
  target: string | null,
  params: Record<string, FieldValue> = {},
): DispatchResult {
  return fixture.dispatch(id, ACTOR, target, params);
}

/** Every refusal must be readable, specific, and leave the world untouched. */
function expectRefusal(
  result: DispatchResult,
  fragment: string,
  hashBefore: string,
): void {
  expect(result.ok).toBe(false);

  if (result.ok) {
    return;
  }

  expect(result.reason).toContain(fragment);
  expect(result.reason.endsWith('.')).toBe(true);
  expect(fixture.snapshotHash()).toBe(hashBefore);
}

beforeEach(() => {
  fixture = createFixture();
  events = [];
  fixture.onEvent((event) => {
    events.push(event);
  });
});

describe('helpdesk action registry', () => {
  it('registers every advertised action exactly once', () => {
    expect(HELPDESK_ACTION_IDS).toHaveLength(18);
    expect(new Set(HELPDESK_ACTION_IDS).size).toBe(18);

    for (const id of HELPDESK_ACTION_IDS) {
      const result = dispatch(id, null, {});
      expect(result).not.toEqual({
        ok: false,
        reason: `Unknown action "${id}".`,
      });
    }
  });

  it('refuses a missing target with an instruction, not a stack trace', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, null),
      'Pick an account first',
      before,
    );
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, 'account:nobody'),
      'Nothing in the estate is called "account:nobody"',
      before,
    );
  });
});

describe('account.unlock', () => {
  it('unlocks a locked account', () => {
    expect(dispatch(HELPDESK_ACTIONS.accountUnlock, 'account:ada')).toEqual({
      ok: true,
    });
    expect(fixture.graph.getField('account:ada', FIELDS.locked)).toBe(false);
  });

  it('refuses an account that is not locked', () => {
    dispatch(HELPDESK_ACTIONS.accountUnlock, 'account:ada');
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, 'account:ada'),
      'is not locked',
      before,
    );
  });

  it('refuses a disabled account and says what is really wrong', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, 'account:gone'),
      'is disabled, not locked',
      before,
    );
  });

  it('refuses a target of the wrong kind', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, 'machine:ada'),
      'only works on an account',
      before,
    );
  });
});

describe('account.reset_password', () => {
  it('stamps the reset tick and ends the lockout', () => {
    fixture.advance(42);
    expect(
      dispatch(HELPDESK_ACTIONS.accountResetPassword, 'account:ada'),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('account:ada', FIELDS.passwordResetAt))
      .toBe(42);
    expect(fixture.graph.getField('account:ada', FIELDS.locked)).toBe(false);
  });

  it('refuses a disabled account', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountResetPassword, 'account:gone'),
      'is disabled',
      before,
    );
  });
});

describe('account.add_to_group', () => {
  it('adds the membership edge', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.accountAddToGroup, 'account:ada', {
        group: 'group:vpn-users',
      }),
    ).toEqual({ ok: true });
    expect(
      fixture.graph
        .neighbors('account:ada', { direction: 'out', edgeKind: 'member_of' })
        .map(({ id }) => id),
    ).toEqual(['group:print-users', 'group:vpn-users']);
  });

  it('refuses a membership that already exists', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountAddToGroup, 'account:ada', {
        group: 'group:print-users',
      }),
      'is already in',
      before,
    );
  });

  it('refuses a group that is not a group', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountAddToGroup, 'account:ada', {
        group: 'share:common',
      }),
      'not a group',
      before,
    );
  });
});

describe('account.remove_from_group', () => {
  it('removes an existing membership', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.accountRemoveFromGroup, 'account:ada', {
        group: 'group:print-users',
      }),
    ).toEqual({ ok: true });
    expect(
      fixture.graph.neighbors('account:ada', {
        direction: 'out',
        edgeKind: 'member_of',
      }),
    ).toEqual([]);
  });

  it('refuses a membership that was never there', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountRemoveFromGroup, 'account:ada', {
        group: 'group:vpn-users',
      }),
      'was never in',
      before,
    );
  });
});

describe('service.restart', () => {
  it('brings a wedged service back once its queue is empty', () => {
    dispatch(HELPDESK_ACTIONS.printerClearQueue, 'device:printer');
    expect(
      dispatch(HELPDESK_ACTIONS.serviceRestart, 'service:spooler'),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('service:spooler', FIELDS.status))
      .toBe('running');
  });

  /**
   * Queued jobs are files on disk and outlive a restart on purpose, so a
   * service started in front of its backlog is handed the job that jammed it.
   * Teaching the wrong order in a game about learning the job is the bug.
   */
  it('refuses to start a service back into the queue that jammed it', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.serviceRestart, 'service:spooler'),
      'It will just choke on the same job again.',
      before,
    );
    expect(fixture.graph.getField('service:spooler', FIELDS.status))
      .toBe('wedged');
  });

  /**
   * "The backlog" is a PRINTER on the other end of the wire. The guard used to
   * bind the first connected node carrying a `queue_len` at all, in id order -
   * so a reception mouse with a number on it blocked the restart, in a
   * sentence naming a device the player never touched and cannot empty.
   */
  it('reads the printer queue, not whatever else is on the wire', () => {
    // `device:mouse` sorts before `device:printer`, so it is the one the old
    // search found first.
    fixture.applySetup([
      {
        op: 'addEdge',
        edge: {
          from: 'service:spooler',
          to: 'device:mouse',
          kind: 'connected_to',
        },
      },
      {
        op: 'setField',
        id: 'device:mouse',
        field: FIELDS.queueLen,
        value: 3,
      },
    ]);
    dispatch(HELPDESK_ACTIONS.printerClearQueue, 'device:printer');

    expect(
      dispatch(HELPDESK_ACTIONS.serviceRestart, 'service:spooler'),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('service:spooler', FIELDS.status))
      .toBe('running');
    // And the mouse was left exactly as it was found.
    expect(fixture.graph.getField('device:mouse', FIELDS.queueLen)).toBe(3);
  });

  it('refuses to restart a healthy service', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.serviceRestart, 'service:vpn'),
      'is already running',
      before,
    );
  });

  /**
   * A fan is not a service. It reports a status, it can be wedged, and none
   * of that makes "off and on again" a thing you can do to it - so the action
   * refuses on the hardware truth rather than on the status.
   */
  it('refuses to restart hardware however wedged it looks', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.serviceRestart, 'service:fan'),
      'It will not help.',
      before,
    );
    expect(fixture.graph.getField('service:fan', FIELDS.status)).toBe('wedged');
  });
});

describe('machine.set_display_rotation', () => {
  it('puts a rotated screen back upright', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.machineSetDisplayRotation, 'machine:ada', {
        rotation: 0,
      }),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('machine:ada', FIELDS.displayRotation))
      .toBe(0);
  });

  it('refuses an angle no monitor stand has ever managed', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.machineSetDisplayRotation, 'machine:ada', {
        rotation: 45,
      }),
      '0, 90, 180, 270 degrees',
      before,
    );
  });

  it('refuses a rotation the screen already has', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.machineSetDisplayRotation, 'machine:ada', {
        rotation: 90,
      }),
      'is already at 90 degrees',
      before,
    );
  });
});

describe('machine.set_resolution', () => {
  it('sets a sane resolution', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.machineSetResolution, 'machine:ada', {
        resolution: '1024x768',
      }),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('machine:ada', FIELDS.resolution))
      .toBe('1024x768');
  });

  it('refuses something that is not a resolution', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.machineSetResolution, 'machine:ada', {
        resolution: 'as big as possible',
      }),
      'Resolutions look like 1024x768',
      before,
    );
  });
});

describe('machine.reboot', () => {
  it('clears pending updates and stamps the new uptime', () => {
    fixture.advance(9);
    expect(dispatch(HELPDESK_ACTIONS.machineReboot, 'machine:ada')).toEqual({
      ok: true,
    });
    expect(fixture.graph.getField('machine:ada', FIELDS.pendingUpdates))
      .toBe(false);
    expect(fixture.graph.getField('machine:ada', FIELDS.uptimeSince)).toBe(9);
  });

  it('refuses to reboot something that is not a workstation', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.machineReboot, 'device:printer'),
      'only works on a workstation',
      before,
    );
  });
});

describe('device.power_cycle', () => {
  it('powers a device back up and unwedges it', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.devicePowerCycle, 'device:printer'),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('device:printer', FIELDS.powered)).toBe(true);
    expect(fixture.graph.getField('device:printer', FIELDS.wedged)).toBe(false);
  });

  it('refuses a device that is on and behaving', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.devicePowerCycle, 'device:monitor'),
      'is on and behaving itself',
      before,
    );
  });
});

describe('device.replace_battery', () => {
  it('fills the batteries and wakes the device', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.deviceReplaceBattery, 'device:mouse'),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('device:mouse', FIELDS.batteryPct)).toBe(100);
    expect(fixture.graph.getField('device:mouse', FIELDS.powered)).toBe(true);
  });

  it('refuses a device that runs on mains power', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.deviceReplaceBattery, 'device:printer'),
      'does not take batteries',
      before,
    );
  });
});

describe('printer.clear_queue', () => {
  it('empties the backlog', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.printerClearQueue, 'device:printer'),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('device:printer', FIELDS.queueLen)).toBe(0);
  });

  it('refuses a device with no queue at all', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.printerClearQueue, 'device:monitor'),
      'is not a printer',
      before,
    );
  });

  it('refuses a queue that is already empty', () => {
    dispatch(HELPDESK_ACTIONS.printerClearQueue, 'device:printer');
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.printerClearQueue, 'device:printer'),
      'is already empty',
      before,
    );
  });
});

describe('mail_rule.delete', () => {
  it('deletes the rule', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.mailRuleDelete, 'mail_rule:autofile'),
    ).toEqual({ ok: true });
    expect(fixture.graph.getNode('mail_rule:autofile')).toBeUndefined();
  });

  it('refuses anything that is not a mail rule', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.mailRuleDelete, 'account:ada'),
      'only works on a mail rule',
      before,
    );
  });
});

describe('share.grant_access', () => {
  it('grants an account access to a share', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.shareGrantAccess, 'share:common', {
        account: 'account:ada',
      }),
    ).toEqual({ ok: true });
    expect(
      fixture.graph
        .neighbors('account:ada', { direction: 'out', edgeKind: 'has_access' })
        .map(({ id }) => id),
    ).toEqual(['share:common']);
  });

  it('refuses access that already exists', () => {
    dispatch(HELPDESK_ACTIONS.shareGrantAccess, 'share:common', {
      account: 'account:ada',
    });
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.shareGrantAccess, 'share:common', {
        account: 'account:ada',
      }),
      'can already reach',
      before,
    );
  });

  it('refuses a missing account parameter', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.shareGrantAccess, 'share:common'),
      'arrived empty',
      before,
    );
  });
});

describe('ticket waiting state', () => {
  it('parks a ticket on the user and takes it back off again', () => {
    dispatch(HELPDESK_ACTIONS.ticketMarkAsked, PLAIN_TICKET);
    expect(
      dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.ticketState(PLAIN_TICKET)).toBe('waiting_on_user');

    expect(
      dispatch(HELPDESK_ACTIONS.ticketClearWaiting, PLAIN_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.ticketState(PLAIN_TICKET)).toBe('open');
  });

  /**
   * The CYA rule, as a standing gate. Without it the waiting toggle is a
   * button that freezes every SLA in the building for free, and the whole
   * triage layer of the game stops meaning anything.
   */
  it('refuses to stop the clock on somebody nobody has asked anything', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET),
      'You have not actually asked them anything yet.',
      before,
    );
    expect(fixture.ticketState(PLAIN_TICKET)).toBe('open');
  });

  it('refuses to park a ticket that is already parked', () => {
    dispatch(HELPDESK_ACTIONS.ticketMarkAsked, PLAIN_TICKET);
    dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET);
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET),
      'already parked on the user',
      before,
    );
  });

  it('refuses to un-park a ticket nobody parked', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketClearWaiting, PLAIN_TICKET),
      'not waiting on anybody',
      before,
    );
  });

  it('refuses to park anything that is not a ticket', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketSetWaiting, 'device:printer'),
      'only works on a ticket',
      before,
    );
  });
});

/**
 * A ticket the engine has never heard of used to validate cleanly and then
 * throw out of `apply`, taking the click - and whatever the shell was in the
 * middle of - with it. A dispatch answers; it does not detonate.
 */
describe('a ticket node the engine does not track', () => {
  it.each([
    HELPDESK_ACTIONS.ticketSetWaiting,
    HELPDESK_ACTIONS.ticketClearWaiting,
    HELPDESK_ACTIONS.ticketMarkAsked,
  ])('refuses %s instead of throwing', (action) => {
    const before = fixture.snapshotHash();
    let result: DispatchResult | null = null;

    expect(() => {
      result = dispatch(action, ORPHAN_TICKET);
    }).not.toThrow();

    expectRefusal(
      result ?? { ok: false, reason: 'never dispatched.' },
      'not on the helpdesk system',
      before,
    );
  });

  it('leaves the tickets it does track alone', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.ticketMarkAsked, PLAIN_TICKET),
    ).toEqual({ ok: true });
  });
});

describe('ticket.mark_asked', () => {
  it('records that the reporter was actually asked something', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.ticketMarkAsked, PLAIN_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.questionAsked))
      .toBe(true);
  });

  /**
   * The same hash is not the same as nothing happening: a mutation that wrote
   * the value already there would leave the hash alone and still wake every
   * app subscribed to the world. The no-op has to be silent as well as
   * harmless.
   */
  it('takes a second question as the no-op it is', () => {
    dispatch(HELPDESK_ACTIONS.ticketMarkAsked, PLAIN_TICKET);
    const before = fixture.snapshotHash();
    drainEvents();

    expect(
      dispatch(HELPDESK_ACTIONS.ticketMarkAsked, PLAIN_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.snapshotHash()).toBe(before);
    expect(drainEvents()).toEqual([]);
  });

  it('refuses a ticket that is already closed', () => {
    dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET);
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketMarkAsked, ESCALATABLE_TICKET),
      'nothing left to ask them about',
      before,
    );
  });

  it('refuses anything that is not a ticket', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketMarkAsked, 'device:printer'),
      'only works on a ticket',
      before,
    );
  });
});

describe('ticket.escalate', () => {
  it('escalates a ticket whose own rules accept an escalation', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField(ESCALATABLE_TICKET, FIELDS.escalated))
      .toBe(true);
    expect(fixture.ticketState(ESCALATABLE_TICKET)).toBe('resolved');
  });

  it('refuses to escalate work that is fixable from the desk', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, PLAIN_TICKET),
      'career-limiting move',
      before,
    );
  });

  it('refuses to escalate a ticket the escalation already closed', () => {
    dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET);
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET),
      'already closed',
      before,
    );
  });

  it('refuses to escalate an open ticket a second time', () => {
    expect(dispatch(HELPDESK_ACTIONS.ticketEscalate, TWO_STEP_TICKET)).toEqual({
      ok: true,
    });
    expect(fixture.ticketState(TWO_STEP_TICKET)).toBe('open');
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, TWO_STEP_TICKET),
      'already with the field team',
      before,
    );
  });
});

describe('ticket.add_clue', () => {
  it('writes what the reporter let slip onto the ticket', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.ticketAddClue, PLAIN_TICKET, {
        clue: 'A colleague was at the desk on Friday.',
      }),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.clues))
      .toBe('A colleague was at the desk on Friday.');
  });

  it('appends later clues as their own lines, in the order they landed', () => {
    dispatch(HELPDESK_ACTIONS.ticketAddClue, PLAIN_TICKET, { clue: 'First.' });
    dispatch(HELPDESK_ACTIONS.ticketAddClue, PLAIN_TICKET, { clue: 'Second.' });

    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.clues))
      .toBe('First.\nSecond.');
    expect(clueLines(fixture.graph.getField(PLAIN_TICKET, FIELDS.clues)))
      .toEqual(['First.', 'Second.']);
  });

  it('refuses a clue with no words in it', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddClue, PLAIN_TICKET, { clue: '   ' }),
      'nothing to write down',
      before,
    );
  });

  it('refuses to write the same clue twice', () => {
    dispatch(HELPDESK_ACTIONS.ticketAddClue, PLAIN_TICKET, { clue: 'Once.' });
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddClue, PLAIN_TICKET, { clue: 'Once.' }),
      'already written on the ticket',
      before,
    );
  });

  it('refuses to add anything to a ticket that is already closed', () => {
    dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET);
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddClue, ESCALATABLE_TICKET, {
        clue: 'Too late.',
      }),
      'already closed',
      before,
    );
  });

  it('refuses a target that is not a ticket', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddClue, 'account:ada', {
        clue: 'Wrong shelf.',
      }),
      'only works on a ticket',
      before,
    );
  });
});
