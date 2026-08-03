import type { ReadOnlyGraphView } from '../../engine-api';
import { FIELDS } from '../fields';
import { isDispatchableAction } from './dispatch';
import { DIALOGUE_TREES } from './trees';
import {
  type DialogueEffect,
  type DialogueNode,
  type DialogueOption,
  type DialogueTree,
  isAskEffect,
  isRevealEffect,
  isSocialEffect,
} from './types';

export {
  applyDialogueEffect,
  applyDialogueEffects,
  type DialogueEffectContext,
  type DialogueEffectResult,
  type DialogueEffectsOutcome,
  type EffectDispatch,
  isDispatchableAction,
} from './dispatch';
export {
  assertAwayLines,
  assertPresenceChatter,
  AWAY_LINE_ROSTER,
  AWAY_NOTICED_LINES,
  awayNoticedLine,
  PRESENCE_CHATTER,
  presenceChatter,
  type PresenceRemark,
} from './presence';
export {
  type DialogueAskEffect,
  type DialogueEffect,
  type DialogueNode,
  type DialogueOption,
  type DialogueTone,
  type DialogueTree,
  isAskEffect,
  isRevealEffect,
  isSocialEffect,
  SOCIAL_ACTIONS,
} from './types';

/**
 * Load-time content gate. A conversation that points at a node it does not
 * have, or at an action nobody registered, is a dead end in front of a player
 * - so it stops the boot here instead of stopping the player later.
 */
