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
import { stayRecord, switchRecord, type SwitchSlot } from './switch';
import { BUILD_VERSION } from '../shared/build';
import {
  careerAfter,
  type CareerStanding,
} from '../world/career';
import {
  type CarriedValue,
  parseCarried,
  readCarried,
} from '../world/carry';
import {
  employerFor,
  FIRST_EMPLOYER,
  nextEmployerAfter,
} from '../world/employers';
import { FIELDS, playerTierOf } from '../world/fields';
import { SHARE_CUSTOMERS } from '../world/msp-company';
import { exitForOutcome } from '../world/offer';
import { PROBATION_WEEK } from '../world/pressure';
import { isReviewOutcome } from '../world/week';
import { generatedWeek } from '../world/week-gen';
import { weekRequestFrom, type WeekSource } from '../world/week-source';

/**
 * The shape written today. Bumped when the file's meaning changes.
 *
 * 1: the M2 shell - chat, mail, kb and the day screens.
 * 2: M3's pressure layer adds two screen slices, the Browser's page and the
 *    scene the lead's last visit left behind.
 * 3: the deploy milestone. A save can now exist in two places - this browser
 *    and the badge it is synced to - so it has to carry a WALL CLOCK, because
 *    "which of these two is newer" is a question the simulation tick cannot
 *    answer: the tick restarts every week and goes backwards on a retry. And
 *    the build that wrote it, so a file from a future version can say which.
 * 4: the employer switch (E5). A save now says WHICH employer it is a week at,
 *    because a career spans more than one and the standing/title are in the
 *    engine payload but the employer's IDENTITY is not - it is the one fact a
 *    reload needs that the graph does not carry. Absent means the first
 *    employer, which is the only one a schema-3 file could have been at.
 * 5: week two (E11). A save now carries the ESTATE DELTA its week was stood up
 *    with - the values the employer's whitelist said survive a week boundary,
 *    as they stood on the MONDAY. The world in the payload already holds them
 *    as they stand now, so this is not a second copy of the world: it is the
 *    OPENING BALANCE, and it is here for the one question the live graph
 *    cannot answer by the Friday. A firing hands the player the week they lost,
 *    not the week they made of it, so the retry has to be seeded with the
 *    building as it stood on the Monday - and by the Friday the graph is
 *    holding the Friday. Absent means no delta, which is what every week one
 *    of every career carries and what every schema-4 file was written with.
 * 6: the customer walls reach the shares (0.38.1). 0.38.0 gave a `share` node
 *    the customer field the boxes and the staff accounts already carried, and
 *    it gave it AT SEED TIME only - so a file written by any earlier build
 *    carries the two shares with the field absent, `customerIdOfShare` reads
 *    null off them, and null is the in-house answer. A carried save's customer
 *    share therefore had neither the tenant STOP nor the contract wall while
 *    every world stood up fresh had both, which is a save that plays a
 *    different game. The step stamps the field.
 */
export const SAVE_SCHEMA = 6;

export const SAVE_KEY = 'workgrumble/save';

export interface SaveFile {
  readonly schema: number;
  /** Simulation tick the save was taken at - what the slot advertises. */
  readonly savedAtTick: number;
  /**
   * Real milliseconds since the epoch, from the machine that wrote it.
   *
   * The one number in the file that is about the world outside the game, and
   * it is here for exactly one job: deciding which of two copies of a badge's
   * week is the later one. Clocks disagree between machines, which is why the
   * rule is "newest wins AND the loser is kept" rather than "newest wins".
   */
  readonly savedAt: number;
  /** Which build wrote it. Null for a file from before builds said. */
  readonly version: string | null;
  /** How the slot reads in a menu: "Day 2, 12:35". */
  readonly label: string;
  /**
   * Which employer this week is at.
   *
   * The career stats - reputation, title - ride the engine payload, because
   * they are fields on the player node the graph serializes verbatim. The
   * employer id does not: it is deliberately not a graph field (a new field on
   * the player node would move the probation goldens), so it is carried here,
   * beside the wall clock and the build, as the one thing a load needs to know
   * which company the restored world belongs to.
   */
  readonly employer: string;
  /**
   * The estate delta this week was STOOD UP with (schema 5).
   *
   * The opening balance of the building, and deliberately not a copy of the
   * current one - the engine payload below is the current one. It rides the
   * file because it is the only fact about this week that the world stops being
   * able to answer the moment the player changes anything: by Thursday the
   * graph holds Thursday's note by the socket, and a retry that read the delta
   * off it would hand a fired player the repairs they made in the week they
   * were fired for.
   *
   * Empty for every week that carried nothing, which is week one of every
   * career and every save any earlier build wrote.
   */
  readonly carried: readonly CarriedValue[];
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

