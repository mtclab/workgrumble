import type { AppDef, AppIntent, GameApi } from './apps/types';
import { appsForTier } from './apps/manifest';
import { formatSimTime } from './clock-format';
import type { ShellContext } from './context';
import { createIcon } from './icons';
import { BOSS_KEY_CODE, DISMISS_KEY } from './keys';
import { launchApp, windowIdFor } from './launch';
import {
  createNotificationState,
  dismissToast,
  expireToasts,
  markAllRead,
  type NotificationState,
  pushNotification,
  type ShellNotification,
} from './notifications';
import { WindowRenderer } from './window-renderer';
import {
  createWindowManager,
  minimizeSlackWindows,
  setWindowViewport,
  toggleTaskbarWindow,
  type Viewport,
  type WindowManagerState,
} from './wm';

export interface DesktopHandlers {
  logOut(): void;
  restart(): void;
}

interface TaskbarButton {
  readonly element: HTMLButtonElement;
  readonly label: HTMLSpanElement;
}

function isVisible(element: HTMLElement): boolean {
  return element.hidden === false;
}

function menuItem(
  label: string,
  icon: string,
  testId: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'menu-item';
  button.dataset.testid = testId;
  button.append(createIcon(icon));
  const text = document.createElement('span');
  text.textContent = label;
  button.append(text);
  return button;
}

/**
 * The desktop screen: wallpaper, icons, window layer, taskbar, start menu and
 * the notification centre. It owns the window-manager state but never touches
 * the world graph - apps reach the world through the GameApi it hands them.
 */
export class Desktop {
  public readonly element: HTMLElement;

  private readonly apps: readonly AppDef[];
  private readonly surface: HTMLElement;
  private readonly windowLayer: HTMLElement;
  private readonly toastStack: HTMLElement;
  private readonly taskbarWindows: HTMLElement;
  private readonly taskbarEmpty: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly startMenu: HTMLElement;
  private readonly trayButton: HTMLButtonElement;
  private readonly trayBadge: HTMLElement;
  private readonly trayPanel: HTMLElement;
  private readonly trayPanelList: HTMLElement;
  private readonly clockTime: HTMLElement;
  private readonly clockDay: HTMLElement;

  private readonly taskbarButtons = new Map<string, TaskbarButton>();
  private readonly toastElements = new Map<string, HTMLElement>();
  private readonly renderer: WindowRenderer;
  private readonly api: GameApi;
  private readonly abort = new AbortController();
  private readonly observer: ResizeObserver;
  private unsubscribeClock: (() => void) | null = null;

  private wm: WindowManagerState | null = null;
  private notifications: NotificationState = createNotificationState();

