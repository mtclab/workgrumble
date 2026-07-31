//! Every call happens completely or not at all.
//!
//! A refusal is a sentence, and a sentence is a promise: nothing moved. The
//! engine used to break that promise in the middle of a list - the first op
//! resolved a ticket and rolled the dice, the second one refused, and the
//! caller was told "no" by a world that had already said yes. These are the
//! gates for that: they FAIL against staged mutations, half-seeded worlds and
//! half-installed verb sets.

use core_rs::actions::{ActionRegistry, LogCheckpoint};
use core_rs::events::EngineEvent;
use core_rs::ops::Params;
use core_rs::value::FieldValue;
use core_rs::world::World;
use serde_json::{json, Value as Json};

/// A world with a spooler, a reporter, a ticket that closes when the spooler
/// runs, and one verb whose SECOND op cannot possibly work.
fn harness() -> World {
    let mut world = World::new(11);
    world
        .apply_setup(&json!([
            {
                "op": "addNode",
                "node": { "id": "person:reporter", "kind": "person", "fields": { "name": "Reporter" } },
            },
            {
                "op": "addNode",
                "node": {
                    "id": "service:spooler",
                    "kind": "service",
                    "fields": { "name": "Print Spooler", "status": "stopped" },
                },
            },
        ]))
        .expect("harness setup");
    world
        .register_actions(&json!([
            {
                "id": "spooler.fix_then_fail",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "id": "service:spooler" },
                        "field": "status",
                        "value": { "const": "running" },
                    },
                    {
                        "op": "set_field",
                        "node": { "id": "device:not_here" },
                        "field": "queue_len",
                        "value": { "rng_int": { "min": 1, "max": 6 } },
                    },
                ],
            },
            {
                "id": "spooler.roll_then_fail",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "id": "service:spooler" },
                        "field": "name",
                        "value": { "rng_pick": ["A", "B", "C", "D", "E", "F", "G"] },
                    },
                    { "op": "remove_node", "node": { "id": "device:not_here" } },
                ],
            },
            {
                "id": "spooler.start",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "id": "service:spooler" },
                        "field": "status",
                        "value": { "const": "running" },
                    },
                ],
            },
        ]))
        .expect("verbs");
    world
        .spawn_ticket(&json!({
            "id": "ticket:spooler",
            "archetype": "hidden_cause",
            "flavor": { "title": "Nothing prints", "body": "Nothing at all." },
            "reporter": "person:reporter",
            "setup": [],
            "resolved_when": {
                "op": "eq",
                "selector": { "id": "service:spooler" },
                "field": "status",
                "value": "running",
            },
            "sla_ticks": 500,
            "reward": { "reputation": 2 },
            "kb_ref": "kb/print-spooler",
        }))
        .expect("ticket");
    world.drain_events();
    world
}

fn dispatch(world: &mut World, id: &str) -> String {
    match world.dispatch(id, "person:reporter", None, Params::new()) {
        core_rs::actions::DispatchResult::Ok => String::new(),
        core_rs::actions::DispatchResult::Refused(reason) => reason,
    }
}

fn state(world: &World, id: &str) -> String {
    world
        .ticket_state(id)
        .and_then(FieldValue::as_str)
        .unwrap_or("<none>")
        .to_owned()
}

/// The exact shape QA-06 named: op one resolves the ticket, op two refuses.
/// The refusal has to take the resolution back with it.
#[test]
fn a_failing_op_takes_back_the_ticket_the_earlier_ops_resolved() {
    let mut world = harness();
    let before = world.graph.snapshot_hash();

    let reason = dispatch(&mut world, "spooler.fix_then_fail");

    assert!(!reason.is_empty(), "the broken definition was accepted");
    assert_eq!(state(&world, "ticket:spooler"), "open");
    assert_eq!(world.was_breached("ticket:spooler"), Some(false));
    assert_eq!(
        world.graph.get_field("service:spooler", "status"),
        Some(&FieldValue::Str("stopped".to_owned())),
    );
    assert_eq!(world.graph.snapshot_hash(), before);
    assert!(world.drain_events().is_empty(), "a refusal announced events");

    // And exactly one log entry: the refusal, and nothing that looks like the
    // half of the action that ran.
    assert_eq!(world.registry.log().len(), 1);
    assert!(!world.registry.log()[0].ok);

    // The world still works afterwards, and the ticket still closes properly.
    assert_eq!(dispatch(&mut world, "spooler.start"), "");
    assert_eq!(state(&world, "ticket:spooler"), "resolved");
}

