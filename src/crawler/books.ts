import type { Skill } from './rpg';

export interface BookDef {
  readonly id: string;
  readonly title: string;
  readonly skill: Skill;
  readonly blurb: string;
}

/** Skill books: read one and a skill goes up by one, the Morrowind way. */
export const BOOKS: readonly BookDef[] = [
  { id: 'book-mmm', title: 'The Mythical Man-Month', skill: 'troubleshooting', blurb: 'Adding people to a late ticket makes it later.' },
  { id: 'book-phoenix', title: 'The Phoenix Project', skill: 'troubleshooting', blurb: 'A novel about IT. You read it on the bus and felt seen.' },
  { id: 'book-friends', title: 'How to Win Friends and Influence Users', skill: 'soft', blurb: 'Chapter 4: never say "have you tried".' },
  { id: 'book-sauna', title: 'Sauna Etiquette, Volume III', skill: 'runecraft', blurb: 'On the proper throwing of löyly, and when to be quiet.' },
  { id: 'book-kalevala', title: 'Kalevala (Abridged, Office Edition)', skill: 'runecraft', blurb: 'Väinämöinen sings a printer back to life.' },
  { id: 'book-bofh', title: 'Tales of the Bastard Operator', skill: 'hardware', blurb: 'A guide to the more physical side of user support.' },
  { id: 'book-bash', title: 'Bash One-Liners for the Desperate', skill: 'scripting', blurb: 'Every one of them ends in `| grep -v grep`.' },
  { id: 'book-lockpick', title: 'The Office Supplies Field Manual', skill: 'security', blurb: 'Chapter 12 is about paperclips and should not be.' },
  { id: 'book-ninja', title: 'Invisible at Your Desk', skill: 'stealth', blurb: 'Wear grey. Carry a clipboard. Walk with purpose.' },
  { id: 'book-sisu', title: 'Sisu: The Finnish Art of Not Giving Up', skill: 'sisu', blurb: 'It is mostly about saunas, it turns out.' },
  { id: 'book-beer', title: 'The Good Beer Guide to Helsinki', skill: 'drinking', blurb: 'Annotated in three different handwritings.' },
  { id: 'book-run', title: 'Couch to 5k (Stairwell Edition)', skill: 'athletics', blurb: 'The lift has been out of order since March.' },
];

export function bookById(id: string): BookDef | undefined {
  return BOOKS.find((b) => b.id === id);
}
