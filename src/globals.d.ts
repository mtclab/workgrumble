/**
 * The two constants the build replaces before anything runs.
 *
 * They are declared rather than imported because that is what `define` does:
 * by the time this code executes the identifier is gone and a string literal
 * is standing where it was. Declaring them here is what stops the typechecker
 * from being the only part of the toolchain that has not been told.
 */

/** The version of this build, from `package.json`. See `vite.config.ts`. */
declare const __APP_VERSION__: string;

/** The wasm core's version, from `core-rs/Cargo.toml`. */
declare const __CORE_VERSION__: string;
