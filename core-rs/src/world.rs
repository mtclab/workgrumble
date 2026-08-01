//! The world: graph, clock, rng, tickets and registry, and the ordering
//! between them.
//!
//! Everything that mutates goes through here, because everything that mutates
//! has consequences: a graph change re-checks every open ticket, a tick
//! extends the SLA of every parked one, and both of those emit events that
//! have to come out in the order the TypeScript bus fired them.

use std::collections::BTreeMap;

use serde_json::{json, Value as Json};

use crate::actions::{
    ActionDef, ActionRegistry, CheckpointBaseline, DispatchLogEntry, DispatchResult,
};
use crate::assertions::evaluate;
use crate::clock::SimClock;
use crate::error::{EngineError, EngineResult};
use crate::events::{EngineEvent, GraphMutation};
use crate::graph::{node_to_json, EntityGraph};
use crate::num::MAX_SAFE_INT;
use crate::ops::{
    evaluate_pred, field_lines, render_template, ArithOp, Clamp, EvalContext, FieldName, NodeRef,
    Op, Params, Pred, ValueExpr,
};
use crate::refuse;
use crate::rng::Rng;
use crate::schema::Edge;
use crate::tickets::{SetupMutation, TicketDef, TicketEngine, TicketRecord};
use crate::value::FieldValue;

pub struct World {
    pub graph: EntityGraph,
    pub clock: SimClock,
    pub rng: Rng,
    pub tickets: TicketEngine,
    pub registry: ActionRegistry,
    events: Vec<EngineEvent>,
    /// How many transactions are open. The journals belong to the outermost.
    depth: usize,
}

/// What a checkpoint moved: the baseline it set, and how much log it drained.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CheckpointOutcome {
    pub tick: i64,
    pub hash: String,
    pub drained: usize,
}

/// Where a call started, in every sense that a refusal has to be able to
/// return to.
///
/// An action is one thing the player did, so it either happened or it did not:
/// a second op refusing after the first resolved a ticket and rolled the dice
/// used to leave `{ ok: false }` on top of a world that had moved.
///
/// Four of the six halves of that are O(1) and are simply kept here - the rng
/// is two words, the clock is two, and the dispatch log and the event stream
/// are append-only, so a length is a complete undo record for them. The graph
/// and the ticket records are the two that are not, and they are handled by
/// their own undo journals: this holds a MARK into each, and a rollback walks
/// the entries recorded past that mark backwards.
///
/// The mark is also what makes nesting free. A transaction inside a
/// transaction marks a later place in the same journal; unwinding to it leaves
/// the outer one's entries exactly where they were.
///
/// WHY A JOURNAL AND NOT `Rc` NODES. The alternative was copy-on-write: hold
/// the nodes behind `Rc` so that copying the graph copies pointers instead of
/// fields. That makes the copy cheaper by a constant and leaves it O(nodes) -
/// the BTreeMap itself still has to be rebuilt, once per dispatch, forever,
/// and every write still has to `Rc::make_mut` its node. The journal makes the
/// cost proportional to what the call TOUCHED instead, which for one action is
/// a handful of fields and does not move when the estate doubles. It also
/// leaves the data structures as they are: a `Node` is still a `Node`, and
/// nothing outside this file has to learn about a smart pointer.
///
/// The registry's verb set is deliberately absent: nothing that runs inside a
/// transaction registers an action or changes tier, and `register_actions`
/// buys its atomicity by checking every definition BEFORE installing any.
///
/// Not to be confused with the log checkpoint (`actions::LogCheckpoint`): this
/// one is a transaction's undo record and lives for one call, that one is the
/// baseline a save is measured from and outlives the session.
struct Savepoint {
    graph_mark: usize,
    ticket_mark: usize,
    rng: Rng,
    clock: SimClock,
    log_len: usize,
    events_len: usize,
}

impl World {
    pub fn new(seed: u32) -> Self {
        Self {
            graph: EntityGraph::new(),
            clock: SimClock::new(),
            rng: Rng::new(seed),
            tickets: TicketEngine::new(),
            registry: ActionRegistry::new(1),
            events: Vec::new(),
            depth: 0,
        }
    }

