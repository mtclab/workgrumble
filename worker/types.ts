/**
 * The bindings this Worker runs on, declared rather than installed.
 *
 * `@cloudflare/workers-types` is the usual answer and it is deliberately not
 * used: the standing bar for this repo is no npm packages in the Worker, and
 * the local gate has to typecheck offline on a checkout that has never talked
 * to a registry. What the Worker actually touches is four methods on a KV
 * namespace and one on the assets binding, so those four methods are written
 * down here. The declarations are STRUCTURAL - the real bindings satisfy them -
 * and `tsc` checks this file's promises rather than a vendor's.
 *
 * Everything else the Worker uses (`Request`, `Response`, `URL`, `crypto`,
 * `TextEncoder`, `atob`) is in the DOM lib the rest of the project already
 * compiles against, and is genuinely present in the Workers runtime.
 */

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { readonly expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/** The static bundle, reachable as a fetch. */
export interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

/**
 * Bindings and configuration.
 *
 * The two secrets are optional in the TYPE and required in practice, which is
 * the point: a Worker deployed without `SIGNING_KEY` must refuse the door
 * rather than sign cookies with the string "undefined", and that is only
 * possible if the code is made to handle its absence. Neither is ever logged,
 * echoed into a response, or put in an error message.
 */
export interface Env {
  readonly ASSETS: AssetBinding;
  readonly TOKENS: KVNamespace;
  readonly PLAYERS: KVNamespace;
  readonly SAVES: KVNamespace;
  /** HMAC secret behind every cookie this Worker issues. */
  readonly SIGNING_KEY?: string;
  /** Least-privilege GitHub token, issues:write on the feedback repo only. */
  readonly FEEDBACK_GH_TOKEN?: string;
  readonly FEEDBACK_REPO?: string;
  readonly FEEDBACK_API_BASE?: string;
  /**
   * Staging only. With it set, a report is checked, accepted and NOT posted,
   * so the deploy journeys can be walked on the box without a GitHub token and
   * without filing rubbish in a real issue tracker.
   *
   * It is an explicit flag rather than "post if there is a token, otherwise
   * pretend", because that fallback turns an expired token into feedback that
   * silently goes nowhere. Without a token and without this flag the endpoint
   * refuses out loud instead.
   */
  readonly FEEDBACK_DRY_RUN?: string;
}
