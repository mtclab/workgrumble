import type { Settings } from './settings';

/**
 * Graphics quality, picked by the machine on its first launch
 * (docs/SPEC_FIRST_LAUNCH.md). The default is High, about twice Medium's GPU
 * cost: on a laptop's built-in graphics that is a 25-40 fps game nobody chose.
 * So on a first launch the title screen (which draws the real floor behind
 * the menu) is timed for a few seconds; too slow, one level down and timed
 * again, until it is fast enough or there is nothing lower.
 *
 * Everything that decides is here, with no DOM and no clock: the game feeds
 * frame times in (`QualityPicker.frame`) and does what the verdict says.
 */

export type Quality = Settings['quality'];

/** A frame slower than this (~50 fps) is too slow: the median over a window decides. */
export const TARGET_FRAME_MS = 20;
/**
 * The first half second after a start or a step is not timed: a quality
 * change recompiles every material, and those first frames measure the
 * compiler, not the machine.
 */
export const WARMUP_MS = 500;
/** How long each level is timed for, after the warm-up. */
export const WINDOW_MS = 3000;
/**
 * A frame counts as at most this long. Longer is a stall (a tab coming back
 * from hidden, a shader compile) or a machine far too slow: either way one
 * very slow frame, not seconds of the window gone in one sample. Not dropped:
 * a machine whose every frame is this slow is exactly the one that must step
 * down, and dropping its frames would leave it timing High for ever.
 */
export const MAX_FRAME_MS = 1000;
/** Frame times kept per window: room for three seconds at 300 fps; anything past it is not needed for a median. */
export const SAMPLE_CAPACITY = 1024;

/** What a finished window says: this level is fine, try one lower, or there is no lower. */
export type Verdict = 'keep' | 'down' | 'stop';

/** One level down; Low is the floor. */
export function lower(level: Quality): Quality {
  return level === 'high' ? 'medium' : 'low';
}

/** The decision for one window: its median frame time, at the level it was timed at. */
export function judge(medianMs: number, level: Quality): Verdict {
  if (medianMs <= TARGET_FRAME_MS) return 'keep';
  return level === 'low' ? 'stop' : 'down';
}

/**
 * The median of the first `n` values of `buf`. Sorts them in place (an
 * insertion sort: once per window, over a few hundred numbers, and it
 * allocates nothing).
 */
export function medianOf(buf: Float32Array, n: number): number {
  const len = Math.min(n, buf.length);
  if (len <= 0) return 0;
  for (let i = 1; i < len; i++) {
    const v = buf[i] ?? 0;
    let j = i - 1;
    while (j >= 0 && (buf[j] ?? 0) > v) {
      buf[j + 1] = buf[j] ?? 0;
      j--;
    }
    buf[j + 1] = v;
  }
  const mid = len >> 1;
  return len % 2 === 1 ? buf[mid] ?? 0 : ((buf[mid - 1] ?? 0) + (buf[mid] ?? 0)) / 2;
}

/**
 * Should this launch pick the quality? `stored` is the settings exactly as
 * this browser kept them (null: nothing kept). Only a first launch does, or
 * one whose pick was cut short (the tab closed mid-way: `qualitySource` still
 * says 'sampling'). Once settings exist with a decision in them, the player's
 * or the machine's, it never runs again. Settings that cannot be read are as
 * good as none: `loadSettings` starts over from the defaults for them too.
 */
export function autoPickDue(stored: string | null): boolean {
  if (stored === null) return true;
  try {
    const saved = JSON.parse(stored) as unknown;
    if (typeof saved !== 'object' || saved === null) return true;
    return (saved as { qualitySource?: unknown }).qualitySource === 'sampling';
  } catch {
    return true;
  }
}

/**
 * The picker itself: frame times in, a verdict out once per window. One
 * fixed buffer for the whole run; once it has decided it does nothing.
 */
export class QualityPicker {
  private readonly buf = new Float32Array(SAMPLE_CAPACITY);
  private n = 0;
  private elapsed = 0;
  /** The level being timed now, and in the end the level chosen. */
  level: Quality;
  done = false;

  constructor(start: Quality) {
    this.level = start;
  }

  /**
   * One frame of `ms`. Null until a window closes; then 'down' (the level
   * has already gone one lower, and the next window times it), or 'keep' or
   * 'stop' (decided: `level` is the answer, and nothing more is done).
   */
  frame(ms: number): Verdict | null {
    if (this.done || !(ms > 0)) return null;
    const f = Math.min(ms, MAX_FRAME_MS);
    this.elapsed += f;
    if (this.elapsed <= WARMUP_MS) return null;
    if (this.n < SAMPLE_CAPACITY) this.buf[this.n++] = f;
    if (this.elapsed < WARMUP_MS + WINDOW_MS) return null;
    const v = judge(medianOf(this.buf, this.n), this.level);
    this.n = 0;
    this.elapsed = 0;
    if (v === 'down') this.level = lower(this.level);
    else this.done = true;
    return v;
  }
}

/** What the game does with a frame of the pick (`pickFrame`). */
export type PickAction = 'none' | 'step' | 'settle' | 'abandon';

export interface PickFrame {
  /** This frame's time, ms. */
  readonly ms: number;
  /** On a screen that is timed (the title, the New Starter Form). */
  readonly timing: boolean;
  /** The tab is showing. */
  readonly visible: boolean;
  /** `qualitySource` in this page's own settings. */
  readonly source: Settings['qualitySource'];
  /**
   * The settings as kept now. Read only when the pick is about to write
   * (a verdict, or settling): never once a frame.
   */
  readonly stored: () => string | null;
}

/**
 * One frame of the first launch's pick, for the game to act on:
 * 'step' (apply and save `p.level`, one lower), 'settle' (save `p.level` as
 * the machine's choice), 'abandon' (stop, write nothing) or 'none'.
 *
 * It abandons when the player has picked in this page, and when the kept
 * settings are no longer a pick in progress: written meanwhile by something
 * else (another tab, a test seeding them), they are somebody's decision, and
 * a pick that saved its own copy over them would throw that decision away
 * (it did: a page timing its first launch overwrote seeded settings, taking
 * "Skip the induction" and Low quality with them).
 */
export function pickFrame(p: QualityPicker, f: PickFrame): PickAction {
  if (f.source !== 'sampling') return 'abandon';
  if (!f.timing) return autoPickDue(f.stored()) ? 'settle' : 'abandon';
  if (!f.visible) return 'none';
  const v = p.frame(f.ms);
  if (v === null) return 'none';
  if (!autoPickDue(f.stored())) return 'abandon';
  return v === 'down' ? 'step' : 'settle';
}
