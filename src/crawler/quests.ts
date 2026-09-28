import type { DialogueNode, DialogueOption } from './dialogue';
import { said } from './dialogue';
import type { RoomKind } from './level';
import type { Attribute, Faction, Skill } from './rpg';

/**
 * Journal quests: the main story ("Project Phoenix") and the side quests
 * handed out by named people on each floor. Mail tasks (radiant, repeatable)
 * live in the Game; these are authored, run once per career, and several of
 * them end in a choice.
 */

export type QuestEvent =
  | { readonly type: 'pickup'; readonly item: string }
  | { readonly type: 'talk'; readonly npc: string }
  | { readonly type: 'resolve'; readonly kind: string; readonly peaceful: boolean; readonly elite: boolean }
  | { readonly type: 'boss'; readonly floor: number }
  | { readonly type: 'room'; readonly room: RoomKind }
  | { readonly type: 'fix' };

export interface QuestState {
  readonly id: string;
  stage: number;
  progress: number;
  done: boolean;
  /** Floor the quest was taken on (side quests belong to one floor). */
  readonly floor: number;
}

/** Where a quest item is put into the world. */
export type Placement = { readonly room: RoomKind } | { readonly locker: number };

export interface Objective {
  readonly text: string;
  readonly kind: 'item' | 'talk' | 'count' | 'boss' | 'room' | 'escort' | 'fix';
  readonly item?: string;
  readonly place?: Placement;
  readonly npc?: string;
  readonly count?: number;
  /** For 'count': which resolve events count. */
  readonly match?: (e: QuestEvent) => boolean;
  readonly room?: RoomKind;
}

export interface QuestDef {
  readonly id: string;
  readonly title: string;
  readonly main: boolean;
  /** Who hands it out; shown in the journal. */
  readonly giver: string;
  /** The giver's npc id (what 'talk' objectives and the spawner use). */
  readonly npc: string;
  /** Floors this side quest may be offered on (floor % 5). */
  readonly floors: readonly number[];
  readonly stages: readonly Objective[];
}

export const EVIDENCE = ['memo', 'schedule', 'emails', 'po'] as const;

export const QUEST_ITEMS: Record<string, { name: string; desc: string }> = {
  memo: { name: 'Memo: "Project Phoenix"', desc: 'CONFIDENTIAL. Outsource all IT to SynergyNow Ltd by Q4. Backups to be "deprioritised" to make the old team look bad.' },
  schedule: { name: 'The Migration Schedule', desc: 'Derek\'s spreadsheet. Every column is a department. Every row is a Friday. Your name is in cell F12.' },
  emails: { name: 'Printout: SynergyNow Emails', desc: 'Karen to "Sir R": "Customers moved over by the end of the month. They will not notice. They never do."' },
  po: { name: 'Purchase Order #0001', desc: 'SynergyNow Ltd, "Transformation Services", £4.2m. Approved by Gordon. Three quotes: all from SynergyNow.' },
  password: { name: 'Sticky note: "Karen2024!"', desc: 'Found under a keyboard. Of course it was.' },
  redstapler: { name: 'A Red Swingline Stapler', desc: 'Milton\'s. He has asked about it. Several times. At length.' },
  nanmug: { name: 'Mug: "World\'s Best Nan"', desc: 'Brenda\'s. Chipped, beloved, and last seen in a meeting room.' },
  postit: { name: 'Password Sticky Notes', desc: 'Found stuck to monitors around the floor. A security audit waiting to happen.' },
  lonkero: { name: 'Empty Lonkero Cans', desc: 'Jukka\'s, hidden in a supply closet. Somebody drank them. Somebody knows who.' },
};

const isKind = (...kinds: string[]) => (e: QuestEvent): boolean => e.type === 'resolve' && kinds.includes(e.kind);

