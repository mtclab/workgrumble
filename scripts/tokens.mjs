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
 *   node scripts/tokens.mjs mint --label "Ada" [--uses 3] [--days 14] [--quiet]
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
 * THIS SCRIPT OWNS THE RECORD AND THE DOOR OWNS THE COUNT. `<token>` holds the
 * label, the limit, the expiry and the revocation flag and is written here and
 * nowhere else; `uses/<token>` holds the number of admissions and is written by
 * the Worker and nowhere else. They were one key until a revocation was found
 * live to have been undone by an admission that had read the record a moment
 * too early, and no field in this system has two writers now.
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

    // The flags that take no value. Anything else consumes the next argument,
    // so a new switch that is not listed here would silently eat the token id
    // standing behind it.
    if (name === 'local' || name === 'remote' || name === 'quiet') {
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

/**
 * Where the count lives, and the reason it is not on the record.
 *
 * The door writes `uses/<token>` and NOTHING else; this CLI writes the record
 * and nothing else. They used to share one key, and an admission that had read
 * it before a revoke landed put `revoked: false` back afterwards - found live
 * on the first day. No field with two writers, ever.
 */
function usesKey(token) {
  return `uses/${token}`;
}

function put(key, value, flags) {
  wrangler(['key', 'put', key, value], flags);
}

function putRecord(token, record, flags) {
  put(token, JSON.stringify(record), flags);
}

function read(key, flags) {
  return wrangler(['key', 'get', key], flags).trim();
}

function get(token, flags) {
  const raw = read(token, flags);

  if (raw.length === 0) {
    fail(`No token record for "${token}".`);
  }

  return JSON.parse(raw);
}

/**
 * How many admissions a link has spent: the counter, or the count left on an
 * old record if the counter has not been written yet. The same fallback the
 * door uses, so the listing and the door never disagree about a number.
 */
function usesOf(token, record, flags) {
  const raw = read(usesKey(token), flags);
  return /^\d+$/.test(raw) ? Number(raw) : (record.uses_count ?? 0);
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
  // No count on it. The record is policy, and policy is this script's alone.
  const record = {
    label: label.trim(),
    uses_max: uses,
    expires_at: days === null ? null : Date.now() + days * 86400000,
    revoked: false,
  };

  putRecord(token, record, flags);

  // `--quiet` prints the id and nothing else, for a caller that is a program
  // rather than a person - the revocation journey mints its own link.
  if (flags.quiet === true) {
    console.log(token);
    return;
  }

  console.log(`Minted for ${record.label}`);
  console.log(`  https://workgrumble.mtclab.net/t/${token}`);
  console.log(`  uses: ${uses === null ? 'shared link' : uses}`);
  console.log(`  expires: ${record.expires_at === null ? 'never' : new Date(record.expires_at).toISOString()}`);
}

function list(flags) {
  const raw = wrangler(['key', 'list'], flags);
  const keys = JSON.parse(raw);

  for (const key of keys) {
    // Counters and rate windows are not tokens. Neither can be mistaken for
    // one: a token id may not contain a slash.
    if (key.name.includes('/')) {
      continue;
    }

    const record = get(key.name, flags);
    const used = usesOf(key.name, record, flags);
    const spent = record.uses_max === null
      ? `${used} admissions (shared)`
      : `${used}/${record.uses_max}`;
    console.log(
      `${record.revoked ? 'REVOKED' : 'live   '}  ${spent.padEnd(24)}  `
      + `${key.name}  ${record.label}`,
    );
  }
}

function show(token, flags) {
  const record = get(token, flags);
  console.log(JSON.stringify(
    { ...record, uses_spent: usesOf(token, record, flags) },
    null,
    2,
  ));
}

/**
 * Revoking, and then CHECKING.
 *
 * The read-back is not belt and braces. This script printed "Anybody it let in
 * is out at their next request" while the door was quietly putting the flag
 * back, and the confident sentence is exactly why nobody looked again - a
 * command that claims an outcome it has not checked is how a live defect gets
 * past a smoke test. So the write is read back and the flag is asserted, and
 * the sentence is only printed once it is true.
 */
function revoke(token, flags) {
  const record = get(token, flags);
  putRecord(token, { ...record, revoked: true }, flags);

  const after = get(token, flags);

  if (after.revoked !== true) {
    fail(`REVOCATION DID NOT TAKE for "${token}". The record still reads `
      + `revoked=${JSON.stringify(after.revoked)}. The link is still live; do `
      + 'not tell anybody otherwise.');
  }

  console.log(`Revoked "${record.label}", and read it back to be sure. `
    + 'Anybody it let in is out at their next request.');
}

function seedFixtures(flags) {
  if (flags.local !== true) {
    fail('seed-fixtures is for a staging KV only, and needs --local. These '
      + 'token strings are in the repository.');
  }

  for (const [token, fixture] of Object.entries(FIXTURES)) {
    // The file carries its own explanation under a key no token can wear.
    if (token.startsWith('_')) {
      continue;
    }

    // The fixture file declares a count; it is seeded into the COUNTER, not
    // onto the record, so the "already spent" link is spent for the same
    // reason a real one would be rather than through the legacy fallback.
    const { uses_count: spent = 0, ...record } = fixture;
    putRecord(token, record, flags);
    put(usesKey(token), String(spent), flags);
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
