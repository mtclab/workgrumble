/**
 * Caught-scene reachability.
 *
 * The gate is the one the M3 spec asks for and it is deliberately written
 * against the SHIPPED manifest rather than a list of app ids kept beside it: if
 * a slack app is installed, somebody can be caught at it, and there has to be a
 * scene for what happens when they are. A list would drift; the manifest is the
 * thing the desktop actually launches.
 */

import { describe, expect, it } from 'vitest';

import { APP_MANIFEST } from '../../shell/apps';
import {
  assertCaughtScenes,
  CAUGHT_SCENES,
  caughtScene,
  GENERIC_CAUGHT_SCENE,
  validateCaughtScenes,
} from './index';

describe('every slack app has a scene', () => {
  it('covers every slack app the shipped manifest installs', () => {
    const slackApps = APP_MANIFEST.filter((app) => app.slack);

    expect(slackApps.length).toBeGreaterThan(0);

    for (const app of slackApps) {
      const scene = caughtScene(app.id);

      expect(scene, `no caught scene for "${app.id}"`).toBeDefined();
      expect(scene?.bossLine.length).toBeGreaterThan(0);
      expect(scene?.dismissLabel.length).toBeGreaterThan(0);
    }

    expect(() => assertCaughtScenes(APP_MANIFEST)).not.toThrow();
  });

  it('refuses to load a slack app nobody has written one for', () => {
    expect(() => assertCaughtScenes([
      { id: 'no-such-slack-app', slack: true },
    ])).toThrow('no caught scene');

    // A work app needs no scene: nobody is caught at the ticket queue.
    expect(() => assertCaughtScenes([
      { id: 'tickets', slack: false },
    ])).not.toThrow();
  });

  it('refuses two scenes for the same app, or a scene with a hole in it', () => {
    const scene = CAUGHT_SCENES[0];

    expect(scene).toBeDefined();

    if (scene === undefined) {
      return;
    }

    expect(() => validateCaughtScenes([scene, scene]))
      .toThrow('Duplicate caught scene');
    expect(() => validateCaughtScenes([{ ...scene, dismissLabel: '  ' }]))
      .toThrow('has no dismissLabel');
    expect(() => validateCaughtScenes([{ ...scene, appId: '' }]))
      .toThrow('which app it is about');
    expect(validateCaughtScenes([scene])).toEqual([scene]);
  });
});

describe('what a scene has to be', () => {
  it('always offers a way out of the window', () => {
    for (const scene of [...CAUGHT_SCENES, GENERIC_CAUGHT_SCENE]) {
      expect(scene.dismissLabel.trim().length).toBeGreaterThan(0);
      expect(scene.title.trim().length).toBeGreaterThan(0);
      expect(scene.narration.trim().length).toBeGreaterThan(0);
      expect(scene.reply.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * The tone rule, made mechanical where it can be: the comedy is recognition,
   * and the scenes are about the player being seen rather than being stupid.
   */
  it('never calls the player names', () => {
    for (const scene of CAUGHT_SCENES) {
      const words = `${scene.bossLine} ${scene.narration} ${scene.reply}`
        .toLowerCase();

      for (const insult of ['idiot', 'stupid', 'lazy', 'useless', 'moron']) {
        expect(words, scene.appId).not.toContain(insult);
      }
    }
  });

  it('answers with nothing for an app nobody has heard of', () => {
    expect(caughtScene('a-game-nobody-wrote-down')).toBeUndefined();
  });
});
