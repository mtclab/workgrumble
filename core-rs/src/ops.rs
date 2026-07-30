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

use serde_json::{Map, Value as Json};

use crate::assertions::{evaluate, Expr};
use crate::error::{EngineError, EngineResult};
use crate::graph::{Direction, EntityGraph};
use crate::num::{safe_int, MAX_SAFE_INT};
use crate::refuse;
use crate::schema::{is_edge_kind, is_node_kind, Node};
use crate::value::FieldValue;

/// What the op language is allowed to say at this point in a definition.
///
/// Two things vary with position and both used to be checked nowhere. Dice may
/// only be rolled while APPLYING - a guard that consumed rng would make replay
/// a fiction, and the evaluator silently answered `null` instead of saying so.
/// And a `bind` names a node some enclosing `neighbor_where` found, so it means
/// something inside that search's `matching` and nothing anywhere else; an op
/// that referred to one was accepted at registration and failed at dispatch,
/// AFTER the ops before it had already changed the world.
#[derive(Clone, Debug)]
pub struct ParseScope {
    /// Bind names an enclosing `neighbor_where` has brought into scope.
    binds: Vec<String>,
    /// Whether the rng-consuming value forms are legal here.
    rng: bool,
}

impl ParseScope {
    /// Inside `apply`: dice are legal, and nothing is bound.
    pub fn apply() -> Self {
        Self {
            binds: Vec::new(),
            rng: true,
        }
    }

    /// Inside `validate`, and inside any `when` condition: no dice.
    pub fn guard() -> Self {
        Self {
            binds: Vec::new(),
            rng: false,
        }
    }

    fn without_rng(&self) -> Self {
        Self {
            binds: self.binds.clone(),
            rng: false,
        }
    }

    fn with_bind(&self, name: &str) -> Self {
        let mut binds = self.binds.clone();

        if !self.binds(name) {
            binds.push(name.to_owned());
        }

        Self {
            binds,
            rng: self.rng,
        }
    }

    fn binds(&self, name: &str) -> bool {
        self.binds.iter().any(|bound| bound == name)
    }
}

/// The one key an object may carry out of a set of alternatives.
///
/// Two of them is not "the first one wins": it is a definition that says two
/// contradictory things, and picking one silently is how `{ ref, id }` quietly
/// ignored the id somebody meant.
fn exactly_one<'a>(
    object: &Map<String, Json>,
    keys: &[&'a str],
    what: &str,
) -> EngineResult<&'a str> {
    let mut present = keys.iter().filter(|key| object.contains_key(**key));

    let Some(key) = present.next() else {
        let options = keys.join("\", \"");
        return refuse!("{what} needs one of \"{options}\".");
    };

    match present.next() {
        Some(other) => refuse!("{what} says both \"{key}\" and \"{other}\"; it may say one."),
        None => Ok(key),
    }
}

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

const NODE_REF_KEYS: [&str; 4] = ["ref", "id", "param", "bind"];

impl NodeRef {
    pub fn parse(value: &Json, scope: &ParseScope) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Node reference must be an object."))?;
        let key = exactly_one(object, &NODE_REF_KEYS, "Node reference")?;
        let name = object
            .get(key)
            .and_then(Json::as_str)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| {
                EngineError::new(format!(
                    "Node reference \"{key}\" must be a non-empty string."
                ))
            })?;

        match key {
            "ref" => match name {
                "target" => Ok(Self::Target),
                "actor" => Ok(Self::Actor),
                other => refuse!("Node reference \"{other}\" is not \"target\" or \"actor\"."),
            },
            "id" => Ok(Self::Id(name.to_owned())),
            "param" => Ok(Self::Param(name.to_owned())),
            _ if scope.binds(name) => Ok(Self::Bind(name.to_owned())),
            // An unbound `bind` can never resolve, so accepting it means
            // failing at dispatch instead - halfway through the ops, with the
            // earlier ones already applied.
            _ => refuse!(
                "Node reference binds \"{name}\", which no enclosing neighbor_where binds here."
            ),
        }
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

const VALUE_KEYS: [&str; 10] = [
    "const",
    "param",
    "param_trim",
    "now",
    "field",
    "not_field",
    "append_line",
    "rng_pick",
    "rng_int",
    "eq",
];

impl ValueExpr {
    /// Parses a value in an APPLY position, where dice are legal.
    pub fn parse(value: &Json) -> EngineResult<Self> {
        Self::parse_in(value, &ParseScope::apply())
    }

