/**
 * Every function a player can reach, as data.
 *
 * This is the list the total walk iterates: one entry per thing somebody can
 * DO - a control, a typed command, a scene the day puts on the screen, a state
 * the desk can be in - with the registered action it reaches, if any, and the
 * run of the walk that drives it.
 *
 * It exists because "we tested the app" is not a claim anybody can check. Two
 * gates hang off this file and they fail in different places on purpose:
 *
 * - `coverage.test.ts` walks the real registries - the app manifest, the
 *   terminal's grammar, the action payload the engine is handed, the scene
 *   tables, the desk's own phases - and fails when one of them holds something
 *   this list does not. Adding an app, a verb, a command or a scene without
 *   covering it goes red offline, in the local half of the gate.
 * - `e2e/total-walk.spec.ts` keeps a ledger of the ids it actually drove on the
 *   built artifact and fails when that ledger and this list disagree. An entry
 *   nobody walks is as much a hole as a function nobody listed.
 *
 * Nothing in here is a test on its own. It is the inventory both halves argue
 * with, and the only honest place to write down that a function is covered
 * somewhere other than the week - a firing, or a branch a single week cannot
 * hold both sides of.
 */

import {
  DAY_ACTIONS,
  HELPDESK_ACTIONS,
  WORLD_ACTIONS,
} from '../world/actions';
import { DEMO_ACTIONS } from '../world/demo-world';

/**
 * The runs the total walk is made of, and why each one is its own session.
 *
 * A week is the unit this product ships, so the week is the walk. The other
 * three exist because a single week cannot contain them: a player who is
 * fired does not also pass, and an enrolment nobody checked cannot also have
 * been checked.
 */
export const WALK_RUNS = {
  week: 'The probation week, played properly: every app, every tool, every '
    + 'scene the days put up, and a review that goes the right way.',
  fired: 'The same week ignored, which is the only way to reach the firing, '
    + 'the locked fridge on a Friday, and the Monday that starts again.',
  shortcut: 'Wednesday, an enrolment nobody checked, and the incident report '
    + 'it becomes overnight. A week can hold this branch or the next one.',
  checked: 'Wednesday, thirty seconds of checking first, and the post that '
    + 'never comes.',
  deploy: 'The tester build with its Worker behind it: the link that lets '
    + 'somebody in, the badge that is the whole of an account, a week that '
    + 'follows the badge to a browser that has never seen it, the form for '
    + 'saying the game is broken, and the update window on a workstation that '
    + 'remembers an older build.',
} as const;

export type WalkRunId = keyof typeof WALK_RUNS;

/** How a window gets on the screen. */
export const WINDOW_ROUTES = [
  'start-menu',
  'desktop-icon',
  /** The day puts it up itself: a brief, a scorecard, a manager. */
  'day',
  /** Another app opened it, usually with somewhere to land. */
  'link',
  /**
   * The SHELL puts it up, before anybody has logged on. One window uses this
   * and it is the update notes: a build that installed itself overnight has
   * to say so without waiting to be asked, and "overnight" is boot.
   */
  'boot',
] as const;

export type WindowRoute = (typeof WINDOW_ROUTES)[number];

/**
 * The parts of the shell that are not apps. An entry's surface is one of these
 * or an app id from the manifest, and `coverage.test.ts` refuses anything else.
 */
export const SHELL_SURFACES = [
  'boot',
  /**
   * The tester door. It is not a window and not a control - it is a URL
   * somebody was sent - but it is unquestionably a thing a player uses, and a
   * surface with no entry here would be the one part of the product nobody had
   * written down.
   */
  'door',
  'login',
  'desktop',
  'taskbar',
  'start-menu',
  'windows',
  'notifications',
  'desk',
] as const;

export interface CoverageEntry {
  /** Unique, and what a failing step in the walk is named after. */
  readonly id: string;
  /** An app id from the manifest, or one of `SHELL_SURFACES`. */
  readonly surface: string;
  /** What the player touches: a test id, a key, or a line they type. */
  readonly control: string;
  /** What it does, in one sentence. */
  readonly does: string;
  /** Which run of the total walk drives it. */
  readonly run: WalkRunId;
  /**
   * Registered actions this reaches - either dispatched by the control itself
   * or caused by it, which is the same question from the player's chair: the
   * crash is the bill for the can, and the children close because the parent
   * was repaired.
   */
  readonly actions?: readonly string[];
  /** Set on the ONE entry per app that is "this window opens". */
  readonly window?: { readonly routes: readonly WindowRoute[] };
  /** The terminal command this entry is about. */
  readonly command?: string;
  /** The scene this entry puts in front of the player. */
  readonly scene?: string;
  /** The desk state this entry reaches. */
  readonly consumable?: string;
  /** Why it is not in the week. Required for every run except `week`. */
  readonly why?: string;
}

/**
 * The list itself, `as const` so the ids are literal types: `CoverageId` is
 * what the walk's ledger is keyed on, and a typo in a step name is a typecheck
 * failure rather than a silently uncovered entry. Everything else reads
 * `COVERAGE` below, which is the same array under the shared interface.
 */
