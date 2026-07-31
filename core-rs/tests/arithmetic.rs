//! The arithmetic value form, driven through a real dispatch.
//!
//! `ops.rs` proves what a definition may SAY; this proves what happens when
//! one runs. Everything a meter needs is here: a field that moves by a
//! parameter, floors and ceilings that hold, and the four ways it can refuse -
//! each of which has to leave the world exactly as it was, because a meter
//! half-moved by a refused action is worse than one that never moved.

use core_rs::ops::Params;
use core_rs::value::FieldValue;
use core_rs::world::World;
use serde_json::{json, Value as Json};

const MAX_SAFE_INT: i64 = 9_007_199_254_740_991;

/// A person with two meters on them and the verbs that move them.
fn harness() -> World {
    let mut world = World::new(3);
    world
        .apply_setup(&json!([
            {
                "op": "addNode",
                "node": {
                    "id": "person:pat",
                    "kind": "person",
                    "fields": { "name": "Pat", "stress": 50, "note": "quiet" },
                },
            },
            {
                "op": "addNode",
                "node": {
                    "id": "device:printer",
                    "kind": "device",
                    "fields": { "name": "Hercules 400", "queue_len": 7 },
                },
            },
        ]))
        .expect("harness setup");
    world
        .register_actions(&json!([
            {
                "id": "meters.up",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "ref": "actor" },
                        "field": "stress",
                        "value": {
                            "add": {
                                "node": { "ref": "actor" },
                                "field": "stress",
                                "by": { "param": "amount" },
                                "clamp": { "min": 0, "max": 100 },
                            },
                        },
                    },
                ],
            },
            {
                "id": "meters.down",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "ref": "actor" },
                        "field": "stress",
                        "value": {
                            "sub": {
                                "node": { "ref": "actor" },
                                "field": "stress",
                                "by": { "param": "amount" },
                                "clamp": { "min": 0, "max": 100 },
                            },
                        },
                    },
                ],
            },
            {
                "id": "meters.by_field",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "ref": "actor" },
                        "field": "stress",
                        "value": {
                            "add": {
                                "node": { "ref": "actor" },
                                "field": "stress",
                                "by": {
                                    "field": { "node": { "ref": "target" }, "field": "queue_len" },
                                },
                                "clamp": { "min": 0, "max": 100 },
                            },
                        },
                    },
                ],
            },
            {
                "id": "meters.move_the_note",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "ref": "actor" },
                        "field": "note",
                        "value": {
                            "add": {
                                "node": { "ref": "actor" },
                                "field": "note",
                                "by": { "const": 1 },
                                "clamp": { "min": 0, "max": 100 },
                            },
                        },
                    },
                ],
            },
            {
                "id": "meters.up_then_break",
                "tier": 1,
                "apply": [
                    {
                        "op": "set_field",
                        "node": { "ref": "actor" },
                        "field": "stress",
                        "value": {
                            "add": {
                                "node": { "ref": "actor" },
                                "field": "stress",
                                "by": { "const": 10 },
                                "clamp": { "min": 0, "max": 100 },
                            },
                        },
                    },
                    {
                        "op": "set_field",
                        "node": { "ref": "actor" },
                        "field": "stress",
                        "value": {
                            "add": {
                                "node": { "ref": "actor" },
                                "field": "note",
                                "by": { "const": 1 },
                                "clamp": { "min": 0, "max": 100 },
                            },
                        },
                    },
                ],
            },
        ]))
        .expect("verbs");
    world
}

fn amount(value: Json) -> Params {
    let mut params = Params::new();
    params.insert(
        "amount".to_owned(),
        FieldValue::from_json(&value).expect("a field value"),
    );
    params
}

fn stress(world: &World) -> Option<i64> {
    world
        .graph
        .get_field("person:pat", "stress")
        .and_then(FieldValue::as_safe_int)
}

fn dispatch(world: &mut World, id: &str, params: Params) -> Result<(), String> {
    match world.dispatch(id, "person:pat", Some("device:printer"), params) {
        core_rs::actions::DispatchResult::Ok => Ok(()),
        core_rs::actions::DispatchResult::Refused(reason) => Err(reason),
    }
}

