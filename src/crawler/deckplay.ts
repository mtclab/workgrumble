import { type DealtCard, deckCard, FLOOR_P1 } from './deck';
import { DT, type Headless, headless, lift, press } from './headlessgame';
import { readSlot } from './saves';
import { normalizeSave } from './state';

/**
 * Test support for the weekly deck on the headless game (headlessgame.ts):
 * a week's deck as given, the lift up to a card the way a player takes it,
 * walking over a card's copies, and a save read back into a fresh game. No
 * test runner here: a step that cannot be done throws.
 */

/**
 * This week's deck, as given (the deal is deck.test.ts's): the floor P1 and
 * these cards, each on offer in the day unless said otherwise. The hub is
 * built again so the week's givers are at their desks.
 */
export function withDeck(h: Headless, cards: readonly (Partial<DealtCard> & { id: string })[]): void {
  const s = h.g.save;
  s.deck = {
    week: s.week,
    cards: [
      { id: FLOOR_P1, p1: true, alarm: null, afterHours: false, inPerson: false, seed: 1, state: 'accepted' },
      ...cards.map((c, k): DealtCard => ({ p1: false, alarm: deckCard(c)?.alarm ?? 'one-way', afterHours: false, inPerson: false, seed: 4242 + k, state: 'offered', ...c })),
    ],
  };
  h.g.loadHub(false);
}

/** A card's place in this week's deck. */
export function cardIndex(h: Headless, id: string): number {
  return h.g.save.deck.cards.findIndex((c) => c.id === id);
}

/**
 * E on the hub's lift and the card's button: its map. A card taken for the
 * first time opens with its briefing, taken here; one that was left resumes
 * without one.
 */
export function liftTo(h: Headless, id: string): void {
  const card = deckCard({ id });
  if (card === undefined) throw new Error(`no card ${id}`);
  const label = `${card.title} (${card.place})`;
  const labels = press(h, lift(h.g));
  if (!labels.includes(label)) throw new Error(`the lift does not list ${label}: ${labels.join(' | ')}`);
  h.pick(label);
  if (h.g.save.location !== 'mission' || h.g.mission?.card.id !== id) throw new Error(`not on ${id}`);
  if (h.g.screen === 'dialogue' && h.dialogues.at(-1)?.options.some((o) => o.label === 'Take the card') === true) h.pick('Take the card');
}

/** The lift on a card's map and its Abort: the results card, and Back to the hub. */
export function abortCard(h: Headless): void {
  press(h, lift(h.g));
  h.pick(/^Abort/);
  const back = h.results?.buttons.get('Back to the hub');
  if (back === undefined) throw new Error('no results card');
  back();
}

/** Walk onto each of the first `n` scattered copies still lying there, and let the frame pick it up. */
export function pickUp(h: Headless, n: number): void {
  const m = h.g.mission;
  if (m === null) throw new Error('not on a card');
  for (const c of m.scatter.filter((x) => !x.picked).slice(0, n)) {
    h.g.player.pos.set(c.x, 0, c.z);
    h.run(DT * 3);
  }
}

/** The career's autosave written now, read back and loaded into a fresh game, as Continue does. */
export function reload(h: Headless): Headless {
  if (!h.g.writeSlotFor('auto')) throw new Error('nothing saved');
  const slot = readSlot('auto');
  const s = slot === null ? null : normalizeSave(slot.data);
  if (s === null) throw new Error('the save does not read back');
  const back = headless(s);
  back.g.loadWorld(true);
  return back;
}
