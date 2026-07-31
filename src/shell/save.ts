/**
 * Saving a session: the world, the screens, and how it was being watched.
 *
 * Three things have to come back together or the load is a lie. The ENGINE
 * knows the graph, the clock, the tickets and the dispatch log since its last
 * checkpoint. The APP STATE knows what was on screen - transcripts, unread
 * flags, the article that was open. The DRIVER knows whether the player had
 * paused and how fast they were watching, which the engine deliberately does
 * not, because its clock counts whole ticks and nothing else.
 *
 * The file is versioned, read strictly, and applied all-or-nothing: everything
 * is parsed and checked before anything is replaced, so a save that turns out
 * to be rubbish costs the player a click rather than the session they were in.
 */

import type { EngineApi } from '../engine-api';
import type { AppState, AppStateStore } from './app-state';
import { parseAppState } from './app-state';
import { formatSimTime } from './clock-format';
import type { DriverSaveSeam, DriverState } from './day-driver';
import { parseDriverState } from './day-driver';

/** The shape written today. Bumped when the file's meaning changes. */
export const SAVE_SCHEMA = 1;

export const SAVE_KEY = 'it-career-sim/save';

export interface SaveFile {
  readonly schema: number;
  /** Simulation tick the save was taken at - what the slot advertises. */
  readonly savedAtTick: number;
  /** How the slot reads in a menu: "Day 2, 12:35". */
  readonly label: string;
  /** The engine's own serialization, carried verbatim. */
  readonly engine: string;
  readonly app: AppState;
  readonly driver: DriverState;
}

export type SaveOutcome<Value = void> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly reason: string };

function refuse(reason: string): SaveOutcome<never> {
  return { ok: false, reason };
}

/**
 * Brings an older file forward.
 *
 * There is one schema so far, so this is the seam rather than the work: when
 * schema 2 arrives, its predecessor is upgraded here and every older save
 * keeps loading. A file from a LATER schema is refused outright - guessing at
 * a field this code has never seen is how a save silently loses a day.
 */
function migrate(file: Record<string, unknown>): SaveOutcome<
  Record<string, unknown>
> {
  const schema = file.schema;

  if (typeof schema !== 'number' || !Number.isSafeInteger(schema) || schema < 1) {
    return refuse('That save does not say which version of the game wrote it.');
  }

  if (schema > SAVE_SCHEMA) {
    return refuse(
      `That save was written by a newer build (format ${String(schema)}; this `
      + `one reads ${String(SAVE_SCHEMA)}). Nothing has been loaded.`,
    );
  }

  return { ok: true, value: file };
}

export function parseSaveFile(raw: string): SaveOutcome<SaveFile> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return refuse('That save is not readable. Nothing has been loaded.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return refuse('That save is not a save. Nothing has been loaded.');
  }

  const migrated = migrate(parsed as Record<string, unknown>);

  if (!migrated.ok) {
    return migrated;
  }

  const file = migrated.value;
  const app = parseAppState(file.app);
  const driver = parseDriverState(file.driver);

  if (
    typeof file.engine !== 'string'
    || file.engine.length === 0
    || typeof file.label !== 'string'
    || typeof file.savedAtTick !== 'number'
    || !Number.isSafeInteger(file.savedAtTick)
    || file.savedAtTick < 0
    || app === null
    || driver === null
  ) {
    return refuse('That save is missing pieces of itself. Nothing has been '
      + 'loaded.');
  }

  return {
    ok: true,
    value: {
      schema: SAVE_SCHEMA,
      savedAtTick: file.savedAtTick,
      label: file.label,
      engine: file.engine,
      app,
      driver,
    },
  };
}

/**
 * One save slot in whatever storage it is handed.
 *
 * Storage is passed in rather than reached for: `localStorage` throws on a
 * locked-down browser and on a full quota, and a game that cannot save is a
 * game that says so - not one that takes the tab down at the moment the player
 * asked it to keep their day.
 */
export class SaveSlot {
  public constructor(
    private readonly storage: Storage,
    private readonly key: string = SAVE_KEY,
  ) {}

  public write(file: Readonly<SaveFile>): SaveOutcome {
    try {
      this.storage.setItem(this.key, JSON.stringify(file));
      return { ok: true, value: undefined };
    } catch {
      return refuse(
        'The browser would not keep that save. Storage is full, or this '
        + 'window is not allowed any.',
      );
    }
  }

  public read(): SaveOutcome<SaveFile> {
    let raw: string | null;

    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return refuse('This window is not allowed to read saved games.');
    }

    return raw === null
      ? refuse('There is no saved game to load.')
      : parseSaveFile(raw);
  }

  public exists(): boolean {
    try {
      return this.storage.getItem(this.key) !== null;
    } catch {
      return false;
    }
  }

  public clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // A slot that cannot be cleared is a slot that was never written.
    }
  }
}

/**
 * Keeping and reloading a session. Both answer rather than throw: a save that
 * will not write and a save that will not read are both things the player is
 * told, in a sentence, with the session they were in still running.
 */
export interface ShellSessionApi {
  save(): SaveOutcome;
  load(): SaveOutcome;
  hasSave(): boolean;
}

export interface SessionParts {
  readonly engine: EngineApi;
  readonly appState: AppStateStore;
  readonly day: DriverSaveSeam;
  readonly slot: SaveSlot;
}

/**
 * The save seam itself, wired to the three things a session is made of.
 *
 * It lives here rather than in `main.ts` so the round trip a save promises -
 * write it, load it, be in the same day in the same world looking at the same
 * screens - is something a test can drive on the shipped path rather than on a
 * copy of it.
 */
export function createShellSession(
  parts: Readonly<SessionParts>,
): ShellSessionApi {
  const { engine, appState, day, slot } = parts;

  return {
    save: (): SaveOutcome => {
      const display = formatSimTime(engine.now());

      return slot.write({
        schema: SAVE_SCHEMA,
        savedAtTick: engine.now(),
        label: `${display.day}, ${display.time}`,
        engine: engine.serialize(),
        app: appState.snapshot(),
        driver: day.driverState(),
      });
    },

    /**
     * Everything is parsed before anything is replaced, and the engine's own
     * restore refuses atomically - so a save that turns out to be rubbish
     * costs the player a click rather than the session they were in.
     */
    load: (): SaveOutcome => {
      const file = slot.read();

      if (!file.ok) {
        return file;
      }

      try {
        engine.restore(file.value.engine);
      } catch (failure: unknown) {
        return refuse(
          failure instanceof Error
            ? `That save would not load: ${failure.message}`
            : 'That save would not load.',
        );
      }

      // Both of these were parsed on the way in, so neither can fail here -
      // and both announce themselves, which is what repaints the windows that
      // are looking at the session this call just replaced.
      appState.hydrate(file.value.app);
      day.restoreDriverState(file.value.driver);
      return { ok: true, value: undefined };
    },

    hasSave: (): boolean => slot.exists(),
  };
}
