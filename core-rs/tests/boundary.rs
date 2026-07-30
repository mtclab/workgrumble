//! The boundary contract: JSON in, JSON out, and never a panic.
//!
//! The last one is the point of the fuzz-ish sweep at the bottom. A panic
//! across the wasm boundary poisons the module for the rest of the session,
//! so every entry point is fed rubbish on purpose and has to answer instead.

use core_rs::engine::Engine;
use serde_json::{json, Value as Json};

fn parse(payload: &str) -> Json {
    serde_json::from_str(payload).expect("boundary answers are always JSON")
}

fn seeded() -> Engine {
    let mut engine = Engine::new(7);
    let setup = engine.apply_setup(
        &json!([
            { "op": "addNode", "node": { "id": "person:pat", "kind": "person", "fields": { "name": "Pat" } } },
            {
                "op": "addNode",
                "node": {
                    "id": "account:ada",
                    "kind": "account",
                    "fields": { "username": "ada", "locked": true },
                },
            },
            { "op": "addNode", "node": { "id": "group:print", "kind": "group", "fields": { "name": "Print" } } },
        ])
        .to_string(),
    );
    assert_eq!(parse(&setup)["ok"], json!(true));

    let actions = engine.register_actions(
        &json!({
            "kind_labels": { "account": "an account", "group": "a group" },
            "actions": [{
                "id": "account.unlock",
                "tier": 1,
                "validate": [
                    { "when": { "pred": "target_missing" }, "reason": "Pick an account first." },
                    {
                        "when": { "pred": "not", "of": { "pred": "field_eq", "node": { "ref": "target" }, "field": "locked", "value": { "const": true } } },
                        "reason": "\"{target.label}\" is not locked.",
                    },
                ],
                "apply": [{
                    "op": "set_field",
                    "node": { "ref": "target" },
                    "field": "locked",
                    "value": { "const": false },
                }],
            }],
        })
        .to_string(),
    );
    assert_eq!(parse(&actions)["ok"], json!(true));
    engine
}

fn dispatch(engine: &mut Engine, target: Option<&str>) -> Json {
    parse(
        &engine.dispatch(
            &json!({
                "action": "account.unlock",
                "actor": "person:pat",
                "target": target,
                "params": {},
            })
            .to_string(),
        ),
    )
}

#[test]
fn a_dispatch_answers_with_its_events() {
    let mut engine = seeded();
    let answer = dispatch(&mut engine, Some("account:ada"));

    assert_eq!(answer["ok"], json!(true));
    assert_eq!(answer["events"].as_array().expect("events").len(), 1);
    assert_eq!(answer["events"][0]["type"], json!("graph:mutated"));
    assert_eq!(answer["events"][0]["mutation"]["type"], json!("field:set"));
    assert_eq!(answer["events"][0]["mutation"]["previous"], json!(true));
    assert_eq!(answer["events"][0]["mutation"]["value"], json!(false));

    let refusal = dispatch(&mut engine, Some("account:ada"));
    assert_eq!(refusal["ok"], json!(false));
    assert_eq!(refusal["reason"], json!("\"ada\" is not locked."));
    assert_eq!(refusal["events"].as_array().expect("events").len(), 0);

    let log = parse(&engine.dispatch_log());
    assert_eq!(log.as_array().expect("log").len(), 2);
    assert_eq!(log[0]["ok"], json!(true));
    assert!(log[0].get("reason").is_none());
    assert_eq!(log[1]["reason"], json!("\"ada\" is not locked."));
}

#[test]
fn queries_answer_the_read_only_questions() {
    let engine = seeded();

    let node =
        parse(&engine.query(&json!({ "kind": "get_node", "id": "account:ada" }).to_string()));
    assert_eq!(node["value"]["kind"], json!("account"));

    let missing =
        parse(&engine.query(&json!({ "kind": "get_node", "id": "account:nobody" }).to_string()));
    assert_eq!(missing["value"], Json::Null);

    let field = parse(&engine.query(
        &json!({ "kind": "get_field", "id": "account:ada", "field": "locked" }).to_string(),
    ));
    assert_eq!(field["value"], json!(true));

    let of_kind = parse(
        &engine.query(&json!({ "kind": "nodes_of_kind", "node_kind": "account" }).to_string()),
    );
    assert_eq!(of_kind["value"].as_array().expect("array").len(), 1);

    let all = parse(&engine.query(&json!({ "kind": "all_nodes" }).to_string()));
    assert_eq!(all["value"].as_array().expect("array").len(), 3);

    let neighbours = parse(&engine.query(
        &json!({ "kind": "neighbors", "id": "account:ada", "direction": "out" }).to_string(),
    ));
    assert_eq!(neighbours["value"].as_array().expect("array").len(), 0);

    let assertion = parse(
        &engine.query(
            &json!({
                "kind": "evaluate_expr",
                "expr": {
                    "op": "eq",
                    "selector": { "id": "account:ada" },
                    "field": "locked",
                    "value": true,
                },
            })
            .to_string(),
        ),
    );
    assert_eq!(assertion["value"], json!(true));

    let ids = parse(&engine.query(&json!({ "kind": "action_ids" }).to_string()));
    assert_eq!(ids["value"], json!(["account.unlock"]));
}

