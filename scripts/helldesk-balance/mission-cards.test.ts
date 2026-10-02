import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { POOL } from '../../src/crawler/missions';

const source = readFileSync('scripts/helldesk-balance/mission-record.mjs', 'utf8').replaceAll('export ', '');
const cards = runInNewContext(`${source}\nMISSION_CARDS`) as { id: string; quiet: boolean }[];

describe('the bot\'s card list', () => {
  it('is the S1b pool, in order, quiet runs for every card whose style is not loud', () => {
    expect(cards.map((c) => c.id)).toEqual(POOL.map((c) => c.id));
    for (const c of POOL) expect(cards.find((x) => x.id === c.id)?.quiet, c.id).toBe(c.style !== 'loud');
  });
});
