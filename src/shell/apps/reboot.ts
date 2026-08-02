import { UPDATES_WITHDRAWN_REASON } from '../../world/actions';
import { FLAVOR, flavorText, postponeWindow } from '../../world/interruptions';
import { formatSimTime } from '../clock-format';
import { INSTALLING_UPDATES_REASON } from '../day-driver';
import { createIcon } from '../icons';
import { createUpdateScreen, updatePercent } from '../update-screen';
import type { AppDef, AppInstance, GameApi } from './types';
import { element, osButton, refusalLine, setFlag, setText } from './ui';

/**
 * The workstation, having its own morning.
 *
 * It is the OS talking, which is why it is neither of the two windows this
 * family already had. A call is a person on a phone and has a portrait and a
 * name; a meeting is a room with people in it saying things. This is a dialog
 * from a machine that has decided, and the register is the one every one of us
 * has read at ten past two on a Thursday: a headline, a percentage that is not
 * really a percentage, and one imperative sentence about not turning it off.
 *
 * TWO SURFACES, one window, because they are two halves of one beat and the
 * player meets them in that order.
 *
 * THE COUNTDOWN is what runs while the reboot has been pushed back. Those
 * minutes are the ones the player BOUGHT - the desk is theirs, the boss key
 * works, the lead still comes round, the queue is still workable - and the
 * only thing this window does during them is say how many are left. That is
 * the whole skill of the mechanic: three windows of ten, five and two minutes
 * are a budget to spend getting to a boundary, and a countdown that owned the
 * desk would be spending the budget for the player.
 *
 * THE UPDATE SCREEN is what runs while it actually owns the desk, at whichever
 * arrival the player stops pushing. The desk refuses every verb through the
 * driver's own seam (`INSTALLING_UPDATES_REASON`, dispatched at, printed here)
 * and the two buttons on it are the last chance to move it - until the budget
 * is spent, when there are no buttons at all, which is the moment the mechanic
 * is actually about.
 *
 * Nothing about the state of any of this lives here. Which minute it is, how
 * many pushes are left and where the next arrival landed are all read off the
 * day, which derives them from the seeded schedule and the world's own ledger
 * - so a save taken mid-countdown reopens on the same minute with the same
 * number of pushes left, having saved neither.
 */