export const QUESTS: readonly QuestDef[] = [
  {
    id: 'milton', title: 'The Red Stapler', main: false, giver: 'Milton (Basement)', npc: 'milton', floors: [0, 1, 2],
    stages: [
      { kind: 'item', item: 'redstapler', place: { locker: 25 }, text: 'Milton\'s red stapler is locked in a supply closet somewhere on this floor.' },
      { kind: 'talk', npc: 'milton', text: 'Return the stapler to Milton. Or don\'t.' },
    ],
  },
  {
    id: 'mug', title: 'The World\'s Best Nan', main: false, giver: 'Brenda from Accounts', npc: 'brenda', floors: [0, 1, 2, 3, 4],
    stages: [
      { kind: 'item', item: 'nanmug', place: { room: 'meeting' }, text: 'Brenda left her mug in a meeting room. Find it before somebody uses it for pens.' },
      { kind: 'talk', npc: 'brenda', text: 'Take the mug back to Brenda.' },
    ],
  },
  {
    id: 'exorcism', title: 'Printer Exorcism', main: false, giver: 'Facilities Frank', npc: 'frank', floors: [1, 2, 3, 4],
    stages: [
      { kind: 'count', count: 3, match: isKind('jam'), text: 'Resolve 3 paper jams. They have started moving on their own.' },
      { kind: 'talk', npc: 'frank', text: 'Tell Frank the printers are clean.' },
    ],
  },
  {
    id: 'passwords', title: 'Security Sweep', main: false, giver: 'Gary (Security)', npc: 'gary', floors: [0, 1, 2, 3, 4],
    stages: [
      { kind: 'item', item: 'postit', place: { room: 'cubicles' }, text: 'People stick their passwords to their monitors. Sweep the desks and collect them.' },
      { kind: 'talk', npc: 'gary', text: 'Hand the sticky notes to Gary.' },
    ],
  },
  {
    id: 'intern', title: 'The New Starter', main: false, giver: 'Josh (Intern)', npc: 'josh', floors: [0, 1, 2],
    stages: [
      { kind: 'escort', room: 'it', npc: 'josh', text: 'It is Josh\'s first day. Get him to the Internal IT counter in one piece.' },
    ],
  },
  {
    id: 'replyall', title: 'Reply-All Apocalypse', main: false, giver: 'Denise (Office Manager)', npc: 'denise', floors: [1, 2, 3, 4],
    stages: [
      { kind: 'count', count: 10, match: isKind('reply'), text: 'Somebody replied-all to the all-staff list. Resolve 10 Reply-All storms.' },
      { kind: 'talk', npc: 'denise', text: 'Tell Denise the inboxes are quiet.' },
    ],
  },
  {
    id: 'phishtest', title: 'The Phishing Test', main: false, giver: 'Priya (InfoSec)', npc: 'priya', floors: [1, 2, 3, 4],
    stages: [
      { kind: 'count', count: 3, match: (e) => e.type === 'resolve' && e.peaceful, text: 'Priya\'s phishing test caught half the floor. Talk 3 of them down without a fight.' },
      { kind: 'talk', npc: 'priya', text: 'Report back to Priya.' },
    ],
  },
  {
    id: 'jukka', title: 'Who Drank Jukka\'s Lonkero?', main: false, giver: 'Jukka from Finance', npc: 'jukka', floors: [2, 3, 4],
    stages: [
      { kind: 'item', item: 'lonkero', place: { locker: 35 }, text: 'Jukka\'s lonkero went missing from the fridge. The empties are in a supply closet somewhere.' },
      { kind: 'talk', npc: 'jukka', text: 'Tell Jukka what you found. Or who you want him to think did it.' },
    ],
  },
  {
    id: 'ticketsprint', title: 'The Ticket Sprint', main: false, giver: 'Tristan (Delivery Mgr)', npc: 'tristan', floors: [0, 1, 2, 3, 4],
    stages: [
      { kind: 'fix', count: 4, text: 'Close 4 tickets at a terminal before the sprint review.' },
      { kind: 'talk', npc: 'tristan', text: 'Present your velocity to Tristan.' },
    ],
  },
];

export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

export function currentObjective(st: QuestState): Objective | undefined {
  return questById(st.id)?.stages[st.stage];
}

