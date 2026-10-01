import type { MissionCard } from './mission';

/**
 * The spike's two cards, from the spec's starter catalogue (2.6): one sneaky
 * on the corner-office row, one loud in the meeting ring. Played from
 * `crawler.html?mission=stapler` and `?mission=vendor`.
 */

export const STAPLER: MissionCard = {
  id: 'stapler',
  number: 1,
  title: 'The Red Stapler, Recovered',
  source: 'Milton, muttering',
  voice: 'It is in HR\'s closet. They said it was "confiscated". I said nothing.',
  style: 'sneaky',
  recipe: 'officeRow',
  floor: 0,
  value: 120,
  objective: { kind: 'take', item: 'redstapler', text: 'Take the red stapler from the locked closet in HR\'s office, then back to the lift.' },
  unseenBy: 'hr',
  crowd: [
    { kind: 'manager', room: 'hr', sort: 'patrol', tag: 'hr', name: 'Hilary from HR' },
    { kind: 'manager', room: 'office', sort: 'desk' },
    { kind: 'user', room: 'office', sort: 'desk' },
    { kind: 'user', room: 'open', sort: 'desk', count: 2 },
    { kind: 'user', room: 'open', sort: 'wander' },
  ],
  loud: 'Get seen and it goes loud: HR, four users and a manager, and an HR warning if anyone watches you pick the lock.',
};

export const VENDOR_DAY: MissionCard = {
  id: 'vendor',
  number: 7,
  title: 'Vendor Day',
  source: 'Procurement',
  voice: 'Four vendors on the floor "pitching". Evaluate them.',
  style: 'loud',
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
};

export const MISSIONS: readonly MissionCard[] = [STAPLER, VENDOR_DAY];

export function missionById(id: string | null): MissionCard | undefined {
  return MISSIONS.find((m) => m.id === id);
}
