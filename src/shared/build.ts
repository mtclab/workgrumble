/**
 * What this build calls itself, once, for everything that has to say it.
 *
 * The two constants are replaced by the bundler before any of this runs (see
 * `vite.config.ts`): the app version comes off `package.json` and the engine
 * version off `core-rs/Cargo.toml`, so neither is a number anybody types twice.
 *
 * Three things read it and they are the reason it is not just decoration: the
 * save records which build wrote it, the update window decides whether the
 * player has seen this version's notes, and a feedback report says which build
 * the problem happened on - which is the difference between a bug report and a
 * bug report somebody can act on.
 */

export const BUILD_VERSION: string = __APP_VERSION__;

export const CORE_VERSION: string = __CORE_VERSION__;