const ENTRIES = [
  /* -- the door ----------------------------------------------------------- */
  {
    id: 'door.admission',
    surface: 'door',
    control: '/t/<token>',
    does: 'Spends one admission off a tester link and lets the browser in, '
      + 'for thirty days or until the link is revoked.',
    run: 'deploy',
    why: 'There is no door in front of a build served off a file server; this '
      + 'one needs the Worker and a token somebody minted.',
  },
  {
    id: 'door.refusal',
    surface: 'door',
    control: '/t/<token> (revoked, spent, expired or invented)',
    does: 'Refuses with the same page and the same status for every reason, '
      + 'so guessing at links teaches nobody anything.',
    run: 'deploy',
    why: 'The four refusals need four seeded token records, which only exist '
      + 'against a Worker with a KV behind it.',
  },

  /* -- boot and the login screen ------------------------------------------ */
  {
    id: 'boot.skip',
    surface: 'boot',
    control: 'boot-hint, Space',
    does: 'Skips the POST gag instead of sitting through it.',
    run: 'week',
  },
  {
    id: 'boot.installing',
    surface: 'boot',
    control: 'install-screen',
    does: 'Plays the update animation between the POST and the log-on box on '
      + 'the first boot of a changed build - our release arriving as the '
      + 'fiction\'s update, on the fiction\'s own screen, before the notes '
      + 'that say what was in it.',
    run: 'deploy',
    why: 'It only plays on a workstation that remembers an older build, which '
      + 'is a browser seeded with an older version and a reload.',
  },
  {
    id: 'login.submit',
    surface: 'login',
    control: 'login-password, login-submit',
    does: 'Logs on with any password at all, which is the joke and the seam.',
    run: 'week',
  },
  {
    id: 'login.restart',
    surface: 'login',
    control: 'login-restart',
    does: 'Restarts the workstation from the login screen, without a reload.',
    run: 'week',
  },
  {
    id: 'login.issue-badge',
    surface: 'login',
    control: 'login-issue-badge',
    does: 'Issues a badge number to this browser and says, once, that nobody '
      + 'can look it up again.',
    run: 'deploy',
    why: 'A badge is minted by the Worker; there is nothing to mint one with '
      + 'on a build served as files.',
  },
  {
    id: 'login.badge',
    surface: 'login',
    control: 'login-badge, login-submit',
    does: 'Logs on as a badge that was issued somewhere else, which is how a '
      + 'week reaches a browser that has never seen it.',
    run: 'deploy',
    why: 'Proving a badge is a question for the building, and the building is '
      + 'the Worker.',
  },
  {
    id: 'login.account',
    surface: 'login',
    control: 'login-badge-account',
    does: 'Reads the record IT holds on this badge: when it was issued, when '
      + 'it was last used, and the date it gets cleared out if nobody comes '
      + 'back.',
    run: 'deploy',
    why: 'The dates come from the badge record in the Worker\'s KV; a build '
      + 'served as files has no account to hold one.',
  },
  {
    id: 'login.fresh-week',
    surface: 'login',
    control: 'login-badge, login-submit (a badge with no week on it)',
    does: 'Logs on as a badge nothing has been saved against, starts Monday '
      + 'morning on that same badge, and says that is what happened rather '
      + 'than leaving somebody to wonder where their week went.',
    run: 'deploy',
    why: 'The other direction of the badge decision, and it needs a badge the '
      + 'Worker has minted and nothing has been filed against.',
  },
  {
    id: 'login.badge-refused',
    surface: 'login',
    control: 'login-badge (a number nobody was issued)',
    does: 'Says the badge is not one this building recognises and stays on '
      + 'the log-on screen, rather than letting somebody into a week that is '
      + 'not theirs.',
    run: 'deploy',
    why: 'Only a Worker can refuse a badge; without one the game logs on and '
      + 'plays offline, which is the deliberate other behaviour.',
  },

  /* -- the desktop -------------------------------------------------------- */
  {
    id: 'desktop.icon',
    surface: 'desktop',
    control: 'desktop-icon-<app>',
    does: 'Opens a tool by double-clicking its icon on the wallpaper.',
    run: 'week',
  },
  {
    id: 'desktop.clock',
    surface: 'desktop',
    control: 'sim-clock-time, sim-clock-day',
    does: 'Reads the simulated minute and the day it belongs to.',
    run: 'week',
  },
  {
    id: 'desktop.day-state',
    surface: 'desktop',
    control: 'day-state',
    does: 'Reopens the day\'s own screen - the brief, or the scorecard after '
      + 'five - so neither is a window you can only be shown once.',
    run: 'week',
  },
  {
    id: 'desktop.pause',
    surface: 'desktop',
    control: 'day-pause',
    does: 'Stops the clock, and starts it again.',
    run: 'week',
  },
  {
    id: 'desktop.speed',
    surface: 'desktop',
    control: 'day-speed-1, day-speed-2, day-speed-4',
    does: 'Runs the day at one, two or four times normal speed. The day puts '
      + 'it back to x1 itself whenever something lands on the player - a '
      + 'phone, a meeting, a workstation, a manager - and leaves it there '
      + 'afterwards, because putting it back up is the player\'s to decide.',
    run: 'week',
  },
  {
    id: 'desktop.telegraph',
    surface: 'desktop',
    control: 'boss-chip, door-flash',
    does: 'The corridor, said three ways: the floor, the reflection, and a '
      + 'chip that spells out how long the footsteps have.',
    run: 'week',
  },
  {
    id: 'desktop.boss-key',
    surface: 'desktop',
    control: 'Backquote',
    does: 'Minimizes every slack window at once, mid-sentence if need be.',
    run: 'week',
  },
  {
    id: 'desktop.escape-scene',
    surface: 'desktop',
    control: 'Escape',
    does: 'Closes the day screen in front, and leaves the tools alone.',
    run: 'week',
  },
  {
    id: 'desktop.fumble-chip',
    surface: 'desktop',
    control: 'fumble-chip',
    does: 'Says out loud that the shaking is cosmetic, once the day has gone '
      + 'badly enough to shake.',
    run: 'fired',
    why: 'Eighty stress is a queue nobody worked; the week that goes well '
      + 'never gets there.',
  },

  /* -- the taskbar, the start menu and the window manager ------------------ */
  {
    id: 'taskbar.button',
    surface: 'taskbar',
    control: 'taskbar-button-<app>',
    does: 'Raises a window, or minimizes the one already in front.',
    run: 'week',
  },
  {
    id: 'start-menu.open',
    surface: 'start-menu',
    control: 'start-button',
    does: 'Opens the menu, and closes it again on Escape or an outside click.',
    run: 'week',
  },
  {
    id: 'start-menu.app',
    surface: 'start-menu',
    control: 'start-menu-item-<app>',
    does: 'Opens any installed app, tools first and the day\'s screens after.',
    run: 'week',
  },
  {
    id: 'start-menu.save',
    surface: 'start-menu',
    control: 'start-menu-save',
    does: 'Writes the world, the minute and the screens to the save slot.',
    run: 'week',
  },
  {
    id: 'start-menu.load',
    surface: 'start-menu',
    control: 'start-menu-load',
    does: 'Puts the saved world back, to the byte, under every open window.',
    run: 'week',
  },
  {
    id: 'start-menu.badge-sync',
    surface: 'start-menu',
    control: 'start-menu-save (with a badge)',
    does: 'Sends the same week up to the badge it was saved under, so a '
      + 'browser that has never played it can be handed it.',
    run: 'deploy',
    why: 'There is nowhere to send a week without a Worker, and the outcome '
      + 'is only visible from a second browser.',
  },
  {
    id: 'start-menu.load-refused',
    surface: 'start-menu',
    control: 'start-menu-load',
    does: 'Refuses a save this build cannot read, and leaves the running '
      + 'session exactly where it was.',
    run: 'fired',
    why: 'It writes rubbish into the save slot, which is not something to do '
      + 'to a week that is being played properly.',
  },
  {
    id: 'start-menu.log-off',
    surface: 'start-menu',
    control: 'start-menu-log-off',
    does: 'Drops back to the login screen with the session still running.',
    run: 'week',
  },
  {
    id: 'start-menu.restart',
    surface: 'start-menu',
    control: 'start-menu-restart',
    does: 'Restarts the whole workstation from the desktop.',
    run: 'week',
  },
  {
    id: 'windows.drag',
    surface: 'windows',
    control: 'titlebar-<app>',
    does: 'Drags a window around the desktop by its titlebar.',
    run: 'week',
  },
  {
    id: 'windows.maximize',
    surface: 'windows',
    control: 'titlebar-<app> (double click)',
    does: 'Maximizes a window and restores it again.',
    run: 'week',
  },
  {
    id: 'windows.resize',
    surface: 'windows',
    control: 'resize-<app>-se',
    does: 'Resizes a window from its corner handle.',
    run: 'week',
  },
  {
    id: 'windows.minimize',
    surface: 'windows',
    control: 'minimize-<app>',
    does: 'Minimizes a window to the taskbar without losing it.',
    run: 'week',
  },
  {
    id: 'windows.close',
    surface: 'windows',
    control: 'close-<app>',
    does: 'Closes a window, and leaves it reachable again afterwards.',
    run: 'week',
  },
  {
    id: 'windows.cascade',
    surface: 'windows',
    control: 'window-layer',
    does: 'Places every window of a crowded desktop inside the screen rather '
      + 'than off the edge of it.',
    run: 'week',
  },

  /* -- notifications ------------------------------------------------------ */
  {
    id: 'notifications.toast',
    surface: 'notifications',
    control: 'toast',
    does: 'Says what the world just did, and counts it on the tray badge.',
    run: 'week',
  },
  {
    id: 'notifications.dismiss',
    surface: 'notifications',
    control: 'toast-dismiss',
    does: 'Takes a toast off the screen while the record survives it.',
    run: 'week',
  },
  {
    id: 'notifications.tray',
    surface: 'notifications',
    control: 'notification-tray, notification-panel',
    does: 'Opens the notification centre, which is where a toast nobody read '
      + 'is still on the books.',
    run: 'week',
  },

  /* -- the desk ----------------------------------------------------------- */
  {
    id: 'desk.idle',
    surface: 'desk',
    control: 'desk-drink (before a shift)',
    does: 'A can nobody has opened, greyed out with the reason: the desk is '
      + 'not on shift, and whatever this was going to solve will keep.',
    consumable: 'drink.none',
    run: 'week',
  },
  {
    id: 'desk.drink',
    surface: 'desk',
    control: 'desk-drink',
    does: 'Opens a can: money out, steady hands for a while, and a bill.',
    actions: [DAY_ACTIONS.consumableDrink],
    consumable: 'drink.buff',
    run: 'week',
  },
  {
    id: 'desk.crash',
    surface: 'desk',
    control: 'desk-drink-label, the clock',
    does: 'The bill for the can, arriving on time and saying so.',
    actions: [DAY_ACTIONS.consumableCrash],
    consumable: 'drink.crash',
    run: 'week',
  },
  {
    id: 'desk.tolerance',
    surface: 'desk',
    control: 'desk-drink (second can of a run)',
    does: 'A second can inside the window: shorter legs, heavier landing, and '
      + 'the tooltip says which number of the run it is.',
    actions: [DAY_ACTIONS.consumableDrink],
    run: 'week',
  },
  {
    id: 'desk.late-refusal',
    surface: 'desk',
    control: 'desk-drink (late in the shift)',
    does: 'Refuses a can whose crash would land after everybody has gone '
      + 'home, before the click rather than after it.',
    run: 'week',
  },
  {
    id: 'desk.empties',
    surface: 'desk',
    control: 'desk-empties',
    does: 'Stacks the empties where somebody walking past can count them.',
    consumable: 'desk.empties',
    run: 'week',
  },
  {
    id: 'desk.tidy',
    surface: 'desk',
    control: 'desk-tidy',
    does: 'Puts the empties in the bin before somebody makes it a '
      + 'conversation.',
    actions: [DAY_ACTIONS.deskTidy],
    run: 'week',
  },
  {
    id: 'desk.empties-counted',
    surface: 'desk',
    control: 'desk-empties (four of them, at an arrival)',
    does: 'The lead does the arithmetic on the cans and does not mention it.',
    actions: [DAY_ACTIONS.bossNoticedEmpties],
    run: 'fired',
    why: 'Four cans on the desk at the minute he arrives is a week nobody is '
      + 'trying to pass.',
  },
  {
    id: 'desk.beer-locked',
    surface: 'desk',
    control: 'desk-beer',
    does: 'The bottle with your name on it, visible and locked, saying why.',
    consumable: 'desk.beer',
    run: 'week',
  },
  {
    id: 'desk.beer-unlocked',
    surface: 'desk',
    control: 'desk-beer',
    does: 'The same bottle on Friday evening, which is a button now.',
    run: 'week',
  },

  /* -- the morning brief -------------------------------------------------- */
  {
    id: 'brief.window',
    surface: 'brief',
    control: 'window-brief',
    does: 'The hour before the shift: what day it is, who wants something, '
      + 'and what is already in the queue.',
    window: { routes: ['start-menu', 'day'] },
    run: 'week',
  },
  {
    id: 'brief.start-shift',
    surface: 'brief',
    control: 'brief-start-shift',
    does: 'Starts the shift, which skips whatever is left of the morning.',
    actions: [DAY_ACTIONS.startShift],
    run: 'week',
  },
  {
    id: 'brief.started-refusal',
    surface: 'brief',
    control: 'brief-start-shift (after nine)',
    does: 'Says there is no starting a shift twice, rather than doing nothing.',
    run: 'week',
  },
  {
    id: 'brief.open-mail',
    surface: 'brief',
    control: 'brief-open-mail',
    does: 'Opens the inbox at the thread the brief was quoting.',
    run: 'week',
  },
  {
    id: 'brief.open-tickets',
    surface: 'brief',
    control: 'brief-open-tickets',
    does: 'Opens the queue the morning has handed over.',
    run: 'week',
  },

  /* -- the day scorecard -------------------------------------------------- */
  {
    id: 'scorecard.window',
    surface: 'scorecard',
    control: 'window-scorecard',
    does: 'The day at seventeen hundred, in tickets and in money.',
    window: { routes: ['start-menu', 'day'] },
    run: 'week',
  },
  {
    id: 'scorecard.early-refusal',
    surface: 'scorecard',
    control: 'scorecard-clock-off (during the shift)',
    does: 'Refuses to clock off a day that is still on, and says so.',
    run: 'week',
  },
  {
    id: 'scorecard.clock-off',
    surface: 'scorecard',
    control: 'scorecard-clock-off',
    does: 'Banks the take-home and starts tomorrow morning.',
    actions: [DAY_ACTIONS.clockOff],
    run: 'week',
  },
  {
    id: 'scorecard.end-week',
    surface: 'scorecard',
    control: 'scorecard-clock-off (on the Friday)',
    does: 'Ends the week instead: there is no Saturday, so it stops here.',
    actions: [DAY_ACTIONS.endWeek],
    run: 'week',
  },
  {
    id: 'scorecard.triage-report',
    surface: 'scorecard',
    control: 'scorecard-triage, scorecard-misclassified',
    does: 'Puts the player\'s reading of each ticket beside the estate\'s.',
    run: 'week',
  },
  {
    id: 'scorecard.payslip',
    surface: 'scorecard',
    control: 'scorecard-pay, scorecard-net, scorecard-farm-total',
    does: 'What the day paid, what the machine took, and what the farm fund '
      + 'is up to.',
    run: 'week',
  },

  /* -- the week ----------------------------------------------------------- */
  {
    id: 'weekend.window',
    surface: 'weekend',
    control: 'window-weekend',
    does: 'Friday evening, with the five days added up.',
    window: { routes: ['start-menu', 'day'] },
    run: 'week',
  },
  {
    id: 'weekend.days',
    surface: 'weekend',
    control: 'weekend-day-1 .. weekend-day-5, weekend-totals',
    does: 'Each day\'s line, the week\'s totals, and the number the lead read.',
    run: 'week',
  },
  {
    id: 'weekend.onward-locked',
    surface: 'weekend',
    control: 'weekend-onward',
    does: 'Says week two is not built yet rather than pretending it is.',
    run: 'week',
  },
  {
    id: 'weekend.onward-retry',
    surface: 'weekend',
    control: 'weekend-onward',
    does: 'Starts the Monday again after a firing, keeping the fund.',
    run: 'fired',
    why: 'Only a week that ended in the small room offers it.',
  },

  /* -- being caught ------------------------------------------------------- */
  {
    id: 'caught.window',
    surface: 'caught',
    control: 'window-caught',
    does: 'A window with a manager in it, on top of a queue that is still '
      + 'there underneath.',
    window: { routes: ['start-menu', 'day'] },
    run: 'week',
  },
  {
    id: 'caught.dismiss',
    surface: 'caught',
    control: 'caught-dismiss',
    does: 'Takes it on the chin, which is always available.',
    run: 'week',
  },
  {
    id: 'caught.scene-none',
    surface: 'caught',
    control: 'start-menu-item-caught',
    does: 'Opened cold, it says nothing has happened rather than inventing a '
      + 'telling-off.',
    scene: 'caught.none',
    run: 'week',
  },
  {
    id: 'caught.scene-browser',
    surface: 'caught',
    control: 'window-browser at an arrival',
    does: 'The forum, read out loud from the doorway.',
    actions: [DAY_ACTIONS.bossCaught],
    scene: 'caught.browser',
    run: 'week',
  },
  {
    id: 'caught.scene-bubbles',
    surface: 'caught',
    control: 'window-bubbles at an arrival',
    does: 'The morale exercise, watched until you catch a third one.',
    actions: [DAY_ACTIONS.bossCaught],
    scene: 'caught.bubbles',
    run: 'fired',
    why: 'One arrival catches one screen; a week that is being worked can '
      + 'spare one of those, not two.',
  },

  {
    id: 'caught.file',
    surface: 'caught',
    control: 'caught-file',
    does: 'The conduct file itself: one dated line per thing that was '
      + 'noticed, readable from the Monday, costing nothing.',
    run: 'week',
  },
  {
    id: 'caught.criteria',
    surface: 'caught',
    control: 'caught-criteria',
    does: 'The three reasons somebody would open it, and the mark Friday '
      + 'therefore has to reach - said before any of it decides anything.',
    run: 'week',
  },

  /* -- the phone -----------------------------------------------------------
   *
   * A call is a window rather than a takeover, deliberately: the boss key
   * still works underneath one and the lead still comes round, because being
   * on the phone is not a defence and never has been.
   */
  {
    id: 'call.window',
    surface: 'call',
    control: 'window-call',
    does: 'A phone ringing, with a name and a subject on it, over a queue '
      + 'whose deadlines are all still running.',
    window: { routes: ['start-menu', 'day'] },
    run: 'week',
  },
  {
    id: 'call.answer',
    surface: 'call',
    control: 'call-answer',
    does: 'Picks it up, which opens a conversation that costs the rest of the '
      + 'window and starts the refocus debuff when it was about nothing.',
    actions: [DAY_ACTIONS.interruptionAccept],
    run: 'week',
  },
  {
    id: 'call.conversation',
    surface: 'call',
    control: 'call-option-<n>',
    does: 'One line of the call, which on a related one lands a work note on '
      + 'the ticket - a call can be how a ticket moves.',
    run: 'week',
  },
  {
    id: 'call.defer',
    surface: 'call',
    control: 'call-defer',
    does: 'Asks them to ring back, which sends a line now and buys twenty '
      + 'minutes, once.',
    actions: [DAY_ACTIONS.interruptionDefer],
    run: 'week',
  },
  {
    id: 'call.callback',
    surface: 'call',
    control: 'call-decline at the second arrival',
    does: 'The call coming back, and refusing to be waved off the second '
      + 'time, in the world\'s own sentence.',
    run: 'week',
  },
  {
    id: 'call.decline',
    surface: 'call',
    control: 'call-decline',
    does: 'Says no, where the entry says no is available, and hands the rest '
      + 'of the minutes straight back.',
    actions: [DAY_ACTIONS.interruptionDecline],
    run: 'week',
  },

  /* -- the half hour nobody chose ----------------------------------------- */
  {
    id: 'meeting.window',
    surface: 'meeting',
    control: 'window-meeting',
    does: 'The mandatory sync: authored beats on their own minutes, a count '
      + 'of the queue that cannot be touched, and every clock running.',
    window: { routes: ['start-menu', 'day'] },
    run: 'week',
  },
  {
    id: 'meeting.decline',
    surface: 'meeting',
    control: 'meeting-decline',
    does: 'Tries to skip the sync and is told, by the world rather than by a '
      + 'missing button, why a junior does not.',
    run: 'week',
  },
  {
    id: 'meeting.defer',
    surface: 'meeting',
    control: 'meeting-defer',
    does: 'Tries to catch up on it afterwards instead, and gets the same '
      + 'answer for the same reason.',
    run: 'week',
  },

  /* -- the workstation, having its own morning ------------------------------
   *
   * Two surfaces and they are two different rules. The COUNTDOWN runs while a
   * reboot the player pushed back is on its way, and the desk is theirs for
   * every minute of it - that is what the postpone bought. The UPDATE SCREEN
   * runs while it owns the desk, and nothing on the desk answers for the whole
   * of it.
   */
  {
    id: 'reboot.window',
    surface: 'reboot',
    control: 'window-reboot',
    does: 'The workstation restarting itself: a percentage that is theatre '
      + 'pinned to real minutes, one imperative sentence, and a queue whose '
      + 'deadlines are all still running behind it.',
    window: { routes: ['start-menu', 'day'] },
    run: 'week',
  },
  {
    id: 'reboot.postpone',
    surface: 'reboot',
    control: 'reboot-postpone',
    does: 'Pushes it back by the next window in the budget, which is shorter '
      + 'than the last one, and says how many are left after this.',
    actions: [DAY_ACTIONS.interruptionDefer],
    run: 'week',
  },
  {
    id: 'reboot.countdown',
    surface: 'reboot',
    control: 'reboot-countdown, reboot-chip',
    does: 'Counts the minutes a postpone bought, in the window and on the '
      + 'taskbar, while the desk stays entirely workable underneath it.',
    run: 'week',
  },
  {
    id: 'reboot.withdrawn',
    surface: 'reboot',
    control: 'reboot-withdrawn',
    does: 'Says on the dialog that declining was an option until it was '
      + 'withdrawn, rather than offering a button that would refuse every '
      + 'single time.',
    run: 'week',
  },
  {
    id: 'reboot.spent',
    surface: 'reboot',
    control: 'reboot-dialog (no postpones left)',
    does: 'The arrival that offers nothing: the buttons are gone because the '
      + 'budget is, and the desk refuses every verb in the workstation\'s own '
      + 'sentence until it hands itself back.',
    run: 'week',
  },
  {
    id: 'reboot.restart-now',
    surface: 'reboot',
    control: 'reboot-restart-now',
    does: 'Takes it now instead of dreading it, which is legal, lands the '
      + 'same recovery window, and is the only way anybody chooses the minute.',
    run: 'fired',
    why: 'A week can spend the budget or skip it, not both: the one reboot in '
      + 'the probation week is the only place either button exists.',
  },

  /* -- the review --------------------------------------------------------- */
  {
    id: 'review.window',
    surface: 'review',
    control: 'window-review',
    does: 'Friday at three, in the room with the blind that does not go all '
      + 'the way down.',
    window: { routes: ['start-menu', 'day'] },
    run: 'week',
  },
  {
    id: 'review.pending',
    surface: 'review',
    control: 'start-menu-item-review',
    does: 'Opened before Friday, it says nothing has been decided and what '
      + 'decides it.',
    scene: 'review.pending',
    run: 'week',
  },
  {
    id: 'review.file-read',
    surface: 'review',
    control: 'review-conduct',
    does: 'Somebody opens the file a minute before the conversation, and the '
      + 'reason the bar is what it is gets printed beside the verdict.',
    actions: [DAY_ACTIONS.reviewFileRead],
    run: 'week',
  },
  {
    id: 'review.passed',
    surface: 'review',
    control: 'review-line, review-dismiss',
    does: 'The week is fine. Not brilliant. Fine.',
    actions: [DAY_ACTIONS.reviewPassed],
    scene: 'review.passed',
    run: 'week',
  },
  {
    id: 'review.fired',
    surface: 'review',
    control: 'review-line, review-note',
    does: 'It is not working out, and there are still two hours on the shift.',
    actions: [DAY_ACTIONS.reviewFired],
    scene: 'review.fired',
    run: 'fired',
    why: 'A week cannot end both ways.',
  },

  /* -- the fridge --------------------------------------------------------- */
  {
    id: 'beer.window',
    surface: 'beer',
    control: 'window-beer',
    does: 'The fridge, which has been a tooltip since Monday.',
    window: { routes: ['start-menu', 'day'] },
    run: 'week',
  },
  {
    id: 'beer.locked-refusal',
    surface: 'beer',
    control: 'beer-open (during probation)',
    does: 'Refuses the bottle with the sentence the lock has always carried.',
    run: 'week',
  },
  {
    id: 'beer.open',
    surface: 'beer',
    control: 'beer-open',
    does: 'Opens it, at last, and takes most of a week off the stress meter.',
    actions: [DAY_ACTIONS.consumableBeer],
    scene: 'beer.sealed',
    run: 'week',
  },
  {
    id: 'beer.aftermath',
    surface: 'beer',
    control: 'beer-open (again)',
    does: 'The second half of the scene, and a bottle on the desk with the '
      + 'cans.',
    scene: 'beer.opened',
    run: 'week',
  },

  /* -- the ticket queue --------------------------------------------------- */
  {
    id: 'tickets.window',
    surface: 'tickets',
    control: 'window-tickets',
    does: 'The queue, sorted by what is still alive and what is due first.',
    window: { routes: ['start-menu', 'desktop-icon', 'link'] },
    run: 'week',
  },
  {
    id: 'tickets.select',
    surface: 'tickets',
    control: 'ticket-row-<ticket>',
    does: 'Opens a ticket: who reported it, what they said, and both clocks.',
    run: 'week',
  },
  {
    id: 'tickets.clocks',
    surface: 'tickets',
    control: 'ticket-detail-response, ticket-detail-resolution',
    does: 'The clock for the reporter and the clock for the problem, counting '
      + 'down in desk minutes; the first thing done to a ticket stops one.',
    actions: [HELPDESK_ACTIONS.ticketRecordResponse],
    run: 'week',
  },
  {
    id: 'tickets.streams',
    surface: 'tickets',
    control: 'ticket-worknotes, ticket-comments',
    does: 'Keeps what you worked out and what was put to the reporter in two '
      + 'streams that are not the same stream.',
    run: 'week',
  },
  {
    id: 'tickets.triage-pickers',
    surface: 'tickets',
    control: 'triage-impact, triage-urgency, triage-outcome',
    does: 'Reads the estate in two dropdowns and shows what the matrix makes '
      + 'of them before anything is filed.',
    run: 'week',
  },
  {
    id: 'tickets.triage-file',
    surface: 'tickets',
    control: 'triage-file',
    does: 'Files the triage, which moves the deadline the ticket is held to.',
    actions: [HELPDESK_ACTIONS.ticketClassify],
    run: 'week',
  },
  {
    id: 'tickets.triage-refused',
    surface: 'tickets',
    control: 'triage-file (parked, closed or breached)',
    does: 'Refuses a triage the world would not take, in the same words.',
    run: 'week',
  },
  {
    id: 'tickets.waiting-refused',
    surface: 'tickets',
    control: 'ticket-waiting-toggle (nobody asked)',
    does: 'Refuses to stop the reporter\'s clock until they have actually '
      + 'been asked something.',
    run: 'week',
  },
  {
    id: 'tickets.waiting-toggle',
    surface: 'tickets',
    control: 'ticket-waiting-toggle',
    does: 'Parks a ticket on the user, and takes it back off hold.',
    actions: [
      HELPDESK_ACTIONS.ticketSetWaiting,
      HELPDESK_ACTIONS.ticketClearWaiting,
    ],
    run: 'week',
  },
  {
    id: 'tickets.escalate-form',
    surface: 'tickets',
    control: 'ticket-escalate',
    does: 'Opens the handoff form, with what you tried already filled in from '
      + 'what you actually did.',
    actions: [HELPDESK_ACTIONS.ticketRecordTouch],
    run: 'week',
  },
  {
    id: 'tickets.handoff-cancel',
    surface: 'tickets',
    control: 'handoff-cancel',
    does: 'Closes the form again without sending anything.',
    run: 'week',
  },
  {
    id: 'tickets.handoff-thin',
    surface: 'tickets',
    control: 'handoff-send (with nothing in it)',
    does: 'Sends a thin handoff, which second line return with a note, a mail '
      + 'and a bill.',
    actions: [
      HELPDESK_ACTIONS.ticketEscalate,
      HELPDESK_ACTIONS.ticketBounceHandoff,
    ],
    run: 'week',
  },
  {
    id: 'tickets.handoff-complete',
    surface: 'tickets',
    control: 'handoff-reported, handoff-send',
    does: 'Sends one second line will keep, and the ticket goes with it.',
    actions: [HELPDESK_ACTIONS.ticketEscalate],
    run: 'week',
  },
  {
    id: 'tickets.escalate-refused',
    surface: 'tickets',
    control: 'ticket-escalate (fixable from your desk, or closed)',
    does: 'Says which tickets do not earn a van - the ones fixable from your '
      + 'own desk, and the ones that are already shut.',
    run: 'week',
  },
  {
    id: 'tickets.article-link',
    surface: 'tickets',
    control: 'ticket-article-picker, ticket-link-article',
    does: 'Puts the article that was actually used on the ticket, as a '
      + 'reference and as a work note.',
    actions: [HELPDESK_ACTIONS.ticketLinkArticle],
    run: 'week',
  },
  {
    id: 'tickets.article-refused',
    surface: 'tickets',
    control: 'ticket-link-article (same article twice)',
    does: 'Refuses to link what is already linked, before the click.',
    run: 'week',
  },
  {
    id: 'tickets.pick-duplicate',
    surface: 'tickets',
    control: 'ticket-pick-<ticket>',
    does: 'Ticks a report as a duplicate of something, without doing anything '
      + 'to it yet.',
    run: 'week',
  },
  {
    id: 'tickets.link-parent',
    surface: 'tickets',
    control: 'ticket-link-parent',
    does: 'Attaches the ticked reports to the incident they are copies of; '
      + 'they close when its fault does.',
    actions: [
      HELPDESK_ACTIONS.ticketLinkToParent,
      HELPDESK_ACTIONS.ticketResolveWithParent,
    ],
    run: 'week',
  },
  {
    id: 'tickets.link-parent-refused',
    surface: 'tickets',
    control: 'ticket-link-parent (nobody\'s duplicate)',
    does: 'Refuses a bulk close dressed up as filing, in a sentence.',
    run: 'week',
  },
  {
    id: 'tickets.open-chat',
    surface: 'tickets',
    control: 'ticket-open-chat',
    does: 'Opens the conversation with THIS ticket\'s reporter.',
    run: 'week',
  },
  {
    id: 'tickets.open-remote',
    surface: 'tickets',
    control: 'ticket-open-remote',
    does: 'Takes over the reporter\'s screen from the ticket.',
    run: 'week',
  },
  {
    id: 'tickets.open-events',
    surface: 'tickets',
    control: 'ticket-open-events',
    does: 'Opens the reporter\'s machine log from the ticket.',
    run: 'week',
  },
  {
    id: 'tickets.open-kb',
    surface: 'tickets',
    control: 'ticket-open-kb',
    does: 'Opens the article this ticket is filed under, or the one that was '
      + 'linked to it.',
    run: 'week',
  },
  {
    id: 'tickets.link-refused',
    surface: 'tickets',
    control: 'ticket-open-remote (no workstation)',
    does: 'A cross-app link with nowhere to go says where to look instead.',
    run: 'week',
  },

  /* -- Active Dictionary -------------------------------------------------- */
  {
    id: 'directory.window',
    surface: 'directory',
    control: 'window-directory',
    does: 'The directory, and what is actually wrong with an account.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'week',
  },
  {
    id: 'directory.search',
    surface: 'directory',
    control: 'directory-search',
    does: 'Filters the list by name or username, and keeps the keyboard.',
    run: 'week',
  },
  {
    id: 'directory.select',
    surface: 'directory',
    control: 'directory-row-<account>',
    does: 'Opens the lockout trail: bad passwords, when the door shut, and '
      + 'whether anybody has used it.',
    run: 'week',
  },
  {
    id: 'directory.empty',
    surface: 'directory',
    control: 'directory-empty',
    does: 'Says nobody matches rather than aiming live buttons at somebody '
      + 'the player cannot see.',
    run: 'week',
  },
  {
    id: 'directory.unlock',
    surface: 'directory',
    control: 'directory-unlock',
    does: 'Clears a lockout, which closes the ticket about it by itself.',
    actions: [HELPDESK_ACTIONS.accountUnlock],
    run: 'week',
  },
  {
    id: 'directory.unlock-refused',
    surface: 'directory',
    control: 'directory-unlock, directory-enable (wrong fault)',
    does: 'Says which of the three faults this is by refusing the other two.',
    run: 'week',
  },
  {
    id: 'directory.reset-password',
    surface: 'directory',
    control: 'directory-reset-password',
    does: 'Issues a temporary password, and says on the button that it clears '
      + 'the lockout and forces a change as well - three things one button '
      + 'does here and a real reset dialog asks about.',
    actions: [HELPDESK_ACTIONS.accountResetPassword],
    run: 'week',
  },
  {
    id: 'directory.enable',
    surface: 'directory',
    control: 'directory-enable',
    does: 'Puts back an account somebody switched off on purpose, with your '
      + 'name in the log next to it.',
    actions: [HELPDESK_ACTIONS.accountEnable],
    run: 'fired',
    why: 'The only disabled account is the leaver whose seat Wednesday\'s '
      + 'ticket is about; enabling him is not a thing to do to a week that is '
      + 'being worked properly.',
  },
  {
    id: 'directory.add-group',
    surface: 'directory',
    control: 'directory-group-picker, directory-add-group',
    does: 'Adds a membership, which applies at next logon.',
    actions: [HELPDESK_ACTIONS.accountAddToGroup],
    run: 'week',
  },
  {
    id: 'directory.remove-group',
    surface: 'directory',
    control: 'directory-remove-group',
    does: 'Takes one away, which somebody notices in about a week.',
    actions: [HELPDESK_ACTIONS.accountRemoveFromGroup],
    run: 'week',
  },

  /* -- Remote Assist ------------------------------------------------------ */
  {
    id: 'remote.window',
    surface: 'remote',
    control: 'window-remote',
    does: 'Somebody else\'s screen, drawn from their machine\'s own state.',
    window: { routes: ['start-menu', 'desktop-icon', 'link'] },
    run: 'week',
  },
  {
    id: 'remote.select',
    surface: 'remote',
    control: 'remote-machine-<machine>',
    does: 'Connects to a workstation and shows what is on it.',
    run: 'week',
  },
  {
    id: 'remote.screen',
    surface: 'remote',
    control: 'remote-viewport',
    does: 'Turns the remote desktop the way the rotation field says, in front '
      + 'of the player rather than in a number.',
    run: 'week',
  },
  {
    id: 'remote.tray-clock',
    surface: 'remote',
    control: 'remote-tray',
    does: 'Their taskbar clock, which moves with the minute while the pane '
      + 'around it stands still.',
    run: 'week',
  },
  {
    id: 'remote.rotate',
    surface: 'remote',
    control: 'remote-rotation-picker, remote-apply-rotation',
    does: 'Puts a display back the way a human can read it.',
    actions: [HELPDESK_ACTIONS.machineSetDisplayRotation],
    run: 'week',
  },
  {
    id: 'remote.rotate-refused',
    surface: 'remote',
    control: 'remote-apply-rotation (same angle)',
    does: 'Refuses to set a screen to the angle it is already at.',
    run: 'week',
  },
  {
    id: 'remote.reboot',
    surface: 'remote',
    control: 'remote-reboot',
    does: 'Reboots the machine, which is a thing you tried and the form '
      + 'remembers.',
    actions: [HELPDESK_ACTIONS.machineReboot],
    run: 'week',
  },
  {
    id: 'remote.services',
    surface: 'remote',
    control: 'remote-services, remote-services-count',
    does: 'The services on somebody else\'s box, in the columns a services '
      + 'list has: name, status and the startup type that says whether a '
      + 'stopped one is a fault or a Tuesday.',
    run: 'week',
  },
  {
    id: 'remote.programs',
    surface: 'remote',
    control: 'remote-program-<app>',
    does: 'What is open on the player\'s own box, in its taskbar, which is '
      + 'the boss\'s-eye view of the slack mechanic.',
    run: 'week',
  },
  {
    id: 'remote.restart-service',
    surface: 'remote',
    control: 'remote-restart-<service>',
    does: 'Restarts a wedged service from the taskbar of the box it is on.',
    actions: [HELPDESK_ACTIONS.serviceRestart],
    run: 'week',
  },
  {
    id: 'remote.restart-refused',
    surface: 'remote',
    control: 'remote-restart-<service> (running, jammed, disabled, hardware '
      + 'or the manager\'s own)',
    does: 'Five different reasons a restart is the wrong move, said before '
      + 'the click and in the words the world would refuse it in.',
    run: 'week',
  },
  {
    id: 'remote.clear-queue',
    surface: 'remote',
    control: 'remote-clear-<printer>',
    does: 'Stops the spooler that owns the spool files and empties the print '
      + 'queue in the same breath, leaving the service stopped for the '
      + 'restart that is step three.',
    actions: [HELPDESK_ACTIONS.printerClearQueue],
    run: 'week',
  },
  {
    id: 'remote.clear-queue-refused',
    surface: 'remote',
    control: 'remote-clear-<printer> (empty)',
    does: 'Says there is nothing left to drop.',
    run: 'week',
  },
  {
    id: 'remote.replace-battery',
    surface: 'remote',
    control: 'remote-replace-battery-<device>',
    does: 'Puts fresh batteries in the thing that was never frozen.',
    actions: [HELPDESK_ACTIONS.deviceReplaceBattery],
    run: 'week',
  },
  {
    id: 'remote.battery-refused',
    surface: 'remote',
    control: 'remote-replace-battery-<device> (fresh)',
    does: 'Refuses to spend the cupboard budget twice.',
    run: 'week',
  },
  {
    id: 'remote.power-cycle',
    surface: 'remote',
    control: 'remote-power-<device>',
    does: 'Off, then on, which works far more often than anybody likes.',
    actions: [HELPDESK_ACTIONS.devicePowerCycle],
    run: 'week',
  },
  {
    id: 'remote.power-refused',
    surface: 'remote',
    control: 'remote-power-<device> (behaving itself)',
    does: 'Calls a power cycle superstition when the thing is already on.',
    run: 'week',
  },

  /* -- Event Viewer ------------------------------------------------------- */
  {
    id: 'events.window',
    surface: 'events',
    control: 'window-events',
    does: 'What every box wrote down while somebody was describing it to you '
      + 'over the phone.',
    window: { routes: ['start-menu', 'desktop-icon', 'link'] },
    run: 'week',
  },
  {
    id: 'events.select',
    surface: 'events',
    control: 'events-machine-<machine>',
    does: 'Reads one machine\'s log, worst level flagged on the row.',
    run: 'week',
  },
  {
    id: 'events.filter',
    surface: 'events',
    control: 'events-filter',
    does: 'Filters the log by level, which is how a pattern is found.',
    run: 'week',
  },
  {
    id: 'events.empty',
    surface: 'events',
    control: 'events-log-empty',
    does: 'Says plainly when a box has nothing to report, or nothing at that '
      + 'level.',
    run: 'week',
  },
  {
    id: 'events.history',
    surface: 'events',
    control: 'events-table (days before)',
    does: 'Still holds the days already worked, which is what turns two '
      + 'outages into a timetable.',
    run: 'week',
  },

  /* -- Chat --------------------------------------------------------------- */
  {
    id: 'chat.window',
    surface: 'chat',
    control: 'window-chat',
    does: 'The only tool that talks to the person instead of the machine.',
    window: { routes: ['start-menu', 'desktop-icon', 'link'] },
    run: 'week',
  },
  {
    id: 'chat.select',
    surface: 'chat',
    control: 'chat-person-<person>',
    does: 'Picks somebody, and flags the ones with something open.',
    run: 'week',
  },
  {
    id: 'chat.open-tickets',
    surface: 'chat',
    control: 'chat-open-tickets',
    does: 'Opens the queue at the conversation\'s own ticket.',
    run: 'week',
  },
  {
    id: 'chat.option-plain',
    surface: 'chat',
    control: 'chat-option-<n> (no effect)',
    does: 'Moves the conversation and learns nothing, which is most of them.',
    run: 'week',
  },
  {
    id: 'chat.option-ask',
    surface: 'chat',
    control: 'chat-option-<n> (a question)',
    does: 'Puts the question to the reporter where they can see it, which is '
      + 'what buys the right to stop their clock.',
    actions: [HELPDESK_ACTIONS.ticketAddComment],
    run: 'week',
  },
  {
    id: 'chat.option-reveal',
    surface: 'chat',
    control: 'chat-option-<n> (the right question)',
    does: 'Gets the truth out of them and files it on the ticket.',
    actions: [HELPDESK_ACTIONS.ticketAddWorknote],
    run: 'week',
  },
  {
    id: 'chat.option-refused',
    surface: 'chat',
    control: 'chat-option-<n> (asked twice)',
    does: 'Explains why the same question does not go on the ticket twice, '
      + 'and carries on talking anyway.',
    run: 'week',
  },
  {
    id: 'chat.option-dispatch',
    surface: 'chat',
    control: 'chat-option-<n> (walk them through it)',
    does: 'Fixes the world from inside the conversation, while they are still '
      + 'talking.',
    actions: [HELPDESK_ACTIONS.machineSetDisplayRotation],
    run: 'week',
  },
  {
    id: 'chat.option-sticky',
    surface: 'chat',
    control: 'chat-option-<n> (Facilities)',
    does: 'Gets a note put on the socket, which is the only fix in this game '
      + 'that happens in a corridor.',
    actions: [HELPDESK_ACTIONS.facilitiesStickyNote],
    run: 'week',
  },
  {
    id: 'chat.option-reply',
    surface: 'chat',
    control: 'chat-option-<n> (write back)',
    does: 'Says something to the man who reported the phish, on the ticket, '
      + 'where the next hundred of those depend on it.',
    actions: [HELPDESK_ACTIONS.ticketReplyToReporter],
    run: 'week',
  },
  {
    id: 'chat.reaction',
    surface: 'chat',
    control: 'chat-transcript (after a fix)',
    does: 'Moves the thread onto what they say once their problem has stopped '
      + 'existing.',
    run: 'week',
  },
  {
    id: 'chat.restart',
    surface: 'chat',
    control: 'chat-restart',
    does: 'Brings it up again once a conversation has ended.',
    run: 'week',
  },
  {
    id: 'chat.boss-ping',
    surface: 'chat',
    control: 'chat-person-desmond (unasked)',
    does: 'The lead raises a concern in the thread he has always used, and it '
      + 'becomes a ticket because you made it one.',
    actions: [DAY_ACTIONS.bossPing],
    run: 'week',
  },
  {
    id: 'chat.direct-message',
    surface: 'chat',
    control: 'chat-person-terry (unasked)',
    does: 'Somebody would rather message you than use the form; both answers '
      + 'are legitimate and this is the one that leaves a record.',
    run: 'week',
  },
  {
    id: 'chat.option-favour',
    surface: 'chat',
    control: 'chat-option-<n> (do it quietly)',
    does: 'Does the favour off the books, so the work happened and the week '
      + 'has no record that it did.',
    actions: [HELPDESK_ACTIONS.accountResetPassword],
    run: 'fired',
    why: 'The other answer to the same message is the one the week takes, and '
      + 'a message is only sent once.',
  },
  {
    id: 'chat.option-phish',
    surface: 'chat',
    control: 'chat-option-<n> (open the link yourself)',
    does: 'Clicks the link he was told not to click, and pays for it in '
      + 'stress and in what everybody saw.',
    actions: [HELPDESK_ACTIONS.securityFollowLink],
    run: 'fired',
    why: 'A full-screen security warning is not a thing to do to a week that '
      + 'is trying to pass.',
  },
  {
    id: 'chat.option-mfa',
    surface: 'chat',
    control: 'chat-option-<n> (enrol it now)',
    does: 'Enrols the new authenticator from the conversation on the strength '
      + 'of a payroll number and a manager\'s name, which is to say on the '
      + 'strength of nothing.',
    actions: [HELPDESK_ACTIONS.accountRegisterMfa, WORLD_ACTIONS.securityFallout],
    run: 'shortcut',
    why: 'The bill for skipping the check arrives the next morning, and a '
      + 'week cannot both skip it and not skip it.',
  },
  {
    id: 'chat.option-verify',
    surface: 'chat',
    control: 'chat-option-<n> (ring her back, or the June envelope)',
    does: 'Proves who is on the phone through a channel the account already '
      + 'had - which changes nothing anybody can see and everything about the '
      + 'next morning.',
    actions: [HELPDESK_ACTIONS.accountVerifyIdentity],
    run: 'checked',
    why: 'The other half of the same fork.',
  },

  /* -- Mail --------------------------------------------------------------- */
  {
    id: 'mail.window',
    surface: 'mail',
    control: 'window-mail',
    does: 'The inbox, which is where the company talks AT you.',
    window: { routes: ['start-menu', 'desktop-icon', 'link'] },
    run: 'week',
  },
  {
    id: 'mail.select',
    surface: 'mail',
    control: 'mail-row-<thread>',
    does: 'Opens a thread on the shift clock and marks it read.',
    run: 'week',
  },
  {
    id: 'mail.bounce',
    surface: 'mail',
    control: 'mail-row-handoff-bounce',
    does: 'The mail nobody would have written if the form had been filled in.',
    run: 'week',
  },
  {
    id: 'mail.incident',
    surface: 'mail',
    control: 'mail-row-security-incident',
    does: 'Somebody else\'s incident report, about your enrolment, a day '
      + 'later.',
    run: 'shortcut',
    why: 'It only exists in a week where nobody checked.',
  },

  /* -- the Support Terminal ----------------------------------------------- */
  {
    id: 'cmd.window',
    surface: 'cmd',
    control: 'window-cmd',
    does: 'The same verbs as the buttons, fewer mouse movements, considerably '
      + 'more credibility in the corridor.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'week',
  },
  {
    id: 'cmd.history',
    surface: 'cmd',
    control: 'cmd-input, ArrowUp / ArrowDown',
    does: 'Walks back through what was typed this session.',
    run: 'week',
  },
  {
    id: 'cmd.focus',
    surface: 'cmd',
    control: 'cmd-output (click)',
    does: 'Puts the caret back in the box, the way a terminal always has.',
    run: 'week',
  },
  {
    id: 'cmd.empty',
    surface: 'cmd',
    control: 'cmd-input (blank line)',
    does: 'Echoes the prompt and does nothing else.',
    run: 'week',
  },
  {
    id: 'cmd.unknown',
    surface: 'cmd',
    control: 'cmd-input (a command nobody has)',
    does: 'Guesses what was meant, or admits it cannot.',
    run: 'week',
  },
  {
    id: 'cmd.usage',
    surface: 'cmd',
    control: 'cmd-input (too few arguments)',
    does: 'Prints the usage line rather than a refusal from the world.',
    run: 'week',
  },
  {
    id: 'cmd.fumble',
    surface: 'cmd',
    control: 'cmd-input (over eighty stress)',
    does: 'Types what your hands did, says the correction out loud, and runs '
      + 'the line you actually typed.',
    run: 'fired',
    why: 'The shake needs a day gone badly enough to shake.',
  },
  {
    id: 'cmd.help',
    surface: 'cmd',
    control: 'help',
    does: 'Lists the commands this terminal admits to having.',
    command: 'help',
    run: 'week',
  },
  {
    id: 'cmd.ver',
    surface: 'cmd',
    control: 'ver',
    does: 'Prints the version. It is not reassuring.',
    command: 'ver',
    run: 'week',
  },
  {
    id: 'cmd.cls',
    surface: 'cmd',
    control: 'cls',
    does: 'Clears the screen. The tickets remain.',
    command: 'cls',
    run: 'week',
  },
  {
    id: 'cmd.ping',
    surface: 'cmd',
    control: 'ping <host>',
    does: 'Says a box answered, and says that this means nothing about what '
      + 'is running on it; refuses a name nobody answers to.',
    command: 'ping',
    run: 'week',
  },
  {
    id: 'cmd.ipconfig',
    surface: 'cmd',
    control: 'ipconfig [/all | /flushdns]',
    does: 'Prints the address, all of it, or the sentence everybody types '
      + 'that has never fixed anything; refuses a switch it does not have.',
    command: 'ipconfig',
    run: 'week',
  },
  {
    id: 'cmd.tracert',
    surface: 'cmd',
    control: 'tracert <host>',
    does: 'Follows the wire hop by hop through the one box everything goes '
      + 'through.',
    command: 'tracert',
    run: 'week',
  },
  {
    id: 'cmd.nslookup',
    surface: 'cmd',
    control: 'nslookup <name>',
    does: 'Resolves a name, and says that resolving is all it proves; says '
      + 'non-existent domain for the rest.',
    command: 'nslookup',
    run: 'week',
  },
  {
    id: 'cmd.whoami',
    surface: 'cmd',
    control: 'whoami [/groups]',
    does: 'Prints the account this session is actually running as, and what '
      + 'it is a member of.',
    command: 'whoami',
    run: 'week',
  },
  {
    id: 'cmd.systeminfo',
    surface: 'cmd',
    control: 'systeminfo [machine]',
    does: 'Prints what a machine is, what is on it, and how long it has been '
      + 'up.',
    command: 'systeminfo',
    run: 'week',
  },
  {
    id: 'cmd.users',
    surface: 'cmd',
    control: 'users <account>',
    does: 'Prints an account, its state and its groups; refuses a name the '
      + 'directory has never heard of.',
    command: 'users',
    run: 'week',
  },
  {
    id: 'cmd.net',
    surface: 'cmd',
    control: 'net user <account>',
    does: 'The same read, spelled the way the trade spells it, and a refusal '
      + 'that lists the one sub-command it has.',
    command: 'net',
    run: 'week',
  },
  {
    id: 'cmd.unlock',
    surface: 'cmd',
    control: 'unlock <account>',
    does: 'Clears a lockout from the terminal; refuses a name nobody has.',
    command: 'unlock',
    actions: [HELPDESK_ACTIONS.accountUnlock],
    run: 'week',
  },
  {
    id: 'cmd.resetpw',
    surface: 'cmd',
    control: 'resetpw <account>',
    does: 'Issues a temporary password and clears the lockout with it.',
    command: 'resetpw',
    actions: [HELPDESK_ACTIONS.accountResetPassword],
    run: 'week',
  },
  {
    id: 'cmd.verify',
    surface: 'cmd',
    control: 'verify <callback|code|inperson|contact> <account>',
    does: 'Records WHICH approved channel the identity was proved through, '
      + 'and refuses a channel the account does not have on file.',
    command: 'verify',
    actions: [HELPDESK_ACTIONS.accountVerifyIdentity],
    run: 'week',
  },
  {
    id: 'cmd.mfa',
    surface: 'cmd',
    control: 'mfa <account>',
    does: 'Enrols a new authenticator when the old one is gone.',
    command: 'mfa',
    actions: [HELPDESK_ACTIONS.accountRegisterMfa],
    run: 'week',
  },
  {
    id: 'cmd.revoke',
    surface: 'cmd',
    control: 'revoke <account>',
    does: 'Signs an account out of everything; refuses the wrong-flavour fix '
      + 'when there is no factor to revoke.',
    command: 'revoke',
    actions: [HELPDESK_ACTIONS.accountRevokeSessions],
    run: 'week',
  },
  {
    id: 'cmd.licence',
    surface: 'cmd',
    control: 'licence <take|give> <account>',
    does: 'Moves a seat between people, and refuses to give one out of an '
      + 'empty pool.',
    command: 'licence',
    actions: [
      HELPDESK_ACTIONS.accountRevokeLicence,
      HELPDESK_ACTIONS.accountAssignLicence,
    ],
    run: 'week',
  },
  {
    id: 'cmd.grant',
    surface: 'cmd',
    control: 'grant <account> <share>',
    does: 'Gives somebody access to a shared mailbox, which is not the same '
      + 'permission as being able to send from it.',
    command: 'grant',
    actions: [HELPDESK_ACTIONS.shareGrantAccess],
    run: 'week',
  },
  {
    id: 'cmd.forget',
    surface: 'cmd',
    control: 'forget <device>',
    does: 'Clears the password a device has been offering since the spring.',
    command: 'forget',
    actions: [HELPDESK_ACTIONS.deviceForgetCredentials],
    run: 'week',
  },
  {
    id: 'cmd.renewcert',
    surface: 'cmd',
    control: 'renewcert <service>',
    does: 'Issues a new certificate to the service forty people cannot reach.',
    command: 'renewcert',
    actions: [HELPDESK_ACTIONS.serviceRenewCertificate],
    run: 'week',
  },
  {
    id: 'cmd.rule',
    surface: 'cmd',
    control: 'rule on <mail rule>',
    does: 'Switches on a rule somebody wrote and never enabled, and refuses '
      + 'to switch one off, because that is a change with a form attached.',
    command: 'rule',
    actions: [HELPDESK_ACTIONS.mailRuleEnable],
    run: 'week',
  },
  {
    id: 'cmd.services',
    surface: 'cmd',
    control: 'services <machine>',
    does: 'Lists the twenty-odd services a box actually runs, with the status '
      + 'and the startup type of each - and, underneath, what reports a status '
      + 'and is not a service.',
    command: 'services',
    run: 'week',
  },
  {
    id: 'cmd.sc',
    surface: 'cmd',
    control: 'sc query <service>',
    does: 'Prints the service manager\'s own record of one service, and '
      + 'refuses the sub-commands this terminal does not have.',
    command: 'sc',
    run: 'week',
  },
  {
    id: 'cmd.tasklist',
    surface: 'cmd',
    control: 'tasklist',
    does: 'Lists what is running on this desk - the browser and the toy among '
      + 'them, while their windows are open - and refuses to ask another box.',
    command: 'tasklist',
    run: 'week',
  },
  {
    id: 'cmd.dir',
    surface: 'cmd',
    control: 'dir [path]',
    does: 'Lists a directory with the volume header, the dates, the sizes and '
      + 'the totals a real one prints - including the spool directory on the '
      + 'print server, which is the stuck queue as the files it is made of.',
    command: 'dir',
    run: 'week',
  },
  {
    id: 'cmd.cd',
    surface: 'cmd',
    control: 'cd [path]',
    does: 'Moves the terminal around the drive, prints where it is standing '
      + 'when it is asked nothing, and refuses a UNC path in the words the '
      + 'real one refuses it with.',
    command: 'cd',
    run: 'week',
  },
  {
    id: 'cmd.type',
    surface: 'cmd',
    control: 'type <file>',
    does: 'Prints a file: the runbook on this desk, the ini that explains a '
      + 'service nobody restored, and a machine log that is the same rows the '
      + 'Event Viewer shows.',
    command: 'type',
    run: 'week',
  },
  {
    id: 'cmd.tree',
    surface: 'cmd',
    control: 'tree [path] [/f]',
    does: 'Draws the directories under a path, the files as well with /f, and '
      + 'stops where somebody else\'s rights start.',
    command: 'tree',
    run: 'week',
  },
  {
    id: 'cmd.move',
    surface: 'cmd',
    control: 'move <file> <directory>',
    does: 'Puts a file back where the person who saved it thought they had, '
      + 'and refuses a move between two boxes, which is a copy over the '
      + 'network and a different job.',
    command: 'move',
    actions: [HELPDESK_ACTIONS.fileMove],
    run: 'week',
  },
  {
    id: 'cmd.purge',
    surface: 'cmd',
    control: 'purge <directory>',
    does: 'Empties a directory a program has been filling since 1997, and '
      + 'refuses every directory whose contents are the only copy of '
      + 'anything - which is the whole of the judgement in it.',
    command: 'purge',
    actions: [HELPDESK_ACTIONS.directoryPurge],
    run: 'week',
  },
  {
    id: 'cmd.restart',
    surface: 'cmd',
    control: 'restart <service>',
    does: 'Restarts a stopped service, and refuses a healthy one, a jammed '
      + 'one and a fan.',
    command: 'restart',
    actions: [HELPDESK_ACTIONS.serviceRestart],
    run: 'week',
  },
  {
    id: 'cmd.rotate',
    surface: 'cmd',
    control: 'rotate <machine> <0|90|180|270>',
    does: 'Puts a display back from the terminal, and refuses an angle no '
      + 'monitor stand recognises.',
    command: 'rotate',
    actions: [HELPDESK_ACTIONS.machineSetDisplayRotation],
    run: 'week',
  },
  {
    id: 'cmd.queue',
    surface: 'cmd',
    control: 'queue <printer>',
    does: 'Lists the jobs a printer is refusing to do - number, size and the '
      + 'minute each landed - and says what the spooler behind them reports.',
    command: 'queue',
    run: 'week',
  },
  {
    id: 'cmd.clearqueue',
    surface: 'cmd',
    control: 'clearqueue <printer>',
    does: 'Empties a print queue, and says so when there is nothing left in '
      + 'it - which is the path the walk drives, because the successful half '
      + 'of this verb is the button in Remote Assist and that is the surface '
      + 'a dead control would hide in.',
    command: 'clearqueue',
    run: 'week',
  },

  /* -- the Knowledge Base ------------------------------------------------- */
  {
    id: 'kb.window',
    surface: 'kb',
    control: 'window-kb',
    does: 'Articles written by people who had to fix it at the time.',
    window: { routes: ['start-menu', 'desktop-icon', 'link'] },
    run: 'week',
  },
  {
    id: 'kb.select',
    surface: 'kb',
    control: 'kb-row-<article>',
    does: 'Reads one: the symptom, where, the steps in order, and then why.',
    run: 'week',
  },
  {
    id: 'kb.see-also',
    surface: 'kb',
    control: 'kb-see-also-<article>',
    does: 'Follows a link out of an article, which is a link and not a '
      + 'decoration.',
    run: 'week',
  },
  {
    id: 'kb.draft',
    surface: 'kb',
    control: 'kb-row-vpn-on-the-print-server, kb-state',
    does: 'Flags the article nobody has checked, on the row and on the page.',
    run: 'week',
  },

  /* -- About This Workstation --------------------------------------------- */
  {
    id: 'about.window',
    surface: 'about',
    control: 'window-about',
    does: 'The About dialog: what this workstation is, what is in the case '
      + 'and who is logged on to it, every line read live off the world and '
      + 'not a ticket count anywhere on it.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'week',
  },
  {
    id: 'about.diagnostics',
    surface: 'about',
    control: 'about-run-diagnostics',
    does: 'Files a report and stamps the machine with when it ran.',
    actions: [DEMO_ACTIONS.diagnostics],
    run: 'week',
  },
  {
    id: 'about.reseat-fan',
    surface: 'about',
    control: 'about-reseat-fan',
    does: 'Percussive maintenance: the one thing in this game that is fixed '
      + 'by hitting it, and a refusal once it is running.',
    actions: [DEMO_ACTIONS.reseatFan],
    run: 'week',
  },
  {
    id: 'about.refresh',
    surface: 'about',
    control: 'about-refresh',
    does: 'Reads the whole page off the world again.',
    run: 'week',
  },
  {
    id: 'about.open-bubbles',
    surface: 'about',
    control: 'about-open-bubbles',
    does: 'Opens Bubble Break from inside a work app, exactly once.',
    run: 'week',
  },

  /* -- Update History ----------------------------------------------------- */
  {
    id: 'updates.window',
    surface: 'updates',
    control: 'window-updates',
    does: 'What the workstation installed overnight and what the notes claim '
      + 'it was for, readable again afterwards rather than once.',
    window: { routes: ['start-menu', 'desktop-icon', 'boot'] },
    run: 'week',
  },
  {
    id: 'updates.report',
    surface: 'updates',
    control: 'updates-report',
    does: 'Opens the form for telling the people who wrote the update that it '
      + 'is the thing that broke.',
    run: 'week',
  },
  {
    id: 'updates.installed',
    surface: 'updates',
    control: 'updates-installed (first boot of a newer build)',
    does: 'Puts the notes on screen unasked, once, on a workstation that '
      + 'remembers an older version - and never on one that does not.',
    run: 'deploy',
    why: 'A workstation with no history has not been updated, so the window '
      + 'needs a browser seeded with an older version and a reload.',
  },

  /* -- Report a Problem --------------------------------------------------- */
  {
    id: 'feedback.window',
    surface: 'feedback',
    control: 'window-feedback',
    does: 'A ticket about the game rather than about the estate, which is the '
      + 'only window in the building that is not in character.',
    window: { routes: ['start-menu', 'desktop-icon', 'link'] },
    run: 'week',
  },
  {
    id: 'feedback.context',
    surface: 'feedback',
    control: 'feedback-context, feedback-notice',
    does: 'Prints everything the report will carry besides the words, before '
      + 'it is sent, and says not to type anything personal.',
    run: 'week',
  },
  {
    id: 'feedback.empty-refusal',
    surface: 'feedback',
    control: 'feedback-send (with nothing in it)',
    does: 'Asks for a line saying what happened rather than filing a blank '
      + 'report against somebody\'s badge.',
    run: 'week',
  },
  {
    id: 'feedback.send',
    surface: 'feedback',
    control: 'feedback-summary, feedback-details, feedback-contact, '
      + 'feedback-send',
    does: 'Files the report, attaching the badge only if the box was ticked.',
    run: 'deploy',
    why: 'A report has to go somewhere, and the somewhere is a Worker with a '
      + 'tracker behind it.',
  },

  /* -- Bubble Break ------------------------------------------------------- */
  {
    id: 'bubbles.window',
    surface: 'bubbles',
    control: 'window-bubbles',
    does: 'A morale exercise with a panic key printed on it.',
    window: { routes: ['start-menu', 'desktop-icon', 'link'] },
    run: 'week',
  },
  {
    id: 'bubbles.catch',
    surface: 'bubbles',
    control: 'bubble-target',
    does: 'Catches bubbles, and says something about your quarterly metrics '
      + 'after five of them.',
    run: 'week',
  },
  {
    id: 'bubbles.reset',
    surface: 'bubbles',
    control: 'bubbles-reset',
    does: 'Puts the score back to nothing.',
    run: 'week',
  },
  {
    id: 'bubbles.initials',
    surface: 'bubbles',
    control: 'bubbles-initials',
    does: 'Three letters into a hall of fame that forgets you when the window '
      + 'closes.',
    run: 'week',
  },

  /* -- the Browser -------------------------------------------------------- */
  {
    id: 'browser.window',
    surface: 'browser',
    control: 'window-browser',
    does: 'Two bookmarks, no address bar, and no internet in here at all.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'week',
  },
  {
    id: 'browser.forum',
    surface: 'browser',
    control: 'browser-site-forum',
    does: 'Four hundred words about a lawnmower.',
    run: 'week',
  },
  {
    id: 'browser.gallery',
    surface: 'browser',
    control: 'browser-site-cats',
    does: 'The other site, and a visitor counter.',
    run: 'week',
  },
  {
    id: 'browser.bookmarks',
    surface: 'browser',
    control: 'browser-home-button',
    does: 'Back to the bookmarks, which is the whole of the navigation.',
    run: 'week',
  },
] as const satisfies readonly CoverageEntry[];

