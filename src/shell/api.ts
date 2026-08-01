/**
 * Talking to the Worker, from a game that must not need it.
 *
 * Everything in this file answers rather than throws, and every answer says
 * which KIND of "no" it is, because the two are not the same thing to a player.
 *
 *  - OFFLINE: there is nothing on the other end. The connection failed, or the
 *    build is being served by a plain file server with no Worker behind it, or
 *    the browser is in a tunnel. Nothing is said out loud: the game is
 *    offline-first, the week is in `localStorage`, and a toast about a badge
 *    service every time somebody's train goes under a bridge is noise about a
 *    feature they did not ask for.
 *  - A REFUSAL: the Worker answered, and said no, and said why. That sentence
 *    is the player's - it is shown.
 *
 * The difference is decided on whether the answer was JSON of the shape this
 * Worker sends. A 404 page from a static server is not a refusal; it is an
 * absence, and it is the case every one of the existing browser journeys runs
 * in.
 */

import { lapsesAt, parseAccountRecord } from '../shared/retention';

export interface ApiFailure {
  readonly ok: false;
  /** True when there was nothing to talk to, which is not an error. */
  readonly offline: boolean;
  readonly reason: string;
}

export type ApiResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | ApiFailure;

export const OFFLINE_REASON = 'There is nothing on the other end of the wire '
  + 'right now. The week is in this browser and carries on regardless.';

/**
 * The badge, and the three dates that make it an account rather than a number.
 *
 * All three are the building's, not this browser's: the stamps come from the
 * Worker, and the date it lapses is worked out from the same constant the
 * Worker hands to KV - so the date the badge screen shows is the date the
 * record actually has, rather than a second opinion about it.
 */
export interface Account {
  readonly badge: string;
  /** Epoch milliseconds the badge was minted at. */
  readonly createdAt: number;
  /** Epoch milliseconds of the last login or cloud save. */
  readonly lastSeen: number;
  /** When it goes, badge and week together, if nobody comes back. */
  readonly lapsesAt: number;
}

/** What a report carries besides what the player typed. */
export interface FeedbackContext {
  readonly day: number;
  readonly schema: number;
  readonly build: string;
  readonly core: string;
  readonly app: string | null;
  readonly actions: readonly string[];
}

export interface FeedbackSubmission {
  readonly summary: string;
  readonly details: string;
  /** Whether the badge may be attached. Off unless the player ticked it. */
  readonly contact: boolean;
  readonly context: FeedbackContext;
}

export interface CloudApi {
  /** The badge this browser is carrying, if the Worker recognises one. */
  session(): Promise<ApiResult<Account | null>>;
  register(): Promise<ApiResult<Account>>;
  logIn(badge: string): Promise<ApiResult<Account>>;
  /** The save on this badge as raw text, or null when there is not one. */
  fetchSave(): Promise<ApiResult<string | null>>;
  storeSave(body: string): Promise<ApiResult<void>>;
  sendFeedback(report: Readonly<FeedbackSubmission>): Promise<ApiResult<void>>;
}

interface Answer {
  readonly status: number;
  readonly text: string;
  /** The body, when it is a JSON object. Null when it is anything else. */
  readonly json: Record<string, unknown> | null;
}

function offline(): ApiFailure {
  return { ok: false, offline: true, reason: OFFLINE_REASON };
}

/**
 * What the Worker said went wrong, or the fact that it did not say.
 *
 * A status with no readable reason on it is treated as an absence rather than
 * as a refusal: some proxy, cache or file server produced it, and putting an
 * HTML error page in front of a player as though the game had said it is worse
 * than saying nothing.
 */
function refusalFrom(answer: Answer): ApiFailure {
  const reason = answer.json?.reason;

  return typeof reason === 'string' && reason.length > 0
    ? { ok: false, offline: false, reason }
    : offline();
}

export type Fetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

