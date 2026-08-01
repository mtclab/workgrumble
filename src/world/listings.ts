/**
 * The two lists this world keeps of files it holds no text for, as strings.
 *
 * A file on these drives is a node whose size is what `type` would print, and
 * two kinds of file cannot be that: a queued print job, which is whatever the
 * printer speaks, and the output a program writes by the month, which is
 * thirty megabytes of barcodes. For both of those the world holds exactly what
 * a listing prints - a size, a minute, and for the second one a name - because
 * that is all it honestly knows, and it keeps them as lines in a field.
 *
 * This is a LEAF: it knows how those lines are spelled and nothing else. It
 * exists as its own module because both a reader (`fs.ts`, which turns them
 * into listing rows) and a writer (ticket content, which seeds a jammed queue)
 * need the spelling, and `fs.ts` reaches the ticket roster through the event
 * watcher - so a ticket importing the encoding from the reader was a cycle
 * that worked only because of the order the first import happened to run in.
 *
 * Everything here is pure, and anything a build cannot read is dropped rather
 * than shown: a save is a file on the player's machine, anything can have been
 * at it, and one row short beats a row that renders `undefined`.
 */

const SEPARATOR = '|';

/* -- one queued print job: `bytes|stamp` ---------------------------------- */

export interface SpoolJob {
  readonly bytes: number;
  readonly modified: string;
}

export function encodeSpoolJob(job: Readonly<SpoolJob>): string {
  return `${String(job.bytes)}${SEPARATOR}${job.modified}`;
}

/** The queue behind a printer, oldest first. */
export function readSpoolJobs(value: unknown): readonly SpoolJob[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map((line): SpoolJob | null => {
        const [bytes = '', modified = ''] = line.split(SEPARATOR);
        const size = Number(bytes);

        return line.length === 0
          || !Number.isSafeInteger(size)
          || size < 0
          || modified.length === 0
          ? null
          : { bytes: size, modified };
      })
      .filter((job): job is SpoolJob => job !== null),
  );
}

/* -- one file a program wrote: `name|bytes|stamp` ------------------------- */

export interface StoredFile {
  readonly name: string;
  readonly bytes: number;
  readonly modified: string;
}

export function encodeStoredFile(entry: Readonly<StoredFile>): string {
  return [entry.name, String(entry.bytes), entry.modified].join(SEPARATOR);
}

/** What is in a directory whose contents are output rather than text. */
export function readStoredFiles(value: unknown): readonly StoredFile[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [];
  }

  return Object.freeze(
    value
      .split('\n')
      .map((line): StoredFile | null => {
        const [name = '', bytes = '', modified = ''] = line.split(SEPARATOR);
        const size = Number(bytes);

        return name.length === 0
          || bytes.length === 0
          || modified.length === 0
          || !Number.isSafeInteger(size)
          || size < 0
          ? null
          : { name, bytes: size, modified };
      })
      .filter((entry): entry is StoredFile => entry !== null),
  );
}

/** What a listing of those files adds up to, which is what a drive lost. */
export function storedBytes(entries: readonly StoredFile[]): number {
  return entries.reduce((total, entry) => total + entry.bytes, 0);
}
