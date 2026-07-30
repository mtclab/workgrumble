import { beforeEach, describe, expect, it } from 'vitest';

import { ActionRegistry, type DispatchResult } from '../../engine/actions';
import type { Expr } from '../../engine/assertions';
import { SimClock } from '../../engine/clock';
import { createEngineEventBus } from '../../engine/events';
import { EntityGraph } from '../../engine/graph';
import { createRng } from '../../engine/rng';
import type { FieldValue } from '../../engine/schema';
import { TicketEngine } from '../../engine/tickets';
import { FIELDS } from '../fields';
import { HELPDESK_ACTION_IDS, HELPDESK_ACTIONS } from './ids';
import { registerHelpdeskActions } from './index';

const ACTOR = 'person:tech';
const ESCALATABLE_TICKET = 'ticket:hardware';
/** Escalation is necessary but not sufficient: it stays open after the call. */
const TWO_STEP_TICKET = 'ticket:hardware-two-step';
const PLAIN_TICKET = 'ticket:plain';

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

interface Fixture {
  graph: EntityGraph;
  clock: SimClock;
  registry: ActionRegistry;
  tickets: TicketEngine;
}

function seedFixture(graph: EntityGraph): void {
  graph.addNode({
    id: ACTOR,
    kind: 'person',
    fields: { name: 'Pat Pending' },
  });
  graph.addNode({
    id: 'account:ada',
    kind: 'account',
    fields: { username: 'ada', locked: true, enabled: true },
  });
  graph.addNode({
    id: 'account:gone',
    kind: 'account',
    fields: { username: 'gone', locked: true, enabled: false },
  });
  graph.addNode({
    id: 'group:print-users',
    kind: 'group',
    fields: { name: 'Print Users' },
  });
  graph.addNode({
    id: 'group:vpn-users',
    kind: 'group',
    fields: { name: 'VPN Users' },
  });
  graph.addNode({
    id: 'machine:ada',
    kind: 'machine',
    fields: {
      hostname: 'ADA-PC',
      display_rotation: 90,
      resolution: '800x600',
      pending_updates: true,
    },
  });
  graph.addNode({
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
  graph.addNode({
    id: 'device:monitor',
    kind: 'device',
    fields: { name: 'Trinitrend 15"', type: 'monitor', powered: true },
  });
  graph.addNode({
    id: 'device:mouse',
    kind: 'device',
    fields: {
      name: 'Reception mouse',
      type: 'mouse',
      powered: false,
      battery_pct: 0,
    },
  });
  graph.addNode({
    id: 'service:spooler',
    kind: 'service',
    fields: { name: 'Print Spooler', status: 'wedged' },
  });
  graph.addNode({
    id: 'service:vpn',
    kind: 'service',
    fields: { name: 'VPN Concentrator', status: 'running' },
  });
  graph.addNode({
    id: 'share:common',
    kind: 'share',
    fields: { name: 'Common', path: '\\\\WORKGRUMBLE\\common' },
  });
  graph.addNode({
    id: 'mail_rule:autofile',
    kind: 'mail_rule',
    fields: {
      name: 'File everything from the boss',
      enabled: true,
      target: 'Deleted Items',
    },
  });
  graph.addEdge({
    from: 'account:ada',
    to: 'group:print-users',
    kind: 'member_of',
  });
}

function createFixture(): Fixture {
  const bus = createEngineEventBus();
  const graph = new EntityGraph(bus);
  const clock = new SimClock();
  const registry = new ActionRegistry(graph, createRng(0x1_2345), clock, 1);
  const tickets = new TicketEngine(graph, clock, bus);

  seedFixture(graph);
  registerHelpdeskActions(registry, {
    tickets,
    allowsEscalation: (id) => id !== PLAIN_TICKET,
  });

  for (const { id, resolvedWhen } of FIXTURE_TICKETS) {
    tickets.spawn({
      id,
      archetype: 'hidden_cause',
      flavor: { title: `Fixture ${id}`, body: 'Fixture ticket.' },
      reporter: ACTOR,
      setup: [],
      resolved_when: resolvedWhen,
      sla_ticks: 600,
      reward: { reputation: 1, money: 1 },
      kb_ref: 'kb/fixture',
    });
  }

  return { graph, clock, registry, tickets };
}

let fixture: Fixture;

function dispatch(
  id: string,
  target: string | null,
  params: Record<string, FieldValue> = {},
): DispatchResult {
  return fixture.registry.dispatch(id, ACTOR, target, params);
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
  expect(fixture.graph.snapshotHash()).toBe(hashBefore);
}

beforeEach(() => {
  fixture = createFixture();
});

describe('helpdesk action registry', () => {
  it('registers every advertised action exactly once', () => {
    expect(HELPDESK_ACTION_IDS).toHaveLength(16);
    expect(new Set(HELPDESK_ACTION_IDS).size).toBe(16);

    for (const id of HELPDESK_ACTION_IDS) {
      const result = dispatch(id, null, {});
      expect(result).not.toEqual({
        ok: false,
        reason: `Unknown action "${id}".`,
      });
    }
  });

  it('refuses a missing target with an instruction, not a stack trace', () => {
    const before = fixture.graph.snapshotHash();
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
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, 'account:ada'),
      'is not locked',
      before,
    );
  });

  it('refuses a disabled account and says what is really wrong', () => {
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, 'account:gone'),
      'is disabled, not locked',
      before,
    );
  });

  it('refuses a target of the wrong kind', () => {
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountUnlock, 'machine:ada'),
      'only works on an account',
      before,
    );
  });
});

