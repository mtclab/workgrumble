import type { AppDef, AppInstance, GameApi } from './apps/types';
import { createIcon } from './icons';
import { createReentrantPass } from './reentrant';
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

interface RenderedWindow {
  readonly element: HTMLElement;
  readonly maximizeButton: HTMLButtonElement;
  readonly abortController: AbortController;
  readonly instance: AppInstance;
  /** Last painted maximize state; null until the first paint. */
  maximizeIcon: boolean | null;
}

type ReadState = () => Readonly<WindowManagerState>;
type CommitState = (state: WindowManagerState) => void;

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
  private readonly gestures = new Set<AbortController>();
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
  ) {
    for (const definition of manifest) {
      this.definitions.set(definition.id, definition);
    }
  }

  public sync(state: Readonly<WindowManagerState>): void {
    this.paint(state);
  }

  private paintOnce(state: Readonly<WindowManagerState>): void {
    const openIds = new Set(state.windows.map(({ id }) => id));

    for (const [id, rendered] of this.rendered) {
      if (!openIds.has(id)) {
        rendered.abortController.abort();
        rendered.instance.unmount();
        rendered.element.remove();
        this.rendered.delete(id);
      }
    }

    for (const windowState of state.windows) {
      if (!this.rendered.has(windowState.id)) {
        const rendered = this.createRenderedWindow(windowState);
        this.rendered.set(windowState.id, rendered);
      }
    }

    state.windows.forEach((windowState, index) => {
      const rendered = this.rendered.get(windowState.id);

      if (rendered === undefined) {
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

  public dispose(): void {
    for (const gesture of this.gestures) {
      gesture.abort();
    }

    this.gestures.clear();

    for (const rendered of this.rendered.values()) {
      rendered.abortController.abort();
      rendered.instance.unmount();
      rendered.element.remove();
    }

    this.rendered.clear();
  }

  private createRenderedWindow(
    windowState: Readonly<ManagedWindow>,
  ): RenderedWindow {
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
    const minimizeButton = titlebarButton(
      'window-minimize',
      `Minimize ${windowState.title}`,
      'icon-minimize',
    );
    minimizeButton.dataset.testid = `minimize-${windowState.appId}`;
    const maximizeButton = titlebarButton(
      'window-maximize',
      `Maximize ${windowState.title}`,
      'icon-maximize',
    );
    const closeButton = titlebarButton(
      'window-close',
      `Close ${windowState.title}`,
      'icon-close',
    );
    closeButton.dataset.testid = `close-${windowState.appId}`;
    controls.append(minimizeButton, maximizeButton, closeButton);
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
    minimizeButton.addEventListener(
      'click',
      () => {
        this.commitState(minimizeWindow(this.readState(), windowState.id));
      },
      { signal },
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
    closeButton.addEventListener(
      'click',
      () => {
        this.commitState(closeWindow(this.readState(), windowState.id));
      },
      { signal },
    );

    this.layer.append(element);
    const instance = definition.mount(content, this.api);

    return {
      element,
      maximizeButton,
      abortController,
      instance,
      maximizeIcon: null,
    };
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
    if (rendered.maximizeIcon === windowState.maximized) {
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
      gesture.abort();
      this.gestures.delete(gesture);
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
    this.gestures.add(gesture);
  }
}
