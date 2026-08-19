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

pub const NODE_KINDS: [&str; 16] = [
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
    // A PROJECT (0.29.0). Work that is not a ticket: a phased piece of delivery
    // with an ordered set of gates, its own baked schedule, and tasks that ride
    // the ordinary ticket lifecycle. Its own kind for the same reason a change
    // request is one - it is a first-class world artifact rather than a field on
    // anything, and a save serialises it whole so a reload lands mid-phase on the
    // same minute the phase was always going to gate on. What it CARRIES is the
    // schedule (the ticks its phases are due by, computed once at kickoff from
    // the business-hours calendar) and the facts a phase turns on (the minute the
    // cutover happened, the minute it was rolled back). What it never carries is
    // the phase itself: that is derived from those ticks, the clock and the state
    // of the estate, so nothing stored can drift from what the world looks like.
    "project",
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

/// A count or a stamp: a whole number the browser holds exactly, and never
/// below zero.
///
/// Written for the contract clocks (0.37.1), where the difference matters
/// twice over. A negative count of missed update windows is priced by the
/// meters as a negative breach weight, and the meter code refuses a negative
/// weight by throwing - inside the day loop, so a number that should have been
/// impossible stopped the shift. A negative minute is a stamp before the world
/// began, which every read of it compares against and none of them expects.
fn is_count(value: &FieldValue) -> bool {
    value.as_safe_int().is_some_and(|number| number >= 0)
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
    // Carried by machines, accounts and shares alike: which customer's
    // estate this node belongs to. Typed here, above the per-kind arms,
    // because the guards read it on every kind that can carry it and a
    // hand-edited non-string fails those guards OPEN (0.38.0 review) -
    // the same reason sla_tier and raci_owner are closed below.
    assert_optional(fields, "customer", is_string, "a string")?;

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
            assert_optional(fields, "resolution", is_string, "a string")?;
            // Which IT team the co-managed RACI map hands this box to (E9,
            // 0.37.0), typed as a closed enum in 0.37.1 exactly as a ticket's
            // SLA tier is. There are two teams on a co-managed account and
            // there is no third: a word this list does not have would be read
            // as "the map says nothing", so a hand-edited save could turn the
            // customer's own server into an unowned one by misspelling it, and
            // the soft wall would go quiet with nothing to say why. ABSENT
            // still means the map says nothing, which is the shipped default
            // everywhere but Pennington.
            assert_optional(
                fields,
                "raci_owner",
                |value| matches!(value.as_str(), Some("msp") | Some("internal")),
                "either \"msp\" or \"internal\"",
            )
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
        "project" => {
            // A project (0.29.0). Two families of field and no third: the
            // SCHEDULE, baked once at kickoff (the tick each phase is due by,
            // computed from the business-hours calendar, so a save mid-phase
            // reloads onto the minute it was always going to gate on), and the
            // FACTS a phase turns on (the minute the cutover happened, the
            // minute it was reversed). Every one of them a number, validated at
            // load like a change request's window, because a hand-edited save
            // that put a word where a tick goes would produce a project whose
            // phase could not be derived at all.
            //
            // There is deliberately no "phase" field to validate. The phase is
            // read off these ticks, the clock and the estate every time anybody
            // asks, so there is nothing stored for a save to disagree with.
            assert_optional(fields, "name", is_string, "a string")?;
            assert_optional(fields, "project_customer", is_string, "a string")?;
            assert_optional(fields, "project_started_at", is_number, "a number")?;
            assert_optional(fields, "project_audit_due", is_number, "a number")?;
            assert_optional(fields, "project_staging_due", is_number, "a number")?;
            assert_optional(fields, "project_cutover_due", is_number, "a number")?;
            assert_optional(fields, "project_handover_due", is_number, "a number")?;
            assert_optional(fields, "project_cutover_at", is_number, "a number")?;
            assert_optional(fields, "project_rolled_back_at", is_number, "a number")
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
            // The contract clocks (E9, 0.37.0), typed here in 0.37.1 because
            // until then a save could carry any of them as anything at all.
            //
            // The acknowledgment either was missed or was not: it is a
            // once-and-forever latch, and a string in it reads as truthy
            // nowhere and as present everywhere. The other three are a count
            // and two minutes, and all three are read as numbers the moment
            // anything looks at them - the missed-window count is multiplied
            // into a breach weight, and a negative one throws inside the day
            // loop rather than showing up as a wrong number on a screen.
            assert_optional(fields, "ack_missed", is_boolean, "a boolean")?;
            assert_optional(
                fields,
                "ack_missed_at",
                is_count,
                "a tick, at or above zero",
            )?;
            assert_optional(
                fields,
                "cadence_charged_at",
                is_count,
                "a tick, at or above zero",
            )?;
            assert_optional(
                fields,
                "cadence_missed",
                is_count,
                "a whole number of windows, at or above zero",
            )?;
            assert_optional(
                fields,
                "cadence_counted_to",
                is_count,
                "a whole minute, at or above zero",
            )?;
            assert_optional(
                fields,
                "last_update_at",
                is_count,
                "a whole minute, at or above zero",
            )?;
            // Who the ticket is FOR, where that is somebody other than the
            // person who filed it (the shadow-VIP split). A name, printed.
            assert_optional(fields, "beneficiary", is_string, "a string")?;
            // The out-of-scope ask (E9, 0.38.0) and the three answers to it.
            //
            // The flag is strictly boolean for the reason `vip` is: it is what
            // the scope verbs are guarded on, so a save must not be able to
            // smuggle one in as a string. The outcome is a closed enum for the
            // stronger reason - four of its six words CLOSE the ticket, and a
            // seventh invented in a text editor would be a ticket resolved by
            // typing - and the two stamps beside it are minutes, because the
            // customer's answer and the customer's return are both measured
            // from them.
            assert_optional(fields, "scope_ask", is_boolean, "a boolean")?;
            assert_optional(
                fields,
                "scope_outcome",
                |value| {
                    matches!(
                        value.as_str(),
                        Some("refused")
                            | Some("quoted")
                            | Some("approved")
                            | Some("declined")
                            | Some("obliged")
                            | Some("delivered")
                    )
                },
                "one of the six out-of-scope outcomes",
            )?;
            assert_optional(
                fields,
                "scope_quoted_at",
                is_count,
                "a whole minute, at or above zero",
            )?;
            assert_optional(
                fields,
                "scope_obliged_at",
                is_count,
                "a whole minute, at or above zero",
            )?;

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

    /// The project kind (0.29.0), and the one thing its validation is FOR: the
    /// schedule is ticks. A phase is derived from these numbers against the
    /// clock, so a word where a tick goes is a project with no phase at all -
    /// which is a refusal at load rather than a board that renders nothing.
    #[test]
    fn accepts_a_project_and_refuses_a_schedule_that_is_not_ticks() {
        let project = validate_node(&json!({
            "id": "project:arden-edge",
            "kind": "project",
            "fields": {
                "name": "ARDEN-MFG edge firewall replacement",
                "project_customer": "customer:arden",
                "project_started_at": 2_880,
                "project_audit_due": 3_120,
                "project_staging_due": 3_420,
                "project_cutover_due": 4_740,
                "project_handover_due": 6_120,
            },
        }))
        .expect("valid project");

        assert_eq!(project.kind, "project");
        assert_eq!(project.fields.len(), 7);

        let error = validate_node(&json!({
            "id": "project:arden-edge",
            "kind": "project",
            "fields": { "project_cutover_due": "Thursday afternoon" },
        }))
        .expect_err("a phase deadline is a tick");

        assert_eq!(
            error.message(),
            "Field \"project_cutover_due\" must be a number."
        );
    }

    /// The contract clocks, typed (0.37.1).
    ///
    /// Every one of these fields was untyped until now, which meant a save
    /// could carry any of them as anything. The one that mattered most is the
    /// missed-window count: it is multiplied into a breach weight, and a
    /// negative weight is refused by the meters BY THROWING, inside the day
    /// loop - so a number nothing was stopping made the shift stop. Refusing
    /// it here is the load-time half of the guard the verb now carries.
    #[test]
    fn refuses_a_contract_clock_that_is_not_a_count() {
        let ticket = |fields: Json| -> Json {
            json!({
                "id": "ticket:x",
                "kind": "ticket",
                "fields": fields,
            })
        };
        let bookkeeping = |extra: (&str, Json)| -> Json {
            ticket(json!({
                "state": "open",
                "spawned_at": 0,
                "sla_deadline": 120,
                extra.0: extra.1,
            }))
        };

        let error = validate_node(&bookkeeping(("cadence_missed", json!(-1))))
            .expect_err("a window does not un-pass");
        assert_eq!(
            error.message(),
            "Field \"cadence_missed\" must be a whole number of windows, at or above zero."
        );

        assert!(validate_node(&bookkeeping(("cadence_missed", json!(0)))).is_ok());
        assert!(validate_node(&bookkeeping(("cadence_missed", json!(3)))).is_ok());
        assert!(validate_node(&bookkeeping(("cadence_missed", json!(1.5)))).is_err());
        assert!(validate_node(&bookkeeping(("cadence_missed", json!("two")))).is_err());

        // The two minutes beside it, and the latch above it.
        assert!(validate_node(&bookkeeping(("cadence_counted_to", json!(-1)))).is_err());
        assert!(validate_node(&bookkeeping(("cadence_counted_to", json!(600)))).is_ok());
        assert!(validate_node(&bookkeeping(("last_update_at", json!(-1)))).is_err());
        assert!(validate_node(&bookkeeping(("last_update_at", json!(600)))).is_ok());
        assert!(validate_node(&bookkeeping(("ack_missed", json!("yes")))).is_err());
        assert!(validate_node(&bookkeeping(("ack_missed", json!(true)))).is_ok());

        // And who it is for, which is a line somebody reads.
        assert!(validate_node(&bookkeeping(("beneficiary", json!(7)))).is_err());
        assert!(validate_node(&bookkeeping(("beneficiary", json!("Miriam Thale")))).is_ok());

        // The out-of-scope ask (E9, 0.38.0): the flag the three answers to one
        // are guarded on, and the outcome four of whose six words CLOSE the
        // ticket - so a seventh invented in a text editor would be a ticket
        // resolved by typing, and "scope_ask": "yes" would be a way of shutting
        // an ordinary fault by pointing at a contract.
        assert!(validate_node(&bookkeeping(("scope_ask", json!("yes")))).is_err());
        assert!(validate_node(&bookkeeping(("scope_ask", json!(true)))).is_ok());
        assert!(validate_node(&bookkeeping(("scope_outcome", json!("obliged")))).is_ok());
        assert!(validate_node(&bookkeeping(("scope_outcome", json!("settled")))).is_err());
        assert!(validate_node(&bookkeeping(("scope_quoted_at", json!(-1)))).is_err());
        assert!(validate_node(&bookkeeping(("scope_quoted_at", json!(600)))).is_ok());
        assert!(validate_node(&bookkeeping(("scope_obliged_at", json!(1.5)))).is_err());
        assert!(validate_node(&bookkeeping(("scope_obliged_at", json!(600)))).is_ok());
    }

    /// There are two IT teams on a co-managed account and there is no third.
    ///
    /// A word off this list is read everywhere as "the map says nothing about
    /// this box", so a misspelling in a hand-edited save would hand the
    /// customer's own server back to nobody and take the soft wall down with
    /// it - silently, which is the worst way for a wall to go.
    #[test]
    fn refuses_a_raci_owner_that_is_neither_team() {
        let machine = |owner: Json| -> Json {
            json!({
                "id": "machine:penn-srv-01",
                "kind": "machine",
                "fields": { "hostname": "PENN-SRV-01", "raci_owner": owner },
            })
        };

        assert!(validate_node(&machine(json!("msp"))).is_ok());
        assert!(validate_node(&machine(json!("internal"))).is_ok());

        let error =
            validate_node(&machine(json!("theirs"))).expect_err("a third team does not exist");
        assert_eq!(
            error.message(),
            "Field \"raci_owner\" must be either \"msp\" or \"internal\"."
        );

        assert!(validate_node(&machine(json!(true))).is_err());
        // Absent is still the map saying nothing, which is every box but one.
        assert!(validate_node(&json!({
            "id": "machine:penn-ws-01",
            "kind": "machine",
            "fields": { "hostname": "PENN-WS-01" },
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