/// Dice rolled by an op that is then rolled back must be un-rolled too, or a
/// replay of the same log diverges from the session it came from.
#[test]
fn a_failing_op_gives_back_the_random_numbers_it_consumed() {
    let mut world = harness();
    let before = world.rng.state();

    assert!(!dispatch(&mut world, "spooler.roll_then_fail").is_empty());
    assert_eq!(world.rng.state(), before, "the refusal kept the dice roll");

    // Two refusals in a row therefore leave the same state, which is what
    // makes the stream a function of what SUCCEEDED.
    assert!(!dispatch(&mut world, "spooler.roll_then_fail").is_empty());
    assert_eq!(world.rng.state(), before);
}

#[test]
fn a_setup_payload_with_one_bad_mutation_seeds_nothing() {
    let mut world = harness();
    let before = world.graph.snapshot_hash();

    let error = world
        .apply_setup(&json!([
            { "op": "addNode", "node": { "id": "group:one", "kind": "group", "fields": {} } },
            { "op": "addNode", "node": { "id": "group:two", "kind": "group", "fields": {} } },
            { "op": "addNode", "node": { "id": "group:one", "kind": "group", "fields": {} } },
        ]))
        .expect_err("the third mutation is a duplicate");

    assert!(error.message().contains("already exists"));
    assert!(world.graph.get_node("group:one").is_none());
    assert!(world.graph.get_node("group:two").is_none());
    assert_eq!(world.graph.snapshot_hash(), before);
    assert!(world.drain_events().is_empty());
}

/// A ticket runs its own setup mutations before the engine knows whether the
/// ticket can exist at all. Those mutations belong to the spawn.
#[test]
fn a_ticket_that_cannot_spawn_leaves_its_setup_behind() {
    let mut world = harness();
    let before = world.graph.snapshot_hash();

    let error = world
        .spawn_ticket(&json!({
            "id": "ticket:doomed",
            "archetype": "flood",
            "flavor": { "title": "T", "body": "B" },
            "reporter": "person:nobody",
            "setup": [
                {
                    "op": "setField",
                    "id": "service:spooler",
                    "field": "status",
                    "value": "wedged",
                },
            ],
            "resolved_when": { "op": "exists", "kind": "person" },
            "sla_ticks": 10,
            "reward": { "reputation": 1 },
            "kb_ref": "kb/doomed",
        }))
        .expect_err("the reporter does not exist");

    assert!(error.message().contains("Reporter"));
    assert_eq!(
        world.graph.get_field("service:spooler", "status"),
        Some(&FieldValue::Str("stopped".to_owned())),
    );
    assert_eq!(world.graph.snapshot_hash(), before);
    assert!(world.drain_events().is_empty());
}

#[test]
fn an_action_payload_with_a_duplicate_installs_none_of_it() {
    let mut world = harness();

    let error = world
        .register_actions(&json!({
            "kind_labels": { "service": "a service" },
            "actions": [
                { "id": "fresh.one", "tier": 1 },
                { "id": "fresh.two", "tier": 1 },
                { "id": "spooler.start", "tier": 1 },
            ],
        }))
        .expect_err("spooler.start is already registered");

    assert!(error.message().contains("already registered"));
    assert!(world.registry.get("fresh.one").is_none());
    assert!(world.registry.get("fresh.two").is_none());
    assert!(!world.registry.kind_labels.contains_key("service"));

    // The same payload twice over in one call is the same problem.
    assert!(world
        .register_actions(&json!([
            { "id": "twice.over", "tier": 1 },
            { "id": "twice.over", "tier": 1 },
        ]))
        .is_err());
    assert!(world.registry.get("twice.over").is_none());
}

