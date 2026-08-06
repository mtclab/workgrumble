import { beforeEach, describe, expect, it } from 'vitest';

import { WasmEngine } from '../../engine-api';
import { FIELDS, SYSTEMD_STATES } from '../fields';
import { helpdeskActionPayload } from './index';
import { SYSTEMD_ACTIONS } from './ids';

/**
 * The systemd verbs (E6, Pass B), at the engine level: the Linux twin of
 * `serviceRestart`, proven to flip a `unit` node's `unit_state` the way the
 * shell's `systemctl restart/start/stop` need it to - and to refuse a target
 * that is not a unit, so the fix path can never be pointed at the wrong kind.
 */
const ACTOR = 'person:tech';
const UNIT = 'unit:fc-rmm-01/fcportal.service';
const MACHINE = 'machine:fc-rmm-01';

let engine: WasmEngine;

function build(state: string): WasmEngine {
  const built = new WasmEngine(0x5_1234);
  built.setTier(1);
  built.applySetup([
    {
      op: 'addNode',
      node: {
        id: MACHINE,
        kind: 'machine',
        fields: { [FIELDS.hostname]: 'FC-RMM-01' },
      },
    },
    {
      op: 'addNode',
      node: {
        id: UNIT,
        kind: 'unit',
        fields: {
          [FIELDS.unitName]: 'fcportal.service',
          [FIELDS.unitState]: state,
        },
      },
    },
    { op: 'addEdge', edge: { from: UNIT, to: MACHINE, kind: 'runs_on' } },
  ]);
  built.registerActions(helpdeskActionPayload());
  return built;
}

beforeEach(() => {
  engine = build(SYSTEMD_STATES.failed);
});

describe('systemd unit verbs', () => {
  it('restart brings a failed unit to active (running)', () => {
    const result = engine.dispatch(SYSTEMD_ACTIONS.unitRestart, ACTOR, UNIT, {});

    expect(result.ok).toBe(true);
    expect(engine.graph.getField(UNIT, FIELDS.unitState))
      .toBe(SYSTEMD_STATES.activeRunning);
  });

  it('start brings an inactive unit up', () => {
    engine = build(SYSTEMD_STATES.inactiveDead);
    engine.dispatch(SYSTEMD_ACTIONS.unitStart, ACTOR, UNIT, {});

    expect(engine.graph.getField(UNIT, FIELDS.unitState))
      .toBe(SYSTEMD_STATES.activeRunning);
  });

  it('stop takes a running unit down to inactive (dead)', () => {
    engine = build(SYSTEMD_STATES.activeRunning);
    engine.dispatch(SYSTEMD_ACTIONS.unitStop, ACTOR, UNIT, {});

    expect(engine.graph.getField(UNIT, FIELDS.unitState))
      .toBe(SYSTEMD_STATES.inactiveDead);
  });

  it('refuses a target that is not a unit, and changes nothing', () => {
    const before = engine.snapshotHash();
    const result = engine.dispatch(SYSTEMD_ACTIONS.unitRestart, ACTOR, MACHINE, {});

    expect(result.ok).toBe(false);
    expect(engine.snapshotHash()).toBe(before);
  });
});