    /// Hands over everything that happened since the last call. Callers get
    /// one ordered stream instead of a callback per mutation.
    pub fn drain_events(&mut self) -> Vec<EngineEvent> {
        std::mem::take(&mut self.events)
    }

    /// Announces something the world itself did not cause - a restore. Every
    /// other event comes from a mutation and is pushed where it happens.
    pub fn push_event(&mut self, event: EngineEvent) {
        self.events.push(event);
    }

    // -- atomicity ---------------------------------------------------------

    fn savepoint(&mut self) -> Savepoint {
        self.depth += 1;
        self.graph.begin_journal();
        self.tickets.begin_journal();

        Savepoint {
            graph_mark: self.graph.journal_mark(),
            ticket_mark: self.tickets.journal_mark(),
            rng: self.rng.clone(),
            clock: self.clock.clone(),
            log_len: self.registry.log().len(),
            events_len: self.events.len(),
        }
    }

    /// Closes a transaction. The journals are only thrown away when the
    /// OUTERMOST one closes: until then an enclosing call may still need them.
    fn release(&mut self) {
        self.depth = self.depth.saturating_sub(1);

        if self.depth == 0 {
            self.graph.end_journal();
            self.tickets.end_journal();
        }
    }

    fn rollback(&mut self, savepoint: Savepoint) {
        self.graph.rollback_to(savepoint.graph_mark);
        self.tickets.rollback_to(savepoint.ticket_mark);
        self.rng = savepoint.rng;
        self.clock = savepoint.clock;
        self.registry.truncate_log(savepoint.log_len);
        self.events.truncate(savepoint.events_len);
        self.release();
    }

    /// Runs `body` all the way or not at all. A refusal leaves the world, the
    /// rng stream, the clock, the log and the event stream exactly as they were
    /// when the call started.
    fn transact<Value>(
        &mut self,
        body: impl FnOnce(&mut Self) -> EngineResult<Value>,
    ) -> EngineResult<Value> {
        let savepoint = self.savepoint();

        match body(self) {
            Ok(value) => {
                self.release();
                Ok(value)
            }
            Err(error) => {
                self.rollback(savepoint);
                Err(error)
            }
        }
    }

    // -- the log's baseline --------------------------------------------------

    /// Takes a checkpoint here: the world as it stands becomes the baseline the
    /// dispatch log is measured from, and everything the log had recorded up to
    /// this moment is drained.
    ///
    /// Nothing about the world changes - not the graph, not the clock, not one
    /// die - so the hash this reports is the hash it had a moment ago. What
    /// changes is what a save has to carry: the history since here, instead of
    /// the history since the first day of the career.
    pub fn take_checkpoint(&mut self) -> CheckpointOutcome {
        let tick = self.clock.now();
        let hash = self.graph.snapshot_hash();
        let baseline = self.baseline();
        let drained = self.registry.set_checkpoint(tick, hash.clone(), baseline);

        CheckpointOutcome {
            tick,
            hash,
            drained,
        }
    }

    /// The world as it stands, in the shape a restore reads it back in.
    ///
    /// Everything a replay needs and nothing it does not: the verb set is the
    /// build's rather than the moment's, and the log at a checkpoint is empty
    /// by construction. Written as the same JSON `serialize` writes so the two
    /// cannot drift into disagreeing about what a saved graph looks like.
    pub fn baseline(&self) -> CheckpointBaseline {
        CheckpointBaseline {
            rng_state: self.rng.state(),
            clock: json!({
                "tick": self.clock.now(),
                // Part of the clock, so part of the baseline: a log replayed
                // from a checkpoint taken overnight has to start with the same
                // answer to "is anybody at the desk" as the world it replaces.
                "sla_running": self.clock.sla_runs(),
            }),
            graph: json!({
                "nodes": self
                    .graph
                    .all_nodes()
                    .into_iter()
                    .map(node_to_json)
                    .collect::<Vec<Json>>(),
                "edges": self
                    .graph
                    .edges()
                    .iter()
                    .map(|edge| json!({ "from": edge.from, "to": edge.to, "kind": edge.kind }))
                    .collect::<Vec<Json>>(),
            }),
            tickets: self.tickets.to_json(),
        }
    }

