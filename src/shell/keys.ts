/**
 * Shell keyboard contract. Both keys are declared exactly once so the boss key
 * can be rebound in one place (M1 spec, section 3).
 */

/** Panic key: instantly minimises every window whose app is flagged slack. */
export const BOSS_KEY = '~';

/** Closes transient shell surfaces (menus, panels) - never an application. */
export const DISMISS_KEY = 'Escape';