describe('account.reset_password', () => {
  it('stamps the reset tick and ends the lockout', () => {
    fixture.clock.advance(42);
    expect(
      dispatch(HELPDESK_ACTIONS.accountResetPassword, 'account:ada'),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('account:ada', FIELDS.passwordResetAt))
      .toBe(42);
    expect(fixture.graph.getField('account:ada', FIELDS.locked)).toBe(false);
  });

  it('refuses a disabled account', () => {
    const before = fixture.graph.snapshotHash();
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
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.accountAddToGroup, 'account:ada', {
        group: 'group:print-users',
      }),
      'is already in',
      before,
    );
  });

  it('refuses a group that is not a group', () => {
    const before = fixture.graph.snapshotHash();
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
    const before = fixture.graph.snapshotHash();
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
  it('brings a wedged service back to running', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.serviceRestart, 'service:spooler'),
    ).toEqual({ ok: true });
    expect(fixture.graph.getField('service:spooler', FIELDS.status))
      .toBe('running');
  });

  it('refuses to restart a healthy service', () => {
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.serviceRestart, 'service:vpn'),
      'is already running',
      before,
    );
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
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.machineSetDisplayRotation, 'machine:ada', {
        rotation: 45,
      }),
      '0, 90, 180, 270 degrees',
      before,
    );
  });

  it('refuses a rotation the screen already has', () => {
    const before = fixture.graph.snapshotHash();
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
    const before = fixture.graph.snapshotHash();
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
    fixture.clock.advance(9);
    expect(dispatch(HELPDESK_ACTIONS.machineReboot, 'machine:ada')).toEqual({
      ok: true,
    });
    expect(fixture.graph.getField('machine:ada', FIELDS.pendingUpdates))
      .toBe(false);
    expect(fixture.graph.getField('machine:ada', FIELDS.uptimeSince)).toBe(9);
  });

  it('refuses to reboot something that is not a workstation', () => {
    const before = fixture.graph.snapshotHash();
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
    const before = fixture.graph.snapshotHash();
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
    const before = fixture.graph.snapshotHash();
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
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.printerClearQueue, 'device:monitor'),
      'is not a printer',
      before,
    );
  });

  it('refuses a queue that is already empty', () => {
    dispatch(HELPDESK_ACTIONS.printerClearQueue, 'device:printer');
    const before = fixture.graph.snapshotHash();
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
    const before = fixture.graph.snapshotHash();
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
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.shareGrantAccess, 'share:common', {
        account: 'account:ada',
      }),
      'can already reach',
      before,
    );
  });

  it('refuses a missing account parameter', () => {
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.shareGrantAccess, 'share:common'),
      'arrived empty',
      before,
    );
  });
});

describe('ticket waiting state', () => {
  it('parks a ticket on the user and takes it back off again', () => {
    expect(
      dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.tickets.getState(PLAIN_TICKET)).toBe('waiting_on_user');

    expect(
      dispatch(HELPDESK_ACTIONS.ticketClearWaiting, PLAIN_TICKET),
    ).toEqual({ ok: true });
    expect(fixture.tickets.getState(PLAIN_TICKET)).toBe('open');
  });

  it('refuses to park a ticket that is already parked', () => {
    dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET);
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketSetWaiting, PLAIN_TICKET),
      'already parked on the user',
      before,
    );
  });

  it('refuses to un-park a ticket nobody parked', () => {
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketClearWaiting, PLAIN_TICKET),
      'not waiting on anybody',
      before,
    );
  });

  it('refuses to park anything that is not a ticket', () => {
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketSetWaiting, 'device:printer'),
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
    expect(fixture.tickets.getState(ESCALATABLE_TICKET)).toBe('resolved');
  });

  it('refuses to escalate work that is fixable from the desk', () => {
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, PLAIN_TICKET),
      'career-limiting move',
      before,
    );
  });

  it('refuses to escalate a ticket the escalation already closed', () => {
    dispatch(HELPDESK_ACTIONS.ticketEscalate, ESCALATABLE_TICKET);
    const before = fixture.graph.snapshotHash();
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
    expect(fixture.tickets.getState(TWO_STEP_TICKET)).toBe('open');
    const before = fixture.graph.snapshotHash();
    expectRefusal(
      dispatch(HELPDESK_ACTIONS.ticketEscalate, TWO_STEP_TICKET),
      'already with the field team',
      before,
    );
  });
});
