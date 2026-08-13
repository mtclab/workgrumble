/**
 * Articles the pool tickets name (E11, 0.34.0 slice 2), for the fault shapes
 * the shipped fifty-seven do not already cover. A pool ticket whose fault is
 * one an existing article already explains reuses that article: a second copy
 * of "the print spooler, and why the queue goes first" would be two answers to
 * one question.
 *
 * One article. Three of Halcyon's four pool tickets are governance rather than
 * fault - a cover grant, a leaver's account, an expired password - and the
 * shelf already answers all three, in the access review, the offboarding gap
 * and the three ways an account says no. The fourth is the morning the whole
 * floor says the internet is down, and the shelf has never had a page about the
 * one service everything else on a domain is standing on.
 */

import type { KbArticle } from './types';

export const POOL_CORPORATE_ARTICLES: readonly KbArticle[] = [
  {
    id: 'kb/dns-is-not-the-internet',
    title: '"The internet is down" and the addresses still work',
    summary: 'Names failing while addresses answer is name resolution, not the '
      + 'line. On a domain that is the DNS role on the controller.',
    state: 'published',
    issue: 'Nothing works this morning: no shared drive, no line-of-business '
      + 'application, no web. Several people have already agreed with each '
      + 'other that the internet is down, so that is what the ticket says.',
    environment: 'Any domain-joined estate where the workstations resolve '
      + 'through the domain controller, which is every one of them by default.',
    resolution: [
      'Get one fact before you believe the fault: try something by ADDRESS '
        + 'rather than by name. If a machine answers on its address and not on '
        + 'its name, the line is up and the thing that turns names into '
        + 'addresses is not - and that is a different outage with a different '
        + 'box at the end of it.',
      'Ask a resolver directly rather than trusting a browser. nslookup '
        + 'against the domain controller either answers or reports that the '
        + 'request timed out, and a timed-out request to the server the whole '
        + 'estate points at is the answer to the ticket.',
      'Look at the DNS Server service on the domain controller. Start it if it '
        + 'is stopped; that box is both the estate\'s own directory of names '
        + 'and the thing that goes and asks about everybody else\'s.',
      'Check with somebody who was failing, not with your own machine. A '
        + 'resolver that has just started is answering from nothing, and the '
        + 'desk that has been failing for an hour is the honest test.',
      'If a machine is still stubborn afterwards, clear its resolver cache '
        + 'before you go looking for a second fault. A client remembers what it '
        + 'was told, including that it was told nothing.',
    ],
    cause: [
      'Nothing on a network is reached by name. Names are a convenience layer '
      + 'over addresses, and every one of them has to be turned into an address '
      + 'by somebody before a single packet moves - so a machine with a '
      + 'perfectly good link, a perfectly good switch and a perfectly good line '
      + 'to the outside world can still reach absolutely nothing if the service '
      + 'that does the turning is not answering. That state is indistinguishable '
      + 'from a dead line to anybody who is not looking for it.',
      'On a domain it is worse than an inconvenience, because the domain itself '
      + 'is published in DNS. Clients find the controller, the file server and '
      + 'the sign-in service by looking them up, and they look them up on the '
      + 'controller. The same box is usually the forwarder for everything '
      + 'external as well, so one stopped service takes out the shared drive, '
      + 'the finance system and the web in the same minute - which is precisely '
      + 'why the reports that reach the desk are three different faults from '
      + 'three different people and one cause.',
      'The reason "the internet is down" arrives instead of anything useful is '
      + 'that it is the only phrase most people have for it, and it is not a '
      + 'stupid one: from where they sit, everything that goes anywhere has '
      + 'stopped. The skill is not correcting them, it is hearing the shape '
      + 'underneath - every person, every system, all at once - which is a '
      + 'shared thing rather than any of their machines.',
      'And the cache is why the timing never quite lines up. A workstation '
      + 'remembers what it was told for as long as it was told to remember it, '
      + 'so the floor does not fail all at once: it fails in ones and twos over '
      + 'twenty minutes as each machine reaches the end of what it knew, which '
      + 'reads as a fault that is spreading and is nothing of the sort.',
    ],
    see_also: ['kb/event-log', 'kb/reading-the-error'],
  },
];
