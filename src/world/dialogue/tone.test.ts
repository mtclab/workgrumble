import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import {
  METER_FLOOR,
  RUDE_REPUTATION_COST,
  RUDE_REPUTATION_ESCALATION,
  STARTING_REPUTATION,
} from '../meters';
import { createWorldSession } from '../session';
import { spawnWorldTicket } from '../tickets';
import {
  applyDialogueEffects,
  type DialogueEffect,
  type DialogueOption,
  type DialogueTree,
  isSocialEffect,
  validateDialogueTrees,
  WORLD_DIALOGUE,
} from './index';

beforeAll(() => {
  loadEngineForTests();
});

/** Make sure the ticket is in the world, whether or not the day put it there. */
function ensureTicket(
  session: ReturnType<typeof createWorldSession>,
  id: string,
): void {
  if (session.engine.graph.getNode(id) === undefined) {
    spawnWorldTicket(session.engine, id);
  }
}

/** Every aggressive option shipped, with the beat it sits on. */
interface ToneBeat {
  readonly tree: DialogueTree;
  readonly nodeId: string;
  readonly option: DialogueOption;
  readonly siblings: readonly DialogueOption[];
}

function aggressiveBeats(): readonly ToneBeat[] {
  const beats: ToneBeat[] = [];

  for (const tree of WORLD_DIALOGUE) {
    for (const node of tree.nodes) {
      for (const option of node.options) {
        if (option.tone === 'aggressive') {
          beats.push({
            tree,
            nodeId: node.id,
            option,
            siblings: node.options,
          });
        }
      }
    }
  }

  return beats;
}

/** The effects that do the fix - everything that is not the social cost. */
function ticketWork(option: Readonly<DialogueOption>): readonly DialogueEffect[] {
  return (option.effects ?? []).filter((effect) => !isSocialEffect(effect));
}

function socialEffects(
  option: Readonly<DialogueOption>,
): readonly DialogueEffect[] {
  return (option.effects ?? []).filter(isSocialEffect);
}

describe('the aggressive register ships as a register', () => {
  it('appears on more than one beat, so it reads as a range not a button', () => {
    expect(aggressiveBeats().length).toBeGreaterThanOrEqual(3);
  });

  it('carries at least one genuinely crude line, the catharsis asked for', () => {
    const labels = aggressiveBeats().map((beat) => beat.option.label);
    expect(labels.some((label) => /fuck off/i.test(label))).toBe(true);
  });

  it('never makes an aggressive reply the first option on its beat', () => {
    // Not the default: the crude thing is always a deliberate reach past the
    // plain answer, never the one the cursor lands on.
    for (const beat of aggressiveBeats()) {
      expect(beat.siblings[0]?.tone, `${beat.tree.id}/${beat.nodeId}`)
        .not.toBe('aggressive');
    }
  });
});

/**
 * THE load-bearing invariant, proven on the real shipped content: an aggressive
 * reply is the same fix as a neutral one, plus a social cost, and nothing else.
 */
describe('the load-bearing invariant, on shipped data', () => {
  it('runs the SAME ticket work as a neutral twin on the same beat', () => {
    for (const beat of aggressiveBeats()) {
      const work = JSON.stringify(ticketWork(beat.option));
      const twin = beat.siblings.find(
        (other) => other !== beat.option
          && other.tone !== 'aggressive'
          && JSON.stringify(ticketWork(other)) === work,
      );

      expect(twin, `${beat.tree.id}/${beat.nodeId}: "${beat.option.label}"`)
        .toBeDefined();
    }
  });

  it('adds exactly one social effect and changes nothing about the fix', () => {
    for (const beat of aggressiveBeats()) {
      const social = socialEffects(beat.option);
      expect(social.length, beat.option.label).toBe(1);
      expect(
        social.every((effect) => 'action' in effect
          && effect.action === HELPDESK_ACTIONS.reporterRebuff),
        beat.option.label,
      ).toBe(true);
    }
  });
});

