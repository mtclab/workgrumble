import { beforeEach, describe, expect, it } from 'vitest';

import type {
  DispatchResult,
  FieldValue,
  SetupOp,
  TicketDef,
} from '../../engine-api';
import { WasmEngine } from '../../engine-api';
import { FIELDS } from '../fields';
import { fumbleThreshold, isFumbling, isRefocusing, REFOCUS_TICKS } from '../meters';
import { helpdeskActionPayload } from './index';
import { DAY_ACTIONS } from './ids';
import {
  ALREADY_DEFERRED_REASON,
  ALREADY_SETTLED_REASON,
  NOT_DECLINABLE_REASON,
} from './interruptions';

const ACTOR = 'person:tech';
const TICKET = 'ticket:locked-account';
const OTHER = 'account:ada';

/**
 * The three verbs, driven against the shipped wasm core with the shipped verb
 * set. Nothing here is a mock: the guards that refuse a second decline are the
 * guards the game registers, and the refusals are the sentences a player
 * reads.
 */
function setup(): readonly SetupOp[] {
  return [
    {
      op: 'addNode',
      node: { id: ACTOR, kind: 'person', fields: { name: 'Pat Pending' } },
    },
    {
      op: 'addNode',
      node: {
        id: OTHER,
        kind: 'account',
        fields: { username: 'ada', locked: true },
      },
    },
  ];
}

function createFixture(): WasmEngine {
  const engine = new WasmEngine(0x1_2345);

  engine.applySetup(setup());
  engine.registerActions(helpdeskActionPayload());

  const def: TicketDef = {
    id: TICKET,
    archetype: 'hidden_cause',
    flavor: { title: 'Locked out again', body: 'It says the wrong password.' },
    reporter: ACTOR,
    setup: [],
    // Never satisfied by anything in this file, so the ticket stays work.
    resolved_when: {
      op: 'eq',
      selector: { id: OTHER },
      field: FIELDS.locked,
      value: false,
    },
    sla_ticks: 600,
    reward: { reputation: 2 },
    kb_ref: 'kb/locked-account',
  };
  engine.registerTicket(def);

  return engine;
}

let fixture: WasmEngine;

function dispatch(
  id: string,
  target: string | null,
  params: Record<string, FieldValue> = {},
): DispatchResult {
  return fixture.dispatch(id, ACTOR, target, params);
}

function player(field: string): FieldValue | undefined {
  return fixture.graph.getField(ACTOR, field);
}

function lines(field: string): readonly string[] {
  const value = player(field);
  return typeof value === 'string' && value.length > 0
    ? value.split('\n')
    : [];
}

function expectRefusal(result: DispatchResult, fragment: string): void {
  expect(result.ok).toBe(false);

  if (result.ok) {
    return;
  }

  expect(result.reason).toContain(fragment);
  expect(result.reason.endsWith('.')).toBe(true);
}

beforeEach(() => {
  fixture = createFixture();
});

