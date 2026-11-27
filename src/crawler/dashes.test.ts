import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * House style: plain hyphens, never em or en dashes, in anything a player or
 * a reader of the repo sees. Builders reach for the long dash by habit, so
 * this reads every source and doc file and names each one it finds.
 *
 * The characters are built from their code points so this file passes its
 * own check.
 */

const LONG_DASHES = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`);

/** Code that matches long dashes in text on purpose, to cope with pasted input. */
const ALLOWED = new Set(['src/shell/assistant-lines.ts']);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(ts|md|html|css)$/.test(name)) out.push(path);
  }
  return out;
}

describe('dashes', () => {
  it('no em or en dash in source, pages or docs', () => {
    const found: string[] = [];
    for (const path of [...files('src'), ...files('docs'), 'index.html', 'crawler.html', 'README.md']) {
      if (ALLOWED.has(path)) continue;
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        if (LONG_DASHES.test(line)) found.push(`${path}:${i + 1}`);
      });
    }
    expect(found).toEqual([]);
  });
});
