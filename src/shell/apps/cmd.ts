import { FIELDS } from '../../world/fields';
import { DEFAULT_CWD } from '../../world/filesystem';
import { promptPath } from '../../world/fs';
import { isFumbling } from '../../world/meters';
import { fumbleTypo, parseCommand } from './cmd-parse';
import { executeCommand } from './cmd-run';
import type { AppDef } from './types';
import { element } from './ui';

/**
 * Where a new terminal opens, and what it says while it is there.
 *
 * The prompt follows the working directory, because that is what `$P$G` in the
 * estate's own AUTOEXEC.BAT means and because a prompt that lied about where
 * you were standing would make `cd` unreadable. A terminal closed and opened
 * again comes back here: the working directory belongs to the window, exactly
 * as its scrollback does, and a new window is a new shell.
 */
export function promptFor(cwd: readonly string[]): string {
  return `${promptPath(cwd)}>`;
}

export const PROMPT = promptFor(DEFAULT_CWD);

/**
 * The line the terminal prints after it has finished laughing at you. It says
 * out loud that the typo was cosmetic, because the alternative - a game that
 * silently corrupts the player's input at high stress - is a punishment, and
 * this one is a joke.
 */
export const FUMBLE_NOTE = 'Sent as typed. Your hands are going; the terminal '
  + 'is fine.';

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
    const input = element('input', 'cmd-input', 'cmd-input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    form.append(prompt, input);
    root.append(output, form);

    const history: string[] = [];
    let historyIndex = 0;
    let cwd: readonly string[] = DEFAULT_CWD;

    const showPrompt = (): void => {
      prompt.textContent = promptFor(cwd);
      input.setAttribute('aria-label', `${promptFor(cwd)} command`);
    };

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

    /** Over 80 stress, the room swims and so does the keyboard. */
    const fumbling = (): boolean => {
      const stress = api.graph.getField(api.actor, FIELDS.stress);
      return typeof stress === 'number' && isFumbling(stress);
    };

    const submit = (): void => {
      const raw = input.value;
      input.value = '';
      const typed = promptFor(cwd);

      // The gag, in full: what your hands did, then the correction, then the
      // command that actually ran - which is the one you typed.
      if (raw.trim().length > 0 && fumbling()) {
        const typo = fumbleTypo(raw, api.clock.now());

        if (typo !== raw) {
          print(`${typed} ${typo}`, 'echo');
          print(FUMBLE_NOTE, 'note');
        }
      }

      print(`${typed} ${raw}`, 'echo');

      if (raw.trim().length > 0) {
        history.push(raw);
      }

      historyIndex = history.length;

      const result = executeCommand(parseCommand(raw), api, cwd);

      if (result.cwd !== undefined) {
        cwd = result.cwd;
        showPrompt();
      }

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
    // And again after the click has finished: clicking a terminal that was
    // not the focused window raises the window too, and whatever that does
    // to the cursor happens after pointerdown. A terminal you clicked and
    // then have to click again is a terminal that is lying about being ready.
    root.addEventListener('click', onRootPointerDown as EventListener);

    showPrompt();
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
        root.removeEventListener('click', onRootPointerDown as EventListener);
        root.remove();
      },
    };
  },
};