describe('answering an interruption', () => {
  /**
   * The goal, not the call. Answering a call about something that is not the
   * work in hand leaves the player worse at their job for a measurable window
   * - that is the mechanic - so the assertion is what the fumble threshold
   * BECOMES, not that a dispatch returned ok.
   */
  it('costs a malignant one twenty-three minutes of finding your place', () => {
    const now = fixture.now();
    const result = dispatch(DAY_ACTIONS.interruptionAccept, null, {
      id: 'call:printer',
    });

    expect(result.ok).toBe(true);
    expect(player(FIELDS.refocusUntil)).toBe(now + REFOCUS_TICKS);
    expect(isRefocusing(player(FIELDS.refocusUntil), now)).toBe(true);

    // The debuff is real where it is felt: a stress that was fine a minute ago
    // is now over the line.
    const stress = fumbleThreshold(false);
    expect(isFumbling(stress, false)).toBe(false);
    expect(isFumbling(stress, true)).toBe(true);
  });

  it('lets the window expire quietly, and slacking does not clear it', () => {
    const now = fixture.now();
    dispatch(DAY_ACTIONS.interruptionAccept, null, { id: 'call:printer' });
    const until = player(FIELDS.refocusUntil);

    expect(isRefocusing(until, now + REFOCUS_TICKS - 1)).toBe(true);
    expect(isRefocusing(until, now + REFOCUS_TICKS)).toBe(false);

    // Nothing in the registry takes it back off: it is a cost, not a state the
    // player manages. Deferring or declining something else leaves it exactly
    // where it was.
    dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:accounts' });
    expect(player(FIELDS.refocusUntil)).toBe(until);
  });

  /**
   * The other half of the cost model, and the half a benign call is FOR: a
   * call can be how a ticket moves, so the evidence goes on the ticket and the
   * player pays nothing for having taken it.
   */
  it('costs a benign one nothing, and writes the touch onto its ticket', () => {
    const result = dispatch(DAY_ACTIONS.interruptionAccept, TICKET, {
      id: 'call:reporter',
      touches: '12|interruption.accept|ok',
    });

    expect(result.ok).toBe(true);
    expect(player(FIELDS.refocusUntil)).toBeUndefined();
    expect(isRefocusing(player(FIELDS.refocusUntil), fixture.now())).toBe(false);
    expect(fixture.graph.getField(TICKET, FIELDS.touchLog))
      .toBe('12|interruption.accept|ok');
  });

  it('refuses a call claiming to be about something that is not a ticket', () => {
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionAccept, OTHER, {
        id: 'call:reporter',
        touches: '12|interruption.accept|ok',
      }),
      'about a ticket or it is about nothing',
    );
    expect(lines(FIELDS.interruptionAnswered)).toEqual([]);
  });

  it('refuses a call about a ticket that is not there', () => {
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionAccept, 'ticket:nowhere', {
        id: 'call:reporter',
        touches: '12|interruption.accept|ok',
      }),
      'no such ticket',
    );
  });

  it('refuses a ticket call that brought no record of what it moved', () => {
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionAccept, TICKET, { id: 'call:reporter' }),
      'record of it arrived empty',
    );
    expect(fixture.graph.getField(TICKET, FIELDS.touchLog)).toBeUndefined();
  });

  it('refuses one that nobody named', () => {
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionAccept, null, { id: '  ' }),
      'cannot be read back',
    );
  });
});

describe('the record of what was done', () => {
  it('puts each decision in exactly one of the three lists', () => {
    dispatch(DAY_ACTIONS.interruptionAccept, null, { id: 'call:printer' });
    dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:accounts' });
    dispatch(DAY_ACTIONS.interruptionDecline, null, {
      id: 'call:sales',
      declinable: 1,
    });

    expect(lines(FIELDS.interruptionAnswered)).toEqual(['call:printer']);
    expect(lines(FIELDS.interruptionDeferred)).toEqual(['call:accounts']);
    expect(lines(FIELDS.interruptionDeclined)).toEqual(['call:sales']);
  });

  /**
   * The record has to survive the thing that drains the dispatch log, which is
   * the whole reason it is graph state rather than a log read. A checkpoint is
   * exactly that event, and afterwards the world still knows.
   */
  it('survives the checkpoint that empties the dispatch log', () => {
    dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:accounts' });
    fixture.checkpoint();

    expect(fixture.dispatchLog()).toEqual([]);
    expect(lines(FIELDS.interruptionDeferred)).toEqual(['call:accounts']);
    // And the world still refuses the second push, which is the point of
    // remembering: the guard reads the graph, not the log.
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:accounts' }),
      ALREADY_DEFERRED_REASON,
    );
  });

  it('refuses to settle the same interruption twice, whichever way', () => {
    dispatch(DAY_ACTIONS.interruptionAccept, null, { id: 'call:printer' });

    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionAccept, null, { id: 'call:printer' }),
      ALREADY_SETTLED_REASON,
    );
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDecline, null, {
        id: 'call:printer',
        declinable: 1,
      }),
      ALREADY_SETTLED_REASON,
    );
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:printer' }),
      ALREADY_SETTLED_REASON,
    );
    expect(lines(FIELDS.interruptionAnswered)).toEqual(['call:printer']);
  });
});

