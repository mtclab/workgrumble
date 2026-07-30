import { describe, expect, it } from 'vitest';

import {
  BOOT_STEP_COUNT,
  createShellState,
  reduceShellState,
  type ShellState,
} from './state';

function advanceBoot(state: ShellState, steps: number): ShellState {
  let next = state;

  for (let index = 0; index < steps; index += 1) {
    next = reduceShellState(next, { type: 'boot:advance' });
  }

  return next;
}

describe('shell state machine', () => {
  it('starts at boot and advances to login after the final boot step', () => {
    const almostDone = advanceBoot(createShellState(), BOOT_STEP_COUNT - 1);

    expect(almostDone).toEqual({
      screen: 'boot',
      bootStep: BOOT_STEP_COUNT - 1,
    });
    expect(
      reduceShellState(almostDone, { type: 'boot:advance' }),
    ).toEqual({
      screen: 'login',
      bootStep: BOOT_STEP_COUNT,
    });
  });

  it('skips boot immediately and accepts a login without password state', () => {
    const login = reduceShellState(
      createShellState(),
      { type: 'boot:skip' },
    );

    expect(login.screen).toBe('login');
    expect(
      reduceShellState(login, { type: 'login:submit' }).screen,
    ).toBe('desktop');
  });

  it('ignores events that do not belong to the current screen', () => {
    const initial = createShellState();
    const login = reduceShellState(initial, { type: 'login:submit' });

    expect(login).toEqual(initial);
  });

  it('supports log out and restart so no screen is a dead end', () => {
    const login = reduceShellState(
      createShellState(),
      { type: 'boot:skip' },
    );
    const desktop = reduceShellState(login, { type: 'login:submit' });

    expect(
      reduceShellState(desktop, { type: 'session:log-out' }).screen,
    ).toBe('login');
    expect(
      reduceShellState(desktop, { type: 'session:restart' }),
    ).toEqual(createShellState());
    expect(
      reduceShellState(login, { type: 'session:restart' }),
    ).toEqual(createShellState());
  });
});
