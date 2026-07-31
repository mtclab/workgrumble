/**
 * The Worker: one door, three KV namespaces and five endpoints.
 *
 * The game itself has not moved - it is still the static bundle, still runs in
 * the browser, still keeps the week in `localStorage`. What this adds is the
 * three things a tester build needs and a static file cannot do: a door that
 * can be closed again, a badge number that is an account without being a
 * person, and somewhere to keep a copy of the save that is not one browser's
 * storage.
 *
 * Two rules run through all of it.
 *
 * NOTHING PERSONAL IS STORED. A player record is a badge and the minute it was
 * minted. There is no email, no name, no analytics and no IP: the rate limits
 * need to tell one caller from another for an hour, so they key on an HMAC of
 * the address with a one-hour life rather than on the address, and the address
 * itself is never written anywhere.
 *
 * THE DOOR ANSWERS THE SAME WAY EVERY TIME. An unknown link, a revoked link,
 * an expired link and a spent link all produce the same page with the same
 * status. The differences between them are the only thing worth learning from
 * guessing, and a door that explains itself is a door that can be walked.
 */

import {
  BADGE_BYTES,
  badgeFromBytes,
  normalizeBadge,
} from '../src/shared/badge';
import {
  BADGE_COOKIE,
  BADGE_MAX_AGE_SECONDS,
  PASS_COOKIE,
  PASS_MAX_AGE_SECONDS,
  readCookie,
  seal,
  setCookie,
  unseal,
} from './cookies';
import { importSigningKey, randomBytes, signMessage } from './crypto';
import {
  FEEDBACK_UNSTAFFED,
  issueBody,
  issueTitle,
  parseFeedback,
} from './feedback';
import { assetHeaders, invitePage, json, refuse } from './http';
import { consumeRate } from './rate-limit';
import { checkSave, MAX_SAVE_BYTES, SAVE_TOO_BIG } from './saves';
import { admit, isTokenShape, parseTokenRecord } from './tokens';
import type { Env, KVNamespace } from './types';

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

/**
 * How hard each surface may be leaned on, and over what stretch.
 *
 * Sized to stop a machine walking the token space or the badge space at speed,
 * and NOT sized to be tight. A tester on a shared office address, a household
 * behind one router and the journey suite itself all arrive as one caller
 * here - and a limit that fails the gate on the second run of the day is a
 * limit somebody deletes rather than tunes. The one that is genuinely small is
 * the feedback counter, and that one is per badge rather than per address,
 * because it is about a person filing the same complaint forty times.
 */
const LIMITS = {
  door: { limit: 120, windowMs: HOUR },
  register: { limit: 30, windowMs: HOUR },
  login: { limit: 60, windowMs: 15 * 60 * 1_000 },
  save: { limit: 240, windowMs: HOUR },
  feedback: { limit: 10, windowMs: DAY },
} as const;

const NO_BADGE = 'This browser is not carrying a badge number. Type yours on '
  + 'the log-on screen, or ask for a new one.';

const DOOR_CLOSED = 'This build is invite-only.';

const TOO_MANY = 'That is a lot of tries in a short time. Give it a few '
  + 'minutes and go again.';

const FEEDBACK_TOO_MANY = 'That is ten reports from this badge today, which '
  + 'is as many as the form takes. Anything else will keep until tomorrow - '
  + 'and if it will not, the ten already filed are the ones being read.';

const MISCONFIGURED = 'This deployment is not finished being set up.';

/**
 * Who is asking, for the purposes of a counter, without recording who is
 * asking.
 *
 * An HMAC of the address under the same secret the cookies use, cut short. It
 * is stable for as long as a rate window lasts, which is the whole requirement,
 * and it is not an address: nothing stored here can be turned back into one
 * without the signing key, and the record expires within the hour regardless.
 */
async function callerKey(key: CryptoKey, request: Request): Promise<string> {
  const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  return (await signMessage(key, `caller:${address}`)).slice(0, 24);
}

/** Rate counters live with the players, under a prefix no badge can wear. */
function rateKey(surface: string, subject: string): string {
  return `rate/${surface}/${subject}`;
}

