import type { DialogueNode, DialogueOption } from './dialogue';
import type { HelperRole } from './entities';
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
  /** `npc` is the story id, or 'healer' for any of the Kitchen Cabinet. */
  | { readonly type: 'talk'; readonly npc: string }
  /** `tag` is set on people a quest put there to be dealt with. */
  | { readonly type: 'resolve'; readonly kind: string; readonly peaceful: boolean; readonly elite: boolean; readonly tag?: string | null }
  | { readonly type: 'boss'; readonly floor: number }
  | { readonly type: 'room'; readonly room: RoomKind }
  | { readonly type: 'fix' }
  /** Something used: an interactable kind ('printer', 'kiuas', 'terminal', 'locker'...) or 'rune'. */
  | { readonly type: 'use'; readonly what: string };

export interface QuestState {
  readonly id: string;
  stage: number;
  progress: number;
  done: boolean;
  /** Floor the quest was taken on. */
  readonly floor: number;
  /** Handed to you by management, not asked for. */
  staffed?: boolean;
  /** Who staffed you on it. */
  by?: string;
  /** Seconds left, for a timed (P1) assignment. */
  deadline?: number;
  /** Missed: the deadline passed, or Friday came. */
  failed?: boolean;
  /** Handed to a helper: it gets done without you, at half the credit. */
  delegated?: boolean;
  /** You already tried to push back on it once. */
  pushed?: boolean;
  /** Management took the assignment back; it still counts as this floor's staffing. */
  returned?: boolean;
  /** Mentoring a teammate (`by` is who). */
  mentor?: boolean;
}

/** Where a quest item is put into the world. */
export type Placement = { readonly room: RoomKind } | { readonly locker: number };

/** Somebody a quest puts on the floor to be dealt with. */
export interface HuntTarget {
  readonly kind: 'user' | 'caller' | 'customer' | 'manager' | 'consultant' | 'shadowit' | 'vendor' | 'chatbot' | 'jam';
  readonly name: string;
  readonly elite?: 'relentless' | 'tenured' | 'vip' | 'cc' | 'escalating' | 'passive';
  readonly room?: RoomKind;
}

export interface Objective {
  readonly text: string;
  readonly kind: 'item' | 'talk' | 'count' | 'boss' | 'room' | 'escort' | 'fix' | 'use' | 'hunt' | 'collect';
  readonly item?: string;
  readonly place?: Placement;
  readonly npc?: string;
  readonly count?: number;
  /** For 'count': which resolve events count. */
  readonly match?: (e: QuestEvent) => boolean;
  readonly room?: RoomKind;
  /** For 'use': what has to be used. */
  readonly use?: string;
  /** For 'hunt': who has to be dealt with (spawned when the stage starts). */
  readonly hunt?: HuntTarget;
  /** For 'count' on a staffed assignment: make sure there are enough of these on the floor. */
  readonly ensure?: { readonly kind: HuntTarget['kind'] | 'healer'; readonly count: number };
  /** Mentoring: only counts with the person you are mentoring beside you. */
  readonly withMentee?: boolean;
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
  /** A staffing template: management hands it to you. */
  readonly staffed?: boolean;
  /** Seconds to do it in (a P1); otherwise it is due Friday. */
  readonly timeLimit?: number;
  /** Only staffed on floors that have one of these. */
  readonly needs?: string;
  /** A mentoring template: a teammate asks for your help. */
  readonly mentor?: boolean;
  /** Which kinds of teammate ask for it. */
  readonly roles?: readonly HelperRole[];
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
  descaler: { name: 'Industrial Descaler (5 litres)', desc: 'The coffee machine has said DESCALING IN PROGRESS since 2019. This is why.' },
  badge: { name: 'Somebody\'s Access Badge', desc: 'All-floors access. The photo is of a man in a Hawaiian shirt, winking.' },
  form: { name: 'Compliance Form (signed)', desc: 'Form ISO-27001-B, signed in triplicate. One of several.' },
};

/** Items that are used up by the quest that asked for them, never kept. */
export const TRANSIENT_ITEMS: readonly string[] = ['form'];

