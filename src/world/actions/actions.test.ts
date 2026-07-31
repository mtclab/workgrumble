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
import { fieldLines, helpdeskActionPayload } from './index';

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
  // The third state. Nobody locked it and nobody switched it off: a policy
  // clock ran out on the credential while the account itself is perfectly
  // healthy, and it is the one an unlock cannot touch.
  addNode(ops, {
    id: 'account:stale',
    kind: 'account',
    fields: {
      username: 'stale',
      locked: false,
      enabled: true,
      password_expired: true,
    },
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
      // Even with a question on the record, it has no record behind it and
      // no clock to stop.
      customer_visible: 'Is it plugged in?',
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
      reward: { reputation: 1 },
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
    // Thirty-six. M4's roster asked the tier for verbs it did not have: an
    // identity check, an enrolment, a session revoke that is the wrong flavour
    // of fix, two ends of a licence seat, a certificate, a stored credential, a
    // mail rule switch, a note for a socket, a link nobody should follow, and a
    // reply to the one man this week who did the right thing. M5 took two back
    // off: `machine.set_resolution` and `mail_rule.delete` were registered,
    // labelled on the handoff form and reachable from nothing at all - no
    // button, no command, no dialogue option, no resolution rule - so they were
    // deleted rather than exempted from the coverage gate a second time.
    expect(HELPDESK_ACTION_IDS).toHaveLength(36);
    expect(new Set(HELPDESK_ACTION_IDS).size).toBe(36);

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

/**
 * The matrix. Three faults that wear the same face at the login box, three
 * fixes, and nine cells - because the wrong fix on the wrong state is not a
 * harmless miss: it is a sticky note by lunchtime, or an account the leavers
 * process disabled being switched back on with your name in the audit log.
 */
describe('locked, disabled and expired', () => {
  const LOCKED = 'account:ada';
  const DISABLED = 'account:gone';
  const EXPIRED = 'account:stale';

  it('unlocks only the locked one, and says which fault the others have', () => {
    expect(dispatch(HELPDESK_ACTIONS.accountUnlock, LOCKED)).toEqual({
      ok: true,
    });
    expect(fixture.graph.getField(LOCKED, FIELDS.locked)).toBe(false);

    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, DISABLED),
      'is disabled, not locked',
      before,
    );
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, EXPIRED),
      'their password has expired',
      before,
    );
  });

  it('enables only the disabled one, and refuses the other two', () => {
    expect(dispatch(HELPDESK_ACTIONS.accountEnable, DISABLED)).toEqual({
      ok: true,
    });
    expect(fixture.graph.getField(DISABLED, FIELDS.enabled)).toBe(true);
    // Enabling does not unlock: it was locked as well, and that is a second
    // job rather than the same one.
    expect(fixture.graph.getField(DISABLED, FIELDS.locked)).toBe(true);

    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountEnable, LOCKED),
      'is not disabled',
      before,
    );
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountEnable, EXPIRED),
      'is not disabled',
      before,
    );
  });

  it('resets the expired one, refuses the disabled one, and clears a lockout', () => {
    fixture.advance(11);
    expect(dispatch(HELPDESK_ACTIONS.accountResetPassword, EXPIRED))
      .toEqual({ ok: true });
    expect(fixture.graph.getField(EXPIRED, FIELDS.passwordExpired)).toBe(false);
    // Every real reset leaves this behind, and it is the next ticket.
    expect(fixture.graph.getField(EXPIRED, FIELDS.pwMustChange)).toBe(true);
    expect(fixture.graph.getField(EXPIRED, FIELDS.passwordResetAt)).toBe(11);

    // A reset on a locked account is allowed and clears the lockout with it -
    // which is why it looks like a cure-all and is not.
    expect(dispatch(HELPDESK_ACTIONS.accountResetPassword, LOCKED))
      .toEqual({ ok: true });
    expect(fixture.graph.getField(LOCKED, FIELDS.locked)).toBe(false);

    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountResetPassword, DISABLED),
      'still lets nobody in',
      before,
    );
  });

  /** An unlock ends the lockout and the count behind it, and nothing else. */
  it('leaves an expired password expired after an unlock', () => {
    fixture.applySetup([
      {
        op: 'setField',
        id: EXPIRED,
        field: FIELDS.locked,
        value: true,
      },
      {
        op: 'setField',
        id: EXPIRED,
        field: FIELDS.badPwCount,
        value: 5,
      },
      {
        op: 'setField',
        id: EXPIRED,
        field: FIELDS.lockedSince,
        value: 3,
      },
    ]);

    expect(dispatch(HELPDESK_ACTIONS.accountUnlock, EXPIRED))
      .toEqual({ ok: true });
    expect(fixture.graph.getField(EXPIRED, FIELDS.locked)).toBe(false);
    expect(fixture.graph.getField(EXPIRED, FIELDS.badPwCount)).toBe(0);
    expect(fixture.graph.getField(EXPIRED, FIELDS.lockedSince)).toBeUndefined();
    // Still expired. Two faults, and only one of them has been dealt with.
    expect(fixture.graph.getField(EXPIRED, FIELDS.passwordExpired)).toBe(true);

    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, EXPIRED),
      'their password has expired',
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

/** Putting a question to the reporter, which is what buys a pause. */
function ask(ticket: string, question = 'What were you doing when it went?'): void {
  dispatch(HELPDESK_ACTIONS.ticketAddComment, ticket, { comment: question });
}

describe('ticket waiting state', () => {
  it('parks a ticket on the user and takes it back off again', () => {
    ask(PLAIN_TICKET);
    expect(
      dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.ticketState(PLAIN_TICKET)).toBe('waiting_on_user');
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.holdReason))
      .toBe('awaiting_user');

    expect(
      dispatch(HELPDESK_ACTIONS.ticketClearWaiting, PLAIN_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.ticketState(PLAIN_TICKET)).toBe('open');
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.holdReason))
      .toBeUndefined();
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

  /**
   * The evidence is the customer-visible stream and nothing else. A work note
   * saying "asked the user" is a note the user never saw, and it used to be
   * exactly as good as asking them, because the old rule read a flag.
   */
  it('does not accept a work note as evidence that anybody was asked', () => {
    dispatch(HELPDESK_ACTIONS.ticketAddWorknote, PLAIN_TICKET, {
      note: 'Asked the user. Honestly. Ask anyone.',
    });
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET),
      'You have not actually asked them anything yet.',
      before,
    );
  });

  it('refuses to park a ticket that is already parked', () => {
    ask(PLAIN_TICKET);
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
    HELPDESK_ACTIONS.ticketRecordResponse,
    HELPDESK_ACTIONS.ticketClassify,
    HELPDESK_ACTIONS.ticketBounceHandoff,
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
      dispatch(HELPDESK_ACTIONS.ticketRecordResponse, PLAIN_TICKET),
    ).toEqual({ ok: true });
  });
});

