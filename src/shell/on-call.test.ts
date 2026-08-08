/**
 * On-call, driven end to end through the shipped driver and the shipped engine
 * (E6, 0.17.0): the whole loop on the real path, minus the browser.
 *
 * The promotion is taken, a page fires when the engineer clocks off into an
 * on-call night, and the four ways it can end are each reached the way a player
 * reaches them - a real fire answered by the actual ssh + systemctl restart, a
 * real fire left to breach into downtime, a flap that settles itself on its
 * seeded clock, and a flap scrambled for. The teeth are here: the flap
 * auto-clears deterministically and the fire does NOT, a missed fire costs
 * standing, a scramble costs stress, and a service-desk player is paged with
 * none of it.
 *
 * Nothing below touches the DOM, so the driver runs exactly as it does in the
 * browser. The world is the MSP's, whose own FC-RMM-01 carries the units the
 * pages are about.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import {
  CAREER_ACTIONS,
  PROMOTION_REPUTATION,
} from '../world/actions';
import { COMPANY_IDS } from '../world/company';
import { shiftStartTick } from '../world/day';
import { FIELDS, PLAYER_TIERS, SYSTEMD_STATES } from '../world/fields';
import { MSP_CHANNELS, MSP_IDS } from '../world/msp-company';
import { MSP_WEEK } from '../world/msp-week';
import {
  ON_CALL_ANSWERED_REPUTATION,
  ON_CALL_MISS_REPUTATION,
  ON_CALL_SCRAMBLE_STRESS,
} from '../world/on-call';
import { createWorldSession, WORLD_SEED, type WorldSession } from '../world/session';
import { AppStateStore } from './app-state';
import { parseCommand } from './apps/cmd-parse';
import { executeCommand } from './apps/cmd-run';
import { executeUnix, parseUnixCommand } from './apps/cmd-unix';
import type { GameApi } from './apps/types';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

const MSP_CARRY = {
  farmFund: 0,
  attempt: 1,
  arcWeek: 1,
  employer: 'msp',
} as const;

const NGINX_UNIT = MSP_IDS.mspInfraNginxUnit;
const CRON_UNIT = MSP_IDS.mspInfraCronUnit;

interface Rig {
  readonly session: WorldSession;
  readonly driver: DayDriver;
  readonly api: GameApi;
  readonly toasts: { title: string; body: string }[];
}

function rig(): Rig {
  const session = createWorldSession(MSP_CARRY);
  const toasts: { title: string; body: string }[] = [];
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
    onDayBoundary: () => {},
    openSlackApps: () => [],
    focusedSlackApp: () => null,
    onNotice: (title, body) => {
      toasts.push({ title, body });
    },
  }, undefined, MSP_WEEK, MSP_CHANNELS);
  const api: GameApi = {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    day: driver,
    dispatch: (id, actor, target, params) => session.engine.dispatch(
      id,
      actor,
      target,
      params,
    ),
    dispatchLog: () => session.engine.dispatchLog(),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener) => session.engine.onTick(listener),
    },
    onWorldChange: (listener) => session.engine.onEvent(() => {
      listener();
    }),
    notify: () => {},
    report: () => Promise.resolve({ ok: true, value: undefined }),
    openApp: () => {},
    closeApp: () => {},
    hasApp: () => false,
    installApp: () => ({ ok: true }),
    uninstallApp: () => ({ ok: true }),
    setDesktop: () => ({ ok: true }),
    restartWeek: () => {},
    acceptOffer: () => {},
    employer: 'msp',
    actor: COMPANY_IDS.player,
  };

  return { session, driver, api, toasts };
}

/** Take the Systems Engineer offer through the real dispatch. */
function promote(session: WorldSession): void {
  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: PROMOTION_REPUTATION,
  }]);
  session.engine.dispatch(
    CAREER_ACTIONS.acceptPromotion,
    COMPANY_IDS.player,
    COMPANY_IDS.player,
    {},
  );
}

function unitState(session: WorldSession, unit: string): unknown {
  return session.engine.graph.getField(unit, FIELDS.unitState);
}

