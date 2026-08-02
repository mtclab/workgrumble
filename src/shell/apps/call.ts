import {
  applyDialogueEffects,
  type DialogueOption,
  type DialogueTree,
  dialogueForSpeaker,
  dialogueNode,
  isAskEffect,
  isRevealEffect,
} from '../../world/dialogue';
import { FIELDS } from '../../world/fields';
import {
  FLAVOR,
  flavorText,
  type InterruptionSource,
} from '../../world/interruptions';
import { isFumbling, isRefocusing } from '../../world/meters';
import { ticketTitle } from '../../world/tickets';
import { formatSimTime } from '../clock-format';
import type { ChatThread } from '../app-state';
import type { InterruptionView } from '../day-driver';
import { createIcon } from '../icons';
import type { AppDef, AppInstance, GameApi } from './types';
import {
  element,
  osButton,
  outcomeLine,
  refusalLine,
  withFocusRestored,
} from './ui';

/**
 * The words this window uses, per source, because two different things are
 * drawn in it.
 *
 * A ringing phone and a person at your desk are the same MECHANIC - a
 * synchronous conversation that owns the screen while every clock in the
 * building runs - and they are not remotely the same experience, so the verbs
 * are shared and the words are not. The three buttons keep their ids, because
 * they are the same three verbs going through the same three dispatches; what
 * changes is what they say, which is the only honest way to offer "Message
 * first" to somebody who is standing in front of you.
 *
 * A table rather than conditionals at six call sites, and the same reason as
 * every other table in this family: six conditionals are six places a seventh
 * source can be forgotten.
 */
interface CallRegister {
  /** What the window says while nobody has picked it up. */
  readonly waiting: string;
  /** And while the conversation is running, before the minutes. */
  readonly during: string;
  /** The three buttons, in the order the window shows them. */
  readonly answer: string;
  readonly defer: string;
  readonly decline: string;
  /** What the callback state says, for the sources that can have one. */
  readonly again: string;
}

const RINGING: CallRegister = {
  waiting: 'Ringing. The queue does not stop for it and neither does the '
    + 'clock on your screen.',
  during: 'On the phone.',
  answer: 'Answer',
  defer: 'Message first',
  decline: 'Decline',
  again: 'Ringing again. This is them ringing back, which is the one you '
    + 'said you would take.',
};

const AT_THE_DESK: CallRegister = {
  waiting: 'Standing at your desk, waiting for you to look up. Your status '
    + 'has nothing to say about this: they can see you.',
  during: 'Talking, at the desk.',
  answer: 'Look up',
  defer: 'Ask for twenty minutes',
  decline: 'Say not now',
  again: 'Back at your desk, at the minute you asked for. This is the '
    + 'conversation.',
};

function registerFor(source: InterruptionSource): CallRegister {
  return source === 'walk_up' ? AT_THE_DESK : RINGING;
}

/**
 * The words on the three choice-grammar buttons, both registers of them.
 *
 * Exported for one reader and it is not this window: the Assistant's banned-hint
 * gate bans a line that quotes a control that would resolve what is on screen,
 * and "Say not now" is that control for a walk-up as surely as `decline` is.
 * The verb sits in the test id; the human words are only here, so the gate
 * reads them from the one place they are authored rather than keeping a copy
 * that would drift the first time a button is renamed.
 */
export const CALL_CONTROL_LABELS: readonly string[] = Object.freeze([
  RINGING.answer,
  RINGING.defer,
  RINGING.decline,
  AT_THE_DESK.answer,
  AT_THE_DESK.defer,
  AT_THE_DESK.decline,
]);

