import { BOSS_KEY_LABEL } from '../keys';
import { createIcon } from '../icons';
import type { AppDef, AppInstance, GameApi } from './types';

/**
 * The web store's game: Office Arcade, a real slack app once installed.
 *
 * It is `slack: true` now, which is the whole of lane B's change to it: a
 * window the simulation drains stress into while it is genuinely on screen,
 * builds suspicion at the installed-toy rate (`SLACK_RATES.arcade`, the
 * strongest medicine and the worst hiding place), hides on the boss key, and is
 * what the lead names if he arrives while it is up. It drags a caught scene
 * along - the loader refuses to boot a slack app without one - and, because it
 * was INSTALLED against a locked-down policy, the install audit the drip and
 * the lead's beat both read.
 *
 * The register is The Website Is Down: it does one thing badly and is very
 * pleased with itself about it. There is one control, it advances a level that
 * is not a level, and nothing is ever saved anywhere.
 */

const LEVEL_LINES = [
  'LEVEL 1. A block moves left. You pressed a button and it moved. This is '
    + 'the game.',
  'LEVEL 2. The block is now slightly faster. The company has not noticed '
    + 'either of you.',
  'LEVEL 3. A second block. It does nothing. It is here for morale, like you.',
  'LEVEL 4. The blocks are the same speed as your resolve, which is to say '
    + 'they have stopped.',
  'LEVEL 5. You have reached the end of the content. It loops. So does the '
    + 'week.',
] as const;

export const ARCADE_APP: AppDef = {
  id: 'arcade',
  title: 'Office Arcade',
  icon: 'icon-arcade',
  tier_required: 1,
  slack: true,
  desktop: true,
  mount: (host, api: GameApi): AppInstance => {
    let level = 0;

    const root = document.createElement('section');
    root.className = 'arcade-app';
    root.dataset.testid = 'arcade-app';

    const title = document.createElement('h1');
    title.className = 'arcade-title';
    title.textContent = 'Office Arcade';

    const tip = document.createElement('p');
    tip.className = 'arcade-tip';
    tip.textContent = `A morale exercise you installed yourself. Panic key: `
      + `${BOSS_KEY_LABEL}`;

    const stage = document.createElement('div');
    stage.className = 'arcade-stage';
    const sprite = document.createElement('span');
    sprite.className = 'arcade-sprite';
    sprite.append(createIcon('icon-arcade'));
    stage.append(sprite);

    const body = document.createElement('p');
    body.className = 'arcade-body';
    body.dataset.testid = 'arcade-body';

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'os-button os-button-primary';
    play.dataset.testid = 'arcade-play';
    play.textContent = 'Play';

    const render = (): void => {
      body.textContent = level === 0
        ? 'You installed it. It installed. Press Play, which is the whole of '
          + 'the game and, honestly, more interface than it needed.'
        : LEVEL_LINES[Math.min(level - 1, LEVEL_LINES.length - 1)] ?? '';
      sprite.style.setProperty('--arcade-step', String(level % LEVEL_LINES.length));
      play.textContent = level === 0 ? 'Play' : 'Next level';
    };

    const onPlay = (): void => {
      level += 1;

      if (level === LEVEL_LINES.length) {
        api.notify(
          'Office Arcade',
          'You have finished Office Arcade. Your reward is the same desk you '
            + 'started at, and a quiet suspicion that this was on the audit the '
            + 'whole time.',
        );
      }

      render();
    };

    play.addEventListener('click', onPlay);

    root.append(title, tip, stage, body, play);
    host.replaceChildren(root);
    render();

    return {
      unmount: (): void => {
        play.removeEventListener('click', onPlay);
        root.remove();
      },
    };
  },
};
