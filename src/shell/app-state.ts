/**
 * What the apps remember when their windows are not open.
 *
 * A window used to BE its app's memory: close the chat and the conversation
 * had never happened, close the inbox and every mail was unread again. That is
 * a window manager pretending to be a save file, and it fails the moment
 * either one is asked to do the other's job - which is what M3 asks, because a
 * save has to carry what the player was reading as well as what the world was
 * doing.
 *
 * So the shell owns this, the apps read and write it, and the save carries it
 * verbatim. Nothing here is world state: no ticket, no field, no money. If it
 * changes what is TRUE it belongs in the graph; if it changes what is ON
 * SCREEN it belongs here.
 */

import { isInstallableId } from './apps/installable';

export type ChatSpeaker = 'them' | 'you' | 'system';

export interface ChatLine {
  readonly who: ChatSpeaker;
  readonly text: string;
}

export interface ChatThread {
  /** The dialogue node the conversation is standing on. */
  readonly nodeId: string;
  /** The root it is running from, so a resolution can move it. */
  readonly rootUsed: string;
  readonly lines: readonly ChatLine[];
  readonly ended: boolean;
}

export interface ChatState {
  readonly selectedId: string | null;
  readonly threads: Readonly<Record<string, ChatThread>>;
}

export interface MailState {
  readonly selectedId: string | null;
  /** Threads the player has actually opened. */
  readonly read: readonly string[];
}

/**
 * What the Hubbub window was showing, and which messages have been read.
 *
 * The read ledger is message ids rather than a per-room high-water mark,
 * because the messages are authored week data (`src/world/channels.ts`) and
 * ids are what they are keyed by everywhere else. It is screen state, not
 * world state - which messages EXIST at a tick is the week's table, and
 * whether this player has read them changes nothing but a badge - so it rides
 * in the store the save carries verbatim, exactly as the inbox's does.
 */
export interface HubbubState {
  readonly selectedChannel: string | null;
  /** Message ids the player has actually had on screen. */
  readonly read: readonly string[];
  /**
   * Message ids the attention drip has already billed for stress (0.5.0 slice
   * 3).
   *
   * The watermark for "unread channel content costs a point once": the driver
   * charges a message the first meter tick it is unread and not already in here,
   * then adds it, so a pile that sits unread all week is not billed every
   * interval - it is billed once and remembered. It rides beside `read` because
   * it is the same shape and the same kind of screen state - a fact about what
   * THIS player has been charged, changing nothing in the world but which
   * messages the meters have already noticed - and a save carries it verbatim so
   * a reload does not re-bill the pile it was already billed for.
   */
  readonly charged: readonly string[];
}

export interface KbState {
  readonly selectedId: string | null;
}

export interface DayScreensState {
  /** The last day whose morning brief was put on screen unasked. */
  readonly briefShownFor: number | null;
  /** The last day whose scorecard was. */
  readonly scorecardShownFor: number | null;
}

/** Which parody site the Browser was left on. */
export interface BrowserAppState {
  readonly siteId: string | null;
}

/**
 * The last thing the lead caught you at.
 *
 * It is screen state rather than world state: the CONSEQUENCE of being caught
 * is meters in the graph, and this is only which scene the window shows and
 * what time it says at the top of it. Kept in the store so the window can be
 * closed and reopened without the scene becoming a blank telling-off.
 */
export interface CaughtState {
  readonly appId: string | null;
  readonly at: number | null;
  /**
   * How much of the morning the lead was reading off, for the one scene that
   * is about a record rather than about a screen - and null for every scene
   * that is about a screen.
   *
   * It is CAPTURED at the arrival rather than read live by the window, and
   * that is not an optimisation: the same reading goes onto the conduct file
   * in the same minute, and two surfaces recomputing a running number would
   * eventually print two different accounts of one conversation. The world
   * also clears the record as part of having the conversation, so a window
   * that asked afterwards would be asking about nothing.
   */
  readonly evidence: number | null;
  /**
   * The installs the software conversation was about, by app id, for the one
   * scene that names what was actually on the audit - and null for every scene
   * that is about a screen or the dot.
   *
   * Captured at the arrival like the evidence above and for the same reason: the
   * conversation copies the audit into the "spoken about" field as part of
   * having it, so a window recomputing the unspoken set afterwards would find
   * nothing, and the scene has to name what he came down about, not what is left.
   */
  readonly software: readonly string[] | null;
}

