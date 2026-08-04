import {
  findMailThread,
  latestTick,
  type MailThread,
  mailKey,
  messageTick,
  visibleMail,
} from '../../world/mail';
import { FIELDS } from '../../world/fields';
import { formatSimTime } from '../clock-format';
import { requestCard } from './request-card';
import type { AppDef, AppInstance, GameApi } from './types';
import { element, textValue } from './ui';

function senderName(api: GameApi, personId: string): string {
  return textValue(api.graph.getField(personId, FIELDS.name), personId);
}

/**
 * The inbox. Read-only on purpose: mail is where the company talks AT you -
 * onboarding it forgot to give you, and a lead who would rather nag than file
 * a ticket. Nothing here changes the world, so nothing here dispatches.
 */
export const MAIL_APP: AppDef = {
  id: 'mail',
  title: 'Mail',
  icon: 'icon-mail',
  tier_required: 1,
  slack: false,
  mount: (host, api): AppInstance => {
    // Read and selected both outlive the window. An inbox that forgets what
    // was read the moment it is closed is an inbox nobody can work through -
    // and the save carries this for the same reason.
    const state = (): { selectedId: string | null; read: readonly string[] } =>
      api.appState.get().mail;
    const isUnread = (id: string): boolean => !state().read.includes(id);
    const unreadCount = (): number => visibleMail(api.graph).filter(
      (thread) => isUnread(thread.id),
    ).length;

    const root = element('section', 'app-page mail-app', 'mail-app');

    const toolbar = element('div', 'mail-toolbar');
    const summary = element('span', 'mail-summary', 'mail-summary');
    const note = element('span', 'mail-note');
    note.textContent = 'No reply button. Nobody here has ever been persuaded '
      + 'by one.';
    toolbar.append(summary, note);

    // The cross-post strip: a request that also arrived in a room and a chat,
    // shown at the top of the inbox so it can be converted or answered from
    // here too, and so the player sees it is the same request (0.5.0 slice 2).
    // It is time-sensitive - it arrives on a minute and can be resolved
    // elsewhere - so, unlike the read-only inbox below it, it repaints on the
    // clock and on world changes, with its own signature so it is not rebuilt
    // under a cursor for nothing.
    const requests = element('div', 'mail-requests', 'mail-requests');
    let paintedRequests: string | null = null;

    const renderRequests = (): void => {
      const live = api.day.liveRequests();
      const signature = JSON.stringify(
        live.map((request) => [request.id, request.resolvedAs]),
      );

      if (signature === paintedRequests) {
        return;
      }

      paintedRequests = signature;
      requests.replaceChildren();

      for (const request of live) {
        requests.append(requestCard(api, request, 'mail'));
      }
    };

    const list = element('ul', 'mail-list', 'mail-list');
    const reader = element('section', 'mail-reader', 'mail-reader');
    const columns = element('div', 'mail-columns');
    columns.append(list, reader);
    root.append(toolbar, requests, columns);

    /** Newest traffic at the top, the way every inbox has always sorted. */
    const threads = (): readonly MailThread[] => [...visibleMail(api.graph)]
      .sort(
        (left, right) => latestTick(right, api.graph)
          - latestTick(left, api.graph),
      );

    const renderList = (): void => {
      list.replaceChildren();

      for (const thread of threads()) {
        const item = element('li');
        const row = element(
          'button',
          'mail-row',
          `mail-row-${mailKey(thread.id)}`,
        );
        row.type = 'button';
        row.dataset.selected = String(thread.id === state().selectedId);
        row.dataset.unread = String(isUnread(thread.id));

        const subject = element('strong');
        subject.textContent = thread.subject;
        const from = element('span', 'mail-row-from');
        from.textContent = senderName(
          api,
          thread.messages[0]?.from ?? 'person:unknown',
        );
        const stamp = element('span', 'mail-row-time');
        stamp.textContent = formatSimTime(latestTick(thread, api.graph)).time;

        row.append(subject, from, stamp);
        row.addEventListener('click', () => {
          const { read } = state();
          api.appState.patch('mail', {
            selectedId: thread.id,
            read: read.includes(thread.id) ? read : [...read, thread.id],
          });
          render();
        });
        item.append(row);
        list.append(item);
      }
    };

    const renderReader = (thread: MailThread | undefined): void => {
      reader.replaceChildren();

      if (thread === undefined) {
        const empty = element('p', 'mail-placeholder', 'mail-empty');
        empty.textContent = 'Pick a message. One of them is about the queue, '
          + 'twice, and one of them is about a kettle.';
        reader.append(empty);
        return;
      }

      const heading = element('h2', undefined, 'mail-subject');
      heading.textContent = thread.subject;
      reader.append(heading);

      for (const message of thread.messages) {
        // One test id per message, not one shared by all of them: a locator
        // that matches three articles is a locator nothing can assert on.
        const key = mailKey(message.id).replace('#', '-');
        const entry = element('article', 'mail-message', `mail-message-${key}`);
        const head = element('div', 'mail-message-head');
        const from = element('strong', undefined, `mail-message-from-${key}`);
        from.textContent = senderName(api, message.from);
        const stamp = element('time', undefined, `mail-message-time-${key}`);
        const display = formatSimTime(
          messageTick(thread, message.tick, api.graph),
        );
        stamp.textContent = `${display.day} · ${display.time}`;
        stamp.setAttribute('aria-label', display.accessible);
        head.append(from, stamp);
        entry.append(head);

        for (const paragraph of message.body) {
          const line = element('p');
          line.textContent = paragraph;
          entry.append(line);
        }

        reader.append(entry);
      }
    };

    const render = (): void => {
      const { selectedId } = state();
      summary.textContent = `${String(unreadCount())} unread · `
        + `${String(visibleMail(api.graph).length)} threads`;
      renderRequests();
      renderList();
      renderReader(selectedId === null ? undefined : findMailThread(selectedId));
    };

    host.replaceChildren(root);
    render();

    // A load replaces what every app was showing, and nothing else says so.
    const unsubscribeState = api.appState.onReplaced(() => {
      paintedRequests = null;
      render();
    });
    // The inbox itself is read-only and does not repaint on the clock; the
    // cross-post strip is the one live thing on this surface, so it - and only
    // it - repaints on the tick it arrives on and on the world change a
    // resolution elsewhere dispatches.
    const unsubscribeTick = api.clock.onTick(() => {
      renderRequests();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      renderRequests();
    });

    return {
      unmount: (): void => {
        unsubscribeState();
        unsubscribeTick();
        unsubscribeWorld();
        root.remove();
      },
    };
  },
};