/**
 * The gate with teeth. Each of these mutates real shipped content the way a
 * careless edit would and proves the boot fails - a gate that stayed green with
 * the fix reverted would be worthless.
 */
describe('the tone gate has teeth', () => {
  function cloneTrees(): DialogueTree[] {
    return structuredClone(WORLD_DIALOGUE) as DialogueTree[];
  }

  function firstAggressive(
    trees: readonly DialogueTree[],
  ): DialogueOption {
    for (const tree of trees) {
      for (const node of tree.nodes) {
        for (const option of node.options) {
          if (option.tone === 'aggressive') {
            return option;
          }
        }
      }
    }

    throw new Error('No aggressive option in the shipped trees to mutate.');
  }

  /** An aggressive option whose fix is more than one effect (a diagnostic). */
  function multiEffectAggressive(
    trees: readonly DialogueTree[],
  ): { effects: DialogueEffect[] } {
    for (const tree of trees) {
      for (const node of tree.nodes) {
        for (const option of node.options) {
          if (option.tone === 'aggressive'
            && (option.effects ?? []).filter((e) => !isSocialEffect(e))
              .length >= 2) {
            return option as unknown as { effects: DialogueEffect[] };
          }
        }
      }
    }

    throw new Error('No multi-effect aggressive option to mutate.');
  }

  it('reds when an aggressive reply DROPS one of its ticket effects', () => {
    const trees = cloneTrees();
    const option = multiEffectAggressive(trees);
    // Strip the first non-social (ticket-work) effect: the fix now differs from
    // the neutral twin's, which still has it. What is left is NOT empty, so this
    // is the "changed the fix" red rather than the "no fix at all" one.
    const index = option.effects.findIndex((effect) => !isSocialEffect(effect));
    expect(index).toBeGreaterThanOrEqual(0);
    option.effects.splice(index, 1);

    expect(() => validateDialogueTrees(trees))
      .toThrow('same ticket work');
  });

  it('reds when an aggressive reply drops its fix ENTIRELY', () => {
    const trees = cloneTrees();
    const option = firstAggressive(trees) as unknown as { effects: DialogueEffect[] };
    // Keep only the social cost: the fix is gone completely. A do-nothing
    // neutral sibling must NOT be allowed to stand in as the twin.
    option.effects = option.effects.filter(isSocialEffect);

    expect(() => validateDialogueTrees(trees))
      .toThrow('no ticket work');
  });

  it('reds when an aggressive reply CHANGES a ticket effect', () => {
    const trees = cloneTrees();
    const option = firstAggressive(trees) as unknown as { effects: DialogueEffect[] };
    // The first effect that actually carries a payload to change - an `asks` is
    // a bare marker with nothing to mutate, so skip it and take the reveal or
    // the action underneath.
    const work = option.effects.find(
      (effect) => !isSocialEffect(effect)
        && ('action' in effect || 'reveal' in effect),
    );

    if (work !== undefined && 'action' in work) {
      (work as { target: string }).target = 'machine:not-the-same-one';
    } else if (work !== undefined && 'reveal' in work) {
      (work as { reveal: string }).reveal = 'A different truth entirely.';
    }

    expect(() => validateDialogueTrees(trees))
      .toThrow('same ticket work');
  });

  it('reds when an aggressive reply carries no social cost', () => {
    const trees = cloneTrees();
    const option = firstAggressive(trees) as unknown as { effects: DialogueEffect[] };
    option.effects = option.effects.filter((effect) => !isSocialEffect(effect));

    expect(() => validateDialogueTrees(trees))
      .toThrow('no social effect');
  });

  it('reds when a NEUTRAL reply carries a social cost', () => {
    expect(() => validateDialogueTrees([
      {
        id: 'dialogue/fixture',
        speaker: 'person:fixture',
        root: 'start',
        tickets: ['ticket:x'],
        nodes: [
          {
            id: 'start',
            npc_line: 'It is broken.',
            options: [
              {
                label: 'Be quietly rude',
                effects: [
                  { action: HELPDESK_ACTIONS.reporterRebuff, target: 'ticket:x',
                    params: { reaction_first: 'a', reaction_again: 'b' } },
                ],
              },
            ],
          },
        ],
      },
    ])).toThrow('neutral but carries a social effect');
  });

  it('reds on a register this build does not know', () => {
    expect(() => validateDialogueTrees([
      {
        id: 'dialogue/fixture',
        speaker: 'person:fixture',
        root: 'start',
        tickets: [],
        nodes: [
          {
            id: 'start',
            npc_line: 'It is broken.',
            options: [
              { label: 'Purr at them', tone: 'wry' as never },
            ],
          },
        ],
      },
    ])).toThrow('not a register this build knows');
  });

  /** The aggressive option that fixes the screen, in a cloned tree, mutable. */
  function rotateAggressive(
    trees: readonly DialogueTree[],
  ): {
    effects: DialogueEffect[];
    next?: string;
  } {
    for (const tree of trees) {
      for (const node of tree.nodes) {
        for (const option of node.options) {
          if (option.tone === 'aggressive'
            && (option.effects ?? []).some((e) => 'action' in e
              && e.action === HELPDESK_ACTIONS.machineSetDisplayRotation)) {
            return option as unknown as {
              effects: DialogueEffect[];
              next?: string;
            };
          }
        }
      }
    }

    throw new Error('No screen-rotate aggressive option to mutate.');
  }

  /** The rebuff effect inside a mutable aggressive option. */
  function rebuffOf(
    option: { effects: DialogueEffect[] },
  ): { action: string; target: string; params: Record<string, unknown> } {
    const rebuff = option.effects.find((e) => 'action' in e
      && e.action === HELPDESK_ACTIONS.reporterRebuff);

    if (rebuff === undefined) {
      throw new Error('No rebuff in the option.');
    }

    return rebuff as unknown as {
      action: string;
      target: string;
      params: Record<string, unknown>;
    };
  }

  // P1-1: same immediate effects but a DIFFERENT continuation is still a
  // different resolution path - the tone changed where the conversation goes.
  it('reds when an aggressive reply BRANCHES where its twin does not', () => {
    const trees = cloneTrees();
    const option = rotateAggressive(trees);
    // Point it somewhere its neutral twin does not go, keeping the same fix.
    option.next = 'complaint';

    expect(() => validateDialogueTrees(trees)).toThrow('continuation');
  });

  // P1-2: the rebuff must be PAYABLE at load, or it fails at runtime after the
  // rude line already committed - free rudeness.
  it('reds when the rebuff is missing a reaction, not at runtime', () => {
    const trees = cloneTrees();
    const rebuff = rebuffOf(rotateAggressive(trees));
    delete rebuff.params.reaction_again;

    expect(() => validateDialogueTrees(trees)).toThrow('reaction_again');
  });

  it('reds when the rebuff is aimed at the wrong ticket for the beat', () => {
    const trees = cloneTrees();
    const rebuff = rebuffOf(rotateAggressive(trees));
    // A ticket this reporter DOES file, but not the one this beat is about.
    rebuff.target = 'ticket:flat-mouse';

    expect(() => validateDialogueTrees(trees)).toThrow('wrong ticket');
  });

  it('reds when the rebuff is aimed at a ticket the reporter never files', () => {
    const trees = cloneTrees();
    const rebuff = rebuffOf(rotateAggressive(trees));
    rebuff.target = 'ticket:invented';

    expect(() => validateDialogueTrees(trees))
      .toThrow('not a ticket this reporter files');
  });

  it('reds when an aggressive reply carries two social effects', () => {
    const trees = cloneTrees();
    const option = rotateAggressive(trees);
    option.effects.push({
      action: HELPDESK_ACTIONS.reporterRebuff,
      target: 'ticket:rotated-screen',
      params: { reaction_first: 'a', reaction_again: 'b' },
    });

    expect(() => validateDialogueTrees(trees))
      .toThrow('more than one social effect');
  });
});