const isKind = (...kinds: string[]) => (e: QuestEvent): boolean => e.type === 'resolve' && kinds.includes(e.kind);
const PEOPLE = ['user', 'caller', 'customer', 'manager', 'consultant', 'shadowit', 'vendor', 'chatbot'];
const talkedToLady = (e: QuestEvent): boolean => e.type === 'talk' && e.npc === 'healer';

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
  {
    id: 'descaler', title: 'The Coffee Cartel', main: false, giver: 'Maureen (Kitchen)', npc: 'maureen', floors: [0, 1, 2, 3, 4],
    stages: [
      { kind: 'item', item: 'descaler', place: { locker: 30 }, text: 'Somebody locked the descaler in a supply closet. The coffee machines have been "descaling" for five years.' },
      { kind: 'talk', npc: 'maureen', text: 'Take the descaler to Maureen. Or to whoever pays more.' },
    ],
  },
  {
    id: 'badge', title: 'The Lost Badge', main: false, giver: 'Bev (Security)', npc: 'bev', floors: [0, 2, 4],
    stages: [
      { kind: 'item', item: 'badge', place: { room: 'print' }, text: 'An all-floors access badge was last seen by a printer. Find it before somebody uses it.' },
      { kind: 'talk', npc: 'bev', text: 'Return the badge to Bev. Or keep it: nobody has to know.' },
    ],
  },
  {
    id: 'leavingcard', title: 'The Leaving Card', main: false, giver: 'Linda from HR', npc: 'linda', floors: [1, 2, 3],
    stages: [
      { kind: 'count', count: 2, match: talkedToLady, ensure: { kind: 'healer', count: 2 }, text: 'Get Graham\'s leaving card signed by two of the Kitchen Cabinet (talk to two office ladies).' },
      { kind: 'talk', npc: 'linda', text: 'Bring the card back to Linda before Graham finds out.' },
    ],
  },
  {
    id: 'karaoke', title: 'Karaoke Tuesday', main: false, giver: 'Kev from Sales', npc: 'kev', floors: [1, 3, 4],
    stages: [
      { kind: 'talk', npc: 'kev', text: 'Kev needs a duet partner who is at exactly the right level of confidence. Come back at the Ballmer Peak.' },
    ],
  },
  {
    id: 'ghost', title: 'The Ghost of Exchange 2003', main: false, giver: 'Old Bob (Mainframe)', npc: 'bob', floors: [0, 3],
    stages: [
      { kind: 'room', room: 'server', text: 'Old Bob swears something haunts the server room. Go and look.' },
      { kind: 'hunt', hunt: { kind: 'chatbot', name: 'The Ghost of Exchange 2003', elite: 'tenured', room: 'server' }, text: 'It is real, it is angry, and it wants you to reboot it. Lay it to rest.' },
      { kind: 'talk', npc: 'bob', text: 'Tell Old Bob the ghost is gone.' },
    ],
  },
  {
    id: 'loyly', title: 'The Löyly Inspection', main: false, giver: 'Pekka (Facilities, Tampere)', npc: 'pekka', floors: [0, 1, 2, 3, 4],
    stages: [
      { kind: 'use', use: 'kiuas', count: 1, text: 'Pekka needs someone to inspect a sauna. An office one if the floor has one, your own at the mökki if not. Throw löyly.' },
      { kind: 'talk', npc: 'pekka', text: 'Report to Pekka. Be honest about the temperature.' },
    ],
  },
  {
    id: 'duck', title: 'Rubber Duck Debugging', main: false, giver: 'Dave (Senior Sysadmin)', npc: 'dave', floors: [1, 2, 3],
    stages: [
      { kind: 'fix', count: 3, text: 'Dave wants proof the method works: close 3 tickets at a terminal, explaining each one to a duck.' },
      { kind: 'talk', npc: 'dave', text: 'Tell Dave what the duck said.' },
    ],
  },
  {
    id: 'dryweek', title: 'Dry Week', main: false, giver: 'Sanna (Wellbeing)', npc: 'sanna', floors: [0, 1, 2, 3, 4],
    stages: [
      { kind: 'boss', text: 'Sanna bets you cannot resolve this floor\'s major incident without a single drink. Resolve the boss.' },
      { kind: 'talk', npc: 'sanna', text: 'Tell Sanna. She will know if you are lying.' },
    ],
  },
  {
    id: 'prince', title: 'The Prince', main: false, giver: 'Wes (Security Analyst)', npc: 'wes', floors: [2, 3, 4],
    stages: [
      { kind: 'hunt', hunt: { kind: 'vendor', name: 'A Nigerian Prince (Vendor)', elite: 'vip' }, text: 'A "prince" has been walking the floor offering to move money through people\'s expense accounts. Find him.' },
      { kind: 'talk', npc: 'wes', text: 'Tell Wes the prince has been deposed.' },
    ],
  },
  {
    id: 'ergonomics', title: 'The Ergonomic Survey', main: false, giver: 'Fiona (Head of Process)', npc: 'fiona', floors: [0, 1, 2, 4],
    stages: [
      { kind: 'use', use: 'terminal', count: 3, text: 'Fiona\'s survey is on the intranet and the intranet only works on some computers. Log on at three different computers.' },
      { kind: 'talk', npc: 'fiona', text: 'Tell Fiona the survey is in. She will want to discuss the results.' },
    ],
  },
  {
    id: 'cables', title: 'Cable Spaghetti', main: false, giver: 'Nik (Network Eng.)', npc: 'nik', floors: [1, 2, 3, 4],
    stages: [
      { kind: 'use', use: 'locker', count: 2, text: 'Nik has run out of cable ties. Every supply closet has some. Break into two.' },
      { kind: 'talk', npc: 'nik', text: 'Bring Nik the cable ties.' },
    ],
  },
];

