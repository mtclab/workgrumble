//! Field values, and the JavaScript-shaped rendering the hash depends on.
//!
//! The snapshot hash has to match the TypeScript engine byte for byte, which
//! means matching `JSON.stringify` exactly: ECMAScript number formatting,
//! ECMAScript string escaping and UTF-16 ordering. None of that is Rust's
//! default, so all three live here rather than being approximated at the call
//! site.

use std::cmp::Ordering;
use std::fmt::Write as _;

use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

/// `string | number | boolean | null` - the whole value space of a field.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FieldValue {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
}

impl FieldValue {
    /// `Object.is`, which is what the TypeScript engine compares fields with:
    /// NaN equals NaN and -0 does not equal 0. Field values are validated
    /// finite, so only the zero case can actually be reached - it is honoured
    /// anyway, because a comparison that is "nearly" the reference one is a
    /// determinism bug waiting for a rainy day.
    pub fn same_value(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Null, Self::Null) => true,
            (Self::Bool(left), Self::Bool(right)) => left == right,
            (Self::Str(left), Self::Str(right)) => left == right,
            (Self::Num(left), Self::Num(right)) => {
                if left.is_nan() && right.is_nan() {
                    true
                } else {
                    left == right && left.is_sign_negative() == right.is_sign_negative()
                }
            }
            _ => false,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Str(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Self::Num(value) => Some(*value),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Bool(value) => Some(*value),
            _ => None,
        }
    }

    pub fn is_true(&self) -> bool {
        matches!(self, Self::Bool(true))
    }

    /// A finite number that is an exact integer, the way `Number.isSafeInteger`
    /// means it.
    pub fn as_safe_int(&self) -> Option<i64> {
        let value = self.as_f64()?;

        if value.is_finite() && value.fract() == 0.0 && value.abs() <= 9_007_199_254_740_991.0 {
            Some(value as i64)
        } else {
            None
        }
    }

    /// What JavaScript string interpolation would produce. Refusal templates
    /// are player-facing text, so `${value}` has to read the same in both
    /// engines.
    pub fn to_display_string(&self) -> String {
        match self {
            Self::Null => "null".to_owned(),
            Self::Bool(value) => value.to_string(),
            Self::Num(value) => format_js_number(*value),
            Self::Str(value) => value.clone(),
        }
    }

    /// The `JSON.stringify` rendering of this value.
    pub fn to_json_fragment(&self) -> String {
        match self {
            Self::Null => "null".to_owned(),
            Self::Bool(value) => value.to_string(),
            Self::Num(value) => format_js_number(*value),
            Self::Str(value) => quote_json_string(value),
        }
    }

    pub fn to_json(&self) -> Json {
        match self {
            Self::Null => Json::Null,
            Self::Bool(value) => Json::Bool(*value),
            Self::Num(value) => serde_json::Number::from_f64(*value)
                .map_or(Json::Null, Json::Number),
            Self::Str(value) => Json::String(value.clone()),
        }
    }

    /// The `isFieldValue` guard: anything else (array, object, non-finite
    /// number, absent) is not a field value at all.
    pub fn from_json(value: &Json) -> Option<Self> {
        match value {
            Json::Null => Some(Self::Null),
            Json::Bool(inner) => Some(Self::Bool(*inner)),
            Json::String(inner) => Some(Self::Str(inner.clone())),
            Json::Number(inner) => {
                let number = inner.as_f64()?;
                number.is_finite().then_some(Self::Num(number))
            }
            _ => None,
        }
    }
}

/// Compares strings by UTF-16 code unit, which is what `<` does in JavaScript.
/// Rust compares by code point; the two orders disagree for astral characters,
/// and the hash sorts node ids and field names with this.
pub fn js_str_cmp(left: &str, right: &str) -> Ordering {
    if left.is_ascii() && right.is_ascii() {
        return left.cmp(right);
    }

    left.encode_utf16().cmp(right.encode_utf16())
}

/// `JSON.stringify` of a string: the short escapes, `\u00XX` for the other
/// control characters, everything else verbatim.
pub fn quote_json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');

    for character in value.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            control if (control as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", control as u32);
            }
            other => out.push(other),
        }
    }

    out.push('"');
    out
}

