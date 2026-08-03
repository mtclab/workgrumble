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
  /**
   * What the FILE calls it, which is not what he calls it.
   *
   * The scene is a man being funny at your desk; the line that goes on the
   * record afterwards is written by somebody with a template, in the passive
   * voice, weeks later. Both are true about the same minute and neither is a
   * paraphrase of the other, which is the joke and is also why this is content
   * beside the scene rather than a label the shell invents.
   */
  readonly fileSubject: string;
}

/**
 * Load-time content gate for the scenes themselves: one scene per app, and
 * every part of it actually written. A scene with a blank dismiss label is a
 * window a player cannot leave, which is the one thing these must never be.
 */
export function validateCaughtScene(scene: Readonly<CaughtScene>): CaughtScene {
  if (scene.appId.trim().length === 0) {
    throw new Error('A caught scene must say which app it is about.');
  }

  for (const [part, text] of Object.entries<string>({ ...scene })) {
    if (text.trim().length === 0) {
      throw new Error(
        `Caught scene "${scene.appId}" has no ${part}, and every part of it `
        + 'ends up on the screen.',
      );
    }
  }

  return Object.freeze({ ...scene });
}

export function validateCaughtScenes(
  scenes: readonly CaughtScene[],
): readonly CaughtScene[] {
  const seen = new Set<string>();

  for (const scene of scenes) {
    validateCaughtScene(scene);

    if (seen.has(scene.appId)) {
      throw new Error(`Duplicate caught scene for "${scene.appId}".`);
    }

    seen.add(scene.appId);
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
    fileSubject: 'a puzzle game',
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
    fileSubject: 'a discussion forum',
  },
  {
    appId: 'arcade',
    title: 'A quick word about what is installed',
    bossLine: 'That is a game. On the machine. Pat, that did not come with the '
      + 'build, which means somebody put it there, and there is only one '
      + 'somebody it could be.',
    narration: 'He does not ask you to close it. He watches it run for a '
      + 'moment, the way you watch a kettle you already know is broken, and '
      + 'then he says the thing about the list.',
    reply: 'You say it was a two-minute thing. He agrees it was a two-minute '
      + 'thing, and that the two minutes are now on the audit with your name '
      + 'against them.',
    dismissLabel: 'Close it, and let it be logged',
    fileSubject: 'an installed game',
  },
  {
    appId: 'mediaplayer',
    title: 'A quick word about what is installed',
    bossLine: 'Is that a media player? We do not put media players on these. '
      + 'It is not that anybody minds the music, Pat, it is that the music '
      + 'arrived on a machine it was not supposed to be on.',
    narration: 'He tilts his head at the little visualiser bouncing along in '
      + 'the corner, entirely unbothered by any of this, and lets it bounce '
      + 'for slightly too long before he goes on.',
    reply: 'You offer to take it off. He says that would be sensible, and that '
      + 'taking it off does not take it off the list, which is a different '
      + 'list.',
    dismissLabel: 'Close it, and let it be logged',
    fileSubject: 'an installed media player',
  },
]);

/**
 * The other software conversation, and the one that is not about a screen.
 *
 * The key is not an app and cannot be installed: what the lead found is the
 * install AUDIT - the list of software this workstation is holding against a
 * locked-down policy - rather than a window that happened to be open. It is the
 * caught-scene class rather than a new one for the same reason the status one
 * is: somebody comes down the corridor, there is a short conversation, a line
 * goes on the file, the minutes are gone, and a second machinery for the same
 * beat would be two ways of being spoken to that could disagree.
 *
 * It reads whether or not the toy is on screen right now, because the evidence
 * is the list, not the window - "that game you installed" is a true sentence
 * about a machine whose game is minimised, closed, or even uninstalled, since
 * the record of the install outlives the app.
 */
export const INSTALL_CAUGHT_KEY = 'software:install';

/**
 * The STATIC fallback for the install-audit conversation.
 *
 * The real scene is built in the shell from the actual records - which programs,
 * and their real removal state - so that nothing printed can be false in-fiction
 * (`src/shell/apps/caught.ts`). This is what the window shows only if it is
 * handed the key with no records behind it, which is a save that names the
 * conversation without saying what it was about. So it names nothing specific
 * and claims nothing that might not be true: no "game", no removal it cannot
 * know happened - only the one thing that is always true, which is the list.
 */