    // -- mutations ---------------------------------------------------------
    //
    // Each one records its event and then lets every ticket look at the world
    // again, which is exactly what the `graph:mutated` subscription did.

    fn record(&mut self, mutation: GraphMutation) -> EngineResult<()> {
        self.events.push(EngineEvent::GraphMutated(mutation));
        self.check_all_tickets()
    }

    pub fn add_node_json(&mut self, node: &Json) -> EngineResult<()> {
        let mutation = self.graph.add_node_json(node)?;
        self.record(mutation)
    }

    pub fn set_field(&mut self, id: &str, field: &str, value: FieldValue) -> EngineResult<()> {
        let mutation = self.graph.set_field(id, field, value)?;
        self.record(mutation)
    }

    pub fn clear_field(&mut self, id: &str, field: &str) -> EngineResult<()> {
        match self.graph.clear_field(id, field)? {
            Some(mutation) => self.record(mutation),
            None => Ok(()),
        }
    }

    pub fn remove_node(&mut self, id: &str) -> EngineResult<()> {
        let mutation = self.graph.remove_node(id)?;
        self.record(mutation)
    }

    pub fn add_edge(&mut self, edge: Edge) -> EngineResult<()> {
        let mutation = self.graph.add_edge(edge)?;
        self.record(mutation)
    }

    pub fn remove_edge(&mut self, edge: Edge) -> EngineResult<()> {
        let mutation = self.graph.remove_edge(edge)?;
        self.record(mutation)
    }

    // -- world construction ------------------------------------------------

    pub fn apply_setup(&mut self, ops: &Json) -> EngineResult<()> {
        let ops = ops
            .as_array()
            .ok_or_else(|| EngineError::new("Setup must be an array of mutations."))?;
        let parsed: EngineResult<Vec<SetupMutation>> =
            ops.iter().map(SetupMutation::parse).collect();
        let parsed = parsed?;

        // Half a seeded world is not a world. The eighth mutation refusing
        // must not leave the first seven standing.
        self.transact(|world| {
            for mutation in &parsed {
                world.apply_setup_mutation(mutation)?;
            }

            Ok(())
        })
    }

    fn apply_setup_mutation(&mut self, mutation: &SetupMutation) -> EngineResult<()> {
        match mutation {
            SetupMutation::AddNode(node) => {
                let mutation = self.graph.add_node(node.clone())?;
                self.record(mutation)
            }
            SetupMutation::SetField { id, field, value } => {
                self.set_field(id, field, value.clone())
            }
            SetupMutation::AddEdge(edge) => self.add_edge(edge.clone()),
            // Construction says what the world IS, not what to do to it. A
            // ticket whose setup takes an edge away is describing a fault -
            // "this account is not in that group" - and it has to describe it
            // just as truthfully when a player got there first. Refusing left
            // a summoned ticket that threw as it spawned, in front of a player,
            // because they had already tidied the group by hand.
            //
            // The op language's own `remove_edge` stays strict: an ACTION that
            // takes away an edge nobody had is a refusal somebody should read.
            SetupMutation::RemoveEdge(edge) => {
                if self.graph.has_edge(&edge.from, &edge.to, &edge.kind) {
                    self.remove_edge(edge.clone())
                } else {
                    Ok(())
                }
            }
        }
    }

