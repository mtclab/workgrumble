//! A rollback puts back everything, in the shape it was in.
//!
//! `atomicity.rs` is the promise: a refusal leaves nothing behind. This file
//! is the promise held to its details, because the engine no longer keeps a
//! COPY of the world to restore from - it keeps an undo record of what the
//! call touched, and an undo record can be incomplete in ways a copy never
//! could. Every kind of change the graph and the ticket engine can make has a
//! test here that makes it and then refuses.
//!
//! The graph's snapshot hash is not enough on its own and is deliberately not
//! the only assertion: it sorts the edges before hashing, so an undo that put
//! an edge back in the wrong PLACE would pass it - and the place is what
//! `World::baseline` writes into every save. Each test below compares the
//! baseline as well, which is the byte-for-byte record of both.

use core_rs::actions::DispatchResult;
use core_rs::ops::Params;
use core_rs::value::FieldValue;
use core_rs::world::World;
use serde_json::{json, Value as Json};

/// The world as a save would write it down: the graph in its own order, the
/// tickets with their flags, the rng and the clock.
fn written_down(world: &World) -> String {
    let baseline = world.baseline();

    json!({
        "rng_state": baseline.rng_state,
        "clock": baseline.clock,
        "graph": baseline.graph,
        "tickets": baseline.tickets,
    })
    .to_string()
}

/// Five nodes, four edges in a deliberate order, and a ticket that closes when
/// the spooler runs.
fn harness() -> World {
    let mut world = World::new(3);
    world
        .apply_setup(&json!([
            {
                "op": "addNode",
                "node": { "id": "person:pat", "kind": "person", "fields": { "name": "Pat" } },
            },
            {
                "op": "addNode",
                "node": {
                    "id": "account:pat",
                    "kind": "account",
                    "fields": { "username": "pat", "locked": false },
                },
            },
            {
                "op": "addNode",
                "node": { "id": "group:print", "kind": "group", "fields": { "name": "Print" } },
            },
            {
                "op": "addNode",
                "node": { "id": "group:file", "kind": "group", "fields": { "name": "File" } },
            },
            {
                "op": "addNode",
                "node": {
                    "id": "service:spooler",
                    "kind": "service",
                    "fields": { "name": "Spooler", "status": "stopped" },
                },
            },
            {
                "op": "addNode",
                "node": { "id": "machine:desk", "kind": "machine", "fields": { "hostname": "DESK" } },
            },
            { "op": "addEdge", "edge": { "from": "person:pat", "to": "account:pat", "kind": "owns" } },
            {
                "op": "addEdge",
                "edge": { "from": "account:pat", "to": "group:print", "kind": "member_of" },
            },
            {
                "op": "addEdge",
                "edge": { "from": "service:spooler", "to": "machine:desk", "kind": "runs_on" },
            },
            {
                "op": "addEdge",
                "edge": { "from": "account:pat", "to": "group:file", "kind": "member_of" },
            },
        ]))
        .expect("the harness seeds");
    world
        .spawn_ticket(&json!({
            "id": "ticket:spooler",
            "archetype": "hidden_cause",
            "flavor": { "title": "Nothing prints", "body": "Nothing at all." },
            "reporter": "person:pat",
            "setup": [],
            "resolved_when": {
                "op": "eq",
                "selector": { "id": "service:spooler" },
                "field": "status",
                "value": "running",
            },
            "sla_ticks": 500,
            "reward": { "reputation": 1 },
            "kb_ref": "kb/spooler",
        }))
        .expect("the ticket spawns");
    world.drain_events();
    world
}

/// Registers one verb: the ops given, and then an op that cannot work.
fn verb_that_does_then_fails(world: &mut World, ops: Vec<Json>) {
    let mut apply = ops;
    apply.push(json!({
        "op": "set_field",
        "node": { "id": "node:nowhere" },
        "field": "name",
        "value": { "const": "never" },
    }));

    world
        .register_actions(&json!([{ "id": "test.do_then_fail", "tier": 1, "apply": apply }]))
        .expect("the verb registers");
    world.drain_events();
}

/// Runs the verb built above and asserts the world is exactly where it was -
/// the same hash, the same save, and not one event announced.
fn refusing_changes_nothing(mut world: World, ops: Vec<Json>) {
    verb_that_does_then_fails(&mut world, ops);

    let hash = world.graph.snapshot_hash();
    let written = written_down(&world);
    let log_entries = world.registry.log().len();

    let result = world.dispatch("test.do_then_fail", "person:pat", None, Params::new());

    assert!(
        matches!(result, DispatchResult::Refused(_)),
        "the last op was supposed to be impossible",
    );
    assert_eq!(world.graph.snapshot_hash(), hash, "the graph moved");
    assert_eq!(written_down(&world), written, "the save moved");
    assert!(
        world.drain_events().is_empty(),
        "a refusal announced events",
    );

    // And the only thing the call left behind is the refusal itself.
    assert_eq!(world.registry.log().len(), log_entries + 1);
    assert!(!world.registry.log()[log_entries].ok);
}