/**
 * Staffing: work management hands you, whether you have room for it or not.
 * Each is due Friday unless it is a P1 with a clock on it.
 */
export const STAFFED: readonly QuestDef[] = [
  { id: 's-warroom', title: 'P1 War Room', main: false, giver: '', npc: '', floors: [], staffed: true, timeLimit: 240,
    stages: [{ kind: 'count', count: 5, match: isKind(...PEOPLE), text: 'Everything is on fire. Resolve 5 people, any way you like, in the next four minutes.' }] },
  { id: 's-patch', title: 'Patch Tuesday', main: false, giver: '', npc: '', floors: [], staffed: true,
    stages: [{ kind: 'fix', count: 3, text: 'The patch backlog is on the big screen. Close 3 tickets at a terminal by Friday.' }] },
  { id: 's-audit', title: 'Audit Prep', main: false, giver: '', npc: '', floors: [], staffed: true,
    stages: [{ kind: 'collect', item: 'form', count: 3, place: { room: 'office' }, text: 'The auditors want the signed compliance forms. Three of them are scattered about the floor. Collect them by Friday.' }] },
  { id: 's-vendor', title: 'Vendor Evaluation', main: false, giver: '', npc: '', floors: [], staffed: true,
    stages: [{ kind: 'count', count: 2, match: isKind('vendor'), ensure: { kind: 'vendor', count: 2 }, text: 'Procurement has invited two vendors to "pitch". Evaluate them (resolve them) by Friday.' }] },
  { id: 's-printers', title: 'Printer Fleet Refresh', main: false, giver: '', npc: '', floors: [], staffed: true, needs: 'printer',
    stages: [{ kind: 'use', use: 'printer', count: 1, text: 'The printer "refresh" is you, with a screwdriver. Fix the print room printer by Friday.' }] },
  { id: 's-kb', title: 'Knowledge Base Cleanup', main: false, giver: '', npc: '', floors: [], staffed: true,
    stages: [{ kind: 'count', count: 4, match: (e) => e.type === 'resolve' && e.peaceful, text: 'Somebody decided users should be "self-serving". Talk 4 of them through it by Friday.' }] },
  { id: 's-dr', title: 'DR Walkthrough', main: false, giver: '', npc: '', floors: [], staffed: true,
    stages: [
      { kind: 'room', room: 'server', text: 'Disaster recovery walkthrough: check the server room.' },
      { kind: 'room', room: 'it', text: 'Then sign it off at the Internal IT counter.' },
    ] },
  { id: 's-chatbot', title: 'Chatbot Training Data', main: false, giver: '', npc: '', floors: [], staffed: true,
    stages: [{ kind: 'count', count: 3, match: isKind('chatbot'), ensure: { kind: 'chatbot', count: 3 }, text: 'The new chatbots are "learning from the floor". Resolve 3 of them before they learn anything else.' }] },
  { id: 's-shadow', title: 'Shadow IT Amnesty', main: false, giver: '', npc: '', floors: [], staffed: true,
    stages: [{ kind: 'count', count: 2, match: isKind('shadowit'), ensure: { kind: 'shadowit', count: 2 }, text: 'Amnesty week: bring 2 Shadow IT people back into the fold (resolve them) by Friday.' }] },
  { id: 's-consultant', title: 'Consultant Onboarding', main: false, giver: '', npc: '', floors: [], staffed: true,
    stages: [{ kind: 'count', count: 1, match: (e) => e.type === 'resolve' && e.kind === 'consultant' && e.peaceful, ensure: { kind: 'consultant', count: 1 }, text: 'A consultant needs "onboarding". Talk one down - no stapling, they bill for that.' }] },
  { id: 's-customer', title: 'Customer Visit (P1)', main: false, giver: '', npc: '', floors: [], staffed: true, timeLimit: 200,
    stages: [{ kind: 'count', count: 3, match: isKind('customer'), ensure: { kind: 'customer', count: 3 }, text: 'Three gold-tier customers have turned up unannounced. Resolve them before they reach the CEO.' }] },
  { id: 's-allhands', title: 'All-Hands Catering', main: false, giver: '', npc: '', floors: [], staffed: true,
    stages: [{ kind: 'count', count: 2, match: talkedToLady, ensure: { kind: 'healer', count: 2 }, text: 'You are running the all-hands, apparently. Sort the cake with two of the Kitchen Cabinet by Friday.' }] },
  { id: 's-incident', title: 'Major Incident Bridge (P1)', main: false, giver: '', npc: '', floors: [], staffed: true, timeLimit: 180,
    stages: [{ kind: 'fix', count: 2, text: 'You are on the bridge call. Close 2 tickets at a terminal in the next three minutes. Everyone is listening.' }] },
];

