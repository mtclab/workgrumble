//! The assertion tree: the serializable expression a ticket is resolved by.
//!
//! Total by construction. A malformed expression is `false`, never an error
//! and never a panic - content is data, and a typo in a ticket file must not
//! be able to take the simulation down. The TypeScript version guards against
//! cyclic object graphs; JSON has no cycles, so the equivalent hazard here is
//! depth, and that is what `MAX_DEPTH` bounds.

use serde_json::Value as Json;

use crate::graph::{Direction, EntityGraph};
use crate::schema::{is_edge_kind, is_node_kind, Node};
use crate::value::FieldValue;

/// Deeper than any hand-written rule and shallower than the native stack.
const MAX_DEPTH: usize = 64;

#[derive(Clone, Debug)]
pub struct FieldMatch {
    pub field: String,
    pub value: FieldValue,
}

#[derive(Clone, Debug)]
pub enum Selector {
    Id(String),
    Kind {
        kind: String,
        where_matches: Vec<FieldMatch>,
    },
}

#[derive(Clone, Debug)]
pub enum Expr {
    And(Vec<Expr>),
    Or(Vec<Expr>),
    Not(Box<Expr>),
    Eq {
        selector: Selector,
        field: String,
        value: FieldValue,
    },
    Exists {
        kind: String,
        where_matches: Vec<FieldMatch>,
    },
    Edge {
        from: Selector,
        to: Selector,
        kind: String,
    },
}

fn parse_field_match(value: &Json) -> Option<FieldMatch> {
    let object = value.as_object()?;
    let field = object.get("field")?.as_str()?;

    if field.is_empty() {
        return None;
    }

    Some(FieldMatch {
        field: field.to_owned(),
        value: FieldValue::from_json(object.get("value")?)?,
    })
}

fn parse_field_matches(value: &Json) -> Option<Vec<FieldMatch>> {
    value.as_array()?.iter().map(parse_field_match).collect()
}

pub fn parse_selector(value: &Json) -> Option<Selector> {
    let object = value.as_object()?;
    let has_id = object.contains_key("id");
    let has_kind = object.contains_key("kind");
    let has_where = object.contains_key("where");

    if has_id {
        if has_kind || has_where {
            return None;
        }

        let id = object.get("id")?.as_str()?;
        return (!id.is_empty()).then(|| Selector::Id(id.to_owned()));
    }

    if !has_kind || !has_where {
        return None;
    }

    let kind = object.get("kind")?.as_str()?;

    if !is_node_kind(kind) {
        return None;
    }

    Some(Selector::Kind {
        kind: kind.to_owned(),
        where_matches: parse_field_matches(object.get("where")?)?,
    })
}

impl Expr {
    /// `isExpr` and the parse in one pass: what cannot be represented cannot
    /// be evaluated, so a bad tree never reaches the evaluator at all.
    pub fn parse(value: &Json) -> Option<Self> {
        Self::parse_at(value, 0)
    }

    fn parse_at(value: &Json, depth: usize) -> Option<Self> {
        if depth > MAX_DEPTH {
            return None;
        }

        let object = value.as_object()?;

        match object.get("op")?.as_str()? {
            operator @ ("and" | "or") => {
                let expressions: Option<Vec<Expr>> = object
                    .get("exprs")?
                    .as_array()?
                    .iter()
                    .map(|expr| Self::parse_at(expr, depth + 1))
                    .collect();
                let expressions = expressions?;

                Some(if operator == "and" {
                    Self::And(expressions)
                } else {
                    Self::Or(expressions)
                })
            }
            "not" => Some(Self::Not(Box::new(Self::parse_at(
                object.get("expr")?,
                depth + 1,
            )?))),
            "eq" => {
                let field = object.get("field")?.as_str()?;

                if field.is_empty() {
                    return None;
                }

                Some(Self::Eq {
                    selector: parse_selector(object.get("selector")?)?,
                    field: field.to_owned(),
                    value: FieldValue::from_json(object.get("value")?)?,
                })
            }
            "exists" => {
                let kind = object.get("kind")?.as_str()?;

                if !is_node_kind(kind) {
                    return None;
                }

                let where_matches = match object.get("where") {
                    Some(matches) => parse_field_matches(matches)?,
                    None => Vec::new(),
                };

                Some(Self::Exists {
                    kind: kind.to_owned(),
                    where_matches,
                })
            }
            "edge" => {
                let kind = object.get("kind")?.as_str()?;

                if !is_edge_kind(kind) {
                    return None;
                }

                Some(Self::Edge {
                    from: parse_selector(object.get("from")?)?,
                    to: parse_selector(object.get("to")?)?,
                    kind: kind.to_owned(),
                })
            }
            _ => None,
        }
    }