/** Advance a quest on an event. Returns true if its stage changed. */
export function advance(st: QuestState, e: QuestEvent, floor: number): boolean {
  if (st.done) return false;
  const obj = currentObjective(st);
  if (obj === undefined) return false;
  let hit = false;
  switch (obj.kind) {
    case 'item': hit = e.type === 'pickup' && e.item === obj.item; break;
    case 'talk': hit = e.type === 'talk' && e.npc === obj.npc; break;
    case 'boss': hit = e.type === 'boss' && e.floor === floor; break;
    case 'room':
    case 'escort': hit = e.type === 'room' && e.room === obj.room; break;
    case 'count':
      if (obj.match?.(e) === true) {
        st.progress += 1;
        hit = st.progress >= (obj.count ?? 1);
      }
      break;
    case 'fix':
      if (e.type === 'fix') {
        st.progress += 1;
        hit = st.progress >= (obj.count ?? 1);
      }
      break;
  }
  if (!hit) return false;
  st.stage += 1;
  st.progress = 0;
  const def = questById(st.id);
  if (def !== undefined && st.stage >= def.stages.length) st.done = true;
  return true;
}

// ---------------------------------------------------------------- givers

export interface QuestHost {
  readonly questLog: QuestState[];
  readonly floor: number;
  hasItem(id: string): boolean;
  takeItem(id: string): void;
  odds(skill: Skill, attr: Attribute, difficulty: number): number;
  check(skill: Skill, attr: Attribute, difficulty: number): boolean;
  standing(f: Faction, delta: number): void;
  addRep(n: number): void;
  giveItem(id: string, n: number, from: string): void;
  giveUnique(id: string): void;
  giveRandomGear(rarity: 'fine' | 'rare'): void;
  journal(text: string): void;
  acceptQuest(id: string): void;
  questEvent(e: QuestEvent): void;
  turnHostile(npc: string, name: string): void;
  warn(why: string): void;
  recruitIntern(): void;
}

const pct = (p: number): string => `${Math.round(p * 100)}%`;

function offer(h: QuestHost, id: string, speaker: string, pitch: string): DialogueNode {
  return {
    speaker, subtitle: questById(id)?.title ?? '', text: pitch,
    options: [
      { label: 'Leave it with me.', pick: () => { h.acceptQuest(id); return said(speaker, 'Thank you. Honestly. Nobody else would.', 'good'); } },
      { label: 'Not right now.', pick: () => null },
    ],
  };
}

function stateOf(h: QuestHost, id: string): QuestState | undefined {
  return h.questLog.find((q) => q.id === id);
}

/** The conversation with a side-quest giver, whatever stage it is at. */
export function talkGiver(h: QuestHost, questId: string, speaker: string): DialogueNode {
  const quest = questById(questId);
  if (quest === undefined) return said(speaker, 'Busy, sorry.');
  const npc = quest.npc;
  const st = stateOf(h, quest.id);
  if (st === undefined) return offer(h, quest.id, speaker, PITCH[quest.id] ?? 'Could you help me with something?');
  if (st.done) return said(speaker, THANKS[quest.id] ?? 'Thanks again.', 'good');
  const obj = currentObjective(st);
  if (obj?.kind === 'escort') return said(speaker, 'Lead the way! I am right behind you. Probably.');
  if (obj?.kind !== 'talk' || obj.npc !== npc) return said(speaker, `Any luck? (${obj?.text ?? ''})`);
  return turnIn(h, quest.id, npc, speaker);
}

