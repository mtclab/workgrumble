//! The action registry: what the player is allowed to do, and the record of
//! what they tried.
//!
//! Definitions are data (see `ops.rs`), so registering an action is parsing
//! one. Tier gating, the dispatch log and validate-then-apply live here; the
//! applying itself belongs to the world, because that is what owns the graph.

use std::collections::BTreeMap;

use serde_json::{json, Value as Json};

use crate::error::{EngineError, EngineResult};
use crate::num::{safe_int_at_least, safe_u32, MAX_SAFE_INT};
use crate::ops::{Guard, Op, Params};
use crate::refuse;
use crate::value::FieldValue;

/// Where the dispatch log is measured from.
///
/// A checkpoint is the world as it stood at `tick`, named by the graph hash it
/// had there; the log holds only what happened SINCE. That is what keeps the
/// log - and every save carrying it - from growing for as long as a career
/// does, and it is what "replay" means from here on: take the world at the
/// checkpoint, apply the log, arrive at the world the save describes. Replay
/// from tick 0 is no longer promised, because the entries that would have got
/// you there have been drained on purpose.
///
/// `hash` is `None` before any checkpoint has been taken. That is not a
/// missing value, it is a different claim: nothing has been drained, so the
/// log IS the whole history and the world's own beginning is the baseline.
/// The M0 determinism fixture never checkpoints, which is why its golden hash
/// is untouched by any of this.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LogCheckpoint {
    pub tick: i64,
    pub hash: Option<String>,
    /// The world the log is measured from, kept whole.
    ///
    /// `hash` NAMES that world; this IS it. Without it a save carries a
    /// history since a baseline it does not contain, so the replay it promises
    /// needs a second file nobody kept - and replaying the log against the
    /// save's own current graph applies the same day twice. Present exactly
    /// when `hash` is: both are set by the same drain.
    pub baseline: Option<CheckpointBaseline>,
}

/// The world at the checkpoint: everything a restore rebuilds except the verb
/// set and the log, neither of which a baseline has anything to say about - the
/// actions are the build's, and the log at a checkpoint is empty by definition.
#[derive(Clone, Debug, PartialEq)]
pub struct CheckpointBaseline {
    pub rng_state: u32,
    /// `{ tick, sla_running }`, exactly as `serialize` writes a clock.
    pub clock: Json,
    /// `{ nodes, edges }`, exactly as `serialize` writes a graph.
    pub graph: Json,
    pub tickets: Json,
}

impl CheckpointBaseline {
    pub fn to_json(&self) -> Json {
        json!({
            "rng_state": self.rng_state,
            "clock": self.clock,
            "graph": self.graph,
            "tickets": self.tickets,
        })
    }

    pub fn from_json(value: &Json) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Saved checkpoint baseline must be an object."))?;
        // Shape only: what these parts MEAN is checked where they are read
        // back in, by the same code that reads a saved world - one parser for
        // a graph, not two that can come to disagree.
        let part = |key: &str, wanted: fn(&Json) -> bool| -> EngineResult<Json> {
            object
                .get(key)
                .filter(|part| wanted(part))
                .cloned()
                .ok_or_else(|| {
                    EngineError::new(format!("Saved checkpoint baseline needs its \"{key}\"."))
                })
        };

        Ok(Self {
            rng_state: object.get("rng_state").and_then(safe_u32).ok_or_else(|| {
                EngineError::new("Saved checkpoint baseline needs an rng state.")
            })?,
            clock: part("clock", Json::is_object)?,
            graph: part("graph", Json::is_object)?,
            tickets: part("tickets", Json::is_array)?,
        })
    }
}

impl LogCheckpoint {
    /// What the save carries: the baseline included, because that is the half
    /// that makes the file replayable on its own.
    pub fn to_json(&self) -> Json {
        json!({
            "tick": self.tick,
            "hash": match &self.hash {
                Some(hash) => json!(hash),
                None => Json::Null,
            },
            "baseline": match &self.baseline {
                Some(baseline) => baseline.to_json(),
                None => Json::Null,
            },
        })
    }

    /// What a caller asking "where is the log measured from" wants: the two
    /// numbers, without a copy of the world attached to the answer.
    pub fn summary_json(&self) -> Json {
        json!({
            "tick": self.tick,
            "hash": match &self.hash {
                Some(hash) => json!(hash),
                None => Json::Null,
            },
        })
    }

    pub fn from_json(value: &Json) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Saved checkpoint must be an object."))?;
        let tick = object
            .get("tick")
            .and_then(|tick| safe_int_at_least(tick, 0))
            .ok_or_else(|| {
                EngineError::new("Saved checkpoint needs a non-negative safe integer tick.")
            })?;
        let hash = match object.get("hash") {
            None | Some(Json::Null) => None,
            Some(Json::String(hash)) if !hash.is_empty() => Some(hash.clone()),
            Some(_) => return refuse!("Saved checkpoint hash must be a hash or null."),
        };
        let baseline = match object.get("baseline") {
            None | Some(Json::Null) => None,
            Some(baseline) => Some(CheckpointBaseline::from_json(baseline)?),
        };

