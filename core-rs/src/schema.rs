//! The node/edge vocabulary and the runtime validator behind it.
//!
//! Content arrives as data, so "this kind does not exist" and "this field is
//! the wrong type" have to be refusals at load time rather than a mystery two
//! screens later.

use std::collections::BTreeMap;

use serde_json::Value as Json;

use crate::error::{EngineError, EngineResult};
use crate::refuse;
use crate::value::FieldValue;

pub const NODE_KINDS: [&str; 9] = [
    "person",
    "account",
    "machine",
    "device",
    "service",
    "share",
    "group",
    "mail_rule",
    "ticket",
];

pub const EDGE_KINDS: [&str; 5] = ["owns", "member_of", "connected_to", "runs_on", "has_access"];

pub const TICKET_STATES: [&str; 4] = ["open", "resolved", "breached", "waiting_on_user"];

pub const TICKET_ARCHETYPES: [&str; 5] = [
    "hidden_cause",
    "read_the_screen",
    "deadline_absurdity",
    "recurring_arc",
    "flood",
];

pub fn is_node_kind(value: &str) -> bool {
    NODE_KINDS.contains(&value)
}

pub fn is_edge_kind(value: &str) -> bool {
    EDGE_KINDS.contains(&value)
}

pub fn is_ticket_state(value: &FieldValue) -> bool {
    value
        .as_str()
        .is_some_and(|state| TICKET_STATES.contains(&state))
}

pub fn is_ticket_archetype(value: &str) -> bool {
    TICKET_ARCHETYPES.contains(&value)
}

pub type Fields = BTreeMap<String, FieldValue>;

#[derive(Clone, Debug)]
pub struct Node {
    pub id: String,
    pub kind: String,
    pub fields: Fields,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub kind: String,
}

fn optional<'a>(fields: &'a Fields, field: &str) -> Option<&'a FieldValue> {
    fields.get(field)
}

fn assert_optional(
    fields: &Fields,
    field: &str,
    predicate: impl Fn(&FieldValue) -> bool,
    expected: &str,
) -> EngineResult<()> {
    match optional(fields, field) {
        Some(value) if !predicate(value) => {
            refuse!("Field \"{field}\" must be {expected}.")
        }
        _ => Ok(()),
    }
}

fn is_string(value: &FieldValue) -> bool {
    matches!(value, FieldValue::Str(_))
}

fn is_boolean(value: &FieldValue) -> bool {
    matches!(value, FieldValue::Bool(_))
}

fn is_number(value: &FieldValue) -> bool {
    matches!(value, FieldValue::Num(_))
}

/// The per-kind field check on its own, for mutations that change a field
/// without rebuilding the node around it.
pub fn validate_fields(kind: &str, fields: &Fields) -> EngineResult<()> {
    assert_known_fields(kind, fields)
}

fn assert_known_fields(kind: &str, fields: &Fields) -> EngineResult<()> {
    match kind {
        "person" => assert_optional(fields, "name", is_string, "a string"),
        "account" => {
            assert_optional(fields, "username", is_string, "a string")?;
            assert_optional(fields, "locked", is_boolean, "a boolean")?;
            assert_optional(fields, "enabled", is_boolean, "a boolean")
        }
        "machine" => {
            assert_optional(fields, "hostname", is_string, "a string")?;
            assert_optional(
                fields,
                "display_rotation",
                |value| {
                    value
                        .as_f64()
                        .is_some_and(|rotation| [0.0, 90.0, 180.0, 270.0].contains(&rotation))
                },
                "one of 0, 90, 180, or 270",
            )?;
            assert_optional(fields, "resolution", is_string, "a string")
        }
        "device" => {
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(fields, "type", is_string, "a string")?;
            assert_optional(fields, "powered", is_boolean, "a boolean")
        }
        "service" => {
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(
                fields,
                "status",
                |value| {
                    matches!(
                        value.as_str(),
                        Some("running") | Some("stopped") | Some("wedged")
                    )
                },
                "\"running\", \"stopped\", or \"wedged\"",
            )
        }
        "share" => {
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(fields, "path", is_string, "a string")
        }
        "group" => assert_optional(fields, "name", is_string, "a string"),
        "mail_rule" => {
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(fields, "enabled", is_boolean, "a boolean")?;
            assert_optional(fields, "target", is_string, "a string")
        }
        "ticket" => {
            assert_optional(fields, "state", is_ticket_state, "a ticket state")?;
            assert_optional(fields, "spawned_at", is_number, "a number")?;
            assert_optional(fields, "sla_deadline", is_number, "a number")?;
            assert_optional(fields, "breached", is_boolean, "a boolean")?;
            // The minutes the two one-off events happened in. Optional because
            // an open ticket has had neither, and written by the engine rather
            // than by content: a day's ledger has to be able to ask WHEN a
            // ticket closed, not only whether it is closed now.
            assert_optional(fields, "resolved_at", is_number, "a number")?;
            assert_optional(fields, "breached_at", is_number, "a number")?;

            if !optional(fields, "state").is_some_and(is_ticket_state) {
                return refuse!("Ticket nodes require a valid \"state\" field.");
            }

            let spawned_at = optional(fields, "spawned_at").and_then(FieldValue::as_safe_int);

            if spawned_at.is_none_or(|tick| tick < 0) {
                return refuse!(
                    "Ticket nodes require a non-negative integer \"spawned_at\" field."
                );
            }

            let deadline = optional(fields, "sla_deadline").and_then(FieldValue::as_safe_int);

            if deadline.is_none_or(|tick| tick < 0) {
                return refuse!(
                    "Ticket nodes require a non-negative integer \"sla_deadline\" field."
                );
            }

            Ok(())
        }
        _ => Ok(()),
    }
}

