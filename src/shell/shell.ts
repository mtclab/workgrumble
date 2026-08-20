import { createBootScreen } from './boot-screen';
import type { ShellContext } from './context';
import { holdsTheDesk } from './day-driver';
import { Desktop } from './desktop';
import { createIconSprite } from './icons';
import { createInstallScreen, type InstallScreen } from './install-screen';
import { createLoginScreen, type LoginScreen } from './login-screen';
import { NOTIFICATION_HISTORY_LIMIT } from './notifications';
import {
  createShellState,
  reduceShellState,
  type ShellEvent,
  type ShellState,
} from './state';

/** Real milliseconds between fake POST lines. Chrome only, not simulation. */
const BOOT_STEP_MS = 380;

/**
 * And between the beats of an update installing itself at boot.
 *
 * Slower than a POST line on purpose: the POST is a machine listing what it
 * found and reads as a machine hurrying, while this is a machine that has
 * decided you are waiting. Eight beats at half a second is four seconds, which
 * is long enough to be a joke about waiting and short enough not to be one.
 */
const INSTALL_STEP_MS = 500;

interface QueuedNotification {
  readonly title: string;
  readonly body: string;
}

/**
 * What the window queue may open right now.
 *
 * Nothing at all while something is holding the desk, and it is a named rule
 * rather than an `if` inside a paint because it is a rule somebody could
 * delete without noticing. The window this queue exists for is the release
 * notes, decided during BOOT on a build that changed under this browser; a
 * session restored into the middle of a reboot arrives at the desktop with a
 * takeover already on screen, and a queue that flushed regardless would put a
 * disabled dialog in front of the update screen that disabled it.
 */
export function flushableWindows(
  pending: readonly string[],
  deskHeld: boolean,
): readonly string[] {
  return deskHeld ? [] : pending;
}

/**
 * Owns the boot -> login -> desktop machine and the DOM for each screen. All
 * transitions run through the pure reducer in `state.ts`; this class only
 * paints the result and starts or stops the screen-scoped resources.
 */
export class Shell {
  private readonly boot = createBootScreen();
  private readonly installing: InstallScreen;
  private readonly login: LoginScreen;
  private readonly abort = new AbortController();
  private state: ShellState;
  private desktop: Desktop | null = null;
  private bootTimer: number | null = null;
  private installTimer: number | null = null;
  /**
   * Engine notifications raised while no desktop exists. The simulation runs
   * through boot, the login screen and a logged-off session, so anything it
   * announces there has to wait for a desktop rather than vanish.
   */
  private readonly queued: QueuedNotification[] = [];
  /**
   * Windows asked for before there was anywhere to put one.
   *
   * The same problem the notification queue solves, arriving from the other
   * direction: the update window is decided during BOOT, when the screen is a
   * fake POST and the desktop does not exist yet, and an `openApp` that
   * silently did nothing would mean a build could install itself and never say
   * so. One entry per app, in order, opened the moment there is a desktop.
   */
  private readonly pendingApps: string[] = [];
  /** Stops listening for the desk coming back. */
  private readonly unsubscribeDay: () => void;

