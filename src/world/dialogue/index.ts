import { isDispatchableAction } from './dispatch';
import { DIALOGUE_TREES } from './trees';
import {
  type DialogueNode,
  type DialogueTree,
  isAskEffect,
  isRevealEffect,
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
  type DialogueAskEffect,
  type DialogueEffect,
  type DialogueNode,
  type DialogueOption,
  type DialogueTree,
  isAskEffect,
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

            if (tree.ticket === undefined) {
              throw new Error(
                `Option "${option.label}" of "${tree.id}" reveals a clue with `
                + 'no ticket to write it on.',
              );
            }

            continue;
          }

          if (isAskEffect(effect)) {
            if (tree.ticket === undefined) {
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

    assertEveryNodeReachable(tree);
  }

  return Object.freeze([...trees]);
}

/**
 * Content nobody can reach is content nobody will ever see, and it hides the
 * mistake that put it there - a branch wired to the wrong node id looks fine
 * in the file and is simply missing in play.
 */
function assertEveryNodeReachable(tree: Readonly<DialogueTree>): void {
  const seen = new Set<string>();
  const queue: string[] = [tree.root];

  if (tree.resolved_root !== undefined) {
    queue.push(tree.resolved_root);
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
