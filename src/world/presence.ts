/**
 * The dot, and everything that reads it.
 *
 * One enum on the player node and no new meter: what a status changes is how
 * the three meters that already exist behave, which is what the research
 * (`docs/research/day-to-day-frustrations.md`, section 3) says the anxiety is
 * actually made of. Available is the baseline and costs nothing; the other two
 * are trades, and both halves of each trade are enforced by the world rather
 * than offered by a surface.
 *
 * - **Do not disturb** buys quiet: a declinable interruption slides past
 *   instead of ringing, so the arrival is never charged and the choice is
 *   never offered. What it costs is that the dot says busy-with-something-else
 *   while the dispatch log says working, and the lead can read both.
 * - **Away** buys nothing at all and lies about it: somebody waiting for a
 *   first word about their ticket, watching a desk that is marked Away do
 *   demonstrable work on somebody else's, escalates - once, per person, per
 *   day.
 *
 * Nothing here dispatches, touches the DOM or reads the time of day. The
 * numbers are all in one place on purpose: they are the balance table of the
 * whole triangle, they are deliberately conservative, and every one of them is
 * an OVERSEER TUNING KNOB.
 */

/**
 * The three the office can read, in the order the tray shows them.
 *
 * The order is part of the contract rather than a rendering detail: the verb
 * takes the INDEX (`presenceCode`), because the op language can enumerate
 * numbers and cannot compare strings - so a caller picks from a set the world
 * validates, and the world writes the canonical word into the graph.
 */
export const PRESENCE_VALUES = ['available', 'dnd', 'away'] as const;

export type Presence = (typeof PRESENCE_VALUES)[number];

/**
 * What everybody who has never touched the tray is showing.
 *
 * It is the DEFAULT rather than a seeded field, and that distinction is the
 * whole determinism argument of this slice: nothing writes `presence` until a
 * player sets one, so a scripted walk produces the same graph, byte for byte,
 * as it did before any of this existed.
 */
export const DEFAULT_PRESENCE: Presence = 'available';

export function isPresence(value: unknown): value is Presence {
  return typeof value === 'string'
    && PRESENCE_VALUES.some((presence) => presence === value);
}

/**
 * What each of the three is CALLED, which is the wording the office reads.
 *
 * Content rather than a label the tray invents, and it lives beside the enum
 * for the reason every other word in this file does: the dot is a thing three
 * different surfaces show - the taskbar, the lead's beat, and whatever a
 * colleague says about it - and three surfaces spelling a status three ways
 * would be three statuses.
 */
export const PRESENCE_LABELS: Readonly<Record<Presence, string>> = Object.freeze({
  available: 'Available',
  dnd: 'Do not disturb',
  away: 'Away',
});

/**
 * And what each of them actually costs, said before it is chosen.
 *
 * The legibility rule this game keeps everywhere else: a mechanic first met in
 * the sentence that charges for it is a mechanic nobody could have played
 * toward. Both trades are stated on the control itself, which is why the
 * suspicion drip is a tradeoff rather than a trap.
 */
export const PRESENCE_TOOLTIPS: Readonly<Record<Presence, string>> = Object.freeze({
  available: 'The honest one. Every phone that wants you gets you, nothing is '
    + 'charged for saying so, and nobody has anything to put together about '
    + 'you.',
  dnd: 'The phone stops. A call that could have been waved off is not offered '
    + 'at all - it comes back later, or it does not come back. What it costs '
    + 'is that the dot says busy while the dispatch log says working, and the '
    + 'lead can read both.',
  away: 'Says you are not at the desk. It stops nothing at all, and somebody '
    + 'who has been waiting for a first word can see the queue moving while '
    + 'it is up.',
});

/**
 * The dot the world is showing, read off whatever the field holds.
 *
 * Absent is available, and so is anything this build cannot read - a save from
 * a future version, a field somebody hand-edited. The honest failure of a
 * status nobody can parse is the status that costs nothing, because the
 * alternative is a player being charged suspicion for a word the game does not
 * understand.
 */
export function readPresence(value: unknown): Presence {
  return isPresence(value) ? value : DEFAULT_PRESENCE;
}

/** Which of the three this is, as the number the verb takes. */
export function presenceCode(presence: Presence): number {
  return PRESENCE_VALUES.indexOf(presence);
}

/* -- the tunables --------------------------------------------------------- */

/**
 * How long the dot buys, in simulated minutes, each time it dodges one.
 *
 * The same shape as `DEFER_MINUTES` and deliberately not the same mechanic: a
 * postpone is the player asking, out loud, once, and spending a budget for it;
 * this is somebody seeing a red dot and deciding to try again later. It costs
 * no budget, it is not offered and it is not chosen - which is exactly why it
 * has to be a fixed number the world owns rather than anything a caller says.
 *
 * Twenty, because it is the same "still the same morning" window the callback
 * uses and a second number would be a second thing to tune with no second
 * reason to tune it. OVERSEER TUNING KNOB.
 */
export const DND_SLIDE_MINUTES = 20;

/**
 * How recently the queue has to have been touched for the desk to count as
 * actively working, in simulated minutes.
 *
 * The touch log is the evidence, which is the same evidence the handoff form
 * and the cost model read - so "working" means the same thing everywhere it is
 * asked, and none of it is a flag the driver sets. Fifteen is three meter
 * intervals: long enough that a tech reading a knowledge-base article between
 * two fixes is still working, short enough that a desk nobody has been at for
 * a quarter of an hour is not.
 */
