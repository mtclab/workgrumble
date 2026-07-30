//! `core-rs`: the it-career-sim simulation engine.
//!
//! The engine (graph, schema, hash, rng, clock, assertions, actions, tickets)
//! lives here; the shell, the apps and the world CONTENT stay in TypeScript
//! and reach this crate through one wasm-bindgen `Engine` class. Every value
//! that crosses the boundary is JSON, every mutation comes back as an ordered
//! event, and nothing panics on the way out: bad input is a typed refusal.

#![forbid(unsafe_code)]

/// The engine contract version. Bumped when the boundary shape changes.
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::ENGINE_VERSION;

    #[test]
    fn reports_its_version() {
        assert_eq!(ENGINE_VERSION, "0.1.0");
    }
}
