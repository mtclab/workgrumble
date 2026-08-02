import { describe, expect, it } from 'vitest';

import { APP_MANIFEST } from './apps';
import {
  DESK_HELD_REASONS,
  deskHeldReason,
  holdsTheDesk,
  IN_A_MEETING_REASON,
  INSTALLING_UPDATES_REASON,
  TAKEOVER_WINDOWS,
  windowFor,
} from './day-driver';
import { flushableWindows } from './shell';
import { INTERRUPTION_SOURCES } from '../world/interruptions';

/**
 * Which interruptions take the DESK, and what nothing else may do while one
 * of them has it.
 *
 * Three places have to agree about this and they used to answer it three
 * ways: the driver refusing every verb, the shell deciding whether a queued
 * window may open, and the harnesses waiting a block out the way a person
 * does. One table, one predicate, and the tests below are what stop a fourth
 * opinion from appearing.
 */

describe('what takes the desk', () => {
  it('is the meeting and the workstation, in their own words', () => {
    expect(deskHeldReason('meeting')).toBe(IN_A_MEETING_REASON);
    expect(deskHeldReason('machine')).toBe(INSTALLING_UPDATES_REASON);
    expect(holdsTheDesk('meeting')).toBe(true);
    expect(holdsTheDesk('machine')).toBe(true);
    // Two different rooms to be locked out of, so two different sentences: a
    // meeting is somewhere you are not, and a workstation is a desk that is
    // not there.
    expect(IN_A_MEETING_REASON).not.toBe(INSTALLING_UPDATES_REASON);
  });

  /**
   * And a ringing phone does not, which is the rule that keeps a call a
   * window rather than a takeover: the boss key works underneath one, the
   * lead still comes round, and being on the phone has never been a defence
   * for anything.
   */
  it('is nothing else this world can be interrupted by', () => {
    for (const source of INTERRUPTION_SOURCES) {
      if (source === 'meeting' || source === 'machine') {
        continue;
      }

      expect(deskHeldReason(source), source).toBeNull();
      expect(holdsTheDesk(source), source).toBe(false);
    }

    expect(holdsTheDesk(undefined)).toBe(false);
    expect(deskHeldReason(undefined)).toBeNull();
    // The table is the whole of the list, so a source added to it is a source
    // somebody had to decide about rather than one that quietly took a desk.
    expect(Object.keys(DESK_HELD_REASONS).sort())
      .toEqual(['machine', 'meeting']);
  });
});

describe('the window an interruption is drawn in', () => {
  it('is one surface per shape, and the same one at both ends', () => {
    expect(windowFor('machine')).toBe('reboot');
    expect(windowFor('meeting')).toBe('meeting');
    // Everything with a person on the other end of it is the phone.
    expect(windowFor('call')).toBe('call');
    expect(windowFor('walk_up')).toBe('call');
    expect(windowFor('boss')).toBe('call');
    expect(windowFor('chat')).toBe('call');
    expect([...TAKEOVER_WINDOWS].sort()).toEqual(['call', 'meeting', 'reboot']);
  });

  /**
   * And none of them is desk furniture.
   *
   * The day opens these and the day closes them - `onInterruption` and
   * `onInterruptionEnded` - which is what keeps the window LIST honest: the
   * takeover is in it while the thing is happening and out of it the minute
   * the desk comes back. That only works because they are day screens: an app
   * with a desktop icon is one the player opens and closes for themselves, and
   * an update screen the player had to close by hand after the update had
   * finished would be a dead window sitting on a desk that was theirs again.
   *
   * The manifest is the thing that decides it, so the manifest is what this
   * asks. It is also the gate that would catch somebody giving the reboot an
   * icon "so you can get back to it".
   */
  it('is a screen the day owns rather than a tool the player keeps', () => {
    for (const id of TAKEOVER_WINDOWS) {
      const app = APP_MANIFEST.find((candidate) => candidate.id === id);

      expect(app, id).toBeDefined();
      expect(app?.desktop, id).toBe(false);
      expect(app?.slack, id).toBe(false);
    }
  });
});

describe('the windows the shell has queued', () => {
  /**
   * The release notes, waiting for the desk.
   *
   * A build that changed under this browser decides during BOOT that the
   * notes should go up, and the queue holds them until there is a desktop to
   * put them on. A session restored into the middle of a reboot arrives at
   * that desktop with a takeover already running - and a queue that flushed
   * regardless would open a dialog every pointer rule had just disabled,
   * directly in front of the screen that disabled it.
   */
  it('wait while something is holding the desk, and go up when it is free', () => {
    expect(flushableWindows(['updates'], true)).toEqual([]);
    expect(flushableWindows(['updates'], false)).toEqual(['updates']);
    // Nothing queued is nothing to open, held or not - the rule may not
    // invent a window to put up when the desk comes back.
    expect(flushableWindows([], false)).toEqual([]);
    expect(flushableWindows([], true)).toEqual([]);
  });
});
