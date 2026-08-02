import { describe, expect, it, vi } from 'vitest';

import {
  type AppState,
  ASSISTANT_DISMISSAL_CAP,
  AppStateStore,
  createAppState,
  parseAppState,
} from './app-state';

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
    expect(fresh.caught).toEqual({ appId: null, at: null, evidence: null });
    expect(fresh.assistant).toEqual({ dismissals: 0 });
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
      .toEqual({ appId: 'browser', at: 12, evidence: null });

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
});
