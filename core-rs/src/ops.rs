//! The declarative op language actions are written in.
//!
//! An action is data: a list of guards (predicate + the sentence the player
//! reads when it fires) and a list of ops to apply once none of them did.
//! Keeping it declarative is what lets the world content stay in TypeScript
//! while every decision that touches the graph happens in one place, and it is
//! what makes an action inspectable rather than a closure nobody can serialize.
//!
//! Refusals are player-facing text, so a reason is a template: the world
//! writes the sentence and the engine fills in what the world actually looks
//! like at the moment of refusal.

use std::collections::BTreeMap;

use serde_json::Value as Json;

use crate::assertions::{evaluate, Expr};
use crate::error::{EngineError, EngineResult};
use crate::graph::{Direction, EntityGraph};
use crate::refuse;
use crate::schema::{is_edge_kind, is_node_kind, Node};
use crate::value::FieldValue;

/// Where a node comes from at dispatch time.
#[derive(Clone, Debug)]
pub enum NodeRef {
    /// The dispatch target.
    Target,
    /// Whoever dispatched.
    Actor,
    /// A fixed node id, for actions that always act on one thing.
    Id(String),
    /// The node id carried in a parameter.
    Param(String),
    /// A node a predicate bound on its way past, e.g. the neighbour that
    /// matched.
    Bind(String),
}

impl NodeRef {
    pub fn parse(value: &Json) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Node reference must be an object."))?;

        if let Some(reference) = object.get("ref").and_then(Json::as_str) {
            return match reference {
                "target" => Ok(Self::Target),
                "actor" => Ok(Self::Actor),
                other => refuse!("Node reference \"{other}\" is not \"target\" or \"actor\"."),
            };
        }

        if let Some(id) = object.get("id").and_then(Json::as_str) {
            return Ok(Self::Id(id.to_owned()));
        }

        if let Some(param) = object.get("param").and_then(Json::as_str) {
            return Ok(Self::Param(param.to_owned()));
        }

        if let Some(bind) = object.get("bind").and_then(Json::as_str) {
            return Ok(Self::Bind(bind.to_owned()));
        }

        refuse!("Node reference needs one of \"ref\", \"id\", \"param\" or \"bind\".")
    }
}

/// A value computed at apply time. The rng variants are the reason `apply`
/// and `validate` are different languages: a validator that consumed rng
/// would skew replay, so none of these can appear in a guard.
#[derive(Clone, Debug)]
pub enum ValueExpr {
    Const(FieldValue),
    Param(String),
    ParamTrim(String),
    Now,
    Field {
        node: NodeRef,
        field: String,
    },
    NotField {
        node: NodeRef,
        field: String,
    },
    AppendLine {
        node: NodeRef,
        field: String,
        value: Box<ValueExpr>,
    },
    RngPick(Vec<FieldValue>),
    RngInt {
        min: i64,
        max: i64,
    },
    Eq(Box<ValueExpr>, Box<ValueExpr>),
}

impl ValueExpr {
    pub fn parse(value: &Json) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Value expression must be an object."))?;

        if let Some(constant) = object.get("const") {
            let parsed = FieldValue::from_json(constant)
                .ok_or_else(|| EngineError::new("Constant is not a field value."))?;
            return Ok(Self::Const(parsed));
        }

        if let Some(param) = object.get("param").and_then(Json::as_str) {
            return Ok(Self::Param(param.to_owned()));
        }

        if let Some(param) = object.get("param_trim").and_then(Json::as_str) {
            return Ok(Self::ParamTrim(param.to_owned()));
        }

        if object.contains_key("now") {
            return Ok(Self::Now);
        }

        if let Some(field) = object.get("field") {
            let (node, field) = parse_node_and_field(field)?;
            return Ok(Self::Field { node, field });
        }

        if let Some(field) = object.get("not_field") {
            let (node, field) = parse_node_and_field(field)?;
            return Ok(Self::NotField { node, field });
        }

        if let Some(append) = object.get("append_line") {
            let (node, field) = parse_node_and_field(append)?;
            let inner = append
                .as_object()
                .and_then(|object| object.get("value"))
                .ok_or_else(|| EngineError::new("append_line needs a \"value\"."))?;
            return Ok(Self::AppendLine {
                node,
                field,
                value: Box::new(Self::parse(inner)?),
            });
        }

        if let Some(choices) = object.get("rng_pick").and_then(Json::as_array) {
            let parsed: Option<Vec<FieldValue>> =
                choices.iter().map(FieldValue::from_json).collect();
            let parsed =
                parsed.ok_or_else(|| EngineError::new("rng_pick choices must be field values."))?;

            if parsed.is_empty() {
                return refuse!("rng_pick needs at least one choice.");
            }

            return Ok(Self::RngPick(parsed));
        }