/** The Ada beat that fixes the screen: the clearest "the fix still happens". */
function rotateBeat(): ToneBeat {
  const beat = aggressiveBeats().find((candidate) => ticketWork(candidate.option)
    .some((effect) => 'action' in effect
      && effect.action === HELPDESK_ACTIONS.machineSetDisplayRotation));

  if (beat === undefined) {
    throw new Error('No aggressive option ships on the screen-rotation beat.');
  }

  return beat;
}

/** Its neutral twin, for the side-by-side that proves they fix the same. */
function neutralTwinOf(beat: ToneBeat): DialogueOption {
  const work = JSON.stringify(ticketWork(beat.option));
  const twin = beat.siblings.find(
    (other) => other !== beat.option
      && other.tone !== 'aggressive'
      && JSON.stringify(ticketWork(other)) === work,
  );

  if (twin === undefined) {
    throw new Error('The rotate beat has no neutral twin.');
  }

  return twin;
}

function reputationOf(session: ReturnType<typeof createWorldSession>): number {
  const value = session.engine.graph.getField(
    COMPANY_IDS.player,
    FIELDS.reputation,
  );

  return typeof value === 'number' ? value : Number.NaN;
}

function playOption(
  session: ReturnType<typeof createWorldSession>,
  option: Readonly<DialogueOption>,
  ticket: string,
): void {
  applyDialogueEffects(option.effects ?? [], {
    ticket,
    said: option.label,
    dispatch: (action, target, params) => session.engine.dispatch(
      action,
      COMPANY_IDS.player,
      target,
      params,
    ),
  });
}

