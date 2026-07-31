//! The dispatch log's checkpoint/drain policy, through the boundary.
//!
//! The log is append-only and every save carries it, so a career-long log is a
//! save that grows forever. The answer is a baseline: a checkpoint is the world
//! at tick N, the log holds what happened since, and replay is defined against
//! the checkpoint rather than against the first morning of the career. The day
//! loop takes one at each day boundary.
//!
//! These are the gates for that claim. They fail if a checkpoint moves the
//! world, if the drained log is not actually drained, if a replay from the
//! baseline lands anywhere else, or if a refusal is lost on the way through a
//! save.

use serde_json::{json, Value as Json};

use core_rs::engine::Engine;

fn setup() -> Json {
    json!([
        {
            "op": "addNode",
            "node": { "id": "person:tech", "kind": "person", "fields": { "name": "Tech" } },
        },
        {
            "op": "addNode",
            "node": {
                "id": "service:spooler",
                "kind": "service",
                "fields": { "name": "Print Spooler", "status": "wedged" },
            },
        },
        {
            "op": "addNode",
            "node": {
                "id": "machine:ada",
                "kind": "machine",
                "fields": { "hostname": "ADA-PC", "display_rotation": 0 },
            },
        },
    ])
}

fn actions() -> Json {
    json!([
        {
            "id": "spooler.jostle",
            "tier": 1,
            "apply": [{
                "op": "set_field",
                "node": { "id": "service:spooler" },
                "field": "status",
                // Rng-driven on purpose: a replay that diverges by one die is
                // a replay this gate has to catch.
                "value": { "rng_pick": ["running", "stopped", "wedged"] },
            }],
        },
        {
            "id": "machine.rotate",
            "tier": 1,
            "apply": [{
                "op": "set_field",
                "node": { "id": "machine:ada" },
                "field": "display_rotation",
                "value": { "rng_pick": [0, 90, 180, 270] },
            }],
        },
        {
            "id": "machine.note",
            "tier": 1,
            "apply": [{
                "op": "set_field",
                "node": { "id": "machine:ada" },
                "field": "notes",
                // One more line every time, so two identical mornings are
                // still two different worlds - a hash comparison that can pass
                // by coincidence proves nothing.
                "value": {
                    "append_line": {
                        "node": { "id": "machine:ada" },
                        "field": "notes",
                        "value": { "const": "had another look at it" },
                    },
                },
            }],
        },
        {
            "id": "spooler.refuse",
            "tier": 1,
            "validate": [{
                "when": { "pred": "target_missing" },
                "reason": "Pick something first.",
            }],
        },
    ])
}

fn engine() -> Engine {
    let mut engine = Engine::new(f64::from(0x5eed_4321_u32)).expect("engine");
    expect_ok(&engine.apply_setup(&setup().to_string()), "setup");
    expect_ok(&engine.register_actions(&actions().to_string()), "actions");
    engine
}

fn parse(payload: &str) -> Json {
    serde_json::from_str(payload).expect("the boundary answers in JSON")
}

fn expect_ok(payload: &str, what: &str) -> Json {
    let answer = parse(payload);
    assert_eq!(answer["ok"], json!(true), "{what} was refused: {payload}");
    answer
}

fn dispatch(engine: &mut Engine, id: &str, target: Option<&str>) -> Json {
    parse(
        &engine.dispatch(
            &json!({
                "action": id,
                "actor": "person:tech",
                "target": match target {
                    Some(target) => json!(target),
                    None => Json::Null,
                },
                "params": {},
            })
            .to_string(),
        ),
    )
}

fn log(engine: &Engine) -> Vec<Json> {
    parse(&engine.dispatch_log())
        .as_array()
        .expect("a log is an array")
        .clone()
}

/// The world the log is measured from, read back out of the save itself.
fn baseline_of(engine: &Engine) -> String {
    let answer = parse(&engine.query(&json!({ "kind": "checkpoint_baseline" }).to_string()));
    assert_eq!(answer["ok"], json!(true), "{answer}");
    answer["value"].to_string()
}

