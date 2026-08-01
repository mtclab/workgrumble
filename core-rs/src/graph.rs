//! The entity graph: the only place world state lives.
//!
//! Unlike the TypeScript original this structure emits nothing by itself - a
//! mutation returns the event it caused and the caller (the world) decides
//! what reacts to it. That is what makes the ticket engine's reentrancy
//! expressible in Rust at all, and it keeps the graph a pure data structure.

use std::collections::BTreeMap;

use serde_json::Value as Json;

use crate::error::{EngineError, EngineResult};
use crate::events::GraphMutation;
use crate::hash::graph_snapshot_hash;
use crate::refuse;
use crate::schema::{is_edge_kind, validate_fields, validate_node, Edge, Fields, Node};
use crate::value::{js_str_cmp, FieldValue};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Direction {
    Out,
    In,
}

impl Direction {
    pub fn parse(value: &str) -> EngineResult<Self> {
        match value {
            "out" => Ok(Self::Out),
            "in" => Ok(Self::In),
            other => refuse!("Neighbor direction \"{other}\" is not \"in\" or \"out\"."),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct EntityGraph {
    nodes: BTreeMap<String, Node>,
    edges: Vec<Edge>,
}

impl EntityGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_node(&mut self, node: Node) -> EngineResult<GraphMutation> {
        if self.nodes.contains_key(&node.id) {
            let id = &node.id;
            return refuse!("Node \"{id}\" already exists.");
        }

        self.nodes.insert(node.id.clone(), node.clone());
        Ok(GraphMutation::NodeAdded { node })
    }

    pub fn add_node_json(&mut self, value: &Json) -> EngineResult<GraphMutation> {
        let node = validate_node(value)?;
        self.add_node(node)
    }

    pub fn remove_node(&mut self, id: &str) -> EngineResult<GraphMutation> {
        let node = self
            .nodes
            .remove(id)
            .ok_or_else(|| EngineError::new(format!("Node \"{id}\" does not exist.")))?;

        let mut removed = Vec::new();
        self.edges.retain(|edge| {
            if edge.from == id || edge.to == id {
                removed.push(edge.clone());
                false
            } else {
                true
            }
        });

        Ok(GraphMutation::NodeRemoved {
            node,
            edges: removed,
        })
    }

    pub fn set_field(
        &mut self,
        id: &str,
        field: &str,
        value: FieldValue,
    ) -> EngineResult<GraphMutation> {
        if field.is_empty() {
            return refuse!("Field name must be a non-empty string.");
        }

        let node = self
            .nodes
            .get(id)
            .ok_or_else(|| EngineError::new(format!("Node \"{id}\" does not exist.")))?;

        let previous = node.fields.get(field).cloned();
        let mut candidate = node.clone();
        candidate.fields.insert(field.to_owned(), value.clone());
        validate_fields(&candidate.kind, &candidate.fields)?;

        self.nodes.insert(id.to_owned(), candidate);

        Ok(GraphMutation::FieldSet {
            id: id.to_owned(),
            field: field.to_owned(),
            previous,
            value,
        })
    }

    /// Takes a field off a node entirely. The TypeScript graph had no such
    /// call - `clear_field` exists because the op language names it, and a
    /// missing field is genuinely different from a field set to null.
    pub fn clear_field(&mut self, id: &str, field: &str) -> EngineResult<Option<GraphMutation>> {
        let node = self
            .nodes
            .get_mut(id)
            .ok_or_else(|| EngineError::new(format!("Node \"{id}\" does not exist.")))?;

        let Some(previous) = node.fields.remove(field) else {
            return Ok(None);
        };

        if let Err(error) = validate_fields(&node.kind, &node.fields) {
            // Put it back: a refusal must leave the world exactly as it was.
            let node = self
                .nodes
                .get_mut(id)
                .ok_or_else(|| EngineError::new(format!("Node \"{id}\" does not exist.")))?;
            node.fields.insert(field.to_owned(), previous);
            return Err(error);
        }

        Ok(Some(GraphMutation::FieldSet {
            id: id.to_owned(),
            field: field.to_owned(),
            previous: Some(previous),
            value: FieldValue::Null,
        }))
    }

    pub fn add_edge(&mut self, edge: Edge) -> EngineResult<GraphMutation> {
        self.validate_edge_shape(&edge)?;

        if !self.nodes.contains_key(&edge.from) || !self.nodes.contains_key(&edge.to) {
            return refuse!("Both edge endpoints must exist.");
        }

        if self.edges.contains(&edge) {
            return refuse!("Duplicate edges are not allowed.");
        }

        self.edges.push(edge.clone());
        Ok(GraphMutation::EdgeAdded { edge })
    }

    pub fn remove_edge(&mut self, edge: Edge) -> EngineResult<GraphMutation> {
        self.validate_edge_shape(&edge)?;

        let Some(position) = self.edges.iter().position(|existing| *existing == edge) else {
            return refuse!("Edge does not exist.");
        };

        let removed = self.edges.remove(position);
        Ok(GraphMutation::EdgeRemoved { edge: removed })
    }

    fn validate_edge_shape(&self, edge: &Edge) -> EngineResult<()> {
        if edge.from.is_empty() || edge.to.is_empty() {
            return refuse!("Edge endpoints must be non-empty node ids.");
        }

        if !is_edge_kind(&edge.kind) {
            return refuse!("Edge kind is not supported.");
        }

        Ok(())
    }

    pub fn get_node(&self, id: &str) -> Option<&Node> {
        self.nodes.get(id)
    }

    pub fn get_field(&self, id: &str, field: &str) -> Option<&FieldValue> {
        self.nodes.get(id).and_then(|node| node.fields.get(field))
    }

    /// Every node, id-sorted in JavaScript string order. Readers depend on it.
    pub fn all_nodes(&self) -> Vec<&Node> {
        let mut nodes: Vec<&Node> = self.nodes.values().collect();
        nodes.sort_by(|left, right| js_str_cmp(&left.id, &right.id));
        nodes
    }

    /// Every node of one kind, in the same id order `all_nodes` uses.
    ///
    /// Filtered before it is sorted, which is the whole difference: the day
    /// loop asks for the tickets several times a minute, and this used to sort
    /// every node in the estate to hand back the four of them.
    pub fn nodes_of_kind(&self, kind: &str) -> Vec<&Node> {
        let mut nodes: Vec<&Node> = self
            .nodes
            .values()
            .filter(|node| node.kind == kind)
            .collect();
        nodes.sort_by(|left, right| js_str_cmp(&left.id, &right.id));
        nodes
    }

    pub fn neighbors(&self, id: &str, direction: Direction, edge_kind: Option<&str>) -> Vec<&Node> {
        if !self.nodes.contains_key(id) {
            return Vec::new();
        }

        let mut ids: Vec<&str> = Vec::new();

        for edge in &self.edges {
            if edge_kind.is_some_and(|kind| edge.kind != kind) {
                continue;
            }

            let candidate = match direction {
                Direction::Out if edge.from == id => Some(edge.to.as_str()),
                Direction::In if edge.to == id => Some(edge.from.as_str()),
                _ => None,
            };

            if let Some(candidate) = candidate {
                if !ids.contains(&candidate) {
                    ids.push(candidate);
                }
            }
        }

        ids.sort_by(|left, right| js_str_cmp(left, right));
        ids.into_iter()
            .filter_map(|id| self.nodes.get(id))
            .collect()
    }

    pub fn has_edge(&self, from: &str, to: &str, kind: &str) -> bool {
        self.edges
            .iter()
            .any(|edge| edge.from == from && edge.to == to && edge.kind == kind)
    }

    pub fn snapshot_hash(&self) -> String {
        graph_snapshot_hash(self.nodes.values(), self.edges.iter())
    }

    pub fn edges(&self) -> &[Edge] {
        &self.edges
    }
}

pub fn node_to_json(node: &Node) -> Json {
    let mut fields = serde_json::Map::new();

    for (name, value) in &node.fields {
        fields.insert(name.clone(), value.to_json());
    }

    serde_json::json!({
        "id": node.id,
        "kind": node.kind,
        "fields": Json::Object(fields),
    })
}

pub fn fields_to_json(fields: &Fields) -> Json {
    let mut out = serde_json::Map::new();

    for (name, value) in fields {
        out.insert(name.clone(), value.to_json());
    }

    Json::Object(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn graph_with_two_people() -> EntityGraph {
        let mut graph = EntityGraph::new();
        graph
            .add_node_json(&json!({ "id": "person:a", "kind": "person", "fields": {} }))
            .expect("add a");
        graph
            .add_node_json(&json!({ "id": "person:b", "kind": "person", "fields": {} }))
            .expect("add b");
        graph
    }

    #[test]
    fn refuses_duplicate_nodes_and_edges() {
        let mut graph = graph_with_two_people();
        assert!(graph
            .add_node_json(&json!({ "id": "person:a", "kind": "person", "fields": {} }))
            .is_err());

        let edge = Edge {
            from: "person:a".to_owned(),
            to: "person:b".to_owned(),
            kind: "owns".to_owned(),
        };
        graph.add_edge(edge.clone()).expect("first edge");
        assert_eq!(
            graph.add_edge(edge).expect_err("duplicate").message(),
            "Duplicate edges are not allowed."
        );
    }

    #[test]
    fn removing_a_node_cascades_its_edges() {
        let mut graph = graph_with_two_people();
        graph
            .add_edge(Edge {
                from: "person:a".to_owned(),
                to: "person:b".to_owned(),
                kind: "owns".to_owned(),
            })
            .expect("edge");

        let mutation = graph.remove_node("person:b").expect("remove");

        match mutation {
            GraphMutation::NodeRemoved { edges, .. } => assert_eq!(edges.len(), 1),
            other => panic!("unexpected mutation {other:?}"),
        }

        assert!(graph.edges().is_empty());
    }

    #[test]
    fn refuses_an_edge_to_a_node_that_is_not_there() {
        let mut graph = graph_with_two_people();
        let error = graph
            .add_edge(Edge {
                from: "person:a".to_owned(),
                to: "person:ghost".to_owned(),
                kind: "owns".to_owned(),
            })
            .expect_err("missing endpoint");

        assert_eq!(error.message(), "Both edge endpoints must exist.");
    }

    #[test]
    fn set_field_reports_the_previous_value() {
        let mut graph = graph_with_two_people();
        graph
            .set_field("person:a", "name", FieldValue::Str("Ada".to_owned()))
            .expect("first set");
        let mutation = graph
            .set_field("person:a", "name", FieldValue::Str("Ada W".to_owned()))
            .expect("second set");

        match mutation {
            GraphMutation::FieldSet { previous, .. } => {
                assert_eq!(
                    previous.and_then(|value| value.as_str().map(str::to_owned)),
                    Some("Ada".to_owned())
                );
            }
            other => panic!("unexpected mutation {other:?}"),
        }
    }

    #[test]
    fn set_field_refuses_a_value_the_schema_rejects() {
        let mut graph = graph_with_two_people();
        let error = graph
            .set_field("person:a", "name", FieldValue::Num(3.0))
            .expect_err("name must be a string");

        assert_eq!(error.message(), "Field \"name\" must be a string.");
        assert!(graph.get_field("person:a", "name").is_none());
    }

    #[test]
    fn neighbors_are_sorted_and_deduplicated() {
        let mut graph = graph_with_two_people();
        graph
            .add_node_json(&json!({ "id": "person:c", "kind": "person", "fields": {} }))
            .expect("add c");
        graph
            .add_edge(Edge {
                from: "person:a".to_owned(),
                to: "person:c".to_owned(),
                kind: "owns".to_owned(),
            })
            .expect("edge c");
        graph
            .add_edge(Edge {
                from: "person:a".to_owned(),
                to: "person:b".to_owned(),
                kind: "owns".to_owned(),
            })
            .expect("edge b");

        let ids: Vec<&str> = graph
            .neighbors("person:a", Direction::Out, Some("owns"))
            .into_iter()
            .map(|node| node.id.as_str())
            .collect();

        assert_eq!(ids, vec!["person:b", "person:c"]);
        assert!(graph
            .neighbors("person:ghost", Direction::Out, None)
            .is_empty());
    }

    #[test]
    fn clear_field_removes_the_key_and_restores_it_on_refusal() {
        let mut graph = EntityGraph::new();
        graph
            .add_node_json(&json!({
                "id": "ticket:x",
                "kind": "ticket",
                "fields": { "state": "open", "spawned_at": 0, "sla_deadline": 5, "note": "hi" },
            }))
            .expect("add ticket");

        graph.clear_field("ticket:x", "note").expect("clear note");
        assert!(graph.get_field("ticket:x", "note").is_none());
        assert!(graph
            .clear_field("ticket:x", "note")
            .expect("absent")
            .is_none());

        assert!(graph.clear_field("ticket:x", "state").is_err());
        assert!(graph.get_field("ticket:x", "state").is_some());
    }
}
