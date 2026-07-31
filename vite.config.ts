import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * What this build calls itself, read off the files that already had to be
 * right.
 *
 * The alternatives were a `git describe` at build time and a generated module
 * checked into the tree, and both make the version a fourth place the number
 * lives. It already lives in three: `package.json`, the release notes the
 * update window reads out, and the tag cut after the live smoke. So the build
 * takes it from `package.json`, `releases.test.ts` fails if the newest note
 * disagrees with it, and the tag is the last of the three rather than the
 * source of the other two - which means a build can never announce a version
 * whose changelog nobody wrote.
 *
 * The engine version comes off `core-rs/Cargo.toml` the same way. A feedback
 * report that says which wasm core was under the session is worth the six
 * lines, and the wasm is built from that file in the same gate.
 */
function tomlVersion(source: string): string {
  const match = /\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/.exec(source);
  const version = match?.[1];

  if (version === undefined) {
    throw new Error('core-rs/Cargo.toml has no [package] version.');
  }

  return version;
}

function jsonVersion(source: string): string {
  const parsed: unknown = JSON.parse(source);
  const version = typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>).version
    : undefined;

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('package.json has no version.');
  }

  return version;
}

const appVersion = jsonVersion(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);
const coreVersion = tomlVersion(
  readFileSync(new URL('./core-rs/Cargo.toml', import.meta.url), 'utf8'),
);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __CORE_VERSION__: JSON.stringify(coreVersion),
  },
  test: {
    environment: 'node',
    // The Worker's own units run in the same offline suite as the game's. It
    // is the half of this product a browser cannot reach and wrangler is not
    // installed here, so if these did not run in the local gate they would not
    // run anywhere before a deploy.
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    setupFiles: ['./src/engine-api/vitest-setup.ts'],
  },
});