    pub fn register_actions(&mut self, payload: &Json) -> EngineResult<()> {
        let (labels, definitions) = match payload {
            Json::Array(definitions) => (None, definitions.clone()),
            Json::Object(object) => {
                let definitions = object
                    .get("actions")
                    .and_then(Json::as_array)
                    .ok_or_else(|| EngineError::new("Action payload needs an \"actions\" array."))?
                    .clone();
                (object.get("kind_labels").cloned(), definitions)
            }
            _ => return refuse!("Action payload must be an array or an object."),
        };

        // Read every label before writing any, for the same reason the
        // definitions are all parsed first: a payload is one payload.
        let labels = match labels {
            None | Some(Json::Null) => BTreeMap::new(),
            Some(Json::Object(labels)) => {
                let mut parsed = BTreeMap::new();

                for (kind, label) in labels {
                    let label = label
                        .as_str()
                        .ok_or_else(|| EngineError::new("Kind labels must be strings."))?;
                    parsed.insert(kind.clone(), label.to_owned());
                }

                parsed
            }
            Some(_) => return refuse!("Action payload \"kind_labels\" must be an object."),
        };

        // Parse them all before registering any: a payload with one bad
        // definition in it must not leave half a verb set installed.
        let parsed: EngineResult<Vec<ActionDef>> =
            definitions.iter().map(ActionDef::parse).collect();
        let parsed = parsed?;
        let mut seen: Vec<&str> = Vec::new();

        for definition in &parsed {
            self.registry.can_register(&definition.id)?;

            if seen.contains(&definition.id.as_str()) {
                let id = &definition.id;
                return refuse!("Action \"{id}\" is registered twice in one payload.");
            }

            seen.push(&definition.id);
        }

        // Nothing below can fail, which is what makes the whole payload atomic
        // without a checkpoint.
        self.registry.kind_labels.extend(labels);

        for definition in parsed {
            self.registry.register(definition)?;
        }

        Ok(())
    }

    // -- dispatch ----------------------------------------------------------

    pub fn dispatch(
        &mut self,
        id: &str,
        actor: &str,
        target: Option<&str>,
        params: Params,
    ) -> DispatchResult {
        let tick = self.clock.now();

        let Some(definition) = self.registry.get(id).cloned() else {
            return self.reject(
                tick,
                id,
                actor,
                target,
                params,
                format!("Unknown action \"{id}\"."),
            );
        };

        if definition.tier > self.registry.tier() {
            let tier = definition.tier;
            return self.reject(
                tick,
                id,
                actor,
                target,
                params,
                format!("Action \"{id}\" requires tier {tier}."),
            );
        }

        if let Some(reason) = self.refusal(&definition, actor, target, &params) {
            return self.reject(tick, id, actor, target, params, reason);
        }

        // Every op or none. Validation passing and the ops still not running is
        // a broken definition rather than a player mistake, and the world it
        // half-changed on the way out is the worst of both: a refusal the
        // player reads and a mutation they did not ask for.
        if let Err(error) =
            self.transact(|world| world.apply_ops(&definition.apply, actor, target, &params))
        {
            return self.reject(tick, id, actor, target, params, error.into_message());
        }

        self.registry.push_log(DispatchLogEntry {
            tick,
            id: id.to_owned(),
            actor: actor.to_owned(),
            target: target.map(str::to_owned),
            params,
            ok: true,
            reason: None,
        });
        DispatchResult::Ok
    }

    /// The first guard that fires, rendered into the sentence the player sees.
    fn refusal(
        &self,
        definition: &ActionDef,
        actor: &str,
        target: Option<&str>,
        params: &Params,
    ) -> Option<String> {
        let mut context = EvalContext {
            graph: &self.graph,
            actor,
            target,
            params,
            now: self.clock.now(),
            tickets: &self.tickets,
            binds: BTreeMap::new(),
        };

        for guard in &definition.validate {
            if evaluate_pred(&mut context, &guard.when) {
                return Some(render_template(
                    &guard.reason,
                    &context,
                    &self.registry.kind_labels,
                ));
            }
        }

        None
    }

    fn reject(
        &mut self,
        tick: i64,
        id: &str,
        actor: &str,
        target: Option<&str>,
        params: Params,
        reason: String,
    ) -> DispatchResult {
        self.registry.push_log(DispatchLogEntry {
            tick,
            id: id.to_owned(),
            actor: actor.to_owned(),
            target: target.map(str::to_owned),
            params,
            ok: false,
            reason: Some(reason.clone()),
        });
        DispatchResult::Refused(reason)
    }

    fn predicate_holds(
        &self,
        predicate: &Pred,
        actor: &str,
        target: Option<&str>,
        params: &Params,
    ) -> bool {
        let mut context = EvalContext {
            graph: &self.graph,
            actor,
            target,
            params,
            now: self.clock.now(),
            tickets: &self.tickets,
            binds: BTreeMap::new(),
        };

        evaluate_pred(&mut context, predicate)
    }

