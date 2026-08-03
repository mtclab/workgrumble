/**
 * The Assistant: the thing on the desk with a face on it.
 *
 * The office gave you a helper and it was the cheapest one. It watches what is
 * happening, says something about it, and is never once right about what to
 * do - `assistant-lines.ts` holds the lines and the gate that keeps them
 * useless, and this file is only the part that decides WHICH one and draws it.
 *
 * Three rules it keeps, all of them because it is furniture rather than a
 * mechanic:
 *
 * - It owns no world state. Everything it reads is already on the desk - a
 *   takeover, a phone, the dot, the meters, the queue - and the one thing it
 *   remembers, how many times it has been closed, lives in the shell's screen
 *   store beside the open windows. Nothing in any journey reads it back.
 * - It never takes the pointer or the keyboard. The overlay is transparent to
 *   the mouse except for the one button on it, so a line arriving over the
 *   corner of a window cannot cost anybody a click.
 * - A takeover hides it outright rather than dimming it like the rest of the
 *   desk. It does not talk over a meeting; even it is not that useless.
 */

import {
  type AssistantLine,
  type AssistantSituation,
  linesFor,
  returningLine,
} from './assistant-lines';
import { createIcon } from './icons';
import { element } from './apps/ui';

/**
 * What the desk looks like this minute, in the six facts the character reacts
 * to. Read off the same seams the taskbar chips are painted from.
 */
export interface AssistantWorld {
  readonly onShift: boolean;
  /** A meeting or a workstation has the desk. */
  readonly heldByTakeover: boolean;
  /** A phone is ringing, or somebody is standing at the desk. */
  readonly ringing: boolean;
  /** A workstation that was pushed back is on its way. */
  readonly rebootComing: boolean;
  readonly dnd: boolean;
  /** Stress past the point where the hands go. */
  readonly fumbling: boolean;
  readonly openTickets: number;
  readonly day: number;
}

export interface AssistantView {
  readonly situation: AssistantSituation;
  readonly line: AssistantLine;
  /**
   * True on the ONE paint that pays the note about having been closed.
   *
   * The durable "owes a note" flag lives in the screen store, so the desktop
   * clears it when it sees this - and then every later paint that minute reads
   * the flag as gone and the note is held only by the dwell, not re-paid.
   */
  readonly readmitted: boolean;
}

/**
 * The two durable facts the character reads each paint, both from the screen
 * store the save carries: how many times it has been closed, and the day it
 * was last closed on (null while it is open). Everything else it needs is on
 * the desk (`AssistantWorld`); everything it remembers between paints is
 * transient and may be dropped by a re-mount without losing the gag.
 */
export interface AssistantMemory {
  readonly dismissals: number;
  readonly closedOnDay: number | null;
}

/**
 * How long one line stays up before the next one, in simulated minutes.
 *
 * Long enough to read at x4, where a minute is a quarter of a second, and long
 * enough that the character reads as an object with opinions rather than a
 * ticker. A situation CHANGE speaks immediately whatever this says: the whole
 * point of it is to comment on what just happened.
 */
export const ASSISTANT_DWELL = 15;

/** And how long the desk counts as freshly handed back after a takeover. */
export const ASSISTANT_HANDBACK = 10;

/**
 * What it is standing over, in precedence order.
 *
 * Null means say nothing at all: off shift there is nobody at the desk, and
 * during a takeover the desk is not the player's to be talked at across.
 */
export function situationOf(
  world: Readonly<AssistantWorld>,
  freshlyBack: boolean,
): AssistantSituation | null {
  if (world.heldByTakeover || !world.onShift) {
    return null;
  }

  if (world.ringing) {
    return 'call';
  }

  if (world.rebootComing) {
    return 'reboot';
  }

  if (freshlyBack) {
    return 'after';
  }

  if (world.dnd) {
    return 'dnd';
  }

  if (world.fumbling) {
    return 'stress';
  }

  return world.openTickets > 0 ? 'ticket' : 'idle';
}

/**
 * The part that decides what it says, with no DOM in it.
 *
 * Its durable memory - the count it escalates by, and whether it is currently
 * closed - is NOT here: it lives in the screen store the save carries, and is
 * handed in as `AssistantMemory` on every call. That is the lesson the box
 * taught. Everything THIS object holds is transient display state - which line
 * is up, when it went up, where the rotation is - and a re-mount that drops all
 * of it loses nothing but the current sentence, because the gag is read from
 * the store rather than remembered here.
 */