export function validateDialogueTrees(
  trees: readonly DialogueTree[],
): readonly DialogueTree[] {
  const ids = new Set<string>();
  const speakers = new Set<string>();

  for (const tree of trees) {
    if (tree.id.length === 0) {
      throw new Error('Dialogue tree id must be a non-empty string.');
    }

    if (ids.has(tree.id)) {
      throw new Error(`Duplicate dialogue tree "${tree.id}".`);
    }

    ids.add(tree.id);

    if (speakers.has(tree.speaker)) {
      throw new Error(
        `"${tree.speaker}" speaks in more than one dialogue tree.`,
      );
    }

    speakers.add(tree.speaker);

    const nodeIds = new Set<string>();

    for (const node of tree.nodes) {
      if (nodeIds.has(node.id)) {
        throw new Error(`Tree "${tree.id}" repeats node "${node.id}".`);
      }

      nodeIds.add(node.id);

      if (node.npc_line.length === 0) {
        throw new Error(`Node "${node.id}" of "${tree.id}" says nothing.`);
      }

      if (node.options.length === 0) {
        throw new Error(
          `Node "${node.id}" of "${tree.id}" leaves the player no way out.`,
        );
      }
    }

    if (!nodeIds.has(tree.root)) {
      throw new Error(`Tree "${tree.id}" has no root node "${tree.root}".`);
    }

    if (tree.resolved_root !== undefined && !nodeIds.has(tree.resolved_root)) {
      throw new Error(
        `Tree "${tree.id}" has no resolved root "${tree.resolved_root}".`,
      );
    }

    if (tree.summoned_root !== undefined && !nodeIds.has(tree.summoned_root)) {
      throw new Error(
        `Tree "${tree.id}" has no summoned root "${tree.summoned_root}".`,
      );
    }

    if (tree.hello_root !== undefined && !nodeIds.has(tree.hello_root)) {
      throw new Error(
        `Tree "${tree.id}" opens a bare hello on "${tree.hello_root}", which `
        + 'it has no node for.',
      );
    }

    // A greeting with the question already in it is not the beat. The node the
    // day drops somebody on has to lead SOMEWHERE, and the option on it is the
    // player asking what they want - so a hello root whose only option ends
    // the conversation is a person who said hi and left, which reads in play
    // as a chat window that did nothing.
    if (
      tree.hello_root !== undefined
      && !(dialogueNode(tree, tree.hello_root)?.options ?? []).some(
        (option) => option.next !== undefined,
      )
    ) {
      throw new Error(
        `Tree "${tree.id}" opens a bare hello on "${tree.hello_root}" and it `
        + 'leads nowhere. The greeting is the half without the question in '
        + 'it; something has to be on the other side of asking.',
      );
    }

    for (const landing of tree.call_roots ?? []) {
      if (!nodeIds.has(landing)) {
        throw new Error(
          `Tree "${tree.id}" answers a call on "${landing}", which it has no `
          + 'node for.',
        );
      }
    }

    if (tree.resolved_root !== undefined && tree.tickets.length === 0) {
      throw new Error(
        `Tree "${tree.id}" reacts to a resolution but names no ticket.`,
      );
    }

    if (new Set(tree.tickets).size !== tree.tickets.length) {
      throw new Error(`Tree "${tree.id}" names the same ticket twice.`);
    }

    for (const map of [tree.roots ?? {}, tree.resolved_roots ?? {}]) {
      for (const [ticket, node] of Object.entries(map)) {
        if (!tree.tickets.includes(ticket)) {
          throw new Error(
            `Tree "${tree.id}" opens on "${node}" for "${ticket}", which is `
            + 'not one of the tickets this person reports.',
          );
        }

        if (!nodeIds.has(node)) {
          throw new Error(
            `Tree "${tree.id}" opens "${ticket}" on missing node "${node}".`,
          );
        }
      }
    }

    // One opening line per complaint, once there is more than one complaint.
    // Two tickets sharing a root is a person who answers the phone about the
    // wrong problem - which reads, in play, as content that has not noticed
    // itself.
    if (tree.tickets.length > 1) {
      for (const ticket of tree.tickets) {
        if (tree.roots?.[ticket] === undefined) {
          throw new Error(
            `Tree "${tree.id}" reports ${String(tree.tickets.length)} tickets `
            + `and has no opening line for "${ticket}".`,
          );
        }
      }
    }

    for (const node of tree.nodes) {
      const labels = new Set<string>();

      for (const option of node.options) {
        if (option.label.length === 0) {
          throw new Error(`An option of "${node.id}" has no label.`);
        }

        // Two options reading the same in one breath is a content bug: the
        // player cannot tell them apart, and neither can anything driving
        // the UI by what it says on the button.
        if (labels.has(option.label)) {
          throw new Error(
            `Node "${node.id}" of "${tree.id}" offers "${option.label}" twice.`,
          );
        }

        labels.add(option.label);

        if (option.next !== undefined && !nodeIds.has(option.next)) {
          throw new Error(
            `Option "${option.label}" of "${tree.id}" leads to missing node `
            + `"${option.next}".`,
          );
        }

        for (const effect of option.effects ?? []) {
          if (isRevealEffect(effect)) {
            if (effect.reveal.trim().length === 0) {
              throw new Error(
                `Option "${option.label}" of "${tree.id}" reveals nothing.`,
              );
            }

            if (tree.tickets.length === 0) {
              throw new Error(
                `Option "${option.label}" of "${tree.id}" reveals a clue with `
                + 'no ticket to write it on.',
              );
            }

            continue;
          }

          if (isAskEffect(effect)) {
            if (tree.tickets.length === 0) {
              throw new Error(
                `Option "${option.label}" of "${tree.id}" asks a question `
                + 'with no ticket to log it against.',
              );
            }

            continue;
          }

          if (!isDispatchableAction(effect.action)) {
            throw new Error(
              `Option "${option.label}" of "${tree.id}" dispatches `
              + `unregistered action "${effect.action}".`,
            );
          }

          if (effect.target.length === 0) {
            throw new Error(
              `Option "${option.label}" of "${tree.id}" aims at nothing.`,
            );
          }
        }
      }
    }

    for (const node of tree.nodes) {
      assertToneInvariant(tree, node);
    }

    assertEveryNodeReachable(tree);
  }

  return Object.freeze([...trees]);
}

/**
 * A ticket-work effect, serialised so two of them can be compared for being the
 * same act on the same node with the same payload.
 *
 * A reveal is its note, an ask is an ask, and a dispatched action is its verb,
 * its target and its parameters with the keys in a fixed order - because "same
 * actions/targets" is the whole of what the tone gate has to prove, and two
 * option literals authored months apart cannot be trusted to have written their
 * `params` keys in the same order.
 */
