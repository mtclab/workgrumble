import { describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from '../../world/actions';
import type {
  DialogueEffect,
  DialogueEffectsOutcome,
  DialogueOption,
} from '../../world/dialogue';
import { settleAggressiveTone } from './tone';

/**
 * The shared social settle, which is the whole of the P1-4 fix: the boss
 * consequence lives on ONE path both the chat and the call surface call, so a
 * rude reply cannot be silently exempt from the register depending on which
 * window it was said in. These prove the path fires the witness - and only when
 * the reply was genuinely aggressive and its cost genuinely landed.
 */

const REBUFF: DialogueEffect = {
  action: HELPDESK_ACTIONS.reporterRebuff,
  target: 'ticket:x',
  params: { reaction_first: 'a', reaction_again: 'b' },
};

const AGGRESSIVE: DialogueOption = {
  label: 'Fix it and tell them where to go',
  tone: 'aggressive',
  effects: [REBUFF],
};

function played(done: readonly DialogueEffect[]): DialogueEffectsOutcome {
  return { done: [...done], refusal: null };
}

describe('the shared aggressive-tone settle', () => {
  it('fires the witness for an aggressive reply whose cost landed', () => {
    let fired = 0;
    const note = settleAggressiveTone(
      { witnessedRudeReply: () => { fired += 1; return true; } },
      AGGRESSIVE,
      played([REBUFF]),
    );

    expect(fired).toBe(1);
    expect(note).toContain('standing right there');
  });

  it('still charges but says nothing about the lead when he is elsewhere', () => {
    const note = settleAggressiveTone(
      { witnessedRudeReply: () => false },
      AGGRESSIVE,
      played([REBUFF]),
    );

    expect(note).toContain('cost you reputation');
  });

  it('does nothing at all for a neutral reply', () => {
    let fired = 0;
    const note = settleAggressiveTone(
      { witnessedRudeReply: () => { fired += 1; return true; } },
      { label: 'Fix it', effects: [] },
      played([]),
    );

    expect(fired).toBe(0);
    expect(note).toBeNull();
  });

  it('does not fire when the rebuff was refused and never landed', () => {
    let fired = 0;
    // Aggressive option, but the social effect is not in `done` - a refused
    // rebuff is not a snap the lead can have heard.
    const note = settleAggressiveTone(
      { witnessedRudeReply: () => { fired += 1; return true; } },
      AGGRESSIVE,
      played([]),
    );

    expect(fired).toBe(0);
    expect(note).toBeNull();
  });
});