  // Each step upgrades one schema to the next, in order, so a schema-2 file
  // walks 2 -> 3 -> 4 and arrives complete.
  let value = file;

  // 2 -> 3. A schema-2 file has a complete world in it - nothing about the
  // pressure layer changed - and is missing only the two facts that were added
  // for a save that can live in two places at once.
  //
  // `savedAt: 0` is not a guess dressed as a fact. It means "older than
  // anything with a real stamp on it", which is exactly right: a file written
  // before this build existed cannot have been written after one that was, and
  // a sync that treated an unknown time as NOW would let a stale local copy
  // beat the badge's own.
  if ((value.schema as number) < 3) {
    value = { ...value, schema: 3, savedAt: 0, version: null };
  }

  // 3 -> 4. The world is complete and the standing is already in the engine
  // payload; the only fact a schema-3 file lacks is which employer it is at,
  // and there is exactly one honest answer - the first, the only employer any
  // file this old could have been written at.
  if ((value.schema as number) < 4) {
    value = { ...value, schema: 4, employer: FIRST_EMPLOYER };
  }

  // 4 -> 5. The world is complete and needs nothing: a schema-4 file was
  // written by a build in which no career could reach week two, so the week it
  // holds was stood up from the employer's own seed and NOTHING else. The
  // honest opening balance for it is therefore the empty one - which is not a
  // guess dressed as a fact but the only value it could have had - and it is
  // exactly the shape the 3 -> 4 step used: one fact this build needs, with one
  // true answer for every file that predates it.
  if ((value.schema as number) < 5) {
    value = { ...value, schema: 5, carried: [] };
  }

  // 5 -> 6. The first step that reaches INTO the engine payload, because the
  // fact that is missing is a field on a node rather than a fact about the
  // file. 0.38.0 gave the shares the customer field the boxes and the staff
  // accounts already had, and gave it at SEED time - so a world stood up by
  // this build has it and a world carried in a file does not, and the one
  // without it is the one whose customer share has no wall in front of it.
  //
  // The ledger's own 0.38.0 addition - the fifth column on a work segment,
  // the node the minutes were attributed off - is deliberately NOT backfilled.
  // A four-field line is legal and reads as "no source", which is exactly what
  // it is: those minutes were recorded by a build that did not track one, and
  // the invoices they went onto have already been rendered and paid. Inventing
  // a source for them would let `settleAttributionDrift` re-bucket a week
  // somebody has already been billed for, which is a worse answer than a
  // column that says nothing.
  if ((value.schema as number) < 6) {
    value = { ...value, schema: 6, engine: withShareCustomers(value.engine) };
  }

  return { ok: true, value };
}

