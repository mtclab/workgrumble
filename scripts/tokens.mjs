#!/usr/bin/env node
/**
 * The tester-token CLI. Owner-run, never a web surface.
 *
 * Minting, listing and revoking admissions is administration, and the one
 * thing this build must not grow is a page that can mint its own way in. So it
 * is a script on the owner's machine that talks to KV through wrangler, and
 * there is no endpoint anywhere in `worker/` that writes a token record.
 *
 * Usage (add `--local` to work against a `wrangler dev` KV on the staging box,
 * and `--remote` is the default because the production namespace is the one
 * anybody actually needs to change):
 *
 *   node scripts/tokens.mjs mint --label "Ada" [--uses 3] [--days 14]
 *   node scripts/tokens.mjs list
 *   node scripts/tokens.mjs show <token>
 *   node scripts/tokens.mjs revoke <token>
 *   node scripts/tokens.mjs seed-fixtures --local
 *
 * `--uses` left off means a shared link with no limit; `--days` left off means
 * one that does not time out. Both are recorded on the record rather than
 * enforced by deleting it, so a link that stops working leaves evidence of
 * having been given to somebody.
 *
 * `seed-fixtures` writes the four tokens `e2e/tokens.ts` drives the door with.
 * It is for a staging KV and says so: those four strings are in the repository,
 * so seeding them into production would be publishing a key.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const BINDING = 'TOKENS';

/**
 * The staging-only fixture tokens, read off the SAME file the journey suite
 * imports - so what the box is seeded with and what the tests drive cannot
 * drift apart. A journey walking in through a link nobody seeded fails on the
 * box with a 403 and no clue why.
 */
const FIXTURES = JSON.parse(
  readFileSync(
    new URL('../e2e/fixtures/door-tokens.json', import.meta.url),
    'utf8',
  ),
);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readFlags(argv) {
  const flags = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const name = arg.slice(2);

    if (name === 'local' || name === 'remote') {
      flags[name] = true;
      continue;
    }

    index += 1;
    flags[name] = argv[index];
  }

  return { flags, positional };
}

function wrangler(args, flags) {
  const where = flags.local === true ? '--local' : '--remote';
  const result = spawnSync(
    'npx',
    ['wrangler', 'kv', ...args, `--binding=${BINDING}`, where],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    fail(`wrangler failed: ${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

function put(token, record, flags) {
  wrangler(['key', 'put', token, JSON.stringify(record)], flags);
}

function get(token, flags) {
  const raw = wrangler(['key', 'get', token], flags).trim();

  if (raw.length === 0) {
    fail(`No token record for "${token}".`);
  }

  return JSON.parse(raw);
}

function newToken() {
  return randomBytes(24).toString('base64url');
}

function mint(flags) {
  const label = flags.label;

  if (typeof label !== 'string' || label.trim().length === 0) {
    fail('A token needs a --label so the list means something later.');
  }

  const uses = flags.uses === undefined ? null : Number(flags.uses);
  const days = flags.days === undefined ? null : Number(flags.days);

  if (uses !== null && (!Number.isSafeInteger(uses) || uses < 1)) {
    fail('--uses must be a whole number of admissions, at least one.');
  }

  if (days !== null && (!Number.isFinite(days) || days <= 0)) {
    fail('--days must be a positive number of days.');
  }

  const token = newToken();
  const record = {
    label: label.trim(),
    uses_max: uses,
    uses_count: 0,
    expires_at: days === null ? null : Date.now() + days * 86400000,
    revoked: false,
  };

  put(token, record, flags);
  console.log(`Minted for ${record.label}`);
  console.log(`  https://workgrumble.mtclab.net/t/${token}`);
  console.log(`  uses: ${uses === null ? 'shared link' : uses}`);
  console.log(`  expires: ${record.expires_at === null ? 'never' : new Date(record.expires_at).toISOString()}`);
}

function list(flags) {
  const raw = wrangler(['key', 'list'], flags);
  const keys = JSON.parse(raw);

  for (const key of keys) {
    if (key.name.startsWith('rate/')) {
      continue;
    }

    const record = get(key.name, flags);
    const spent = record.uses_max === null
      ? `${record.uses_count} admissions (shared)`
      : `${record.uses_count}/${record.uses_max}`;
    console.log(
      `${record.revoked ? 'REVOKED' : 'live   '}  ${spent.padEnd(24)}  `
      + `${key.name}  ${record.label}`,
    );
  }
}

function show(token, flags) {
  console.log(JSON.stringify(get(token, flags), null, 2));
}

function revoke(token, flags) {
  const record = get(token, flags);
  put(token, { ...record, revoked: true }, flags);
  console.log(`Revoked "${record.label}". Anybody it let in is out at their `
    + 'next request.');
}

function seedFixtures(flags) {
  if (flags.local !== true) {
    fail('seed-fixtures is for a staging KV only, and needs --local. These '
      + 'token strings are in the repository.');
  }

  for (const [token, record] of Object.entries(FIXTURES)) {
    // The file carries its own explanation under a key no token can wear.
    if (token.startsWith('_')) {
      continue;
    }

    put(token, record, flags);
    console.log(`seeded ${token}`);
  }
}

const [command, ...rest] = process.argv.slice(2);
const { flags, positional } = readFlags(rest);

switch (command) {
  case 'mint':
    mint(flags);
    break;
  case 'list':
    list(flags);
    break;
  case 'show':
    show(positional[0], flags);
    break;
  case 'revoke':
    revoke(positional[0], flags);
    break;
  case 'seed-fixtures':
    seedFixtures(flags);
    break;
  default:
    fail('Usage: mint | list | show <token> | revoke <token> | seed-fixtures');
}
