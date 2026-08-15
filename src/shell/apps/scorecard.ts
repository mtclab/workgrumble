import type { ReadOnlyGraphNode } from '../../engine-api';
import {
  type DayLedger,
  dayLedger,
  dayOpensTick,
  daySlip,
  FARM_PRICE_PENCE,
  farmProgress,
  formatPence,
  type PaySlip,
  ticketsArrivedOn,
  ticketsClassifiedOn,
} from '../../world/day';
import { conductSummary } from '../../world/conduct';
import { FIELDS } from '../../world/fields';
import { STARTING_REPUTATION } from '../../world/meters';
import { cellLabel } from '../../world/priority';
import { isReviewDay } from '../../world/week';
import { ticketClocks } from '../../world/sla';
import { type Misclassified, misclassifiedTickets, ticketKey } from './tickets';
import type { AppDef, AppInstance, GameApi } from './types';
import {
  definitionRow,
  element,
  osButton,
  setAvailability,
} from './ui';

/**
 * A meter, read off the player node.
 *
 * It reports what is there and says so plainly when nothing is: a world seeded
 * without the meters is a bug, and a confident zero is how that bug reaches
 * the player looking like a good day.
 */
function meterValue(api: GameApi, field: string): number | null {
  const value = api.graph.getField(api.actor, field);
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

function meterLine(api: GameApi, field: string, suffix = ''): string {
  const value = meterValue(api, field);
  return value === null ? 'Not measured' : `${String(value)}${suffix}`;
}

function ledgerFor(api: GameApi, day: number): DayLedger {
  return dayLedger(api.graph.nodesOfKind('ticket'), day);
}

/**
 * The review line, which is the whole reason reputation is a number.
 *
 * The bands are said in words because a number on its own is not a judgement,
 * and this screen is where the week's judgement is being formed.
 */
function reputationLine(reputation: number | null): string {
  if (reputation === null) {
    return 'Nobody has an opinion of you, which cannot be right.';
  }

  if (reputation >= 70) {
    return 'The lead has started saying your name in meetings you are not in, '
      + 'and means it kindly.';
  }

  if (reputation >= STARTING_REPUTATION) {
    return 'Steady. Nobody upstairs has learned your name, which at this '
      + 'stage of a probation is a compliment.';
  }

  if (reputation >= 30) {
    return 'There has been a conversation about you that you were not at.';
  }

  return 'Friday is going to be a conversation, and it will be short.';
}

/**
 * The week as the review would read it tonight, and what that means.
 *
 * This is the one number the Friday conversation is decided on, so it is on
 * the screen every evening rather than for the first time at three o'clock on
 * the last day: a mark nobody sees until the verdict is a mark nobody can have
 * played toward. It is a percentage of the work - half of it the queue you
 * closed, half of it the deadlines you kept - and the bands below are said
 * against the bar rather than against a hundred, because the bar is the only
 * part of the scale that decides anything.
 */
function weekLine(reading: number, bar: number): string {
  if (reading >= bar + 25) {
    return 'Comfortably above the line, which at this stage of a probation is '
      + 'as much as anybody gets.';
  }

  if (reading >= bar + 5) {
    return 'Above the line, with enough in hand that one bad afternoon would '
      + 'not decide it.';
  }

  if (reading >= bar) {
    return 'Above the line by the width of the line. A day like today again '
      + 'and Friday is a coin toss.';
  }

  return 'Below the line. As it stands, the conversation on Friday is the '
    + 'short one.';
}

/**
 * How many times the lead came round the corner and found something. Said in
 * words as well as a number, because "1" is a fact and "once" is a review.
 */
function caughtLine(caught: number | null): string {
  if (caught === null) {
    return 'Not measured';
  }

  if (caught === 0) {
    return '0 · Nobody came round at a bad moment. That is skill, or it is '
      + 'Tuesday.';
  }

  return caught === 1
    ? '1 · One conversation, which is one more than the review would like.'
    : `${String(caught)} · He has started walking past on purpose.`;
}

/** What the machine had off you today, in money rather than in cans. */
function spendLine(pence: number | null): string {
  if (pence === null) {
    return 'Not measured';
  }

  return pence === 0
    ? '£0.00 · The machine went unfed. Your hands are your own.'
    : `£${formatPence(pence)} · Taken off the take-home below, because the `
      + 'machine does not do invoices.';
}

/**
 * Tickets whose response clock ran out before anybody said a word - counted
 * over the day they ARRIVED in, as that day stood when it ended.
 *
 * Two scopings, and both had to be fixed. It used to be handed every ticket in
 * the world, so one missed response on Monday was reported again on Tuesday's
 * clean scorecard for the rest of the week. And it read the clock as it stands
 * NOW, so a Monday ticket answered late on the Tuesday turned Monday's row
 * from clean to late, days after Monday's pay was banked. A response is owed
 * from the minute the ticket landed, so the arrival cohort is the right one -
 * but the question is "had it been answered by the time this day ended", and
 * that is a question about a moment which has to be the day's own.
 */
function lateResponses(
  nodes: readonly ReadOnlyGraphNode[],
  asOf: number,
): number {
  return nodes.filter(
    (node) => ticketClocks(node, asOf).response.breached,
  ).length;
}

/** What a day is answerable for, and the two counts scored over it. */
export interface ScorecardCounts {
  readonly cohort: readonly ReadOnlyGraphNode[];
  readonly lateResponses: number;
  readonly misclassified: readonly Misclassified[];
}

/**
 * The day's cohort and everything counted over it, in one place.
 *
 * One function rather than three call sites, because the bug was that they
 * disagreed: the ledger scoped itself to the tickets that arrived today and
 * the other two were handed every ticket in the world, so one missed response
 * on Monday was reported again on Tuesday's clean scorecard, and Wednesday's,
 * and at the review. Any number this screen prints about "today" comes from
 * here, so there is one answer to "which tickets is today".
 */
export function scorecardCounts(
  api: Pick<GameApi, 'graph' | 'clock'>,
  day: number,
): ScorecardCounts {
  const tickets = api.graph.nodesOfKind('ticket');
  const cohort = ticketsArrivedOn(tickets, day);
  // The day being scored, as it stood when it ended - or as it stands right
  // now if it has not. Either way it is the moment the day is answerable for,
  // and never a later one.
  const asOf = Math.min(api.clock.now(), dayOpensTick(day + 1));

  return {
    cohort,
    lateResponses: lateResponses(cohort, asOf),
    // Scoped to the triage FILED in this day rather than to the tickets that
    // arrived in it. A cell is mutable while a ticket is open, so reading the
    // arrival cohort's current cells reported Monday's misreading again on
    // every clean day after it - and hid a re-triage done on the Wednesday,
    // which is the day somebody actually got it wrong.
    misclassified: misclassifiedTickets(api, ticketsClassifiedOn(tickets, day)),
  };
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

    const renderLedger = (
      ledger: Readonly<DayLedger>,
      counts: Readonly<ScorecardCounts>,
    ): void => {
      ledgerPanel.replaceChildren();
      const title = element('h3');
      title.textContent = 'The work';
      const list = element('dl', 'scorecard-rows');
      ledgerPanel.append(title, list);

      definitionRow(list, 'Arrived today', 'scorecard-arrived')
        .textContent = String(ledger.arrived);
      definitionRow(list, 'Tickets closed', 'scorecard-closed')
        .textContent = String(ledger.closed);
      // Binding clocks only (D4, 0.37.1): an external tier's resolution is
      // contractual best effort, so its breaches are not in this number and
      // not in the pay - what its contract binds bills through the meters'
      // ack and cadence stamps, read per ticket on the queue. A per-day
      // stamp row here needs day-attributed stamps and is a named backlog
      // item on #64's close-out, not an oversight.
      definitionRow(list, 'Resolution SLAs missed (binding clocks)', 'scorecard-breaches')
        .textContent = String(ledger.breached);
      definitionRow(list, 'Response SLAs missed', 'scorecard-late-response')
        .textContent = String(counts.lateResponses);
      definitionRow(list, 'Still open at 17:00', 'scorecard-open')
        .textContent = String(ledger.stillOpen);
      definitionRow(list, 'Stress carried', 'scorecard-stress')
        .textContent = meterLine(api, FIELDS.stress, ' of 100');
      definitionRow(list, 'Suspicion', 'scorecard-suspicion')
        .textContent = meterLine(api, FIELDS.suspicion, ' of 100');
      definitionRow(list, 'Suspicious minutes', 'scorecard-suspicion-events')
        .textContent = meterLine(api, FIELDS.suspicionEvents);
      // What the lead actually saw, which is a different number from what he
      // might have: a day can be full of suspicious minutes and clean of
      // conversations, and the review reads both.
      definitionRow(list, 'Caught in the act', 'scorecard-caught')
        .textContent = caughtLine(meterValue(api, FIELDS.caughtEvents));
      definitionRow(list, 'Desk consumables', 'scorecard-consumables')
        .textContent = spendLine(meterValue(api, FIELDS.consumableSpend));

      const reputation = meterValue(api, FIELDS.reputation);
      definitionRow(list, 'Reputation', 'scorecard-reputation')
        .textContent = reputation === null
          ? 'Not measured'
          : `${String(reputation)} · ${reputationLine(reputation)}`;

      // And the number the review actually turns on, which is a different
      // thing from the meter above it: reputation is how the building feels
      // about you, this is how much of the work got done and how much of it
      // got done in time.
      const reading = api.day.weekReading();
      const conduct = api.day.conductReading();
      definitionRow(list, 'The week, so far', 'scorecard-week')
        .textContent = `${String(reading)} of 100, and ${
          String(conduct.bar)
        } is the pass · ${weekLine(reading, conduct.bar)}`;

      // And the other folder, which is not a score and never becomes one. It
      // is on the evening scorecard for the same reason the mark is: a thing
      // first seen at the verdict is a thing nobody could have played toward.
      definitionRow(list, 'On file', 'scorecard-file')
        .textContent = conductSummary(conduct);

      // And the weather, every evening, for the third time and the same
      // reason. In a quiet week it says nothing is proposed, which is the
      // sentence that makes the first announcement land as a season turning
      // rather than as a mechanic somebody sprang. In a week with a round on
      // it is the ranking, moving as the queue moves.
      definitionRow(list, 'The round', 'scorecard-round')
        .textContent = api.day.pressureSummary();

      renderTriage(counts.misclassified);
    };

    /**
     * What the triage was worth, which is the half of the day nobody counts
     * until a review does. A wrong cell is not a wrong number - it is a wrong
     * reading of the estate, so both cells are printed side by side.
     */
    const renderTriage = (wrong: readonly Misclassified[]): void => {
      const panel = element('div', 'scorecard-triage', 'scorecard-triage');
      const title = element('h4');
      title.textContent = 'Triage';
      panel.append(title);

      const summary = element('p', undefined, 'scorecard-misclassified');
      summary.textContent = wrong.length === 0
        ? 'Every ticket triaged today was read the way the estate reads. '
          + 'Nobody will ever mention it.'
        : `${String(wrong.length)} ticket(s) triaged against the evidence.`;
      panel.append(summary);

      if (wrong.length > 0) {
        const list = element('ul', 'scorecard-triage-list');

        for (const entry of wrong) {
          const item = element(
            'li',
            undefined,
            `scorecard-misclassified-${ticketKey(entry.id)}`,
          );
          item.textContent = `${entry.title}: you filed ${
            cellLabel(entry.assigned)
          }, the estate says ${cellLabel(entry.truth)}.`;
          list.append(item);
        }

        panel.append(list);
      }

      ledgerPanel.append(panel);
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
      const slip = daySlip(ledger, meterValue(api, FIELDS.consumableSpend) ?? 0);
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

      // One cohort, read once, for every number on this panel: the tickets
      // that arrived on the day being scored.
      renderLedger(ledger, scorecardCounts(api, day));
      renderPay(slip);
      renderFarm(scored ? banked + slip.net : banked);

      // Friday is not a day like the others: there is no tomorrow morning to
      // start, so clocking off ends the week and puts the week's own screen up.
      const lastDay = isReviewDay(day);
      clockOff.textContent = lastDay ? 'Clock off for the week' : 'Clock off';
      setAvailability(
        clockOff,
        scored
          ? null
          : 'Clocking off is for the end of a day. This one is still on.',
      );
      note.textContent = scored
        ? lastDay
          ? 'That is the week. Clocking off banks the last of it and adds the '
            + 'five days up.'
          : 'Clocking off banks the take-home and starts tomorrow morning.'
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
