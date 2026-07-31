import { createBootScreen } from './boot-screen';
import type { ShellContext } from './context';
import { Desktop } from './desktop';
import { createIconSprite } from './icons';
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

interface QueuedNotification {
  readonly title: string;
  readonly body: string;
}

/**
 * Owns the boot -> login -> desktop machine and the DOM for each screen. All
 * transitions run through the pure reducer in `state.ts`; this class only
 * paints the result and starts or stops the screen-scoped resources.
 */
export class Shell {
  private readonly boot = createBootScreen();
  private readonly login: LoginScreen;
  private readonly abort = new AbortController();
  private state: ShellState = createShellState();
  private desktop: Desktop | null = null;
  private bootTimer: number | null = null;
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

  public constructor(
    private readonly root: HTMLElement,
    private readonly context: Readonly<ShellContext>,
  ) {
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
        knownBadge: () => context.identity.badge(),
      },
      this.abort.signal,
    );

    this.root.classList.add('shell');
    this.root.append(
      createIconSprite(),
      this.boot.element,
      this.login.element,
    );

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
    this.stopBootTimer();
    this.desktop?.dispose();
    this.desktop = null;
    this.abort.abort();
  }

  private dispatch(event: ShellEvent): void {
    const next = reduceShellState(this.state, event);

    if (
      next.screen === this.state.screen
      && next.bootStep === this.state.bootStep
    ) {
      return;
    }

    this.state = next;
    this.render();
  }

  private render(): void {
    const screen = this.state.screen;
    this.boot.element.dataset.active = String(screen === 'boot');
    this.login.element.dataset.active = String(screen === 'login');
    this.boot.render(this.state.bootStep);

    if (screen === 'boot') {
      this.startBootTimer();
    } else {
      this.stopBootTimer();
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
  /** Opens what was asked for while there was no desktop, once, in order. */
  private flushPendingApps(desktop: Desktop): void {
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
}
