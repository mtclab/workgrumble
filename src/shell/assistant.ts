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
 * All of its memory is about the SCREEN - which line is up, when it went up,
 * which situation it belongs to, whether somebody has just closed it - and
 * none of it is about the world, so a session that reloads gets a character
 * that starts talking again rather than one that has to be restored. The one
 * thing that survives a save is the dismissal count, and that is handed in
 * from the store on every call rather than kept here.
 */
export class AssistantVoice {
  private current: AssistantLine | null = null;
  private situation: AssistantSituation | null = null;
  private saidAt = 0;
  private readonly rotation = new Map<AssistantSituation, number>();
  /** The minute a takeover last handed the desk back, for the "after" beat. */
  private handedBackAt: number | null = null;
  private held = false;
  /** The day it was closed on, or null while nobody has closed it. */
  private closedOn: number | null = null;
  private owedGag = false;
  /**
   * Whether a phone was ringing / a reboot was coming on the LAST paint.
   *
   * The gag comes back on the next big event, and "next" means the next fresh
   * ARRIVAL - a new call is a new event even if it is the same kind as the one
   * the player closed it during. So the arrival is an edge, false-to-true, and
   * these are the previous side of it.
   */
  private wasRinging = false;
  private wasReboot = false;
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
    dismissals: number,
  ): AssistantView | null {
    this.followTakeovers(world, tick);

    // The big-event arrival edges, computed before any early return so the
    // previous-state flags never go stale: a call that arrives during a
    // takeover is still a fresh call the minute the desk comes back.
    const bigEventArrived = (world.ringing && !this.wasRinging)
      || (world.rebootComing && !this.wasReboot)
      // The desk being handed back this very tick is the third arrival.
      || this.handedBackAt === tick;
    this.wasRinging = world.ringing;
    this.wasReboot = world.rebootComing;

    const freshlyBack = this.handedBackAt !== null
      && tick >= this.handedBackAt
      && tick - this.handedBackAt < ASSISTANT_HANDBACK;
    const situation = situationOf(world, freshlyBack);

    if (situation === null) {
      return null;
    }

    if (!this.readmitted(world, bigEventArrived)) {
      return null;
    }

    if (this.owedGag) {
      // The note about having been closed, before anything about the desk:
      // it is the reason it is standing here again. It is held from here (see
      // `holdingGag`) so the same minute's later paints cannot replace it.
      this.owedGag = false;
      this.holdingGag = true;
      this.current = returningLine(dismissals);
      this.situation = situation;
      this.saidAt = tick;
      return { situation, line: this.current };
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
      return { situation, line: standing };
    }

    this.holdingGag = false;
    const line = this.nextLine(situation);
    this.current = line;
    this.situation = situation;
    this.saidAt = tick;

    return { situation, line };
  }

  /**
   * Somebody closed it.
   *
   * The COUNT is the caller's - it belongs in the screen store, because it
   * survives a save - and what is remembered here is only the fact that it is
   * currently shut and what it was shut during.
   */
  public dismiss(day: number): void {
    this.closedOn = day;
    this.current = null;
    this.situation = null;
    this.holdingGag = false;
  }

  /**
   * A load, a restart, a week that started again: everything on the screen has
   * been replaced, so the character starts from scratch and the count it
   * escalates by comes back with the file.
   */
  public forget(): void {
    this.current = null;
    this.situation = null;
    this.saidAt = 0;
    this.rotation.clear();
    this.handedBackAt = null;
    this.held = false;
    this.closedOn = null;
    this.owedGag = false;
    this.holdingGag = false;
    this.wasRinging = false;
    this.wasReboot = false;
  }

  /** Whether it is currently closed, which the desktop paints. */
  public closed(): boolean {
    return this.closedOn !== null;
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

  /**
   * Whether a dismissed character has earned its way back - and letting it in
   * when it has, which is why this is not spelled as a predicate.
   *
   * Two doors, and both of them are the gag: a new day, or the next big event
   * to ARRIVE. It is the arrival that counts, not the kind: a player who closed
   * it during one call has not closed it against every call, so the next phone
   * to ring brings it back with its note. Anything else - a ticket arriving,
   * the meters moving, an hour of quiet - leaves it shut, because those are the
   * minutes the player bought by closing it.
   */
  private readmitted(
    world: Readonly<AssistantWorld>,
    bigEventArrived: boolean,
  ): boolean {
    if (this.closedOn === null) {
      return true;
    }

    if (world.day === this.closedOn && !bigEventArrived) {
      return false;
    }

    this.closedOn = null;
    this.owedGag = true;
    return true;
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

  /** Draws a line, or takes the whole thing off the screen. */
  public render(view: Readonly<AssistantView> | null): void {
    this.element.hidden = view === null;

    if (view === null) {
      return;
    }

    this.element.dataset.situation = view.situation;
    this.element.dataset.line = view.line.id;
    this.text.textContent = view.line.text;
  }
}
