//! The boundary. One class, JSON in, JSON out, events returned.
//!
//! Nothing here may panic: every entry point parses defensively and answers
//! with `{ ok: false, reason }` instead. A panic across the wasm boundary
//! poisons the module for the rest of the session, which in a browser game
//! means the desktop stops responding mid-click - so malformed input is a
//! refusal, always, however malformed.

use serde_json::{json, Value as Json};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::actions::{parse_params, DispatchLogEntry};
use crate::assertions::evaluate_json;
use crate::clock::SimClock;
use crate::error::{EngineError, EngineResult};
use crate::events::events_to_json;
use crate::graph::{node_to_json, Direction};
use crate::rng::Rng;
use crate::schema::{validate_edge, validate_node};
use crate::value::FieldValue;
use crate::world::World;

#[wasm_bindgen]
pub struct Engine {
    world: World,
}

fn parse_json(payload: &str) -> EngineResult<Json> {
    serde_json::from_str(payload)
        .map_err(|error| EngineError::new(format!("Payload is not valid JSON: {error}")))
}

fn ok_with_events(world: &mut World) -> String {
    json!({ "ok": true, "events": events_to_json(&world.drain_events()) }).to_string()
}

fn refusal_with_events(world: &mut World, reason: &str) -> String {
    json!({
        "ok": false,
        "reason": reason,
        "events": events_to_json(&world.drain_events()),
    })
    .to_string()
}

fn value_result(value: Json) -> String {
    json!({ "ok": true, "value": value }).to_string()
}