const PITCH: Record<string, string> = {
  milton: 'Excuse me... I believe you have my stapler. Well, someone does. It is red. It is a Swingline. They moved my desk to the basement and then they took my stapler. It is in a cupboard. I could set the building on fire.',
  mug: 'Oh love, I have lost my mug. It says "World\'s Best Nan" on it. My granddaughter gave it me. I think I left it in one of the meeting rooms, and you know what they are like in there.',
  exorcism: 'The printers. The paper jams have... got up. They are walking about. I am Facilities, not an exorcist. Three of them. Please.',
  passwords: 'Security sweep. Half this floor has their password on a sticky note on their monitor. Collect them. Quietly. Then we have a conversation with HR.',
  intern: 'Hi! Sorry! Hi. It is my first day and I have been in this lift six times. I am supposed to report to Internal IT? Could you... show me? Please?',
  replyall: 'Somebody replied-all to "All Staff (Global)" asking to be removed from the list. Then everyone replied-all asking to be removed. The emails have become sentient. Make it stop.',
  phishtest: 'I sent the floor a fake "Free Pizza" email. Forty clicks. Now they are all angry at IT. Talk three of them down - calmly - and I will call it a learning outcome.',
  jukka: 'My lonkero. From the fridge. It had my NAME on it. I think the empties are hidden in a supply closet. Find them and tell me who. I have a spreadsheet of suspects.',
  ticketsprint: 'Sprint review is at four. Our velocity is zero. Close four tickets at a terminal and I will present them as a team achievement.',
};

const THANKS: Record<string, string> = {
  milton: '...', mug: 'You are a treasure, you are.', exorcism: 'The printers are purring. Well, humming. Well, they are quiet.',
  passwords: 'Good work. HR is drafting forty emails.', intern: 'Thanks for showing me around! I am going to be the best intern!',
  replyall: 'Inbox zero. First time since 2019.', phishtest: 'Learning outcome achieved.', jukka: 'Justice. Of a sort.',
  ticketsprint: 'Velocity: four. Nobody has ever seen a four.',
};

function turnIn(h: QuestHost, id: string, npc: string, speaker: string): DialogueNode {
  const done = (text: string, mood: DialogueNode['mood'] = 'good'): DialogueNode => {
    h.questEvent({ type: 'talk', npc });
    return said(speaker, text, mood);
  };
  switch (id) {
    case 'milton':
      return {
        speaker, subtitle: 'The Red Stapler', text: 'Is that... is that my stapler?',
        options: [
          { label: 'Here you go, Milton.', pick: () => { h.takeItem('redstapler'); h.standing('staff', 6); h.giveItem('cake', 1, speaker); h.journal('I gave Milton his red stapler back. He smiled. It was unsettling.'); return done('Thank you. I was going to... never mind what I was going to do.'); } },
          { label: 'Finders keepers.', tag: 'Keep a legendary', pick: () => { h.takeItem('redstapler'); h.giveUnique('redstapler'); h.standing('staff', -6); h.journal('I kept Milton\'s red Swingline. He said he could set the building on fire. He did not seem to be joking.'); h.questEvent({ type: 'talk', npc }); h.turnHostile(npc, 'Milton (has matches)'); return said(speaker, 'I... I could set the building on fire.', 'bad'); } },
        ],
      };
    case 'mug':
      h.takeItem('nanmug');
      h.standing('kitchen', 10);
      h.giveRandomGear('fine');
      return done('My mug! Oh, come here. Have this - somebody left it in the kitchen and it is no use to me.');
    case 'exorcism':
      h.addRep(90);
      h.standing('itcrowd', 6);
      return done('Here, from the Facilities slush fund. Do not ask.');
    case 'passwords': {
      h.takeItem('postit');
      const opts: DialogueOption[] = [
        { label: 'Hand them over for HR.', pick: () => { h.standing('itcrowd', 8); h.standing('staff', -4); h.addRep(80); return done('Excellent. Forty people are about to have a very bad afternoon.'); } },
        { label: 'Hand them over, but ask Gary to go easy on people.', tag: `Soft Skills ${pct(h.odds('soft', 'charm', 40))}`, pick: () => {
          if (h.check('soft', 'charm', 40)) { h.standing('itcrowd', 5); h.standing('staff', 4); h.addRep(60); return done('Fine. A gentle reminder email. With a gif.'); }
          h.standing('itcrowd', -2); return done('Easy? EASY? No.', 'bad');
        } },
      ];
      return { speaker, subtitle: 'Security Sweep', text: 'You got them? All of them? Let us see.', options: opts };
    }
    case 'replyall':
      h.addRep(120);
      h.standing('staff', 5);
      return done('You are a hero. An unsung one. Nobody will ever know. Here is a voucher.');
    case 'phishtest':
      h.standing('management', 6);
      h.standing('itcrowd', 4);
      h.giveRandomGear('fine');
      return done('Excellent. Take this - from the InfoSec swag drawer.');
    case 'jukka':
      h.takeItem('lonkero');
      return {
        speaker, subtitle: 'Who Drank Jukka\'s Lonkero?', text: 'You found the empties! So. Who was it?',
        options: [
          { label: 'It was me. Sorry, Jukka.', pick: () => { h.standing('staff', 5); h.standing('kitchen', 3); h.giveItem('kossu', 1, speaker); h.journal('I confessed to drinking Jukka\'s lonkero. He respected the honesty and gave me a Koskenkorva.'); return done('...Honesty. In this building? Here. Have a Koskenkorva. We are even.'); } },
          { label: 'It was Tristan from Sales.', tag: `Soft Skills ${pct(h.odds('soft', 'charm', 30))}`, pick: () => {
            if (h.check('soft', 'charm', 30)) { h.standing('staff', 2); h.addRep(40); return done('TRISTAN. Of course. I will add it to the spreadsheet.'); }
            h.standing('staff', -6); h.warn('Caught lying about the office fridge'); return done('Tristan was in Lisbon all week. You are a liar AND a thief.', 'bad');
          } },
          { label: 'The mystery will remain a mystery.', pick: () => { h.addRep(30); return done('Fine. But I am watching the fridge now. Every day.', 'neutral'); } },
        ],
      };
    case 'ticketsprint':
      h.standing('management', 8);
      h.addRep(100);
      return done('A velocity of four. I am going to present this with a burndown chart.');
    default:
      return done('Thanks.');
  }
}

