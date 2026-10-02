import type { Giver, MissionCard } from './mission';

/**
 * The S1b pool (docs/SPEC_HELLDESK_030_S1.md, S1b "Cards"), from the spec's
 * starter catalogue (docs/SPEC_HELLDESK_030.md 2.6), on the maps that exist:
 * the corner-office row (T3), the meeting ring (T2), the annex (T2's loop
 * with Internal IT at the end) and today's generator ('large'). The week's
 * floor P1 is not a card here: it is the week's floor, as it always was
 * (deck.ts `FLOOR_P1`). Each card also plays from `crawler.html?mission=<id>`.
 */

/** Who hands cards out (D6): coworkers on the hub, and departments. Some pay more for after hours, some do not. */
export interface GiverDef extends Giver {
  /** A coworker comes to the hub (and can hand the card over in person); a department only posts it. */
  readonly coworker: boolean;
  /** The pay multiplier on an after-hours card (D6). */
  readonly afterHours: number;
}

export const GIVERS: Readonly<Record<string, GiverDef>> = {
  milton: { id: 'milton', name: 'Milton (Basement)', coworker: true, afterHours: 1 },
  priya: { id: 'priya', name: 'Priya (InfoSec)', coworker: true, afterHours: 1.5 },
  josh: { id: 'josh', name: 'Josh (Intern)', coworker: true, afterHours: 1 },
  marcus: { id: 'marcus', name: 'Marcus from Sales', coworker: true, afterHours: 1.5 },
  procurement: { id: 'procurement', name: 'Procurement', coworker: false, afterHours: 1.5 },
  servicedesk: { id: 'servicedesk', name: 'The Service Desk', coworker: false, afterHours: 1 },
};

function giver(id: keyof typeof GIVERS): Giver {
  const g = GIVERS[id];
  if (g === undefined) throw new Error(`no giver ${id}`);
  return { id: g.id, name: g.name };
}

export function giverDef(id: string): GiverDef | undefined {
  return GIVERS[id];
}

export const STAPLER: MissionCard = {
  id: 'stapler',
  number: 1,
  title: 'The Red Stapler, Recovered',
  place: 'HR corridor',
  source: 'Milton, muttering',
  voice: 'It is in HR\'s closet. They said it was "confiscated". I said nothing.',
  style: 'sneaky',
  size: 'task',
  band: 'helpdesk',
  giver: giver('milton'),
  recipe: 'officeRow',
  floor: 0,
  value: 120,
  objective: { kind: 'take', item: 'redstapler', text: 'Take the red stapler from the locked closet in HR\'s office, then back to the lift.' },
  unseenBy: 'hr',
  crowd: [
    // HR walks the corridor, and once a round steps out of the back door and along the spine: the quiet route's one risk.
    { kind: 'manager', room: 'hr', sort: 'patrol', tag: 'hr', name: 'Hilary from HR', crossesSpine: true },
    { kind: 'manager', room: 'office', sort: 'desk' },
    { kind: 'user', room: 'office', sort: 'desk' },
    { kind: 'user', room: 'open', sort: 'desk', count: 2 },
    { kind: 'user', room: 'open', sort: 'wander' },
  ],
  loud: 'Get seen and it goes loud: HR bolts the closet (a harder lock, picked under pressure) and calls their manager, and an HR warning if anyone watches you pick the lock.',
  alarm: 'one-way',
  failure: { hostile: true, management: -2, staff: 0, text: 'Milton has heard. He is not saying anything. He is looking at you.' },
  onLoud: {
    lock: 25,
    summon: { kind: 'manager', room: 'hr', sort: 'wander', tag: 'hrboss', name: 'Head of People', line: 'HR has bolted the closet and called the Head of People.' },
  },
  sibling: 'milton',
};