export const DND_WORKING_TICKS = 15;

/**
 * What one interval of do-not-disturb-while-working is worth in suspicion.
 *
 * Two, against three for the smallest slack window - deliberately less than
 * the cheapest thing you can actually be caught at, because this is not being
 * caught: it is a dot that says one thing and a log that says another, and the
 * lead has to put those two together himself. It is also the only suspicion in
 * the game that costs nothing to be innocent of: a player who sets Available
 * pays none of it, ever.
 *
 * OVERSEER TUNING KNOB, and the one most likely to move: it is the whole price
 * of the quiet the dot buys.
 *
 * NOT moved in slice 0.3.6 (finding F5), and the reason is evidence rather than
 * timidity: the shipped week authors only two dodgeable dot-reading beats (the
 * Tuesday and Thursday calls), so a player can cross a whole probation without
 * ever leaning on this number, and a knob nobody has pressed is a knob there is
 * nothing to move it on. F4 is the beat that would change that - one mid-week
 * chat-source interruption that reads the dot, so the drip finally has something
 * to drip against - and THIS number, `DND_BEAT_SUSPICION` and their friends are
 * to be re-evaluated on the run that walks it on Do Not Disturb, not ahead of
 * it. Until that beat exists the values stand.
 */
export const DND_WORKING_SUSPICION = 2;

/**
 * Where the lead's "on Do Not Disturb all morning?" beat arms.
 *
 * TWO conditions rather than one, and both have to hold, because a beat that
 * fired on the meter alone would be a scold for a morning spent on the forum -
 * which is a different conversation the game already has. This one is about
 * the dot, so the evidence is minutes of the dot: `DND_BEAT_MINUTES` of
 * do-not-disturb-while-working on the record, and a meter that has actually
 * climbed. Half an hour is the smallest span anybody would describe as "all
 * morning" without lying, and forty-five is three quarters of the way to the
 * ceiling from a clean start.
 */
export const DND_BEAT_SUSPICION = 45;
export const DND_BEAT_MINUTES = 30;

/**
 * What one person noticing the Away dot takes off reputation.
 *
 * Two points, once per reporter per day - against the three a missed deadline
 * costs. It is smaller than a breach on purpose: nobody escalates because you
 * were away, they escalate because you were away AND visibly doing something
 * else, and the thing that is actually wrong is still the ticket nobody has
 * answered. OVERSEER TUNING KNOB.
 */
export const AWAY_NOTICED_REPUTATION = 2;

/* -- what the boss reads --------------------------------------------------- */

/**
 * The dot, the meter and the minutes behind it: everything the caught-scene
 * class needs to decide whether the lead has something to say, and nothing it
 * needs to invent.
 *
 * `armed` is a PREDICATE over evidence the world wrote down rather than a roll
 * of the dice. That is the point of it: a manager who appears at your shoulder
 * to ask about your status when your status has been Available all morning is
 * a random scold, and this game does not have those - every telling-off in it
 * is one the player can trace to a minute.
 */
export interface DndBeatReading {
  readonly presence: Presence;
  readonly suspicion: number;
  /** Minutes of the dot saying busy while the log said working. */
  readonly minutes: number;
  readonly armed: boolean;
}

export function dndBeat(
  presence: Presence,
  suspicion: number,
  minutes: number,
): DndBeatReading {
  return {
    presence,
    suspicion,
    minutes,
    armed: presence === 'dnd'
      && suspicion >= DND_BEAT_SUSPICION
      && minutes >= DND_BEAT_MINUTES,
  };
}

/**
 * The same minutes, in the words a man standing at your desk would use.
 *
 * The world counts a quantity and the lead does not say quantities: nobody has
 * ever been asked "were you on Do Not Disturb for fifty-five minutes". What he
 * has is a rough sense of how long it was, and the scene prints that - which
 * is the honest translation, because the number underneath it is on the file
 * and in the window either way.
 *
 * EVERY BAND HAS TO BE TRUE AT ITS OWN FLOOR, which is the rule this was got
 * wrong by once: the beat arms at half an hour and the shift's morning is four
 * of them, so the smallest reading rendered as "half the morning" - a sentence
 * about a hundred and twenty minutes said about thirty, in a scene whose whole
 * job is to be traceable to a number. A telling-off that overstates its own
 * evidence is the random scold this family exists to not be.
 *
 * Written as thresholds rather than as arithmetic on purpose: the phrase has
 * to be a thing somebody would say out loud, and "one hour and forty-five
 * minutes" said out loud is a spreadsheet talking. Each one reads after the
 * words "it has been like that for".
 */
export function dndEvidence(minutes: number): string {
  // Four hours of shift before lunch, so "the morning" is 240 minutes and
  // nothing under three of them may claim the whole of it.
  if (minutes >= 210) {
    return 'the whole morning';
  }

  if (minutes >= 135) {
    return 'most of the morning';
  }

  if (minutes >= 75) {
    return 'over an hour';
  }

  if (minutes >= 45) {
    return 'the best part of an hour';
  }

  return 'about half an hour';
}