#[test]
fn a_field_written_over_comes_back() {
    refusing_changes_nothing(
        harness(),
        vec![json!({
            "op": "set_field",
            "node": { "id": "service:spooler" },
            "field": "status",
            "value": { "const": "running" },
        })],
    );
}

/// A field the world never had is a different world from a field set to null,
/// so an undo has to be able to take one off again rather than blank it.
#[test]
fn a_field_written_for_the_first_time_goes_away_again() {
    refusing_changes_nothing(
        harness(),
        vec![json!({
            "op": "set_field",
            "node": { "id": "machine:desk" },
            "field": "resolution",
            "value": { "const": "1600x1200" },
        })],
    );
}

#[test]
fn a_field_cleared_comes_back() {
    refusing_changes_nothing(
        harness(),
        vec![json!({
            "op": "clear_field",
            "node": { "id": "machine:desk" },
            "field": "hostname",
        })],
    );
}

/// The edge order is what a save writes down, so an edge taken out of the
/// middle has to go back into the middle.
#[test]
fn an_edge_removed_from_the_middle_goes_back_where_it_was() {
    refusing_changes_nothing(
        harness(),
        vec![json!({
            "op": "remove_edge",
            "from": { "id": "account:pat" },
            "to": { "id": "group:print" },
            "kind": "member_of",
        })],
    );
}

#[test]
fn an_edge_added_goes_away_again() {
    refusing_changes_nothing(
        harness(),
        vec![json!({
            "op": "add_edge",
            "from": { "id": "account:pat" },
            "to": { "id": "machine:desk" },
            "kind": "has_access",
        })],
    );
}

/// Removing a node takes its edges with it - from wherever in the vector they
/// happened to be - and all of them have to come back to those places.
#[test]
fn a_node_removed_comes_back_with_its_edges_in_their_places() {
    refusing_changes_nothing(
        harness(),
        vec![json!({
            "op": "remove_node",
            "node": { "id": "account:pat" },
        })],
    );
}

/// The whole lot at once, in an order that interleaves them: an undo record
/// that is right about each change on its own can still be wrong about the
/// order it takes them back in.
#[test]
fn a_call_that_did_everything_undoes_everything() {
    refusing_changes_nothing(
        harness(),
        vec![
            json!({
                "op": "set_field",
                "node": { "id": "service:spooler" },
                "field": "status",
                "value": { "const": "running" },
            }),
            json!({
                "op": "remove_edge",
                "from": { "id": "account:pat" },
                "to": { "id": "group:print" },
                "kind": "member_of",
            }),
            json!({
                "op": "add_edge",
                "from": { "id": "person:pat" },
                "to": { "id": "group:file" },
                "kind": "member_of",
            }),
            json!({
                "op": "remove_node",
                "node": { "id": "machine:desk" },
            }),
            json!({
                "op": "set_field",
                "node": { "id": "service:spooler" },
                "field": "name",
                "value": { "const": "Spooler II" },
            }),
            json!({
                "op": "clear_field",
                "node": { "id": "account:pat" },
                "field": "locked",
            }),
        ],
    );
}

/// The ticket engine's own bookkeeping is state like any other. Parking a
/// ticket sets a flag on the record AND a field on the node, and a refusal
/// afterwards has to take both back.
#[test]
fn a_ticket_parked_on_the_way_to_a_refusal_is_not_parked() {
    let mut world = harness();
    verb_that_does_then_fails(
        &mut world,
        vec![json!({
            "op": "set_waiting",
            "node": { "id": "ticket:spooler" },
            "waiting": true,
        })],
    );

    let hash = world.graph.snapshot_hash();
    let written = written_down(&world);

    assert!(matches!(
        world.dispatch("test.do_then_fail", "person:pat", None, Params::new()),
        DispatchResult::Refused(_),
    ));
    assert_eq!(world.graph.snapshot_hash(), hash);
    assert_eq!(written_down(&world), written);
    assert_eq!(
        world.ticket_state("ticket:spooler").and_then(FieldValue::as_str),
        Some("open"),
    );

    // And the flag itself, not only the field the player reads: parking it for
    // real afterwards has to be a change the engine still believes in.
    world.set_waiting("ticket:spooler", true).expect("park it");
    assert_eq!(
        world.ticket_state("ticket:spooler").and_then(FieldValue::as_str),
        Some("waiting_on_user"),
    );
}