  public constructor(
    private readonly context: Readonly<ShellContext>,
    private readonly handlers: Readonly<DesktopHandlers>,
  ) {
    this.apps = appsForTier(context.manifest, context.tier);

    this.element = document.createElement('div');
    this.element.className = 'screen screen-desktop';
    this.element.dataset.testid = 'desktop';

    this.surface = document.createElement('div');
    this.surface.className = 'desktop-surface wallpaper';
    this.surface.dataset.testid = 'desktop-surface';

    const icons = document.createElement('ul');
    icons.className = 'desktop-icons';
    icons.dataset.testid = 'desktop-icons';

    this.windowLayer = document.createElement('div');
    this.windowLayer.className = 'window-layer';
    this.windowLayer.dataset.testid = 'window-layer';

    this.toastStack = document.createElement('div');
    this.toastStack.className = 'toast-stack';
    this.toastStack.dataset.testid = 'toast-stack';
    this.toastStack.setAttribute('role', 'status');
    this.toastStack.setAttribute('aria-live', 'polite');

    this.surface.append(icons, this.windowLayer, this.toastStack);

    const taskbar = document.createElement('div');
    taskbar.className = 'taskbar';
    taskbar.dataset.testid = 'taskbar';

    this.startButton = document.createElement('button');
    this.startButton.type = 'button';
    this.startButton.className = 'start-button';
    this.startButton.dataset.testid = 'start-button';
    this.startButton.setAttribute('aria-expanded', 'false');
    this.startButton.append(createIcon('icon-start'));
    const startLabel = document.createElement('span');
    startLabel.textContent = 'Start';
    this.startButton.append(startLabel);

    const divider = document.createElement('div');
    divider.className = 'taskbar-divider';

    this.taskbarWindows = document.createElement('div');
    this.taskbarWindows.className = 'taskbar-windows';
    this.taskbarWindows.dataset.testid = 'taskbar-windows';
    this.taskbarEmpty = document.createElement('span');
    this.taskbarEmpty.className = 'taskbar-empty';
    this.taskbarEmpty.textContent = 'No windows open. Suspiciously tidy.';
    this.taskbarWindows.append(this.taskbarEmpty);

    const tray = document.createElement('div');
    tray.className = 'taskbar-tray';
    this.trayButton = document.createElement('button');
    this.trayButton.type = 'button';
    this.trayButton.className = 'tray-button';
    this.trayButton.dataset.testid = 'notification-tray';
    this.trayButton.setAttribute('aria-expanded', 'false');
    this.trayButton.setAttribute('aria-label', 'Notifications');
    this.trayButton.append(createIcon('icon-bell'));
    this.trayBadge = document.createElement('span');
    this.trayBadge.className = 'tray-badge';
    this.trayBadge.dataset.testid = 'notification-badge';
    this.trayButton.append(this.trayBadge);

    const clock = document.createElement('div');
    clock.className = 'sim-clock';
    clock.dataset.testid = 'sim-clock';
    this.clockTime = document.createElement('strong');
    this.clockTime.dataset.testid = 'sim-clock-time';
    this.clockDay = document.createElement('span');
    this.clockDay.dataset.testid = 'sim-clock-day';
    clock.append(this.clockTime, this.clockDay);
    tray.append(this.trayButton, clock);

    taskbar.append(this.startButton, divider, this.taskbarWindows, tray);

    this.startMenu = this.createStartMenu();
    this.trayPanel = document.createElement('div');
    this.trayPanel.className = 'tray-panel';
    this.trayPanel.dataset.testid = 'notification-panel';
    this.trayPanel.hidden = true;
    const trayHeading = document.createElement('h2');
    trayHeading.textContent = 'Notification centre';
    this.trayPanelList = document.createElement('div');
    this.trayPanelList.className = 'tray-panel-list';
    this.trayPanel.append(trayHeading, this.trayPanelList);

    this.element.append(
      this.surface,
      taskbar,
      this.startMenu,
      this.trayPanel,
    );

    for (const app of this.apps) {
      icons.append(this.createDesktopIcon(app));
    }

    this.api = {
      graph: context.graph,
      dispatch: (id, actor, target, params) => context.dispatch(
        id,
        actor,
        target,
        params,
      ),
      clock: {
        now: () => context.clock.now(),
        onTick: (listener) => context.clock.onTick(listener),
      },
      onWorldChange: (listener) => context.onWorldChange(listener),
      notify: (title, body) => {
        this.notify(title, body);
      },
      openApp: (id, intent) => {
        this.openApp(id, intent);
      },
      hasApp: (id) => this.apps.some((app) => app.id === id),
      actor: context.user.node,
    };

    this.renderer = new WindowRenderer(
      this.windowLayer,
      this.apps,
      this.api,
      () => this.requireWindowManager(),
      (next) => {
        this.commitWindows(next);
      },
    );

    this.observer = new ResizeObserver(() => {
      this.syncViewport();
    });

    this.bindEvents();
  }

  /**
   * Attaches the desktop to the shell and starts the live surfaces. The screen
   * is activated before the viewport is measured: a hidden surface measures
   * zero and would clamp every window to a single pixel.
   */
  public mount(parent: HTMLElement): void {
    parent.append(this.element);
    this.element.dataset.active = 'true';
    this.wm = createWindowManager(this.measureViewport());
    this.observer.observe(this.surface);
    this.unsubscribeClock = this.context.clock.onTick((tick) => {
      this.renderClock(tick);
      this.commitNotifications(expireToasts(this.notifications, tick));
    });

    this.renderClock(this.context.clock.now());
    this.renderNotifications();
    this.renderWindows();
  }

  public dispose(): void {
    this.observer.disconnect();
    this.unsubscribeClock?.();
    this.unsubscribeClock = null;
    this.abort.abort();
    this.renderer.dispose();
    this.taskbarButtons.clear();
    this.toastElements.clear();
    this.element.remove();
  }

