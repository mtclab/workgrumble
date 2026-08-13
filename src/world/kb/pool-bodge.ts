/**
 * Articles the pool tickets name (E11, 0.34.0 slice 2), for the fault shapes
 * the shipped fifty-seven do not already cover. A pool ticket whose fault is
 * one an existing article already explains reuses that article: a second copy
 * of "the print spooler, and why the queue goes first" would be two answers to
 * one question.
 *
 * One article, and it is the one the shelf was missing rather than the one this
 * shop happened to need. Four of Bodgeworth's five pool tickets are a lockout,
 * a relock, a disabled account and a printer with no power, and every one of
 * those is a page the tech already carries between jobs. The fifth is a share
 * that fails at the CLIENT end, and the whole of the shelf's file-sharing
 * advice was written from the server's chair - so the gap was real and it is
 * filled once, from both ends, which is why the corporate pool's own
 * server-side ticket names this same article rather than a second copy of it.
 */

import type { KbArticle } from './types';

export const POOL_BODGE_ARTICLES: readonly KbArticle[] = [
  {
    id: 'kb/two-ends-of-a-share',
    title: 'A mapped drive has two services, and the count tells you which',
    summary: 'One desk cannot reach the share and the rest can: that is the '
      + 'client. Every desk at once: that is the server.',
    state: 'published',
    issue: 'The drive letter is still there and everything under it errors. '
      + 'The server has been checked and the server is fine, which the person '
      + 'who cannot open anything does not find reassuring.',
    environment: 'Any Windows desk mapping a drive off any Windows server on '
      + 'this estate, and both of the services underneath it.',
    resolution: [
      'Count the desks before you touch anything. One machine failing while '
        + 'the others are working is the client end; every machine failing at '
        + 'once is the server end. It is the cheapest question on the ticket '
        + 'and it decides which box you walk to.',
      'On the failing desk, look at the Workstation service. That is the SMB '
        + 'client - the half that does the asking - and with it stopped that '
        + 'machine cannot reach any share anywhere, which is why a drive on a '
        + 'healthy server still comes back empty.',
      'On the server, look at the Server service. That is the half that does '
        + 'the answering, and with it stopped nobody maps anything off that box '
        + 'at all - the drive letter will not even connect.',
      'Start whichever of the two is stopped, and then go back to the person '
        + 'and open the drive with them. A share that reconnects on the next '
        + 'attempt and a share that reconnects when somebody signs in again '
        + 'are two different afternoons for them.',
      'Write down which service it was and, if anybody will tell you, why it '
        + 'was off. A service that was stopped by a person will be stopped by '
        + 'that person again.',
    ],
    cause: [
      'File sharing on Windows is two services and not one, and they sit on '
      + 'opposite ends of the wire. The Workstation service is the client: it '
      + 'is what turns a drive letter or a UNC path into a request that leaves '
      + 'the machine. The Server service is the other end: it is what listens '
      + 'for those requests on the box that holds the files. A share needs both '
      + 'of them running, on two different computers, and only one of them is '
      + 'on the computer the person is complaining from.',
      'That is why the symptom is so misleading. Everything the reporter can '
      + 'see is about the drive - the letter, the folders, the error - so the '
      + 'drive and the server are what get checked, and the server is fine, '
      + 'because the server is fine for everybody else too. Nothing about the '
      + 'message they are reading points at a service on their own machine, '
      + 'and there is no reason it should: the client half is not a thing '
      + 'anybody has ever had to think about.',
      'The count is the whole diagnosis and it costs one phone call. If the '
      + 'desk next to them can open the same folder, the fault is on this side '
      + 'of the wire; if nobody in the building can, it is on the other. The '
      + 'same reasoning covers the print path, the mail client and everything '
      + 'else with two ends - one person failing is almost never the shared '
      + 'thing, whatever the person is looking at.',
      'And the reason a client service is ever stopped in the first place is '
      + 'usually a human with a magazine: somebody goes down the services list '
      + 'turning off the ones they do not recognise, to make an old machine '
      + 'quicker. It genuinely is quicker. It is quicker in the way a van with '
      + 'the seats taken out is lighter.',
    ],
    see_also: ['kb/print-permissions', 'kb/event-log'],
  },
];
