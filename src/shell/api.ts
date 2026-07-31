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
  session(): Promise<ApiResult<string | null>>;
  register(): Promise<ApiResult<string>>;
  logIn(badge: string): Promise<ApiResult<string>>;
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

function badgeFrom(answer: Answer): ApiResult<string> {
  const badge = answer.json?.badge;

  return typeof badge === 'string' && badge.length > 0
    ? { ok: true, value: badge }
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
    session: async (): Promise<ApiResult<string | null>> => {
      const answer = await ask(fetcher, '/api/session');

      if (answer === null || answer.json === null) {
        return offline();
      }

      const badge = answer.json.badge;

      return answer.status === 200
        ? { ok: true, value: typeof badge === 'string' ? badge : null }
        : refusalFrom(answer);
    },

    register: async (): Promise<ApiResult<string>> => {
      const answer = await post('/api/register');

      if (answer === null) {
        return offline();
      }

      return answer.status === 200 ? badgeFrom(answer) : refusalFrom(answer);
    },

    logIn: async (badge: string): Promise<ApiResult<string>> => {
      const answer = await post('/api/login', { badge });

      if (answer === null) {
        return offline();
      }

      return answer.status === 200 ? badgeFrom(answer) : refusalFrom(answer);
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