/** Who staffs you, in the voice of whoever is on the phone. */
export const STAFFERS: readonly string[] = ['Derek (Team Lead)', 'Fiona (Head of Process)', 'Tristan (Delivery Mgr)', 'Clive (Ops Manager)', 'The PMO', 'Karen\'s EA'];

/**
 * Mentoring: a teammate is stuck and comes to you, because you are the
 * senior. `{m}` is their name. It is never on anybody's plan but yours.
 */
export const MENTORING: readonly QuestDef[] = [
  { id: 'm-pair', title: 'Pair Programming', main: false, giver: '', npc: '', floors: [], mentor: true, roles: ['sysadmin', 'intern'],
    stages: [{ kind: 'fix', count: 2, withMentee: true, text: 'Pair with {m} on two tickets at a terminal. They drive, you navigate, nobody touches the mouse.' }] },
  { id: 'm-talkdown', title: 'Soft Skills Shadowing', main: false, giver: '', npc: '', floors: [], mentor: true, roles: ['sysadmin', 'security', 'intern'],
    stages: [{ kind: 'count', count: 2, withMentee: true, match: (e) => e.type === 'resolve' && e.peaceful, text: 'Show {m} how to talk somebody down. Two people, with {m} watching and taking notes.' }] },
  { id: 'm-induction', title: 'Server Room Induction', main: false, giver: '', npc: '', floors: [], mentor: true, roles: ['intern', 'security'],
    stages: [
      { kind: 'room', room: 'server', withMentee: true, text: 'Walk {m} through the server room. Point at things. Say "do not touch that" a lot.' },
      { kind: 'room', room: 'it', withMentee: true, text: 'Then introduce {m} to Internal IT, where the good cables live.' },
    ] },
  { id: 'm-oncall', title: 'Covering the On-Call', main: false, giver: '', npc: '', floors: [], mentor: true, roles: ['sysadmin', 'security'],
    stages: [{ kind: 'count', count: 4, match: isKind('user', 'caller', 'customer'), text: '{m} has been on call all night. Take the pager until you have dealt with four users, so they can sleep.' }] },
  { id: 'm-locks', title: 'Physical Security 101', main: false, giver: '', npc: '', floors: [], mentor: true, roles: ['security'],
    stages: [{ kind: 'use', use: 'locker', count: 1, withMentee: true, text: 'Show {m} why the supply closets need better locks. Pick one, with {m} watching.' }] },
  { id: 'm-backup', title: 'Backing Them Up', main: false, giver: '', npc: '', floors: [], mentor: true, roles: ['sysadmin', 'security', 'intern'],
    stages: [{ kind: 'count', count: 1, match: isKind('manager'), ensure: { kind: 'manager', count: 1 }, withMentee: true, text: 'A manager has been leaning on {m}. Deal with a manager, any way you like, with {m} beside you to see how it is done.' }] },
  { id: 'm-tour', title: 'The Grand Tour', main: false, giver: '', npc: '', floors: [], mentor: true, roles: ['intern'],
    stages: [
      { kind: 'room', room: 'kitchen', withMentee: true, text: 'Show {m} the kitchen: where the good biscuits hide, and which mug is Brenda\'s.' },
      { kind: 'room', room: 'it', withMentee: true, text: 'Then Internal IT, and how to ask Morag for anything without making eye contact.' },
    ] },
];