fn checkpoint_query(engine: &Engine) -> Json {
    let answer = parse(&engine.query(&json!({ "kind": "checkpoint" }).to_string()));
    assert_eq!(answer["ok"], json!(true));
    answer["value"].clone()
}

/// A working morning: some dice rolled, some time passed, one refusal.
fn work(engine: &mut Engine) {
    expect_ok(&engine.advance(3.0), "advance");
    assert_eq!(dispatch(engine, "spooler.jostle", None)["ok"], json!(true));
    expect_ok(&engine.advance(4.0), "advance");
    assert_eq!(dispatch(engine, "machine.rotate", None)["ok"], json!(true));
    assert_eq!(dispatch(engine, "machine.note", None)["ok"], json!(true));
    assert_eq!(dispatch(engine, "spooler.refuse", None)["ok"], json!(false));
}

/// Replays a carried log onto a world restored from the baseline save.
fn replay(baseline: &str, entries: &[Json]) -> Engine {
    let mut replayed = engine();
    expect_ok(&replayed.restore(baseline), "restore");

    for entry in entries {
        let tick = entry["tick"].as_f64().expect("tick");
        let ticks_to_go = tick - replayed.now();
        assert!(ticks_to_go >= 0.0, "a carried log runs forwards");
        expect_ok(&replayed.advance(ticks_to_go), "replay advance");

        let result = parse(
            &replayed.dispatch(
                &json!({
                    "action": entry["id"],
                    "actor": entry["actor"],
                    "target": entry["target"],
                    "params": entry["params"],
                })
                .to_string(),
            ),
        );
        assert_eq!(
            result["ok"], entry["ok"],
            "a replayed step disagreed with the log it came from",
        );
    }

    replayed
}

#[test]
fn a_checkpoint_drains_the_log_and_leaves_the_world_alone() {
    let mut engine = engine();
    work(&mut engine);

    let before_hash = engine.snapshot_hash();
    let before_tick = engine.now();
    assert_eq!(log(&engine).len(), 4);
    assert_eq!(checkpoint_query(&engine)["hash"], Json::Null);

    let outcome = expect_ok(&engine.checkpoint(), "checkpoint");
    assert_eq!(outcome["value"]["drained"], json!(4));
    assert_eq!(outcome["value"]["tick"].as_f64(), Some(before_tick));
    assert_eq!(outcome["value"]["hash"], json!(before_hash));
    // Nothing about the world moved - a checkpoint is bookkeeping, not a turn.
    assert_eq!(engine.snapshot_hash(), before_hash);
    assert_eq!(engine.now(), before_tick);
    assert_eq!(
        outcome["events"],
        json!([]),
        "a checkpoint announced something"
    );

    assert!(log(&engine).is_empty(), "the drained log kept its entries");
    let checkpoint = checkpoint_query(&engine);
    assert_eq!(checkpoint["tick"].as_f64(), Some(before_tick));
    assert_eq!(checkpoint["hash"], json!(before_hash));
    assert_eq!(checkpoint["entries"], json!(0));

    // And the log starts again from the baseline, not from tick 0.
    assert_eq!(
        dispatch(&mut engine, "spooler.jostle", None)["ok"],
        json!(true)
    );
    let entries = log(&engine);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["tick"].as_f64(), Some(before_tick));
}

