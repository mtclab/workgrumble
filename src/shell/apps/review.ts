import { reviewScene, type Scene } from '../../world/scenes';
import { REVIEW_PASS_REPUTATION } from '../../world/week';
import { createIcon } from '../icons';
import type { AppDef, AppInstance, GameApi } from './types';
import { element, osButton } from './ui';

/**
 * The review: a window with your probation in it.
 *
 * A window rather than a modal, like every other scene in this game. The clock
 * carries on outside it, the queue is still there underneath it, and it closes
 * from its own button, from the titlebar and from Escape - because a dead end
 * is a dead end however important it is.
 *
 * Which scene it shows is not this window's decision. The world decided at
 * three o'clock, from the one number that decides it, and this reads the field
 * back: a screen that re-ran the threshold would be a second opinion, and two
 * opinions about whether somebody still has a job is one too many.
 */
export const REVIEW_APP: AppDef = {
  id: 'review',
  title: 'Your probation review',
  icon: 'icon-door',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api: GameApi): AppInstance => {
    const root = element('section', 'app-page caught-app review-app', 'review-app');

    const head = element('div', 'caught-head');
    const portrait = element('div', 'caught-portrait');
    portrait.append(createIcon('icon-door'));
    const heading = element('h2', undefined, 'review-heading');
    const stamp = element('p', 'caught-stamp', 'review-stamp');
    const copy = element('div', 'caught-head-copy');
    copy.append(heading, stamp);
    head.append(portrait, copy);

    const line = element('blockquote', 'caught-line', 'review-line');
    const narration = element('p', 'caught-narration', 'review-narration');
    const reply = element('p', 'caught-reply', 'review-reply');

    const footer = element('div', 'caught-footer');
    const dismiss = osButton('Take it on the chin', 'review-dismiss', {
      primary: true,
    });
    const note = element('p', 'caught-note', 'review-note');
    footer.append(dismiss, note);

    root.append(head, line, narration, reply, footer);

    dismiss.addEventListener('click', () => {
      api.closeApp('review');
    });

    /** What the window says before three o'clock on Friday, or on a Tuesday. */
    const PENDING: Scene = {
      title: 'Nothing has been decided',
      line: 'The lead has your probation in a folder on his desk, under a '
        + 'catalogue and a mug he keeps meaning to wash.',
      narration: 'It is reviewed on the Friday, at three, in the room with '
        + 'the blind that does not go all the way down.',
      reply: 'Until then the only thing that moves is the number nobody '
        + 'shows you, and everything you do moves it.',
      dismissLabel: 'Back to work',
    };

    const render = (): void => {
      const outcome = api.day.reviewOutcome();
      const scene = reviewScene(outcome) ?? PENDING;

      root.dataset.outcome = outcome;
      heading.textContent = scene.title;
      stamp.textContent = outcome === 'pending'
        ? 'Friday, three o\'clock. It has not happened yet.'
        : 'Friday, three o\'clock. It has happened.';
      line.textContent = scene.line;
      narration.textContent = scene.narration;
      reply.textContent = scene.reply;
      dismiss.textContent = scene.dismissLabel;
      note.textContent = outcome === 'fired'
        ? 'The shift does not end early because of this. There are two hours '
          + 'left on it, and the queue has not been told.'
        : outcome === 'passed'
          ? 'The probation is over. Whatever is in the fridge with your name '
            + 'on it is now, technically, yours.'
          : `It is decided on one number, and the number has to be at least ${
            String(REVIEW_PASS_REPUTATION)
          } when he opens the folder.`;
    };

    host.replaceChildren(root);
    render();

    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    const unsubscribeDay = api.day.onChanged(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeWorld();
        unsubscribeDay();
        root.remove();
      },
    };
  },
};
