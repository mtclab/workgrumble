/**
 * The lead reading the install audit, driven through the shipped driver and the
 * shipped engine.
 *
 * Lane A proved the world half: the verbs write the trail, `installAuditBeat` is
 * a predicate over evidence, the drip charges suspicion. What is here is the
 * half the player actually meets - installing a toy off the store and having a
 * man come down the corridor about the install LOG rather than the screen - and
 * every assertion is about a state somebody REACHES, not about a dispatch having
 * returned.
 *
 * No DOM: the window that draws the scene is e2e's. What a window can draw, and
 * what it is proof of, is decided here.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import type { InstallPolicy } from '../world/company';
import { COMPANY_IDS } from '../world/company';
import { conductEntries } from '../world/conduct';
import { shiftEndTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { parseInstallLedger } from '../world/software';
import { caughtScene, INSTALL_CAUGHT_KEY } from '../world/scenes';
import { createWorldSession, type WorldSession } from '../world/session';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
  /** Every scene the day put in front of the player, by what it was about. */
  readonly scenes: string[];
  /** What is on the screen, which the pressure layer reads for itself. */
  readonly slack: string[];
}

function harnessOn(day: number, policy: InstallPolicy = 'locked_down'): Harness {
  const session = createWorldSession();
  const scenes: string[] = [];
  const slack: string[] = [];
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, session.seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [...slack],
    focusedSlackApp: () => (slack.length > 0 ? (slack[0] ?? null) : null),
    // The beat reads the policy on its own, because the audit trail survives an
    // uninstall and a wild-west shop logs installs that cost nothing.
    installPolicy: () => policy,
    onCaught: (appId) => {
      scenes.push(appId);
    },
  });

  for (let played = 1; played < day; played += 1) {
    driver.startShift();
    runTo(driver, session, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  scenes.length = 0;
  return { driver, session, scenes, slack };
}

function runTo(driver: DayDriver, session: WorldSession, tick: number): void {
  while (session.engine.now() < tick && driver.state() === 'shift') {
    driver.step(TICK_INTERVAL_MS);
  }
}

/** Runs the day until the lead puts a scene up, or the shift ends. */
function runUntilScene(world: Harness): void {
  while (world.scenes.length === 0 && world.driver.state() === 'shift') {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

function player(session: WorldSession, field: string): unknown {
  return session.engine.graph.getField(COMPANY_IDS.player, field);
}

function number(session: WorldSession, field: string): number {
  const value = player(session, field);
  return typeof value === 'number' ? value : 0;
}

function softwareLines(session: WorldSession): readonly string[] {
  return conductEntries(player(session, FIELDS.conductFile))
    .filter((entry) => entry.kind === 'software')
    .map((entry) => entry.text);
}

describe('the beat the install audit arms', () => {
  /**
   * The journey: a toy installed off the store ends with a man at the desk
   * asking about the install LOG, and the line he leaves is traceable to it.
   */
  it('brings the lead down about the install, with the audit behind him', () => {
    const world = harnessOn(1);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    // Installing wrote the trail, and the beat is armed off it - one line under
    // a locked-down policy is the whole of the evidence.
    expect(parseInstallLedger(player(world.session, FIELDS.installAudit)))
      .toHaveLength(1);
    expect(world.driver.installAuditBeat().armed).toBe(true);

    // Nothing has been said yet: arming is evidence, not a conversation.
    expect(world.scenes).toEqual([]);

    // The corridor decides WHEN, exactly as it does for a screen with a forum
    // on it - so this waits for him rather than summoning him.
    runUntilScene(world);

    expect(world.scenes).toEqual([INSTALL_CAUGHT_KEY]);
    // And the window has a scene to draw for it, rather than a blank telling-off.
    expect(caughtScene(INSTALL_CAUGHT_KEY)?.bossLine ?? '')
      .toContain('We keep a list');

    // THE RECORD: a software line, in the file's own passive voice, that says
    // it is a record IT holds rather than a window anybody saw.
    const lines = softwareLines(world.session);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Unauthorised software');
    expect(lines[0]).toContain('installation policy');
    // It is NOT filed as a screen: nothing was on the screen, and the file must
    // not say there was.
    expect(
      conductEntries(player(world.session, FIELDS.conductFile))
        .some((entry) => entry.kind === 'screen'),
    ).toBe(false);
  });

  /**
   * It cannot drum. Being spoken to advances the watermark to the length of the
   * trail, so the same install is not brought up the next time he walks past -
   * a fresh install is what re-arms it, not another lap of the corridor.
   */
  it('is one conversation per install, not one per corridor', () => {
    const world = harnessOn(1);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    runUntilScene(world);

    expect(world.scenes).toEqual([INSTALL_CAUGHT_KEY]);
    // The watermark has advanced to cover the whole trail, so the beat has
    // nothing new to say however many more times he comes past.
    expect(number(world.session, FIELDS.installNoticed)).toBe(1);
    expect(world.driver.installAuditBeat().armed).toBe(false);

    // The rest of the day, toy still installed, nobody touching the store: he
    // walks past again and again and says nothing new.
    runTo(world.driver, world.session, shiftEndTick(1));

    expect(world.scenes).toEqual([INSTALL_CAUGHT_KEY]);
    expect(softwareLines(world.session)).toHaveLength(1);
  });

  /**
   * And a FRESH install re-arms it: the watermark closes the list so far, not
   * the store. Install a second toy after being spoken to and there is a new
   * line past the watermark, so the next patrol has something to say again.
   */
  it('re-arms on a fresh install past the watermark', () => {
    const world = harnessOn(1);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    runUntilScene(world);
    expect(world.scenes).toHaveLength(1);
    expect(world.driver.installAuditBeat().armed).toBe(false);

    // A second program lands past the watermark.
    expect(world.driver.install('mediaplayer')).toEqual({ ok: true });
    expect(world.driver.installAuditBeat().armed).toBe(true);

    world.scenes.length = 0;
    runUntilScene(world);

    expect(world.scenes).toEqual([INSTALL_CAUGHT_KEY]);
    // Two software lines now, one per conversation, each about a real install.
    expect(softwareLines(world.session)).toHaveLength(2);
  });

  /**
   * The record outlives the app. Uninstalling takes the toy off the machine and
   * leaves the install line on the audit - which is worse evidence, not better -
   * so the beat is still armed and the conversation still happens.
   */
  it('still has something to say after the toy is uninstalled', () => {
    const world = harnessOn(1);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    // Straight back off again - covering the tracks, which is itself a tell.
    expect(world.driver.uninstall('arcade')).toEqual({ ok: true });

    // The install line is still on the trail; the removal is a separate record.
    expect(parseInstallLedger(player(world.session, FIELDS.installAudit)))
      .toHaveLength(1);
    expect(parseInstallLedger(player(world.session, FIELDS.installRemoved)))
      .toHaveLength(1);
    expect(world.driver.installAuditBeat().armed).toBe(true);

    runUntilScene(world);

    expect(world.scenes).toEqual([INSTALL_CAUGHT_KEY]);
    // And the install line is STILL there after the conversation: being spoken
    // to does not erase the trail, it only advances the watermark.
    expect(parseInstallLedger(player(world.session, FIELDS.installAudit)))
      .toHaveLength(1);
  });

  /**
   * A slack toy that is genuinely ON the screen at the arrival is a different
   * conversation: he names the game, not the log. One conversation at a time,
   * and the one about the screen wins - the audit will still be there tomorrow.
   */
  it('yields to the screen when the toy is up at the arrival', () => {
    const world = harnessOn(1);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    // The toy is up and unminimised when he arrives.
    world.slack.push('arcade');

    runUntilScene(world);

    expect(world.scenes).toEqual(['arcade']);
    // The install audit was not the conversation, so its watermark is untouched
    // and it is still there for a later, quieter patrol.
    expect(number(world.session, FIELDS.installNoticed)).toBe(0);
    // The line on the file is the SCREEN one, not the software one.
    expect(softwareLines(world.session)).toHaveLength(0);
  });

  /**
   * The one that would make it a random scold. A machine with nothing installed
   * is a machine nobody says anything about, however often he comes past.
   */
  it('never fires with nothing on the audit', () => {
    const world = harnessOn(1);

    runTo(world.driver, world.session, shiftEndTick(1));

    expect(world.scenes).toEqual([]);
    expect(softwareLines(world.session)).toHaveLength(0);
    expect(player(world.session, FIELDS.installNoticed)).toBeUndefined();
  });

  /**
   * Teeth on the policy: a wild-west employer logs installs and they cost
   * nothing. Same install, same corridor, and the audit is never mentioned -
   * flip the policy back to locked-down and this goes red, which is the proof
   * the gate is on the employer and not on the install.
   */
  it('never arms under a wild-west policy however much is installed', () => {
    const world = harnessOn(1, 'wild_west');

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    expect(world.driver.install('mediaplayer')).toEqual({ ok: true });
    expect(world.driver.installAuditBeat().armed).toBe(false);

    runTo(world.driver, world.session, shiftEndTick(1));

    expect(world.scenes).toEqual([]);
    expect(softwareLines(world.session)).toHaveLength(0);
  });
});
