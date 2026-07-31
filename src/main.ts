import { loadEngine } from './engine-api';
import { type AppState, AppStateStore } from './shell/app-state';
import { APP_MANIFEST } from './shell/apps';
import { pingBossThread } from './shell/boss-thread';
import type { ShellContext } from './shell/context';
import { DayDriver, DRIVER_INTERVAL_MS } from './shell/day-driver';
import { carryFrom, hydrateFromRetry, RetrySlot } from './shell/retry';
import { createShellSession, SaveSlot } from './shell/save';
import { Shell } from './shell/shell';
import { COMPANY, COMPANY_IDS } from './world/company';
import { createWorldSession, FIRST_WEEK } from './world/session';
import { ticketTitle } from './world/tickets';

/**
 * A read-only window onto the running session, for the journey gate.
 *
 * The full-day test has to prove that a save and a reload land on the SAME
 * world, and "the same world" is a graph hash - a number no screen shows and
 * no screen should. Everything here reads; nothing dispatches, advances a
 * clock or writes a field, so the worst a player can do with it is find out
 * what their own save already knows.
 */
export interface SimDebug {
  /** The graph hash: the whole world in sixteen characters. */
  hash(): string;
  /** Simulation tick, which the taskbar clock only shows to the minute. */
  tick(): number;
  /** What the apps were showing, as the save would carry it. */
  screens(): AppState;
}

declare global {
  var careerSim: SimDebug | undefined;
}

function mountPoint(): HTMLElement {
  const host = document.getElementById('app');

  if (!(host instanceof HTMLElement)) {
    throw new Error('The shell needs a #app mount point in index.html.');
  }

  return host;
}