describe('the fix still happens - the goal, not the call', () => {
  const TICKET = 'ticket:rotated-screen';

  it('resolves the ticket byte-identically to the neutral reply', () => {
    const beat = rotateBeat();
    const twin = neutralTwinOf(beat);

    const rude = createWorldSession();
    ensureTicket(rude, TICKET);
    playOption(rude, beat.option, TICKET);

    const polite = createWorldSession();
    ensureTicket(polite, TICKET);
    playOption(polite, twin, TICKET);

    // Same world outcome for the ticket: both resolve it.
    expect(rude.engine.ticketState(TICKET)).toBe('resolved');
    expect(polite.engine.ticketState(TICKET)).toBe('resolved');
    expect(rude.engine.ticketState(TICKET))
      .toBe(polite.engine.ticketState(TICKET));
  });

  it('drops reputation on the rude reply and not on the polite one', () => {
    const beat = rotateBeat();
    const twin = neutralTwinOf(beat);

    const rude = createWorldSession();
    ensureTicket(rude, TICKET);
    expect(reputationOf(rude)).toBe(STARTING_REPUTATION);
    playOption(rude, beat.option, TICKET);
    expect(reputationOf(rude)).toBe(STARTING_REPUTATION - RUDE_REPUTATION_COST);

    const polite = createWorldSession();
    ensureTicket(polite, TICKET);
    playOption(polite, twin, TICKET);
    expect(reputationOf(polite)).toBe(STARTING_REPUTATION);
  });
});

