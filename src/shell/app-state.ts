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
}

export interface AppState {
  readonly chat: ChatState;
  readonly mail: MailState;
  readonly kb: KbState;
  readonly day: DayScreensState;
  readonly browser: BrowserAppState;
  readonly caught: CaughtState;
}

export function createAppState(): AppState {
  return {
    chat: { selectedId: null, threads: {} },
    mail: { selectedId: null, read: [] },
    kb: { selectedId: null },
    day: { briefShownFor: null, scorecardShownFor: null },
    browser: { siteId: null },
    caught: { appId: null, at: null },
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

  const { chat, mail, kb, day, browser, caught } = value;

  if (
    !isObject(chat)
    || !isObject(mail)
    || !isObject(kb)
    || !isObject(day)
    || !isObject(browser)
    || !isObject(caught)
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

  if (
    chatSelected === undefined
    || threads === undefined
    || mailSelected === undefined
    || read === undefined
    || kbSelected === undefined
    || briefShownFor === undefined
    || scorecardShownFor === undefined
    || siteId === undefined
    || caughtAppId === undefined
    || caughtAt === undefined
  ) {
    return null;
  }

  return {
    chat: { selectedId: chatSelected, threads },
    mail: { selectedId: mailSelected, read },
    kb: { selectedId: kbSelected },
    day: { briefShownFor, scorecardShownFor },
    browser: { siteId },
    caught: { appId: caughtAppId, at: caughtAt },
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
  private readonly listeners = new Set<() => void>();

  public get(): Readonly<AppState> {
    return this.state;
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
    this.announce();
    return true;
  }

  /** Resets to a fresh session - what a restart means for the apps. */
  public reset(): void {
    this.state = createAppState();
    this.announce();
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

  private announce(): void {
    // Copied before delivery: an app that unsubscribes while being told must
    // not make its neighbour miss the news.
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