async function boot(): Promise<void> {
  // The engine is wasm now, so it has to be fetched before a world exists.
  // Same-origin, alongside the bundle, and nothing renders until it is here.
  await loadEngine();

  // A week that was played before and ended badly leaves exactly three things
  // behind: the fund, what had been read, and which attempt this is. Reading
  // the slot CLEARS it - a carry-over is used once, by the week it starts.
  const retry = new RetrySlot(window.localStorage);
  const carried = retry.take();
  const { engine, tier, seed } = createWorldSession(
    carried === null ? FIRST_WEEK : carryFrom(carried),
  );
  // The apps' own memory - transcripts, unread flags, the article that was
  // open. It outlives their windows and the save carries it.
  const appState = new AppStateStore();

  if (carried !== null) {
    hydrateFromRetry(appState, carried);
  }

  const slot = new SaveSlot(window.localStorage);
  // The only place real time becomes simulation time. Pause and speed live
  // here rather than in the engine, whose clock counts whole ticks and nothing
  // else - which is what makes a day replayable.
  const day = new DayDriver(engine, COMPANY_IDS.player, seed, {
    // The day boundary is the cheapest save there is: the log has just been
    // checkpointed, so the file carries a baseline and an empty history. The
    // hook runs a whole day after this line, by which time `session` exists.
    onDayBoundary: () => {
      session.save();
    },
    // What the pressure layer cannot see for itself: which slack apps are
    // genuinely on screen right now.
    openSlackApps: () => shell.openSlackApps(),
    // And the one the player is in, which is the only one calming anybody
    // down. The lead sees the rest.
    focusedSlackApp: () => shell.focusedSlackApp(),
    onNotice: (title, body) => {
      shell.notify(title, body);
    },
    // The world has already been told what being caught costs. What is left is
    // the scene, which is a window like any other - closeable, on top of a
    // queue that is still there underneath it.
    onCaught: (appId, tick) => {
      appState.patchExternal('caught', { appId, at: tick });
      shell.openApp('caught');
      shell.notify(
        'A quick word',
        'The lead saw what was on your screen. It has been mentioned, which '
          + 'is how these things start.',
      );
    },
    // He does not raise tickets. He raises concerns, in the thread he has
    // always used, and the thread is the shell's memory rather than the
    // world's - so the driver hands the line over rather than writing it.
    onBossPing: (ping) => {
      pingBossThread(appState, ping.line);
      shell.notify(
        'Message from the lead',
        ping.ticketId === null
          ? ping.line
          : `${ping.line} It is now a ticket, because you made it one.`,
      );
    },
    // Friday at three. The world has already decided - the verb is guarded on
    // the one number that decides it - so what is left is the conversation.
    onReview: (outcome) => {
      shell.openApp('review');
      shell.notify(
        outcome === 'passed' ? 'Probation over' : 'A quick word',
        outcome === 'passed'
          ? 'The lead has had a look at the week and the week is fine. Not '
            + 'brilliant. Fine.'
          : 'The lead would like a word in the room with the blind that does '
            + 'not go all the way down.',
      );
    },
    // Five o'clock on a Friday that went well.
    onBeerUnlocked: () => {
      shell.openApp('beer');
      shell.notify(
        'There is one in the fridge',
        'With your name on it, allegedly. The probation is over, which is '
          + 'what the lock on it has been about all week.',
      );
    },
    onWeekEnd: (outcome) => {
      shell.openApp('weekend');
      shell.notify(
        'That is the week',
        outcome === 'passed'
          ? 'Five days, one review and a fund that has moved. Week two is '
            + 'Monday.'
          : 'Five days and a short conversation. The fund is still yours, '
            + 'which is the only part of this they cannot take back.',
      );
    },
  });

  const session = createShellSession({
    engine,
    appState,
    day,
    slot,
    retry,
    actor: COMPANY_IDS.player,
    // A world that never happened cannot be un-happened in place: the retry
    // has been written down, so the cheapest honest way to build the week
    // again is to start the page again.
    restart: () => {
      window.location.reload();
    },
  });

  const context: ShellContext = {
    manifest: APP_MANIFEST,
    tier,
    graph: engine.graph,
    appState,
    day,
    session,
    clock: {
      now: () => engine.now(),
      onTick: (listener) => engine.onTick(listener),
    },
    user: {
      displayName: 'Pat Pending',
      account: `${COMPANY.domain}\\ppending`,
      passwordHint: 'Hint: it is on the sticky note under the keyboard. '
        + 'Any password works; nobody has checked since 1998.',
      node: COMPANY_IDS.player,
    },
    // Through the DAY rather than straight at the engine: a dispatch is not
    // only a change to the world, it is the minute somebody first did
    // something about a ticket and a line on the handoff form that ticket will
    // eventually carry. Both are written where the action happens.
    dispatch: (id, actor, target, params) => day.dispatch(
      id,
      actor,
      target,
      params,
    ),
    dispatchLog: () => engine.dispatchLog(),
    // A load is a world change like any other, and the biggest one there is:
    // every open app is showing a world that no longer exists until it
    // repaints. Without this, the desktop kept the previous session on screen
    // until some unrelated mutation happened along.
    onWorldChange: (listener) => engine.onEvent((event) => {
      if (event.type === 'graph:mutated' || event.type === 'world:restored') {
        listener();
      }
    }),
  };

  const shell = new Shell(mountPoint(), context);

  engine.onEvent((event) => {
    if (event.type === 'ticket:resolved') {
      shell.notify(
        'Ticket resolved',
        `${ticketTitle(event.id)} - closed. Reputation nudged upward by an `
          + 'amount nobody will mention.',
      );
    }

    if (event.type === 'ticket:breached') {
      shell.notify(
        'SLA breached',
        `${ticketTitle(event.id)} - the timer ran out. An escalation mail is `
          + 'already being drafted about you.',
      );
    }

    if (event.type === 'ticket:spawned') {
      shell.notify(
        'New ticket',
        `${ticketTitle(event.id)} - it is in the queue, and it is yours.`,
      );
    }
  });

  globalThis.careerSim = Object.freeze({
    hash: () => engine.snapshotHash(),
    tick: () => engine.now(),
    screens: () => appState.snapshot(),
  });

  shell.start();
  // The interval is shorter than a tick so that a faster clock is a faster
  // clock, rather than a burst of minutes once a second; the driver keeps the
  // remainder, so no real time is lost between turns.
  window.setInterval(() => {
    day.step(DRIVER_INTERVAL_MS);
  }, DRIVER_INTERVAL_MS);
}

void boot();