/// A ticket that spawns and then cannot finish spawning leaves no record - and
/// the world has to be able to spawn that same ticket properly afterwards.
#[test]
fn a_ticket_that_failed_to_spawn_can_still_spawn() {
    let mut world = harness();
    let hash = world.graph.snapshot_hash();
    let written = written_down(&world);
    let doomed = json!({
        "id": "ticket:printer",
        "archetype": "flood",
        "flavor": { "title": "T", "body": "B" },
        "reporter": "person:ghost",
        "setup": [
            { "op": "setField", "id": "service:spooler", "field": "status", "value": "wedged" },
        ],
        "resolved_when": {
            "op": "eq",
            "selector": { "id": "service:spooler" },
            "field": "status",
            "value": "running",
        },
        "sla_ticks": 60,
        "reward": { "reputation": 1 },
        "kb_ref": "kb/printer",
    });

    assert!(world.spawn_ticket(&doomed).is_err());
    assert_eq!(world.graph.snapshot_hash(), hash);
    assert_eq!(written_down(&world), written);
    assert!(world.drain_events().is_empty());

    let mut fixed = doomed;
    fixed["reporter"] = json!("person:pat");
    world.spawn_ticket(&fixed).expect("the ticket spawns now");
    assert!(world.tickets.contains("ticket:printer"));
    assert_eq!(
        world
            .graph
            .get_field("service:spooler", "status")
            .and_then(FieldValue::as_str),
        Some("wedged"),
        "the second spawn's setup did not run",
    );
}

/// The undo record belongs to the call that opened it. Two refusals in a row,
/// and a success in between, must not leave one call's changes on another
/// call's books.
#[test]
fn one_call_s_undo_record_is_not_another_call_s() {
    let mut world = harness();
    world
        .register_actions(&json!([
            {
                "id": "spooler.start",
                "tier": 1,
                "apply": [{
                    "op": "set_field",
                    "node": { "id": "service:spooler" },
                    "field": "status",
                    "value": { "const": "running" },
                }],
            },
            {
                "id": "spooler.wedge_then_fail",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "id": "service:spooler" },
                        "field": "status",
                        "value": { "const": "wedged" },
                    },
                    {
                        "op": "set_field",
                        "node": { "id": "node:nowhere" },
                        "field": "name",
                        "value": { "const": "never" },
                    },
                ],
            },
        ]))
        .expect("the verbs register");
    world.drain_events();

    let dispatch = |world: &mut World, id: &str| {
        world.dispatch(id, "person:pat", None, Params::new())
    };

    assert!(matches!(
        dispatch(&mut world, "spooler.wedge_then_fail"),
        DispatchResult::Refused(_),
    ));
    assert!(matches!(
        dispatch(&mut world, "spooler.start"),
        DispatchResult::Ok,
    ));
    world.drain_events();

    let hash = world.graph.snapshot_hash();
    let written = written_down(&world);

    assert!(matches!(
        dispatch(&mut world, "spooler.wedge_then_fail"),
        DispatchResult::Refused(_),
    ));

    // The refusal took back its own wedge and left the earlier, committed
    // start exactly where it was - including the resolution it caused.
    assert_eq!(world.graph.snapshot_hash(), hash);
    assert_eq!(written_down(&world), written);
    assert_eq!(
        world.ticket_state("ticket:spooler").and_then(FieldValue::as_str),
        Some("resolved"),
    );
}

/// A refused advance is an advance that did not happen, and the ticks it
/// walked through moved SLA deadlines and held-minute counters on the way -
/// every one of which is a field write that has to come back.
#[test]
fn a_refused_advance_gives_back_every_minute_it_walked() {
    let mut world = harness();
    world.set_waiting("ticket:spooler", true).expect("park it");
    world.advance(10).expect("ten minutes pass");
    world.drain_events();

    // A second ticket parked at the end of time: extending its deadline is
    // impossible, so the advance below refuses partway through.
    world
        .spawn_ticket(&json!({
            "id": "ticket:parked",
            "archetype": "flood",
            "flavor": { "title": "T", "body": "B" },
            "reporter": "person:pat",
            "setup": [],
            "resolved_when": { "op": "exists", "kind": "device" },
            "sla_ticks": 9_007_199_254_740_981_i64,
            "reward": { "reputation": 1 },
            "kb_ref": "kb/parked",
        }))
        .expect("the second ticket spawns");
    world.set_waiting("ticket:parked", true).expect("park it");
    world.drain_events();

    let hash = world.graph.snapshot_hash();
    let written = written_down(&world);
    let now = world.clock.now();

    assert!(world.advance(50).is_err(), "the SLA cannot be extended");
    assert_eq!(world.clock.now(), now, "the clock kept some of the ticks");
    assert_eq!(world.graph.snapshot_hash(), hash);
    assert_eq!(written_down(&world), written);
    assert!(world.drain_events().is_empty());
}