fn value_refusal(reason: &str) -> String {
    json!({ "ok": false, "reason": reason }).to_string()
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Self {
        Self {
            world: World::new(seed),
        }
    }

    /// Graph construction ops - how a world gets seeded.
    pub fn apply_setup(&mut self, payload: &str) -> String {
        match parse_json(payload).and_then(|ops| self.world.apply_setup(&ops)) {
            Ok(()) => ok_with_events(&mut self.world),
            Err(error) => refusal_with_events(&mut self.world, error.message()),
        }
    }

    /// Action definitions, in the op language.
    pub fn register_actions(&mut self, payload: &str) -> String {
        match parse_json(payload).and_then(|actions| self.world.register_actions(&actions)) {
            Ok(()) => ok_with_events(&mut self.world),
            Err(error) => refusal_with_events(&mut self.world, error.message()),
        }
    }

    /// `{ action, actor, target, params }` in, `{ ok, reason?, events }` out.
    pub fn dispatch(&mut self, payload: &str) -> String {
        let request = match parse_json(payload) {
            Ok(request) => request,
            Err(error) => return refusal_with_events(&mut self.world, error.message()),
        };

        let Some(action) = request.get("action").and_then(Json::as_str) else {
            return refusal_with_events(&mut self.world, "Dispatch needs an \"action\" id.");
        };
        let Some(actor) = request.get("actor").and_then(Json::as_str) else {
            return refusal_with_events(&mut self.world, "Dispatch needs an \"actor\" node id.");
        };
        let params = match parse_params(request.get("params")) {
            Ok(params) => params,
            Err(error) => return refusal_with_events(&mut self.world, error.message()),
        };
        let target = request.get("target").and_then(Json::as_str);

        let result = self.world.dispatch(action, actor, target, params);
        let events = events_to_json(&self.world.drain_events());
        let mut answer = result.to_json();

        if let Json::Object(object) = &mut answer {
            object.insert("events".to_owned(), events);
        }

        answer.to_string()
    }

    pub fn spawn_ticket(&mut self, payload: &str) -> String {
        match parse_json(payload).and_then(|def| self.world.spawn_ticket(&def)) {
            Ok(()) => ok_with_events(&mut self.world),
            Err(error) => refusal_with_events(&mut self.world, error.message()),
        }
    }

    pub fn set_waiting(&mut self, id: &str, waiting: bool) -> String {
        match self.world.set_waiting(id, waiting) {
            Ok(()) => ok_with_events(&mut self.world),
            Err(error) => refusal_with_events(&mut self.world, error.message()),
        }
    }

    pub fn set_tier(&mut self, tier: i32) -> String {
        match self.world.registry.set_tier(i64::from(tier)) {
            Ok(()) => ok_with_events(&mut self.world),
            Err(error) => refusal_with_events(&mut self.world, error.message()),
        }
    }

    pub fn tier(&self) -> i32 {
        self.world.registry.tier() as i32
    }

    /// Advances whole ticks, returning everything that happened on the way.
    pub fn advance(&mut self, ticks: f64) -> String {
        match SimClock::validate_advance(ticks).and_then(|ticks| self.world.advance(ticks)) {
            Ok(()) => ok_with_events(&mut self.world),
            Err(error) => refusal_with_events(&mut self.world, error.message()),
        }
    }

    pub fn now(&self) -> f64 {
        self.world.clock.now() as f64
    }

    pub fn snapshot_hash(&self) -> String {
        self.world.graph.snapshot_hash()
    }

    pub fn dispatch_log(&self) -> String {
        Json::Array(
            self.world
                .registry
                .log()
                .iter()
                .map(DispatchLogEntry::to_json)
                .collect(),
        )
        .to_string()
    }

    /// Read-only questions about the world: `{ kind, ... }` in, a value out.
    pub fn query(&self, payload: &str) -> String {
        let request = match parse_json(payload) {
            Ok(request) => request,
            Err(error) => return value_refusal(error.message()),
        };

        let Some(kind) = request.get("kind").and_then(Json::as_str) else {
            return value_refusal("Query needs a \"kind\".");
        };

        let id = request.get("id").and_then(Json::as_str);
        let field = request.get("field").and_then(Json::as_str);

        match kind {
            "get_node" => match id {
                Some(id) => value_result(
                    self.world
                        .graph
                        .get_node(id)
                        .map_or(Json::Null, node_to_json),
                ),
                None => value_refusal("get_node needs an \"id\"."),
            },
            "get_field" => match (id, field) {
                (Some(id), Some(field)) => value_result(
                    self.world
                        .graph
                        .get_field(id, field)
                        .map_or(Json::Null, FieldValue::to_json),
                ),
                _ => value_refusal("get_field needs an \"id\" and a \"field\"."),
            },
            "nodes_of_kind" => match request.get("node_kind").and_then(Json::as_str) {
                Some(node_kind) => value_result(Json::Array(
                    self.world
                        .graph
                        .nodes_of_kind(node_kind)
                        .into_iter()
                        .map(node_to_json)
                        .collect(),
                )),
                None => value_refusal("nodes_of_kind needs a \"node_kind\"."),
            },
            "all_nodes" => value_result(Json::Array(
                self.world
                    .graph
                    .all_nodes()
                    .into_iter()
                    .map(node_to_json)
                    .collect(),
            )),
            "neighbors" => {
                let Some(id) = id else {
                    return value_refusal("neighbors needs an \"id\".");
                };
                let direction = match request
                    .get("direction")
                    .and_then(Json::as_str)
                    .map(Direction::parse)
                {
                    Some(Ok(direction)) => direction,
                    Some(Err(error)) => return value_refusal(error.message()),
                    None => return value_refusal("neighbors needs a \"direction\"."),
                };

                value_result(Json::Array(
                    self.world
                        .graph
                        .neighbors(
                            id,
                            direction,
                            request.get("edge_kind").and_then(Json::as_str),
                        )
                        .into_iter()
                        .map(node_to_json)
                        .collect(),
                ))
            }
            "evaluate_expr" => match request.get("expr") {
                Some(expr) => value_result(json!(evaluate_json(&self.world.graph, expr))),
                None => value_refusal("evaluate_expr needs an \"expr\"."),
            },
            "ticket_state" => match id {
                Some(id) => value_result(
                    self.world
                        .ticket_state(id)
                        .map_or(Json::Null, FieldValue::to_json),
                ),
                None => value_refusal("ticket_state needs an \"id\"."),
            },
            "ticket_registered" => match id {
                Some(id) => value_result(json!(self.world.tickets.get(id).is_some())),
                None => value_refusal("ticket_registered needs an \"id\"."),
            },
            "ticket_breached" => match id {
                Some(id) => value_result(json!(self.world.was_breached(id))),
                None => value_refusal("ticket_breached needs an \"id\"."),
            },
            "action_ids" => value_result(json!(self.world.registry.ids())),
            "tier" => value_result(json!(self.world.registry.tier())),
            other => value_refusal(&format!("Query kind \"{other}\" is not known.")),
        }
    }

    /// The save seam: everything needed to stand this engine up again.
    pub fn serialize(&self) -> String {
        json!({
            "version": crate::ENGINE_VERSION,
            "seed": self.world.rng.seed(),
            "rng_state": self.world.rng.state(),
            "clock": {
                "tick": self.world.clock.now(),
                "paused": self.world.clock.is_paused(),
                "speed": self.world.clock.speed(),
            },
            "graph": {
                "nodes": self
                    .world
                    .graph
                    .all_nodes()
                    .into_iter()
                    .map(node_to_json)
                    .collect::<Vec<Json>>(),
                "edges": self
                    .world
                    .graph
                    .edges()
                    .iter()
                    .map(|edge| json!({ "from": edge.from, "to": edge.to, "kind": edge.kind }))
                    .collect::<Vec<Json>>(),
            },
            "registry": {
                "tier": self.world.registry.tier(),
                "kind_labels": self.world.registry.kind_labels,
                "actions": self.world.registry.definitions(),
                "log": self
                    .world
                    .registry
                    .log()
                    .iter()
                    .map(DispatchLogEntry::to_json)
                    .collect::<Vec<Json>>(),
            },
            "tickets": self.world.tickets.to_json(),
        })
        .to_string()
    }

    pub fn restore(&mut self, payload: &str) -> String {
        match parse_json(payload).and_then(|state| self.restore_state(&state)) {
            Ok(()) => ok_with_events(&mut self.world),
            Err(error) => refusal_with_events(&mut self.world, error.message()),
        }
    }
}

