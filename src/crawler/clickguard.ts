/**
 * After a mouse button has been bound on the key binder's button, the click
 * that same press makes must not land on the redrawn grid (it would start a
 * rebind of whatever is drawn there now). This eats that one click, and no
 * other: it ends as soon as the press is over, however it ends.
 *
 * - the click comes (the left button): eaten, and done;
 * - auxclick or contextmenu come instead (the middle and right buttons make
 *   no click): done, nothing eaten;
 * - the button comes up: done a task later, after the click that is
 *   dispatched along with the mouseup, if there is one;
 * - the next press starts, or `SAFETY_MS` passes (a mouseup outside the
 *   window never arrives): done.
 *
 * It used to end only on a click or the next press, so after a right-button
 * bind it lingered and ate the next keyboard-driven click (Enter on Done,
 * Reset keys) instead.
 */
export const SAFETY_MS = 1000;

/** The window's capture phase, so the guard runs before any button's own handler. (An options object: Node's EventTarget does not match a bare `true` on removal.) */
const CAPTURE = { capture: true } as const;

/** Start guarding `target` (the window, capture phase). Returns a function that ends it early. */
export function swallowNextClick(target: EventTarget): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const swallow = (ev: Event): void => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    end();
  };
  const soon = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(end, 0);
  };
  const end = (): void => {
    target.removeEventListener('click', swallow, CAPTURE);
    target.removeEventListener('auxclick', end, CAPTURE);
    target.removeEventListener('contextmenu', end, CAPTURE);
    target.removeEventListener('mousedown', end, CAPTURE);
    target.removeEventListener('mouseup', soon, CAPTURE);
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  target.addEventListener('click', swallow, CAPTURE);
  target.addEventListener('auxclick', end, CAPTURE);
  target.addEventListener('contextmenu', end, CAPTURE);
  target.addEventListener('mousedown', end, CAPTURE);
  target.addEventListener('mouseup', soon, CAPTURE);
  timer = setTimeout(end, SAFETY_MS);
  return end;
}