describe('ticket.classify', () => {
  it('writes the triage and re-cuts the deadline from the ticket\'s arrival', () => {
    fixture.advance(20);
    expect(
      dispatch(HELPDESK_ACTIONS.ticketClassify, PLAIN_TICKET, {
        impact: 3,
        urgency: 2,
        priority: 2,
      }),
    ).toEqual({ ok: true });

    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.impact)).toBe(3);
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.urgency)).toBe(2);
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.priority)).toBe(2);
    // Two hours from when it landed, not two hours from now: a ticket you
    // ignored for twenty minutes does not get the twenty minutes back.
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.slaDeadline)).toBe(120);
  });

  /**
   * The matrix is enforced by the engine, not by the app that draws it. A
   * caller sending a priority that is not the one those two axes produce is
   * inventing a fourth field, and the world does not keep it.
   */
  it('refuses a priority the matrix would never have produced', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketClassify, PLAIN_TICKET, {
        impact: 1,
        urgency: 1,
        priority: 1,
      }),
      'not a triage anybody could arrive at',
      before,
    );

    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketClassify, PLAIN_TICKET, {
        impact: 4,
        urgency: 1,
        priority: 4,
      }),
      'not a triage anybody could arrive at',
      before,
    );
  });

  /**
   * The consequence of mis-triage, made mechanical. Calling something a P1 at
   * lunchtime does not give it a fresh hour: its deadline was an hour after it
   * arrived, and that was two hours ago.
   */
  it('breaches on the spot when the new deadline is already behind us', () => {
    fixture.advance(120);
    drainEvents();

    expect(
      dispatch(HELPDESK_ACTIONS.ticketClassify, PLAIN_TICKET, {
        impact: 3,
        urgency: 3,
        priority: 1,
      }),
    ).toEqual({ ok: true });

    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.slaDeadline)).toBe(60);
    expect(fixture.ticketState(PLAIN_TICKET)).toBe('breached');
    expect(drainEvents()).toContainEqual({
      type: 'ticket:breached',
      id: PLAIN_TICKET,
    });
  });

  it('refuses to re-cut the deadline of a ticket that is parked', () => {
    ask(PLAIN_TICKET);
    dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET);
    const before = fixture.snapshotHash();

    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketClassify, PLAIN_TICKET, {
        impact: 1,
        urgency: 3,
        priority: 3,
      }),
      'move a clock that is supposed to be stopped',
      before,
    );
  });

  /**
   * The instruction the refusal above gives - clear the hold, then triage it -
   * has to be safe to follow. Every minute the ticket spent parked goes back
   * on top of the new target, or "take it off hold first" is a trap: the
   * player does as they are told and the ticket breaches in their hand.
   */
  it('keeps every minute of the hold when the deadline is re-cut', () => {
    ask(PLAIN_TICKET);
    dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET);
    fixture.advance(60);
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.heldTicks)).toBe(60);

    dispatch(HELPDESK_ACTIONS.ticketClearWaiting, PLAIN_TICKET);
    expect(
      dispatch(HELPDESK_ACTIONS.ticketClassify, PLAIN_TICKET, {
        impact: 1,
        urgency: 3,
        priority: 3,
      }),
    ).toEqual({ ok: true });

    // P3 resolves in 240 minutes, measured from the minute it arrived, plus
    // the hour nobody was allowed to work in.
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.slaDeadline))
      .toBe(240 + 60);

    // And again on the second triage: the pause is the ticket's, not a bonus
    // that one classification happened to catch.
    expect(
      dispatch(HELPDESK_ACTIONS.ticketClassify, PLAIN_TICKET, {
        impact: 1,
        urgency: 1,
        priority: 4,
      }),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.slaDeadline))
      .toBe(480 + 60);
  });

  /**
   * A missed deadline is history. Re-cutting one moves a line the ticket has
   * already crossed while the breach stays latched, which renders as "Overdue
   * 0m" - a number somebody has plainly been at.
   */
  it('refuses to re-cut the deadline of a ticket that has already blown it', () => {
    fixture.advance(600);
    expect(fixture.ticketState(PLAIN_TICKET)).toBe('breached');
    const before = fixture.snapshotHash();
    const deadline = fixture.graph.getField(PLAIN_TICKET, FIELDS.slaDeadline);

    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketClassify, PLAIN_TICKET, {
        impact: 1,
        urgency: 1,
        priority: 4,
      }),
      'already blown its SLA',
      before,
    );
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.slaDeadline))
      .toBe(deadline);
  });
});

