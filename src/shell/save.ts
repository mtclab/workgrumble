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

import type { EngineApi, NodeId } from '../engine-api';
import type { AppState, AppStateStore } from './app-state';
import { parseAppState } from './app-state';
import { formatSimTime } from './clock-format';
import type { DriverSaveSeam, DriverState } from './day-driver';
import { DayDriver, parseDriverState } from './day-driver';
import { recordFrom, type RetrySlot } from './retry';
import { FIELDS } from '../world/fields';

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
  /**
   * Plays the week again after a firing: writes down what survives it - the
   * farm fund, what had been read, which attempt the next one is - throws the
   * save away, and starts the session over.
   *
   * The restart itself is the caller's, because it is a fact about the page
   * rather than about the world: this half is the part a test can drive.
   */
  retryWeek(): SaveOutcome;
}

export interface SessionParts {
  readonly engine: EngineApi;
  /**
   * A fresh, empty engine, for trying a save in before it is committed.
   *
   * Injected rather than imported because the engine is wasm and this module
   * has no business loading it - and because a preflight that runs on the same
   * engine as the session is not a preflight.
   *
   * Omitting it is legal and skips the preflight; the snapshot-and-rollback
   * below still makes the load all-or-nothing. Every shipped call site
   * provides it.
   */
  probeEngine?(): EngineApi;
  readonly appState: AppStateStore;
  readonly day: DriverSaveSeam;
  readonly slot: SaveSlot;
  /** Where the one thing that survives a firing is written down. */
  readonly retry: RetrySlot;
  /** The node the week's fund and attempt number live on. */
  readonly actor: NodeId;
  /** What the shell does once a retry has been written: reload, usually. */
  restart(): void;
  /**
   * Every write this session makes, told to whoever is keeping score.
   *
   * It is here rather than at the call sites because two of the three writes
   * have no call site a player can see - the day-boundary checkpoint and the
   * one that lets go of a carried-over retry both happen inside the day loop -
   * and those are exactly the two whose failures used to vanish.
   */
  onWrite?(outcome: SaveOutcome): void;
}

/**
 * What the driver needs to exist and does nothing with. A preflight has no
 * screen to open a scene on and no player to notify.
 */
const SILENT_HANDLERS = {
  onDayBoundary: (): void => {},
  openSlackApps: (): readonly string[] => [],
  focusedSlackApp: (): string | null => null,
} as const;

function loadFailure(failure: unknown): string {
  return failure instanceof Error
    ? `That save would not load: ${failure.message}`
    : 'That save would not load.';
}

/**
 * Tries the whole file somewhere it cannot hurt anybody.
 *
 * A fresh engine restores the payload, and a real `DayDriver` is built on top
 * of the result and handed the saved driver state - which is what asks the
 * restored world every Workgrumble question there is: is there a player node,
 * does it carry a day state, does the clock land on a day this week has, and
 * does the registry still hold the verbs the day loop dispatches. All of those
 * throw, all of them used to throw AFTER the running session had been
 * replaced, and none of them is something the engine's generic coherence check
 * has any business knowing about.
 */
function preflight(
  file: Readonly<SaveFile>,
  actor: NodeId,
  probeEngine: (() => EngineApi) | undefined,
): SaveOutcome {
  if (probeEngine === undefined) {
    return { ok: true, value: undefined };
  }

  try {
    const probe = probeEngine();
    probe.restore(file.engine);
    const driver = new DayDriver(probe, actor, 0, SILENT_HANDLERS);
    driver.restoreDriverState(file.driver);
    // The two reads every day screen makes on its first paint. A world that
    // cannot answer them is a world the shell cannot draw.
    driver.state();
    driver.schedule();
  } catch (failure: unknown) {
    return refuse(loadFailure(failure));
  }

  return { ok: true, value: undefined };
}

/** Puts the session that was running back, after a commit went wrong. */
function undo(
  rollback: {
    readonly engine: string;
    readonly app: AppState;
    readonly driver: DriverState;
  },
  parts: Readonly<SessionParts>,
  failure: unknown,
): SaveOutcome {
  try {
    parts.engine.restore(rollback.engine);
    parts.appState.hydrate(rollback.app);
    parts.day.restoreDriverState(rollback.driver);
  } catch {
    // Both worlds are now gone, which is the one outcome worth restarting for.
    return refuse(
      'That save would not load, and putting the session back did not work '
      + 'either. Nothing here can be trusted now - reload the page and load '
      + 'again, or start a new week.',
    );
  }

  return refuse(loadFailure(failure));
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
  const { engine, appState, day, slot, retry, actor } = parts;
  const number = (field: string): number => {
    const value = engine.graph.getField(actor, field);
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : 0;
  };

  return {
    save: (): SaveOutcome => {
      const display = formatSimTime(engine.now());
      const outcome = slot.write({
        schema: SAVE_SCHEMA,
        savedAtTick: engine.now(),
        label: `${display.day}, ${display.time}`,
        engine: engine.serialize(),
        app: appState.snapshot(),
        driver: day.driverState(),
      });

      parts.onWrite?.(outcome);
      return outcome;
    },

    /**
     * All-or-nothing, in two layers, because it used to be neither.
     *
     * The engine's own restore IS atomic, and that was being mistaken for the
     * load being atomic. It is not: the app state and the DRIVER are put back
     * afterwards, outside the catch, and the driver is the half that asks the
     * restored world Workgrumble-specific questions - which day is it, what
     * state is the player's day in, does this registry still hold the verbs
     * that stop the service clock. A structurally valid engine world with no
     * `person:pat` in it passes `engine.restore` happily and then throws in
     * `restoreDriverState`, by which time the running session has already been
     * replaced and the click handler has an uncaught exception in it.
     *
     * So: the whole file is tried in a DISPOSABLE session first - a fresh
     * engine, restored, with a real driver built on top of it - and only a
     * file that survives that is committed. And the commit itself is wrapped
     * in a snapshot of all three components, so anything the preflight did not
     * think to model still leaves the player in the session they were in
     * rather than halfway between two.
     */
    load: (): SaveOutcome => {
      const file = slot.read();

      if (!file.ok) {
        return file;
      }

      const tried = preflight(file.value, actor, parts.probeEngine);

      if (!tried.ok) {
        return tried;
      }

      const rollback = {
        engine: engine.serialize(),
        app: appState.snapshot(),
        driver: day.driverState(),
      };

      try {
        engine.restore(file.value.engine);
        appState.hydrate(file.value.app);
        day.restoreDriverState(file.value.driver);
        return { ok: true, value: undefined };
      } catch (failure: unknown) {
        return undo(rollback, parts, failure);
      }
    },

    hasSave: (): boolean => slot.exists(),

    /**
     * The order matters. The carry-over is written FIRST, because it is the
     * only thing worth keeping; the save goes next, because it describes a
     * world nobody is going back to; and the restart is last, because after it
     * nothing in this session runs again. A failure to write the carry-over
     * stops all three - a retry that silently lost the fund would be the one
     * joke this game cannot afford to get wrong.
     */
    retryWeek: (): SaveOutcome => {
      const written = retry.write(recordFrom(
        number(FIELDS.weekAttempt),
        number(FIELDS.farmFund),
        appState.snapshot(),
      ));

      parts.onWrite?.(written);

      if (!written.ok) {
        return written;
      }

      slot.clear();
      parts.restart();
      return { ok: true, value: undefined };
    },
  };
}
