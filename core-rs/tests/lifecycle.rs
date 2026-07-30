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
        "reward": { "reputation": 2, "money": 10 },
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

    world.set_waiting("ticket:waiting", false).expect("unpark");
    world.advance(3).expect("advance");
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
