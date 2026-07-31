/**
 * What the Worker is willing to keep under a badge.
 *
 * The cloud copy is the SAME file the browser writes to `localStorage`, stored
 * verbatim, because the moment the server has its own opinion about the shape
 * of a save there are two save formats to migrate instead of one. So the
 * checks here are deliberately shallow: is it small enough to keep, is it
 * JSON, and does it carry the two numbers the sync itself reads - the schema,
 * and the wall clock the newest-wins rule is decided on.
 *
 * Anything past that is the game's business. A save that parses here and is
 * refused by `parseSaveFile` in the browser is a save the player is told about
 * by the half of the product that can explain it.
 */

/** Half a megabyte. A real week's save is a few tens of kilobytes. */
export const MAX_SAVE_BYTES = 512 * 1_024;

export const SAVE_TOO_BIG = 'That save is larger than this badge can keep '
  + '(512 KB). Nothing has been uploaded, and the copy in this browser is '
  + 'untouched.';

export const SAVE_NOT_A_SAVE = 'That was not a save file. Nothing has been '
  + 'uploaded.';

export interface SaveEnvelope {
  readonly schema: number;
  /** Epoch milliseconds the save was written at, which decides conflicts. */
  readonly savedAt: number;
}

export type SaveCheck =
  | { readonly ok: true; readonly envelope: SaveEnvelope }
  | { readonly ok: false; readonly status: number; readonly reason: string };

export function byteLength(body: string): number {
  return new TextEncoder().encode(body).length;
}

export function checkSave(body: string): SaveCheck {
  if (byteLength(body) > MAX_SAVE_BYTES) {
    // 413 rather than 400: the file is not wrong, it is too big, and the
    // difference is the difference between "fix your game" and "this one
    // will not fit".
    return { ok: false, status: 413, reason: SAVE_TOO_BIG };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, reason: SAVE_NOT_A_SAVE };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, status: 400, reason: SAVE_NOT_A_SAVE };
  }

  const { schema, savedAt } = parsed as Record<string, unknown>;

  if (
    typeof schema !== 'number'
    || !Number.isSafeInteger(schema)
    || schema < 1
    || typeof savedAt !== 'number'
    || !Number.isSafeInteger(savedAt)
    || savedAt < 0
  ) {
    return { ok: false, status: 400, reason: SAVE_NOT_A_SAVE };
  }

  return { ok: true, envelope: { schema, savedAt } };
}
