import {
  FARM_PRICE_PENCE,
  farmProgress,
  formatPence,
} from '../../world/day';
import {
  employerFor,
  employerName,
  nextEmployerAfter,
} from '../../world/employers';
import { FIELDS } from '../../world/fields';
import { offerTone } from '../../world/offer';
import {
  PROBATION_BONUS_PENCE,
  REDUNDANCY_PAYMENT_PENCE,
  REVIEW_PASS_PERFORMANCE,
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
 * One of the two halves of the mark: the fraction, and the percentage it comes
 * to. A week with nothing in it has no share of anything, and says so rather
 * than dividing by nought and printing a hundred percent for doing nothing.
 */
function shareLine(part: number, whole: number): string {
  return whole <= 0
    ? 'Nothing arrived, so there is nothing to have kept up with.'
    : `${String(part)} of ${String(whole)} · ${
      String(Math.round(100 * part / whole))
    }%`;
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
    /**
     * The offer, which is where a probation actually leads once the switching
     * spine exists: you passed, so you got the job; you were let go, so you got
     * a job. The next employer is named here in words the world does not have to
     * read a graph for - the offer runs between two companies - and the tone
     * follows the verdict: a pass is an offer you earned, a firing the one you
     * could still get, a redundancy the even-handed one.
     */
    const offer = element('section', 'weekend-offer', 'weekend-offer');
    const farm = element('section', 'scorecard-farm', 'weekend-farm');

    const footer = element('div', 'scorecard-footer');
    const onward = osButton('Start Monday again', 'weekend-onward', {
      primary: true,
    });
    // The second door, and it only exists on a firing. A pass or a redundancy
    // walks straight out through the onward button above - the offer IS the way
    // on - so this is the alternative to starting the same week again: take the
    // worse job elsewhere rather than grind the Monday over. Both are honest;
    // neither is punished into non-existence.
    const accept = osButton('Take the offer', 'weekend-accept-offer', {
      primary: false,
    });
    /**
     * And the third door (E11, 0.34.0): the one that does not leave.
     *
     * It exists only on a PASS, and only while the arc has another week in it.
     * A firing has taken the desk back and a redundancy has taken the role, so
     * neither has a Monday here to come back to; week twelve has one but the
     * job does not, and the offer is what is on the other side of that.
     *
     * It is the SECOND button rather than the first on purpose, for now: the
     * offer is what a pass has always led to, the copy on this screen sells it
     * that way, and which of the two doors a passed week should press first is
     * a content question with a real answer somebody should choose rather than
     * one a slice that wires the mechanism gets to decide by button order.
     */
    const stay = osButton('Stay another week', 'weekend-stay', {
      primary: false,
    });
    const note = element('p', 'scorecard-note', 'weekend-note');
    footer.append(onward, accept, stay, note);

    root.append(heading, stamp, columns, verdict, offer, farm, footer);

    // The onward button carries whichever forward step the verdict makes
    // primary: the retry after a firing, the offer after anything else. The
    // world decides which - a screen that re-derived it would be a second
    // opinion about the one thing the player is owed a straight answer on.
    onward.addEventListener('click', () => {
      const outcome = api.day.reviewOutcome();

      if (outcome === 'fired') {
        api.restartWeek();
        return;
      }

      if (outcome === 'passed' || outcome === 'redundant') {
        api.acceptOffer();
      }
    });

    stay.addEventListener('click', () => {
      // The world verb carries the whole guard - not over yet, fired, made
      // redundant, out of weeks - so a stray click costs a sentence rather than
      // a wrong Monday, exactly as the accept below does.
      api.stayAnotherWeek();
    });

    accept.addEventListener('click', () => {
      // Only the firing wires the accept button up, so this is the desperate
      // offer being taken. The guard on the world verb refuses it anywhere the
      // week is not over, so a stray click before the verdict costs a sentence
      // rather than a wrong switch.
      api.acceptOffer();
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

      // Only where contracts exist (D4, 0.37.1): the tiered arrivals that
      // missed the clocks their contract binds. Absent in-house, so every
      // shipped in-house weekend renders byte-identically - and present at
      // the MSP, where the review's attainment half counts it and a screen
      // without the row would print a mark its own lines cannot explain.
      if (card.contractMissed > 0) {
        // Per TICKET, not per stamp - the daily row counts charges landing
        // on a day, this counts arrivals that ever missed a promise, and the
        // two labels say so apart so five daily rows are not expected to sum
        // to this one (0.38.0 review).
        definitionRow(list, 'Tickets that missed a contract clock', 'weekend-contract-missed')
          .textContent = String(card.contractMissed);
      }

      definitionRow(list, 'Still open', 'weekend-open')
        .textContent = String(card.stillOpen);
      // The two ratios the mark is made of, each printed as the fraction it
      // actually is and then as the percentage it turns into, so that the row
      // underneath is arithmetic the player can follow rather than a number
      // they have to believe.
      definitionRow(list, 'Queue closed', 'weekend-resolution')
        .textContent = shareLine(card.closed, card.arrived);
      definitionRow(list, 'Deadlines kept', 'weekend-attainment')
        .textContent = shareLine(
          card.arrived - card.breached - card.contractMissed,
          card.arrived,
        );
      // Said as what it is. The lead does not read a meter at five past three,
      // he reads the week - and a screen that printed the live number beside a
      // verdict that number did not produce is a screen arguing with itself
      // about the one thing the player is owed an honest account of.
      //
      // It is not the average of the two rows above and it does not claim to
      // be: those are the week whole, this is the week as it stood at the end
      // of each day, folded so that Friday is half the answer and Monday is a
      // sixteenth of it. Both facts are on the screen, and the sentence says
      // which is which.
      definitionRow(list, 'The week, as he read it', 'weekend-performance')
        .textContent = `${String(card.performance)} out of 100, against the ${
          String(card.bar)
        } he needs. The two rows above, taken at the end of every day and `
          + 'weighted toward how the week ended.';
      // And why the number beside it is the number it is. The bar is the
      // published 45 in a week nobody had a reason to look into, and higher in
      // one somebody did - so the row that names it has to say which week this
      // was, in the words the world wrote down at three o'clock.
      definitionRow(list, 'Why that number', 'weekend-conduct')
        .textContent = card.conduct === ''
          ? `The published pass mark, which is ${
            String(REVIEW_PASS_PERFORMANCE)
          }. Nobody opened anything.`
          : card.conduct;
      // And, in a week where a round was on, the other thing that was read:
      // the ranking, the three lines it was scored from and the person
      // immediately either side. A quiet week says so rather than leaving the
      // row off, because "there is no round on" is information the first time
      // somebody plays a week where there is.
      definitionRow(list, 'The pool', 'weekend-criteria')
        .textContent = card.criteria;
      // And the row the timesheet put on this card (0.30.0): what the business
      // makes of the hours. It is the ONLY row here that feeds into nothing -
      // the mark above it is the whole verdict and this is not a term in it -
      // and it says the number, the target, and that it is not a term in the
      // mark, because a week that was honest about its hours must not be a week
      // that reads as a worse one.
      //
      // Only where a target exists (0.39.0): the rung table asks nothing of a
      // probationer, whose sheet is one bucket a day by construction, so that
      // card carries no row at all rather than a number with a blank beside it -
      // exactly as the contract row above only appears where contracts do, and
      // for the same reason.
      if (card.utilisation !== '') {
        definitionRow(list, 'Utilisation', 'weekend-utilisation')
          .textContent = card.utilisation;
      }

      const earned = definitionRow(list, 'Earned this week', 'weekend-earned');
      earned.textContent = `£${formatPence(card.earnedPence)}`;
      earned.dataset.total = 'true';

      if (card.outcome === 'passed') {
        definitionRow(list, 'Probation bonus, included', 'weekend-bonus')
          .textContent = `£${formatPence(PROBATION_BONUS_PENCE)}`;
      }

      if (card.outcome === 'redundant') {
        // A week's notice, and the row says why it is a week: statutory
        // redundancy pay starts at two years of service and nobody here has
        // two years. It is the correct amount and it is nearly nothing, which
        // is the true version of the joke rather than a windfall.
        definitionRow(list, 'Notice, paid in lieu', 'weekend-notice')
          .textContent = `£${formatPence(REDUNDANCY_PAYMENT_PENCE)} · one `
            + 'week. Statutory redundancy pay needs two years of service, and '
            + 'this is not two years.';
      }
    };

    const renderVerdict = (card: Readonly<WeekScorecard>): void => {
      verdict.replaceChildren();
      const title = element('h3', undefined, 'weekend-verdict-title');
      const body = element('p', undefined, 'weekend-verdict-body');
      verdict.dataset.outcome = card.outcome;

      if (card.outcome === 'passed') {
        title.textContent = 'Probation: passed';
        body.textContent = 'The probation is over. What comes next is not the '
          + 'same queue and the same lead - it is a job, somewhere else, with '
          + 'the standing you built to walk in on. The offer is below.';
      } else if (card.outcome === 'fired') {
        title.textContent = 'Probation: not continued';
        body.textContent = 'They keep the lanyard, the desk and the queue. '
          + 'You keep the fund, because the fund was never theirs - and the '
          + 'week starts again on a Monday that is almost, but not exactly, '
          + 'this one.';
      } else if (card.outcome === 'redundant') {
        /**
         * The third ending, and the one that is not a loss.
         *
         * It says the four true things and it does not dress any of them up:
         * the role went rather than the person, the payment is a week because
         * two years is what statutory redundancy pay needs and nobody here has
         * two years, the file does not travel because it belongs to the people
         * who wrote it, and what is on the other side is a different employer.
         * The last of those is a seam rather than a screen, and the button
         * below says so in the same words the passed ending uses for week two.
         */
        title.textContent = 'Role: made redundant';
        body.textContent = 'Not for cause, and it says so on the letter: the '
          + 'role goes, the notice is paid, and the reference will be the '
          + 'dull factual one. You keep the fund, you keep the week\'s notice '
          + `- £${formatPence(REDUNDANCY_PAYMENT_PENCE)}, which is what nine `
          + 'weeks of service is worth and no more - and you keep what you '
          + 'learned. What you do not keep is the file, because the file '
          + 'belongs to the people who wrote it, and they are staying here.';
      } else {
        title.textContent = 'The week is not over';
        body.textContent = 'Nobody has had the conversation yet, so there is '
          + 'nothing here to read. It happens on the Friday, at three.';
      }

      verdict.append(title, body);
    };

    /**
     * The offer itself, named and toned. Hidden until there is a verdict: an
     * offer before the conversation is a screen guessing at a job nobody has
     * decided you are getting.
     */
    const renderOffer = (
      card: Readonly<WeekScorecard>,
      nextName: string,
    ): void => {
      offer.replaceChildren();
      const tone = offerTone(card.outcome);

      offer.dataset.outcome = card.outcome;
      offer.hidden = tone === null;

      if (tone === null) {
        return;
      }

      offer.dataset.tone = tone;
      offer.dataset.employer = nextName;

      const title = element('h3', undefined, 'weekend-offer-title');
      const body = element('p', undefined, 'weekend-offer-body');

      if (tone === 'earned') {
        title.textContent = `The offer: ${nextName}`;
        body.textContent = `You passed, and word gets round. ${nextName} want `
          + 'you, and they are offering on the standing you earned here rather '
          + 'than a fresh probationer\'s. The desk is theirs; the reputation, '
          + 'the title and the fund come with you.';
      } else if (tone === 'even') {
        title.textContent = `The offer: ${nextName}`;
        body.textContent = 'The role went, not you, and the reference says as '
          + `much. ${nextName} are offering on the strength of it: the standing `
          + 'carries, the fund carries, and nothing follows you but the dull '
          + 'factual truth.';
      } else {
        title.textContent = `What is going: ${nextName}`;
        body.textContent = 'You were let go, and that follows you. '
          + `${nextName} know it, and the offer is a worse one for it - the `
          + 'standing takes the dent on the way out. The fund does not: the '
          + 'fund has never once been theirs.';
      }

      offer.append(title, body);
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

      const nextName = employerName(nextEmployerAfter(api.employer));

      renderDays(card);
      renderTotals(card);
      renderVerdict(card);
      renderOffer(card, nextName);
      renderFarm(card.bankedPence);

      // The onward button is the primary forward step: the retry after a
      // firing, and the offer itself after a pass or a redundancy - taking the
      // job IS the way on from those, so there is no separate button for them.
      onward.textContent = card.outcome === 'fired'
        ? 'Start Monday again'
        : card.outcome === 'passed'
          ? `Take the job at ${nextName}`
          : card.outcome === 'redundant'
            ? `Take the offer at ${nextName}`
            : 'Week two';
      setAvailability(
        onward,
        card.outcome === 'fired'
          ? ended
            ? null
            : 'The week has not been clocked off yet. There is nothing to '
              + 'start again from until it has.'
          : card.outcome === 'passed' || card.outcome === 'redundant'
            // The offer is real and built. Clocking off first is not a lock on
            // it, it is the honest order: the week is not banked until you have,
            // and the fund is what goes with you to the next desk.
            ? ended
              ? null
              : 'The offer holds - clock off first. The week is not banked '
                + 'until you have, and the fund is what walks out with you.'
            : 'Nobody has had the conversation yet.',
      );

      // The second door exists only on a firing: the desperate offer, beside
      // the retry. A pass or a redundancy has already taken the offer with the
      // onward button, so it is hidden there rather than a duplicate.
      accept.hidden = card.outcome !== 'fired';

      /**
       * And the third: staying, which only a PASS has and only while the job
       * has another week in it.
       *
       * The number is read off the world rather than counted here - the arc
       * week is a player-node field the save carries and the redundancy matrix
       * reads - and the length is read off the employer's own arc, because how
       * long a job is belongs to `pressure.ts` and nowhere else. Week twelve of
       * twelve therefore has no button rather than a disabled one: there is no
       * week thirteen to be told to wait for.
       */
      const arc = employerFor(api.employer).arc;
      const arcWeek = Math.max(1, numberField(api, FIELDS.arcWeek));
      const another = card.outcome === 'passed' && arcWeek < arc.weeks;

      stay.hidden = !another;

      if (another) {
        stay.textContent = `Stay for week ${String(arcWeek + 1)}`;
        setAvailability(
          stay,
          ended
            ? null
            : 'Clock off first. Monday is not going anywhere, and the week is '
              + 'not banked until you have.',
        );
      }

      if (card.outcome === 'fired') {
        accept.textContent = `Take the offer at ${nextName}`;
        setAvailability(
          accept,
          ended
            ? null
            : 'Clock off first; the offer is not going anywhere while you do.',
        );
      }

      note.textContent = card.outcome === 'fired'
        ? 'Start again to keep the fund and what you had read on this same '
          + 'Monday - or take the offer: a worse job, the same fund, a '
          + 'different building.'
        : card.outcome === 'passed'
          ? another
            // Two doors, said as two doors. The fund is the one thing that does
            // not depend on which - it never has - so the sentence leads with
            // the choice and ends with the joke.
            ? `Take the job elsewhere, or stay and it is week ${
              String(arcWeek + 1)
            } here on Monday. The standing you earned comes either way, and so `
              + 'does the fund, because the fund always does.'
            : 'The fund goes with you, because the fund always does - and so '
              + 'does the standing you earned to be offered the job.'
          : card.outcome === 'redundant'
            ? 'The fund carries, the notice is in it, and the file is not. That '
              + 'is what being cut for the weather is worth: a clean sheet and '
              + 'a week\'s money at a new desk.'
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
