import {
  CONDUCT_TRIGGER_CRITERIA,
  type ConductTriggerId,
  conductEntries,
  conductSummary,
} from '../../world/conduct';
import { dndEvidence } from '../../world/presence';
import {
  type CaughtScene,
  caughtScene,
  GENERIC_CAUGHT_SCENE,
  INSTALL_CAUGHT_KEY,
  PRESENCE_CAUGHT_KEY,
  UNCAUGHT_SCENE,
} from '../../world/scenes';
import { formatSimTime } from '../clock-format';
import { createIcon } from '../icons';
import { installableApp } from './installable';
import type { AppDef, AppInstance, GameApi } from './types';
import { element, osButton } from './ui';

/**
 * Joins a list of names the way somebody speaks it: "A", "A and B", "A, B and
 * C". Used for the install-audit scene, which has to say what it actually names.
 */
function speakList(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }

  if (names.length === 2) {
    return `${names[0] ?? ''} and ${names[1] ?? ''}`;
  }

  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * The install-audit scene, built from what was ACTUALLY installed rather than a
 * hardcoded line.
 *
 * The content-honesty bar this exists for: the scene may print nothing false.
 * The old static line called every install "that game" and claimed the player
 * had taken it off and that the removal was logged - three sentences that were
 * lies the moment the toy was a media player, or was still on the machine. This
 * names the real programs (by their store titles) and states their real removal
 * state, read off the machine's own install set, and it claims a removal only
 * where one genuinely happened.
 */
export function installCaughtLines(
  ids: readonly string[],
  installed: ReadonlySet<string>,
): { bossLine: string; reply: string } {
  const names = ids.map((id) => installableApp(id)?.title ?? id);
  const removed = ids.filter((id) => !installed.has(id));
  const spoken = speakList(names);
  const one = ids.length === 1;

  const removalSentence = removed.length === 0
    ? `${one ? 'It is' : 'They are'} still on the machine now, which the audit `
      + 'can see the same as I can.'
    : removed.length === ids.length
      ? `You have taken ${one ? 'it' : 'them'} off again since - which I know `
        + 'because that is on the list too, and it is not the better line.'
      : 'One of those you have taken off again, which is on the list as well; '
        + 'the rest are still on there.';

  return {
    bossLine: `${spoken}. We do not allow ${one ? 'that' : 'those'} on these `
      + `machines, and ${one ? 'it is' : 'they are'} on the install audit with `
      + `your name against ${one ? 'it' : 'them'}. ${removalSentence} We keep a `
      + 'list, and the list does not forget the way a desktop does.',
    reply: `You say it was nothing. He says the list does not think ${
      one ? 'it' : 'any of it'
    } was nothing, and that ${one ? 'it' : 'all of it'} stays on there whatever `
      + 'you do to the machine.',
  };
}

/**
 * The caught scene, and the file it goes into.
 *
 * It is a window rather than a modal on purpose. A modal that owns the screen
 * while the clock runs is a punishment the player cannot leave, and the house
 * rules forbid a dead end however funny it is - so this closes from its own
 * button, from the titlebar, and from Escape like everything else, and the
 * queue is still there underneath it the whole time.
 *
 * The words are content: which scene is shown is decided by which slack app
 * was on the screen, and the loader refuses to boot a slack app that has none.
 *
 * Underneath the conversation is the half that outlives it, and it is here
 * rather than anywhere else because this is where the player already comes to
 * find out what being caught meant. The file is every dated line the lead has
 * written this week; below it are the three things that would give somebody a
 * reason to read it, with the ones that currently apply marked; and below that
 * is the mark Friday now has to reach. All of it is readable from Monday
 * morning, all of it changes as the week does, and nothing at three o'clock on
 * the Friday can come out of a state that was not on this screen first.
 */
