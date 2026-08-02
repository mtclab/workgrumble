import { describe, expect, it } from 'vitest';

import {
  BOOT_STEP_COUNT,
  createShellState,
  INSTALL_STEP_COUNT,
  reduceShellState,
  type ShellEvent,
  type ShellScreen,
  type ShellState,
} from './state';

const ALL_EVENTS: readonly ShellEvent[] = [
  { type: 'boot:advance' },
  { type: 'boot:skip' },
  { type: 'install:advance' },
  { type: 'login:submit' },
  { type: 'session:log-out' },
  { type: 'session:restart' },
];

/**
 * The screens a player is always one sequence of clicks away from.
 *
 * `installing` is deliberately not among them, and that is the shape of the
 * thing rather than a gap: an update installs ONCE. A workstation that could
 * be driven back into the update screen would be a workstation installing the
 * same build every time somebody restarted it, which is a bug the player would
 * report as the game being stuck.
 */
const ALL_SCREENS: readonly ShellScreen[] = ['boot', 'login', 'desktop'];

function stateKey(state: Readonly<ShellState>): string {
  return `${state.screen}:${String(state.bootStep)}:`
    + `${String(state.installing)}:${String(state.installStep)}`;
}

/** Every state the machine can actually be driven into from a cold boot. */
function reachableStates(from: ShellState = createShellState()): ShellState[] {
  const seen = new Map<string, ShellState>();
  const queue: ShellState[] = [from];

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

  for (const state of reachableStates({ ...start })) {
    screens.add(state.screen);
  }

  return screens;
}

function advance(
  state: ShellState,
  type: 'boot:advance' | 'install:advance',
  steps: number,
): ShellState {
  let next = state;

  for (let index = 0; index < steps; index += 1) {
    next = reduceShellState(next, { type });
  }

  return next;
}

describe('shell state machine', () => {
  it('starts at boot and advances to login after the final boot step', () => {
    const almostDone = advance(
      createShellState(),
      'boot:advance',
      BOOT_STEP_COUNT - 1,
    );

    expect(almostDone).toEqual({
      screen: 'boot',
      bootStep: BOOT_STEP_COUNT - 1,
      installing: false,
      installStep: 0,
    });
    expect(
      reduceShellState(almostDone, { type: 'boot:advance' }),
    ).toEqual({
      screen: 'login',
      bootStep: BOOT_STEP_COUNT,
      installing: false,
      installStep: 0,
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

/* -- the boot that has something to install -------------------------------- */

describe('a boot with an update on it', () => {
  /**
   * The order, which is the whole of spec item 8: the workstation installs the
   * thing FIRST and reads out what was in it afterwards. A release-notes
   * window in front of a machine that had not visibly done anything was the
   * changelog arriving without the update it is a changelog OF.
   */
  it('puts the update screen between the POST and the log-on box', () => {
    const posted = reduceShellState(
      createShellState(true),
      { type: 'boot:skip' },
    );

    expect(posted.screen).toBe('installing');
    expect(posted.installStep).toBe(0);

    const halfway = advance(posted, 'install:advance', INSTALL_STEP_COUNT - 1);

    expect(halfway.screen).toBe('installing');
    expect(
      reduceShellState(halfway, { type: 'install:advance' }).screen,
    ).toBe('login');
  });

  /** And the same, arriving through the POST rather than past it. */
  it('is reached by sitting through the boot as well as by skipping it', () => {
    expect(
      advance(createShellState(true), 'boot:advance', BOOT_STEP_COUNT).screen,
    ).toBe('installing');
  });

  /**
   * There is no key that gets you out of this one, and there is not meant to
   * be. The POST says press any key; this says do not turn off your
   * workstation, and the difference between those two sentences is the joke.
   */
  it('cannot be skipped, logged into, or restarted out of the middle of', () => {
    const installing = reduceShellState(
      createShellState(true),
      { type: 'boot:skip' },
    );

    for (const event of ['boot:skip', 'boot:advance', 'login:submit'] as const) {
      expect(
        reduceShellState(installing, { type: event }),
        event,
      ).toEqual(installing);
    }

    // The one way out that is not the update finishing is the one that throws
    // the whole workstation away - and it comes back with nothing to install,
    // because the build installed itself the first time.
    const restarted = reduceShellState(installing, { type: 'session:restart' });

    expect(restarted).toEqual(createShellState());
    expect(restarted.installing).toBe(false);
  });

  /** Once. Nothing downstream can find its way back into it. */
  it('is left behind for good once it has finished', () => {
    const login = advance(
      reduceShellState(createShellState(true), { type: 'boot:skip' }),
      'install:advance',
      INSTALL_STEP_COUNT,
    );

    expect(login.screen).toBe('login');

    for (const state of reachableStates(login)) {
      expect(state.screen).not.toBe('installing');
    }
  });
});