export type CoverageId = (typeof ENTRIES)[number]['id'];

export const COVERAGE: readonly CoverageEntry[] = ENTRIES;

/**
 * Registered verbs no control reaches, and what reaches them instead.
 *
 * Every one of these is dispatched by the day loop or by the world's own
 * timetable, so there is nothing for a player to click - but a registry entry
 * nobody can account for is exactly how a dead verb survives a review, which is
 * why they are written down here rather than quietly skipped. `coverage.test.ts`
 * refuses an id that is in both this table and the list above, and refuses one
 * that is in neither.
 */
export const ACTIONS_WITHOUT_A_CONTROL: Readonly<Record<string, string>> = {
  [DAY_ACTIONS.endShift]: 'Seventeen hundred, dispatched by the day loop '
    + 'whether or not the queue is empty. Nobody presses it; the scorecard is '
    + 'what the player sees of it.',
  [DAY_ACTIONS.slaClockRun]: 'The service clock, started by the day loop when '
    + 'somebody is at the desk.',
  [DAY_ACTIONS.slaClockHold]: 'And stopped by it the moment nobody is.',
  [DAY_ACTIONS.metersTick]: 'One interval of pressure, every five minutes of '
    + 'a shift, from the driver.',
  [DAY_ACTIONS.weekReading]: 'The week as a percentage of its own work, '
    + 'written down at each day end and once more at three on the Friday.',
  [HELPDESK_ACTIONS.machineRecordEvent]: 'The event watcher writing a '
    + 'machine\'s own history as it happens; the player reads it in the Event '
    + 'Viewer.',
  [WORLD_ACTIONS.powerCut]: 'A cleaner\'s trolley wanting a socket at four '
    + 'minutes to five. The player meets it as the next morning\'s ticket.',
  [WORLD_ACTIONS.serviceStopped]: 'An announced maintenance window opening on '
    + 'top of a service somebody was using.',
  [WORLD_ACTIONS.staleLogon]: 'A tablet in a cupboard offering a password '
    + 'that was changed in the spring, every five minutes.',
  [DAY_ACTIONS.reviewMatrixRead]: 'Somebody scoring the selection pool in the '
    + 'minute before the conversation, in a week where a round is being '
    + 'decided. The day loop dispatches it; the player has been reading the '
    + 'same matrix on the review window and the evening scorecard for three '
    + 'weeks. It cannot happen in the probation week, which is the only week '
    + 'the shipped game deals - the pacing rules forbid it.',
  [DAY_ACTIONS.interruptionArrived]: 'The phone ringing, which is charged '
    + 'before anybody has decided anything about it. Nobody presses it and '
    + 'nobody can: it is the day loop settling the minute the schedule says '
    + 'an interruption starts on, and what the player does about it is the '
    + 'three verbs above.',
  [DAY_ACTIONS.interruptionRefocus]: 'The screen coming back, and the '
    + 'twenty-three minutes starting from there. The day loop dispatches it on '
    + 'the far side of every conversation that was not about the work in hand; '
    + 'the player meets it as the chip on the taskbar and as a keyboard that '
    + 'is briefly worse than it was.',
  [DAY_ACTIONS.interruptionMissed]: 'A phone that rang out. Nobody pressed '
    + 'anything - that is what it records - so there is nothing for a control '
    + 'to be: the day loop settles it at the minute the ringing stops, and '
    + 'what the player sees is a notice and a shorter version of the same '
    + 'debuff.',
  [DAY_ACTIONS.presenceSet]: 'The dot, set from the tray. The world half of '
    + 'it ships in this slice and the three-state control that reaches it is '
    + 'the tray\'s, which lands with the other half: until it does, the only '
    + 'thing that dispatches this is `DayApi.setPresence`, which the tray is '
    + 'the one caller of. It moves into the table above with the control.',
  [DAY_ACTIONS.interruptionDodged]: 'A declinable call sliding past a red dot '
    + 'instead of ringing. Nobody presses it and nobody can - that is the '
    + 'whole mechanic: the day loop settles it in the minute the phone would '
    + 'have rung, and what the player sees is a phone that did not.',
  [WORLD_ACTIONS.presenceNoticed]: 'Somebody who has been waiting for a first '
    + 'word noticing that the desk they are waiting on says Away and has just '
    + 'done demonstrable work on somebody else\'s ticket. Once per person per '
    + 'day, dispatched by the driver off the dispatch that gave it away.',
  [DAY_ACTIONS.meetingRecap]: 'The room emptying, which is what the recap '
    + 'mail is stamped from. Dispatched by the day loop at the end of a block '
    + 'nobody chose to be in; the player meets it as a thread in the inbox '
    + 'with the whole meeting in it.',
  [DAY_ACTIONS.reviewRedundant]: 'The third ending, dispatched by the day loop '
    + 'when the week cleared its bar and the ranking still put two other '
    + 'people above the line. Career-layer: it belongs to a week of the '
    + 'employer arc that the probation week is not, and the walk that drives '
    + 'it is `scripted-arc.test.ts` rather than a browser.',
};

