/**
 * The two kinds of answer this Worker gives: a JSON body for the game, and one
 * page for everybody who has not been invited.
 */

/** Nothing this Worker returns is worth keeping in anybody else's cache. */
const PRIVATE = 'private, no-store';

export function json(
  body: unknown,
  status = 200,
  extra: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': PRIVATE,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extra,
    },
  });
}

/** A refusal the game can read out loud, in the shape every endpoint uses. */
export function refuse(
  status: number,
  reason: string,
  extra: Readonly<Record<string, string>> = {},
): Response {
  return json({ ok: false, reason }, status, extra);
}

/**
 * The door, closed.
 *
 * Plain and not jokey, deliberately. Everything else in this product is in
 * character; this page is the one surface a stranger who followed a dead link
 * sees, and a caricature of an operating system telling somebody they are not
 * allowed in reads as a broken website rather than as a joke.
 *
 * It says the same thing for every reason a token can fail - unknown, revoked,
 * expired, spent - because the differences between those are the only thing
 * worth learning from guessing at links.
 */
export function invitePage(): Response {
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workgrumble - invite only</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: system-ui, sans-serif; line-height: 1.5; padding: 2rem;
  }
  main { max-width: 34rem; }
  h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
  p { margin: 0 0 0.75rem; }
</style>
</head>
<body>
<main>
<h1>Workgrumble is invite-only while it is being tested.</h1>
<p>This build is open to a small group of testers, who each have their own
link. If you have one, use it; if the one you have does not work any more, ask
whoever sent it to you.</p>
<p>There is nothing to sign up for here.</p>
</main>
</body>
</html>
`;

  return new Response(page, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': PRIVATE,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * Cache policy for the static bundle.
 *
 * `private` on everything: the bundle is behind a door, and a shared cache
 * that has a copy is a door with a window next to it. Vite puts a content hash
 * in every filename under `/assets/`, so those may be kept by the browser that
 * fetched them for as long as it likes; the HTML that names them may not be
 * kept at all, or a deploy would be invisible until somebody cleared a cache.
 */
/**
 * Which built page answers a requested path.
 *
 * Helldesk is the front door: the token link lands on `/`, so `/` serves the
 * crawler's page. The office sim keeps its own address at `/office`. The
 * targets are the extensionless forms because the asset binding redirects
 * `/foo.html` to `/foo` (and `/index.html` to `/`) - asking for the `.html`
 * name here would hand the browser a redirect instead of a page.
 */
export function assetPath(pathname: string): string {
  if (pathname === '/') {
    return '/crawler';
  }

  if (pathname === '/office' || pathname === '/office/') {
    return '/';
  }

  return pathname;
}

export function assetHeaders(pathname: string): Record<string, string> {
  return {
    'Cache-Control': pathname.startsWith('/assets/')
      ? 'private, max-age=31536000, immutable'
      : PRIVATE,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}
