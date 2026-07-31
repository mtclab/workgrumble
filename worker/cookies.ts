/**
 * The two cookies this building issues, and the envelope both live in.
 *
 * A cookie is a string the browser hands back unchanged, which means it is a
 * string the PLAYER hands back and can therefore have written themselves. So
 * neither of these carries a secret and neither is trusted: each is a value
 * plus an expiry plus an HMAC over both, and a cookie whose signature does not
 * check out is a cookie that was never there.
 *
 * The expiry is inside the signed payload rather than only in `Max-Age`,
 * because `Max-Age` is advice to a browser and this is a door.
 */

import { fromBase64Url, signMessage, toBase64Url, utf8, verifyMessage } from './crypto';

/** Admission: which tester link let this browser in. */
export const PASS_COOKIE = 'wg_pass';
/** Identity: which badge this browser is playing as. */
export const BADGE_COOKIE = 'wg_badge';

export const PASS_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const BADGE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

interface SealedPayload {
  /** What is being carried: a token id, or a badge number. */
  readonly v: string;
  /** When it stops being true, in epoch milliseconds. */
  readonly x: number;
}

/**
 * One cookie out of a `Cookie:` header.
 *
 * Written by hand rather than split on `;` and trusted: a header can carry the
 * same name twice, values can be quoted, and whitespace around `=` is legal.
 * The first match wins, which is what every browser does.
 */
export function readCookie(header: string | null, name: string): string | null {
  if (header === null) {
    return null;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = part.slice(separator + 1).trim();
    return value.startsWith('"') && value.endsWith('"') && value.length >= 2
      ? value.slice(1, -1)
      : value;
  }

  return null;
}

/**
 * A `Set-Cookie` line.
 *
 * `HttpOnly` because no script in this game has any business reading either of
 * these - the client asks the Worker who it is instead.
 *
 * `SameSite=Lax` rather than `Strict` because admission ARRIVES by following a
 * link from somewhere else, and a Strict cookie set on that redirect is a
 * cookie the very next request does not send.
 *
 * `Secure` follows the SCHEME rather than being unconditional, and that is not
 * a weakening. Browsers REFUSE to store a Secure cookie from an insecure
 * origin - so an unconditional flag would mean the whole product worked in
 * production and was completely unreachable on the staging box, where the
 * Worker is served over plain http by `wrangler dev`: no pass would ever
 * stick, and every journey would meet the invite-only page. Production is
 * https, so the flag is always on where it means anything, and where it is off
 * there is no transport to protect.
 */
export function setCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  return `${name}=${value}; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}`
    + `SameSite=Lax; Max-Age=${String(maxAgeSeconds)}`;
}

/** Wraps a value and its expiry in a signature. */
export async function seal(
  key: CryptoKey,
  value: string,
  expiresAt: number,
): Promise<string> {
  const payload: SealedPayload = { v: value, x: expiresAt };
  const body = toBase64Url(utf8(JSON.stringify(payload)));
  return `${body}.${await signMessage(key, body)}`;
}

/**
 * And unwraps it, or answers null.
 *
 * Every failure is the same answer on purpose: a tampered signature, a payload
 * that is not JSON, a payload that is JSON but the wrong shape and one that
 * simply ran out of time are four different stories and none of them is the
 * caller's business. They all mean "this browser is not carrying a valid one".
 */
export async function unseal(
  key: CryptoKey,
  cookie: string | null,
  now: number,
): Promise<string | null> {
  if (cookie === null) {
    return null;
  }

  const dot = cookie.indexOf('.');

  if (dot <= 0 || dot === cookie.length - 1) {
    return null;
  }

  const body = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);

  if (!await verifyMessage(key, body, signature)) {
    return null;
  }

  const bytes = fromBase64Url(body);

  if (bytes === null) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const { v, x } = parsed as Record<string, unknown>;

  if (typeof v !== 'string' || v.length === 0 || typeof x !== 'number') {
    return null;
  }

  return Number.isFinite(x) && x > now ? v : null;
}