describe('ticket.record_response', () => {
  /**
   * The commonest first touch there is closes the ticket as it lands. Refusing
   * to stamp a response on a resolved ticket left exactly those tickets with
   * no timestamp at all - and a missing timestamp reads as "answered in time",
   * so the latest possible answer was the one nothing was said about.
   */
  it('stamps the response of a ticket the same touch closed', () => {
    fixture.advance(90);
    expect(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET, GOOD_HANDOFF),
    ).toEqual({ ok: true });
    expect(fixture.ticketState(ESCALATABLE_TICKET)).toBe('resolved');

    expect(
      dispatch(HELPDESK_ACTIONS.ticketRecordResponse, ESCALATABLE_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField(ESCALATABLE_TICKET, FIELDS.respondedAt))
      .toBe(90);
  });

  it('stops the clock once, at the first touch and not the best one', () => {
    fixture.advance(10);
    expect(dispatch(HELPDESK_ACTIONS.ticketRecordResponse, PLAIN_TICKET))
      .toEqual({ ok: true });
    fixture.advance(10);

    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketRecordResponse, PLAIN_TICKET),
      'stops the first time, not the best time',
      before,
    );
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.respondedAt)).toBe(10);
  });
});

describe('ticket.record_touch', () => {
  it('keeps what was tried on the ticket, and refuses anything else', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.ticketRecordTouch, PLAIN_TICKET, {
        touches: '4|device.power_cycle|1',
      }),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.touchLog))
      .toBe('4|device.power_cycle|1');

    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketRecordTouch, PLAIN_TICKET, {
        touches: 12,
      }),
      'a list of things that were tried',
      before,
    );
  });
});

/** A handoff L2 will keep, so escalation behaves as it always did. */
const GOOD_HANDOFF: Record<string, FieldValue> = {
  reported: 'It makes a noise like a bag of spanners.',
  tried: 'Turned it off and on again\nListened to it, at length',
};

