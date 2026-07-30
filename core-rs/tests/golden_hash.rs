//! The determinism gate, ported whole.
//!
//! Same eight-node scenario, same fifteen scripted dispatches, same rng-driven
//! actions - only now the actions are written in the op language instead of as
//! closures. If this hash ever stops being `4a07e554b7acbd22`, either the
//! serialization, the rng or the action semantics drifted from the reference,
//! and all three are load-bearing.

use core_rs::actions::parse_params;
use core_rs::world::World;
use serde_json::{json, Value as Json};

const GOLDEN_SCENARIO_HASH: &str = "4a07e554b7acbd22";
const ACTOR: &str = "person:tech";

fn kind_guards(kind: &str) -> Json {
    json!([
        { "when": { "pred": "target_missing" }, "reason": "Target is required." },
        {
            "when": {
                "pred": "any",
                "of": [
                    { "pred": "node_missing", "node": { "ref": "target" } },
                    { "pred": "not", "of": { "pred": "kind_is", "node": { "ref": "target" }, "kind": kind } },
                ],
            },
            "reason": format!("Target must be {kind}."),
        },
    ])
}

fn scenario_actions() -> Json {
    json!([
        {
            "id": "service.jostle",
            "tier": 1,
            "validate": kind_guards("service"),
            "apply": [{
                "op": "set_field",
                "node": { "ref": "target" },
                "field": "status",
                "value": { "rng_pick": ["running", "stopped", "wedged"] },
            }],
        },
        {
            "id": "account.roll-lock",
            "tier": 1,
            "validate": kind_guards("account"),
            "apply": [{
                "op": "set_field",
                "node": { "ref": "target" },
                "field": "locked",
                "value": { "eq": [{ "rng_int": { "min": 0, "max": 1 } }, { "const": 1 }] },
            }],
        },
        {
            "id": "machine.rotate",
            "tier": 1,
            "validate": kind_guards("machine"),
            "apply": [{
                "op": "set_field",
                "node": { "ref": "target" },
                "field": "display_rotation",
                "value": { "rng_pick": [0, 90, 180, 270] },
            }],
        },
        {
            "id": "device.toggle",
            "tier": 1,
            "validate": [
                { "when": { "pred": "target_missing" }, "reason": "Target is required." },
                {
                    "when": {
                        "pred": "any",
                        "of": [
                            { "pred": "node_missing", "node": { "ref": "target" } },
                            { "pred": "not", "of": { "pred": "kind_is", "node": { "ref": "target" }, "kind": "device" } },
                        ],
                    },
                    "reason": "Target must be device.",
                },
                {
                    "when": { "pred": "not", "of": { "pred": "field_is_bool", "node": { "ref": "target" }, "field": "powered" } },
                    "reason": "Device requires a powered field.",
                },
            ],
            "apply": [{
                "op": "set_field",
                "node": { "ref": "target" },
                "field": "powered",
                "value": { "not_field": { "node": { "ref": "target" }, "field": "powered" } },
            }],
        },
        {
            "id": "field.set",
            "tier": 1,
            "validate": [
                {
                    "when": {
                        "pred": "any",
                        "of": [
                            { "pred": "target_missing" },
                            { "pred": "node_missing", "node": { "ref": "target" } },
                        ],
                    },
                    "reason": "Existing target is required.",
                },
                {
                    "when": {
                        "pred": "any",
                        "of": [
                            { "pred": "param_string_missing", "param": "field" },
                            { "pred": "param_absent", "param": "value" },
                        ],
                    },
                    "reason": "Field and value params are required.",
                },
            ],
            "apply": [{
                "op": "set_field",
                "node": { "ref": "target" },
                "field": { "param": "field" },
                "value": { "param": "value" },
            }],
        },
    ])
}

