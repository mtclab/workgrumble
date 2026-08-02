import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_LINES,
  ASSISTANT_SITUATIONS,
  type AssistantLine,
  assistantLeak,
  LEAK_RUN,
  LEAK_WORDS,
  linesFor,
  realFixesFor,
  RETURNING_LINES,
  RETURNING_TIERS,
  returningLine,
  significantWords,
  validateAssistantLines,
} from './assistant-lines';

/**
 * The banned-hint gate, and the proof that it has teeth.
 *
 * The Assistant exists to be useless. That claim is worth exactly as much as
 * the thing that can falsify it, so most of this file is about what the gate
 * REFUSES: a line that hands the player the real fix for the situation it is
 * standing over has to fail the build, and every planted line below is one
 * somebody could plausibly have written in a hurry.
 */

/**
 * The plant: real, correct, actionable advice, arriving in the minute the
 * player is looking at the ticket it would close.
 *
 * It is the exact shape of the failure this gate exists for - a helpful line
 * that a reviewer skim-reading a content file would nod at - and it is a
 * sentence a first-line tech would actually say.
 */
const TRUE_HINT: AssistantLine = {
  id: 'planted.spooler',
  situation: 'ticket',
  text: 'Looks like a printer! Try `restart PRINT-01\\spooler` and then empty '
    + 'the queue - that usually clears it.',
};

describe('the banned-hint gate', () => {
  it('refuses a line that names the real fix for the situation on screen', () => {
    const leak = assistantLeak(TRUE_HINT.text, TRUE_HINT.situation);

    expect(leak, 'a true hint walked past the gate').not.toBeNull();
    expect(leak?.shared.length ?? 0).toBeGreaterThanOrEqual(LEAK_WORDS);
  });

  it('fails the build when a true hint is planted among the shipped lines', () => {
    // The teeth. Reintroducing the class this gate forbids has to break the
    // load, not produce a warning nobody reads - and this is the assertion
    // that goes red if the check is ever softened into one.
    expect(() => validateAssistantLines([...ASSISTANT_LINES, TRUE_HINT]))
      .toThrow('names a real fix');
  });

  it('refuses the other shapes of real advice, one per situation', () => {
    // One planted line per situation that has a fix of its own, each written
    // the way a helpful person would write it.
    const plants: readonly AssistantLine[] = [
      {
        id: 'planted.account',
        situation: 'ticket',
        text: 'Unlock the account in Active Dictionary and do not reset the '
          + 'password as well.',
      },
      {
        id: 'planted.dnd',
        situation: 'dnd',
        text: 'Set your status back to available and the phone starts '
          + 'ringing again.',
      },
      {
        id: 'planted.call',
        situation: 'call',
        text: 'Answer it - a call about the ticket in your hand costs you no '
          + 'refocus at all.',
      },
      {
        id: 'planted.reboot',
        situation: 'reboot',
        text: 'Postpone it: those minutes are yours and the desk stays '
          + 'yours for all of them.',
      },
      {
        id: 'planted.stress',
        situation: 'stress',
        text: 'Open a can. Money out, steady hands for a while, and a bill.',
      },
    ];

    for (const plant of plants) {
      expect(
        assistantLeak(plant.text, plant.situation),
        `"${plant.id}" is real advice and the gate let it through`,
      ).not.toBeNull();
    }
  });

  it('refuses a line that quotes a published fix, whatever the words are', () => {
    // The copy rule. "money", "steady" and "hands" are not mechanical verbs -
    // no command, path or action uses them - so nothing about the vocabulary
    // catches this. Three of a fix's words in a row does.
    const quoted = 'Money out, steady hands for a while, and worth every '
      + 'penny of it!';
    const leak = assistantLeak(quoted, 'stress');

    expect(leak).not.toBeNull();
    expect(leak?.shared.length ?? 0).toBeGreaterThanOrEqual(LEAK_RUN);
  });

  it('allows a line that only names the situation it is standing over', () => {
    // The other half of a gate worth having: mentioning what is happening is
    // the entire job, and a check that forbade the subject as well as the
    // answer would leave the character with nothing to say.
    expect(assistantLeak(
      'Ooh, a printer! I have always liked printers. I have never met one.',
      'ticket',
    )).toBeNull();
  });

  it('matches whole words, so a longer word is not the fix', () => {
    // "reset" is a fix. "resetting" is somebody describing their morning.
    expect(significantWords('Resetting, unlocking, restarting'))
      .not.toContain('reset');
    expect(significantWords('reset the password')).toContain('reset');
  });

  it('derives its fixes from the registries rather than a hand-written list', () => {
    const fixes = realFixesFor('ticket');
    const sources = new Set(fixes.map((entry) => entry.source));

    // The three that ship the real answers, each recognisable by the shape of
    // the source string, so a registry quietly dropping out of the derivation
    // fails here rather than silently halving the gate.
    expect([...sources].some((source) => source.startsWith('ticket path')))
      .toBe(true);
    expect([...sources].some((source) => source.includes('command')))
      .toBe(true);
    expect([...sources].some((source) => source.includes('resolution step')))
      .toBe(true);
    expect(fixes.length).toBeGreaterThan(60);
  });

  it('checks the returning lines against every fix in the game', () => {
    // They can arrive over any situation at all, so theirs is the strictest
    // bucket: anything a situational line is refused for, these are too.
    const everywhere = realFixesFor('returning').length;

    for (const situation of ASSISTANT_SITUATIONS) {
      expect(realFixesFor(situation).length, situation)
        .toBeLessThanOrEqual(everywhere);
    }
  });
});

describe('the shipped lines', () => {
  it('are all useless, which is the whole product', () => {
    // `validateAssistantLines` already ran at load; this is the assertion that
    // says so out loud, and it re-runs the check rather than trusting it.
    expect(validateAssistantLines([...ASSISTANT_LINES, ...RETURNING_LINES]))
      .toHaveLength(ASSISTANT_LINES.length + RETURNING_LINES.length);
  });

  it('give every situation on the desk something to say', () => {
    for (const situation of ASSISTANT_SITUATIONS) {
      if (situation === 'returning') {
        continue;
      }

      // Two at least, because one line per situation is a character that
      // repeats itself the second time anything happens twice.
      expect(linesFor(situation).length, situation).toBeGreaterThanOrEqual(2);
    }
  });

  it('escalates the gag by the number of times it was closed', () => {
    expect(RETURNING_TIERS).toBeGreaterThanOrEqual(3);

    const said = new Set<string>();

    for (let count = 1; count <= RETURNING_TIERS; count += 1) {
      said.add(returningLine(count).id);
    }

    expect(said.size).toBe(RETURNING_TIERS);
    // And every count past the last tier lands on the last tier rather than
    // running off the end of the list.
    expect(returningLine(RETURNING_TIERS + 40).id)
      .toBe(returningLine(RETURNING_TIERS).id);
    expect(returningLine(0).id).toBe(returningLine(1).id);
  });

  it('refuses a duplicate id and an empty line', () => {
    expect(() => validateAssistantLines([
      { id: 'x', situation: 'idle', text: 'Ooh.' },
      { id: 'x', situation: 'idle', text: 'Aah.' },
    ])).toThrow('Duplicate');
    expect(() => validateAssistantLines([
      { id: 'x', situation: 'idle', text: '   ' },
    ])).toThrow('something to say');
  });
});
