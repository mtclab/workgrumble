/**
 * The blameless postmortem (E6, 0.19.0): the authored post-incident record an
 * engineer files once an incident is out, and the gate that keeps it blameless.
 *
 * The failed-deploy incident ("it worked in staging") is not closed by the
 * rollback alone - it is closed by writing the postmortem, the professional move
 * the tier is measured on. A real postmortem is a short structured record: what
 * happened, the timeline, what the SYSTEM let happen, and the follow-up. The SRE
 * culture rule the version is built on is that it is BLAMELESS: it analyses the
 * system, never the person - "the deploy had no staging parity", not "so-and-so
 * pushed it". A postmortem that reaches for a name has already failed at its one
 * job, so the copy is gated: every authored record here is checked at load
 * against the estate's roster and a build that lets a person's name into one
 * fails, the same teeth the KB-never-states-the-answer / assistant-hint gates keep.
 *
 * Content, not machinery: the prose is authored per incident (by the unit it is
 * about), the verb (`world/actions/incidents.ts`) writes the append-only record
 * and the close marker, and this module holds the words and the honesty gate.
 */

/**
 * A blameless post-incident record, in the four parts a real one keeps.
 *
 * `unit` is the systemd unit the incident was about - the key the verb files by
 * and the surface reads. The four prose blocks are the postmortem itself, each a
 * list of lines the terminal prints. None of them names a person; the gate below
 * proves it.
 */
export interface Postmortem {
  /** The unit node id the incident is about - `postmortemFor` looks it up by this. */
  readonly unit: string;
  /** The incident, in a phrase, for the record's heading. */
  readonly title: string;
  /** What happened - the incident in one blameless paragraph. */
  readonly whatHappened: readonly string[];
  /** The timeline, in the plain "HH:MM - what" shape a real record keeps. */
  readonly timeline: readonly string[];
  /** What the SYSTEM (never the person) let happen - the blameless analysis. */
  readonly whatTheSystemLetHappen: readonly string[];
  /** The follow-up: the changes that stop the class of thing, not the blame. */
  readonly followUp: readonly string[];
}

/**
 * The estate's people, by every token of every person's name (E6, 0.19.0).
 *
 * The words a blameless postmortem may never contain - a first name, a surname,
 * the whole name. It is the roster of `person` nodes across both employers, kept
 * in step with the world by the test that reads every person's name off the
 * loaded graph and asserts each token is here (so a new colleague forces this
 * list to grow, rather than opening a hole the gate walks past). The company
 * entity ("Workgrumble Ltd") is not a person and is not here.
 */
export const BANNED_NAMES: readonly string[] = [
  'Ada', 'Whitlock', 'Bev', 'Tannock', 'Colin', 'Peach', 'Dana', 'Chen',
  'Dennis', 'Hoyle', 'Desmond', 'Frisk', 'Dev', 'Sharma', 'Erin', 'Khoury',
  'Gary', 'Poole', 'Gordon', 'Ainsley', 'Grace', 'Bellamy', 'Hilda', 'Marsh',
  'Ivy', 'Okafor', 'Kwame', 'Boateng', 'Marcus', 'Kelp', 'Reyes', 'Marika',
  'Voss', 'Morgan', 'Nadia', 'Fontaine', 'Nina', 'Nora', 'Price', 'Owen',
  'Pryce', 'Pat', 'Pending', 'Priya', 'Mehta', 'Raval', 'Rafiq', 'Hassan',
  'Rob', 'Tulliver', 'Terry', 'Blunt', 'Theo', 'Vic', 'Ndlovu', 'Yolanda',
  'Reece', 'Glenda', 'Tillman',
];

/** One matcher per banned name, whole-word and case-insensitive, built once. */
const BANNED_PATTERNS: readonly { readonly name: string; readonly re: RegExp }[] =
  BANNED_NAMES.map((name) => ({
    name,
    re: new RegExp(`\\b${name}\\b`, 'iu'),
  }));

/**
 * Every whole prose word of a postmortem, joined - what the gate reads. The
 * title and the four blocks, all of it, because a name is a leak wherever it is.
 */
export function postmortemText(doc: Readonly<Postmortem>): string {
  return [
    doc.title,
    ...doc.whatHappened,
    ...doc.timeline,
    ...doc.whatTheSystemLetHappen,
    ...doc.followUp,
  ].join('\n');
}

/**
 * The person names a piece of text names, or an empty list. The gate's teeth:
 * a postmortem whose text hits any of these is not blameless, and the loader
 * refuses it.
 */
export function namesLeaked(text: string): readonly string[] {
  return BANNED_PATTERNS
    .filter((pattern) => pattern.re.test(text))
    .map((pattern) => pattern.name);
}