export class AssistantVoice {
  private current: AssistantLine | null = null;
  private situation: AssistantSituation | null = null;
  private saidAt = 0;
  private readonly rotation = new Map<AssistantSituation, number>();
  /** The minute a takeover last handed the desk back, for the "after" beat. */
  private handedBackAt: number | null = null;
  private held = false;
  /**
   * Whether the line currently up is the note about having been closed.
   *
   * The note is the whole point of the dismissal-memory gag, so it must not be
   * stepped on the instant something else becomes true on the desk. The desk
   * repaints on the tick AND on every world change, so one minute is several
   * paints - and the minute it comes back on is exactly the minute a new day's
   * stress or queue is also becoming true. Without this, the second paint of
   * that minute saw the situation change and replaced the note with a line
   * about the stress. So the note is held, ignoring situation changes, until
   * its dwell is up - and then the desk's own lines resume.
   */
  private holdingGag = false;

  /**
   * What to draw this minute, or nothing at all.
   *
   * Called on every tick, every world change and every day change, which is
   * why it is cheap and why it is idempotent: the same minute asked twice
   * gives the same answer.
   */
  public speak(
    world: Readonly<AssistantWorld>,
    tick: number,
    memory: Readonly<AssistantMemory>,
  ): AssistantView | null {
    this.followTakeovers(world, tick);

    const freshlyBack = this.handedBackAt !== null
      && tick >= this.handedBackAt
      && tick - this.handedBackAt < ASSISTANT_HANDBACK;
    const situation = situationOf(world, freshlyBack);

    if (situation === null) {
      return null;
    }

    if (memory.closedOnDay !== null) {
      // Closing it now means something for the whole DAY (slice 0.3.6, F7), and
      // that is keyed off the DURABLE closed-day the save carries rather than any
      // transient of this instance. Once it is shut it stays shut until the day
      // turns - however many calls, reboots and hand-backs land after, AND
      // across a reload: a session restored on the same day it was closed comes
      // back with `closedOnDay` still equal to today, so it stays closed. Keying
      // this off a fresh-mount flag was the 0.3.5 bug class again - a reload set
      // mounted=false and the character re-arrived within the quiet the player
      // had bought. It still returns tomorrow, when `world.day` has moved on,
      // with the escalated note.
      const returned = world.day !== memory.closedOnDay;

      if (!returned) {
        // The quiet the player bought by closing it.
        return null;
      }

      // The note, held from here so the same minute's later paints - by which
      // point the desktop has cleared the durable flag - cannot replace it.
      this.holdingGag = true;
      this.current = returningLine(memory.dismissals);
      this.situation = situation;
      this.saidAt = tick;
      return { situation, line: this.current, readmitted: true };
    }

    const standing = this.current;
    // A clock that went backwards is a load or a new week, and the line it was
    // holding belongs to a session that is over - which also ends a held note.
    const reset = standing === null || tick < this.saidAt;
    const dwelled = tick - this.saidAt >= ASSISTANT_DWELL;
    // The note ignores a situation change for as long as its dwell runs; every
    // other line moves the moment the desk does.
    const moved = reset
      || dwelled
      || (situation !== this.situation && !this.holdingGag);

    // The same minute asked twice keeps the same line, and a held note keeps
    // its place through a situation change until the dwell is up.
    if (!moved && standing !== null) {
      // The desk may have moved under a held note; the view follows it while
      // the line does not, so the bubble is about the right thing when the
      // note's dwell ends.
      return { situation, line: standing, readmitted: false };
    }

    this.holdingGag = false;
    const line = this.nextLine(situation);
    this.current = line;
    this.situation = situation;
    this.saidAt = tick;

    return { situation, line, readmitted: false };
  }

  /**
   * A load, a restart, a week that started again.
   *
   * Only the transient display is thrown away - the durable count and
   * closed-day come back in the file, and the whole-day dismissal keys off the
   * closed-day rather than anything reset here, so a reload on the day it was
   * closed comes back closed. Wired to the store's reload hook, NOT to
   * `onReplaced`, so an ordinary external patch (a boss beat) never triggers
   * it: that wiring was the box bug.
   */
  public remount(): void {
    this.current = null;
    this.situation = null;
    this.saidAt = 0;
    this.rotation.clear();
    this.handedBackAt = null;
    this.held = false;
    this.holdingGag = false;
  }