    fn resolve_ref(
        &self,
        reference: &NodeRef,
        actor: &str,
        target: Option<&str>,
        params: &Params,
    ) -> EngineResult<String> {
        let context = EvalContext {
            graph: &self.graph,
            actor,
            target,
            params,
            now: self.clock.now(),
            tickets: &self.tickets,
            binds: BTreeMap::new(),
        };

        context
            .resolve_id(reference)
            .ok_or_else(|| EngineError::new("Action applied without a node the op could aim at."))
    }

    fn field_name(&self, name: &FieldName, params: &Params) -> EngineResult<String> {
        match name {
            FieldName::Fixed(field) => Ok(field.clone()),
            FieldName::Param(param) => params
                .get(param)
                .and_then(FieldValue::as_str)
                .filter(|field| !field.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| {
                    EngineError::new(format!("Parameter \"{param}\" is not a field name."))
                }),
        }
    }

    /// Computes an op's value. The rng lives here rather than in `ops.rs`
    /// because only `apply` may consume it - a validator that rolled dice
    /// would make replay a fiction - and so does arithmetic, because it is the
    /// one value form that can fail: a field that is not a whole number is a
    /// refusal, not a `null` quietly written over a meter.
    fn value(
        &mut self,
        value: &ValueExpr,
        actor: &str,
        target: Option<&str>,
        params: &Params,
    ) -> EngineResult<FieldValue> {
        match value {
            ValueExpr::RngPick(choices) => {
                Ok(self.rng.pick(choices).cloned().unwrap_or(FieldValue::Null))
            }
            ValueExpr::RngInt { min, max } => Ok(FieldValue::Num(self.rng.int(*min, *max) as f64)),
            ValueExpr::Eq(left, right) => {
                let left = self.value(left, actor, target, params)?;
                let right = self.value(right, actor, target, params)?;
                Ok(FieldValue::Bool(left.same_value(&right)))
            }
            ValueExpr::AppendLine { node, field, value } => {
                let addition = self.value(value, actor, target, params)?;
                let existing = self
                    .resolve_ref(node, actor, target, params)
                    .ok()
                    .map(|id| field_lines(self.graph.get_field(&id, field)))
                    .unwrap_or_default();
                let mut lines = existing;

                if let Some(text) = addition.as_str() {
                    lines.push(text.to_owned());
                }

                Ok(FieldValue::Str(lines.join("\n")))
            }
            ValueExpr::Arith {
                op,
                node,
                field,
                by,
                clamp,
            } => self.arithmetic(*op, node, field, by, *clamp, actor, target, params),
            pure => {
                let context = EvalContext {
                    graph: &self.graph,
                    actor,
                    target,
                    params,
                    now: self.clock.now(),
                    tickets: &self.tickets,
                    binds: BTreeMap::new(),
                };
                Ok(crate::ops::eval_value(&context, pure))
            }
        }
    }

    /// Moves a field by a whole number and holds the answer inside its range.
    ///
    /// Every step of it can be a refusal, and each one is a different mistake
    /// worth naming: a meter that was never seeded, an operand that arrived as
    /// text, a total the browser could not read back. The transaction around
    /// the dispatch puts the world back, so a refusal here leaves nothing
    /// half-added - including a die rolled for an operand that was then thrown
    /// away.
    #[allow(clippy::too_many_arguments)]
    fn arithmetic(
        &mut self,
        op: ArithOp,
        node: &NodeRef,
        field: &str,
        by: &ValueExpr,
        clamp: Clamp,
        actor: &str,
        target: Option<&str>,
        params: &Params,
    ) -> EngineResult<FieldValue> {
        let id = self.resolve_ref(node, actor, target, params)?;
        let base = self
            .graph
            .get_field(&id, field)
            .and_then(FieldValue::as_safe_int)
            .ok_or_else(|| {
                EngineError::new(format!(
                    "Field \"{field}\" on \"{id}\" is not a whole number, so there is nothing \
                     here to move."
                ))
            })?;
        let operand = self
            .value(by, actor, target, params)?
            .as_safe_int()
            .ok_or_else(|| {
                EngineError::new(format!(
                    "Field \"{field}\" on \"{id}\" can only be moved by a whole number."
                ))
            })?;
        let moved = match op {
            ArithOp::Add => base.checked_add(operand),
            ArithOp::Sub => base.checked_sub(operand),
        }
        // Ranged rather than `abs()`: the operands are both safe integers so
        // this cannot be reached, and `i64::MIN.abs()` panics - a boundary
        // that can panic is a boundary that can poison the module.
        .filter(|moved| (-MAX_SAFE_INT..=MAX_SAFE_INT).contains(moved))
        .ok_or_else(|| {
            EngineError::new(format!(
                "Moving \"{field}\" on \"{id}\" leaves the range a whole number can be read \
                 back from."
            ))
        })?;

        Ok(FieldValue::Num(clamp.apply(moved) as f64))
    }

