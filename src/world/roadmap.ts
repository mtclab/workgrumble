/**
 * The roadmap: updates that are PLANNED, as opposed to `releases.ts`, which is
 * updates that happened. The Update History window reads both - what the
 * workstation installed, and what IT says is scheduled.
 *
 * House rule, same as the release notes: it is written in-fiction, in the
 * voice of an IT department that has been told to communicate more, and every
 * item is a real thing on the plan - a roadmap of jokes would be a bit, a real
 * one in that voice is the product telling you where it is going while staying
 * in character. What it must NOT do is give dates or promise an order: it says
 * so itself, because an IT department that commits to a date is an IT
 * department that has not met itself.
 *
 * Player-facing descriptions only - no internal names, no epic numbers. The
 * ordering here is rough intent, not a queue, and the header says as much.
 */

export interface RoadmapItem {
  /** The one-line title of the planned change, in the update-window voice. */
  readonly title: string;
  /** A short paragraph or two, same register as a release note. */
  readonly body: string;
}

/** The standing disclaimer at the top of the planned list. In character. */
export const ROADMAP_PREAMBLE =
  'The following changes are planned. They are listed in roughly the order we '
  + 'expect to make them, which is not a promise about the order we will make '
  + 'them in, and there are no dates. IT does not give dates. IT has learned. '
  + 'Everything below is subject to change, including whether it happens at '
  + 'all, and none of it is installed yet - your workstation is exactly as '
  + 'capable this morning as it says in Update History and no more.';

export const ROADMAP: readonly RoadmapItem[] = Object.freeze([
  {
    title: 'Software you can install, and a building that has feelings about it.',
    body:
      'You will be able to install programs from a catalogue - some of them '
      + 'useful, some of them the reason IT locks workstations down. What your '
      + 'employer allows depends on your employer, and installing something '
      + 'they do not allow will work fine right up until somebody looks. IT '
      + 'audits IT. This is the next thing being built, and the first part of '
      + 'it is arriving now.',
  },
  {
    title: 'More than one place to be messaged at once.',
    body:
      'At present people reach you by mail and by chat and by walking over. '
      + 'This is not enough places. There will be more of them, all at the '
      + 'same time, all asking the same question, and the answer will be in '
      + 'the one you did not check. Being reachable is not the same as being '
      + 'reached, and the gap between them is where the day goes.',
  },
  {
    title: 'Other jobs, other companies, other decades.',
    body:
      'Probation is one employer at one workstation in one year. The plan is '
      + 'to let you leave it: for other companies, each with its own rules, '
      + 'its own way of taking a ticket, and its own idea of what a computer '
      + 'should look like - because changing jobs, in this line of work, means '
      + 'changing which version of the machine you are fighting. Some of them '
      + 'are older than this one. Some of them are worse.',
  },
  {
    title: 'Real servers, and the pager that comes with them.',
    body:
      'The next rung of the job is the machines nobody sits at: servers, '
      + 'reached down a terminal from your own desk, running the services that '
      + 'the tickets you close today only ever pointed at. Keeping them up is '
      + 'the job. Being the person who is called when they go down at night is '
      + 'also the job, and it is the part they do not put in the advert.',
  },
  {
    title: 'The cloud, and the invoice for it.',
    body:
      'After the servers you can see comes the ones you rent - somebody '
      + 'else\'s computers, billed by the minute, configured by describing what '
      + 'you want and hoping it matches what you get. The bill is a gameplay '
      + 'mechanic. So is the meeting about the bill.',
  },
  {
    title: 'A career, and a way out of it.',
    body:
      'Underneath all of the above is the long game: getting better, getting '
      + 'promoted, getting paid, and deciding what any of it is for. There are '
      + 'ways to end this career on purpose - a quiet plan you save toward '
      + 'while the tickets come - and the price of the exit goes up exactly as '
      + 'fast as your salary does, which is the truest thing in the whole '
      + 'game.',
  },
]);
