import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * THE ONE DOOR, held open-and-shut by a gate over the source (0.42.0 review
 * round).
 *
 * W-10's first cut asked the desk's "not now" rules in the six places the walk
 * had happened to press, and the driver hands the shell far more than six
 * verbs: the web store's install, the timesheet's Submit, the ticket pane's
 * write-up and the terminal's `report` all answered ok and moved the graph
 * with the day stopped. The fix is not four more checks - it is one, in front
 * of everything, failing closed.
 *
 * That only stays true while the engine is reached from ONE place in the
 * driver. The next verb somebody writes will be written the way the last one
 * was: `this.engine.dispatch(...)`, straight past the rule, green in every
 * test that does not happen to pause the day first. So the rule about the rule
 * is checked where it can be checked at all - over the file.
 *
 * It is deliberately a source gate rather than a behavioural one. A
 * behavioural sweep can only ask the verbs it knows the names of, and the
 * whole failure being forbidden here is a verb nobody thought to name.
 */
const DRIVER = readFileSync(
  fileURLToPath(new URL('./day-driver.ts', import.meta.url)),
  'utf8',
);

/** The line numbers a pattern is found on, for a failure that can be read. */
function linesWith(source: string, pattern: RegExp): readonly string[] {
  return source
    .split('\n')
    .map((line, index) => ({ line: line.trim(), at: index + 1 }))
    .filter((entry) => pattern.test(entry.line))
    .map((entry) => `day-driver.ts:${String(entry.at)}  ${entry.line}`);
}

describe('the driver reaches the world through one door (W-10, 0.42.0)', () => {
  it('dispatches to the engine from exactly one place', () => {
    const calls = linesWith(DRIVER, /this\.engine\.dispatch\(/u);

    expect(
      calls,
      'every dispatch goes through `act`, which is where the desk is asked '
        + 'whether it is open - see the comment on that method',
    ).toHaveLength(1);
  });

  it('asks the desk rule in that door, and fails closed', () => {
    const door = /private act\([\s\S]*?\n {2}\}/u.exec(DRIVER)?.[0] ?? '';

    expect(door, 'the door has been renamed').not.toBe('');
    // The rule is asked, and the ONLY way past it is the day's own turn -
    // which is a scope the driver enters deliberately, not a flag a verb can
    // set for itself.
    expect(door).toContain('this.workRefusal()');
    expect(door).toContain('this.daysOwnTurn');
    expect(door).toContain('this.engine.dispatch(');
  });

  it('keeps the day\'s own turn a scope, entered in one helper', () => {
    // The counter is read in the door and moved only by `theDaysOwn`. A verb
    // that raised it for itself would be a verb writing its own exemption,
    // which is the hole this whole gate is about - so both of its two writes
    // have to be inside that one method.
    const scope = /private theDaysOwn<T>\([\s\S]*?\n {2}\}/u.exec(DRIVER)?.[0]
      ?? '';

    expect(scope, 'the scope helper has been renamed').not.toBe('');

    const writes = linesWith(DRIVER, /this\.daysOwnTurn\s*[-+]=/u);
    const inside = linesWith(scope, /this\.daysOwnTurn\s*[-+]=/u);

    expect(writes).toHaveLength(2);
    expect(inside, 'the day\'s own turn is entered outside `theDaysOwn`')
      .toHaveLength(2);
  });
});