        if let Some(bounds) = object.get("rng_int").and_then(Json::as_object) {
            let min = bounds
                .get("min")
                .and_then(Json::as_i64)
                .ok_or_else(|| EngineError::new("rng_int needs an integer \"min\"."))?;
            let max = bounds
                .get("max")
                .and_then(Json::as_i64)
                .ok_or_else(|| EngineError::new("rng_int needs an integer \"max\"."))?;

            if max < min {
                return refuse!("rng_int needs \"max\" to be at least \"min\".");
            }

            return Ok(Self::RngInt { min, max });
        }

        if let Some(pair) = object.get("eq").and_then(Json::as_array) {
            let [left, right] = pair.as_slice() else {
                return refuse!("eq needs exactly two value expressions.");
            };

            return Ok(Self::Eq(
                Box::new(Self::parse(left)?),
                Box::new(Self::parse(right)?),
            ));
        }

        refuse!("Value expression has no recognised form.")
    }
}

fn parse_node_and_field(value: &Json) -> EngineResult<(NodeRef, String)> {
    let object = value
        .as_object()
        .ok_or_else(|| EngineError::new("Field reference must be an object."))?;
    let node = NodeRef::parse(
        object
            .get("node")
            .ok_or_else(|| EngineError::new("Field reference needs a \"node\"."))?,
    )?;
    let field = object
        .get("field")
        .and_then(Json::as_str)
        .filter(|field| !field.is_empty())
        .ok_or_else(|| EngineError::new("Field reference needs a non-empty \"field\"."))?;

    Ok((node, field.to_owned()))
}

/// A field name, which is usually fixed and occasionally a parameter (the
/// determinism fixture's generic `field.set`).
#[derive(Clone, Debug)]
pub enum FieldName {
    Fixed(String),
    Param(String),
}

impl FieldName {
    pub fn parse(value: &Json) -> EngineResult<Self> {
        if let Some(name) = value.as_str() {
            if name.is_empty() {
                return refuse!("Field name must be a non-empty string.");
            }

            return Ok(Self::Fixed(name.to_owned()));
        }

        if let Some(param) = value
            .as_object()
            .and_then(|object| object.get("param"))
            .and_then(Json::as_str)
        {
            return Ok(Self::Param(param.to_owned()));
        }

        refuse!("Field name must be a string or a parameter reference.")
    }
}

/// The named string formats a parameter can be checked against. A regular
/// expression engine is a lot of machine to carry into wasm for one pattern,
/// so the shapes the world actually needs are named here instead.
#[derive(Clone, Copy, Debug)]
pub enum ParamFormat {
    /// `1024x768`: three or four digits, an `x`, three or four digits.
    Resolution,
}

impl ParamFormat {
    fn parse(value: &str) -> EngineResult<Self> {
        match value {
            "resolution" => Ok(Self::Resolution),
            other => refuse!("Parameter format \"{other}\" is not known."),
        }
    }

    fn matches(self, value: &str) -> bool {
        match self {
            Self::Resolution => {
                let Some((width, height)) = value.split_once('x') else {
                    return false;
                };

                let digits = |part: &str| {
                    (3..=4).contains(&part.len()) && part.chars().all(|c| c.is_ascii_digit())
                };

                digits(width) && digits(height)
            }
        }
    }
}

#[derive(Clone, Debug)]
pub enum Pred {
    TargetMissing,
    NodeMissing {
        node: NodeRef,
    },
    KindIs {
        node: NodeRef,
        kind: String,
    },
    FieldEq {
        node: NodeRef,
        field: String,
        value: ValueExpr,
    },
    FieldMissing {
        node: NodeRef,
        field: String,
    },
    FieldIsNumber {
        node: NodeRef,
        field: String,
    },
    FieldIsBool {
        node: NodeRef,
        field: String,
    },
    FieldAtLeast {
        node: NodeRef,
        field: String,
        value: f64,
    },
    FieldAtMost {
        node: NodeRef,
        field: String,
        value: f64,
    },
    ParamAbsent {
        param: String,
    },
    ParamStringMissing {
        param: String,
    },
    ParamBlank {
        param: String,
    },
    ParamIntIn {
        param: String,
        values: Vec<f64>,
    },
    ParamFormat {
        param: String,
        format: ParamFormat,
    },
    HasEdge {
        from: NodeRef,
        to: NodeRef,
        kind: String,
    },
    /// Some neighbour matches, and it is bound for the refusal template.
    NeighborWhere {
        node: NodeRef,
        direction: Direction,
        edge_kind: Option<String>,
        matching: Box<Pred>,
        bind: Option<String>,
    },
    /// A newline-separated field already carries this line.
    LineInField {
        node: NodeRef,
        field: String,
        value: ValueExpr,
    },
    /// The ticket engine has no record behind this node.
    TicketUntracked {
        node: NodeRef,
    },
    /// This ticket's own resolution rule does NOT accept `field = value`.
    ResolutionRefusesField {
        node: NodeRef,
        field: String,
        value: FieldValue,
    },
    Assert {
        expr: Expr,
    },
    Not(Box<Pred>),
    All(Vec<Pred>),
    Any(Vec<Pred>),
}

