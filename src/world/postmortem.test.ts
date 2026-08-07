/**
 * The blameless postmortem gate, and the proof that it has teeth (E6, 0.19.0).
 *
 * A postmortem's one job is to analyse the system and never the person, so the
 * claim is worth exactly as much as the thing that can falsify it: a record that
 * reaches for a name has to fail the build. Most of this file is about what the
 * gate REFUSES - a planted named write-up, in the exact shape a reviewer skimming
 * a content file would nod at - and the other half proves the ban is kept in step
 * with the estate, so a new colleague cannot open a hole the gate walks past.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import {
  BANNED_NAMES,
  namesLeaked,
  type Postmortem,
  POSTMORTEMS,
  postmortemFor,
  postmortemText,
  validatePostmortems,
} from './postmortem';
import { MSP_IDS } from './msp-company';
import { createWorldSession } from './session';

beforeAll(() => {
  loadEngineForTests();
});

/** A blank but well-shaped record, for planting a single bad block into. */
function blank(overrides: Partial<Postmortem> = {}): Postmortem {
  return {
    unit: 'unit:test/example.service',
    title: 'Post-incident review: example.service failed after a change',
    whatHappened: ['A change went out and the service failed to start.'],
    timeline: ['14:00 - deployed; 14:02 - failed; 14:20 - rolled back.'],
    whatTheSystemLetHappen: ['Staging was not a copy of production.'],
    followUp: ['Bring staging into parity with production.'],
    ...overrides,
  };
}

describe('the blameless postmortem gate (E6)', () => {
  it('refuses a postmortem that names the person who ran the deploy', () => {
    // The plant: a real, plausible write-up that blames a name - the exact
    // failure a blameless culture exists to forbid, and a line somebody could
    // write in a hurry.
    const named = blank({
      whatTheSystemLetHappen: [
        'Morgan deployed a build that had not been tested against production '
          + 'and it broke the worker.',
      ],
    });

    expect(namesLeaked(postmortemText(named))).toContain('Morgan');
  });

  it('fails the build when a named postmortem is among the shipped set', () => {
    // The teeth. Reintroducing the class this gate forbids has to break the
    // load, not warn - this reds if the check is ever softened.
    const named = blank({
      unit: 'unit:test/planted.service',
      followUp: ['Have a word with Pat about not testing in production.'],
    });

    expect(() => validatePostmortems([...POSTMORTEMS, named]))
      .toThrow('names a person');
  });

  it('catches a name in every block a postmortem has', () => {
    // A name is a leak wherever it hides - the title, the timeline, the analysis,
    // the follow-up. One planted record per block, each otherwise clean.
    const blocks: readonly (keyof Postmortem)[] = [
      'title',
      'whatHappened',
      'timeline',
      'whatTheSystemLetHappen',
      'followUp',
    ];

    for (const block of blocks) {
      const value = block === 'title'
        ? 'Nadia signed off the change'
        : ['Nadia signed off the change without a review.'];
      const planted = blank({ [block]: value });

      expect(
        namesLeaked(postmortemText(planted)),
        `a name in "${block}" walked past the gate`,
      ).toContain('Nadia');
    }
  });

  it('leaves a genuinely blameless record alone', () => {
    // The other half of a gate worth having: the shipped record analyses the
    // system in plain words and names nobody, so it passes clean.
    const doc = postmortemFor(MSP_IDS.mspInfraWorkerUnit);

    expect(doc).toBeDefined();
    expect(namesLeaked(postmortemText(doc as Postmortem))).toEqual([]);
  });

  it('refuses a shapeless record - every part has to say something', () => {
    expect(() => validatePostmortems([blank({ followUp: [] })]))
      .toThrow('empty block');
    expect(() => validatePostmortems([blank({ timeline: ['   '] })]))
      .toThrow('empty block');
  });

  it('refuses two postmortems for one incident', () => {
    expect(() => validatePostmortems([blank(), blank()]))
      .toThrow('an incident gets one');
  });
});

describe('the shipped postmortems', () => {
  it('are all blameless, which is the whole point', () => {
    // `validatePostmortems` already ran at load; this says so out loud and
    // re-runs the check rather than trusting it.
    expect(validatePostmortems([...POSTMORTEMS])).toHaveLength(POSTMORTEMS.length);

    for (const doc of POSTMORTEMS) {
      expect(namesLeaked(postmortemText(doc)), doc.unit).toEqual([]);
    }
  });

  it('has the failed-deploy write-up, and it names the SYSTEM, not a person', () => {
    const doc = postmortemFor(MSP_IDS.mspInfraWorkerUnit);

    expect(doc).toBeDefined();
    // It says the true, blameless things - staging parity, no rollback - and
    // never a name.
    const text = postmortemText(doc as Postmortem).toLowerCase();
    expect(text).toContain('staging');
    expect(text).toContain('rollback');
    expect(namesLeaked(postmortemText(doc as Postmortem))).toEqual([]);
  });
});

describe('the ban is kept in step with the estate', () => {
  it('bans every name token of every person in both employers\' worlds', () => {
    // The roster check: a new colleague added to the world without their name
    // going onto BANNED_NAMES would open a hole the gate walks past, so this
    // reads every person off the loaded worlds and asserts each token is banned.
    const banned = new Set(BANNED_NAMES.map((name) => name.toLowerCase()));
    const worlds = [createWorldSession(), createWorldSession({
      farmFund: 0,
      attempt: 1,
      arcWeek: 1,
      employer: 'msp',
    })];

    for (const world of worlds) {
      for (const person of world.engine.graph.nodesOfKind('person')) {
        const name = person.fields.name;

        if (typeof name !== 'string') {
          continue;
        }

        for (const token of name.split(/\s+/u).filter((t) => t.length > 0)) {
          // A company suffix ("Ltd") is not a person's name and is not banned.
          if (token === 'Ltd') {
            continue;
          }

          expect(
            banned.has(token.toLowerCase()),
            `"${token}" (from "${name}") is a person's name and is not banned`,
          ).toBe(true);
        }
      }
    }
  });
});
