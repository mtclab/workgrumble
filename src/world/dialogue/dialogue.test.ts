import { describe, expect, it } from 'vitest';

import { HELPDESK_ACTIONS } from '../actions';
import { COMPANY_IDS } from '../company';
import { FIELDS } from '../fields';
import { mspOnboardingSetup } from '../msp-company';
import { createWorldSession } from '../session';
import { findWorldTicket, WORLD_TICKETS } from '../tickets';
import { directMessagesOn, WEEK_DAYS } from '../week';
import {
  applyDialogueEffect,
  applyDialogueEffects,
  conversationFor,
  type DialogueEffectResult,
  dialogueEffectVerbs,
  dialogueForSpeaker,
  dialogueNode,
  dialogueRemediationRefusal,
  findDialogueTree,
  isAskEffect,
  isDispatchableAction,
  isRegisteredAction,
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

/**
 * THE ALLOWLIST THAT WAS THE WHOLE REGISTRY (0.38.0).
 *
 * A dialogue effect is dispatched with the SHELL's own dispatcher - chat and
 * the phone hand theirs over - and not with the remediation seam, so nothing a
 * conversation sends meets the tenant STOP, the contract scope or the RACI
 * stamp. That was survivable while the allowlist meant something; it meant all
 * fifty-four helpdesk verbs, which is to say it meant nothing, and the first
 * MSP option offering "shall I just restart it for you?" would have reached a
 * customer's estate with every wall in this codebase behind its back.
 *
 * The list is now read off the trees at load - so two people writing
 * conversations cannot collide on a list neither of them edited - and any verb
 * in it that is a REMEDIATION has to be named in the allowance with a reason.
 */
describe('the dialogue dispatcher no longer inherits the whole registry', () => {
  it('narrows to the verbs the shipped conversations actually use', () => {
    // What they do use, as a control.
    expect(isDispatchableAction(HELPDESK_ACTIONS.machineReboot)).toBe(true);
    expect(isDispatchableAction(HELPDESK_ACTIONS.ticketReplyToReporter))
      .toBe(true);

    // And what they do not - registered verbs, every one of them, and the
    // sharpest ones in the game to hand to a conversation. Revert the
    // derivation to `HELPDESK_ACTION_IDS` and all three of these go true.
    expect(isRegisteredAction(HELPDESK_ACTIONS.serviceRestart)).toBe(true);
    expect(isDispatchableAction(HELPDESK_ACTIONS.serviceRestart)).toBe(false);
    expect(isDispatchableAction(HELPDESK_ACTIONS.accountDisable)).toBe(false);
    expect(isDispatchableAction(HELPDESK_ACTIONS.shareGrantAccess)).toBe(false);
  });

  it('derives that list from the trees rather than from a second table', () => {
    expect(dialogueEffectVerbs(WORLD_DIALOGUE))
      .toContain(HELPDESK_ACTIONS.machineReboot);
    // The derived set IS the dispatchable set: a tree is the only thing that
    // can widen it, which is what stops the two lanes colliding at a merge.
    for (const verb of dialogueEffectVerbs(WORLD_DIALOGUE)) {
      expect(isDispatchableAction(verb)).toBe(true);
    }
  });

  it('REFUSES TO LOAD a conversation that offers a remediation nobody named', () => {
    // `service.restart` is exactly the option an MSP tree would grow first, and
    // it is the one that must not arrive quietly. The throw names the verb and
    // the conversation, because whoever reads it has just written the option.
    expect(() => validateDialogueTrees([
      tree({
        nodes: [
          {
            id: 'start',
            npc_line: 'It has stopped again.',
            options: [
              {
                label: 'Shall I just bounce it for you?',
                effects: [
                  {
                    action: HELPDESK_ACTIONS.serviceRestart,
                    target: 'service:theirs',
                  },
                ],
              },
            ],
          },
        ],
      }),
    ])).toThrow('does not go through the remediation seam');
  });

  it('lets the named in-house ones through, which is why the trees load', () => {
    // The other half of the gate: an allowance that named nothing would be a
    // gate that refused the shipped game, and one that named everything would
    // be no gate. `machine.reboot` is in-house on both floors and passes.
    expect(dialogueRemediationRefusal(HELPDESK_ACTIONS.machineReboot))
      .toBeNull();
    expect(dialogueRemediationRefusal(HELPDESK_ACTIONS.serviceRestart))
      .not.toBeNull();
    // And a verb that is not a remediation at all is never the gate's business.
    expect(dialogueRemediationRefusal(HELPDESK_ACTIONS.ticketReplyToReporter))
      .toBeNull();
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
   *
   * A PROJECT TASK is exempt for the same reason and it is the sharper one
   * (E10, 0.29.0): planned work has no hidden cause because nothing is broken.
   * "Build the new box to match" is not a fault anybody is concealing - the
   * conversation about it is a conversation about a plan - and a `reveal`
   * invented for one would be the game pretending a scheduled task is a mystery.
   * The tickets a project CAUSES are not exempt: a factory that cannot reach its
   * press line is a fault, it has a cause, and that cause is the whole lesson.
   */
  it('hides one cause behind a question for every fault of its own', () => {
    for (const conversation of WORLD_DIALOGUE) {
      const own = conversation.tickets.filter((id) => {
        const entry = findWorldTicket(id);
        return entry?.duplicate !== true && entry?.project === undefined;
      });
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
   * A ticket that closes on a REPLY can be replied to (0.32.0).
   *
   * `ticket.reply_to_reporter` is dispatched from exactly one place a player can
   * reach: an option in a conversation. No terminal verb runs it, no control in
   * the tickets app runs it, and nothing else in the world writes `replied`. So
   * a ticket whose resolution rule watches that field, in a tree with no option
   * that dispatches it, is a row in the queue with a clock on it that NOBODY can
   * close - the exact failure the solvability gate exists for, walking straight
   * past it because that gate drives the advertised PATH rather than the surface
   * the path is played on.
   *
   * It shipped. The dental access review (0.14.0) advertised a reply-to-reporter
   * close for six versions and Grace's tree only ever promised to write back;
   * the ticket was unclosable in play and every gate it had was green. This is
   * the standing assertion that forbids the class, and it is checked against the
   * TICKET the option aims at, because an option that replies to a different
   * ticket closes a different ticket.
   */
  it('gives every reply-closed ticket a conversation that can reply', () => {
    const replyClosed = WORLD_TICKETS.filter((entry) => entry.paths.some(
      (path) => path.steps.some(
        (step) => step.action === HELPDESK_ACTIONS.ticketReplyToReporter,
      ),
    ));

    // The sweep only means something if it swept something, and it is three
    // shops' worth: the phish praise, the clinic's access review, and the two
    // the creative agency closes with knowledge rather than with a fix.
    expect(replyClosed.length).toBeGreaterThanOrEqual(4);

    for (const entry of replyClosed) {
      const offered = (findDialogueTree(entry.dialogue_ref)?.nodes ?? [])
        .flatMap((node) => node.options.flatMap((option) => option.effects ?? []))
        .filter((effect) => 'action' in effect
          && effect.action === HELPDESK_ACTIONS.ticketReplyToReporter
          && effect.target === entry.def.id);

      expect(offered.length, `${entry.def.id} can be replied to`)
        .toBeGreaterThan(0);
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
    // Every employer (0.6.0 slice 3, 0.8.0): the tree registry is shared, so a
    // speaker is real if they exist in ANY shop's graph - Bodgeworth's cast in
    // the Bodgeworth world, the MSP's customer contacts in the MSP world, the
    // probation cast in the probation one.
    const probation = createWorldSession();
    const bodge = createWorldSession(Object.freeze({
      farmFund: 0,
      attempt: 1,
      arcWeek: 1,
      employer: 'bodgeworth',
    }));
    const msp = createWorldSession(Object.freeze({
      farmFund: 0,
      attempt: 1,
      arcWeek: 1,
      employer: 'msp',
    }));
    // The onboarding customer (0.13.0) signs mid-week, so its contact is not in
    // the MSP boot world - stand the signed-up client up the way the day driver
    // does, so a conversation authored for its reporter has a person to speak for.
    msp.engine.applySetup(mspOnboardingSetup());
    // The corporate employer (E8, 0.22.0): its exec floor speaks too, so its
    // world has to be one of the ones a speaker can exist in.
    const corporate = createWorldSession(Object.freeze({
      farmFund: 0,
      attempt: 1,
      arcWeek: 1,
      employer: 'corporate',
    }));

    for (const conversation of WORLD_DIALOGUE) {
      const kind = probation.engine.graph.getNode(conversation.speaker)?.kind
        ?? bodge.engine.graph.getNode(conversation.speaker)?.kind
        ?? msp.engine.graph.getNode(conversation.speaker)?.kind
        ?? corporate.engine.graph.getNode(conversation.speaker)?.kind;
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
