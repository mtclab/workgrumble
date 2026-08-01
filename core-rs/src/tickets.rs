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

        // Reputation, and only reputation. A ticket used to carry a `money`
        // reward as well; nothing ever read it, because a closed ticket is
        // worth a flat bonus on the payslip rather than its own price, so the
        // field could be edited from 30 to 5 without moving a single number a
        // player sees. Requiring it here was the last thing keeping it alive.
        let reward = object.get("reward").and_then(Json::as_object);
        let has_reward = reward.is_some_and(|reward| {
            reward
                .get("reputation")
                .and_then(Json::as_f64)
                .is_some_and(f64::is_finite)
        });

        if !has_reward {
            return refuse!("Ticket reward must carry a finite \"reputation\".");
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

/// The four flags a record carries, so one can be put back as a unit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct TicketFlags {
    waiting: bool,
    resolved: bool,
    breached: bool,
    updating: bool,
}

/// One change to the ticket records, written backwards - the same bargain the
/// graph's journal makes, for the same reason: the records carry a parsed
/// definition and the raw JSON it was parsed from, so copying all of them to
/// guard one flag was the most expensive half of a savepoint.
#[derive(Clone, Debug)]
enum TicketUndo {
    Spawned(String),
    Flags { id: String, flags: TicketFlags },
}

/// Not `Clone`, for the reason `EntityGraph` is not: copying every record to
/// guard one flag is what the journal exists instead of.
#[derive(Debug, Default)]
pub struct TicketEngine {
    /// Private, and every mutation below goes through a method that journals
    /// it first. That is what makes the undo record complete by construction
    /// rather than by everybody remembering.
    records: BTreeMap<String, TicketRecord>,
    journal: Vec<TicketUndo>,
    journaling: bool,
}

impl TicketEngine {
    pub fn new() -> Self {
        Self::default()
    }

    // -- the undo journal ---------------------------------------------------

    pub(crate) fn begin_journal(&mut self) {
        self.journaling = true;
    }

    pub(crate) fn end_journal(&mut self) {
        self.journaling = false;
        self.journal.clear();
    }

    pub(crate) fn journal_mark(&self) -> usize {
        self.journal.len()
    }

    pub(crate) fn rollback_to(&mut self, mark: usize) {
        while self.journal.len() > mark {
            let Some(entry) = self.journal.pop() else {
                return;
            };

            match entry {
                TicketUndo::Spawned(id) => {
                    self.records.remove(&id);
                }
                TicketUndo::Flags { id, flags } => {
                    if let Some(record) = self.records.get_mut(&id) {
                        record.waiting = flags.waiting;
                        record.resolved = flags.resolved;
                        record.breached = flags.breached;
                        record.updating = flags.updating;
                    }
                }
            }
        }
    }

    fn remember(&mut self, id: &str) {
        if !self.journaling {
            return;
        }

        if let Some(record) = self.records.get(id) {
            self.journal.push(TicketUndo::Flags {
                id: id.to_owned(),
                flags: TicketFlags {
                    waiting: record.waiting,
                    resolved: record.resolved,
                    breached: record.breached,
                    updating: record.updating,
                },
            });
        }
    }

    // -- the records --------------------------------------------------------

    pub fn contains(&self, id: &str) -> bool {
        self.records.contains_key(id)
    }

    /// Every record, in the map's own order. Read-only: the lifecycle is the
    /// world's, and this is for callers that only want to look.
    pub fn iter(&self) -> impl Iterator<Item = (&String, &TicketRecord)> {
        self.records.iter()
    }

    pub fn insert(&mut self, record: TicketRecord) {
        let id = record.def.id.clone();

        if self.journaling {
            self.journal.push(TicketUndo::Spawned(id.clone()));
        }

        self.records.insert(id, record);
    }

    /// Whether the ticket is parked on somebody else. Parking and unparking a
    /// resolved or breached ticket is refused by the world, which owns the
    /// rule; this only writes the flag.
    pub fn set_waiting(&mut self, id: &str, waiting: bool) {
        self.remember(id);

        if let Some(record) = self.records.get_mut(id) {
            record.waiting = waiting;
        }
    }

    /// Closed, and no longer parked on anybody: a resolved ticket waits for
    /// nothing.
    pub fn set_resolved(&mut self, id: &str) {
        self.remember(id);

        if let Some(record) = self.records.get_mut(id) {
            record.resolved = true;
            record.waiting = false;
        }
    }

    pub fn set_breached(&mut self, id: &str) {
        self.remember(id);

        if let Some(record) = self.records.get_mut(id) {
            record.breached = true;
        }
    }

    /// Set while the engine writes the ticket's own bookkeeping fields, so the
    /// mutation that results does not re-enter the check that caused it.
    pub fn set_updating(&mut self, id: &str, updating: bool) {
        self.remember(id);

        if let Some(record) = self.records.get_mut(id) {
            record.updating = updating;
        }
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
            "reward": { "reputation": 1 },
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
                "Ticket reward must carry a finite \"reputation\".",
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
                    "sla_ticks": 1, "reward": { "reputation": 1 },
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

    /// The record journal on its own. A spawn inside a transaction that then
    /// refuses has to leave no record at all - the world can only reach that
    /// through a spawn whose own bookkeeping fails, which nothing can arrange
    /// today, so the variant is proven here rather than left on trust.
    #[test]
    fn the_journal_takes_a_spawn_and_a_flag_back() {
        let mut engine = TicketEngine::new();
        let record = |id: &str| {
            let mut def = valid_def();
            def["id"] = json!(id);

            TicketRecord {
                def: TicketDef::parse(&def).expect("valid"),
                waiting: false,
                resolved: false,
                breached: false,
                updating: false,
            }
        };

        engine.insert(record("ticket:kept"));
        engine.begin_journal();
        let mark = engine.journal_mark();

        engine.insert(record("ticket:doomed"));
        engine.set_waiting("ticket:kept", true);
        engine.set_updating("ticket:kept", true);
        engine.set_resolved("ticket:kept");
        engine.set_breached("ticket:kept");

        engine.rollback_to(mark);

        assert!(!engine.contains("ticket:doomed"), "the spawn survived");
        let kept = engine.get("ticket:kept").expect("still there");
        assert!(!kept.waiting);
        assert!(!kept.resolved);
        assert!(!kept.breached);
        assert!(!kept.updating);

        // Committing forgets the record rather than leaving it to be replayed.
        engine.set_waiting("ticket:kept", true);
        engine.end_journal();
        assert_eq!(engine.journal_mark(), 0);
        engine.set_waiting("ticket:kept", false);
        assert_eq!(engine.journal_mark(), 0, "a closed journal is still writing");
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
