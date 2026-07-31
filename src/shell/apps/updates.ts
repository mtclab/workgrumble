import {
  CURRENT_VERSION,
  type ReleaseNote,
  releasesNewestFirst,
} from '../../world/releases';
import { createIcon } from '../icons';
import { element, osButton } from './ui';
import type { AppDef, GameApi } from './types';

/**
 * Update history: what the workstation installed overnight, and what it says
 * it was for.
 *
 * The same window twice over. It is put up by the shell on the first boot of a
 * newer build - "DeskPro WorkGroup Update 0.1.0 has been installed" - and it
 * is in the start menu and on the desktop for ever afterwards, because a
 * changelog you can only read once is a changelog nobody has read.
 *
 * It reads `releases.ts` and nothing else. There is no state here and nothing
 * to remember: the list is the same list every time, and which of it is NEW is
 * a question the boot answered before this window existed.
 */
function entry(note: Readonly<ReleaseNote>, installed: boolean): HTMLElement {
  const article = element('article', 'update-entry', `updates-entry-${note.version}`);
  article.dataset.installed = String(installed);

  const head = element('header', 'update-entry-head');
  const version = element('h3', undefined, `updates-version-${note.version}`);
  version.textContent = `Update ${note.version}`;
  const stamp = element('time');
  stamp.dateTime = note.date;
  stamp.textContent = note.date;
  head.append(version, stamp);

  const summary = element('p', 'update-summary', `updates-summary-${note.version}`);
  summary.textContent = note.summary;

  const list = element('ul', 'update-lines');

  for (const text of note.lines) {
    const item = element('li', undefined, 'updates-line');
    item.textContent = text;
    list.append(item);
  }

  article.append(head, summary, list);
  return article;
}

export const UPDATES_APP: AppDef = {
  id: 'updates',
  title: 'Update History',
  icon: 'icon-update',
  tier_required: 0,
  slack: false,
  mount: (host, api: GameApi) => {
    const root = element('section', 'app-page updates-app', 'updates-app');

    const masthead = element('header', 'updates-masthead');
    const mark = element('span', 'updates-mark');
    const markIcon = createIcon('icon-update');
    markIcon.classList.add('svg-icon-lg');
    mark.append(markIcon);
    const copy = element('div');
    const heading = element('h2', undefined, 'updates-installed');
    heading.textContent = `DeskPro WorkGroup Update ${CURRENT_VERSION} has `
      + 'been installed.';
    const subheading = element('p');
    subheading.textContent = 'No restart is required. There was no restart '
      + 'available.';
    copy.append(heading, subheading);
    masthead.append(mark, copy);

    const notes = element('div', 'updates-list');

    for (const [index, note] of releasesNewestFirst().entries()) {
      notes.append(entry(note, index === 0));
    }

    const actions = element('div', 'app-action-row');
    const report = osButton('Something here is broken', 'updates-report');
    report.title = 'Opens the form for telling the people who made this that '
      + 'it does not work.';
    actions.append(report);

    const onReport = (): void => {
      api.openApp('feedback');
    };

    report.addEventListener('click', onReport);

    root.append(masthead, notes, actions);
    host.replaceChildren(root);

    return {
      unmount: (): void => {
        report.removeEventListener('click', onReport);
        root.remove();
      },
    };
  },
};
