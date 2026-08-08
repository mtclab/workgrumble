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

pub const NODE_KINDS: [&str; 15] = [
    "person",
    "account",
    "machine",
    "device",
    "service",
    // A systemd unit on a Linux box. Its own kind rather than a "service" with
    // Linux words in it, because families are not one shell in hats: a unit has
    // systemd's own state vocabulary and no Windows service manager knows about
    // it, which is the whole reason the estate is heterogeneous.
    "unit",
    // A CUSTOMER of an MSP employer (0.8.0). A machine dimension, exactly like
    // `os` and `role`: a customer carries the contract that decides what the
    // player may DO to its estate (service_scope), the business it is in
    // (business_type, which shapes that estate), and its SLA tier. Its own kind
    // because a customer is a first-class world entity the ticket queue is
    // organised by, not a field on a machine - the machines carry its id.
    "customer",
    // A CHANGE REQUEST (0.10.0). The diegetic form that gates risky/out-of-scope
    // work: it names the action it authorises (cr_target + cr_verb), states a
    // risk and a rollback, and carries a decision the scope pre-flight reads
    // before it refuses. Its own kind for the same reason a customer is - it is
    // a first-class world artifact filed against a specific action, not a field
    // on the thing it authorises - and its approval window is data the engine
    // serialises whole, so a save round-trips a request mid-review.
    "change_request",
    // A COORDINATION notice (0.11.0). The co-managed coordinate-then-act seam:
    // a first-class record that the MSP has notified a customer's own IT before
    // touching their estate. It names the target it clears (coord_target) and
    // the customer whose IT was told (coord_customer), and the scope pre-flight
    // reads it before it refuses a co-managed action - the RACI "I thought you
    // had it" gap closed by making the heads-up a thing the world holds. Its own
    // kind, like a change request, because it is filed against a specific action
    // rather than being a field on the thing it clears, and it serialises whole
    // so a notice given mid-day round-trips a reload.
    "coordination",
    "share",
    "group",
    "mail_rule",
    "ticket",
    "directory",
    "file",
];

pub const EDGE_KINDS: [&str; 6] = [
    "owns",
    "member_of",
    "connected_to",
    "runs_on",
    "has_access",
    // What a drive holds. A machine contains its root, a directory contains
    // its children, and nothing else in the estate is spelled this way.
    "contains",
];

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