export const REBOOT_APP: AppDef = {
  id: 'reboot',
  title: 'Workstation update',
  icon: 'icon-day',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api: GameApi): AppInstance => {
    const root = element('section', 'app-page reboot-app', 'reboot-app');

    const screen = createUpdateScreen('reboot-screen');

    /** The dialog the machine puts over its own screen while it still asks. */
    const dialog = element('div', 'reboot-dialog', 'reboot-dialog');
    const dialogHead = element('div', 'reboot-dialog-head');
    dialogHead.append(createIcon('icon-day'));
    const subject = element('p', 'reboot-subject', 'reboot-subject');
    dialogHead.append(subject);
    const countdown = element('p', 'reboot-countdown', 'reboot-countdown');
    const detail = element('p', 'reboot-detail', 'reboot-detail');

    const answers = element('div', 'call-answers');
    /**
     * Postpone is the PRIMARY, and Restart now is not.
     *
     * The desktop puts the keyboard on the primary control of any screen the
     * day opens - a manager in the doorway, a review at three - which is right
     * and is why it exists. It means the auto-focused button here is whichever
     * one carries that class, and one of these two is irreversible: Restart
     * now spends every window left in the budget, and the budget IS the
     * mechanic. A dialog that lands the cursor on the destructive answer and
     * waits for a player to hit Enter is a trap with good manners.
     *
     * So the safe answer takes the focus, and the one that gives up the
     * afternoon has to be aimed at.
     */
    const postpone = osButton('Postpone', 'reboot-postpone', { primary: true });
    const now = osButton('Restart now', 'reboot-restart-now');
    answers.append(postpone, now);

    /**
     * The refusal that has no button, which is the point of it.
     *
     * A machine-source interruption cannot be declined and the world says so
     * in its own sentence; a Decline button that refused every single time
     * would be teaching the same rule by wasting the player's click, which is
     * the shape of a lie you have to press twice to find. So the sentence is
     * on the dialog, unprompted, in the world's own words - and the world
     * still answers it if anything ever does reach for that verb.
     */
    const withdrawn = element('p', 'reboot-withdrawn', 'reboot-withdrawn');
    withdrawn.textContent = UPDATES_WITHDRAWN_REASON;

    const feedback = element('div', 'call-feedback');
    const note = element('p', 'reboot-note', 'reboot-note');

    dialog.append(dialogHead, countdown, detail, answers, withdrawn);
    root.append(screen.element, dialog, feedback, note);

    let refusal: string | null = null;

    const answer = (result: { ok: boolean; reason?: string }): void => {
      refusal = result.ok ? null : result.reason ?? null;
      render();
    };

    postpone.addEventListener('click', () => {
      answer(api.day.deferInterruption());
    });
    now.addEventListener('click', () => {
      answer(api.day.answerInterruption());
    });

    /** `10 minutes`, `1 minute` - the machine counts properly, at least. */
    const minutes = (count: number): string => (
      count === 1 ? '1 minute' : `${String(count)} minutes`
    );

    /**
     * The screen while the machine owns the desk.
     *
     * The percentage is theatre pinned to real minutes and the phases are
     * theatre pinned to the same: the first minute is spent restarting, the
     * last one is spent claiming to restore things that were never in any
     * danger, and the long middle is the number doing what those numbers do.
     */
    const renderInstalling = (
      minutesIn: number,
      length: number,
      about: string | null,
    ): void => {
      const percent = updatePercent(minutesIn, length);

      screen.render({
        phase: minutesIn === 0
          ? 'restarting'
          : percent >= 100 ? 'restoring' : 'installing',
        percent,
        subject: about,
      });
    };

    const renderDialog = (
      left: number,
      window_: number,
      about: string | null,
      answered: boolean,
    ): void => {
      const offered = left > 0 && !answered;

      setFlag(dialog, 'offered', String(offered));
      dialog.hidden = false;
      subject.textContent = about
        ?? 'Updates that were downloaded a long time ago.';
      answers.hidden = !offered;
      // The sentence outlives the buttons on purpose. At the last arrival
      // there is nothing to press, and "why is there no way out of this" is
      // exactly the question the player has then - so the reason stays up
      // until the decision is made, and goes when it has been.
      withdrawn.hidden = answered;

      if (answered) {
        setText(countdown, 'Restarting in 0 minutes.');
        setText(
          detail,
          'You pressed it yourself, which at least means it happened at a '
          + 'minute you chose. That is more than most people get out of this.',
        );
        return;
      }

      setText(countdown, 'Restarting in 0 minutes.');

      if (!offered) {
        setText(
          detail,
          'There is nothing left to press. Every window was spent, which is '
          + 'what the windows were for, and this is the other end of them.',
        );
        return;
      }

      setText(
        postpone,
        `Postpone ${minutes(window_)}`,
      );
      setText(
        detail,
        left === 1
          ? `One postpone left, and it buys ${minutes(window_)}. After that `
            + 'the button is not there.'
          : `${String(left)} postpones left. The next one buys `
            + `${minutes(window_)}, and the one after it buys less.`,
      );
    };

    /**
     * And the screen while it is merely COMING. The desk is the player's for
     * every one of these minutes, which is the thing the window has to say and
     * the thing the window must not take.
     */
    const renderCountdown = (
      away: number,
      left: number,
      about: string | null,
      at: number,
    ): void => {
      screen.render({ phase: 'restarting', percent: 0, subject: about });
      dialog.hidden = false;
      setFlag(dialog, 'offered', 'false');
      subject.textContent = about ?? 'Updates that are still going to happen.';
      setText(countdown, `Restarting in ${minutes(away)}.`);
      setText(
        detail,
        `${formatSimTime(at).time}, and it is not asking again before then. `
        + (left > 0
          ? `${String(left)} postpone${left === 1 ? '' : 's'} left after this, `
            + 'and the windows get shorter.'
          : 'That was the last window. The next one is not a question.'),
      );
      answers.hidden = true;
      withdrawn.hidden = true;
    };

    const renderQuiet = (): void => {
      screen.render({
        phase: 'restarting',
        percent: 0,
        subject: null,
      });
      dialog.hidden = true;
      setText(countdown, '');
      setText(detail, '');
    };

    const render = (): void => {
      const view = api.day.interruption();
      const live = view !== null && view.entry.source === 'machine'
        ? view
        : null;
      // A workstation that has been pushed back, and nothing else: the seam
      // filters before it selects, so an unmet call standing between now and
      // the reboot cannot suppress the countdown by being nearer.
      const coming = api.day.pendingRestart();

      setFlag(
        root,
        'reboot',
        live?.entry.id ?? coming?.entry.id ?? 'none',
      );
      setFlag(root, 'holding', String(live !== null));
      // How far into the arrival this paint is, which is the meeting window's
      // habit and is worth more here: a postpone buys its minutes from the
      // ARRIVAL, so pressing the button five minutes in spends five of them.
      // A screen that did not say which minute it was would make that
      // indistinguishable from a countdown that had lost track.
      setFlag(root, 'minutesIn', String(live?.minutesIn ?? 0));
      setFlag(
        root,
        'postponesLeft',
        String(live?.postponesLeft ?? coming?.postponesLeft ?? 0),
      );

      if (live !== null) {
        const length = live.entry.endsTick - live.entry.tick;

        renderInstalling(
          live.minutesIn,
          length,
          flavorText(live.entry, FLAVOR.subject),
        );
        renderDialog(
          live.postponesLeft,
          postponeWindow(
            live.entry,
            live.entry.postpones.length - live.postponesLeft,
          ),
          flavorText(live.entry, FLAVOR.subject),
          live.answered,
        );
        setText(note, INSTALLING_UPDATES_REASON);
      } else if (coming !== null) {
        renderCountdown(
          coming.ticksAway,
          coming.postponesLeft,
          flavorText(coming.entry, FLAVOR.subject),
          coming.entry.tick,
        );
        setText(
          note,
          'The desk is yours until it comes back. That is what the postpone '
          + 'bought and it is the only thing it bought.',
        );
      } else {
        renderQuiet();
        setText(
          note,
          'Nothing is installing. The workstation is up to date in the sense '
          + 'that it has stopped mentioning it.',
        );
      }

      feedback.replaceChildren(
        refusalLine('reboot-refusal', refusal, createIcon('icon-lock')),
      );
    };

    host.replaceChildren(root);
    render();

    /**
     * And the keyboard, which the pointer rules cannot take.
     *
     * The meeting learned this the hard way and the workstation inherits the
     * lesson unchanged: a terminal or a draft that had the cursor when the
     * takeover landed KEEPS it. World dispatches refuse, so nothing reaches
     * the queue - but the keystrokes still land in app-local state, so the
     * player types a command into a terminal that is going to refuse it, or a
     * paragraph into a draft, while a screen in front of them says the desk is
     * gone. The rule has to hold for the keyboard or the product does not have
     * it.
     *
     * Only when a machine is actually holding the desk, so opening this cold
     * from the start menu - or reading the countdown during the minutes a
     * postpone bought - steals nothing.
     */
    if (api.day.interruption()?.entry.source === 'machine') {
      root.tabIndex = -1;
      root.focus();
    }

    const unsubscribeDay = api.day.onChanged(() => {
      render();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    // The percentage is minutes wearing a costume, so the minute hand is what
    // moves it - and the countdown is nothing but minutes.
    const unsubscribeTick = api.clock.onTick(() => {
      render();
    });
    // A load is a different world, and a refusal from the one before it is a
    // sentence about a minute that no longer exists.
    const unsubscribeState = api.appState.onReplaced(() => {
      refusal = null;
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