/**
 * Scenes the shipped content cannot put on the screen, and why they exist.
 *
 * Two entries. The first is a guard rather than content: a save can name a
 * slack app this build no longer installs, and a blank window with a manager
 * in it would be worse than a general-purpose telling-off.
 *
 * The second is a whole layer, and it is here rather than in the walk because
 * of a rule rather than an omission - which is the distinction this table
 * exists to record.
 */
export const SCENES_WITHOUT_A_ROUTE: Readonly<Record<string, string>> = {
  'caught.unknown': 'The fallback telling-off for an app nobody wrote a scene '
    + 'for, which the loader makes unreachable for anything this build ships.',
  'review.redundant': 'The redundancy conversation, which cannot happen in the '
    + 'probation week: the pacing rules put the first systemic event no '
    + 'earlier than the fourth week of an employer arc, and the shipped game '
    + 'deals week one. It is driven end to end through the real driver and '
    + 'the real engine in `scripted-arc.test.ts`, on the week of the arc it '
    + 'belongs to, and it is unreachable on the artifact until there is a '
    + 'week two to reach it from.',
};

/**
 * Every control a player can touch, by the test id it wears.
 *
 * The second half of the completeness gate, and the half that was missing. The
 * manifest above lists FUNCTIONS and the walk drives them; both gates argued
 * about the same list, so a UI-only control - a filter, a navigation button, a
 * toggle that reaches no new action, command, app or scene - could be added,
 * left out of `COVERAGE`, and pass both. Nothing anywhere knew it existed.
 *
 * So the walk enumerates the controls it actually SEES on the built artifact -
 * every button, select, input and textarea that carries a test id, gathered as
 * the DOM produces them - and diffs that against this list. A control nobody
 * wrote down here goes red on the served half of the gate, named.
 *
 * A trailing `*` is a family: one entry per row, per app, per service, per
 * window. The id up to the star is what identifies the control; what comes
 * after it is which of them this is.
 */
