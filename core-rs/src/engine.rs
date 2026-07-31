//! The boundary. One class, JSON in, JSON out, events returned.
//!
//! Nothing here may panic: every entry point parses defensively and answers
//! with `{ ok: false, reason }` instead. A panic across the wasm boundary
//! poisons the module for the rest of the session, which in a browser game
//! means the desktop stops responding mid-click - so malformed input is a
//! refusal, always, however malformed.

use serde_json::{json, Value as Json};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::actions::{parse_params, CheckpointBaseline, DispatchLogEntry, LogCheckpoint};
use crate::assertions::evaluate_json;
use crate::clock::SimClock;
use crate::error::{EngineError, EngineResult};
use crate::events::{events_to_json, EngineEvent};
use crate::graph::{node_to_json, Direction};
use crate::num::{is_safe_int, safe_int_at_least, safe_u32};
use crate::ops::Params;
use crate::refuse;
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

/// A key that has to be a string when it is there at all.
///
/// Absent, `null` and "the wrong type entirely" are three different things and
/// only the first two mean "not given". Reading `target: 42` as "no target" is
/// what let an aimed action run aimlessly - and a fixed-target action mutate
/// anyway - on a request that was plainly a mistake.
fn optional_str<'a>(request: &'a Json, key: &str, what: &str) -> EngineResult<Option<&'a str>> {
    match request.get(key) {
        None | Some(Json::Null) => Ok(None),
        Some(Json::String(text)) => Ok(Some(text)),
        Some(_) => refuse!("{what}"),
    }
}

fn required_str<'a>(request: &'a Json, key: &str, what: &str) -> EngineResult<&'a str> {
    optional_str(request, key, what)?.ok_or_else(|| EngineError::new(what))
}

/// A dispatch, read strictly: nothing here defaults, everything refuses.
struct DispatchRequest {
    action: String,
    actor: String,
    target: Option<String>,
    params: Params,
}

