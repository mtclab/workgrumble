/**
 * The dot's verbs, driven against the shipped wasm core with the shipped verb
 * set.
 *
 * Nothing here is a mock. The guard that refuses to slide a meeting past a red
 * dot is the guard the game registers, the sentence is the one a player reads,
 * and the fields it writes are the fields a save carries. What this floor
 * cannot prove is that anything ever dispatches them; the driver's journeys
 * one floor up do that.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { DispatchResult, FieldValue, SetupOp } from '../../engine-api';
import { WasmEngine } from '../../engine-api';
import { FIELDS } from '../fields';
import { METER_INTERVAL_TICKS, STARTING_REPUTATION } from '../meters';
import {
  AWAY_NOTICED_REPUTATION,
  DND_WORKING_SUSPICION,
  PRESENCE_VALUES,
  presenceCode,
} from '../presence';
import { helpdeskActionPayload } from './index';
import { DAY_ACTIONS, WORLD_ACTIONS } from './ids';
import {
  AWAY_ALREADY_NOTICED_REASON,
  DOT_IGNORED_REASON,
  DOT_NOT_ON_REASON,
  NOT_AWAY_REASON,
  PRESENCE_OFF_SHIFT_REASON,
  PRESENCE_UNKNOWN_REASON,
} from './presence';

const ACTOR = 'person:tech';
const REPORTER = 'person:nina';

function setup(state: string): readonly SetupOp[] {
  return [
    {
      op: 'addNode',
      node: {
        id: ACTOR,
        kind: 'person',
        fields: {
          name: 'Pat Pending',
          [FIELDS.dayState]: state,
          [FIELDS.reputation]: STARTING_REPUTATION,
          // The meters the interval tick moves. They are seeded because the op
          // language adds to a number it can read, and a player node with no
          // stress on it is a world nobody has started - which is a different
          // test from any of these.
          [FIELDS.stress]: 0,
          [FIELDS.suspicion]: 0,
          [FIELDS.suspicionEvents]: 0,
          [FIELDS.breachesCharged]: 0,
          [FIELDS.resolveCreditPaid]: 0,
        },
      },
    },
  ];
}

function createFixture(state = 'shift'): WasmEngine {
  const engine = new WasmEngine(0x1_2345);

  engine.applySetup(setup(state));
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

function setDot(presence: (typeof PRESENCE_VALUES)[number]): DispatchResult {
  return dispatch(DAY_ACTIONS.presenceSet, { dot: presenceCode(presence) });
}

function player(field: string): FieldValue | undefined {
  return fixture.graph.getField(ACTOR, field);
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

/* -- setting it ------------------------------------------------------------ */

describe('setting the dot', () => {
  it('writes the word the office reads, not the number the tray sent', () => {
    for (const presence of PRESENCE_VALUES) {
      expect(setDot(presence).ok, presence).toBe(true);
      expect(player(FIELDS.presence), presence).toBe(presence);
    }
  });

  /**
   * The whole determinism argument in one assertion: a player who never
   * touches the tray has no field at all, so the graph a scripted week ends on
   * is the graph it ended on before any of this existed.
   */
  it('leaves the field absent until somebody sets one', () => {
    expect(player(FIELDS.presence)).toBeUndefined();
  });

  it('refuses a status this building cannot read', () => {
    expectRefusal(
      dispatch(DAY_ACTIONS.presenceSet, { dot: PRESENCE_VALUES.length }),
      PRESENCE_UNKNOWN_REASON,
    );
    expectRefusal(
      dispatch(DAY_ACTIONS.presenceSet, { dot: -1 }),
      PRESENCE_UNKNOWN_REASON,
    );
    // And a dispatch that says nothing at all, which is the shape of a surface
    // that forgot the parameter rather than one that chose a fourth status.
    expectRefusal(
      dispatch(DAY_ACTIONS.presenceSet, {}),
      PRESENCE_UNKNOWN_REASON,
    );
    expect(player(FIELDS.presence)).toBeUndefined();
  });

  it('refuses a dot set into an empty building', () => {
    fixture = createFixture('morning_brief');
    expectRefusal(setDot('dnd'), PRESENCE_OFF_SHIFT_REASON);

    fixture = createFixture('day_end');
    expectRefusal(setDot('away'), PRESENCE_OFF_SHIFT_REASON);
    expect(player(FIELDS.presence)).toBeUndefined();
  });
});

/* -- sliding a call past it ------------------------------------------------ */

