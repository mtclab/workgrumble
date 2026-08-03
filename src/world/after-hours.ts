/**
 * The after-hours ping tail, as data.
 *
 * E1's last beat, the one the research calls boundary erosion: a day does not
 * end when the shift does. A ping or two lands OVERNIGHT - in the gap between
 * clocking off and the next login - authored per day like everything else the
 * week does, and NOT a ticket and NOT a shift interruption. It is read at the
 * next morning's brief, on a small "while you were out" surface, and answered
 * there or left.
 *
 * The trade is the teaching, and both halves of it are honest. Answering one is
 * a tiny reputation gain (you were reachable) paid against a tiny stress
 * carryover into the new day (you were reachable). Leaving it is free of both -
 * neither path is punished into non-existence, which is the whole point: the
 * cost of being always-on and the cost of drawing a line are both small and
 * both real, and the player picks.
 *
 * The dot reaches across the night too, and it reaches the same way it does in
 * the day rather than a fourth way. A ping that could be waved off (`declinable`)
 * does not arrive at all if the dot said Do Not Disturb when you left - you told
 * them, and they did not. One that cannot be waved off lands whatever the dot
 * said. Nothing here writes that dodge down: the arrival is a pure function of
 * the authored ping and the presence the save already carries, which is what
 * "saves the round-trip" means - the only thing the world records is the answer.
 *
 * Nothing here dispatches, touches the DOM or reads the time of day.
 */

import { type Presence } from './presence';

/**
 * One ping authored to land after a given day's clock-off.
 *
 * `declinable` is the whole of the dot's reach over the night: a ping somebody
 * could have been waved off is a ping a Do Not Disturb dot turns away before it
 * arrives, exactly as `dodgesUnderDnd` turns away a declinable call in the day.
 * One that cannot be waved off lands whatever the dot said - the same rule the
 * meeting and the callback keep, that some things are not yours to not hear.
 */
export interface AfterHoursSlot {
  /** Stable across the week: the world records the answer against this id. */
  readonly id: string;
  /** The person node who pinged. */
  readonly speaker: string;
  /** One line of what they wanted, read on the morning surface. */
  readonly subject: string;
  /** Whether the overnight dot could turn it away. */
  readonly declinable: boolean;
}

/**
 * One ping as the morning surface meets it: the authored ping, and whether it
 * has already been answered.
 */
export interface AfterHoursArrival {
  readonly slot: AfterHoursSlot;
  readonly answered: boolean;
}

/**
 * What answering one is worth, and what it costs, in whole meter points.
 *
 * ONE each, and the symmetry is the argument. A point of reputation is the
 * smallest the meter moves for anything - a breach is three - so it is
 * unmistakably "tiny": you were reachable, and somebody noticed, and that is the
 * whole of the good it did. A point of stress is the same size and the same
 * shape wearing the other hat: you were reachable, and it followed you into the
 * morning. Neither is a number a run turns on, which is the point - the lesson
 * is the choosing, not the arithmetic, and a cost big enough to matter would
 * make "leave it" the only correct answer and the surface decoration.
 *
 * OVERSEER TUNING KNOBS, both of them, and deliberately equal until there is a
 * reason for them not to be.
 */
export const AFTER_HOURS_REPUTATION = 1;
export const AFTER_HOURS_STRESS = 1;

/**
 * The pings that actually arrive overnight, given the dot the player left on and
 * what they have already answered.
 *
 * A pure function of the authored night, the presence the save carries and the
 * answered record - so the morning surface, a test and a reload all get the same
 * list, and nothing about the arrival has to be written down. A declinable ping
 * is dropped under Do Not Disturb (you told them); everything else arrives, and
 * carries whether it is already dealt with so the surface can strike it through
 * rather than lose it.
 */
export function afterHoursArrivals(
  slots: readonly AfterHoursSlot[],
  presence: Presence,
  answered: ReadonlySet<string>,
): readonly AfterHoursArrival[] {
  return slots
    .filter((slot) => !(presence === 'dnd' && slot.declinable))
    .map((slot) => ({ slot, answered: answered.has(slot.id) }));
}
