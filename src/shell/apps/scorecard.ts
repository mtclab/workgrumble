import {
  type DayLedger,
  dayLedger,
  daySlip,
  FARM_PRICE_PENCE,
  farmProgress,
  formatPence,
  type PaySlip,
} from '../../world/day';
import { FIELDS } from '../../world/fields';
import type { AppDef, AppInstance, GameApi } from './types';
import {
  definitionRow,
  element,
  osButton,
  setAvailability,
} from './ui';

/**
 * A meter lane B has not built yet, said honestly.
 *
 * The slot is wired to the field it will read, so the day it starts being
 * measured this line starts telling the truth without anybody remembering to
 * come back here. Until then it says it is not measured - which is a different
 * sentence from a confident zero, and the only one the scorecard is allowed.
 */
function meterLine(api: GameApi, field: string): string {
  const value = api.graph.getField(api.actor, field);

  return typeof value === 'number'
    ? String(value)
    : 'Not measured yet - lands with the pressure layer';
}

function ledgerFor(api: GameApi, day: number): DayLedger {
  return dayLedger(api.graph.nodesOfKind('ticket'), day);
}

/**
 * The day-end scorecard: what the day was, in the two currencies the game
 * keeps - tickets and money.
 *
 * It reports only what exists. The ticket ledger is counted over the tickets
 * the day itself brought in, the payslip is computed from that ledger, and the
 * meters that have not been built are labelled as not built rather than shown
 * as zero. A scorecard that flatters is a scorecard nobody reads twice.
 */
export const SCORECARD_APP: AppDef = {
  id: 'scorecard',
  title: 'Day Scorecard',
  icon: 'icon-scorecard',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api): AppInstance => {
    const root = element('section', 'app-page scorecard-app', 'scorecard-app');

    const heading = element('h2', undefined, 'scorecard-heading');
    const stamp = element('p', 'scorecard-stamp', 'scorecard-stamp');

    const ledgerPanel = element('section', 'scorecard-panel', 'scorecard-work');
    const payPanel = element('section', 'scorecard-panel', 'scorecard-pay');
    const columns = element('div', 'scorecard-columns');
    columns.append(ledgerPanel, payPanel);

    const farm = element('section', 'scorecard-farm', 'scorecard-farm');

    const footer = element('div', 'scorecard-footer');
    const clockOff = osButton('Clock off', 'scorecard-clock-off', {
      primary: true,
    });
    const note = element('p', 'scorecard-note', 'scorecard-note');
    footer.append(clockOff, note);

    root.append(heading, stamp, columns, farm, footer);

    clockOff.addEventListener('click', () => {
      api.day.clockOff();
    });

    const renderLedger = (ledger: Readonly<DayLedger>): void => {
      ledgerPanel.replaceChildren();
      const title = element('h3');
      title.textContent = 'The work';
      const list = element('dl', 'scorecard-rows');
      ledgerPanel.append(title, list);

      definitionRow(list, 'Arrived today', 'scorecard-arrived')
        .textContent = String(ledger.arrived);
      definitionRow(list, 'Tickets closed', 'scorecard-closed')
        .textContent = String(ledger.closed);
      definitionRow(list, 'SLA breaches', 'scorecard-breaches')
        .textContent = String(ledger.breached);
      definitionRow(list, 'Still open at 17:00', 'scorecard-open')
        .textContent = String(ledger.stillOpen);
      // Wired to the fields the meters will live in; see `meterLine`.
      definitionRow(list, 'Stress carried', 'scorecard-stress')
        .textContent = meterLine(api, FIELDS.stress);
      definitionRow(list, 'Suspicion', 'scorecard-suspicion')
        .textContent = meterLine(api, FIELDS.suspicion);
    };

    const renderPay = (slip: Readonly<PaySlip>): void => {
      payPanel.replaceChildren();
      const title = element('h3');
      title.textContent = 'The payslip';
      const list = element('dl', 'scorecard-rows');
      payPanel.append(title, list);

      slip.lines.forEach((line, index) => {
        const row = definitionRow(
          list,
          line.label,
          `scorecard-pay-line-${String(index)}`,
        );
        row.textContent = `${line.pence < 0 ? '-' : ''}£${
          formatPence(Math.abs(line.pence))
        }`;
        row.dataset.deduction = String(line.pence < 0);
      });

      const net = definitionRow(list, 'Take-home, today', 'scorecard-net');
      net.textContent = `£${formatPence(slip.net)}`;
      net.dataset.total = 'true';
    };

    const renderFarm = (banked: number): void => {
      farm.replaceChildren();
      const title = element('h3');
      title.textContent = 'The farm';
      const bar = element('div', 'scorecard-bar', 'scorecard-farm-bar');
      const fill = element('div', 'scorecard-bar-fill');
      const progress = farmProgress(banked);
      fill.style.setProperty('--fill', `${String(progress * 100)}%`);
      bar.append(fill);
      bar.setAttribute('role', 'img');
      bar.dataset.progress = progress.toFixed(6);
      bar.setAttribute(
        'aria-label',
        `Farm fund: £${formatPence(banked)} of £${
          formatPence(FARM_PRICE_PENCE)
        }`,
      );

      const total = element('p', 'scorecard-farm-total', 'scorecard-farm-total');
      total.textContent = `£${formatPence(banked)} of £${
        formatPence(FARM_PRICE_PENCE)
      } banked.`;
      const joke = element('p', 'scorecard-farm-note');
      joke.textContent = 'The land is not going anywhere. Neither, at this '
        + 'rate, are you.';

      farm.append(title, bar, total, joke);
    };

    const render = (): void => {
      const state = api.day.state();
      const scored = state === 'day_end';
      // Always the day the clock is on: before 17:00 that is a day still being
      // worked, and after clocking off it is tomorrow, which has not happened
      // yet. Both are said out loud rather than dressed up as a result.
      const day = api.day.day();
      const ledger = ledgerFor(api, day);
      const slip = daySlip(ledger);
      const bankedBefore = api.graph.getField(api.actor, FIELDS.farmFund);
      const banked = typeof bankedBefore === 'number' ? bankedBefore : 0;

      root.dataset.dayState = state;
      heading.textContent = scored
        ? `Day ${String(day)}, clocking off`
        : `Day ${String(day)} has not been scored yet`;
      stamp.textContent = scored
        ? 'Seventeen hundred. What the day was, before anybody rounds it up.'
        : 'The scorecard is written at 17:00. Until then this is a preview, '
          + 'and it will change under you.';

      renderLedger(ledger);
      renderPay(slip);
      renderFarm(scored ? banked + slip.net : banked);

      setAvailability(
        clockOff,
        scored
          ? null
          : 'Clocking off is for the end of a day. This one is still on.',
      );
      note.textContent = scored
        ? 'Clocking off banks the take-home and starts tomorrow morning.'
        : 'Come back at 17:00. It will be here, and so will the queue.';
    };

    host.replaceChildren(root);
    render();

    // Deliberately not on the tick. Nothing here is a clock: the ledger moves
    // when the world does, and the day moves when the day does. Repainting a
    // scorecard 900 times while the night goes past is work nobody sees.
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
