//! What one action costs, and the gate that stops it costing the whole world.
//!
//! Every dispatch is a transaction, because an action is one thing the player
//! did and a refusal has to leave nothing behind (`atomicity.rs` is the proof
//! of that half). The question here is the PRICE of that promise: a
//! transaction whose cost is proportional to how many nodes the estate holds
//! is a transaction that gets slower every time the world gets richer, and the
//! world is only going one way.
//!
//! The estate below is shape-accurate rather than the shipped content - the
//! same fourteen machines, the same twenty-odd baseline services on each of
//! them, the same one-edge-per-service wiring, ~324 service nodes in all -
//! because the shipped world is seeded in TypeScript and the shipped-content
//! measurement is the vitest week suite. What is measured here is the ENGINE's
//! per-dispatch cost as a function of world size, and for that the shape is
//! the whole of what matters.
//!
//! `cargo test --test transaction_cost -- --nocapture` prints the numbers.

use std::time::{Duration, Instant};

use core_rs::actions::DispatchResult;
use core_rs::ops::Params;
use core_rs::value::FieldValue;
use core_rs::world::World;
use serde_json::{json, Value as Json};

/// The shipped estate's shape: fourteen boxes, twenty-three services apiece.
const MACHINES: usize = 14;
const SERVICES_PER_MACHINE: usize = 23;

/// How much bigger the padded world is than the estate. Large enough that a
/// full-world copy per transaction cannot hide in the noise.
const PADDING: usize = 10_000;

fn setup(ops: Vec<Json>) -> Json {
    Json::Array(ops)
}

fn add_node(ops: &mut Vec<Json>, id: &str, kind: &str, fields: Json) {
    ops.push(json!({ "op": "addNode", "node": { "id": id, "kind": kind, "fields": fields } }));
}

fn add_edge(ops: &mut Vec<Json>, from: &str, to: &str, kind: &str) {
    ops.push(json!({ "op": "addEdge", "edge": { "from": from, "to": to, "kind": kind } }));
}

/// An estate of the shipped shape, plus `padding` extra service nodes that
/// nothing in the world reads. The padding is the independent variable: the
/// per-dispatch cost must not care what it is.
fn estate(padding: usize) -> World {
    let mut world = World::new(7);
    let mut ops: Vec<Json> = Vec::new();

    add_node(&mut ops, "person:tech", "person", json!({ "name": "You" }));
    add_node(
        &mut ops,
        "account:tech",
        "account",
        json!({ "username": "tech", "locked": false, "enabled": true }),
    );
    add_edge(&mut ops, "person:tech", "account:tech", "owns");
    add_node(&mut ops, "group:staff", "group", json!({ "name": "Staff" }));
    add_edge(&mut ops, "account:tech", "group:staff", "member_of");

    for machine in 0..MACHINES {
        let host = format!("machine:box{machine:02}");
        add_node(
            &mut ops,
            &host,
            "machine",
            json!({ "hostname": format!("BOX{machine:02}"), "resolution": "1024x768" }),
        );

        for service in 0..SERVICES_PER_MACHINE {
            let id = format!("service:box{machine:02}.svc{service:02}");
            add_node(
                &mut ops,
                &id,
                "service",
                json!({ "name": format!("Service {service}"), "status": "running" }),
            );
            add_edge(&mut ops, &id, &host, "runs_on");
        }
    }

    // The one service the bench action touches, kept out of the baseline list
    // so the measured write is always the same write.
    add_node(
        &mut ops,
        "service:bench",
        "service",
        json!({ "name": "Bench", "status": "running" }),
    );

    for extra in 0..padding {
        add_node(
            &mut ops,
            &format!("service:pad{extra:06}"),
            "service",
            json!({ "name": "Padding", "status": "running" }),
        );
    }

    world.apply_setup(&setup(ops)).expect("the estate seeds");
    world
        .register_actions(&json!([
            {
                "id": "bench.touch",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "id": "service:bench" },
                        "field": "name",
                        "value": { "const": "Bench" },
                    },
                ],
            },
            {
                "id": "bench.touch_then_fail",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "id": "service:bench" },
                        "field": "name",
                        "value": { "const": "Half" },
                    },
                    {
                        "op": "set_field",
                        "node": { "id": "service:nowhere" },
                        "field": "name",
                        "value": { "const": "Never" },
                    },
                ],
            },
        ]))
        .expect("the bench verbs register");

    // Four tickets, which is a normal morning's queue: every graph mutation
    // re-checks all of them, so they are part of what a dispatch costs.
    for ticket in 0..4 {
        world
            .spawn_ticket(&json!({
                "id": format!("ticket:bench{ticket}"),
                "archetype": "hidden_cause",
                "flavor": { "title": "T", "body": "B" },
                "reporter": "person:tech",
                "setup": [],
                "resolved_when": {
                    "op": "eq",
                    "selector": { "id": format!("service:box{ticket:02}.svc00") },
                    "field": "status",
                    "value": "stopped",
                },
                "sla_ticks": 1_000_000,
                "reward": { "reputation": 1 },
                "kb_ref": "kb/bench",
            }))
            .expect("the queue spawns");
    }

    world.drain_events();
    world
}