async function withinRate(
  players: KVNamespace,
  surface: keyof typeof LIMITS,
  subject: string,
  now: number,
): Promise<{ readonly allowed: boolean; readonly retryAfter: string }> {
  const { limit, windowMs } = LIMITS[surface];
  const decision = await consumeRate(
    players,
    rateKey(surface, subject),
    now,
    limit,
    windowMs,
  );

  return {
    allowed: decision.allowed,
    retryAfter: String(decision.retryAfterSeconds),
  };
}

/* -- the door ------------------------------------------------------------- */

/**
 * `GET /t/<token>`: spend one admission and set the pass cookie.
 *
 * The rate limit comes BEFORE the KV lookup, on purpose: a limiter that runs
 * after the thing it is protecting has already been read is a limiter that
 * still lets somebody walk the token space, just with a 403 at the end of it.
 *
 * The count is written back before the cookie is issued. Getting that order
 * wrong is how a single-use link admits two people: the failure mode of doing
 * it this way is a spent use nobody got, which is a token the owner can mint
 * again, and the failure mode of the other way is a limit that is not one.
 */
async function admitTester(
  request: Request,
  env: Env,
  key: CryptoKey,
  token: string,
  now: number,
  secure: boolean,
): Promise<Response> {
  const caller = await callerKey(key, request);

  if (!(await withinRate(env.PLAYERS, 'door', caller, now)).allowed) {
    return invitePage();
  }

  const raw = isTokenShape(token) ? await env.TOKENS.get(token) : null;
  const outcome = admit(token, raw, now);

  if (!outcome.ok) {
    // Every refusal, one answer. `outcome.why` exists for the tests and for
    // the owner's CLI and is deliberately not carried into the response.
    return invitePage();
  }

  await env.TOKENS.put(token, JSON.stringify(outcome.spent));

  // A pass never outlives the link that issued it: a two-week token that let
  // somebody in on its last day does not buy them another month.
  const lifetime = outcome.spent.expires_at === null
    ? now + PASS_MAX_AGE_SECONDS * 1_000
    : Math.min(now + PASS_MAX_AGE_SECONDS * 1_000, outcome.spent.expires_at);
  const cookie = await seal(key, token, lifetime);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Cache-Control': 'private, no-store',
      'Set-Cookie': setCookie(
        PASS_COOKIE,
        cookie,
        Math.max(1, Math.floor((lifetime - now) / 1_000)),
        secure,
      ),
    },
  });
}

/**
 * Whether the browser asking is one that was let in, checked against the token
 * that let it in RATHER than against the cookie alone.
 *
 * Revocation is a field on the token record and this is the line that makes it
 * mean something. A cookie is good for thirty days; without this, revoking a
 * link would stop it admitting anybody new and leave everybody it had already
 * admitted inside for a month.
 */
async function stillAdmitted(
  env: Env,
  key: CryptoKey,
  request: Request,
  now: number,
): Promise<boolean> {
  const cookie = readCookie(request.headers.get('Cookie'), PASS_COOKIE);
  const token = await unseal(key, cookie, now);

  if (token === null || !isTokenShape(token)) {
    return false;
  }

  const record = parseTokenRecord(await env.TOKENS.get(token));

  return record !== null
    && !record.revoked
    && (record.expires_at === null || record.expires_at > now);
}

/* -- identity ------------------------------------------------------------- */

async function badgeOf(
  request: Request,
  key: CryptoKey,
  now: number,
): Promise<string | null> {
  const cookie = readCookie(request.headers.get('Cookie'), BADGE_COOKIE);
  const badge = await unseal(key, cookie, now);

  return badge === null ? null : normalizeBadge(badge);
}

function badgeCookie(
  value: string,
  secure: boolean,
): Record<string, string> {
  return {
    'Set-Cookie': setCookie(
      BADGE_COOKIE,
      value,
      BADGE_MAX_AGE_SECONDS,
      secure,
    ),
  };
}

/**
 * A badge nobody else has.
 *
 * Twelve attempts, because a draw is thrown away for two reasons - the
 * rejection sampling that keeps the numbers even, and a collision with a badge
 * already issued - and a mint that gave up after one would hand out a refusal
 * to roughly one tester in twelve for no reason.
 */