describe('ticket.escalate', () => {
  it('escalates a ticket whose own rules accept an escalation', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET, GOOD_HANDOFF),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField(ESCALATABLE_TICKET, FIELDS.escalated))
      .toBe(true);
    expect(fixture.ticketState(ESCALATABLE_TICKET)).toBe('resolved');
  });

  it('refuses to escalate work that is fixable from the desk', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, PLAIN_TICKET, GOOD_HANDOFF),
      'career-limiting move',
      before,
    );
  });

  it('refuses to escalate a ticket the escalation already closed', () => {
    dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET, GOOD_HANDOFF);
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET, GOOD_HANDOFF),
      'already closed',
      before,
    );
  });

  it('refuses to escalate an open ticket a second time', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, TWO_STEP_TICKET, GOOD_HANDOFF),
    ).toEqual({ ok: true });
    expect(fixture.ticketState(TWO_STEP_TICKET)).toBe('waiting_on_user');
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, TWO_STEP_TICKET, GOOD_HANDOFF),
      'already with the field team',
      before,
    );
  });

  /**
   * An escalation that does not close the ticket has handed it to somebody
   * else, and the resolution clock is not the player's any more. It is a hold
   * with a different reason on it, which is what "awaiting vendor" means.
   */
  it('parks a still-open escalation on the field team rather than the user', () => {
    dispatch(HELPDESK_ACTIONS.ticketEscalate, TWO_STEP_TICKET, GOOD_HANDOFF);
    expect(fixture.graph.getField(TWO_STEP_TICKET, FIELDS.holdReason))
      .toBe('awaiting_vendor');
  });

  it('refuses a handoff form that never arrived', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET),
      'handoff form did not arrive',
      before,
    );
  });
});

describe('ticket.add_worknote', () => {
  it('writes what the reporter let slip onto the ticket', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.ticketAddWorknote, PLAIN_TICKET, {
        note: 'A colleague was at the desk on Friday.',
      }),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.worknotes))
      .toBe('A colleague was at the desk on Friday.');
  });

  it('appends later notes as their own lines, in the order they landed', () => {
    dispatch(HELPDESK_ACTIONS.ticketAddWorknote, PLAIN_TICKET, { note: 'First.' });
    dispatch(HELPDESK_ACTIONS.ticketAddWorknote, PLAIN_TICKET, { note: 'Second.' });

    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.worknotes))
      .toBe('First.\nSecond.');
    expect(fieldLines(fixture.graph.getField(PLAIN_TICKET, FIELDS.worknotes)))
      .toEqual(['First.', 'Second.']);
  });

  /** An internal note is not a word to the reporter, so it stops no clock. */
  it('leaves the response clock running', () => {
    dispatch(HELPDESK_ACTIONS.ticketAddWorknote, PLAIN_TICKET, {
      note: 'Had a think about it.',
    });
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.respondedAt))
      .toBeUndefined();
  });

  it('refuses a note with no words in it', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddWorknote, PLAIN_TICKET, { note: '   ' }),
      'nothing to write down',
      before,
    );
  });

  it('refuses to write the same note twice', () => {
    dispatch(HELPDESK_ACTIONS.ticketAddWorknote, PLAIN_TICKET, { note: 'Once.' });
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddWorknote, PLAIN_TICKET, { note: 'Once.' }),
      'already on the ticket',
      before,
    );
  });

  it('refuses to add anything to a ticket that is already closed', () => {
    dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET, GOOD_HANDOFF);
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddWorknote, ESCALATABLE_TICKET, {
        note: 'Too late.',
      }),
      'already closed',
      before,
    );
  });

  it('refuses a target that is not a ticket', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddWorknote, 'account:ada', {
        note: 'Wrong shelf.',
      }),
      'only works on a ticket',
      before,
    );
  });
});

