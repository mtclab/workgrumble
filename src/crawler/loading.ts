/**
 * The loading card's safety net (screens.ts `showLoading`). The work behind
 * the card runs on its own, a frame later, outside whatever click started
 * it: if it throws, nothing else will catch it, and the player is left on a
 * card with no buttons, no keys and no way out. So the work is wrapped, and
 * a failure goes to `failed` instead (which puts the title back up).
 */

/** `work`, wrapped so that a throw goes to `failed` instead of the void. */
export function guarded(work: () => void, failed: (err: unknown) => void): () => void {
  return () => {
    try {
      work();
    } catch (err) {
      failed(err);
    }
  };
}

/** What the title says after a load failed: what went wrong, and that the saves are as they were. */
export function loadFailureLine(err: unknown): string {
  const why = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const detail = why.trim() === '' ? '' : ` (${why.trim().slice(0, 160)})`;
  return `That did not load${detail}. Your saves are as they were: Continue or Load game to try again.`;
}
