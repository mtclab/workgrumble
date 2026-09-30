import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { type Actor, createActor } from './entities';
import type { Game, PromptTarget } from './game';
import { eTarget, propLive, type StepId } from './induction';
import { findPrompt } from './interact';
import type { Interactable } from './level';
import { Rng } from './rng';
import { newSave } from './state';

// Name tags and markers are canvas text; the prompt does not need to see them.
vi.mock('./textures', async (orig) => ({
  ...(await orig<typeof import('./textures')>()),
  textSprite: () => new THREE.Sprite(),
  disposeSprite: () => undefined,
}));

/**
 * The E prompt on induction day (docs/SPEC_INDUCTION.md). A staging run found
 * the computer placed for step 7 answering E at step 2, while the card said
 * to talk to the practice colleague: E opened WorkgrumbleOS. Here the real
 * findPrompt runs with the colleague in reach and the lobby computer closer
 * still, right in front; the induction's side is the pure rule (`propLive`,
 * `eTarget`), wired the way InductionDay wires it.
 */

interface Scene {
  readonly g: Game;
  readonly colleague: Actor;
  readonly terminal: Interactable;
}

function lobby(step: StepId | 'done' | null): Scene {
  const scene = new THREE.Scene();
  const colleague = createActor({ scene, floor: 0, difficulty: 1 }, 'npc', 12, 10 - 2.2, 0, new Rng(3), 10, { npc: { id: 'induction-practice', name: 'Sam' } });
  // The computer: nearer than the colleague and dead ahead (the player faces -z).
  const terminal: Interactable = { kind: 'terminal', x: 12, z: 10 - 1.2, id: 9_000_001, room: 0, used: false, mesh: null, lock: 0 };
  const propOf = (x: Actor | Interactable): 'colleague' | 'terminal' | null => (x === colleague ? 'colleague' : x === terminal ? 'terminal' : null);
  const player = { pos: new THREE.Vector3(12, 0, 10), yaw: 0 };
  const day = step === null ? null : {
    offersPrompt: (x: Actor | Interactable): boolean => {
      const p = propOf(x);
      return p === null || propLive(p, step);
    },
    pinnedPrompt: (): PromptTarget => {
      const t = eTarget(step);
      if (t === 'colleague') return { kind: 'actor', a: colleague };
      if (t === 'terminal') return { kind: 'interact', it: terminal };
      return null;
    },
  };
  const g = {
    player, actors: [colleague], level: { interactables: [terminal] }, save: newSave(1), elevatorOpen: false,
    lockerItems: new Map<number, string>(), inductionDay: day, prompt: '', promptTarget: null,
  } as unknown as Game;
  return { g, colleague, terminal };
}

describe('E on induction day goes to what the card asks for', () => {
  it('at the talk step: the colleague, not the computer in front of you', () => {
    const { g, colleague } = lobby('talk');
    findPrompt(g);
    expect(g.promptTarget).toEqual({ kind: 'actor', a: colleague });
    expect(g.prompt).toContain('Sam');
  });

  it('at the talk step, even with the lobby\'s own computer closer still: the colleague wins', () => {
    const { g, colleague } = lobby('talk');
    const own: Interactable = { kind: 'terminal', x: 12, z: 10 - 0.9, id: 3, room: 0, used: false, mesh: null, lock: 0 };
    g.level.interactables.push(own);
    findPrompt(g);
    expect(g.promptTarget).toEqual({ kind: 'actor', a: colleague });
  });

  it('at the ticket step: the computer', () => {
    const { g, terminal } = lobby('ticket');
    findPrompt(g);
    expect(g.promptTarget).toEqual({ kind: 'interact', it: terminal });
    expect(g.prompt).toContain('Log on');
  });

  it('at a swing step: neither prop offers E at all', () => {
    const { g } = lobby('swing');
    findPrompt(g);
    expect(g.promptTarget).toBeNull();
  });

  it('with no induction, the nearer thing in front wins as it always did (the control)', () => {
    const { g, terminal } = lobby(null);
    findPrompt(g);
    expect(g.promptTarget).toEqual({ kind: 'interact', it: terminal });
  });
});
