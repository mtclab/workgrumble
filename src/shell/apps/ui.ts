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
