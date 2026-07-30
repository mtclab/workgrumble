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
