import type {
  AppDef,
  AppInstance,
  AppIntent,
  GameApi,
} from './apps/types';
import { createIcon } from './icons';
import { createReentrantPass } from './reentrant';
import type { Skin } from './skins';
import {
  closeWindow,
  focusWindow,
  minimizeWindow,
  moveWindow,
  resizeWindow,
  toggleMaximizedWindow,
  type ManagedWindow,
  type ResizeHandle,
  type WindowManagerState,
} from './wm';

/** `PointerEvent.buttons` bit for the primary (left) button. */
const PRIMARY_BUTTON_MASK = 1;

const RESIZE_HANDLES: readonly ResizeHandle[] = [
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
  'nw',
];

export interface MountRefusal {
  /** The window manager with the window that would not open taken out of it. */
  readonly state: WindowManagerState;
  readonly title: string;
  readonly body: string;
}

/**
 * What happens when an app's `mount` throws.
 *
 * Two decisions, both of them made here rather than in the middle of a paint,
 * so that both can be driven without a document: the window CLOSES - a frame
 * with nothing in it is a dead end, and the next paint would only try to mount
 * it again - and the player is told which app it was and what it actually said.
 * "Something went wrong" is the one sentence a support game may not ship.
 */
export function refuseMount(
  state: Readonly<WindowManagerState>,
  windowState: Readonly<ManagedWindow>,
  failure: unknown,
): MountRefusal {
  const said = failure instanceof Error && failure.message.trim().length > 0
    ? failure.message
    : 'It did not say why, which is worse.';

  return {
    state: closeWindow(state, windowState.id),
    title: `${windowState.title} would not open`,
    body: `The window has been closed rather than left there empty: ${said}`,
  };
}

/**
 * The pointer gestures in flight, by the window each one is dragging.
 *
 * A gesture used to be filed as "a gesture", which is fine right up until the
 * window it belongs to closes underneath it - from its own close button, from
 * the boss key's cousin, from a load that replaces the desktop. The listeners
 * live on `window` and outlive the element, and the window ID an app gets is
 * derived from the app, so REOPENING that app hands the ghost gesture a live
 * window again: the new one jumps to the pointer on the first idle move. Filed
 * by window, a close can end exactly the gestures that were about it.
 */
export class GestureBook {
  private readonly byWindow = new Map<string, Set<AbortController>>();

  public add(windowId: string, gesture: AbortController): void {
    const live = this.byWindow.get(windowId) ?? new Set<AbortController>();
    live.add(gesture);
    this.byWindow.set(windowId, live);
  }

  /** One gesture finished the ordinary way: released, cancelled, blurred. */
  public end(windowId: string, gesture: AbortController): void {
    gesture.abort();
    const live = this.byWindow.get(windowId);

    if (live === undefined) {
      return;
    }

    live.delete(gesture);

    if (live.size === 0) {
      this.byWindow.delete(windowId);
    }
  }

  /** The window went away. Nothing that was dragging it may survive it. */
  public abortWindow(windowId: string): void {
    for (const gesture of this.byWindow.get(windowId) ?? []) {
      gesture.abort();
    }

    this.byWindow.delete(windowId);
  }

  public abortAll(): void {
    for (const windowId of [...this.byWindow.keys()]) {
      this.abortWindow(windowId);
    }
  }

  /** How many gestures are still in flight. For the tests and for nothing else. */
  public get size(): number {
    let total = 0;

    for (const live of this.byWindow.values()) {
      total += live.size;
    }

    return total;
  }
}

interface RenderedWindow {
  readonly element: HTMLElement;
  /** The titlebar's button row, rebuilt when the desktop skin changes. */
  readonly controls: HTMLElement;
  /**
   * The maximize button, or NULL under a skin whose titlebars do not have one.
   *
   * Null rather than hidden: GNOME's close-only titlebar is the sharpest tell
   * any desktop has, so the button is not built at all - there is nothing
   * in the DOM to un-hide - and every read of it here has to cope with that.
   */
  maximizeButton: HTMLButtonElement | null;
  readonly abortController: AbortController;
  readonly instance: AppInstance;
  /** Last painted maximize state; null until the first paint. */
  maximizeIcon: boolean | null;
}

type ReadState = () => Readonly<WindowManagerState>;
type CommitState = (state: WindowManagerState) => void;
type ReadSkin = () => Readonly<Skin>;