async function mintBadge(players: KVNamespace): Promise<string | null> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const badge = badgeFromBytes(randomBytes(BADGE_BYTES));

    if (badge === null) {
      continue;
    }

    if (await players.get(badge) === null) {
      return badge;
    }
  }

  return null;
}

async function register(
  request: Request,
  env: Env,
  key: CryptoKey,
  now: number,
  secure: boolean,
): Promise<Response> {
  const caller = await callerKey(key, request);
  const rate = await withinRate(env.PLAYERS, 'register', caller, now);

  if (!rate.allowed) {
    return refuse(429, TOO_MANY, { 'Retry-After': rate.retryAfter });
  }

  const badge = await mintBadge(env.PLAYERS);

  if (badge === null) {
    return refuse(503, 'The badge machine is jammed. Try again in a moment.');
  }

  // The whole player record. There is nothing else to put in it.
  await env.PLAYERS.put(badge, JSON.stringify({ created_at: now }));

  const cookie = await seal(key, badge, now + BADGE_MAX_AGE_SECONDS * 1_000);
  return json({ ok: true, badge }, 200, badgeCookie(cookie, secure));
}

async function login(
  request: Request,
  env: Env,
  key: CryptoKey,
  now: number,
  secure: boolean,
): Promise<Response> {
  const caller = await callerKey(key, request);
  const rate = await withinRate(env.PLAYERS, 'login', caller, now);

  if (!rate.allowed) {
    return refuse(429, TOO_MANY, { 'Retry-After': rate.retryAfter });
  }

  const body = await readJson(request);
  const typed = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).badge
    : null;
  const badge = typeof typed === 'string' ? normalizeBadge(typed) : null;

  // One refusal for "that is not a badge number" and for "that badge has
  // never been issued". Telling those two apart is how a badge space gets
  // walked, and there are only six and a half million of them.
  const unknown = refuse(
    401,
    'That badge number is not one this building recognises. Check the digits, '
      + 'or ask for a new badge - a new one starts a new week.',
  );

  if (badge === null || await env.PLAYERS.get(badge) === null) {
    return unknown;
  }

  const cookie = await seal(key, badge, now + BADGE_MAX_AGE_SECONDS * 1_000);
  return json({ ok: true, badge }, 200, badgeCookie(cookie, secure));
}

/* -- saves ---------------------------------------------------------------- */

