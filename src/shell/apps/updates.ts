import {
  CURRENT_VERSION,
  type ReleaseNote,
  releasesNewestFirst,
} from '../../world/releases';
import {
  ROADMAP,
  ROADMAP_PREAMBLE,
  type RoadmapItem,
} from '../../world/roadmap';
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

/**
 * A planned entry, rendered like an installed one so the two lists read as one
 * kind of thing - but marked as what it is: nothing installed, no version, no
 * date. `data-planned` and `data-installed="false"` are what the styling greys
 * it with and what a test reads to prove it is not being sold as done. The
 * items are keyed by position because they have no version to be keyed by - the
 * roadmap is an order of intent, not a set of releases.
 */
function plannedEntry(item: Readonly<RoadmapItem>, index: number): HTMLElement {
  const article = element(
    'article',
    'update-entry update-entry-planned',
    `updates-roadmap-entry-${String(index)}`,
  );
  article.dataset.installed = 'false';
  article.dataset.planned = 'true';

  const head = element('header', 'update-entry-head');
  const title = element('h3', undefined, `updates-roadmap-title-${String(index)}`);
  title.textContent = item.title;
  const tag = element('span', 'update-entry-planned-tag');
  tag.textContent = 'Planned';
  head.append(title, tag);

  const body = element(
    'p',
    'update-summary',
    `updates-roadmap-body-${String(index)}`,
  );
  body.textContent = item.body;

  article.append(head, body);
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

    // The other half of the same window: what has not been installed yet. It
    // reads `roadmap.ts` and nothing else, and it says out loud, before the
    // first item, that none of it has happened and none of it has a date.
    const planned = element('section', 'updates-planned', 'updates-roadmap');

    const plannedHead = element('header', 'updates-planned-head');
    const plannedHeading = element('h2', undefined, 'updates-roadmap-heading');
    plannedHeading.textContent = 'What is coming';
    const disclaimer = element(
      'p',
      'updates-planned-disclaimer',
      'updates-roadmap-preamble',
    );
    disclaimer.textContent = ROADMAP_PREAMBLE;
    plannedHead.append(plannedHeading, disclaimer);

    const plannedList = element('div', 'updates-list updates-planned-list');

    for (const [index, item] of ROADMAP.entries()) {
      plannedList.append(plannedEntry(item, index));
    }

    planned.append(plannedHead, plannedList);

    const actions = element('div', 'app-action-row');
    const report = osButton('Something here is broken', 'updates-report');
    report.title = 'Opens the form for telling the people who made this that '
      + 'it does not work.';
    actions.append(report);

    const onReport = (): void => {
      api.openApp('feedback');
    };

    report.addEventListener('click', onReport);

    root.append(masthead, notes, planned, actions);
    host.replaceChildren(root);

    return {
      unmount: (): void => {
        report.removeEventListener('click', onReport);
        root.remove();
      },
    };
  },
};
