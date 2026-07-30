import { describe, expect, it } from 'vitest';

import {
  createNotificationState,
  dismissToast,
  expireToasts,
  markAllRead,
  NOTIFICATION_HISTORY_LIMIT,
  type NotificationState,
  pushNotification,
  TOAST_TTL_TICKS,
} from './notifications';

function pushMany(count: number): NotificationState {
  let state = createNotificationState();

  for (let index = 0; index < count; index += 1) {
    state = pushNotification(
      state,
      `Title ${String(index)}`,
      `Body ${String(index)}`,
      index,
    );
  }

  return state;
}

describe('notification centre model', () => {
  it('queues a toast, counts it unread, and records it newest-first', () => {
    const state = pushMany(2);

    expect(state.toasts.map(({ title }) => title)).toEqual([
      'Title 0',
      'Title 1',
    ]);
    expect(state.history.map(({ title }) => title)).toEqual([
      'Title 1',
      'Title 0',
    ]);
    expect(state.unread).toBe(2);
    expect(new Set(state.toasts.map(({ id }) => id)).size).toBe(2);
  });

  it('dismisses one toast without clearing the unread badge or history', () => {
    const state = pushMany(2);
    const first = state.toasts[0];

    if (first === undefined) {
      throw new Error('Expected a queued toast.');
    }

    const dismissed = dismissToast(state, first.id);

    expect(dismissed.toasts.map(({ id }) => id)).toEqual([
      state.toasts[1]?.id,
    ]);
    expect(dismissed.history).toHaveLength(2);
    expect(dismissed.unread).toBe(2);
    expect(dismissToast(dismissed, first.id)).toBe(dismissed);
  });

  it('auto-expires toasts by simulation ticks, never by wall time', () => {
    const state = pushMany(1);

    expect(expireToasts(state, TOAST_TTL_TICKS - 1)).toBe(state);
    expect(expireToasts(state, TOAST_TTL_TICKS).toasts).toEqual([]);
    expect(expireToasts(state, TOAST_TTL_TICKS).unread).toBe(1);
    expect(() => expireToasts(state, 0, 0)).toThrow(TypeError);
  });

  it('clears the badge when the tray is read and caps history growth', () => {
    const state = markAllRead(pushMany(NOTIFICATION_HISTORY_LIMIT + 3));

    expect(state.unread).toBe(0);
    expect(markAllRead(state)).toBe(state);
    expect(state.history).toHaveLength(NOTIFICATION_HISTORY_LIMIT);
    expect(state.history[0]?.title).toBe(
      `Title ${String(NOTIFICATION_HISTORY_LIMIT + 2)}`,
    );
  });

  it('rejects blank copy and invalid ticks', () => {
    const state = createNotificationState();

    expect(() => pushNotification(state, ' ', 'body', 0)).toThrow(TypeError);
    expect(() => pushNotification(state, 'title', '', 0)).toThrow(TypeError);
    expect(() => pushNotification(state, 'title', 'body', -1)).toThrow(
      TypeError,
    );
    expect(() => pushNotification(state, 'title', 'body', 1.5)).toThrow(
      TypeError,
    );
  });
});
