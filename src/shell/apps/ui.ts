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
