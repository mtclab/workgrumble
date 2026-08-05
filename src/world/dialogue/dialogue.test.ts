import { describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { createWorldSession } from '../session';
import { findWorldTicket, WORLD_TICKETS } from '../tickets';
import { directMessagesOn, WEEK_DAYS } from '../week';
import {
  applyDialogueEffect,
  applyDialogueEffects,
  conversationFor,
  type DialogueEffectResult,
  dialogueForSpeaker,
  dialogueNode,
  findDialogueTree,
  isAskEffect,
  isRevealEffect,
  validateDialogueTrees,
  WORLD_DIALOGUE,
} from './index';
import type { DialogueTree } from './types';

const CLUE = 'She mentions a colleague was at the keyboard on Friday.';
/** What the player said to earn it - the line an `asks` puts on the record. */
const SAID = 'Was anybody else at your desk on Friday?';

function tree(overrides: Partial<DialogueTree> = {}): DialogueTree {
  return {
    id: 'dialogue/fixture',
    speaker: 'person:fixture',
    root: 'start',
    tickets: [],
    nodes: [
      {
        id: 'start',
        npc_line: 'It is broken.',
        options: [{ label: 'Ask how' }],
      },
    ],
    ...overrides,
  };
}

describe('dialogue content gate', () => {
  it('accepts the shipped trees', () => {
    expect(validateDialogueTrees(WORLD_DIALOGUE)).toHaveLength(
      WORLD_DIALOGUE.length,
    );
  });

  it('refuses an option that leads nowhere', () => {
    expect(() => validateDialogueTrees([
      tree({
        nodes: [
          {
            id: 'start',
            npc_line: 'It is broken.',
            options: [{ label: 'Ask how', next: 'missing' }],
          },
        ],
      }),
    ])).toThrow('missing node');
  });

  it('refuses a node that leaves the player no way out', () => {
    expect(() => validateDialogueTrees([
      tree({
        nodes: [{ id: 'start', npc_line: 'It is broken.', options: [] }],
      }),
    ])).toThrow('no way out');
  });

  it('refuses an effect that names an action nobody registered', () => {
    expect(() => validateDialogueTrees([
      tree({
        nodes: [
          {
            id: 'start',
            npc_line: 'It is broken.',
            options: [
              {
                label: 'Fix it by magic',
                effects: [
                  { action: 'magic.fix_everything', target: 'machine:a' },
                ],
              },
            ],
          },
        ],
      }),
    ])).toThrow('unregistered action');
  });

  it('refuses a reveal with no ticket to write on', () => {
    expect(() => validateDialogueTrees([
      tree({
        nodes: [
          {
            id: 'start',
            npc_line: 'It is broken.',
            options: [{ label: 'Ask', effects: [{ reveal: CLUE }] }],
          },
        ],
      }),
    ])).toThrow('no ticket to write it on');
  });

  it('refuses a missing root and a missing resolved root', () => {
    expect(() => validateDialogueTrees([tree({ root: 'nowhere' })]))
      .toThrow('no root node');
    expect(() => validateDialogueTrees([
      tree({ tickets: ['ticket:x'], resolved_root: 'nowhere' }),
    ])).toThrow('no resolved root');
  });

  it('refuses two options that read the same in one node', () => {
    expect(() => validateDialogueTrees([
      tree({
        nodes: [
          {
            id: 'start',
            npc_line: 'It is broken.',
            options: [{ label: 'Ask how' }, { label: 'Ask how' }],
          },
        ],
      }),
    ])).toThrow('twice');
  });

  it('refuses content no conversation can reach', () => {
    expect(() => validateDialogueTrees([
      tree({
        nodes: [
          {
            id: 'start',
            npc_line: 'It is broken.',
            options: [{ label: 'Ask how' }],
          },
          {
            id: 'orphan',
            npc_line: 'Nobody will ever read this.',
            options: [{ label: 'Nor this' }],
          },
        ],
      }),
    ])).toThrow('cannot be reached');
  });

  it('refuses two trees for the same speaker', () => {
    expect(() => validateDialogueTrees([tree(), tree({ id: 'dialogue/2' })]))
      .toThrow('more than one dialogue tree');
  });
});

describe('dialogue effect dispatcher', () => {
  it('refuses an action outside the helpdesk registry without dispatching', () => {
    let calls = 0;
    const result = applyDialogueEffect(
      { action: 'world.delete_everything', target: 'machine:ada' },
      {
        said: 'Never said.',
        dispatch: (): DialogueEffectResult => {
          calls += 1;
          return { ok: true };
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason)
      .toContain('not something this workstation knows');
    expect(calls).toBe(0);
  });

  it('sends a registered action through with its parameters', () => {
    const seen: string[] = [];
    const result = applyDialogueEffect(
      {
        action: HELPDESK_ACTIONS.machineSetDisplayRotation,
        target: COMPANY_IDS.adaMachine,
        params: { rotation: 0 },
      },
      {
        said: SAID,
        dispatch: (action, target, params): DialogueEffectResult => {
          seen.push(`${action}|${target}|${JSON.stringify(params)}`);
          return { ok: true };
        },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(seen).toEqual([
      `machine.set_display_rotation|${COMPANY_IDS.adaMachine}|{"rotation":0}`,
    ]);
  });

  it('turns a reveal into the clue action aimed at the conversation ticket', () => {
    const seen: string[] = [];
    applyDialogueEffect(
      { reveal: CLUE },
      {
        ticket: 'ticket:rotated-screen',
        said: SAID,
        dispatch: (action, target, params): DialogueEffectResult => {
          seen.push(`${action}|${target}|${String(params.note)}`);
          return { ok: true };
        },
      },
    );

    expect(seen).toEqual([
      `ticket.add_worknote|ticket:rotated-screen|${CLUE}`,
    ]);
  });

  it('refuses a reveal with no ticket behind the conversation', () => {
    const result = applyDialogueEffect({ reveal: CLUE }, {
      said: SAID,
      dispatch: (): DialogueEffectResult => ({ ok: true }),
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason)
      .toContain('nowhere to write that down');
  });

  /**
   * Asking is not a flag any more: the question the player picked goes onto
   * the ticket where the reporter can see it, which is the only evidence the
   * CYA rule accepts.
   */
  it('turns asking into a customer-visible comment in the player\'s words', () => {
    const seen: string[] = [];
    applyDialogueEffect({ asks: true }, {
      ticket: 'ticket:rotated-screen',
      said: SAID,
      dispatch: (action, target, params): DialogueEffectResult => {
        seen.push(`${action}|${target}|${String(params.comment)}`);
        return { ok: true };
      },
    });

    expect(seen).toEqual([`ticket.add_comment|ticket:rotated-screen|${SAID}`]);
  });

  it('refuses to log a question that has no ticket behind it', () => {
    const result = applyDialogueEffect({ asks: true }, {
      said: SAID,
      dispatch: (): DialogueEffectResult => ({ ok: true }),
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason)
      .toContain('no clock this question could ever stop');
  });

  /**
   * Every effect on an option runs, in order, even after one is refused: the
   * right question asked twice still counts as asking, and only the clue is
   * the repeat.
   */
  it('runs every effect an option carries and keeps the first refusal', () => {
    const seen: string[] = [];
    const outcome = applyDialogueEffects(
      [{ asks: true }, { reveal: CLUE }, { asks: true }],
      {
        ticket: 'ticket:rotated-screen',
        said: SAID,
        dispatch: (action): DialogueEffectResult => {
          seen.push(action);
          return action === HELPDESK_ACTIONS.ticketAddWorknote
            ? { ok: false, reason: 'Already written on the ticket.' }
            : { ok: true };
        },
      },
    );

    expect(seen).toEqual([
      HELPDESK_ACTIONS.ticketAddComment,
      HELPDESK_ACTIONS.ticketAddWorknote,
      HELPDESK_ACTIONS.ticketAddComment,
    ]);
    expect(outcome.done).toEqual([{ asks: true }, { asks: true }]);
    expect(outcome.refusal).toBe('Already written on the ticket.');
  });
});

describe('shipped conversations', () => {
  it('gives every shipped ticket the tree its content names', () => {
    for (const entry of WORLD_TICKETS) {
      const found = findDialogueTree(entry.dialogue_ref);
      expect(found, `${entry.def.id} names ${entry.dialogue_ref}`)
        .toBeDefined();
      expect(found?.tickets).toContain(entry.def.id);
      expect(found?.speaker).toBe(entry.def.reporter);
    }
  });

  it('lets every reporter be reached from the person who filed the ticket', () => {
    for (const entry of WORLD_TICKETS) {
      expect(dialogueForSpeaker(entry.def.reporter)?.id)
        .toBe(entry.dialogue_ref);
    }
  });

  /**
   * One hidden cause per fault of the person's own.
   *
   * It used to be one per TREE, which was the same rule while every reporter
   * had exactly one ticket. A week with a flood in it needs the other half
   * said out loud: a duplicate has no cause of its own to hide, because its
   * cause is the parent's, and inventing a second explanation for the same
   * outage would be a conversation that lies to forty people in four different
   * ways.
   */
  it('hides one cause behind a question for every fault of its own', () => {
    for (const conversation of WORLD_DIALOGUE) {
      const own = conversation.tickets.filter(
        (id) => findWorldTicket(id)?.duplicate !== true,
      );
      const reveals = new Set(
        conversation.nodes.flatMap((node) => node.options
          .flatMap((option) => option.effects ?? [])
          .filter(isRevealEffect)
          .map((effect) => effect.reveal)),
      );

      expect(reveals.size, `${conversation.id} hides its own causes`)
        .toBe(own.length);

      // And a reaction for every one of them: the person who told two people
      // she had been hacked has a different thing to say afterwards from the
      // person whose mouse turned out to have batteries in it.
      for (const ticket of conversation.tickets) {
        expect(
          conversation.resolved_roots?.[ticket] ?? conversation.resolved_root,
          `${conversation.id} reacts to ${ticket}`,
        ).toBeDefined();
      }
    }
  });

  /**
   * The other half of the CYA gate. `ticket.set_waiting` refuses until the
   * reporter has been asked something, so a reporter with no `asks` option in
   * their tree is a ticket the player can NEVER legitimately park - a dead
   * end built out of two rules that each look fine alone.
   */
  it('gives every reporter a question that counts as having asked', () => {
    for (const entry of WORLD_TICKETS) {
      if (entry.def.reporter === COMPANY_IDS.player) {
        continue;
      }

      const found = findDialogueTree(entry.dialogue_ref);
      const asks = (found?.nodes ?? []).flatMap(
        (node) => node.options.flatMap((option) => option.effects ?? []),
      ).filter(isAskEffect);

      expect(asks.length, `${entry.def.id} can be asked something`)
        .toBeGreaterThan(0);
    }
  });

  /**
   * You cannot ask yourself a question and call the SLA stopped. The ticket
   * the player filed about their own desk carries no `asks` anywhere, which
   * is what keeps the CYA rule from being self-service.
   */
  it('refuses to let the player ask themselves anything', () => {
    const self = findDialogueTree('dialogue/yourself');

    expect(self?.speaker).toBe(COMPANY_IDS.player);
    expect(
      (self?.nodes ?? []).flatMap(
        (node) => node.options.flatMap((option) => option.effects ?? []),
      ).filter(isAskEffect),
    ).toEqual([]);
  });

  it('opens on the reaction once the ticket is closed', () => {
    const session = createWorldSession();
    const found = findDialogueTree('dialogue/sales');
    expect(found).toBeDefined();

    if (found === undefined) {
      return;
    }

    const complaining = conversationFor(found, session.engine.graph);
    expect(complaining.open).toBe(true);
    expect(complaining.ticket).toBe('ticket:rotated-screen');
    expect(complaining.root).toBe(found.root);

    session.engine.dispatch(
      HELPDESK_ACTIONS.machineSetDisplayRotation,
      COMPANY_IDS.player,
      COMPANY_IDS.adaMachine,
      { rotation: 0 },
    );

    const after = conversationFor(found, session.engine.graph);
    expect(after.open).toBe(false);
    expect(after.root).toBe(found.resolved_roots?.['ticket:rotated-screen']);
    expect(dialogueNode(found, after.root)?.npc_line).toContain('right way up');
  });

  /**
   * And a person with nothing raised yet has nothing to be about. The lead's
   * concern is not a ticket until he mentions it, and a contact list that
   * flagged him at eight o'clock would be advertising somebody's future.
   */
  it('is about nothing until one of their tickets exists', () => {
    const session = createWorldSession();
    const found = findDialogueTree('dialogue/the-lead');
    expect(found).toBeDefined();

    if (found === undefined) {
      return;
    }

    const idle = conversationFor(found, session.engine.graph);
    expect(idle.ticket).toBeUndefined();
    expect(idle.open).toBe(false);
    expect(idle.root).toBe(found.root);
  });

  /**
   * Everybody the week lets message you directly has somewhere for that
   * message to land. A `summoned_root` is the entry point nothing in a tree
   * points at, so a person without one is a conversation that opens on their
   * small talk with a favour nobody can see having been asked for - which is
   * not a crash and is not a wrong number, it is the beat simply not existing.
   */
  it('gives every direct message a node to arrive on', () => {
    for (let day = 1; day <= WEEK_DAYS; day += 1) {
      for (const slot of directMessagesOn(day)) {
        const found = dialogueForSpeaker(slot.speaker);

        expect(found, `${slot.speaker} has a conversation`).toBeDefined();
        expect(found?.summoned_root, `${slot.speaker} can be summoned`)
          .toBeDefined();
      }
    }
  });

  it('speaks only for people who exist in a company', () => {
    // Both employers (0.6.0 slice 3): the tree registry is shared, so a speaker
    // is real if they exist in EITHER shop's graph - Bodgeworth's cast in the
    // Bodgeworth world, the probation cast in the probation one.
    const probation = createWorldSession();
    const bodge = createWorldSession(Object.freeze({
      farmFund: 0,
      attempt: 1,
      arcWeek: 1,
      employer: 'bodgeworth',
    }));

    for (const conversation of WORLD_DIALOGUE) {
      const kind = probation.engine.graph.getNode(conversation.speaker)?.kind
        ?? bodge.engine.graph.getNode(conversation.speaker)?.kind;
      expect(kind, conversation.speaker).toBe('person');
    }
  });
});

/**
 * The journey, not the call: the right question in the shipped conversation
 * has to end with the cause written on the real ticket in the real world.
 */
describe('asking the right question', () => {
  it('writes the hidden cause onto the ticket it belongs to', () => {
    const session = createWorldSession();
    const entry = findWorldTicket('ticket:rotated-screen');
    const conversation = findDialogueTree(entry?.dialogue_ref ?? '');
    expect(conversation).toBeDefined();

    if (conversation === undefined || entry === undefined) {
      return;
    }

    const reveal = conversation.nodes
      .flatMap((node) => node.options)
      .flatMap((option) => option.effects ?? [])
      .find(isRevealEffect);
    expect(reveal).toBeDefined();

    if (reveal === undefined) {
      return;
    }

    expect(session.engine.graph.getField(entry.def.id, FIELDS.worknotes)).toBeUndefined();

    const result = applyDialogueEffect(reveal, {
      ticket: conversation.tickets[0],
      said: SAID,
      dispatch: (action, target, params) => session.engine.dispatch(
        action,
        COMPANY_IDS.player,
        target,
        params,
      ),
    });

    expect(result).toEqual({ ok: true });
    expect(session.engine.graph.getField(entry.def.id, FIELDS.worknotes))
      .toContain('colleague');

    // Asking the same question twice does not double the note, and says so.
    const again = applyDialogueEffect(reveal, {
      ticket: conversation.tickets[0],
      said: SAID,
      dispatch: (action, target, params) => session.engine.dispatch(
        action,
        COMPANY_IDS.player,
        target,
        params,
      ),
    });
    expect(again.ok).toBe(false);
  });
});
