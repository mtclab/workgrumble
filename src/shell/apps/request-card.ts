/**
 * The convert / answer / deflect bar, shared by every surface a linked request
 * lands on (0.5.0 slice 2).
 *
 * The same question arrives in the inbox, in a one-to-one chat and in a Hubbub
 * room, and the player can act on it from any of the three. So the ACTION is
 * one control drawn the same way everywhere - convert it into a ticket, answer
 * the human off the books, or send them to the form - and it reads the world's
 * own resolution off `api.day.liveRequests()`, so resolving it on one surface
 * shows as resolved on the other two the next time they paint. That is the
 * dedupe, made visible: the copies are the same request, and the bar says so.
 *
 * The Hubbub copy is a channel message and gets the BAR appended under it; the
 * mail and chat copies are drawn by this module as a whole CARD, because those
 * apps have no native row for a cross-post. Both share `requestActions`, so
 * there is one place the three buttons and the resolved line are built.
 */

import type { LinkedRequest, RequestKind } from '../../world/requests';
import { FIELDS } from '../../world/fields';
import { ticketTitle } from '../../world/tickets';
import type { GameApi } from './types';
import {
  element,
  nodeKey,
  osButton,
  refusalLine,
  setText,
  textValue,
} from './ui';

/** `req:bev-vpn` -> `bev-vpn`, for element ids and test hooks. */
export function requestKey(id: string): string {
  return nodeKey(id);
}

/** Which surface the card is drawn on, so it can name the OTHER two. */
export type RequestSurface = 'mail' | 'chat' | 'hubbub';

const SURFACE_LABELS: Readonly<Record<RequestSurface, string>> = {
  mail: 'your inbox',
  chat: 'a chat',
  hubbub: 'a Hubbub room',
};

/** What the resolved line says the player did, once a copy has been dealt with. */
const RESOLVED_LABELS: Readonly<Record<RequestKind, string>> = {
  convert: 'Converted into a ticket - the one thing Friday can see.',
  answer: 'Answered here, off the books. They are happy; there is no ticket.',
  deflect: 'Sent to the form. Your time is your own; it cost a little goodwill.',
};

const RESOLVE_LABELS: Readonly<Record<RequestKind, string>> = {
  convert: 'Convert to a ticket',
  answer: 'Just sort it for them',
  deflect: 'Ask them to raise a ticket',
};

/** The other two surfaces this same request also landed on, as a sentence. */
function elsewhere(surface: RequestSurface): string {
  const others = (['mail', 'chat', 'hubbub'] as const)
    .filter((other) => other !== surface)
    .map((other) => SURFACE_LABELS[other]);

  return `The same request also came in on ${others.join(' and ')}.`;
}

/**
 * The bar itself: three buttons while it is live, a resolved line once any copy
 * has been dealt with. Appended under the Hubbub message and inside the mail
 * and chat cards, so all three surfaces resolve through one control.
 */
export function requestActions(
  api: GameApi,
  request: Readonly<LinkedRequest>,
): HTMLElement {
  const key = requestKey(request.id);
  const bar = element('div', 'request-bar', `request-bar-${key}`);

  if (request.resolvedAs !== null) {
    const done = element('p', 'request-resolved', `request-status-${key}`);
    done.dataset.kind = request.resolvedAs;
    done.textContent = RESOLVED_LABELS[request.resolvedAs];
    bar.append(done);
    return bar;
  }

  const refusal = refusalLine(`request-refusal-${key}`, null, null);

  const act = (kind: RequestKind): void => {
    const result = api.day.resolveRequest(request.id, kind);

    if (!result.ok) {
      setText(refusal, result.reason ?? 'That did not work.');
      refusal.hidden = false;
      return;
    }

    // A convert leaves a real ticket where the credit lives; nudge the player
    // toward it, the way every other about-a-ticket surface does. The apps
    // repaint off the world change the resolve dispatched, so the bar itself
    // will come back as the resolved line without anybody rebuilding it here.
    if (kind === 'convert') {
      api.openApp('tickets');
    }
  };

  const buttons = element('div', 'request-buttons');

  for (const kind of ['convert', 'answer', 'deflect'] as const) {
    const button = osButton(
      RESOLVE_LABELS[kind],
      `request-${kind}-${key}`,
      { compact: true, primary: kind === 'convert' },
    );
    button.addEventListener('click', () => {
      act(kind);
    });
    buttons.append(button);
  }

  bar.append(buttons, refusal);
  return bar;
}

/**
 * The whole card, for the surfaces with no native row of their own: who is
 * asking, what they said HERE, the note that it landed elsewhere too, and the
 * bar. Mail and chat draw this; Hubbub draws the message and appends only the
 * bar.
 */
export function requestCard(
  api: GameApi,
  request: Readonly<LinkedRequest>,
  surface: RequestSurface,
): HTMLElement {
  const key = requestKey(request.id);
  const card = element('article', 'request-card', `request-card-${key}`);
  card.dataset.resolved = String(request.resolvedAs !== null);

  const head = element('div', 'request-head');
  const who = element('strong', 'request-reporter');
  const person = api.graph.getNode(request.reporter);
  who.textContent = person === undefined
    ? request.reporter
    : textValue(person.fields[FIELDS.name], request.reporter);
  const subject = element('span', 'request-subject');
  subject.textContent = request.subject;
  head.append(who, subject);

  const body = element('p', 'request-body');
  body.textContent = surface === 'mail' ? request.mail : request.chat;

  const link = element('span', 'request-elsewhere', `request-elsewhere-${key}`);
  link.textContent = elsewhere(surface);

  // The ticket it is about, once it is one: a converted request is a real
  // ticket, and naming it lets the card open the queue where the work now is.
  const foot = element('div', 'request-foot');

  if (request.resolvedAs === 'convert') {
    const open = osButton(
      `Ticket: ${ticketTitle(request.raises)}`,
      `request-open-ticket-${key}`,
      { compact: true },
    );
    open.addEventListener('click', () => {
      api.openApp('tickets');
    });
    foot.append(open);
  }

  card.append(head, body, link, requestActions(api, request), foot);
  return card;
}
