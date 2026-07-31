/**
 * The flood, at graph level: forty reports, one fault, one incident that
 * matters.
 *
 * It is driven through the shipped engine and the shipped verb set with a
 * FIXTURE flood rather than shipped content, because the flood day is lane C's
 * to write and the machinery is this lane's to prove. Everything the mechanism
 * promises is asserted here: what a link does, what closes a child, what the
 * child's reporter is told, and - the load-bearing one - that a ticket nobody
 * wrote as a duplicate cannot be closed by closing something else.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Expr, SetupOp, TicketDef } from '../../engine-api';
import { WasmEngine } from '../../engine-api';
import {
  fieldLines,
  HELPDESK_ACTIONS,
  helpdeskActionPayload,
  LINK_PARENT_REFUSED_REASON,
} from '../actions';
import { FIELDS } from '../fields';
import {
  acceptsParent,
  cascadeComment,
  cascadesDue,
  childrenOf,
  closesWithParent,
  linkNote,
  parentOf,
} from './parent';

const ACTOR = 'person:tech';
const CERT = 'service:cert';
const PARENT = 'ticket:cert-expiry';
const CHILDREN = ['ticket:cert-ada', 'ticket:cert-gary', 'ticket:cert-nina'];
/**
 * A duplicate whose own rule the estate CAN satisfy - somebody re-enrolled
 * that one desk by hand while the outage was still on. The parent branch is
 * additive, and this is what proves it: a duplicate is still a ticket, and a
 * ticket still closes when its own fault stops existing.
 */
const SELF_FIXING = 'ticket:cert-bev';
/** Written as its own fault, so it is nobody's duplicate. */
const UNRELATED = 'ticket:rotated-screen-fixture';

/**
 * What a duplicate's own rule looks like in a real flood: nothing on the desk
 * fixes ONE person's certificate, so the only way each of these closes is with
 * the incident behind it. That is why the parent branch exists.
 */
const RE_ENROLLED: Expr = {
  op: 'eq',
  selector: { id: CERT },
  field: 'reissued_per_user',
  value: true,
};

/** The parent's own rule: the certificate is put back, or it is not. */
const CERT_FIXED: Expr = {
  op: 'eq',
  selector: { id: CERT },
  field: FIELDS.status,
  value: 'running',
};

const SCREEN_STRAIGHT: Expr = {
  op: 'eq',
  selector: { id: 'machine:ada' },
  field: FIELDS.displayRotation,
  value: 0,
};

function setup(): readonly SetupOp[] {
  return [
    {
      op: 'addNode',
      node: { id: ACTOR, kind: 'person', fields: { name: 'Pat Pending' } },
    },
    {
      op: 'addNode',
      node: {
        id: CERT,
        kind: 'service',
        fields: {
          name: 'VPN Concentrator',
          status: 'stopped',
          restartable: true,
        },
      },
    },
    {
      op: 'addNode',
      node: {
        id: 'machine:ada',
        kind: 'machine',
        fields: { hostname: 'SALES-02', display_rotation: 90 },
      },
    },
  ];
}

function ticket(id: string, resolvedWhen: Expr): TicketDef {
  return {
    id,
    archetype: 'flood',
    flavor: { title: `Fixture ${id}`, body: 'Fixture ticket.' },
    reporter: ACTOR,
    setup: [],
    resolved_when: resolvedWhen,
    sla_ticks: 240,
    reward: { reputation: 1, money: 1 },
    kb_ref: 'kb/power-cycle',
  };
}

let engine: WasmEngine;

