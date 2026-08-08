import { describe, expect, it, vi } from 'vitest';

import {
  type AppState,
  ASSISTANT_DISMISSAL_CAP,
  AppStateStore,
  createAppState,
  parseAppState,
} from './app-state';
import { INSTALLABLE_MANIFEST } from './apps/installable';

const A_TOY = INSTALLABLE_MANIFEST[0]?.id ?? '';

function worked(store: AppStateStore): AppState {
  store.patch('mail', { selectedId: 'mail/queue-nag', read: ['mail/queue-nag'] });
  store.patch('kb', { selectedId: 'kb/print-spooler' });
  store.patch('chat', {
    selectedId: 'person:ada',
    threads: {
      'person:ada': {
        nodeId: 'friday',
        rootUsed: 'root',
        ended: false,
        lines: [
          { who: 'them', text: 'I have been hacked.' },
          { who: 'you', text: 'Was anybody else at your desk?' },
        ],
      },
    },
  });
  store.patch('day', { briefShownFor: 1, scorecardShownFor: null });
  store.patch('browser', { siteId: 'cats' });
  store.patch('caught', { appId: 'bubbles', at: 220 });

  return store.snapshot();
}

describe('the shell-owned app state', () => {
  it('starts a session with nothing read and nothing selected', () => {
    const fresh = createAppState();

    expect(fresh.mail).toEqual({ selectedId: null, read: [] });
    expect(fresh.kb.selectedId).toBeNull();
    expect(fresh.chat).toEqual({ selectedId: null, threads: {} });
    expect(fresh.day).toEqual({ briefShownFor: null, scorecardShownFor: null });
    expect(fresh.browser).toEqual({ siteId: null });
    expect(fresh.caught)
      .toEqual({ appId: null, at: null, evidence: null, software: null });
    expect(fresh.assistant).toEqual({ dismissals: 0, closedOnDay: null });
    expect(fresh.hubbub).toEqual({ selectedChannel: null, read: [], charged: [] });
  });

  /**
   * The rooms' ledger, both halves of how it is read: it has to SURVIVE,
   * because a badge that came back after a load would charge the player for
   * reading the same Monday twice - and a file written before the rollout has
   * to LOAD, because a session is not worth throwing away over a badge.
   */
  it('carries the rooms\' read ledger, and reads a file from before it', () => {
    const store = new AppStateStore();
    store.patch('hubbub', {
      selectedChannel: 'chan:helpdesk',
      read: ['hub:welcome', 'hub:gary-account'],
      // The attention drip's watermark (0.5.0 slice 3), carried the same way
      // the read ledger is: a load that forgot it would re-bill the whole pile.
      charged: ['hub:welcome'],
    });

    const wire: unknown = JSON.parse(JSON.stringify(store.snapshot()));
    expect(parseAppState(wire)?.hubbub).toEqual({
      selectedChannel: 'chan:helpdesk',
      read: ['hub:welcome', 'hub:gary-account'],
      charged: ['hub:welcome'],
    });

    const older = { ...(wire as Record<string, unknown>) };
    delete older.hubbub;
    expect(parseAppState(older)?.hubbub)
      .toEqual({ selectedChannel: null, read: [], charged: [] });

    // A file from AFTER the rollout but BEFORE the drip: the rooms are there and
    // the charged ledger is not, which loads as nothing owed rather than a
    // refusal - the same courtesy the read ledger's own absence gets.
    const preDrip = {
      ...(wire as object),
      hubbub: { selectedChannel: 'chan:helpdesk', read: ['hub:welcome'] },
    };
    expect(parseAppState(preDrip)?.hubbub)
      .toEqual({ selectedChannel: 'chan:helpdesk', read: ['hub:welcome'], charged: [] });

    // Present but nonsense is still a refusal: this arrives from storage.
    for (const broken of [
      { selectedChannel: 7, read: [] },
      { selectedChannel: null, read: 'hub:welcome' },
      { selectedChannel: null, read: [1, 2] },
      { selectedChannel: null, read: [], charged: 'hub:welcome' },
      { selectedChannel: null, read: [], charged: [1, 2] },
      'rooms',
    ]) {
      expect(parseAppState({ ...(wire as object), hubbub: broken })).toBeNull();
    }
  });

  /**
   * The one number 0.3.5 added, and both halves of how it is read.
   *
   * It has to SURVIVE, because the gag is that the thing on the desk remembers
   * being closed; and a file written before it existed has to LOAD, because
   * throwing a week away over a joke's counter would be the cure being worse.
   */
  it('carries the assistant count, and reads a file from before it existed', () => {
    const store = new AppStateStore();
    store.patch('assistant', { dismissals: 3 });

    const wire: unknown = JSON.parse(JSON.stringify(store.snapshot()));
    expect(parseAppState(wire)?.assistant.dismissals).toBe(3);

    const older = { ...(wire as Record<string, unknown>) };
    delete older.assistant;
    expect(parseAppState(older)?.assistant.dismissals).toBe(0);

    // Present but nonsense is still a refusal: this arrives from storage.
    for (const dismissals of [-1, 1.5, 'lots', null]) {
      expect(parseAppState({ ...(wire as object), assistant: { dismissals } }))
        .toBeNull();
    }
  });

  /**
   * The count is the one field the save carries as a running total, and a
   * total with no ceiling is a save a hand-edit can push to the top of the
   * safe-integer range - whereupon the next dismissal overflows it and the
   * next save will not parse. So an absurd count is clamped rather than
   * refused: the game is worth keeping, the gag stopped escalating tiers ago.
   */
  it('clamps an absurd assistant count instead of letting it overflow', () => {
    const at = (dismissals: number): number | undefined => parseAppState({
      ...createAppState(),
      assistant: { dismissals },
    })?.assistant.dismissals;

    expect(at(5)).toBe(5);
    expect(at(ASSISTANT_DISMISSAL_CAP)).toBe(ASSISTANT_DISMISSAL_CAP);
    expect(at(ASSISTANT_DISMISSAL_CAP + 1)).toBe(ASSISTANT_DISMISSAL_CAP);
    // The pathological one: the largest safe integer clamps to the cap, so the
    // count that comes back can be incremented and re-saved for ever.
    expect(at(Number.MAX_SAFE_INTEGER)).toBe(ASSISTANT_DISMISSAL_CAP);
    expect(Number.isSafeInteger((at(Number.MAX_SAFE_INTEGER) ?? 0) + 1))
      .toBe(true);
  });

  it('patches one slice without disturbing the others', () => {
    const store = new AppStateStore();
    store.patch('mail', { read: ['mail/onboarding'] });
    store.patch('kb', { selectedId: 'kb/power-cycle' });

    expect(store.get().mail).toEqual({
      selectedId: null,
      read: ['mail/onboarding'],
    });
    expect(store.get().kb.selectedId).toBe('kb/power-cycle');
    expect(store.get().chat.threads).toEqual({});
  });

  /**
   * The round trip a mid-day save depends on. A transcript that comes back a
   * line short is a conversation the player is asked to have again, and the
   * reveal it bought is already on the ticket - so the two halves of the
   * session would disagree about what was said.
   */
  it('survives the trip through storage exactly as it went in', () => {
    const store = new AppStateStore();
    const before = worked(store);
    const wire: unknown = JSON.parse(JSON.stringify(store.snapshot()));

    const loaded = new AppStateStore();
    expect(loaded.hydrate(wire)).toBe(true);
    expect(loaded.get()).toEqual(before);
    expect(loaded.get().chat.threads['person:ada']?.lines).toHaveLength(2);
  });

  /**
   * This arrives from `localStorage`, which anything on the machine can have
   * edited. Half a session on screen is worse than none: the player is left to
   * work out which half.
   */
  it('refuses a snapshot that is not exactly the shape it writes', () => {
    const store = new AppStateStore();
    const good: unknown = JSON.parse(JSON.stringify(worked(store)));

    expect(parseAppState(good)).not.toBeNull();

    const broken: unknown[] = [
      null,
      'nope',
      [],
      {},
      { ...(good as object), mail: { selectedId: 7, read: [] } },
      { ...(good as object), mail: { selectedId: null, read: [1, 2] } },
      { ...(good as object), kb: {} },
      { ...(good as object), day: { briefShownFor: 0, scorecardShownFor: null } },
      { ...(good as object), day: { briefShownFor: 1.5, scorecardShownFor: null } },
      { ...(good as object), browser: { siteId: 7 } },
      { ...(good as object), caught: { appId: 'bubbles', at: -1 } },
      { ...(good as object), caught: { appId: 4, at: null } },
      // The captured reading, when it is there at all, is a number of minutes.
      { ...(good as object), caught: { appId: 'browser', at: 1, evidence: -2 } },
      { ...(good as object), caught: { appId: 'browser', at: 1, evidence: 'a' } },
      {
        ...(good as object),
        chat: { selectedId: null, threads: { 'person:ada': { lines: [] } } },
      },
      {
        ...(good as object),
        chat: {
          selectedId: null,
          threads: {
            'person:ada': {
              nodeId: 'root',
              rootUsed: 'root',
              ended: false,
              lines: [{ who: 'nobody', text: 'x' }],
            },
          },
        },
      },
    ];

    for (const snapshot of broken) {
      expect(parseAppState(snapshot), JSON.stringify(snapshot)).toBeNull();
    }

    // And a refused hydrate leaves the running session alone.
    const running = new AppStateStore();
    const untouched = worked(running);
    expect(running.hydrate({ chat: 'gone' })).toBe(false);
    expect(running.get()).toEqual(untouched);
  });

  /**
   * An app repaints its own writes, so notifying on those is a loop waiting
   * for its first re-entrant caller. A REPLACEMENT is the one change no app
   * can see coming - the load that swaps the session underneath it.
   */
  it('announces a replacement and stays quiet about ordinary writes', () => {
    const store = new AppStateStore();
    const listener = vi.fn();
    const unsubscribe = store.onReplaced(listener);

    store.patch('kb', { selectedId: 'kb/power-cycle' });
    expect(listener).not.toHaveBeenCalled();

    // A write from OUTSIDE the app layer does announce: the app whose slice
    // changed is not the one that changed it, so nothing else repaints it.
    store.patchExternal('caught', { appId: 'browser', at: 12, evidence: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().caught)
      .toEqual({ appId: 'browser', at: 12, evidence: null, software: null });

    expect(store.hydrate(createAppState())).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);

    store.reset();
    expect(listener).toHaveBeenCalledTimes(3);

    // A refused hydrate changed nothing, so it announces nothing.
    expect(store.hydrate('rubbish')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    store.reset();
    expect(listener).toHaveBeenCalledTimes(3);
    // Unsubscribing twice is a no-op, not a second removal.
    unsubscribe();
  });

  /**
   * The distinction the box bug turned on.
   *
   * `onReplaced` fires on an external patch too, so anything that must tell a
   * LOAD apart from a boss beat writing to the store needs `onReloaded`, which
   * fires ONLY on a wholesale replacement. The Assistant's note-owed memory was
   * reset on `onReplaced` and every chat beat wiped it; this is the seam that
   * fixed it, and this is the test that would have caught it.
   */
  it('tells a reload apart from an ordinary external patch', () => {
    const store = new AppStateStore();
    const reloaded = vi.fn();
    const unsubscribe = store.onReloaded(reloaded);

    // An external patch is NOT a reload, however loudly it announces.
    store.patchExternal('chat', { selectedId: 'person:ada' });
    expect(reloaded).not.toHaveBeenCalled();

    // A load is, and so is a restart.
    expect(store.hydrate(createAppState())).toBe(true);
    expect(reloaded).toHaveBeenCalledTimes(1);
    store.reset();
    expect(reloaded).toHaveBeenCalledTimes(2);

    // A refused load replaced nothing, so it is not a reload.
    expect(store.hydrate('rubbish')).toBe(false);
    expect(reloaded).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.reset();
    expect(reloaded).toHaveBeenCalledTimes(2);
  });
});

/**
 * The web store's install set: save-carried shell state, like the dismissal
 * count, and read with the same strictness.
 */
describe('the installed-app set', () => {
  it('starts empty, so a scripted week never carries one', () => {
    // The determinism guarantee in one line: nothing is installed at the start
    // of a session, and the scripted walks never install, so the goldens do not
    // move.
    expect(createAppState().installed).toEqual({ apps: [] });
  });

  it('carries an install through storage, and reads a file from before it', () => {
    const store = new AppStateStore();
    store.patch('installed', { apps: [A_TOY] });

    const wire: unknown = JSON.parse(JSON.stringify(store.snapshot()));
    expect(parseAppState(wire)?.installed.apps).toEqual([A_TOY]);

    // A save written before the store existed loads as nothing installed rather
    // than a refusal - the same grace the dismissal count gets.
    const older = { ...(wire as Record<string, unknown>) };
    delete older.installed;
    expect(parseAppState(older)?.installed.apps).toEqual([]);
  });

  it('refuses an install set that names something it cannot mount', () => {
    const store = new AppStateStore();
    const good: unknown = JSON.parse(JSON.stringify(store.snapshot()));

    // The load-bearing "refuse garbage": an id with no definition behind it
    // would mount a window with nothing in it. Revert isInstallableId's check
    // and the first two of these load a broken manifest.
    for (const apps of [
      ['not-a-real-app'],
      [A_TOY, 'not-a-real-app'],
      [A_TOY, A_TOY], // the same toy twice is not a shape this shell writes
      [7],
      'arcade', // not even a list
    ]) {
      expect(
        parseAppState({ ...(good as object), installed: { apps } }),
        JSON.stringify(apps),
      ).toBeNull();
    }
  });
});

describe('the desktop the box is running', () => {
  it('starts on the box IT issued, so a scripted week never carries a skin', () => {
    // The determinism guarantee, the same one the install set gives: every
    // session starts on the Windows caricature and the scripted walks never
    // change desktop, so the goldens do not move and the default chrome is the
    // chrome the whole existing suite is written against.
    expect(createAppState().desktop).toEqual({ skin: 'deskpro', distro: null });
  });

  it('carries a chosen desktop through storage, and reads a file from before it', () => {
    const store = new AppStateStore();
    store.patch('desktop', { skin: 'gnome', distro: 'ubuntu' });

    const wire: unknown = JSON.parse(JSON.stringify(store.snapshot()));
    expect(parseAppState(wire)?.desktop)
      .toEqual({ skin: 'gnome', distro: 'ubuntu' });

    // And it comes back through a real hydrate, which is what a load is: the
    // shell that reopens on GNOME is the one that saved on GNOME.
    const loaded = new AppStateStore();
    expect(loaded.hydrate(wire)).toBe(true);
    expect(loaded.get().desktop).toEqual({ skin: 'gnome', distro: 'ubuntu' });

    // A save written before anybody could change their desktop loads as the
    // issued box rather than as a refusal - the same grace the install set gets.
    const older = { ...(wire as Record<string, unknown>) };
    delete older.desktop;
    expect(parseAppState(older)?.desktop)
      .toEqual({ skin: 'deskpro', distro: null });
  });

  it('refuses a desktop or a distro this build cannot draw', () => {
    const store = new AppStateStore();
    const good: unknown = JSON.parse(JSON.stringify(store.snapshot()));

    for (const desktop of [
      { skin: 'xfce', distro: null },
      { skin: 'gnome', distro: 'slackware' },
      // A Windows box on a distro: a combination this shell never writes, and
      // one that would put a package manager on a machine that has none.
      { skin: 'deskpro', distro: 'ubuntu' },
      { skin: 7, distro: null },
      'gnome',
    ]) {
      expect(
        parseAppState({ ...(good as object), desktop }),
        JSON.stringify(desktop),
      ).toBeNull();
    }
  });
});