function titlebarButton(
  className: string,
  label: string,
  icon: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `window-control ${className}`;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(createIcon(icon));
  return button;
}

export class WindowRenderer {
  private readonly rendered = new Map<string, RenderedWindow>();
  private readonly definitions = new Map<string, AppDef>();
  private readonly gestures = new GestureBook();
  /** Intents addressed to a window that is not mounted yet. */
  private readonly pendingIntents = new Map<string, AppIntent>();
  /**
   * A pass mounts plugin code, and plugin code may open another window from
   * its own `mount`. That commits new state mid-pass, so the paint is guarded:
   * the nested request waits for the running pass instead of re-entering it
   * before the current window is on the books.
   */
  private readonly paint = createReentrantPass<Readonly<WindowManagerState>>(
    (state) => {
      this.paintOnce(state);
    },
  );

  public constructor(
    private readonly layer: HTMLElement,
    manifest: readonly AppDef[],
    private readonly api: GameApi,
    private readonly readState: ReadState,
    private readonly commitState: CommitState,
    /**
     * The desktop the box is running (0.27.0). The renderer reads exactly one
     * thing off it - which titlebar buttons exist and at which end - because
     * that is the whole of a skin's reach into a window.
     */
    private readonly readSkin: ReadSkin,
  ) {
    for (const definition of manifest) {
      this.definitions.set(definition.id, definition);
    }
  }

  public sync(state: Readonly<WindowManagerState>): void {
    this.paint(state);
  }

  /**
   * Teaches the renderer an app definition installed at runtime, and forgets one
   * uninstalled.
   *
   * The web store mounts and unmounts apps mid-session, so the definitions map -
   * built once from the boot manifest - has to grow and shrink with it. Forget
   * is only ever called for an app whose window has already been closed by the
   * desktop, so there is no live window left pointing at a definition this drops.
   */
  public registerApp(definition: AppDef): void {
    this.definitions.set(definition.id, definition);
  }

  public forgetApp(id: string): void {
    this.definitions.delete(id);
  }

  /**
   * Hands an intent to the app in `windowId`. The window may not be mounted
   * yet - an app that opens another from its own `mount` runs inside a paint,
   * and the paint that creates the target window is deferred behind it - so an
   * intent for a window that does not exist yet is held for its first mount.
   */
  public deliverIntent(windowId: string, intent: AppIntent): void {
    const rendered = this.rendered.get(windowId);

    if (rendered === undefined) {
      this.pendingIntents.set(windowId, intent);
      return;
    }

    rendered.instance.receiveIntent?.(intent);
  }

  private paintOnce(state: Readonly<WindowManagerState>): void {
    const openIds = new Set(state.windows.map(({ id }) => id));

    for (const [id, rendered] of this.rendered) {
      if (!openIds.has(id)) {
        // The drag first: a gesture is listening on `window`, so it outlives
        // the element it was moving unless it is told the window has gone.
        this.gestures.abortWindow(id);
        rendered.abortController.abort();
        rendered.instance.unmount();
        rendered.element.remove();
        this.rendered.delete(id);
        // A closed window's undelivered intent dies with it: reopening the
        // app later must not resurrect a request from another session.
        this.pendingIntents.delete(id);
      }
    }

    // Apps whose `mount` threw. They are being closed, and the paint that
    // closes them has not run yet, so this pass must not try to place them.
    const refused = new Set<string>();

    for (const windowState of state.windows) {
      if (!this.rendered.has(windowState.id)) {
        const rendered = this.createRenderedWindow(windowState);

        if (rendered === null) {
          refused.add(windowState.id);
          continue;
        }

        this.rendered.set(windowState.id, rendered);
      }
    }

    state.windows.forEach((windowState, index) => {
      const rendered = this.rendered.get(windowState.id);

      if (rendered === undefined) {
        if (refused.has(windowState.id)) {
          return;
        }

        throw new Error(`Window renderer lost "${windowState.id}".`);
      }

      this.updateRenderedWindow(
        rendered,
        windowState,
        index + 1,
        state.focusedId === windowState.id,
      );
    });
  }