  private followTakeovers(
    world: Readonly<AssistantWorld>,
    tick: number,
  ): void {
    if (world.heldByTakeover) {
      this.held = true;
      return;
    }

    if (this.held) {
      this.held = false;
      this.handedBackAt = tick;
    }
  }

  /** The next line for this situation, in authored order, round and round. */
  private nextLine(situation: AssistantSituation): AssistantLine {
    const lines = linesFor(situation);
    const at = this.rotation.get(situation) ?? 0;
    const line = lines[at % lines.length];

    this.rotation.set(situation, at + 1);

    if (line === undefined) {
      throw new Error(
        `The Assistant has nothing to say about "${situation}", which the `
        + 'line gate is supposed to make impossible.',
      );
    }

    return line;
  }
}

export interface AssistantHandlers {
  dismiss(): void;
}

/**
 * The character itself, mounted once by the desktop and repainted when the
 * world moves - the same shape as the desk overlay, and for the same reason:
 * it is a thing ON the desk rather than a program, so it has no titlebar, no
 * taskbar button and nothing the window manager knows about.
 *
 * THE ART IS A PLACEHOLDER. It is a beige workstation monitor with eyebrows,
 * drawn out of the same 24-unit line shapes every other icon in this shell is
 * drawn from; the art pass may swap it for one of the other candidates (a
 * stapler, a desk fan with eyes) without touching anything in this file except
 * the icon id.
 */
export class Assistant {
  public readonly element: HTMLElement;

  private readonly bubble: HTMLElement;
  private readonly text: HTMLElement;
  /** What is on screen right now, so an unchanged paint touches no DOM. */
  private shownLine: string | null = null;
  private shownHidden = true;

  public constructor(handlers: Readonly<AssistantHandlers>) {
    this.element = element('div', 'assistant-overlay', 'assistant');
    this.element.hidden = true;

    this.bubble = element('div', 'assistant-bubble', 'assistant-bubble');
    // Polite rather than assertive, and it matters: a screen reader that
    // interrupted somebody mid-ticket to read out a joke about beige would be
    // the one way this character could genuinely cost a player something.
    this.bubble.setAttribute('role', 'status');
    this.bubble.setAttribute('aria-live', 'polite');
    this.text = element('p', 'assistant-line', 'assistant-line');
    this.bubble.append(this.text);

    const body = element('div', 'assistant-body');
    const character = element('div', 'assistant-character', 'assistant-character');
    character.append(createIcon('icon-assistant'));
    character.setAttribute('aria-hidden', 'true');

    const dismiss = element('button', 'assistant-dismiss', 'assistant-dismiss');
    dismiss.type = 'button';
    dismiss.title = 'Close the assistant. It will be fine about it.';
    dismiss.setAttribute('aria-label', 'Close the assistant');
    dismiss.append(createIcon('icon-close'));
    dismiss.addEventListener('click', () => {
      handlers.dismiss();
    });

    body.append(character, dismiss);
    this.element.append(this.bubble, body);
  }

  /**
   * Draws a line, or takes the whole thing off the screen - and does NOTHING
   * when what it would draw is what is already drawn.
   *
   * The desk repaints every simulated minute, and for most of them the line is
   * the same line: the character dwells on one thought for a quarter of an
   * hour. So the DOM is touched only when the line or the visibility actually
   * changes, which is what keeps a per-minute subscriber from being a
   * per-minute write - and takes the overlay off the suspect list for the
   * clock the fake-timer tests watch.
   */
  public render(view: Readonly<AssistantView> | null): void {
    const hidden = view === null;
    const lineId = view?.line.id ?? null;

    if (hidden === this.shownHidden && lineId === this.shownLine) {
      return;
    }

    this.shownHidden = hidden;
    this.shownLine = lineId;
    this.element.hidden = hidden;

    if (view === null) {
      return;
    }

    this.element.dataset.situation = view.situation;
    this.element.dataset.line = view.line.id;
    this.text.textContent = view.line.text;
  }
}
