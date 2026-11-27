import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAFETY_MS, swallowNextClick } from './clickguard';

/**
 * A page: the window as an event target, guarded, and the clicks that get
 * past the guard counted. (A plain event target has no capture phase, so the
 * counter goes on after the guard, as the button's own handler runs after
 * the window's capture listener on a real page.)
 */
function page(): { win: EventTarget; clicks: () => number } {
  const win = new EventTarget();
  swallowNextClick(win);
  let n = 0;
  win.addEventListener('click', () => { n++; });
  return { win, clicks: () => n };
}

const fire = (t: EventTarget, type: string): void => { t.dispatchEvent(new Event(type, { cancelable: true })); };

describe('the click after a mouse-button bind', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('the left button: its own click is eaten, and the next one is not', () => {
    const { win, clicks } = page();
    fire(win, 'mouseup');
    fire(win, 'click');
    expect(clicks()).toBe(0);
    vi.runAllTimers();
    fire(win, 'click');
    expect(clicks()).toBe(1);
  });

  it('the right button makes no click: a later keyboard click (Enter on Done) still goes through', () => {
    const { win, clicks } = page();
    fire(win, 'mouseup');
    fire(win, 'contextmenu');
    fire(win, 'auxclick');
    vi.runAllTimers();
    fire(win, 'click');
    expect(clicks()).toBe(1);
  });

  it('ends on the auxclick or contextmenu alone, with no timers run', () => {
    for (const ender of ['auxclick', 'contextmenu']) {
      const { win, clicks } = page();
        fire(win, ender);
      fire(win, 'click');
      expect(clicks(), ender).toBe(1);
    }
  });

  it('a button let go outside the window (no mouseup): it ends by itself', () => {
    const { win, clicks } = page();
    vi.advanceTimersByTime(SAFETY_MS);
    fire(win, 'click');
    expect(clicks()).toBe(1);
  });

  it('the next press ends it', () => {
    const { win, clicks } = page();
    fire(win, 'mousedown');
    fire(win, 'click');
    expect(clicks()).toBe(1);
  });
});
