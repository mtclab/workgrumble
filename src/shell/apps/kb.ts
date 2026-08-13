import {
  findKbArticle,
  type KbArticle,
  kbShelf,
  kbSlug,
} from '../../world/kb';
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
    /**
     * THE SHELF, not the corpus (E9, 0.36.0): what can be looked up in this
     * world, which is everything anybody wrote before you got here plus
     * anything you have written yourself. It is a function rather than a
     * constant because the second half moves - the senior rung's KB beat puts
     * an article on it mid-week - and a list captured at mount would leave the
     * player having written something they could not then read.
     */
    const shelf = (): readonly KbArticle[] => kbShelf(api.graph, api.actor);
    // Which article the player was on outlives the window: closing the KB to
    // get at the desktop is not the same as putting the article back.
    const selected = (): string => api.appState.get().kb.selectedId
      ?? shelf()[0]?.id
      ?? '';
    // A miss is about the intent that was just delivered, so it dies with the
    // window on purpose - there is nothing to come back to.
    let notice: string | null = null;

    const root = element('section', 'app-page kb-app', 'kb-app');

    const toolbar = element('div', 'kb-toolbar');
    const count = element('span', 'kb-count', 'kb-count');
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

      count.textContent = `${String(shelf().length)} articles`;

      for (const article of shelf()) {
        const item = element('li');
        const row = element(
          'button',
          'kb-row',
          `kb-row-${kbSlug(article.id)}`,
        );
        row.type = 'button';
        row.dataset.selected = String(article.id === selected());
        // On the row as well as in the reader: an unvalidated article is a
        // thing to know BEFORE opening it, which is the whole difference
        // between a shelf and a filing system.
        row.dataset.state = article.state;

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

    /** One named section of prose, heading and all. */
    const prose = (
      heading: string,
      testId: string,
      paragraphs: readonly string[],
    ): HTMLElement => {
      const section = element('section', 'kb-section', testId);
      const title = element('h3', 'kb-section-title');
      title.textContent = heading;
      section.append(title);

      for (const paragraph of paragraphs) {
        const line = element('p');
        line.textContent = paragraph;
        section.append(line);
      }

      return section;
    };

    /** The Resolution section: numbered, because the order is the content. */
    const steps = (resolution: readonly string[]): HTMLElement => {
      const section = element('section', 'kb-section', 'kb-resolution');
      const title = element('h3', 'kb-section-title');
      title.textContent = 'Resolution';
      const list = element('ol', 'kb-steps');

      for (const step of resolution) {
        const item = element('li');
        item.textContent = step;
        list.append(item);
      }

      section.append(title, list);
      return section;
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
      // The reference and the state are two facts and two elements: a test -
      // or a player - reading "kb/print-spoolerPublished" out of one line is
      // reading a sentence nobody wrote.
      const filing = element('div', 'kb-filing');
      const reference = element('p', 'kb-reference', 'kb-reference');
      reference.textContent = article.id;
      const state = element('span', 'kb-state', 'kb-state');
      state.dataset.state = article.state;
      state.textContent = article.state === 'draft'
        ? 'Draft - nobody has checked this'
        : 'Published';
      filing.append(reference, state);
      const summary = element('p', 'kb-summary', 'kb-summary');
      summary.textContent = article.summary;
      reader.append(heading, filing, summary);

      const body = element('div', 'kb-body', 'kb-body');
      // The four sections a real article is filed in, in the order a tech
      // reads them under a deadline: what it looks like, where, what to do,
      // and - once the fire is out - why.
      body.append(
        prose('Issue', 'kb-issue', [article.issue]),
        prose('Environment', 'kb-environment', [article.environment]),
        steps(article.resolution),
        prose('Cause', 'kb-cause', article.cause),
      );

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