export const MAIN_ENDING_EVIDENCE = 3;

/**
 * The main story, one chapter per floor. Evidence you miss on a floor stays
 * missed - the story goes on without it, and the ending you can reach
 * depends on how much of it you are carrying.
 */
export interface MainChapter {
  readonly floor: number;
  readonly title: string;
  readonly text: string;
  /** Optional evidence hidden on this floor. */
  readonly evidence?: { readonly item: string; readonly place: Placement; readonly hint: string };
  /** Evidence the boss carries. */
  readonly bossDrop?: string;
}

export const MAIN: readonly MainChapter[] = [
  { floor: 0, title: 'The Failing Backups', text: 'The backups keep failing, and Morag thinks somebody wants them to. Derek is guarding the basement.', evidence: { item: 'memo', place: { room: 'server' }, hint: 'Search the server room.' }, bossDrop: 'schedule' },
  { floor: 1, title: 'Who Are SynergyNow?', text: 'The migration schedule names a company nobody has heard of. Karen\'s customers are being moved to it.', evidence: { item: 'emails', place: { room: 'office' }, hint: 'Karen\'s printouts are in an office on this floor.' } },
  { floor: 2, title: 'Follow the Money', text: 'Somebody has to pay SynergyNow. Procurement signs everything.', evidence: { item: 'po', place: { locker: 70 }, hint: 'The PO is in a well-locked supply closet - or on Gordon.' }, bossDrop: 'po' },
  { floor: 3, title: 'The Audit', text: 'The Auditor has arrived. With enough evidence you could make them an ally instead of an enemy.' },
  { floor: 4, title: 'Project Phoenix', text: 'Sir Reginald is behind it all. His PA is waiting outside the corner office.' },
];

export function mainChapter(floor: number): MainChapter | undefined {
  return floor <= 4 ? MAIN[floor] : undefined;
}

export function evidenceCount(has: (id: string) => boolean): number {
  return EVIDENCE.filter((e) => has(e)).length;
}

/** Side quests on offer for a floor, in a stable order. */
export function sideQuestsFor(floor: number): QuestDef[] {
  return QUESTS.filter((q) => !q.main && q.floors.includes(floor % 5));
}