describe('ticket.add_comment', () => {
  it('puts the question to the reporter and stops the response clock', () => {
    fixture.advance(9);
    expect(
      dispatch(HELPDESK_ACTIONS.ticketAddComment, PLAIN_TICKET, {
        comment: 'Which of the three printers is it?',
      }),
    ).toEqual({ ok: true });

    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.customerVisible))
      .toBe('Which of the three printers is it?');
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.respondedAt)).toBe(9);
  });

  /** A clock stops the first time, not the best time. */
  it('leaves the response mark on the first thing that was said', () => {
    dispatch(HELPDESK_ACTIONS.ticketAddComment, PLAIN_TICKET, { comment: 'One?' });
    fixture.advance(30);
    dispatch(HELPDESK_ACTIONS.ticketAddComment, PLAIN_TICKET, { comment: 'Two?' });

    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.respondedAt)).toBe(0);
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.customerVisible))
      .toBe('One?\nTwo?');
  });

  /** The two streams are separate records of separate things. */
  it('keeps the internal and customer-visible streams apart', () => {
    dispatch(HELPDESK_ACTIONS.ticketAddWorknote, PLAIN_TICKET, {
      note: 'Reporter is wrong about the cause, as ever.',
    });
    dispatch(HELPDESK_ACTIONS.ticketAddComment, PLAIN_TICKET, {
      comment: 'Could you tell me what it says on the screen?',
    });

    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.worknotes))
      .toBe('Reporter is wrong about the cause, as ever.');
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.customerVisible))
      .toBe('Could you tell me what it says on the screen?');
  });

  it('refuses an empty message and a repeated one', () => {
    const before = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddComment, PLAIN_TICKET, { comment: ' ' }),
      'not a question',
      before,
    );

    ask(PLAIN_TICKET, 'Same words.');
    const asked = fixture.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketAddComment, PLAIN_TICKET, {
        comment: 'Same words.',
      }),
      'already put that to them',
      asked,
    );
  });
});

/**
 * KCS calls linking the article the solve. Mechanically it is two writes and
 * one refusal set - the reference a report reads, the sentence the next human
 * reads, and the rule that both belong on work rather than on a record.
 */
describe('ticket.link_article', () => {
  const LINK = {
    article: 'kb/print-spooler',
    note: 'Linked knowledge article kb/print-spooler - "The print spooler".',
  };

  it('writes the reference and the note in one move', () => {
    expect(dispatch(HELPDESK_ACTIONS.ticketLinkArticle, PLAIN_TICKET, LINK))
      .toEqual({ ok: true });
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.kbRef))
      .toBe('kb/print-spooler');
    expect(fieldLines(fixture.graph.getField(PLAIN_TICKET, FIELDS.worknotes)))
      .toEqual([LINK.note]);
  });

  /**
   * Reading the knowledge base is not contact with the reporter and is not
   * work on the fault. A response clock stopped by it would be a clock stopped
   * by somebody reading, which is the exact opposite of what it measures.
   */
  it('stops no clock and claims no work', () => {
    dispatch(HELPDESK_ACTIONS.ticketLinkArticle, PLAIN_TICKET, LINK);

    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.respondedAt))
      .toBeUndefined();
    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.touchLog))
      .toBeUndefined();
  });

  it('lets a second article replace the first, and says so on the ticket', () => {
    dispatch(HELPDESK_ACTIONS.ticketLinkArticle, PLAIN_TICKET, LINK);
    expect(
      dispatch(HELPDESK_ACTIONS.ticketLinkArticle, PLAIN_TICKET, {
        article: 'kb/power-cycle',
        note: 'Linked knowledge article kb/power-cycle - "Off and on again".',
      }),
    ).toEqual({ ok: true });

    expect(fixture.graph.getField(PLAIN_TICKET, FIELDS.kbRef))
      .toBe('kb/power-cycle');
    // Both notes survive: the record is what was read, in order, not the last
    // thing anybody clicked.
    expect(fieldLines(fixture.graph.getField(PLAIN_TICKET, FIELDS.worknotes)))
      .toHaveLength(2);
  });

  it('refuses the same article twice, and a link with nothing in it', () => {
    dispatch(HELPDESK_ACTIONS.ticketLinkArticle, PLAIN_TICKET, LINK);
    const linked = fixture.snapshotHash();

    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketLinkArticle, PLAIN_TICKET, LINK),
      'already the article on this ticket',
      linked,
    );
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketLinkArticle, PLAIN_TICKET, {
        article: '  ',
        note: 'Something.',
      }),
      'No article arrived',
      linked,
    );
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketLinkArticle, PLAIN_TICKET, {
        article: 'kb/power-cycle',
        note: '   ',
      }),
      'which article, and not why',
      linked,
    );
  });

  it('refuses a closed ticket, an untracked one and a target that is neither', () => {
    dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET, GOOD_HANDOFF);
    const before = fixture.snapshotHash();

    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketLinkArticle, ESCALATABLE_TICKET, LINK),
      'That ticket is closed',
      before,
    );
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketLinkArticle, ORPHAN_TICKET, LINK),
      'not on the helpdesk system',
      before,
    );
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketLinkArticle, 'account:ada', LINK),
      'only works on a ticket',
      before,
    );
  });
});