export const VENDOR_DAY: MissionCard = {
  id: 'vendor',
  number: 7,
  title: 'Vendor Day',
  place: 'Atrium loop',
  source: 'Procurement',
  voice: 'Four vendors on the floor "pitching". Evaluate them.',
  style: 'loud',
  size: 'task',
  band: 'specialist',
  giver: giver('procurement'),
  recipe: 'meetingRing',
  floor: 2,
  value: 160,
  objective: { kind: 'resolve', who: 'vendor', count: 4, text: 'Resolve the four vendors (the consultant shields them: take the consultant first), then back to the lift.' },
  crowd: [
    { kind: 'vendor', room: 'meeting', sort: 'wander', count: 4 },
    { kind: 'consultant', room: 'node', sort: 'wander' },
    { kind: 'user', room: 'meeting', sort: 'wander', count: 2 },
  ],
  loud: 'Everyone is hostile on sight: it is loud from the start. Vendors bill you; resolving them gets it back.',
  alarm: 'one-way',
  failure: { hostile: false, management: -3, staff: 0, text: 'Procurement signed with all four vendors while you were away.' },
};

export const POSTITS: MissionCard = {
  id: 'postits',
  number: 4,
  title: 'Password Hygiene Week',
  place: 'HR corridor',
  source: 'Priya (InfoSec)',
  voice: 'Twelve sticky notes on twelve monitors. Photograph them. Do not get seen doing it; it looks bad for me.',
  style: 'sneaky',
  size: 'task',
  band: 'helpdesk',
  giver: giver('priya'),
  recipe: 'officeRow',
  floor: 0,
  value: 110,
  objective: { kind: 'collect', item: 'postit', count: 8, of: 12, text: 'Collect 8 of the 12 password post-its, unnoticed, then back to the lift.' },
  crowd: [
    { kind: 'manager', room: 'office', sort: 'patrol', tag: 'manager', name: 'Duncan, Floor Warden' },
    { kind: 'user', room: 'office', sort: 'desk', count: 2 },
    { kind: 'user', room: 'open', sort: 'desk', count: 3 },
    { kind: 'user', room: 'open', sort: 'wander' },
  ],
  loud: 'Get seen and the floor turns on you. Nothing else is lost: a loud finish just pays no quiet bonus.',
  alarm: 'search',
  failure: { hostile: true, management: -2, staff: 0, text: 'Priya had to explain to the CISO why the sweep never happened.' },
  sibling: 'passwords',
};

export const PHISHING: MissionCard = {
  id: 'phishing',
  number: 5,
  title: 'Phishing Test Debrief',
  place: 'Meeting ring',
  source: 'Priya (InfoSec)',
  voice: 'Half of Sales clicked. Talk three of them through it. They are... defensive.',
  style: 'social',
  size: 'task',
  band: 'helpdesk',
  giver: giver('priya'),
  recipe: 'meetingRing',
  floor: 1,
  value: 100,
  objective: { kind: 'resolve', who: 'user', tag: 'sales', count: 3, text: 'Talk the three from Sales through it at the meeting table (the odds are printed), then back to the lift.' },
  crowd: [
    { kind: 'user', room: 'meeting', sort: 'desk', tag: 'sales', name: 'Dean from Sales', expected: true, together: true },
    { kind: 'user', room: 'meeting', sort: 'desk', tag: 'sales', name: 'Kelly from Sales', expected: true, together: true },
    { kind: 'user', room: 'meeting', sort: 'desk', tag: 'sales', name: 'Ross from Sales', expected: true, together: true },
    { kind: 'manager', room: 'node', sort: 'wander', name: 'The Sales Director' },
    { kind: 'user', room: 'meeting', sort: 'wander' },
  ],
  loud: 'A failed check enrages whoever you were talking to: it goes loud, and a loud finish is allowed.',
  alarm: 'search',
  failure: { hostile: true, management: -2, staff: -1, text: 'Sales clicked again. Priya knows whose debrief it was.' },
  sibling: 'phishtest',
};

