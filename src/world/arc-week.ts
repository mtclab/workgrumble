/**
 * WHICH WEEK OF THE CAREER this is - one question, one answer, one place to
 * ask it.
 *
 * `hours.ts` knows how a week and a day become a date. It cannot know WHICH
 * week, because a week number is a fact about a career and `hours.ts` is
 * arithmetic. This is the other half of the calendar seam: the single read
 * that turns a world into the number every date surface needs.
 *
 * It was written for the month-end freeze in 0.39.0 and lived in
 * `change-freeze.ts` until 0.40.0, when the rest of the build's date surfaces
 * needed the same number. A directory listing importing the change-freeze
 * module to find out what day it is would be the wrong shape of dependency
 * even though it would work, so the read moved out to its own name and the
 * freeze asks it like everybody else.
 *
 * OFF THE GRAPH rather than remembered, which is the property that matters: a
 * save restores the engine payload, the arc week is a field on the player node
 * inside it, and a surface that kept its own copy would print last week's
 * dates in a world that had been loaded forward.
 */

import type { ReadOnlyGraphView } from '../engine-api';
import { FIELDS } from './fields';

/**
 * The week of the arc the player is on, defaulting to the FIRST - which is
 * what every world that has never been promoted is on, and what a world built
 * by a test fixture that never wrote the field is honestly on too.
 *
 * The default is the reason week one is the identity case everywhere else in
 * this seam: a surface that cannot find an arc week prints exactly what the
 * whole build printed before there was an arc.
 */
export function arcWeekOf(graph: ReadOnlyGraphView, actor: string): number {
  const value = graph.getField(actor, FIELDS.arcWeek);

  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? value
    : 1;
}
