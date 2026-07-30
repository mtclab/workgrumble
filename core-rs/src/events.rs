//! What the engine tells the outside world, in the order it happened.
//!
//! The TypeScript engine pushed these through a synchronous event bus; across
//! a wasm boundary a callback per mutation is both slow and a determinism
//! hazard, so every call returns its events instead. The order is the order
//! the bus fired them, which is what keeps the two engines comparable.

use serde_json::{json, Value as Json};

use crate::schema::{Edge, Node};
use crate::value::FieldValue;

#[derive(Clone, Debug)]
pub enum GraphMutation {
    NodeAdded {
        node: Node,
    },
    NodeRemoved {
        node: Node,
        edges: Vec<Edge>,
    },
    FieldSet {
        id: String,
        field: String,
        previous: Option<FieldValue>,
        value: FieldValue,
    },
    EdgeAdded {
        edge: Edge,
    },
    EdgeRemoved {
        edge: Edge,
    },
}

#[derive(Clone, Debug)]
pub enum EngineEvent {
    GraphMutated(GraphMutation),
    TicketSpawned(String),
    TicketResolved(String),
    TicketBreached(String),
}

fn node_json(node: &Node) -> Json {
    let mut fields = serde_json::Map::new();

    for (name, value) in &node.fields {
        fields.insert(name.clone(), value.to_json());
    }

    json!({ "id": node.id, "kind": node.kind, "fields": Json::Object(fields) })
}

fn edge_json(edge: &Edge) -> Json {
    json!({ "from": edge.from, "to": edge.to, "kind": edge.kind })
}

impl GraphMutation {
    pub fn to_json(&self) -> Json {
        match self {
            Self::NodeAdded { node } => json!({ "type": "node:added", "node": node_json(node) }),
            Self::NodeRemoved { node, edges } => json!({
                "type": "node:removed",
                "node": node_json(node),
                "edges": edges.iter().map(edge_json).collect::<Vec<Json>>(),
            }),
            Self::FieldSet {
                id,
                field,
                previous,
                value,
            } => {
                let mut payload = serde_json::Map::new();
                payload.insert("type".to_owned(), json!("field:set"));
                payload.insert("id".to_owned(), json!(id));
                payload.insert("field".to_owned(), json!(field));

                // `previous` is absent, not null, when the field was unset -
                // the TypeScript payload leaves the key off and `null` is a
                // legitimate previous value.
                if let Some(previous) = previous {
                    payload.insert("previous".to_owned(), previous.to_json());
                }

                payload.insert("value".to_owned(), value.to_json());
                Json::Object(payload)
            }
            Self::EdgeAdded { edge } => json!({ "type": "edge:added", "edge": edge_json(edge) }),
            Self::EdgeRemoved { edge } => {
                json!({ "type": "edge:removed", "edge": edge_json(edge) })
            }
        }
    }
}

impl EngineEvent {
    pub fn to_json(&self) -> Json {
        match self {
            Self::GraphMutated(mutation) => json!({
                "type": "graph:mutated",
                "mutation": mutation.to_json(),
            }),
            Self::TicketSpawned(id) => json!({ "type": "ticket:spawned", "id": id }),
            Self::TicketResolved(id) => json!({ "type": "ticket:resolved", "id": id }),
            Self::TicketBreached(id) => json!({ "type": "ticket:breached", "id": id }),
        }
    }
}

pub fn events_to_json(events: &[EngineEvent]) -> Json {
    Json::Array(events.iter().map(EngineEvent::to_json).collect())
}
