import { beforeEach, describe, expect, it } from 'vitest';

import type {
  DispatchResult,
  FieldValue,
  SetupOp,
} from '../../engine-api';
import { WasmEngine } from '../../engine-api';
import { FIELDS } from '../fields';
import { helpdeskActionPayload } from './index';
import { SOFTWARE_ACTIONS } from './ids';
import { INSTALL_TWICE_REASON, UNINSTALL_TWICE_REASON } from './software';

/**
 * The two web-store verbs, driven against the shipped wasm core with the
 * shipped verb set. Nothing here is a mock: the trail these write is the trail
 * the lead's beat arms off, and the refusals are the sentences a player reads.
 */
const ACTOR = 'person:tech';

function setup(): readonly SetupOp[] {
  return [
    {
      op: 'addNode',
      node: { id: ACTOR, kind: 'person', fields: { name: 'Pat Pending' } },
    },
  ];
}

function createFixture(): WasmEngine {
  const engine = new WasmEngine(0x1_2345);
  engine.applySetup(setup());
  engine.registerActions(helpdeskActionPayload());
  return engine;
}

let fixture: WasmEngine;

function dispatch(
  id: string,
  params: Record<string, FieldValue> = {},
): DispatchResult {
  return fixture.dispatch(id, ACTOR, null, params);
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
}

beforeEach(() => {
  fixture = createFixture();
});

describe('installing software', () => {
  it('writes the install onto the audit trail', () => {
    expect(dispatch(SOFTWARE_ACTIONS.install, {
      id: 'arcade',
      line: 'arcade@40',
    }).ok).toBe(true);

    expect(lines(FIELDS.installAudit)).toEqual(['arcade@40']);
  });

  it('refuses an install with nothing on it', () => {
    expectRefusal(
      dispatch(SOFTWARE_ACTIONS.install, { id: '', line: '' }),
      'nobody wrote down what',
    );
    expect(lines(FIELDS.installAudit)).toEqual([]);
  });

  it('refuses an install line with no minute on it', () => {
    expectRefusal(
      dispatch(SOFTWARE_ACTIONS.install, { id: 'arcade', line: '' }),
      'which minute it happened on',
    );
  });

  it('refuses logging the same install in the same minute twice', () => {
    expect(dispatch(SOFTWARE_ACTIONS.install, {
      id: 'arcade',
      line: 'arcade@40',
    }).ok).toBe(true);

    expectRefusal(
      dispatch(SOFTWARE_ACTIONS.install, { id: 'arcade', line: 'arcade@40' }),
      INSTALL_TWICE_REASON,
    );

    // But a later minute is a new record - install, uninstall, reinstall is a
    // real sequence and the trail carries all of it.
    expect(dispatch(SOFTWARE_ACTIONS.install, {
      id: 'arcade',
      line: 'arcade@95',
    }).ok).toBe(true);
    expect(lines(FIELDS.installAudit)).toEqual(['arcade@40', 'arcade@95']);
  });
});

describe('uninstalling software', () => {
  /**
   * The goal, not the call: the whole point of the slice is that uninstalling
   * leaves the record that it WAS installed. So the assertion is what the two
   * trails hold after a removal, not that the dispatch returned ok.
   */
  it('records the removal and LEAVES the install on the audit', () => {
    expect(dispatch(SOFTWARE_ACTIONS.install, {
      id: 'arcade',
      line: 'arcade@40',
    }).ok).toBe(true);

    expect(dispatch(SOFTWARE_ACTIONS.uninstall, {
      id: 'arcade',
      line: 'arcade@70',
    }).ok).toBe(true);

    // Covering your tracks is itself a tell: the install stays exactly where it
    // was, and the removal is a second line of evidence, not an eraser.
    expect(lines(FIELDS.installAudit)).toEqual(['arcade@40']);
    expect(lines(FIELDS.installRemoved)).toEqual(['arcade@70']);
  });

  it('refuses logging the same removal in the same minute twice', () => {
    expect(dispatch(SOFTWARE_ACTIONS.uninstall, {
      id: 'arcade',
      line: 'arcade@70',
    }).ok).toBe(true);

    expectRefusal(
      dispatch(SOFTWARE_ACTIONS.uninstall, { id: 'arcade', line: 'arcade@70' }),
      UNINSTALL_TWICE_REASON,
    );
  });
});
