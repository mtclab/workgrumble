/**
 * "Hi." - and then the three dots, for a while.
 *
 * The whole of this beat is a GAP, and the gap is the only thing in it that
 * costs anything. Somebody opens a chat with a greeting and no question in it;
 * the question exists, they are typing it, and until they have finished typing
 * it nobody at this desk can do anything about it. Asking what they want gets
 * it immediately. Waiting gets it several minutes later, and those minutes are
 * minutes of a shift that does not stop for chat windows.
 *
 * Everything here is arithmetic on two numbers the week already wrote down -
 * the minute they said hello and how long they take to type - so there is no
 * state to save, nothing to get out of step across a load, and a save taken
 * mid-typing comes back mid-typing because "mid-typing" is a function of the
 * clock.
 *
 * Nothing here touches the DOM, dispatches, or reads the time of day.
 */

/**
 * What the indicator says, in order, one minute per entry, cycling.
 *
 * Data rather than an animation, and cycling rather than running once, because
 * the thing being modelled is not a progress bar: it is a person who starts
 * typing, stops, starts again, and at no point tells you what they want. The
 * blank entry is the important one - a dot that never goes out is a dot
 * nobody reads twice, and the pause is what makes somebody sit and watch it.
 */
export const TYPING_CADENCE: readonly string[] = Object.freeze([
  'is typing...',
  'is typing...',
  '',
  'is typing...',
]);

/** Where the greeting itself sits, before a single dot has appeared. */
export const TYPING_OPENED = 'said hello';

/**
 * What the chat window shows after this many minutes of waiting.
 *
 * Minute nought is the greeting landing, which is not typing and must not
 * claim to be: the indicator starts on the minute AFTER, which is the minute a
 * person would actually start. Past the end of the wait there is nothing to
 * show, because the question has arrived and a question with a typing
 * indicator over it is a window arguing with itself.
 */
export function typingLine(minutesWaited: number, typingMinutes: number): string {
  if (!Number.isSafeInteger(minutesWaited) || minutesWaited < 0) {
    throw new TypeError('Minutes waited is a whole number of minutes.');
  }

  if (minutesWaited === 0) {
    return TYPING_OPENED;
  }

  if (minutesWaited >= typingMinutes) {
    return '';
  }

  return TYPING_CADENCE[(minutesWaited - 1) % TYPING_CADENCE.length] ?? '';
}

/** Whether they are still getting round to it. */
export function stillTyping(
  minutesWaited: number,
  typingMinutes: number,
): boolean {
  return minutesWaited >= 0 && minutesWaited < typingMinutes;
}

/**
 * How many minutes of the shift waiting it out still costs from here.
 *
 * It is the number the window puts on the screen, because the honest version
 * of this mechanic tells the player what it is charging BEFORE they decide to
 * pay it - the same legibility rule the presence tray keeps. Nought once the
 * question has arrived.
 */
export function typingMinutesLeft(
  minutesWaited: number,
  typingMinutes: number,
): number {
  return Math.max(0, typingMinutes - Math.max(0, minutesWaited));
}