/**
 * One window, as a save remembers it.
 *
 * Where it was dragged to is deliberately not here: a window's geometry is a
 * property of the screen it was on, and a save loaded on a different one would
 * put it somewhere nobody left it. What IS here is the part the WORLD reacts
 * to - whether it is up, and whether it is minimised - because the pressure
 * layer reads exactly that to decide what the lead sees when he comes round.
 */
export interface OpenWindowState {
  readonly appId: string;
  readonly minimized: boolean;
}

/**
 * The screen itself: which windows are open, bottom of the pile first, and
 * which one the player is in.
 *
 * It lives with the app state rather than in the window manager's own memory
 * because a save that does not carry it is a save that changes the answer to
 * the only question the boss mechanic asks. Loading mid-telegraph with the
 * Browser up used to bring the player back with a clean screen and no
 * conversation, which is the reload button as a cheat code.
 */
export interface WindowsState {
  readonly open: readonly OpenWindowState[];
  readonly focusedId: string | null;
}

/**
 * How many times the player has closed the thing on the desk with the face on
 * it.
 *
 * One number, and it is here rather than in the graph because it changes what
 * is ON SCREEN and nothing else: no ticket, no meter and no clock reads it,
 * the scripted walks never touch it, and the goldens are asserted byte-
 * identical on that fact. What it decides is which of the escalating notes the
 * character comes back with, which is a joke that only works if it survives a
 * save - so it rides in the store the save carries verbatim.
 */
export interface AssistantState {
  readonly dismissals: number;
  /**
   * The day it was last closed on, or null while it is open.
   *
   * The DURABLE half of the dismissal gag, and it is here rather than in the
   * character's own instance for one reason found on the box: the note it comes
   * back with has to survive the same paths the player drives it through - a
   * boss beat writing to the store, a day boundary, a save and a reload - and
   * an object the desktop re-instantiates cannot. It says "closed, owes a note
   * on return"; the character reads it, and clears it the minute it pays the
   * note. The scripted walks never close it, so it stays null and the goldens
   * do not move.
   */
  readonly closedOnDay: number | null;
}

/**
 * The most times the count will ever hold.
 *
 * The gag stops escalating after a handful of tiers, so the exact number past
 * that decides nothing on screen - but it is the one field the save carries as
 * a running total, and a total with no ceiling is a total that a hand-edited
 * save can set to the top of the safe-integer range, whereupon the very next
 * dismissal overflows it into an unsafe integer and the next save will not
 * parse. So it is clamped, on the way in and on the way up, to a number nobody
 * reaches by playing and a save cannot climb past.
 */
export const ASSISTANT_DISMISSAL_CAP = 10_000;

/**
 * What the player has installed off the web store.
 *
 * It is here, in the save-carried shell state, and NOT in the world graph, for
 * the same reason the open windows are: it changes what is ON SCREEN - which
 * apps the desktop mounts - rather than what is TRUE. What installing writes to
 * the world is the AUDIT TRAIL (`install_audit`), which is a different fact with
 * a different life: the trail outlives the app, because uninstalling takes the
 * toy off this list and leaves the record that it was here on the graph.
 *
 * The resolved manifest the desktop mounts is `base ∪ apps`
 * (`resolveManifest`). An install adds an id here and dispatches the world verb;
 * an uninstall removes it and dispatches the other. Every scripted walk leaves
 * it empty, and the goldens are asserted byte-identical on that fact.
 */
export interface InstalledState {
  /** Installable-app ids, in the order they were installed. */
  readonly apps: readonly string[];
}

