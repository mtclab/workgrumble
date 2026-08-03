import type { ReadOnlyGraphNode } from '../../engine-api';
import { isLunchtime, shiftStartTick } from '../../world/day';
import { FIELDS } from '../../world/fields';
import { latestTick, type MailThread, visibleMail } from '../../world/mail';
import { findWorldTicket } from '../../world/tickets';
import { dayScript, isWeekDay } from '../../world/week';
import { formatSimTime } from '../clock-format';
import type { AppDef, AppInstance, GameApi } from './types';
import {
  element,
  formatDuration,
  nodeKey,
  osButton,
  setAvailability,
  textValue,
  withFocusRestored,
} from './ui';

/**
 * The one thread the brief puts in front of you: whatever came in last, which
 * in this building means whoever is most worried. Picked from the same inbox
 * the Mail app reads, so the brief can never quote a mail that is not there.
 */
function briefingMail(api: GameApi): MailThread | undefined {
  return [...visibleMail(api.graph)].sort(
    (left, right) => latestTick(right, api.graph) - latestTick(left, api.graph),
  )[0];
}

function openTickets(api: GameApi): readonly ReadOnlyGraphNode[] {
  return api.graph.nodesOfKind('ticket').filter((ticket) => {
    const state = ticket.fields[FIELDS.state];
    return state === 'open' || state === 'waiting_on_user';
  });
}

function ticketTitleOf(ticket: ReadOnlyGraphNode): string {
  return findWorldTicket(ticket.id)?.def.flavor.title ?? ticket.id;
}

/**
 * The morning brief: the hour before the shift, which is the only part of the
 * day nobody is measuring.
 *
 * It says three things and no more - what day it is, what somebody wants from
 * you before you have sat down, and what is already in the queue - and then
 * offers the one button that starts the clock properly. Reading it is not paid
 * time, so starting the shift skips whatever is left of the morning.
 */
