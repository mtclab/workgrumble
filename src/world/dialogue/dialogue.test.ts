import { describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { createWorldSession } from '../session';
import { findWorldTicket, WORLD_TICKETS } from '../tickets';
import {
  applyDialogueEffect,
  type DialogueEffectResult,
  dialogueForSpeaker,
  dialogueNode,
  dialogueRoot,
  findDialogueTree,
  isRevealEffect,
  validateDialogueTrees,
  WORLD_DIALOGUE,
} from './index';
import type { DialogueTree } from './types';

const CLUE = 'She mentions a colleague was at the keyboard on Friday.';

function tree(overrides: Partial<DialogueTree> = {}): DialogueTree {
  return {
    id: 'dialogue/fixture',
    speaker: 'person:fixture',
    root: 'start',
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
                effect: { action: 'magic.fix_everything', target: 'machine:a' },
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
            options: [{ label: 'Ask', effect: { reveal: CLUE } }],
          },
        ],
      }),
    ])).toThrow('no ticket to write it on');
  });

  it('refuses a missing root and a missing resolved root', () => {
    expect(() => validateDialogueTrees([tree({ root: 'nowhere' })]))
      .toThrow('no root node');
    expect(() => validateDialogueTrees([
      tree({ ticket: 'ticket:x', resolved_root: 'nowhere' }),
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
        dispatch: (action, target, params): DialogueEffectResult => {
          seen.push(`${action}|${target}|${String(params.clue)}`);
          return { ok: true };
        },
      },
    );

    expect(seen).toEqual([
      `ticket.add_clue|ticket:rotated-screen|${CLUE}`,
    ]);
  });

  it('refuses a reveal with no ticket behind the conversation', () => {
    const result = applyDialogueEffect({ reveal: CLUE }, {
      dispatch: (): DialogueEffectResult => ({ ok: true }),
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason)
      .toContain('nowhere to write that down');
  });
});

describe('shipped conversations', () => {
  it('gives every shipped ticket the tree its content names', () => {
    for (const entry of WORLD_TICKETS) {
      const found = findDialogueTree(entry.dialogue_ref);
      expect(found, `${entry.def.id} names ${entry.dialogue_ref}`)
        .toBeDefined();
      expect(found?.ticket).toBe(entry.def.id);
      expect(found?.speaker).toBe(entry.def.reporter);
    }
  });

  it('lets every reporter be reached from the person who filed the ticket', () => {
    for (const entry of WORLD_TICKETS) {
      expect(dialogueForSpeaker(entry.def.reporter)?.id)
        .toBe(entry.dialogue_ref);
    }
  });

  it('hides exactly one cause behind a question in every ticket tree', () => {
    for (const entry of WORLD_TICKETS) {
      const found = findDialogueTree(entry.dialogue_ref);
      const reveals = new Set(
        (found?.nodes ?? []).flatMap((node) => node.options
          .map((option) => option.effect)
          .filter((effect) => effect !== undefined && isRevealEffect(effect))
          .map((effect) => isRevealEffect(effect) ? effect.reveal : '')),
      );

      expect(reveals.size, `${entry.def.id} reveals one cause`).toBe(1);
      expect(found?.resolved_root).toBeDefined();
    }
  });

  it('opens on the reaction once the ticket is closed', () => {
    const found = findDialogueTree('dialogue/rotated-screen');
    expect(found).toBeDefined();

    if (found === undefined) {
      return;
    }

    expect(dialogueRoot(found, false)).toBe(found.root);
    expect(dialogueRoot(found, true)).toBe(found.resolved_root);
    expect(dialogueNode(found, dialogueRoot(found, true))?.npc_line)
      .toContain('right way up');
  });

  it('speaks only for people who exist in the company', () => {
    const session = createWorldSession();

    for (const conversation of WORLD_DIALOGUE) {
      expect(session.graph.getNode(conversation.speaker)?.kind).toBe('person');
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
      .map((option) => option.effect)
      .find((effect) => effect !== undefined && isRevealEffect(effect));
    expect(reveal).toBeDefined();

    if (reveal === undefined) {
      return;
    }

    expect(session.graph.getField(entry.def.id, FIELDS.clues)).toBeUndefined();

    const result = applyDialogueEffect(reveal, {
      ticket: conversation.ticket,
      dispatch: (action, target, params) => session.registry.dispatch(
        action,
        COMPANY_IDS.player,
        target,
        params,
      ),
    });

    expect(result).toEqual({ ok: true });
    expect(session.graph.getField(entry.def.id, FIELDS.clues))
      .toContain('colleague');

    // Asking the same question twice does not double the note, and says so.
    const again = applyDialogueEffect(reveal, {
      ticket: conversation.ticket,
      dispatch: (action, target, params) => session.registry.dispatch(
        action,
        COMPANY_IDS.player,
        target,
        params,
      ),
    });
    expect(again.ok).toBe(false);
  });
});
