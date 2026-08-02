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

describe('the cadence', () => {
  it('speaks the moment the situation changes, and dwells otherwise', () => {
    const voice = new AssistantVoice();
    const first = voice.speak(desk({ openTickets: 2 }), 60, 0);

    expect(first?.situation).toBe('ticket');

    // The same minute asked twice is the same answer: every tick, every world
    // change and every day change calls this, and a line that changed on each
    // of them would be a slot machine.
    expect(voice.speak(desk({ openTickets: 2 }), 60, 0)?.line.id)
      .toBe(first?.line.id);
    expect(voice.speak(desk({ openTickets: 2 }), 60 + ASSISTANT_DWELL - 1, 0)
      ?.line.id).toBe(first?.line.id);

    // Past the dwell it moves on, and it does not repeat itself immediately.
    const second = voice.speak(desk({ openTickets: 2 }), 60 + ASSISTANT_DWELL, 0);

    expect(second?.line.id).not.toBe(first?.line.id);

    // And something happening speaks straight away, whatever the dwell says.
    const rings = voice.speak(
      desk({ openTickets: 2, ringing: true }),
      60 + ASSISTANT_DWELL + 1,
      0,
    );

    expect(rings?.situation).toBe('call');
  });

  it('notices the desk being handed back, for as long as that is news', () => {
    const voice = new AssistantVoice();

    expect(voice.speak(desk({ heldByTakeover: true }), 100, 0)).toBeNull();
    expect(voice.speak(desk(), 130, 0)?.situation).toBe('after');
    expect(voice.speak(desk(), 130 + ASSISTANT_HANDBACK, 0)?.situation)
      .toBe('idle');
  });
});

describe('being closed', () => {
  it('goes, and stays gone through an ordinary hour', () => {
    const voice = new AssistantVoice();

    expect(voice.speak(desk({ openTickets: 1 }), 60, 0)).not.toBeNull();

    voice.dismiss(1);

    expect(voice.closed()).toBe(true);

    // A ticket arriving, the meters moving, an hour of the same day: none of
    // it is a reason to come back. Those are the minutes closing it bought.
    for (let minute = 61; minute < 120; minute += 1) {
      expect(voice.speak(desk({ openTickets: 4, fumbling: true }), minute, 1))
        .toBeNull();
    }
  });

  it('comes back the next day with a note about having been closed', () => {
    const voice = new AssistantVoice();

    voice.speak(desk({ openTickets: 1 }), 60, 0);
    voice.dismiss(1);

    const back = voice.speak(desk({ openTickets: 1, day: 2 }), 60, 1);

    expect(back?.line.id).toBe(returningLine(1).id);
    expect(voice.closed()).toBe(false);
    // The note is said ONCE. What comes after it is the desk again.
    expect(voice.speak(desk({ openTickets: 1, day: 2 }), 60 + ASSISTANT_DWELL, 1)
      ?.situation).toBe('ticket');
  });

  it('holds the note through a second paint of the same minute', () => {
    // The desk repaints on the tick AND on every world change, so one minute
    // is several calls. A note that was cleared by the second of them would be
    // a gag that flashed past on any minute where anything else happened.
    const voice = new AssistantVoice();

    voice.speak(desk({ openTickets: 1 }), 60, 0);
    voice.dismiss(1);

    const back = voice.speak(desk({ openTickets: 1, day: 2 }), 60, 1);

    expect(voice.speak(desk({ openTickets: 1, day: 2 }), 60, 1)?.line.id)
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
    const voice = new AssistantVoice();

    voice.speak(desk({ openTickets: 1 }), 60, 0);
    voice.dismiss(1);

    const note = returningLine(1).id;

    // Back on day two, and on that same minute the desk turns tense.
    expect(voice.speak(desk({ openTickets: 1, day: 2 }), 60, 1)?.line.id)
      .toBe(note);
    expect(
      voice.speak(desk({ openTickets: 1, day: 2, fumbling: true }), 60, 1)
        ?.line.id,
      'a situation line stepped on the return note',
    ).toBe(note);
    // And a minute later, still tense, still the note - the whole dwell.
    expect(
      voice.speak(desk({ openTickets: 1, day: 2, fumbling: true }), 61, 1)
        ?.line.id,
    ).toBe(note);

    // Only once the dwell is up does the desk's own line take over.
    const after = voice.speak(
      desk({ openTickets: 1, day: 2, fumbling: true }),
      60 + ASSISTANT_DWELL,
      1,
    );

    expect(after?.situation).toBe('stress');
    expect(after?.line.id).not.toBe(note);
  });

  it('comes back for the next thing that happens to the player', () => {
    const voice = new AssistantVoice();

    voice.speak(desk({ openTickets: 1 }), 60, 0);
    voice.dismiss(1);

    expect(voice.speak(desk({ openTickets: 1 }), 70, 1)).toBeNull();

    const rings = voice.speak(desk({ openTickets: 1, ringing: true }), 80, 1);

    expect(rings?.line.id).toBe(returningLine(1).id);
  });

  it('comes back for a SECOND call after being closed during the first', () => {
    // P2-1: "next big event" is the next OCCURRENCE, not the next different
    // kind. Closed during a call, it stayed shut for every later call that day
    // because the kind had not changed - so a whole afternoon of phones went
    // unremarked. A fresh ring is a fresh arrival and brings it back.
    const voice = new AssistantVoice();

    // Closed while the first call is ringing.
    voice.speak(desk({ ringing: true }), 60, 0);
    voice.dismiss(1);

    // The same call, still ringing, does not readmit it - that is the call it
    // was closed during.
    expect(voice.speak(desk({ ringing: true }), 61, 1)).toBeNull();

    // The call ends...
    expect(voice.speak(desk({ openTickets: 1 }), 65, 1)).toBeNull();

    // ...and a second call, same day, is a fresh arrival that brings it back.
    const second = voice.speak(desk({ ringing: true }), 90, 1);

    expect(second?.line.id).toBe(returningLine(1).id);
  });

  it('escalates the note by the number of times it has been closed', () => {
    const voice = new AssistantVoice();
    const said: string[] = [];

    for (let count = 1; count <= RETURNING_TIERS + 2; count += 1) {
      voice.speak(desk({ openTickets: 1, day: count }), 60, count - 1);
      voice.dismiss(count);

      const back = voice.speak(
        desk({ openTickets: 1, day: count + 1 }),
        60,
        count,
      );

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

  it('starts over when the whole screen is replaced under it', () => {
    const voice = new AssistantVoice();

    voice.speak(desk({ openTickets: 1 }), 60, 0);
    voice.dismiss(1);
    voice.forget();

    // A load is somebody else's session: the count came back in the file and
    // the character is on screen again rather than mid-sulk from a week that
    // is over.
    expect(voice.closed()).toBe(false);
    expect(voice.speak(desk({ openTickets: 1 }), 60, 1)).not.toBeNull();
  });
});