describe('a call sliding past the dot', () => {
  it('records the minute it slid at, because the next one is measured from it', () => {
    expect(setDot('dnd').ok).toBe(true);
    expect(dispatch(DAY_ACTIONS.interruptionDodged, {
      id: 'call:spooler',
      dodged_at: 'call:spooler@610',
      declinable: 1,
    }).ok).toBe(true);
    expect(player(FIELDS.interruptionDodged)).toBe('call:spooler@610');
    // And nothing else moved: no arrival was charged, because nothing arrived.
    expect(player(FIELDS.stress)).toBe(0);
    expect(player(FIELDS.interruptionPostpones)).toBeUndefined();
  });

  /**
   * The world's half of the filter, and the reason it is a verb rather than a
   * branch in the driver: a shell that decided for itself could slide a call
   * past a player who is showing Available, and nothing would ever say so.
   */
  it('refuses to slide anything past a dot that is not on', () => {
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDodged, {
        id: 'call:spooler',
        dodged_at: 'call:spooler@610',
        declinable: 1,
      }),
      DOT_NOT_ON_REASON,
    );

    expect(setDot('away').ok).toBe(true);
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDodged, {
        id: 'call:spooler',
        dodged_at: 'call:spooler@610',
        declinable: 1,
      }),
      DOT_NOT_ON_REASON,
    );
    expect(player(FIELDS.interruptionDodged)).toBeUndefined();
  });

  it('refuses to slide the sync or the workstation past it', () => {
    expect(setDot('dnd').ok).toBe(true);
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDodged, {
        id: 'meeting:hygiene-sync',
        dodged_at: 'meeting:hygiene-sync@630',
        declinable: 0,
      }),
      DOT_IGNORED_REASON,
    );
    expect(player(FIELDS.interruptionDodged)).toBeUndefined();
  });

  it('refuses to slide the same one twice in the minute it did not ring in', () => {
    expect(setDot('dnd').ok).toBe(true);

    const slide = { id: 'call:spooler', dodged_at: 'call:spooler@610', declinable: 1 };

    expect(dispatch(DAY_ACTIONS.interruptionDodged, slide).ok).toBe(true);
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionDodged, slide),
      'cannot decline to ring twice',
    );
    // The next minute is a different minute and a different slide.
    expect(dispatch(DAY_ACTIONS.interruptionDodged, {
      ...slide,
      dodged_at: 'call:spooler@630',
    }).ok).toBe(true);
    expect(player(FIELDS.interruptionDodged))
      .toBe('call:spooler@610\ncall:spooler@630');
  });

  /**
   * The drop, recorded like a ring-out and costing none of what a ring-out
   * costs. The window a missed call leaves behind is the RINGING; this one
   * never rang, so the record is the whole of it - and the record is the point,
   * because it is what somebody can read later.
   */
  it('leaves the record of a phone that never rang, and no window', () => {
    expect(dispatch(DAY_ACTIONS.interruptionMissed, {
      id: 'call:spooler',
      benign: 0,
      rang: 0,
    }).ok).toBe(true);
    expect(player(FIELDS.interruptionMissed)).toBe('call:spooler');
    expect(player(FIELDS.refocusUntil)).toBeUndefined();
  });

  it('still charges the window for one that actually rang out', () => {
    expect(dispatch(DAY_ACTIONS.interruptionMissed, {
      id: 'call:spooler',
      benign: 0,
    }).ok).toBe(true);
    expect(player(FIELDS.refocusUntil)).toBe(fixture.now() + 11);
  });

  it('refuses a dispatch that cannot say whether it rang', () => {
    expectRefusal(
      dispatch(DAY_ACTIONS.interruptionMissed, {
        id: 'call:spooler',
        benign: 0,
        rang: 2,
      }),
      'actually rang at the desk is a yes or a no',
    );
  });
});

/* -- the drip's evidence --------------------------------------------------- */

