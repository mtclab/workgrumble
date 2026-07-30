import { describe, expect, it } from 'vitest';

import {
  BOOT_STEP_COUNT,
  createShellState,
  reduceShellState,
  type ShellEvent,
  type ShellScreen,
  type ShellState,
} from './state';

const ALL_EVENTS: readonly ShellEvent[] = [
  { type: 'boot:advance' },
  { type: 'boot:skip' },
  { type: 'login:submit' },
  { type: 'session:log-out' },
  { type: 'session:restart' },
];

const ALL_SCREENS: readonly ShellScreen[] = ['boot', 'login', 'desktop'];

function stateKey(state: Readonly<ShellState>): string {
  return `${state.screen}:${String(state.bootStep)}`;
}

/** Every state the machine can actually be driven into from a cold boot. */
function reachableStates(): ShellState[] {
  const seen = new Map<string, ShellState>();
  const queue: ShellState[] = [createShellState()];

  while (queue.length > 0) {
    const state = queue.shift();

    if (state === undefined || seen.has(stateKey(state))) {
      continue;
    }

    seen.set(stateKey(state), state);

    for (const event of ALL_EVENTS) {
      queue.push(reduceShellState(state, event));
    }
  }

  return [...seen.values()];
}

function screensReachableFrom(start: Readonly<ShellState>): Set<ShellScreen> {
  const screens = new Set<ShellScreen>([start.screen]);
  const seen = new Set<string>();
  const queue: ShellState[] = [{ ...start }];

  while (queue.length > 0) {
    const state = queue.shift();

    if (state === undefined || seen.has(stateKey(state))) {
      continue;
    }

    seen.add(stateKey(state));
    screens.add(state.screen);

    for (const event of ALL_EVENTS) {
      queue.push(reduceShellState(state, event));
    }
  }

  return screens;
}

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

  it('has no dead end: every screen stays reachable from every state', () => {
    const states = reachableStates();

    expect(states.length).toBeGreaterThan(BOOT_STEP_COUNT);

    for (const state of states) {
      expect({
        from: stateKey(state),
        screens: [...screensReachableFrom(state)].sort(),
      }).toEqual({
        from: stateKey(state),
        screens: [...ALL_SCREENS].sort(),
      });
    }
  });

  it('never advances the boot sequence past its final step', () => {
    for (const state of reachableStates()) {
      expect(state.bootStep).toBeLessThanOrEqual(BOOT_STEP_COUNT);
      expect(state.bootStep).toBeGreaterThanOrEqual(0);
      expect(state.screen === 'boot' || state.bootStep === BOOT_STEP_COUNT)
        .toBe(true);
    }
  });
});