    pub fn parse_in(value: &Json, scope: &ParseScope) -> EngineResult<Self> {
        let object = value
            .as_object()
            .ok_or_else(|| EngineError::new("Value expression must be an object."))?;
        let key = exactly_one(object, &VALUE_KEYS, "Value expression")?;
        let entry = object
            .get(key)
            .expect("the key came from this object's own keys");
        let text = || -> EngineResult<String> {
            entry
                .as_str()
                .filter(|name| !name.is_empty())
                .map(str::to_owned)
                .ok_or_else(|| EngineError::new(format!("\"{key}\" must be a non-empty string.")))
        };
        let dice = || -> EngineResult<()> {
            if scope.rng {
                return Ok(());
            }

            // A guard that rolled dice would consume the stream a replay
            // depends on, so the evaluator refuses to roll there - which used
            // to mean the guard silently compared against `null` instead.
            refuse!("\"{key}\" rolls dice, which only an apply op may do.")
        };

        match key {
            "const" => Ok(Self::Const(
                FieldValue::from_json(entry)
                    .ok_or_else(|| EngineError::new("Constant is not a field value."))?,
            )),
            "param" => Ok(Self::Param(text()?)),
            "param_trim" => Ok(Self::ParamTrim(text()?)),
            "now" => match entry {
                Json::Bool(true) => Ok(Self::Now),
                // `{ "now": false }` reading as "now" is a definition saying
                // one thing and meaning another.
                _ => refuse!("\"now\" must be true."),
            },
            "field" => {
                let (node, field) = parse_node_and_field(entry, scope)?;
                Ok(Self::Field { node, field })
            }
            "not_field" => {
                let (node, field) = parse_node_and_field(entry, scope)?;
                Ok(Self::NotField { node, field })
            }
            "append_line" => {
                let (node, field) = parse_node_and_field(entry, scope)?;
                let inner = entry
                    .as_object()
                    .and_then(|object| object.get("value"))
                    .ok_or_else(|| EngineError::new("append_line needs a \"value\"."))?;
                Ok(Self::AppendLine {
                    node,
                    field,
                    value: Box::new(Self::parse_in(inner, scope)?),
                })
            }
            "rng_pick" => {
                dice()?;
                let choices = entry
                    .as_array()
                    .ok_or_else(|| EngineError::new("rng_pick needs an array of choices."))?;
                let parsed: Option<Vec<FieldValue>> =
                    choices.iter().map(FieldValue::from_json).collect();
                let parsed = parsed
                    .ok_or_else(|| EngineError::new("rng_pick choices must be field values."))?;

                if parsed.is_empty() {
                    return refuse!("rng_pick needs at least one choice.");
                }

                Ok(Self::RngPick(parsed))
            }
            "rng_int" => {
                dice()?;
                let bounds = entry
                    .as_object()
                    .ok_or_else(|| EngineError::new("rng_int needs \"min\" and \"max\"."))?;
                let bound = |name: &str| -> EngineResult<i64> {
                    bounds.get(name).and_then(safe_int).ok_or_else(|| {
                        EngineError::new(format!("rng_int needs a safe integer \"{name}\"."))
                    })
                };
                let min = bound("min")?;
                let max = bound("max")?;

                if max < min {
                    return refuse!("rng_int needs \"max\" to be at least \"min\".");
                }

                // The reference drew from `max - min + 1` as a JavaScript
                // number. A range wider than that cannot be drawn from the same
                // way, so it is not a bigger range - it is a different one.
                let width = max
                    .checked_sub(min)
                    .and_then(|span| span.checked_add(1))
                    .filter(|width| *width <= MAX_SAFE_INT);

                if width.is_none() {
                    return refuse!("rng_int range is wider than the safe integer space.");
                }

                Ok(Self::RngInt { min, max })
            }
            _ => {
                let pair = entry
                    .as_array()
                    .ok_or_else(|| EngineError::new("eq needs exactly two value expressions."))?;
                let [left, right] = pair.as_slice() else {
                    return refuse!("eq needs exactly two value expressions.");
                };

                Ok(Self::Eq(
                    Box::new(Self::parse_in(left, scope)?),
                    Box::new(Self::parse_in(right, scope)?),
                ))
            }
        }
    }
}