  /**
   * Opens an app window, or brings an already-open one back to the front. An
   * intent is a cross-app link's second half ("open the KB AT this article")
   * and is handed over after the window exists, so it works both for an app
   * that was already open and one this call has just mounted.
   */
  public openApp(id: string, intent?: AppIntent): void {
    this.closeTransientSurfaces();
    const definition = this.apps.find((app) => app.id === id);

    if (definition === undefined) {
      this.notify(
        'Application unavailable',
        `"${id}" is not installed at your access level. Ask again after a promotion.`,
      );
      return;
    }

    this.commitWindows(
      launchApp(this.requireWindowManager(), definition),
    );

    if (intent !== undefined) {
      this.renderer.deliverIntent(windowIdFor(definition), intent);
    }
  }

  public notify(title: string, body: string): void {
    this.commitNotifications(
      pushNotification(
        this.notifications,
        title,
        body,
        this.context.clock.now(),
      ),
    );
  }

  private createStartMenu(): HTMLElement {
    const menu = document.createElement('nav');
    menu.className = 'start-menu';
    menu.dataset.testid = 'start-menu';
    menu.setAttribute('aria-label', 'Start menu');
    menu.hidden = true;

    const rail = document.createElement('div');
    rail.className = 'start-menu-rail';
    rail.textContent = 'DeskPro';

    const list = document.createElement('div');
    list.className = 'start-menu-list';

    for (const app of this.apps) {
      const item = menuItem(app.title, app.icon, `start-menu-item-${app.id}`);
      item.addEventListener(
        'click',
        () => {
          this.openApp(app.id);
        },
        { signal: this.abort.signal },
      );
      list.append(item);
    }

    const separator = document.createElement('div');
    separator.className = 'menu-separator';
    const logOut = menuItem('Log off', 'icon-log-out', 'start-menu-log-off');
    logOut.addEventListener(
      'click',
      () => {
        this.closeTransientSurfaces();
        this.handlers.logOut();
      },
      { signal: this.abort.signal },
    );
    const restart = menuItem('Restart', 'icon-restart', 'start-menu-restart');
    restart.addEventListener(
      'click',
      () => {
        this.closeTransientSurfaces();
        this.handlers.restart();
      },
      { signal: this.abort.signal },
    );

    list.append(separator, logOut, restart);
    menu.append(rail, list);
    return menu;
  }