  public constructor(
    private readonly root: HTMLElement,
    private readonly context: Readonly<ShellContext>,
    /**
     * Whether this boot has a build to install: a browser that has seen an
     * older version of this game and has just been handed a newer one.
     *
     * The answer comes from a storage slot that `main.ts` has already read
     * (see `updateOnBoot`), which is why it arrives as a flag rather than as a
     * question - the shell has no business knowing what a version is, and a
     * pure reducer cannot go and look.
     */
    installing = false,
    /**
     * The line the install screen prints while it holds this boot, or absent
     * for the default that names the build. It is how the SAME screen serves
     * both an update and an employer switch (0.6.0 slice 2): a new starter's
     * "here is your new machine" is this screen with the shop's name on it.
     */
    installSubject?: string,
  ) {
    this.installing = createInstallScreen(installSubject);
    this.state = createShellState(installing);
    this.login = createLoginScreen(
      context.user,
      {
        logOn: () => {
          this.dispatch({ type: 'login:submit' });
        },
        restart: () => {
          this.dispatch({ type: 'session:restart' });
        },
        signIn: (badge) => context.identity.signIn(badge),
        issueBadge: () => context.identity.issueBadge(),
        knownAccount: () => context.identity.account(),
        // Whether this boot is a HIRE, decided in `main.ts` before the world
        // was stood up. The shell passes it through and paints it; it has no
        // business knowing what a save slot is.
        hire: () => context.hire,
        // And the other half of the same decision: the door out of a career
        // this browser already has (#61). Passed through the same way and for
        // the same reason - which of the two a boot offers is a fact about four
        // storage slots, and the shell reads none of them.
        freshStart: () => context.freshStart,
      },
      this.abort.signal,
    );

    this.root.classList.add('shell');
    this.root.append(
      createIconSprite(),
      this.boot.element,
      this.installing.element,
      this.login.element,
    );

    // The desk coming back is what empties the held queue. It is a
    // subscription rather than a poll because the day already announces every
    // change it makes, and a window that waited for the next keystroke would
    // be a window the player had to go and find.
    this.unsubscribeDay = context.day.onChanged(() => {
      const desktop = this.desktop;

      if (desktop !== null && this.pendingApps.length > 0) {
        this.flushPendingApps(desktop);
      }
    });

    document.addEventListener(
      'keydown',
      () => {
        this.dispatch({ type: 'boot:skip' });
      },
      { signal: this.abort.signal },
    );
    this.boot.element.addEventListener(
      'pointerdown',
      () => {
        this.dispatch({ type: 'boot:skip' });
      },
      { signal: this.abort.signal },
    );
  }

  public start(): void {
    this.render();
  }

  /**
   * The building has answered the question of who this browser is.
   *
   * It arrives late by design - the badge is asked about after the shell is on
   * screen, because a boot that waited on the network would make the optional
   * half of this product the reason the essential half was slow - so the log-on
   * screen is already painted, with no badge on it, by the time there is one.
   * Without this the record card was only ever right on the second visit to
   * that screen.
   */
  public identityChanged(): void {
    this.login.identityChanged();
  }

  /**
   * Whether there is a desktop on screen, which is the day driver's licence to
   * convert real time at all.
   *
   * The simulation used to run through the POST gag, the login box and every
   * logged-off minute, at one simulated minute per second, with the pause
   * button on the far side of a login form. Whether somebody is AT the desk is
   * a fact about this class, so this is where the answer lives.
   */
  public hasDesktop(): boolean {
    return this.desktop !== null;
  }

  /**
   * Raises a shell notification from outside the app layer (engine events).
   * With no desktop mounted it is held until there is one, capped at the depth
   * the notification centre itself keeps so a long logged-off stretch cannot
   * grow the queue without bound.
   */
  public notify(title: string, body: string): void {
    if (this.desktop === null) {
      this.queued.push({ title, body });

      if (this.queued.length > NOTIFICATION_HISTORY_LIMIT) {
        this.queued.shift();
      }

      return;
    }

    this.desktop.notify(title, body);
  }

  /**
   * Puts an app on screen from outside the app layer.
   *
   * The day uses it for the screens it puts up rather than the player - the
   * caught scene. With no desktop mounted there is nothing to open onto, and
   * nothing to open FOR: nobody can be caught at a screen that is not there.
   */
  public openApp(id: string): void {
    if (this.desktop === null) {
      // Nobody can be caught at a screen that is not there, so the day never
      // reaches this - but the boot does, and a window it asked for has to
      // wait rather than evaporate.
      if (!this.pendingApps.includes(id)) {
        this.pendingApps.push(id);
      }

      return;
    }

    this.desktop.openApp(id);
  }

  /**
   * And takes one back off it, from outside the app layer.
   *
   * The day uses it for the windows it opened ITSELF and has now finished
   * with: a call that has been answered, waved off or simply rung out, and a
   * meeting whose half hour is over. A window left standing after the thing it
   * was about has ended is a screen telling the player something that is no
   * longer true - and with no desktop there is nothing to close, which is not
   * an error.
   */
  public closeApp(id: string): void {
    this.desktop?.closeApp(id);
  }

  /**
   * Slack apps with a window open and not minimised.
   *
   * The pressure layer needs to know what is genuinely ON SCREEN - a minimised
   * game is a game nobody is playing and nobody can catch you at - and with no
   * desktop mounted the answer is nothing, because there is no screen.
   */
  public openSlackApps(): readonly string[] {
    return this.desktop?.openSlackApps() ?? [];
  }

