import { BUILD_VERSION } from '../shared/build';
import { INSTALL_STEP_COUNT } from './state';
import { createUpdateScreen, updatePercent } from './update-screen';

/**
 * Our own update, wearing the fiction's clothes.
 *
 * When a build changes under a browser that has run an older one, the
 * workstation installs it before it lets anybody log on - and it does that on
 * exactly the screen the Thursday reboot uses, because a product whose real
 * releases arrive as an in-fiction operating-system update is the one joke in
 * here that costs nothing and pays every deploy.
 *
 * The theatre is REAL seconds and there are not many of them. No simulated
 * minute may pass here: this runs before there is a desk to be at, before the
 * shift, before the world has been handed to anybody, and a boot that spent
 * twelve sim-minutes on ceremony would be a boot that took them off a Monday
 * morning the player had not started yet. The day driver is frozen the whole
 * time (`atDesk`, `main.ts`), which is what makes that a property rather than
 * a hope.
 */
export interface InstallScreen {
  readonly element: HTMLElement;
  render(installStep: number): void;
}

export function createInstallScreen(): InstallScreen {
  const element = document.createElement('div');
  element.className = 'screen screen-installing';
  element.dataset.testid = 'install-screen';

  const screen = createUpdateScreen('install');

  element.append(screen.element);

  return {
    element,
    render: (installStep: number): void => {
      const percent = updatePercent(installStep, INSTALL_STEP_COUNT);

      element.dataset.step = String(installStep);
      screen.render({
        phase: installStep === 0
          ? 'restarting'
          : percent >= 100 ? 'restoring' : 'installing',
        percent,
        // The one line that is not the fiction's: it names the build, because
        // the window that opens the moment this finishes is that build's
        // release notes and the two have to obviously be about the same thing.
        subject: `DeskPro WorkGroup ${BUILD_VERSION}`,
      });
    },
  };
}
