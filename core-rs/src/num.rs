//! JavaScript-safe integers, in one place.
//!
//! Rust counts in `i64` and JavaScript counts in `f64`, so an `i64` that fits
//! Rust perfectly can be a number the browser cannot represent - and every
//! integer this engine holds (a tick, a tier, an SLA deadline, a seed) crosses
//! the boundary as a `Number`. A value outside the safe range is therefore not
//! a large number, it is a WRONG one: it would come back different. Parsing it
//! anywhere but here invites each call site to invent its own bound, which is
//! exactly how `2^53` got accepted as a tier and `2^32` restored as seed 0.

use serde_json::Value as Json;

/// `Number.MAX_SAFE_INTEGER`.
pub const MAX_SAFE_INT: i64 = 9_007_199_254_740_991;
pub const MAX_SAFE_INT_F64: f64 = 9_007_199_254_740_991.0;

/// `Number.isSafeInteger`, on a value that is already a float.
pub fn is_safe_int(value: f64) -> bool {
    value.is_finite() && value.fract() == 0.0 && value.abs() <= MAX_SAFE_INT_F64
}

/// A JSON number that JavaScript can hold exactly. Anything else - a string, a
/// fraction, `2^53`, a float that only looks like an integer - is `None`.
pub fn safe_int(value: &Json) -> Option<i64> {
    let number = value.as_f64()?;
    is_safe_int(number).then_some(number as i64)
}

/// A safe integer that is also at least `minimum`.
pub fn safe_int_at_least(value: &Json, minimum: i64) -> Option<i64> {
    safe_int(value).filter(|number| *number >= minimum)
}

/// A safe integer that also fits the `u32` the rng and the seed are made of.
pub fn safe_u32(value: &Json) -> Option<u32> {
    u32::try_from(safe_int(value)?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_only_what_javascript_can_hold_exactly() {
        assert_eq!(safe_int(&json!(0)), Some(0));
        assert_eq!(safe_int(&json!(-7)), Some(-7));
        assert_eq!(safe_int(&json!(MAX_SAFE_INT)), Some(MAX_SAFE_INT));
        assert_eq!(safe_int(&json!(-MAX_SAFE_INT)), Some(-MAX_SAFE_INT));

        // 2^53 is the first integer a double cannot tell from its neighbour.
        assert_eq!(safe_int(&json!(9_007_199_254_740_992_i64)), None);
        assert_eq!(safe_int(&json!(i64::MAX)), None);
        assert_eq!(safe_int(&json!(u64::MAX)), None);
        assert_eq!(safe_int(&json!(1.5)), None);
        assert_eq!(safe_int(&json!("3")), None);
        assert_eq!(safe_int(&json!(null)), None);
    }

    #[test]
    fn narrows_to_u32_without_wrapping() {
        assert_eq!(safe_u32(&json!(0)), Some(0));
        assert_eq!(safe_u32(&json!(4_294_967_295_u32)), Some(u32::MAX));
        // The one that used to restore as seed 0.
        assert_eq!(safe_u32(&json!(4_294_967_296_i64)), None);
        assert_eq!(safe_u32(&json!(-1)), None);
    }

    #[test]
    fn reports_safe_integers_among_floats() {
        assert!(is_safe_int(3.0));
        assert!(!is_safe_int(f64::NAN));
        assert!(!is_safe_int(f64::INFINITY));
        assert!(!is_safe_int(f64::MAX));
        assert!(!is_safe_int(0.5));
    }
}