function serialiseTicketWork(effect: Readonly<DialogueEffect>): string {
  if (isRevealEffect(effect)) {
    return `reveal|${effect.reveal}`;
  }

  if (isAskEffect(effect)) {
    return 'ask';
  }

  const params = effect.params ?? {};
  const keyed = Object.keys(params)
    .sort()
    .map((key) => `${key}=${JSON.stringify(params[key])}`)
    .join(',');

  return `action|${effect.action}|${effect.target}|${keyed}`;
}

/** The effects on an option that do the fix, in the order they run. */
function ticketWork(option: Readonly<DialogueOption>): readonly string[] {
  return (option.effects ?? [])
    .filter((effect) => !isSocialEffect(effect))
    .map(serialiseTicketWork);
}

function sameTicketWork(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((line, index) => line === right[index]);
}

/**
 * THE load-bearing gate: a toned reply is the same fix, said differently.
 *
 * The whole promise of the aggressive register - that you can be as rude as the
 * option allows and the ticket still resolves - rests on one structural fact:
 * an aggressive option's TICKET WORK is identical to a neutral option's on the
 * same beat, and the only thing it adds is a social effect. This proves it at
 * load, so a content file that quietly dropped the rotate from the rude reply, or
 * changed which machine it rebooted, is a boot failure at the desk rather than a
 * ticket the player loses for sarcasm three days into a walk.
 *
 * It has teeth in both directions:
 * - an aggressive option with no social effect is a register that costs nothing,
 *   which is not a register;
 * - an aggressive option whose ticket work matches no neutral sibling is a fix
 *   that changed with the tone, which is the exact thing forbidden;
 * - a neutral option carrying a social effect is a cost with no register asking
 *   for it, which is a snap the framework never authored.
 */
function assertToneInvariant(
  tree: Readonly<DialogueTree>,
  node: Readonly<DialogueNode>,
): void {
  for (const option of node.options) {
    if (option.tone !== undefined && option.tone !== 'aggressive'
      && option.tone !== 'neutral') {
      throw new Error(
        `Option "${option.label}" of "${tree.id}" is said in tone `
        + `"${String(option.tone)}", which is not a register this build knows.`,
      );
    }

    const social = (option.effects ?? []).some(isSocialEffect);

    if (option.tone === 'aggressive') {
      if (!social) {
        throw new Error(
          `Aggressive option "${option.label}" of "${tree.id}" carries no `
          + 'social effect. A register that costs nothing is not a register - '
          + 'the whole of the tone is the cost it adds.',
        );
      }

      const work = ticketWork(option);

      // The register is "the same FIX said rudely". An aggressive option with no
      // ticket work at all has no fix to protect - and, worse, its empty work
      // would match any do-nothing neutral sibling and slip the twin check
      // below, which is the exact hole a dropped effect would fall through. So a
      // toned reply has to carry a fix, and the twin check is what proves it is
      // the SAME one.
      if (work.length === 0) {
        throw new Error(
          `Aggressive option "${option.label}" of "${tree.id}" carries no `
          + 'ticket work. The aggressive register is a fix said rudely; a rude '
          + 'line with no fix on it has nothing for the tone to protect, and a '
          + 'social cost with no fix beside it belongs somewhere else.',
        );
      }

      const twin = node.options.find(
        (other) => other !== option
          && other.tone !== 'aggressive'
          && sameTicketWork(ticketWork(other), work),
      );

      if (twin === undefined) {
        throw new Error(
          `Aggressive option "${option.label}" of "${tree.id}" has no neutral `
          + 'twin on this beat with the same ticket work. A toned reply must run '
          + 'the SAME fix as the plain one and only add the social cost; this '
          + 'one either changed the fix or dropped it, which is the one thing '
          + 'the tone framework forbids.',
        );
      }

      continue;
    }

    if (social) {
      throw new Error(
        `Option "${option.label}" of "${tree.id}" is neutral but carries a `
        + 'social effect. The cost belongs to the aggressive register; a plain '
        + 'reply that pays it is a snap nobody chose.',
      );
    }
  }
}

