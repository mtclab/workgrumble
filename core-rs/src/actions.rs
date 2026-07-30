//! The action registry: what the player is allowed to do, and the record of
//! what they tried.
//!
//! Definitions are data (see `ops.rs`), so registering an action is parsing
//! one. Tier gating, the dispatch log and validate-then-apply live here; the
//! applying itself belongs to the world, because that is what owns the graph.

use std::collections::BTreeMap;

use serde_json::{json, Value as Json};

use crate::error::{EngineError, EngineResult};
use crate::ops::{Guard, Op, Params};
use crate::refuse;
use crate::value::FieldValue;

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
            .and_then(Json::as_i64)
            .filter(|tier| *tier >= 0)
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

        Ok(Self {
            tick: object
                .get("tick")
                .and_then(Json::as_i64)
                .ok_or_else(|| EngineError::new("Dispatch log entry needs a tick."))?,
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
            target: object
                .get("target")
                .and_then(Json::as_str)
                .map(str::to_owned),
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
}

impl Default for ActionRegistry {
    fn default() -> Self {
        Self {
            actions: BTreeMap::new(),
            kind_labels: BTreeMap::new(),
            tier: 1,
            log: Vec::new(),
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
        if tier < 0 {
            return refuse!("Action tier must be a non-negative safe integer.");
        }

        self.tier = tier;
        Ok(())
    }

    pub fn register(&mut self, definition: ActionDef) -> EngineResult<()> {
        if self.actions.contains_key(&definition.id) {
            let id = &definition.id;
            return refuse!("Action \"{id}\" is already registered.");
        }

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

    pub fn definitions(&self) -> Vec<&Json> {
        self.actions.values().map(|action| &action.raw).collect()
    }

    pub fn restore_log(&mut self, entries: Vec<DispatchLogEntry>) {
        self.log = entries;
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