describe('deferring', () => {
  it('re-queues once, and the second push is refused in words', () => {
    expect(dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:x' }).ok)
      .toBe(true);
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:x' }),
      ALREADY_DEFERRED_REASON,
    );
    expect(lines(FIELDS.interruptionDeferred)).toEqual(['call:x']);
  });

  /**
   * The rule the whole verb exists for: asking somebody to call back does not
   * buy the right to refuse them when they do. The second arrival is the
   * conversation, and the world says so rather than the window hiding a button.
   */
  it('makes the second arrival undeclinable, whatever the entry said', () => {
    dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:x' });

    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDecline, null, {
        id: 'call:x',
        declinable: 1,
      }),
      ALREADY_DEFERRED_REASON,
    );
    expect(lines(FIELDS.interruptionDeclined)).toEqual([]);

    // Answering it, though, is exactly what is left - and it is a malignant
    // one, so it costs what a malignant one costs.
    const now = fixture.now();
    expect(dispatch(DAY_ACTIONS.interruptionAccept, null, { id: 'call:x' }).ok)
      .toBe(true);
    expect(player(FIELDS.refocusUntil)).toBe(now + REFOCUS_TICKS);
  });

  it('costs no focus on its own - you did not have the conversation', () => {
    dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:x' });
    expect(player(FIELDS.refocusUntil)).toBeUndefined();
  });
});

describe('declining', () => {
  it('is legal only where the entry says it is', () => {
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDecline, null, {
        id: 'meeting:hygiene',
        declinable: 0,
      }),
      NOT_DECLINABLE_REASON,
    );
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDecline, null, {
        id: 'meeting:hygiene',
      }),
      NOT_DECLINABLE_REASON,
    );
    expect(lines(FIELDS.interruptionDeclined)).toEqual([]);

    expect(dispatch(DAY_ACTIONS.interruptionDecline, null, {
      id: 'call:sales',
      declinable: 1,
    }).ok).toBe(true);
    expect(lines(FIELDS.interruptionDeclined)).toEqual(['call:sales']);
  });
});

describe('the whole grammar, replayed', () => {
  /**
   * The journey rather than the transitions: a morning of interruptions,
   * answered three different ways, ends with a world that says exactly what
   * happened - and says the same thing after the graph has been hashed,
   * checkpointed and read back.
   */
  it('leaves one readable record of a morning nobody enjoyed', () => {
    dispatch(DAY_ACTIONS.interruptionDefer, null, { id: 'call:accounts' });
    dispatch(DAY_ACTIONS.interruptionDecline, null, {
      id: 'call:sales',
      declinable: 1,
    });
    dispatch(DAY_ACTIONS.interruptionAccept, TICKET, {
      id: 'call:reporter',
      touches: '20|interruption.accept|ok',
    });
    dispatch(DAY_ACTIONS.interruptionAccept, null, { id: 'call:accounts' });

    expect(lines(FIELDS.interruptionAnswered))
      .toEqual(['call:reporter', 'call:accounts']);
    expect(lines(FIELDS.interruptionDeclined)).toEqual(['call:sales']);
    expect(lines(FIELDS.interruptionDeferred)).toEqual(['call:accounts']);
    // One malignant call was taken, so the player is looking for their place -
    // and the benign one before it left the ticket its evidence.
    expect(isRefocusing(player(FIELDS.refocusUntil), fixture.now())).toBe(true);
    expect(fixture.graph.getField(TICKET, FIELDS.touchLog))
      .toBe('20|interruption.accept|ok');
  });
});