export const JOSH: MissionCard = {
  id: 'josh',
  number: 3,
  title: 'Josh\'s First Day, Again',
  place: 'The annex',
  source: 'Josh (Intern), terrified',
  voice: 'They moved Internal IT to the annex and I have a laptop and no badge.',
  style: 'escort',
  size: 'project',
  band: 'helpdesk',
  giver: giver('josh'),
  recipe: 'annex',
  floor: 1,
  value: 180,
  objective: { kind: 'escort', who: 'josh', text: 'Get Josh to the Internal IT counter at the far end. The vendors are pitching on the straight way; the loop goes round them.' },
  crowd: [
    { kind: 'helper', room: 'lobby', sort: 'wander', tag: 'josh', name: 'Josh (Intern)', role: 'intern' },
    { kind: 'vendor', room: 'pitch', sort: 'wander', count: 2, tag: 'pitch', pocket: true },
    { kind: 'consultant', room: 'pitch', sort: 'desk', tag: 'pitch', pocket: true },
    { kind: 'user', room: 'node', sort: 'wander', count: 2 },
  ],
  loud: 'The vendors pitch at anyone they see, Josh included, and Josh does not cope: keep him away from a fight or he bolts for the lift.',
  alarm: 'cooldown',
  failure: { hostile: false, management: -2, staff: -3, text: 'Josh took the lift home on his first day. Again.' },
  sibling: 'intern',
};

export const MARCUS: MissionCard = {
  id: 'marcus',
  number: 9,
  title: 'Marcus and the Backups',
  place: 'Sales offices',
  source: 'Marcus from Sales',
  voice: 'I may have stopped the backup agent. Come and look. Bring nobody.',
  style: 'sneaky',
  size: 'project',
  band: 'helpdesk',
  giver: giver('marcus'),
  recipe: 'officeRow',
  floor: 0,
  value: 160,
  objective: { kind: 'fix', room: 'marcus', text: 'Reach Marcus\'s office without his manager noticing, fix the backup agent at his computer, then back to the lift.' },
  unseenBy: 'boss',
  crowd: [
    { kind: 'user', room: 'marcus', sort: 'desk', tag: 'marcus', name: 'Marcus from Sales', expected: true },
    { kind: 'manager', room: 'office', sort: 'patrol', tag: 'boss', name: 'Marcus\'s manager' },
    { kind: 'user', room: 'office', sort: 'desk' },
    { kind: 'user', room: 'open', sort: 'desk', count: 2 },
  ],
  loud: 'Get seen and his manager wants to know why IT is in Sales: it goes loud, and Marcus will not thank you.',
  alarm: 'cooldown',
  failure: { hostile: true, management: -2, staff: 0, text: 'The backups stayed off. Marcus has decided this is your fault.' },
};

export const PRINTER: MissionCard = {
  id: 'printer',
  number: 2,
  title: 'P1: The Printer Uprising',
  place: 'Print room 7B',
  source: 'The Service Desk',
  voice: 'Print room 7B. Every printer is printing HELP. Facilities have locked themselves in the kitchen.',
  style: 'loud',
  size: 'project',
  band: 'helpdesk',
  giver: giver('servicedesk'),
  recipe: 'large',
  floor: 0,
  value: 300,
  objective: { kind: 'resolve', who: 'jam', count: 7, text: 'Resolve the six paper jams and the elite jam, Hercules 400, before the SLA runs out, then back to the lift.' },
  crowd: [
    { kind: 'jam', room: 'print', sort: 'wander', count: 6 },
    { kind: 'jam', room: 'print', sort: 'wander', name: 'Hercules 400', elite: 'tenured' },
  ],
  loud: 'It is loud from the start: every jam is after you. The SLA is 240 seconds of play.',
  alarm: 'one-way',
  failure: { hostile: false, management: -6, staff: 0, text: 'The SLA ran out. Facilities fixed it with a fire extinguisher.' },
  p1: true,
  sla: 240,
};

/** Every card, the spike's two first. */
export const MISSIONS: readonly MissionCard[] = [STAPLER, VENDOR_DAY, POSTITS, PHISHING, JOSH, MARCUS, PRINTER];

/** The S1b pool in the spec's order (#1, #7, #4, #5, #3, #9, then the P1 card #2). */
export const POOL: readonly MissionCard[] = [STAPLER, VENDOR_DAY, POSTITS, PHISHING, JOSH, MARCUS, PRINTER];

export function missionById(id: string | null): MissionCard | undefined {
  return MISSIONS.find((m) => m.id === id);
}