/** What {m} asks, when they come to you. */
export const MENTOR_PITCH: Record<string, string> = {
  'm-pair': 'Have you got a minute? I have been stuck on the same ticket for two hours and I think I am making it worse. Could you... sit with me? I know you are busy.',
  'm-talkdown': 'How do you DO that? The talking-people-down thing. They just shout at me. Can I watch you do it? Properly?',
  'm-induction': 'Nobody has shown me the server room. I have been here three weeks. I am scared to ask Morag. Could you?',
  'm-oncall': 'I have been on call since Tuesday. I have not slept. The pager went off in the shower. Could you take it for a bit? Just a bit?',
  'm-locks': 'Security audit next week, and I have no idea how bad our closets are. You know locks. Show me?',
  'm-backup': 'My manager keeps putting fifteen-minute meetings in my calendar. At 17:45. I do not know how to say no. How do you do it?',
  'm-tour': 'Hi! Sorry! I still do not know where anything is. Could you show me around? Just the important bits? The biscuits?',
};

/** A mentoring objective with the teammate's first name in it. */
export function withName(text: string, st: QuestState): string {
  const m = (st.by ?? 'them').split(' (')[0] ?? 'them';
  return text.replaceAll('{m}', m);
}

export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id) ?? STAFFED.find((q) => q.id === id) ?? MENTORING.find((q) => q.id === id);
}

/** Journal quests still in play (not done, missed or handed off). */
export function isActive(st: QuestState): boolean {
  return !st.done && st.failed !== true && st.delegated !== true && st.returned !== true;
}

export function currentObjective(st: QuestState): Objective | undefined {
  return questById(st.id)?.stages[st.stage];
}

/** Advance a quest on an event. Returns true if its stage changed. */
export function advance(st: QuestState, e: QuestEvent, floor: number): boolean {
  if (!isActive(st)) return false;
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
    case 'use':
      if (e.type === 'use' && e.what === obj.use) {
        st.progress += 1;
        hit = st.progress >= (obj.count ?? 1);
      }
      break;
    case 'collect':
      if (e.type === 'pickup' && e.item === obj.item) {
        st.progress += 1;
        hit = st.progress >= (obj.count ?? 1);
      }
      break;
    case 'hunt':
      hit = e.type === 'resolve' && e.tag === st.id;
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
  /** At the Ballmer Peak right now. */
  atPeak(): boolean;
  /** Drinks had on this floor. */
  drinksHere(): number;
  finding(n: number, why: string): void;
}

const pct = (p: number): string => `${Math.round(p * 100)}%`;