/**
 * Which monitoring alerts the player has acknowledged (0.9.0, the RMM board).
 *
 * Acknowledging an alert is "I have seen this" - it quiets the board's nag
 * without touching the world, so it is screen state and lives here, not in the
 * graph: what a monitoring alert's TRUE status is lives on the estate node the
 * board reads, and whether THIS player has looked at it changes nothing but a
 * marker. It rides beside the inbox's read ledger and the rooms' because it is
 * the same kind of thing - a list of ids this player has had on screen - and a
 * save carries it verbatim so a reload does not un-see what was seen. Escalating
 * is the opposite: that IS a world change (it resolves the alert ticket), so it
 * goes through the engine, not here. Every scripted walk leaves this empty, and
 * the goldens are asserted byte-identical on that fact.
 */
export interface MonitorState {
  /** Ack ids (a real alert's stable id, or a noise flare's per-day id). */
  readonly acknowledged: readonly string[];
}

export interface AppState {
  readonly chat: ChatState;
  readonly mail: MailState;
  readonly hubbub: HubbubState;
  readonly kb: KbState;
  readonly day: DayScreensState;
  readonly browser: BrowserAppState;
  readonly caught: CaughtState;
  readonly windows: WindowsState;
  readonly assistant: AssistantState;
  readonly installed: InstalledState;
  readonly monitor: MonitorState;
}

export function createAppState(): AppState {
  return {
    chat: { selectedId: null, threads: {} },
    mail: { selectedId: null, read: [] },
    hubbub: { selectedChannel: null, read: [], charged: [] },
    kb: { selectedId: null },
    day: { briefShownFor: null, scorecardShownFor: null },
    browser: { siteId: null },
    caught: { appId: null, at: null, evidence: null, software: null },
    windows: { open: [], focusedId: null },
    assistant: { dismissals: 0, closedOnDay: null },
    installed: { apps: [] },
    monitor: { acknowledged: [] },
  };
}

/* -- reading a snapshot back --------------------------------------------- */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalId(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === 'string' ? value : undefined;
}

function optionalDay(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? value
    : undefined;
}

function optionalTick(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function stringList(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? Object.freeze([...value] as string[])
    : undefined;
}

function readWindows(value: unknown): WindowsState | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const { open, focusedId } = value;
  const focused = optionalId(focusedId);

  if (!Array.isArray(open) || focused === undefined) {
    return undefined;
  }

  const parsed: OpenWindowState[] = [];

  for (const entry of open) {
    if (
      !isObject(entry)
      || typeof entry.appId !== 'string'
      || entry.appId.length === 0
      || typeof entry.minimized !== 'boolean'
    ) {
      return undefined;
    }

    parsed.push({ appId: entry.appId, minimized: entry.minimized });
  }

  return Object.freeze({ open: Object.freeze(parsed), focusedId: focused });
}

/**
 * The character's count, read out of a file that may predate it.
 *
 * An absent slice reads as "nobody has closed it yet" rather than as a
 * refusal, exactly as the caught scene's evidence does: a save written before
 * there was anything on the desk to close is a save about a screen that had no
 * assistant on it, and a session is not worth throwing away over a joke's
 * counter. Anything PRESENT is still read strictly - a count that is not a
 * whole number is a file somebody has edited, and this shell refuses those.
 */
function readAssistant(value: unknown): AssistantState | undefined {
  if (value === undefined) {
    return { dismissals: 0, closedOnDay: null };
  }

  if (!isObject(value)) {
    return undefined;
  }

  const { dismissals, closedOnDay } = value;

  const count = typeof dismissals === 'number'
    && Number.isSafeInteger(dismissals)
    && dismissals >= 0
    // A whole number is accepted and CLAMPED rather than refused above the cap:
    // a huge count is not corruption, it is a joke somebody edited, and the
    // game is worth keeping.
    ? Math.min(dismissals, ASSISTANT_DISMISSAL_CAP)
    : undefined;

  // Absent reads as open, the way it reads on a save written before the field
  // existed; a null is open too; a day number is a whole day of this week.
  const closed = closedOnDay === undefined
    ? null
    : optionalDay(closedOnDay);

  // Not-a-number, negative, or a broken closed-day is a shape this shell never
  // writes, so it is refused like every other edited field.
  return count === undefined || closed === undefined
    ? undefined
    : { dismissals: count, closedOnDay: closed };
}