/// The `validateNode` gate: shape first, then the per-kind field types.
pub fn validate_node(value: &Json) -> EngineResult<Node> {
    let object = value
        .as_object()
        .ok_or_else(|| EngineError::new("Node must be an object."))?;

    let id = object.get("id").and_then(Json::as_str).unwrap_or_default();

    if id.is_empty() {
        return refuse!("Node id must be a non-empty string.");
    }

    let kind = object
        .get("kind")
        .and_then(Json::as_str)
        .unwrap_or_default();

    if !is_node_kind(kind) {
        return refuse!("Node kind is not supported.");
    }

    let raw_fields = object
        .get("fields")
        .and_then(Json::as_object)
        .ok_or_else(|| EngineError::new("Node fields must be an object."))?;

    let mut fields = Fields::new();

    for (field, raw) in raw_fields {
        let parsed = FieldValue::from_json(raw).ok_or_else(|| {
            EngineError::new(format!("Field \"{field}\" has an unsupported value."))
        })?;
        fields.insert(field.clone(), parsed);
    }

    assert_known_fields(kind, &fields)?;

    Ok(Node {
        id: id.to_owned(),
        kind: kind.to_owned(),
        fields,
    })
}

pub fn validate_edge(value: &Json) -> EngineResult<Edge> {
    let object = value
        .as_object()
        .ok_or_else(|| EngineError::new("Setup edge must be an object."))?;
    let from = object
        .get("from")
        .and_then(Json::as_str)
        .unwrap_or_default();
    let to = object.get("to").and_then(Json::as_str).unwrap_or_default();
    let kind = object
        .get("kind")
        .and_then(Json::as_str)
        .unwrap_or_default();

    if from.is_empty() || to.is_empty() || !is_edge_kind(kind) {
        return refuse!("Setup edge is invalid.");
    }

    Ok(Edge {
        from: from.to_owned(),
        to: to.to_owned(),
        kind: kind.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_a_well_formed_node() {
        let node = validate_node(&json!({
            "id": "account:ada",
            "kind": "account",
            "fields": { "username": "ada", "locked": true },
        }))
        .expect("valid node");

        assert_eq!(node.id, "account:ada");
        assert_eq!(node.fields.len(), 2);
    }

    #[test]
    fn refuses_a_field_of_the_wrong_type() {
        let error = validate_node(&json!({
            "id": "account:ada",
            "kind": "account",
            "fields": { "locked": "yes" },
        }))
        .expect_err("locked must be boolean");

        assert_eq!(error.message(), "Field \"locked\" must be a boolean.");
    }

    #[test]
    fn refuses_a_ticket_without_its_bookkeeping() {
        let error = validate_node(&json!({
            "id": "ticket:x",
            "kind": "ticket",
            "fields": { "state": "open" },
        }))
        .expect_err("ticket needs spawned_at");

        assert!(error.message().contains("spawned_at"));
    }

    #[test]
    fn refuses_unsupported_kinds_and_shapes() {
        assert!(validate_node(&json!("nope")).is_err());
        assert!(validate_node(&json!({ "id": "", "kind": "person", "fields": {} })).is_err());
        assert!(validate_node(&json!({ "id": "x", "kind": "alien", "fields": {} })).is_err());
        assert!(validate_node(&json!({ "id": "x", "kind": "person" })).is_err());
        assert!(validate_node(&json!({
            "id": "x",
            "kind": "person",
            "fields": { "name": ["a"] },
        }))
        .is_err());
    }
}
