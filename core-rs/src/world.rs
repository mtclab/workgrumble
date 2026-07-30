//! The world: graph, clock, rng, tickets and registry, and the ordering
//! between them.
//!
//! Everything that mutates goes through here, because everything that mutates
//! has consequences: a graph change re-checks every open ticket, a tick
//! extends the SLA of every parked one, and both of those emit events that
//! have to come out in the order the TypeScript bus fired them.

use std::collections::BTreeMap;

use serde_json::Value as Json;

use crate::actions::{ActionDef, ActionRegistry, DispatchLogEntry, DispatchResult};
use crate::assertions::evaluate;
use crate::clock::SimClock;
use crate::error::{EngineError, EngineResult};
use crate::events::{EngineEvent, GraphMutation};
use crate::graph::EntityGraph;
use crate::ops::{
    evaluate_pred, field_lines, render_template, EvalContext, FieldName, NodeRef, Op, Params, Pred,
    ValueExpr,
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
        }
    }

    /// Hands over everything that happened since the last call. Callers get
    /// one ordered stream instead of a callback per mutation.
    pub fn drain_events(&mut self) -> Vec<EngineEvent> {
        std::mem::take(&mut self.events)
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

        for mutation in parsed? {
            self.apply_setup_mutation(&mutation)?;
        }

        Ok(())
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
            SetupMutation::RemoveEdge(edge) => self.remove_edge(edge.clone()),
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

        if let Some(Json::Object(labels)) = labels {
            for (kind, label) in labels {
                let label = label
                    .as_str()
                    .ok_or_else(|| EngineError::new("Kind labels must be strings."))?;
                self.registry
                    .kind_labels
                    .insert(kind.clone(), label.to_owned());
            }
        }

        // Parse them all before registering any: a payload with one bad
        // definition in it must not leave half a verb set installed.
        let parsed: EngineResult<Vec<ActionDef>> =
            definitions.iter().map(ActionDef::parse).collect();

        for definition in parsed? {
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

        if let Err(error) = self.apply_ops(&definition.apply, actor, target, &params) {
            // Validation passed and the ops still could not run: that is a
            // broken definition, not a player mistake. It is still a refusal
            // rather than a crash, and it is logged as one.
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
    /// would make replay a fiction.
    fn value(
        &mut self,
        value: &ValueExpr,
        actor: &str,
        target: Option<&str>,
        params: &Params,
    ) -> FieldValue {
        match value {
            ValueExpr::RngPick(choices) => {
                self.rng.pick(choices).cloned().unwrap_or(FieldValue::Null)
            }
            ValueExpr::RngInt { min, max } => FieldValue::Num(self.rng.int(*min, *max) as f64),
            ValueExpr::Eq(left, right) => {
                let left = self.value(left, actor, target, params);
                let right = self.value(right, actor, target, params);
                FieldValue::Bool(left.same_value(&right))
            }
            ValueExpr::AppendLine { node, field, value } => {
                let addition = self.value(value, actor, target, params);
                let existing = self
                    .resolve_ref(node, actor, target, params)
                    .ok()
                    .map(|id| field_lines(self.graph.get_field(&id, field)))
                    .unwrap_or_default();
                let mut lines = existing;

                if let Some(text) = addition.as_str() {
                    lines.push(text.to_owned());
                }

                FieldValue::Str(lines.join("\n"))
            }
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
                crate::ops::eval_value(&context, pure)
            }
        }
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
                let value = self.value(value, actor, target, params);
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
        for _ in 0..ticks {
            if !self.clock.step() {
                break;
            }

            self.handle_tick()?;
        }

        Ok(())
    }

    /// A parked ticket's deadline moves with the clock: time spent waiting on
    /// the user is time the SLA does not count.
    fn handle_tick(&mut self) -> EngineResult<()> {
        for id in self.tickets.sorted_ids() {
            let Some(record) = self.tickets.records.get(&id) else {
                continue;
            };

            if record.resolved || !record.waiting {
                continue;
            }

            let deadline = self
                .graph
                .get_field(&id, "sla_deadline")
                .and_then(FieldValue::as_safe_int)
                .ok_or_else(|| {
                    EngineError::new(format!("Ticket \"{id}\" has an invalid SLA deadline."))
                })?;

            self.updating(&id, true);
            let result =
                self.set_field(&id, "sla_deadline", FieldValue::Num((deadline + 1) as f64));
            self.updating(&id, false);
            result?;
        }

        self.check_all_tickets()
    }

    // -- tickets -----------------------------------------------------------

    pub fn spawn_ticket(&mut self, value: &Json) -> EngineResult<()> {
        let definition = TicketDef::parse(value)?;
        let id = definition.id.clone();

        if self.tickets.records.contains_key(&id) || self.graph.get_node(&id).is_some() {
            return refuse!("Ticket \"{id}\" already exists.");
        }

        if definition.creates_node(&id) {
            return refuse!("Ticket setup must not create the ticket node itself.");
        }

        let deadline = self.clock.now() + definition.sla_ticks;

        if deadline > 9_007_199_254_740_991 {
            return refuse!("Ticket SLA deadline exceeds the safe tick range.");
        }

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

        self.tickets.records.insert(
            id.clone(),
            TicketRecord {
                def: definition,
                waiting: false,
                resolved: false,
                breached: false,
                updating: false,
            },
        );
        self.events.push(EngineEvent::TicketSpawned(id.clone()));
        self.check_ticket(&id)
    }

    pub fn set_waiting(&mut self, id: &str, waiting: bool) -> EngineResult<()> {
        let Some(record) = self.tickets.records.get(id) else {
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

        if let Some(record) = self.tickets.records.get_mut(id) {
            record.waiting = waiting;
        }

        let state = if waiting { "waiting_on_user" } else { "open" };
        self.updating(id, true);
        let result = self.set_field(id, "state", FieldValue::Str(state.to_owned()));
        self.updating(id, false);
        result?;

        self.check_ticket(id)
    }

    pub fn ticket_state(&self, id: &str) -> Option<&FieldValue> {
        self.tickets
            .records
            .contains_key(id)
            .then(|| self.graph.get_field(id, "state"))
            .flatten()
    }

    pub fn was_breached(&self, id: &str) -> Option<bool> {
        self.tickets.records.get(id).map(|record| record.breached)
    }

    fn updating(&mut self, id: &str, updating: bool) {
        if let Some(record) = self.tickets.records.get_mut(id) {
            record.updating = updating;
        }
    }

    fn check_all_tickets(&mut self) -> EngineResult<()> {
        for id in self.tickets.sorted_ids() {
            self.check_ticket(&id)?;
        }

        Ok(())
    }

    fn check_ticket(&mut self, id: &str) -> EngineResult<()> {
        let Some(record) = self.tickets.records.get(id) else {
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
        let Some(record) = self.tickets.records.get(id) else {
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

    fn resolve_ticket(&mut self, id: &str) -> EngineResult<()> {
        if let Some(record) = self.tickets.records.get_mut(id) {
            record.resolved = true;
            record.waiting = false;
        }

        self.updating(id, true);
        let result = self.set_field(id, "state", FieldValue::Str("resolved".to_owned()));
        self.updating(id, false);
        result?;

        self.events.push(EngineEvent::TicketResolved(id.to_owned()));
        Ok(())
    }

    /// The breach latches on the record and on the node: a ticket closed late
    /// is still closed late, however it ends.
    fn breach_ticket(&mut self, id: &str) -> EngineResult<()> {
        if let Some(record) = self.tickets.records.get_mut(id) {
            record.breached = true;
        }

        self.updating(id, true);
        let result = self
            .set_field(id, "state", FieldValue::Str("breached".to_owned()))
            .and_then(|()| self.set_field(id, "breached", FieldValue::Bool(true)));
        self.updating(id, false);
        result?;

        self.events.push(EngineEvent::TicketBreached(id.to_owned()));
        self.check_ticket(id)
    }
}
