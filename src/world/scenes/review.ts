/**
 * Friday at three, and the two things that can be said in it.
 *
 * The review is a conversation, so it is content: which one the player gets is
 * decided by the world - the verb is guarded on the reputation that earns it -
 * and this is only the words. Both scenes are written to the same house rules
 * as the caught scenes: he is not cruel, he is disappointed in a way that
 * costs you more, the player is never called an idiot, and there is always a
 * way out of the window.
 *
 * The beer belongs here too. It is the same shape - a title, a line, a room,
 * an answer - because it is the same kind of moment: somebody says something
 * to you at the end of a week and you have to sit there while they do.
 */

import type { ReviewOutcome } from '../week';

export interface Scene {
  readonly title: string;
  /** What he says, standing in the doorway or sitting across the desk. */
  readonly line: string;
  /** What the room does while he says it. */
  readonly narration: string;
  /** What you say back, or fail to. */
  readonly reply: string;
  /** The button that closes it, which is always there. */
  readonly dismissLabel: string;
}

function validateScene(scene: Readonly<Scene>, what: string): Scene {
  for (const [part, text] of Object.entries<string>({ ...scene })) {
    if (text.trim().length === 0) {
      throw new Error(
        `The ${what} scene has no ${part}, and every part of it ends up on `
        + 'the screen.',
      );
    }
  }

  return Object.freeze({ ...scene });
}

export const REVIEW_SCENES: Readonly<
  Record<'passed' | 'fired' | 'redundant', Scene>
> = Object.freeze({
    passed: validateScene({
      title: 'A quick word about your probation',
      line: 'Right. Pat. I have had a look at the week, and the week is '
        + 'fine. Not brilliant. Fine. Do you know how many people I have '
        + 'had in that chair who did not manage fine?',
      narration: 'He does not tell you how many. He lets the number sit '
        + 'there, unsaid and enormous, while the radiator makes the noise '
        + 'you have three tickets about.',
      reply: 'You say thank you. He says do not thank me, thank the queue, '
        + 'and laughs at his own joke for slightly too long, and that is '
        + 'the probation over.',
      dismissLabel: 'Back to the desk, employed',
    }, 'passed review'),
    fired: validateScene({
      title: 'A quick word about your probation',
      line: 'Pat. Sit down. I am not going to draw this out, because you '
        + 'have not got the time and frankly neither have I: it is not '
        + 'working out. Probation exists so that this conversation is short.',
      narration: 'There is a printed page on the desk, face down, which he '
        + 'does not turn over. Somebody in Sales laughs at something on the '
        + 'other side of the partition and then stops.',
      reply: 'You ask whether it was the printer. He says it is never one '
        + 'thing, in the voice of a man for whom it was, in fact, one thing.',
      dismissLabel: 'Take it on the chin',
    }, 'fired review'),
    /**
     * The third one, and the only conversation in this game where the person
     * across the desk is not deciding anything.
     *
     * It is written to be scrupulously polite and completely useless, which is
     * what these are actually like: the matrix was published, the scores were
     * on it, everything that could be said has been said in writing, and the
     * meeting exists so that the process can be recorded as having had one. He
     * is not enjoying it either. Nobody in the room chose this, which is the
     * difference between it and the firing - and the reason it is not a loss.
     */
    redundant: validateScene({
      title: 'A quick word about the outcome of the consultation',
      line: 'Pat. Thanks for coming in. You will have seen the scoring, and '
        + 'I am not going to pretend the numbers were close, because you can '
        + 'read them as well as I can. It is the two lowest, and you are one '
        + 'of them.',
      narration: 'He has the matrix printed out and he keeps it turned '
        + 'towards you the whole time, which is either decency or training. '
        + 'Somewhere behind the partition a phone rings out twice.',
      reply: 'You say you understand the criteria, and mean it, which is the '
        + 'strangest part. He says for what it is worth you were not the '
        + 'problem, and looks like a man who has said that four times today '
        + 'and meant it four times.',
      dismissLabel: 'Ask about the reference',
    }, 'redundancy review'),
  });

export function reviewScene(outcome: ReviewOutcome): Scene | null {
  return outcome === 'pending' ? null : REVIEW_SCENES[outcome];
}

/**
 * Five o'clock on a Friday that went well.
 *
 * The beer has been visible and locked since Monday morning with a tooltip
 * about probation on it, which is the whole reason this scene pays off: the
 * lock was the joke, and the joke had a week-long setup.
 */
export const BEER_SCENE: Scene = validateScene({
  title: 'There is a beer in the fridge with your name on it',
  line: 'The lead put his head round on the way out and said the thing '
    + 'about the fridge, which is the closest this building has to a '
    + 'ceremony.',
  narration: 'The office is empty in the specific way it only manages on a '
    + 'Friday: monitors asleep, one printer clearing its throat somewhere, '
    + 'and the corridor light on a timer that gave up in about 2004.',
  reply: 'It is not a good beer. It has been in there since somebody\'s '
    + 'leaving do, and the name on the label is not even yours - it is '
    + 'somebody called Malcolm. You drink it anyway.',
  dismissLabel: 'Open it',
}, 'beer unlock');

/** What the window says once the bottle is empty. */
export const BEER_AFTERMATH: Scene = validateScene({
  title: 'That is the week, then',
  line: 'Nobody says anything, because there is nobody here to say it.',
  narration: 'The bottle goes on the desk with the cans, which between them '
    + 'now tell a story about the week that is broadly accurate.',
  reply: 'You feel considerably better and look considerably worse, and on '
    + 'a Friday at five past five that is the correct way round.',
  dismissLabel: 'Go home',
}, 'beer aftermath');