fn parse_node_and_field(value: &Json, scope: &ParseScope) -> EngineResult<(NodeRef, String)> {
    let object = value
        .as_object()
        .ok_or_else(|| EngineError::new("Field reference must be an object."))?;
    let node = NodeRef::parse(
        object
            .get("node")
            .ok_or_else(|| EngineError::new("Field reference needs a \"node\"."))?,
        scope,
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
            if param.is_empty() {
                return refuse!("Field name parameter must be a non-empty string.");
            }

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

/// What a `neighbor_where` binds its match to when it does not say.
pub const DEFAULT_BIND: &str = "it";

impl Pred {
    /// Parses a predicate in a guard position: no dice, nothing bound.
    pub fn parse(value: &Json) -> EngineResult<Self> {
        Self::parse_in(value, &ParseScope::guard(), 0)
    }

    /// A predicate never rolls dice, wherever it appears, so the scope it is
    /// given is stripped of rng before anything inside it is read.
    pub fn parse_in(value: &Json, scope: &ParseScope, depth: usize) -> EngineResult<Self> {
        Self::parse_at(value, &scope.without_rng(), depth)
    }

    fn parse_at(value: &Json, scope: &ParseScope, depth: usize) -> EngineResult<Self> {
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
                scope,
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
            ValueExpr::parse_in(
                object
                    .get("value")
                    .ok_or_else(|| EngineError::new("Predicate needs a \"value\"."))?,
                scope,
            )
        };
        let nested = |key: &str| -> EngineResult<Vec<Pred>> {
            object
                .get(key)
                .and_then(Json::as_array)
                .ok_or_else(|| EngineError::new(format!("Predicate needs an array \"{key}\".")))?
                .iter()
                .map(|entry| Self::parse_at(entry, scope, depth + 1))
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
                    scope,
                )?,
                to: NodeRef::parse(
                    object
                        .get("to")
                        .ok_or_else(|| EngineError::new("has_edge needs a \"to\"."))?,
                    scope,
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
                let bind = match object.get("bind") {
                    Some(bind) => Some(
                        bind.as_str()
                            .filter(|name| !name.is_empty())
                            .map(str::to_owned)
                            .ok_or_else(|| {
                                EngineError::new(
                                    "neighbor_where \"bind\" must be a non-empty string.",
                                )
                            })?,
                    ),
                    None => None,
                };
                // The name the search binds is in scope for what it searches
                // WITH, and nowhere else.
                let inner = scope.with_bind(bind.as_deref().unwrap_or(DEFAULT_BIND));
                let matching = Self::parse_at(
                    object
                        .get("matching")
                        .ok_or_else(|| EngineError::new("neighbor_where needs \"matching\"."))?,
                    &inner,
                    depth + 1,
                )?;

                Ok(Self::NeighborWhere {
                    node: node()?,
                    direction,
                    edge_kind,
                    matching: Box::new(matching),
                    bind,
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
                scope,
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
    /// Parses an op in an apply position, which is the only position ops have.
    pub fn parse(value: &Json) -> EngineResult<Self> {
        Self::parse_at(value, &ParseScope::apply(), 0)
    }

    fn parse_at(value: &Json, scope: &ParseScope, depth: usize) -> EngineResult<Self> {
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
                scope,
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
                    scope,
                )?,
                NodeRef::parse(
                    object
                        .get("to")
                        .ok_or_else(|| EngineError::new("Edge op needs a \"to\"."))?,
                    scope,
                )?,
                parse_edge_kind(object.get("kind"))?,
            ))
        };

        match name {
            "set_field" => Ok(Self::SetField {
                node: node()?,
                field: field()?,
                value: ValueExpr::parse_in(
                    object
                        .get("value")
                        .ok_or_else(|| EngineError::new("set_field needs a \"value\"."))?,
                    scope,
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
                    .map(|entry| Self::parse_at(entry, scope, depth + 1))
                    .collect();

                Ok(Self::When {
                    cond: Pred::parse_in(
                        object
                            .get("cond")
                            .ok_or_else(|| EngineError::new("when needs a \"cond\"."))?,
                        scope,
                        0,
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
        // Unreachable: `ParseScope` refuses these in every position this
        // function is called from. Kept total rather than panicking, because a
        // boundary that can panic is a boundary that can poison the module.
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
            let slot = bind.clone().unwrap_or_else(|| DEFAULT_BIND.to_owned());
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

    /// A reference that names two ways to find a node says two things. Picking
    /// the first quietly ignored the other one.
    #[test]
    fn a_node_reference_names_exactly_one_way_to_find_a_node() {
        let scope = ParseScope::apply();

        assert!(NodeRef::parse(&json!({ "ref": "target" }), &scope).is_ok());
        assert!(NodeRef::parse(&json!({ "id": "device:x" }), &scope).is_ok());
        assert!(NodeRef::parse(&json!({ "param": "who" }), &scope).is_ok());

        let both = NodeRef::parse(&json!({ "ref": "target", "id": "device:x" }), &scope)
            .expect_err("two discriminators");
        assert!(both.message().contains("it may say one"), "{both}");

        assert!(NodeRef::parse(&json!({}), &scope).is_err());
        assert!(NodeRef::parse(&json!({ "id": "" }), &scope).is_err());
        assert!(NodeRef::parse(&json!({ "param": "" }), &scope).is_err());
        assert!(NodeRef::parse(&json!({ "id": 7 }), &scope).is_err());
    }

    #[test]
    fn a_value_expression_names_exactly_one_form_and_means_now_when_it_says_now() {
        assert!(ValueExpr::parse(&json!({ "now": true })).is_ok());
        assert!(ValueExpr::parse(&json!({ "now": false })).is_err());
        assert!(ValueExpr::parse(&json!({ "now": 1 })).is_err());
        assert!(ValueExpr::parse(&json!({ "const": 1, "param": "x" })).is_err());
        assert!(ValueExpr::parse(&json!({ "param": "" })).is_err());
        assert!(ValueExpr::parse(&json!({})).is_err());
    }

    /// Dice belong to `apply`. A guard that rolled them would consume the
    /// stream a replay depends on, so it evaluated to `null` instead - which
    /// made the guard skippable rather than loud.
    #[test]
    fn dice_are_refused_everywhere_a_guard_can_reach() {
        let rolled = json!({ "rng_int": { "min": 1, "max": 6 } });

        assert!(ValueExpr::parse_in(&rolled, &ParseScope::apply()).is_ok());
        assert!(ValueExpr::parse_in(&rolled, &ParseScope::guard()).is_err());

        let guard = Pred::parse(&json!({
            "pred": "field_eq",
            "node": { "ref": "target" },
            "field": "roll",
            "value": rolled,
        }))
        .expect_err("no dice in a guard");
        assert!(guard.message().contains("only an apply op may do"), "{guard}");

        // Including the condition of a `when`, which is evaluated exactly the
        // way a guard is.
        assert!(Op::parse(&json!({
            "op": "when",
            "cond": {
                "pred": "field_eq",
                "node": { "ref": "target" },
                "field": "roll",
                "value": { "rng_pick": [1, 2] },
            },
            "ops": [],
        }))
        .is_err());

        // And an apply op may still roll them.
        assert!(Op::parse(&json!({
            "op": "set_field",
            "node": { "ref": "target" },
            "field": "roll",
            "value": rolled,
        }))
        .is_ok());
    }

    #[test]
    fn refuses_an_rng_range_wider_than_javascript_can_draw_from() {
        assert!(ValueExpr::parse(&json!({ "rng_int": { "min": 0, "max": 10 } })).is_ok());
        assert!(ValueExpr::parse(&json!({ "rng_int": { "min": 5, "max": 4 } })).is_err());
        assert!(ValueExpr::parse(&json!({ "rng_int": { "min": 0, "max": 1.5 } })).is_err());
        assert!(ValueExpr::parse(&json!({ "rng_int": { "min": i64::MIN, "max": i64::MAX } }))
            .is_err());
        assert!(ValueExpr::parse(&json!({
            "rng_int": { "min": -MAX_SAFE_INT, "max": MAX_SAFE_INT },
        }))
        .is_err());
    }

    /// A `bind` means something inside the search that made it and nothing
    /// outside it. Accepting one in an apply op meant failing at dispatch,
    /// after the ops before it had already changed the world.
    #[test]
    fn a_bind_is_only_legal_inside_the_search_that_binds_it() {
        let matched = json!({
            "pred": "neighbor_where",
            "node": { "ref": "target" },
            "direction": "out",
            "edge_kind": "connected_to",
            "bind": "backlog",
            "matching": {
                "pred": "field_is_number",
                "node": { "bind": "backlog" },
                "field": "queue_len",
            },
        });
        assert!(Pred::parse(&matched).is_ok());

        // The default name is bound too.
        assert!(Pred::parse(&json!({
            "pred": "neighbor_where",
            "node": { "ref": "target" },
            "direction": "out",
            "matching": { "pred": "node_missing", "node": { "bind": DEFAULT_BIND } },
        }))
        .is_ok());

        // A different name is not.
        assert!(Pred::parse(&json!({
            "pred": "neighbor_where",
            "node": { "ref": "target" },
            "direction": "out",
            "bind": "backlog",
            "matching": { "pred": "node_missing", "node": { "bind": "other" } },
        }))
        .is_err());

        // Nor is one outside any search at all.
        assert!(Pred::parse(&json!({
            "pred": "node_missing",
            "node": { "bind": "backlog" },
        }))
        .is_err());

        let stray = Op::parse(&json!({
            "op": "set_field",
            "node": { "bind": "backlog" },
            "field": "queue_len",
            "value": { "const": 0 },
        }))
        .expect_err("apply ops bind nothing");
        assert!(stray.message().contains("no enclosing neighbor_where"), "{stray}");

        assert!(Op::parse(&json!({
            "op": "when",
            "cond": {
                "pred": "neighbor_where",
                "node": { "ref": "target" },
                "direction": "out",
                "bind": "backlog",
                "matching": { "pred": "node_missing", "node": { "bind": "backlog" } },
            },
            "ops": [{ "op": "remove_node", "node": { "bind": "backlog" } }],
        }))
        .is_err());
    }
}