        // The two halves are one claim. A drained log with no world behind it
        // is the save shape this policy exists to stop, and a world with
        // nothing drained is a baseline nobody measured anything from.
        if hash.is_some() != baseline.is_some() {
            return refuse!(
                "Saved checkpoint must carry the world it names, and name the world it carries."
            );
        }

        Ok(Self {
            tick,
            hash,
            baseline,
        })
    }
}

#[derive(Clone, Debug)]
pub struct ActionDef {
    pub id: String,
    pub tier: i64,
    pub validate: Vec<Guard>,
    pub apply: Vec<Op>,
    /// Kept so `serialize` can hand the definitions back untouched.
    pub raw: Json,
}

impl ActionDef {
    pub fn parse(value: &Json) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Action definition must be an object."))?;
        let id = object
            .get("id")
            .and_then(Json::as_str)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| EngineError::new("Action id must be a non-empty string."))?;
        let tier = object
            .get("tier")
            .and_then(|tier| safe_int_at_least(tier, 0))
            .ok_or_else(|| EngineError::new("Action tier must be a non-negative safe integer."))?;

        let validate = match object.get("validate") {
            Some(guards) => guards
                .as_array()
                .ok_or_else(|| EngineError::new("Action validate must be an array of guards."))?
                .iter()
                .map(Guard::parse)
                .collect::<EngineResult<Vec<Guard>>>()?,
            None => Vec::new(),
        };

        // `apply` may roll dice; a guard may not. Both start with nothing bound,
        // because a binding only exists inside the `neighbor_where` that made
        // it - see `ParseScope`.
        let apply = match object.get("apply") {
            Some(ops) => ops
                .as_array()
                .ok_or_else(|| EngineError::new("Action apply must be an array of ops."))?
                .iter()
                .map(Op::parse)
                .collect::<EngineResult<Vec<Op>>>()?,
            None => Vec::new(),
        };

        Ok(Self {
            id: id.to_owned(),
            tier,
            validate,
            apply,
            raw: value.clone(),
        })
    }
}

#[derive(Clone, Debug)]
pub struct DispatchLogEntry {
    pub tick: i64,
    pub id: String,
    pub actor: String,
    pub target: Option<String>,
    pub params: Params,
    pub ok: bool,
    pub reason: Option<String>,
}

impl DispatchLogEntry {
    pub fn to_json(&self) -> Json {
        let mut params = serde_json::Map::new();

        for (name, value) in &self.params {
            params.insert(name.clone(), value.to_json());
        }

        let mut entry = serde_json::Map::new();
        entry.insert("tick".to_owned(), json!(self.tick));
        entry.insert("id".to_owned(), json!(self.id));
        entry.insert("actor".to_owned(), json!(self.actor));
        entry.insert(
            "target".to_owned(),
            match &self.target {
                Some(target) => json!(target),
                None => Json::Null,
            },
        );
        entry.insert("params".to_owned(), Json::Object(params));
        entry.insert("ok".to_owned(), json!(self.ok));

        // `reason` is absent on success, exactly as the TypeScript log has it.
        if let Some(reason) = &self.reason {
            entry.insert("reason".to_owned(), json!(reason));
        }

        Json::Object(entry)
    }

    pub fn from_json(value: &Json) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Dispatch log entry must be an object."))?;

        // A wrongly typed `target` used to read as "no target", which turns a
        // replayed aimed action into an aimless one.
        let target = match object.get("target") {
            None | Some(Json::Null) => None,
            Some(Json::String(target)) => Some(target.clone()),
            Some(_) => {
                return refuse!("Dispatch log entry target must be a node id or null.");
            }
        };

        Ok(Self {
            tick: object
                .get("tick")
                .and_then(|tick| safe_int_at_least(tick, 0))
                .ok_or_else(|| {
                    EngineError::new("Dispatch log entry needs a non-negative safe integer tick.")
                })?,
            id: object
                .get("id")
                .and_then(Json::as_str)
                .ok_or_else(|| EngineError::new("Dispatch log entry needs an id."))?
                .to_owned(),
            actor: object
                .get("actor")
                .and_then(Json::as_str)
                .ok_or_else(|| EngineError::new("Dispatch log entry needs an actor."))?
                .to_owned(),
            target,
            params: parse_params(object.get("params"))?,
            ok: object
                .get("ok")
                .and_then(Json::as_bool)
                .ok_or_else(|| EngineError::new("Dispatch log entry needs an ok flag."))?,
            reason: object
                .get("reason")
                .and_then(Json::as_str)
                .map(str::to_owned),
        })
    }
}

