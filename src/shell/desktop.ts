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
import { countdownChip } from './update-screen';
import { WindowRenderer } from './window-renderer';
import {
  closeWindow,
  createWindowManager,
  focusWindow,
  minimizeSlackWindows,
  minimizeWindow,
  setWindowViewport,
  toggleTaskbarWindow,
  type Viewport,
  type WindowManagerState,
} from './wm';
import { buffTicks } from '../world/consumables';
import { isLunchtime, shiftEndTick } from '../world/day';
import { FIELDS } from '../world/fields';
import { isFumblingWith } from '../world/consumables';
import { isRefocusing } from '../world/meters';
import { Desk, deskState } from './desk';
import { SPEEDS, type Speed } from './day-driver';

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

/**
 * Whether the player is in the middle of a sentence.
 *
 * The one exception to giving a scene the keyboard. A caught scene arriving
 * mid-command in the terminal, or mid-name in the directory search, must not
 * take the cursor out of the box that has half a word in it - the words would
 * carry on being typed into a button. The boss key has no such exception and
 * should not: that one is a panic key, and a panic key that waits for a field
 * to lose focus is not one.
 */
function typingSomewhere(): boolean {
  const active = document.activeElement;

  return (active instanceof HTMLInputElement && active.type !== 'checkbox')
    || active instanceof HTMLTextAreaElement
    || (active instanceof HTMLElement && active.isContentEditable);
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
  private readonly dayState: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly fumbleChip: HTMLElement;
  private readonly refocusChip: HTMLElement;
  private readonly rebootChip: HTMLElement;
  private readonly saveChip: HTMLElement;
  private readonly bossChip: HTMLElement;
  private readonly doorFlash: HTMLElement;
  private readonly desk: Desk;
  private readonly speedButtons = new Map<Speed, HTMLButtonElement>();

  private readonly taskbarButtons = new Map<string, TaskbarButton>();
  private readonly toastElements = new Map<string, HTMLElement>();
  private readonly renderer: WindowRenderer;
  private readonly api: GameApi;
  private readonly abort = new AbortController();
  private readonly observer: ResizeObserver;
  private unsubscribeClock: (() => void) | null = null;
  private unsubscribeDay: (() => void) | null = null;
  private unsubscribeWorld: (() => void) | null = null;
  private unsubscribeScreens: (() => void) | null = null;
  private unsubscribeSaveHealth: (() => void) | null = null;

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

    // The corridor, in the only two places an office worker ever sees it: the
    // reflection in the top of the monitor, and the feeling in the floor. Both
    // are visual and both are cheap on purpose - the reaction window is the
    // mechanic, and it has to be legible without a sound card.
    this.doorFlash = document.createElement('div');
    this.doorFlash.className = 'door-flash';
    this.doorFlash.dataset.testid = 'door-flash';
    this.doorFlash.setAttribute('aria-hidden', 'true');
    this.doorFlash.hidden = true;

    this.desk = new Desk({
      drink: () => {
        this.drink();
      },
      tidy: () => {
        this.tidyDesk();
      },
      // The bottle opens the scene rather than swallowing a dispatch: it is
      // the payoff for a week of locked tooltip, and it deserves the window.
      beer: () => {
        this.openApp('beer');
      },
    });

    this.surface.append(
      icons,
      this.windowLayer,
      this.desk.element,
      this.doorFlash,
      this.toastStack,
    );

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

    const dayControls = document.createElement('div');
    dayControls.className = 'day-controls';
    dayControls.dataset.testid = 'day-controls';
    this.dayState = document.createElement('button');
    this.dayState.type = 'button';
    this.dayState.className = 'day-state';
    this.dayState.dataset.testid = 'day-state';
    this.dayState.addEventListener(
      'click',
      () => {
        // The day's own screen, on demand. A brief or a scorecard that can be
        // closed and not reopened is the dead end the house rules forbid.
        this.openApp(
          this.context.day.state() === 'day_end' ? 'scorecard' : 'brief',
        );
      },
      { signal: this.abort.signal },
    );

    this.pauseButton = document.createElement('button');
    this.pauseButton.type = 'button';
    this.pauseButton.className = 'day-button';
    this.pauseButton.dataset.testid = 'day-pause';
    this.pauseButton.append(createIcon('icon-pause'));
    this.pauseButton.addEventListener(
      'click',
      () => {
        this.context.day.setPaused(!this.context.day.paused());
      },
      { signal: this.abort.signal },
    );
    dayControls.append(this.dayState, this.pauseButton);

    for (const speed of SPEEDS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'day-button day-speed';
      button.dataset.testid = `day-speed-${String(speed)}`;
      button.textContent = `x${String(speed)}`;
      button.title = `Run the clock at ${String(speed)} times normal speed`;
      button.addEventListener(
        'click',
        () => {
          this.context.day.setSpeed(speed);
        },
        { signal: this.abort.signal },
      );
      this.speedButtons.set(speed, button);
      dayControls.append(button);
    }

    // The fumble chip. It is on the taskbar rather than in a dialog because
    // the joke has to be legible while it is happening, and because a player
    // watching their own hands shake deserves to be told it is a joke.
    this.fumbleChip = document.createElement('span');
    this.fumbleChip.className = 'fumble-chip';
    this.fumbleChip.dataset.testid = 'fumble-chip';
    this.fumbleChip.textContent = 'Hands going';
    this.fumbleChip.title = 'Stress over 80. Everything still does exactly '
      + 'what you tell it - the shaking is entirely cosmetic, which is more '
      + 'than can be said for the rest of this job.';
    this.fumbleChip.hidden = true;

    // The debuff, said out loud while it runs.
    //
    // It is a chip rather than a number because that is what it is: a short
    // window in which the hands are worse, ending on its own, managed by
    // nobody. A player who was quietly made worse at their job and never told
    // would experience the twenty-three minutes as the game being broken, and
    // the whole reason this mechanic is in the world at all is that it is the
    // honest, VISIBLE version of a thing the research measures.
    this.refocusChip = document.createElement('span');
    this.refocusChip.className = 'fumble-chip refocus-chip';
    this.refocusChip.dataset.testid = 'refocus-chip';
    this.refocusChip.textContent = 'Where was I...';
    this.refocusChip.title = 'Something took you off the work. For a few '
      + 'minutes the shakes come easier than they otherwise would. It wears '
      + 'off on its own and there is nothing to do about it.';
    this.refocusChip.hidden = true;

    // And the one the workstation puts there itself: how long is left of the
    // minutes a postpone bought. See `renderReboot` for why it is a chip.
    this.rebootChip = document.createElement('span');
    this.rebootChip.className = 'fumble-chip reboot-chip';
    this.rebootChip.dataset.testid = 'reboot-chip';
    this.rebootChip.hidden = true;

    // The other chip: the one that says what the shaking taskbar means, for
    // anybody who has not learned the language of the floorboards yet.
    this.bossChip = document.createElement('span');
    this.bossChip.className = 'boss-chip';
    this.bossChip.dataset.testid = 'boss-chip';
    this.bossChip.hidden = true;

    // The one chip that is not a joke. Two of this product's three writes are
    // automatic, so "the browser stopped keeping anything" is a state nobody
    // would otherwise meet until the tab closed and took the week with it. It
    // stays up until a write actually works.
    this.saveChip = document.createElement('span');
    this.saveChip.className = 'save-chip';
    this.saveChip.dataset.testid = 'save-health';
    this.saveChip.textContent = 'Not saving';
    this.saveChip.hidden = true;

    tray.append(
      this.bossChip,
      this.saveChip,
      this.rebootChip,
      this.refocusChip,
      this.fumbleChip,
      dayControls,
      this.trayButton,
      clock,
    );

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

    // The day screens are put on screen by the day itself and stay out of the
    // icon grid; the start menu still lists them.
    for (const app of this.apps.filter((entry) => entry.desktop !== false)) {
      icons.append(this.createDesktopIcon(app));
    }

    this.api = {
      graph: context.graph,
      appState: context.appState,
      day: context.day,
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
      dispatchLog: () => context.dispatchLog(),
      onWorldChange: (listener) => context.onWorldChange(listener),
      notify: (title, body) => {
        this.notify(title, body);
      },
      openApp: (id, intent) => {
        this.openApp(id, intent);
      },
      closeApp: (id) => {
        this.closeWindowIfOpen(id);
      },
      hasApp: (id) => this.apps.some((app) => app.id === id),
      restartWeek: () => {
        this.restartWeek();
      },
      report: (submission) => context.report(submission),
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
      this.renderDay();
      // The desk and the corridor both move with the minute rather than with
      // the world: a can wears off, and a man comes round a corner.
      this.renderPressure();
      this.commitNotifications(expireToasts(this.notifications, tick));
    });
    this.unsubscribeDay = this.context.day.onChanged(() => {
      this.renderDay();
      // The corridor as well as the clock. A load announces the restored tick
      // BEFORE the driver has rebuilt the day it belongs to, so the repaint
      // that tick caused drew the boss from yesterday's patrol; this is the
      // paint that happens once the driver has caught up, and without it a
      // paused day-two telegraph loaded into a day-one session showed a clear
      // corridor until something unrelated moved.
      this.renderPressure();
      this.syncDayScreens();
    });
    // The meters live in the graph, and nothing about the clock says when one
    // moved: the fumble state has to follow the world, not the minute.
    this.unsubscribeWorld = this.context.onWorldChange(() => {
      this.renderPressure();
    });
    // A load replaces the screens wholesale, and the windows are one of them.
    // They have to be back BEFORE the clock moves again: the pressure layer
    // decides what the lead sees from what is up at his arrival, and a session
    // that resumes with an empty desktop is a session that reloaded its way
    // out of a conversation.
    this.unsubscribeScreens = this.context.appState.onReplaced(() => {
      this.restoreWindows();
      this.syncDayScreens();
    });
    this.unsubscribeSaveHealth = this.context.saveHealth.onChanged(() => {
      this.renderSaveHealth();
    });

    this.renderSaveHealth();
    this.renderClock(this.context.clock.now());
    this.renderDay();
    this.renderPressure();
    this.renderNotifications();
    this.renderWindows();
    this.syncDayScreens();
  }

  public dispose(): void {
    this.observer.disconnect();
    this.unsubscribeClock?.();
    this.unsubscribeClock = null;
    this.unsubscribeDay?.();
    this.unsubscribeDay = null;
    this.unsubscribeWorld?.();
    this.unsubscribeWorld = null;
    this.unsubscribeScreens?.();
    this.unsubscribeScreens = null;
    this.unsubscribeSaveHealth?.();
    this.unsubscribeSaveHealth = null;
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

    // The day's own screens are put up BY the day - a manager in the doorway,
    // a review at three - so the keyboard goes to them. Not the tools: those
    // are opened deliberately, and stealing the cursor out of a window
    // somebody chose to leave it in is its own rudeness.
    if (definition.desktop === false && !typingSomewhere()) {
      this.renderer.focusPrimaryControl(windowIdFor(definition));
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

    // The tools first, the day's own screens after them.
    //
    // The manifest is in installation order, which puts the brief, the
    // scorecard, the week, the telling-off, the review and the fridge above
    // the ticket queue - six screens the day opens by itself, standing in
    // front of the thing the player actually came to open. The menu is a
    // question about what gets used, and it is answered here rather than by
    // reordering the manifest, which is also the taskbar's order and the
    // order a loaded save reopens its windows in.
    const tools = this.apps.filter((app) => app.desktop !== false);
    const screens = this.apps.filter((app) => app.desktop === false);

    for (const app of [...tools, ...screens]) {
      if (app === screens[0]) {
        const rule = document.createElement('div');
        rule.className = 'menu-separator';
        list.append(rule);
      }

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

    const save = menuItem('Save game', 'icon-save', 'start-menu-save');
    save.addEventListener(
      'click',
      () => {
        this.closeTransientSurfaces();
        const outcome = this.context.session.save();
        this.notify(
          outcome.ok ? 'Game saved' : 'Not saved',
          outcome.ok
            ? 'The day is written down. It will be exactly this dull when you '
              + 'come back to it.'
            : outcome.reason,
        );
      },
      { signal: this.abort.signal },
    );

    const load = menuItem('Load game', 'icon-load', 'start-menu-load');
    load.addEventListener(
      'click',
      () => {
        this.closeTransientSurfaces();
        const outcome = this.context.session.load();

        // A load replaces the world under every open window. The engine, the
        // app store and the driver each announce themselves, so there is
        // nothing to repaint by hand here - only something to say.
        this.notify(
          outcome.ok ? 'Game loaded' : 'Not loaded',
          outcome.ok
            ? 'Back where you left it, queue and all.'
            : outcome.reason,
        );
      },
      { signal: this.abort.signal },
    );

    const sessionSeparator = document.createElement('div');
    sessionSeparator.className = 'menu-separator';
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

    list.append(separator, save, load, sessionSeparator, logOut, restart);
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
      if (isVisible(this.startMenu) || isVisible(this.trayPanel)) {
        this.closeTransientSurfaces();
        return;
      }

      this.dismissFocusedScene();
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

  /**
   * Escape, on the window in front, when that window is one of the day's own
   * screens.
   *
   * The caught scene and the review both SAY they close on Escape, in their
   * own source, and neither did: Escape reached the start menu and the tray
   * panel and stopped there. It is not extended to the tools, because a
   * terminal and a search box are places where Escape means something else -
   * and the day's screens are the ones with nothing in them to lose.
   */
  private dismissFocusedScene(): void {
    const state = this.wm;
    const focusedId = state?.focusedId ?? null;

    if (state === null || focusedId === null) {
      return;
    }

    const focused = state.windows.find(
      (windowState) => windowState.id === focusedId,
    );
    const definition = this.apps.find(
      (app) => app.id === focused?.appId,
    );

    if (definition === undefined || definition.desktop !== false) {
      return;
    }

    this.commitWindows(closeWindow(state, focusedId));
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
    this.rememberWindows();
    this.renderWindows();
  }

  /**
   * The screen, written into the store the save carries.
   *
   * Not `patchExternal`: the desktop is the thing that owns these windows and
   * it is repainting them on the next line, so announcing would be telling
   * itself. What it is FOR is the save - the pressure layer decides everything
   * on what is genuinely up when the lead arrives, and a file that does not
   * carry that is a file that changes the answer.
   */
  private rememberWindows(): void {
    const state = this.wm;

    if (state === null) {
      return;
    }

    this.context.appState.patch('windows', {
      open: state.windows.map((windowState) => ({
        appId: windowState.appId,
        minimized: windowState.minimized,
      })),
      focusedId: state.focusedId,
    });
  }

  /**
   * And back again, after a load.
   *
   * Windows are reopened bottom of the pile first, so the z-order the player
   * left is the z-order they come back to - which decides which app the lead
   * names when he catches them. Geometry is not restored because it was never
   * saved: a window put back at coordinates from somebody else's screen is
   * worse than one the cascade has placed.
   */
  private restoreWindows(): void {
    if (this.wm === null) {
      return;
    }

    const saved = this.context.appState.get().windows;
    let next = createWindowManager(this.measureViewport());

    for (const entry of saved.open) {
      const definition = this.apps.find((app) => app.id === entry.appId);

      if (definition === undefined) {
        continue;
      }

      next = launchApp(next, definition);

      if (entry.minimized) {
        next = minimizeWindow(next, windowIdFor(definition));
      }
    }

    if (saved.focusedId !== null) {
      next = focusWindow(next, saved.focusedId);
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

  /**
   * Which slack apps are genuinely on screen: open, and not minimised.
   *
   * The suspicion meter is about what somebody walking past would SEE, so a
   * minimised game does not count - which is exactly what the boss key is for.
   */
  public openSlackApps(): readonly string[] {
    return (this.wm?.windows ?? [])
      .filter((windowState) => windowState.slack && !windowState.minimized)
      .map((windowState) => windowState.appId);
  }

  /**
   * And which one the player is actually in.
   *
   * The front window is where the keyboard is, so it is the only one doing the
   * player any good. Everything else that is up is something the lead can see
   * and nobody is enjoying.
   */
  public focusedSlackApp(): string | null {
    const focused = (this.wm?.windows ?? []).find(
      (windowState) => windowState.id === this.wm?.focusedId,
    );

    return focused !== undefined && focused.slack && !focused.minimized
      ? focused.appId
      : null;
  }

  /**
   * The day's own screens, put on screen once each.
   *
   * "Once" is remembered in the shell store rather than here, so logging off
   * and back on does not shove the brief in the player's face again - and a
   * loaded save does not either, because the store came with it.
   */
  private syncDayScreens(): void {
    if (this.wm === null) {
      return;
    }

    const day = this.context.day.day();
    const state = this.context.day.state();
    const shown = this.context.appState.get().day;

    if (state === 'morning_brief') {
      // Yesterday's scorecard is not tomorrow's news.
      this.closeWindowIfOpen('scorecard');

      if (shown.briefShownFor !== day) {
        this.context.appState.patch('day', { briefShownFor: day });
        this.openApp('brief');
      }

      return;
    }

    if (state === 'day_end' && shown.scorecardShownFor !== day) {
      this.context.appState.patch('day', { scorecardShownFor: day });
      this.openApp('scorecard');
    }
  }

  /**
   * Closes a window the DAY opened and has finished with. Named separately
   * from `openApp` because it has one caller and one job: the shell hands it
   * the id of a scene that is over.
   */
  public closeApp(appId: string): void {
    this.closeWindowIfOpen(appId);
  }

  private closeWindowIfOpen(appId: string): void {
    const state = this.requireWindowManager();

    if (state.windows.some((windowState) => windowState.id === appId)) {
      this.commitWindows(closeWindow(state, appId));
    }
  }

  private renderDay(): void {
    const day = this.context.day;
    const state = day.state();
    const paused = day.paused();
    const lunch = isLunchtime(this.context.clock.now());
    const label = state === 'morning_brief'
      ? 'Morning brief'
      : state === 'day_end'
        ? 'Day end'
        : lunch
          ? 'Lunch'
          : 'Shift';

    // The desk, unreachable, for exactly as long as the block runs.
    //
    // It is an attribute on the screen rather than a modal, because a modal is
    // a thing this shell does not have and should not grow one for a mechanic:
    // the CSS takes the pointer off everything except the meeting window, the
    // clock and the queue carry on underneath it in full view, and the minute
    // the half hour is over the attribute goes and everything is live again. A
    // ringing phone deliberately does NOT do this - a call is a window, and
    // the normal rules keep applying underneath one.
    // The machine takes it the same way and for the same reason, and the
    // attribute says WHICH: they are two different rooms to be locked out of -
    // one is a meeting you are not at your desk during, the other is a desk
    // that is not there - and the sentence each of them refuses in is
    // different. A ringing phone deliberately does NOT do this - a call is a
    // window, and the normal rules keep applying underneath one.
    const takeover = day.interruption();
    const holding = takeover?.entry.source;

    this.element.dataset.takeover = holding === 'meeting' || holding === 'machine'
      ? holding
      : 'none';

    this.renderReboot();

    this.dayState.textContent = paused ? `${label} · paused` : label;
    this.dayState.dataset.state = state;
    this.dayState.dataset.lunch = String(lunch);
    // A paused game is a frozen scene: the sway and the tremor hold still
    // with the clock instead of wobbling over a world where no time passes.
    this.element.dataset.paused = String(paused);
    this.dayState.title = state === 'day_end'
      ? 'Open the day scorecard'
      : 'Open the morning brief';

    this.pauseButton.dataset.active = String(paused);
    this.pauseButton.setAttribute('aria-pressed', String(paused));
    this.pauseButton.setAttribute(
      'aria-label',
      paused ? 'Resume the clock' : 'Pause the clock',
    );
    this.pauseButton.title = paused ? 'Resume the clock' : 'Pause the clock';
    this.pauseButton.replaceChildren(
      createIcon(paused ? 'icon-play' : 'icon-pause'),
    );

    for (const [speed, button] of this.speedButtons) {
      const active = day.speed() === speed;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  /**
   * The countdown, on the taskbar, while a reboot the player pushed back is on
   * its way.
   *
   * It is a chip beside the other two rather than a window, and that is the
   * whole design of the postpone: those minutes are the player's, so the thing
   * that counts them must not be a thing that owns the screen. Work continues
   * under it, the boss key works under it, the lead comes round under it - and
   * the number goes down whether or not anybody has the window open.
   *
   * Only a machine, and only one that has actually been pushed. A chip
   * counting down to a phone call would be the seeded schedule reading itself
   * out loud, which is a different game.
   */
  private renderReboot(): void {
    const soon = this.context.day.upcoming();
    const coming = soon !== null
      && soon.entry.source === 'machine'
      && soon.postponed
      ? soon
      : null;

    this.rebootChip.hidden = coming === null;

    if (coming === null) {
      return;
    }

    const away = coming.ticksAway;

    this.rebootChip.textContent = countdownChip(away);
    this.rebootChip.dataset.left = String(coming.postponesLeft);
    this.rebootChip.dataset.away = String(away);
    this.rebootChip.title = coming.postponesLeft > 0
      ? `The workstation comes back in ${String(away)} minute(s), with `
        + `${String(coming.postponesLeft)} postpone(s) left in it. These are `
        + 'the minutes you bought; the desk is yours for all of them.'
      : `The workstation comes back in ${String(away)} minute(s), and there `
        + 'is nothing left to push it with. Finish what you can.';
  }

  /**
   * Fumble mode: over 80 stress the room starts swimming.
   *
   * It is a look and nothing else. Every action still dispatches exactly as
   * asked, every button still does what it says, and the copy on the chip says
   * so - a mechanic that silently made the player wrong would be a punishment
   * dressed as a joke, and this game does not do that.
   */
  private renderPressure(): void {
    const player = this.context.user.node;
    const read = (field: string): unknown => this.context.graph.getField(
      player,
      field,
    );
    const stress = read(FIELDS.stress);
    // Hands only go during the shift: once the clock stops, the sway stops -
    // and the scorecard stays still enough to actually click.
    const onShift = read(FIELDS.dayState) === 'shift';
    const now = this.context.clock.now();
    const desk = deskState(
      {
        startedAt: read(FIELDS.drinkStartedAt),
        tolerance: read(FIELDS.drinkTolerance),
        cans: read(FIELDS.deskCans),
        beerUnlocked: read(FIELDS.beerUnlocked),
        beerOpened: read(FIELDS.beerOpened),
      },
      now,
      onShift,
      shiftEndTick(this.context.day.day()),
      buffTicks,
    );
    // The interruption debuff is the third thing that moves the line, beside
    // the can and the crash, and it is read off the world exactly as they are:
    // one field with an expiry, so a save carries it and a load lands on it.
    const refocusing = isRefocusing(read(FIELDS.refocusUntil), now);
    const fumbling = onShift && typeof stress === 'number'
      && isFumblingWith(stress, desk.phase, refocusing);

    this.element.dataset.fumbling = String(fumbling);
    this.element.dataset.refocusing = String(onShift && refocusing);
    this.element.dataset.drink = desk.phase;
    // On while the window runs and off the minute it expires - which is the
    // whole of the interaction, because there is none. It is deliberately not
    // hidden by the fumble chip: they are two different sentences, one about
    // what is happening to the hands and one about why.
    this.refocusChip.hidden = !(onShift && refocusing);
    this.fumbleChip.hidden = !fumbling;
    this.fumbleChip.textContent = desk.phase === 'crash'
      ? 'Coming down'
      : 'Hands going';
    this.desk.render(desk);
    this.renderBoss();
  }

  /**
   * The durability chip: hidden while writes are landing, and up with the
   * reason on it while they are not.
   */
  private renderSaveHealth(): void {
    const problem = this.context.saveHealth.problem();

    this.saveChip.hidden = problem === null;
    this.saveChip.title = problem ?? '';
  }

  /**
   * The corridor. Telegraph is the whole mechanic, so it is said three ways at
   * once - the taskbar goes unsteady, the reflection crosses the top of the
   * screen, and a chip spells out what both of those mean - and it is only
   * ever a LOOK: nothing here dispatches, and the arrival decides everything.
   */
  private renderBoss(): void {
    const boss = this.context.day.boss();

    this.element.dataset.boss = boss.phase;
    this.doorFlash.hidden = boss.phase === 'clear';
    this.bossChip.hidden = boss.phase === 'clear';
    this.bossChip.dataset.phase = boss.phase;

    if (boss.phase === 'telegraph') {
      const left = boss.ticksToArrival ?? 0;
      this.bossChip.textContent = `Footsteps · ${String(left)}m`;
      this.bossChip.title = 'Somebody is coming down the corridor. Anything '
        + 'you would rather not explain has about a minute.';
      return;
    }

    if (boss.phase === 'present') {
      this.bossChip.textContent = 'He is here';
      this.bossChip.title = 'The lead is at your shoulder, being encouraging.';
    }
  }

  /**
   * Playing the week again after a firing. The session writes down the two
   * things that survive it and the page starts from nothing - a world that
   * never happened cannot be un-happened in place, and a half-rebuilt one is
   * worse than a reload.
   */
  private restartWeek(): void {
    const outcome = this.context.session.retryWeek();

    if (!outcome.ok) {
      this.notify('Not starting again', outcome.reason);
    }
  }

  /** The two things you can do to a desk, both through the registry. */
  private drink(): void {
    const outcome = this.context.day.drink();

    if (!outcome.ok) {
      this.notify('Not now', outcome.reason);
    }
  }

  private tidyDesk(): void {
    const outcome = this.context.day.tidyDesk();

    this.notify(
      outcome.ok ? 'Desk tidied' : 'Nothing to tidy',
      outcome.ok
        ? 'The empties are in the bin under the desk, where they will be found '
          + 'eventually, but not today.'
        : outcome.reason,
    );
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
