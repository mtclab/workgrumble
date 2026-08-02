/**
 * The screen the workstation puts up while it is having its own morning.
 *
 * One piece of art, two masters, which is the whole of item 8 in the slice:
 * the fiction's updates arrive at ten past two on a Thursday and take twelve
 * simulated minutes, and OURS arrive when somebody deploys and take four
 * seconds of real time on the first boot of a new build. The mechanic behind
 * them is completely different - one is minutes off a shift with every SLA
 * clock running, the other is a page load - and the SCREEN is the same screen,
 * because that is the joke: the player cannot tell whose update it is either.
 *
 * The percentage is theatre and is documented as theatre. What is TRUE is the
 * duration: twelve minutes is twelve minutes, the clock runs, the deadlines
 * run, and the desk is not there for any of it. What is performed is the
 * number, and it is performed the way the real ones perform it - a confident
 * start, a long hang in the low thirties while nothing whatsoever appears to
 * happen, one jump that feels like somebody unplugged something, and then the
 * last stretch at a pace that suggests it was never going to take this long.
 *
 * Nothing here reads the world, the clock or the day. It is handed a
 * percentage and a line and paints them, so the same function serves a boot
 * with no world loaded yet and a Thursday afternoon with one.
 */

/**
 * The curve, as points on "how far through are we" against "what does it say".
 *
 * A table rather than a formula because it is COMEDY TIMING, and comedy timing
 * is tuned by moving numbers until it reads right rather than by picking a
 * better easing function. Both axes rise, which is what makes the answer
 * monotone: an update screen that went backwards would be a bug the player
 * reports, and it would be right to.
 */
const CURVE: readonly (readonly [number, number])[] = [
  // Off the mark like it means it. This bit is always fast, on every machine
  // anybody has ever owned, and it is the part that makes the rest a betrayal.
  [0, 0],
  [0.05, 14],
  [0.1, 29],
  // And then thirty. For a third of the whole thing, thirty. The real ones do
  // this and nobody has ever been able to say why.
  [0.45, 30],
  [0.58, 31],
  // The jump: forty points in one minute, arriving all at once and looking for
  // all the world like it skipped something important.
  [0.6, 71],
  [0.8, 83],
  [0.93, 88],
  // Ninety-nine is where it waits for you to look away.
  [1, 100],
];

/**
 * What the screen claims, given the minutes that have actually gone.
 *
 * `minutesIn` is minutes elapsed and `minutes` is the whole of it, so the last
 * minute of the block is `minutes - 1` - which is the minute this is allowed
 * to say a hundred, and the first one it is. Before then it is capped below a
 * hundred by the curve rather than by a clamp, because a hundred percent with
 * the desk still gone is the one number on this screen that would be a lie
 * about the mechanic rather than about the machine.
 */
export function updatePercent(minutesIn: number, minutes: number): number {
  if (!Number.isFinite(minutesIn) || minutesIn < 0) {
    return 0;
  }

  // A one-minute update is one minute of "100%", which is the honest reading:
  // its only minute IS its last minute. Nothing in the shipped week is this
  // short - the loader will not take an interruption below a minute at all -
  // and the branch exists so the division below cannot be by nought.
  if (!Number.isFinite(minutes) || minutes <= 1) {
    return 100;
  }

  const through = Math.min(1, minutesIn / (minutes - 1));

  for (let index = 1; index < CURVE.length; index += 1) {
    const [fromX, fromY] = CURVE[index - 1] as [number, number];
    const [toX, toY] = CURVE[index] as [number, number];

    if (through > toX) {
      continue;
    }

    const span = toX - fromX;
    const along = span === 0 ? 1 : (through - fromX) / span;

    return Math.floor(fromY + (toY - fromY) * along);
  }

  return 100;
}

/** The three things this screen is ever doing, in the order it does them. */
export type UpdatePhase = 'restarting' | 'installing' | 'restoring';

export interface UpdateState {
  readonly phase: UpdatePhase;
  /** Nought to a hundred. Ignored while restarting, which has no bar. */
  readonly percent: number;
  /** What the update is FOR, in the fiction's own words, or nothing. */
  readonly subject: string | null;
}

export interface UpdateScreen {
  readonly element: HTMLElement;
  render(state: Readonly<UpdateState>): void;
}

/** The line above the number, which is the whole of the machine's manners. */
const HEADLINE: Readonly<Record<UpdatePhase, string>> = {
  restarting: 'Restarting your workstation',
  installing: 'Working on updates',
  // The doubt is the joke and the restore is total: every window, every draft
  // and every line of terminal scrollback comes back exactly as it was,
  // because none of them were ever thrown away. See `onInterruptionEnded` in
  // `main.ts` - the parenthesis is a performance, and the world is not in on
  // it.
  restoring: 'Restoring your work',
};

const NOTE: Readonly<Record<UpdatePhase, string>> = {
  restarting: 'This will only take a moment, in the sense that a moment is a '
    + 'unit nobody has ever defined.',
  installing: 'Do not turn off your workstation.',
  restoring: '(most of it)',
};

/**
 * The screen itself: a ring of dots, a headline, a number, and the sentence
 * every one of these has ever ended on.
 *
 * The dots are six elements rather than a spinner glyph because the tremor,
 * the corridor and the boot cursor are all done with keyframes on real
 * elements in this shell, and because a machine that is doing nothing visible
 * still has to be doing something visible.
 */
export function createUpdateScreen(testId: string): UpdateScreen {
  const element = document.createElement('div');
  element.className = 'update-screen';
  element.dataset.testid = testId;

  const ring = document.createElement('div');
  ring.className = 'update-ring';
  ring.setAttribute('aria-hidden', 'true');

  for (let dot = 0; dot < 6; dot += 1) {
    const spot = document.createElement('span');
    spot.className = 'update-dot';
    spot.style.setProperty('--dot', String(dot));
    ring.append(spot);
  }

  const headline = document.createElement('p');
  headline.className = 'update-headline';
  headline.dataset.testid = `${testId}-headline`;

  const percent = document.createElement('p');
  percent.className = 'update-percent';
  percent.dataset.testid = `${testId}-percent`;

  const note = document.createElement('p');
  note.className = 'update-note';
  note.dataset.testid = `${testId}-note`;

  const subject = document.createElement('p');
  subject.className = 'update-subject';
  subject.dataset.testid = `${testId}-subject`;

  element.append(ring, headline, percent, note, subject);

  return {
    element,
    render: (state: Readonly<UpdateState>): void => {
      const whole = Math.max(0, Math.min(100, Math.floor(state.percent)));

      element.dataset.phase = state.phase;
      element.dataset.percent = String(whole);
      headline.textContent = HEADLINE[state.phase];
      // No bar while it is restarting: the real ones show nothing at all for
      // the first stretch, and a zero percent that sits there is a worse lie
      // than no number.
      percent.hidden = state.phase !== 'installing';
      percent.textContent = `${String(whole)}% complete`;
      note.textContent = NOTE[state.phase];
      subject.hidden = state.subject === null;
      subject.textContent = state.subject ?? '';
    },
  };
}