    fn apply_ops(
        &mut self,
        ops: &[Op],
        actor: &str,
        target: Option<&str>,
        params: &Params,
    ) -> EngineResult<()> {
        for op in ops {
            self.apply_op(op, actor, target, params)?;
        }

        Ok(())
    }

    fn apply_op(
        &mut self,
        op: &Op,
        actor: &str,
        target: Option<&str>,
        params: &Params,
    ) -> EngineResult<()> {
        match op {
            Op::SetField { node, field, value } => {
                let id = self.resolve_ref(node, actor, target, params)?;
                let field = self.field_name(field, params)?;
                let value = self.value(value, actor, target, params)?;
                self.set_field(&id, &field, value)
            }
            Op::ClearField { node, field } => {
                let id = self.resolve_ref(node, actor, target, params)?;
                let field = self.field_name(field, params)?;
                self.clear_field(&id, &field)
            }
            Op::AddEdge { from, to, kind } => {
                let edge = self.edge(from, to, kind, actor, target, params)?;
                self.add_edge(edge)
            }
            Op::RemoveEdge { from, to, kind } => {
                let edge = self.edge(from, to, kind, actor, target, params)?;
                self.remove_edge(edge)
            }
            Op::RemoveNode { node } => {
                let id = self.resolve_ref(node, actor, target, params)?;
                self.remove_node(&id)
            }
            Op::SetWaiting { node, waiting } => {
                let id = self.resolve_ref(node, actor, target, params)?;
                self.set_waiting(&id, *waiting)
            }
            Op::SetSlaClock { running } => {
                self.clock.set_sla_running(*running);
                Ok(())
            }
            Op::When { cond, ops } => {
                if self.predicate_holds(cond, actor, target, params) {
                    self.apply_ops(ops, actor, target, params)?;
                }

                Ok(())
            }
        }
    }

    fn edge(
        &self,
        from: &NodeRef,
        to: &NodeRef,
        kind: &str,
        actor: &str,
        target: Option<&str>,
        params: &Params,
    ) -> EngineResult<Edge> {
        Ok(Edge {
            from: self.resolve_ref(from, actor, target, params)?,
            to: self.resolve_ref(to, actor, target, params)?,
            kind: kind.to_owned(),
        })
    }

    // -- clock -------------------------------------------------------------

    pub fn advance(&mut self, ticks: i64) -> EngineResult<()> {
        // A refused advance is an advance that did not happen: a caller told
        // that time did not move must not find that some of it did.
        self.transact(|world| {
            for _ in 0..ticks {
                if !world.clock.step() {
                    break;
                }

                world.handle_tick()?;
            }

            Ok(())
        })
    }

