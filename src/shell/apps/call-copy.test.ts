/**
 * The reused call window says one thing three ways, and it must not say a false
 * one (0.4.3, P1-B).
 *
 * A call, a person at the desk, and a chat message share the window because
 * they share the mechanic - a synchronous conversation with three answers - but
 * they do not share the words. A phone rings, rings out, is put down and rings
 * back; a message does none of those. Until this slice the chat beat borrowed
 * the phone's every outcome line, so the window told the player their message
 * "rang out" and that they had "put the phone down" on a chat - false in
 * fiction, which the content bar forbids outright.
 *
 * The gate reads the whole of a register's printed copy and refuses a phone
 * word in the message one. TEETH: put any "phone", "ring" or "rang" back into
 * the `MESSAGE` register and this reds; the control below proves the words are
 * really banned by finding them, on purpose, in the call's register.
 */

import { describe, expect, it } from 'vitest';

import { registerCopy } from './call';

const PHONE_WORDS = /\b(phone|ring|ringing|rings|rings|rang)\b/iu;

describe('the message register never speaks as a phone', () => {
  it('carries no phone word anywhere in its copy', () => {
    for (const line of registerCopy('chat')) {
      expect(line, line).not.toMatch(PHONE_WORDS);
    }
  });

  /**
   * The control, which is what stops the assertion above from passing on a typo
   * in the pattern: the CALL register is meant to be full of phone words, so if
   * the matcher has stopped matching them this fails instead.
   */
  it('still lets a call be a call', () => {
    expect(registerCopy('call').join(' ')).toMatch(PHONE_WORDS);
  });
});
