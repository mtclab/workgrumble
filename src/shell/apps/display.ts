/**
 * Display Properties (0.27.0): where the box's desktop is chosen.
 *
 * On the caricature this game is set in, this window is exactly where you went
 * to change how the machine looked - and it is the honest home for the skin
 * system, because that is all a skin is. Two independent axes, both of them
 * the player's:
 *
 * - the DESKTOP, which is the look: the panel, the launcher, the window
 *   buttons. Choosing one repaints the shell around this window, live.
 * - the DISTRO, which is the dialect: which package-manager verb the box
 *   speaks. Picking a desktop brings its paired distro along, and picking a
 *   distro on a box that is already on Linux leaves the desktop alone, because
 *   a Fedora machine running KDE is a real machine and the two axes genuinely
 *   are separate. (On the issued Windows box there is no desktop to leave
 *   alone, so a distro brings the one it ships - see `resolveDesktopChoice`.)
 *
 * 0.28.0 adds the one distro that breaks the second half of that: Arch ships no
 * desktop, so choosing it on a machine that has none either cannot resolve to
 * anything, and this window MAKES THE PLAYER PICK. That is not a workaround for
 * a null in a table - it is the truest single thing the distro axis says, and it
 * is the only place in the whole shell where a choice opens another choice.
 *
 * The gate is the promotion, the same one ssh keeps: IT issues the desk a
 * Windows box and IT keeps the image. A service-desk player still gets this
 * window - it reads their machine back to them and it is where the refusal is
 * SAID, in the shell's own sentence, beside the button they pressed. A locked
 * control that explains nothing is the dead end the house rules forbid.
 *
 * Nothing here dispatches and nothing here reaches the graph at all: the tier
 * gate lives in the shell, with the store the choice is written to. A desktop
 * is chrome.
 */

import { createIcon } from '../icons';
import {
  DISTROS,
  distroById,
  type DistroId,
  needsDesktopReason,
  packageManagerFor,
  resolveDesktopChoice,
  SKINS,
  skinById,
} from '../skins';
import type { AppDef, GameApi } from './types';

/** One choosable thing: a desktop or a distro, drawn the same way. */
function choiceButton(
  testid: string,
  label: string,
  blurb: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'os-button display-choice';
  button.dataset.testid = testid;
  const name = document.createElement('strong');
  name.textContent = label;
  const detail = document.createElement('span');
  detail.textContent = blurb;
  button.append(name, detail);
  return button;
}