impl DispatchRequest {
    fn parse(request: &Json) -> EngineResult<Self> {
        if !request.is_object() {
            return refuse!("Dispatch must be an object.");
        }

        Ok(Self {
            action: required_str(request, "action", "Dispatch needs an \"action\" id.")?.to_owned(),
            actor: required_str(request, "actor", "Dispatch needs an \"actor\" node id.")?
                .to_owned(),
            target: optional_str(
                request,
                "target",
                "Dispatch \"target\" must be a node id or null.",
            )?
            .map(str::to_owned),
            params: parse_params(request.get("params"))?,
        })
    }
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
    /// Builds an engine on a seed.
    ///
    /// The seed arrives as a `Number`, so it is taken as one and checked here
    /// rather than declared `u32` and left to the glue: wasm-bindgen coerces,
    /// and coercion turns `Infinity` into 0, `1.5` into 1 and `2^32` into 0.
    /// A world seeded by one of those is a world nobody asked for, replayed
    /// against a save that says something else.
    #[wasm_bindgen(constructor)]
    pub fn new(seed: f64) -> Result<Engine, String> {
        if !is_safe_int(seed) || !(0.0..=f64::from(u32::MAX)).contains(&seed) {
            return Err("Engine seed must be an integer between 0 and 4294967295.".to_owned());
        }

        Ok(Self {
            world: World::new(seed as u32),
        })
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
        let request = match parse_json(payload).and_then(|request| DispatchRequest::parse(&request))
        {
            Ok(request) => request,
            Err(error) => return refusal_with_events(&mut self.world, error.message()),
        };

        let result = self.world.dispatch(
            &request.action,
            &request.actor,
            request.target.as_deref(),
            request.params,
        );
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

    // There is deliberately no `set_waiting` here. Parking a ticket's SLA is a
    // MECHANIC, not a setter: it costs a question actually put to the reporter
    // (`ticket.mark_asked`), and the whole CYA rule lives in the guards of the
    // `ticket.set_waiting` / `ticket.clear_waiting` actions. An export that
    // flipped the flag directly was a way around the rule the game is about.

    pub fn set_tier(&mut self, tier: f64) -> String {
        if !is_safe_int(tier) || tier < 0.0 {
            return refusal_with_events(
                &mut self.world,
                "Action tier must be a non-negative safe integer.",
            );
        }

        match self.world.registry.set_tier(tier as i64) {
            Ok(()) => ok_with_events(&mut self.world),
            Err(error) => refusal_with_events(&mut self.world, error.message()),
        }
    }

    pub fn tier(&self) -> f64 {
        self.world.registry.tier() as f64
    }

    /// Advances whole ticks, returning everything that happened on the way.
    pub fn advance(&mut self, ticks: f64) -> String {
        match self
            .world
            .clock
            .validate_advance(ticks)
            .and_then(|ticks| self.world.advance(ticks))
        {
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

    /// Draws a line under the log: this world, at this tick, becomes the
    /// baseline every later save is measured from.
    ///
    /// The day loop calls this at a day boundary, which is the one moment the
    /// history behind it is finished with - the day has been scored and paid.
    /// Answers with the baseline it set and how many entries it drained, so a
    /// caller can say what it cost.
    pub fn checkpoint(&mut self) -> String {
        let outcome = self.world.take_checkpoint();

        json!({
            "ok": true,
            "value": {
                "tick": outcome.tick,
                "hash": outcome.hash,
                "drained": outcome.drained,
            },
            "events": events_to_json(&self.world.drain_events()),
        })
        .to_string()
    }

    /// Read-only questions about the world: `{ kind, ... }` in, a value out.
    pub fn query(&self, payload: &str) -> String {
        match self.answer_query(payload) {
            Ok(answer) => answer,
            Err(error) => value_refusal(error.message()),
        }
    }

    fn answer_query(&self, payload: &str) -> EngineResult<String> {
        let request = parse_json(payload)?;
        let kind = required_str(&request, "kind", "Query needs a \"kind\".")?;
        let id = optional_str(&request, "id", "Query \"id\" must be a node id.")?;
        let field = optional_str(&request, "field", "Query \"field\" must be a field name.")?;

        Ok(match kind {
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
                // An absent field leaves the key off entirely: `null` is a
                // legitimate value and "missing" is a different answer.
                (Some(id), Some(field)) => match self.world.graph.get_field(id, field) {
                    Some(value) => value_result(value.to_json()),
                    None => json!({ "ok": true }).to_string(),
                },
                _ => value_refusal("get_field needs an \"id\" and a \"field\"."),
            },
            "nodes_of_kind" => match optional_str(
                &request,
                "node_kind",
                "Query \"node_kind\" must be a node kind.",
            )? {
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
                    return Ok(value_refusal("neighbors needs an \"id\"."));
                };
                let direction = Direction::parse(required_str(
                    &request,
                    "direction",
                    "neighbors needs a \"direction\".",
                )?)?;
                // A wrongly typed edge kind used to read as "no filter", which
                // answers a narrow question with every neighbour there is.
                let edge_kind = optional_str(
                    &request,
                    "edge_kind",
                    "Query \"edge_kind\" must be an edge kind.",
                )?;

                value_result(Json::Array(
                    self.world
                        .graph
                        .neighbors(id, direction, edge_kind)
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
            // What the log is measured from, and how much of it there is: the
            // two numbers a save system needs to decide whether to drain. The
            // baseline WORLD is a separate question with a much bigger answer,
            // and it has its own query.
            "checkpoint" => {
                let mut answer = self.world.registry.checkpoint().summary_json();

                if let Json::Object(object) = &mut answer {
                    object.insert("entries".to_owned(), json!(self.world.registry.log().len()));
                }

                value_result(answer)
            }
            // The world the log is measured from, as a state a restore takes.
            //
            // This is what makes one save file replayable on its own: restore
            // the answer, apply the save's log, and arrive at the save. The
            // verb set comes from the save rather than from the baseline
            // because actions are the BUILD's, not the moment's, and nothing
            // in a dispatch log registers one.
            "checkpoint_baseline" => match self.world.registry.checkpoint().baseline.as_ref() {
                Some(baseline) => value_result(self.baseline_state(baseline)),
                None => value_refusal(
                    "This world has never been checkpointed, so its log is still its whole \
                     history and its baseline is where the world began.",
                ),
            },
            other => value_refusal(&format!("Query kind \"{other}\" is not known.")),
        })
    }

    /// The save seam: everything needed to stand this engine up again.
    ///
    /// The world half is written by `World::baseline` - the same code that
    /// captures a checkpoint - so a saved world and a saved BASELINE cannot
    /// drift into two different ideas of what a serialized graph looks like.
    pub fn serialize(&self) -> String {
        let current = self.world.baseline();

        json!({
            "version": crate::ENGINE_VERSION,
            "seed": self.world.rng.seed(),
            "rng_state": current.rng_state,
            "clock": current.clock,
            "graph": current.graph,
            "registry": {
                "tier": self.world.registry.tier(),
                "kind_labels": self.world.registry.kind_labels,
                "actions": self.world.registry.definitions(),
                // The log SINCE the checkpoint, the checkpoint it is since, and
                // the world that checkpoint names. Any half without the others
                // is a history nobody can place, or one nobody can replay.
                "checkpoint": self.world.registry.checkpoint().to_json(),
                "log": self
                    .world
                    .registry
                    .log()
                    .iter()
                    .map(DispatchLogEntry::to_json)
                    .collect::<Vec<Json>>(),
            },
            "tickets": current.tickets,
        })
        .to_string()
    }

    /// A checkpoint baseline, dressed as a saved state a restore will take.
    ///
    /// Its own checkpoint is itself: the baseline world was drained at that
    /// tick, its log is empty, and saying so is what makes the answer a save
    /// this engine would have written rather than a special case it has to
    /// know about on the way back in.
    fn baseline_state(&self, baseline: &CheckpointBaseline) -> Json {
        json!({
            "version": crate::ENGINE_VERSION,
            "seed": self.world.rng.seed(),
            "rng_state": baseline.rng_state,
            "clock": baseline.clock,
            "graph": baseline.graph,
            "registry": {
                "tier": self.world.registry.tier(),
                "kind_labels": self.world.registry.kind_labels,
                "actions": self.world.registry.definitions(),
                "checkpoint": self.world.registry.checkpoint().to_json(),
                "log": [],
            },
            "tickets": baseline.tickets,
        })
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

    /// Rebuilds this engine from a save, or refuses and stays exactly as it is.
    ///
    /// Everything here is required and everything is checked, including how the
    /// parts agree with each other: a save is a claim about one coherent world,
    /// and a restore that accepts a contradictory one produces a world the
    /// engine's own rules say cannot exist - a ticket parked with its SLA
    /// running, a record for a ticket that is not in the graph. Refusing costs
    /// the player a load; accepting costs them a session that misbehaves later
    /// for reasons nothing can explain.
    fn restore_state(&mut self, state: &Json) -> EngineResult<()> {
        let object = state
            .as_object()
            .ok_or_else(|| EngineError::new("Saved state must be an object."))?;

        // Exact match, not "at least": a save from another engine version is a
        // save whose meaning this code does not know, and guessing at it is how
        // a forward-incompatible field becomes a silent default.
        let version = object
            .get("version")
            .and_then(Json::as_str)
            .ok_or_else(|| EngineError::new("Saved state needs a version."))?;

        if version != crate::ENGINE_VERSION {
            let current = crate::ENGINE_VERSION;
            return refuse!("Saved state is version \"{version}\"; this engine is \"{current}\".");
        }

        let seed = object
            .get("seed")
            .and_then(safe_u32)
            .ok_or_else(|| EngineError::new("Saved state needs a seed within the 32-bit range."))?;
        let rng_state = object.get("rng_state").and_then(safe_u32).ok_or_else(|| {
            EngineError::new("Saved state needs an rng state within the 32-bit range.")
        })?;

        let clock = object
            .get("clock")
            .and_then(Json::as_object)
            .ok_or_else(|| EngineError::new("Saved state needs a clock."))?;
        let tick = clock
            .get("tick")
            .and_then(|tick| safe_int_at_least(tick, 0))
            .ok_or_else(|| {
                EngineError::new("Saved clock needs a tick inside the safe integer range.")
            })?;
        let speed = clock
            .get("speed")
            .and_then(Json::as_f64)
            .filter(|speed| speed.is_finite() && *speed > 0.0)
            .ok_or_else(|| EngineError::new("Saved clock needs a positive speed."))?;
        let paused = clock
            .get("paused")
            .and_then(Json::as_bool)
            .ok_or_else(|| EngineError::new("Saved clock needs a boolean paused flag."))?;

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
            .and_then(|tier| safe_int_at_least(tier, 0))
            .ok_or_else(|| EngineError::new("Saved registry needs a tier."))?;
        let log: EngineResult<Vec<DispatchLogEntry>> = registry
            .get("log")
            .and_then(Json::as_array)
            .ok_or_else(|| EngineError::new("Saved registry needs a log."))?
            .iter()
            .map(DispatchLogEntry::from_json)
            .collect();
        let log = log?;
        let checkpoint = LogCheckpoint::from_json(
            registry
                .get("checkpoint")
                .ok_or_else(|| EngineError::new("Saved registry needs its checkpoint."))?,
        )?;

        // A baseline in the future is a save that has drained history it has
        // not lived through yet.
        if checkpoint.tick > tick {
            let baseline = checkpoint.tick;
            return refuse!(
                "Saved checkpoint is at tick {baseline}, after the saved clock {tick}."
            );
        }

        let actions = registry
            .get("actions")
            .cloned()
            .ok_or_else(|| EngineError::new("Saved registry needs its actions."))?;
        let labels = registry
            .get("kind_labels")
            .cloned()
            .ok_or_else(|| EngineError::new("Saved registry needs its kind labels."))?;
        let tickets = object
            .get("tickets")
            .ok_or_else(|| EngineError::new("Saved state needs tickets."))?;

        // Build the replacement world completely before touching this one: a
        // half-restored engine is worse than a refused restore.
        let mut world = World::new(seed);

        for node in nodes {
            let node = validate_node(node)?;
            // `add_node` refuses a duplicate, so a save naming one node twice
            // cannot restore as whichever copy came last.
            world.graph.add_node(node)?;
        }

        for edge in edges {
            let edge = validate_edge(edge)?;
            world.graph.add_edge(edge)?;
        }

        world.register_actions(&json!({ "kind_labels": labels, "actions": actions }))?;
        world.registry.set_tier(tier)?;
        world.registry.restore_log(log, checkpoint)?;
        world.tickets.restore(tickets)?;
        check_ticket_coherence(&world)?;
        world.rng = Rng::from_parts(seed, rng_state);
        world.clock = SimClock::from_parts(tick, paused, speed);
        world.drain_events();

        // The world the shell is looking at has just been replaced wholesale.
        // Saying so is the difference between a load that repaints and a load
        // that shows the previous session until something unrelated moves.
        world.push_event(EngineEvent::WorldRestored { tick });

        self.world = world;
        Ok(())
    }
}

/// Whether the ticket records and the ticket nodes tell the same story.
///
/// The record holds the SLA bookkeeping and the node holds what the player
/// reads; a save where they disagree is a save that restores a ticket the
/// engine can never move - parked according to one half, running according to
/// the other.
fn check_ticket_coherence(world: &World) -> EngineResult<()> {
    for (id, record) in &world.tickets.records {
        let Some(node) = world.graph.get_node(id) else {
            return refuse!("Saved ticket \"{id}\" has no ticket node in the graph.");
        };

        if node.kind != "ticket" {
            let kind = &node.kind;
            return refuse!("Saved ticket \"{id}\" is registered against a {kind} node.");
        }

        let breached = node
            .fields
            .get("breached")
            .is_some_and(FieldValue::is_true);

        if breached != record.breached {
            return refuse!("Saved ticket \"{id}\" and its node disagree about the breach.");
        }

        let expected = if record.resolved {
            "resolved"
        } else if record.breached {
            "breached"
        } else if record.waiting {
            "waiting_on_user"
        } else {
            "open"
        };
        let state = node
            .fields
            .get("state")
            .and_then(FieldValue::as_str)
            .unwrap_or_default();

        if state != expected {
            return refuse!(
                "Saved ticket \"{id}\" is \"{state}\" in the graph and \"{expected}\" on its record."
            );
        }
    }

    Ok(())
}
