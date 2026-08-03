/**
 * The after-hours arrival filter, and the two numbers the trade is made of.
 *
 * Pure, so it is tested pure: the presence the player left on and what they have
 * already answered go in, and the pings that actually reach the morning surface
 * come out. The one behaviour that is not obvious is the dot reaching across the
 * night, and it reaches the SAME way it does in the day - a declinable ping is
 * turned away by Do Not Disturb, a mandatory one is not - which is what keeps it
 * the third face of the triangle rather than a fourth cost.
 */

import { describe, expect, it } from 'vitest';

import {
  AFTER_HOURS_REPUTATION,
  AFTER_HOURS_STRESS,
  type AfterHoursSlot,
  afterHoursArrivals,
} from './after-hours';

const CAN_WAVE_OFF: AfterHoursSlot = {
  id: 'after:one',
  speaker: 'person:owen',
  subject: 'The second screen has gone again.',
  declinable: true,
};

const CANNOT: AfterHoursSlot = {
  id: 'after:two',
  speaker: 'person:boss',
  subject: 'Ring me when you are in.',
  declinable: false,
};

describe('what lands on the morning surface', () => {
  it('is everything authored when the dot was Available overnight', () => {
    const arrivals = afterHoursArrivals(
      [CAN_WAVE_OFF, CANNOT],
      'available',
      new Set(),
    );

    expect(arrivals.map((arrival) => arrival.slot.id))
      .toEqual(['after:one', 'after:two']);
    expect(arrivals.every((arrival) => !arrival.answered)).toBe(true);
  });

  it('drops the declinable one under an overnight Do Not Disturb', () => {
    const arrivals = afterHoursArrivals(
      [CAN_WAVE_OFF, CANNOT],
      'dnd',
      new Set(),
    );

    // You told them, so the one that could be waved off was. The one that
    // cannot be waved off lands whatever the dot said.
    expect(arrivals.map((arrival) => arrival.slot.id)).toEqual(['after:two']);
  });

  it('keeps a declinable ping when the dot was merely Away', () => {
    // Away is not a filter anywhere in this world - it stops nothing, it only
    // lies - so a ping it would have turned away is a ping this reads as a bug.
    const arrivals = afterHoursArrivals([CAN_WAVE_OFF], 'away', new Set());

    expect(arrivals.map((arrival) => arrival.slot.id)).toEqual(['after:one']);
  });

  it('marks the ones already answered rather than losing them', () => {
    const arrivals = afterHoursArrivals(
      [CAN_WAVE_OFF, CANNOT],
      'available',
      new Set(['after:one']),
    );

    expect(arrivals.find((arrival) => arrival.slot.id === 'after:one')?.answered)
      .toBe(true);
    expect(arrivals.find((arrival) => arrival.slot.id === 'after:two')?.answered)
      .toBe(false);
  });
});

describe('the trade', () => {
  it('is one point each way, so neither path is a run turned on a ping', () => {
    // Tiny, and equal until there is a reason otherwise: the smallest the meters
    // move, so leaving is genuinely free and answering is genuinely cheap.
    expect(AFTER_HOURS_REPUTATION).toBe(1);
    expect(AFTER_HOURS_STRESS).toBe(1);
  });
});
