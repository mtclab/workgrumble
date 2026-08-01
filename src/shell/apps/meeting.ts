import { FIELDS } from '../../world/fields';
import { FLAVOR, flavorText } from '../../world/interruptions';
import {
  type MeetingScene,
  meetingScene,
  meetingSoFar,
} from '../../world/scenes';
import { isActiveWork } from '../../world/sla';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import type { AppDef, AppInstance, GameApi } from './types';
import { element, osButton, refusalLine, textValue } from './ui';

/**
 * The half hour nobody chose to be in.
 *
 * This is the caught scene's class of window rather than the call's: while it
 * runs the desk is genuinely unreachable, because that is the mechanic. The
 * comedy is not the meeting - the meeting is only mildly funny - it is the
 * meeting AGAINST the queue, which is why the number of tickets and the
 * number of minutes are both on this screen and neither of them is touchable.
 *
 * Every clock runs. Nothing here holds a service clock, nothing here pauses
 * the day, and the beats arrive on their own minutes, so the player watches
 * both counters at once. `core-rs/tests/lifecycle.rs` is the proof of the
 * first half - `deadline == spawn + target + held + off_hours` across a block
 * - and this window is the half they can see.
 *
 * The two refusals are on the screen ON PURPOSE. A junior cannot skip the
 * sync, and the world says so in its own sentence when either is pressed;
 * buttons that were simply absent would have taught the same hierarchy
 * without ever stating it, which is the opposite of how everything else in
 * this game teaches a rule.
 */
export const MEETING_APP: AppDef = {
  id: 'meeting',
  title: 'You are in a meeting',
  icon: 'icon-day',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api: GameApi): AppInstance => {
    const root = element('section', 'app-page meeting-app', 'meeting-app');

    const head = element('div', 'meeting-head');
    const portrait = element('div', 'caught-portrait');
    portrait.append(createIcon('icon-day'));
    const heading = element('h2', undefined, 'meeting-heading');
    const stamp = element('p', 'caught-stamp', 'meeting-stamp');
    const copy = element('div', 'caught-head-copy');
    copy.append(heading, stamp);
    head.append(portrait, copy);

    /** What is being said, so far, and not one beat further. */
    const room = element('ol', 'meeting-room', 'meeting-room');
    /** And the desk, which is the joke: visible, counted, unreachable. */
    const desk = element('p', 'meeting-desk', 'meeting-desk');

    const answers = element('div', 'call-answers');
    const later = osButton('Ask to catch up after', 'meeting-defer');
    const skip = osButton('Say you cannot make it', 'meeting-decline');
    answers.append(later, skip);

    const feedback = element('div', 'call-feedback');
    const note = element('p', 'caught-note', 'meeting-note');

    root.append(head, room, desk, answers, feedback, note);

    let refusal: string | null = null;

    const refuse = (result: { ok: boolean; reason?: string }): void => {
      refusal = result.ok ? null : result.reason ?? null;
      render();
    };

    later.addEventListener('click', () => {
      refuse(api.day.deferInterruption());
    });
    skip.addEventListener('click', () => {
      refuse(api.day.declineInterruption());
    });

    /** The room, up to the minute, with nobody having said the next one yet. */
    const renderRoom = (scene: Readonly<MeetingScene>, minutesIn: number): void => {
      room.replaceChildren();
      const said = meetingSoFar(scene, minutesIn);
      room.dataset.beats = String(said.length);

      for (const beat of said) {
        const line = element('li', 'meeting-beat');
        const who = element('span', 'meeting-beat-who');
        who.textContent = textValue(
          api.graph.getField(beat.who, FIELDS.name),
          beat.who,
        );
        const text = element('span', 'meeting-beat-line');
        text.textContent = beat.line;
        line.append(who, text);
        room.append(line);
      }

      room.scrollTop = room.scrollHeight;
    };

    /**
     * The queue, counted rather than shown.
     *
     * A list would be a list somebody would try to click, and the whole point
     * is that they cannot. A number they can watch go up is the honest version
     * of what a meeting feels like from a first-line desk.
     */
    const renderDesk = (left: number): void => {
      const open = api.graph.nodesOfKind('ticket').filter(isActiveWork).length;

      desk.dataset.open = String(open);
      desk.dataset.left = String(left);
      desk.textContent = `${String(open)} still open out there, and `
        + `${String(left)} minutes of this left. Every deadline on all of them `
        + 'is running.';
    };

    const renderEmpty = (): void => {
      root.dataset.meeting = 'none';
      heading.textContent = 'Nothing is booked';
      stamp.textContent = 'The next one is in the inbox, with an hour on it.';
      room.replaceChildren();
      desk.textContent = 'The desk is yours, which is the state most of this '
        + 'week is in and is easy to stop noticing.';
      answers.hidden = true;
      note.textContent = 'A booked half hour is not one of the things you get '
        + 'three answers to. That is what makes it the one people talk about.';
    };

    const render = (): void => {
      const view = api.day.interruption();
      const scene = view === null || view.entry.source !== 'meeting'
        ? undefined
        : meetingScene(flavorText(view.entry, FLAVOR.scene) ?? '');

      feedback.replaceChildren(
        refusalLine('meeting-refusal', refusal, createIcon('icon-lock')),
      );

      if (view === null || scene === undefined) {
        renderEmpty();
        return;
      }

      root.dataset.meeting = scene.id;
      root.dataset.minutesIn = String(view.minutesIn);
      heading.textContent = scene.title;
      stamp.textContent = `${formatSimTime(view.entry.tick).day}, `
        + `${formatSimTime(view.entry.tick).time}. Attendance was expected, `
        + 'and here you are.';
      answers.hidden = false;
      note.textContent = scene.deskNote;

      renderRoom(scene, view.minutesIn);
      renderDesk(view.entry.endsTick - api.clock.now());
    };

    host.replaceChildren(root);
    render();

    /**
     * And the keyboard, which the pointer rules could not take.
     *
     * A terminal that still had focus when the block started kept it: the
     * takeover made the desk unclickable and left Enter working, so half an
     * hour nobody could work through was half an hour anybody could work
     * through as long as they did not touch the mouse. The world refuses the
     * dispatch now - that is the load-bearing half, in `day-driver.ts` - and
     * this is the half that means the player is not typing into a window that
     * is going to refuse them. It is only done when a block is actually
     * running, so opening this cold from the start menu steals nothing.
     */
    if (api.day.interruption()?.entry.source === 'meeting') {
      root.tabIndex = -1;
      root.focus();
    }

    const unsubscribeDay = api.day.onChanged(() => {
      render();
    });
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    // The beats are minutes, so the minute hand is what advances them.
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
