import {
  latestTick,
  type MailContent,
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
    /**
     * The inbox: the authored threads, plus the ones the invoice ladder DERIVES
     * (0.30.0, slice 2).
     *
     * The second list is not stored anywhere. A customer's thread exists
     * because a rung has been handed over, and its words are a function of the
     * rung, the customer and the sheet as it currently stands - which is how
     * the itemised breakdown in it can be the real derivation printed out loud
     * rather than a copy of it written down at the time.
     *
     * Empty in every world where nobody padded anything, which is why the inbox
     * is byte-identical for every week that has been played so far.
     *
     * Both halves are THIS building's post. The authored threads are filtered
     * to the employer this session stood up; the derived ones are built out of
     * this world's own customers and sheet, so they could never have been
     * anybody else's.
     */
    const inbox = (): readonly MailContent[] => [
      ...visibleMail(api.graph, api.employer),
      ...api.day.invoiceMail(),
    ];
    const unreadCount = (): number => inbox().filter(
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
    const threads = (): readonly MailContent[] => [...inbox()]
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

    const renderReader = (thread: MailContent | undefined): void => {
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
        + `${String(inbox().length)} threads`;
      renderRequests();
      renderList();
      // Out of the INBOX, and only out of the inbox. It used to ask the whole
      // content file first, which would happily hand back a thread this world
      // does not hold - one belonging to another employer, or a gated one that
      // has not arrived - and draw it under a list that does not list it. A
      // save carries the selection, so that is a real door, not a hypothetical.
      renderReader(
        selectedId === null
          ? undefined
          : inbox().find((thread) => thread.id === selectedId),
      );
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
