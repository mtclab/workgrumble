import { findKbArticle, type KbArticle, kbSlug, WORLD_KB } from '../../world/kb';
import type { AppDef, AppInstance, AppIntent } from './types';
import { element, osButton } from './ui';

/**
 * The KB wiki: the learner path made visible. Every fix the player can make
 * has an article that explains what the thing actually is, and the two
 * evergreen ones exist because "turn it off and on again" deserves a straight
 * answer rather than a smirk.
 *
 * It reads no world state at all - articles are content, and a ticket links
 * to one by the `kb_ref` it already carries.
 */
export const KB_APP: AppDef = {
  id: 'kb',
  title: 'Knowledge Base',
  icon: 'icon-kb',
  tier_required: 1,
  slack: false,
  mount: (host, api): AppInstance => {
    // Which article the player was on outlives the window: closing the KB to
    // get at the desktop is not the same as putting the article back.
    const selected = (): string => api.appState.get().kb.selectedId
      ?? WORLD_KB[0]?.id
      ?? '';
    // A miss is about the intent that was just delivered, so it dies with the
    // window on purpose - there is nothing to come back to.
    let notice: string | null = null;

    const root = element('section', 'app-page kb-app', 'kb-app');

    const toolbar = element('div', 'kb-toolbar');
    const count = element('span', 'kb-count', 'kb-count');
    count.textContent = `${String(WORLD_KB.length)} articles`;
    const note = element('span', 'kb-note');
    note.textContent = 'Written by people who had to fix it at the time.';
    toolbar.append(count, note);

    const list = element('ul', 'kb-list', 'kb-list');
    const reader = element('article', 'kb-reader', 'kb-reader');
    const columns = element('div', 'kb-columns');
    columns.append(list, reader);
    root.append(toolbar, columns);

    const select = (id: string): void => {
      api.appState.patch('kb', { selectedId: id });
      notice = null;
      render();
    };

    const renderList = (): void => {
      list.replaceChildren();

      for (const article of WORLD_KB) {
        const item = element('li');
        const row = element(
          'button',
          'kb-row',
          `kb-row-${kbSlug(article.id)}`,
        );
        row.type = 'button';
        row.dataset.selected = String(article.id === selected());

        const title = element('strong');
        title.textContent = article.title;
        const summary = element('span', 'kb-row-summary');
        summary.textContent = article.summary;
        row.append(title, summary);
        row.addEventListener('click', () => {
          select(article.id);
        });
        item.append(row);
        list.append(item);
      }
    };

    const renderReader = (article: KbArticle | undefined): void => {
      reader.replaceChildren();

      // A miss replaces the page rather than sitting on top of the last one:
      // "nothing is filed under X" printed above an unrelated article reads
      // as if THAT article is the miss.
      if (notice !== null) {
        const missing = element('p', 'app-refusal', 'kb-notice');
        missing.textContent = notice;
        reader.append(missing);
        return;
      }

      if (article === undefined) {
        const empty = element('p', 'kb-placeholder', 'kb-empty');
        empty.textContent = 'Pick an article on the left. They are short, and '
          + 'they are shorter than the ticket you are avoiding.';
        reader.append(empty);
        return;
      }

      const heading = element('h2', undefined, 'kb-title');
      heading.textContent = article.title;
      const reference = element('p', 'kb-reference', 'kb-reference');
      reference.textContent = article.id;
      const summary = element('p', 'kb-summary', 'kb-summary');
      summary.textContent = article.summary;
      reader.append(heading, reference, summary);

      const body = element('div', 'kb-body', 'kb-body');

      for (const paragraph of article.body) {
        const line = element('p');
        line.textContent = paragraph;
        body.append(line);
      }

      reader.append(body);

      if (article.see_also.length > 0) {
        const related = element('div', 'kb-see-also', 'kb-see-also');
        const label = element('span', 'kb-see-also-label');
        label.textContent = 'See also';
        related.append(label);

        for (const reference of article.see_also) {
          const target = findKbArticle(reference);

          if (target === undefined) {
            continue;
          }

          const link = osButton(
            target.title,
            `kb-see-also-${kbSlug(reference)}`,
            { compact: true },
          );
          link.addEventListener('click', () => {
            select(reference);
          });
          related.append(link);
        }

        reader.append(related);
      }
    };

    const render = (): void => {
      renderList();
      renderReader(findKbArticle(selected()));
    };

    host.replaceChildren(root);
    render();

    // A load replaces what every app was showing, and nothing else says so.
    const unsubscribeState = api.appState.onReplaced(() => {
      notice = null;
      render();
    });

    return {
      receiveIntent: (intent: AppIntent): void => {
        if (intent.kind !== 'kb-article') {
          return;
        }

        if (findKbArticle(intent.ref) === undefined) {
          // Honest about the miss instead of silently showing the wrong page:
          // the list is still there, so the player is not stranded.
          notice = `Nothing is filed under "${intent.ref}". Somebody was `
            + 'going to write it up, and then Friday happened.';
          render();
          return;
        }

        select(intent.ref);
      },
      unmount: (): void => {
        unsubscribeState();
        root.remove();
      },
    };
  },
};
