/**
 * Publish-clean gate: no environment or personal information in the tree (#78).
 *
 * This repository is public, and three research notes had been carrying the
 * absolute home-directory path of the workstation they were written on since
 * August. Nothing failed, because nothing looked. This reads every file git
 * tracks and matches each line against the classes that never belong in it -
 * a home-directory path, the workstation account, the owner's name or handle,
 * a personal mailbox, and an address from a private or carrier-grade range -
 * and fails with `file:line` for each hit. Real values live outside the
 * working tree; the tree carries placeholders (`~`, repo-relative paths).
 *
 * The patterns are assembled from FRAGMENTS, so this file - which git tracks
 * like any other - never carries the strings it forbids and cannot flag itself.
 *
 * WHAT IS ALLOWED, and why, because a game about an IT desk is full of things
 * that look like environment information and are fiction:
 *  - the player's own in-game logins: `/home/pat` and `/Users/pat`, and the
 *    template forms the terminal builds them from (`/home/${login}`);
 *  - the fictional estate's subnet, `10.42.0.0/24` - the gateway, the print
 *    server, the RMM box the terminal resolves. It is content, it is gated by
 *    the terminal tests, and it is the one private range allowed here.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** The repo root: this file sits in `src/`, the gate reads the whole tree. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Files that are bytes rather than prose; none ship today, and none should be read as text. */
const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|wasm|mp3|ogg|wav)$/i;

/** An octet, 0-255, for the address ranges below. */
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';

/**
 * An IPv4 matcher for a range given as its leading-octet pattern(s). The
 * lookarounds keep it off version numbers and longer dotted runs while still
 * catching an address that ends a sentence.
 */
function ipRange(...head: string[]): RegExp {
  const rest = `\\.${OCTET}`.repeat(4 - head.length);

  return new RegExp(`(?<![\\d.])${head.join('\\.')}${rest}(?!\\.?\\d)`);
}

interface Forbidden {
  /** What a hit means, said plainly in the failure. */
  readonly what: string;
  readonly pattern: RegExp;
  /** A string of this class, so a pattern that matches nothing cannot pass. */
  readonly sample: string;
  /** A string that looks like this class and is allowed, so the allowance is held too. */
  readonly allowed?: string;
}

const HOME = '/ho' + 'me/';
const MAC_HOME = '/Us' + 'ers/';
const TEN = '1' + '0';

const FORBIDDEN: readonly Forbidden[] = [
  {
    what: 'a home-directory path (use ~ or a repo-relative path)',
    // Any account's home but the player's own in-game login and the terminal's
    // template forms of it. Not inside a longer path, so a URL that happens to
    // have a `/home/` segment (a press-release link) is not a home directory.
    pattern: new RegExp(
      `(?<![\\w.-])(?:${HOME}|${MAC_HOME}|[A-Za-z]:\\\\Us${'ers'}\\\\)(?!pat\\b|\\$\\{)[A-Za-z0-9._-]+`,
    ),
    sample: `Read-only pass over \`${HOME}someone/src/workgrumble\``,
    allowed: `du -sh ${HOME}pat ${MAC_HOME}\${login} https://example.com/news${HOME}2025`,
  },
  {
    what: 'the workstation account',
    pattern: new RegExp('ka' + 'sm-' + 'user', 'i'),
    sample: `${'ka' + 'sm-' + 'user'}@box`,
  },
  {
    what: "the owner's name or handle",
    pattern: new RegExp(`\\b${'ol' + 'li'}\\b|${'ku' + 'rki'}`, 'i'),
    sample: `addedBy: "${'Ol' + 'li'}"`,
  },
  {
    what: 'a personal mailbox (use contact@ or example.com)',
    pattern: new RegExp(
      `@(?:${['gm' + 'ail', 'googlem' + 'ail', 'hotm' + 'ail', 'outl' + 'ook', 'yah' + 'oo', 'icl' + 'oud'].join('|')})\\.com\\b`,
      'i',
    ),
    sample: `someone@${'gm' + 'ail'}.com`,
  },
  {
    what: 'a private LAN address (10/8 outside the fictional 10.42.0.0/24)',
    pattern: ipRange(TEN, `(?!42\\.0\\.)${OCTET}`),
    sample: `${TEN}.96.1.20`,
    allowed: `Default Gateway: ${TEN}.42.0.1`,
  },
  {
    what: 'a private LAN address (192.168/16)',
    pattern: ipRange('19' + '2', '16' + '8'),
    sample: `${'19' + '2'}.${'16' + '8'}.1.20`,
  },
  {
    what: 'a private LAN address (172.16/12)',
    pattern: ipRange('17' + '2', '(?:1[6-9]|2\\d|3[01])'),
    sample: `${'17' + '2'}.20.0.5`,
  },
  {
    what: 'a carrier-grade / tailnet address (100.64/10)',
    pattern: ipRange('10' + '0', '(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])'),
    sample: `${'10' + '0'}.101.7.3`,
  },
];

/** Every file git tracks, as repo-relative paths. */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 << 20,
  }).split('\0').filter(Boolean);
}

/** Every forbidden line in a body of text, as `file:line: what`. */
export function publishHits(file: string, body: string): string[] {
  const hits: string[] = [];

  body.split('\n').forEach((line, index) => {
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(line)) {
        hits.push(`${file}:${String(index + 1)}: ${rule.what}`);
      }
    }
  });

  return hits;
}

describe('publish-clean', () => {
  it('keeps environment and personal information out of every tracked file', () => {
    const hits = trackedFiles()
      .filter((file) => !BINARY.test(file))
      .flatMap((file) => publishHits(file, readFileSync(`${ROOT}${file}`, 'utf8')));

    expect(hits).toEqual([]);
  });

  it('recognises a value of every class it forbids, and lets the fiction through', () => {
    // A gate whose patterns match nothing passes forever. Each rule is proven
    // against a string of its own class before the tree is trusted - and each
    // allowance against the content it exists for, so it cannot quietly widen.
    for (const rule of FORBIDDEN) {
      expect(rule.pattern.test(rule.sample), rule.what).toBe(true);

      if (rule.allowed !== undefined) {
        expect(rule.pattern.test(rule.allowed), `${rule.what}: ${rule.allowed}`).toBe(false);
      }
    }

    expect(publishHits('docs/x.md', `a\n${FORBIDDEN[0]?.sample ?? ''}`))
      .toEqual([`docs/x.md:2: ${FORBIDDEN[0]?.what ?? ''}`]);
  });

  it('reads a tree that is actually there', () => {
    // Guards the whole gate against a silent no-op: a `git ls-files` that
    // returns nothing (wrong cwd, no repo) would make every scan vacuous.
    const files = trackedFiles();

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('src/publish-clean.test.ts');
    expect(files).toContain('docs/research/week-generation.md');
  });
});