const MAX_PRED_DEPTH: usize = 32;

impl Pred {
    pub fn parse(value: &Json) -> EngineResult<Self> {
        Self::parse_at(value, 0)
    }

    fn parse_at(value: &Json, depth: usize) -> EngineResult<Self> {
        if depth > MAX_PRED_DEPTH {
            return refuse!("Predicate is nested too deeply.");
        }

        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Predicate must be an object."))?;
        let name = object
            .get("pred")
            .and_then(Json::as_str)
            .ok_or_else(|| EngineError::new("Predicate needs a \"pred\" name."))?;

        let node = || -> EngineResult<NodeRef> {
            NodeRef::parse(
                object
                    .get("node")
                    .ok_or_else(|| EngineError::new("Predicate needs a \"node\"."))?,
            )
        };
        let field = || -> EngineResult<String> {
            object
                .get("field")
                .and_then(Json::as_str)
                .filter(|field| !field.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| EngineError::new("Predicate needs a non-empty \"field\"."))
        };
        let param = || -> EngineResult<String> {
            object
                .get("param")
                .and_then(Json::as_str)
                .filter(|param| !param.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| EngineError::new("Predicate needs a non-empty \"param\"."))
        };
        let number = || -> EngineResult<f64> {
            object
                .get("value")
                .and_then(Json::as_f64)
                .ok_or_else(|| EngineError::new("Predicate needs a numeric \"value\"."))
        };
        let value_expr = || -> EngineResult<ValueExpr> {
            ValueExpr::parse(
                object
                    .get("value")
                    .ok_or_else(|| EngineError::new("Predicate needs a \"value\"."))?,
            )
        };
        let nested = |key: &str| -> EngineResult<Vec<Pred>> {
            object
                .get(key)
                .and_then(Json::as_array)
                .ok_or_else(|| EngineError::new(format!("Predicate needs an array \"{key}\".")))?
                .iter()
                .map(|entry| Self::parse_at(entry, depth + 1))
                .collect()
        };

        match name {
            "target_missing" => Ok(Self::TargetMissing),
            "node_missing" => Ok(Self::NodeMissing { node: node()? }),
            "kind_is" => {
                let kind = object
                    .get("kind")
                    .and_then(Json::as_str)
                    .filter(|kind| is_node_kind(kind))
                    .ok_or_else(|| EngineError::new("kind_is needs a known node kind."))?;
                Ok(Self::KindIs {
                    node: node()?,
                    kind: kind.to_owned(),
                })
            }
            "field_eq" => Ok(Self::FieldEq {
                node: node()?,
                field: field()?,
                value: value_expr()?,
            }),
            "field_missing" => Ok(Self::FieldMissing {
                node: node()?,
                field: field()?,
            }),
            "field_is_number" => Ok(Self::FieldIsNumber {
                node: node()?,
                field: field()?,
            }),
            "field_is_bool" => Ok(Self::FieldIsBool {
                node: node()?,
                field: field()?,
            }),
            "field_at_least" => Ok(Self::FieldAtLeast {
                node: node()?,
                field: field()?,
                value: number()?,
            }),
            "field_at_most" => Ok(Self::FieldAtMost {
                node: node()?,
                field: field()?,
                value: number()?,
            }),
            "param_absent" => Ok(Self::ParamAbsent { param: param()? }),
            "param_string_missing" => Ok(Self::ParamStringMissing { param: param()? }),
            "param_blank" => Ok(Self::ParamBlank { param: param()? }),
            "param_int_in" => {
                let values: Option<Vec<f64>> = object
                    .get("values")
                    .and_then(Json::as_array)
                    .map(|values| values.iter().map(Json::as_f64).collect())
                    .ok_or_else(|| EngineError::new("param_int_in needs \"values\"."))?;
                let values = values
                    .ok_or_else(|| EngineError::new("param_int_in values must be numbers."))?;
                Ok(Self::ParamIntIn {
                    param: param()?,
                    values,
                })
            }
            "param_format" => {
                let format = object
                    .get("format")
                    .and_then(Json::as_str)
                    .ok_or_else(|| EngineError::new("param_format needs a \"format\"."))?;
                Ok(Self::ParamFormat {
                    param: param()?,
                    format: ParamFormat::parse(format)?,
                })
            }
            "has_edge" => Ok(Self::HasEdge {
                from: NodeRef::parse(
                    object
                        .get("from")
                        .ok_or_else(|| EngineError::new("has_edge needs a \"from\"."))?,
                )?,
                to: NodeRef::parse(
                    object
                        .get("to")
                        .ok_or_else(|| EngineError::new("has_edge needs a \"to\"."))?,
                )?,
                kind: parse_edge_kind(object.get("kind"))?,
            }),
            "neighbor_where" => {
                let direction =
                    Direction::parse(object.get("direction").and_then(Json::as_str).ok_or_else(
                        || EngineError::new("neighbor_where needs a \"direction\"."),
                    )?)?;
                let edge_kind = match object.get("edge_kind") {
                    Some(kind) => Some(parse_edge_kind(Some(kind))?),
                    None => None,
                };
                let matching = Self::parse_at(
                    object
                        .get("matching")
                        .ok_or_else(|| EngineError::new("neighbor_where needs \"matching\"."))?,
                    depth + 1,
                )?;

                Ok(Self::NeighborWhere {
                    node: node()?,
                    direction,
                    edge_kind,
                    matching: Box::new(matching),
                    bind: object.get("bind").and_then(Json::as_str).map(str::to_owned),
                })
            }
            "line_in_field" => Ok(Self::LineInField {
                node: node()?,
                field: field()?,
                value: value_expr()?,
            }),
            "ticket_untracked" => Ok(Self::TicketUntracked { node: node()? }),
            "resolution_refuses_field" => {
                let value = object
                    .get("value")
                    .and_then(FieldValue::from_json)
                    .ok_or_else(|| {
                        EngineError::new("resolution_refuses_field needs a field \"value\".")
                    })?;
                Ok(Self::ResolutionRefusesField {
                    node: node()?,
                    field: field()?,
                    value,
                })
            }
            "assert" => {
                let expr = object
                    .get("expr")
                    .and_then(Expr::parse)
                    .ok_or_else(|| EngineError::new("assert needs a valid expression."))?;
                Ok(Self::Assert { expr })
            }
            "not" => Ok(Self::Not(Box::new(Self::parse_at(
                object
                    .get("of")
                    .ok_or_else(|| EngineError::new("not needs an \"of\"."))?,
                depth + 1,
            )?))),
            "all" => Ok(Self::All(nested("of")?)),
            "any" => Ok(Self::Any(nested("of")?)),
            other => refuse!("Predicate \"{other}\" is not known."),
        }
    }
}