function offer(h: QuestHost, id: string, speaker: string, pitch: string): DialogueNode {
  return {
    speaker, subtitle: questById(id)?.title ?? '', text: pitch,
    options: [
      { label: 'Leave it with me.', pick: () => { h.acceptQuest(id); return said(speaker, 'Thank you. Honestly. Nobody else would.', 'good'); } },
      { label: 'Not right now.', leave: true, pick: () => null },
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
  if (st.failed === true) return said(speaker, FAILED[quest.id] ?? 'Well. That did not work out, did it?', 'bad');
  const obj = currentObjective(st);
  if (obj?.kind === 'escort') return said(speaker, 'Lead the way! I am right behind you. Probably.');
  if (obj?.kind !== 'talk' || obj.npc !== npc) return said(speaker, `Any luck? (${withName(obj?.text ?? '', st)})`);
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
  descaler: 'Five years, love. Five years that machine has said DESCALING. I know for a fact somebody locked the descaler in a supply closet so they could sell us capsules. Find it and bring it to me.',
  badge: 'Somebody dropped an all-floors access badge by one of the printers. If the wrong person finds it, we have a very bad quarter. Find it. Bring it to me. Do not use it.',
  leavingcard: 'Graham from Payroll is leaving on Friday and nobody has signed his card. Get two of the Kitchen Cabinet to sign it - they know him - and bring it back. Discreetly.',
  karaoke: 'Karaoke tonight, and I need a duet partner for "Total Eclipse of the Heart". Not sober - nobody sings sober - but not a mess either. You know the level I mean. Come and find me when you are there.',
  ghost: 'There is something in the server room. It talks in 2003 error codes. It asked me for my Exchange password, and I have not had an Exchange password since 2009. Go and look. I am not going in there.',
  loyly: 'Facilities policy says someone has to inspect the office saunas every week. I am from Tampere: I take this seriously. Throw löyly on one, properly, and tell me how it was.',
  duck: 'Rubber duck debugging. You explain the problem to the duck, out loud, and you find the answer yourself. Management thinks it is a joke. Close three tickets doing it and I will show them.',
  dryweek: 'I have a bet with Jukka. I say somebody in IT can resolve a whole floor\'s major incident without a drink. He says no. Prove me right and there is something in it for you.',
  prince: 'We have a man on the floor calling himself a prince. He is offering to move "a small inheritance" through people\'s expense accounts. Three people have given him their card details. Find him.',
  ergonomics: 'Everybody has to complete the ergonomic survey, and the survey only loads on some computers. Log on at a few terminals until it works, then come back and we will discuss your posture.',
  cables: 'I have run out of cable ties. Procurement says eight weeks. Every supply closet on this floor has a bag of them. I did not tell you to break in. I said the word "closet" near you.',
};

const THANKS: Record<string, string> = {
  milton: '...', mug: 'You are a treasure, you are.', exorcism: 'The printers are purring. Well, humming. Well, they are quiet.',
  passwords: 'Good work. HR is drafting forty emails.', intern: 'Thanks for showing me around! I am going to be the best intern!',
  replyall: 'Inbox zero. First time since 2019.', phishtest: 'Learning outcome achieved.', jukka: 'Justice. Of a sort.',
  ticketsprint: 'Velocity: four. Nobody has ever seen a four.',
  descaler: 'Listen to it. It is making coffee. Actual coffee.', badge: 'Thanks. We are changing every lock anyway.',
  leavingcard: 'Graham cried. Good crying.', karaoke: 'We will never speak of the key change.', ghost: 'I slept last night. First time since the migration.',
  loyly: 'Kiitos. The sauna is in good hands.', duck: 'The duck stays on your desk. That is the rule.', dryweek: 'Jukka is still paying me.',
  prince: 'The prince has been deposed.', ergonomics: 'Your posture remains a concern.', cables: 'Beautiful. Look at that rack. Look at it.',
};

const FAILED: Record<string, string> = {
  dryweek: 'I could smell it on you from the lift. Jukka is insufferable now. Thanks for that.',
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
    case 'descaler':
      return {
        speaker, subtitle: 'The Coffee Cartel', text: 'You found it? Oh, you found it. Now give it here, pet.',
        options: [
          { label: 'Here you are, Maureen.', pick: () => { h.takeItem('descaler'); h.standing('kitchen', 10); h.giveItem('espresso', 3, speaker); return done('Proper coffee, by Monday. You are a saint.'); } },
          { label: 'Actually, the capsule vendor offered me ₡150 for it.', tag: 'Sell it', pick: () => { h.takeItem('descaler'); h.addRep(150); h.standing('kitchen', -10); h.journal('I sold the office descaler back to the capsule vendor. The machines will say DESCALING forever.'); h.questEvent({ type: 'talk', npc }); return said(speaker, 'You WHAT? Get out of my kitchen.', 'bad'); } },
        ],
      };
    case 'badge':
      return {
        speaker, subtitle: 'The Lost Badge', text: 'You have got it? The all-floors one?',
        options: [
          { label: 'Here. I did not use it.', pick: () => { h.takeItem('badge'); h.standing('itcrowd', 5); h.addRep(70); return done('Good. Most people would have. Most people are why I drink.'); } },
          { label: 'Never saw it.', tag: 'Keep it', pick: () => { h.takeItem('badge'); h.giveItem('paperclip', 6, 'The badge\'s lanyard'); h.finding(1, 'You kept an all-floors access badge.'); h.questEvent({ type: 'talk', npc }); return said(speaker, 'Right. Well, if you do see it... you know where I am.', 'neutral'); } },
        ],
      };
    case 'leavingcard':
      h.standing('kitchen', 8);
      h.giveItem('cake', 1, speaker);
      return done('Two signatures and a doodle of a goat. Perfect. Have some of Graham\'s cake, he will not notice.');
    case 'karaoke':
      if (!h.atPeak()) {
        return said(speaker, 'Not like this, mate. You need to be RIGHT there - relaxed, confident, not falling over. Come back when you are.', 'neutral');
      }
      h.standing('staff', 8);
      h.addRep(60);
      h.journal('I sang "Total Eclipse of the Heart" with Kev from Sales at the exact Ballmer Peak. It was, briefly, perfect.');
      return done('TURN AROUND... BRIGHT EYES! ...That was the best four minutes of my career.');
    case 'ghost':
      h.standing('itcrowd', 8);
      h.giveRandomGear('rare');
      return done('It said "550 5.7.1 Unable to relay" and then just... stopped? Here. From the old spares cage. You have earned it.');
    case 'loyly':
      h.giveItem('salmari', 1, speaker);
      h.standing('staff', 4);
      return done('Good. A proper sauna is a proper workplace. Have a salmari, it is for the steam.', 'mystic');
    case 'duck':
      h.giveItem('book-bash', 1, speaker);
      h.giveRandomGear('fine');
      h.standing('itcrowd', 5);
      return done('Three tickets. The duck works. Here - take these, you are one of us now.');
    case 'dryweek':
      if (h.drinksHere() > 0) {
        return said(speaker, 'I can smell it from here. You had a drink on this floor. The bet is off, and Jukka is insufferable.', 'bad', 'Sorry, Sanna');
      }
      h.standing('kitchen', 6);
      h.addRep(120);
      return done('Not a drop! Jukka owes me forty euros and a cinnamon bun. Half is yours.');
    case 'prince':
      h.addRep(150);
      h.standing('itcrowd', 6);
      return done('Deposed. The card details are "safe", he says. I am resetting them anyway.');
    case 'ergonomics':
      h.standing('management', 5);
      h.addRep(60);
      return done('Survey submitted. Your chair is too high, your screen is too low and you slouch. Noted. Thank you.');
    case 'cables':
      h.standing('itcrowd', 6);
      h.giveRandomGear('fine');
      return done('Cable ties! Here, from my drawer. I owe you. Do not tell Bev about the closets.');
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

/** Side quests on offer for a floor, in a stable order. */
export function sideQuestsFor(floor: number, bossDone = false): QuestDef[] {
  return QUESTS.filter((q) => !q.main && q.staffed !== true && q.mentor !== true && q.floors.includes(floor % 5) && !(q.id === 'dryweek' && bossDone));
}
