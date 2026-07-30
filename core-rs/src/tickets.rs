//! Ticket definitions and the records behind them.
//!
//! The lifecycle itself (spawn, auto-resolve, breach, waiting) lives in
//! `world.rs`, because every one of those steps is a graph mutation and the
//! world is what owns the graph. This module owns the shape of a ticket and
//! the bookkeeping flags the lifecycle turns.

use std::collections::BTreeMap;
use std::rc::Rc;

use serde_json::{json, Value as Json};

use crate::assertions::Expr;
use crate::error::{EngineError, EngineResult};
use crate::num::safe_int_at_least;
use crate::ops::TicketIndex;
use crate::refuse;
use crate::schema::{is_ticket_archetype, validate_edge, validate_node, Edge, Node};
use crate::value::{js_str_cmp, FieldValue};

#[derive(Clone, Debug)]
pub enum SetupMutation {
    AddNode(Node),
    SetField {
        id: String,
        field: String,
        value: FieldValue,
    },
    AddEdge(Edge),
    RemoveEdge(Edge),
}

impl SetupMutation {
    pub fn parse(value: &Json) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Setup mutation must be an object with an op."))?;
        let operation = object
            .get("op")
            .and_then(Json::as_str)
            .ok_or_else(|| EngineError::new("Setup mutation must be an object with an op."))?;

        match operation {
            "addNode" => Ok(Self::AddNode(validate_node(
                object
                    .get("node")
                    .ok_or_else(|| EngineError::new("Node must be an object."))?,
            )?)),
            "setField" => {
                let id = object.get("id").and_then(Json::as_str).unwrap_or_default();
                let field = object
                    .get("field")
                    .and_then(Json::as_str)
                    .unwrap_or_default();
                let parsed = object.get("value").and_then(FieldValue::from_json);

                match (id.is_empty(), field.is_empty(), parsed) {
                    (false, false, Some(value)) => Ok(Self::SetField {
                        id: id.to_owned(),
                        field: field.to_owned(),
                        value,
                    }),
                    _ => refuse!("setField setup mutation is invalid."),
                }
            }
            "addEdge" => Ok(Self::AddEdge(validate_edge(
                object
                    .get("edge")
                    .ok_or_else(|| EngineError::new("Setup edge must be an object."))?,
            )?)),
            "removeEdge" => Ok(Self::RemoveEdge(validate_edge(
                object
                    .get("edge")
                    .ok_or_else(|| EngineError::new("Setup edge must be an object."))?,
            )?)),
            other => refuse!("Unsupported setup mutation \"{other}\"."),
        }
    }
}

#[derive(Clone, Debug)]
pub struct TicketDef {
    pub id: String,
    pub reporter: String,
    pub setup: Vec<SetupMutation>,
    pub resolved_when: Rc<Expr>,
    pub sla_ticks: i64,
    /// The definition exactly as it arrived, for `serialize`.
    pub raw: Json,
}

impl TicketDef {
    /// `validateTicketDef`, refusal for refusal: content is data and a
    /// malformed ticket has to fail at load, not in front of a player.
    pub fn parse(value: &Json) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Ticket definition must be an object."))?;

        let id = object.get("id").and_then(Json::as_str).unwrap_or_default();

        if id.is_empty() {
            return refuse!("Ticket id must be a non-empty string.");
        }

        let archetype = object
            .get("archetype")
            .and_then(Json::as_str)
            .unwrap_or_default();

        if !is_ticket_archetype(archetype) {
            return refuse!("Ticket archetype is not supported.");
        }

        let flavor = object.get("flavor").and_then(Json::as_object);
        let has_flavor = flavor.is_some_and(|flavor| {
            flavor.get("title").and_then(Json::as_str).is_some()
                && flavor.get("body").and_then(Json::as_str).is_some()
        });

        if !has_flavor {
            return refuse!("Ticket flavor requires string title and body.");
        }

        let reporter = object
            .get("reporter")
            .and_then(Json::as_str)
            .unwrap_or_default();

        if reporter.is_empty() {
            return refuse!("Ticket reporter must be a non-empty node id.");
        }

        let setup = object
            .get("setup")
            .and_then(Json::as_array)
            .ok_or_else(|| EngineError::new("Ticket setup must be an array."))?
            .iter()
            .map(SetupMutation::parse)
            .collect::<EngineResult<Vec<SetupMutation>>>()?;