fn parse_edge_kind(value: Option<&Json>) -> EngineResult<String> {
    value
        .and_then(Json::as_str)
        .filter(|kind| is_edge_kind(kind))
        .map(str::to_owned)
        .ok_or_else(|| EngineError::new("Edge kind is not supported."))
}

/// One refusal: when it fires, and what the player is told.
#[derive(Clone, Debug)]
pub struct Guard {
    pub when: Pred,
    pub reason: String,
}

impl Guard {
    pub fn parse(value: &Json) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Guard must be an object."))?;
        let reason = object
            .get("reason")
            .and_then(Json::as_str)
            .filter(|reason| !reason.is_empty())
            .ok_or_else(|| EngineError::new("Guard needs a non-empty \"reason\"."))?;

        Ok(Self {
            when: Pred::parse(
                object
                    .get("when")
                    .ok_or_else(|| EngineError::new("Guard needs a \"when\" predicate."))?,
            )?,
            reason: reason.to_owned(),
        })
    }
}

#[derive(Clone, Debug)]
pub enum Op {
    SetField {
        node: NodeRef,
        field: FieldName,
        value: ValueExpr,
    },
    ClearField {
        node: NodeRef,
        field: FieldName,
    },
    AddEdge {
        from: NodeRef,
        to: NodeRef,
        kind: String,
    },
    RemoveEdge {
        from: NodeRef,
        to: NodeRef,
        kind: String,
    },
    RemoveNode {
        node: NodeRef,
    },
    /// Parks or un-parks a ticket. The SLA clock is the ticket engine's, not
    /// the graph's, so this is the one op that talks to it.
    SetWaiting {
        node: NodeRef,
        waiting: bool,
    },
    /// Applies its ops only when the predicate holds, which is how an action
    /// stays a no-op instead of writing a value that is already there.
    When {
        cond: Pred,
        ops: Vec<Op>,
    },
}

const MAX_OP_DEPTH: usize = 8;

impl Op {
    pub fn parse(value: &Json) -> EngineResult<Self> {
        Self::parse_at(value, 0)
    }