function meter(session: WorldSession, field: string): number {
  const value = session.engine.graph.getField(COMPANY_IDS.player, field);
  return typeof value === 'number' ? value : 0;
}

function settledAs(session: WorldSession): string {
  const value = session.engine.graph.getField(
    COMPANY_IDS.player,
    FIELDS.onCallSettledAs,
  );
  return typeof value === 'string' ? value : '';
}

/** Step the clock a fixed number of simulated minutes inside a shift. */
function stepMinutes(driver: DayDriver, minutes: number): void {
  for (let i = 0; i < minutes && driver.state() === 'shift'; i += 1) {
    driver.step(TICK_INTERVAL_MS);
  }
}

/** Play the current day out to its end and clock off into the night. */
function endDay(driver: DayDriver): void {
  driver.startShift();

  while (driver.state() === 'shift') {
    driver.step(TICK_INTERVAL_MS);
  }

  driver.clockOff();
}

/** Clock off day after day until the morning of `day`, firing the nights. */
function reachMorning(driver: DayDriver, day: number): void {
  while (driver.day() < day) {
    endDay(driver);
  }
}

/** ssh onto FC-RMM-01 and run one unix line - the real fix path. */
function sshRun(api: GameApi, line: string): void {
  const session = executeCommand(
    parseCommand('ssh engineer@FC-RMM-01'),
    api,
  ).enterSession;

  if (session === undefined) {
    throw new Error('ssh did not open a session on FC-RMM-01');
  }

  executeUnix(parseUnixCommand(line), api, session);
}