describe('the minutes the record banks', () => {
  it('adds them up while the dot is on', () => {
    expect(setDot('dnd').ok).toBe(true);

    for (let interval = 1; interval <= 3; interval += 1) {
      expect(dispatch(DAY_ACTIONS.metersTick, {
        stress_up: 0,
        stress_down: 0,
        suspicion_up: DND_WORKING_SUSPICION,
        suspicion_down: 0,
        reputation_up: 0,
        reputation_down: 0,
        suspicion_events_up: 1,
        breaches_charged: 0,
        resolve_credit_paid: 0,
        dnd_ticks_up: METER_INTERVAL_TICKS,
      }).ok).toBe(true);
      expect(player(FIELDS.dndWorkingTicks))
        .toBe(METER_INTERVAL_TICKS * interval);
    }

    expect(player(FIELDS.suspicion)).toBe(DND_WORKING_SUSPICION * 3);
  });

  /**
   * The world is the half that knows what the dot says, so a driver cannot
   * bank half an hour of do not disturb against a player showing Available.
   */
  it('refuses minutes of a dot nobody is showing', () => {
    expectRefusal(
      dispatch(DAY_ACTIONS.metersTick, {
        stress_up: 0,
        stress_down: 0,
        suspicion_up: 0,
        suspicion_down: 0,
        reputation_up: 0,
        reputation_down: 0,
        suspicion_events_up: 0,
        breaches_charged: 0,
        resolve_credit_paid: 0,
        dnd_ticks_up: METER_INTERVAL_TICKS,
      }),
      'minutes of a dot nobody is showing',
    );
  });

  it('writes nothing at all for an interval that banked none', () => {
    expect(dispatch(DAY_ACTIONS.metersTick, {
      stress_up: 1,
      stress_down: 0,
      suspicion_up: 0,
      suspicion_down: 0,
      reputation_up: 0,
      reputation_down: 0,
      suspicion_events_up: 0,
      breaches_charged: 0,
      resolve_credit_paid: 0,
      dnd_ticks_up: 0,
    }).ok).toBe(true);
    // Not nought: absent. A field that appeared on every player node the first
    // time the meters ticked would move every golden in the suite.
    expect(player(FIELDS.dndWorkingTicks)).toBeUndefined();
  });
});

/* -- somebody noticing the away dot ---------------------------------------- */

describe('somebody waiting on a ticket, noticing', () => {
  it('costs reputation once and writes down who has had the thought', () => {
    expect(setDot('away').ok).toBe(true);
    expect(dispatch(WORLD_ACTIONS.presenceNoticed, {
      reporter: REPORTER,
      mark: `${REPORTER}@2`,
      reputation_down: AWAY_NOTICED_REPUTATION,
    }).ok).toBe(true);

    expect(player(FIELDS.reputation))
      .toBe(STARTING_REPUTATION - AWAY_NOTICED_REPUTATION);
    expect(player(FIELDS.presenceNoticed)).toBe(`${REPORTER}@2`);
  });

  it('is one thought per person per day, and the world counts it', () => {
    expect(setDot('away').ok).toBe(true);

    const noticed = {
      reporter: REPORTER,
      mark: `${REPORTER}@2`,
      reputation_down: AWAY_NOTICED_REPUTATION,
    };

    expect(dispatch(WORLD_ACTIONS.presenceNoticed, noticed).ok).toBe(true);
    expectRefusal(
      dispatch(WORLD_ACTIONS.presenceNoticed, noticed),
      AWAY_ALREADY_NOTICED_REASON,
    );
    expect(player(FIELDS.reputation))
      .toBe(STARTING_REPUTATION - AWAY_NOTICED_REPUTATION);

    // Tomorrow is a different day and the same person can have it again.
    expect(dispatch(WORLD_ACTIONS.presenceNoticed, {
      ...noticed,
      mark: `${REPORTER}@3`,
    }).ok).toBe(true);
    expect(player(FIELDS.reputation))
      .toBe(STARTING_REPUTATION - AWAY_NOTICED_REPUTATION * 2);
  });

  it('refuses to fine anybody for a dot they are not showing', () => {
    expectRefusal(
      dispatch(WORLD_ACTIONS.presenceNoticed, {
        reporter: REPORTER,
        mark: `${REPORTER}@2`,
        reputation_down: AWAY_NOTICED_REPUTATION,
      }),
      NOT_AWAY_REASON,
    );

    expect(setDot('dnd').ok).toBe(true);
    expectRefusal(
      dispatch(WORLD_ACTIONS.presenceNoticed, {
        reporter: REPORTER,
        mark: `${REPORTER}@2`,
        reputation_down: AWAY_NOTICED_REPUTATION,
      }),
      NOT_AWAY_REASON,
    );
    expect(player(FIELDS.reputation)).toBe(STARTING_REPUTATION);
  });

  it('refuses an escalation with no name on it', () => {
    expect(setDot('away').ok).toBe(true);
    expectRefusal(
      dispatch(WORLD_ACTIONS.presenceNoticed, {
        reporter: '',
        mark: `${REPORTER}@2`,
        reputation_down: AWAY_NOTICED_REPUTATION,
      }),
      'nobody wrote down who',
    );
  });
});