/**
 * Content nobody can reach is content nobody will ever see, and it hides the
 * mistake that put it there - a branch wired to the wrong node id looks fine
 * in the file and is simply missing in play.
 */
function assertEveryNodeReachable(tree: Readonly<DialogueTree>): void {
  const seen = new Set<string>();
  const queue: string[] = [
    tree.root,
    ...Object.values(tree.roots ?? {}),
    ...Object.values(tree.resolved_roots ?? {}),
  ];

  if (tree.resolved_root !== undefined) {
    queue.push(tree.resolved_root);
  }

  // A summoned node is reachable - by the system that summons it. It is still
  // an entry point, so everything hanging off it is still gated by this walk.
  if (tree.summoned_root !== undefined) {
    queue.push(tree.summoned_root);
  }

  // And the same for the nodes a ringing phone opens on. The day's schedule
  // reaches them; nothing in the tree does, which is the point.
  queue.push(...tree.call_roots ?? []);

  if (tree.hello_root !== undefined) {
    queue.push(tree.hello_root);
  }

  while (queue.length > 0) {
    const id = queue.pop();

    if (id === undefined || seen.has(id)) {
      continue;
    }

    seen.add(id);

    for (const option of dialogueNode(tree, id)?.options ?? []) {
      if (option.next !== undefined) {
        queue.push(option.next);
      }
    }
  }

  for (const node of tree.nodes) {
    if (!seen.has(node.id)) {
      throw new Error(
        `Node "${node.id}" of "${tree.id}" cannot be reached from any root.`,
      );
    }
  }
}

export const WORLD_DIALOGUE: readonly DialogueTree[] = validateDialogueTrees(
  DIALOGUE_TREES,
);

export function findDialogueTree(id: string): DialogueTree | undefined {
  return WORLD_DIALOGUE.find((tree) => tree.id === id);
}

/** The conversation Chat opens when the player picks a person. */
export function dialogueForSpeaker(
  personId: string,
): DialogueTree | undefined {
  return WORLD_DIALOGUE.find((tree) => tree.speaker === personId);
}

export function dialogueNode(
  tree: Readonly<DialogueTree>,
  nodeId: string,
): DialogueNode | undefined {
  return tree.nodes.find((node) => node.id === nodeId);
}

/**
 * What this person is ringing about right now, and where the conversation
 * starts because of it.
 *
 * Three questions with one answer, because they are one question. Which of
 * their tickets is live decides which complaint they open on, whether they are
 * flagged in the contact list, and which ticket a `reveal` writes to - and
 * working any of those out separately is how the three come to disagree.
 *
 * The rule is the order the person experiences: the first of their tickets that
 * is in the world and still open is the one they want to talk about. When they
 * are all closed it is the last one, so they react to the fix instead of
 * repeating a complaint they no longer have; when none of them exists yet -
 * a follow-up that has not been earned, a concern the lead has not raised - it
 * is nothing, and the tree's own root is small talk.
 */
export interface Conversation {
  /** The ticket the thread is about, or nothing while none exists. */
  readonly ticket: string | undefined;
  /** Where the thread opens. */
  readonly root: string;
  /** Whether they have something live - what the contact list flags. */
  readonly open: boolean;
}

export function conversationFor(
  tree: Readonly<DialogueTree>,
  graph: ReadOnlyGraphView,
): Conversation {
  const raised = tree.tickets.filter(
    (id) => graph.getNode(id) !== undefined,
  );
  const live = raised.find(
    (id) => graph.getField(id, FIELDS.state) !== 'resolved',
  );

  if (live !== undefined) {
    return {
      ticket: live,
      root: tree.roots?.[live] ?? tree.root,
      open: true,
    };
  }

  const last = raised[raised.length - 1];

  return {
    ticket: last,
    root: last === undefined
      ? tree.root
      : tree.resolved_roots?.[last]
        ?? tree.resolved_root
        ?? tree.roots?.[last]
        ?? tree.root,
    open: false,
  };
}