/// The policy's whole promise: the baseline plus the log since it reproduces
/// the world, hash for hash, dice included.
#[test]
fn a_replay_from_the_checkpoint_lands_on_the_same_world() {
    let mut source = engine();
    work(&mut source);

    expect_ok(&source.checkpoint(), "checkpoint");
    let baseline = source.serialize();

    // An afternoon on top of the baseline, refusal and all.
    work(&mut source);
    let carried = log(&source);
    assert_eq!(carried.len(), 4, "the log carries the day since the drain");

    let replayed = replay(&baseline, &carried);

    assert_eq!(replayed.snapshot_hash(), source.snapshot_hash());
    assert_eq!(replayed.now(), source.now());
    assert_eq!(log(&replayed), carried);

    // The baseline on its own is the world as it stood at the checkpoint - it
    // is not the end state, or the replay above proved nothing.
    let mut untouched = engine();
    expect_ok(&untouched.restore(&baseline), "restore");
    assert_ne!(untouched.snapshot_hash(), source.snapshot_hash());
    assert_eq!(
        untouched.snapshot_hash(),
        checkpoint_query(&source)["hash"].as_str().expect("hash"),
    );
}

/// A refusal is history too: it is what the player tried, and the CYA record
/// the escalation form reads. Draining the log must not quietly promote a
/// session into one where nothing ever went wrong.
#[test]
fn refusals_survive_the_drain_and_the_save() {
    let mut engine = engine();
    work(&mut engine);
    expect_ok(&engine.checkpoint(), "checkpoint");

    assert_eq!(
        dispatch(&mut engine, "spooler.refuse", None)["ok"],
        json!(false)
    );
    assert_eq!(
        dispatch(&mut engine, "spooler.jostle", None)["ok"],
        json!(true)
    );

    let saved = engine.serialize();
    let mut loaded = self::engine();
    expect_ok(&loaded.restore(&saved), "restore");

    let entries = log(&loaded);
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["ok"], json!(false));
    assert_eq!(entries[0]["reason"], json!("Pick something first."));
    assert_eq!(entries[1]["ok"], json!(true));
    assert_eq!(
        checkpoint_query(&loaded),
        checkpoint_query(&engine),
        "the baseline did not survive the save",
    );
}

#[test]
fn a_save_is_refused_when_its_log_and_its_checkpoint_disagree() {
    let mut engine = engine();
    work(&mut engine);
    expect_ok(&engine.checkpoint(), "checkpoint");
    assert_eq!(
        dispatch(&mut engine, "spooler.jostle", None)["ok"],
        json!(true)
    );

    let saved: Json = parse(&engine.serialize());
    let hash_before = engine.snapshot_hash();

    // A log entry from before the baseline: history the checkpoint already
    // absorbed, which a replay would apply for a second time.
    let mut stale = saved.clone();
    stale["registry"]["log"][0]["tick"] = json!(0);
    let refusal = parse(&engine.restore(&stale.to_string()));
    assert_eq!(refusal["ok"], json!(false));
    assert!(
        refusal["reason"]
            .as_str()
            .expect("a reason")
            .contains("before its checkpoint"),
        "{refusal}",
    );

    // A baseline the save has not reached yet.
    let mut ahead = saved.clone();
    ahead["registry"]["checkpoint"]["tick"] = json!(9_000);
    ahead["registry"]["log"] = json!([]);
    let refusal = parse(&engine.restore(&ahead.to_string()));
    assert_eq!(refusal["ok"], json!(false));
    assert!(
        refusal["reason"]
            .as_str()
            .expect("a reason")
            .contains("after the saved clock"),
        "{refusal}",
    );

    // A save with no checkpoint at all is a save from before this policy.
    let mut older = saved.clone();
    older["registry"]
        .as_object_mut()
        .expect("registry")
        .remove("checkpoint");
    let refusal = parse(&engine.restore(&older.to_string()));
    assert_eq!(refusal["ok"], json!(false));

    // Three refusals, and the running world is exactly where it was.
    assert_eq!(engine.snapshot_hash(), hash_before);
    assert_eq!(log(&engine).len(), 1);
}

