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
import { employerFor } from '../world/employers';
import { shiftEndTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { parseInstallLedger, unspokenInstalls } from '../world/software';
import { caughtScene, INSTALL_CAUGHT_KEY } from '../world/scenes';
import { createWorldSession, type WorldSession } from '../world/session';
import { DayDriver, TICK_INTERVAL_MS } from './day-driver';

beforeAll(() => {
  loadEngineForTests();
});

interface Caught {
  readonly appId: string;
  /** The installs the software conversation named, or undefined otherwise. */
  readonly software: readonly string[] | undefined;
}

interface Harness {
  readonly driver: DayDriver;
  readonly session: WorldSession;
  /** Every scene the day put up, with what the software one was about. */
  readonly caught: Caught[];
  /** What is on the screen, which the pressure layer reads for itself. */
  readonly slack: string[];
}

function harnessOn(day: number, policy: InstallPolicy = 'locked_down'): Harness {
  const session = createWorldSession();
  const caught: Caught[] = [];
  const slack: string[] = [];
  const driver = new DayDriver(session.engine, COMPANY_IDS.player, session.seed, {
    onDayBoundary: () => {},
    openSlackApps: () => [...slack],
    focusedSlackApp: () => (slack.length > 0 ? (slack[0] ?? null) : null),
    // The beat reads the policy on its own, because the audit trail survives an
    // uninstall and a wild-west shop logs installs that cost nothing.
    installPolicy: () => policy,
    onCaught: (appId, _tick, _evidence, software) => {
      caught.push({ appId, software });
    },
  });

  for (let played = 1; played < day; played += 1) {
    driver.startShift();
    runTo(driver, session, shiftEndTick(played));
    driver.clockOff();
  }

  driver.startShift();
  caught.length = 0;
  return { driver, session, caught, slack };
}

function runTo(driver: DayDriver, session: WorldSession, tick: number): void {
  while (session.engine.now() < tick && driver.state() === 'shift') {
    driver.step(TICK_INTERVAL_MS);
  }
}

/** Runs the day until the lead puts a scene up, or the shift ends. */
function runUntilScene(world: Harness): void {
  while (world.caught.length === 0 && world.driver.state() === 'shift') {
    world.driver.step(TICK_INTERVAL_MS);
  }
}

function scenes(world: Harness): readonly string[] {
  return world.caught.map((entry) => entry.appId);
}

function player(session: WorldSession, field: string): unknown {
  return session.engine.graph.getField(COMPANY_IDS.player, field);
}

function softwareLines(session: WorldSession): readonly string[] {
  return conductEntries(player(session, FIELDS.conductFile))
    .filter((entry) => entry.kind === 'software')
    .map((entry) => entry.text);
}

/** The unspoken installs the beat would read this minute, off the graph. */
function unspoken(session: WorldSession): readonly string[] {
  return unspokenInstalls(
    player(session, FIELDS.installAudit),
    player(session, FIELDS.installNoticed),
  ).map((record) => record.id);
}

describe('the beat the install audit arms', () => {
  /**
   * The journey: a toy installed off the store ends with a man at the desk
   * asking about the install LOG, naming the program he actually found.
   */
  it('brings the lead down about the install, naming what was on the audit', () => {
    const world = harnessOn(1);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    expect(parseInstallLedger(player(world.session, FIELDS.installAudit)))
      .toHaveLength(1);
    expect(world.driver.installAuditBeat().armed).toBe(true);

    // Nothing has been said yet: arming is evidence, not a conversation.
    expect(world.caught).toEqual([]);

    runUntilScene(world);

    expect(scenes(world)).toEqual([INSTALL_CAUGHT_KEY]);
    // PER-ENTRY: the conversation names the actual install, not a generic one.
    expect(world.caught[0]?.software).toEqual(['arcade']);
    // The static fallback still says the one thing that is always true.
    expect(caughtScene(INSTALL_CAUGHT_KEY)?.bossLine ?? '')
      .toContain('We keep a list');

    // THE RECORD: a software line, in the file's own passive voice.
    const lines = softwareLines(world.session);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Unauthorised software');
    expect(lines[0]).toContain('installation policy');
    expect(
      conductEntries(player(world.session, FIELDS.conductFile))
        .some((entry) => entry.kind === 'screen'),
    ).toBe(false);
  });

  /**
   * It cannot drum. Being spoken to copies the audit into the "spoken about"
   * field, so the same install is not brought up the next time he walks past -
   * a fresh install is what re-arms it, not another lap of the corridor.
   */
  it('is one conversation per install, not one per corridor', () => {
    const world = harnessOn(1);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    runUntilScene(world);

    expect(scenes(world)).toEqual([INSTALL_CAUGHT_KEY]);
    // The copy now holds the whole trail, so nothing is unspoken and the beat
    // has nothing new to say however many more times he comes past.
    expect(unspoken(world.session)).toEqual([]);
    expect(world.driver.installAuditBeat().armed).toBe(false);
    // The copy is the audit trail itself: byte-for-byte, since it was copied.
    expect(player(world.session, FIELDS.installNoticed))
      .toBe(player(world.session, FIELDS.installAudit));

    runTo(world.driver, world.session, shiftEndTick(1));

    expect(scenes(world)).toEqual([INSTALL_CAUGHT_KEY]);
    expect(softwareLines(world.session)).toHaveLength(1);
  });

  /**
   * And a FRESH install re-arms it: the copy holds the list so far, not the
   * store. Install a second toy after being spoken to and there is a line the
   * copy does not hold, so the next patrol has something to say - about the new
   * program, not the old one.
   */
  it('re-arms on a fresh install and names only the new one', () => {
    const world = harnessOn(1);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    runUntilScene(world);
    expect(world.caught[0]?.software).toEqual(['arcade']);
    expect(world.driver.installAuditBeat().armed).toBe(false);

    expect(world.driver.install('mediaplayer')).toEqual({ ok: true });
    // Only the media player is unspoken now; the arcade line is in the copy.
    expect(unspoken(world.session)).toEqual(['mediaplayer']);
    expect(world.driver.installAuditBeat().armed).toBe(true);

    world.caught.length = 0;
    runUntilScene(world);

    expect(scenes(world)).toEqual([INSTALL_CAUGHT_KEY]);
    expect(world.caught[0]?.software).toEqual(['mediaplayer']);
    expect(softwareLines(world.session)).toHaveLength(2);
  });

  /**
   * The record outlives the app. Uninstalling takes the toy off the machine and
   * leaves the install line on the audit, so the beat is still armed and the
   * conversation still happens.
   */
  it('still has something to say after the toy is uninstalled', () => {
    const world = harnessOn(1);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    expect(world.driver.uninstall('arcade')).toEqual({ ok: true });

    expect(parseInstallLedger(player(world.session, FIELDS.installAudit)))
      .toHaveLength(1);
    expect(parseInstallLedger(player(world.session, FIELDS.installRemoved)))
      .toHaveLength(1);
    expect(world.driver.installAuditBeat().armed).toBe(true);

    runUntilScene(world);

    expect(scenes(world)).toEqual([INSTALL_CAUGHT_KEY]);
    expect(world.caught[0]?.software).toEqual(['arcade']);
    // And the install line is STILL there after the conversation: being spoken
    // to copies the trail, it does not erase it.
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
    world.slack.push('arcade');

    runUntilScene(world);

    expect(scenes(world)).toEqual(['arcade']);
    // The audit was not the conversation, so the copy is untouched and it is
    // still unspoken for a later, quieter patrol.
    expect(player(world.session, FIELDS.installNoticed)).toBeUndefined();
    expect(unspoken(world.session)).toEqual(['arcade']);
    expect(softwareLines(world.session)).toHaveLength(0);
  });

  /**
   * The one that would make it a random scold. A machine with nothing installed
   * is a machine nobody says anything about, however often he comes past.
   */
  it('never fires with nothing on the audit', () => {
    const world = harnessOn(1);

    runTo(world.driver, world.session, shiftEndTick(1));

    expect(world.caught).toEqual([]);
    expect(softwareLines(world.session)).toHaveLength(0);
    expect(player(world.session, FIELDS.installNoticed)).toBeUndefined();
  });

  /**
   * Teeth on the policy, sourced the way the shipped shell sources it (0.6.0,
   * P1-3): the policy is read off the EMPLOYER, so a toy installed at Bodgeworth
   * - whose registry policy is `wild_west` - logs and costs nothing. The bug
   * this forbids is `main.ts` reading the first company's policy for every
   * employer; reading Bodgeworth's own is what makes its installs free. Flip the
   * policy back to locked-down and this goes red, which is the proof the gate is
   * on the employer and not on the install.
   */
  it('never arms under Bodgeworth\'s wild-west policy, and installs cost nothing', () => {
    // The exact value the shell reads off the pack for this shop.
    expect(employerFor('bodgeworth').installPolicy).toBe('wild_west');
    const world = harnessOn(1, employerFor('bodgeworth').installPolicy);
    const suspicionBefore = player(world.session, FIELDS.suspicion);

    expect(world.driver.install('arcade')).toEqual({ ok: true });
    expect(world.driver.install('mediaplayer')).toEqual({ ok: true });
    expect(world.driver.installAuditBeat().armed).toBe(false);

    runTo(world.driver, world.session, shiftEndTick(1));

    expect(world.caught).toEqual([]);
    expect(softwareLines(world.session)).toHaveLength(0);
    // No suspicion accrued for the toys: the audit at a wild-west shop does not
    // price them.
    expect(player(world.session, FIELDS.suspicion)).toBe(suspicionBefore);
  });
});