export const BRIEF_APP: AppDef = {
  id: 'brief',
  title: 'Morning Brief',
  icon: 'icon-day',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api): AppInstance => {
    const root = element('section', 'app-page brief-app', 'brief-app');

    const head = element('div', 'brief-head');
    const heading = element('h2', undefined, 'brief-heading');
    const stamp = element('p', 'brief-stamp', 'brief-stamp');
    head.append(heading, stamp);

    // The overnight surface, above the two columns because it is the one thing
    // on this screen that is about last night rather than about the day ahead.
    // Hidden outright when nobody pinged - a "while you were out" heading over an
    // empty list is a small lie, and an overnight Do Not Disturb legitimately
    // empties it.
    const nightPanel = element('section', 'brief-panel brief-night', 'brief-night');
    nightPanel.hidden = true;

    const mailPanel = element('section', 'brief-panel', 'brief-mail');
    const queuePanel = element('section', 'brief-panel', 'brief-queue');
    const columns = element('div', 'brief-columns');
    columns.append(mailPanel, queuePanel);

    const footer = element('div', 'brief-footer');
    const start = osButton('Start the shift', 'brief-start-shift', {
      primary: true,
    });
    const note = element('p', 'brief-note', 'brief-note');
    footer.append(start, note);

    root.append(head, nightPanel, columns, footer);

    start.addEventListener('click', () => {
      api.day.startShift();
      render();
    });

    const renderMail = (): void => {
      mailPanel.replaceChildren();
      const heading2 = element('h3');
      heading2.textContent = 'Already waiting for you';
      mailPanel.append(heading2);

      const thread = briefingMail(api);
      const message = thread?.messages[thread.messages.length - 1];

      if (thread === undefined || message === undefined) {
        const empty = element('p', 'brief-empty', 'brief-mail-empty');
        empty.textContent = 'Nothing in the inbox. Enjoy the silence, it is '
          + 'load-bearing.';
        mailPanel.append(empty);
        return;
      }

      const subject = element('strong', undefined, 'brief-mail-subject');
      subject.textContent = thread.subject;
      const from = element('span', 'brief-mail-from', 'brief-mail-from');
      from.textContent = `${textValue(
        api.graph.getField(message.from, FIELDS.name),
        message.from,
      )} · ${formatSimTime(message.tick).time}`;
      mailPanel.append(subject, from);

      for (const paragraph of message.body) {
        const line = element('p');
        line.textContent = paragraph;
        mailPanel.append(line);
      }

      const open = osButton('Open the inbox', 'brief-open-mail', {
        compact: true,
      });
      open.addEventListener('click', () => {
        api.openApp('mail');
      });
      mailPanel.append(open);
    };

    const renderQueue = (): void => {
      queuePanel.replaceChildren();
      const heading2 = element('h3');
      heading2.textContent = 'The queue you have inherited';
      queuePanel.append(heading2);

      const tickets = openTickets(api);

      if (tickets.length === 0) {
        const empty = element('p', 'brief-empty', 'brief-queue-empty');
        empty.textContent = 'An empty queue. Somebody will be along shortly '
          + 'to correct that.';
        queuePanel.append(empty);
      } else {
        const list = element('ul', 'brief-queue-list', 'brief-queue-list');

        for (const ticket of tickets) {
          const item = element(
            'li',
            'brief-queue-item',
            `brief-queue-${nodeKey(ticket.id)}`,
          );
          const title = element('strong');
          title.textContent = ticketTitleOf(ticket);
          const due = element('span', 'brief-queue-due');
          const deadline = ticket.fields[FIELDS.slaDeadline];
          due.textContent = typeof deadline === 'number'
            ? `${formatDuration(deadline - api.clock.now())} left`
            : 'no deadline recorded';
          item.append(title, due);
          list.append(item);
        }

        queuePanel.append(list);
      }

      const later = api.day.schedule().arrivals.filter(
        (arrival) => arrival.tick > api.clock.now(),
      );

      // Only said when it is true: a promise of "more later" on a day that
      // brings none is the kind of small lie a scorecard is judged by.
      if (later.length > 0) {
        const warning = element('p', 'brief-later', 'brief-later');
        warning.textContent = `${String(later.length)} more are already `
          + 'on their way in. They do not know about each other.';
        queuePanel.append(warning);
      }

      const open = osButton('Open the queue', 'brief-open-tickets', {
        compact: true,
      });
      open.addEventListener('click', () => {
        api.openApp('tickets');
      });
      queuePanel.append(open);
    };

    const renderNight = (): void => {
      const pings = api.day.afterHoursPings();

      nightPanel.hidden = pings.length === 0;
      nightPanel.replaceChildren();

      if (pings.length === 0) {
        return;
      }

      const heading2 = element('h3');
      heading2.textContent = 'While you were out';
      const note = element('p', 'brief-night-note', 'brief-night-note');
      note.textContent = 'These landed after you clocked off. Answering one is '
        + 'a small point in your favour, traded for a small point of it '
        + 'following you into today. Leaving it costs nothing at all.';
      nightPanel.append(heading2, note);

      const list = element('ul', 'brief-night-list', 'brief-night-list');

      for (const ping of pings) {
        const item = element(
          'li',
          'brief-night-item',
          `brief-night-${nodeKey(ping.slot.id)}`,
        );
        item.dataset.answered = String(ping.answered);

        const from = element('strong', 'brief-night-from');
        from.textContent = textValue(
          api.graph.getField(ping.slot.speaker, FIELDS.name),
          ping.slot.speaker,
        );
        const subject = element('span', 'brief-night-subject');
        subject.textContent = ping.slot.subject;
        item.append(from, subject);

        if (ping.answered) {
          const done = element('span', 'brief-night-done', 'brief-night-done');
          done.textContent = 'Answered';
          item.append(done);
        } else {
          const answer = osButton('Answer', `brief-night-answer-${nodeKey(ping.slot.id)}`, {
            compact: true,
          });
          answer.addEventListener('click', () => {
            api.day.answerAfterHours(ping.slot.id);
            render();
          });
          item.append(answer);
        }

        list.append(item);
      }

      nightPanel.append(list);
    };

    const render = (): void => {
      const day = api.day.day();
      const state = api.day.state();
      const display = formatSimTime(api.clock.now());

      // The day has a name as well as a number now: five of them, and the
      // last one has a conversation at three o'clock in it.
      const named = isWeekDay(day) ? `${dayScript(day).label}, ` : '';
      heading.textContent = `Day ${String(day)}, ${named}and it is ${
        display.time
      }`;
      stamp.textContent = state === 'morning_brief'
        ? 'The shift is at 09:00. Lunch is at 12:00 and lasts exactly as long '
          + 'as it is allowed to.'
        : 'The shift is under way. This is the brief you already read.';
      root.dataset.dayState = state;

      // The panels are rebuilt every minute, and the player may be standing on
      // one of the buttons inside them when the clock moves.
      withFocusRestored(root, () => {
        renderNight();
        renderMail();
        renderQueue();
      });

      const started = state !== 'morning_brief';
      setAvailability(
        start,
        started
          ? 'The shift has already started. There is no starting it twice.'
          : null,
      );
      start.textContent = started ? 'Shift under way' : 'Start the shift';
      note.textContent = started
        ? isLunchtime(api.clock.now())
          ? 'It is lunchtime. Nobody is looking at the queue, including you.'
          : 'Close this when you are ready. The queue is not going anywhere.'
        : `Starting puts the clock on ${
          formatSimTime(shiftStartTick(day)).time
        }. The rest of the morning is yours and worth nothing.`;
    };

    host.replaceChildren(root);
    render();

    const unsubscribeDay = api.day.onChanged(() => {
      render();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    const unsubscribeTick = api.clock.onTick(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeDay();
        unsubscribeWorld();
        unsubscribeTick();
        root.remove();
      },
    };
  },
};