impl Engine {
    /// Native-side access for the parity harness and the crate's own tests.
    pub fn world(&self) -> &World {
        &self.world
    }

    pub fn world_mut(&mut self) -> &mut World {
        &mut self.world
    }

    fn restore_state(&mut self, state: &Json) -> EngineResult<()> {
        let object = state
            .as_object()
            .ok_or_else(|| EngineError::new("Saved state must be an object."))?;

        let seed = object
            .get("seed")
            .and_then(Json::as_u64)
            .ok_or_else(|| EngineError::new("Saved state needs a seed."))?
            as u32;
        let rng_state = object
            .get("rng_state")
            .and_then(Json::as_u64)
            .ok_or_else(|| EngineError::new("Saved state needs an rng state."))?
            as u32;

        let clock = object
            .get("clock")
            .and_then(Json::as_object)
            .ok_or_else(|| EngineError::new("Saved state needs a clock."))?;
        let tick = clock
            .get("tick")
            .and_then(Json::as_i64)
            .filter(|tick| *tick >= 0)
            .ok_or_else(|| EngineError::new("Saved clock needs a non-negative tick."))?;
        let speed = clock
            .get("speed")
            .and_then(Json::as_f64)
            .filter(|speed| speed.is_finite() && *speed > 0.0)
            .ok_or_else(|| EngineError::new("Saved clock needs a positive speed."))?;
        let paused = clock.get("paused").and_then(Json::as_bool).unwrap_or(false);

        let graph = object
            .get("graph")
            .and_then(Json::as_object)
            .ok_or_else(|| EngineError::new("Saved state needs a graph."))?;
        let nodes = graph
            .get("nodes")
            .and_then(Json::as_array)
            .ok_or_else(|| EngineError::new("Saved graph needs nodes."))?;
        let edges = graph
            .get("edges")
            .and_then(Json::as_array)
            .ok_or_else(|| EngineError::new("Saved graph needs edges."))?;

        let registry = object
            .get("registry")
            .and_then(Json::as_object)
            .ok_or_else(|| EngineError::new("Saved state needs a registry."))?;
        let tier = registry
            .get("tier")
            .and_then(Json::as_i64)
            .filter(|tier| *tier >= 0)
            .ok_or_else(|| EngineError::new("Saved registry needs a tier."))?;
        let log: EngineResult<Vec<DispatchLogEntry>> = registry
            .get("log")
            .and_then(Json::as_array)
            .ok_or_else(|| EngineError::new("Saved registry needs a log."))?
            .iter()
            .map(DispatchLogEntry::from_json)
            .collect();
        let log = log?;

        let actions = registry
            .get("actions")
            .cloned()
            .unwrap_or_else(|| Json::Array(Vec::new()));
        let labels = registry
            .get("kind_labels")
            .cloned()
            .unwrap_or_else(|| Json::Object(serde_json::Map::new()));

        // Build the replacement world completely before touching this one: a
        // half-restored engine is worse than a refused restore.
        let mut world = World::new(seed);

        for node in nodes {
            let node = validate_node(node)?;
            world.graph.add_node(node)?;
        }

        for edge in edges {
            let edge = validate_edge(edge)?;
            world.graph.add_edge(edge)?;
        }

        world.register_actions(&json!({ "kind_labels": labels, "actions": actions }))?;
        world.registry.set_tier(tier)?;
        world.registry.restore_log(log);
        world.tickets.restore(
            object
                .get("tickets")
                .ok_or_else(|| EngineError::new("Saved state needs tickets."))?,
        )?;
        world.rng = Rng::from_parts(seed, rng_state);
        world.clock = SimClock::from_parts(tick, paused, speed);
        world.drain_events();

        self.world = world;
        Ok(())
    }
}