/// Parameters arrive as a plain JSON object of field values; anything else in
/// there is a refusal rather than a silently dropped key.
pub fn parse_params(value: Option<&Json>) -> EngineResult<Params> {
    let mut params = Params::new();

    let Some(value) = value else {
        return Ok(params);
    };

    if value.is_null() {
        return Ok(params);
    }

    let object = value
        .as_object()
        .ok_or_else(|| EngineError::new("Action params must be an object."))?;

    for (name, raw) in object {
        let parsed = FieldValue::from_json(raw).ok_or_else(|| {
            EngineError::new(format!("Parameter \"{name}\" is not a field value."))
        })?;
        params.insert(name.clone(), parsed);
    }

    Ok(params)
}

#[derive(Clone, Debug)]
pub struct ActionRegistry {
    actions: BTreeMap<String, ActionDef>,
    /// How a refusal names each node kind. World content owns the words; the
    /// engine only knows which kind it is refusing.
    pub kind_labels: BTreeMap<String, String>,
    tier: i64,
    log: Vec<DispatchLogEntry>,
    checkpoint: LogCheckpoint,
}

impl Default for ActionRegistry {
    fn default() -> Self {
        Self {
            actions: BTreeMap::new(),
            kind_labels: BTreeMap::new(),
            tier: 1,
            log: Vec::new(),
            checkpoint: LogCheckpoint::default(),
        }
    }
}

impl ActionRegistry {
    pub fn new(tier: i64) -> Self {
        Self {
            tier,
            ..Self::default()
        }
    }

    pub fn tier(&self) -> i64 {
        self.tier
    }

    pub fn set_tier(&mut self, tier: i64) -> EngineResult<()> {
        if !(0..=MAX_SAFE_INT).contains(&tier) {
            return refuse!("Action tier must be a non-negative safe integer.");
        }

        self.tier = tier;
        Ok(())
    }

    /// Whether a definition can be installed, asked BEFORE anything is. A
    /// payload with one duplicate in it must not leave half a verb set behind,
    /// and the cheapest way to promise that is to check every id first.
    pub fn can_register(&self, id: &str) -> EngineResult<()> {
        if self.actions.contains_key(id) {
            return refuse!("Action \"{id}\" is already registered.");
        }

        Ok(())
    }

    pub fn register(&mut self, definition: ActionDef) -> EngineResult<()> {
        self.can_register(&definition.id)?;
        self.actions.insert(definition.id.clone(), definition);
        Ok(())
    }

    pub fn get(&self, id: &str) -> Option<&ActionDef> {
        self.actions.get(id)
    }

    pub fn ids(&self) -> Vec<&str> {
        self.actions.keys().map(String::as_str).collect()
    }

    pub fn log(&self) -> &[DispatchLogEntry] {
        &self.log
    }

    pub fn push_log(&mut self, entry: DispatchLogEntry) {
        self.log.push(entry);
    }

    /// Rolls the log back to a length taken before an operation started. The
    /// log is append-only, so a length is a complete undo record.
    pub fn truncate_log(&mut self, length: usize) {
        self.log.truncate(length);
    }

    pub fn checkpoint(&self) -> &LogCheckpoint {
        &self.checkpoint
    }

    /// Moves the baseline to `tick`/`hash` and drains everything the log had
    /// recorded up to here, answering with how many entries went.
    ///
    /// The entries are dropped rather than archived on purpose: the state they
    /// would replay into is the checkpoint itself, and keeping both is keeping
    /// the same information twice - which is the growth this policy exists to
    /// stop. Whoever wants the old log keeps the old SAVE.
    pub fn set_checkpoint(
        &mut self,
        tick: i64,
        hash: String,
        baseline: CheckpointBaseline,
    ) -> usize {
        let drained = self.log.len();
        self.log.clear();
        self.checkpoint = LogCheckpoint {
            tick,
            hash: Some(hash),
            baseline: Some(baseline),
        };
        drained
    }

    pub fn definitions(&self) -> Vec<&Json> {
        self.actions.values().map(|action| &action.raw).collect()
    }

    /// Reinstates a saved log against a saved checkpoint.
    ///
    /// The two are checked against each other because they are one claim: a
    /// log that starts before the baseline it is measured from describes a
    /// history that has already been absorbed, and replaying it would apply
    /// the same actions twice.
    pub fn restore_log(
        &mut self,
        entries: Vec<DispatchLogEntry>,
        checkpoint: LogCheckpoint,
    ) -> EngineResult<()> {
        if let Some(entry) = entries.iter().find(|entry| entry.tick < checkpoint.tick) {
            let tick = entry.tick;
            let baseline = checkpoint.tick;
            return refuse!(
                "Saved dispatch log has an entry at tick {tick}, before its checkpoint at \
                 {baseline}."
            );
        }

        self.log = entries;
        self.checkpoint = checkpoint;
        Ok(())
    }
}

