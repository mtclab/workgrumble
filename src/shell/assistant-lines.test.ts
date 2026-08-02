import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_LINES,
  ASSISTANT_SITUATIONS,
  type AssistantLine,
  assistantLeak,
  canonical,
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

  it('catches an inflected or synonymous verb, not just the exact token', () => {
    // P1-1: the verb rule read exact tokens, so "Delay it" dodged the ban on
    // "postpone" and "reboot the machine" dodged the ban on "restart". Both
    // now fold to the canonical verb and both are caught.
    for (const [situation, text] of [
      ['reboot', 'Delay it a bit longer, go on.'],
      ['reboot', 'Try postponing it. That always helps.'],
      ['ticket', 'Just reboot the whole machine, that fixes everything.'],
    ] as const) {
      expect(
        assistantLeak(text, situation),
        `"${text}" dodged the verb ban`,
      ).not.toBeNull();
    }
  });

  it('catches an all-stopword control label quoted verbatim', () => {
    // P1-2: "Do it now" is a real path label and "Say not now" is the walk-up
    // control, both made entirely of stopwords - so nothing significant was
    // left to share and both passed clean. The raw-label rule catches them.
    for (const [situation, text] of [
      ['ticket', 'Do it now, I would!'],
      ['returning', 'Say not now, that is what I would say.'],
    ] as const) {
      expect(
        assistantLeak(text, situation),
        `"${text}" quoted a control and passed`,
      ).not.toBeNull();
    }
  });

  it('catches a short knowledge-base directive quoted verbatim', () => {
    // P1-3: "Free the blade" is a two-verb KB directive, neither word
    // mechanical, so it beat both the vocabulary and the three-word quote
    // rules. As a quoted control-grammar label it is a leak.
    expect(assistantLeak('Free the blade, whatever that means!', 'ticket'))
      .not.toBeNull();
  });

  it('bans the fixes of every situation an "after" line can stand in front of', () => {
    // P1-4: `after` takes the desk back ahead of the dot, the shakes and the
    // queue, so a line shown then could be over any of them - and it must not
    // name their fixes. "Reseat it" (the About-box fan fix, which the ticket
    // corpus used to omit) and "Drink" (the can, a fix for the shakes it now
    // masks) are both caught.
    expect(assistantLeak('Reseat it, that usually does it.', 'ticket'))
      .not.toBeNull();
    expect(assistantLeak('Reseat it, honestly.', 'after')).not.toBeNull();
    expect(assistantLeak('Have a drink, you have earned it.', 'after'))
      .not.toBeNull();
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

  it('folds every inflection and synonym of a mechanical verb to one token', () => {
    // The stemmer/synonym table, pinned by the pairs rather than by a claim
    // about English. Each row is a set of words that must arrive as one.
    const classes: readonly (readonly string[])[] = [
      ['postpone', 'postpones', 'postponing', 'postponed', 'delay', 'delayed',
        'defer', 'deferring', 'snooze', 'snoozing'],
      ['restart', 'restarting', 'restarted', 'reboot', 'rebooting', 'reboots'],
      ['clear', 'clearing', 'clears', 'empty', 'emptying', 'empties',
        'clearqueue'],
      ['reset', 'resetting', 'resets'],
      ['free', 'freeing', 'frees', 'unjam', 'unjamming'],
      ['unlock', 'unlocking', 'unlocked'],
      ['reseat', 'reseating', 'reseated'],
      ['drink', 'drinking', 'drinks'],
    ];

    for (const variants of classes) {
      const folded = new Set(variants.map((word) => canonical(word)));

      expect(folded.size, `[${variants.join(', ')}] did not fold to one`)
        .toBe(1);
    }

    // And a word the table does not know is its own canonical form.
    expect(canonical('machine')).toBe('machine');
    expect(canonical('note')).toBe('note');
    expect(canonical('password')).toBe('password');
  });

  it('folds a verb to its stem so a conjugation cannot dodge the ban', () => {
    // The inflections of a mechanical verb all read as the one verb: you do
    // not get to say "postponing" over a reboot and call it comment.
    const stems = significantWords('Resetting, unlocking, restarting');

    expect(stems).toContain('reset');
    expect(stems).toContain('unlock');
    expect(stems).toContain('restart');
    expect(significantWords('reset the password')).toContain('reset');
    // Synonyms of a mechanical verb reach the same token.
    expect(significantWords('reboot it')).toContain('restart');
    expect(significantWords('delay it')).toContain('postpon');
  });

  it('leaves an ordinary word alone, so the folding is not a blunt instrument', () => {
    // The verb table is the ONLY thing that folds. A noun is its own canonical
    // form and collides with nothing - which is what keeps the returning lines,
    // made of "note" and "closed", from reading as fixes.
    expect(significantWords('note')).toContain('note');
    expect(significantWords('note')).not.toContain('not');
    expect(significantWords('machines')).not.toContain('machine');
    expect(significantWords('closed the door')).toContain('closed');
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