/**
 * The phone ringing, and the person at your desk.
 *
 * It is built on the chat machinery on purpose and reuses it literally: the
 * conversation a player has on the phone is a `ChatThread` in the same store
 * the chat window keeps its transcripts in, so it is saved, hydrated and
 * hydrated back by code that already existed and is already tested. The key is
 * the interruption's id rather than the person's, because ringing somebody
 * about a printer is not the same conversation as messaging them about one,
 * and a call that landed in the chat thread would rewrite a conversation the
 * player was in the middle of.
 *
 * What is NOT in the store is whether the phone is ringing at all. That is
 * `day.interruption()`, which is a function of the day's seeded schedule and
 * of the three lists the world keeps - so this window is a pure render of
 * something the world already knows, and a save taken while it is up restores
 * with it up.
 *
 * It is a window rather than a lockout, and that is a rule rather than an
 * omission: a ringing phone is not a caught scene, so the boss key still
 * works, the lead still comes round, and the browser on the second monitor is
 * still a thing somebody can be found looking at. The MEETING is the takeover
 * (`meeting.ts`); a call is an interruption you are allowed to be bad at, and
 * so is somebody standing at your shoulder - which is why they share a window
 * and differ only in what it says (`CallRegister`, above).
 */
export const CALL_APP: AppDef = {
  id: 'call',
  title: 'Somebody wants you',
  icon: 'icon-chat',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api: GameApi): AppInstance => {
    const root = element('section', 'app-page call-app', 'call-app');

    const head = element('div', 'call-head');
    const portrait = element('div', 'call-portrait');
    portrait.append(createIcon('icon-chat'));
    const heading = element('h2', undefined, 'call-caller');
    const subject = element('p', 'call-subject', 'call-subject');
    const copy = element('div', 'call-head-copy');
    copy.append(heading, subject);
    head.append(portrait, copy);

    const state = element('p', 'call-state', 'call-state');
    /**
     * The phones that did not ring, which is the only trace the dot leaves on
     * a screen.
     *
     * It lives in the SILENCE state on purpose and it is a list rather than a
     * notice: a filter that announced every call it turned away would undo the
     * quiet the player bought, and one that said nothing at all would be a
     * mechanic paid for in suspicion and never once seen working. So the
     * record sits here, in the window it is about, and says exactly what the
     * world wrote down - who tried, at what minute, and whether they ever came
     * back. Nothing more: this window must not know a single thing about a
     * conversation that did not happen.
     */
    const missed = element('ul', 'call-missed', 'call-missed');
    const transcript = element('ol', 'chat-transcript', 'call-transcript');
    const options = element('div', 'chat-options', 'call-options');

    const answers = element('div', 'call-answers');
    const answer = osButton('Answer', 'call-answer', { primary: true });
    const later = osButton('Message first', 'call-defer');
    const decline = osButton('Decline', 'call-decline');
    answers.append(answer, later, decline);

    const note = element('p', 'call-note', 'call-note');

    root.append(head, state, missed, transcript, options, answers, note);

    /** The last thing a button did, which is about the click that just happened. */
    let refusal: string | null = null;
    let outcome: string | null = null;

    const threadKey = (id: string): string => `call:${id}`;

    const threads = (): Readonly<Record<string, ChatThread>> => api.appState
      .get().chat.threads;

    const putThread = (key: string, thread: ChatThread): void => {
      api.appState.patch('chat', {
        threads: { ...threads(), [key]: thread },
      });
    };

    /**
     * Whose tree this call runs in, and which of its nodes it opens on.
     *
     * The opening node is authored per call rather than per person, because a
     * person can be summoned one way and ring about something else - and the
     * FUMBLING opening is a second authored node rather than a mangled version
     * of the first. The meters say whether the hands are going; the content
     * says what somebody with shaking hands hears down a phone.
     */
    const opening = (view: Readonly<InterruptionView>): string | null => {
      const stress = api.graph.getField(api.actor, FIELDS.stress);
      const refocusing = isRefocusing(
        api.graph.getField(api.actor, FIELDS.refocusUntil),
        api.clock.now(),
      );
      const shaking = typeof stress === 'number' && isFumbling(stress, refocusing);
      const shaky = flavorText(view.entry, FLAVOR.opensFumbling);

      return (shaking ? shaky : null) ?? flavorText(view.entry, FLAVOR.opens);
    };

    const treeFor = (
      view: Readonly<InterruptionView>,
    ): DialogueTree | undefined => {
      const caller = flavorText(view.entry, FLAVOR.caller);
      return caller === null ? undefined : dialogueForSpeaker(caller);
    };

    const callerName = (view: Readonly<InterruptionView>): string => {
      const caller = flavorText(view.entry, FLAVOR.caller);
      const name = caller === null
        ? null
        : api.graph.getField(caller, FIELDS.name);

      return typeof name === 'string' && name.length > 0
        ? name
        : caller ?? 'Somebody';
    };

    /**
     * Picking it up.
     *
     * The verb goes first and the transcript second: what the player DECIDED
     * is world state and has to survive a save, and a window that opened the
     * conversation before the world had recorded the decision would be a
     * conversation that unhappened on a reload.
     */
    const pickUp = (view: Readonly<InterruptionView>): void => {
      const result = api.day.answerInterruption();
      refusal = result.ok ? null : result.reason;
      outcome = null;

      if (!result.ok) {
        render();
        return;
      }

      const tree = treeFor(view);
      const root_ = opening(view);

      if (tree !== undefined && root_ !== null) {
        putThread(threadKey(view.entry.id), {
          nodeId: root_,
          rootUsed: root_,
          ended: false,
          lines: [
            { who: 'them', text: dialogueNode(tree, root_)?.npc_line ?? '' },
          ],
        });
      }

      render();
    };

    /**
     * One line of the conversation, played.
     *
     * The same order the chat window uses and for the same reason: the thread
     * is advanced BEFORE the effects are dispatched, because a dispatch
     * mutates the world synchronously and the world listener repaints before
     * the call has returned.
     */
    const choose = (
      view: Readonly<InterruptionView>,
      tree: Readonly<DialogueTree>,
      thread: Readonly<ChatThread>,
      option: Readonly<DialogueOption>,
    ): void => {
      const key = threadKey(view.entry.id);
      const said: ChatThread['lines'] = [
        ...thread.lines,
        { who: 'you', text: option.label },
      ];
      refusal = null;
      outcome = null;

      putThread(
        key,
        option.next === undefined
          ? {
            ...thread,
            ended: true,
            lines: [...said, { who: 'system', text: 'You put the phone down.' }],
          }
          : {
            ...thread,
            nodeId: option.next,
            lines: [
              ...said,
              {
                who: 'them',
                text: dialogueNode(tree, option.next)?.npc_line ?? '',
              },
            ],
          },
      );

      const played = applyDialogueEffects(option.effects ?? [], {
        // The ticket the CALL is about, which is the one the accept verb
        // wrote its evidence onto - not whatever the caller's chat tree would
        // have picked, because a call carries its own subject.
        ticket: view.entry.relatedTicket ?? undefined,
        said: option.label,
        dispatch: (action, target, params) => api.dispatch(
          action,
          api.actor,
          target,
          params,
        ),
      });

      refusal = played.refusal;

      const reported: string[] = [];

      if (played.done.some(isAskEffect)) {
        reported.push('Logged on the ticket, in their words, from the phone.');
      }

      if (played.done.some(isRevealEffect)) {
        reported.push(`Filed as a work note on ${
          ticketTitle(view.entry.relatedTicket ?? '')
        }.`);
      }

      outcome = reported.length > 0 ? reported.join(' ') : null;
      render();
    };

    /**
     * "Can I call you back." A chat line goes now, which is what makes this
     * different from ignoring it: the person on the other end has been told
     * something, and they ring back anyway, because they always do.
     */
    const messageFirst = (view: Readonly<InterruptionView>): void => {
      const result = api.day.deferInterruption();
      refusal = result.ok ? null : result.reason;
      outcome = null;

      if (result.ok) {
        const caller = flavorText(view.entry, FLAVOR.caller);
        const key = threadKey(view.entry.id);
        const existing = threads()[key];

        putThread(key, {
          nodeId: existing?.nodeId ?? '',
          rootUsed: existing?.rootUsed ?? '',
          ended: true,
          lines: [
            ...existing?.lines ?? [],
            {
              who: 'you',
              text: 'In the middle of something - can I ring you back?',
            },
            {
              who: 'them',
              text: `${callerName(view)}: no problem at all.`,
            },
          ],
        });
        outcome = 'They said no problem at all. They will ring back, and the '
          + 'second time is the conversation.';

        if (caller !== null) {
          api.notify(
            'You said you would ring back',
            `${callerName(view)} will ring again in a bit, and that one is `
            + 'not one you can wave off.',
          );
        }
      }

      render();
    };

    const sayNo = (): void => {
      const result = api.day.declineInterruption();
      refusal = result.ok ? null : result.reason;
      outcome = result.ok
        ? 'It stops ringing. The minutes it would have taken are yours.'
        : null;
      render();
    };

    answer.addEventListener('click', () => {
      const view = api.day.interruption();

      if (view !== null) {
        pickUp(view);
      }
    });
    later.addEventListener('click', () => {
      const view = api.day.interruption();

      if (view !== null) {
        messageFirst(view);
      }
    });
    decline.addEventListener('click', () => {
      sayNo();
    });

    /**
     * Everybody the dot turned away today, oldest first.
     *
     * Read off the day rather than remembered here, so it is the same list on
     * both sides of a save - and empty for the whole of a week nobody sets a
     * status in, which is what keeps this from being a panel about nothing.
     */
    const renderMissed = (): void => {
      const dodged = api.day.dodgedInterruptions();

      missed.replaceChildren();
      missed.dataset.dodged = String(dodged.length);
      missed.hidden = dodged.length === 0;

      for (const record of dodged) {
        const item = element('li', 'call-missed-line');
        item.dataset.call = record.entry.id;
        const when = element('span', 'call-missed-when');
        when.textContent = formatSimTime(record.tick).time;
        const who = element('span', 'call-missed-who');
        const caller = flavorText(record.entry, FLAVOR.caller);
        const name = caller === null
          ? null
          : api.graph.getField(caller, FIELDS.name);
        who.textContent = `${typeof name === 'string' ? name : 'Somebody'} - ${
          flavorText(record.entry, FLAVOR.subject) ?? 'no subject given'
        }${record.gaveUp ? '. They did not try again.' : ''}`;
        item.append(when, who);
        missed.append(item);
      }
    };

    /** The window with nothing ringing in it, which is most of the week. */
    const renderSilence = (): void => {
      root.dataset.call = 'none';
      root.dataset.answered = 'false';
      // All four, and the last two matter as much as the first two: a window
      // that kept `data-callback` from the call before it is a window saying
      // something true about a conversation that is over, to anybody reading
      // it - a test, a screen reader, the next paint. A silent phone is not
      // benign and is not a callback; it is silent.
      root.dataset.benign = 'false';
      root.dataset.callback = 'false';
      // And which of the two things this window draws was last in it. A
      // silent phone is not a walk-up, and a `data-source` left over from the
      // conversation before it is the screen saying something true about
      // something that has finished happening.
      root.dataset.source = 'none';
      heading.textContent = 'The phone is not ringing';
      subject.textContent = 'It does that most of the day, which is the part '
        + 'nobody thanks you for.';
      state.textContent = '';
      transcript.replaceChildren();
      options.replaceChildren();
      answers.hidden = true;
      note.textContent = 'When it does ring you get three answers, and one of '
        + 'them is not always available.';
      renderMissed();
    };

    const renderTranscript = (thread: Readonly<ChatThread>, name: string): void => {
      transcript.replaceChildren();

      for (const line of thread.lines) {
        const entry = element('li', 'chat-line');
        entry.dataset.who = line.who;
        const who = element('span', 'chat-line-who');
        who.textContent = line.who === 'them'
          ? name
          : line.who === 'you'
            ? 'You'
            : '';
        const text = element('span', 'chat-line-text');
        text.textContent = line.text;
        entry.append(who, text);
        transcript.append(entry);
      }

      transcript.scrollTop = transcript.scrollHeight;
    };

    const renderOptions = (
      view: Readonly<InterruptionView>,
      tree: Readonly<DialogueTree> | undefined,
      thread: Readonly<ChatThread> | undefined,
    ): void => {
      options.replaceChildren();

      if (tree === undefined || thread === undefined || thread.ended) {
        return;
      }

      const node = dialogueNode(tree, thread.nodeId);

      if (node === undefined) {
        return;
      }

      node.options.forEach((option, index) => {
        const button = osButton(option.label, `call-option-${String(index)}`);
        button.addEventListener('click', () => {
          choose(view, tree, thread, option);
        });
        options.append(button);
      });
    };

    const render = (): void => {
      const view = api.day.interruption();

      withFocusRestored(root, () => {
        if (view === null || view.entry.source === 'meeting') {
          renderSilence();
          paintFeedback();
          return;
        }

        const name = callerName(view);
        const tree = treeFor(view);
        const thread = threads()[threadKey(view.entry.id)];
        const words = registerFor(view.entry.source);

        // The three verbs are the same three verbs; what they SAY is not, and
        // it is repainted rather than set once because one window draws two
        // different things and a label left over from the last one would be
        // the screen lying about which of them is happening.
        answer.textContent = words.answer;
        later.textContent = words.defer;
        decline.textContent = words.decline;
        root.dataset.source = view.entry.source;

        // The record is about a quiet phone. With one actually ringing it is
        // the wrong half of the window to be reading, and a list of calls that
        // did not happen underneath a call that is happening is a screen
        // arguing with itself.
        missed.hidden = true;

        root.dataset.call = view.entry.id;
        root.dataset.answered = String(view.answered);
        root.dataset.benign = String(view.benign);
        root.dataset.callback = String(view.callback);
        heading.textContent = name;
        subject.textContent = flavorText(view.entry, FLAVOR.subject)
          ?? 'They did not say what it was about.';
        state.textContent = view.answered
          ? `${words.during} ${String(
            view.entry.endsTick - api.clock.now(),
          )} minutes of the shift are going into this, and every deadline in `
            + 'the queue is running through all of them.'
          : view.callback
            ? words.again
            : words.waiting;

        renderTranscript(thread ?? { nodeId: '', rootUsed: '', lines: [], ended: false }, name);
        renderOptions(view, tree, thread);

        answers.hidden = view.answered;
        // Deliberately still on the screen when the world will refuse it: the
        // refusal is the teaching, and a button that quietly vanished would
        // have taught the same rule without ever saying it.
        decline.dataset.available = String(
          view.entry.declinable && !view.callback,
        );
        note.textContent = view.benign
          ? 'They are ringing about the ticket in front of you, so this is the '
            + 'job arriving by phone rather than instead of it.'
          : 'This is not about what you were doing. Whatever happens next, '
            + 'finding your place again is the part that costs.';

        paintFeedback();
      });
    };

    const feedback = element('div', 'call-feedback');
    root.append(feedback);

    const paintFeedback = (): void => {
      feedback.replaceChildren(
        outcomeLine('call-outcome', outcome),
        refusalLine('call-refusal', refusal, createIcon('icon-lock')),
      );
    };

    host.replaceChildren(root);
    render();

    const unsubscribeDay = api.day.onChanged(() => {
      render();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    // The minute hand is what turns "ringing" into "rung out", so the window
    // has to repaint on it rather than only when something was pressed.
    const unsubscribeTick = api.clock.onTick(() => {
      render();
    });
    const unsubscribeState = api.appState.onReplaced(() => {
      refusal = null;
      outcome = null;
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeDay();
        unsubscribeWorld();
        unsubscribeTick();
        unsubscribeState();
        root.remove();
      },
    };
  },
};