#[test]
fn moves_a_meter_up_and_down_by_a_parameter() {
    let mut world = harness();

    dispatch(&mut world, "meters.up", amount(json!(7))).expect("up");
    assert_eq!(stress(&world), Some(57));

    dispatch(&mut world, "meters.down", amount(json!(20))).expect("down");
    assert_eq!(stress(&world), Some(37));

    // Zero is a legal move, and it is a move to the same place.
    dispatch(&mut world, "meters.up", amount(json!(0))).expect("nothing");
    assert_eq!(stress(&world), Some(37));

    // The operand may come from the world instead of the caller.
    dispatch(&mut world, "meters.by_field", Params::new()).expect("by field");
    assert_eq!(stress(&world), Some(44));
}

/// The whole point of the clamp: a step that would overshoot lands on the
/// boundary rather than being refused, because a meter at 99 hit for 10 is a
/// meter at 100.
#[test]
fn holds_the_answer_inside_the_clamp_at_both_ends() {
    let mut world = harness();

    dispatch(&mut world, "meters.up", amount(json!(60))).expect("ceiling");
    assert_eq!(stress(&world), Some(100));

    dispatch(&mut world, "meters.up", amount(json!(1))).expect("still the ceiling");
    assert_eq!(stress(&world), Some(100));

    dispatch(&mut world, "meters.down", amount(json!(500))).expect("floor");
    assert_eq!(stress(&world), Some(0));

    dispatch(&mut world, "meters.down", amount(json!(1))).expect("still the floor");
    assert_eq!(stress(&world), Some(0));

    // A negative operand moves the other way and is clamped just the same:
    // "add" is a direction, not a promise that the number gets bigger.
    dispatch(&mut world, "meters.up", amount(json!(-5))).expect("negative add");
    assert_eq!(stress(&world), Some(0));
    dispatch(&mut world, "meters.down", amount(json!(-30))).expect("negative sub");
    assert_eq!(stress(&world), Some(30));
}

/// Everything the evaluator cannot honour is a sentence, and none of it is a
/// number quietly written over a meter.
#[test]
fn refuses_an_operand_or_a_base_that_is_not_a_whole_number() {
    let mut world = harness();

    for wrong in [json!("seven"), json!(true), json!(null), json!(1.5)] {
        let refusal = dispatch(&mut world, "meters.up", amount(wrong.clone()))
            .expect_err("not a whole number");
        assert!(
            refusal.contains("only be moved by a whole number"),
            "{wrong}: {refusal}",
        );
        assert_eq!(stress(&world), Some(50), "the meter did not move");
    }

    // A missing parameter is not a number either.
    assert!(dispatch(&mut world, "meters.up", Params::new()).is_err());
    assert_eq!(stress(&world), Some(50));

    // Nor is a number the browser could not read back.
    assert!(dispatch(&mut world, "meters.up", amount(json!(MAX_SAFE_INT))).is_err());
    assert_eq!(stress(&world), Some(50));

    // A field that was never a number has nothing to move.
    let base = dispatch(&mut world, "meters.move_the_note", Params::new())
        .expect_err("text is not a meter");
    assert!(base.contains("is not a whole number"), "{base}");
    assert_eq!(
        world.graph.get_field("person:pat", "note"),
        Some(&FieldValue::Str("quiet".to_owned())),
    );
}

/// A refusal from the second op has to take the first one with it: an action
/// is one thing the player did, and a meter left half-moved by a definition
/// that could not finish is the worst of both answers.
#[test]
fn a_refused_arithmetic_leaves_the_earlier_ops_undone() {
    let mut world = harness();
    let before = world.graph.snapshot_hash();

    let refusal = dispatch(&mut world, "meters.up_then_break", Params::new())
        .expect_err("the second op cannot work");
    assert!(refusal.contains("is not a whole number"), "{refusal}");

    assert_eq!(stress(&world), Some(50));
    assert_eq!(world.graph.snapshot_hash(), before);
}
