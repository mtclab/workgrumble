import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadEngineFromBytes } from './wasm-engine';

/**
 * Loads the wasm core from disk. TESTS ONLY - the browser fetches the asset
 * Vite emits, same-origin, and never touches this file.
 *
 * `wasm-pack --target web` initialises from a fetch by default, which node has
 * no business doing in a unit suite: reading the bytes keeps every test
 * offline and keeps the shipped build the only build.
 */
export function loadEngineForTests(): void {
  const wasm = fileURLToPath(
    new URL('../../core-rs/pkg/core_rs_bg.wasm', import.meta.url),
  );
  loadEngineFromBytes(readFileSync(wasm));
}
