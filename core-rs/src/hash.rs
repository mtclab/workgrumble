//! The snapshot hash: stable serialization, then FNV-1a 64.
//!
//! This is the determinism gate for the whole game, and it is shared with the
//! TypeScript reference implementation - the serialization below reproduces
//! `JSON.stringify` over the exact array-of-arrays shape `hash.ts` builds, and
//! the golden constant `4a07e554b7acbd22` is what proves it.

use crate::schema::{Edge, Node};
use crate::value::{js_str_cmp, quote_json_string};

const FNV64_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV64_PRIME: u64 = 0x0000_0100_0000_01b3;

/// FNV-1a over the UTF-8 bytes of `value`, as 16 lower-case hex digits.
pub fn fnv1a64(value: &str) -> String {
    let mut hash = FNV64_OFFSET;

    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV64_PRIME);
    }

    format!("{hash:016x}")
}

/// Nodes by id, fields by name, edges by (from, to, kind) - all in JavaScript
/// string order, because that is the order the golden hash was taken in.
pub fn stable_serialize_graph<'a>(
    nodes: impl Iterator<Item = &'a Node>,
    edges: impl Iterator<Item = &'a Edge>,
) -> String {
    let mut nodes: Vec<&Node> = nodes.collect();
    nodes.sort_by(|left, right| js_str_cmp(&left.id, &right.id));

    let mut edges: Vec<&Edge> = edges.collect();
    edges.sort_by(|left, right| {
        js_str_cmp(&left.from, &right.from)
            .then_with(|| js_str_cmp(&left.to, &right.to))
            .then_with(|| js_str_cmp(&left.kind, &right.kind))
    });

    let mut out = String::from("{\"nodes\":[");

    for (index, node) in nodes.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }

        out.push('[');
        out.push_str(&quote_json_string(&node.id));
        out.push(',');
        out.push_str(&quote_json_string(&node.kind));
        out.push_str(",[");

        let mut fields: Vec<(&String, &crate::value::FieldValue)> = node.fields.iter().collect();
        fields.sort_by(|(left, _), (right, _)| js_str_cmp(left, right));

        for (position, (name, value)) in fields.iter().enumerate() {
            if position > 0 {
                out.push(',');
            }

            out.push('[');
            out.push_str(&quote_json_string(name));
            out.push(',');
            out.push_str(&value.to_json_fragment());
            out.push(']');
        }

        out.push_str("]]");
    }

    out.push_str("],\"edges\":[");

    for (index, edge) in edges.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }

        out.push('[');
        out.push_str(&quote_json_string(&edge.from));
        out.push(',');
        out.push_str(&quote_json_string(&edge.to));
        out.push(',');
        out.push_str(&quote_json_string(&edge.kind));
        out.push(']');
    }

    out.push_str("]}");
    out
}

pub fn graph_snapshot_hash<'a>(
    nodes: impl Iterator<Item = &'a Node>,
    edges: impl Iterator<Item = &'a Edge>,
) -> String {
    fnv1a64(&stable_serialize_graph(nodes, edges))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::Fields;
    use crate::value::FieldValue;

    fn node(id: &str, kind: &str, fields: &[(&str, FieldValue)]) -> Node {
        let mut map = Fields::new();

        for (name, value) in fields {
            map.insert((*name).to_owned(), value.clone());
        }

        Node {
            id: id.to_owned(),
            kind: kind.to_owned(),
            fields: map,
        }
    }

    #[test]
    fn hashes_the_empty_graph_like_the_reference() {
        // JSON.stringify({ nodes: [], edges: [] }) hashed by fnv1a64.
        assert_eq!(
            stable_serialize_graph([].iter(), [].iter()),
            "{\"nodes\":[],\"edges\":[]}"
        );
        assert_eq!(fnv1a64("{\"nodes\":[],\"edges\":[]}"), "6bfba53abafb837a");
    }

    #[test]
    fn sorts_nodes_fields_and_edges() {
        let nodes = [
            node(
                "b",
                "person",
                &[
                    ("z", FieldValue::Num(1.0)),
                    ("a", FieldValue::Str("x".to_owned())),
                ],
            ),
            node("a", "person", &[]),
        ];
        let edges = [
            Edge {
                from: "b".to_owned(),
                to: "a".to_owned(),
                kind: "owns".to_owned(),
            },
            Edge {
                from: "a".to_owned(),
                to: "b".to_owned(),
                kind: "owns".to_owned(),
            },
        ];

        assert_eq!(
            stable_serialize_graph(nodes.iter(), edges.iter()),
            "{\"nodes\":[[\"a\",\"person\",[]],[\"b\",\"person\",[[\"a\",\"x\"],[\"z\",1]]]],\
             \"edges\":[[\"a\",\"b\",\"owns\"],[\"b\",\"a\",\"owns\"]]}"
        );
    }

    #[test]
    fn renders_every_field_value_shape() {
        let nodes = [node(
            "n",
            "person",
            &[
                ("bool", FieldValue::Bool(false)),
                ("null", FieldValue::Null),
                ("float", FieldValue::Num(1.5)),
                ("int", FieldValue::Num(-3.0)),
                ("text", FieldValue::Str("a\"b".to_owned())),
            ],
        )];

        assert_eq!(
            stable_serialize_graph(nodes.iter(), [].iter()),
            "{\"nodes\":[[\"n\",\"person\",[[\"bool\",false],[\"float\",1.5],\
             [\"int\",-3],[\"null\",null],[\"text\",\"a\\\"b\"]]]],\"edges\":[]}"
        );
    }
}
