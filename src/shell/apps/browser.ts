import { BOSS_KEY_LABEL } from '../keys';
import { createIcon } from '../icons';
import {
  BROWSER_SITES,
  type BrowserSite,
  browserSite,
  type ForumSite,
  type GallerySite,
} from './browser-sites';
import type { AppDef, AppInstance, GameApi } from './types';
import { element, osButton } from './ui';

/**
 * The Browser: two sites, both bookmarked, neither of them work.
 *
 * It is a slack app, which is the only thing about it the simulation knows: a
 * window with `slack: true` drains stress while it is genuinely on screen,
 * builds suspicion at its own rate, hides on the boss key, and is what the
 * lead sees if he arrives while it is up. The pages themselves are content -
 * text and line art from this repo, no network, no address bar you can type
 * into, because a browser in a game about work is a joke about work.
 */

function renderForum(page: Readonly<ForumSite>): HTMLElement {
  const root = element('article', 'browser-forum', 'browser-forum');
  const board = element('p', 'browser-crumbs');
  board.textContent = page.board;
  const heading = element('h2', undefined, 'browser-forum-heading');
  heading.textContent = page.heading;
  root.append(board, heading);

  const thread = element('ol', 'browser-thread', 'browser-thread');

  for (const post of page.posts) {
    const item = element('li', 'browser-post');
    const head = element('div', 'browser-post-head');
    const author = element('strong');
    author.textContent = post.author;
    const when = element('span', 'browser-post-when');
    when.textContent = post.when;
    head.append(author, when);
    item.append(head);

    for (const paragraph of post.body) {
      const line = element('p');
      line.textContent = paragraph;
      item.append(line);
    }

    if (post.signature !== undefined) {
      const signature = element('p', 'browser-signature');
      signature.textContent = `-- ${post.signature}`;
      item.append(signature);
    }

    thread.append(item);
  }

  const footer = element('p', 'browser-footer', 'browser-forum-footer');
  footer.textContent = page.footer;
  root.append(thread, footer);
  return root;
}

function renderGallery(page: Readonly<GallerySite>): HTMLElement {
  const root = element('article', 'browser-gallery', 'browser-gallery');
  const heading = element('h2', 'browser-gallery-heading');
  heading.textContent = page.heading;
  const tagline = element('p', 'browser-tagline');
  tagline.textContent = page.tagline;
  root.append(heading, tagline);

  const grid = element('ul', 'browser-grid', 'browser-grid');

  for (const picture of page.pictures) {
    const item = element('li', 'browser-picture');
    const frame = element('div', 'browser-frame');
    const art = createIcon(picture.icon);
    art.classList.add('svg-icon-lg');
    art.setAttribute('role', 'img');
    art.setAttribute('aria-label', picture.alt);
    art.removeAttribute('aria-hidden');
    frame.append(art);
    const caption = element('p');
    caption.textContent = picture.caption;
    item.append(frame, caption);
    grid.append(item);
  }

  const hits = element('p', 'browser-hits', 'browser-hits');
  hits.textContent = `You are visitor ${page.hits.toLocaleString('en-GB')}.`;
  const footer = element('p', 'browser-footer', 'browser-gallery-footer');
  footer.textContent = page.footer;

  root.append(grid, hits, footer);
  return root;
}

function renderHome(): HTMLElement {
  const root = element('article', 'browser-home', 'browser-home');
  const heading = element('h2');
  heading.textContent = 'Bookmarks';
  const note = element('p', 'browser-tagline');
  note.textContent = 'Two of them. There is no address bar, because there is '
    + 'no internet in here and there never was.';
  const list = element('ul', 'browser-home-list');

  for (const site of BROWSER_SITES) {
    const item = element('li');
    const line = element('p');
    line.textContent = `${site.title} - ${site.url}`;
    item.append(line);
    list.append(item);
  }

  root.append(heading, note, list);
  return root;
}

function renderPage(site: BrowserSite | undefined): HTMLElement {
  if (site === undefined) {
    return renderHome();
  }

  return site.page.kind === 'forum'
    ? renderForum(site.page)
    : renderGallery(site.page);
}

export const BROWSER_APP: AppDef = {
  id: 'browser',
  title: 'Browser',
  icon: 'icon-browser',
  tier_required: 1,
  slack: true,
  mount: (host, api: GameApi): AppInstance => {
    const site = (): string | null => api.appState.get().browser.siteId;
    const goTo = (id: string | null): void => {
      api.appState.patch('browser', { siteId: id });
      render();
    };

    const root = element('section', 'app-page browser-app', 'browser-app');

    const toolbar = element('div', 'browser-toolbar');
    const home = osButton('Bookmarks', 'browser-home-button', {
      compact: true,
    });
    home.addEventListener('click', () => {
      goTo(null);
    });
    toolbar.append(home);

    const buttons = new Map<string, HTMLButtonElement>();

    for (const entry of BROWSER_SITES) {
      const button = osButton(entry.title, `browser-site-${entry.id}`, {
        compact: true,
      });
      button.addEventListener('click', () => {
        goTo(entry.id);
      });
      buttons.set(entry.id, button);
      toolbar.append(button);
    }

    const address = element('span', 'browser-address', 'browser-address');
    const tip = element('span', 'browser-tip');
    tip.textContent = `Panic key: ${BOSS_KEY_LABEL}`;
    toolbar.append(address, tip);

    const viewport = element('div', 'browser-viewport', 'browser-viewport');
    root.append(toolbar, viewport);

    const render = (): void => {
      const current = browserSite(site());
      address.textContent = current?.url ?? 'about:bookmarks';
      root.dataset.site = current?.id ?? 'home';

      for (const [id, button] of buttons) {
        button.dataset.active = String(id === current?.id);
        button.setAttribute('aria-pressed', String(id === current?.id));
      }

      viewport.replaceChildren(renderPage(current));
      viewport.scrollTop = 0;
    };

    host.replaceChildren(root);
    render();

    // A load replaces which page was open along with everything else.
    const unsubscribeState = api.appState.onReplaced(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeState();
        root.remove();
      },
    };
  },
};