    /// Whether this rule can be satisfied by setting `field` to `value` - the
    /// question the escalate action asks a ticket about its own resolution.
    /// A `not` branch answers no: closing a ticket by making a negation true
    /// is not a thing the player can be told to do.
    pub fn accepts_field(&self, field: &str, value: &FieldValue) -> bool {
        match self {
            Self::And(expressions) | Self::Or(expressions) => expressions
                .iter()
                .any(|expr| expr.accepts_field(field, value)),
            Self::Not(_) => false,
            Self::Eq {
                field: candidate,
                value: expected,
                ..
            } => candidate == field && expected.same_value(value),
            Self::Exists { .. } | Self::Edge { .. } => false,
        }
    }
}

fn matches_fields(node: &Node, matches: &[FieldMatch]) -> bool {
    matches.iter().all(|candidate| {
        node.fields
            .get(&candidate.field)
            .is_some_and(|value| value.same_value(&candidate.value))
    })
}

/// Exactly one node, or nothing. Zero and many are the same answer, which is
/// what stops an ambiguous selector from silently picking a winner.
pub fn resolve_selector<'a>(graph: &'a EntityGraph, selector: &Selector) -> Option<&'a Node> {
    match selector {
        Selector::Id(id) => graph.get_node(id),
        Selector::Kind {
            kind,
            where_matches,
        } => {
            let mut matches = graph
                .nodes_of_kind(kind)
                .into_iter()
                .filter(|node| matches_fields(node, where_matches));
            let first = matches.next()?;

            match matches.next() {
                Some(_) => None,
                None => Some(first),
            }
        }
    }
}

pub fn evaluate(graph: &EntityGraph, expr: &Expr) -> bool {
    match expr {
        Expr::And(expressions) => expressions.iter().all(|expr| evaluate(graph, expr)),
        Expr::Or(expressions) => expressions.iter().any(|expr| evaluate(graph, expr)),
        Expr::Not(expr) => !evaluate(graph, expr),
        Expr::Eq {
            selector,
            field,
            value,
        } => resolve_selector(graph, selector).is_some_and(|node| {
            node.fields
                .get(field)
                .is_some_and(|actual| actual.same_value(value))
        }),
        Expr::Exists {
            kind,
            where_matches,
        } => graph
            .nodes_of_kind(kind)
            .into_iter()
            .any(|node| matches_fields(node, where_matches)),
        Expr::Edge { from, to, kind } => {
            let Some(from) = resolve_selector(graph, from) else {
                return false;
            };
            let Some(to) = resolve_selector(graph, to) else {
                return false;
            };

            graph
                .neighbors(&from.id, Direction::Out, Some(kind))
                .into_iter()
                .any(|node| node.id == to.id)
        }
    }
}

