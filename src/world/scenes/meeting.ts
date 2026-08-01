/**
 * The mandatory sync, as content.
 *
 * A meeting in this game is not a punishment and not a cutscene: it is half an
 * hour of the shift during which every clock in the building carries on and the
 * player can see the shape of a queue they cannot touch. The comedy is in the
 * MINUTES - what is actually said, at what pace, by people who all have
 * somewhere else to be - which is why the beats carry the minute they land on
 * rather than being a paragraph the window prints all at once.
 *
 * The recap mail afterwards is made of these same beats, verbatim. "This could
 * have been an email" is not a joke anybody in the fiction makes; it is a thing
 * the artifact demonstrates by BEING the email, half an hour late, with nothing
 * removed - which is the only version of that joke that is not smug.
 *
 * House rules for writing one: nobody is stupid, everybody is busy, the meeting
 * is about a real thing and reaches no decision about it, and the player is
 * addressed exactly once so that being new is the reason they are here.
 */

import { COMPANY_IDS } from '../company';

/** One thing somebody says, and how far into the block they say it. */
export interface MeetingBeat {
  /** Minutes from the start of the block. */
  readonly at: number;
  /** Person node who says it; the window reads their name from the graph. */
  readonly who: string;
  readonly line: string;
}

export interface MeetingScene {
  readonly id: string;
  /** What the invitation calls it. */
  readonly title: string;
  /** Who called it, and is therefore not walking the floor while it runs. */
  readonly chair: string;
  /** One line of what it is nominally about, for the mail and the brief. */
  readonly subject: string;
  /** What the room says, in order, oldest first. */
  readonly beats: readonly MeetingBeat[];
  /** What the window says about the desk while the desk is unreachable. */
  readonly deskNote: string;
  /** The line the recap mail opens with, before it reprints the meeting. */
  readonly recapOpener: string;
}

/**
 * Load-time content gate.
 *
 * Everything it refuses is a beat nobody hears or a room nobody can read: two
 * scenes sharing an id, a block with nothing said in it, two people talking
 * over each other on the same minute, a line that runs backwards. All of them
 * look like a quiet meeting rather than a broken one, which is exactly the
 * class of bug the loaders in this world exist to stop at the boot.
 */
export function validateMeetingScenes(
  scenes: readonly MeetingScene[],
): readonly MeetingScene[] {
  const ids = new Set<string>();

  for (const scene of scenes) {
    if (scene.id.trim().length === 0) {
      throw new Error('A meeting scene must have an id.');
    }

    if (ids.has(scene.id)) {
      throw new Error(`Duplicate meeting scene "${scene.id}".`);
    }

    ids.add(scene.id);

    for (const field of [scene.title, scene.subject, scene.deskNote, scene.recapOpener]) {
      if (field.trim().length === 0) {
        throw new Error(`Meeting "${scene.id}" has a blank line in it.`);
      }
    }

    if (scene.beats.length === 0) {
      throw new Error(
        `Meeting "${scene.id}" is half an hour in which nobody says anything. `
        + 'That is a loading screen, not a meeting.',
      );
    }

    let previous = -1;

    for (const beat of scene.beats) {
      if (!Number.isSafeInteger(beat.at) || beat.at < 0) {
        throw new Error(`Meeting "${scene.id}" says something at no minute.`);
      }

      // Equal is refused as well as backwards: two people on one minute is two
      // lines arriving in the same repaint, which reads as one of them having
      // been missed.
      if (beat.at <= previous) {
        throw new Error(
          `Meeting "${scene.id}" runs backwards or talks over itself at minute `
          + `${String(beat.at)}.`,
        );
      }

      previous = beat.at;

      if (beat.line.trim().length === 0 || beat.who.trim().length === 0) {
        throw new Error(`Meeting "${scene.id}" has a beat nobody says.`);
      }
    }
  }

  return Object.freeze([...scenes]);
}

/**
 * The probation week's one meeting.
 *
 * Ticket hygiene, mid-morning, mid-week - which is prime working time, and
 * that is the research finding rather than a preference. It reaches no
 * decision, it defers the one number it is about, and it ends with the chair
 * promising the artifact this whole beat is named after.
 */
