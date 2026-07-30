/**
 * Shell keyboard contract. Both keys are declared exactly once so the boss key
 * can be rebound in one place (M1 spec, section 3).
 */

/**
 * Panic key: instantly minimises every window whose app is flagged slack.
 * Matched against KeyboardEvent.code (the PHYSICAL key left of 1), not the
 * produced character - a panic key must be one unshifted press on every
 * layout, and the character route fails that (US: '~' needs Shift, FI/SE:
 * '~' is an AltGr dead-key combo).
 */
export const BOSS_KEY_CODE = 'Backquote';

/** What the key cap reads on a US board - for player-facing copy only. */
export const BOSS_KEY_LABEL = '`';

/** Closes transient shell surfaces (menus, panels) - never an application. */
export const DISMISS_KEY = 'Escape';