/// The public entry point: malformed in, `false` out.
pub fn evaluate_json(graph: &EntityGraph, value: &Json) -> bool {
    Expr::parse(value).is_some_and(|expr| evaluate(graph, &expr))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> EntityGraph {
        let mut graph = EntityGraph::new();
        graph
            .add_node_json(&json!({
                "id": "account:ada",
                "kind": "account",
                "fields": { "username": "ada", "locked": true },
            }))
            .expect("ada");
        graph
            .add_node_json(&json!({
                "id": "account:bev",
                "kind": "account",
                "fields": { "username": "bev", "locked": true },
            }))
            .expect("bev");
        graph
            .add_node_json(&json!({
                "id": "group:print",
                "kind": "group",
                "fields": { "name": "Print Users" },
            }))
            .expect("group");
        graph
            .add_edge(crate::schema::Edge {
                from: "account:ada".to_owned(),
                to: "group:print".to_owned(),
                kind: "member_of".to_owned(),
            })
            .expect("edge");
        graph
    }

    #[test]
    fn evaluates_the_leaf_operators() {
        let graph = fixture();

        assert!(evaluate_json(
            &graph,
            &json!({
                "op": "eq",
                "selector": { "id": "account:ada" },
                "field": "locked",
                "value": true,
            })
        ));
        assert!(!evaluate_json(
            &graph,
            &json!({
                "op": "eq",
                "selector": { "id": "account:ada" },
                "field": "missing",
                "value": true,
            })
        ));
        assert!(evaluate_json(
            &graph,
            &json!({ "op": "exists", "kind": "group" })
        ));
        assert!(!evaluate_json(
            &graph,
            &json!({ "op": "exists", "kind": "machine" })
        ));
        assert!(evaluate_json(
            &graph,
            &json!({
                "op": "edge",
                "from": { "id": "account:ada" },
                "to": { "id": "group:print" },
                "kind": "member_of",
            })
        ));
        assert!(!evaluate_json(
            &graph,
            &json!({
                "op": "edge",
                "from": { "id": "account:bev" },
                "to": { "id": "group:print" },
                "kind": "member_of",
            })
        ));
    }

    #[test]
    fn an_ambiguous_selector_is_false_rather_than_a_guess() {
        let graph = fixture();
        let ambiguous = json!({
            "op": "eq",
            "selector": { "kind": "account", "where": [{ "field": "locked", "value": true }] },
            "field": "locked",
            "value": true,
        });

        assert!(!evaluate_json(&graph, &ambiguous));

        let unambiguous = json!({
            "op": "eq",
            "selector": { "kind": "account", "where": [{ "field": "username", "value": "ada" }] },
            "field": "locked",
            "value": true,
        });

        assert!(evaluate_json(&graph, &unambiguous));
    }

    #[test]
    fn combines_and_negates() {
        let graph = fixture();
        let locked = json!({
            "op": "eq",
            "selector": { "id": "account:ada" },
            "field": "locked",
            "value": true,
        });

        assert!(evaluate_json(
            &graph,
            &json!({ "op": "and", "exprs": [locked] })
        ));
        assert!(evaluate_json(
            &graph,
            &json!({ "op": "or", "exprs": [locked] })
        ));
        assert!(!evaluate_json(
            &graph,
            &json!({ "op": "not", "expr": locked })
        ));
        // An empty `and` is vacuously true and an empty `or` is false, which
        // is what `every`/`some` do in the reference.
        assert!(evaluate_json(&graph, &json!({ "op": "and", "exprs": [] })));
        assert!(!evaluate_json(&graph, &json!({ "op": "or", "exprs": [] })));
    }

    #[test]
    fn malformed_expressions_are_false_and_never_panic() {
        let graph = fixture();

        for malformed in [
            json!(null),
            json!("open"),
            json!([]),
            json!({}),
            json!({ "op": "nope" }),
            json!({ "op": "and" }),
            json!({ "op": "and", "exprs": {} }),
            json!({ "op": "and", "exprs": [{ "op": "nope" }] }),
            json!({ "op": "not" }),
            json!({ "op": "eq", "selector": { "id": "" }, "field": "a", "value": 1 }),
            json!({ "op": "eq", "selector": { "id": "x", "kind": "person" }, "field": "a", "value": 1 }),
            json!({ "op": "eq", "selector": { "id": "x" }, "field": "", "value": 1 }),
            json!({ "op": "eq", "selector": { "id": "x" }, "field": "a", "value": [] }),
            json!({ "op": "exists", "kind": "alien" }),
            json!({ "op": "exists", "kind": "group", "where": [{ "field": "a" }] }),
            json!({ "op": "edge", "from": { "id": "a" }, "to": { "id": "b" }, "kind": "nope" }),
        ] {
            assert!(!evaluate_json(&graph, &malformed), "{malformed}");
        }
    }

    #[test]
    fn refuses_a_tree_deeper_than_the_stack_would_like() {
        let mut deep = json!({ "op": "exists", "kind": "group" });

        for _ in 0..(MAX_DEPTH + 5) {
            deep = json!({ "op": "not", "expr": deep });
        }

        assert!(Expr::parse(&deep).is_none());
    }

    #[test]
    fn reads_whether_a_rule_accepts_a_field() {
        let escalated = FieldValue::Bool(true);
        let accepts = Expr::parse(&json!({
            "op": "or",
            "exprs": [
                { "op": "eq", "selector": { "id": "t" }, "field": "escalated", "value": true },
                { "op": "eq", "selector": { "id": "s" }, "field": "status", "value": "running" },
            ],
        }))
        .expect("valid");

        assert!(accepts.accepts_field("escalated", &escalated));
        assert!(!accepts.accepts_field("breached", &escalated));

        let negated = Expr::parse(&json!({
            "op": "not",
            "expr": { "op": "eq", "selector": { "id": "t" }, "field": "escalated", "value": true },
        }))
        .expect("valid");

        assert!(!negated.accepts_field("escalated", &escalated));
    }
}
