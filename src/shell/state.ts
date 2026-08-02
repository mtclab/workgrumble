export const BOOT_STEP_COUNT = 5;

/**
 * How many beats the update screen holds a boot for.
 *
 * REAL seconds, not simulated minutes, and the difference is the whole reason
 * this is a shell state rather than an interruption: the world is not loaded
 * yet when this screen runs. Nobody is at a desk, no shift has started, the
 * day driver is not converting anything, and a build that took twelve
 * SIMULATED minutes to install itself at boot would have spent them off the
 * player's Monday morning. So the fiction's reboot costs minutes and ours
 * costs four seconds of ceremony, and they use the same screen because the
 * joke is that you cannot tell whose update it is either.
 */
export const INSTALL_STEP_COUNT = 8;

export type ShellScreen = 'boot' | 'installing' | 'login' | 'desktop';

export interface ShellState {
  readonly screen: ShellScreen;
  readonly bootStep: number;
  /**
   * Whether THIS boot has an update to install: a browser that has seen an
   * older build of this game and is now looking at a newer one.
   *
   * It is state rather than a question asked at the transition because the
   * reducer is pure and the answer comes from a storage slot, and because it
   * has to be false for the boot after a restart - the update installed once,
   * which is how many times an update installs.
   */
  readonly installing: boolean;
  readonly installStep: number;
}

export type ShellEvent =
  | { readonly type: 'boot:advance' }
  | { readonly type: 'boot:skip' }
  | { readonly type: 'install:advance' }
  | { readonly type: 'login:submit' }
  | { readonly type: 'session:log-out' }
  | { readonly type: 'session:restart' };

export function createShellState(installing = false): ShellState {
  return {
    screen: 'boot',
    bootStep: 0,
    installing,
    installStep: 0,
  };
}

/** Where a finished POST goes: through the update, if there is one. */
function afterBoot(state: Readonly<ShellState>): ShellState {
  return {
    ...state,
    screen: state.installing ? 'installing' : 'login',
    bootStep: BOOT_STEP_COUNT,
  };
}

export function reduceShellState(
  state: Readonly<ShellState>,
  event: Readonly<ShellEvent>,
): ShellState {
  // A restart is a cold boot with nothing left to install: the build that came
  // down last night came down once, and a workstation that reinstalled it
  // every time somebody restarted would be a workstation nobody restarted.
  if (event.type === 'session:restart') {
    return createShellState();
  }

  switch (state.screen) {
    case 'boot':
      if (event.type === 'boot:skip') {
        return afterBoot(state);
      }

      if (event.type === 'boot:advance') {
        const nextStep = Math.min(state.bootStep + 1, BOOT_STEP_COUNT);
        return nextStep === BOOT_STEP_COUNT
          ? afterBoot(state)
          : { ...state, screen: 'boot', bootStep: nextStep };
      }

      return { ...state };

    // The one screen in this machine with no way out of it. The POST has a
    // hint saying press any key; this has "do not turn off your workstation",
    // and it means it - `boot:skip` is deliberately not handled here, so the
    // key that skips the ceremony does nothing at all to the update. That is
    // not an oversight, it is the entire register of the thing.
    case 'installing': {
      if (event.type !== 'install:advance') {
        return { ...state };
      }

      const nextStep = Math.min(state.installStep + 1, INSTALL_STEP_COUNT);

      return nextStep === INSTALL_STEP_COUNT
        ? { ...state, screen: 'login', installStep: nextStep }
        : { ...state, installStep: nextStep };
    }

    case 'login':
      return event.type === 'login:submit'
        ? { ...state, screen: 'desktop' }
        : { ...state };

    case 'desktop':
      return event.type === 'session:log-out'
        ? { ...state, screen: 'login' }
        : { ...state };
  }
}