/**
 * The install set, read out of a file that may predate it.
 *
 * An absent slice reads as "nothing installed" rather than a refusal, exactly
 * as the dismissal count and the caught evidence do: a save written before the
 * web store existed is a save about a machine nobody had installed anything on,
 * and a session is not worth throwing away over that. Anything PRESENT is read
 * strictly - an entry that is not a string, an id the catalogue does not hold,
 * or the same id twice is a file somebody has edited, and this shell refuses
 * those the way it refuses a non-integer dismissal count. Refusing an unknown id
 * is the load-bearing half: an installed id with no definition behind it is a
 * manifest that would mount a window with nothing in it.
 */
function readInstalled(value: unknown): InstalledState | undefined {
  if (value === undefined) {
    return { apps: [] };
  }

  if (!isObject(value)) {
    return undefined;
  }

  const { apps } = value;

  if (!Array.isArray(apps)) {
    return undefined;
  }

  const parsed: string[] = [];

  for (const entry of apps) {
    if (!isInstallableId(entry) || parsed.includes(entry)) {
      return undefined;
    }

    parsed.push(entry);
  }

  return Object.freeze({ apps: Object.freeze(parsed) });
}

/**
 * The rooms' screen state, read out of a file that may predate the rollout.
 *
 * An absent slice reads as "nothing read, nothing picked" rather than as a
 * refusal, exactly as the dismissal count and the install set do: a save
 * written before the company rolled the client out is a save about a desktop
 * that had no rooms on it, and a session is not worth throwing away over a
 * badge ledger. Anything PRESENT is read strictly - a read list that is not a
 * list of strings is a file somebody has edited, and this shell refuses those.
 */
function readHubbub(value: unknown): HubbubState | undefined {
  if (value === undefined) {
    return { selectedChannel: null, read: [], charged: [] };
  }

  if (!isObject(value)) {
    return undefined;
  }

  const selected = optionalId(value.selectedChannel);
  const read = stringList(value.read);
  // Absent is empty rather than a refusal, the same courtesy `read` gets: a
  // save written before the drip existed knew nothing about being charged for
  // its rooms, so it starts owing nothing. Present but not a list of strings is
  // a hand-edited file, and that this shell refuses.
  const charged = value.charged === undefined ? [] : stringList(value.charged);

  return selected === undefined || read === undefined || charged === undefined
    ? undefined
    : { selectedChannel: selected, read, charged };
}

/**
 * The board's acknowledged set, read out of a file that may predate it.
 *
 * An absent slice reads as "nothing acknowledged" rather than a refusal, the
 * same courtesy the room ledger and the install set get: a save written before
 * the board existed knew nothing about acknowledging an alert, so it starts
 * owing nothing. Anything PRESENT is read strictly - a list that is not a list
 * of strings is a hand-edited file, and this shell refuses those.
 */
function readMonitor(value: unknown): MonitorState | undefined {
  if (value === undefined) {
    return { acknowledged: [] };
  }

  if (!isObject(value)) {
    return undefined;
  }

  const acknowledged = stringList(value.acknowledged);

  return acknowledged === undefined ? undefined : { acknowledged };
}

function isSpeaker(value: unknown): value is ChatSpeaker {
  return value === 'them' || value === 'you' || value === 'system';
}

function readThread(value: unknown): ChatThread | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const { nodeId, rootUsed, lines, ended } = value;

  if (
    typeof nodeId !== 'string'
    || typeof rootUsed !== 'string'
    || typeof ended !== 'boolean'
    || !Array.isArray(lines)
  ) {
    return undefined;
  }

  const parsed: ChatLine[] = [];

  for (const line of lines) {
    if (!isObject(line) || !isSpeaker(line.who) || typeof line.text !== 'string') {
      return undefined;
    }

    parsed.push({ who: line.who, text: line.text });
  }

  return Object.freeze({
    nodeId,
    rootUsed,
    ended,
    lines: Object.freeze(parsed),
  });
}