    fn parse_at(value: &Json, depth: usize) -> EngineResult<Self> {
        if depth > MAX_OP_DEPTH {
            return refuse!("Op is nested too deeply.");
        }

        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Op must be an object."))?;
        let name = object
            .get("op")
            .and_then(Json::as_str)
            .ok_or_else(|| EngineError::new("Op needs an \"op\" name."))?;

        let node = || -> EngineResult<NodeRef> {
            NodeRef::parse(
                object
                    .get("node")
                    .ok_or_else(|| EngineError::new("Op needs a \"node\"."))?,
            )
        };
        let field = || -> EngineResult<FieldName> {
            FieldName::parse(
                object
                    .get("field")
                    .ok_or_else(|| EngineError::new("Op needs a \"field\"."))?,
            )
        };
        let endpoints = || -> EngineResult<(NodeRef, NodeRef, String)> {
            Ok((
                NodeRef::parse(
                    object
                        .get("from")
                        .ok_or_else(|| EngineError::new("Edge op needs a \"from\"."))?,
                )?,
                NodeRef::parse(
                    object
                        .get("to")
                        .ok_or_else(|| EngineError::new("Edge op needs a \"to\"."))?,
                )?,
                parse_edge_kind(object.get("kind"))?,
            ))
        };

        match name {
            "set_field" => Ok(Self::SetField {
                node: node()?,
                field: field()?,
                value: ValueExpr::parse(
                    object
                        .get("value")
                        .ok_or_else(|| EngineError::new("set_field needs a \"value\"."))?,
                )?,
            }),
            "clear_field" => Ok(Self::ClearField {
                node: node()?,
                field: field()?,
            }),
            "add_edge" => {
                let (from, to, kind) = endpoints()?;
                Ok(Self::AddEdge { from, to, kind })
            }
            "remove_edge" => {
                let (from, to, kind) = endpoints()?;
                Ok(Self::RemoveEdge { from, to, kind })
            }
            "remove_node" => Ok(Self::RemoveNode { node: node()? }),
            "set_waiting" => Ok(Self::SetWaiting {
                node: node()?,
                waiting: object
                    .get("waiting")
                    .and_then(Json::as_bool)
                    .ok_or_else(|| EngineError::new("set_waiting needs a boolean \"waiting\"."))?,
            }),
            "when" => {
                let ops: EngineResult<Vec<Op>> = object
                    .get("ops")
                    .and_then(Json::as_array)
                    .ok_or_else(|| EngineError::new("when needs an array \"ops\"."))?
                    .iter()
                    .map(|entry| Self::parse_at(entry, depth + 1))
                    .collect();

                Ok(Self::When {
                    cond: Pred::parse(
                        object
                            .get("cond")
                            .ok_or_else(|| EngineError::new("when needs a \"cond\"."))?,
                    )?,
                    ops: ops?,
                })
            }
            other => refuse!("Op \"{other}\" is not known."),
        }
    }
}

/// What a ticket record can answer while an action is being validated. The
/// ticket engine implements it; predicates only ever read.
pub trait TicketIndex {
    fn is_registered(&self, id: &str) -> bool;
    /// Whether the ticket's own resolution rule can be satisfied by setting
    /// `field` to `value`.
    fn resolution_accepts(&self, id: &str, field: &str, value: &FieldValue) -> bool;
}

pub type Params = BTreeMap<String, FieldValue>;

/// Everything a guard is allowed to see. No graph handle that can write, no
/// rng: a refusal is a pure decision about the world as it stands.
pub struct EvalContext<'a> {
    pub graph: &'a EntityGraph,
    pub actor: &'a str,
    pub target: Option<&'a str>,
    pub params: &'a Params,
    pub now: i64,
    pub tickets: &'a dyn TicketIndex,
    pub binds: BTreeMap<String, String>,
}

impl<'a> EvalContext<'a> {
    pub fn resolve_id(&self, reference: &NodeRef) -> Option<String> {
        match reference {
            NodeRef::Target => self.target.map(str::to_owned),
            NodeRef::Actor => Some(self.actor.to_owned()),
            NodeRef::Id(id) => Some(id.clone()),
            NodeRef::Param(param) => self
                .params
                .get(param)
                .and_then(FieldValue::as_str)
                .filter(|id| !id.is_empty())
                .map(str::to_owned),
            NodeRef::Bind(name) => self.binds.get(name).cloned(),
        }
    }

    pub fn resolve_node(&self, reference: &NodeRef) -> Option<&'a Node> {
        let id = self.resolve_id(reference)?;
        self.graph.get_node(&id)
    }

    fn field(&self, reference: &NodeRef, field: &str) -> Option<&'a FieldValue> {
        self.resolve_node(reference)
            .and_then(|node| node.fields.get(field))
    }

    fn param(&self, name: &str) -> Option<&FieldValue> {
        self.params.get(name)
    }
}

