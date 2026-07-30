export const BOOT_STEP_COUNT = 5;

export type ShellScreen = 'boot' | 'login' | 'desktop';

export interface ShellState {
  readonly screen: ShellScreen;
  readonly bootStep: number;
}

export type ShellEvent =
  | { readonly type: 'boot:advance' }
  | { readonly type: 'boot:skip' }
  | { readonly type: 'login:submit' }
  | { readonly type: 'session:log-out' }
  | { readonly type: 'session:restart' };

export function createShellState(): ShellState {
  return {
    screen: 'boot',
    bootStep: 0,
  };
}

export function reduceShellState(
  state: Readonly<ShellState>,
  event: Readonly<ShellEvent>,
): ShellState {
  if (event.type === 'session:restart') {
    return createShellState();
  }

  switch (state.screen) {
    case 'boot':
      if (event.type === 'boot:skip') {
        return { screen: 'login', bootStep: BOOT_STEP_COUNT };
      }

      if (event.type === 'boot:advance') {
        const nextStep = Math.min(state.bootStep + 1, BOOT_STEP_COUNT);
        return nextStep === BOOT_STEP_COUNT
          ? { screen: 'login', bootStep: nextStep }
          : { screen: 'boot', bootStep: nextStep };
      }

      return { ...state };

    case 'login':
      return event.type === 'login:submit'
        ? { screen: 'desktop', bootStep: state.bootStep }
        : { ...state };

    case 'desktop':
      return event.type === 'session:log-out'
        ? { screen: 'login', bootStep: state.bootStep }
        : { ...state };
  }
}