function readThreads(
  value: unknown,
): Readonly<Record<string, ChatThread>> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const threads: Record<string, ChatThread> = {};

  for (const [id, raw] of Object.entries(value)) {
    const thread = readThread(raw);

    if (thread === undefined) {
      return undefined;
    }

    threads[id] = thread;
  }

  return Object.freeze(threads);
}

/**
 * A snapshot from storage, read strictly.
 *
 * Anything that is not exactly the shape this shell writes comes back as
 * `null` and the caller refuses the load. Filling in the parts that parsed
 * would put half a session on screen and leave the player to notice which
 * half - and this arrives from `localStorage`, which anything on the machine
 * can have edited.
 */
export function parseAppState(value: unknown): AppState | null {
  if (!isObject(value)) {
    return null;
  }

  const {
    chat, mail, hubbub, kb, day, browser, caught, windows, assistant, installed,
    monitor,
  } = value;

  if (
    !isObject(chat)
    || !isObject(mail)
    || !isObject(kb)
    || !isObject(day)
    || !isObject(browser)
    || !isObject(caught)
    || !isObject(windows)
  ) {
    return null;
  }

  const chatSelected = optionalId(chat.selectedId);
  const threads = readThreads(chat.threads);
  const mailSelected = optionalId(mail.selectedId);
  const read = stringList(mail.read);
  const kbSelected = optionalId(kb.selectedId);
  const briefShownFor = optionalDay(day.briefShownFor);
  const scorecardShownFor = optionalDay(day.scorecardShownFor);
  const siteId = optionalId(browser.siteId);
  const caughtAppId = optionalId(caught.appId);
  const caughtAt = optionalTick(caught.at);
  // Absent reads as null rather than as a refusal: a save written before the
  // status beat existed is a save about a screen, and a screen has no minutes.
  const caughtEvidence = caught.evidence === undefined
    ? null
    : optionalTick(caught.evidence);
  // Absent reads as null, the way a save written before the software beat existed
  // reads: a screen has nothing to name. A present value has to be a list of
  // strings, or the whole load is refused like every other edited field.
  const caughtSoftware = caught.software === undefined || caught.software === null
    ? null
    : stringList(caught.software);
  const screen = readWindows(windows);
  const helper = readAssistant(assistant);
  const installedApps = readInstalled(installed);
  const rooms = readHubbub(hubbub);
  const board = readMonitor(monitor);

  if (
    board === undefined
    || installedApps === undefined
    || helper === undefined
    || rooms === undefined
    || chatSelected === undefined
    || threads === undefined
    || mailSelected === undefined
    || read === undefined
    || kbSelected === undefined
    || briefShownFor === undefined
    || scorecardShownFor === undefined
    || siteId === undefined
    || caughtAppId === undefined
    || caughtAt === undefined
    || caughtEvidence === undefined
    || caughtSoftware === undefined
    || screen === undefined
  ) {
    return null;
  }

  return {
    chat: { selectedId: chatSelected, threads },
    mail: { selectedId: mailSelected, read },
    hubbub: rooms,
    kb: { selectedId: kbSelected },
    day: { briefShownFor, scorecardShownFor },
    browser: { siteId },
    caught: {
      appId: caughtAppId,
      at: caughtAt,
      evidence: caughtEvidence,
      software: caughtSoftware,
    },
    windows: screen,
    assistant: helper,
    installed: installedApps,
    monitor: board,
  };
}

/* -- the store ------------------------------------------------------------ */

/**
 * The shell's memory of what the apps were showing.
 *
 * Writes do not notify: an app that just changed its own state repaints
 * itself, and a listener firing back into that paint is a repaint loop
 * waiting for its first re-entrant caller. A wholesale REPLACEMENT is the one
 * change nobody can see coming, so that is what is announced.
 */