function dispatch(
  id: string,
  target: string | null,
  params: Record<string, string | number | boolean | null> = {},
): { ok: boolean; reason?: string } {
  const result = engine.dispatch(id, ACTOR, target, params);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

function link(child: string, parent = PARENT): { ok: boolean; reason?: string } {
  return dispatch(HELPDESK_ACTIONS.ticketLinkToParent, child, {
    parent,
    note: linkNote('The certificate expired', parent),
  });
}

/** The day loop's half, done by hand so the graph rules are what is on trial. */
function cascade(): number {
  const tickets = engine.graph.nodesOfKind('ticket');
  let closed = 0;

  for (const due of cascadesDue(tickets)) {
    const parent = tickets.find((node) => node.id === due.parent);
    const result = dispatch(
      HELPDESK_ACTIONS.ticketResolveWithParent,
      due.child,
      {
        parent: due.parent,
        comment: cascadeComment(
          'The certificate expired',
          fieldLines(parent?.fields[FIELDS.customerVisible]),
        ),
      },
    );

    if (result.ok) {
      closed += 1;
    }
  }

  return closed;
}

beforeEach(() => {
  engine = new WasmEngine(0x0f10_0d);
  engine.applySetup(setup());
  engine.registerActions(helpdeskActionPayload());
  engine.registerTicket(ticket(PARENT, CERT_FIXED));

  for (const id of CHILDREN) {
    // Every one of them is written as a duplicate: its own rule carries the
    // parent branch, which is what makes it attachable at all.
    engine.registerTicket(ticket(id, closesWithParent(id, RE_ENROLLED)));
  }

  engine.registerTicket(ticket(SELF_FIXING, closesWithParent(SELF_FIXING, CERT_FIXED)));
  engine.registerTicket(ticket(UNRELATED, SCREEN_STRAIGHT));
});

describe('the duplicate branch', () => {
  it('is what makes a ticket attachable, and only that', () => {
    expect(acceptsParent(closesWithParent('ticket:x', CERT_FIXED), 'ticket:x'))
      .toBe(true);
    expect(acceptsParent(CERT_FIXED, 'ticket:x')).toBe(false);
    // The branch has to be about THIS ticket: a rule reading somebody else's
    // marker is a rule about somebody else.
    expect(acceptsParent(closesWithParent('ticket:y', CERT_FIXED), 'ticket:x'))
      .toBe(false);
    // And a negated one is not an acceptance, it is the opposite.
    expect(
      acceptsParent(
        { op: 'not', expr: closesWithParent('ticket:x', CERT_FIXED) },
        'ticket:x',
      ),
    ).toBe(false);
  });

  it('leaves the ticket\'s own fix working exactly as before', () => {
    expect(engine.ticketState(SELF_FIXING)).toBe('open');
    dispatch(HELPDESK_ACTIONS.serviceRestart, CERT);
    expect(engine.ticketState(SELF_FIXING)).toBe('resolved');
    // And it closed on its own terms: nobody told it about a parent.
    expect(engine.graph.getNode(SELF_FIXING)?.fields[FIELDS.parentResolved])
      .toBeUndefined();
  });
});

describe('attaching duplicates to a parent', () => {
  it('records the link and says so in the work notes', () => {
    expect(link(CHILDREN[0] ?? '')).toEqual({ ok: true });

    const child = engine.graph.getNode(CHILDREN[0] ?? '');
    expect(child?.fields[FIELDS.parent]).toBe(PARENT);
    expect(fieldLines(child?.fields[FIELDS.worknotes])).toHaveLength(1);
    expect(parentOf(child ?? { id: '', kind: 'ticket', fields: {} }))
      .toBe(PARENT);
    expect(childrenOf(engine.graph.nodesOfKind('ticket'), PARENT))
      .toHaveLength(1);
  });

  /**
   * The rail. Without it the fastest play in a flood is to fix one ticket and
   * attach every other job on the desk to it - and the reporters of all of
   * them get an email saying their problem is fixed.
   */
  it('refuses a ticket nobody wrote as a duplicate', () => {
    const before = engine.snapshotHash();
    const refused = link(UNRELATED);

    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe(LINK_PARENT_REFUSED_REASON);
    expect(engine.snapshotHash()).toBe(before);
  });

  it('refuses a parent that is not a ticket, and a ticket twice attached', () => {
    expect(link(CHILDREN[0] ?? '')).toEqual({ ok: true });
    const before = engine.snapshotHash();

    const twice = link(CHILDREN[0] ?? '');
    expect(twice.ok).toBe(false);
    expect(twice.reason).toContain('already attached');

    const notATicket = link(CHILDREN[1] ?? '', CERT);
    expect(notATicket.ok).toBe(false);
    expect(notATicket.reason).toContain('not a ticket');

    const nobody = link(CHILDREN[1] ?? '', 'ticket:imaginary');
    expect(nobody.ok).toBe(false);
    expect(nobody.reason).toContain('no record of');

    expect(engine.snapshotHash()).toBe(before);
  });
});

describe('the cascade', () => {
  beforeEach(() => {
    for (const id of CHILDREN) {
      expect(link(id)).toEqual({ ok: true });
    }
  });

  it('closes nothing while the parent is still broken', () => {
    expect(cascadesDue(engine.graph.nodesOfKind('ticket'))).toHaveLength(0);
    expect(cascade()).toBe(0);

    for (const id of CHILDREN) {
      expect(engine.ticketState(id)).toBe('open');
    }

    // And the verb itself refuses to be talked into it early.
    const early = dispatch(
      HELPDESK_ACTIONS.ticketResolveWithParent,
      CHILDREN[0] ?? '',
      { parent: PARENT, comment: 'All sorted, honestly.' },
    );
    expect(early.ok).toBe(false);
    expect(early.reason).toContain('has not been fixed yet');
  });

  /**
   * The whole point: one fix, forty closes, and every one of those forty
   * people told the same thing in the same minute.
   */
  it('closes every child when the parent is fixed, with the parent\'s words', () => {
    engine.advance(30);
    dispatch(HELPDESK_ACTIONS.ticketAddComment, PARENT, {
      comment: 'The certificate has been replaced and the VPN is back.',
    });
    dispatch(HELPDESK_ACTIONS.serviceRestart, CERT);
    expect(engine.ticketState(PARENT)).toBe('resolved');

    expect(cascade()).toBe(CHILDREN.length);

    for (const id of CHILDREN) {
      expect(engine.ticketState(id), id).toBe('resolved');
      const child = engine.graph.getNode(id);
      expect(child?.fields[FIELDS.parentResolved]).toBe(true);
      expect(fieldLines(child?.fields[FIELDS.customerVisible])[0])
        .toContain('The certificate has been replaced');
      // Somebody was told, so the response clock stopped when they were told.
      expect(child?.fields[FIELDS.respondedAt]).toBe(30);
    }
  });

  it('tells the reporter something even when the parent said nothing', () => {
    dispatch(HELPDESK_ACTIONS.serviceRestart, CERT);
    expect(cascade()).toBe(CHILDREN.length);

    expect(fieldLines(
      engine.graph.getNode(CHILDREN[0] ?? '')?.fields[FIELDS.customerVisible],
    )[0]).toContain('Nothing further is needed from you');
  });

  /** A repeating settle over a one-off event: the marker is the watermark. */
  it('tells each of them exactly once, however often it runs', () => {
    dispatch(HELPDESK_ACTIONS.serviceRestart, CERT);
    expect(cascade()).toBe(CHILDREN.length);

    const settled = engine.snapshotHash();
    expect(cascade()).toBe(0);
    expect(cascade()).toBe(0);
    expect(engine.snapshotHash()).toBe(settled);

    for (const id of CHILDREN) {
      expect(fieldLines(
        engine.graph.getNode(id)?.fields[FIELDS.customerVisible],
      )).toHaveLength(1);
    }
  });

  it('refuses to close a child with a parent that is not its own', () => {
    dispatch(HELPDESK_ACTIONS.serviceRestart, CERT);
    const before = engine.snapshotHash();

    const wrong = dispatch(
      HELPDESK_ACTIONS.ticketResolveWithParent,
      CHILDREN[0] ?? '',
      { parent: CHILDREN[1] ?? '', comment: 'Closed with something else.' },
    );

    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toContain('is not this ticket\'s parent');
    expect(engine.snapshotHash()).toBe(before);
  });

  it('refuses to close a child in silence', () => {
    dispatch(HELPDESK_ACTIONS.serviceRestart, CERT);
    const before = engine.snapshotHash();

    const silent = dispatch(
      HELPDESK_ACTIONS.ticketResolveWithParent,
      CHILDREN[0] ?? '',
      { parent: PARENT, comment: '   ' },
    );

    expect(silent.ok).toBe(false);
    expect(silent.reason).toContain('without a word to the reporter');
    expect(engine.snapshotHash()).toBe(before);
  });

  /**
   * A ticket attached to itself is inert rather than refused: the engine has
   * no way to compare a target with a parameter, and the cascade's own rule -
   * a child is only due once its parent is RESOLVED, and a resolved ticket is
   * never due - closes the hole without a guard. This is the proof.
   */
  it('does nothing at all with a ticket attached to itself', () => {
    expect(link(SELF_FIXING, SELF_FIXING).ok).toBe(true);
    expect(cascadesDue(engine.graph.nodesOfKind('ticket'))
      .some((due) => due.child === SELF_FIXING)).toBe(false);

    dispatch(HELPDESK_ACTIONS.serviceRestart, CERT);
    // It closes because its OWN rule was satisfied, like any other ticket,
    // and the self-link never fires: a resolved ticket is never due.
    expect(engine.ticketState(SELF_FIXING)).toBe('resolved');
    // The real duplicates close with the parent; the self-linked one is not
    // among them and never will be, because a resolved ticket is never due.
    expect(cascade()).toBe(CHILDREN.length);
    expect(engine.graph.getNode(SELF_FIXING)?.fields[FIELDS.parentResolved])
      .toBeUndefined();
  });
});

describe('what the reporter of a duplicate is told', () => {
  it('copies the parent\'s last word rather than the first', () => {
    expect(cascadeComment('An outage', ['We are looking at it.', 'It is back.']))
      .toContain('It is back.');
    expect(cascadeComment('An outage', ['We are looking at it.', 'It is back.']))
      .toContain('An outage');
  });

  it('says something honest when the parent said nothing', () => {
    expect(cascadeComment('An outage', []))
      .toContain('Nothing further is needed from you');
    expect(cascadeComment('An outage', ['   ']))
      .toContain('Nothing further is needed from you');
  });
});