describe('on-call: the 3am page, on the real path (E6)', () => {
  it('pages no service-desk player - the pager is the engineer tier\'s', () => {
    const { session, driver } = rig();

    // No promotion: a Tier-2 desk player, driven through the on-call night.
    reachMorning(driver, 3);

    expect(session.engine.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
      .not.toBe(PLAYER_TIERS.systemsEngineer);
    // The night fired nothing: the unit the page is about is untouched, and the
    // page surface is empty.
    expect(unitState(session, NGINX_UNIT)).toBe(SYSTEMD_STATES.activeRunning);
    expect(driver.onCallPages()).toHaveLength(0);
    expect(session.engine.graph.getField(COMPANY_IDS.player, FIELDS.onCallFired))
      .toBeUndefined();
  });

  it('fires a real page overnight: the unit goes failed, and it wakes you', () => {
    const { session, driver, toasts } = rig();
    promote(session);

    reachMorning(driver, 2);
    endDay(driver); // clock off Tuesday -> the reverse-proxy page fires

    // A REAL fault, not a string: nginx is failed on the box, with its journal.
    expect(unitState(session, NGINX_UNIT)).toBe(SYSTEMD_STATES.failed);
    expect(session.engine.graph.getField(NGINX_UNIT, FIELDS.unitJournal))
      .toContain('Failed to start');

    // You were woken now: a pager toast, severity and box named, not a morning
    // brief item.
    const page = toasts.find((t) => t.title.startsWith('Pager:'));
    expect(page).toBeDefined();
    expect(page?.title).toContain('SEV-1');
    expect(page?.title).toContain('FC-RMM-01');

    // And it reads on the page surface as a live fire needing the fix.
    const pages = driver.onCallPages();
    expect(pages).toHaveLength(1);
    expect(pages[0]?.kind).toBe('real');
    expect(pages[0]?.unitFailed).toBe(true);
    expect(pages[0]?.outcome).toBeNull();
  });

  it('answers a real page by the ssh + restart fix: uptime saved, standing up', () => {
    const { session, driver, api } = rig();
    promote(session);

    reachMorning(driver, 2);
    endDay(driver); // fire the nginx page (night 2)
    const before = meter(session, FIELDS.reputation);

    // The real fix: ssh in and restart the unit, exactly as a player would.
    driver.startShift();
    sshRun(api, 'systemctl restart nginx');
    expect(unitState(session, NGINX_UNIT)).toBe(SYSTEMD_STATES.activeRunning);

    // The settle banks it off the unit state the restart wrote.
    stepMinutes(driver, 1);

    expect(settledAs(session)).toContain('page/fc-nginx-down@answered');
    expect(meter(session, FIELDS.reputation))
      .toBe(before + ON_CALL_ANSWERED_REPUTATION);
    expect(driver.onCallPages()[0]?.outcome).toBe('answered');
  });

  it('a real fire NEVER settles itself - only the fix brings it back (teeth)', () => {
    const { session, driver } = rig();
    promote(session);

    reachMorning(driver, 2);
    endDay(driver); // fire the nginx page (night 2)

    // Sit the whole on-call day out without touching it. A flap would have
    // cleared in minutes; a real fire does not - if it auto-cleared, this reds.
    driver.startShift();
    stepMinutes(driver, 120);

    expect(unitState(session, NGINX_UNIT)).toBe(SYSTEMD_STATES.failed);
    expect(driver.onCallPages()[0]?.outcome).toBeNull();
  });

  it('a missed real page is downtime, read at the review as lost standing', () => {
    const { session, driver } = rig();
    promote(session);

    reachMorning(driver, 2);
    endDay(driver); // fire the nginx page (night 2)

    // Never fix it: run the on-call day out with the unit still down. The miss
    // is charged at the clock-off, so pin the standing to a clean value right
    // before it, past the day's own ticket breaches, to read the page's cost
    // alone - nothing but the miss moves reputation across the clock-off.
    driver.startShift();

    while (driver.state() === 'shift') {
      driver.step(TICK_INTERVAL_MS);
    }

    session.engine.applySetup([{
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.reputation,
      value: 50,
    }]);
    driver.clockOff();

    expect(settledAs(session)).toContain('page/fc-nginx-down@missed');
    expect(meter(session, FIELDS.reputation)).toBe(50 - ON_CALL_MISS_REPUTATION);
  });

  it('a flap settles itself on its seeded clock if you wait a beat (teeth)', () => {
    const { session, driver } = rig();
    promote(session);

    reachMorning(driver, 3);
    endDay(driver); // clock off Wednesday -> the timer FLAP fires (night 3)

    // At 3am it looked exactly like a fire: the unit is failed, so telling them
    // apart needs a look. Day 4 opens with it still down.
    expect(unitState(session, CRON_UNIT)).toBe(SYSTEMD_STATES.failed);

    driver.startShift();
    // A beat before the seeded clear-time: still down (do not jump yet).
    stepMinutes(driver, 3);
    expect(unitState(session, CRON_UNIT)).toBe(SYSTEMD_STATES.failed);

    // Wait past it: it settles ITSELF, no fix, no cost.
    const repBefore = meter(session, FIELDS.reputation);
    stepMinutes(driver, 25);
    expect(unitState(session, CRON_UNIT)).toBe(SYSTEMD_STATES.activeRunning);
    expect(settledAs(session)).toContain('page/fc-backup-flap@cleared');
    expect(meter(session, FIELDS.reputation)).toBe(repBefore);
  });

  it('scrambling for a flap - ssh in and restart it - costs the wasted night', () => {
    const { session, driver, api } = rig();
    promote(session);

    reachMorning(driver, 3);
    endDay(driver); // fire the timer flap (night 3)

    driver.startShift();
    // We are before the flap's clear-time, so a restart now is a scramble. Pin
    // stress to the floor first, so the fatigue charge is read past the day's
    // own queue pressure - the scramble puts it up from nothing.
    expect(session.engine.now()).toBeLessThan(shiftStartTick(driver.day()) + 5);
    session.engine.applySetup([{
      op: 'setField',
      id: COMPANY_IDS.player,
      field: FIELDS.stress,
      value: 0,
    }]);

    sshRun(api, 'systemctl restart cron');
    stepMinutes(driver, 1);

    expect(settledAs(session)).toContain('page/fc-backup-flap@scrambled');
    expect(meter(session, FIELDS.stress))
      .toBeGreaterThanOrEqual(ON_CALL_SCRAMBLE_STRESS);
  });
});
