/**
 * WHICH week this is - the seam the week generator will be plugged into, and
 * the thing a save has to be able to ask again after a reload (E11, 0.31.0
 * slice 1).
 *
 * There is one week per employer today, so "which week" has one answer and
 * every caller has always taken the short road to it: `employerFor(id).week`.
 * The day the weeks are SAMPLED, that road is a bug with no symptom yet. A save
 * carries the world it was taken in; if the week is a function of anything
 * beyond the employer - and the whole of E11 is that it becomes a function of
 * the attempt and the position in the arc as well - then a load that resolves
 * it from the employer alone puts the player's Wednesday morning into a
 * DIFFERENT week. Nothing would throw. The tickets would simply be somebody
 * else's, and the queue would be a queue nobody had been dealt.
 *
 * So the resolution is a function of a REQUEST, and the request is exactly the
 * three scalars the world already carries and the save already restores:
 *
 *  - the employer, which schema 4 put in the file;
 *  - the attempt, which is `FIELDS.weekAttempt` on the player node;
 *  - the position in the arc, which is `FIELDS.arcWeek` on the player node.
 *
 * Both of those fields are inside the engine payload, which is restored BEFORE
 * the driver is re-pointed, so a save needs no new field and the schema does
 * not move: what the save carries is the world, and the world already knows
 * which week it is in. That is the same shape the driver's own `resync` uses
 * for the seed - "the seed first: everything below is built from it, and a load
 * may have replaced this session's week with a later attempt at the same one" -
 * generalised from the attempt to the whole request.
 *
 * The default answer is the shipped hand-written table, unchanged. Lane B
 * replaces the DEFAULT and nothing else: every caller already asks the
 * question the right way round.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { employerFor } from './employers';
import { FIELDS } from './fields';
import type { DayScript } from './week';

/** Everything the answer to "which week is this" is allowed to depend on. */
export interface WeekRequest {
  readonly employer: string;
  /** Which go at this week, counting from 1. Moves the minutes, not the week. */
  readonly attempt: number;
  /** Where in the employer's arc this week sits, counting from 1. */
  readonly arcWeek: number;
}

export type WeekSource = (request: Readonly<WeekRequest>) => readonly DayScript[];

/**
 * The four hand-written weeks, one per employer.
 *
 * It ignores the attempt and the arc position because today they make no
 * difference - a retry is the same week with different minutes, and no career
 * reaches week two. Both of those are E11's to change, and when they do this is
 * the one function that changes.
 */
export const shippedWeek: WeekSource = (
  request: Readonly<WeekRequest>,
): readonly DayScript[] => employerFor(request.employer).week;

function playerNumber(
  graph: ReadOnlyGraphView,
  actor: string,
  field: string,
): number {
  const value = graph.getField(actor, field);

  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? value
    : 1;
}

/**
 * The request, read off a world rather than remembered.
 *
 * Off the graph for the reason `seedFromWorld` is off the graph: the graph is
 * the half that survives a load. A caller that kept its own copy of the attempt
 * would hand a restored second attempt the first attempt's week, and the world
 * would be right while everything scheduled beside it belonged to a week nobody
 * was playing.
 */
export function weekRequestFrom(
  graph: ReadOnlyGraphView,
  actor: string,
  employer: string,
): WeekRequest {
  return {
    employer,
    attempt: playerNumber(graph, actor, FIELDS.weekAttempt),
    arcWeek: playerNumber(graph, actor, FIELDS.arcWeek),
  };
}
