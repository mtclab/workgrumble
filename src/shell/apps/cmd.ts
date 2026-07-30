import { parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import type { AppDef } from './types';
import { element } from './ui';

export const PROMPT = 'C:\\SUPPORT>';

const BANNER: readonly string[] = [
  'WORKGRUMBLE Support Terminal [Version 4.10.1998]',
  'Type "help" for the commands, "ver" for the bad news.',
  '',
];

/** How many lines of scrollback the terminal keeps before it forgets. */
const SCROLLBACK_LIMIT = 400;

export const CMD_APP: AppDef = {
  id: 'cmd',
  title: 'Support Terminal',
  icon: 'icon-cmd',
  tier_required: 1,
  slack: false,
  mount: (host, api) => {
    const root = element('section', 'cmd-app', 'cmd-app');
    const output = element('div', 'cmd-output', 'cmd-output');
    output.setAttribute('role', 'log');
    output.setAttribute('aria-live', 'polite');

    const form = element('form', 'cmd-line');
    const prompt = element('span', 'cmd-prompt');
    prompt.textContent = PROMPT;
    const input = element('input', 'cmd-input', 'cmd-input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', `${PROMPT} command`);
    form.append(prompt, input);
    root.append(output, form);

    const history: string[] = [];
    let historyIndex = 0;

    const print = (text: string, kind = 'output'): void => {
      const line = element('p', 'cmd-line-out');
      line.dataset.kind = kind;
      // A blank line is layout, not text: keep the element so the spacing the
      // output asked for survives.
      line.textContent = text.length === 0 ? '\u00a0' : text;
      output.append(line);

      while (output.childElementCount > SCROLLBACK_LIMIT) {
        output.firstElementChild?.remove();
      }

      output.scrollTop = output.scrollHeight;
    };

    const submit = (): void => {
      const raw = input.value;
      input.value = '';
      print(`${PROMPT} ${raw}`, 'echo');

      if (raw.trim().length > 0) {
        history.push(raw);
      }

      historyIndex = history.length;

      const result = executeCommand(parseCommand(raw), api);

      if (result.clear) {
        output.replaceChildren();

        for (const line of BANNER) {
          print(line);
        }

        return;
      }

      for (const line of result.lines) {
        print(line);
      }
    };

    const onSubmit = (event: SubmitEvent): void => {
      event.preventDefault();
      submit();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }

      event.preventDefault();
      historyIndex = event.key === 'ArrowUp'
        ? Math.max(0, historyIndex - 1)
        : Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] ?? '';
    };
    const onRootPointerDown = (event: PointerEvent): void => {
      // Clicking anywhere in the terminal puts the caret back where it belongs,
      // the way a terminal has always behaved.
      if (event.target === input) {
        return;
      }

      input.focus();
    };

    form.addEventListener('submit', onSubmit);
    input.addEventListener('keydown', onKeyDown);
    root.addEventListener('pointerdown', onRootPointerDown);

    host.replaceChildren(root);

    for (const line of BANNER) {
      print(line);
    }

    input.focus();

    return {
      unmount: (): void => {
        form.removeEventListener('submit', onSubmit);
        input.removeEventListener('keydown', onKeyDown);
        root.removeEventListener('pointerdown', onRootPointerDown);
        root.remove();
      },
    };
  },
};
