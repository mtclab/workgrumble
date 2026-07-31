import { BEER_AFTERMATH, BEER_SCENE } from '../../world/scenes';
import { FIELDS } from '../../world/fields';
import { createIcon } from '../icons';
import type { AppDef, AppInstance, GameApi } from './types';
import { element, osButton, setAvailability } from './ui';

/**
 * The beer, which has been visible and locked since Monday morning.
 *
 * The window is the payoff for a week of tooltip. It has one button, and the
 * button dispatches: the bottle is a consumable like the cans, the engine
 * decides whether it is allowed - the lock is a field only a review that went
 * the right way turns on - and what comes back is either the second half of
 * the scene or a sentence explaining why not.
 */
export const BEER_APP: AppDef = {
  id: 'beer',
  title: 'The fridge',
  icon: 'icon-beer',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api: GameApi): AppInstance => {
    const root = element('section', 'app-page caught-app beer-app', 'beer-app');

    const head = element('div', 'caught-head');
    const portrait = element('div', 'caught-portrait');
    portrait.append(createIcon('icon-beer'));
    const heading = element('h2', undefined, 'beer-heading');
    const copy = element('div', 'caught-head-copy');
    copy.append(heading);
    head.append(portrait, copy);

    const line = element('blockquote', 'caught-line', 'beer-line');
    const narration = element('p', 'caught-narration', 'beer-narration');
    const reply = element('p', 'caught-reply', 'beer-reply');

    const footer = element('div', 'caught-footer');
    const action = osButton('Open it', 'beer-open', { primary: true });
    const note = element('p', 'caught-note', 'beer-note');
    footer.append(action, note);

    root.append(head, line, narration, reply, footer);

    const read = (field: string): unknown => api.graph.getField(api.actor, field);
    const opened = (): boolean => read(FIELDS.beerOpened) === true;
    const unlocked = (): boolean => read(FIELDS.beerUnlocked) === true;

    action.addEventListener('click', () => {
      if (opened()) {
        api.closeApp('beer');
        return;
      }

      const outcome = api.day.beer();

      if (!outcome.ok) {
        api.notify('Not yet', outcome.reason);
        return;
      }

      render();
    });

    function render(): void {
      const done = opened();
      const scene = done ? BEER_AFTERMATH : BEER_SCENE;

      root.dataset.opened = String(done);
      heading.textContent = scene.title;
      line.textContent = scene.line;
      narration.textContent = scene.narration;
      reply.textContent = scene.reply;
      action.textContent = scene.dismissLabel;
      setAvailability(
        action,
        done || unlocked()
          ? null
          : 'Not during probation. It is in the fridge with your name on it, '
            + 'which is somehow worse.',
      );
      note.textContent = done
        ? 'It goes on the desk with the cans. Somebody clears them overnight '
          + 'and says nothing, which is the other thing this building is '
          + 'quietly good at.'
        : 'It takes most of a week off the stress meter and puts a bottle on '
          + 'the desk of a man whose lead has already gone home.';
    }

    host.replaceChildren(root);
    render();

    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeWorld();
        root.remove();
      },
    };
  },
};
