//! Ticket lifecycle and action dispatch, against the reference behaviour.
//!
//! These mirror `tickets.test.ts` and `actions.test.ts` case for case: the
//! resolve-exactly-once rule, the breach latch, the waiting extension, the
//! pre-solved spawn, tier gating, and the refusal text a player reads.

use core_rs::actions::parse_params;
use core_rs::events::EngineEvent;
use core_rs::value::FieldValue;
use core_rs::world::World;
use serde_json::{json, Value as Json};

fn harness() -> World {
    let mut world = World::new(1);
    world
        .apply_setup(&json!([
            { "op": "addNode", "node": { "id": "person:reporter", "kind": "person", "fields": { "name": "Reporter" } } },
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
    world.drain_events();
    world
}

fn service_ticket(id: &str, sla_ticks: i64, setup_status: &str) -> Json {
    json!({
        "id": id,
        "archetype": "hidden_cause",
        "flavor": {
            "title": "Printer has entered a reflective phase",
            "body": "Nothing comes out, including an error.",
        },
        "reporter": "person:reporter",
        "setup": [
            { "op": "setField", "id": "service:spooler", "field": "status", "value": setup_status },
        ],
        "resolved_when": {
            "op": "eq",
            "selector": { "id": "service:spooler" },
            "field": "status",
            "value": "running",
        },
        "sla_ticks": sla_ticks,
        "reward": { "reputation": 2 },
        "kb_ref": "kb/print-spooler",
    })
}

fn state(world: &World, id: &str) -> String {
    world
        .ticket_state(id)
        .and_then(FieldValue::as_str)
        .unwrap_or("<none>")
        .to_owned()
}

fn ticket_events(world: &mut World) -> Vec<String> {
    world
        .drain_events()
        .into_iter()
        .filter_map(|event| match event {
            EngineEvent::TicketSpawned(id) => Some(format!("spawned:{id}")),
            EngineEvent::TicketResolved(id) => Some(format!("resolved:{id}")),
            EngineEvent::TicketBreached(id) => Some(format!("breached:{id}")),
            EngineEvent::GraphMutated(_) | EngineEvent::WorldRestored { .. } => None,
        })
        .collect()
}

#[test]
fn stays_open_on_a_wrong_mutation_and_resolves_exactly_once() {
    let mut world = harness();
    world
        .spawn_ticket(&service_ticket("ticket:lifecycle", 4, "wedged"))
        .expect("spawn");

    assert_eq!(
        world.graph.get_field("service:spooler", "status"),
        Some(&FieldValue::Str("wedged".to_owned())),
    );
    assert_eq!(state(&world, "ticket:lifecycle"), "open");
    assert_eq!(ticket_events(&mut world), vec!["spawned:ticket:lifecycle"]);

    world
        .set_field(
            "service:spooler",
            "name",
            FieldValue::Str("Still the Print Spooler".to_owned()),
        )
        .expect("rename");
    assert_eq!(state(&world, "ticket:lifecycle"), "open");
    assert!(ticket_events(&mut world).is_empty());

    world
        .set_field(
            "service:spooler",
            "status",
            FieldValue::Str("running".to_owned()),
        )
        .expect("fix");
    world
        .set_field(
            "service:spooler",
            "status",
            FieldValue::Str("running".to_owned()),
        )
        .expect("fix again");

    assert_eq!(state(&world, "ticket:lifecycle"), "resolved");
    assert_eq!(ticket_events(&mut world), vec!["resolved:ticket:lifecycle"]);
}

#[test]
fn latches_a_breach_at_the_deadline_and_stays_solvable() {
    let mut world = harness();
    world
        .spawn_ticket(&service_ticket("ticket:breach", 2, "wedged"))
        .expect("spawn");
    world.drain_events();

    world.advance(3).expect("advance");

    assert_eq!(state(&world, "ticket:breach"), "breached");
    assert_eq!(world.was_breached("ticket:breach"), Some(true));
    assert_eq!(
        world.graph.get_field("ticket:breach", "breached"),
        Some(&FieldValue::Bool(true)),
    );
    assert_eq!(ticket_events(&mut world), vec!["breached:ticket:breach"]);

    world
        .set_field(
            "service:spooler",
            "status",
            FieldValue::Str("running".to_owned()),
        )
        .expect("fix");

    assert_eq!(state(&world, "ticket:breach"), "resolved");
    assert_eq!(world.was_breached("ticket:breach"), Some(true));
    assert_eq!(ticket_events(&mut world), vec!["resolved:ticket:breach"]);
}

/// The minute each one-off event happened in, written where a day can read it.
///
/// A ticket used to carry only the tick it SPAWNED on, so every daily count
/// except "arrived" was really a question about the ticket's current state
/// wearing a day's name: a ticket that arrived on one day and closed on the
/// next was reported as the first day's close, on a day whose pay had already
/// been banked without it. The stamps are what let a ledger ask WHEN.
#[test]
fn stamps_the_minute_a_ticket_closed_and_the_minute_it_went_red() {
    let mut world = harness();
    world
        .spawn_ticket(&service_ticket("ticket:stamped", 2, "wedged"))
        .expect("spawn");
    world.drain_events();

    // Nothing has happened yet, so there is nothing to stamp.
    assert_eq!(world.graph.get_field("ticket:stamped", "breached_at"), None);
    assert_eq!(world.graph.get_field("ticket:stamped", "resolved_at"), None);

    world.advance(3).expect("advance");
    assert_eq!(
        world.graph.get_field("ticket:stamped", "breached_at"),
        Some(&FieldValue::Num(2.0)),
    );

    world.advance(5).expect("advance");
    world
        .set_field(
            "service:spooler",
            "status",
            FieldValue::Str("running".to_owned()),
        )
        .expect("fix");

    // The close is stamped with the minute it closed in, and the breach still
    // says the minute it went red: two events, two minutes, and a day that can
    // tell which of them belongs to it.
    assert_eq!(
        world.graph.get_field("ticket:stamped", "resolved_at"),
        Some(&FieldValue::Num(8.0)),
    );
    assert_eq!(
        world.graph.get_field("ticket:stamped", "breached_at"),
        Some(&FieldValue::Num(2.0)),
    );
}

#[test]
fn extends_the_deadline_by_exactly_the_ticks_spent_waiting() {
    let mut world = harness();
    world
        .spawn_ticket(&service_ticket("ticket:waiting", 4, "wedged"))
        .expect("spawn");
    world.drain_events();

    assert_eq!(
        world.graph.get_field("ticket:waiting", "sla_deadline"),
        Some(&FieldValue::Num(4.0)),
    );

    world.set_waiting("ticket:waiting", true).expect("park");
    world.advance(3).expect("advance");

    assert_eq!(state(&world, "ticket:waiting"), "waiting_on_user");
    assert_eq!(
        world.graph.get_field("ticket:waiting", "sla_deadline"),
        Some(&FieldValue::Num(7.0)),
    );
    // The pause is counted as well as spent. The deadline alone cannot say
    // how long a ticket has been parked once anything re-cuts it from the
    // minute it arrived - which is exactly what triaging one does.
    assert_eq!(
        world.graph.get_field("ticket:waiting", "held_ticks"),
        Some(&FieldValue::Num(3.0)),
    );

    world.set_waiting("ticket:waiting", false).expect("unpark");
    world.advance(3).expect("advance");
    // And it stops counting the moment the ticket is back on the player.
    assert_eq!(
        world.graph.get_field("ticket:waiting", "held_ticks"),
        Some(&FieldValue::Num(3.0)),
    );
    assert_eq!(state(&world, "ticket:waiting"), "open");
    assert!(ticket_events(&mut world).is_empty());

    world.advance(1).expect("advance");
    assert_eq!(state(&world, "ticket:waiting"), "breached");
    assert_eq!(ticket_events(&mut world), vec!["breached:ticket:waiting"]);
}

#[test]
fn a_pre_solved_spawn_resolves_immediately_after_the_spawned_event() {
    let mut world = harness();
    world
        .spawn_ticket(&service_ticket("ticket:pre-solved", 4, "running"))
        .expect("spawn");

    assert_eq!(state(&world, "ticket:pre-solved"), "resolved");
    assert_eq!(
        ticket_events(&mut world),
        vec!["spawned:ticket:pre-solved", "resolved:ticket:pre-solved"],
    );
}

#[test]
fn applies_every_setup_mutation_through_the_graph() {
    let mut world = harness();
    world
        .apply_setup(&json!([
            { "op": "addNode", "node": { "id": "group:old", "kind": "group", "fields": { "name": "Old printers" } } },
            { "op": "addEdge", "edge": { "from": "person:reporter", "to": "group:old", "kind": "member_of" } },
        ]))
        .expect("extra setup");

    let mut definition = service_ticket("ticket:setup", 4, "wedged");
    definition["setup"] = json!([
        { "op": "addNode", "node": { "id": "group:new", "kind": "group", "fields": { "name": "New printers" } } },
        { "op": "setField", "id": "service:spooler", "field": "status", "value": "wedged" },
        { "op": "addEdge", "edge": { "from": "person:reporter", "to": "group:new", "kind": "member_of" } },
        { "op": "removeEdge", "edge": { "from": "person:reporter", "to": "group:old", "kind": "member_of" } },
    ]);

    world.spawn_ticket(&definition).expect("spawn");

    assert!(world.graph.get_node("group:new").is_some());
    let members: Vec<&str> = world
        .graph
        .neighbors(
            "person:reporter",
            core_rs::graph::Direction::Out,
            Some("member_of"),
        )
        .into_iter()
        .map(|node| node.id.as_str())
        .collect();
    assert_eq!(members, vec!["group:new"]);
}

/// Construction says what the world IS, not what to do to it.
///
/// A ticket whose setup takes an edge away is describing a fault: this account
/// is not in that group. It has to describe it just as truthfully when the
/// player got there first - otherwise a summoned ticket throws as it spawns,
/// in front of somebody, because they tidied a group by hand an hour earlier.
#[test]
fn setup_that_removes_an_edge_describes_a_world_rather_than_a_diff() {
    let mut world = harness();
    let mut definition = service_ticket("ticket:no-such-edge", 4, "wedged");
    definition["setup"] = json!([
        { "op": "setField", "id": "service:spooler", "field": "status", "value": "wedged" },
        { "op": "removeEdge", "edge": { "from": "person:reporter", "to": "group:absent", "kind": "member_of" } },
    ]);

    world.spawn_ticket(&definition).expect("spawn");

    assert_eq!(state(&world, "ticket:no-such-edge"), "open");
    assert!(!world
        .graph
        .has_edge("person:reporter", "group:absent", "member_of"));
}

#[test]
fn refuses_a_ticket_that_would_collide_or_orphan_itself() {
    let mut world = harness();
    world
        .spawn_ticket(&service_ticket("ticket:one", 4, "wedged"))
        .expect("spawn");

    assert_eq!(
        world
            .spawn_ticket(&service_ticket("ticket:one", 4, "wedged"))
            .expect_err("duplicate")
            .message(),
        "Ticket \"ticket:one\" already exists.",
    );

    let mut orphan = service_ticket("ticket:orphan", 4, "wedged");
    orphan["reporter"] = json!("person:nobody");
    assert_eq!(
        world
            .spawn_ticket(&orphan)
            .expect_err("no reporter")
            .message(),
        "Reporter \"person:nobody\" does not exist.",
    );

    let mut self_creating = service_ticket("ticket:self", 4, "wedged");
    self_creating["setup"] = json!([{
        "op": "addNode",
        "node": {
            "id": "ticket:self",
            "kind": "ticket",
            "fields": { "state": "open", "spawned_at": 0, "sla_deadline": 1 },
        },
    }]);
    assert_eq!(
        world
            .spawn_ticket(&self_creating)
            .expect_err("self creating")
            .message(),
        "Ticket setup must not create the ticket node itself.",
    );

    // A ticket nobody registered answers "no" rather than throwing.
    assert!(world.ticket_state("ticket:ghost").is_none());
    assert!(world.was_breached("ticket:ghost").is_none());
    assert_eq!(
        world
            .set_waiting("ticket:ghost", true)
            .expect_err("ghost")
            .message(),
        "Ticket \"ticket:ghost\" is not active.",
    );
}

#[test]
fn gates_actions_by_tier_and_logs_every_attempt() {
    let mut world = harness();
    world
        .register_actions(&json!([
            {
                "id": "service.poke",
                "tier": 2,
                "apply": [{
                    "op": "set_field",
                    "node": { "ref": "target" },
                    "field": "status",
                    "value": { "const": "running" },
                }],
            },
        ]))
        .expect("register");

    let before = world.graph.snapshot_hash();
    let refused = world.dispatch(
        "service.poke",
        "person:reporter",
        Some("service:spooler"),
        parse_params(None).expect("params"),
    );

    match refused {
        core_rs::actions::DispatchResult::Refused(reason) => {
            assert_eq!(reason, "Action \"service.poke\" requires tier 2.");
        }
        other => panic!("expected a refusal, got {other:?}"),
    }
    assert_eq!(world.graph.snapshot_hash(), before);

    let unknown = world.dispatch(
        "service.nope",
        "person:reporter",
        None,
        parse_params(None).expect("params"),
    );
    match unknown {
        core_rs::actions::DispatchResult::Refused(reason) => {
            assert_eq!(reason, "Unknown action \"service.nope\".");
        }
        other => panic!("expected a refusal, got {other:?}"),
    }

    world.registry.set_tier(2).expect("promotion");
    assert!(world
        .dispatch(
            "service.poke",
            "person:reporter",
            Some("service:spooler"),
            parse_params(None).expect("params"),
        )
        .is_ok());
    assert_ne!(world.graph.snapshot_hash(), before);

    let log = world.registry.log();
    assert_eq!(log.len(), 3);
    assert!(!log[0].ok);
    assert!(!log[1].ok);
    assert!(log[2].ok);
    assert!(log[2].reason.is_none());
}

#[test]
fn a_refusal_leaves_the_world_exactly_as_it_was() {
    let mut world = harness();
    world
        .register_actions(&json!({
            "kind_labels": { "service": "a service", "person": "a person" },
            "actions": [{
                "id": "service.restart",
                "tier": 1,
                "validate": [
                    {
                        "when": { "pred": "not", "of": { "pred": "kind_is", "node": { "ref": "target" }, "kind": "service" } },
                        "reason": "\"{target.label}\" is {target.kind_label}, and this action only works on a service.",
                    },
                ],
                "apply": [{
                    "op": "set_field",
                    "node": { "ref": "target" },
                    "field": "status",
                    "value": { "const": "running" },
                }],
            }],
        }))
        .expect("register");

    let before = world.graph.snapshot_hash();
    let result = world.dispatch(
        "service.restart",
        "person:reporter",
        Some("person:reporter"),
        parse_params(None).expect("params"),
    );

    match result {
        core_rs::actions::DispatchResult::Refused(reason) => assert_eq!(
            reason,
            "\"Reporter\" is a person, and this action only works on a service.",
        ),
        other => panic!("expected a refusal, got {other:?}"),
    }
    assert_eq!(world.graph.snapshot_hash(), before);
}

/// Business hours, from the engine's side of the fence.
///
/// The engine has no idea what a shift is. What it has is a clock that can be
/// told the minutes going past are minutes nobody is at the desk, and every
/// unresolved ticket's deadline moves with them. The counter is separate from
/// the pause counter because they are two different sentences on a screen, and
/// the deadline moves once even when both are true.
#[test]
fn holds_every_deadline_while_the_service_clock_is_stopped() {
    let mut world = harness();
    world
        .spawn_ticket(&service_ticket("ticket:overnight", 4, "wedged"))
        .expect("spawn");
    world.drain_events();

    world.clock.set_sla_running(false);
    world.advance(10).expect("the night");

    // Ten minutes nobody could have worked in, so ten minutes back on the
    // clock and no breach - which is the whole bug this fixes: a ticket
    // inherited at eight used to arrive already late for a nine o'clock desk.
    assert_eq!(state(&world, "ticket:overnight"), "open");
    assert_eq!(
        world.graph.get_field("ticket:overnight", "sla_deadline"),
        Some(&FieldValue::Num(14.0)),
    );
    assert_eq!(
        world.graph.get_field("ticket:overnight", "off_hours_ticks"),
        Some(&FieldValue::Num(10.0)),
    );
    // A pause is a different reason and gets a different counter.
    assert_eq!(world.graph.get_field("ticket:overnight", "held_ticks"), None);

    // Parked AND out of hours is still one minute of excuse, not two: the
    // deadline moves by one and the minute is booked to the pause.
    world.set_waiting("ticket:overnight", true).expect("park");
    world.advance(3).expect("parked overnight");
    assert_eq!(
        world.graph.get_field("ticket:overnight", "sla_deadline"),
        Some(&FieldValue::Num(17.0)),
    );
    assert_eq!(
        world.graph.get_field("ticket:overnight", "held_ticks"),
        Some(&FieldValue::Num(3.0)),
    );
    assert_eq!(
        world.graph.get_field("ticket:overnight", "off_hours_ticks"),
        Some(&FieldValue::Num(10.0)),
    );

    // The invariant the triage re-cut relies on: the deadline is the target
    // plus every minute the ticket was excused, and nothing else.
    let number = |field: &str| -> i64 {
        world
            .graph
            .get_field("ticket:overnight", field)
            .and_then(FieldValue::as_safe_int)
            .unwrap_or(0)
    };
    assert_eq!(
        number("sla_deadline"),
        number("spawned_at") + 4 + number("held_ticks") + number("off_hours_ticks"),
    );

    // And once the desk is staffed again the clock is a clock.
    world.set_waiting("ticket:overnight", false).expect("unpark");
    world.clock.set_sla_running(true);
    world.advance(4).expect("the shift");
    assert_eq!(state(&world, "ticket:overnight"), "breached");
}

/// A meeting holds nothing and pauses nothing.
///
/// This is the invariant the whole interruption family is built on top of, and
/// it is asserted here rather than in the shell because it is a claim about the
/// ENGINE: a takeover that owns the screen is not a reason the queue stops. The
/// mandatory sync is thirty minutes in which the player can see the shape of
/// the queue and cannot touch it, and every clock runs - which is the comedy
/// and is also the only honest arithmetic. If a later lane were to "help" by
/// holding the service clock for the meeting's duration, or by parking the
/// tickets it interrupts, `off_hours_ticks` or `held_ticks` would start moving
/// and this test goes red on the exact line that describes the lie.
///
/// The four-term identity is checked before, during and after, because a
/// meeting that quietly handed back thirty minutes would still satisfy it at
/// the end: the terms would all have moved together.
#[test]
fn a_meeting_holds_nothing_and_pauses_nothing() {
    const TARGET: i64 = 90;
    const MEETING_MINUTES: i64 = 30;

    let mut world = harness();
    world
        .spawn_ticket(&service_ticket("ticket:hygiene-sync", TARGET, "wedged"))
        .expect("spawn");
    world.drain_events();

    let number = |world: &World, field: &str| -> i64 {
        world
            .graph
            .get_field("ticket:hygiene-sync", field)
            .and_then(FieldValue::as_safe_int)
            .unwrap_or(0)
    };
    let invariant = |world: &World| {
        assert_eq!(
            number(world, "sla_deadline"),
            number(world, "spawned_at")
                + TARGET
                + number(world, "held_ticks")
                + number(world, "off_hours_ticks"),
            "deadline == spawn + target + held + off_hours",
        );
    };

    // Ten minutes of ordinary work first, so "nothing moved" is a claim about
    // the meeting rather than about a world that has not started.
    world.advance(10).expect("the morning");
    invariant(&world);
    let deadline_before = number(&world, "sla_deadline");

    // The meeting. Nobody parks the ticket, nobody stops the service clock,
    // and the player cannot reach the desk for any of it.
    for minute in 1..=MEETING_MINUTES {
        world.advance(1).expect("a minute of the sync");
        invariant(&world);
        assert_eq!(
            number(&world, "sla_deadline"),
            deadline_before,
            "the deadline moved during minute {minute} of a meeting",
        );
        assert_eq!(number(&world, "held_ticks"), 0);
        assert_eq!(number(&world, "off_hours_ticks"), 0);
    }

    assert_eq!(state(&world, "ticket:hygiene-sync"), "open");
    invariant(&world);

    // And the arithmetic is honest at the far end of it: the deadline is where
    // it always was, so the half hour spent in a room came straight off the
    // time there was to fix anything, and the ticket goes red on the minute it
    // was always going to.
    let spent = 10 + MEETING_MINUTES;
    world.advance(TARGET - spent - 1).expect("up to the wire");
    assert_eq!(world.clock.now(), deadline_before - 1);
    assert_eq!(state(&world, "ticket:hygiene-sync"), "open");
    world.advance(1).expect("past it");
    assert_eq!(state(&world, "ticket:hygiene-sync"), "breached");
}

/// The op is the only way a world says it: a verb in the registry, dispatched
/// like everything else, so a replayed log stops the clock in the same minute.
#[test]
fn the_sla_clock_is_moved_by_a_dispatched_verb() {
    let mut world = harness();
    world
        .register_actions(&json!({
            "actions": [
                {
                    "id": "day.hold_sla",
                    "tier": 1,
                    "apply": [{ "op": "set_sla_clock", "running": false }],
                },
                {
                    "id": "day.run_sla",
                    "tier": 1,
                    "apply": [{ "op": "set_sla_clock", "running": true }],
                },
            ],
        }))
        .expect("register");

    let call = |world: &mut World, id: &str| {
        world.dispatch(
            id,
            "person:reporter",
            None,
            parse_params(None).expect("params"),
        )
    };

    assert!(world.clock.sla_runs());
    call(&mut world, "day.hold_sla");
    assert!(!world.clock.sla_runs());
    call(&mut world, "day.run_sla");
    assert!(world.clock.sla_runs());
}