async function readSave(env: Env, badge: string): Promise<Response> {
  const raw = await env.SAVES.get(badge);

  if (raw === null) {
    return refuse(404, 'There is no save on this badge yet.');
  }

  return new Response(raw, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function writeSave(
  request: Request,
  env: Env,
  badge: string,
  now: number,
): Promise<Response> {
  const rate = await withinRate(env.PLAYERS, 'save', badge, now);

  if (!rate.allowed) {
    return refuse(429, TOO_MANY, { 'Retry-After': rate.retryAfter });
  }

  // Refused on the declared length before the body is read, so a save that is
  // far too big costs this Worker a header rather than a megabyte.
  const declared = Number(request.headers.get('Content-Length') ?? '0');

  if (Number.isFinite(declared) && declared > MAX_SAVE_BYTES) {
    return refuse(413, SAVE_TOO_BIG);
  }

  const body = await request.text();
  const checked = checkSave(body);

  if (!checked.ok) {
    return refuse(checked.status, checked.reason);
  }

  // Last write wins, and the copy in the browser is still the one being
  // played: this is a spare key under a mat, not the front door.
  await env.SAVES.put(badge, body);
  return json({ ok: true, savedAt: checked.envelope.savedAt });
}

/* -- feedback ------------------------------------------------------------- */

async function fileFeedback(
  request: Request,
  env: Env,
  badge: string,
  now: number,
): Promise<Response> {
  const rate = await withinRate(env.PLAYERS, 'feedback', badge, now);

  if (!rate.allowed) {
    return refuse(429, FEEDBACK_TOO_MANY, { 'Retry-After': rate.retryAfter });
  }

  const parsed = parseFeedback(await readJson(request), badge);

  if (!parsed.ok) {
    return refuse(400, parsed.reason);
  }

  const dryRun = env.FEEDBACK_DRY_RUN === 'true';
  const token = env.FEEDBACK_GH_TOKEN;
  const repo = env.FEEDBACK_REPO;

  if (dryRun) {
    return json({ ok: true, delivered: false });
  }

  if (token === undefined || repo === undefined) {
    return refuse(503, FEEDBACK_UNSTAFFED);
  }

  const base = env.FEEDBACK_API_BASE ?? 'https://api.github.com';

  try {
    // No `redirect: "error"` here, and it is not an omission. It kills fetch
    // in the Workers runtime outright - the vahti feedback endpoint spent an
    // afternoon proving it - so the redirect mode is left at its default.
    const posted = await fetch(`${base}/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'workgrumble-worker',
      },
      body: JSON.stringify({
        title: issueTitle(parsed.report),
        body: issueBody(parsed.report),
        labels: ['tester-feedback'],
      }),
    });

    if (!posted.ok) {
      // Whatever GitHub said stays between GitHub and this Worker. The player
      // gets a sentence they can act on and nothing about our credentials.
      return refuse(
        502,
        'The report did not get through to the tracker. Nothing has been '
          + 'filed; try again in a minute.',
      );
    }
  } catch {
    return refuse(
      502,
      'The report did not get through to the tracker. Nothing has been '
        + 'filed; try again in a minute.',
    );
  }

  return json({ ok: true, delivered: true });
}

/* -- plumbing ------------------------------------------------------------- */

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function wrongMethod(): Response {
  return refuse(405, 'That is not something this endpoint does.');
}

async function serveAsset(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(assetHeaders(pathname))) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function api(
  request: Request,
  env: Env,
  key: CryptoKey,
  pathname: string,
  now: number,
  secure: boolean,
): Promise<Response> {
  if (pathname === '/api/session') {
    return request.method === 'GET'
      ? json({ ok: true, badge: await badgeOf(request, key, now) })
      : wrongMethod();
  }

  if (pathname === '/api/register') {
    return request.method === 'POST'
      ? register(request, env, key, now, secure)
      : wrongMethod();
  }

  if (pathname === '/api/login') {
    return request.method === 'POST'
      ? login(request, env, key, now, secure)
      : wrongMethod();
  }

  if (pathname === '/api/save' || pathname === '/api/feedback') {
    const badge = await badgeOf(request, key, now);

    if (badge === null) {
      return refuse(401, NO_BADGE);
    }

    if (pathname === '/api/feedback') {
      return request.method === 'POST'
        ? fileFeedback(request, env, badge, now)
        : wrongMethod();
    }

    if (request.method === 'GET') {
      return readSave(env, badge);
    }

    return request.method === 'PUT'
      ? writeSave(request, env, badge, now)
      : wrongMethod();
  }

  return refuse(404, 'There is nothing at that address.');
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const secret = env.SIGNING_KEY;

  // A Worker with no signing key cannot tell a real cookie from a typed one,
  // so it refuses everything rather than issuing cookies signed with nothing.
  if (secret === undefined || secret.length < 16) {
    return refuse(503, MISCONFIGURED);
  }

  const key = await importSigningKey(secret);
  const now = Date.now();
  // See `setCookie`: an unconditional Secure flag is a product that works in
  // production and cannot be reached at all on the staging box, because a
  // browser will not store a Secure cookie from an http origin.
  const secure = url.protocol === 'https:';

  if (pathname.startsWith('/t/')) {
    return request.method === 'GET'
      ? admitTester(request, env, key, pathname.slice(3), now, secure)
      : invitePage();
  }

  if (!await stillAdmitted(env, key, request, now)) {
    // The game gets a sentence it can put in a window; a browser gets a page.
    return pathname.startsWith('/api/')
      ? refuse(403, DOOR_CLOSED)
      : invitePage();
  }

  return pathname.startsWith('/api/')
    ? api(request, env, key, pathname, now, secure)
    : serveAsset(request, env, pathname);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch {
      // Nothing about the failure goes out. An exception here is a bug in this
      // file, and its message is the sort of thing that names a binding.
      return refuse(500, 'Something on this side fell over. Try again.');
    }
  },
};