export const PLAYER_CONTROLS: readonly string[] = Object.freeze([
  /* -- boot and login ----------------------------------------------------- */
  'login-password',
  'login-badge',
  'login-issue-badge',
  'login-submit',
  'login-restart',

  /* -- the desktop, the taskbar and the start menu ------------------------ */
  'desktop-icon-*',
  'start-button',
  'start-menu-item-*',
  'start-menu-save',
  'start-menu-load',
  'start-menu-log-off',
  'start-menu-restart',
  'taskbar-button-*',
  'day-state',
  'day-pause',
  'day-speed-*',
  'notification-tray',
  'toast-dismiss',

  /* -- window chrome ------------------------------------------------------ */
  'minimize-*',
  'close-*',

  /* -- the desk ----------------------------------------------------------- */
  'desk-drink',
  'desk-tidy',
  'desk-beer',

  /* -- the queue ---------------------------------------------------------- */
  'ticket-row-*',
  'ticket-pick-*',
  'ticket-open-chat',
  'ticket-open-kb',
  'ticket-open-remote',
  'ticket-open-events',
  'ticket-article-picker',
  'ticket-link-article',
  'ticket-link-parent',
  'ticket-waiting-toggle',
  'ticket-escalate',
  'triage-impact',
  'triage-urgency',
  'triage-file',
  'handoff-reported',
  'handoff-send',
  'handoff-cancel',

  /* -- the other tools ---------------------------------------------------- */
  'directory-search',
  'directory-row-*',
  'directory-unlock',
  'directory-reset-password',
  'directory-enable',
  'directory-group-picker',
  'directory-add-group',
  'directory-remove-group',
  'remote-machine-*',
  'remote-rotation-picker',
  'remote-apply-rotation',
  'remote-reboot',
  'remote-restart-*',
  'remote-clear-*',
  'remote-power-*',
  'remote-replace-battery-*',
  'events-machine-*',
  'events-filter',
  'cmd-input',
  'kb-row-*',
  'kb-see-also-*',
  'mail-row-*',
  'chat-person-*',
  'chat-option-*',
  'chat-restart',
  'chat-open-tickets',
  'browser-site-*',
  'browser-home-button',
  'about-run-diagnostics',
  'about-reseat-fan',
  'about-refresh',
  'about-open-bubbles',
  'bubbles-reset',
  'bubbles-initials',
  'bubble-target',
  'updates-report',
  'feedback-summary',
  'feedback-details',
  'feedback-contact',
  'feedback-send',

  /* -- the screens the day puts up ---------------------------------------- */
  'brief-start-shift',
  'brief-open-tickets',
  'brief-open-mail',
  'scorecard-clock-off',
  'caught-dismiss',
  'call-answer',
  'call-defer',
  'call-decline',
  'call-option-*',
  'meeting-defer',
  'meeting-decline',
  'reboot-postpone',
  'reboot-restart-now',
  'review-dismiss',
  'beer-open',
  'weekend-onward',
]);

/**
 * Whether a test id seen on screen is a control somebody wrote down.
 *
 * Families match on the part before the star, which is the half that names the
 * control; a new `remote-restart-<something>` is the same control aimed at a
 * different service, and a new `remote-throttle-<something>` is not.
 */
export function isDeclaredControl(testid: string): boolean {
  return PLAYER_CONTROLS.some((declared) => (
    declared.endsWith('*')
      ? testid.startsWith(declared.slice(0, -1))
      : testid === declared
  ));
}

/** Every entry, by id. Throws rather than returning nothing: an unknown id in
 * the walk is a walk that is lying about what it covered. */
export function coverageEntry(id: string): CoverageEntry {
  const found = COVERAGE.find((entry) => entry.id === id);

  if (found === undefined) {
    throw new Error(`"${id}" is not a coverage entry.`);
  }

  return found;
}

/** The entries one run of the total walk is answerable for. */
export function coverageFor(run: WalkRunId): readonly CoverageEntry[] {
  return COVERAGE.filter((entry) => entry.run === run);
}