  private createDesktopIcon(app: AppDef): HTMLLIElement {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desktop-icon';
    button.dataset.testid = `desktop-icon-${app.id}`;
    button.append(createIcon(app.icon));
    const label = document.createElement('span');
    label.textContent = app.title;
    button.append(label);

    button.addEventListener(
      'dblclick',
      () => {
        this.openApp(app.id);
      },
      { signal: this.abort.signal },
    );
    button.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.openApp(app.id);
        }
      },
      { signal: this.abort.signal },
    );

    item.append(button);
    return item;
  }

  private bindEvents(): void {
    const signal = this.abort.signal;

    this.startButton.addEventListener(
      'click',
      () => {
        this.setStartMenuOpen(!isVisible(this.startMenu));
      },
      { signal },
    );
    this.trayButton.addEventListener(
      'click',
      () => {
        this.setTrayPanelOpen(!isVisible(this.trayPanel));
      },
      { signal },
    );

    document.addEventListener(
      'keydown',
      (event) => {
        this.handleKeyDown(event);
      },
      { signal },
    );
    document.addEventListener(
      'pointerdown',
      (event) => {
        this.handleOutsidePointerDown(event);
      },
      { signal },
    );
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === DISMISS_KEY) {
      this.closeTransientSurfaces();
      return;
    }

    // No text-entry exception. A panic key that stops working the moment the
    // player is typing into an app is not a panic key, and the manager in the
    // doorway does not wait for the field to lose focus.
    if (event.code !== BOSS_KEY_CODE) {
      return;
    }

    event.preventDefault();
    this.closeTransientSurfaces();
    this.commitWindows(minimizeSlackWindows(this.requireWindowManager()));
  }

  private handleOutsidePointerDown(event: PointerEvent): void {
    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    if (
      isVisible(this.startMenu)
      && !this.startMenu.contains(target)
      && !this.startButton.contains(target)
    ) {
      this.setStartMenuOpen(false);
    }

    if (
      isVisible(this.trayPanel)
      && !this.trayPanel.contains(target)
      && !this.trayButton.contains(target)
    ) {
      this.setTrayPanelOpen(false);
    }
  }

  private setStartMenuOpen(open: boolean): void {
    if (open) {
      this.setTrayPanelOpen(false);
    }

    this.startMenu.hidden = !open;
    this.startButton.setAttribute('aria-expanded', String(open));

    if (!open) {
      this.returnFocus(this.startMenu, this.startButton);
    }
  }

  private setTrayPanelOpen(open: boolean): void {
    if (open) {
      this.setStartMenuOpen(false);
    }

    // Visibility flips before the content is filled: `renderNotifications`
    // only repaints the list while the panel is on screen, so marking the
    // badge read first would leave the panel empty.
    this.trayPanel.hidden = !open;
    this.trayButton.setAttribute('aria-expanded', String(open));

    if (open) {
      this.renderTrayPanel();
      this.commitNotifications(markAllRead(this.notifications));
      return;
    }

    this.returnFocus(this.trayPanel, this.trayButton);
  }

  /**
   * Hands focus back to the control that opened a surface once that surface
   * closes. Without it, Escape leaves the cursor inside a hidden menu and the
   * keyboard player has to Tab in from the top of the document again.
   */
  private returnFocus(surface: HTMLElement, trigger: HTMLElement): void {
    const active = document.activeElement;

    if (active instanceof HTMLElement && surface.contains(active)) {
      trigger.focus();
    }
  }

  private closeTransientSurfaces(): void {
    this.setStartMenuOpen(false);
    this.setTrayPanelOpen(false);
  }

  private commitWindows(next: WindowManagerState): void {
    if (next === this.wm) {
      return;
    }

    this.wm = next;
    this.renderWindows();
  }

  private renderWindows(): void {
    const state = this.requireWindowManager();
    // Read the focus owner before the paint: hiding the element that holds
    // focus drops it on the document body, and by then there is nothing left
    // to tell us where the player was.
    const focusOwner = this.windowIdWithFocus();
    this.renderer.sync(state);
    this.renderTaskbarWindows(state);
    this.followFocusOutOfHiddenWindow(state, focusOwner);
  }

  private windowIdWithFocus(): string | null {
    const active = document.activeElement;

    return active instanceof HTMLElement
      ? this.renderer.windowIdContaining(active)
      : null;
  }

  /**
   * Keyboard focus must never be left inside a window the paint just hid: the
   * window is `aria-hidden`, so a screen reader loses the cursor and Tab
   * resumes from nowhere. The taskbar button is where that window now lives.
   */
  private followFocusOutOfHiddenWindow(
    state: Readonly<WindowManagerState>,
    focusOwner: string | null,
  ): void {
    if (focusOwner === null) {
      return;
    }

    const windowState = state.windows.find(
      (candidate) => candidate.id === focusOwner,
    );

    if (windowState === undefined || !windowState.minimized) {
      return;
    }

    this.taskbarButtons.get(focusOwner)?.element.focus();
  }

  private renderTaskbarWindows(state: Readonly<WindowManagerState>): void {
    const open = new Set(state.windows.map(({ id }) => id));

    for (const [id, button] of this.taskbarButtons) {
      if (!open.has(id)) {
        button.element.remove();
        this.taskbarButtons.delete(id);
      }
    }

    for (const windowState of state.windows) {
      let button = this.taskbarButtons.get(windowState.id);

      if (button === undefined) {
        button = this.createTaskbarButton(
          windowState.id,
          windowState.appId,
          windowState.icon,
        );
        this.taskbarButtons.set(windowState.id, button);
        this.taskbarWindows.append(button.element);
      }

      const active = state.focusedId === windowState.id;
      button.label.textContent = windowState.title;
      button.element.dataset.active = String(active);
      button.element.dataset.minimized = String(windowState.minimized);
      button.element.setAttribute('aria-pressed', String(active));
      button.element.title = windowState.minimized
        ? `Restore ${windowState.title}`
        : `${active ? 'Minimize' : 'Focus'} ${windowState.title}`;
    }

    this.taskbarEmpty.hidden = state.windows.length > 0;
  }

  private createTaskbarButton(
    id: string,
    appId: string,
    icon: string,
  ): TaskbarButton {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'taskbar-button';
    element.dataset.testid = `taskbar-button-${appId}`;
    element.append(createIcon(icon));
    const label = document.createElement('span');
    element.append(label);
    element.addEventListener(
      'click',
      () => {
        this.commitWindows(
          toggleTaskbarWindow(this.requireWindowManager(), id),
        );
      },
      { signal: this.abort.signal },
    );

    return { element, label };
  }

  private commitNotifications(next: NotificationState): void {
    if (next === this.notifications) {
      return;
    }

    this.notifications = next;
    this.renderNotifications();
  }

  private renderNotifications(): void {
    const live = new Set(this.notifications.toasts.map(({ id }) => id));

    for (const [id, element] of this.toastElements) {
      if (!live.has(id)) {
        element.remove();
        this.toastElements.delete(id);
      }
    }

    for (const toast of this.notifications.toasts) {
      if (!this.toastElements.has(toast.id)) {
        const element = this.createToast(toast);
        this.toastElements.set(toast.id, element);
        this.toastStack.append(element);
      }
    }

    this.trayBadge.textContent = String(this.notifications.unread);
    this.trayBadge.dataset.unread = String(this.notifications.unread);
    this.trayButton.setAttribute(
      'aria-label',
      `Notifications, ${String(this.notifications.unread)} unread`,
    );

    if (isVisible(this.trayPanel)) {
      this.renderTrayPanel();
    }
  }

  private createToast(toast: Readonly<ShellNotification>): HTMLElement {
    const element = document.createElement('div');
    element.className = 'toast';
    element.dataset.testid = 'toast';
    element.dataset.toastId = toast.id;
    element.append(createIcon('icon-bell'));

    const copy = document.createElement('div');
    copy.className = 'toast-copy';
    const title = document.createElement('strong');
    title.textContent = toast.title;
    const body = document.createElement('p');
    body.textContent = toast.body;
    copy.append(title, body);

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'toast-dismiss';
    dismiss.dataset.testid = 'toast-dismiss';
    dismiss.setAttribute('aria-label', `Dismiss ${toast.title}`);
    dismiss.append(createIcon('icon-close'));
    dismiss.addEventListener(
      'click',
      () => {
        this.commitNotifications(dismissToast(this.notifications, toast.id));
      },
      { signal: this.abort.signal },
    );

    element.append(copy, dismiss);
    return element;
  }

  private renderTrayPanel(): void {
    this.trayPanelList.replaceChildren();

    if (this.notifications.history.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'tray-panel-empty';
      empty.dataset.testid = 'notification-panel-empty';
      empty.textContent = 'Nothing yet. Enjoy it while it lasts.';
      this.trayPanelList.append(empty);
      return;
    }

    for (const entry of this.notifications.history) {
      const item = document.createElement('article');
      item.className = 'tray-panel-item';
      item.dataset.testid = 'notification-panel-item';
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const body = document.createElement('p');
      body.textContent = entry.body;
      const stamp = document.createElement('time');
      const display = formatSimTime(entry.tick);
      stamp.textContent = `${display.day} · ${display.time}`;
      item.append(title, body, stamp);
      this.trayPanelList.append(item);
    }
  }

  private renderClock(tick: number): void {
    const display = formatSimTime(tick);
    this.clockTime.textContent = display.time;
    this.clockDay.textContent = display.day;
    this.clockTime.setAttribute('aria-label', display.accessible);
  }

  private syncViewport(): void {
    if (this.wm === null) {
      return;
    }

    this.commitWindows(setWindowViewport(this.wm, this.measureViewport()));
  }

  private measureViewport(): Viewport {
    return {
      width: Math.max(1, this.surface.clientWidth),
      height: Math.max(1, this.surface.clientHeight),
    };
  }

  private requireWindowManager(): WindowManagerState {
    if (this.wm === null) {
      throw new Error('The desktop must be mounted before it manages windows.');
    }

    return this.wm;
  }
}
