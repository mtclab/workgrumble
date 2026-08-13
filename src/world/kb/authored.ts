/**
 * The articles the PLAYER writes (E9, 0.36.0 - the SD-senior rung's KB duty).
 *
 * Everything else on the shelf was written by somebody before you got here.
 * This one is not on the shelf at all until the player writes it, which is the
 * whole of the compounding beat: the reason first line keeps filing the same
 * class the same wrong way is that there is nothing to look up, and the reason
 * the third one arrives right is that there now is.
 *
 * It is a real article in the shipped shape - the same four KCS sections, the
 * same load-time gate, the same renderer - because a "player-written" article
 * that was a stub would be the game congratulating somebody for pressing a
 * button. What is different about it is one thing: `AUTHORED_ARTICLES` names
 * it, and `kbShelf` keeps anything on that list off the list until the world
 * says it was written.
 *
 * WHY A DRAFT. It is filed `draft` rather than `published` and that is not
 * modesty - it is the KCS ladder said honestly. What a person at a desk
 * produces in twenty minutes between two tickets is a draft; the validation and
 * the publishing are somebody else's afternoon, and this building has never
 * given anybody one. The KB app already says out loud when an article is a
 * draft, so the shelf tells the truth about it for free.
 */

import { AUDIT_ARTICLE } from '../audit';
import type { KbArticle } from './types';

/**
 * Article ids that are not on the shelf until the player has written them.
 *
 * A list rather than a flag on the article, because the question a reader asks
 * is about the SHELF - "what can I look up" - and the answer has to be
 * computable without walking every article's provenance.
 */
export const AUTHORED_ARTICLES: readonly string[] = Object.freeze([
  AUDIT_ARTICLE,
]);

export const AUTHORED_KB_ARTICLES: readonly KbArticle[] = [
  {
    id: AUDIT_ARTICLE,
    title: 'Impact is a fact about the estate, not about the fault',
    summary: 'The same stopped service is one desk on a workstation and the '
      + 'whole floor on a server. Look at the box, not the symptom.',
    state: 'draft',
    issue: 'A service has stopped and somebody cannot print, or cannot reach a '
      + 'share, or cannot see a machine on the network. Exactly one person has '
      + 'rung about it.',
    environment: 'Any Windows box on the estate, but the answer turns entirely '
      + 'on WHICH box: a workstation, or one of the four boxes other people '
      + 'hang off - PRINT-01, FILES-01, INTRANET-01, DC-01.',
    resolution: [
      'Find the machine the stopped service is actually ON, which is not '
        + 'always the machine the reporter is sitting at.',
      'Count who hangs off that machine before you fill anything in. The '
        + 'monitor and the directory both answer it; a workstation carries the '
        + 'one person who owns it, and PRINT-01 carries everybody who prints.',
      'Fill in the IMPACT from that count and nothing else. Six or more is '
        + 'high, three to five is medium, one or two is low. The number of '
        + 'people who have RUNG is not the number of people affected and it '
        + 'never has been.',
      'Then fill in the urgency from what the reporter is blocked on, and let '
        + 'the matrix produce the priority. Do not type a priority.',
    ],
    cause: [
      'A ticket form asks for a symptom and the symptom is identical either '
        + 'way: "the spooler has stopped" reads the same on a desk and on the '
        + 'print server. What differs is the blast radius, and blast radius is '
        + 'not visible from the ticket - it is visible from the estate.',
      'The reason one person rings about a floor-wide fault is that nobody '
        + 'walks past a printer to check it worked. They find out at four, when '
        + 'they go to collect something, and by then the clock the low impact '
        + 'bought has most of the afternoon left on it and the deadline is the '
        + 'least of anybody\'s problems.',
    ],
    see_also: ['kb/the-service-that-stopped'],
  },
];