fn scenario_setup() -> Json {
    json!([
        { "op": "addNode", "node": { "id": "person:tech", "kind": "person", "fields": { "name": "Player Tech" } } },
        { "op": "addNode", "node": { "id": "person:ada", "kind": "person", "fields": { "name": "Ada User" } } },
        { "op": "addNode", "node": { "id": "account:ada", "kind": "account", "fields": { "username": "ada", "locked": true } } },
        {
            "op": "addNode",
            "node": {
                "id": "machine:ada",
                "kind": "machine",
                "fields": { "hostname": "ADA-PC", "display_rotation": 0, "resolution": "800x600" },
            },
        },
        {
            "op": "addNode",
            "node": {
                "id": "device:printer",
                "kind": "device",
                "fields": { "name": "Printer", "type": "printer", "powered": true },
            },
        },
        {
            "op": "addNode",
            "node": {
                "id": "service:spooler",
                "kind": "service",
                "fields": { "name": "Print Spooler", "status": "wedged" },
            },
        },
        { "op": "addNode", "node": { "id": "group:print-users", "kind": "group", "fields": { "name": "Print Users" } } },
        { "op": "addNode", "node": { "id": "share:common", "kind": "share", "fields": { "name": "Common", "path": "/common" } } },
        { "op": "addEdge", "edge": { "from": "person:ada", "to": "account:ada", "kind": "owns" } },
        { "op": "addEdge", "edge": { "from": "person:ada", "to": "machine:ada", "kind": "owns" } },
        { "op": "addEdge", "edge": { "from": "account:ada", "to": "group:print-users", "kind": "member_of" } },
        { "op": "addEdge", "edge": { "from": "account:ada", "to": "share:common", "kind": "has_access" } },
        { "op": "addEdge", "edge": { "from": "device:printer", "to": "machine:ada", "kind": "connected_to" } },
        { "op": "addEdge", "edge": { "from": "service:spooler", "to": "machine:ada", "kind": "runs_on" } },
    ])
}

/// (advance, action, target, params) - the committed script, step for step.
fn script() -> Vec<(i64, &'static str, &'static str, Json)> {
    vec![
        (0, "service.jostle", "service:spooler", json!({})),
        (0, "account.roll-lock", "account:ada", json!({})),
        (1, "machine.rotate", "machine:ada", json!({})),
        (0, "device.toggle", "device:printer", json!({})),
        (
            2,
            "field.set",
            "share:common",
            json!({ "field": "quota_gb", "value": 12 }),
        ),
        (0, "service.jostle", "service:spooler", json!({})),
        (1, "account.roll-lock", "account:ada", json!({})),
        (0, "machine.rotate", "machine:ada", json!({})),
        (
            3,
            "field.set",
            "machine:ada",
            json!({ "field": "resolution", "value": "1024x768" }),
        ),
        (0, "device.toggle", "device:printer", json!({})),
        (0, "service.jostle", "service:spooler", json!({})),
        (
            1,
            "field.set",
            "account:ada",
            json!({ "field": "note", "value": "checked by scripted replay" }),
        ),
        (0, "account.roll-lock", "account:ada", json!({})),
        (2, "machine.rotate", "machine:ada", json!({})),
        (
            0,
            "field.set",
            "share:common",
            json!({ "field": "archived", "value": false }),
        ),
    ]
}

fn scenario() -> World {
    let mut world = World::new(0x5eed_1234);
    world
        .apply_setup(&scenario_setup())
        .expect("scenario setup");
    world
        .register_actions(&scenario_actions())
        .expect("scenario actions");
    world
}

fn run_script(world: &mut World) {
    for (advance, id, target, params) in script() {
        world.advance(advance).expect("clock advance");
        let params = parse_params(Some(&params)).expect("params");
        let result = world.dispatch(id, ACTOR, Some(target), params);

        assert!(result.is_ok(), "scenario action failed: {result:?}");
    }
}

#[test]
fn reproduces_the_committed_golden_hash() {
    let mut first = scenario();
    let mut second = scenario();

    run_script(&mut first);
    run_script(&mut second);

    assert_eq!(first.registry.log().len(), 15);
    assert_eq!(first.graph.snapshot_hash(), second.graph.snapshot_hash());
    assert_eq!(first.graph.snapshot_hash(), GOLDEN_SCENARIO_HASH);
}

#[test]
fn replays_a_captured_log_into_the_same_hash() {
    let mut source = scenario();
    run_script(&mut source);

    let log: Vec<Json> = source
        .registry
        .log()
        .iter()
        .map(core_rs::actions::DispatchLogEntry::to_json)
        .collect();

    let mut replayed = scenario();

    for entry in &log {
        let tick = entry["tick"].as_i64().expect("tick");
        let ticks_to_go = tick - replayed.clock.now();
        assert!(ticks_to_go >= 0, "replay ticks must be ordered");
        replayed.advance(ticks_to_go).expect("advance");

        let params = parse_params(entry.get("params")).expect("params");
        let result = replayed.dispatch(
            entry["id"].as_str().expect("id"),
            entry["actor"].as_str().expect("actor"),
            entry["target"].as_str(),
            params,
        );

        assert_eq!(result.is_ok(), entry["ok"].as_bool().expect("ok"));
    }

    assert_eq!(replayed.clock.now(), source.clock.now());
    assert_eq!(replayed.graph.snapshot_hash(), source.graph.snapshot_hash());
    assert_eq!(replayed.graph.snapshot_hash(), GOLDEN_SCENARIO_HASH);
}
