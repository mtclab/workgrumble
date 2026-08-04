import type { ReadOnlyGraphNode } from '../../engine-api';
import {
  type ChannelMessage,
  CHANNELS,
  channelById,
} from '../../world/channels';
import { FIELDS } from '../../world/fields';
import { PRESENCE_LABELS, readPresence } from '../../world/presence';
import type { LinkedRequest } from '../../world/requests';
import { ticketTitle } from '../../world/tickets';
import { channelFeedThrough } from '../../world/week';
import type { HubbubState } from '../app-state';
import { formatSimTime } from '../clock-format';
import {
  channelFeed,
  type ChannelRowModel,
  channelRows,
  readAfterOnScreen,
  threadBlocks,
  totalUnread,
} from './hubbub-model';
import { requestActions } from './request-card';
import type { AppDef, AppInstance } from './types';
import {
  element,
  type KeyedRow,
  KeyedRows,
  nodeKey,
  osButton,
  setFlag,
  setText,
  textValue,
  withFocusRestored,
} from './ui';

/** This app's id, worn by the window the read ledger asks about being on screen. */
const HUBBUB_ID = 'hubbub';

export function channelKey(id: string): string {
  return nodeKey(id);
}

export function messageKey(id: string): string {
  return nodeKey(id);
}

/**
 * Hubbub: the channel client the company rolled out, and nobody asked.
 *
 * The third way a request reaches the desk, after the inbox and the 1:1 chat
 * - and the first one that is a BROADCAST surface: named rooms, threads under
 * messages, an @ that will not shut up about itself, and a per-room unread
 * badge. It ships on the base manifest rather than the web store because that
 * is the joke and the truth: an enterprise chat tool is not something anybody
 * installs, it is something that happens to a company.
 *
 * What this window does NOT do, on purpose, in slice 1 of 0.5.0:
 *
 * - It does not write. There is no composer; the rooms are read-only until
 *   slice 2, whose whole mechanic is what answering in the wrong place costs.
 *   A reply box shipped now would prejudge that design with a dead control.
 * - It does not dispatch. Everything on screen is a READING - the week's
 *   channel table (`src/world/channels.ts`) against the clock, plus the
 *   shell-owned read ledger - so a scripted walk that never opens this window
 *   leaves the world hash exactly where it was.
 * - It does not price attention. The badge is a number in a room; making the
 *   pile of them cost something is slice 3, decided where the meters are.
 *
 * The presence dot here is the taskbar's dot, read from the same field of the
 * same node: one dot, everyone reads it, this room included. Whether a
 * channel-source arrival should dodge a red dot the way a chat-source one
 * does is slice 3's question; nothing in this window arrives AT the player,
 * so in slice 1 there is nothing for the dot to turn away.
 */
