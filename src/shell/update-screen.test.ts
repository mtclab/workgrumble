import { describe, expect, it } from 'vitest';

import { updatePercent } from './update-screen';

/**
 * The number on the update screen, which is theatre and has to be honest about
 * being theatre.
 *
 * The DURATION is the truth: twelve simulated minutes, every clock running,
 * the desk gone for all of them. The PERCENTAGE is a performance of that
 * duration, and the rules it has to keep are the rules the player would notice
 * being broken - it may not go backwards, it may not claim to be finished
 * while the desk is still gone, and it has to do the thing every real one of
 * these does, which is sit at thirty for a third of the job.
 *
 * The shipped reboot is twelve minutes and our own boot animation is eight
 * beats, so both lengths are exercised: a curve that only read right at one
 * length would be a curve tuned to a fixture.
 */

const REBOOT_MINUTES = 12;

function through(minutes: number): readonly number[] {
  return Array.from(
    { length: minutes },
    (_, minutesIn) => updatePercent(minutesIn, minutes),
  );
}

describe('the percentage on an update screen', () => {
  it('starts at nothing and only says a hundred on the last minute', () => {
    const shown = through(REBOOT_MINUTES);

    expect(shown[0]).toBe(0);
    // Every minute but the last one is short of a hundred. A screen claiming
    // to be finished while the desk is still gone is the one lie on it that
    // would be about the MECHANIC rather than about the machine.
    for (const [minutesIn, percent] of shown.entries()) {
      expect(percent, `minute ${String(minutesIn)}`)
        .toBeLessThan(minutesIn === REBOOT_MINUTES - 1 ? 101 : 100);
    }

    expect(shown[REBOOT_MINUTES - 1]).toBe(100);
  });

  it('never goes backwards, at either length it is drawn at', () => {
    for (const minutes of [8, REBOOT_MINUTES, 40]) {
      const shown = through(minutes);

      for (let index = 1; index < shown.length; index += 1) {
        expect(
          shown[index],
          `${String(minutes)} minutes, minute ${String(index)}`,
        ).toBeGreaterThanOrEqual(shown[index - 1] ?? 0);
      }
    }
  });

  /**
   * The hang. Every real one of these stops at thirty and thinks about it, and
   * this one does it for a third of the block - which is the joke, and is why
   * the curve is a table somebody tuned rather than a formula.
   */
  it('sits at thirty for a third of the job and then jumps', () => {
    const shown = through(REBOOT_MINUTES);
    const stuck = shown.filter((percent) => percent >= 29 && percent <= 32);

    expect(stuck.length).toBeGreaterThanOrEqual(REBOOT_MINUTES / 3);

    // And then it moves in one go, the way they do: somewhere in the middle
    // there is a minute worth a third of the bar.
    const jumps = shown.map(
      (percent, index) => percent - (shown[index - 1] ?? percent),
    );

    expect(Math.max(...jumps)).toBeGreaterThanOrEqual(30);
  });

  it('answers something sane for the lengths nothing ships', () => {
    // Before it starts, and a block whose only minute is its last one.
    expect(updatePercent(-3, REBOOT_MINUTES)).toBe(0);
    expect(updatePercent(0, 1)).toBe(100);
    // And past the end, which the window cannot reach and arithmetic can.
    expect(updatePercent(REBOOT_MINUTES + 5, REBOOT_MINUTES)).toBe(100);
    expect(updatePercent(Number.NaN, REBOOT_MINUTES)).toBe(0);
  });
});