#[test]
fn state_survives_a_serialize_and_restore() {
    let mut engine = seeded();
    engine.spawn_ticket(
        &json!({
            "id": "ticket:lock",
            "archetype": "hidden_cause",
            "flavor": { "title": "Locked out", "body": "Again." },
            "reporter": "person:pat",
            "setup": [],
            "resolved_when": {
                "op": "eq",
                "selector": { "id": "account:ada" },
                "field": "locked",
                "value": false,
            },
            "sla_ticks": 12,
            "reward": { "reputation": 1, "money": 1 },
            "kb_ref": "kb/lockout",
        })
        .to_string(),
    );
    engine.advance(4.0);
    let hash = engine.snapshot_hash();
    let now = engine.now();
    let saved = engine.serialize();

    let mut restored = Engine::new(1);
    assert_eq!(parse(&restored.restore(&saved))["ok"], json!(true));

    assert_eq!(restored.snapshot_hash(), hash);
    assert_eq!(restored.now(), now);
    assert_eq!(restored.dispatch_log(), engine.dispatch_log());
    assert_eq!(
        parse(
            &restored
                .query(&json!({ "kind": "ticket_registered", "id": "ticket:lock" }).to_string())
        )["value"],
        json!(true),
    );

    // And it is still a live engine, not a snapshot: the ticket it restored
    // resolves on the next real mutation, exactly as it would have on the
    // engine the state came from.
    assert_eq!(
        dispatch(&mut restored, Some("account:ada"))["ok"],
        json!(true)
    );
    assert_eq!(
        parse(&restored.query(&json!({ "kind": "ticket_state", "id": "ticket:lock" }).to_string()))
            ["value"],
        json!("resolved"),
    );

    assert_eq!(
        dispatch(&mut engine, Some("account:ada"))["ok"],
        json!(true)
    );
    assert_eq!(restored.snapshot_hash(), engine.snapshot_hash());
}

#[test]
fn every_entry_point_refuses_rubbish_instead_of_panicking() {
    let payloads = [
        "",
        "{",
        "null",
        "[]",
        "\"string\"",
        "123",
        "{\"action\":null}",
        "{\"kind\":42}",
        "{\"action\":\"a\",\"actor\":\"b\",\"params\":[]}",
        "{\"op\":\"set_field\"}",
        "[{\"op\":\"addNode\"}]",
        "[{\"op\":\"addNode\",\"node\":{\"id\":\"x\",\"kind\":\"alien\",\"fields\":{}}}]",
        "{\"actions\":[{\"id\":\"a\",\"tier\":1,\"validate\":[{\"when\":{\"pred\":\"boom\"},\"reason\":\"r\"}]}]}",
        "{\"seed\":\"nope\"}",
        "{\"kind\":\"neighbors\",\"id\":\"x\",\"direction\":\"sideways\"}",
        "{\"kind\":\"get_field\",\"id\":\"x\"}",
        "{\"kind\":\"nope\"}",
    ];

    for payload in payloads {
        let mut engine = seeded();

        for answer in [
            engine.apply_setup(payload),
            engine.register_actions(payload),
            engine.dispatch(payload),
            engine.spawn_ticket(payload),
            engine.restore(payload),
            engine.query(payload),
        ] {
            let parsed: Json =
                serde_json::from_str(&answer).expect("the boundary always answers with JSON");
            assert!(
                parsed.get("ok").is_some(),
                "no ok in {answer} for {payload}"
            );
        }

        // The engine is still usable after all that.
        assert!(!engine.snapshot_hash().is_empty());
    }
}

#[test]
fn refuses_impossible_clock_and_tier_values() {
    let mut engine = seeded();

    assert_eq!(parse(&engine.advance(-1.0))["ok"], json!(false));
    assert_eq!(parse(&engine.advance(1.5))["ok"], json!(false));
    assert_eq!(parse(&engine.advance(f64::NAN))["ok"], json!(false));
    assert_eq!(parse(&engine.advance(0.0))["ok"], json!(true));
    assert_eq!(engine.now(), 0.0);

    assert_eq!(parse(&engine.set_tier(-2))["ok"], json!(false));
    assert_eq!(parse(&engine.set_tier(3))["ok"], json!(true));
    assert_eq!(engine.tier(), 3);
}