export const HUBBUB_APP: AppDef = {
  id: HUBBUB_ID,
  title: 'Hubbub',
  icon: 'icon-hubbub',
  tier_required: 1,
  slack: false,
  mount: (host, api): AppInstance => {
    const rooms = (): HubbubState => api.appState.get().hubbub;

    const root = element('section', 'app-page hubbub-app', 'hubbub-app');

    const toolbar = element('div', 'hubbub-toolbar');
    const summary = element('span', 'hubbub-summary', 'hubbub-summary');
    // The dot, worn here the way the taskbar wears it: read, never set. The
    // control that CHANGES it stays on the tray, because two writers for one
    // status is how a status becomes two.
    const presence = element('span', 'hubbub-presence', 'hubbub-presence');
    const presenceDot = element('span', 'presence-dot');
    const presenceLabel = element('span', 'hubbub-presence-label');
    presence.append(presenceDot, presenceLabel);
    const note = element('span', 'hubbub-note');
    note.textContent = 'Rolled out Monday. Nobody asked.';
    toolbar.append(summary, presence, note);

    const channels = element('ul', 'hubbub-channels', 'hubbub-channels');
    const pane = element('section', 'hubbub-pane', 'hubbub-pane');
    const columns = element('div', 'hubbub-columns');
    columns.append(channels, pane);
    root.append(toolbar, columns);

    /** The room on screen, defaulting to the first one the rollout made. */
    const selectedChannel = (): string => {
      const picked = rooms().selectedChannel;
      return picked !== null && channelById(picked) !== undefined
        ? picked
        : CHANNELS[0]?.id ?? '';
    };

    /**
     * The one write this window makes: what has been ON SCREEN is read.
     *
     * Called from the pane paint rather than from the click handler, because
     * the paint is the fact the ledger records - a message that arrives into
     * the room the player is already looking at has been seen the minute it
     * is drawn, and a badge that disagreed with a transcript beside it would
     * be a badge lying about the screen it is on.
     *
     * "On screen" is the whole of it, and a MINIMIZED window is not: minimizing
     * hides a still-mounted window that goes on painting on every tick, so a
     * message that lands in the selected room while Hubbub is minimized would be
     * marked read by a window nobody is looking at - clearing its badge and, worse,
     * clearing it before the meter tick that bills it, reading the sprawl away for
     * free. `readAfterOnScreen` asks the shell's own window list whether this
     * window is genuinely up before it records anything, and answers the same
     * array when nothing is new or when the window is hidden - so this writes
     * nothing on the repaints that changed nothing, and `patch` does not announce,
     * so there is no repaint loop to have.
     */
    const markSeen = (seen: readonly ChannelMessage[]): void => {
      const before = rooms().read;
      const after = readAfterOnScreen(
        before,
        seen,
        api.appState.get().windows,
        HUBBUB_ID,
      );

      if (after !== before) {
        api.appState.patch('hubbub', { read: after });
      }
    };

    const select = (channelId: string): void => {
      api.appState.patch('hubbub', { selectedChannel: channelId });
      render();
    };

    const authorName = (id: string): string => {
      const person: ReadOnlyGraphNode | undefined = api.graph.getNode(id);
      return person === undefined
        ? id
        : textValue(person.fields[FIELDS.name], id);
    };

    const createChannelRow = (
      first: Readonly<ChannelRowModel>,
    ): KeyedRow<ChannelRowModel, HTMLLIElement> => {
      const item = element('li');
      const row = element(
        'button',
        'hubbub-channel',
        `hubbub-channel-${channelKey(first.id)}`,
      );
      row.type = 'button';

      const name = element('strong');
      const topic = element('span', 'hubbub-channel-topic');
      // The badge is part of the row rather than something appended when it
      // applies, for the same reason the chat flag is: a row that grows a
      // child is a row that has to be rebuilt, and an empty badge saying
      // nothing is the truth about a read room.
      const badge = element(
        'span',
        'hubbub-badge',
        `hubbub-badge-${channelKey(first.id)}`,
      );
      row.append(name, topic, badge);

      row.addEventListener('click', () => {
        select(first.id);
      });
      item.append(row);

      return {
        element: item,
        update: (next: Readonly<ChannelRowModel>): void => {
          setFlag(row, 'selected', String(next.selected));
          setFlag(row, 'mention', String(next.mention));
          setText(name, next.name);
          setText(topic, next.topic);
          setText(
            badge,
            next.unread > 0
              ? String(next.unread) + (next.mention ? ' @' : '')
              : '',
          );
          badge.hidden = next.unread === 0;
        },
      };
    };

    const channelList = new KeyedRows<ChannelRowModel, HTMLLIElement>(
      channels,
      (model) => model.id,
      createChannelRow,
    );

    /**
     * The pane is rebuilt only when what it SAYS has changed - same rule and
     * same shape as the chat panel, for the same reason: the clock ticks every
     * simulated minute and almost every tick changes nothing in here.
     */
    let painted: string | null = null;

    // The requests live this minute, held so `messageEntry` can hang the
    // convert / answer / deflect bar off a message that carries one. Set on
    // every render, before the pane is modelled, so the bar and the badge never
    // disagree about the same request.
    let liveRequests: readonly LinkedRequest[] = [];

    const requestFor = (id: string | null): LinkedRequest | undefined => (
      id === null
        ? undefined
        : liveRequests.find((request) => request.id === id)
    );

    const renderPane = (
      channelId: string,
      inRoom: readonly ChannelMessage[],
    ): void => {
      const channel = channelById(channelId);
      // The resolution of any request in the room is part of what the pane
      // SAYS - a converted request draws a different bar from a live one - so it
      // is in the signature, or the pane would never repaint when a copy is
      // resolved and the bar would sit on its buttons after the fact.
      const resolutions = inRoom.map((message) => [
        message.request,
        requestFor(message.request)?.resolvedAs ?? null,
      ]);
      const signature = JSON.stringify({ channelId, inRoom, resolutions });

      if (signature === painted) {
        return;
      }

      painted = signature;
      pane.replaceChildren();

      if (channel === undefined) {
        return;
      }

      const head = element('div', 'hubbub-head');
      const heading = element('h2', undefined, 'hubbub-heading');
      heading.textContent = channel.name;
      const topic = element('span', 'hubbub-topic', 'hubbub-topic');
      topic.textContent = channel.topic;
      head.append(heading, topic);
      pane.append(head);

      if (inRoom.length === 0) {
        const empty = element('p', 'hubbub-empty', 'hubbub-empty');
        empty.textContent = 'Nothing has happened in here yet, which the '
          + 'rollout mail called momentum waiting to happen.';
        pane.append(empty);
        return;
      }

      const threads = element('ol', 'hubbub-threads', 'hubbub-threads');

      for (const block of threadBlocks(inRoom)) {
        const thread = element(
          'li',
          'hubbub-thread',
          `hubbub-thread-${messageKey(block.root.id)}`,
        );
        thread.append(messageEntry(block.root));

        if (block.replies.length > 0) {
          const replies = element('ul', 'hubbub-replies');

          for (const reply of block.replies) {
            const item = element('li');
            item.append(messageEntry(reply));
            replies.append(item);
          }

          thread.append(replies);
        }

        threads.append(thread);
      }

      pane.append(threads);
      // Pinned to the newest thread after a rebuild, and only then - the same
      // scroll manners as the chat transcript, for the same reason.
      threads.scrollTop = threads.scrollHeight;
    };

    /** One message, root or reply: who, when, what, and the two flags. */
    const messageEntry = (message: Readonly<ChannelMessage>): HTMLElement => {
      const entry = element(
        'article',
        'hubbub-message',
        `hubbub-message-${messageKey(message.id)}`,
      );
      entry.dataset.mention = String(message.mentionsPlayer);

      const head = element('div', 'hubbub-message-head');
      const author = element('strong');
      author.textContent = authorName(message.author);
      const stamp = element('span', 'hubbub-message-stamp');
      const at = formatSimTime(message.tick);
      stamp.textContent = `${at.day} · ${at.time}`;
      head.append(author, stamp);

      if (message.mentionsPlayer) {
        const mention = element(
          'span',
          'hubbub-mention',
          `hubbub-mention-${messageKey(message.id)}`,
        );
        mention.textContent = 'mentions you';
        head.append(mention);
      }

      const body = element('p', 'hubbub-message-body');
      body.textContent = message.body;
      entry.append(head, body);

      // A message about a ticket says so, and the saying is a door: the queue
      // is where the credit lives, and slice 2 will make that sentence the
      // mechanic. For now it is the same link every other surface offers.
      if (message.relatedTicket !== null) {
        const open = osButton(
          `About: ${ticketTitle(message.relatedTicket)}`,
          `hubbub-open-ticket-${messageKey(message.id)}`,
          { compact: true },
        );
        open.addEventListener('click', () => {
          api.openApp('tickets');
        });
        entry.append(open);
      }

      // And the mechanic slice 1 deferred: a message that IS a linked request
      // gets the convert / answer / deflect bar, right here in the room. This
      // is the composer the read-only slice would not prejudge - it answers a
      // request rather than typing a line - and resolving it here quietens the
      // mail and the chat copies too.
      const request = requestFor(message.request);

      if (request !== undefined) {
        entry.append(requestActions(api, request));
      }

      return entry;
    };

    const render = (): void => {
      const now = api.clock.now();
      const feed = channelFeedThrough(now);
      liveRequests = api.day.liveRequests();
      const showing = selectedChannel();
      const inRoom = channelFeed(feed, showing);

      // Seen before the rows are modelled, so the badge never counts a
      // message the pane is about to draw.
      markSeen(inRoom);

      const read = rooms().read;
      summary.textContent = `${String(CHANNELS.length)} rooms · `
        + `${String(totalUnread(feed, read))} unread`;

      const dot = readPresence(
        api.graph.getNode(api.actor)?.fields[FIELDS.presence],
      );
      presence.dataset.presence = dot;
      setText(presenceLabel, PRESENCE_LABELS[dot]);

      withFocusRestored(root, () => {
        channelList.sync(channelRows(CHANNELS, feed, read, showing));
        renderPane(showing, inRoom);
      });
    };

    host.replaceChildren(root);
    render();

    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    // The minute hand: arrivals are a reading of the clock, so a window that
    // only repainted on world changes would never see a message land.
    const unsubscribeTick = api.clock.onTick(() => {
      render();
    });
    // A load replaces the read ledger wholesale, and nothing else says so.
    const unsubscribeState = api.appState.onReplaced(() => {
      painted = null;
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeWorld();
        unsubscribeTick();
        unsubscribeState();
        root.remove();
      },
    };
  },
};
