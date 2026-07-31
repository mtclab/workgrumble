/**
 * Small builders shared by the helpdesk apps. They exist so three apps agree
 * on what a button, a panel and a refusal look like - and so "disabled" always
 * carries a reason a player can read, which the QoL bar treats as mandatory.
 */

export function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className?: string,
  testId?: string,
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);

  if (className !== undefined) {
    node.className = className;
  }

  if (testId !== undefined) {
    node.dataset.testid = testId;
  }

  return node;
}

export interface ButtonOptions {
  readonly primary?: boolean;
  readonly compact?: boolean;
}

export function osButton(
  label: string,
  testId: string,
  options: Readonly<ButtonOptions> = {},
): HTMLButtonElement {
  const button = element('button', 'os-button', testId);
  button.type = 'button';
  button.textContent = label;

  if (options.primary === true) {
    button.classList.add('os-button-primary');
  }

  if (options.compact === true) {
    button.classList.add('os-button-compact');
  }

  return button;
}

/**
 * Enables or disables a control, and when it is disabled says why - on the
 * element, as a tooltip, and in the accessible description. A dead button with
 * no explanation is the dead end the house rules forbid.
 */
export function setAvailability(
  button: HTMLButtonElement,
  reason: string | null,
): void {
  const blocked = reason !== null;
  button.disabled = blocked;
  button.dataset.blocked = String(blocked);

  if (blocked) {
    button.title = reason;
    button.setAttribute('aria-description', reason);
    return;
  }

  button.removeAttribute('title');
  button.removeAttribute('aria-description');
}

export interface SelectionChange {
  readonly id: string | null;
  /** True when the app has to let go of what the player had selected. */
  readonly changed: boolean;
}

/**
 * Which row a list app should be showing, given what is on offer right now.
 *
 * The rule is one line long and every list app had written its own version of
 * it: keep the player's selection while it is VISIBLE, otherwise fall back to
 * the first row, and to nothing when the list is empty. "Visible" means the
 * list on screen, not the graph behind it - a selection that has been
 * filtered out, or removed from the world, leaves a detail pane and a row of
 * action buttons aimed at something the player can no longer see.
 *
 * Callers that hold half-entered state for the selected row (a picked
 * rotation, a refusal, an outcome line) drop it when `changed` is true: that
 * state belonged to the row that has gone.
 */
export function resolveSelection(
  visible: readonly { readonly id: string }[],
  selected: string | null,
): SelectionChange {
  const kept = selected !== null
    && visible.some((candidate) => candidate.id === selected);
  const id = kept ? selected : visible[0]?.id ?? null;

  return { id, changed: id !== selected };
}

/** `machine:print` -> `print`. Element ids and test hooks read better without
 * the kind prefix, and every app derived this the same way separately. */
export function nodeKey(id: string): string {
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
}

/**
 * The two lines every helpdesk app ends with: what just worked, and what was
 * refused and why. One builder so all five apps say it the same way, and so a
 * refusal can never quietly render as a bare paragraph with no icon.
 */
export function outcomeLine(
  testId: string,
  outcome: string | null,
): HTMLElement {
  const line = element('p', 'app-outcome', testId);
  line.hidden = outcome === null;
  line.textContent = outcome ?? '';
  return line;
}

export function refusalLine(
  testId: string,
  refusal: string | null,
  icon: SVGSVGElement | null,
): HTMLElement {
  const line = element('p', 'app-refusal', testId);
  line.hidden = refusal === null;

  if (refusal !== null) {
    if (icon !== null) {
      line.append(icon);
    }

    const copy = element('span');
    copy.textContent = refusal;
    line.append(copy);
  }

  return line;
}

/**
 * Repaints `root` without losing the keyboard.
 *
 * These apps rebuild their whole panel on every world change and every tick,
 * which drops focus to the document body mid-task. The control the player was
 * standing on is found again by its test id - unless the repaint disabled it,
 * in which case focusing it would drop the cursor anyway.
 */