/// The answer a dispatch gives. Never an exception: a refusal is a sentence.
#[derive(Clone, Debug)]
pub enum DispatchResult {
    Ok,
    Refused(String),
}

impl DispatchResult {
    pub fn to_json(&self) -> Json {
        match self {
            Self::Ok => json!({ "ok": true }),
            Self::Refused(reason) => json!({ "ok": false, "reason": reason }),
        }
    }

    pub fn is_ok(&self) -> bool {
        matches!(self, Self::Ok)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_definition_and_refuses_a_broken_one() {
        let definition = ActionDef::parse(&json!({
            "id": "account.unlock",
            "tier": 1,
            "validate": [
                { "when": { "pred": "target_missing" }, "reason": "Pick an account first." },
            ],
            "apply": [
                {
                    "op": "set_field",
                    "node": { "ref": "target" },
                    "field": "locked",
                    "value": { "const": false },
                },
            ],
        }))
        .expect("valid definition");

        assert_eq!(definition.id, "account.unlock");
        assert_eq!(definition.tier, 1);
        assert_eq!(definition.validate.len(), 1);
        assert_eq!(definition.apply.len(), 1);

        assert!(ActionDef::parse(&json!({ "id": "", "tier": 1 })).is_err());
        assert!(ActionDef::parse(&json!({ "id": "a", "tier": -1 })).is_err());
        assert!(ActionDef::parse(&json!({ "id": "a" })).is_err());
        assert!(ActionDef::parse(&json!({ "id": "a", "tier": 1, "apply": {} })).is_err());
    }

    /// A tier is a number the shell reads back through JavaScript. One the
    /// browser cannot hold exactly is not a big tier, it is a wrong one.
    #[test]
    fn refuses_tiers_javascript_could_not_read_back() {
        assert!(ActionDef::parse(&json!({ "id": "a", "tier": MAX_SAFE_INT })).is_ok());
        assert!(ActionDef::parse(&json!({ "id": "a", "tier": 9_007_199_254_740_992_i64 })).is_err());
        assert!(ActionDef::parse(&json!({ "id": "a", "tier": i64::MAX })).is_err());
        assert!(ActionDef::parse(&json!({ "id": "a", "tier": 1.5 })).is_err());

        let mut registry = ActionRegistry::new(1);
        assert!(registry.set_tier(MAX_SAFE_INT).is_ok());
        assert!(registry.set_tier(MAX_SAFE_INT + 1).is_err());
        assert!(registry.set_tier(-1).is_err());
        assert_eq!(registry.tier(), MAX_SAFE_INT);
    }

    #[test]
    fn refuses_a_log_entry_whose_target_is_not_a_node_id() {
        let entry = json!({
            "tick": 0, "id": "a", "actor": "person:pat", "target": 42, "params": {}, "ok": true,
        });
        assert_eq!(
            DispatchLogEntry::from_json(&entry).expect_err("typed").message(),
            "Dispatch log entry target must be a node id or null.",
        );

        let unsafe_tick = json!({
            "tick": 9_007_199_254_740_992_i64,
            "id": "a", "actor": "person:pat", "target": null, "params": {}, "ok": true,
        });
        assert!(DispatchLogEntry::from_json(&unsafe_tick).is_err());
    }

    #[test]
    fn refuses_a_second_registration_of_the_same_id() {
        let mut registry = ActionRegistry::new(1);
        let definition = ActionDef::parse(&json!({ "id": "a", "tier": 1 })).expect("valid");

        registry.register(definition.clone()).expect("first");
        assert_eq!(
            registry.register(definition).expect_err("second").message(),
            "Action \"a\" is already registered.",
        );
    }

    #[test]
    fn log_entries_round_trip_including_an_absent_reason() {
        let entry = DispatchLogEntry {
            tick: 3,
            id: "account.unlock".to_owned(),
            actor: "person:tech".to_owned(),
            target: Some("account:ada".to_owned()),
            params: Params::new(),
            ok: true,
            reason: None,
        };
        let json = entry.to_json();

        assert!(json.get("reason").is_none());
        assert_eq!(json.get("target"), Some(&json!("account:ada")));

        let parsed = DispatchLogEntry::from_json(&json).expect("round trip");
        assert_eq!(parsed.tick, 3);
        assert!(parsed.ok);
        assert!(parsed.reason.is_none());
    }

    #[test]
    fn params_must_be_field_values() {
        assert!(parse_params(Some(&json!({ "a": 1, "b": "x", "c": null }))).is_ok());
        assert!(parse_params(Some(&json!({ "a": [] }))).is_err());
        assert!(parse_params(Some(&json!([]))).is_err());
        assert!(parse_params(None).expect("no params").is_empty());
    }
}
