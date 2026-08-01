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
import { FLAVOR, flavorText } from '../../world/interruptions';
import { isFumbling, isRefocusing } from '../../world/meters';
import { ticketTitle } from '../../world/tickets';
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
 * The phone, ringing.
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
 * (`meeting.ts`); a call is an interruption you are allowed to be bad at.
 */
export const CALL_APP: AppDef = {
  id: 'call',
  title: 'Incoming call',
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
    const transcript = element('ol', 'chat-transcript', 'call-transcript');
    const options = element('div', 'chat-options', 'call-options');

    const answers = element('div', 'call-answers');
    const answer = osButton('Answer', 'call-answer', { primary: true });
    const later = osButton('Message first', 'call-defer');
    const decline = osButton('Decline', 'call-decline');
    answers.append(answer, later, decline);

    const note = element('p', 'call-note', 'call-note');

    root.append(head, state, transcript, options, answers, note);

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

    /** The window with nothing ringing in it, which is most of the week. */
    const renderSilence = (): void => {
      root.dataset.call = 'none';
      root.dataset.answered = 'false';
      heading.textContent = 'The phone is not ringing';
      subject.textContent = 'It does that most of the day, which is the part '
        + 'nobody thanks you for.';
      state.textContent = '';
      transcript.replaceChildren();
      options.replaceChildren();
      answers.hidden = true;
      note.textContent = 'When it does ring you get three answers, and one of '
        + 'them is not always available.';
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

        root.dataset.call = view.entry.id;
        root.dataset.answered = String(view.answered);
        root.dataset.benign = String(view.benign);
        root.dataset.callback = String(view.callback);
        heading.textContent = name;
        subject.textContent = flavorText(view.entry, FLAVOR.subject)
          ?? 'They did not say what it was about.';
        state.textContent = view.answered
          ? `On the phone. ${String(
            view.entry.endsTick - api.clock.now(),
          )} minutes of the shift are going into this, and every deadline in `
            + 'the queue is running through all of them.'
          : view.callback
            ? 'Ringing again. This is them ringing back, which is the one you '
              + 'said you would take.'
            : 'Ringing. The queue does not stop for it and neither does the '
              + 'clock on your screen.';

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