  /**
   * Puts the keyboard inside a window, on the control it is mostly about.
   *
   * The day's own screens are put on the desktop BY the day - a manager in the
   * doorway, a review at three o'clock - and a keyboard player was left to Tab
   * in from the top of the document to reach "Take it on the chin". The
   * primary button first, because that is the sentence the window is asking;
   * then any control it does have (the fridge's button is disabled all week,
   * and a disabled button cannot hold a cursor); and the close button last,
   * which every window has and which is never a dead end.
   *
   * WITHOUT SCROLLING, always. A day screen's primary button is the LAST thing
   * in it - "Clock off" sits under the whole scorecard - and a plain `focus()`
   * asks the browser to bring the focused element into view, which drags the
   * pane it lives in to the bottom. The scorecard opened two thirds of the way
   * down, on the back half of a sentence, with the work and the payslip - the
   * numbers the evening exists to show - above the fold and nothing on screen
   * saying so. The keyboard still lands where it should; the reader still
   * starts at the top, which is where the window starts.
   */
  public focusPrimaryControl(windowId: string): void {
    const rendered = this.rendered.get(windowId);

    if (rendered === undefined) {
      return;
    }

    const content = rendered.element.querySelector('.window-content');
    const enabled = content === null
      ? undefined
      : [
        ...content.querySelectorAll('.os-button-primary'),
        ...content.querySelectorAll('button'),
      ].find((candidate) => (
        candidate instanceof HTMLButtonElement && !candidate.disabled
      ));

    if (enabled instanceof HTMLButtonElement) {
      enabled.focus({ preventScroll: true });
      return;
    }

    const close = rendered.element.querySelector('.window-close');

    if (close instanceof HTMLButtonElement) {
      close.focus({ preventScroll: true });
    }
  }

  /**
   * The window that currently holds `node`, if any. The desktop asks before a
   * paint so it can follow keyboard focus out of a window it is about to hide.
   */
  public windowIdContaining(node: Node): string | null {
    for (const [id, rendered] of this.rendered) {
      if (rendered.element.contains(node)) {
        return id;
      }
    }

    return null;
  }

  public dispose(): void {
    this.gestures.abortAll();

    for (const rendered of this.rendered.values()) {
      rendered.abortController.abort();
      rendered.instance.unmount();
      rendered.element.remove();
    }

    this.rendered.clear();
    this.pendingIntents.clear();
  }

  /**
   * Builds one window, or refuses it.
   *
   * A `mount` that throws used to leave its chrome on the desktop with nothing
   * inside it: an app that is not there, in a window that cannot be told
   * anything, which the next paint would try to mount again. The element is
   * taken back down, the window is closed in the model, and the player is told
   * - a dead frame with no explanation is the dead end the house rules forbid.
   */
  private createRenderedWindow(
    windowState: Readonly<ManagedWindow>,
  ): RenderedWindow | null {
    const definition = this.definitions.get(windowState.appId);

    if (definition === undefined) {
      throw new Error(`No app definition for "${windowState.appId}".`);
    }

    const abortController = new AbortController();
    const signal = abortController.signal;
    const element = document.createElement('section');
    element.className = 'os-window';
    element.dataset.windowId = windowState.id;
    element.dataset.appId = windowState.appId;
    element.dataset.testid = `window-${windowState.appId}`;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-label', windowState.title);

    const titlebar = document.createElement('header');
    titlebar.className = 'window-titlebar';
    titlebar.dataset.testid = `titlebar-${windowState.appId}`;
    const title = document.createElement('div');
    title.className = 'window-title';
    title.append(createIcon(windowState.icon));
    const titleText = document.createElement('span');
    titleText.textContent = windowState.title;
    title.append(titleText);

    const controls = document.createElement('div');
    controls.className = 'window-controls';
    const maximizeButton = this.fillTitlebarControls(
      controls,
      windowState,
      signal,
    );
    titlebar.append(title, controls);

    const content = document.createElement('div');
    content.className = 'window-content';
    element.append(titlebar, content);

    for (const handle of RESIZE_HANDLES) {
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'window-resize-handle';
      resizeHandle.dataset.resizeHandle = handle;
      resizeHandle.dataset.testid = `resize-${windowState.appId}-${handle}`;
      resizeHandle.addEventListener(
        'pointerdown',
        (event) => {
          this.beginPointerInteraction(event, windowState.id, handle);
        },
        { signal },
      );
      element.append(resizeHandle);
    }

    element.addEventListener(
      'pointerdown',
      () => {
        this.commitState(focusWindow(this.readState(), windowState.id));
      },
      { signal },
    );
    titlebar.addEventListener(
      'pointerdown',
      (event) => {
        const target = event.target;

        if (target instanceof Element && target.closest('button') !== null) {
          return;
        }

        this.beginPointerInteraction(event, windowState.id);
      },
      { signal },
    );
    titlebar.addEventListener(
      'dblclick',
      (event) => {
        const target = event.target;

        if (target instanceof Element && target.closest('button') !== null) {
          return;
        }

        this.commitState(
          toggleMaximizedWindow(this.readState(), windowState.id),
        );
      },
      { signal },
    );

    this.layer.append(element);
    let instance: AppInstance;

    try {
      instance = definition.mount(content, this.api);
    } catch (failure: unknown) {
      abortController.abort();
      element.remove();
      this.pendingIntents.delete(windowState.id);
      const refusal = refuseMount(this.readState(), windowState, failure);
      this.commitState(refusal.state);
      this.api.notify(refusal.title, refusal.body);
      return null;
    }

    // An intent that arrived while this window was still being painted waits
    // here rather than being dropped: the app it was addressed to only exists
    // from this line onwards.
    const pending = this.pendingIntents.get(windowState.id);

    if (pending !== undefined) {
      this.pendingIntents.delete(windowState.id);
      instance.receiveIntent?.(pending);
    }

    return {
      element,
      controls,
      maximizeButton,
      abortController,
      instance,
      maximizeIcon: null,
    };
  }