/// Splits a newline-joined field into its lines, dropping the empty ones -
/// the same shape `clueLines` reads on the TypeScript side.
pub fn field_lines(value: Option<&FieldValue>) -> Vec<String> {
    value
        .and_then(FieldValue::as_str)
        .filter(|text| !text.is_empty())
        .map(|text| {
            text.split('\n')
                .filter(|line| !line.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

/// Evaluates a value expression that a GUARD may use: no rng, no clock
/// side effects. Anything rng-shaped is a content bug and evaluates to null.
pub fn eval_value(context: &EvalContext<'_>, value: &ValueExpr) -> FieldValue {
    match value {
        ValueExpr::Const(constant) => constant.clone(),
        ValueExpr::Param(param) => context.param(param).cloned().unwrap_or(FieldValue::Null),
        ValueExpr::ParamTrim(param) => match context.param(param).and_then(FieldValue::as_str) {
            Some(text) => FieldValue::Str(text.trim().to_owned()),
            None => FieldValue::Null,
        },
        ValueExpr::Now => FieldValue::Num(context.now as f64),
        ValueExpr::Field { node, field } => context
            .field(node, field)
            .cloned()
            .unwrap_or(FieldValue::Null),
        ValueExpr::NotField { node, field } => match context.field(node, field) {
            Some(FieldValue::Bool(existing)) => FieldValue::Bool(!existing),
            _ => FieldValue::Null,
        },
        ValueExpr::AppendLine { node, field, value } => {
            let mut lines = field_lines(context.field(node, field));
            let addition = eval_value(context, value);

            if let Some(text) = addition.as_str() {
                lines.push(text.to_owned());
            }

            FieldValue::Str(lines.join("\n"))
        }
        ValueExpr::Eq(left, right) => {
            FieldValue::Bool(eval_value(context, left).same_value(&eval_value(context, right)))
        }
        // Randomness cannot reach a guard by construction; see `apply`.
        ValueExpr::RngPick(_) | ValueExpr::RngInt { .. } => FieldValue::Null,
    }
}

pub fn evaluate_pred(context: &mut EvalContext<'_>, predicate: &Pred) -> bool {
    match predicate {
        Pred::TargetMissing => context.target.is_none(),
        Pred::NodeMissing { node } => context.resolve_node(node).is_none(),
        Pred::KindIs { node, kind } => context
            .resolve_node(node)
            .is_some_and(|found| found.kind == *kind),
        Pred::FieldEq { node, field, value } => {
            let expected = eval_value(context, value);
            context
                .field(node, field)
                .is_some_and(|actual| actual.same_value(&expected))
        }
        Pred::FieldMissing { node, field } => context.field(node, field).is_none(),
        Pred::FieldIsNumber { node, field } => context
            .field(node, field)
            .is_some_and(|value| value.as_f64().is_some()),
        Pred::FieldIsBool { node, field } => context
            .field(node, field)
            .is_some_and(|value| value.as_bool().is_some()),
        Pred::FieldAtLeast { node, field, value } => context
            .field(node, field)
            .and_then(FieldValue::as_f64)
            .is_some_and(|actual| actual >= *value),
        Pred::FieldAtMost { node, field, value } => context
            .field(node, field)
            .and_then(FieldValue::as_f64)
            .is_some_and(|actual| actual <= *value),
        Pred::ParamAbsent { param } => context.param(param).is_none(),
        Pred::ParamStringMissing { param } => context
            .param(param)
            .and_then(FieldValue::as_str)
            .is_none_or(str::is_empty),
        Pred::ParamBlank { param } => context
            .param(param)
            .and_then(FieldValue::as_str)
            .map(|text| text.trim().is_empty())
            .unwrap_or(true),
        Pred::ParamIntIn { param, values } => context
            .param(param)
            .and_then(FieldValue::as_f64)
            .is_some_and(|actual| values.contains(&actual)),
        Pred::ParamFormat { param, format } => context
            .param(param)
            .and_then(FieldValue::as_str)
            .is_some_and(|text| format.matches(text)),
        Pred::HasEdge { from, to, kind } => {
            match (context.resolve_id(from), context.resolve_id(to)) {
                (Some(from), Some(to)) => context.graph.has_edge(&from, &to, kind),
                _ => false,
            }
        }
        Pred::NeighborWhere {
            node,
            direction,
            edge_kind,
            matching,
            bind,
        } => {
            let Some(id) = context.resolve_id(node) else {
                return false;
            };

            let candidates: Vec<String> = context
                .graph
                .neighbors(&id, *direction, edge_kind.as_deref())
                .into_iter()
                .map(|neighbor| neighbor.id.clone())
                .collect();
            let slot = bind.clone().unwrap_or_else(|| "it".to_owned());
            let previous = context.binds.get(&slot).cloned();

            for candidate in candidates {
                context.binds.insert(slot.clone(), candidate);

                if evaluate_pred(context, matching) {
                    return true;
                }
            }

            match previous {
                Some(value) => {
                    context.binds.insert(slot, value);
                }
                None => {
                    context.binds.remove(&slot);
                }
            }

            false
        }
        Pred::LineInField { node, field, value } => {
            let expected = eval_value(context, value);
            let Some(expected) = expected.as_str() else {
                return false;
            };

            field_lines(context.field(node, field))
                .iter()
                .any(|line| line == expected)
        }
        Pred::TicketUntracked { node } => match context.resolve_id(node) {
            Some(id) => !context.tickets.is_registered(&id),
            None => true,
        },
        Pred::ResolutionRefusesField { node, field, value } => match context.resolve_id(node) {
            Some(id) => !context.tickets.resolution_accepts(&id, field, value),
            None => true,
        },
        Pred::Assert { expr } => evaluate(context.graph, expr),
        Pred::Not(inner) => !evaluate_pred(context, inner),
        Pred::All(inner) => inner
            .iter()
            .all(|predicate| evaluate_pred(context, predicate)),
        Pred::Any(inner) => inner
            .iter()
            .any(|predicate| evaluate_pred(context, predicate)),
    }
}

/// The label a refusal calls a node by: its name, hostname or username, and
/// its id when it has none of those. `describeNode`, exactly.
pub fn describe_node(node: &Node) -> String {
    for field in ["name", "hostname", "username"] {
        match node.fields.get(field) {
            Some(FieldValue::Null) | None => continue,
            Some(value) => {
                return match value.as_str() {
                    Some(text) if !text.is_empty() => text.to_owned(),
                    _ => node.id.clone(),
                };
            }
        }
    }

    node.id.clone()
}

/// Fills a refusal template. `{target.label}`, `{p:group.kind_label}`,
/// `{b:backlog.f:queue_len}`, `{v:rotation}` - the world writes the sentence,
/// the engine supplies what the world currently looks like.
pub fn render_template(
    template: &str,
    context: &EvalContext<'_>,
    kind_labels: &BTreeMap<String, String>,
) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;

    while let Some(start) = rest.find('{') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];

        let Some(end) = after.find('}') else {
            out.push_str(&rest[start..]);
            return out;
        };

        let placeholder = &after[..end];
        match resolve_placeholder(placeholder, context, kind_labels) {
            Some(value) => out.push_str(&value),
            None => {
                // Leave an unresolvable placeholder visible rather than
                // quietly shipping a sentence with a hole in it.
                out.push('{');
                out.push_str(placeholder);
                out.push('}');
            }
        }

        rest = &after[end + 1..];
    }

    out.push_str(rest);
    out
}

fn resolve_placeholder(
    placeholder: &str,
    context: &EvalContext<'_>,
    kind_labels: &BTreeMap<String, String>,
) -> Option<String> {
    if let Some(param) = placeholder.strip_prefix("v:") {
        return Some(
            context
                .params
                .get(param)
                .map(FieldValue::to_display_string)
                .unwrap_or_default(),
        );
    }

    let (reference, accessor) = placeholder.split_once('.')?;
    let node_ref = match reference {
        "target" => NodeRef::Target,
        "actor" => NodeRef::Actor,
        other => {
            if let Some(param) = other.strip_prefix("p:") {
                NodeRef::Param(param.to_owned())
            } else if let Some(bind) = other.strip_prefix("b:") {
                NodeRef::Bind(bind.to_owned())
            } else {
                return None;
            }
        }
    };

    if accessor == "id" {
        return Some(context.resolve_id(&node_ref).unwrap_or_default());
    }

    let node = context.resolve_node(&node_ref);

    match accessor {
        "label" => Some(node.map(describe_node).unwrap_or_default()),
        "kind_label" => Some(
            node.and_then(|node| kind_labels.get(&node.kind))
                .cloned()
                .unwrap_or_default(),
        ),
        other => {
            let field = other.strip_prefix("f:")?;
            Some(
                node.and_then(|node| node.fields.get(field))
                    .map(FieldValue::to_display_string)
                    .unwrap_or_default(),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    struct NoTickets;

    impl TicketIndex for NoTickets {
        fn is_registered(&self, _id: &str) -> bool {
            false
        }

        fn resolution_accepts(&self, _id: &str, _field: &str, _value: &FieldValue) -> bool {
            false
        }
    }

    fn fixture() -> EntityGraph {
        let mut graph = EntityGraph::new();
        graph
            .add_node_json(&json!({
                "id": "device:printer",
                "kind": "device",
                "fields": { "name": "Hercules 400", "type": "printer", "queue_len": 12 },
            }))
            .expect("printer");
        graph
            .add_node_json(&json!({
                "id": "service:spooler",
                "kind": "service",
                "fields": { "name": "Print Spooler", "status": "wedged" },
            }))
            .expect("spooler");
        graph
            .add_edge(crate::schema::Edge {
                from: "service:spooler".to_owned(),
                to: "device:printer".to_owned(),
                kind: "connected_to".to_owned(),
            })
            .expect("edge");
        graph
    }

    fn context<'a>(
        graph: &'a EntityGraph,
        params: &'a Params,
        target: Option<&'a str>,
    ) -> EvalContext<'a> {
        EvalContext {
            graph,
            actor: "person:tech",
            target,
            params,
            now: 7,
            tickets: &NoTickets,
            binds: BTreeMap::new(),
        }
    }

    #[test]
    fn binds_the_neighbour_that_matched_for_the_refusal() {
        let graph = fixture();
        let params = Params::new();
        let mut evaluation = context(&graph, &params, Some("service:spooler"));
        let predicate = Pred::parse(&json!({
            "pred": "neighbor_where",
            "node": { "ref": "target" },
            "direction": "out",
            "edge_kind": "connected_to",
            "bind": "backlog",
            "matching": {
                "pred": "all",
                "of": [
                    { "pred": "field_is_number", "node": { "bind": "backlog" }, "field": "queue_len" },
                    { "pred": "field_at_least", "node": { "bind": "backlog" }, "field": "queue_len", "value": 1 },
                ],
            },
        }))
        .expect("valid predicate");

        assert!(evaluate_pred(&mut evaluation, &predicate));

        let labels = BTreeMap::new();
        assert_eq!(
            render_template(
                "{b:backlog.f:queue_len} job(s) are still queued on \"{b:backlog.label}\".",
                &evaluation,
                &labels,
            ),
            "12 job(s) are still queued on \"Hercules 400\".",
        );
    }

    #[test]
    fn a_failed_neighbour_search_leaves_no_binding_behind() {
        let graph = fixture();
        let params = Params::new();
        let mut evaluation = context(&graph, &params, Some("service:spooler"));
        let predicate = Pred::parse(&json!({
            "pred": "neighbor_where",
            "node": { "ref": "target" },
            "direction": "out",
            "edge_kind": "connected_to",
            "bind": "backlog",
            "matching": { "pred": "field_at_least", "node": { "bind": "backlog" }, "field": "queue_len", "value": 99 },
        }))
        .expect("valid predicate");

        assert!(!evaluate_pred(&mut evaluation, &predicate));
        assert!(evaluation.binds.is_empty());
    }

    #[test]
    fn renders_labels_kinds_fields_and_params() {
        let graph = fixture();
        let mut params = Params::new();
        params.insert("rotation".to_owned(), FieldValue::Num(45.0));
        params.insert(
            "group".to_owned(),
            FieldValue::Str("device:printer".to_owned()),
        );
        let evaluation = context(&graph, &params, Some("service:spooler"));
        let mut labels = BTreeMap::new();
        labels.insert("device".to_owned(), "a device".to_owned());

        assert_eq!(
            render_template(
                "{target.label} {target.id} {v:rotation} {p:group.label} {p:group.kind_label} {p:group.f:queue_len}",
                &evaluation,
                &labels,
            ),
            "Print Spooler service:spooler 45 Hercules 400 a device 12",
        );
        assert_eq!(
            render_template("{nope.label} {unclosed", &evaluation, &labels),
            "{nope.label} {unclosed",
        );
    }

    #[test]
    fn describes_a_node_by_the_first_label_it_has() {
        let mut node = Node {
            id: "device:x".to_owned(),
            kind: "device".to_owned(),
            fields: crate::schema::Fields::new(),
        };
        assert_eq!(describe_node(&node), "device:x");

        node.fields
            .insert("username".to_owned(), FieldValue::Str("ada".to_owned()));
        assert_eq!(describe_node(&node), "ada");

        node.fields
            .insert("name".to_owned(), FieldValue::Str("Ada".to_owned()));
        assert_eq!(describe_node(&node), "Ada");

        node.fields.insert("name".to_owned(), FieldValue::Null);
        assert_eq!(describe_node(&node), "ada");

        node.fields.insert("name".to_owned(), FieldValue::Num(7.0));
        assert_eq!(describe_node(&node), "device:x");
    }

    #[test]
    fn checks_the_named_parameter_formats() {
        assert!(ParamFormat::Resolution.matches("1024x768"));
        assert!(ParamFormat::Resolution.matches("800x600"));
        assert!(!ParamFormat::Resolution.matches("as big as possible"));
        assert!(!ParamFormat::Resolution.matches("10x10"));
        assert!(!ParamFormat::Resolution.matches("10240x768"));
        assert!(!ParamFormat::Resolution.matches("1024x768x2"));
    }

    #[test]
    fn refuses_malformed_op_language_loudly() {
        assert!(Pred::parse(&json!({ "pred": "nope" })).is_err());
        assert!(Pred::parse(&json!({})).is_err());
        assert!(Pred::parse(&json!("target_missing")).is_err());
        assert!(Op::parse(&json!({ "op": "nope" })).is_err());
        assert!(ValueExpr::parse(&json!({ "const": [] })).is_err());
        assert!(ValueExpr::parse(&json!({ "rng_pick": [] })).is_err());
        assert!(Guard::parse(&json!({ "when": { "pred": "target_missing" } })).is_err());
    }
}