export const DISPLAY_APP: AppDef = {
  id: 'display',
  title: 'Display Properties',
  icon: 'icon-display',
  tier_required: 0,
  slack: false,
  mount: (host, api: GameApi) => {
    const root = document.createElement('section');
    root.className = 'app-page display-app';
    root.dataset.testid = 'display-app';

    const masthead = document.createElement('header');
    masthead.className = 'about-masthead';
    const mark = document.createElement('span');
    mark.className = 'about-mark';
    const markIcon = createIcon('icon-display');
    markIcon.classList.add('svg-icon-lg');
    mark.append(markIcon);
    const headingGroup = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = 'Display Properties';
    const subheading = document.createElement('p');
    subheading.textContent = 'Appearance · what this machine is running';
    headingGroup.append(heading, subheading);
    masthead.append(mark, headingGroup);

    // What the box is, right now, in one line - so the window says something
    // true before anybody presses anything.
    const summary = document.createElement('dl');
    summary.className = 'about-properties';
    const runningTerm = document.createElement('dt');
    runningTerm.textContent = 'Running';
    const running = document.createElement('dd');
    running.dataset.testid = 'display-current';
    const dialectTerm = document.createElement('dt');
    dialectTerm.textContent = 'Package manager';
    const dialect = document.createElement('dd');
    dialect.dataset.testid = 'display-package-manager';
    summary.append(runningTerm, running, dialectTerm, dialect);

    const desktopHeading = document.createElement('h3');
    desktopHeading.textContent = 'Desktop';
    const desktops = document.createElement('div');
    desktops.className = 'display-choices';
    const desktopButtons = SKINS.map((skin) => {
      const button = choiceButton(
        `display-desktop-${skin.id}`,
        skin.label,
        skin.blurb,
      );
      button.addEventListener('click', () => {
        choose(() => api.setDesktop({ skin: skin.id }));
      });
      desktops.append(button);
      return { id: skin.id, button };
    });

    const distroHeading = document.createElement('h3');
    distroHeading.textContent = 'Distribution';
    const distros = document.createElement('div');
    distros.className = 'display-choices';
    const distroButtons = DISTROS.map((distro) => {
      const shipped = distro.defaultDesktop;
      const button = choiceButton(
        `display-distro-${distro.id}`,
        distro.label,
        `${distro.blurb} ${
          shipped === null
            // The one row whose desktop half is a fact rather than a name.
            ? 'Ships no desktop at all'
            : `Ships ${skinById(shipped).label}`
        }; speaks ${distro.packageManager}.`,
      );
      button.addEventListener('click', () => {
        // The Arch case: a distro with no desktop of its own, pressed on a
        // machine with no desktop either. The resolution is PURE, so the window
        // can ask it for free and without reaching anywhere - and it answers
        // "there is a question outstanding" rather than a machine, so the
        // honest response is to ask the question rather than to install
        // something nobody chose.
        const resolution = resolveDesktopChoice(
          api.appState.get().desktop,
          { distro: distro.id },
        );

        if (resolution.kind === 'needs-desktop') {
          openPick(resolution.distro);
          return;
        }

        choose(() => api.setDesktop({ distro: distro.id }));
      });
      distros.append(button);
      return { id: distro.id, button };
    });

    // Where a refused choice is said: in place, against the controls it is
    // about, the same way the taskbar's status refusal answers its own click.
    const refusal = document.createElement('p');
    refusal.className = 'display-refusal';
    refusal.dataset.testid = 'display-refusal';
    refusal.setAttribute('role', 'status');
    refusal.hidden = true;

    /*
     * The pick a desktopless distro opens: the same choice the Desktop list
     * above offers, asked at the moment it actually has to be answered and
     * bound to the distro that raised it.
     *
     * It is a second list rather than a mode on the first because the two are
     * different questions - "change my desktop" and "this distribution ships
     * none, so which one are you installing" - and because the answer here has
     * to carry the distro with it in ONE call: a pick that set the desktop and
     * then the distro would leave the machine, for a beat, running a
     * distribution nobody asked for.
     */
    const pick = document.createElement('div');
    pick.className = 'display-pick';
    pick.dataset.testid = 'display-desktop-pick';
    pick.hidden = true;
    const pickPrompt = document.createElement('p');
    pickPrompt.className = 'display-pick-prompt';
    pickPrompt.dataset.testid = 'display-pick-prompt';
    pickPrompt.setAttribute('role', 'status');
    const pickChoices = document.createElement('div');
    pickChoices.className = 'display-choices';
    pick.append(pickPrompt, pickChoices);

    /** The distro waiting on a desktop, or null when nothing is being asked. */
    let pendingDistro: DistroId | null = null;

    function openPick(distro: DistroId): void {
      pendingDistro = distro;
      pickPrompt.textContent = needsDesktopReason(distro);
      pick.hidden = false;
      refusal.hidden = true;
      refusal.textContent = '';
    }

    function closePick(): void {
      pendingDistro = null;
      pick.hidden = true;
      pickPrompt.textContent = '';
    }

    for (const skin of SKINS.filter((entry) => entry.family === 'linux')) {
      const button = choiceButton(
        `display-pick-${skin.id}`,
        skin.label,
        skin.blurb,
      );
      button.addEventListener('click', () => {
        const distro = pendingDistro;

        if (distro === null) {
          return;
        }

        choose(() => api.setDesktop({ skin: skin.id, distro }));
      });
      pickChoices.append(button);
    }

    const note = document.createElement('p');
    note.className = 'about-note';
    note.textContent = 'A desktop is a look and nothing else: the same queue, '
      + 'the same tickets, the same tools, in different chrome. The '
      + 'distribution is the other axis - it decides which package manager the '
      + 'box speaks, which is the difference you will feel on a server at two '
      + 'in the morning.';

    const render = (): void => {
      const choice = api.appState.get().desktop;
      const skin = skinById(choice.skin);
      const distro = choice.distro === null ? null : distroById(choice.distro);
      const manager = packageManagerFor(choice.distro);

      running.textContent = distro === null
        ? `${skin.label} (as issued)`
        : `${distro.label} · ${skin.label}`;
      dialect.textContent = manager === null
        ? 'None. Software arrives on this box when somebody from IT walks over '
          + 'with it.'
        : `${manager} - the verb this box answers to when it is asked to `
          + 'install, list or apply anything.';

      for (const entry of desktopButtons) {
        const active = entry.id === choice.skin;
        entry.button.dataset.active = String(active);
        entry.button.setAttribute('aria-pressed', String(active));
      }

      for (const entry of distroButtons) {
        const active = entry.id === choice.distro;
        entry.button.dataset.active = String(active);
        entry.button.setAttribute('aria-pressed', String(active));
      }
    };

    /**
     * Making a choice: the shell takes it or refuses it, and both answers land
     * here beside the button that was pressed. The window repaints off the
     * store either way - a chooser that showed what it asked for rather than
     * what the box actually runs would be the one surface lying about it.
     *
     * Any answered choice also puts the desktop pick away: it was a question
     * about a machine that has now been decided one way or the other, and a
     * prompt left standing over a settled machine is the window asking about
     * something that has already happened.
     */
    function choose(ask: () => ReturnType<GameApi['setDesktop']>): void {
      const outcome = ask();
      refusal.hidden = outcome.ok;
      refusal.textContent = outcome.ok ? '' : outcome.reason;
      closePick();
      render();
    }

    const unsubscribeState = api.appState.onReplaced(() => {
      render();
    });

    root.append(
      masthead,
      summary,
      desktopHeading,
      desktops,
      distroHeading,
      distros,
      pick,
      refusal,
      note,
    );
    host.replaceChildren(root);
    render();

    return {
      unmount: (): void => {
        unsubscribeState();
        root.remove();
      },
    };
  },
};