export function withFocusRestored(root: HTMLElement, paint: () => void): void {
  const active = document.activeElement;
  const focusedTestId = active instanceof HTMLElement && root.contains(active)
    ? active.dataset.testid ?? null
    : null;

  paint();

  if (focusedTestId === null) {
    return;
  }

  const restored = root.querySelector(
    `[data-testid="${CSS.escape(focusedTestId)}"]`,
  );

  if (
    restored instanceof HTMLElement
    && !(restored instanceof HTMLButtonElement && restored.disabled)
  ) {
    restored.focus();
  }
}

/**
 * Writes text into a node only when it would change.
 *
 * Assigning `textContent` is not free even when the string is identical: it
 * drops the existing text node and builds another, which is a mutation record
 * for anything observing, a fresh layout box, and - on a row the player is
 * dragging a selection across - a selection that ends. These lists repaint
 * every minute of the shift, so the compare is worth the line.
 */
export function setText(
  node: { textContent: string | null },
  text: string,
): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

/** The same rule for a data attribute, which styling and tests both read. */
export function setFlag(
  element: HTMLElement,
  key: string,
  value: string,
): void {
  if (element.dataset[key] !== value) {
    element.dataset[key] = value;
  }
}

/**
 * One row of a keyed list: the element that IS the row, and the single call
 * that writes an item's current values into it.
 *
 * `update` exists so a row can change what it SAYS without changing what it
 * IS. That distinction is the whole point of the type: a countdown ticking
 * down is not a new row, and rebuilding it as one throws away the checkbox
 * state, the keyboard focus and any text selection standing on it once a
 * minute, for every ticket in the queue.
 */
export interface KeyedRow<Item, Node> {
  readonly element: Node;
  update(item: Item): void;
}

/** The slice of a container this list needs. Declared rather than imported so
 * the reconciler can be driven, and proven, without a document. */
export interface KeyedRowsHost<Node> {
  replaceChildren(...nodes: Node[]): void;
}

/**
 * A list whose rows survive a repaint.
 *
 * Every list app in this shell repaints on every world change and some of them
 * on every tick, and each one used to answer that by emptying its container and
 * building every row again. The rows are keyed instead: an item that was on the
 * list before keeps the element it had, an item that has arrived gets one made,
 * and the container is only touched when the ORDER of the keys changes.
 *
 * Keys must be unique within one sync - node ids, which the graph guarantees.
 */
export class KeyedRows<Item, Node> {
  private rows = new Map<string, KeyedRow<Item, Node>>();
  private order: readonly string[] = [];
  private painted = false;

  public constructor(
    private readonly host: KeyedRowsHost<Node>,
    private readonly keyOf: (item: Item) => string,
    private readonly create: (item: Item) => KeyedRow<Item, Node>,
  ) {}

  /**
   * Brings the list up to date. `fallback` is what an EMPTY list shows - the
   * "nobody matches that" line - and is left to the caller because it is copy,
   * not structure.
   */
  public sync(items: readonly Item[], fallback: Node | null = null): void {
    const kept = new Map<string, KeyedRow<Item, Node>>();
    const keys: string[] = [];
    const nodes: Node[] = [];

    for (const item of items) {
      const key = this.keyOf(item);
      const row = this.rows.get(key) ?? this.create(item);
      row.update(item);
      kept.set(key, row);
      keys.push(key);
      nodes.push(row.element);
    }

    const moved = !this.painted
      || keys.length !== this.order.length
      || keys.some((key, index) => key !== this.order[index]);

    this.rows = kept;
    this.order = keys;
    this.painted = true;

    if (!moved) {
      return;
    }

    this.host.replaceChildren(
      ...(nodes.length === 0 && fallback !== null ? [fallback] : nodes),
    );
  }
}

export function definitionRow(
  list: HTMLElement,
  label: string,
  testId: string,
): HTMLElement {
  const term = element('dt');
  term.textContent = label;
  const value = element('dd', undefined, testId);
  list.append(term, value);
  return value;
}

/** `4h 12m`, `12m`, `0m`. Sim ticks are minutes; nobody wants "252 ticks". */
export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;

  return hours > 0
    ? `${String(hours)}h ${String(rest).padStart(2, '0')}m`
    : `${String(rest)}m`;
}

export function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
