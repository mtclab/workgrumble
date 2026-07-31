/**
 * Being caught, as content.
 *
 * One scene per slack app, because the joke is the specific thing that was on
 * the screen: a man who has just watched you pop a bubble does not say the same
 * sentence as a man who has just read four hundred words about a lawnmower. The
 * scene is data - the window that shows it renders whatever it is handed - and
 * the loader refuses to boot a slack app that nobody has written one for.
 *
 * House rules for writing one: he is not cruel, he is disappointed in a way
 * that costs you more; the player is never called an idiot; there is always a
 * way out of the window, because a dead end is a dead end even when it is
 * funny.
 */

export interface CaughtScene {
  /** The slack app that was on the screen. */
  readonly appId: string;
  readonly title: string;
  /** What he says, standing there. */
  readonly bossLine: string;
  /** What the room does while he says it. */
  readonly narration: string;
  /** What you say back. There is only one thing to say. */
  readonly reply: string;
  /** The button that closes it, which is always there. */
  readonly dismissLabel: string;
}

/**
 * Load-time content gate for the scenes themselves: one scene per app, and
 * every part of it actually written. A scene with a blank dismiss label is a
 * window a player cannot leave, which is the one thing these must never be.
 */
export function validateCaughtScenes(
  scenes: readonly CaughtScene[],
): readonly CaughtScene[] {
  const seen = new Set<string>();

  for (const scene of scenes) {
    if (scene.appId.trim().length === 0) {
      throw new Error('A caught scene must say which app it is about.');
    }

    if (seen.has(scene.appId)) {
      throw new Error(`Duplicate caught scene for "${scene.appId}".`);
    }

    seen.add(scene.appId);

    for (const [part, text] of Object.entries<string>({ ...scene })) {
      if (text.trim().length === 0) {
        throw new Error(
          `Caught scene "${scene.appId}" has no ${part}, and every part of it `
          + 'ends up on the screen.',
        );
      }
    }
  }

  return Object.freeze([...scenes]);
}

export const CAUGHT_SCENES: readonly CaughtScene[] = validateCaughtScenes([
  {
    appId: 'bubbles',
    title: 'A quick word about morale',
    bossLine: 'Bubble Break. Right. And is that part of the ticket, Pat, or is '
      + 'that the bit of the ticket you do afterwards?',
    narration: 'He has been standing there for long enough to have watched you '
      + 'catch two. He waits until you catch a third, which you do, because '
      + 'your hand was already moving.',
    reply: 'You explain that it is a morale exercise. He writes the phrase '
      + '"morale exercise" down, which is the worst possible outcome.',
    dismissLabel: 'Take it on the chin',
  },
  {
    appId: 'browser',
    title: 'A quick word about research',
    bossLine: 'Is that a forum? That is a forum. Pat, I can see the little '
      + 'avatars from the door.',
    narration: 'He leans in, close enough to read, and reads. Out loud. '
      + 'Including the part where somebody called BEIGE_ENJOYER says the '
      + 'lawnmower was fine all along.',
    reply: 'You call it research. He agrees that it is research, in the tone '
      + 'of a man who intends to use that word again at your review.',
    dismissLabel: 'Close the tab, and the conversation',
  },
]);

export function caughtScene(appId: string): CaughtScene | undefined {
  return CAUGHT_SCENES.find((scene) => scene.appId === appId);
}

/**
 * What the window shows if it is ever handed an app nobody wrote a scene for.
 *
 * The loader below makes that unreachable for anything shipped, but a SAVE can
 * name an app this build no longer has, and a blank window with a boss in it is
 * worse than a general-purpose telling-off.
 */
export const GENERIC_CAUGHT_SCENE: CaughtScene = Object.freeze({
  appId: '',
  title: 'A quick word',
  bossLine: 'I am not going to ask what that was. I am going to remember that '
    + 'I did not ask.',
  narration: 'He looks at your screen. He looks at you. He does the small nod '
    + 'that means a sentence has been saved for later.',
  reply: 'You say nothing, which is the first correct thing you have done all '
    + 'afternoon.',
  dismissLabel: 'Take it on the chin',
});

/** The shape the loader needs: an app roster it can check itself against. */
export interface SlackAppEntry {
  readonly id: string;
  readonly slack: boolean;
}

/**
 * Load-time content gate: every app that can get you caught has a scene.
 *
 * It runs where the manifest is built, so a slack app added without content is
 * a boot failure rather than a blank comedy window discovered by a player. The
 * reverse - a scene for an app that is not installed - is left alone on
 * purpose: content may land before the app it belongs to does.
 */
export function assertCaughtScenes(
  apps: readonly SlackAppEntry[],
): readonly SlackAppEntry[] {
  for (const app of apps) {
    if (app.slack && caughtScene(app.id) === undefined) {
      throw new Error(
        `Slack app "${app.id}" has no caught scene. Somebody can be caught at `
        + 'it and nobody has written what happens.',
      );
    }
  }

  return apps;
}