/// The promise from the player's side: ONE file, on its own, is replayable.
///
/// The previous gate proved a replay works when somebody had separately kept
/// the baseline save. Nobody does that. A player clocks off, works the next
/// morning, and overwrites the single slot - so if the file does not carry the
/// world its own log is measured from, the log in it can only be replayed
/// against the world it already produced, which applies the day twice.
#[test]
fn one_post_checkpoint_save_carries_the_world_its_log_is_measured_from() {
    let mut source = engine();
    work(&mut source);
    expect_ok(&source.checkpoint(), "checkpoint");

    let checkpoint_hash = source.snapshot_hash();
    let checkpoint_tick = source.now();
    let checkpoint_rng = source.world().rng.state();

    // A day on top of the baseline, and then the ONLY file that survives.
    work(&mut source);
    let saved = source.serialize();

    let mut loaded = engine();
    expect_ok(&loaded.restore(&saved), "restore");

    // The baseline comes out of that one file, and it IS the world at the
    // drain: a different hash, an earlier tick, an earlier die.
    let baseline = baseline_of(&loaded);
    let mut replayed = engine();
    expect_ok(&replayed.restore(&baseline), "restore the baseline");

    assert_eq!(replayed.snapshot_hash(), checkpoint_hash);
    assert_eq!(replayed.now(), checkpoint_tick);
    assert_eq!(replayed.world().rng.state(), checkpoint_rng);
    assert_ne!(replayed.snapshot_hash(), source.snapshot_hash());
    assert!(log(&replayed).is_empty(), "a baseline carries no history");

    // And the log the file carried, applied to the world the file carried,
    // lands on the world the file describes - hash, tick and dice.
    let carried = log(&loaded);
    assert_eq!(carried.len(), 4);
    let rebuilt = replay(&baseline, &carried);

    assert_eq!(rebuilt.snapshot_hash(), source.snapshot_hash());
    assert_eq!(rebuilt.now(), source.now());
    assert_eq!(rebuilt.world().rng.state(), source.world().rng.state());
}

/// A checkpoint that names a world it does not carry is the save shape this
/// policy exists to stop, and so is a world nobody drained anything into.
#[test]
fn a_checkpoint_must_carry_the_world_it_names() {
    let mut engine = engine();
    work(&mut engine);
    expect_ok(&engine.checkpoint(), "checkpoint");
    let saved: Json = parse(&engine.serialize());

    let mut nameless = saved.clone();
    nameless["registry"]["checkpoint"]["baseline"] = Json::Null;
    let refusal = parse(&engine.restore(&nameless.to_string()));
    assert_eq!(refusal["ok"], json!(false));
    assert!(
        refusal["reason"]
            .as_str()
            .expect("a reason")
            .contains("carry the world it names"),
        "{refusal}",
    );

    let mut unnamed = saved.clone();
    unnamed["registry"]["checkpoint"]["hash"] = Json::Null;
    assert_eq!(
        parse(&engine.restore(&unnamed.to_string()))["ok"],
        json!(false),
    );

    let mut half = saved;
    half["registry"]["checkpoint"]["baseline"]
        .as_object_mut()
        .expect("baseline")
        .remove("graph");
    assert_eq!(parse(&engine.restore(&half.to_string()))["ok"], json!(false));
}

/// A fresh world has no baseline, and that is a claim rather than a gap: the
/// log IS the whole history until something drains it. The M0 fixture lives
/// here forever, which is why its golden hash never sees a checkpoint.
#[test]
fn a_world_that_never_checkpoints_carries_its_whole_history() {
    let mut engine = engine();
    work(&mut engine);

    let checkpoint = checkpoint_query(&engine);
    assert_eq!(checkpoint["tick"], json!(0));
    assert_eq!(checkpoint["hash"], Json::Null);
    assert_eq!(checkpoint["entries"], json!(4));

    let saved = engine.serialize();
    let mut loaded = self::engine();
    expect_ok(&loaded.restore(&saved), "restore");

    assert_eq!(loaded.snapshot_hash(), engine.snapshot_hash());
    assert_eq!(checkpoint_query(&loaded)["hash"], Json::Null);
    assert_eq!(log(&loaded).len(), 4);
}