        let resolved_when = object
            .get("resolved_when")
            .and_then(Expr::parse)
            .ok_or_else(|| EngineError::new("Ticket resolved_when must be a valid expression."))?;

        let sla_ticks = object
            .get("sla_ticks")
            .and_then(|ticks| safe_int_at_least(ticks, 0))
            .ok_or_else(|| {
                EngineError::new("Ticket sla_ticks must be a non-negative safe integer.")
            })?;

        let reward = object.get("reward").and_then(Json::as_object);
        let has_reward = reward.is_some_and(|reward| {
            reward
                .get("reputation")
                .and_then(Json::as_f64)
                .is_some_and(f64::is_finite)
                && reward
                    .get("money")
                    .and_then(Json::as_f64)
                    .is_some_and(f64::is_finite)
        });

        if !has_reward {
            return refuse!("Ticket reward values must be finite numbers.");
        }

        if object.get("kb_ref").and_then(Json::as_str).is_none() {
            return refuse!("Ticket kb_ref must be a string.");
        }

        Ok(Self {
            id: id.to_owned(),
            reporter: reporter.to_owned(),
            setup,
            resolved_when: Rc::new(resolved_when),
            sla_ticks,
            raw: value.clone(),
        })
    }

    pub fn creates_node(&self, id: &str) -> bool {
        self.setup
            .iter()
            .any(|mutation| matches!(mutation, SetupMutation::AddNode(node) if node.id == id))
    }
}

#[derive(Clone, Debug)]
pub struct TicketRecord {
    pub def: TicketDef,
    pub waiting: bool,
    pub resolved: bool,
    pub breached: bool,
    /// Set while the engine is writing the ticket's own bookkeeping fields, so
    /// the resulting mutation does not re-enter the check that caused it.
    pub updating: bool,
}

#[derive(Clone, Debug, Default)]
pub struct TicketEngine {
    pub records: BTreeMap<String, TicketRecord>,
}

impl TicketEngine {
    pub fn new() -> Self {
        Self::default()
    }

    /// Ticket ids in JavaScript string order: the order the reference engine
    /// checked them in, which is the order their events come out in.
    pub fn sorted_ids(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.records.keys().cloned().collect();
        ids.sort_by(|left, right| js_str_cmp(left, right));
        ids
    }

    pub fn get(&self, id: &str) -> Option<&TicketRecord> {
        self.records.get(id)
    }

    pub fn to_json(&self) -> Json {
        Json::Array(
            self.sorted_ids()
                .into_iter()
                .filter_map(|id| self.records.get(&id))
                .map(|record| {
                    json!({
                        "def": record.def.raw,
                        "waiting": record.waiting,
                        "resolved": record.resolved,
                        "breached": record.breached,
                    })
                })
                .collect::<Vec<Json>>(),
        )
    }

    /// Rebuilds the records from a save. Every flag has to be there and be a
    /// boolean: a missing `waiting` silently defaulting to false is how a
    /// parked ticket came back with its SLA running, and a duplicated id
    /// silently overwriting its twin is how a save could carry two truths
    /// about one ticket and restore only the later one.
    pub fn restore(&mut self, value: &Json) -> EngineResult<()> {
        let entries = value
            .as_array()
            .ok_or_else(|| EngineError::new("Ticket state must be an array."))?;
        let mut records = BTreeMap::new();

        for entry in entries {
            let object = entry
                .as_object()
                .ok_or_else(|| EngineError::new("Ticket state entry must be an object."))?;
            let def = TicketDef::parse(
                object
                    .get("def")
                    .ok_or_else(|| EngineError::new("Ticket state entry needs a def."))?,
            )?;
            let flag = |name: &str| -> EngineResult<bool> {
                object
                    .get(name)
                    .and_then(Json::as_bool)
                    .ok_or_else(|| {
                        EngineError::new(format!("Ticket state entry needs a boolean \"{name}\"."))
                    })
            };
            let record = TicketRecord {
                waiting: flag("waiting")?,
                resolved: flag("resolved")?,
                breached: flag("breached")?,
                updating: false,
                def,
            };

            if records.contains_key(&record.def.id) {
                let id = &record.def.id;
                return refuse!("Ticket state names \"{id}\" twice.");
            }

            records.insert(record.def.id.clone(), record);
        }

        self.records = records;
        Ok(())
    }
}

