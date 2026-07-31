import { beforeAll, describe, expect, it } from 'vitest';

import {
  clearCookie,
  PASS_COOKIE,
  readCookie,
  seal,
  setCookie,
  unseal,
} from './cookies';
import { importSigningKey, signMessage, toBase64Url, utf8 } from './crypto';

/**
 * The signed envelope both cookies live in.
 *
 * Everything here runs on Node's own WebCrypto, which is the same interface
 * the Workers runtime provides - so the signing this build ships is the
 * signing the local gate checks, offline, without wrangler.
 */

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

let key: CryptoKey;
let other: CryptoKey;

beforeAll(async () => {
  key = await importSigningKey('a-signing-key-long-enough-to-be-one');
  other = await importSigningKey('a-different-signing-key-entirely!!');
});

describe('reading a cookie header', () => {
  it('finds the one it was asked for, however the header is spaced', () => {
    expect(readCookie('wg_pass=abc', PASS_COOKIE)).toBe('abc');
    expect(readCookie('a=1; wg_pass=abc; b=2', PASS_COOKIE)).toBe('abc');
    expect(readCookie('a=1;wg_pass = abc', PASS_COOKIE)).toBe('abc');
    expect(readCookie('wg_pass="abc"', PASS_COOKIE)).toBe('abc');
  });

  it('does not match a cookie whose name merely ends the same way', () => {
    expect(readCookie('not_wg_pass=abc', PASS_COOKIE)).toBeNull();
    expect(readCookie('wg_password=abc', PASS_COOKIE)).toBeNull();
    expect(readCookie(null, PASS_COOKIE)).toBeNull();
    expect(readCookie('', PASS_COOKIE)).toBeNull();
  });
});

describe('the Set-Cookie line', () => {
  it('is http-only, secure and scoped to the whole site', () => {
    const line = setCookie(PASS_COOKIE, 'value', 60);

    expect(line).toContain('HttpOnly');
    expect(line).toContain('Secure');
    expect(line).toContain('Path=/');
    expect(line).toContain('Max-Age=60');
  });

  /**
   * Lax rather than Strict, and it is not a preference. Admission ARRIVES by
   * following a link from a mail client or a chat window; a Strict cookie set
   * on that redirect is a cookie the redirect's own next request does not
   * carry, and the tester lands on the invite-only page holding a valid pass.
   */
  it('is SameSite=Lax, because the door is reached from elsewhere', () => {
    expect(setCookie(PASS_COOKIE, 'value', 60)).toContain('SameSite=Lax');
  });

  it('clears by expiring rather than by being absent', () => {
    expect(clearCookie(PASS_COOKIE)).toContain('Max-Age=0');
  });
});

describe('sealing and unsealing', () => {
  it('carries a value back out again', async () => {
    const sealed = await seal(key, 'WG-1234-AB', NOW + MINUTE);
    expect(await unseal(key, sealed, NOW)).toBe('WG-1234-AB');
  });

  it('refuses a value that expired, on the millisecond', async () => {
    const sealed = await seal(key, 'WG-1234-AB', NOW);

    expect(await unseal(key, sealed, NOW - 1)).toBe('WG-1234-AB');
    expect(await unseal(key, sealed, NOW)).toBeNull();
    expect(await unseal(key, sealed, NOW + 1)).toBeNull();
  });

  it('refuses a signature from a different key', async () => {
    const sealed = await seal(other, 'WG-1234-AB', NOW + MINUTE);
    expect(await unseal(key, sealed, NOW)).toBeNull();
  });

  /**
   * The attack this whole file exists for: a browser that edits the payload it
   * was handed. The expiry and the value are both INSIDE the signature, so
   * moving either one invalidates it - a cookie is a thing the player holds,
   * and anything trusted about it has to be something they cannot change.
   */
  it('refuses a payload that was edited under its own signature', async () => {
    const sealed = await seal(key, 'WG-1234-AB', NOW + MINUTE);
    const [body, signature] = sealed.split('.');
    const forged = toBase64Url(
      utf8(JSON.stringify({ v: 'WG-9999-ZZ', x: NOW + MINUTE })),
    );
    const stretched = toBase64Url(
      utf8(JSON.stringify({ v: 'WG-1234-AB', x: NOW + 100 * MINUTE })),
    );

    expect(await unseal(key, `${forged}.${signature ?? ''}`, NOW)).toBeNull();
    expect(await unseal(key, `${stretched}.${signature ?? ''}`, NOW)).toBeNull();
    expect(await unseal(key, `${body ?? ''}.`, NOW)).toBeNull();
  });

  it('refuses anything that is not a sealed value at all', async () => {
    expect(await unseal(key, null, NOW)).toBeNull();
    expect(await unseal(key, '', NOW)).toBeNull();
    expect(await unseal(key, 'no-dot-anywhere', NOW)).toBeNull();
    expect(await unseal(key, '.signature', NOW)).toBeNull();
    expect(await unseal(key, `${toBase64Url(utf8('null'))}.x`, NOW)).toBeNull();
  });

  /**
   * A payload this Worker signed itself, and still will not accept: an empty
   * value, or an expiry that is not a number, is a cookie a future bug could
   * mint - and "we signed it" is not the same claim as "it means something".
   */
  it('refuses a correctly signed payload of the wrong shape', async () => {
    const shapes = [
      { v: '', x: NOW + MINUTE },
      { v: 'WG-1234-AB', x: 'later' },
      { v: 42, x: NOW + MINUTE },
      { nothing: true },
    ];

    for (const shape of shapes) {
      const body = toBase64Url(utf8(JSON.stringify(shape)));
      const sealed = `${body}.${await signMessage(key, body)}`;

      expect(await unseal(key, sealed, NOW), JSON.stringify(shape)).toBeNull();
    }
  });
});
