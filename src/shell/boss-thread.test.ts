/**
 * The lead's ping, landing where he always writes.
 *
 * The trap this covers is the one the summoned root exists for: the questions
 * that only make sense once there IS a ticket must be unreachable until the
 * ping puts the conversation on them, and reachable the moment it does. A test
 * that only checked "a line was appended" would pass with the thread standing
 * on the wrong node and the player unable to ask him anything.
 */

import { describe, expect, it } from 'vitest';

import { COMPANY_IDS } from '../world/company';
import { dialogueForSpeaker, dialogueNode } from '../world/dialogue';
import { AppStateStore } from './app-state';
import { pingBossThread } from './boss-thread';

const BOSS = COMPANY_IDS.boss;

describe('pinging the boss thread', () => {
  it('opens a thread that reads like one, with the new line last', () => {
    const store = new AppStateStore();
    pingBossThread(store, 'My phone has stopped getting email.');

    const thread = store.get().chat.threads[BOSS];
    const tree = dialogueForSpeaker(BOSS);

    expect(tree).toBeDefined();
    expect(thread?.lines.at(-1)?.text)
      .toBe('My phone has stopped getting email.');
    expect(thread?.lines.at(-1)?.who).toBe('them');
    // He said his usual thing first, so a player who has never opened the
    // channel is not dropped into the middle of a conversation.
    expect(thread?.lines).toHaveLength(2);
    expect(thread?.ended).toBe(false);
  });

  /** The whole point: the conversation is standing where the ping asks. */
  it('leaves the conversation on the node the ping is about', () => {
    const store = new AppStateStore();
    pingBossThread(store, 'Top priority, please.');

    const tree = dialogueForSpeaker(BOSS);
    const thread = store.get().chat.threads[BOSS];

    expect(tree?.summoned_root).toBeDefined();
    expect(thread?.nodeId).toBe(tree?.summoned_root);
    // And the root it is running FROM is unchanged, so the chat app does not
    // decide the thread has moved and restart it underneath the player.
    expect(thread?.rootUsed).toBe(tree?.root);

    const landed = tree === undefined
      ? undefined
      : dialogueNode(tree, thread?.nodeId ?? '');
    expect(landed?.options.some((option) => option.effects !== undefined))
      .toBe(true);
  });

  it('appends to a conversation that is already going', () => {
    const store = new AppStateStore();
    store.patch('chat', {
      threads: {
        [BOSS]: {
          nodeId: 'nag',
          rootUsed: 'nag',
          ended: true,
          lines: [
            { who: 'them', text: 'Are we on top of the queue?' },
            { who: 'you', text: 'Yes.' },
          ],
        },
      },
    });

    pingBossThread(store, 'One more thing.');

    const thread = store.get().chat.threads[BOSS];
    expect(thread?.lines).toHaveLength(3);
    expect(thread?.lines[0]?.text).toBe('Are we on top of the queue?');
    // A thread he has re-opened is not an ended thread any more.
    expect(thread?.ended).toBe(false);
  });

  /** It announces, because the chat app did not do this and cannot know. */
  it('tells the apps their state moved under them', () => {
    const store = new AppStateStore();
    let announced = 0;
    store.onReplaced(() => {
      announced += 1;
    });

    pingBossThread(store, 'Quick one.');
    expect(announced).toBe(1);
  });

  it('leaves whoever the player was talking to selected', () => {
    const store = new AppStateStore();
    store.patch('chat', { selectedId: COMPANY_IDS.ada });

    pingBossThread(store, 'Quick one.');

    expect(store.get().chat.selectedId).toBe(COMPANY_IDS.ada);
  });
});
