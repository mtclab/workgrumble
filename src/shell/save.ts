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

/**
 * The shape written today. Bumped when the file's meaning changes.
 *
 * 1: the M2 shell - chat, mail, kb and the day screens.
 * 2: M3's pressure layer adds two screen slices, the Browser's page and the
 *    scene the lead's last visit left behind.
 */
export const SAVE_SCHEMA = 2;

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
 * The oldest file this build can honestly read.
 *
 * Schema 1 is refused rather than migrated, and the difference matters. A
 * schema-1 file carries an ENGINE payload from before the pressure layer: a
 * player node with no meters on it and an action registry with no meter, boss,
 * consumable or triage verbs in it. The engine restores that world happily -
 * it is a coherent world, just not this game's - and the session that comes
 * back looks fine until the first meter tick refuses as an unknown action and
 * the day quietly stops moving. Filling in the missing screens, which is all
 * the old migration did, upgraded the wrapper around a world nobody can play.
 *
 * Those files only ever existed on the machines of people building this, which
 * is why the answer is a sentence rather than a rebuild of the world.
 */
export const OLDEST_READABLE_SCHEMA = 2;

export const PRE_RELEASE_SAVE_REASON = 'That save was written by a pre-release '
  + 'build, before the shift had any pressure in it. The world inside it is '
  + 'missing pieces this version cannot invent - the meters, the lead, the '
  + 'machine in the corridor - so it is not something a day can be resumed '
  + 'from. Nothing has been loaded; start a new week.';

/**
 * Brings an older file forward.
 *
 * Each step upgrades one schema to the next, in order, so a file from any
 * version this build can still make sense of keeps loading. A file from a
 * LATER schema is refused outright - guessing at a field this code has never
 * seen is how a save silently loses a day - and so is one from before the
 * oldest schema whose world this build could stand up.
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

  if (schema < OLDEST_READABLE_SCHEMA) {
    return refuse(PRE_RELEASE_SAVE_REASON);
  }

  // The seam stays: schema 3 will be upgraded from 2 here, in order, and every
  // file this build can read will keep loading.
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