fn dispatch(world: &mut World, action: &str) -> DispatchResult {
    world.dispatch(action, "person:tech", None, Params::new())
}

/// The best of several batches, because the worst of them is measuring the
/// machine rather than the engine.
fn best_of(world: &mut World, batch: usize, rounds: usize, mut once: impl FnMut(&mut World)) -> Duration {
    // Warm the allocator and the branch predictor before anything is counted.
    for _ in 0..batch {
        once(world);
        world.drain_events();
    }

    let mut best = Duration::MAX;

    for _ in 0..rounds {
        let started = Instant::now();

        for _ in 0..batch {
            once(world);
        }

        let elapsed = started.elapsed();
        world.drain_events();
        best = best.min(elapsed / batch as u32);
    }

    best
}

fn per_dispatch(world: &mut World, action: &str, batch: usize, rounds: usize) -> Duration {
    best_of(world, batch, rounds, |world| {
        dispatch(world, action);
    })
}

/// One simulated minute. The other way into a transaction: an advance wraps
/// its whole tick loop in one, because time either passed or it did not.
fn per_tick(world: &mut World, batch: usize, rounds: usize) -> Duration {
    best_of(world, batch, rounds, |world| {
        world.advance(1).expect("a minute passes");
    })
}

/// Not a gate - a number. Run with `--nocapture` to read it.
#[test]
fn reports_what_a_dispatch_costs() {
    for (label, mut world) in [("estate", estate(0)), ("padded", estate(PADDING))] {
        let applied = per_dispatch(&mut world, "bench.touch", 200, 5);
        let refused = per_dispatch(&mut world, "bench.touch_then_fail", 200, 5);
        let tick = per_tick(&mut world, 200, 5);
        let nodes = world.graph.all_nodes().len();

        println!(
            "{label} {nodes} nodes: applied {applied:?}/dispatch, \
             rolled back {refused:?}/dispatch, {tick:?}/tick",
        );
    }
}

/// THE GATE. A transaction may not cost the world.
///
/// The engine takes a savepoint before every dispatch so that a refusal can
/// put everything back, and the cheap way to write that is to copy the whole
/// graph - which makes one action's price a function of how many nodes the
/// estate holds. It was written that way once, and quadrupling the world
/// quadrupled the cost of every click in it.
///
/// The threshold is deliberately loose: this is here to catch a return to
/// copying the world, not to police a percentage. A full copy at the padding
/// below is tens of times slower; anything that only reads the nodes it
/// touches is flat.
#[test]
fn a_transaction_does_not_cost_the_world() {
    let mut small = estate(0);
    let mut large = estate(PADDING);

    let mut measured: Vec<(&str, Duration, Duration)> = Vec::new();

    for action in ["bench.touch", "bench.touch_then_fail"] {
        measured.push((
            action,
            per_dispatch(&mut small, action, 200, 5),
            per_dispatch(&mut large, action, 200, 5),
        ));
    }

    // And the other way into a transaction: one simulated minute, which is
    // what the day loop asks for over and over while nobody clicks anything.
    measured.push((
        "advance(1)",
        per_tick(&mut small, 200, 5),
        per_tick(&mut large, 200, 5),
    ));

    for (what, lean, padded) in measured {
        let ratio = padded.as_secs_f64() / lean.as_secs_f64();

        assert!(
            ratio < 4.0,
            "\"{what}\" costs {ratio:.1}x more against a world {PADDING} nodes bigger \
             ({lean:?} -> {padded:?}); a transaction has started scaling with the world again",
        );
    }
}

/// The gate above is a stopwatch, so this is the invariant it stands for: the
/// world it measured is genuinely the same world, and the rolled-back dispatch
/// genuinely rolled back.
#[test]
fn the_measured_dispatches_are_the_dispatches_they_claim_to_be() {
    let mut world = estate(0);
    let before = world.graph.snapshot_hash();

    assert!(matches!(
        dispatch(&mut world, "bench.touch"),
        DispatchResult::Ok
    ));
    assert_eq!(world.graph.snapshot_hash(), before, "the touch moved a field");

    assert!(matches!(
        dispatch(&mut world, "bench.touch_then_fail"),
        DispatchResult::Refused(_)
    ));
    assert_eq!(
        world.graph.get_field("service:bench", "name"),
        Some(&FieldValue::Str("Bench".to_owned())),
        "the refused dispatch left its first op standing",
    );
    assert_eq!(world.graph.snapshot_hash(), before);
}