  /**
   * The slack app the player is actually in, if the front window is one.
   *
   * A window behind the one being typed into is something the lead can see and
   * something the player is not looking at, which is why the two meters ask
   * two different questions.
   */
  public focusedSlackApp(): string | null {
    return this.desktop?.focusedSlackApp() ?? null;
  }

  public dispose(): void {
    this.unsubscribeDay();
    this.stopBootTimer();
    this.stopInstallTimer();
    this.desktop?.dispose();
    this.desktop = null;
    this.abort.abort();
  }

  private dispatch(event: ShellEvent): void {
    const next = reduceShellState(this.state, event);

    if (
      next.screen === this.state.screen
      && next.bootStep === this.state.bootStep
      // The third one, and it is load-bearing: an update beat changes neither
      // the screen nor the boot step, so without it the percentage would sit
      // at nought for four seconds and then the log-on box would appear.
      && next.installStep === this.state.installStep
    ) {
      return;
    }

    this.state = next;
    this.render();
  }

  private render(): void {
    const screen = this.state.screen;
    this.boot.element.dataset.active = String(screen === 'boot');
    this.installing.element.dataset.active = String(screen === 'installing');
    this.login.element.dataset.active = String(screen === 'login');
    this.boot.render(this.state.bootStep);
    this.installing.render(this.state.installStep);

    if (screen === 'boot') {
      this.startBootTimer();
    } else {
      this.stopBootTimer();
    }

    if (screen === 'installing') {
      this.startInstallTimer();
    } else {
      this.stopInstallTimer();
    }

    if (screen === 'login') {
      this.login.reset();
    }

    if (screen === 'desktop' && this.desktop === null) {
      this.desktop = new Desktop(this.context, {
        logOut: () => {
          this.dispatch({ type: 'session:log-out' });
        },
        restart: () => {
          this.dispatch({ type: 'session:restart' });
        },
      });
      this.desktop.mount(this.root);
      // Windows before toasts: the day's own screens are put up by the mount
      // itself, and a queued window arriving after a toast that talks about it
      // reads as the toast having lied.
      this.flushPendingApps(this.desktop);
      this.flushQueuedNotifications(this.desktop);
      return;
    }

    if (screen !== 'desktop' && this.desktop !== null) {
      this.desktop.dispose();
      this.desktop = null;
    }
  }

  /**
   * Replays what the simulation announced while nobody was looking, oldest
   * first. The stamp is delivery time, not raise time: a toast that is handed
   * over late still deserves its full time on screen.
   */
  /**
   * Opens what was asked for while there was no desktop, once, in order - and
   * not while something is holding the desk.
   *
   * The window this queue exists for is the release notes, decided during BOOT
   * on a build that changed under this browser. A session restored into the
   * middle of a reboot arrives at the desktop with a takeover already on the
   * screen, and a queue that flushed regardless put the notes - a window every
   * pointer rule has just disabled - on top of the update screen, which is the
   * one thing the takeover is supposed to be. So the queue waits, and
   * `deskFreed` below empties it the minute the desk comes back.
   */
  private flushPendingApps(desktop: Desktop): void {
    const open = flushableWindows(
      this.pendingApps,
      holdsTheDesk(this.context.day.interruption()?.entry.source),
    );

    if (open.length === 0) {
      return;
    }

    for (const id of this.pendingApps.splice(0, this.pendingApps.length)) {
      desktop.openApp(id);
    }
  }

  private flushQueuedNotifications(desktop: Desktop): void {
    const held = this.queued.splice(0, this.queued.length);

    for (const notification of held) {
      desktop.notify(notification.title, notification.body);
    }
  }

  private startBootTimer(): void {
    if (this.bootTimer !== null) {
      return;
    }

    this.bootTimer = window.setInterval(() => {
      this.dispatch({ type: 'boot:advance' });
    }, BOOT_STEP_MS);
  }

  private stopBootTimer(): void {
    if (this.bootTimer === null) {
      return;
    }

    window.clearInterval(this.bootTimer);
    this.bootTimer = null;
  }

  private startInstallTimer(): void {
    if (this.installTimer !== null) {
      return;
    }

    this.installTimer = window.setInterval(() => {
      this.dispatch({ type: 'install:advance' });
    }, INSTALL_STEP_MS);
  }

  private stopInstallTimer(): void {
    if (this.installTimer === null) {
      return;
    }

    window.clearInterval(this.installTimer);
    this.installTimer = null;
  }
}
