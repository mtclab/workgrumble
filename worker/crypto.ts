/**
 * The signing primitives, kept in one file so there is one answer to "how is
 * this signed" rather than one per caller.
 *
 * HMAC-SHA-256 through WebCrypto, which the Workers runtime provides and Node
 * provides too - so every one of these is exercised by the local gate, offline,
 * without wrangler.
 */

const encoder = new TextEncoder();

/**
 * Bytes that own an `ArrayBuffer` rather than "some buffer or other".
 *
 * `Uint8Array` grew a type parameter, and its default admits a
 * `SharedArrayBuffer` - which WebCrypto will not take, and rightly: a key or a
 * message that another thread can rewrite mid-operation is not one. Every
 * array in this file is freshly allocated here, so saying so is free.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/**
 * And back, answering rather than throwing.
 *
 * Everything decoded here arrived in a cookie header, which is to say from
 * whoever asked - so "this is not base64url" is a normal Tuesday and not an
 * exception. The padding is put back by hand because a decoder that is
 * forgiving on one runtime and strict on another is a bug that only shows up
 * in production.
 */
export function fromBase64Url(text: string): Bytes | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    return null;
  }

  const padded = text.replaceAll('-', '+').replaceAll('_', '/')
    + '='.repeat((4 - (text.length % 4)) % 4);

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

export function utf8(text: string): Bytes {
  return encoder.encode(text);
}

/** The HMAC key, imported once per request rather than per signature. */
export async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signMessage(
  key: CryptoKey,
  message: string,
): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', key, utf8(message));
  return toBase64Url(new Uint8Array(signature));
}

/**
 * Whether a signature belongs to a message.
 *
 * `crypto.subtle.verify` rather than comparing two strings: the comparison is
 * the part an attacker times, and the platform's own is the one written by
 * people who thought about that.
 */
export async function verifyMessage(
  key: CryptoKey,
  message: string,
  signature: string,
): Promise<boolean> {
  const bytes = fromBase64Url(signature);

  if (bytes === null) {
    return false;
  }

  try {
    return await crypto.subtle.verify('HMAC', key, bytes, utf8(message));
  } catch {
    return false;
  }
}

/** Cryptographically random bytes, which is the only randomness in here. */
export function randomBytes(count: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(count));
}