export const CAUGHT_APP: AppDef = {
  id: 'caught',
  title: 'A quick word',
  icon: 'icon-door',
  tier_required: 1,
  slack: false,
  desktop: false,
  mount: (host, api: GameApi): AppInstance => {
    const root = element('section', 'app-page caught-app', 'caught-app');

    const head = element('div', 'caught-head');
    const portrait = element('div', 'caught-portrait');
    portrait.append(createIcon('icon-door'));
    const heading = element('h2', undefined, 'caught-heading');
    const stamp = element('p', 'caught-stamp', 'caught-stamp');
    const copy = element('div', 'caught-head-copy');
    copy.append(heading, stamp);
    head.append(portrait, copy);

    const line = element('blockquote', 'caught-line', 'caught-line');
    const narration = element('p', 'caught-narration', 'caught-narration');
    /**
     * What he is holding it against, for the one scene that is about a record
     * rather than about a screen.
     *
     * The world counts minutes and the lead does not say minutes, so the
     * quantity is translated into the phrase a man at your desk would use -
     * and it is read live rather than baked into the scene, because how much
     * of the morning it was is a fact about the day the player had. The FILE
     * carries the same reading in the passive voice, which is the joke this
     * whole window is built on: two true sentences about the same morning,
     * neither of them a paraphrase of the other.
     */
    const evidence = element('p', 'caught-evidence', 'caught-evidence');
    const reply = element('p', 'caught-reply', 'caught-reply');

    const file = element('section', 'caught-file', 'caught-file');
    const criteria = element('section', 'caught-file', 'caught-criteria');

    const footer = element('div', 'caught-footer');
    const dismiss = osButton('Take it on the chin', 'caught-dismiss', {
      primary: true,
    });
    const note = element('p', 'caught-note', 'caught-note');
    footer.append(dismiss, note);

    root.append(head, line, narration, evidence, reply, file, criteria, footer);

    dismiss.addEventListener('click', () => {
      api.closeApp('caught');
    });

    /**
     * The file, oldest line first, exactly as the world holds it.
     *
     * It is rendered rather than summarised because the point of a file is
     * that it can be read. A count would tell the player how much trouble they
     * are in; the lines tell them which afternoon it was.
     */
    const renderFile = (): void => {
      file.replaceChildren();
      const title = element('h3');
      title.textContent = 'Your file';
      file.append(title);

      const lines = conductEntries(api.day.conductFile());
      const summary = element('p', undefined, 'caught-file-summary');
      summary.textContent = lines.length === 0
        ? 'Empty. Nothing has been written down about you this week, which is '
          + 'not the same as nothing having happened.'
        : lines.length === 1
          ? 'One line, this week. It costs nothing and it does not go away.'
          : `${String(lines.length)} lines, this week. None of them cost you a `
            + 'point of anything, and none of them have gone away either.';
      file.append(summary);
      file.dataset.lines = String(lines.length);

      if (lines.length === 0) {
        return;
      }

      const list = element('ul', 'caught-file-list', 'caught-file-list');

      for (const [index, entry] of lines.entries()) {
        const item = element(
          'li',
          undefined,
          `caught-file-line-${String(index)}`,
        );
        item.dataset.kind = entry.kind;
        item.textContent = entry.text;
        list.append(item);
      }

      file.append(list);
    };

    /**
     * What would make somebody open it, stated before it happens.
     *
     * This is the half of the legibility contract that costs the most to get
     * right and is worth the most: the three reasons are on the screen from
     * Monday, in the fiction's own words, with the ones that currently apply
     * named and the ticket that caused each of them said out loud. A rule
     * first seen in the sentence that applies it is a rule nobody could have
     * played toward.
     */
    const renderCriteria = (): void => {
      criteria.replaceChildren();
      const title = element('h3');
      title.textContent = 'Who would read it';
      const summary = element('p', undefined, 'caught-criteria-summary');
      criteria.append(title, summary);

      const reading = api.day.conductReading();
      const live = new Set<ConductTriggerId>(
        reading.triggers.map((trigger) => trigger.id),
      );

      criteria.dataset.triggers = String(reading.triggers.length);
      criteria.dataset.bar = String(reading.bar);
      summary.textContent = conductSummary(reading);

      const list = element('ul', 'caught-file-list', 'caught-criteria-list');

      for (const [id, why] of Object.entries(CONDUCT_TRIGGER_CRITERIA)) {
        const item = element('li', undefined, `caught-criteria-${id}`);
        const applies = live.has(id as ConductTriggerId);
        item.dataset.live = String(applies);
        const headline = reading.triggers.find(
          (trigger) => trigger.id === id,
        )?.headline;
        item.textContent = applies && headline !== undefined
          ? `Right now: ${headline}`
          : why;
        list.append(item);
      }

      criteria.append(list);
    };

    const render = (): void => {
      const {
        appId, at, evidence: minutes, software,
      } = api.appState.get().caught;
      const scene: CaughtScene = appId === null
        ? UNCAUGHT_SCENE
        : caughtScene(appId) ?? GENERIC_CAUGHT_SCENE;

      // The install-audit scene is the one that is built rather than fixed: its
      // boss line and reply name the programs actually on the trail and state
      // their real removal state, so nothing printed can be false in-fiction. It
      // falls back to the static line only if a save carries the key with no
      // records behind it, which is a scene with nothing to name.
      const installed = new Set(api.appState.get().installed.apps);
      const dynamic = appId === INSTALL_CAUGHT_KEY
        && software !== null && software.length > 0
        ? installCaughtLines(software, installed)
        : null;

      root.dataset.app = appId ?? 'none';
      heading.textContent = scene.title;
      stamp.textContent = appId === null || at === null
        ? 'Nobody is standing behind you.'
        : `${formatSimTime(at).day}, ${formatSimTime(at).time}. He was `
          + 'standing there for a while before you noticed.';
      line.textContent = dynamic?.bossLine ?? scene.bossLine;
      narration.textContent = scene.narration;
      reply.textContent = dynamic?.reply ?? scene.reply;

      // The reading he arrived with, as it was captured in that minute, rather
      // than a fresh one taken now. The world clears the record as part of
      // having the conversation - a morning that has been mentioned is spent -
      // so asking again would be asking about nothing, and while the record
      // still stood a second reading would drift from the line already on the
      // file. One number, two sentences about it.
      const status = appId === PRESENCE_CAUGHT_KEY && minutes !== null;

      evidence.hidden = !status;
      evidence.dataset.minutes = status ? String(minutes) : '';
      evidence.textContent = status
        ? 'He does not say a number, and he has one. What he says is that it '
          + `has been like that for ${dndEvidence(minutes)}, and the dispatch `
          + 'log behind you agrees with him to the minute.'
        : '';
      dismiss.textContent = scene.dismissLabel;
      note.textContent = appId === null
        ? 'Nothing on this screen costs a point. What a conversation costs is '
          + 'the minutes it takes, and the line underneath.'
        : 'The minutes are gone and the line is written. Closing this does not '
          + 'undo either, and staring at it does not either.';

      renderFile();
      renderCriteria();
    };

    host.replaceChildren(root);
    render();

    const unsubscribeState = api.appState.onReplaced(() => {
      render();
    });
    // Being caught twice in one day is two scenes, not one that went stale.
    const unsubscribeWorld = api.onWorldChange(() => {
      render();
    });
    // And the file moves with the QUEUE as well as with the corridor: a ticket
    // going red gives somebody a reason to look, which changes what this
    // window says without anybody being caught at anything.
    const unsubscribeDay = api.day.onChanged(() => {
      render();
    });

    return {
      unmount: (): void => {
        unsubscribeState();
        unsubscribeWorld();
        unsubscribeDay();
        root.remove();
      },
    };
  },
};