export class AppStateStore {
  private state: AppState = createAppState();
  /**
   * Which CUSTOMER the player is working in right now (0.8.0), loaded from the
   * ticket they last opened, or null before any is open.
   *
   * It is screen state - "which customer's context is on screen" - so it lives
   * here with the rest of it rather than in the world graph. But UNLIKE the
   * serialised slices above it is deliberately NOT carried by a save: it is
   * re-derivable from the open ticket, no ticket is "open" in the terminal
   * sense on a fresh load, and keeping it out of the snapshot is what leaves
   * every existing save golden byte-identical - the customer dimension adds
   * nothing to the file. The terminal reads it for the wrong-customer guard;
   * the tickets app writes it when a ticket is opened.
   */
  private customerContext: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly reloadListeners = new Set<() => void>();

  public get(): Readonly<AppState> {
    return this.state;
  }

  /** The customer whose context is loaded, or null before a ticket is opened. */
  public getCustomerContext(): string | null {
    return this.customerContext;
  }

  /**
   * Loads a customer's context - what opening a ticket does. Null clears it,
   * which is what leaving the queue or opening an in-house ticket means.
   */
  public setCustomerContext(customerId: string | null): void {
    this.customerContext = customerId;
  }

  /** Replaces part of one slice, leaving the rest of it alone. */
  public patch<Key extends keyof AppState>(
    key: Key,
    change: Partial<AppState[Key]>,
  ): void {
    this.state = {
      ...this.state,
      [key]: { ...this.state[key], ...change },
    };
  }

  /**
   * The same patch, made by something that is NOT the app that owns the slice
   * - the day driver writing the lead's message into his chat thread, the
   * boss system naming the scene that has just happened.
   *
   * It announces, and it has to: the app whose state just changed is not the
   * one that changed it, so nothing else is going to repaint it. An app
   * patching its OWN slice still uses `patch`, because it repaints itself and
   * a listener firing back into that paint is a loop looking for its first
   * re-entrant caller.
   */
  public patchExternal<Key extends keyof AppState>(
    key: Key,
    change: Partial<AppState[Key]>,
  ): void {
    this.patch(key, change);
    this.announce();
  }

  /** The JSON-safe form a save carries. */
  public snapshot(): AppState {
    return this.state;
  }

  /**
   * Puts a loaded session's screen state back, or refuses the whole thing.
   * Answers whether it took, so the caller can say so rather than leave the
   * player looking at a mix of two sessions.
   */
  public hydrate(snapshot: unknown): boolean {
    const parsed = parseAppState(snapshot);

    if (parsed === null) {
      return false;
    }

    this.state = parsed;
    // A loaded session has no ticket open in the terminal sense, so it works in
    // no customer until one is opened - the same fresh-start the context has on
    // a new game.
    this.customerContext = null;
    this.announce();
    this.announceReload();
    return true;
  }

  /** Resets to a fresh session - what a restart means for the apps. */
  public reset(): void {
    this.state = createAppState();
    this.customerContext = null;
    this.announce();
    this.announceReload();
  }

  /** Fires when the whole state was replaced under the apps' feet. */
  public onReplaced(listener: () => void): () => void {
    this.listeners.add(listener);
    let subscribed = true;

    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  /**
   * Fires ONLY when the whole file was replaced - a load or a restart - and
   * never on an external patch.
   *
   * `onReplaced` fires on `patchExternal` too, because the boss writing a chat
   * line is a change the chat window has to hear. That makes it the wrong hook
   * for anything that must tell a LOAD apart from an ordinary write - a
   * subscriber wired to it would be told a dozen times a day that the session
   * had been replaced when it had not. The Assistant learned this the hard way:
   * its note-owed memory was reset on `onReplaced`, so every boss beat between
   * closing it and its return wiped the note. This is the hook that means what
   * that one was being asked to mean.
   */
  public onReloaded(listener: () => void): () => void {
    this.reloadListeners.add(listener);
    let subscribed = true;

    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      this.reloadListeners.delete(listener);
    };
  }

  private announce(): void {
    // Copied before delivery: an app that unsubscribes while being told must
    // not make its neighbour miss the news.
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  private announceReload(): void {
    for (const listener of [...this.reloadListeners]) {
      listener();
    }
  }
}