/// ECMAScript `Number::toString` (radix 10), which is also what
/// `JSON.stringify` emits for a number. Rust's own `Display` agrees on the
/// digits and disagrees on when to use an exponent, so the digits are taken
/// from Rust and the layout from the specification.
pub fn format_js_number(value: f64) -> String {
    if value.is_nan() {
        return "NaN".to_owned();
    }

    if value == 0.0 {
        return "0".to_owned();
    }

    if value.is_infinite() {
        return if value > 0.0 { "Infinity" } else { "-Infinity" }.to_owned();
    }

    let sign = if value < 0.0 { "-" } else { "" };
    let magnitude = value.abs();
    let exponential = format!("{magnitude:e}");
    let (mantissa, exponent) = exponential
        .split_once('e')
        .expect("Rust exponential formatting always contains an exponent");
    let digits: String = mantissa.chars().filter(|character| *character != '.').collect();
    let digits = digits.trim_end_matches('0');
    let digits = if digits.is_empty() { "0" } else { digits };
    let exponent: i32 = exponent.parse().unwrap_or(0);

    // `k` digits, value = digits * 10^(n - k), exactly the spec's letters.
    let count = digits.len() as i32;
    let point = exponent + 1;

    let body = if point >= count && point <= 21 {
        let mut out = digits.to_owned();
        out.push_str(&"0".repeat((point - count) as usize));
        out
    } else if point > 0 && point <= 21 {
        let (head, tail) = digits.split_at(point as usize);
        format!("{head}.{tail}")
    } else if point > -6 && point <= 0 {
        format!("0.{}{}", "0".repeat((-point) as usize), digits)
    } else {
        let exponent_sign = if point > 0 { "+" } else { "-" };
        let exponent_digits = (point - 1).abs();
        if count == 1 {
            format!("{digits}e{exponent_sign}{exponent_digits}")
        } else {
            let (head, tail) = digits.split_at(1);
            format!("{head}.{tail}e{exponent_sign}{exponent_digits}")
        }
    };

    format!("{sign}{body}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_numbers_the_way_javascript_does() {
        assert_eq!(format_js_number(0.0), "0");
        assert_eq!(format_js_number(-0.0), "0");
        assert_eq!(format_js_number(12.0), "12");
        assert_eq!(format_js_number(-7.0), "-7");
        assert_eq!(format_js_number(1.5), "1.5");
        assert_eq!(format_js_number(0.1), "0.1");
        assert_eq!(format_js_number(100.0), "100");
        assert_eq!(format_js_number(1e21), "1e+21");
        assert_eq!(format_js_number(1e20), "100000000000000000000");
        assert_eq!(format_js_number(1e-6), "0.000001");
        assert_eq!(format_js_number(1e-7), "1e-7");
        assert_eq!(format_js_number(1.2345e-7), "1.2345e-7");
        assert_eq!(format_js_number(9_007_199_254_740_991.0), "9007199254740991");
        assert_eq!(format_js_number(0.30000000000000004), "0.30000000000000004");
    }

    #[test]
    fn escapes_strings_the_way_json_stringify_does() {
        assert_eq!(quote_json_string("plain"), "\"plain\"");
        assert_eq!(quote_json_string("a\"b\\c"), "\"a\\\"b\\\\c\"");
        assert_eq!(quote_json_string("line\nbreak"), "\"line\\nbreak\"");
        assert_eq!(quote_json_string("\u{1}"), "\"\\u0001\"");
        assert_eq!(quote_json_string("kääntää"), "\"kääntää\"");
        assert_eq!(quote_json_string("\u{7f}"), "\"\u{7f}\"");
    }

    #[test]
    fn orders_strings_by_utf16_code_unit() {
        assert_eq!(js_str_cmp("a", "b"), Ordering::Less);
        assert_eq!(js_str_cmp("a", "a"), Ordering::Equal);
        // U+FF01 sorts BEFORE U+10000 in Rust and after it in JavaScript.
        assert_eq!(js_str_cmp("\u{ff01}", "\u{10000}"), Ordering::Greater);
    }

    #[test]
    fn compares_field_values_like_object_is() {
        assert!(FieldValue::Num(1.0).same_value(&FieldValue::Num(1.0)));
        assert!(!FieldValue::Num(0.0).same_value(&FieldValue::Num(-0.0)));
        assert!(!FieldValue::Num(1.0).same_value(&FieldValue::Str("1".to_owned())));
        assert!(FieldValue::Null.same_value(&FieldValue::Null));
    }
}
