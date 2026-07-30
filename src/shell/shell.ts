import { createBootScreen } from './boot-screen';
import type { ShellContext } from './context';
import { Desktop } from './desktop';
import { createIconSprite } from './icons';
import { createLoginScreen, type LoginScreen } from './login-screen';
import {
  createShellState,
  reduceShellState,
  type ShellEvent,
  type ShellState,
} from './state';

/** Real milliseconds between fake POST lines. Chrome only, not simulation. */
const BOOT_STEP_MS = 380;

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
   * Raises a shell notification from outside the app layer (engine events).
   * Dropped while no desktop is mounted: there is nowhere truthful to show it.
   */
  public notify(title: string, body: string): void {
    this.desktop?.notify(title, body);
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
      return;
    }

    if (screen !== 'desktop' && this.desktop !== null) {
      this.desktop.dispose();
      this.desktop = null;
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
