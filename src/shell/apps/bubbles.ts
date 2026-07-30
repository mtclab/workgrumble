import { BOSS_KEY } from '../keys';
import { createIcon } from '../icons';
import type { AppDef } from './types';

/**
 * Fixed rotation instead of random placement: the shell has no business
 * consuming the simulation's seeded RNG, and a deterministic toy is testable.
 */
const BUBBLE_POSITIONS = [
  { x: 22, y: 30 },
  { x: 68, y: 22 },
  { x: 47, y: 58 },
  { x: 79, y: 68 },
  { x: 27, y: 71 },
  { x: 58, y: 38 },
  { x: 16, y: 52 },
] as const;

const MILESTONE_SCORE = 5;

const CAUGHT_LINES = [
  'Clean pop. Productivity remains plausibly deniable.',
  'Another one. The queue has not noticed your absence.',
  'You are extremely good at this and it will never appear on a payslip.',
  `High-score energy. Keep a finger on ${BOSS_KEY}.`,
] as const;

export const BUBBLES_APP: AppDef = {
  id: 'bubbles',
  title: 'Bubble Break',
  icon: 'icon-bubbles',
  tier_required: 1,
  slack: true,
  mount: (host, api) => {
    let score = 0;
    let positionIndex = 0;

    const root = document.createElement('section');
    root.className = 'bubbles-app';
    root.dataset.testid = 'bubbles-app';

    const toolbar = document.createElement('div');
    toolbar.className = 'bubbles-toolbar';
    const scoreLabel = document.createElement('span');
    scoreLabel.className = 'bubbles-score';
    scoreLabel.dataset.testid = 'bubbles-score';
    const tip = document.createElement('span');
    tip.className = 'bubbles-tip';
    tip.textContent = `Morale exercise. Panic key: ${BOSS_KEY}`;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'os-button os-button-compact';
    reset.dataset.testid = 'bubbles-reset';
    reset.textContent = 'Reset';
    toolbar.append(scoreLabel, tip, reset);

    const arena = document.createElement('div');
    arena.className = 'bubbles-arena';
    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = 'bubble-target';
    bubble.dataset.testid = 'bubble-target';
    bubble.setAttribute('aria-label', 'Catch the bubble');
    bubble.append(createIcon('icon-bubbles'));
    const message = document.createElement('p');
    message.className = 'bubbles-message';
    message.dataset.testid = 'bubbles-message';
    arena.append(bubble, message);

    const render = (): void => {
      const position = BUBBLE_POSITIONS[
        positionIndex % BUBBLE_POSITIONS.length
      ];

      if (position === undefined) {
        throw new Error('Bubble position sequence must not be empty.');
      }

      scoreLabel.textContent = `Caught ${String(score).padStart(2, '0')}`;
      bubble.style.setProperty('--bubble-x', `${String(position.x)}%`);
      bubble.style.setProperty('--bubble-y', `${String(position.y)}%`);
    };

    const onCatch = (): void => {
      score += 1;
      positionIndex += 1;
      message.textContent = CAUGHT_LINES[
        Math.min(score - 1, CAUGHT_LINES.length - 1)
      ] ?? '';
      render();

      if (score === MILESTONE_SCORE) {
        api.notify(
          'Bubble Break milestone',
          `${String(MILESTONE_SCORE)} bubbles caught. Your quarterly metrics `
            + 'remain completely unchanged.',
        );
      }
    };
    const onReset = (): void => {
      score = 0;
      positionIndex = 0;
      message.textContent = 'Catch the bubble before management catches you.';
      render();
    };

    bubble.addEventListener('click', onCatch);
    reset.addEventListener('click', onReset);

    root.append(toolbar, arena);
    host.replaceChildren(root);
    onReset();

    return {
      unmount: (): void => {
        bubble.removeEventListener('click', onCatch);
        reset.removeEventListener('click', onReset);
        root.remove();
      },
    };
  },
};