    /// A minute nobody could have worked in is a minute the SLA does not
    /// count, and there are exactly two of those: the ticket is parked on
    /// somebody else, or the desk is empty because the shift is not on.
    ///
    /// Either way the deadline moves out by one, ONCE, and the minute is
    /// attributed to whichever reason it was - `held_ticks` for a pause,
    /// `off_hours_ticks` for a night. Two counters rather than one because
    /// they are two different sentences on a screen, and one deadline
    /// extension rather than two because a parked ticket at midnight is not
    /// twice as excused as a parked ticket at noon.
    ///
    /// The counters are what a triage re-cut adds back. Re-cutting the
    /// deadline from the minute the ticket ARRIVED - which is what assigning a
    /// priority does - would otherwise hand back every pause and every night
    /// the ticket had earned, and "clear the hold, then triage it" is the
    /// order the app tells the player to work in.
    ///
    /// The invariant this keeps, for every unresolved ticket:
    /// `sla_deadline == spawned_at + target + held_ticks + off_hours_ticks`.
    fn handle_tick(&mut self) -> EngineResult<()> {
        let off_hours = !self.clock.sla_runs();

        for id in self.tickets.sorted_ids() {
            let Some(record) = self.tickets.get(&id) else {
                continue;
            };

            // A breached ticket's deadline has already done its work: moving
            // it would walk a red badge back towards green without the ticket
            // having been touched, and the breach itself is latched anyway.
            if record.resolved || record.breached {
                continue;
            }

            let waiting = record.waiting;

            if !waiting && !off_hours {
                continue;
            }

            let deadline = self
                .graph
                .get_field(&id, "sla_deadline")
                .and_then(FieldValue::as_safe_int)
                .ok_or_else(|| {
                    EngineError::new(format!("Ticket \"{id}\" has an invalid SLA deadline."))
                })?;

            let Some(extended) = deadline
                .checked_add(1)
                .filter(|deadline| *deadline <= MAX_SAFE_INT)
            else {
                return refuse!("Ticket \"{id}\" cannot have its SLA extended any further.");
            };

            // An absent counter is a ticket that has never been parked - or
            // never been carried overnight - which is the same claim as zero
            // and the one every ticket starts with.
            let counter = if waiting { "held_ticks" } else { "off_hours_ticks" };
            let counted = self
                .graph
                .get_field(&id, counter)
                .and_then(FieldValue::as_safe_int)
                .unwrap_or(0);
            let Some(counted) = counted.checked_add(1).filter(|held| *held <= MAX_SAFE_INT) else {
                return refuse!("Ticket \"{id}\" cannot have been waiting any longer.");
            };

            self.updating(&id, true);
            let result = self
                .set_field(&id, "sla_deadline", FieldValue::Num(extended as f64))
                .and_then(|()| self.set_field(&id, counter, FieldValue::Num(counted as f64)));
            self.updating(&id, false);
            result?;
        }

        self.check_all_tickets()
    }

    // -- tickets -----------------------------------------------------------

    pub fn spawn_ticket(&mut self, value: &Json) -> EngineResult<()> {
        let definition = TicketDef::parse(value)?;

        // A spawn runs the ticket's own setup mutations before it knows whether
        // the ticket can exist, so it is a transaction like any other.
        self.transact(|world| world.spawn_parsed_ticket(definition))
    }

    fn spawn_parsed_ticket(&mut self, definition: TicketDef) -> EngineResult<()> {
        let id = definition.id.clone();

        if self.tickets.contains(&id) || self.graph.get_node(&id).is_some() {
            return refuse!("Ticket \"{id}\" already exists.");
        }

        if definition.creates_node(&id) {
            return refuse!("Ticket setup must not create the ticket node itself.");
        }

        let Some(deadline) = self
            .clock
            .now()
            .checked_add(definition.sla_ticks)
            .filter(|deadline| *deadline <= MAX_SAFE_INT)
        else {
            return refuse!("Ticket SLA deadline exceeds the safe tick range.");
        };

        let reporter = definition.reporter.clone();
        let reporter_will_exist =
            self.graph.get_node(&reporter).is_some() || definition.creates_node(&reporter);

        if !reporter_will_exist {
            return refuse!("Reporter \"{reporter}\" does not exist.");
        }

        for mutation in definition.setup.clone() {
            self.apply_setup_mutation(&mutation)?;
        }

        if self.graph.get_node(&reporter).is_none() {
            return refuse!("Reporter \"{reporter}\" does not exist.");
        }

        let node = serde_json::json!({
            "id": id,
            "kind": "ticket",
            "fields": {
                "state": "open",
                "spawned_at": self.clock.now(),
                "sla_deadline": deadline,
                "breached": false,
            },
        });
        self.add_node_json(&node)?;

        self.tickets.insert(TicketRecord {
            def: definition,
            waiting: false,
            resolved: false,
            breached: false,
            updating: false,
        });
        self.events.push(EngineEvent::TicketSpawned(id.clone()));
        self.check_ticket(&id)
    }

