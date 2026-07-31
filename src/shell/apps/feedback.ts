import { SAVE_SCHEMA } from '../save';
import { BUILD_VERSION, CORE_VERSION } from '../../shared/build';
import type { FeedbackContext, FeedbackSubmission } from '../api';
import { createIcon } from '../icons';
import { element, osButton, setAvailability } from './ui';
import type { AppDef, GameApi } from './types';

/**
 * Report a real problem: the one window in this building that is not in
 * character.
 *
 * It is DRESSED as a ticket, because that is the joke the whole product is
 * built on and because a tester who has spent an hour filing tickets knows
 * exactly how to fill one in. But everything it says about itself is true: it
 * goes to the people who made the game, it says what it is attaching, and it
 * says what not to type. A comedy form that quietly collected more than it
 * admitted would be the one gag this product cannot afford.
 *
 * Three rules, and all three are visible on screen rather than only in code:
 *
 *  - THE BADGE IS OPTIONAL AND OFF. It is attached only if the player ticks
 *    the box, and the Worker checks the tick again on its own side.
 *  - THE AUTOMATIC CONTEXT IS SHOWN BEFORE IT IS SENT. Everything the report
 *    carries besides the words is printed in the window, in full, so "what is
 *    this sending" is a question the player can answer by reading.
 *  - NOTHING IS COLLECTED THAT WAS NOT TYPED OR LISTED. There is no field for
 *    a name or an address, and the context is a fixed list of facts about the
 *    session rather than anything about the person having it.
 */

const NOTICE = 'This goes to the people who made the game. Please do not put '
  + 'anything personal in it - not your name, your address, your employer or '
  + 'anybody else\'s. Nothing about you is collected unless you tick the box.';

const SENT = 'Filed. Somebody will read it, which is more than can be said for '
  + 'most of the tickets in this building.';

const NEEDS_A_LINE = 'A report needs a line saying what happened. One sentence '
  + 'is plenty.';

/** The last five things dispatched, as ids: what was going on, not who. */
function recentActions(api: GameApi): readonly string[] {
  return api.dispatchLog().slice(-5).map((entry) => entry.id);
}

function contextFor(api: GameApi): FeedbackContext {
  return {
    day: api.day.day(),
    schema: SAVE_SCHEMA,
    build: BUILD_VERSION,
    core: CORE_VERSION,
    app: api.appState.get().windows.focusedId,
    actions: recentActions(api),
  };
}

function contextLines(context: Readonly<FeedbackContext>): readonly string[] {
  return [
    `Day ${String(context.day)} of the week`,
    `Build ${context.build}, engine ${context.core}, save format `
      + String(context.schema),
    `Window in front: ${context.app ?? 'none'}`,
    `Last actions: ${context.actions.length === 0
      ? 'nothing since the last day boundary'
      : context.actions.join(', ')}`,
  ];
}

export const FEEDBACK_APP: AppDef = {
  id: 'feedback',
  title: 'Report a Problem',
  icon: 'icon-report',
  tier_required: 0,
  slack: false,
  mount: (host, api: GameApi) => {
    const root = element('section', 'app-page feedback-app', 'feedback-app');

    const masthead = element('header', 'feedback-masthead');
    const mark = element('span', 'feedback-mark');
    const markIcon = createIcon('icon-report');
    markIcon.classList.add('svg-icon-lg');
    mark.append(markIcon);
    const headCopy = element('div');
    const heading = element('h2');
    heading.textContent = 'Report a real problem';
    const subheading = element('p');
    subheading.textContent = 'Not a ticket about the estate. A ticket about '
      + 'the game: something that broke, something that made no sense, or '
      + 'something that was not funny.';
    headCopy.append(heading, subheading);
    masthead.append(mark, headCopy);

    const form = element('div', 'feedback-form');

    const summaryField = element('label', 'field');
    const summaryLabel = element('span');
    summaryLabel.textContent = 'What happened, in one line';
    const summary = element('input', undefined, 'feedback-summary');
    summary.type = 'text';
    summary.maxLength = 120;
    summary.autocomplete = 'off';
    summary.placeholder = 'The spooler button did nothing on Thursday';
    summaryField.append(summaryLabel, summary);

    const detailsField = element('label', 'field');
    const detailsLabel = element('span');
    detailsLabel.textContent = 'Anything else worth knowing';
    const details = element('textarea', undefined, 'feedback-details');
    details.rows = 6;
    details.maxLength = 4_000;
    detailsField.append(detailsLabel, details);

    const consent = element('label', 'field-check');
    const contact = element('input', undefined, 'feedback-contact');
    contact.type = 'checkbox';
    const consentLabel = element('span');
    consentLabel.textContent = 'Let them contact my badge about this';
    consent.append(contact, consentLabel);

    const notice = element('p', 'feedback-notice', 'feedback-notice');
    notice.textContent = NOTICE;

    const contextPanel = element('div', 'feedback-context', 'feedback-context');
    const contextHeading = element('h3');
    contextHeading.textContent = 'Attached automatically';
    const contextList = element('ul');
    contextPanel.append(contextHeading, contextList);

    const actions = element('div', 'app-action-row');
    const send = osButton('File the report', 'feedback-send', { primary: true });
    actions.append(send);

    const outcome = element('p', 'app-outcome', 'feedback-outcome');
    outcome.hidden = true;
    const refusal = element('p', 'app-refusal', 'feedback-refusal');
    refusal.hidden = true;

    /**
     * Repaints the "attached automatically" panel from the session as it is
     * RIGHT NOW - the day, the window in front, the last few things done - so
     * the list is what would actually be sent if the button were pressed this
     * second rather than what was true when the window opened.
     */
    const renderContext = (): void => {
      contextList.replaceChildren();

      for (const line of contextLines(contextFor(api))) {
        const item = element('li', undefined, 'feedback-context-line');
        item.textContent = line;
        contextList.append(item);
      }
    };

    const say = (line: string | null, problem: string | null): void => {
      outcome.hidden = line === null;
      outcome.textContent = line ?? '';
      refusal.hidden = problem === null;
      refusal.textContent = problem ?? '';
    };

    const onSend = (): void => {
      const line = summary.value.trim();

      if (line.length === 0) {
        say(null, NEEDS_A_LINE);
        summary.focus();
        return;
      }

      const submission: FeedbackSubmission = {
        summary: line,
        details: details.value.trim(),
        contact: contact.checked,
        context: contextFor(api),
      };

      // Sending is the one thing in this window that takes real time, so the
      // button says so and stops taking clicks. A form that can be submitted
      // four times while the first one is in flight files four issues.
      setAvailability(send, 'The report is on its way.');
      say(null, null);

      void api.report(submission).then((answer) => {
        setAvailability(send, null);

        if (answer.ok) {
          summary.value = '';
          details.value = '';
          contact.checked = false;
          say(SENT, null);
          return;
        }

        // Offline is not an error the player caused, and it does not lose what
        // they wrote: the words stay in the box for the next attempt.
        say(null, answer.reason);
      });
    };

    send.addEventListener('click', onSend);
    const unsubscribe = api.onWorldChange(renderContext);

    root.append(masthead, form, contextPanel, actions, outcome, refusal);
    form.append(summaryField, detailsField, consent, notice);
    host.replaceChildren(root);
    renderContext();

    return {
      unmount: (): void => {
        unsubscribe();
        send.removeEventListener('click', onSend);
        root.remove();
      },
    };
  },
};