export const INSTALL_CAUGHT_SCENE: CaughtScene = validateCaughtScene({
  appId: INSTALL_CAUGHT_KEY,
  title: 'A quick word about the install log',
  bossLine: 'Something got installed on this machine that we do not allow, and '
    + 'it is on the install audit with your name against it. We keep a list, '
    + 'and the list does not forget the way a desktop does.',
  narration: 'He is not holding anything and he is not looking at your screen. '
    + 'He is looking at you the way a man looks when the thing he is telling '
    + 'you off for is not in the room, because it never had to be.',
  reply: 'You say it was nothing. He says the list does not think it was '
    + 'nothing, and that it stays on there whatever you do to the machine.',
  dismissLabel: 'Take it on the chin',
  // What the FILE calls it: a record IT holds, in the passive voice of somebody
  // who read the audit rather than the window.
  fileSubject: 'a program installed against policy',
});

/**
 * The one conversation in this family that is not about a screen.
 *
 * The key is not an app and deliberately reads as one thing that cannot be
 * installed: what the lead found was the DOT, held all morning over a desk
 * whose dispatch log says the queue was being worked the whole time. It is the
 * caught-scene class rather than a new one because it is the same event -
 * somebody comes down the corridor, there is a short conversation, a line goes
 * on the file, and the minutes are gone - and a second machinery for the same
 * beat would be two ways of being spoken to that could disagree.
 *
 * The quantity is NOT in these words. The scene is the same sentences every
 * time; the evidence under it is read off the world by the window that shows
 * it (`dndEvidence`), because how much of the morning it was is a fact about
 * the day rather than about the writing.
 */
export const PRESENCE_CAUGHT_KEY = 'presence:dnd';

export const DND_CAUGHT_SCENE: CaughtScene = validateCaughtScene({
  appId: PRESENCE_CAUGHT_KEY,
  title: 'A quick word about your availability',
  bossLine: 'Pat. You have been on Do Not Disturb. And I can see tickets '
    + 'moving, so you are clearly here - which means it was not the work you '
    + 'did not want disturbing, it was the people.',
  narration: 'He says it kindly, in the way of a man who has already had the '
    + 'thought twice and is only now saying it out loud. He does not ask you to '
    + 'change it. He looks at the little red dot, and then at you, for slightly '
    + 'too long.',
  reply: 'You say you were concentrating. He says that is exactly what he '
    + 'assumed, in a voice that files the sentence away for later.',
  dismissLabel: 'Put it back to Available',
  // What the FILE calls it, which is the wording of somebody who has put two
  // records side by side rather than the wording of a man at your shoulder.
  // The quantity is added by the line that writes it, off the world.
  fileSubject: 'Do Not Disturb',
});

/**
 * Which scene goes with what he found: an app that was on the screen, or the
 * status that was on the desk.
 *
 * One lookup for both because the WINDOW is one window: it is handed whatever
 * the day recorded and draws it, and a second table for the second kind would
 * be a second place for a missing scene to become a blank telling-off.
 */
export function caughtScene(appId: string): CaughtScene | undefined {
  if (appId === PRESENCE_CAUGHT_KEY) {
    return DND_CAUGHT_SCENE;
  }

  if (appId === INSTALL_CAUGHT_KEY) {
    return INSTALL_CAUGHT_SCENE;
  }

  return CAUGHT_SCENES.find((scene) => scene.appId === appId);
}

/**
 * What the window shows if it is ever handed an app nobody wrote a scene for.
 *
 * The loader below makes that unreachable for anything shipped, but a SAVE can
 * name an app this build no longer has, and a blank window with a boss in it is
 * worse than a general-purpose telling-off.
 */
/**
 * What the window says when it is opened cold - from the start menu, by
 * somebody who has not been caught at anything. It is not a scene, it is the
 * absence of one, and saying so is better than showing a telling-off that
 * never happened.
 */
export const UNCAUGHT_SCENE: CaughtScene = Object.freeze({
  appId: '',
  title: 'Nothing to report',
  bossLine: 'The lead is in his office with the door, and as far as he knows '
    + 'you have been working all morning.',
  narration: 'This window is where the conversation goes when there is one. '
    + 'There has not been one.',
  reply: 'Keep it that way, or do not - the bubbles are not going to catch '
    + 'themselves.',
  dismissLabel: 'Back to work',
  fileSubject: 'nothing',
});

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
  fileSubject: 'a non-work application',
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
export function assertCaughtScenes<Entry extends SlackAppEntry>(
  apps: readonly Entry[],
): readonly Entry[] {
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
