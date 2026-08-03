import { describe, expect, it } from 'vitest';

import { ROADMAP, ROADMAP_PREAMBLE } from './roadmap';

/**
 * The roadmap is marketing-facing copy in a locked voice, so this file is a
 * voice-lock rather than a shape check. The preamble and the six titles are
 * asserted VERBATIM: if somebody edits the copy - softens the "IT does not
 * give dates" line, promises a date, renames a plank - this goes red on
 * purpose. That is the point of the test. The body of each item is checked for
 * shape only (a real paragraph, keyed to its title), because a per-word lock on
 * six paragraphs is a test the next honest wording change has to come back and
 * rewrite, which is how a lock stops being read and starts being routed round.
 */

const PREAMBLE =
  'The following changes are planned. They are listed in roughly the order we '
  + 'expect to make them, which is not a promise about the order we will make '
  + 'them in, and there are no dates. IT does not give dates. IT has learned. '
  + 'Everything below is subject to change, including whether it happens at '
  + 'all, and none of it is installed yet - your workstation is exactly as '
  + 'capable this morning as it says in Update History and no more.';

const TITLES = [
  'Software you can install, and a building that has feelings about it.',
  'More than one place to be messaged at once.',
  'Other jobs, other companies, other decades.',
  'Real servers, and the pager that comes with them.',
  'The cloud, and the invoice for it.',
  'A career, and a way out of it.',
] as const;

describe('the roadmap copy', () => {
  it('carries the standing disclaimer word for word', () => {
    expect(ROADMAP_PREAMBLE).toBe(PREAMBLE);
  });

  it('is the six planned items, titled word for word and in order', () => {
    expect(ROADMAP.map((item) => item.title)).toEqual([...TITLES]);
  });

  it('gives every item a real paragraph of body', () => {
    for (const item of ROADMAP) {
      // A paragraph a player reads, not a label. The words are the author's;
      // this only refuses an empty or one-line stub sneaking in under a title.
      expect(item.body.length, item.title).toBeGreaterThan(120);
    }
  });

  it('is frozen, so nothing edits the plan at runtime', () => {
    expect(Object.isFrozen(ROADMAP)).toBe(true);
  });
});
