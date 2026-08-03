import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_DWELL,
  ASSISTANT_HANDBACK,
  type AssistantWorld,
  AssistantVoice,
  situationOf,
} from './assistant';
import { RETURNING_TIERS, returningLine } from './assistant-lines';

/**
 * What the character decides, with no DOM anywhere near it.
 *
 * Everything here is about the two properties the slice promises: it reacts to
 * what is already on the desk, and it is never in the way. The lines it picks
 * are somebody else's test - `assistant-lines.test.ts` is where the gate that
 * keeps them useless lives.
 */

const QUIET: AssistantWorld = {
  onShift: true,
  heldByTakeover: false,
  ringing: false,
  rebootComing: false,
  dnd: false,
  fumbling: false,
  openTickets: 0,
  day: 1,
};

function desk(changes: Partial<AssistantWorld> = {}): AssistantWorld {
  return { ...QUIET, ...changes };
}

/** Every TypeScript file under `src`, so a claim about the tree can be made. */
function sources(from: string): readonly string[] {
  return readdirSync(from, { withFileTypes: true }).flatMap((entry) => {
    const path = join(from, entry.name);

    if (entry.isDirectory()) {
      return sources(path);
    }

    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

/**
 * THE "NEVER LOAD-BEARING" GATE.
 *
 * The Assistant is an overlay and nothing else: no journey may need it, no
 * rule may read it, and no part of the world may know it exists. That is a
 * claim about the SHAPE of the codebase rather than about any one behaviour,
 * so it is checked as one - the day somebody wires a mechanic to the thing on
 * the desk with the face on it, this goes red and names the file.
 *
 * The desktop mounts it and the tests drive it. That is the whole list.
 */
describe('it is furniture', () => {
  it('is imported by the desktop and by nothing else in the game', () => {
    const importers = sources('src').filter((path) => {
      const text = readFileSync(path, 'utf8');
      return /from '\.{1,2}\/(shell\/)?assistant(-lines)?'/u.test(text);
    });

    expect(importers.sort()).toEqual([
      'src/shell/assistant-lines.test.ts',
      'src/shell/assistant.test.ts',
      'src/shell/assistant.ts',
      'src/shell/desktop.ts',
    ]);
  });

  it('reaches no registered action and no world write', () => {
    // The other half of the same claim, read off the two modules themselves:
    // there is no dispatcher in either of them, and nothing to dispatch with.
    for (const path of ['src/shell/assistant.ts', 'src/shell/assistant-lines.ts']) {
      const text = readFileSync(path, 'utf8');

      expect(text, path).not.toContain('dispatch');
      expect(text, path).not.toContain('ACTIONS');
    }
  });
});

describe('what it is standing over', () => {
  it('says nothing at all while a takeover holds the desk', () => {
    // The rule that keeps it furniture: a meeting owns the screen, and the
    // helper does not talk over one.
    expect(situationOf(desk({ heldByTakeover: true }), false)).toBeNull();
    // Nor before anybody has started, when there is nobody at the desk.
    expect(situationOf(desk({ onShift: false }), false)).toBeNull();
  });

  it('reads the desk in precedence order', () => {
    expect(situationOf(desk({ ringing: true, dnd: true }), false)).toBe('call');
    expect(situationOf(desk({ rebootComing: true, fumbling: true }), false))
      .toBe('reboot');
    expect(situationOf(desk({ dnd: true }), true)).toBe('after');
    expect(situationOf(desk({ dnd: true, fumbling: true }), false)).toBe('dnd');
    expect(situationOf(desk({ fumbling: true, openTickets: 3 }), false))
      .toBe('stress');
    expect(situationOf(desk({ openTickets: 3 }), false)).toBe('ticket');
    expect(situationOf(desk(), false)).toBe('idle');
  });
});

/**
 * The shell path, in miniature.
 *
 * The box taught the lesson this harness exists for: the character's durable
 * memory - the count, the closed-day - is NOT in the voice, it is in the screen
 * store, and the desktop mediates it. A test that drove the voice object
 * directly could pass while the real path failed, because the real path
 * re-instantiates the voice (a reload) and writes the closed state through the
 * store (a boss beat between closing and return). So this mirrors exactly what
 * the desktop does: it holds the durable memory, clears the note-owed flag when
 * a paint pays it, and `reload()` builds a FRESH voice over the SAME memory.
 */
class Shell {
  public voice = new AssistantVoice();
  public dismissals = 0;
  public closedOnDay: number | null = null;

  public speak(world: Readonly<AssistantWorld>, tick: number) {
    const view = this.voice.speak(world, tick, {
      dismissals: this.dismissals,
      closedOnDay: this.closedOnDay,
    });

    if (view?.readmitted === true && this.closedOnDay !== null) {
      this.closedOnDay = null;
    }

    return view;
  }

  /** The dismiss button: count up, closed-day written to the durable store. */
  public dismiss(day: number): void {
    this.dismissals += 1;
    this.closedOnDay = day;
  }

  /** A save and a reload: durable memory survives, the voice is rebuilt. */
  public reload(): void {
    this.voice = new AssistantVoice();
  }
}

describe('the cadence', () => {
  it('speaks the moment the situation changes, and dwells otherwise', () => {
    const shell = new Shell();
    const first = shell.speak(desk({ openTickets: 2 }), 60);

    expect(first?.situation).toBe('ticket');

    // The same minute asked twice is the same answer: every tick, every world
    // change and every day change calls this, and a line that changed on each
    // of them would be a slot machine.
    expect(shell.speak(desk({ openTickets: 2 }), 60)?.line.id)
      .toBe(first?.line.id);
    expect(shell.speak(desk({ openTickets: 2 }), 60 + ASSISTANT_DWELL - 1)
      ?.line.id).toBe(first?.line.id);

    // Past the dwell it moves on, and it does not repeat itself immediately.
    const second = shell.speak(desk({ openTickets: 2 }), 60 + ASSISTANT_DWELL);

    expect(second?.line.id).not.toBe(first?.line.id);

    // And something happening speaks straight away, whatever the dwell says.
    const rings = shell.speak(
      desk({ openTickets: 2, ringing: true }),
      60 + ASSISTANT_DWELL + 1,
    );

    expect(rings?.situation).toBe('call');
  });

  it('notices the desk being handed back, for as long as that is news', () => {
    const shell = new Shell();

    expect(shell.speak(desk({ heldByTakeover: true }), 100)).toBeNull();
    expect(shell.speak(desk(), 130)?.situation).toBe('after');
    expect(shell.speak(desk(), 130 + ASSISTANT_HANDBACK)?.situation)
      .toBe('idle');
  });
});

describe('being closed', () => {
  it('goes, and stays gone through an ordinary hour', () => {
    const shell = new Shell();

    expect(shell.speak(desk({ openTickets: 1 }), 60)).not.toBeNull();

    shell.dismiss(1);

    // A ticket arriving, the meters moving, an hour of the same day: none of
    // it is a reason to come back. Those are the minutes closing it bought.
    for (let minute = 61; minute < 120; minute += 1) {
      expect(shell.speak(desk({ openTickets: 4, fumbling: true }), minute))
        .toBeNull();
    }
  });

  it('comes back the next day with a note about having been closed', () => {
    const shell = new Shell();

    shell.speak(desk({ openTickets: 1 }), 60);
    shell.dismiss(1);

    const back = shell.speak(desk({ openTickets: 1, day: 2 }), 60);

    expect(back?.line.id).toBe(returningLine(1).id);
    expect(shell.closedOnDay).toBeNull();
    // The note is said ONCE. What comes after it is the desk again.
    expect(shell.speak(desk({ openTickets: 1, day: 2 }), 60 + ASSISTANT_DWELL)
      ?.situation).toBe('ticket');
  });

  it('holds the note through a second paint of the same minute', () => {
    // The desk repaints on the tick AND on every world change, so one minute
    // is several calls. A note that was cleared by the second of them would be
    // a gag that flashed past on any minute where anything else happened.
    const shell = new Shell();

    shell.speak(desk({ openTickets: 1 }), 60);
    shell.dismiss(1);

    const back = shell.speak(desk({ openTickets: 1, day: 2 }), 60);

    expect(shell.speak(desk({ openTickets: 1, day: 2 }), 60)?.line.id)
      .toBe(back?.line.id);
    expect(back?.line.id).toBe(returningLine(1).id);
  });

  it('holds the note when the desk changes under it, until its dwell is up', () => {
    // THE BUG THIS PINS: the note comes back on the exact minute a new day's
    // stress or queue is also becoming true, and the desk paints again the
    // instant it does. The note was attached to the situation it appeared in,
    // so the second paint saw 'stress' arrive, called it a move, and replaced
    // the note about having been closed with a joke about tense hands. The gag
    // is the whole point of the tiers, and a situation line stepping on it
    // defeats it.
    const shell = new Shell();

    shell.speak(desk({ openTickets: 1 }), 60);
    shell.dismiss(1);

    const note = returningLine(1).id;

    // Back on day two, and on that same minute the desk turns tense - and the
    // desktop has just cleared the durable flag on the first paint.
    expect(shell.speak(desk({ openTickets: 1, day: 2 }), 60)?.line.id)
      .toBe(note);
    expect(
      shell.speak(desk({ openTickets: 1, day: 2, fumbling: true }), 60)
        ?.line.id,
      'a situation line stepped on the return note',
    ).toBe(note);
    // And a minute later, still tense, still the note - the whole dwell.
    expect(
      shell.speak(desk({ openTickets: 1, day: 2, fumbling: true }), 61)
        ?.line.id,
    ).toBe(note);

    // Only once the dwell is up does the desk's own line take over.
    const after = shell.speak(
      desk({ openTickets: 1, day: 2, fumbling: true }),
      60 + ASSISTANT_DWELL,
    );

    expect(after?.situation).toBe('stress');
    expect(after?.line.id).not.toBe(note);
  });

  it('stays closed through a big event on the same day (F7)', () => {
    // Slice 0.3.6, F7: closing it now MEANS something within the day. A big
    // event used to re-admit it, so the only move was to shut it again on every
    // call and every reboot; now a close is honoured until the day turns.
    const shell = new Shell();

    shell.speak(desk({ openTickets: 1 }), 60);
    shell.dismiss(1);

    expect(shell.speak(desk({ openTickets: 1 }), 70)).toBeNull();

    // A phone rings, same day: it does NOT bring the character back. (Re-adding
    // the big-event re-admit reds this.)
    expect(shell.speak(desk({ openTickets: 1, ringing: true }), 80)).toBeNull();
    // A workstation on its way back, same day: still nothing.
    expect(shell.speak(desk({ openTickets: 1, rebootComing: true }), 95))
      .toBeNull();

    // Tomorrow it is back, with the note about having been closed.
    const tomorrow = shell.speak(desk({ openTickets: 1, day: 2 }), 60);

    expect(tomorrow?.line.id).toBe(returningLine(1).id);
  });

  it('stays shut for a whole afternoon of calls once closed (F7)', () => {
    // Closed during a call, it stays shut for every later call THAT DAY - the
    // quiet the player bought. Re-admitting on the next fresh ring was the exact
    // move F7 removed: a close you have to make again on every phone is not one.
    const shell = new Shell();

    shell.speak(desk({ ringing: true }), 60);
    shell.dismiss(1);

    // The same call, still ringing, and then call after call, same day: shut.
    expect(shell.speak(desk({ ringing: true }), 61)).toBeNull();
    expect(shell.speak(desk({ openTickets: 1 }), 65)).toBeNull();
    expect(shell.speak(desk({ ringing: true }), 90)).toBeNull();
    expect(shell.speak(desk({ ringing: true }), 140)).toBeNull();
  });

  it('escalates the note by the number of times it has been closed', () => {
    const shell = new Shell();
    const said: string[] = [];

    for (let count = 1; count <= RETURNING_TIERS + 2; count += 1) {
      shell.speak(desk({ openTickets: 1, day: count }), 60);
      shell.dismiss(count);

      const back = shell.speak(desk({ openTickets: 1, day: count + 1 }), 60);

      said.push(back?.line.id ?? 'nothing');
    }

    // Three tiers at least, each different, and then a flat one that every
    // further closing lands on - a gag with an escalation, not a homework
    // schedule.
    expect(new Set(said.slice(0, RETURNING_TIERS)).size)
      .toBe(RETURNING_TIERS);
    expect(RETURNING_TIERS).toBeGreaterThanOrEqual(3);
    expect(said[RETURNING_TIERS]).toBe(said[RETURNING_TIERS - 1]);
  });

  /**
   * The whole-day dismissal survives a reload (slice 0.3.6, P1-2).
   *
   * The dismissal is keyed off the DURABLE closed-day the store carries, not any
   * transient of the voice instance - so a reload on the same day it was closed
   * rebuilds the voice, reads `closedOnDay === today`, and STAYS closed. Keying
   * it off a fresh-mount flag was the 0.3.5 bug class again: the reload re-armed
   * the character inside the quiet the player had bought. It still returns on the
   * day turn, with the escalated note.
   */
  it('stays closed across a same-day reload, and returns on the day turn', () => {
    const shell = new Shell();

    // Day one: closed.
    shell.speak(desk({ openTickets: 1 }), 60);
    shell.dismiss(1);

    // A reload rebuilds the voice; the count and closed-day come back in the
    // store. The character does NOT re-arrive - the day it was closed on has not
    // turned, so the quiet holds.
    shell.reload();
    expect(shell.speak(desk({ openTickets: 1 }), 60)).toBeNull();
    expect(shell.closedOnDay).toBe(1);

    // And a big event on the same day, after the reload, is still no reason.
    expect(shell.speak(desk({ openTickets: 1, ringing: true }), 80)).toBeNull();

    // The day turns: the note is paid on the first paint of day two.
    const nextDay = shell.speak(desk({ openTickets: 1, day: 2 }), 60);

    expect(nextDay?.line.id).toBe(returningLine(1).id);
    expect(shell.closedOnDay).toBeNull();
  });

  /**
   * And the escalation survives the durable path: closed twice across two day
   * turns, the note climbs to tier two, even with a reload in between.
   */
  it('escalates across a reload and a day boundary', () => {
    const shell = new Shell();

    shell.speak(desk({ openTickets: 1 }), 60);
    shell.dismiss(1);
    shell.speak(desk({ openTickets: 1, day: 2 }), 60);
    expect(shell.closedOnDay).toBeNull();

    // Close again on day two, reload, cross into day three.
    shell.dismiss(2);
    shell.reload();
    expect(shell.speak(desk({ openTickets: 1, day: 2 }), 61)).toBeNull();

    const dayThree = shell.speak(desk({ openTickets: 1, day: 3 }), 60);

    expect(dayThree?.line.id).toBe(returningLine(2).id);
  });

  it('is on screen again after a reload that was not mid-closure', () => {
    const shell = new Shell();

    shell.speak(desk({ openTickets: 1 }), 60);
    shell.reload();

    // A load with nothing closed is just the character, back at the desk.
    const back = shell.speak(desk({ openTickets: 1 }), 60);

    expect(back).not.toBeNull();
    expect(back?.situation).toBe('ticket');
  });
});