    pub fn set_waiting(&mut self, id: &str, waiting: bool) -> EngineResult<()> {
        let Some(record) = self.tickets.get(id) else {
            return refuse!("Ticket \"{id}\" is not active.");
        };

        if record.resolved {
            return refuse!("Resolved ticket \"{id}\" cannot wait on a user.");
        }

        if record.breached {
            return refuse!("Breached ticket \"{id}\" cannot wait on a user.");
        }

        if record.waiting == waiting {
            return Ok(());
        }

        self.tickets.set_waiting(id, waiting);

        let state = if waiting { "waiting_on_user" } else { "open" };
        self.updating(id, true);
        let result = self.set_field(id, "state", FieldValue::Str(state.to_owned()));
        self.updating(id, false);
        result?;

        self.check_ticket(id)
    }

    pub fn ticket_state(&self, id: &str) -> Option<&FieldValue> {
        self.tickets
            .contains(id)
            .then(|| self.graph.get_field(id, "state"))
            .flatten()
    }

    pub fn was_breached(&self, id: &str) -> Option<bool> {
        self.tickets.get(id).map(|record| record.breached)
    }

    fn updating(&mut self, id: &str, updating: bool) {
        self.tickets.set_updating(id, updating);
    }

    fn check_all_tickets(&mut self) -> EngineResult<()> {
        for id in self.tickets.sorted_ids() {
            self.check_ticket(&id)?;
        }

        Ok(())
    }

    fn check_ticket(&mut self, id: &str) -> EngineResult<()> {
        let Some(record) = self.tickets.get(id) else {
            return Ok(());
        };

        if record.resolved || record.updating {
            return Ok(());
        }

        if self.graph.get_node(id).is_none() {
            return Ok(());
        }

        let rule = record.def.resolved_when.clone();

        if evaluate(&self.graph, &rule) {
            return self.resolve_ticket(id);
        }

        let deadline = self
            .graph
            .get_field(id, "sla_deadline")
            .and_then(FieldValue::as_f64);
        let Some(record) = self.tickets.get(id) else {
            return Ok(());
        };

        if !record.breached
            && !record.waiting
            && deadline.is_some_and(|deadline| self.clock.now() as f64 >= deadline)
        {
            return self.breach_ticket(id);
        }

        Ok(())
    }

    /// Closing one, and stamping the MINUTE it closed in.
    ///
    /// The stamp is the point. A ticket carries the tick it spawned on, so a
    /// day could say which tickets were its own - but "closed" and "breached"
    /// were read as the state the ticket is in NOW, so a Monday ticket that
    /// resolved on the Tuesday was counted against Monday, on a Monday whose
    /// pay had already been banked at Monday's 17:00 without it. The day
    /// disagreed with the money. Both events are one-off and the day's ledger
    /// is a repeating read, so the ledger has to be able to ask WHEN.
    fn resolve_ticket(&mut self, id: &str) -> EngineResult<()> {
        self.tickets.set_resolved(id);

        let now = self.clock.now();
        self.updating(id, true);
        let result = self
            .set_field(id, "state", FieldValue::Str("resolved".to_owned()))
            .and_then(|()| self.set_field(id, "resolved_at", FieldValue::Num(now as f64)));
        self.updating(id, false);
        result?;

        self.events.push(EngineEvent::TicketResolved(id.to_owned()));
        Ok(())
    }

    /// The breach latches on the record and on the node: a ticket closed late
    /// is still closed late, however it ends. The minute it went red latches
    /// with it, for the same reason a resolution's does.
    fn breach_ticket(&mut self, id: &str) -> EngineResult<()> {
        self.tickets.set_breached(id);

        let now = self.clock.now();
        self.updating(id, true);
        let result = self
            .set_field(id, "state", FieldValue::Str("breached".to_owned()))
            .and_then(|()| self.set_field(id, "breached", FieldValue::Bool(true)))
            .and_then(|()| self.set_field(id, "breached_at", FieldValue::Num(now as f64)));
        self.updating(id, false);
        result?;

        self.events.push(EngineEvent::TicketBreached(id.to_owned()));
        self.check_ticket(id)
    }
}
