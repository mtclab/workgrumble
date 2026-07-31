import { describe, expect, it } from 'vitest';

import { GestureBook, refuseMount } from './window-renderer';
import { createWindowManager, openWindow, type ManagedWindow } from './wm';

/**
 * The two window-renderer nits carried since M2, as the decisions behind them.
 *
 * Neither is about drawing, which is why both can be driven here: one is "who
 * does this drag belong to" and the other is "what happens when an app will not
 * start". The parts that ARE drawing - removing the element, aborting the
 * chrome's listeners - sit either side of these calls in the renderer.
 */

const WINDOW: ManagedWindow = {
  id: 'window-tickets',
  appId: 'tickets',
  title: 'Ticket Queue',
  icon: 'icon-tickets',
  slack: false,
  bounds: { x: 0, y: 0, width: 620, height: 480 },
  restoreBounds: null,
  minimized: false,
  maximized: false,
};

describe('a drag whose window closes under it', () => {
  it('ends the gestures that were about that window, and no others', () => {
    const book = new GestureBook();
    const dragging = new AbortController();
    const resizing = new AbortController();
    const elsewhere = new AbortController();

    book.add('window-tickets', dragging);
    book.add('window-tickets', resizing);
    book.add('window-chat', elsewhere);
    expect(book.size).toBe(3);

    book.abortWindow('window-tickets');

    expect(dragging.signal.aborted).toBe(true);
    expect(resizing.signal.aborted).toBe(true);
    expect(elsewhere.signal.aborted).toBe(false);
    expect(book.size).toBe(1);
  });

  /**
   * The bug this is really about. A window's id is derived from its app, so
   * closing an app mid-drag and opening it again hands the SAME id back - and
   * a gesture nobody ended is still listening on `window`, ready to drag the
   * new window to wherever the pointer happens to be.
   */
  it('does not leave a ghost to drag the window that reopens', () => {
    const book = new GestureBook();
    const ghost = new AbortController();
    book.add('window-tickets', ghost);
    book.abortWindow('window-tickets');

    const fresh = new AbortController();
    book.add('window-tickets', fresh);

    expect(ghost.signal.aborted).toBe(true);
    expect(fresh.signal.aborted).toBe(false);
    expect(book.size).toBe(1);
  });

  it('forgets a gesture that ended the ordinary way', () => {
    const book = new GestureBook();
    const gesture = new AbortController();
    book.add('window-tickets', gesture);

    book.end('window-tickets', gesture);

    expect(gesture.signal.aborted).toBe(true);
    expect(book.size).toBe(0);
    // And ending it twice - a release followed by a blur - is not an error.
    book.end('window-tickets', gesture);
    expect(book.size).toBe(0);
  });

  it('takes every gesture down with the desktop', () => {
    const book = new GestureBook();
    const first = new AbortController();
    const second = new AbortController();
    book.add('window-tickets', first);
    book.add('window-chat', second);

    book.abortAll();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(book.size).toBe(0);
  });
});

describe('an app whose mount throws', () => {
  const opened = openWindow(
    createWindowManager({ width: 1_280, height: 800 }),
    WINDOW,
  );

  it('closes the window rather than leaving an empty frame open', () => {
    const refusal = refuseMount(opened, WINDOW, new Error('The KB is empty.'));

    expect(opened.windows.map((entry) => entry.id)).toEqual(['window-tickets']);
    expect(refusal.state.windows).toEqual([]);
    expect(refusal.state.focusedId).toBeNull();
  });

  it('says which app it was and what it actually said', () => {
    const refusal = refuseMount(opened, WINDOW, new Error('The KB is empty.'));

    expect(refusal.title).toBe('Ticket Queue would not open');
    expect(refusal.body).toContain('The KB is empty.');
    expect(refusal.body).toContain('closed');
  });

  it('still says something when the failure said nothing', () => {
    for (const failure of [new Error(''), 'a string', undefined]) {
      const refusal = refuseMount(opened, WINDOW, failure);
      expect(refusal.title).toBe('Ticket Queue would not open');
      expect(refusal.body.length).toBeGreaterThan(20);
    }
  });
});
