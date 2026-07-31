//! The boundary contract: JSON in, JSON out, and never a panic.
//!
//! Everything below the sweep is the happy path. The sweep itself is the
//! point: a panic across the wasm boundary poisons the module for the rest of
//! the session, which in a browser game means the desktop stops responding
//! mid-click - so every entry point is fed rubbish on purpose and has to
//! ANSWER. And answering is not just "ok is present": a refusal that emitted
//! events, or left the world one byte different, is a refusal that lied.

use core_rs::engine::Engine;
use serde_json::{json, Value as Json};

const MAX_SAFE: i64 = 9_007_199_254_740_991;

fn parse(payload: &str) -> Json {
    serde_json::from_str(payload).expect("boundary answers are always JSON")
}

fn fresh(seed: f64) -> Engine {
    Engine::new(seed).expect("a valid seed")
}

fn seeded() -> Engine {
    let mut engine = fresh(7.0);
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

/// A ticket that closes when `account:ada` unlocks, so a save has something
/// with bookkeeping in it.
fn lockout_ticket() -> Json {
    json!({
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
}

/* -- the refusal contract ------------------------------------------------- */

/// Which public call a case is aimed at. Every one of them takes a JSON
/// string, and every one of them is in the sweep.
#[derive(Clone, Copy, Debug)]
enum Entry {
    ApplySetup,
    RegisterActions,
    Dispatch,
    SpawnTicket,
    Restore,
    Query,
}

const ENTRIES: [Entry; 6] = [
    Entry::ApplySetup,
    Entry::RegisterActions,
    Entry::Dispatch,
    Entry::SpawnTicket,
    Entry::Restore,
    Entry::Query,
];

fn call(engine: &mut Engine, entry: Entry, payload: &str) -> String {
    match entry {
        Entry::ApplySetup => engine.apply_setup(payload),
        Entry::RegisterActions => engine.register_actions(payload),
        Entry::Dispatch => engine.dispatch(payload),
        Entry::SpawnTicket => engine.spawn_ticket(payload),
        Entry::Restore => engine.restore(payload),
        Entry::Query => engine.query(payload),
    }
}

/// What a refusal has to be, every time: a no, a sentence saying why, no
/// events, and a world that is byte-for-byte the one from before the call.
fn expect_refusal(engine: &mut Engine, entry: Entry, payload: &str, label: &str) {
    let before = engine.snapshot_hash();
    let now = engine.now();
    let answer = call(engine, entry, payload);
    let parsed = parse(&answer);

    assert_eq!(parsed["ok"], json!(false), "{label} was accepted: {answer}");
    assert!(
        parsed["reason"].as_str().is_some_and(|why| !why.is_empty()),
        "{label} refused without saying why: {answer}",
    );
    assert_eq!(
        parsed["events"].as_array().map_or(0, Vec::len),
        0,
        "{label} emitted events while refusing: {answer}",
    );
    assert_eq!(engine.snapshot_hash(), before, "{label} changed the world");
    assert_eq!(engine.now(), now, "{label} moved the clock");
}

/// The same contract for the calls that take a number rather than JSON.
fn expect_number_refusal(engine: &mut Engine, answer: String, label: &str, before: &str) {
    let parsed = parse(&answer);

    assert_eq!(parsed["ok"], json!(false), "{label} was accepted: {answer}");
    assert!(
        parsed["reason"].as_str().is_some_and(|why| !why.is_empty()),
        "{label} refused without saying why",
    );
    assert_eq!(parsed["events"].as_array().map_or(0, Vec::len), 0, "{label}");
    assert_eq!(engine.snapshot_hash(), before, "{label} changed the world");
}

/* -- the happy path ------------------------------------------------------- */

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
    engine.spawn_ticket(&lockout_ticket().to_string());
    engine.advance(4.0);
    let hash = engine.snapshot_hash();
    let now = engine.now();
    let saved = engine.serialize();

    let mut restored = fresh(1.0);
    let answer = parse(&restored.restore(&saved));
    assert_eq!(answer["ok"], json!(true));

    // A load replaces the world wholesale, and nothing else says so: an app
    // showing the previous session until an unrelated mutation happens along
    // is the bug this event exists to prevent.
    assert_eq!(
        answer["events"],
        json!([{ "type": "world:restored", "tick": 4 }]),
    );

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

/* -- the sweep ------------------------------------------------------------ */

/// Rubbish at every door. Some of these are legitimately VALID for one entry
/// point and nonsense for the rest (an empty array is an empty setup), so the
/// assertion is the contract rather than the verdict: whatever the answer is,
/// it is JSON with an `ok`, and if it is a refusal it is a complete one.
#[test]
fn every_entry_point_answers_rubbish_instead_of_panicking() {
    let deep_array = format!("{}1{}", "[".repeat(400), "]".repeat(400));
    let deep_object = format!("{}1{}", "{\"a\":".repeat(400), "}".repeat(400));
    let payloads = [
        "",
        "{",
        "null",
        "[]",
        "\"string\"",
        "123",
        "1e400",
        "-0",
        "{\"action\":null}",
        "{\"kind\":42}",
        "{\"action\":\"a\",\"actor\":\"b\",\"params\":[]}",
        "{\"action\":\"a\",\"actor\":\"b\",\"params\":{\"n\":1e400}}",
        "{\"op\":\"set_field\"}",
        "[{\"op\":\"addNode\"}]",
        "[{\"op\":\"addNode\",\"node\":{\"id\":\"x\",\"kind\":\"alien\",\"fields\":{}}}]",
        "{\"actions\":[{\"id\":\"a\",\"tier\":1,\"validate\":[{\"when\":{\"pred\":\"boom\"},\"reason\":\"r\"}]}]}",
        "{\"seed\":\"nope\"}",
        "{\"kind\":\"neighbors\",\"id\":\"x\",\"direction\":\"sideways\"}",
        "{\"kind\":\"get_field\",\"id\":\"x\"}",
        "{\"kind\":\"nope\"}",
        // A lone surrogate: legal UTF-16, not legal JSON text, and the shape
        // that turns into U+FFFD when something coerces instead of refusing.
        "{\"action\":\"\\ud800\",\"actor\":\"b\"}",
        "[{\"op\":\"setField\",\"id\":\"a\",\"field\":\"\\udfff\",\"value\":1}]",
        &deep_array,
        &deep_object,
    ];

    for payload in payloads {
        for entry in ENTRIES {
            let mut engine = seeded();
            let before = engine.snapshot_hash();
            let answer = call(&mut engine, entry, payload);
            let parsed: Json =
                serde_json::from_str(&answer).expect("the boundary always answers with JSON");

            assert!(
                parsed.get("ok").is_some(),
                "no ok in {answer} for {payload} at {entry:?}",
            );

            if parsed["ok"] == json!(false) {
                assert!(
                    parsed["reason"].as_str().is_some_and(|why| !why.is_empty()),
                    "{entry:?} refused {payload} without a reason",
                );
                assert_eq!(
                    parsed["events"].as_array().map_or(0, Vec::len),
                    0,
                    "{entry:?} emitted events refusing {payload}",
                );
                assert_eq!(
                    engine.snapshot_hash(),
                    before,
                    "{entry:?} changed the world refusing {payload}",
                );
            }

            // The engine is still usable after all that.
            assert!(!engine.snapshot_hash().is_empty());
            assert!(engine.tier() >= 0.0);
        }
    }
}

/* -- the clock ------------------------------------------------------------ */

/// The tab-freezer. `Number.MAX_SAFE_INTEGER` ticks is a synchronous loop of
/// quadrillions; `MAX_VALUE` is worse. Both used to be accepted.
#[test]
fn refuses_advances_no_browser_would_survive() {
    let mut engine = seeded();
    let before = engine.snapshot_hash();

    for ticks in [
        -1.0,
        1.5,
        f64::NAN,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::MAX,
        MAX_SAFE as f64,
        1_000_001.0,
        f64::MIN_POSITIVE,
    ] {
        let answer = engine.advance(ticks);
        expect_number_refusal(&mut engine, answer, &format!("advance({ticks})"), &before);
        assert_eq!(engine.now(), 0.0, "advance({ticks}) moved the clock");
    }

    assert_eq!(parse(&engine.advance(0.0))["ok"], json!(true));
    assert_eq!(parse(&engine.advance(1_000_000.0))["ok"], json!(true));
    assert_eq!(engine.now(), 1_000_000.0);
}

#[test]
fn refuses_a_restored_clock_outside_the_range_javascript_can_hold() {
    let mut engine = seeded();
    let saved: Json = parse(&engine.serialize());

    for tick in [
        json!(-1),
        json!(1.5),
        json!(9_007_199_254_740_992_i64),
        json!(i64::MAX),
        json!("4"),
        json!(null),
    ] {
        let mut broken = saved.clone();
        broken["clock"]["tick"] = tick.clone();
        expect_refusal(
            &mut engine,
            Entry::Restore,
            &broken.to_string(),
            &format!("restore tick {tick}"),
        );
    }

    // The last tick JavaScript can hold restores, and then refuses to move.
    let mut latest = saved.clone();
    latest["clock"]["tick"] = json!(MAX_SAFE);
    assert_eq!(parse(&engine.restore(&latest.to_string()))["ok"], json!(true));
    assert_eq!(parse(&engine.advance(1.0))["ok"], json!(false));
    assert_eq!(engine.now(), MAX_SAFE as f64);
}

/* -- numbers at the door -------------------------------------------------- */

#[test]
fn refuses_seeds_and_tiers_that_would_be_coerced_into_something_else() {
    for seed in [
        f64::INFINITY,
        f64::NAN,
        f64::MAX,
        1.5,
        -1.0,
        4_294_967_296.0,
        MAX_SAFE as f64,
    ] {
        assert!(Engine::new(seed).is_err(), "seed {seed} was accepted");
    }

    assert!(Engine::new(0.0).is_ok());
    assert!(Engine::new(4_294_967_295.0).is_ok());

    let mut engine = seeded();
    let before = engine.snapshot_hash();

    for tier in [-2.0, 1.5, f64::NAN, f64::INFINITY, 9_007_199_254_740_992.0] {
        let answer = engine.set_tier(tier);
        expect_number_refusal(&mut engine, answer, &format!("set_tier({tier})"), &before);
    }

    assert_eq!(parse(&engine.set_tier(3.0))["ok"], json!(true));
    assert_eq!(engine.tier(), 3.0);
    assert_eq!(parse(&engine.set_tier(MAX_SAFE as f64))["ok"], json!(true));
}

#[test]
fn refuses_a_saved_seed_that_does_not_fit_the_generator() {
    let mut engine = seeded();
    let saved: Json = parse(&engine.serialize());

    for key in ["seed", "rng_state"] {
        for value in [
            json!(4_294_967_296_i64),
            json!(-1),
            json!(1.5),
            json!(MAX_SAFE),
            json!("7"),
            json!(null),
        ] {
            let mut broken = saved.clone();
            broken[key] = value.clone();
            expect_refusal(
                &mut engine,
                Entry::Restore,
                &broken.to_string(),
                &format!("restore {key} = {value}"),
            );
        }
    }
}

/* -- absent, null, and the wrong type entirely ---------------------------- */

/// Three different things, and only two of them mean "not given". A target of
/// `42` used to mean "no target", which let an aimed action run aimlessly.
#[test]
fn refuses_a_request_field_of_the_wrong_type_rather_than_defaulting_it() {
    let mut engine = seeded();

    // The action that shows what "no target" quietly became: it aims at a
    // fixed node and has no target guards at all, so reading `target: 42` as
    // "no target" does not refuse anything - it MUTATES, on a request that was
    // plainly a mistake.
    let actions = engine.register_actions(
        &json!([{
            "id": "group.rename",
            "tier": 1,
            "apply": [{
                "op": "set_field",
                "node": { "id": "group:print" },
                "field": "name",
                "value": { "const": "Renamed by a request nobody wrote" },
            }],
        }])
        .to_string(),
    );
    assert_eq!(parse(&actions)["ok"], json!(true));

    for target in [json!(42), json!(true), json!([]), json!({})] {
        let payload = json!({
            "action": "account.unlock",
            "actor": "person:pat",
            "target": target,
            "params": {},
        });
        let answer = parse(&call(&mut engine, Entry::Dispatch, &payload.to_string()));

        assert_eq!(answer["ok"], json!(false), "dispatch target {target}");
        // Refused for what is actually wrong, not by falling through to the
        // "you did not pick anything" guard.
        assert_eq!(
            answer["reason"],
            json!("Dispatch \"target\" must be a node id or null."),
            "dispatch target {target}",
        );

        expect_refusal(
            &mut engine,
            Entry::Dispatch,
            &json!({
                "action": "group.rename",
                "actor": "person:pat",
                "target": target,
                "params": {},
            })
            .to_string(),
            &format!("fixed-target dispatch with target {target}"),
        );
    }

    assert_eq!(
        parse(
            &engine.query(
                &json!({ "kind": "get_field", "id": "group:print", "field": "name" }).to_string()
            )
        )["value"],
        json!("Print"),
    );

    // Absent and null both mean "no target", and the action says so itself.
    for payload in [
        json!({ "action": "account.unlock", "actor": "person:pat", "params": {} }),
        json!({ "action": "account.unlock", "actor": "person:pat", "target": null }),
    ] {
        let answer = parse(&engine.dispatch(&payload.to_string()));
        assert_eq!(answer["ok"], json!(false));
        assert_eq!(answer["reason"], json!("Pick an account first."));
    }

    // A neighbour query whose edge kind is not a string used to read as "no
    // filter", answering a narrow question with everything there is.
    for edge_kind in [json!(42), json!(true), json!(["owns"])] {
        let payload = json!({
            "kind": "neighbors",
            "id": "account:ada",
            "direction": "out",
            "edge_kind": edge_kind,
        });
        let answer = parse(&engine.query(&payload.to_string()));
        assert_eq!(answer["ok"], json!(false), "edge_kind {edge_kind}");
        assert!(answer["reason"].as_str().is_some_and(|why| !why.is_empty()));
    }
}

/* -- incoherent saves ----------------------------------------------------- */

fn saved_with_ticket() -> (Engine, Json) {
    let mut engine = seeded();
    engine.spawn_ticket(&lockout_ticket().to_string());
    let saved = parse(&engine.serialize());
    (engine, saved)
}

#[test]
fn refuses_a_save_from_another_engine_version() {
    let (mut engine, saved) = saved_with_ticket();

    // Derived from the current version rather than written out: a hard-coded
    // "the other version" becomes the CURRENT one the day the boundary shape
    // changes, and the gate then proves the opposite of what it claims.
    let newer = format!("{}.1", core_rs::ENGINE_VERSION);
    let versions = [
        json!("0.0.9"),
        json!(newer),
        json!(1),
        json!(null),
        json!(""),
    ];

    for version in versions {
        let mut broken = saved.clone();
        broken["version"] = version.clone();
        expect_refusal(
            &mut engine,
            Entry::Restore,
            &broken.to_string(),
            &format!("restore version {version}"),
        );
    }

    let mut without = saved.clone();
    without.as_object_mut().expect("object").remove("version");
    expect_refusal(
        &mut engine,
        Entry::Restore,
        &without.to_string(),
        "restore without a version",
    );
}

#[test]
fn refuses_a_save_missing_any_part_of_itself() {
    let (mut engine, saved) = saved_with_ticket();
    let keys = ["seed", "rng_state", "clock", "graph", "registry", "tickets"];

    for key in keys {
        let mut broken = saved.clone();
        broken.as_object_mut().expect("object").remove(key);
        expect_refusal(
            &mut engine,
            Entry::Restore,
            &broken.to_string(),
            &format!("restore without {key}"),
        );
    }

    for key in ["tick", "sla_running"] {
        let mut broken = saved.clone();
        broken["clock"]
            .as_object_mut()
            .expect("clock")
            .remove(key);
        expect_refusal(
            &mut engine,
            Entry::Restore,
            &broken.to_string(),
            &format!("restore without clock {key}"),
        );
    }

    for key in ["nodes", "edges"] {
        let mut broken = saved.clone();
        broken["graph"].as_object_mut().expect("graph").remove(key);
        expect_refusal(
            &mut engine,
            Entry::Restore,
            &broken.to_string(),
            &format!("restore without graph {key}"),
        );
    }

    for key in ["tier", "log", "actions", "kind_labels"] {
        let mut broken = saved.clone();
        broken["registry"]
            .as_object_mut()
            .expect("registry")
            .remove(key);
        expect_refusal(
            &mut engine,
            Entry::Restore,
            &broken.to_string(),
            &format!("restore without registry {key}"),
        );
    }

    // A service-clock flag that is not a boolean used to restore as "running",
    // which is a night's worth of SLA eaten by a load.
    let mut wrong = saved.clone();
    wrong["clock"]["sla_running"] = json!("yes");
    expect_refusal(
        &mut engine,
        Entry::Restore,
        &wrong.to_string(),
        "restore with a non-boolean sla_running flag",
    );

    // And the two the shell owns are not part of a save at all: a file that
    // still carries them is a file from a build that thought the engine knew
    // whether the player had paused it.
    let mut stale = saved.clone();
    stale["clock"]["paused"] = json!(false);
    stale["clock"]["speed"] = json!(2.0);
    let answer = parse(&engine.restore(&stale.to_string()));
    assert_eq!(answer["ok"], json!(true), "a save may carry spare keys");
}

/// A ticket record and its node are two halves of one claim. A save where they
/// disagree restores a ticket the engine can never move.
#[test]
fn refuses_a_save_whose_tickets_contradict_its_graph() {
    let (mut engine, saved) = saved_with_ticket();

    // Parked on the record, running in the graph.
    let mut waiting = saved.clone();
    waiting["tickets"][0]["waiting"] = json!(true);
    expect_refusal(
        &mut engine,
        Entry::Restore,
        &waiting.to_string(),
        "restore with a waiting mismatch",
    );

    // Resolved on the record, open in the graph.
    let mut resolved = saved.clone();
    resolved["tickets"][0]["resolved"] = json!(true);
    expect_refusal(
        &mut engine,
        Entry::Restore,
        &resolved.to_string(),
        "restore with a resolved mismatch",
    );

    // Breached on the record, not on the node.
    let mut breached = saved.clone();
    breached["tickets"][0]["breached"] = json!(true);
    expect_refusal(
        &mut engine,
        Entry::Restore,
        &breached.to_string(),
        "restore with a breach mismatch",
    );

    // A flag that is not there at all is not "false".
    for flag in ["waiting", "resolved", "breached"] {
        let mut missing = saved.clone();
        missing["tickets"][0]
            .as_object_mut()
            .expect("record")
            .remove(flag);
        expect_refusal(
            &mut engine,
            Entry::Restore,
            &missing.to_string(),
            &format!("restore without the {flag} flag"),
        );
    }

    // A record for a ticket that is not in the graph at all.
    let mut ghost = saved.clone();
    let nodes = ghost["graph"]["nodes"].as_array_mut().expect("nodes");
    nodes.retain(|node| node["id"] != json!("ticket:lock"));
    expect_refusal(
        &mut engine,
        Entry::Restore,
        &ghost.to_string(),
        "restore with a ghost ticket record",
    );

    // The same ticket twice, which used to restore as whichever came last.
    let mut twice = saved.clone();
    let record = twice["tickets"][0].clone();
    twice["tickets"].as_array_mut().expect("tickets").push(record);
    expect_refusal(
        &mut engine,
        Entry::Restore,
        &twice.to_string(),
        "restore with a duplicated ticket record",
    );

    // And the same node twice.
    let mut duplicated = saved.clone();
    let node = duplicated["graph"]["nodes"][0].clone();
    duplicated["graph"]["nodes"]
        .as_array_mut()
        .expect("nodes")
        .push(node);
    expect_refusal(
        &mut engine,
        Entry::Restore,
        &duplicated.to_string(),
        "restore with a duplicated node",
    );
}

/// The save that IS coherent still restores, or the checks above are just a
/// way of refusing everything.
#[test]
fn a_coherent_save_with_a_parked_ticket_restores() {
    let mut engine = seeded();
    engine.spawn_ticket(&lockout_ticket().to_string());

    let actions = engine.register_actions(
        &json!([{
            "id": "ticket.park",
            "tier": 1,
            "apply": [{ "op": "set_waiting", "node": { "ref": "target" }, "waiting": true }],
        }])
        .to_string(),
    );
    assert_eq!(parse(&actions)["ok"], json!(true));

    let parked = parse(
        &engine.dispatch(
            &json!({ "action": "ticket.park", "actor": "person:pat", "target": "ticket:lock" })
                .to_string(),
        ),
    );
    assert_eq!(parked["ok"], json!(true));

    let saved = engine.serialize();
    let hash = engine.snapshot_hash();
    let mut restored = fresh(2.0);

    assert_eq!(parse(&restored.restore(&saved))["ok"], json!(true));
    assert_eq!(restored.snapshot_hash(), hash);
    assert_eq!(
        parse(&restored.query(&json!({ "kind": "ticket_state", "id": "ticket:lock" }).to_string()))
            ["value"],
        json!("waiting_on_user"),
    );
}

/// A refused restore leaves the engine it was asked of exactly as it was -
/// still playable, still the same world.
#[test]
fn a_refused_restore_leaves_the_old_world_running() {
    let mut engine = seeded();
    let before = engine.snapshot_hash();

    expect_refusal(&mut engine, Entry::Restore, "{\"version\":\"0.0.1\"}", "old save");
    expect_refusal(&mut engine, Entry::Restore, "{}", "empty save");

    assert_eq!(engine.snapshot_hash(), before);
    assert_eq!(dispatch(&mut engine, Some("account:ada"))["ok"], json!(true));
}