/// A log that is measured from a baseline can only hold what came after it.
/// (The rest of the checkpoint policy lives in `checkpoint.rs`; this is the
/// half that belongs to the registry's own bookkeeping.)
#[test]
fn a_restored_log_that_predates_its_checkpoint_is_refused() {
    let mut registry = ActionRegistry::new(1);
    let entry = |tick: i64| -> Json {
        json!({
            "tick": tick,
            "id": "spooler.start",
            "actor": "person:reporter",
            "target": null,
            "params": {},
            "ok": true,
        })
    };
    let parse = |values: &[Json]| {
        values
            .iter()
            .map(core_rs::actions::DispatchLogEntry::from_json)
            .collect::<Result<Vec<_>, _>>()
            .expect("valid entries")
    };
    let baseline = |tick: i64| {
        LogCheckpoint::from_json(&json!({
            "tick": tick,
            "hash": "0123456789abcdef",
            "baseline": {
                "rng_state": 1,
                "clock": { "tick": tick, "paused": false, "speed": 1.0 },
                "graph": { "nodes": [], "edges": [] },
                "tickets": [],
            },
        }))
        .expect("a baseline")
    };

    assert!(registry
        .restore_log(parse(&[entry(7), entry(9)]), baseline(7))
        .is_ok());
    assert_eq!(registry.log().len(), 2);

    let error = registry
        .restore_log(parse(&[entry(6)]), baseline(7))
        .expect_err("the entry predates the baseline");
    assert!(error.message().contains("before its checkpoint"));
    // And the refusal left the registry on the log it already had.
    assert_eq!(registry.log().len(), 2);
    assert_eq!(registry.checkpoint().tick, 7);
}

/// An advance that refuses is an advance that did not happen. A caller told
/// time did not move must not find that some of it did.
#[test]
fn a_refused_advance_leaves_the_clock_where_it_was() {
    let mut world = harness();
    world
        .apply_setup(&json!([
            {
                "op": "addNode",
                "node": {
                    "id": "ticket:broken",
                    "kind": "ticket",
                    "fields": {
                        "state": "waiting_on_user",
                        "spawned_at": 0,
                        "sla_deadline": 9_007_199_254_740_991_i64,
                        "breached": false,
                    },
                },
            },
        ]))
        .expect("a ticket parked at the end of time");
    world.drain_events();

    // Register the parked ticket so the tick handler tries to extend its SLA,
    // which it cannot: the deadline is already the last tick JavaScript holds.
    world
        .spawn_ticket(&json!({
            "id": "ticket:parked",
            "archetype": "flood",
            "flavor": { "title": "T", "body": "B" },
            "reporter": "person:reporter",
            "setup": [],
            "resolved_when": { "op": "exists", "kind": "machine" },
            "sla_ticks": 9_007_199_254_740_991_i64,
            "reward": { "reputation": 1 },
            "kb_ref": "kb/parked",
        }))
        .expect("ticket parked at the end of time");
    world.set_waiting("ticket:parked", true).expect("park it");
    world.drain_events();

    let before = world.graph.snapshot_hash();
    let error = world.advance(5).expect_err("the SLA cannot be extended");

    assert!(error.message().contains("SLA"), "{error}");
    assert_eq!(world.clock.now(), 0);
    assert_eq!(world.graph.snapshot_hash(), before);
    assert!(world.drain_events().is_empty());
}

#[test]
fn a_successful_call_still_reports_everything_it_did() {
    let mut world = harness();

    assert_eq!(dispatch(&mut world, "spooler.start"), "");

    let events: Vec<String> = world
        .drain_events()
        .into_iter()
        .map(|event| match event {
            EngineEvent::GraphMutated(_) => "mutated".to_owned(),
            EngineEvent::TicketSpawned(id) => format!("spawned:{id}"),
            EngineEvent::TicketResolved(id) => format!("resolved:{id}"),
            EngineEvent::TicketBreached(id) => format!("breached:{id}"),
            EngineEvent::WorldRestored { tick } => format!("restored:{tick}"),
        })
        .collect();

    assert_eq!(
        events,
        vec![
            "mutated".to_owned(),
            "mutated".to_owned(),
            "resolved:ticket:spooler".to_owned(),
        ],
    );
}
