/**
 * P1-D: the install-audit scene names what was ACTUALLY installed, and never
 * claims a removal that did not happen.
 *
 * The content-honesty bar this gate keeps: nothing the scene prints may be false
 * in-fiction. The line it replaced hardcoded "that game" and claimed the player
 * had taken it off and that the removal was logged - three sentences that were
 * lies the moment the only install was a media player, or was still on the
 * machine. These assertions fail the instant any of that creeps back.
 */

import { describe, expect, it } from 'vitest';

import { INSTALLABLE_MANIFEST } from './installable';
import { installCaughtLines } from './caught';

const GAME = 'arcade';
const MEDIA = 'mediaplayer';

function titleOf(id: string): string {
  return INSTALLABLE_MANIFEST.find((app) => app.id === id)?.title ?? id;
}

describe('the install-audit scene, built from the real records', () => {
  it('names the media player, and never calls it a game', () => {
    // Install only the media player: the scene must name the media player, and
    // must not use the word "game" the old static line hardcoded.
    const { bossLine } = installCaughtLines([MEDIA], new Set([MEDIA]));

    expect(bossLine).toContain(titleOf(MEDIA));
    expect(bossLine).not.toContain(titleOf(GAME));
    expect(bossLine.toLowerCase()).not.toContain('game');
  });

  it('does not claim a removal for a program still on the machine', () => {
    // Still installed: the scene must not say it was taken off, because it was
    // not. The old line claimed a removal unconditionally.
    const { bossLine } = installCaughtLines([GAME], new Set([GAME]));

    expect(bossLine).toContain(titleOf(GAME));
    expect(bossLine.toLowerCase()).not.toContain('taken');
    // It says the honest opposite: it is still on there.
    expect(bossLine.toLowerCase()).toContain('still on the machine');
  });

  it('claims the removal only when it genuinely happened', () => {
    // Installed then gone: the removal is honest to state, because it is on the
    // list. `installed` no longer holds it.
    const { bossLine } = installCaughtLines([GAME], new Set<string>());

    expect(bossLine).toContain(titleOf(GAME));
    expect(bossLine.toLowerCase()).toContain('taken it off');
    expect(bossLine).toContain('on the list too');
  });

  it('names every program when more than one is on the trail', () => {
    const { bossLine } = installCaughtLines(
      [GAME, MEDIA],
      new Set([GAME, MEDIA]),
    );

    expect(bossLine).toContain(titleOf(GAME));
    expect(bossLine).toContain(titleOf(MEDIA));
  });
});
