import {
  FARM_PRICE_PENCE,
  farmProgress,
  formatPence,
} from '../../world/day';
import { FIELDS } from '../../world/fields';
import {
  PROBATION_BONUS_PENCE,
  REVIEW_PASS_REPUTATION,
  type WeekScorecard,
} from '../../world/week';
import type { AppDef, AppInstance, GameApi } from './types';
import {
  definitionRow,
  element,
  osButton,
  setAvailability,
} from './ui';

function numberField(api: GameApi, field: string): number {
  const value = api.graph.getField(api.actor, field);
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0;
}

/**
 * Friday evening, and the week added up.
 *
 * There is no Saturday. Clocking off on the last day does not roll into a
 * morning, it stops - so this is the screen the week ends on, and it is the
 * only place the five days are looked at together.
 *
 * Nothing here is kept on the side. Every count is the ticket nodes read back
 * by the day they arrived on, and the money is the farm fund's own movement
 * across the week: a screen that added up its own totals is a screen that can
 * disagree with the days it is made of.
 */
export const WEEKEND_APP: AppDef = {
  id: 'weekend',
  title: 'The week',
  icon: 'icon-scorecard',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api: GameApi): AppInstance => {
    const root = element('section', 'app-page scorecard-app weekend-app', 'weekend-app');

    const heading = element('h2', undefined, 'weekend-heading');
    const stamp = element('p', 'scorecard-stamp', 'weekend-stamp');
    const days = element('section', 'scorecard-panel', 'weekend-days');
    const totals = element('section', 'scorecard-panel', 'weekend-totals');
    const columns = element('div', 'scorecard-columns');
    columns.append(days, totals);

    const verdict = element('section', 'weekend-verdict', 'weekend-verdict');
    const farm = element('section', 'scorecard-farm', 'weekend-farm');

    const footer = element('div', 'scorecard-footer');
    const onward = osButton('Start Monday again', 'weekend-onward', {
      primary: true,
    });
    const note = element('p', 'scorecard-note', 'weekend-note');
    footer.append(onward, note);

    root.append(heading, stamp, columns, verdict, farm, footer);

    onward.addEventListener('click', () => {
      if (api.day.reviewOutcome() !== 'fired') {
        return;
      }

      api.restartWeek();
    });

    const renderDays = (card: Readonly<WeekScorecard>): void => {
      days.replaceChildren();
      const title = element('h3');
      title.textContent = 'The five days';
      const list = element('dl', 'scorecard-rows');
      days.append(title, list);

      for (const line of card.days) {
        const row = definitionRow(
          list,
          line.label,
          `weekend-day-${String(line.day)}`,
        );
        row.textContent = `${String(line.ledger.arrived)} in, `
          + `${String(line.ledger.closed)} closed, `
          + `${String(line.ledger.breached)} missed`;
      }
    };

    const renderTotals = (card: Readonly<WeekScorecard>): void => {
      totals.replaceChildren();
      const title = element('h3');
      title.textContent = 'The week';
      const list = element('dl', 'scorecard-rows');
      totals.append(title, list);

      definitionRow(list, 'Tickets in', 'weekend-arrived')
        .textContent = String(card.arrived);
      definitionRow(list, 'Closed', 'weekend-closed')
        .textContent = String(card.closed);
      definitionRow(list, 'Deadlines missed', 'weekend-breached')
        .textContent = String(card.breached);
      definitionRow(list, 'Still open', 'weekend-open')
        .textContent = String(card.stillOpen);
      definitionRow(list, 'Reputation at the review', 'weekend-reputation')
        .textContent = `${String(card.reputation)} of ${
          String(REVIEW_PASS_REPUTATION)
        } needed`;

      const earned = definitionRow(list, 'Earned this week', 'weekend-earned');
      earned.textContent = `£${formatPence(card.earnedPence)}`;
      earned.dataset.total = 'true';

      if (card.outcome === 'passed') {
        definitionRow(list, 'Probation bonus, included', 'weekend-bonus')
          .textContent = `£${formatPence(PROBATION_BONUS_PENCE)}`;
      }
    };

    const renderVerdict = (card: Readonly<WeekScorecard>): void => {
      verdict.replaceChildren();
      const title = element('h3', undefined, 'weekend-verdict-title');
      const body = element('p', undefined, 'weekend-verdict-body');
      verdict.dataset.outcome = card.outcome;

      if (card.outcome === 'passed') {
        title.textContent = 'Probation: passed';
        body.textContent = 'Week two starts on Monday with the same queue, '
          + 'the same lead and one fewer thing to worry about. It is not '
          + 'written yet, which is the most honest thing this screen can '
          + 'tell you.';
      } else if (card.outcome === 'fired') {
        title.textContent = 'Probation: not continued';
        body.textContent = 'They keep the lanyard, the desk and the queue. '
          + 'You keep the fund, because the fund was never theirs - and the '
          + 'week starts again on a Monday that is almost, but not exactly, '
          + 'this one.';
      } else {
        title.textContent = 'The week is not over';
        body.textContent = 'Nobody has had the conversation yet, so there is '
          + 'nothing here to read. It happens on the Friday, at three.';
      }

      verdict.append(title, body);
    };

    const renderFarm = (banked: number): void => {
      farm.replaceChildren();
      const title = element('h3');
      title.textContent = 'The farm';
      const bar = element('div', 'scorecard-bar', 'weekend-farm-bar');
      const fill = element('div', 'scorecard-bar-fill');
      const progress = farmProgress(banked);
      fill.style.setProperty('--fill', `${String(progress * 100)}%`);
      bar.append(fill);
      bar.setAttribute('role', 'img');
      bar.dataset.progress = progress.toFixed(6);
      bar.setAttribute(
        'aria-label',
        `Farm fund: £${formatPence(banked)} of £${formatPence(FARM_PRICE_PENCE)}`,
      );

      const total = element('p', 'scorecard-farm-total', 'weekend-farm-total');
      total.textContent = `£${formatPence(banked)} of £${
        formatPence(FARM_PRICE_PENCE)
      } banked.`;
      farm.append(title, bar, total);
    };

    const render = (): void => {
      const card = api.day.weekScorecard();
      const ended = api.day.weekEnded();
      const attempt = numberField(api, FIELDS.weekAttempt);

      root.dataset.outcome = card.outcome;
      root.dataset.ended = String(ended);
      heading.textContent = attempt > 1
        ? `The probation week, attempt ${String(attempt)}`
        : 'The probation week';
      stamp.textContent = ended
        ? 'Friday, gone five. The building is emptying and the week is what '
          + 'it is.'
        : 'The week is still being worked. This is what it would say if it '
          + 'stopped now.';

      renderDays(card);
      renderTotals(card);
      renderVerdict(card);
      renderFarm(card.bankedPence);

      onward.textContent = card.outcome === 'fired'
        ? 'Start Monday again'
        : 'Week two';
      setAvailability(
        onward,
        card.outcome === 'fired'
          ? ended
            ? null
            : 'The week has not been clocked off yet. There is nothing to '
              + 'start again from until it has.'
          : card.outcome === 'passed'
            ? 'Week two is not built yet. It is Monday, it is the same '
              + 'corridor, and it is waiting on the next milestone.'
            : 'Nobody has had the conversation yet.',
      );
      note.textContent = card.outcome === 'fired'
        ? 'Starting again keeps the fund and what you had read. Everything '
          + 'else is Monday morning, slightly rearranged.'
        : 'The fund carries. It always carries.';
    };

    host.replaceChildren(root);
    render();

    const unsubscribeDay = api.day.onChanged(() => {
      render();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeDay();
        unsubscribeWorld();
        root.remove();
      },
    };
  },
};
