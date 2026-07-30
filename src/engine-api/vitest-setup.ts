import { loadEngineForTests } from './load-node';

/**
 * Every suite runs against the SHIPPED wasm core, loaded once from disk before
 * the first test. Reading the bytes rather than fetching them keeps the suites
 * offline; building them is `npm run gate:core`, which runs first in the gate.
 */
loadEngineForTests();
