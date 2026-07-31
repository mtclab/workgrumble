/**
 * Whether the game is still able to keep anything, and saying so out loud.
 *
 * Two of the three writes this product makes are AUTOMATIC - the day-boundary
 * checkpoint and the one that lets go of a carried-over retry - and both used
 * to throw their `SaveOutcome` away. Storage filling up at clock-off produced
 * a new morning that looked completely normal and a tab that, when it closed,
 * took the day with it. Nothing on screen had said a word.
 *
 * So every write reports here, and a failure LATCHES: it stays until a later
 * write actually works. A toast is a sentence that scrolls away, and the fact
 * being reported - "nothing you do is being kept" - is a state rather than an
 * event, so it needs a surface that persists. The taskbar reads this.
 */

export interface SaveHealthView {
  /** Why saving is not working, or null while it is. */
  problem(): string | null;
  onChanged(listener: () => void): () => void;
}

export class SaveHealth implements SaveHealthView {
  private reason: string | null = null;
  private readonly listeners = new Set<() => void>();

  /**
   * Storage that was already refusing before anything was written - a browser
   * with it blocked or switched off. Same latch, said at boot.
   */
  public constructor(initial: string | null = null) {
    this.reason = initial;
  }

  public problem(): string | null {
    return this.reason;
  }

  /** A write that did not happen. The first one wins: it is the cause. */
  public failed(reason: string): void {
    if (this.reason === reason) {
      return;
    }

    this.reason = reason;
    this.announce();
  }

  /** A write that did. Whatever was wrong has stopped being wrong. */
  public succeeded(): void {
    if (this.reason === null) {
      return;
    }

    this.reason = null;
    this.announce();
  }

  public onChanged(listener: () => void): () => void {
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
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
