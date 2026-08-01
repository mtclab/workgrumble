import { reviewScene, type Scene } from '../../world/scenes';
import { REVIEW_PASS_PERFORMANCE } from '../../world/week';
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

    const conduct = element('p', 'caught-narration', 'review-conduct');
    /**
     * The weather, and the matrix if there is one.
     *
     * It is on this window rather than on a screen of its own because this is
     * the window that is already about "what decides whether you are here next
     * week", it opens from the start menu on any day of any week, and a
     * ranking the player can only see on the Friday is a ranking they cannot
     * have played toward. In a quiet week it says so - which is not padding:
     * a player who has never seen a round has to know the shape of one before
     * the first announcement, or the notice reads as a surprise mechanic
     * rather than as the season turning.
     */
    const pressure = element('p', 'caught-narration', 'review-pressure');

    const footer = element('div', 'caught-footer');
    const dismiss = osButton('Take it on the chin', 'review-dismiss', {
      primary: true,
    });
    const note = element('p', 'caught-note', 'review-note');
    footer.append(dismiss, note);

    root.append(head, line, narration, reply, conduct, pressure, footer);

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
      reply: 'What is in the folder is a percentage, it is on the day '
        + 'scorecard every evening, and everything in the queue moves it.',
      dismissLabel: 'Back to work',
    };

    /**
     * The verdict with the number that caused it printed beside it.
     *
     * The mark is the whole decision, so a scene that only says how it went is
     * a scene the player has to take on trust. It is the snapshot rather than
     * a live read: the queue carries on after three o'clock, and a note that
     * drifted away from the verdict above it would be this window arguing with
     * itself.
     */
    const marked = (): string => {
      const card = api.day.weekScorecard();
      return `${String(card.performance)} out of 100, against the ${
        String(card.bar)
      } he wanted`;
    };

    const render = (): void => {
      const outcome = api.day.reviewOutcome();
      const scene = reviewScene(outcome) ?? PENDING;
      const card = api.day.weekScorecard();
      const weather = api.day.pressureReading();

      root.dataset.outcome = outcome;
      root.dataset.bar = String(card.bar);
      root.dataset.beat = weather.beat ?? 'none';
      root.dataset.arcWeek = String(weather.week);
      // The reason the bar is that number, printed beside the verdict in the
      // world's own words rather than re-derived here. It is written into the
      // graph a minute before the conversation and never recomputed, so this
      // window cannot end up explaining a verdict with a reason that has since
      // gone away - which it would, because the queue carries on all
      // afternoon and closing a red ticket retires the person who complained.
      conduct.textContent = outcome === 'pending'
        ? `As it stands: ${card.conduct}`
        : card.conduct;
      // The same rule as the conduct line above it: live while there is still
      // a week to play, and the world's own snapshot afterwards. A matrix
      // re-derived after three o'clock would print a position that had moved
      // since it decided anything, because the queue does not stop.
      pressure.textContent = outcome === 'pending'
        ? api.day.pressureSummary()
        : card.criteria === ''
          ? api.day.pressureSummary()
          : card.criteria;
      heading.textContent = scene.title;
      stamp.textContent = outcome === 'pending'
        ? 'Friday, three o\'clock. It has not happened yet.'
        : 'Friday, three o\'clock. It has happened.';
      line.textContent = scene.line;
      narration.textContent = scene.narration;
      reply.textContent = scene.reply;
      dismiss.textContent = scene.dismissLabel;
      note.textContent = outcome === 'fired'
        ? `He read the week as ${marked()}. The shift does not end early `
          + 'because of this. There are two hours left on it, and the queue '
          + 'has not been told.'
        : outcome === 'passed'
          ? `He read the week as ${marked()}. The probation is over, and `
            + 'whatever is in the fridge with your name on it is now, '
            + 'technically, yours.'
          : outcome === 'redundant'
            // The one verdict where the mark was not the problem, and the
            // window says so in the same breath as saying what happens next.
            // The fund is the joke this whole game is built on and it has
            // never once been theirs.
            ? `He read the week as ${marked()}, and that was not what `
              + 'decided it. The role goes, the notice is paid, the file '
              + 'stays in this building with the people who wrote it, and the '
              + 'fund is still yours.'
            : 'It is decided on one number, and the number is a percentage of '
            + 'the work: half of it is how much of what came in you closed, '
            + 'half is how much of it never went red. It has to reach '
            + `${String(REVIEW_PASS_PERFORMANCE)} out of 100 when he opens `
            + 'the folder - more if somebody has had a reason to open the '
            + 'other folder first - and it leans on how the week ended: '
            + 'yesterday counts double the day before it, and Monday is a '
            + 'rounding error by Friday.';
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