impl TicketIndex for TicketEngine {
    fn is_registered(&self, id: &str) -> bool {
        self.records.contains_key(id)
    }

    fn resolution_accepts(&self, id: &str, field: &str, value: &FieldValue) -> bool {
        self.records
            .get(id)
            // The rule has to be satisfiable by setting the field ON THIS
            // TICKET. A clause about some other node's `escalated` flag is a
            // rule about that node, and honouring it here is what left a
            // ticket marked escalated and still open.
            .is_some_and(|record| record.def.resolved_when.accepts_field(id, field, value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_def() -> Json {
        json!({
            "id": "ticket:x",
            "archetype": "hidden_cause",
            "flavor": { "title": "T", "body": "B" },
            "reporter": "person:pat",
            "setup": [],
            "resolved_when": {
                "op": "eq",
                "selector": { "id": "service:fan" },
                "field": "status",
                "value": "running",
            },
            "sla_ticks": 10,
            "reward": { "reputation": 1, "money": 2 },
            "kb_ref": "kb/x",
        })
    }

    #[test]
    fn parses_a_valid_definition() {
        let def = TicketDef::parse(&valid_def()).expect("valid");
        assert_eq!(def.id, "ticket:x");
        assert_eq!(def.sla_ticks, 10);
        assert_eq!(def.reporter, "person:pat");
    }

    #[test]
    fn refuses_every_way_a_definition_can_be_wrong() {
        let cases: [(&str, Json); 9] = [
            ("Ticket id must be a non-empty string.", json!({})),
            ("Ticket archetype is not supported.", json!({ "id": "t" })),
            (
                "Ticket flavor requires string title and body.",
                json!({ "id": "t", "archetype": "flood" }),
            ),
            (
                "Ticket reporter must be a non-empty node id.",
                json!({ "id": "t", "archetype": "flood", "flavor": { "title": "a", "body": "b" } }),
            ),
            (
                "Ticket setup must be an array.",
                json!({
                    "id": "t", "archetype": "flood",
                    "flavor": { "title": "a", "body": "b" }, "reporter": "p",
                }),
            ),
            (
                "Ticket resolved_when must be a valid expression.",
                json!({
                    "id": "t", "archetype": "flood",
                    "flavor": { "title": "a", "body": "b" }, "reporter": "p", "setup": [],
                }),
            ),
            (
                "Ticket sla_ticks must be a non-negative safe integer.",
                json!({
                    "id": "t", "archetype": "flood",
                    "flavor": { "title": "a", "body": "b" }, "reporter": "p", "setup": [],
                    "resolved_when": { "op": "exists", "kind": "person" },
                    "sla_ticks": -1,
                }),
            ),
            (
                "Ticket reward values must be finite numbers.",
                json!({
                    "id": "t", "archetype": "flood",
                    "flavor": { "title": "a", "body": "b" }, "reporter": "p", "setup": [],
                    "resolved_when": { "op": "exists", "kind": "person" },
                    "sla_ticks": 1,
                }),
            ),
            (
                "Ticket kb_ref must be a string.",
                json!({
                    "id": "t", "archetype": "flood",
                    "flavor": { "title": "a", "body": "b" }, "reporter": "p", "setup": [],
                    "resolved_when": { "op": "exists", "kind": "person" },
                    "sla_ticks": 1, "reward": { "reputation": 1, "money": 1 },
                }),
            ),
        ];

        for (message, case) in cases {
            assert_eq!(
                TicketDef::parse(&case).expect_err("refused").message(),
                message,
            );
        }
    }

    #[test]
    fn refuses_a_broken_setup_mutation() {
        let mut def = valid_def();
        def["setup"] = json!([{ "op": "teleport" }]);
        assert_eq!(
            TicketDef::parse(&def).expect_err("refused").message(),
            "Unsupported setup mutation \"teleport\".",
        );

        def["setup"] = json!([{ "op": "setField", "id": "", "field": "x", "value": 1 }]);
        assert_eq!(
            TicketDef::parse(&def).expect_err("refused").message(),
            "setField setup mutation is invalid.",
        );
    }
}
