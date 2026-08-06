import { describe, expect, it } from 'vitest';

import { careerAfter } from './career';
import { PLAYER_TIERS } from './fields';
import { exitForOutcome, offerTone } from './offer';
import { REVIEW_OUTCOMES } from './week';

describe('the review outcome as a career exit', () => {
  it('maps each verdict to the exit that carries the right standing', () => {
    expect(exitForOutcome('passed')).toBe('completed');
    expect(exitForOutcome('fired')).toBe('fired');
    // Redundancy is not for cause, so it carries as clean as a pass: completed,
    // no trail.
    expect(exitForOutcome('redundant')).toBe('completed');
    // A week that is not over has no exit to take yet.
    expect(exitForOutcome('pending')).toBeNull();
  });

  it('answers for every outcome the week can produce', () => {
    // The bridge cannot go stale: a new review outcome added without a mapping
    // here is a switch that would carry nothing, and this is where that reds.
    for (const outcome of REVIEW_OUTCOMES) {
      const exit = exitForOutcome(outcome);
      expect(outcome === 'pending' ? exit === null : exit !== null).toBe(true);
    }
  });

  it('carries a firing as a dented, trailed career and a pass as clean', () => {
    // The whole reason the mapping matters: the exit it chooses is what
    // `careerAfter` reads, so a wrong mapping is a wrong standing at the next
    // desk. A firing dents the reputation and leaves a trail; a pass leaves both.
    const standing = {
      reputation: 60,
      title: 'Tech',
      farmFund: 25_000,
      tier: PLAYER_TIERS.serviceDesk,
    };

    const fired = careerAfter(exitForOutcome('fired') ?? 'completed', standing);
    expect(fired.reputation).toBeLessThan(standing.reputation);
    expect(fired.trail).toBe('fired');

    const passed = careerAfter(exitForOutcome('passed') ?? 'fired', standing);
    expect(passed.reputation).toBe(standing.reputation);
    expect(passed.trail).toBeNull();

    // The one thing that survives both, because it survives everything.
    expect(fired.farmFund).toBe(standing.farmFund);
    expect(passed.farmFund).toBe(standing.farmFund);
  });
});

describe('the tone the offer reads in', () => {
  it('follows the verdict, and only a decided one has a tone', () => {
    expect(offerTone('passed')).toBe('earned');
    expect(offerTone('redundant')).toBe('even');
    expect(offerTone('fired')).toBe('desperate');
    expect(offerTone('pending')).toBeNull();
  });

  it('has a tone for every terminal verdict', () => {
    for (const outcome of REVIEW_OUTCOMES) {
      const tone = offerTone(outcome);
      expect(outcome === 'pending' ? tone === null : tone !== null).toBe(true);
    }
  });
});
