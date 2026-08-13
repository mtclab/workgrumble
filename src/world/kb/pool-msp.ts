/**
 * Articles the pool tickets name (E11, 0.34.0 slice 2), for the fault shapes
 * the shipped fifty-seven do not already cover. A pool ticket whose fault is
 * one an existing article already explains reuses that article: a second copy
 * of "the print spooler, and why the queue goes first" would be two answers to
 * one question.
 *
 * Two, out of eighteen MSP pool tickets, and both earn it by being the case an
 * existing article gets BACKWARDS rather than a case it has not met. The Mac
 * one exists because every article on this shelf that touches a missing share
 * assumes the person can see it and is refused; the capacity one exists because
 * `kb/one-directory-ate-the-drive` teaches "it is never the user's files", and
 * at a studio it is always the user's files, and a tech who follows that
 * article on a project NAS deletes somebody's job.
 */

import type { KbArticle } from './types';

export const POOL_MSP_ARTICLES: readonly KbArticle[] = [
  {
    id: 'kb/share-access-not-the-machine',
    title: 'The share is not missing, it is not theirs',
    summary: 'A volume somebody has no rights to is absent rather than '
      + 'refused, which is why the conversation goes to the machine and stays '
      + 'there.',
    state: 'published',
    issue: 'One person cannot see a shared volume that everybody else mounts. '
      + 'They can reach the server and sign in to it; the share simply is not '
      + 'in the list, and the machine has already been restarted twice.',
    environment: 'Any file server on any estate, and most visibly a Mac in '
      + 'front of a NAS: the Finder sidebar shows the server, the sign-in '
      + 'succeeds, and the volume list comes back short.',
    resolution: [
      'Establish that the sign-in itself worked. Somebody who authenticated '
        + 'and then saw nothing has an authorisation problem; somebody who '
        + 'could not sign in at all has a different one, and the two get '
        + 'treated as the same ticket constantly.',
      'Ask who CAN see it, and check that account\'s access rather than what '
        + 'you expect the access list to say. One person missing is a '
        + 'permission; everybody missing is the share or the service under it.',
      'Grant the account access to the share. That is the fix, and it is on '
        + 'the account rather than on anything the person is sitting in front '
        + 'of.',
      'Say on the ticket that the machine was never at fault. Somebody has '
        + 'spent a morning being told their Mac is broken and will keep '
        + 'believing it unless told otherwise, out loud.',
    ],
    cause: [
      'A file server does not hand a client every share it has and then refuse '
      + 'the ones that client may not open. It hands over the list that client '
      + 'is entitled to see, which means a volume somebody has no rights to is '
      + 'not shown greyed out, is not shown with a padlock on it, and produces '
      + 'no error of any kind: it is absent. From the other end that is '
      + 'indistinguishable from the share having been deleted, and it is why '
      + 'the reporter arrives certain that something is broken rather than that '
      + 'something was never granted.',
      'The reason it lands hardest on a Mac estate is that a Windows-shaped '
      + 'desk has one more thing to blame. A Mac in a Windows shop is already '
      + 'the suspect in every ticket it appears in, so an absence on it reads '
      + 'as the Mac being the Mac, and a morning goes into restarts, network '
      + 'cables and somebody asking whether it needs reinstalling. Nothing on '
      + 'the machine was ever going to change the answer, because the answer is '
      + 'a line on an access list on the server.',
      'The tell is the sign-in. Authentication and authorisation are two '
      + 'separate steps and only the first of them has anything to say out '
      + 'loud: a person who got through the password box and was then shown an '
      + 'empty list has proved that the account works, the network works, the '
      + 'server works and the credentials are right. Everything that is left is '
      + 'a permission, and permissions are granted rather than debugged.',
    ],
    see_also: ['kb/print-permissions', 'kb/mac-shell-dialect'],
  },
  {
    id: 'kb/capacity-is-not-a-cleanup',
    title: 'A full disk with nothing on it to delete',
    summary: 'Sometimes the drive is full of the only copy there is. That is a '
      + 'purchase, not a housekeeping job, and the difference is worth saying '
      + 'before somebody starts deleting.',
    state: 'published',
    issue: 'A volume is nearly full and somebody has asked the desk to "clear '
      + 'the old stuff off". Everything on it is live work, none of it is a '
      + 'second copy, and there is more of it arriving on a date already in '
      + 'the diary.',
    environment: 'Working storage on any estate where the work itself is big - '
      + 'a studio project NAS, a survey archive, a CAD volume - as opposed to a '
      + 'system drive an automatic process has been quietly filling.',
    resolution: [
      'Read the free space, and then read what is actually taking it. Those '
        + 'are two questions and only the second one decides whether this is a '
        + 'cleanup at all.',
      'Look specifically for a second copy: an export directory, a log that '
        + 'has grown unbounded, a backup written to the same volume it is '
        + 'backing up. If one is there, this is the ordinary ticket and there '
        + 'is a different article for it.',
      'If there is no second copy, stop looking and say so. Establish what is '
        + 'coming and when - a shoot, a scan, a job already booked - because '
        + 'the size of the gap is the whole of the case.',
      'Raise it as a capacity request with the numbers on it: free space '
        + 'today, expected arrival, and the date it runs out. Early enough to '
        + 'be a purchase order rather than an outage.',
      'Do not delete somebody\'s work to buy a week. It is the one move here '
        + 'that cannot be undone, and it converts a budget conversation into '
        + 'an incident with your name on it.',
    ],
    cause: [
      'Most full drives on most estates are full of something nobody chose to '
      + 'put there - a monthly export that has been written since 1997, a log '
      + 'with no cap on it, a temp directory that was never anybody\'s idea of '
      + 'a filing system. Those are cleanups, they are satisfying, and they '
      + 'teach a habit that is wrong everywhere the work itself is the big '
      + 'thing. On working storage the files ARE the job: every one of them is '
      + 'the only copy of itself, somebody is being paid to make more of them, '
      + 'and there is nothing on the volume that deleting would be a tidy-up '
      + 'rather than a loss.',
      'That makes it a commercial decision rather than a technical one, and '
      + 'the desk is not the person who makes it. What the desk owns is the '
      + 'arithmetic: how much room there is, how much is coming, and on what '
      + 'date the two meet. A capacity request with those three numbers on it '
      + 'is a conversation somebody can have with a supplier; the same request '
      + 'as "the NAS is getting full" is an email that gets read in a fortnight '
      + 'and answered in three weeks.',
      'The failure mode this article exists to prevent is a well-meaning tech '
      + 'applying the cleanup habit to working storage. Deleting last month\'s '
      + 'delivered job to make room for this month\'s looks like housekeeping '
      + 'right up until the client asks for a re-cut of it, and the studio '
      + 'discovers that the copy it was contractually holding was the one on '
      + 'the drive. Timing matters for the same reason: raised a week out this '
      + 'is a purchase order, raised on the morning it fills it is a shoot '
      + 'nobody can ingest.',
    ],
    see_also: ['kb/one-directory-ate-the-drive', 'kb/monitoring-only-alerts'],
  },
];