/// A name somebody could type. Empty is refused rather than tolerated: a
/// directory entry with no name is an entry no path can ever reach, which is
/// the same class of fault as a ticket with no deadline.
fn is_named(fields: &Fields) -> bool {
    optional(fields, "name")
        .and_then(FieldValue::as_str)
        .is_some_and(|name| !name.trim().is_empty())
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
        "unit" => {
            // A systemd unit: a description, the unit name systemctl takes, and
            // the ActiveState/SubState line in the real words systemd prints.
            // The state list is the Linux analogue of the service "status"
            // check above - held as data, validated at load like everything else.
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(fields, "unit", is_string, "a string")?;
            assert_optional(
                fields,
                "unit_state",
                |value| {
                    matches!(
                        value.as_str(),
                        Some("active (running)")
                            | Some("active (exited)")
                            | Some("inactive (dead)")
                            | Some("failed")
                            | Some("activating")
                    )
                },
                "a systemd unit state",
            )
        }
        "customer" => {
            // A customer of an MSP employer. The name the queue prints, the
            // business it is in (an open set - the estate research names more
            // verticals than 0.8.0 ships), and the two closed enums that decide
            // gameplay: the contract scope the honesty engine reads before it
            // refuses an out-of-contract action, and the SLA tier. Held as data
            // and validated at load, exactly like a service's status or a unit's
            // state.
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(fields, "business_type", is_string, "a string")?;
            assert_optional(
                fields,
                "service_scope",
                |value| {
                    matches!(
                        value.as_str(),
                        Some("monitoring_only")
                            | Some("helpdesk")
                            | Some("co_managed")
                            | Some("fully_managed")
                    )
                },
                "a customer service scope",
            )?;
            assert_optional(
                fields,
                "sla_tier",
                |value| {
                    matches!(
                        value.as_str(),
                        Some("bronze") | Some("silver") | Some("gold")
                    )
                },
                "a bronze, silver, or gold SLA tier",
            )
        }
        "change_request" => {
            // A change request (0.10.0). The paperwork strings (target, verb,
            // risk, rollback, the approver's reason) and the tick fields that
            // drive its lifecycle, plus the two closed enums the scope engine
            // reads: the STATUS the form is filed at, and the DECISION the
            // authority reached. Validated at load like a customer's scope or a
            // service's status - a hand-edited save cannot invent a fifth status
            // or a third decision and slip it past the pre-flight.
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(fields, "cr_target", is_string, "a string")?;
            assert_optional(fields, "cr_verb", is_string, "a string")?;
            assert_optional(fields, "cr_risk", is_string, "a string")?;
            assert_optional(fields, "cr_rollback", is_string, "a string")?;
            assert_optional(fields, "cr_reason", is_string, "a string")?;
            assert_optional(
                fields,
                "cr_status",
                |value| {
                    matches!(
                        value.as_str(),
                        Some("draft") | Some("submitted") | Some("approved") | Some("rejected")
                    )
                },
                "a change-request status",
            )?;
            assert_optional(
                fields,
                "cr_decision",
                |value| matches!(value.as_str(), Some("approve") | Some("reject")),
                "\"approve\" or \"reject\"",
            )?;
            assert_optional(fields, "cr_submitted_at", is_number, "a number")?;
            assert_optional(fields, "cr_review_until", is_number, "a number")?;
            assert_optional(fields, "cr_window_open", is_number, "a number")?;
            assert_optional(fields, "cr_window_close", is_number, "a number")
        }
        "coordination" => {
            // A coordination notice (0.11.0). The target it clears, the customer
            // whose IT was notified, and the minute it was given - all validated
            // at load like a change request's fields, so a hand-edited save
            // cannot forge a notice out of the wrong shape and slip a co-managed
            // action past the pre-flight.
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(fields, "coord_target", is_string, "a string")?;
            assert_optional(fields, "coord_customer", is_string, "a string")?;
            assert_optional(fields, "coord_notified_at", is_number, "a number")
        }
        "share" => {
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(fields, "path", is_string, "a string")
        }
        "group" => assert_optional(fields, "name", is_string, "a string"),
        "directory" | "file" => {
            assert_optional(fields, "name", is_string, "a string")?;
            // The stamp a listing prints. A string rather than a tick: every
            // file on this estate was written before the clock this world
            // counts on started, and a negative tick is not a date.
            assert_optional(fields, "modified", is_string, "a string")?;
            assert_optional(fields, "access_denied", is_boolean, "a boolean")?;

            // What is in it, and therefore how big it is: a listing counts the
            // bytes it would print rather than carrying a second number that
            // could disagree with them.
            if kind == "file" {
                assert_optional(fields, "content", is_string, "a string")?;
            }

            if !is_named(fields) {
                return refuse!("{kind} nodes require a non-empty \"name\" field.");
            }

            Ok(())
        }
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
            // The customer SLA tier the ticket runs on (0.12.0), stamped at
            // spawn from the customer behind its estate. The closed enum a
            // customer's own tier gets, validated the same way: an in-house
            // ticket carries none, and a hand-edited save cannot forge a fourth.
            assert_optional(
                fields,
                "sla_tier",
                |value| {
                    matches!(
                        value.as_str(),
                        Some("bronze") | Some("silver") | Some("gold")
                    )
                },
                "a bronze, silver, or gold SLA tier",
            )?;
            // The VIP flag (E8, 0.26.0), stamped at spawn from the caller behind
            // the ticket. Strictly boolean for the same reason the tier is a
            // closed enum: it forces a priority, so a hand-edited save must not
            // be able to smuggle one in as a string.
            assert_optional(fields, "vip", is_boolean, "a boolean")?;

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
    fn refuses_a_directory_entry_nothing_could_name() {
        let error = validate_node(&json!({
            "id": "dir:beige-box/c",
            "kind": "directory",
            "fields": { "name": "   " },
        }))
        .expect_err("a directory needs a name");

        assert!(error.message().contains("name"));

        let error = validate_node(&json!({
            "id": "file:beige-box/c/win.ini",
            "kind": "file",
            "fields": { "name": "WIN.INI", "content": 4 },
        }))
        .expect_err("a file holds text or nothing");

        assert!(error.message().contains("content"));
    }

    #[test]
    fn accepts_a_file_and_the_drive_that_holds_it() {
        let file = validate_node(&json!({
            "id": "file:beige-box/c/autoexec.bat",
            "kind": "file",
            "fields": {
                "name": "AUTOEXEC.BAT",
                "content": "@ECHO OFF",
                "modified": "14/03/1997  11:02",
            },
        }))
        .expect("valid file");

        assert_eq!(file.kind, "file");
        assert!(validate_edge(&json!({
            "from": "dir:beige-box/c",
            "to": "file:beige-box/c/autoexec.bat",
            "kind": "contains",
        }))
        .is_ok());
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
