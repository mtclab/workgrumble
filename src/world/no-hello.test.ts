import { describe, expect, it } from 'vitest';

import {
  stillTyping,
  TYPING_CADENCE,
  TYPING_OPENED,
  typingLine,
  typingMinutesLeft,
} from './no-hello';
import { noHelloOn, WEEK, WEEK_DAYS } from './week';
import { dialogueForSpeaker, dialogueNode } from './dialogue';

describe('the typing indicator', () => {
  it('does not claim somebody is typing in the minute they said hello', () => {
    expect(typingLine(0, 5)).toBe(TYPING_OPENED);
    expect(typingLine(1, 5)).not.toBe(TYPING_OPENED);
  });

  /**
   * The pause is the mechanic, so it is asserted rather than left to the
   * table: an indicator that never goes out is a decoration, and one that
   * stops and starts is the thing that makes somebody sit and watch it.
   */
  it('cycles, and goes out at least once on the way', () => {
    const shown = Array.from(
      { length: TYPING_CADENCE.length + 1 },
      (_unused, minute) => typingLine(minute + 1, 99),
    );

    expect(shown).toContain('');
    expect(new Set(shown).size).toBeGreaterThan(1);
    // And it repeats rather than running out: waiting longer than the table is
    // long must not produce a blank window forever.
    expect(shown[TYPING_CADENCE.length]).toBe(shown[0]);
  });

  it('stops the moment the question has arrived', () => {
    expect(stillTyping(4, 5)).toBe(true);
    expect(stillTyping(5, 5)).toBe(false);
    expect(typingLine(5, 5)).toBe('');
    expect(typingMinutesLeft(0, 5)).toBe(5);
    expect(typingMinutesLeft(3, 5)).toBe(2);
    expect(typingMinutesLeft(9, 5)).toBe(0);
  });

  it('refuses a negative wait rather than inventing a frame for it', () => {
    expect(() => typingLine(-1, 5)).toThrow(/whole number/);
  });
});

describe('the shipped no-hello beats', () => {
  /**
   * Two of them, on different days, from different people, and about
   * different things.
   *
   * The count is the claim the slice makes: one beat is an anecdote and one
   * person doing it twice is a character trait. Two people doing it for
   * opposite reasons - the veteran who knows about the habit and the new
   * starter who is being careful - is the thing that reads as an office.
   */
  it('lands twice in the week, on two people, with two questions', () => {
    const slots = WEEK.flatMap((script) => noHelloOn(script.day));

    expect(slots).toHaveLength(2);
    expect(new Set(slots.map((slot) => slot.speaker)).size).toBe(2);

    const questions = slots.map((slot) => {
      const tree = dialogueForSpeaker(slot.speaker);
      const hello = tree?.hello_root ?? '';
      const asked = dialogueNode(tree ?? { nodes: [] } as never, hello)
        ?.options.find((option) => option.next !== undefined)?.next ?? '';

      return dialogueNode(tree ?? { nodes: [] } as never, asked)?.npc_line ?? '';
    });

    expect(questions.every((line) => line.length > 0)).toBe(true);
    expect(new Set(questions).size).toBe(2);
  });

  it('costs minutes, and says how many before anybody spends them', () => {
    for (const script of WEEK) {
      for (const slot of noHelloOn(script.day)) {
        expect(slot.typingMinutes).toBeGreaterThan(0);
        expect(typingMinutesLeft(0, slot.typingMinutes))
          .toBe(slot.typingMinutes);
      }
    }
  });

  it('answers nothing at all for a day outside the week', () => {
    expect(noHelloOn(0)).toEqual([]);
    expect(noHelloOn(WEEK_DAYS + 1)).toEqual([]);
  });
});
