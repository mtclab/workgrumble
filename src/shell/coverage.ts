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
  APT_ACTIONS,
  AUDIT_ACTIONS,
  CAREER_ACTIONS,
  CHANGE_ACTIONS,
  DAY_ACTIONS,
  FS_ACTIONS,
  HELPDESK_ACTIONS,
  INCIDENT_ACTIONS,
  INVOICE_ACTIONS,
  PROJECT_ACTIONS,
  REQUEST_ACTIONS,
  SELINUX_ACTIONS,
  SOFTWARE_ACTIONS,
  SYSTEMD_ACTIONS,
  TIMESHEET_ACTIONS,
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
  store: 'The web store, and the class of thing the other four runs never do: '
    + 'install a program against a locked-down policy, play it for the relief, '
    + 'be caught at it and be asked about the install log, take it back off, '
    + 'and reload to find the install set exactly where it was. It is its own '
    + 'run because the golden weeks install nothing - that is what keeps them '
    + 'byte-identical - so the one walk that installs is kept out of them.',
  deploy: 'The tester build with its Worker behind it: the link that lets '
    + 'somebody in, the badge that is the whole of an account, a week that '
    + 'follows the badge to a browser that has never seen it, the form for '
    + 'saying the game is broken, and the update window on a workstation that '
    + 'remembers an older build.',
  switch: 'The offer taken: pass the probation, accept the job at the second '
    + 'employer, and arrive on a Monday with the standing and the fund carried '
    + 'across. Its own run because accepting reloads the page into a different '
    + 'world - the week and fired runs verify the offer is there without taking '
    + 'it, and this is the single walk that crosses the threshold.',
  sysadmin: 'The promotion crossed and the fixes (E6): at the MSP, with the '
    + 'standing built, read the earned offer and accept it (which raises the '
    + 'downed-portal incident and the characteristic ones), ssh to the MSP\'s own '
    + 'Linux server (the fingerprint and the known_hosts it writes), and work it '
    + 'in the unix dialect - journalctl for the why, df/du/ps/ip and ls -la, '
    + 'systemctl status (failed) then restart (silent) then status (running), the '
    + 'payoff walked end to end - plus the scope wall proven still up on a '
    + 'customer\'s server. And the 0.19.0 incidents on the same box: df -h and du '
    + 'find the runaway journal and journalctl --vacuum-size frees it; curl -I and '
    + 'certbot renew clear an expired certificate; a failed deploy is rolled back '
    + 'and closed by the blameless postmortem. Its own run because a service-desk '
    + 'week cannot hold the engineer tier: ssh is refused until the promotion '
    + 'fires, so the whole server surface lives on the far side of a threshold no '
    + 'probation week reaches.',
  senior: 'The SECOND QUEUE (E9, 0.36.0): hired as a Senior Service Desk '
    + 'Analyst rather than a probationer, which opens a rung the other runs '
    + 'cannot reach - one start select writes one desk, and a probation week '
    + 'is not a senior\'s week. It walks the whole of what the rung is: the '
    + 'audit tab beside your own queue, a filing agreed with, a filing '
    + 'corrected through the queue\'s own triage form (which is what a '
    + 'correction IS at this grade), the article the second sighting of a '
    + 'class earns, and an escalation that does not take the ticket off your '
    + 'board. Its own run because every one of those needs a title no other '
    + 'walk wears.',
  selinux: 'The other way out of the SELinux denial (0.28.0): the same box, and '
    + 'setenforce 0 instead of the relabel. Its own run for the reason the '
    + 'shortcut/checked pair is two runs - one box cannot be fixed both ways, '
    + 'and the consequence of this one is a night away: the page is served in a '
    + 'keystroke, the machine stops enforcing anything, and the compliance sweep '
    + 'puts it in the inbox the next morning.',
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
  /**
   * The beige thing with the face on it. Its own surface rather than part of
   * the desk, because the desk is what the player owns and nobody chose this -
   * and because keeping it separate is what stops its controls being read as
   * fixes by the gate that keeps its lines useless.
   */
  'assistant',
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
    id: 'login.desk',
    surface: 'login',
    control: 'login-desk',
    does: 'Picks the desk you were hired onto - the whole ladder shown, the '
      + 'built rungs selectable, the unwritten ones saying so. Driven '
      + 'through the real log-on box by its own spec; the total walk logs '
      + 'on at the standard desk, which is this control at its default.',
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
    id: 'desktop.presence',
    surface: 'desktop',
    control: 'presence-available, presence-dnd, presence-away, presence-state',
    does: 'Sets the dot the whole office reads - available, do not disturb, '
      + 'away - one click per status, with the current one spelled out in '
      + 'words beside them so the suspicion drip is a trade rather than a '
      + 'trap. A status somebody in the building has an opinion about gets '
      + 'that opinion, once, in their own chat thread.',
    actions: [DAY_ACTIONS.presenceSet],
    run: 'week',
  },
  {
    id: 'desktop.presence-refused',
    surface: 'desktop',
    control: 'presence-refusal',
    does: 'Answers a status the world will not take - there is no shift on, so a '
      + 'dot set into a dark building tells nobody anything - in the sentence '
      + 'that refusal owns, against the button that was pressed rather than as a '
      + 'toast. (Under a takeover the control goes inert instead of popping this, '
      + 'which is F6.)',
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
    id: 'desktop.boss-panic',
    surface: 'desktop',
    control: 'boss-panic',
    does: 'The on-screen twin of the panic key: one tap minimizes every slack '
      + 'window at once, for the player on a phone with no key to press.',
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

  /* -- the helper the office bought --------------------------------------- */
  {
    id: 'assistant.speaks',
    surface: 'assistant',
    control: 'assistant-character, assistant-bubble',
    does: 'Says something about what is happening at the desk, on the event '
      + 'cadence, and is never once right about what to do - the lines are '
      + 'gated against every real fix in the game.',
    run: 'week',
  },
  {
    id: 'assistant.dismiss',
    surface: 'assistant',
    control: 'assistant-dismiss',
    does: 'Closes it, which it takes extremely well: it comes back on the '
      + 'next day or the next thing that happens to you, with an escalating '
      + 'note about having been closed.',
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
    id: 'brief.load-reading',
    surface: 'brief',
    control: 'brief-load',
    does: 'Reads how heavy today looks, in the shop\'s own voice and as a band '
      + 'rather than a figure - the day\'s committed minutes off the same '
      + 'arithmetic the roster gate prices weeks with, and a reading of the '
      + 'schedule only: nothing about the walk-ups, the pings or the rounds '
      + 'still to come.',
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
  {
    id: 'brief.after-hours',
    surface: 'brief',
    control: 'brief-night-answer-*',
    does: 'Answers a ping that landed after last night\'s clock-off, from the '
      + '"while you were out" surface: a point of reputation paid against a '
      + 'point of stress carried into the day. Leaving it is free and reaches '
      + 'nothing.',
    actions: [DAY_ACTIONS.afterHoursAnswer],
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
    id: 'weekend.onward-offer',
    surface: 'weekend',
    control: 'weekend-onward',
    does: 'After a pass, the onward button IS the offer: it names the next '
      + 'employer and takes the job rather than pretending week two is built. '
      + 'The week run verifies it is there; the switch run clicks it.',
    run: 'week',
  },
  {
    id: 'weekend.stay-door',
    surface: 'weekend',
    control: 'weekend-stay',
    does: 'The third door out of a Friday (E11): after a pass, and while the '
      + 'arc has another week in it, the option that does not leave - named '
      + 'with the week number it goes to. Hidden on a firing (no desk), on a '
      + 'redundancy (no role) and on the arc\'s last week (no job).',
    run: 'week',
  },
  {
    id: 'weektwo.arrive',
    surface: 'boot',
    control: 'weekend-stay, then the boot that follows it',
    does: 'Staying: the same employer\'s NEXT week stands up, the arc position '
      + 'climbed, the career carried and the whitelisted estate still in the '
      + 'building. The unlock the twelve-week pressure ladder has been waiting '
      + 'on since 0.2.7.',
    run: 'week',
  },
  {
    id: 'weekend.offer',
    surface: 'weekend',
    control: 'weekend-offer, weekend-offer-title, weekend-offer-body',
    does: 'The offer at the next employer, toned to the verdict: a pass is an '
      + 'offer you earned, named, with the standing that walks in with you.',
    run: 'week',
  },
  {
    id: 'weekend.offer-fired',
    surface: 'weekend',
    control: 'weekend-offer, weekend-accept-offer',
    does: 'The worse offer after a firing: the trail it leaves is on it, and a '
      + 'second button takes the desperate job rather than starting the week '
      + 'again - both honest, neither the only door out.',
    run: 'fired',
    why: 'The offer reads WORSE only after a week that lost the room, which is '
      + 'the week the fired run plays and the passing week never does.',
  },
  {
    id: 'weekend.onward-retry',
    surface: 'weekend',
    control: 'weekend-onward',
    does: 'Starts the Monday again after a firing, keeping the fund.',
    run: 'fired',
    why: 'Only a week that ended in the small room offers it.',
  },
  {
    id: 'switch.accept',
    surface: 'weekend',
    control: 'weekend-onward (a passed week), weekend-accept-offer (a fired one)',
    does: 'Takes the offer: writes the career that crosses the threshold, throws '
      + 'the save away, and reloads the page onto the next employer\'s Monday.',
    run: 'switch',
    why: 'Accepting reloads into a different world, so it cannot share a session '
      + 'with the week or fired runs that verify the offer without taking it.',
  },
  {
    id: 'switch.arrive',
    surface: 'boot',
    control: 'install-screen (new starter), sim-clock-day',
    does: 'Arrives at the second employer: the new-machine screen names the '
      + 'shop, and Monday opens with the reputation, title and fund carried.',
    run: 'switch',
    why: 'The arrival only exists on the boot that follows an accepted offer, '
      + 'which is the reload no other run performs.',
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
    id: 'caught.scene-presence',
    surface: 'caught',
    control: 'caught-evidence',
    does: 'The one telling-off that is not about a screen: the lead reads the '
      + 'dot against a morning of dispatches, says how much of the morning it '
      + 'was without saying a number, and the line that goes on the file says '
      + 'the same thing in the passive voice.',
    actions: [DAY_ACTIONS.bossCaught],
    scene: 'caught.presence',
    run: 'fired',
    why: 'Arming it is a morning spent working with the dot on red until the '
      + 'suspicion meter has actually climbed - which is the week that is not '
      + 'being played honestly, and being spoken to costs the shift twenty '
      + 'minutes and the file a line either way.',
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

  /* -- somebody at the desk ------------------------------------------------
   *
   * The same window and the same three verbs, because it is the same
   * mechanic - a synchronous conversation that owns the screen while every
   * clock runs. What is different is everything the player reads: the words on
   * the buttons, the sentence about the dot, and the fact that this one has an
   * ASK in it rather than a subject.
   */
  {
    id: 'call.walk-up',
    surface: 'call',
    control: 'call-answer (a walk-up)',
    does: 'Looks up at somebody standing at the desk, which the status dot '
      + 'has no say in and which opens the ask they came over with.',
    actions: [DAY_ACTIONS.interruptionAccept],
    run: 'week',
  },
  {
    id: 'call.walk-up-off-book',
    surface: 'call',
    control: 'call-option-<n> (do it now)',
    does: 'Does the two-minute job there and then: the world moves, they are '
      + 'grateful, no ticket is ever raised and Friday cannot see it.',
    actions: [HELPDESK_ACTIONS.machineReboot],
    run: 'week',
  },
  {
    id: 'call.walk-up-filed',
    surface: 'call',
    control: 'call-option-<n> (ask them to file it)',
    does: 'Sends them to the form, which costs a beat of grumbling and puts a '
      + 'real ticket in the queue that counts like any other.',
    run: 'fired',
    why: 'One week cannot both do the favour off the books and be sent the '
      + 'ticket for it: the two answers are the same beat, and the walk that '
      + 'goes well takes the quiet one.',
  },
  {
    id: 'call.missed-record',
    surface: 'call',
    control: 'call-missed',
    does: 'The phones that did not ring, in the window that would have rung: '
      + 'the minute the dot turned each one away, who it was and what they '
      + 'wanted, and whether they ever tried again.',
    actions: [DAY_ACTIONS.interruptionDodged],
    run: 'fired',
    why: 'A dodged call is a call the week never gets: the walk that goes '
      + 'well answers the Tuesday phone, and one week cannot both take that '
      + 'call and turn it away.',
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
    id: 'tickets.contract-clocks',
    surface: 'tickets',
    control: 'ticket-detail-cadence',
    does: 'The external contract\'s own clocks (D4): the acknowledgment the '
      + 'tier sells and a promised gap between updates - misses stamped by '
      + 'the settler as the silence stretches, billed like the breaches the '
      + 'contract never actually bound.',
    actions: [
      HELPDESK_ACTIONS.ticketRecordAckMiss,
      HELPDESK_ACTIONS.ticketRecordCadenceMiss,
    ],
    run: 'sysadmin',
    why: 'An in-house shop has no tier, so the probation week cannot grow '
      + 'the cadence row at all - the contract clocks exist only where '
      + 'contracts do, and the MSP walk is the one standing on a contract.',
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
    id: 'tickets.tab-audit',
    surface: 'tickets',
    control: 'tickets-tab-audit',
    does: 'Opens the second queue: other people\'s filings, waiting on a '
      + 'signature, with your own clocks still running behind them.',
    run: 'senior',
    why: 'There is no second queue below the senior rung. A probationer has '
      + 'nobody\'s work to audit, and the tab is not on their window at all.',
  },
  {
    id: 'tickets.tab-mine',
    surface: 'tickets',
    control: 'tickets-tab-mine',
    does: 'Goes back to your own queue, which has been running the whole '
      + 'time you were in somebody else\'s.',
    run: 'senior',
    why: 'The strip only exists where there are two lists.',
  },
  {
    id: 'tickets.audit-panel',
    surface: 'tickets',
    control: 'ticket-audit, ticket-audit-filed, ticket-audit-beneficiary',
    does: 'Shows whose filing it is and what it says - and nothing about '
      + 'whether it is right, because that is the question being asked.',
    run: 'senior',
    why: 'Only an audit item has somebody else\'s filing on it.',
  },
  {
    id: 'tickets.audit-confirm',
    surface: 'tickets',
    control: 'audit-confirm',
    does: 'Signs a filing off as it stands. Costs nothing this minute, which '
      + 'is the trap.',
    actions: [AUDIT_ACTIONS.auditConfirm],
    run: 'senior',
    why: 'The verb refuses anything without somebody else\'s name on it.',
  },
  {
    id: 'tickets.audit-correct',
    surface: 'tickets',
    control: 'triage-impact, triage-urgency, triage-file (on an audit item)',
    does: 'Corrects somebody else\'s filing through the queue\'s own triage '
      + 'form, and pays the attention tax for it.',
    actions: [HELPDESK_ACTIONS.ticketClassify],
    run: 'senior',
    why: 'The same control the week run drives on your own tickets, on the '
      + 'one kind of ticket only this rung is dealt - which is the whole '
      + 'reason there is no second classify verb to cover instead.',
  },
  {
    id: 'tickets.audit-bill',
    surface: 'notifications',
    control: 'the notice a signed-off wrong filing produces on breach',
    does: 'Puts the QA finding on the desk when the clock the filing bought '
      + 'runs out, with the half that was wrong named.',
    actions: [AUDIT_ACTIONS.auditFallout],
    run: 'senior',
    why: 'It needs a filing agreed with and then a deadline missed, which is '
      + 'two decisions and most of a day.',
  },
  {
    id: 'tickets.write-up',
    surface: 'tickets',
    control: 'audit-author-article',
    does: 'Writes the article the second sighting of a class earns, which '
      + 'costs the afternoon\'s concentration and makes the next one arrive '
      + 'right.',
    actions: [AUDIT_ACTIONS.kbWriteUp],
    run: 'senior',
    why: 'The prompt needs two of one class ruled on, which no other run '
      + 'is ever dealt.',
  },
  {
    id: 'tickets.retained',
    surface: 'tickets',
    control: 'handoff-send (at the senior title), ticket-detail-retained',
    does: 'Sends the handoff and KEEPS the ticket, with the clock still '
      + 'running - which is what ownership means at this grade.',
    actions: [HELPDESK_ACTIONS.ticketEscalate],
    run: 'senior',
    why: 'Every other rung\'s escalation hands the ticket over and it leaves '
      + 'the board; the retained branch is guarded on the title.',
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
    id: 'remote.face-console',
    surface: 'remote',
    control: 'remote-console (a Linux host)',
    does: 'Shows a box with no graphical session as what a screen plugged into '
      + 'it actually shows - its own login prompt, and a line saying the work '
      + 'happens over ssh - instead of the Windows desktop this window drew on '
      + 'every machine in the estate from 0.7.0 to 0.33.0 (#55). No My '
      + 'Documents, no Recycle bin, no Start button anywhere in the document.',
    run: 'sysadmin',
    why: 'The customer estates with Linux boxes on them are the MSP\'s, and the '
      + 'probation week never reaches a machine that is not a Windows one.',
  },
  {
    id: 'remote.face-mac',
    surface: 'remote',
    control: 'remote-menu-bar, remote-dock (a Mac host)',
    does: 'Shows a Mac as a Mac: the two layout facts the chrome slice ships - '
      + 'a menu bar with the clock in it and a dock silhouette along the '
      + 'bottom - and nothing invented on top of them, because this estate '
      + 'models a Mac\'s hardware and its jobs and has never held anything '
      + 'about its desktop. The OTHER state of this face is the black frame a '
      + 'viewer gets before Screen Recording is granted, which needs the '
      + 'studio\'s Wednesday ticket to have taken the consent away: it is '
      + 'proven on the artifact in msp.spec.ts, beside the ticket it belongs '
      + 'to, and swept offline over every world in remote-face.test.ts.',
    run: 'sysadmin',
    why: 'The Macs are MARLOWE-STUDIO\'s, which is an MSP customer - the '
      + 'probation week has no Mac on the wire at all.',
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
    id: 'chat.aggressive',
    surface: 'chat',
    control: 'chat-option-<n> (aggressive register)',
    does: 'Says the rude thing - up to telling a user where to go - and fixes '
      + 'their ticket anyway: the same effect the plain reply runs, plus the '
      + 'social cost, so the fix still happens and the standing pays for it.',
    actions: [
      HELPDESK_ACTIONS.machineSetDisplayRotation,
      HELPDESK_ACTIONS.reporterRebuff,
    ],
    run: 'week',
  },
  {
    id: 'chat.aggressive-escalates',
    surface: 'chat',
    control: 'chat-option-<n> (aggressive, repeated)',
    does: 'Snaps at the same reporter twice: their reaction on the stream '
      + 'sharpens and the standing pays a steeper toll the second time, which '
      + 'is the register escalating rather than repeating.',
    actions: [HELPDESK_ACTIONS.reporterRebuff],
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
    id: 'chat.away-noticed',
    surface: 'chat',
    control: 'chat-person-<reporter> (marked Away)',
    does: 'Somebody who has been waiting for a first word says what they '
      + 'think of a desk marked Away closing other people\'s tickets - once, '
      + 'in their own voice, in the conversation they would have said it in - '
      + 'which is how the player finds out why the reputation moved.',
    actions: [WORLD_ACTIONS.presenceNoticed],
    run: 'fired',
    why: 'It costs reputation for a lie the world can see, and the week that '
      + 'goes well is the week the dot is honest in; the walk that ignores '
      + 'the queue is where a desk sits marked Away while it moves.',
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

  /* -- Hubbub --------------------------------------------------------------
   *
   * The channel client the company rolled out (0.5.0 slice 1). Read-only on
   * purpose: the rooms fill from the week's channel table against the clock,
   * nothing in the window dispatches, and the composer is slice 2's mechanic
   * rather than a missing control. That is why no entry here carries an
   * action.
   */
  {
    id: 'hubbub.window',
    surface: 'hubbub',
    control: 'window-hubbub',
    does: 'The channel client the company rolled out and nobody asked for: '
      + 'named rooms, threads, mentions, and a badge per room.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'week',
  },
  {
    id: 'hubbub.rooms',
    surface: 'hubbub',
    control: 'hubbub-channel-<channel>',
    does: 'Picks a room, which puts what has arrived there on screen - and '
      + 'what has been on screen is read, so the room\'s badge clears.',
    run: 'week',
  },
  {
    id: 'hubbub.mention',
    surface: 'hubbub',
    control: 'hubbub-message-<id> (mentions you)',
    does: 'Flags the message that names the player, on the message itself and '
      + 'on the room\'s badge, until it has been read.',
    run: 'week',
  },
  {
    id: 'hubbub.open-ticket',
    surface: 'hubbub',
    control: 'hubbub-open-ticket-<id>',
    does: 'Opens the queue from a message that says it is about a ticket - '
      + 'the request in its third coat, pointed back at the surface where '
      + 'the credit lives.',
    run: 'week',
  },
  {
    id: 'hubbub.presence',
    surface: 'hubbub',
    control: 'hubbub-presence',
    does: 'Wears the same dot the taskbar sets, read from the same field of '
      + 'the same node: one status, every surface, this room included.',
    run: 'week',
  },
  {
    id: 'hubbub.request',
    surface: 'hubbub',
    control: 'request-convert-<id>, request-answer-<id>, request-deflect-<id>',
    does: 'The same question arriving everywhere, resolved (0.5.0 slice 2). '
      + 'Convert mints the ticket the request becomes - the one intake Friday '
      + 'can see; answer keeps the human happy off the books and raises '
      + 'nothing; deflect sends them to the form. Any one of them quietens '
      + 'every copy - the mail and the chat carry the same bar, off the same '
      + 'world record - which is the dedupe. The proper week converts it, the '
      + 'correct play; the answer and deflect resolutions of the same bar are '
      + 'held down on the real driver in src/shell/requests.test.ts.',
    actions: [
      REQUEST_ACTIONS.convert,
      REQUEST_ACTIONS.answer,
      REQUEST_ACTIONS.deflect,
    ],
    run: 'week',
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
  {
    id: 'mail.selinux',
    surface: 'mail',
    control: 'mail-row-selinux-permissive',
    does: 'The overnight compliance sweep, in the morning post (0.28.0): the '
      + 'box named, the control named, and no telling-off - the whole cost of '
      + 'having switched enforcement off instead of relabelling the file.',
    run: 'selinux',
    why: 'It only exists in a week where somebody reached for setenforce 0, '
      + 'and it only arrives the morning after they did.',
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
    id: 'cmd.audit',
    surface: 'cmd',
    control: 'audit <customer>',
    does: 'Runs discovery on a managed customer\'s estate - the machines, the '
      + 'services, their state - and surfaces the onboarding horror, a backup '
      + 'reporting success it cannot restore from, read off the estate. On the '
      + 'probation desk it names no customer and says so; the real MSP audit, '
      + 'the enumeration and the silently-failing backup are driven through the '
      + 'real terminal in onboarding.test.ts, which the browser walk cannot '
      + 'reach past the second employer.',
    command: 'audit',
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
    id: 'cmd.changereq',
    surface: 'cmd',
    control: 'changereq <file <service> | list>',
    does: 'Files a change request to authorise risky/out-of-scope work - the '
      + '0.10.0 path that turns a hard scope refusal into request, approve, act '
      + 'in a window - and lists what has been filed. On the probation desk it '
      + 'answers that in-house work needs no request and that none are filed; '
      + 'the filing, the deterministic approval, the window and the consult that '
      + 'lets an approved action through live at the MSP and are driven through '
      + 'the real terminal in change-request.test.ts. It dispatches nothing '
      + 'itself - filing is paperwork, and the scope pre-flight is the only thing '
      + 'that ever lets the action it authorises through.',
    command: 'changereq',
    run: 'week',
  },
  {
    id: 'cmd.notify',
    surface: 'cmd',
    control: 'notify <service>',
    does: 'Notifies a co-managed customer\'s OWN IT before acting on their box - '
      + 'the coordinate-then-act seam - and thereby clears the action the scope '
      + 'pre-flight would otherwise refuse. On the probation desk it answers that '
      + 'an in-house box has no customer IT to notify; the co-managed loop (a '
      + 'unilateral action caught, the notify clearing it, and the fail-closed '
      + 'teeth) is driven through the real terminal in msp-scope.test.ts. It '
      + 'dispatches nothing itself - filing the notice is paperwork, and the '
      + 'scope pre-flight is the only thing that lets the action it clears '
      + 'through.',
    command: 'notify',
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

  /* -- the sysadmin tier: the promotion, ssh, the unix dialect (E6) -------- */
  {
    id: 'cmd.promotion',
    surface: 'cmd',
    control: 'promotion accept',
    does: 'Takes the Systems Engineer offer: the world flips the player from '
      + 'Tier 2 to Tier 1, updates the title, and unlocks ssh and the unix '
      + 'terminal. Earned (refused below the standing the offer is made at) and '
      + 'one-way (refused once you are already an engineer).',
    command: 'promotion',
    actions: [CAREER_ACTIONS.acceptPromotion],
    run: 'sysadmin',
    why: 'The offer is earned off a career built, so it is only on the table '
      + 'with the standing the MSP arrival carries - which no probation week '
      + 'reaches, and which is the whole of the crossing this run exists for.',
  },
  {
    id: 'cmd.ssh',
    surface: 'cmd',
    control: 'ssh <user@host>',
    does: 'Reaches a Linux server: refused for a service-desk player (that is '
      + 'the engineers\' tier), and past the promotion it does trust-on-first-'
      + 'use - the ED25519 fingerprint, the known_hosts line, and the session '
      + 'the terminal enters, where the dialect becomes unix.',
    command: 'ssh',
    actions: [CAREER_ACTIONS.sshTrustHost],
    run: 'sysadmin',
    why: 'ssh connects only past the promotion; before it the tier gate refuses '
      + 'it, so the mechanic it opens lives on the far side of a threshold the '
      + 'service-desk weeks never cross.',
  },
  {
    id: 'cmd.systemctl',
    surface: 'cmd',
    control: 'systemctl <status|restart|start|stop> <unit>',
    does: 'Reads and works a systemd unit in the unix dialect: "status" prints '
      + 'the richer ●-dot block (dot, Loaded, Active, Main PID, a journal tail) '
      + 'off the unit node; "restart"/"start"/"stop" flip the unit\'s state and '
      + 'are SILENT on success, the way systemd is - never a fabricated line.',
    command: 'systemctl',
    actions: [
      SYSTEMD_ACTIONS.unitRestart,
      SYSTEMD_ACTIONS.unitStart,
      SYSTEMD_ACTIONS.unitStop,
    ],
    run: 'sysadmin',
    why: 'It only runs inside an ssh session on a Linux box, which is reachable '
      + 'only once the promotion has unlocked ssh - the same threshold the whole '
      + 'run turns on.',
  },
  {
    id: 'cmd.breakglass',
    surface: 'cmd',
    control: 'breakglass <unit>',
    does: 'The emergency override (0.18.0): a service ACTIVELY DOWN in an '
      + 'incident is a fire, and break-glass fixes it outside the change window '
      + 'and logs the override loudly on break_glass_audit for the review after. '
      + 'On a healthy service it refuses - there is no fire behind it - records '
      + 'the abuse on break_glass_abuse and charges its suspicion, because an '
      + 'override with no emergency reads at the review. The legitimacy gate is a '
      + 'real active incident; the planned counterpart is a change request + '
      + 'window, and both are driven through the real terminal in '
      + 'change-control.test.ts.',
    command: 'breakglass',
    actions: [
      CHANGE_ACTIONS.breakGlassRecord,
      CHANGE_ACTIONS.breakGlassAbuse,
    ],
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks - only a Systems Engineer can break the glass.',
  },
  {
    id: 'cmd.journalctl',
    surface: 'cmd',
    control: 'journalctl -u <unit> | journalctl --vacuum-size=<x>',
    does: 'Reads a unit\'s journal off its node: the timestamped '
      + 'MMM DD HH:MM:SS host process[pid]: message lines a failed unit carries '
      + '- the crash, systemd\'s retries, the start-limit - and "-- No entries --" '
      + 'for a unit the world holds no journal for. With --vacuum-size it is the '
      + 'disk-full fix (0.19.0): deletes the archived journals down to the cap and '
      + 'hands the freed bytes back to the box\'s disk_free, refusing on a box '
      + 'whose journal is already small.',
    command: 'journalctl',
    actions: [INCIDENT_ACTIONS.journalVacuum],
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.df',
    surface: 'cmd',
    control: 'df -h',
    does: 'Shows the box\'s disk in the Filesystem/Size/Used/Avail/Use%/Mounted '
      + 'on shape - a device path and a mount point, no drive letter - off the '
      + 'machine\'s seeded free space.',
    command: 'df',
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.du',
    surface: 'cmd',
    control: 'du -sh <path>',
    does: 'Shows what a directory is eating in the real size-tab-path shape '
      + '(0.19.0): -s the summed total under the path, without it each directory '
      + 'under it and then the total. The journal\'s size is the box\'s real '
      + 'journal_bytes field, so du CHANGES when it does - the disk-full '
      + 'diagnosis, du -sh /var/log/journal finding the runaway df -h\'s missing '
      + 'space went into.',
    command: 'du',
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.apt',
    surface: 'cmd',
    control: 'apt <install <pkg> | update | list --upgradable | upgrade>',
    does: 'Package management (0.20.0), the loop the 0.16.0 gags opened, closed: '
      + '"sudo apt install htop/traceroute/net-tools" prints the real NEW-packages '
      + 'shape and records the package in the box\'s installed_packages set - after '
      + 'which the previously-gagged command RUNS. "apt update" reads the box\'s '
      + 'pending updates (a derived, deterministic baseline incl a security one), '
      + '"apt list --upgradable" lists them, and "apt upgrade" applies them (sets '
      + 'updates_applied), after which the box is clean. Privileged: without sudo '
      + 'the mutating subcommands fail on the dpkg lock ("are you root?").',
    command: 'apt',
    actions: [APT_ACTIONS.aptInstall, APT_ACTIONS.aptUpgrade],
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks - only a Systems Engineer installs a package or patches '
      + 'a box.',
  },
  {
    id: 'cmd.dnf',
    surface: 'cmd',
    control: 'dnf <install <pkg> | check-update | upgrade>',
    does: 'The RHEL family\'s package manager (0.27.0), over exactly the same '
      + 'mechanics apt runs on: on a box the player has put Fedora on, "sudo dnf '
      + 'install htop" prints the real transaction table and records the package '
      + 'in the SAME installed_packages set - closing the SAME not-installed gag, '
      + 'whose hint is in dnf\'s words there - "dnf check-update" lists the '
      + 'pending updates and is SILENT once there are none, and "sudo dnf '
      + 'upgrade" applies them through the same verb. The other family\'s manager '
      + 'is a missing binary on each: apt and dpkg are command-not-found on a dnf '
      + 'box, and dnf is on every apt one, which is every server on the estate.',
    command: 'dnf',
    actions: [APT_ACTIONS.aptInstall, APT_ACTIONS.aptUpgrade],
    run: 'sysadmin',
    why: 'A unix-dialect verb on a box that speaks dnf, and the only box that '
      + 'does is one the player has reinstalled - which needs the promotion twice '
      + 'over: to choose a desktop at all, and to ssh onto the result.',
  },
  {
    id: 'cmd.yum',
    surface: 'cmd',
    control: 'yum <install <pkg> | check-update | upgrade>',
    does: 'The muscle memory, answered (0.28.0): on a box that speaks dnf, yum '
      + 'prints the real wrapper\'s redirect line and then dnf answers - the '
      + 'same transaction, the same installed_packages field, the same pending '
      + 'set, because on every release anybody still runs /usr/bin/yum IS dnf. '
      + 'It is not a fifth dialect and it is not a stub: the name changed and '
      + 'the box did not care, which is the whole joke and the whole teaching. '
      + 'On an apt, zypper or pacman box it is a missing binary like any other '
      + 'family\'s verb.',
    command: 'yum',
    actions: [APT_ACTIONS.aptInstall, APT_ACTIONS.aptUpgrade],
    run: 'sysadmin',
    why: 'A unix-dialect verb on a box the player has put a RHEL-family distro '
      + 'on, which needs the promotion twice over: to choose a distribution at '
      + 'all, and to ssh onto the result.',
  },
  {
    id: 'cmd.zypper',
    surface: 'cmd',
    control: 'zypper <install <pkg> | refresh | list-updates | update>',
    does: 'openSUSE\'s package manager (0.28.0), the third family\'s words over '
      + 'the same engine: "sudo zypper install" prints zypper\'s own '
      + 'Continue?/[done] transaction and records the package in the SAME '
      + 'installed_packages set - closing the SAME not-installed gag, hinted in '
      + 'zypper\'s words - "sudo zypper refresh" refreshes the repos and says '
      + 'how far behind the box is, "zypper list-updates" prints the pipe-ruled '
      + 'table (with SUSE\'s own names: libopenssl3, timezone), and "sudo zypper '
      + 'update" applies them through the same verb apt and dnf dispatch. Every '
      + 'other family\'s manager is command-not-found on it, and it is on every '
      + 'one of theirs.',
    command: 'zypper',
    actions: [APT_ACTIONS.aptInstall, APT_ACTIONS.aptUpgrade],
    run: 'sysadmin',
    why: 'A unix-dialect verb on a box that speaks zypper, and the only box '
      + 'that can is one the player has reinstalled - which needs the promotion '
      + 'twice over: to choose a distribution at all, and to ssh onto the result.',
  },
  {
    id: 'cmd.pacman',
    surface: 'cmd',
    control: 'pacman <-S <pkg> | -Syu | -Q | -Qu>',
    does: 'Arch\'s package manager (0.28.0), and the one whose verbs are '
      + 'CASE-SENSITIVE FLAGS rather than words: "sudo pacman -S <pkg>" installs '
      + 'into the same installed_packages set (and reinstalls with pacman\'s own '
      + 'warning when it is already there, because pacman has no no-op), "sudo '
      + 'pacman -Syu" syncs the databases AND upgrades in one operation through '
      + 'the same verb the other three dispatch, "pacman -Q" lists what is on '
      + 'the box at the versions the box is actually at, and "pacman -Qu" lists '
      + 'what is behind in the name old -> new shape. The sync half of -Syu runs '
      + 'even when there is nothing to upgrade, which is the honest shape of the '
      + 'eternal -Syu on a rolling release.',
    command: 'pacman',
    actions: [APT_ACTIONS.aptInstall, APT_ACTIONS.aptUpgrade],
    run: 'sysadmin',
    why: 'A unix-dialect verb on a box that speaks pacman, which only exists '
      + 'once the player has chosen Arch AND chosen a desktop to go with it - '
      + 'both behind the promotion, as is the ssh onto the result.',
  },
  {
    id: 'cmd.subscription-manager',
    surface: 'cmd',
    control: 'subscription-manager <status | register | list>',
    does: 'The RHEL register beat (0.28.0), and it GATES NOTHING: "status" '
      + 'reads Disabled, "list" reads Not Subscribed, and "register" fails for '
      + 'want of credentials that live in a spreadsheet the previous engineer '
      + 'owned - after which dnf carries on working exactly as it did, because '
      + 'the repositories on a rebuild are not Red Hat\'s and nothing here ever '
      + 'asked. It is comedy rather than a paywall mechanic: no field is '
      + 'written, no verb is dispatched, and nothing on the box waits on it. On '
      + 'any distro but RHEL it is not a binary at all, Fedora included, which '
      + 'is the one place the distro and the package manager come apart.',
    command: 'subscription-manager',
    run: 'sysadmin',
    why: 'A Red Hat binary, on a box the player has put RHEL on - behind the '
      + 'promotion that lets them install a distribution and the ssh that '
      + 'reaches the result.',
  },
  {
    id: 'cmd.getenforce',
    surface: 'cmd',
    control: 'getenforce',
    does: 'Reads SELinux\'s mode off the box in the one word the real tool '
      + 'prints (0.28.0): Enforcing on a RHEL-family install, Permissive after '
      + 'somebody has reached for setenforce. It is a FIELD on the machine, not '
      + 'a constant - the same one setenforce writes and the same one the denial '
      + 'is decided by - so the answer cannot disagree with what the box '
      + 'actually does. On every other distribution it is not a binary at all, '
      + 'and the miss names what that family ships instead (AppArmor, or '
      + 'nothing), exactly as the wrong package manager does.',
    command: 'getenforce',
    run: 'sysadmin',
    why: 'An SELinux verb, and the only box in the game with SELinux on it is '
      + 'one the player has reinstalled onto the RHEL family - which needs the '
      + 'promotion twice over: to choose a distribution, and to ssh to it.',
  },
  {
    id: 'cmd.sestatus',
    surface: 'cmd',
    control: 'sestatus',
    does: 'The fuller shape of the same fact (0.28.0): status, SELinuxfs mount, '
      + 'policy root, loaded policy name, the MLS and deny_unknown lines - and '
      + 'the pair that earns the verb its place, Current mode beside Mode from '
      + 'config file. setenforce moves the first and never the second, which is '
      + 'how a player finds out that switching enforcement off is a runtime '
      + 'change on a box that will go back to refusing at the next boot.',
    command: 'sestatus',
    run: 'sysadmin',
    why: 'The same box behind the same two gates as getenforce above.',
  },
  {
    id: 'cmd.restorecon',
    surface: 'cmd',
    control: 'sudo restorecon [-v] <path>',
    does: 'The advertised fix for a label denial (0.28.0), and the one that '
      + 'changes a FILE: it writes the context the policy holds for that path '
      + 'back onto the file - the value comes off the file\'s own default, so '
      + 'neither the shell nor the player names a label - and the service that '
      + 'was refusing serves the page on the very next request, with nothing '
      + 'restarted and the box still enforcing. Privileged, like every other '
      + 'verb that writes to a box. Silent without -v, and -v '
      + 'reports only a file it ACTUALLY relabelled, so running it on a correct '
      + 'file claims nothing.',
    command: 'restorecon',
    actions: [SELINUX_ACTIONS.restorecon],
    run: 'sysadmin',
    why: 'The fix half of a denial that only exists on a RHEL-family box the '
      + 'player owns, which is the far side of the promotion.',
  },
  {
    id: 'cmd.setenforce',
    surface: 'cmd',
    control: 'setenforce <0|1>',
    does: 'The other fix (0.28.0), and the one that changes the BOX: setenforce '
      + '0 puts the whole machine in permissive mode, the denied page is served '
      + 'instantly, and nothing about the wrong label has been touched. It needs '
      + 'root, it is silent on success like the real one, and it is REMEMBERED - '
      + 'the minute is stamped on the machine and the overnight compliance sweep '
      + 'reads it, so a mail lands the next morning naming the box. Putting it '
      + 'back with setenforce 1 restores enforcement and the denial with it, and '
      + 'does not unwrite the record.',
    command: 'setenforce',
    actions: [SELINUX_ACTIONS.setenforce],
    run: 'selinux',
    why: 'One box cannot be fixed both ways: relabelling the file and switching '
      + 'the enforcement off are alternatives, and the sysadmin run takes the '
      + 'first. This run takes the second and sleeps on it, which is the only '
      + 'way to reach the morning the sweep lands.',
  },
  {
    id: 'cmd.fw',
    surface: 'cmd',
    control: 'fw <status | rules <box> | audit <box> | pack <box> '
      + '| migrate <rule> | cutover <box> | rollback <box>>',
    does: 'The whole of the first PROJECT (E10, 0.29.0), as the seven things an '
      + 'edge replacement comes down to. "fw status" is the plan against the '
      + 'clock - every phase, its date, and the working minutes left, negative '
      + 'while there is still a project to save. "fw rules" reads what a box is '
      + 'carrying, and reads it from whatever source the world has: the handover '
      + 'pack until somebody reads the box. "fw audit" reads the live '
      + 'configuration and "fw pack" takes the pack as read - two verbs because '
      + 'they are two different acts, both of which close the audit task, and '
      + 'only one of which knows about the rules nobody wrote down. "fw migrate" '
      + 'carries one rule onto the new box. "fw cutover" moves the site\'s '
      + 'circuit, and is REFUSED outside the change window the ordinary '
      + 'changereq flow opened - the project gets no private calendar. "fw '
      + 'rollback" moves it back, which costs the window and undoes nothing '
      + 'else. Gated on the promotion, like ssh: a project is not service-desk '
      + 'work.',
    command: 'fw',
    actions: [
      PROJECT_ACTIONS.auditConfig,
      PROJECT_ACTIONS.auditPack,
      PROJECT_ACTIONS.migrateRule,
      PROJECT_ACTIONS.cutover,
      PROJECT_ACTIONS.rollback,
    ],
    run: 'sysadmin',
    why: 'A project arrives with the promotion and needs the engineer tier for '
      + 'every verb in it, so no service-desk week can reach a single one of '
      + 'them - the same threshold ssh lives behind, walked in the same run.',
  },
  {
    id: 'cmd.fw-report',
    surface: 'cmd',
    control: 'fw report <green|amber|red>',
    does: 'THE WATERMELON (0.30.0): the weekly status report, filed - and it '
      + 'is the only verb in the `fw` family that changes nothing at all about '
      + 'the estate. The phase, the dates and the slip are still derived from '
      + 'what the work left behind; this writes a COLOUR beside them, which is '
      + 'what the business has. The terminal prints the plan\'s own colour in '
      + 'the same breath, so a green filed over an amber phase is a thing done '
      + 'with the truth on the screen next to it. Reporting red is answered in '
      + 'the morning by three meetings; reporting green costs nothing today '
      + 'and is asked about the morning a date goes past with it standing.',
    command: 'fw',
    actions: [PROJECT_ACTIONS.report],
    run: 'sysadmin',
    why: 'There is no project to report on before the promotion at the MSP, '
      + 'and the rest of the `fw` family lives behind the same threshold.',
  },
  {
    id: 'cmd.timesheet-attributed',
    surface: 'cmd',
    control: 'timesheet | timesheet claim <line> <minutes> | timesheet vague '
      + '<line> | timesheet detail <line>',
    does: 'The ENGINEER\'s sheet (0.30.0): the week derived from what the '
      + 'engine itself recorded, a line per customer with a billable flag, the '
      + '0.29.0 project as an attributable line of its own carrying its code, '
      + 'and the rest of the working day sitting underneath as time on nobody\'s '
      + 'invoice. Both numbers on every row - worked and claimed - so padding '
      + 'one is a thing done with the truth on the screen beside it. "claim" '
      + 'moves the minutes, "vague" and "detail" move how much of a sentence '
      + 'goes with them, and neither touches the derived half: the record and '
      + 'the claim are two pieces of paper from here on. Under it, the two '
      + 'OTHER readers of the same week (slice 2): the org\'s utilisation row - '
      + 'what you SAID over the hours you were here, against the 75% the '
      + 'business asks an engineer for, which decides nothing and is under '
      + 'target on every honest week - and any account that has got as far as '
      + 'asking about a line, which is nobody on a sheet nobody edited.',
    command: 'timesheet',
    actions: [TIMESHEET_ACTIONS.record, TIMESHEET_ACTIONS.claim],
    run: 'sysadmin',
    why: 'Per-customer attribution needs customers and the engineer tier to be '
      + 'asked for it, and the project line needs a project - none of which a '
      + 'service-desk probation week has. The same threshold the projects '
      + 'surface lives behind, walked in the same run.',
  },
  {
    id: 'cmd.timesheet',
    surface: 'cmd',
    control: 'timesheet, timesheet submit',
    does: 'The SERVICE DESK\'s sheet (0.30.0), which is the joke: one bucket a '
      + 'day, seven and a half hours, and it is finished before the sigh is. '
      + 'Nobody at a desk attributes anything, so there is nothing on it to '
      + 'decide and one thing to do with it. It is due at the end of Friday, '
      + 'submitting freezes it, and a second submission is refused the way a '
      + 'filed piece of paper is.',
    command: 'timesheet',
    actions: [TIMESHEET_ACTIONS.submit],
    run: 'week',
  },
  {
    id: 'cmd.dpkg',
    surface: 'cmd',
    control: 'dpkg -l',
    does: 'Lists the box\'s installed packages in dpkg\'s ii/name/version/arch/'
      + 'desc shape under its status legend (0.20.0): the base set every Ubuntu '
      + 'box carries plus the packages the engineer has apt-installed here, so a '
      + 'package installed a moment ago shows up as ii - the read that agrees with '
      + 'apt install off the one real box field.',
    command: 'dpkg',
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.launchctl',
    surface: 'cmd',
    control: 'launchctl <list | print <domain>/<label> | kickstart [-k] '
      + '<domain>/<label> | bootout <domain>/<label> | bootstrap <domain> '
      + '<plist>>',
    does: 'The third family\'s service manager (0.33.0), in the modern '
      + 'vocabulary: "list" prints the loaded jobs in launchctl\'s PID/Status/'
      + 'Label columns under their real reverse-DNS names, "print" prints one '
      + 'job\'s block (path, state, pid, last exit code) and FAILS on the wrong '
      + 'domain in launchctl\'s own "Could not find service" sentence, and the '
      + 'three fix verbs dispatch THE SAME registered actions systemctl does - '
      + 'kickstart -k is unitRestart, bootout is unitStop, bootstrap is '
      + 'unitStart - through the same customer-scope, change-control and '
      + 'permission guards, silent on success exactly as systemctl is. A bare '
      + 'label is refused with what a service target is, and the legacy '
      + 'load/unload pair is refused by name rather than half-shipped.',
    command: 'launchctl',
    actions: [
      SYSTEMD_ACTIONS.unitRestart,
      SYSTEMD_ACTIONS.unitStart,
      SYSTEMD_ACTIONS.unitStop,
    ],
    run: 'sysadmin',
    why: 'The mac dialect, which needs the promotion (ssh is the engineers\' '
      + 'tier) and a Mac to stand on - the studio\'s desks, at the MSP.',
  },
  {
    id: 'cmd.log',
    surface: 'cmd',
    control: 'log show [--last <n>]',
    does: 'macOS\'s unified-log reader (0.33.0), and the third face of a log '
      + 'this world already holds: the real Timestamp/Thread/Type/Activity/PID/'
      + 'TTL columns and the "Log - Default: N" count footer, over the SAME '
      + 'lines journalctl reads off the jobs on the box. --last is the real flag '
      + 'and is not applied, which the output says out loud rather than letting '
      + 'a player believe a window ran; log stream is refused, because a live '
      + 'tail runs until it is interrupted and this terminal cannot interrupt '
      + 'anything.',
    command: 'log',
    run: 'sysadmin',
    why: 'The mac dialect, behind the same promotion and the same box.',
  },
  {
    id: 'cmd.brew',
    surface: 'cmd',
    control: 'brew <install <formula> | list | upgrade>',
    does: 'Homebrew, refused honestly (0.33.0) - and the refusal is the '
      + 'teaching. Homebrew is not part of macOS: it is a third-party manager '
      + 'somebody installs by hand, and these desks are MDM-enrolled, so their '
      + 'software comes from the management catalogue. zsh\'s own '
      + 'command-not-found, then the true reason. A simulated brew install '
      + 'would have been a fabricated package manager on a box that has none, '
      + 'which teaches exactly the wrong instinct about a managed fleet.',
    command: 'brew',
    run: 'sysadmin',
    why: 'The mac dialect, behind the same promotion and the same box.',
  },
  {
    id: 'cmd.gagged-tools-installed',
    surface: 'cmd',
    control: 'htop | traceroute <host> | ifconfig | netstat -tlnp',
    does: 'The four tools the 0.16.0 gags pointed at, now that apt has installed '
      + 'them (0.20.0): htop opens a curses process snapshot off the ps aux data; '
      + 'traceroute traces the same-subnet host in the unix shape (the family diff '
      + 'from Windows tracert); ifconfig prints the box\'s address with a DOTTED '
      + 'netmask (vs ip a\'s /24); netstat -tlnp lists the same listeners ss does '
      + 'in net-tools\' older PID/Program shape. Before install each is still the '
      + 'command-not-found gag; the box\'s installed_packages set is the switch.',
    run: 'sysadmin',
    why: 'They run only past an apt install inside the ssh session the promotion '
      + 'unlocks - and only once the package is on the box, which no service-desk '
      + 'week and no stock box reaches.',
  },
  {
    id: 'cmd.ps',
    surface: 'cmd',
    control: 'ps aux',
    does: 'Lists the box\'s processes in the USER/PID/%CPU/%MEM/VSZ/RSS/TTY/STAT/'
      + 'START/TIME/COMMAND shape: systemd as PID 1 and a row per running unit, '
      + 'a downed unit honestly absent.',
    command: 'ps',
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.ip',
    surface: 'cmd',
    control: 'ip a',
    does: 'Shows the box\'s address in the eth0 <...> mtu 1500 / inet X/24 CIDR '
      + 'shape - the family difference from ipconfig\'s dotted subnet-mask row - '
      + 'off the estate\'s own derived address.',
    command: 'ip',
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.ls',
    surface: 'cmd',
    control: 'ls -la',
    does: 'Lists a directory in the unix dialect: the mode/owner/group/size/'
      + 'mtime columns that are the family difference from dir\'s volume header '
      + 'and free-space footer.',
    command: 'ls',
    run: 'sysadmin',
    why: 'It is a unix-dialect verb, so it only exists inside an ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.id',
    surface: 'cmd',
    control: 'id [<user>]',
    does: 'Prints a user\'s identity on the box (0.21.0) in the real '
      + 'uid=1000(user) gid=1000(user) groups=1000(user),4(adm),27(sudo) shape: '
      + 'bare id is the ssh login, id <name> is that user, read off the box\'s '
      + 'derived user set (root, the daemons\' service accounts, the login), with '
      + 'the honest "no such user" for one the box does not have.',
    command: 'id',
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.whoami.unix',
    surface: 'cmd',
    control: 'whoami',
    does: 'Prints just the login name of the ssh session (0.21.0) - the family '
      + 'difference from the Windows whoami\'s domain\\user, a Linux box answers '
      + 'the bare login and nothing else.',
    command: 'whoami',
    run: 'sysadmin',
    why: 'The unix whoami is its own verb inside the ssh session - the Windows '
      + 'desktop whoami (cmd.whoami) is the desk-tier one; the bare-login shape '
      + 'lives past the promotion the server tier is behind.',
  },
  {
    id: 'cmd.getent',
    surface: 'cmd',
    control: 'getent passwd [<user>]',
    does: 'Reads the box\'s user database (0.21.0) in /etc/passwd\'s exact '
      + '7-colon-field shape (name:x:uid:gid:gecos:home:shell): getent passwd '
      + 'lists every account, getent passwd root is the one line, and a name the '
      + 'box does not have is the honest empty answer - off the same derived user '
      + 'set id reads.',
    command: 'getent',
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.chmod',
    surface: 'cmd',
    control: 'chmod <mode> <path>',
    does: 'Rewrites a file\'s permission bits (0.21.0), octal (640) or symbolic '
      + '(g+r, applied to the current mode), writing the SAME fs_mode field ls -la '
      + 'renders to the -rw-r----- column - so a listing after it reflects the '
      + 'change with no drift. Silent on success. The fix half of the '
      + 'permission-denied incident; the Windows family has no octal-permission '
      + 'concept.',
    command: 'chmod',
    actions: [FS_ACTIONS.chmod],
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks - only a Systems Engineer changes a file\'s mode on a '
      + 'server.',
  },
  {
    id: 'cmd.chown',
    surface: 'cmd',
    control: 'chown <owner[:group]> <path>',
    does: 'Rewrites a file\'s owner and group (0.21.0), writing the SAME '
      + 'fs_owner/fs_group fields ls -la reads, validated against the box\'s real '
      + 'user set (a chown to a user the box does not have is refused). A bare '
      + 'chown user leaves the group; chown user:group sets both. Silent on '
      + 'success. The other half of the permission-denied fix.',
    command: 'chown',
    actions: [FS_ACTIONS.chown],
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks - only a Systems Engineer changes a file\'s owner on a '
      + 'server.',
  },
  {
    id: 'cmd.ss',
    surface: 'cmd',
    control: 'ss -tlnp',
    does: 'Lists the box\'s listening sockets in the State/Recv-Q/Send-Q/Local '
      + 'Address:Port shape off its RUNNING units (sshd:22, nginx:80/443, the '
      + 'app on a loopback 8000), -p adding the users:(("proc",pid=)) column - '
      + 'a downed unit is honestly absent, which is how a not-listening service '
      + 'is diagnosed. The modern replacement for netstat.',
    command: 'ss',
    run: 'sysadmin',
    why: 'It reads the box\'s listeners over an ssh session, so it only runs past '
      + 'the promotion that unlocks ssh - the threshold no service-desk week '
      + 'crosses.',
  },
  {
    id: 'cmd.dig',
    surface: 'cmd',
    control: 'dig <name>',
    does: 'Resolves a name over the estate DNS in DiG\'s full shape: the QUESTION '
      + 'and ANSWER sections (name. TTL IN A addr) and the Query time/SERVER/MSG '
      + 'SIZE footer, with the honest NXDOMAIN answer for a name the world does '
      + 'not hold.',
    command: 'dig',
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.host',
    surface: 'cmd',
    control: 'host <name>',
    does: 'The terse resolver: "name has address addr" for a name the estate '
      + 'holds, and "Host <name> not found: 3(NXDOMAIN)" for one it does not - '
      + 'dig\'s one-line cousin over the same DNS graph.',
    command: 'host',
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.ping.unix',
    surface: 'cmd',
    control: 'ping [-c N] <host>',
    does: 'Pings a host the LINUX way: continuous by default (it says so and '
      + 'names -c, never the Windows 4-and-stop), and with -c N a bounded run '
      + 'plus the transmitted/received/loss statistics block, over the estate\'s '
      + 'own reachability.',
    command: 'ping',
    run: 'sysadmin',
    why: 'The unix ping is its own verb inside the ssh session - the Windows '
      + 'desktop ping (cmd.ping) is the desk-tier one; this continuous-by-default '
      + 'shape lives past the promotion the server tier is behind.',
  },
  {
    id: 'cmd.curl',
    surface: 'cmd',
    control: 'curl -I <url>',
    does: 'Fetches a URL\'s response line and headers over a box that serves it: '
      + 'HTTP 200 when nginx and the app behind it are up, the honest 502 when '
      + 'nginx answers but its upstream app is down, and curl: (7) Failed to '
      + 'connect when nothing is serving - the HTTP truth, no Windows cousin.',
    command: 'curl',
    run: 'sysadmin',
    why: 'A unix-dialect verb reading the box\'s web units, reachable only inside '
      + 'the ssh session the promotion unlocks.',
  },
  {
    id: 'cmd.certbot',
    surface: 'cmd',
    control: 'certbot <renew|certificates>',
    does: 'The cert-expiry fix (0.19.0): "renew" replaces an EXPIRED certificate '
      + 'and reloads the service, flipping the cert_expired flag the served box '
      + 'refuses on - and, against a valid cert, refuses with certbot\'s own "not '
      + 'yet due for renewal". "certificates" reads the box\'s cert state without '
      + 'changing it. The service is up the whole time; it is the certificate that '
      + 'was refused.',
    command: 'certbot',
    actions: [INCIDENT_ACTIONS.certRenew],
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks.',
  },
  {
    id: 'cmd.postmortem',
    surface: 'cmd',
    control: 'postmortem <file <unit> | list>',
    does: 'Writes the blameless post-incident record that CLOSES an incident '
      + '(0.19.0): "file" records the filing on the append-only postmortems trail '
      + 'and prints the authored, gated write-up (what happened, the timeline, '
      + 'what the SYSTEM let happen, the follow-up - never a name), refusing on a '
      + 'unit still down or already written up; "list" reads the trail back. The '
      + 'failed-deploy incident closes on this, not on the restart.',
    command: 'postmortem',
    actions: [INCIDENT_ACTIONS.postmortemFile],
    run: 'sysadmin',
    why: 'A unix-dialect verb, reachable only inside the ssh session the '
      + 'promotion unlocks - only a Systems Engineer files a postmortem.',
  },
  {
    id: 'cmd.exit',
    surface: 'cmd',
    control: 'exit',
    does: 'Leaves the ssh session and comes back to the Windows desktop '
      + 'terminal, the prompt switching from user@host back to C:\\>.',
    command: 'exit',
    run: 'sysadmin',
    why: 'There is no session to exit without one, and a session needs the '
      + 'promotion and an ssh in first.',
  },
  {
    id: 'cmd.logout',
    surface: 'cmd',
    control: 'logout',
    does: 'The same as exit: closes the connection and returns to the desktop '
      + 'terminal, because a shell answers to both.',
    command: 'logout',
    run: 'sysadmin',
    why: 'The other spelling of leaving the session, reachable only once there '
      + 'is a session to leave.',
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

  /* -- Display Properties: the desktop the box runs (0.27.0) --------------- */
  {
    id: 'display.window',
    surface: 'display',
    control: 'window-display',
    does: 'Display Properties: what this machine is running - the desktop and '
      + 'the distribution under it - and the two lists it is chosen from, read '
      + 'live off the box rather than off what was last pressed.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'week',
  },
  {
    id: 'display.refused',
    surface: 'display',
    control: 'display-desktop-gnome (below the engineer tier)',
    does: 'Refuses a service-desk player their own desktop and SAYS why - IT '
      + 'issues the desk a Windows box and keeps the image, and putting your own '
      + 'on it arrives with the promotion. The chrome does not move and the '
      + 'sentence is beside the button that was pressed, rather than a control '
      + 'that is greyed out and explains nothing.',
    run: 'week',
  },
  {
    id: 'display.desktop',
    surface: 'display',
    control: 'display-desktop-kde, display-desktop-gnome, '
      + 'display-desktop-xfce, display-desktop-lxqt, '
      + 'display-desktop-cinnamon, display-desktop-deskpro',
    does: 'Installs a different desktop on the machine, live: the panel moves '
      + 'to the edge that desktop puts it on, the launcher becomes that '
      + 'desktop\'s (Start, Kickoff, Activities, Menu, Applications, LXQt), the '
      + 'window list is there or genuinely is not, and every open titlebar is '
      + 're-chromed with the buttons that desktop has - GNOME with the close '
      + 'button and NO minimize or maximize anywhere in the document. The apps '
      + 'underneath are untouched: a skin is a look, and the same ticket is '
      + 'worked the same way under every one of them. The choice rides the save.',
    run: 'sysadmin',
    why: 'The desk is issued a Windows box and IT keeps the image: choosing a '
      + 'desktop is gated on the promotion, which no probation week reaches. The '
      + 'refusal below the tier is walked in the week run; this is the far side '
      + 'of the same gate.',
  },
  {
    id: 'display.two-panels',
    surface: 'display',
    control: 'display-desktop-mate',
    does: 'Installs the one desktop that has TWO panels: a menu bar along the '
      + 'top with the launcher in it, a taskbar along the bottom with the '
      + 'window list and the clock in it, and the split really that way round - '
      + 'one window list on the screen, in the lower bar, still answering. '
      + 'Switching to any other desktop takes the second bar back out of the '
      + 'document rather than emptying it, which is what keeps the six '
      + 'one-panel desktops exactly as they were.',
    run: 'sysadmin',
    why: 'Behind the same promotion gate as every other desktop: the desk is '
      + 'issued a Windows box and IT keeps the image.',
  },
  {
    id: 'display.mac-chrome',
    surface: 'display',
    control: 'display-desktop-orchard',
    does: 'Puts the design team\'s hand-me-down MacBook on the screen, which '
      + 'is the first desktop in this registry whose LAYOUT the shell could '
      + 'not previously describe: a MENU BAR along the top that belongs to '
      + 'whichever app has the keyboard and says which one that is, a DOCK '
      + 'along the bottom with the launcher and the open windows centred in it '
      + 'and their words clipped off, and the window buttons on the LEFT in '
      + 'close-minimize-zoom order - the muscle-memory joke, and the reason '
      + '`side` was declared in 0.27.0 with nothing using it. No distribution '
      + 'underneath it, because it is not Linux. Leaving takes both new '
      + 'primitives back out of the document.',
    run: 'sysadmin',
    why: 'The spare laptop goes to whoever is carrying an on-call phone, which '
      + 'is the same promotion gate every other desktop is behind - and the '
      + 'refusal below it is its own sentence, because "IT keeps the image" is '
      + 'an answer about a machine nobody asked about.',
  },
  {
    id: 'display.distro',
    surface: 'display',
    control: 'display-distro-ubuntu, display-distro-mint, display-distro-debian, '
      + 'display-distro-fedora, display-distro-rhel, display-distro-opensuse',
    does: 'Changes the distribution under the desktop without touching the '
      + 'desktop - the second axis, and the proof they are independent: a Fedora '
      + 'box running KDE is a real machine. It decides which package-manager verb '
      + 'the box speaks (apt, dnf, zypper, pacman), which is the difference the '
      + 'terminal then answers in - and Debian is the row that proves a distro '
      + 'may be temperament alone, speaking the same apt Ubuntu does.',
    run: 'sysadmin',
    why: 'Behind the same promotion gate as the desktop it sits under, and only '
      + 'legible on a box that has a distro at all.',
  },
  {
    id: 'display.distro-pick',
    surface: 'display',
    control: 'display-distro-arch, display-desktop-pick, display-pick-*',
    does: 'The one distribution that ships NO desktop, chosen on a machine that '
      + 'has none either (0.28.0): instead of installing something nobody asked '
      + 'for, the window opens a pick and makes the player choose a desktop, '
      + 'which is the truest single thing this version says about Arch. The pick '
      + 'sets both axes in ONE call, so the machine is never briefly running a '
      + 'distribution nobody chose; picking Arch on a box that is ALREADY on '
      + 'Linux asks nothing, because there is a desktop there to leave alone.',
    run: 'sysadmin',
    why: 'Behind the same promotion gate as every other desktop and '
      + 'distribution: the desk is issued a Windows box and IT keeps the image.',
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
    id: 'chat.typing',
    surface: 'chat',
    control: 'chat-typing',
    does: 'Somebody who has said "Hi." and nothing else, the dots cycling '
      + 'while they compose, and how many more minutes of the shift waiting '
      + 'it out costs against one click for asking.',
    run: 'week',
  },

  /* -- the RMM / monitoring board (0.9.0) --------------------------------- */
  {
    id: 'monitor.window',
    surface: 'monitor',
    control: 'window-monitor',
    does: 'The RMM / monitoring board: per monitoring-only customer, the watched '
      + 'things - a backup, a certificate, a disk - each a row with a live '
      + 'status read off the estate, the acknowledge and escalate the contract '
      + 'allows, and no fix it does not. It is a base tool, so it opens on the '
      + 'probation desk too, where it says plainly that there is no monitoring '
      + 'contract here to watch - the lit board, its rows, its noise and the '
      + 'escalate that resolves an alert ticket live at the MSP, and are driven '
      + 'through the real dispatch path in monitor.test.ts, which is where the '
      + 'third employer is reachable and the browser walk (second employer at '
      + 'the furthest) is not.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'week',
  },

  /* -- the plan surface (E10, 0.29.0) ------------------------------------- */
  {
    id: 'projects.window',
    surface: 'projects',
    control: 'window-projects',
    does: 'The plan surface: the project a promoted engineer is handed, its '
      + 'four phases with the DATE each one is due and the working time to it, '
      + 'the task each phase is worked through, and the rule set as far as the '
      + 'audit has established one. It is a base tool, so it opens on a '
      + 'service-desk desk too - where it says, in the window, that projects '
      + 'are the engineers\' tier, the same refusal ssh gives and the same '
      + 'place Display Properties puts it.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'sysadmin',
    why: 'A project is assigned by the promotion and to a desk that has an '
      + 'estate to do one on, so the lit board exists only in the run that '
      + 'crosses the engineer tier at the MSP; no probation week can reach it.',
  },
  {
    id: 'projects.phase',
    surface: 'projects',
    control: 'projects-phase-<phase>',
    does: 'Standing on a phase of the plan: its date said against now ("Due '
      + 'Day 2 15:00 - 4h 20m of working time", and the other way round once '
      + 'the date has gone by), what the phase actually is, and - on the '
      + 'cutover - whether the change window is still to come or open right '
      + 'now, in words. This is the half of the mechanic that makes a date '
      + 'three days out mean anything.',
    run: 'sysadmin',
    why: 'It draws a live project, which only exists past the promotion at the '
      + 'MSP - the same threshold the board itself lives behind.',
  },
  {
    id: 'projects.task',
    surface: 'projects',
    control: 'projects-open-task-<ticket>',
    does: 'The plan\'s way into the work: a phase task that has arrived opens '
      + 'in the queue at that ticket, and one that has not is visibly not yet '
      + 'raised - the milestone lock, said as "it arrives when the task before '
      + 'it closes" rather than as a row that does nothing.',
    run: 'sysadmin',
    why: 'The task rows are a project\'s tasks, and there is no project to have '
      + 'them before the promotion at the MSP.',
  },

  /* -- the sheet (0.30.0) -------------------------------------------------- */
  {
    id: 'timesheet.window',
    surface: 'timesheet',
    control: 'window-timesheet',
    does: 'The sheet as a window: the week per day, what the records say each '
      + 'line was worth, what the player says it was where those differ, the '
      + 'sentence each line goes out as, and the rest of the day underneath as '
      + 'time on nobody\'s invoice. It is the SERVICE DESK shape here, which is '
      + 'the joke the mechanic opens with - one bucket a day at seven and a '
      + 'half hours, attributed to nobody, with nothing on it to decide and one '
      + 'thing to do with it - and it is a read of the same state the terminal '
      + 'prints, so filing it from the terminal freezes this window behind it.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'week',
  },
  {
    id: 'timesheet.claim',
    surface: 'timesheet',
    control: 'timesheet-minutes-<line>, timesheet-put-<line>',
    does: 'The pad, done with the truth on the screen beside it: type a number '
      + 'of minutes against a line and put it in. The claimed figure appears '
      + 'next to the worked one and the worked one does not move - the record '
      + 'and the claim are two pieces of paper from that moment on - and the '
      + 'window says out loud that the records still say what they said.',
    actions: [TIMESHEET_ACTIONS.claim],
    run: 'sysadmin',
    why: 'The edit only exists on the ENGINEER\'s shape: a service-desk sheet '
      + 'is one unattributed bucket with nothing on it to argue with, so there '
      + 'is no line to pad until the promotion at the MSP, which no probation '
      + 'week reaches.',
  },
  {
    id: 'timesheet.detail',
    surface: 'timesheet',
    control: 'timesheet-detail-<line>',
    does: 'The other axis, and the one the research says actually decides a '
      + 'challenge: how much of a sentence goes beside the number. A line '
      + 'written out in full carries the date, the estate and the hours; the '
      + 'other option is the word "consulting", and the window shows the line '
      + 'as it will read either way - so a vague line LOOKS vague, next to a '
      + 'full one, without a word of advice about which to pick.',
    actions: [TIMESHEET_ACTIONS.claim],
    run: 'sysadmin',
    why: 'The same threshold the pad lives behind: a desk sheet has no line '
      + 'whose wording anybody would ever read, so the detail choice exists '
      + 'only on the per-customer shape past the promotion.',
  },
  {
    id: 'timesheet.submit',
    surface: 'timesheet',
    control: 'timesheet-submit',
    does: 'Sends the sheet in from the window: the stamp changes to the minute '
      + 'it went, every edit affordance on every line goes away, and the button '
      + 'itself is refused in the world\'s own sentence if it is pressed again. '
      + 'A filed piece of paper, said plainly.',
    actions: [TIMESHEET_ACTIONS.submit],
    run: 'sysadmin',
    why: 'A sheet can be filed exactly once a week, and the week run files the '
      + 'desk one from the terminal. So the button is walked in the run whose '
      + 'sheet is still open - which is also the only one where filing it means '
      + 'anything, because it is the one with a padded line on it.',
  },

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
    id: 'browser.nohello',
    surface: 'browser',
    control: 'browser-site-nohello',
    does: 'The page the veteran links in his own conversation, having read it, '
      + 'agreed with it and opened with "Hi." the next morning anyway.',
    run: 'week',
  },
  {
    id: 'browser.bookmarks',
    surface: 'browser',
    control: 'browser-home-button',
    does: 'Back to the bookmarks, which is the whole of the navigation.',
    run: 'week',
  },

  /* -- the web store, the install, and the toys it puts on the machine ----- */
  {
    id: 'browser.store',
    surface: 'browser',
    control: 'browser-site-store',
    does: 'Opens the web store: a late-90s shareware download page listing the '
      + 'programs this build installs, the ones it only pretends to, and the '
      + 'policy notice that says installing works and gets logged anyway.',
    run: 'store',
    why: 'The store is a bookmark in every week, but the run that reads it is '
      + 'the one that then installs off it - and installing is the class of '
      + 'move the golden weeks are kept clear of.',
  },
  {
    id: 'store.install',
    surface: 'browser',
    control: 'store-install-arcade, store-install-mediaplayer, '
      + 'store-install-solitaire, store-install-minesweeper',
    does: 'Installs a program off the store: dispatches the install verb that '
      + 'writes the audit trail, adds it to the save-carried install set, and '
      + 're-mounts the desktop so its icon and start-menu entry appear at once '
      + 'without a reload.',
    actions: [SOFTWARE_ACTIONS.install],
    run: 'store',
    why: 'An install against a locked-down policy is the one move the golden '
      + 'weeks never make, so it is walked here rather than in a week whose '
      + 'byte-for-byte sameness is the thing being protected.',
  },
  {
    id: 'store.uninstall',
    surface: 'browser',
    control: 'store-uninstall-arcade, store-uninstall-mediaplayer, '
      + 'store-uninstall-solitaire, store-uninstall-minesweeper',
    does: 'Takes an installed toy back off: dispatches the uninstall verb, '
      + 'removes it from the install set and the desktop live, and leaves the '
      + 'install line on the audit - the record that it was there outliving the '
      + 'app, which is the whole point of the trail.',
    actions: [SOFTWARE_ACTIONS.uninstall],
    run: 'store',
    why: 'The mirror of the install, and reachable only in the run that '
      + 'installed something first; the golden weeks have nothing to uninstall.',
  },
  {
    id: 'arcade.window',
    surface: 'arcade',
    control: 'window-arcade',
    does: 'Office Arcade, once installed: a real slack app that drains stress '
      + 'faster than the Browser and hides worse, with a panic key printed on '
      + 'it and a game that is one game.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'store',
    why: 'An installable app has no window until it is installed, and only the '
      + 'store run installs it; the base roster never holds it.',
  },
  {
    id: 'arcade.play',
    surface: 'arcade',
    control: 'arcade-play',
    does: 'Plays the toy for the relief it exists to give - the strongest '
      + 'stress drain in the game while the window is genuinely up, which is '
      + 'the better half of the locked-down shop\'s trade.',
    run: 'store',
    why: 'The control only exists on a window that only exists once the toy is '
      + 'installed, which is the store run and no other.',
  },
  {
    id: 'mediaplayer.window',
    surface: 'mediaplayer',
    control: 'window-mediaplayer',
    does: 'The Media Player, once installed: the second real slack app, playing '
      + 'no sound at all through a visualiser that is very sure of itself.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'store',
    why: 'The second installable, present only in the run that installs it and '
      + 'absent from the base roster the golden weeks mount.',
  },
  {
    id: 'mediaplayer.play',
    surface: 'mediaplayer',
    control: 'media-play',
    does: 'Starts and stops the player, which drains stress at the installed-'
      + 'toy rate while it is up and is the second toy\'s share of the trade.',
    run: 'store',
    why: 'A control on a window that only the store run mounts; nothing in a '
      + 'golden week ever installs the app it belongs to.',
  },
  {
    id: 'solitaire.window',
    surface: 'solitaire',
    control: 'window-solitaire',
    does: 'Office Solitaire, once installed: a real game of Klondike, and a real '
      + 'slack app that drains stress at the installed-toy rate while it is up '
      + 'and hides no better than the game it actually is.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'store',
    why: 'The third installable, present only in the run that installs it and '
      + 'absent from the base roster the golden weeks mount.',
  },
  {
    id: 'solitaire.play',
    surface: 'solitaire',
    control: 'solitaire-stock',
    does: 'Turns the stock over onto the waste - the one always-legal move in '
      + 'any deal - which is the toy being genuinely played and drips relief at '
      + 'the installed-toy rate for as long as it is on the screen.',
    run: 'store',
    why: 'A control on a window only the store run mounts; no golden week ever '
      + 'installs the game it belongs to.',
  },
  {
    id: 'minesweeper.window',
    surface: 'minesweeper',
    control: 'window-minesweeper',
    does: 'Office Minesweeper, once installed: a real game of Minesweeper, and a '
      + 'real slack app that drains stress at the installed-toy rate while it is '
      + 'up and hides no better than the game it actually is.',
    window: { routes: ['start-menu', 'desktop-icon'] },
    run: 'store',
    why: 'The fourth installable, present only in the run that installs it and '
      + 'absent from the base roster the golden weeks mount.',
  },
  {
    id: 'minesweeper.play',
    surface: 'minesweeper',
    control: 'minesweeper-flag-toggle, minesweeper-cell-*',
    does: 'Flags a covered square and then clears one - the flag mode marks a '
      + 'cell and a left-click reveals a first-click-safe region that floods, '
      + 'which is the toy being genuinely played and drips relief at the '
      + 'installed-toy rate for as long as it is on the screen.',
    run: 'store',
    why: 'Controls on a window only the store run mounts; no golden week ever '
      + 'installs the game they belong to.',
  },
  {
    id: 'caught.scene-arcade',
    surface: 'caught',
    control: 'window-arcade at an arrival',
    does: 'The installed game, caught on the screen from the doorway - a scene '
      + 'about the specific thing that was up, the same slack-caught class the '
      + 'forum and the bubbles use.',
    actions: [DAY_ACTIONS.bossCaught],
    scene: 'caught.arcade',
    run: 'store',
    why: 'Being caught at an installed toy needs the toy installed and on the '
      + 'screen at an arrival, which only happens in the run that installed it.',
  },
  {
    id: 'caught.scene-mediaplayer',
    surface: 'caught',
    control: 'window-mediaplayer at an arrival',
    does: 'The installed media player, caught mid-nothing at an arrival: the '
      + 'second toy\'s own slack-caught scene, because the joke is the specific '
      + 'thing that was on the screen.',
    actions: [DAY_ACTIONS.bossCaught],
    scene: 'caught.mediaplayer',
    run: 'store',
    why: 'Same as the game: it needs the second toy installed and up at an '
      + 'arrival, which is the store run and no golden week.',
  },
  {
    id: 'caught.scene-solitaire',
    surface: 'caught',
    control: 'window-solitaire at an arrival',
    does: 'The installed card game, caught mid-hand at an arrival: the lead '
      + 'watches a real move land before he mentions the audit, because the joke '
      + 'is the specific thing that was on the screen.',
    actions: [DAY_ACTIONS.bossCaught],
    scene: 'caught.solitaire',
    run: 'store',
    why: 'Needs the game installed and up at an arrival, which is the store run '
      + 'and no golden week - the weeks install nothing.',
  },
  {
    id: 'caught.scene-minesweeper',
    surface: 'caught',
    control: 'window-minesweeper at an arrival',
    does: 'The installed Minesweeper, caught mid-square at an arrival: the lead '
      + 'watches you clear a corner before he mentions the audit, because the '
      + 'joke is the specific thing that was on the screen.',
    actions: [DAY_ACTIONS.bossCaught],
    scene: 'caught.minesweeper',
    run: 'store',
    why: 'Needs the game installed and up at an arrival, which is the store run '
      + 'and no golden week - the weeks install nothing.',
  },
  {
    id: 'caught.scene-software',
    surface: 'caught',
    control: 'caught-file (the install audit read at an arrival)',
    does: 'The telling-off that is not about a screen at all: the lead reads '
      + 'the install audit, finds a program installed against policy, and says '
      + 'so - and taking the program off does not take the line off.',
    actions: [DAY_ACTIONS.bossCaught],
    scene: 'caught.software',
    run: 'store',
    why: 'Arming it is a program on the audit trail under a locked-down policy '
      + 'with the toy off the screen at an arrival, which is the install the '
      + 'golden weeks never make.',
  },
  {
    id: 'caught.scene-rude',
    surface: 'caught',
    control: 'window-caught (a rude reply sent while he was at your shoulder)',
    does: 'The one telling-off about a person rather than a screen: the lead '
      + 'was present in the minute a user got told where to go, heard it, and '
      + 'says so - and it is on the file as tone precisely because the ticket '
      + 'still got fixed.',
    actions: [DAY_ACTIONS.bossCaught],
    scene: 'caught.rude',
    run: 'fired',
    why: 'Arming it needs the lead actually present in the minute an aggressive '
      + 'reply is sent, which is a patrol arrival spent being rude rather than '
      + 'caught at a screen - a week being worked properly can spare the arrival '
      + 'for one such scene, not for this on top of the others.',
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
  [PROJECT_ACTIONS.screamNoticed]: 'Somebody at a factory noticing that the '
    + 'thing they used yesterday has stopped working, on the morning after a '
    + 'cutover that left their rule behind. Nobody presses it and nobody can: '
    + 'the day loop settles it at the next start of shift off `screamTestDue`, '
    + 'the same rail the compliance sweep and the unverified enrolment arrive '
    + 'on, and it charges nothing - what the player meets is the ticket it '
    + 'raises beside it, with the rule named on it (walked as cmd.fw).',
  [INVOICE_ACTIONS.escalate]: 'Somebody in a client\'s accounts payable '
    + 'getting to your line. Nobody presses it and nobody can: the day loop '
    + 'settles it at the next start of shift off `invoiceLadderDue` - the same '
    + 'rail the scream test and the compliance sweep arrive on - and all it '
    + 'writes down is WHICH rung has already been handed over, because where '
    + 'an account actually stands is derived off the sheet and the customer\'s '
    + 'own estate log every time anybody asks. What the player meets is the '
    + 'thread in the mail app, the row under `timesheet`, and - at the fourth '
    + 'rung - the lead in the chat window, all three of which are surfaces the '
    + 'walk already drives. The ladder itself needs a week of padding and four '
    + 'day boundaries to walk end to end, so the run that drives every rung, '
    + 'the breakdown, the escape and the departure is `shell/invoice.test.ts` '
    + 'rather than a browser - the same arrangement the redundancy ending has.',
  [PROJECT_ACTIONS.reportAnswered]: 'The org having answered a status report: '
    + 'the meeting about the meeting after a red, and the question after a '
    + 'green that a date has since gone past. Nobody presses it - it is the '
    + 'day loop writing down that a beat has happened so it happens once - and '
    + 'what the player meets is the notice and the three lines in it (walked '
    + 'as cmd.fw-report).',
  [SELINUX_ACTIONS.selinuxNoticed]: 'The overnight compliance sweep reading a '
    + 'box that was left in permissive mode, dispatched by the day loop at the '
    + 'next start of shift - the same rail the unverified enrolment\'s bill '
    + 'arrives on. Nobody presses it and nobody can: it is somebody upstream '
    + 'reading a report, and what the player meets is the notice and the mail '
    + 'it puts in their inbox (walked as cmd.setenforce).',
  // The co-managed RACI's two (E9, 0.37.0). Neither is a button and neither
  // can be: one is the terminal writing down what a player has just been
  // allowed to do, the other is another company's IT manager reading his own
  // monitoring the next morning. What the player meets is the mail from him
  // and the notice above it; the whole arc - restart, stamp, complaint, charge
  // - is driven through the real terminal and the real day driver in
  // `shell/raci-teeth.test.ts`, which is a second day and so out of the browser
  // walk's reach.
  [WORLD_ACTIONS.raciViolation]: 'The record of a remediation done on a '
    + 'co-managed customer\'s own box with nobody told - their sysadmin\'s box '
    + 'under the RACI, which the MSP\'s account reaches anyway. Nobody presses '
    + 'it: the terminal dispatches it AFTER the action it is about has already '
    + 'succeeded, because the whole of this wall is that it refuses nothing. '
    + 'What it writes is the trail on the box and the minute of the last one.',
  [WORLD_ACTIONS.raciComplaint]: 'The other IT team getting in touch: the '
    + 'customer\'s own IT manager has read his overnight monitoring, found the '
    + 'MSP on a box the RACI gives to him, and said so. Settled by the day '
    + 'driver at the next start of shift - the same rail the compliance sweep '
    + 'arrives on - and it charges reputation, because nobody suspects '
    + 'anything: he knows exactly what happened and thinks less of the desk '
    + 'that did not mention it. The player meets the notice and his mail.',
  [WORLD_ACTIONS.raciFirstComplaint]: 'The date on his first letter, stamped '
    + 'by the day driver in the same breath as the complaint above and refused '
    + 'on every morning after it. Nothing presses it and nothing it writes is '
    + 'ever shown as a number: what the player meets is the ABSENCE of a bug - '
    + 'a second complaint that does not re-date the mail already in the inbox. '
    + 'Driven end to end over two mornings in `shell/raci-teeth.test.ts`.',
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
  [DAY_ACTIONS.meetingRecap]: 'The room emptying, which is what the recap '
    + 'mail is stamped from. Dispatched by the day loop at the end of a block '
    + 'nobody chose to be in; the player meets it as a thread in the inbox '
    + 'with the whole meeting in it.',
  [DAY_ACTIONS.reviewRedundant]: 'The third ending, dispatched by the day loop '
    + 'when the week cleared its bar and the ranking still put two other '
    + 'people above the line. Career-layer: it belongs to a week of the '
    + 'employer arc that the probation week is not, and the walk that drives '
    + 'it is `scripted-arc.test.ts` rather than a browser.',
  [DAY_ACTIONS.onCallAnswer]: 'A 3am page caught: the day loop banking the '
    + 'uptime the minute a real fire\'s unit is answering again over ssh. The '
    + 'player presses no button for it - the fix is the systemctl restart in the '
    + 'terminal, and this reads that flip off the unit state and reads it once. '
    + 'On-call is the engineer tier\'s, a week of the employer arc the probation '
    + 'week is not; the loop is driven end to end in `on-call.test.ts`.',
  [DAY_ACTIONS.onCallMiss]: 'A 3am page missed: the clock-off that ends the '
    + 'on-call day finding a real fire still down. Nobody presses it - the '
    + 'downtime is the consequence of never reaching the terminal - and it reads '
    + 'at the review the way a breach does. Driven in `on-call.test.ts`.',
  [DAY_ACTIONS.onCallScramble]: 'A flap scrambled for: the day loop catching a '
    + 'page\'s unit restarted before it would have settled itself. The control '
    + 'the player did touch is the systemctl restart in the terminal; this is '
    + 'the world pricing it the alert-fatigue cost it was. Driven in '
    + '`on-call.test.ts`.',
  // The exec-exception grants (E8, 0.22.0): the VIP tickets at the corporate
  // employer close on these - MFA off the CEO, the EA delegate, the filter
  // exemption. They are player verbs with a real fix, but they live at the
  // FOURTH employer, which the browser total-walk does not reach (it stops at
  // the second) - the same reason the monitoring board's MSP behaviour and the
  // engineer-tier verbs are proven in unit tests rather than the walk. They are
  // driven end to end through the real dispatch path in `corporate.test.ts`; the
  // corporate employer's shell surface and its own walk are a later pass's, so
  // no browser control reaches them yet.
  [HELPDESK_ACTIONS.accountRemoveMfa]: 'Taking the second factor off an '
    + 'executive\'s account at their insistence - the flagship VIP exception. '
    + 'Closes the CEO-MFA ticket at the corporate employer; driven in '
    + '`corporate.test.ts`, out of the browser walk\'s reach.',
  [HELPDESK_ACTIONS.accountGrantMailboxDelegate]: 'Granting FullAccess to a '
    + 'mailbox - the EA-delegate onboarding, and the persistence a later BEC '
    + 'hunt finds. Closes the delegate ticket at the corporate employer; driven '
    + 'in `corporate.test.ts`, out of the browser walk\'s reach.',
  [HELPDESK_ACTIONS.accountSetFilterExempt]: 'Taking a mailbox off the mail '
    + 'filter - the exec-mail-skips-filtering bypass, granted. Closes the '
    + 'filter-exemption ticket at the corporate employer; driven in '
    + '`corporate.test.ts`, out of the browser walk\'s reach.',
  // The BEC incident response (E8, 0.22.0, Pass B): the ordered verbs the
  // corporate P1 closes on - disable the compromised exec, revoke the stolen
  // session (the shared revoke verb already has a control), pull the malicious
  // inbox rule, and tear down the delegate. Player verbs with a real fix, but at
  // the FOURTH employer the browser total-walk does not reach (it stops at the
  // second) - the same reason the exec-exception grants above and the engineer-
  // tier verbs are proven in unit tests rather than the walk. Driven end to end
  // through the real dispatch path in `bec.test.ts`.
  [HELPDESK_ACTIONS.accountDisable]: 'Switching a compromised executive account '
    + 'off - the first, containing move of the BEC incident response. Closes '
    + 'the disable clause of the corporate P1; driven in `bec.test.ts`, out of '
    + 'the browser walk\'s reach.',
  [HELPDESK_ACTIONS.accountRemoveMailboxRule]: 'Pulling the attacker\'s '
    + 'forwarding rule off a compromised mailbox - the teeth of the BEC hunt, '
    + 'the one step a password reset cannot stand in for. Closes the rule clause '
    + 'of the corporate P1; driven in `bec.test.ts`, out of the browser walk\'s '
    + 'reach.',
  [HELPDESK_ACTIONS.accountRemoveMailboxDelegate]: 'Tearing down the mailbox '
    + 'delegate the setup granted, now the incident\'s persistence vector - '
    + 'where the con lands. Closes the delegate clause of the corporate P1; '
    + 'driven in `bec.test.ts`, out of the browser walk\'s reach.',
  // The access-recertification rubber-stamp (E8, 0.23.0): accepting the CFO's
  // "just approve them all" on the Q3 review. A player verb with a real (bad)
  // effect - it fails the review closed - offered in the corporate dialogue at
  // the FOURTH employer, which the browser total-walk does not reach (it stops
  // at the second), the same reason the exec-exception and BEC verbs are proven
  // in unit tests rather than the walk. Driven through the real dispatch path in
  // `recert.test.ts`.
  [HELPDESK_ACTIONS.recertApproveAll]: 'Approving an access review wholesale - '
    + 'the manager\'s rubber-stamp, made a real action that fails closed (the '
    + 'findings stay live and the audit breaches). Offered in the recert dialogue '
    + 'at the corporate employer; driven in `recert.test.ts`, out of the browser '
    + 'walk\'s reach.',
  // The manager override / CYA (E8, 0.24.0): getting the ordering manager to SIGN
  // the risk acceptance is a player verb with a real effect (the 0.10.0
  // change_request reused as the risk_acceptance variant, its approve decision the
  // signature) offered in the override dialogue at the FOURTH employer, which the
  // browser total-walk does not reach (it stops at the second) - the same reason
  // the exec-exception, BEC and recert verbs are proven in unit tests. Driven
  // through the real dispatch path in `cya.test.ts`.
  [HELPDESK_ACTIONS.riskAcceptanceSign]: 'Getting the ordering manager to sign a '
    + 'risk acceptance - the CYA move made a real action: it records the accepting '
    + 'owner\'s approval on the risk-acceptance form, which is the sign-off the '
    + 'override ticket closes on (with the grant). Offered in the override dialogue '
    + 'at the corporate employer; driven in `cya.test.ts`, out of the browser '
    + 'walk\'s reach.',
  // The manager-override audit finding (E8, 0.24.0): the consequence the day
  // driver settles off the world, the same as the social-engineering fallout and
  // the recert follow-up. Nobody presses it - it is what happens the moment the
  // privileged grant is flagged - and it lands on the accepting owner who signed
  // (charging the desk nothing) or on the desk that granted it with nothing on
  // file (charging suspicion). Driven through the real dispatch path in
  // `cya.test.ts`.
  [WORLD_ACTIONS.overrideFallout]: 'The audit finding on a manager-ordered Domain '
    + 'Admin grant, landing where the sign-off puts it: on the accepting owner who '
    + 'signed the risk acceptance, or on the desk that granted it with nothing on '
    + 'file. Settled by the day driver at the corporate employer; driven in '
    + '`cya.test.ts`, out of the browser walk\'s reach.',
  // The legendary manager / implement-then-revert (E8, 0.25.0): the three verbs
  // the marquee scenario turns on. All player verbs with real effects (a real
  // config state change, a real captured-state difference, a real one-step
  // restore) offered at the FOURTH employer, which the browser total-walk does
  // not reach (it stops at the second) - the same reason the exec-exception, BEC,
  // recert and CYA verbs are proven in unit tests. Driven end to end through the
  // real dispatch path in `legendary.test.ts`.
  [HELPDESK_ACTIONS.serviceSetStartup]: 'Setting a service\'s startup type - the '
    + 'config change the seagull manager\'s mandate makes (flatten every service to '
    + 'Automatic) and the painful revert reconstructs by hand. Closes the mandate '
    + 'ticket and, by reconstruction, the revert ticket at the corporate employer; '
    + 'driven in `legendary.test.ts`, out of the browser walk\'s reach.',
  [HELPDESK_ACTIONS.captureRollback]: 'Capturing the rollback before a mandated '
    + 'change - the diligent step that copies a service\'s prior startup type onto '
    + 'the rollback record (the reused change_request), and the whole of what makes '
    + 'the later revert clean. Its effect is a real captured-state difference; '
    + 'driven in `legendary.test.ts`, out of the browser walk\'s reach.',
  [HELPDESK_ACTIONS.restoreFromRecord]: 'Restoring a service from its rollback '
    + 'record - the clean, one-step revert that reads the captured prior back and '
    + 'sets it, and refuses an empty record (which is the whole mechanic). Closes '
    + 'the revert ticket\'s clean path at the corporate employer; driven in '
    + '`legendary.test.ts`, out of the browser walk\'s reach.',
  // The VIP tier / shadow IT (E8, 0.26.0): the two device verbs the last E8
  // mechanic turns on. Both are player verbs with real effects - one refuses an
  // unenrolled device by name, the other is the only way to fix one - offered at
  // the FOURTH employer, which the browser total-walk does not reach (it stops at
  // the second), exactly as the four E8 mechanics before them. Driven end to end
  // through the real dispatch path in `vip.test.ts`.
  [HELPDESK_ACTIONS.mdmPushProfile]: 'Pushing the corporate mail profile to a '
    + 'device from the MDM console - the normal management verb, and the one that '
    + 'REFUSES an unenrolled device by name (which is the whole shadow-IT lesson: '
    + 'the desk lacks a channel, not authority). Closes half of the personal-device '
    + 'ticket at the corporate employer; driven in `vip.test.ts`, out of the '
    + 'browser walk\'s reach.',
  [HELPDESK_ACTIONS.deviceManualMailSetup]: 'Walking the owner through setting the '
    + 'mailbox up by hand - what a desk actually does about a device it cannot '
    + 'manage and cannot refuse. The only route to the unmanaged half of the '
    + 'personal-device ticket at the corporate employer; driven in `vip.test.ts`, '
    + 'out of the browser walk\'s reach.',
  // And the queue-jump's bill (E8, 0.26.0): the consequence the day loop settles
  // off the clock, the same shape as the override finding. Nobody presses it - it
  // is what happens when the deadline on whichever ticket was left waiting runs
  // out, and the two branches charge in two different currencies.
  [AUDIT_ACTIONS.auditDeal]: 'A first-line analyst\'s triage arriving on a '
    + 'ticket that has just been raised. Nobody presses it and nobody can: it '
    + 'is somebody else having already done the easy half of the job, '
    + 'dispatched by the day loop in the minute it deals the item, and what '
    + 'the player meets is the filing itself on the audit tab (walked as '
    + 'tickets.audit-panel).',
  [AUDIT_ACTIONS.vendorReply]: 'Second line coming back on a ticket the '
    + 'senior kept rather than handed over. Nobody presses it: it is somebody '
    + 'else finishing on their own timetable, settled by the day loop ninety '
    + 'minutes after the handoff went, and what the player meets is the '
    + 'notice and a ticket that finally closes (walked as tickets.retained).',
  [WORLD_ACTIONS.queueJumpFallout]: 'The cost of the queue-jump landing on '
    + 'whichever colliding ticket was left waiting: suspicion when the flagged '
    + 'caller goes over your head, reputation when the ordinary team sits blocked '
    + 'through the payment run. Dispatched by the day loop off a pure read when '
    + 'the clock runs out, never by a control; driven in `vip.test.ts`.',
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
  'login-desk',

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
  'presence-available',
  'presence-dnd',
  'presence-away',
  // The touch twin of the boss key: the on-screen jab that minimises the slack
  // windows, for the phone player who has no Backquote to press.
  'boss-panic',
  'notification-tray',
  'toast-dismiss',

  /* -- window chrome ------------------------------------------------------ */
  'minimize-*',
  'close-*',

  /* -- the desk ----------------------------------------------------------- */
  'desk-drink',
  'desk-tidy',
  'desk-beer',

  /* -- and the helper beside it, which has exactly one button ------------- */
  'assistant-dismiss',

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
  // The second queue (E9, 0.36.0). The strip is not on the window below the
  // senior rung and the confirm is not on a ticket of your own, which is why
  // the walk that drives them is its own run - but a control is a control, and
  // this list is the inventory rather than the itinerary.
  'tickets-tab-mine',
  'tickets-tab-audit',
  'audit-confirm',
  'audit-author-article',

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
  'hubbub-channel-*',
  'hubbub-open-ticket-*',
  // The cross-post request bar (mail / chat / a Hubbub message alike): the
  // three answers a request offers, keyed by the request id.
  'request-convert-*',
  'request-answer-*',
  'request-deflect-*',
  // and, once converted, the link to the ticket the paperwork became.
  'request-open-ticket-*',
  'chat-option-*',
  'chat-typing',
  'chat-restart',
  'chat-open-tickets',
  // The monitoring board's two verbs (0.9.0), one family each: acknowledge a
  // firing alert and escalate a real one to the customer's IT. They light up at
  // the MSP - a monitoring-only customer with a firing alert - which the browser
  // total-walk does not reach (it stops at the second employer). They are driven
  // through the real dispatch path in monitor.test.ts and declared here so that
  // a control on the board is a control somebody wrote down, not a stray the
  // seen-controls gate would flag if a later MSP walk ever met it.
  'monitor-ack-*',
  'monitor-escalate-*',
  // The plan surface's two families (0.29.0): the phase rows, which are the
  // board's only navigation, and the way into each phase's ticket. Both live
  // past the promotion at the MSP, walked in the sysadmin run.
  'projects-phase-*',
  'projects-open-task-*',
  // The sheet's three per-line controls (0.30.0), keyed by the line HANDLE -
  // `3.2`, day and position, the same address the terminal knows the line by,
  // and deliberately not the bucket, which has a bar and a colon in it. They
  // exist only on the engineer's shape, past the promotion at the MSP; the
  // desk sheet has nothing on it to decide, so its rows carry no controls at
  // all. The fourth is the whole of what a desk sheet CAN do.
  'timesheet-minutes-*',
  'timesheet-put-*',
  'timesheet-detail-*',
  'timesheet-submit',
  'browser-site-*',
  'browser-home-button',
  // The web store's live buttons, one per shipped installable, per direction.
  'store-install-*',
  'store-uninstall-*',
  // And the toys those buttons put on the machine, once installed.
  'arcade-play',
  'media-play',
  // Office Solitaire, a real game: the stock and the new-deal button are fixed
  // controls; each face-up card and each empty-pile drop target is a control the
  // player uses to move, so they carry ids in families rather than one by one.
  'solitaire-stock',
  'solitaire-new-deal',
  'solitaire-card-*',
  'solitaire-drop-*',
  // Office Minesweeper, a real game: the flag-mode toggle and the new-game
  // button are fixed controls; each square in the grid is a control the player
  // clicks to clear or flag, so they carry ids in a family rather than one by
  // one.
  'minesweeper-flag-toggle',
  'minesweeper-new-game',
  'minesweeper-cell-*',
  // Display Properties (0.27.0): one family per axis - the desktops the box can
  // wear, and the distributions it can be on. `display-desktop-pick` is the
  // panel the third family sits in, and it matches the first of these; the
  // buttons inside it are their own family (0.28.0), because "change my
  // desktop" and "this distribution ships none, pick one" are two questions.
  'display-desktop-*',
  'display-distro-*',
  'display-pick-*',
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
  'brief-night-answer-*',
  // The one convenience on the on-call page surface: a way to the terminal
  // where the real fix lives, on a fire that is still down (E6, 0.17.0). One per
  // page. The fix itself is systemctl restart in the terminal, not a button here.
  'brief-page-terminal-*',
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
  // The second door on the weekend screen: the desperate offer, taken beside
  // the retry after a firing (0.6.0, E5 switch). Its FUNCTION is already in
  // COVERAGE (weekend.offer-fired, switch.accept); this is the DOM half - the
  // button is on screen on a fired week, so the inventory has to name it.
  'weekend-accept-offer',
  // The third door (E11, 0.34.0): staying for the next week of the arc. Its
  // FUNCTION is in COVERAGE (weekend.stay-door, weektwo.arrive); this is the
  // DOM half - the button is on screen on a passed week, so the inventory has
  // to name it.
  'weekend-stay',
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