async function ask(
  fetcher: Fetcher,
  path: string,
  init?: RequestInit,
): Promise<Answer | null> {
  let response: Response;

  try {
    response = await fetcher(path, {
      // The cookies ARE the session, and they are HttpOnly, so nothing in this
      // file can see what it is sending. `same-origin` is the default for
      // same-origin requests and is written out because it is load-bearing.
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    return null;
  }

  let text: string;

  try {
    text = await response.text();
  } catch {
    return null;
  }

  let json: Record<string, unknown> | null = null;

  try {
    const parsed: unknown = JSON.parse(text);

    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      json = parsed as Record<string, unknown>;
    }
  } catch {
    json = null;
  }

  return { status: response.status, text, json };
}

/**
 * The badge and its record out of an answer, or the conclusion that whatever
 * sent this is not the Worker.
 *
 * The account block is REQUIRED rather than optional, and that is deliberate:
 * one Worker serves this bundle and its API, so an answer carrying a badge with
 * no record behind it did not come from the half of the product that owns
 * badges. Treating it as an absence keeps a proxy, a cache or a file server
 * from becoming a session with dates the player might read.
 */
function accountFrom(answer: Answer): ApiResult<Account> {
  const badge = answer.json?.badge;
  const record = parseAccountRecord(answer.json?.account);

  return typeof badge === 'string' && badge.length > 0 && record !== null
    ? {
      ok: true,
      value: {
        badge,
        createdAt: record.created_at,
        lastSeen: record.last_seen,
        lapsesAt: lapsesAt(record),
      },
    }
    : offline();
}

export function createCloudApi(fetcher: Fetcher): CloudApi {
  const post = (path: string, body?: unknown): Promise<Answer | null> => ask(
    fetcher,
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );

  return {
    session: async (): Promise<ApiResult<Account | null>> => {
      const answer = await ask(fetcher, '/api/session');

      if (answer === null || answer.json === null) {
        return offline();
      }

      if (answer.status !== 200) {
        return refusalFrom(answer);
      }

      // A browser carrying nothing, and a browser carrying a badge the
      // building has since cleared out, are the same answer: no badge. Both
      // are states the log-on screen already knows what to do with.
      if (answer.json.badge === null) {
        return { ok: true, value: null };
      }

      // Anything else is either a whole account or something that did not come
      // from this Worker, and `accountFrom` already answers with the offline
      // failure for the second.
      return accountFrom(answer);
    },

    register: async (): Promise<ApiResult<Account>> => {
      const answer = await post('/api/register');

      if (answer === null) {
        return offline();
      }

      return answer.status === 200 ? accountFrom(answer) : refusalFrom(answer);
    },

    logIn: async (badge: string): Promise<ApiResult<Account>> => {
      const answer = await post('/api/login', { badge });

      if (answer === null) {
        return offline();
      }

      return answer.status === 200 ? accountFrom(answer) : refusalFrom(answer);
    },

    fetchSave: async (): Promise<ApiResult<string | null>> => {
      const answer = await ask(fetcher, '/api/save');

      if (answer === null) {
        return offline();
      }

      // A save is a JSON object, so an answer that is not one is not a save -
      // which is what a file server's 404 page looks like from here.
      if (answer.status === 200) {
        return answer.json === null
          ? offline()
          : { ok: true, value: answer.text };
      }

      // "This badge has no save yet" is an answer, not a failure: it is the
      // ordinary state of the first machine somebody plays on.
      return answer.status === 404
        ? { ok: true, value: null }
        : refusalFrom(answer);
    },

    storeSave: async (body: string): Promise<ApiResult<void>> => {
      const answer = await ask(fetcher, '/api/save', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (answer === null) {
        return offline();
      }

      return answer.status === 200
        ? { ok: true, value: undefined }
        : refusalFrom(answer);
    },

    sendFeedback: async (
      report: Readonly<FeedbackSubmission>,
    ): Promise<ApiResult<void>> => {
      const answer = await post('/api/feedback', report);

      if (answer === null) {
        return offline();
      }

      return answer.status === 200
        ? { ok: true, value: undefined }
        : refusalFrom(answer);
    },
  };
}