/**
 * The failed-deploy postmortem (E6, 0.19.0): "it worked in staging".
 *
 * The blameless record of the deploy that broke prod. It names the fault at the
 * level a postmortem is written for - the pipeline had no staging parity and no
 * automated rollback - and never at the level a blame culture stops at, which is
 * a person. Every word of it is checked at load by `validatePostmortems`.
 */
const FAILED_DEPLOY_POSTMORTEM: Postmortem = {
  unit: 'unit:fc-rmm-01/fcworker.service',
  title: 'Post-incident review: fcworker.service down after a release ("worked '
    + 'in staging")',
  whatHappened: [
    'A routine release of the background worker (fcworker.service) on FC-RMM-01 '
      + 'was deployed to production during the day. The same build had come up '
      + 'clean in staging. In production the unit failed to start: the new build '
      + 'read a config key that exists in the staging environment and does not '
      + 'exist in production, exited non-zero on startup, and systemd hit the '
      + 'start-limit and left it failed. Background jobs stopped running until the '
      + 'unit was rolled back to the previous release and restarted.',
  ],
  timeline: [
    '14:02 - release deployed to production, reported success by the deploy tool.',
    '14:03 - fcworker.service fails to start; systemd retries and gives up at the '
      + 'start-limit.',
    '14:05 - monitoring flags the worker down; the incident is opened.',
    '14:20 - the release is rolled back to the last-good build and the unit is '
      + 'restarted; it comes up active (running) and the backlog drains.',
  ],
  whatTheSystemLetHappen: [
    'This is a systems failure, not a personal one, and it is written up as one. '
      + 'The staging environment was not a faithful copy of production - it '
      + 'carried a config key production does not - so "it worked in staging" was '
      + 'true and meant nothing, because staging was not production. The deploy '
      + 'pipeline had no pre-flight that would have caught the missing key, and no '
      + 'automated rollback, so a failed start became a manual scramble instead of '
      + 'a self-healing one. The gap that let a good build fail in production was '
      + 'in the process, and the process is what changes.',
  ],
  followUp: [
    'Bring staging into parity with production, or gate deploys on the difference '
      + 'being zero - a staging that is not production is a test that proves '
      + 'nothing.',
    'Add a startup pre-flight to the pipeline that validates the config the build '
      + 'needs against the target environment before the release is cut.',
    'Wire an automated rollback to the last-good release on a failed start, so the '
      + 'next one is a self-heal and not a page.',
  ],
};

/**
 * Every authored postmortem, by the unit it is about.
 *
 * One today - the failed-deploy incident, the version's postmortem beat - built
 * so more incidents can carry one without changing the verb or the surface.
 */
export const POSTMORTEMS: readonly Postmortem[] = validatePostmortems([
  FAILED_DEPLOY_POSTMORTEM,
]);

/** The postmortem for a unit's incident, or undefined if none is authored. */
export function postmortemFor(unit: string): Postmortem | undefined {
  return POSTMORTEMS.find((doc) => doc.unit === unit);
}

/**
 * The load-time blameless gate, and the proof it has teeth.
 *
 * Every authored postmortem's whole text is read for a person's name; one that
 * names anybody throws here rather than shipping, exactly as the assistant's
 * banned-hint gate throws on a real fix. It also refuses a shapeless record - a
 * postmortem with an empty block is not a postmortem - so the content bar and the
 * honesty bar are one load-time check.
 */
export function validatePostmortems(
  docs: readonly Postmortem[],
): readonly Postmortem[] {
  const units = new Set<string>();

  for (const doc of docs) {
    if (doc.unit.trim().length === 0) {
      throw new Error('A postmortem with no unit is a record of nothing.');
    }

    if (units.has(doc.unit)) {
      throw new Error(`Two postmortems for "${doc.unit}" - an incident gets one.`);
    }

    units.add(doc.unit);

    const blocks: readonly (readonly string[])[] = [
      doc.whatHappened,
      doc.timeline,
      doc.whatTheSystemLetHappen,
      doc.followUp,
    ];

    for (const block of blocks) {
      if (block.length === 0 || block.some((line) => line.trim().length === 0)) {
        throw new Error(
          `Postmortem for "${doc.unit}" has an empty block - every part has to `
            + 'say something.',
        );
      }
    }

    const leaked = namesLeaked(postmortemText(doc));

    if (leaked.length > 0) {
      throw new Error(
        `Postmortem for "${doc.unit}" names a person (${leaked.join(', ')}). A `
          + 'blameless postmortem analyses the system, never the name.',
      );
    }
  }

  return docs;
}
