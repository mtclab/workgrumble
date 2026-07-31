import {
  type CaughtScene,
  caughtScene,
  GENERIC_CAUGHT_SCENE,
  UNCAUGHT_SCENE,
} from '../../world/scenes';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import type { AppDef, AppInstance, GameApi } from './types';
import { element, osButton } from './ui';

/**
 * The caught scene: a window with a manager in it.
 *
 * It is a window rather than a modal on purpose. A modal that owns the screen
 * while the clock runs is a punishment the player cannot leave, and the house
 * rules forbid a dead end however funny it is - so this closes from its own
 * button, from the titlebar, and from Escape like everything else, and the
 * queue is still there underneath it the whole time.
 *
 * The words are content: which scene is shown is decided by which slack app
 * was on the screen, and the loader refuses to boot a slack app that has none.
 */
export const CAUGHT_APP: AppDef = {
  id: 'caught',
  title: 'A quick word',
  icon: 'icon-door',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api: GameApi): AppInstance => {
    const root = element('section', 'app-page caught-app', 'caught-app');

    const head = element('div', 'caught-head');
    const portrait = element('div', 'caught-portrait');
    portrait.append(createIcon('icon-door'));
    const heading = element('h2', undefined, 'caught-heading');
    const stamp = element('p', 'caught-stamp', 'caught-stamp');
    const copy = element('div', 'caught-head-copy');
    copy.append(heading, stamp);
    head.append(portrait, copy);

    const line = element('blockquote', 'caught-line', 'caught-line');
    const narration = element('p', 'caught-narration', 'caught-narration');
    const reply = element('p', 'caught-reply', 'caught-reply');

    const footer = element('div', 'caught-footer');
    const dismiss = osButton('Take it on the chin', 'caught-dismiss', {
      primary: true,
    });
    const note = element('p', 'caught-note', 'caught-note');
    footer.append(dismiss, note);

    root.append(head, line, narration, reply, footer);

    dismiss.addEventListener('click', () => {
      api.closeApp('caught');
    });

    const render = (): void => {
      const { appId, at } = api.appState.get().caught;
      const scene: CaughtScene = appId === null
        ? UNCAUGHT_SCENE
        : caughtScene(appId) ?? GENERIC_CAUGHT_SCENE;

      root.dataset.app = appId ?? 'none';
      heading.textContent = scene.title;
      stamp.textContent = appId === null || at === null
        ? 'Nobody is standing behind you.'
        : `${formatSimTime(at).day}, ${formatSimTime(at).time}. He was `
          + 'standing there for a while before you noticed.';
      line.textContent = scene.bossLine;
      narration.textContent = scene.narration;
      reply.textContent = scene.reply;
      dismiss.textContent = scene.dismissLabel;
      note.textContent = appId === null
        ? 'The scorecard counts these at 17:00, so an empty window here is '
          + 'the best possible version of this window.'
        : 'The meters have already moved. Closing this does not undo it, and '
          + 'staring at it does not either.';
    };

    host.replaceChildren(root);
    render();

    const unsubscribeState = api.appState.onReplaced(() => {
      render();
    });
    // Being caught twice in one day is two scenes, not one that went stale.
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeState();
        unsubscribeWorld();
        root.remove();
      },
    };
  },
};
