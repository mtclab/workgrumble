/**
 * Notification centre as a pure state model (no DOM). Toast lifetime is
 * measured in simulation ticks so a paused simulation also pauses toasts.
 */

/** Simulation ticks a toast stays on screen before it auto-dismisses. */
export const TOAST_TTL_TICKS = 10;

/** Newest-first history depth kept for the tray panel. */
export const NOTIFICATION_HISTORY_LIMIT = 24;

/**
 * How many toasts may be on screen at once.
 *
 * The stack is a column down the right-hand side of the desktop and nothing
 * was stopping it. A day-end pile-up is real - five tickets breaching in the
 * same minute, a drip arriving on top of them - and eight toasts is the queue
 * covered by an account of the queue, which is the joke going one step too
 * far. The oldest ones go; nothing is LOST, because the notification centre
 * keeps every one of them and the badge still counts them all.
 */
export const TOAST_STACK_LIMIT = 4;

export interface ShellNotification {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly tick: number;
}

export interface NotificationState {
  /** Oldest-first toasts currently on screen. */
  readonly toasts: readonly ShellNotification[];
  /** Newest-first history, capped at NOTIFICATION_HISTORY_LIMIT. */
  readonly history: readonly ShellNotification[];
  readonly unread: number;
  readonly sequence: number;
}

function requireTick(tick: number): number {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new TypeError('Notification tick must be a non-negative safe integer.');
  }

  return tick;
}

function requireText(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }

  return value;
}

export function createNotificationState(): NotificationState {
  return {
    toasts: [],
    history: [],
    unread: 0,
    sequence: 0,
  };
}

export function pushNotification(
  state: Readonly<NotificationState>,
  title: string,
  body: string,
  tick: number,
): NotificationState {
  const notification: ShellNotification = {
    id: `notification-${String(state.sequence)}`,
    title: requireText(title, 'Notification title'),
    body: requireText(body, 'Notification body'),
    tick: requireTick(tick),
  };

  return {
    // Newest wins the screen: the oldest fall off the top of the stack rather
    // than the newest being refused a place on it.
    toasts: [...state.toasts, notification].slice(-TOAST_STACK_LIMIT),
    history: [notification, ...state.history].slice(
      0,
      NOTIFICATION_HISTORY_LIMIT,
    ),
    unread: state.unread + 1,
    sequence: state.sequence + 1,
  };
}

export function dismissToast(
  state: Readonly<NotificationState>,
  id: string,
): NotificationState {
  if (!state.toasts.some((toast) => toast.id === id)) {
    return state;
  }

  return {
    ...state,
    toasts: state.toasts.filter((toast) => toast.id !== id),
  };
}

export function expireToasts(
  state: Readonly<NotificationState>,
  tick: number,
  ttl: number = TOAST_TTL_TICKS,
): NotificationState {
  requireTick(tick);

  if (!Number.isSafeInteger(ttl) || ttl <= 0) {
    throw new TypeError('Toast lifetime must be a positive safe integer.');
  }

  const toasts = state.toasts.filter((toast) => tick - toast.tick < ttl);

  return toasts.length === state.toasts.length
    ? state
    : { ...state, toasts };
}

export function markAllRead(
  state: Readonly<NotificationState>,
): NotificationState {
  return state.unread === 0 ? state : { ...state, unread: 0 };
}