export const TICKET_HYGIENE_SYNC: MeetingScene = {
  id: 'meeting/ticket-hygiene',
  title: 'Sync on ticket hygiene',
  chair: COMPANY_IDS.boss,
  subject: 'Resolution categories, and the number nobody has brought.',
  deskNote: 'The queue is still out there. Every deadline on it is still '
    + 'running, and so is the clock on this.',
  recapOpener: 'Recap of this morning\'s sync, as promised. Minuted in full '
    + 'because Bev asked me to minute it in full.',
  beats: [
    {
      at: 0,
      who: COMPANY_IDS.boss,
      line: 'Right. Thanks all for coming. This is the ticket hygiene sync. '
        + 'It should not take the full half hour.',
    },
    {
      at: 3,
      who: COMPANY_IDS.boss,
      line: 'The headline is that our time to first touch has gone up. I do '
        + 'not have the figure in front of me. Bev has the figure.',
    },
    {
      at: 5,
      who: COMPANY_IDS.bev,
      line: 'I have the figure at my desk.',
    },
    {
      at: 8,
      who: COMPANY_IDS.boss,
      line: 'The ask is that everybody fills in the resolution category '
        + 'properly. Not "other". "Other" was forty-one percent last month.',
    },
    {
      at: 11,
      who: COMPANY_IDS.marcus,
      line: 'Can I ask what the categories are.',
    },
    {
      at: 12,
      who: COMPANY_IDS.boss,
      line: 'They are in the drop-down.',
    },
    {
      at: 14,
      who: COMPANY_IDS.marcus,
      line: 'One of them is "other".',
    },
    {
      at: 16,
      who: COMPANY_IDS.yolanda,
      line: 'Sorry to jump in. Is this the meeting where we agree the '
        + 'wording, or the one where the wording goes up?',
    },
    {
      at: 18,
      who: COMPANY_IDS.boss,
      line: 'This is the one before that one.',
    },
    {
      at: 21,
      who: COMPANY_IDS.boss,
      line: 'Pat, you are new, so none of this is aimed at you. Just absorb '
        + 'it and it will make sense in about a month.',
    },
    {
      at: 24,
      who: COMPANY_IDS.bev,
      line: 'Do we want me to go and get the figure.',
    },
    {
      at: 25,
      who: COMPANY_IDS.boss,
      line: 'We can pick the figure up next time.',
    },
    {
      at: 28,
      who: COMPANY_IDS.boss,
      line: 'Good. Useful. I will send a recap round so nobody has to have '
        + 'been here.',
    },
  ],
};

/**
 * The hour, and how long it takes, written down once.
 *
 * Three things have to agree about this minute or the beat is a lie: the day's
 * interruption column, the summons mail that names it, and the morning brief
 * that warns about it. So none of them types it - they all read this, and the
 * announced entry carries no jitter, which is the other half of the same
 * promise (`interruptions.ts`, `InterruptionSlot.jitter`).
 *
 * Half past ten on a Wednesday is prime working time, which is the research
 * finding rather than a preference: the meetings that cost the most are the
 * ones in the middle of the morning in the middle of the week.
 */
export const HYGIENE_SYNC_MINUTE = 10 * 60 + 30;
export const HYGIENE_SYNC_MINUTES = 30;

export const MEETING_SCENES: readonly MeetingScene[] = validateMeetingScenes([
  TICKET_HYGIENE_SYNC,
]);

export function meetingScene(id: string): MeetingScene | undefined {
  return MEETING_SCENES.find((scene) => scene.id === id);
}

/** The last minute of the block anybody says anything on. */
export function meetingRuns(scene: Readonly<MeetingScene>): number {
  return scene.beats.reduce((latest, beat) => Math.max(latest, beat.at), 0);
}

/** Everything that has been said by this many minutes in, oldest first. */
export function meetingSoFar(
  scene: Readonly<MeetingScene>,
  minutesIn: number,
): readonly MeetingBeat[] {
  return scene.beats.filter((beat) => beat.at <= minutesIn);
}