describe('the reporter reacts, and repeating escalates', () => {
  const TICKET = 'ticket:rotated-screen';

  function rebuff(
    session: ReturnType<typeof createWorldSession>,
  ): void {
    session.engine.dispatch(
      HELPDESK_ACTIONS.reporterRebuff,
      COMPANY_IDS.player,
      TICKET,
      { reaction_first: 'First: they go quiet.', reaction_again: 'Again: they escalate.' },
    );
  }

  it('lands the first reaction on the reporter\'s stream and counts it', () => {
    const session = createWorldSession();
    ensureTicket(session, TICKET);

    rebuff(session);

    expect(session.engine.graph.getField(TICKET, FIELDS.reporterReaction))
      .toContain('First: they go quiet.');
    expect(session.engine.graph.getField(TICKET, FIELDS.rudeReplies)).toBe(1);
    expect(reputationOf(session))
      .toBe(STARTING_REPUTATION - RUDE_REPUTATION_COST);
  });

  it('sharpens the reaction and steepens the cost on a repeat', () => {
    const session = createWorldSession();
    ensureTicket(session, TICKET);

    rebuff(session);
    rebuff(session);

    const stream = session.engine.graph.getField(TICKET, FIELDS.reporterReaction);
    expect(stream).toContain('First: they go quiet.');
    expect(stream).toContain('Again: they escalate.');
    expect(session.engine.graph.getField(TICKET, FIELDS.rudeReplies)).toBe(2);
    // The flat cost once, plus the escalation on the second.
    expect(reputationOf(session)).toBe(
      STARTING_REPUTATION
      - RUDE_REPUTATION_COST
      - (RUDE_REPUTATION_COST + RUDE_REPUTATION_ESCALATION),
    );
  });

  // P1-3: the reaction lands somewhere that does NOT satisfy the CYA rule, so a
  // rude reply can never unlock "waiting on user" that its neutral twin cannot.
  it('does not write the customer-visible stream, so it cannot park the SLA',
    () => {
      const session = createWorldSession();
      ensureTicket(session, TICKET);

      rebuff(session);

      // The reaction went to reporter_reaction, not customer_visible.
      expect(session.engine.graph.getField(TICKET, FIELDS.customerVisible))
        .toBeUndefined();

      // And so the affordance is unchanged: with nothing PUT to the reporter,
      // parking the clock on them is refused exactly as it would be with no
      // rude reply at all.
      const parked = session.engine.dispatch(
        HELPDESK_ACTIONS.ticketSetWaiting,
        COMPANY_IDS.player,
        TICKET,
        {},
      );
      expect(parked.ok).toBe(false);
    });

  // P2: the counter is world state, so a save carries it - a reload mid-week
  // must not forget that a reporter has already been snapped at.
  it('carries the counter and the reaction across a save round-trip', () => {
    const before = createWorldSession();
    ensureTicket(before, TICKET);
    rebuff(before);
    const saved = before.engine.serialize();

    const after = createWorldSession();
    after.engine.restore(saved);

    expect(after.engine.graph.getField(TICKET, FIELDS.rudeReplies)).toBe(1);
    expect(after.engine.graph.getField(TICKET, FIELDS.reporterReaction))
      .toContain('First: they go quiet.');

    // And a restored counter still escalates: the next snap is the second one.
    after.engine.dispatch(
      HELPDESK_ACTIONS.reporterRebuff,
      COMPANY_IDS.player,
      TICKET,
      { reaction_first: 'x', reaction_again: 'Again: they escalate.' },
    );
    expect(after.engine.graph.getField(TICKET, FIELDS.rudeReplies)).toBe(2);
    expect(after.engine.graph.getField(TICKET, FIELDS.reporterReaction))
      .toContain('Again: they escalate.');
  });

  // P2: the boundary/saturation. Reputation is clamped at the floor, and enough
  // rudeness drives it there; it must SATURATE at zero rather than run negative,
  // however many more times the reporter is snapped at. (The counter carries the
  // same shape of clamp at the top - `Number.MAX_SAFE_INTEGER` in the action -
  // which the save round-trip above proves survives a reload.)
  it('saturates reputation at the floor under repeated rudeness', () => {
    const session = createWorldSession();
    ensureTicket(session, TICKET);

    // Far more snaps than it takes to spend fifty points at four-then-seven a
    // time: the meter must land on the floor and stay there.
    for (let snap = 0; snap < 40; snap += 1) {
      rebuff(session);
    }

    expect(reputationOf(session)).toBe(METER_FLOOR);
    // And the counter kept counting the whole time - saturation is the meter's,
    // not the record's.
    expect(session.engine.graph.getField(TICKET, FIELDS.rudeReplies)).toBe(40);
  });
});
