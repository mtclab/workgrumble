import type { ReleaseNote } from '../world/releases';

/**
 * The changelog on screen: one entry builder shared by the title screen's
 * "What's new" panel and the Update History app, so the two cannot drift into
 * saying the same release two different ways. The rules for WHICH notes are
 * new live in `releases.ts`, where they can be tested without a page.
 */

/** One release: version and date, the summary, a bullet per change. */
export function releaseEntry(note: Readonly<ReleaseNote>): HTMLElement {
  const article = document.createElement('article');
  article.className = 'rel-entry';
  article.setAttribute('data-testid', `release-${note.version}`);

  const head = document.createElement('header');
  head.className = 'rel-head';
  const version = document.createElement('h4');
  version.textContent = `Update ${note.version}`;
  const stamp = document.createElement('time');
  stamp.dateTime = note.date;
  stamp.textContent = note.date;
  head.append(version, stamp);

  const summary = document.createElement('p');
  summary.className = 'rel-summary';
  summary.textContent = note.summary;

  const list = document.createElement('ul');
  list.className = 'rel-lines';
  for (const text of note.lines) {
    const item = document.createElement('li');
    item.textContent = text;
    list.append(item);
  }

  article.append(head, summary, list);
  return article;
}

/**
 * The "What's new" panel, laid over a corner of the title screen.
 *
 * It does not block the title's own buttons: somebody who wants to get on
 * with it can press New career straight through it. Closing it is the button,
 * Enter or Esc. The key listener is on the window in the capture phase so the
 * key that closes the panel does nothing else on the way (a menu that answers
 * Enter would otherwise also pick whatever button it had selected), and it
 * takes itself off the moment the panel is gone - closed, or swept away with
 * the rest of the title when another screen replaces it.
 */
export function showWhatsNew(host: HTMLElement, notes: readonly ReleaseNote[]): void {
  if (notes.length === 0) return;

  const panel = document.createElement('section');
  panel.className = 'whats-new';
  panel.setAttribute('data-testid', 'whats-new');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'What\'s new');

  const heading = document.createElement('h3');
  heading.textContent = 'What\'s new';
  const lede = document.createElement('p');
  lede.className = 'whats-new-lede';
  lede.textContent = 'Installed since you were last in. Update History, on '
    + 'any desk and in the backpack, keeps the lot.';

  const list = document.createElement('div');
  list.className = 'whats-new-list';
  for (const note of notes) list.append(releaseEntry(note));

  const ok = document.createElement('button');
  ok.className = 'screen-btn whats-new-ok';
  ok.textContent = 'Noted';

  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    panel.remove();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!panel.isConnected) {
      window.removeEventListener('keydown', onKey, true);
      return;
    }
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  };
  ok.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });

  panel.append(heading, lede, list, ok);
  host.append(panel);
  window.addEventListener('keydown', onKey, true);
}
