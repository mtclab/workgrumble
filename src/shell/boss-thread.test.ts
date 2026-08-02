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
import { pingBossThread, remarkInThread } from './boss-thread';

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

/**
 * A remark is not a question, and the difference is load-bearing: the office
 * noticing your dot must not move a conversation the player is halfway
 * through, and somebody who has been waiting all afternoon is making a point
 * rather than opening a menu.
 */
describe('somebody remarking in a thread', () => {
  it('says its piece and leaves the conversation where it stood', () => {
    const store = new AppStateStore();
    store.patch('chat', {
      threads: {
        [COMPANY_IDS.ada]: {
          nodeId: 'friday',
          rootUsed: 'complaint',
          ended: false,
          lines: [
            { who: 'them', text: 'I have been hacked.' },
            { who: 'you', text: 'Ask about Friday' },
          ],
        },
      },
    });

    expect(remarkInThread(store, COMPANY_IDS.ada, 'Your dot says Away.'))
      .toBe(true);

    const thread = store.get().chat.threads[COMPANY_IDS.ada];

    expect(thread?.lines).toHaveLength(3);
    expect(thread?.lines.at(-1)).toEqual({
      who: 'them',
      text: 'Your dot says Away.',
    });
    // Untouched, which a ping deliberately does not do: the player is midway
    // through asking her something and this is somebody talking over the top.
    expect(thread?.nodeId).toBe('friday');
    expect(thread?.rootUsed).toBe('complaint');
  });

  it('opens a thread that reads like one for somebody never spoken to', () => {
    const store = new AppStateStore();

    expect(remarkInThread(store, COMPANY_IDS.bev, 'You have gone red.'))
      .toBe(true);

    const thread = store.get().chat.threads[COMPANY_IDS.bev];

    expect(thread?.lines).toHaveLength(2);
    expect(thread?.lines.at(-1)?.text).toBe('You have gone red.');
  });

  /**
   * The chatter's whole sparseness rule, and it is idempotence taken off the
   * SAVE rather than out of a counter: a line already in the transcript is a
   * line already said, on both sides of a reload.
   */
  it('says a once-only line once, however often it is offered', () => {
    const store = new AppStateStore();

    expect(remarkInThread(store, COMPANY_IDS.bev, 'You have gone red.', true))
      .toBe(true);
    expect(remarkInThread(store, COMPANY_IDS.bev, 'You have gone red.', true))
      .toBe(false);
    expect(store.get().chat.threads[COMPANY_IDS.bev]?.lines).toHaveLength(2);

    // And without the flag it is somebody saying the same thing again, which
    // is what a person waiting a second day does.
    expect(remarkInThread(store, COMPANY_IDS.bev, 'You have gone red.'))
      .toBe(true);
    expect(store.get().chat.threads[COMPANY_IDS.bev]?.lines).toHaveLength(3);
  });

  it('says nothing at all for somebody with no conversation in the game', () => {
    const store = new AppStateStore();

    expect(remarkInThread(store, 'person:nobody', 'Hello?')).toBe(false);
    expect(store.get().chat.threads['person:nobody']).toBeUndefined();
  });
});