  /**
   * Builds the titlebar's buttons - the ones the current skin says exist, in
   * the order it says, at the end it says - and answers with the maximize
   * button or null when this desktop has none.
   *
   * A button the skin does not name is NOT BUILT. It is not hidden and it is
   * not disabled: GNOME's titlebars genuinely have one button on them, and a
   * `display: none` fake would be the skin system claiming a tell it had not
   * actually shipped. This is also why the row is filled rather than assembled
   * from three fixed locals - the set is data now, and the same call rebuilds a
   * live window's row when the player changes desktop mid-session.
   */
  private fillTitlebarControls(
    controls: HTMLElement,
    windowState: Readonly<ManagedWindow>,
    signal: AbortSignal,
  ): HTMLButtonElement | null {
    const skin = this.readSkin();
    controls.replaceChildren();
    controls.dataset.side = skin.windowButtons.side;
    let maximizeButton: HTMLButtonElement | null = null;

    for (const button of skin.windowButtons.order) {
      if (button === 'minimize') {
        const minimize = titlebarButton(
          'window-minimize',
          `Minimize ${windowState.title}`,
          'icon-minimize',
        );
        minimize.dataset.testid = `minimize-${windowState.appId}`;
        minimize.addEventListener(
          'click',
          () => {
            this.commitState(minimizeWindow(this.readState(), windowState.id));
          },
          { signal },
        );
        controls.append(minimize);
        continue;
      }

      if (button === 'maximize') {
        maximizeButton = titlebarButton(
          'window-maximize',
          `Maximize ${windowState.title}`,
          'icon-maximize',
        );
        maximizeButton.addEventListener(
          'click',
          () => {
            this.commitState(
              toggleMaximizedWindow(this.readState(), windowState.id),
            );
          },
          { signal },
        );
        controls.append(maximizeButton);
        continue;
      }

      const close = titlebarButton(
        'window-close',
        `Close ${windowState.title}`,
        'icon-close',
      );
      close.dataset.testid = `close-${windowState.appId}`;
      close.addEventListener(
        'click',
        () => {
          this.commitState(closeWindow(this.readState(), windowState.id));
        },
        { signal },
      );
      controls.append(close);
    }

    return maximizeButton;
  }

  /**
   * Re-chromes every open window for a desktop the player has just chosen.
   *
   * The apps are NOT remounted: a skin is a look, so the terminal keeps its
   * scrollback and the queue keeps its selection while the titlebars around
   * them change. Only the button row is rebuilt, and the remembered maximize
   * icon is forgotten with it so the next paint re-labels a fresh button.
   */
  public applySkin(state: Readonly<WindowManagerState>): void {
    for (const windowState of state.windows) {
      const rendered = this.rendered.get(windowState.id);

      if (rendered === undefined) {
        continue;
      }

      rendered.maximizeButton = this.fillTitlebarControls(
        rendered.controls,
        windowState,
        rendered.abortController.signal,
      );
      rendered.maximizeIcon = null;
    }
  }

