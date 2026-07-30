import { isDispatchableAction } from './dispatch';
import { DIALOGUE_TREES } from './trees';
import { type DialogueNode, type DialogueTree, isRevealEffect } from './types';

export {
  applyDialogueEffect,
  type DialogueEffectContext,
  type DialogueEffectResult,
  type EffectDispatch,
  isDispatchableAction,
} from './dispatch';
export {
  type DialogueEffect,
  type DialogueNode,
  type DialogueOption,
  type DialogueTree,
  isRevealEffect,
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

    if (tree.resolved_root !== undefined && tree.ticket === undefined) {
      throw new Error(
        `Tree "${tree.id}" reacts to a resolution but names no ticket.`,
      );
    }

    for (const node of tree.nodes) {
      for (const option of node.options) {
        if (option.label.length === 0) {
          throw new Error(`An option of "${node.id}" has no label.`);
        }

        if (option.next !== undefined && !nodeIds.has(option.next)) {
          throw new Error(
            `Option "${option.label}" of "${tree.id}" leads to missing node `
            + `"${option.next}".`,
          );
        }

        const effect = option.effect;

        if (effect === undefined) {
          continue;
        }

        if (isRevealEffect(effect)) {
          if (effect.reveal.trim().length === 0) {
            throw new Error(
              `Option "${option.label}" of "${tree.id}" reveals nothing.`,
            );
          }

          if (tree.ticket === undefined) {
            throw new Error(
              `Option "${option.label}" of "${tree.id}" reveals a clue with `
              + 'no ticket to write it on.',
            );
          }

          continue;
        }

        if (!isDispatchableAction(effect.action)) {
          throw new Error(
            `Option "${option.label}" of "${tree.id}" dispatches unregistered `
            + `action "${effect.action}".`,
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

  return Object.freeze([...trees]);
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
 * Where a thread starts right now. A person whose ticket is closed opens on
 * their reaction to the fix, not on the complaint they no longer have.
 */
export function dialogueRoot(
  tree: Readonly<DialogueTree>,
  ticketResolved: boolean,
): string {
  return ticketResolved && tree.resolved_root !== undefined
    ? tree.resolved_root
    : tree.root;
}