/**
 * The engine payload with every seeded share's customer stamped on, or the
 * string exactly as it came in when there was nothing to stamp.
 *
 * The attribution comes from `SHARE_CUSTOMERS`, which is the same table the
 * seed stamps from - one answer to "whose share is that", read twice, rather
 * than a copy here that goes a version stale the first time a share is added.
 *
 * Absent-only: a share that already carries a customer is left alone, so the
 * step is idempotent and a hand-edited file's own answer is not overwritten by
 * this one.
 *
 * The payload is re-serialized rather than patched as text, and that is safe
 * for the one reason worth writing down: the engine holds every field value as
 * a double and hashes it through its own formatter, so a `0.0` this build
 * writes and the `0` a JavaScript round trip gives back are the same value in
 * the restored world and hash identically. Nothing else in the file is touched,
 * and a file with no share to stamp keeps its bytes.
 */
function withShareCustomers(engine: unknown): unknown {
  if (typeof engine !== 'string' || engine.length === 0) {
    return engine;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(engine);
  } catch {
    // Not readable as JSON, so not something this step can improve. The
    // restore refuses it a moment later, with the engine's own sentence.
    return engine;
  }

  const nodes = (payload as { graph?: { nodes?: unknown } })?.graph?.nodes;

  if (!Array.isArray(nodes)) {
    return engine;
  }

  const owners = new Map(Object.entries(SHARE_CUSTOMERS));
  let stamped = false;

  for (const node of nodes as unknown[]) {
    if (typeof node !== 'object' || node === null) {
      continue;
    }

    const { id, kind, fields } = node as {
      id?: unknown;
      kind?: unknown;
      fields?: unknown;
    };

    if (
      kind !== 'share'
      || typeof id !== 'string'
      || typeof fields !== 'object'
      || fields === null
    ) {
      continue;
    }

    const owner = owners.get(id);
    const bag = fields as Record<string, unknown>;

    if (owner === undefined || bag[FIELDS.machineCustomer] !== undefined) {
      continue;
    }

    bag[FIELDS.machineCustomer] = owner;
    stamped = true;
  }

  return stamped ? JSON.stringify(payload) : engine;
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

  const version = file.version === null || typeof file.version === 'string'
    ? file.version
    : undefined;

  // The employer is read tolerantly, not strictly: a migrated file always has
  // it (the 3 -> 4 step wrote it), and a native schema-4 file always has it
  // (the writer does), but a hand-edited or truncated one that lost it is a
  // week at the first employer rather than a refused save - the same rule the
  // migration reads, applied one layer out.
  const employer = typeof file.employer === 'string' && file.employer.length > 0
    ? file.employer
    : FIRST_EMPLOYER;

  // The delta is read STRICTLY where the employer is read tolerantly, and the
  // two are different on purpose. A missing employer has one honest answer
  // (there was only ever one shop those files could be at); a delta with
  // rubbish in it has none - it is a Monday whose building came back with half
  // the repairs on it, and nothing on any screen would say which half. A file
  // with no delta AT ALL is legal and empty, because that is the migration's
  // own answer for every schema-4 save.
  const carried = parseCarried(file.carried);

  if (
    typeof file.engine !== 'string'
    || file.engine.length === 0
    || typeof file.label !== 'string'
    || typeof file.savedAtTick !== 'number'
    || !Number.isSafeInteger(file.savedAtTick)
    || file.savedAtTick < 0
    || typeof file.savedAt !== 'number'
    || !Number.isSafeInteger(file.savedAt)
    || file.savedAt < 0
    || version === undefined
    || carried === null
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
      savedAt: file.savedAt,
      version,
      label: file.label,
      employer,
      carried,
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
    const raw = this.readRaw();

    return raw === null
      ? refuse('There is no saved game to load.')
      : parseSaveFile(raw);
  }

  /**
   * The file as text, unparsed.
   *
   * The cloud copy is this slot's bytes and nothing else - the Worker keeps
   * the game's own file verbatim rather than a re-serialization of it, so what
   * goes up and what comes down is what was written here. Anything that PARSES
   * it (deciding which of two copies is newer, refusing one this build cannot
   * read) does that on top; this is the seam that hands over the bytes.
   */
  public readRaw(): string | null {
    try {
      return this.storage.getItem(this.key);
    } catch {
      return null;
    }
  }

  /**
   * And back in, unparsed, for a file that came from the badge rather than
   * from this session. It is checked before it gets here; writing it verbatim
   * is what keeps the copy in the browser byte-identical to the copy on the
   * badge, which is what makes "these two are the same save" a thing anybody
   * can check rather than believe.
   */
  public writeRaw(text: string): SaveOutcome {
    try {
      this.storage.setItem(this.key, text);
      return { ok: true, value: undefined };
    } catch {
      return refuse(
        'The browser would not keep that save. Storage is full, or this '
        + 'window is not allowed any.',
      );
    }
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
  /**
   * Takes the offer: leaves this employer for the next one, carrying the career.
   *
   * The sibling of `retryWeek`, and a session verb for the same reason - the
   * world it would change is the one being thrown away. It reads how the
   * probation ended off the graph, turns that into the standing the next
   * employer seeds from (`careerAfter`), writes the one record that outlives the
   * tab (the switch slot), throws the save away and starts the page again on the
   * new employer's Monday. It answers rather than throwing: a week that is not
   * over yet has no offer to take, and a browser that will not keep the record
   * says so with the session it was in still running.
   */
  switchEmployer(): SaveOutcome;
  /**
   * Stays: the same employer, and it is week `n + 1` (E11, 0.34.0).
   *
   * The THIRD door out of a Friday, and the one the game has been written for
   * since 0.2.7 without ever having: `ARC_WEEKS` declares every employer a
   * twelve-week job - the probation shop's twelve with a redundancy round at
   * weeks four to ten on them (#59a), everybody else's twelve with nothing -
   * and no career had ever reached week two, so the whole systemic layer above
   * the week was shipped, tested and unreachable. This is the door.
   *
   * A session verb, exactly like its two siblings and for exactly the same
   * reason: the world it would change is the one being thrown away. It reads
   * the verdict and the standing off the graph, reads the employer's declared
   * whitelist off the world that is ending, writes one record that outlives the
   * tab, throws the save away and starts the page again on the same shop's next
   * Monday. It answers rather than throwing - a week that is not over has no
   * next week to go to, a firing is not a thing you stay through, and neither
   * is a redundancy, because in a redundancy the role is what went.
   */
  stayAnotherWeek(): SaveOutcome;
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
  /**
   * Where the career that crosses a change of employer is written down.
   *
   * The switch's own slot, beside the retry's, because a switch throws the save
   * away the same way a retry does and the record of who you are has to outlive
   * both. Read on the boot that stands the next employer up.
   */
  readonly switch: SwitchSlot;
  /** The node the week's fund and attempt number live on. */
  readonly actor: NodeId;
  /**
   * Which employer this session is at, stamped into every save.
   *
   * Optional and defaulting to the first employer, because that is the only one
   * this build stands up and the only one a session could be at until the
   * switch is wired to the shell (slice 2). It comes in through the seam rather
   * than being read off the graph because the employer's identity is not a
   * graph field - see `SaveFile.employer`.
   */
  readonly employer?: string;
  /**
   * The estate delta this session's week was STOOD UP with (E11, 0.34.0).
   *
   * Comes in through the seam rather than being read off the graph for the same
   * reason the employer id does: it is a fact about how the world was BUILT
   * rather than a fact the world holds. The Monday's graph and this agree; by
   * Wednesday they do not, and the difference is what a firing is owed.
   *
   * Absent is the empty delta, which is every first week.
   */
  readonly carried?: readonly CarriedValue[];
  /**
   * Told which employer a LOAD just stood up, so the shell can follow it
   * (0.6.0, P1-1).
   *
   * A load can restore a world from a different shop than the one this session
   * booted at, and two things outside this seam are keyed to the employer: the
   * install-policy the audit drip reads, and the name the offer surface prints.
   * The driver's own content the load re-points itself (`day.adoptEmployer`);
   * this is how the rest of the shell hears about the change. Absent is fine -
   * a headless save test has no shell to update.
   */
  onEmployerRestored?(employer: string): void;
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
  /**
   * Which week a loaded save's world is in.
   *
   * Injected for the same reason the probe engine is: this module has no
   * business knowing how a week is decided, and the answer has to be the one
   * the session that WROTE the file would have got. It is asked with the
   * employer the file names and the attempt and arc position read off the
   * restored graph, so a save taken in one week cannot reload into another.
   * The default is the generator, which at the first week of an arc emits the
   * shop's authored table byte for byte - so this is the same answer the
   * shipped table gave, arrived at through the seam a later week will need.
   */
  weekFor?: WeekSource;
  /**
   * Real time, injected.
   *
   * The save is the one file in this product that has to know what the clock
   * on the wall says, because a badge can hold a copy written on another
   * machine and "which of these is newer" has no answer in simulation ticks.
   * It comes in through the seam rather than being read here so that a test
   * about two saves an hour apart is a test rather than a wait.
   */
  now?(): number;
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
  weekFor: WeekSource,
): SaveOutcome {
  if (probeEngine === undefined) {
    return { ok: true, value: undefined };
  }

  try {
    const probe = probeEngine();
    probe.restore(file.engine);
    const driver = new DayDriver(probe, actor, 0, SILENT_HANDLERS);
    driver.restoreDriverState(file.driver);
    // The employer the file names, resolved against the closed set - a save
    // naming a shop this build never shipped is refused HERE, before the live
    // session is touched, rather than throwing mid-commit (0.6.0, P1-1). And
    // its week is adopted so the schedule this preflight reads is the one the
    // real load will deal, not the probation default the probe booted with.
    const employer = employerFor(file.employer);
    // And the WEEK the file's world is in, resolved from that world rather
    // than from the employer record: the attempt and the arc position are
    // fields on the player node, they were just restored, and the day the
    // weeks are sampled they are what decides which week this is. The
    // preflight has to read the same week the commit will, or it is a
    // rehearsal of a different load.
    driver.adoptEmployer(
      weekFor(weekRequestFrom(probe.graph, actor, employer.id)),
      employer.channels,
      employer.runsBossPings,
      employer.arc,
    );
    // The two reads every day screen makes on its first paint. A world that
    // cannot answer them is a world the shell cannot draw.
    driver.state();
    driver.schedule();
    // And the LEDGER (0.38.1). It is not on the first paint - the sheet is a
    // window the player opens - and that is exactly why it belongs here: a
    // file whose ledger cannot be read used to load fine and then either lose
    // a morning silently or throw an afternoon later, in a window, over a
    // corruption that was in the file the whole time. It is read where every
    // other unreadable half of a save is read, in a session nobody is playing.
    driver.timesheetTruth();
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
  // Which employer this session is a week at, as LIVE state rather than a
  // constant: a load can move it (P1-1), and every save written afterwards - the
  // day-boundary checkpoint, the retry record - has to stamp the shop the world
  // is actually at now, or the next load would stand the wrong company up.
  let employerId = parts.employer ?? FIRST_EMPLOYER;
  // And the opening balance of the building, as LIVE state for the same reason
  // the employer is: a load replaces the world with one that was stood up from
  // a different Monday, and every retry and every stay written afterwards has
  // to answer with the delta THAT week opened on.
  let carriedIn: readonly CarriedValue[] = parts.carried ?? [];
  const number = (field: string): number => {
    const value = engine.graph.getField(actor, field);
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : 0;
  };
  /** A string field off the player, or null where there is nothing to read. */
  const text = (field: string): string | null => {
    const value = engine.graph.getField(actor, field);
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  return {
    save: (): SaveOutcome => {
      const display = formatSimTime(engine.now());
      const outcome = slot.write({
        schema: SAVE_SCHEMA,
        savedAtTick: engine.now(),
        savedAt: (parts.now ?? Date.now)(),
        version: BUILD_VERSION,
        label: `${display.day}, ${display.time}`,
        employer: employerId,
        carried: carriedIn,
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

      const weekFor = parts.weekFor ?? generatedWeek;
      const tried = preflight(file.value, actor, parts.probeEngine, weekFor);

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
        // The file says which employer its world is at; the week, rooms and
        // ping flag are the build's, keyed to that id. Re-point the driver at
        // them so a Bodgeworth save reloads STILL Bodgeworth - its week deals,
        // its rooms draw - rather than continuing on the booted shop's content
        // (0.6.0, P1-1). Validated already in preflight, so this cannot throw on
        // an unknown shop; it is inside the try regardless, so anything that
        // does still leaves the player in the session they were in.
        const restored = employerFor(file.value.employer);
        // The week is resolved from the world that was just put back - the
        // employer the file names, plus the attempt and the arc position off
        // the restored player node - rather than from the employer record
        // alone. With one week per shop those are the same table; with a
        // sampled week they are not, and the difference is a player's
        // Wednesday morning quietly becoming somebody else's week. Nothing
        // throws when that happens, which is exactly why it is fixed before
        // the sampler exists rather than after.
        day.adoptEmployer(
          weekFor(weekRequestFrom(engine.graph, actor, restored.id)),
          restored.channels,
          restored.runsBossPings,
          // And the arc, beside them: a save taken at a shop with no season on
          // it reloads with no season on it, whatever the tab happened to boot
          // at (#59a).
          restored.arc,
        );
        // Every save from here stamps the shop just loaded, and the rest of the
        // shell (install policy, the offer's next-employer name) is told.
        employerId = restored.id;
        // And the opening balance of the building the file was taken in, so a
        // firing after a load hands the player the Monday that file's week
        // started on rather than the Monday this tab happened to boot at.
        carriedIn = file.value.carried;
        parts.onEmployerRestored?.(restored.id);
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
        number(FIELDS.arcWeek),
        // The retry replays the shop the week was fired at, not a fall-back to
        // the probation one (0.6.0, P1-5).
        employerId,
        // And the building as it stood on the Monday that was lost - the
        // opening balance, never the Friday's. A firing does not hand back the
        // repairs made in the week it was for (E11, 0.34.0).
        carriedIn,
        // And the career the firing does NOT take off you (E9, 0.35.0): the
        // tier is permanent and the title with it, so the Monday a fired
        // engineer comes back to is an engineer's Monday. Read off the graph
        // rather than remembered, because a promotion taken during the week
        // that ended in a firing still happened.
        playerTierOf(engine.graph.getField(actor, FIELDS.playerTier)),
        text(FIELDS.title),
      ));

      parts.onWrite?.(written);

      if (!written.ok) {
        return written;
      }

      slot.clear();
      parts.restart();
      return { ok: true, value: undefined };
    },

    /**
     * The same three-step order the retry keeps, and for the same reason: the
     * record that outlives the tab is written FIRST, the save is thrown away
     * next because it describes a world nobody is going back to, and the restart
     * is last because after it nothing in this session runs again. A failure to
     * write the switch record stops all three - a switch that lost the career
     * would carry a fresh probationer into the next job wearing somebody else's
     * fund.
     */
    switchEmployer: (): SaveOutcome => {
      const outcome = engine.graph.getField(actor, FIELDS.reviewOutcome);

      if (!isReviewOutcome(outcome) || outcome === 'pending') {
        return refuse(
          'There is no offer to take yet. The week is not over, so nothing has '
          + 'decided which door you are walking out of.',
        );
      }

      const exit = exitForOutcome(outcome);

      if (exit === null) {
        return refuse('There is no offer to take from a week that is not over.');
      }

      const title = engine.graph.getField(actor, FIELDS.title);
      const standing: CareerStanding = {
        reputation: number(FIELDS.reputation),
        title: typeof title === 'string' && title.length > 0
          ? title
          : 'IT Support Technician',
        farmFund: number(FIELDS.farmFund),
        // The tier crosses the switch permanently (E6): read off the graph with
        // the desk default, so a player promoted at this shop arrives at the
        // next one an engineer, and one who never was arrives service_desk -
        // which carries as null and writes nothing, keeping the switch goldens
        // byte-identical until a promotion actually happens.
        tier: playerTierOf(engine.graph.getField(actor, FIELDS.playerTier)),
      };
      const next = nextEmployerAfter(employerId);

      const written = parts.switch.write(
        switchRecord(next, careerAfter(exit, standing)),
      );

      parts.onWrite?.(written);

      if (!written.ok) {
        return written;
      }

      slot.clear();
      parts.restart();
      return { ok: true, value: undefined };
    },

    /**
     * Staying, which is the same three-step order again and for the third time
     * the same reason: the record that outlives the tab is written FIRST, the
     * save of a world nobody is going back to goes next, and the restart is
     * last because after it nothing in this session runs again.
     *
     * The three refusals are the fiction, not a validation pass. A week that is
     * not over has not decided anything, so there is nothing to stay INTO. A
     * firing and a redundancy are the two endings where staying is not
     * available to the player as a matter of fact rather than of rules - one
     * has taken the lanyard off you and the other has taken the role away - so
     * both are answered in the words that say which. And the arc's last week is
     * a refusal because the arc is twelve weeks long and `pressure.ts` says so:
     * the door out of week twelve is the offer, and inventing a week thirteen
     * here would be the shell overruling the one table that knows how long a
     * job is (the several post-arc doors D-E11-3 asks for are a design
     * proposal, not a fall-through).
     */
    stayAnotherWeek: (): SaveOutcome => {
      const outcome = engine.graph.getField(actor, FIELDS.reviewOutcome);

      if (!isReviewOutcome(outcome) || outcome === 'pending') {
        return refuse(
          'There is no next week yet. The week is not over, so nobody has said '
          + 'whether there is one.',
        );
      }

      if (outcome === 'fired') {
        return refuse(
          'They have taken the lanyard off you. Staying is not one of the '
          + 'things on offer - the Monday you can have is this one again, or a '
          + 'worse job somewhere else.',
        );
      }

      if (outcome === 'redundant') {
        return refuse(
          'The role went, which is the whole point of a redundancy: there is '
          + 'no desk here next week to come back to. What is on the other side '
          + 'of this is a different employer.',
        );
      }

      const employer = employerFor(employerId);
      const here = number(FIELDS.arcWeek);
      const arcWeek = Math.max(PROBATION_WEEK, here);

      if (arcWeek >= employer.arc.weeks) {
        return refuse(
          `That was week ${String(arcWeek)} of ${String(employer.arc.weeks)} at `
          + `${employer.name}, and ${String(employer.arc.weeks)} is how long `
          + 'this job is. What comes after it is the offer, not another Monday '
          + 'here.',
        );
      }

      const title = engine.graph.getField(actor, FIELDS.title);
      const standing: CareerStanding = {
        reputation: number(FIELDS.reputation),
        title: typeof title === 'string' && title.length > 0
          ? title
          : 'IT Support Technician',
        farmFund: number(FIELDS.farmFund),
        tier: playerTierOf(engine.graph.getField(actor, FIELDS.playerTier)),
      };

      const written = parts.switch.write(stayRecord(
        employerId,
        // A stay is a clean continuation and is scored as one: `completed`
        // leaves no trail and takes nothing off the standing, which is what
        // passing a week and turning up again on the Monday is.
        careerAfter('completed', standing),
        arcWeek + 1,
        // The delta is read off the world that is ENDING - the Friday - which
        // is the opposite of what the retry reads and is right for the opposite
        // reason: next week starts where this week left the building.
        readCarried(engine.graph, employer.carries),
        appState.snapshot().installed.apps,
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