  private updateRenderedWindow(
    rendered: RenderedWindow,
    windowState: Readonly<ManagedWindow>,
    zIndex: number,
    focused: boolean,
  ): void {
    const { element, maximizeButton } = rendered;
    element.hidden = windowState.minimized;
    element.dataset.focused = String(focused);
    element.dataset.minimized = String(windowState.minimized);
    element.dataset.maximized = String(windowState.maximized);
    element.dataset.z = String(zIndex);
    element.classList.toggle('is-focused', focused);
    element.classList.toggle('is-maximized', windowState.maximized);
    element.setAttribute(
      'aria-hidden',
      windowState.minimized ? 'true' : 'false',
    );
    element.style.setProperty(
      '--window-x',
      `${String(windowState.bounds.x)}px`,
    );
    element.style.setProperty(
      '--window-y',
      `${String(windowState.bounds.y)}px`,
    );
    element.style.setProperty(
      '--window-width',
      `${String(windowState.bounds.width)}px`,
    );
    element.style.setProperty(
      '--window-height',
      `${String(windowState.bounds.height)}px`,
    );
    element.style.setProperty('--window-z', String(zIndex));

    // Repainting the icon costs a new SVG node, and `sync` runs on every
    // pointer move of a drag - so only touch it when the state actually flips.
    // A desktop with no maximize button has nothing to repaint at all, and a
    // window can still BE maximized under one (the titlebar's double-click
    // does it) - so the state is left alone rather than guarded against.
    if (
      maximizeButton === null
      || rendered.maximizeIcon === windowState.maximized
    ) {
      return;
    }

    rendered.maximizeIcon = windowState.maximized;
    const action = windowState.maximized ? 'Restore' : 'Maximize';
    maximizeButton.setAttribute(
      'aria-label',
      `${action} ${windowState.title}`,
    );
    maximizeButton.title = `${action} ${windowState.title}`;
    maximizeButton.replaceChildren(
      createIcon(
        windowState.maximized ? 'icon-restore' : 'icon-maximize',
      ),
    );
  }

  /**
   * Drag and resize share one gesture: accumulate pointer deltas and let the
   * pure window model clamp them. Listeners live on `window` so a gesture that
   * leaves the element - or outruns it after clamping - still tracks and still
   * ends, which pointer capture on a removable element does not guarantee.
   */
  private beginPointerInteraction(
    event: PointerEvent,
    id: string,
    resizeHandle?: ResizeHandle,
  ): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    let previousX = event.clientX;
    let previousY = event.clientY;
    const pointerId = event.pointerId;
    const gesture = new AbortController();

    const endGesture = (): void => {
      this.gestures.end(id, gesture);
    };
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }

      // The release can be lost: outside the document, over a plugin that
      // swallows it, or to a window that never regains focus. Every move
      // reconfirms the button is still held, so a lost release cannot leave a
      // ghost gesture that drags the window on the next idle pointer move.
      if ((moveEvent.buttons & PRIMARY_BUTTON_MASK) === 0) {
        endGesture();
        return;
      }

      const dx = moveEvent.clientX - previousX;
      const dy = moveEvent.clientY - previousY;
      previousX = moveEvent.clientX;
      previousY = moveEvent.clientY;
      const next = resizeHandle === undefined
        ? moveWindow(this.readState(), id, { dx, dy })
        : resizeWindow(this.readState(), id, resizeHandle, { dx, dy });
      this.commitState(next);
    };
    const finish = (finishEvent: PointerEvent): void => {
      if (finishEvent.pointerId === pointerId) {
        endGesture();
      }
    };

    window.addEventListener('pointermove', onMove, { signal: gesture.signal });
    window.addEventListener('pointerup', finish, { signal: gesture.signal });
    window.addEventListener(
      'pointercancel',
      finish,
      { signal: gesture.signal },
    );
    // Losing the window takes the release with it (alt-tab, a dev-tools break,
    // the OS stealing the pointer), so a blur ends the gesture outright.
    window.addEventListener('blur', endGesture, { signal: gesture.signal });
    this.gestures.add(id, gesture);
  }
}
