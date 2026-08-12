import type { DispatchResult } from '../engine-api';
import type { AppDef, AppIntent, GameApi } from './apps/types';
import { appsForTier } from './apps/manifest';
import { canInstall, canUninstall, resolveManifest } from './apps/installable';
import { formatSimTime } from './clock-format';
import { ASSISTANT_DISMISSAL_CAP } from './app-state';
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
import { remarkInThread } from './boss-thread';
import { buffTicks } from '../world/consumables';
import { isLunchtime, shiftEndTick } from '../world/day';
import { FIELDS, isSystemsEngineer } from '../world/fields';
import { isFumblingWith } from '../world/consumables';
import { isRefocusing } from '../world/meters';
import { presenceChatter } from '../world/dialogue';
import {
  type Presence,
  PRESENCE_LABELS,
  PRESENCE_TOOLTIPS,
  PRESENCE_VALUES,
} from '../world/presence';
import {
  canChooseDesktop,
  type DesktopChoice,
  DESKTOP_TIER_REFUSAL,
  needsDesktopReason,
  resolveDesktopChoice,
  type SecondPanelSpec,
  type Skin,
  skinById,
} from './skins';
import { Desk, deskState } from './desk';
import { Assistant, type AssistantWorld, AssistantVoice } from './assistant';
import { holdsTheDesk, SPEEDS, type Speed } from './day-driver';
import { isActiveWork } from '../world/sla';

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

  // Not readonly: the web store installs and uninstalls apps at runtime, and
  // the resolved manifest the desktop mounts is recomputed when it does.
  private apps: readonly AppDef[];
  private readonly surface: HTMLElement;
  private readonly iconGrid: HTMLElement;
  private startMenuList: HTMLElement | null = null;
  private readonly windowLayer: HTMLElement;
  private readonly toastStack: HTMLElement;
  private readonly taskbar: HTMLElement;
  /**
   * MATE's other panel (0.28.0), and nobody else's.
   *
   * Built once and kept, but only IN the document while a desktop that
   * declares two panels is on: a skin with one panel has one bar in its DOM,
   * not an empty second one hidden by a rule. `renderPanel` is the only thing
   * that puts it in or takes it out.
   */
  private readonly panelSecond: HTMLElement;
  /**
   * The name of the app that owns the menu bar (0.33.0), and nobody else's
   * chrome.
   *
   * Only ever in the document on a desktop that declares a `menu-bar` panel,
   * for the same reason the second bar is: a taskbar does not carry one, and a
   * hidden element in seven desktops' DOM would be the fork leaking into the
   * skins that never asked for it.
   */
  private readonly menuBarApp: HTMLElement;
  private readonly taskbarDivider: HTMLElement;
  private readonly taskbarTray: HTMLElement;
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
  private readonly panicButton: HTMLButtonElement;
  private readonly fumbleChip: HTMLElement;
  private readonly refocusChip: HTMLElement;
  private readonly rebootChip: HTMLElement;
  private readonly saveChip: HTMLElement;
  private readonly bossChip: HTMLElement;
  private readonly doorFlash: HTMLElement;
  private readonly presenceControl: HTMLElement;
  private readonly presenceState: HTMLElement;
  private readonly presenceRefusal: HTMLElement;
  private readonly desk: Desk;
  private readonly assistant: Assistant;
  private readonly voice = new AssistantVoice();
  private readonly speedButtons = new Map<Speed, HTMLButtonElement>();
  private readonly presenceButtons = new Map<Presence, HTMLButtonElement>();

  /** The custom properties this skin set on the desktop, to take back off. */
  private skinTokens: readonly string[] = [];

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
  private unsubscribeReloaded: (() => void) | null = null;
  private unsubscribeSaveHealth: (() => void) | null = null;

  private wm: WindowManagerState | null = null;
  private notifications: NotificationState = createNotificationState();

  public constructor(
    private readonly context: Readonly<ShellContext>,
    private readonly handlers: Readonly<DesktopHandlers>,
  ) {
    // The manifest the desktop mounts is base ∪ installed: the shipped roster
    // plus whatever the save carries an install of. With an empty install set -
    // which is every scripted walk and every shipped session until the web
    // store lands in lane B - it is the base roster unchanged. Re-mounting the
    // moment an install lands mid-session is lane B's seam; this resolves what a
    // session STARTS with, so a loaded save that had a toy on it comes back with
    // it on the desktop.
    this.apps = appsForTier(
      resolveManifest(context.manifest, context.appState.get().installed.apps),
      context.tier,
    );

    this.element = document.createElement('div');
    this.element.className = 'screen screen-desktop';
    this.element.dataset.testid = 'desktop';

    this.surface = document.createElement('div');
    this.surface.className = 'desktop-surface wallpaper';
    this.surface.dataset.testid = 'desktop-surface';

    const icons = document.createElement('ul');
    icons.className = 'desktop-icons';
    icons.dataset.testid = 'desktop-icons';
    this.iconGrid = icons;

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

    // The helper the office bought. It goes beside the desk rather than in it:
    // the desk is the things the player OWNS, and nobody chose this.
    this.assistant = new Assistant({
      dismiss: () => {
        this.dismissAssistant();
      },
    });

    this.surface.append(
      icons,
      this.windowLayer,
      this.desk.element,
      this.assistant.element,
      this.doorFlash,
      this.toastStack,
    );

    const taskbar = document.createElement('div');
    taskbar.className = 'taskbar';
    taskbar.dataset.testid = 'taskbar';

    // The second bar, for the one desktop that has one. Same class, so it is
    // the same chrome the tokens dress - a panel is a panel, and MATE's two
    // are the same object twice, not a bar and a special case.
    this.panelSecond = document.createElement('div');
    this.panelSecond.className = 'taskbar taskbar-second';
    this.panelSecond.dataset.testid = 'taskbar-second';

    // Whose menu bar it is. A readout rather than a control: it is the name of
    // the window with the keyboard, and pressing it does nothing because there
    // is nothing behind it to open - this shell's apps have no menus, and the
    // bar says only what it can actually answer for.
    this.menuBarApp = document.createElement('strong');
    this.menuBarApp.className = 'menu-bar-app';
    this.menuBarApp.dataset.testid = 'menu-bar-app';

    // The launcher. Its glyph, its word and its style are the skin's to say -
    // Start, Kickoff, Activities, Menu - so the element is built empty here and
    // filled by `renderLauncher` off whichever desktop the box is running. On
    // the issued Windows box that fills it with exactly what it always was.
    this.startButton = document.createElement('button');
    this.startButton.type = 'button';
    this.startButton.className = 'start-button';
    this.startButton.dataset.testid = 'start-button';
    this.startButton.setAttribute('aria-expanded', 'false');

    this.taskbarDivider = document.createElement('div');
    this.taskbarDivider.className = 'taskbar-divider';

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

    /*
     * The dot, on the taskbar, where the player can see what the office sees.
     *
     * Three buttons rather than one that cycles, and that is the mechanic
     * rather than a preference: every status is ONE click from every other
     * status, so a player who hears the phone start and wants to be reachable
     * is not two clicks away from it. They are a group of pressed/unpressed
     * buttons - the same shape and the same attributes the speed control uses,
     * so the keyboard, the screen reader and the tests all already know what
     * this is.
     *
     * The word beside them is not decoration. The suspicion drip is a TRADE,
     * and a trade whose cost is charged against a state the player cannot see
     * is a trap: the dot is legible at every minute of every day, in words,
     * without opening anything.
     */
    const presence = document.createElement('div');
    this.presenceControl = presence;
    presence.className = 'presence-control';
    presence.dataset.testid = 'presence-control';
    presence.setAttribute('role', 'group');
    presence.setAttribute('aria-label', 'Your status, as the office sees it');

    for (const value of PRESENCE_VALUES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'day-button presence-button';
      button.dataset.testid = `presence-${value}`;
      button.dataset.presence = value;
      // What it costs, said BEFORE it is chosen - the same rule the can on the
      // desk keeps. The dot's whole design is that both halves of the trade
      // are known in advance.
      button.title = `${PRESENCE_LABELS[value]}. ${PRESENCE_TOOLTIPS[value]}`;
      button.setAttribute(
        'aria-label',
        `Set your status to ${PRESENCE_LABELS[value]}`,
      );
      const dot = document.createElement('span');
      dot.className = 'presence-dot';
      button.append(dot);
      button.addEventListener(
        'click',
        () => {
          this.setPresence(value);
        },
        { signal: this.abort.signal },
      );
      this.presenceButtons.set(value, button);
      presence.append(button);
    }

    this.presenceState = document.createElement('span');
    this.presenceState.className = 'presence-state';
    this.presenceState.dataset.testid = 'presence-state';
    presence.append(this.presenceState);

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

    // The on-screen twin of the panic key.
    //
    // Backquote is a physical key with no touch equivalent, so on a phone the
    // hide-your-slacking mechanic was simply dead: the button is the thing you
    // jab when the boss appears and you have no keyboard. It fires the exact
    // same `panic()` the key does - one method, so the two cannot drift.
    //
    // It is in the DOM on every device, so the desktop keyboard path is
    // untouched and the control is always testable; CSS brings it forward and
    // up to a finger-sized target only where a coarse pointer or a narrow
    // viewport says a finger will actually need it.
    this.panicButton = document.createElement('button');
    this.panicButton.type = 'button';
    this.panicButton.className = 'boss-panic';
    this.panicButton.dataset.testid = 'boss-panic';
    this.panicButton.append(createIcon('icon-minimize'));
    this.panicButton.setAttribute(
      'aria-label',
      'Look busy - minimise everything that is not work',
    );
    this.panicButton.title = 'Look busy. Drops everything that is not work to '
      + 'the taskbar at once - the touch version of the panic key. Officially '
      + 'this is the "tidy your desktop" button. It is not for tidying your '
      + 'desktop.';
    this.panicButton.addEventListener(
      'click',
      () => {
        this.panic();
      },
      { signal: this.abort.signal },
    );

    this.taskbarTray = tray;
    tray.append(
      this.bossChip,
      this.saveChip,
      this.rebootChip,
      this.refocusChip,
      this.fumbleChip,
      presence,
      dayControls,
      this.panicButton,
      this.trayButton,
      clock,
    );

    this.taskbar = taskbar;
    // What the panel holds is the skin's second decision, so the row is filled
    // by `renderPanel` rather than appended here - and on the default skin it
    // fills it with the launcher, the divider, the window list and the tray, in
    // that order, which is the row this shell has always had.
    this.renderPanel();

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

    /*
     * And where a refused status says so: over the tray, against the control
     * that was pressed.
     *
     * In place rather than as a toast, because it is an answer to a click
     * somebody has just made and the answer is the teaching - the meeting
     * refuses in the meeting's own sentence, and reading it beside the button
     * is what connects the two. It goes when anything else does: Escape, an
     * outside click, or a status that is actually accepted.
     */
    this.presenceRefusal = document.createElement('p');
    this.presenceRefusal.className = 'presence-refusal';
    this.presenceRefusal.dataset.testid = 'presence-refusal';
    this.presenceRefusal.setAttribute('role', 'status');
    this.presenceRefusal.hidden = true;

    this.element.append(
      this.surface,
      taskbar,
      this.startMenu,
      this.trayPanel,
      this.presenceRefusal,
    );

    // The day screens are put on screen by the day itself and stay out of the
    // icon grid; the start menu still lists them. Built through the same method
    // the web store's live re-mount calls, so a session that starts with a toy
    // installed and one that installs it mid-shift build the exact same grid.
    this.rebuildIcons();

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
      installApp: (id) => this.installApp(id),
      uninstallApp: (id) => this.uninstallApp(id),
      setDesktop: (choice) => this.setDesktop(choice),
      restartWeek: () => {
        this.restartWeek();
      },
      acceptOffer: () => {
        this.acceptOffer();
      },
      stayAnotherWeek: () => {
        this.stayAnotherWeek();
      },
      employer: context.employer,
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
      () => this.skin(),
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
      // The install set rides the save, so a load can bring back a machine with
      // a toy on it that this session never installed. The manifest is resolved
      // off that set, so it has to be rebuilt BEFORE the windows are restored -
      // otherwise a saved toy window has no definition to reopen into and is
      // silently dropped. It is a no-op when nothing installed changed, which is
      // every external patch that is not a load.
      this.rebuildAppSurfaces();
      this.restoreWindows();
      // The desktop the box is running rides the save too, so a session that
      // comes back on GNOME comes back on GNOME - chrome and all. It is applied
      // AFTER the windows are restored, because the titlebars it re-chromes are
      // the ones that line just put back.
      this.applySkin();
      this.syncDayScreens();
    });
    // The character's transient display resets ONLY on a real load or restart,
    // never on an ordinary external patch: a boss beat writing to the store
    // fires `onReplaced` too, and resetting the voice there was what wiped the
    // note-owed state between closing it and its return on the box. Its durable
    // memory (the count, the closed-day) rides the store and comes back on its
    // own.
    this.unsubscribeReloaded = this.context.appState.onReloaded(() => {
      this.voice.remount();
    });
    this.unsubscribeSaveHealth = this.context.saveHealth.onChanged(() => {
      this.renderSaveHealth();
    });

    this.applySkin();
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
    this.unsubscribeReloaded?.();
    this.unsubscribeReloaded = null;
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

  /* -- the skin: the chrome the box is wearing (0.27.0) ------------------- */

  /** The desktop this box is running, off the save-carried choice. */
  private skin(): Readonly<Skin> {
    return skinById(this.context.appState.get().desktop.skin);
  }

  /**
   * Installing a desktop on the machine, which is the whole of slice 2's
   * control.
   *
   * Everything about the move is decided in one place and by pure functions:
   * the choice is RESOLVED (a desktop brings its paired distro; going back to
   * the issued box drops the distro, because a Windows box is not on one), then
   * GATED on the promotion the same way ssh is, and only a legal choice reaches
   * the store. The refusal is handed back in the world's own sentence for the
   * window to say beside the button that was pressed - a control that does
   * nothing and explains nothing is the dead end the house rules forbid.
   *
   * Nothing here dispatches. A desktop is chrome: no ticket moves, no meter
   * moves, no field is written, and every golden world stays byte-identical
   * because the choice rides in the screen store the save carries.
   */
  private setDesktop(choice: Readonly<DesktopChoice>): DispatchResult {
    const current = this.context.appState.get().desktop;
    const resolution = resolveDesktopChoice(current, choice);
    const engineer = isSystemsEngineer(
      this.context.graph.getField(this.context.user.node, FIELDS.playerTier),
    );

    // The distro that ships no desktop, asked for on a machine that has none
    // either (0.28.0). There is nothing to put on the screen until the player
    // says what, so this refuses and NAMES the pick - the window opens its
    // chooser off the same pure resolution rather than off this sentence, and
    // this is the backstop for anything that asks the shell directly. The tier
    // still comes first: somebody who may not run Linux at all is told THAT,
    // not sent shopping for a desktop they cannot have.
    if (resolution.kind === 'needs-desktop') {
      return {
        ok: false,
        reason: engineer
          ? needsDesktopReason(resolution.distro)
          : DESKTOP_TIER_REFUSAL,
      };
    }

    const next = resolution.next;
    const legal = canChooseDesktop(next, engineer);

    if (!legal.ok) {
      return legal;
    }

    this.context.appState.patch('desktop', next);
    this.applySkin();
    return legal;
  }

  /**
   * Puts the chosen desktop on the screen: the tokens, the panel, the window
   * buttons.
   *
   * Called at mount, after a load (a save carries the desktop, so a session
   * that comes back on GNOME comes back on GNOME) and on every switch. It is
   * the only place the three halves of a skin are applied, so they cannot
   * drift apart.
   */
  private applySkin(): void {
    const skin = this.skin();
    const choice = this.context.appState.get().desktop;

    // The old skin's properties come OFF before the new one's go on: a token
    // one desktop sets and the next does not must not survive the switch, or
    // the chrome would be a pile of every desktop the player has ever tried.
    for (const name of this.skinTokens) {
      this.element.style.removeProperty(name);
    }

    for (const [name, value] of Object.entries(skin.tokens)) {
      this.element.style.setProperty(name, value);
    }

    this.skinTokens = Object.keys(skin.tokens);
    this.element.dataset.skin = skin.id;
    this.element.dataset.panel = skin.panel.position;
    // Where the OTHER panel is, or that there is not one. The layout a second
    // bar needs - a third grid row, and the surfaces that hang off the tray
    // coming back UP from the bottom of it - is CSS the stylesheet can only
    // write if the document says which edges are in use, and "none" is the
    // honest answer for the six desktops with one bar.
    this.element.dataset.panelSecond = skin.secondPanel?.position ?? 'none';
    this.element.dataset.launcher = skin.panel.launcher.style;
    this.element.dataset.distro = choice.distro ?? 'none';
    this.renderPanel();

    if (this.wm !== null) {
      this.renderer.applySkin(this.wm);
    }
  }

  /**
   * The panel - or, on MATE, both of them - filled with what this desktop's
   * panels hold.
   *
   * GNOME's window list is genuinely NOT IN THE PANEL - it is a desktop with no
   * taskbar, and the overview is what replaces it - so the row is emptied and
   * refilled rather than having things hidden in it. The window list keeps
   * existing as an element either way, because the taskbar buttons are painted
   * off the window manager whether or not this desktop shows them, and putting
   * it back is then one append rather than a rebuild.
   *
   * The same is true one level up for MATE's second bar: the window list and
   * the tray MOVE into it, they are not copied, so there is exactly one of each
   * on the screen and the taskbar buttons the window manager paints are the
   * ones the player is looking at whichever bar they ended up on.
   */
  private renderPanel(): void {
    const skin = this.skin();
    this.renderLauncher();
    this.taskbar.replaceChildren(this.startButton);
    this.fillPanel(this.taskbar, skin.panel, true);
    // After the bars are filled, because the element it writes into has just
    // been put in one of them (or has just been left out of both).
    this.renderMenuBarApp();

    if (skin.secondPanel === null) {
      // Out of the document entirely, not emptied and left there: a desktop
      // with one panel has ONE bar, and the reverted-MATE case has to leave
      // nothing behind.
      this.panelSecond.remove();
      this.panelSecond.replaceChildren();
      return;
    }

    this.panelSecond.replaceChildren();
    this.fillPanel(this.panelSecond, skin.secondPanel, false);

    // Straight after the first bar, so the document reads top-bar-then-taskbar
    // whichever edges they are on; the grid rows are the stylesheet's job.
    //
    // The guard is for the one call that happens while the desktop element is
    // still being assembled: the constructor fills the panel BEFORE it appends
    // the bar to the desktop, and `applySkin` at the end of the constructor is
    // what puts this right. It asks for a PARENT rather than for
    // `isConnected`, because the desktop element is mounted into the document
    // after it is built, and a skin restored from a save has to hang its second
    // bar off an element that is not on screen yet.
    const placed = this.panelSecond.parentNode !== null;

    if (!placed && this.taskbar.parentNode !== null) {
      this.taskbar.after(this.panelSecond);
    }
  }

  /**
   * One emptied panel's contents, in the order a panel holds them: the window
   * list first, the tray at the far end.
   *
   * The launcher is not here because it belongs to the skin rather than to a
   * panel - `renderPanel` puts it in the panel that always exists before this
   * fills the rest of that row. `afterLauncher` is what the divider is FOR: it
   * separates the corner button from the windows beside it, so a panel with no
   * launcher in it must not start with a rule against its own left edge.
   */
  private fillPanel(
    element: HTMLElement,
    panel: Readonly<SecondPanelSpec>,
    afterLauncher: boolean,
  ): void {
    // What KIND of bar this is, on the bar itself: a menu bar is not a taskbar
    // at the other edge, and the stylesheet has to be able to say so without
    // asking which skin is on. Written for every panel, so "panel" is a fact
    // the document states rather than the absence of an attribute.
    element.dataset.kind = panel.kind;

    // The focused app's name, which is the whole of what a menu bar in this
    // shell owns. First in the row, where the app name goes.
    if (panel.kind === 'menu-bar') {
      element.append(this.menuBarApp);
    }

    if (panel.windowList) {
      if (afterLauncher) {
        element.append(this.taskbarDivider);
      }

      element.append(this.taskbarWindows);
    }

    if (panel.tray) {
      element.append(this.taskbarTray);
    }
  }

  /**
   * Whose menu bar it is at the moment (0.33.0).
   *
   * The focused window's title, and the DESKTOP'S OWN NAME when there is no
   * focused window - which is the honest answer rather than an empty strip: on
   * a machine with nothing open the shell itself is what has the screen, and a
   * bar that went blank would read as a bar that had broken.
   *
   * A minimized window does not own it. It is not on the screen, and a menu
   * bar naming a window nobody can see would be the one thing in this chrome
   * that was not about what is in front of the player.
   *
   * Called from the paint AND from the panel build, because the two happen in
   * either order: a window can be focused on a desktop that has no menu bar
   * and then the player switches to one, and a menu bar can be built before
   * anything has ever been painted into it.
   */
  private renderMenuBarApp(): void {
    const state = this.wm;
    const focused = state === null
      ? undefined
      : state.windows.find(
        (windowState) => windowState.id === state.focusedId
          && !windowState.minimized,
      );

    this.menuBarApp.textContent = focused?.title ?? this.skin().label;
  }

  /** The launcher's glyph and word, which are the corner's whole personality. */
  private renderLauncher(): void {
    const launcher = this.skin().panel.launcher;
    const label = document.createElement('span');
    label.textContent = launcher.label;
    this.startButton.replaceChildren(
      ...(launcher.icon === null ? [] : [createIcon(launcher.icon)]),
      label,
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
    this.startMenuList = list;
    this.fillStartMenu(list);
    menu.append(rail, list);
    return menu;
  }

  /**
   * Fills (or refills) the start-menu list: every app first, the day's own
   * screens after, then the session verbs.
   *
   * It is a method rather than inline in `createStartMenu` because the web
   * store's live re-mount calls it again: installing a toy adds its entry here
   * the same moment its icon lands, and uninstalling takes it away. `apps` is in
   * installation order, which is also the taskbar's order and the order a loaded
   * save reopens its windows in.
   */
  private fillStartMenu(list: HTMLElement): void {
    list.replaceChildren();

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
  }

  /**
   * The desktop icon grid, (re)built off the resolved manifest.
   *
   * The day's own screens are put on screen by the day and stay out of the grid;
   * everything else with an icon gets one. Called once at construction and again
   * whenever the web store changes what is installed.
   */
  private rebuildIcons(): void {
    this.iconGrid.replaceChildren();

    for (const app of this.apps.filter((entry) => entry.desktop !== false)) {
      this.iconGrid.append(this.createDesktopIcon(app));
    }
  }

  /**
   * Installing a program off the web store, live - and STATE-AWARE, which is the
   * half lane B was missing.
   *
   * The state is checked BEFORE the world verb is dispatched, in this order and
   * for these reasons:
   *
   * - An id the catalogue does not hold is refused outright and never reaches
   *   the install set. This is load-bearing: an unknown id in the save-carried
   *   set is one `resolveManifest` drops on the way in, so the next save would
   *   be one the strict parse refuses - an unloadable file made by a click.
   * - An already-installed id is refused rather than re-dispatched: a second
   *   install writes a second audit line and re-arms the lead's beat for a toy
   *   that is already on the desktop, which is a telling-off nobody earned.
   *
   * Only once the move is legal does the audit get written, the set gain the id,
   * and the desktop re-mount. A same-tick reinstall of a just-uninstalled toy is
   * legal here (the set no longer holds it) and the world verb refuses it on its
   * own duplicate-minute guard, handed straight back for the store to say - a
   * refusal, not a crash, and the set is left as it was.
   */
  private installApp(id: string): DispatchResult {
    const current = this.context.appState.get().installed.apps;
    const legal = canInstall(current, id);

    if (!legal.ok) {
      return legal;
    }

    const result = this.context.day.install(id);

    if (!result.ok) {
      return result;
    }

    this.context.appState.patch('installed', { apps: [...current, id] });
    this.rebuildAppSurfaces();
    return result;
  }

  /**
   * And taking one back off, live - the mirror of the above, and state-aware for
   * the same reasons. Uninstalling something that is not installed is refused
   * before the verb runs, so it cannot write a removal record for a program that
   * was never on the machine.
   *
   * One ordering matters on the way out: the window is closed BEFORE the
   * definition is forgotten, so the renderer unmounts a toy it still knows about
   * rather than tripping over one it does not. The audit trail is deliberately
   * left alone; the removal is its own line, and the record that it was ever
   * there is the whole point of the trail surviving it.
   */
  private uninstallApp(id: string): DispatchResult {
    const current = this.context.appState.get().installed.apps;
    const legal = canUninstall(current, id);

    if (!legal.ok) {
      return legal;
    }

    const result = this.context.day.uninstall(id);

    if (!result.ok) {
      return result;
    }

    this.closeWindowIfOpen(id);
    this.context.appState.patch('installed', {
      apps: current.filter((appId) => appId !== id),
    });

    this.rebuildAppSurfaces();
    return result;
  }

  /**
   * Recomputes the resolved manifest and rebuilds every surface that mounts it:
   * the renderer's definitions, the icon grid and the start menu.
   *
   * The install set has already been patched into the store by the caller, so
   * this reads it back and resolves `base ∪ installed` exactly as the mount did
   * at construction - one code path for "starts with a toy" and "installs one
   * mid-shift", which is what keeps the two impossible to disagree.
   */
  private rebuildAppSurfaces(): void {
    const previous = new Set(this.apps.map((app) => app.id));
    const resolved = appsForTier(
      resolveManifest(
        this.context.manifest,
        this.context.appState.get().installed.apps,
      ),
      this.context.tier,
    );
    const next = new Set(resolved.map((app) => app.id));

    // Nothing to do when the set is unchanged - which is the common case for the
    // load path, where this runs on every external patch (a boss beat, a chat
    // line) and only a genuine change in what is installed should churn the DOM.
    if (previous.size === next.size
      && [...next].every((id) => previous.has(id))) {
      return;
    }

    this.apps = resolved;

    for (const app of this.apps) {
      if (!previous.has(app.id)) {
        this.renderer.registerApp(app);
      }
    }

    for (const id of previous) {
      if (!next.has(id)) {
        this.renderer.forgetApp(id);
      }
    }

    this.rebuildIcons();

    if (this.startMenuList !== null) {
      this.fillStartMenu(this.startMenuList);
    }
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
      if (
        isVisible(this.startMenu)
        || isVisible(this.trayPanel)
        // The refused status is the third thing on this desktop that is up
        // because of one click and expects to be dismissed by one key. It has
        // to be checked BEFORE the scene below: Escape over a refusal that
        // arrived from inside a meeting would otherwise close the meeting -
        // a window the player is not allowed to leave - which is the mechanic
        // being undone by the thing that explained it.
        || isVisible(this.presenceRefusal)
      ) {
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
    this.panic();
  }

  /**
   * The panic action, behind both the boss key and the on-screen panic button.
   *
   * Extracted so the two controls cannot drift: the key and the button close
   * the same transient surfaces and minimise the same slack windows, because
   * they are the same method. No wait for a field to lose focus - the manager
   * in the doorway does not wait, and neither does this.
   */
  private panic(): void {
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

    // And the refusal, which goes on the next thing the player does anywhere
    // except the control it is about - pressing another status is a second
    // attempt, and it answers for itself.
    if (
      isVisible(this.presenceRefusal)
      && !this.presenceControl.contains(target)
      && !this.presenceRefusal.contains(target)
    ) {
      this.presenceRefusal.hidden = true;
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
    // The refused status goes with them. It is an answer to one click, and an
    // answer still sitting there two minutes later is a screen saying
    // something that may well have stopped being true - the meeting ends.
    this.presenceRefusal.hidden = true;
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
   *
   * On a desktop with NO window list (0.27.0: GNOME, which has no taskbar at
   * all) that button exists but is not in the document, and focusing a detached
   * element does nothing - so the launcher takes the cursor instead. The rule is
   * the rule whatever the chrome looks like: the keyboard never ends up nowhere.
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

    const button = this.taskbarButtons.get(focusOwner)?.element;

    if (button !== undefined && button.isConnected) {
      button.focus();
      return;
    }

    this.startButton.focus();
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
    // The menu bar names whichever of those windows has the keyboard, so it is
    // repainted with them rather than on its own schedule.
    this.renderMenuBarApp();
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

    const heldByTakeover = holding === 'meeting' || holding === 'machine';

    this.element.dataset.takeover = heldByTakeover ? holding : 'none';

    // F6: the presence control goes inert under a takeover so it stops inviting
    // a click the world is only going to refuse - a refused status used to pop
    // its panel over the meeting, which is a dead click that answers you back.
    // The dimming is the teaching now, consistent with the dimmed desk, and it
    // is a marked attribute rather than only a CSS-by-ancestor so the same fact
    // drives the look and the tests. The OFF-SHIFT refusal is untouched: there
    // is no takeover then, the control stays live, and the world still refuses a
    // dot at a desk with no shift on - in that refusal's own sentence.
    //
    // The buttons are DISABLED and not merely un-pointered, so the keyboard
    // cannot reach past the dimming: a tab-and-Enter that popped the refused
    // panel over the meeting is the same dead click by another input device, and
    // a rule that only holds for the mouse is a rule the product does not have.
    this.presenceControl.dataset.inert = String(heldByTakeover);

    for (const button of this.presenceButtons.values()) {
      button.disabled = heldByTakeover;
    }

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
    // The seam filters before it selects, so there is nothing to check here:
    // what comes back is the pushed workstation or nothing at all. A chip that
    // did its own filtering would go blank whenever an unmet call happened to
    // be nearer, which is the mechanic disappearing because the phone rang.
    const coming = this.context.day.pendingRestart();

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
    // The dot rides here rather than on its own subscription: it is a field on
    // the player node, so every load, every restore and every set announces
    // itself through exactly the same world change these meters do.
    this.renderPresence();
    this.fumbleChip.textContent = desk.phase === 'crash'
      ? 'Coming down'
      : 'Hands going';
    this.desk.render(desk);
    this.renderBoss();
    // The character reads the same minute the chips do, and reads nothing the
    // chips do not: it is a comment on the desk, so it is painted from the
    // desk's own facts rather than from anything of its own.
    this.renderAssistant(onShift, fumbling, now);
  }

  /**
   * The Assistant, told what is happening and left to say something wrong
   * about it.
   *
   * Everything handed over is already on the screen somewhere else - the
   * takeover attribute, the ringing window, the reboot chip, the dot, the
   * fumble chip, the queue the meeting window counts - and nothing here
   * dispatches, reads back or waits for it. It is pure overlay, which is the
   * one property of it a journey depends on.
   */
  private renderAssistant(
    onShift: boolean,
    fumbling: boolean,
    now: number,
  ): void {
    const takeover = this.context.day.interruption();
    const world: AssistantWorld = {
      onShift,
      heldByTakeover: holdsTheDesk(takeover?.entry.source),
      // A phone or a body at the desk: the interruptions that are a window
      // rather than a room, which are the ones it can talk over.
      ringing: takeover !== null && !holdsTheDesk(takeover.entry.source),
      rebootComing: this.context.day.pendingRestart() !== null,
      dnd: this.context.day.presence() === 'dnd',
      fumbling,
      openTickets: this.context.graph
        .nodesOfKind('ticket')
        .filter(isActiveWork)
        .length,
      day: this.context.day.day(),
    };

    const memory = this.context.appState.get().assistant;
    const view = this.voice.speak(world, now, memory);

    // Paying the note clears the durable "owes a note" flag, so the same
    // minute's later paints - and every day after - read it as open. `patch`,
    // not `patchExternal`: this repaints itself on the next line, and a listener
    // firing back into this paint is the loop the store warns about.
    if (view?.readmitted === true && memory.closedOnDay !== null) {
      this.context.appState.patch('assistant', { closedOnDay: null });
    }

    this.assistant.render(view);
  }

  /**
   * Closing it, which is the one thing anybody can do to it.
   *
   * Two durable facts go into the screen store, both carried by the save and
   * read by nothing but the joke: the count, one higher, and the day it was
   * closed on. They are DURABLE on purpose - the note it returns with has to
   * survive a boss beat, a day boundary and a reload, none of which an object
   * the desktop re-instantiates could. `patch`, not `patchExternal`, because
   * the desktop owns this slice and repaints it on the next line.
   */
  private dismissAssistant(): void {
    // Clamped so the running total the save carries can never climb out of the
    // safe-integer range, however many times somebody closes it.
    const closed = Math.min(
      this.context.appState.get().assistant.dismissals + 1,
      ASSISTANT_DISMISSAL_CAP,
    );

    this.context.appState.patch('assistant', {
      dismissals: closed,
      closedOnDay: this.context.day.day(),
    });
    this.assistant.render(null);
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

  /**
   * Taking the offer. The session writes down the career that crosses the
   * threshold and the page starts again on the next employer's Monday - a world
   * that never happened cannot be un-happened in place, so the switch is a
   * reload, exactly as the retry is.
   */
  private acceptOffer(): void {
    const outcome = this.context.session.switchEmployer();

    if (!outcome.ok) {
      this.notify('The offer is still open', outcome.reason);
    }
  }

  /**
   * Staying. The session writes down the career, the building and the toys, and
   * the page starts again on the same shop's next Monday - a reload for the
   * same reason the other two doors are one: the world on the far side of a
   * week boundary is built, not edited.
   */
  private stayAnotherWeek(): void {
    const outcome = this.context.session.stayAnotherWeek();

    if (!outcome.ok) {
      this.notify('Not staying, then', outcome.reason);
    }
  }

  /**
   * The dot, set from the tray.
   *
   * Nothing is decided here. The world takes the status or refuses it - there
   * is no shift on, or the desk is currently half an hour in a room nobody can
   * leave - and both answers reach the player in the sentence the world used,
   * beside the button they pressed. The buttons are repainted either way, off
   * what the graph actually holds: a control that showed the status it was
   * asked for rather than the status the world kept would be a dot that lies
   * to the one person it exists to inform.
   */
  private setPresence(to: Presence): void {
    const outcome = this.context.day.setPresence(to);

    this.presenceRefusal.hidden = outcome.ok;
    this.presenceRefusal.textContent = outcome.ok ? '' : outcome.reason;

    if (outcome.ok) {
      this.sayWhatTheOfficeThinks(to);
    }

    this.renderPresence();
  }

  /**
   * The office, noticing - once each, for the whole week.
   *
   * The lines are content and the "once" is the TRANSCRIPT rather than a
   * counter: a remark already in somebody's thread is a remark already made,
   * which survives a save because the thread does. So a player who flips the
   * dot forty times hears four things, in the order they were written, and the
   * fortieth flip is met with the silence it deserves.
   *
   * One per change at most: the whole table firing at once would be the chorus
   * the spec forbids, and the office is not a Greek play.
   */
  private sayWhatTheOfficeThinks(to: Presence): void {
    for (const remark of presenceChatter(to)) {
      if (remarkInThread(this.context.appState, remark.speaker, remark.line, true)) {
        const name = this.context.graph.getField(remark.speaker, FIELDS.name);

        // Named, deliberately: the OTHER thing that says somebody noticed a
        // status is the Away sting, whose notice is titled for a person it
        // does not name - because that one is a reputation hit and the point
        // of it is to send the player to the thread to find out who. This is
        // a colleague remarking, and a remark with a name on it is the office
        // being an office rather than a second consequence.
        this.notify(
          `${typeof name === 'string' ? name : 'Somebody'} noticed the dot`,
          remark.line,
        );
        return;
      }
    }
  }

  /**
   * What the taskbar says the office can see, painted off the graph.
   *
   * Read rather than remembered, like every other surface in this shell: a
   * load lands on somebody else's status, and a dot the desktop was keeping
   * its own copy of would go on showing the one this session set.
   */
  private renderPresence(): void {
    const showing = this.context.day.presence();

    for (const [value, button] of this.presenceButtons) {
      const active = value === showing;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }

    this.presenceState.textContent = PRESENCE_LABELS[showing];
    this.presenceState.dataset.presence = showing;
    // F1: the word is collapsed on the taskbar and revealed on hover/focus, so
    // the current status has to be legible without reading it - the title names
    // it for a hover, and the control reflects it for anything styling the
    // cluster by the status it is showing.
    this.presenceControl.dataset.presence = showing;
    this.presenceControl.title = `Your status: ${PRESENCE_LABELS[showing]}`;
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
