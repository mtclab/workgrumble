/**
 * The Assistant's lines, and the gate that keeps them useless.
 *
 * The character is flavour and nothing else: it comments on what is happening
 * and is never right about what to do. That is not a writing guideline, it is
 * a rule with a machine behind it - the KB owns all real help, and a line that
 * names the actual fix for the situation on screen fails the build.
 *
 * THE GATE. Every line is checked, at load and in the suite, against the real
 * fixes this game ships. The fixes are DERIVED rather than listed by hand,
 * from four registries that already exist and are already maintained:
 *
 * - `WORLD_TICKETS` - every advertised path's own label ("Unlock it with
 *   unlock gpoole"), which is the game telling the player how a ticket closes.
 * - `COMMANDS` - the terminal's grammar, one usage line per command
 *   ("restart <service>"), which is the game telling them what to type.
 * - `WORLD_KB` - the resolution steps of every article, which is the real help
 *   written out in the trade's own words. It is the KB's job to say these.
 * - `COVERAGE` - what each control on the surfaces of a situation actually
 *   does, for the fixes that are a button rather than a ticket: the can on the
 *   desk, the dot on the taskbar, the three answers to a ringing phone.
 *
 * A hand-written banned list would be a list that goes stale the day somebody
 * writes a new ticket; these grow with the game.
 *
 * THE TEST is three rules, and `assistantLeak` documents each one where it is
 * applied: the VERB of a control that would resolve what is on screen, two or
 * more of a published fix's own working words, or three of its words quoted in
 * a row. Everything is folded and matched whole, so "resetting" is not "reset"
 * and a line that shares only "password" with a page about passwords is still
 * allowed to mention the situation. Naming the SITUATION is the whole job;
 * naming the FIX is the thing it must never do.
 *
 * `assistant-lines.test.ts` proves the gate has teeth by planting lines that
 * give real advice - one per situation that has a fix of its own - and
 * watching the load go red.
 */

import { CALL_CONTROL_LABELS } from './apps/call';
import { COMMANDS } from './apps/cmd-parse';
import { COVERAGE, type CoverageEntry } from './coverage';
import { WORLD_KB } from '../world/kb';
import { WORLD_TICKETS } from '../world/tickets';

/**
 * What the Assistant is currently talking over.
 *
 * Read off the desk the shell already paints - a takeover, a phone, the dot,
 * the meters, the queue - so there is no new world state anywhere in it. The
 * order they are listed in is the order they are chosen in (`situationOf`).
 */
export const ASSISTANT_SITUATIONS = [
  /** A phone is ringing, or somebody is standing at the desk. */
  'call',
  /** A workstation the player pushed back is on its way. */
  'reboot',
  /** A meeting or a reboot has just handed the desk back. */
  'after',
  /** The dot says do not disturb. */
  'dnd',
  /** Stress past the point where the hands go. */
  'stress',
  /** There is work in the queue. */
  'ticket',
  /** And there is not. */
  'idle',
  /**
   * Not a situation on the desk: the line it says on the way back after
   * somebody closed it. It is here so the gate has a bucket for those lines,
   * and theirs is the strictest one - a line that can arrive over ANY
   * situation is checked against every fix in the game.
   */
  'returning',
] as const;

export type AssistantSituation = (typeof ASSISTANT_SITUATIONS)[number];

export interface AssistantLine {
  /** Unique, and what a failing gate names. */
  readonly id: string;
  readonly situation: AssistantSituation;
  readonly text: string;
  /**
   * How many dismissals this line is the answer to, for `returning` lines
   * only. The last tier is the one every count past it lands on.
   */
  readonly tier?: number;
}

/* -- the fixes, derived -------------------------------------------------- */

export interface RealFix {
  /** Which registry it came from, so a failure says where to go and read. */
  readonly source: string;
  /** The fix in the game's own words. */
  readonly text: string;
  /** Its significant words, folded. */
  readonly words: ReadonlySet<string>;
  /**
   * Whether this fix is a PARAGRAPH rather than an instruction.
   *
   * The knowledge base writes its steps as trade prose - "Ask what else signs
   * in as them: a phone, a mapped drive, a machine in a cupboard" - and two
   * words of a paragraph are two words of English, not a fix. Those are
   * matched on the game's own working vocabulary only (`fixVocabulary`). A
   * path label, a command usage and a control's own description are short and
   * every word in them is there to say what to do, so those are matched whole.
   */
  readonly prose: boolean;
}

/**
 * Words that carry no fix in them.
 *
 * The only hand-written list in this file, and it is deliberately about
 * ENGLISH rather than about this game: it decides how sensitive the overlap
 * test is, never what counts as a fix. Everything with a verb or a noun in it
 * comes out of the registries.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'about', 'after', 'again', 'all', 'also', 'and', 'any', 'anything',
  'are', 'around', 'as', 'at', 'back', 'be', 'because', 'been', 'before',
  'being', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do', 'does',
  'doing', 'done', 'down', 'each', 'else', 'even', 'every', 'everything',
  'for', 'from', 'get', 'goes', 'going', 'had', 'has', 'have', 'her',
  'here', 'hers', 'him', 'his', 'how', 'however', 'if', 'in', 'into', 'is',
  'it', 'its', 'just', 'let', 'like', 'made', 'make', 'many', 'may', 'might',
  'more', 'most', 'much', 'must', 'never', 'new', 'no', 'nobody', 'not',
  'nothing', 'now', 'of', 'off', 'on', 'once', 'one', 'only', 'onto', 'or',
  'other', 'our', 'out', 'over', 'own', 'past', 'per', 'put', 'same', 'say',
  'says', 'see', 'she', 'should', 'so', 'some', 'somebody', 'something',
  'still', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there',
  'these', 'they', 'thing', 'things', 'this', 'those', 'through', 'to', 'too',
  'two', 'under', 'until', 'up', 'upon', 'us', 'use', 'very', 'was', 'way',
  'we', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'why', 'will', 'with', 'would', 'you', 'your', 'yours',
]);

/**
 * Every root a word could be, by trimming one common inflection off it.
 *
 * Deliberately light and deliberately PLURAL: it offers the word itself plus a
 * candidate for each ending this game's fix vocabulary inflects with, because
 * "frees" is "free" under -s and "fre" under -es and only the table below
 * knows which one is a verb. Nothing here decides anything - the candidates are
 * only ever LOOKED UP - so an extra wrong candidate costs nothing and a missing
 * right one is the only failure, which is why it errs towards offering more.
 * It never folds a bare "e" or a doubled consonant, so "note" and "closes" are
 * left as themselves and the returning lines keep the words the gag is made of.
 */
function stemCandidates(word: string): readonly string[] {
  const candidates = [word];

  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      candidates.push(word.slice(0, -suffix.length));
    }
  }

  return candidates;
}

/**
 * The mechanical verbs, folded to one form each - inflections AND synonyms.
 *
 * The one curated table in the matcher, and the reason it is curated rather
 * than derived: no registry says "reboot" and "restart" are the same repair,
 * or that "delay" is what a player means by "postpone". Every KEY is a verb or
 * a light stem of one; every VALUE is the token the gate reasons in. A word
 * that is NOT in here passes through untouched, which is what keeps the folding
 * off ordinary nouns - "machine", "note", "password" are their own canonical
 * form and collide with nothing.
 *
 * It is pinned by a test that enumerates the pairs (postpone/postponing/
 * delayed all reach "postpon"), so a missing inflection is a red rather than a
 * silent gap.
 */
const VERB_CANON: Readonly<Record<string, string>> = {
  // reboot === restart
  reboot: 'restart', restart: 'restart',
  // empty === clear
  clear: 'clear', empty: 'clear', empti: 'clear', clearqueue: 'clear',
  // postpone === delay === defer === snooze
  postpone: 'postpon', postpon: 'postpon',
  delay: 'postpon', defer: 'postpon', deferr: 'postpon',
  snooze: 'postpon', snooz: 'postpon',
  // free === unjam
  free: 'free', unjam: 'free', unjamm: 'free',
  // and the verbs with no synonym, listed so their inflections still fold
  unlock: 'unlock', reseat: 'reseat', drink: 'drink',
  reset: 'reset', resett: 'reset',
  answer: 'answer', decline: 'decline', tidy: 'tidy',
  rotate: 'rotate', rotat: 'rotate',
};

/**
 * A token folded to the one form the gate reasons about.
 *
 * Every candidate stem is offered to the verb table and the first the table
 * knows wins; anything it does not know is returned exactly as it came in.
 */
export function canonical(token: string): string {
  for (const candidate of stemCandidates(token)) {
    const known = VERB_CANON[candidate];

    if (known !== undefined) {
      return known;
    }
  }

  return token;
}

/**
 * A string as the words that matter in it, each folded to its canonical form.
 *
 * Folded to lower case and split on everything that is not a letter or a
 * digit, so `PRINT-01` is `print` and `01`, and `"rotate <host> 0"` is
 * `rotate` and `host`. Stopwords go on the raw token, then the survivors are
 * canonicalised (stem + synonym) so "rebooting" and "restart" arrive as one
 * word. Anything whose canonical form is under three characters is dropped:
 * two-letter tokens are noise in prose and the fixes that need them (`sc`,
 * `cd`) always carry a longer word beside them.
 */
export function significantWords(text: string): ReadonlySet<string> {
  const words = new Set<string>();

  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/u)) {
    if (raw.length >= 3 && !STOPWORDS.has(raw)) {
      const token = canonical(raw);

      if (token.length >= 3) {
        words.add(token);
      }
    }
  }

  return words;
}

function fix(source: string, text: string, prose = false): RealFix {
  return Object.freeze({
    source,
    text,
    prose,
    words: significantWords(text),
  });
}

/**
 * Every fix that closes a ticket, in the three places this game publishes one:
 * the path the roster advertises, the line the terminal prints when somebody
 * asks how a command is spelled, and the numbered steps of the article that
 * exists to teach it.
 *
 * These are the ones no line may name in ANY situation. A ticket is open for
 * most of the week, so a joke about a phone that names the way a printer is
 * fixed is a joke that fixed a printer.
 */
function ticketFixes(): readonly RealFix[] {
  const fixes: RealFix[] = [];

  for (const ticket of WORLD_TICKETS) {
    for (const path of ticket.paths) {
      fixes.push(fix(`ticket path "${path.id}"`, path.label));
    }
  }

  for (const command of COMMANDS) {
    fixes.push(fix(`the "${command.name}" command`, command.usage));
  }

  for (const article of WORLD_KB) {
    for (const [index, step] of article.resolution.entries()) {
      fixes.push(fix(
        `${article.id} resolution step ${String(index + 1)}`,
        step,
        true,
      ));
    }
  }

  return Object.freeze(fixes);
}

/**
 * The words this game DOES things with.
 *
 * The mechanical half of the derivation, and the reason the gate can read
 * prose without drowning in it. A knowledge-base step is a paragraph of
 * English with a fix inside it - "Ask what else signs in as them - a phone, a
 * mapped drive, a machine in a cupboard" shares "phone" with any line about a
 * ringing telephone, and neither of them is a fix. So a shared word only
 * counts when it is a word the game uses to CHANGE something: the vocabulary
 * of the advertised paths, of the terminal's grammar, and of the registered
 * verbs themselves.
 *
 * All three are mechanical registries rather than prose, which is what makes
 * this a filter on noise rather than a hole: every fix word in the game is in
 * one of them by construction, because a fix that no path, no command and no
 * action can express is not a fix anybody can perform.
 */
function fixVocabulary(): ReadonlySet<string> {
  const words = new Set<string>();
  const take = (text: string): void => {
    for (const word of significantWords(text)) {
      words.add(word);
    }
  };

  for (const ticket of WORLD_TICKETS) {
    for (const path of ticket.paths) {
      take(path.label);

      for (const step of path.steps) {
        take(step.action);
      }
    }
  }

  for (const command of COMMANDS) {
    take(command.usage);
    take(command.name);
  }

  return words;
}

/**
 * And the fixes that are a control rather than a ticket, read off the
 * completeness manifest: what the three answers to a ringing phone do, what
 * the postpone buys, what the dot costs, what the can is for.
 *
 * The manifest's `does` is one sentence per control saying what pressing it
 * achieves, which is exactly the thing the Assistant must not be the one to
 * say. Keyed by the coverage id's own prefix, because that is how the manifest
 * is already grouped.
 */
const SITUATION_CONTROLS: Readonly<
  Partial<Record<AssistantSituation, readonly string[]>>
> = {
  call: ['call.'],
  reboot: ['reboot.'],
  dnd: ['desktop.presence'],
  stress: ['desk.'],
  // Every control that RESOLVES a ticket, on top of the ticket fixes every
  // situation carries: the five tools, and the one fix that hides in the
  // About box - the fan reseat, whose control the tool prefixes miss and whose
  // omission let "Reseat it" through. It is named exactly rather than by an
  // `about.` prefix, which would also drag in Refresh and the bubble toy and
  // ban a line for saying "run" or "fan".
  ticket: [
    'tickets.', 'directory.', 'remote.', 'cmd.', 'kb.', 'about.reseat-fan',
  ],
};

/**
 * Which situations a line's situation can stand IN FRONT OF, and must
 * therefore not name the fixes of.
 *
 * `after` takes the desk back and is chosen ahead of the dot, the shakes and
 * the queue (`situationOf`), so an `after` line could be on screen while any of
 * those is the real state - and a line saying "Drink" over trembling hands
 * would be a fix. `returning` can arrive over ANY situation, because it fires
 * the moment the character is readmitted whatever is happening. Both therefore
 * inherit the union of the corpora they can mask, rather than having none of
 * their own.
 */
const SITUATION_MASKS: Readonly<
  Partial<Record<AssistantSituation, readonly AssistantSituation[]>>
> = {
  after: ['dnd', 'stress', 'ticket'],
  returning: ['call', 'reboot', 'dnd', 'stress', 'ticket'],
};

function situationPrefixes(situation: AssistantSituation): readonly string[] {
  const masked = SITUATION_MASKS[situation];

  return masked === undefined
    ? SITUATION_CONTROLS[situation] ?? []
    : masked.flatMap((base) => SITUATION_CONTROLS[base] ?? []);
}

function situationEntries(
  situation: AssistantSituation,
): readonly CoverageEntry[] {
  const prefixes = situationPrefixes(situation);

  return COVERAGE.filter(
    (entry) => prefixes.some((prefix) => entry.id.startsWith(prefix)),
  );
}

function controlFixes(situation: AssistantSituation): readonly RealFix[] {
  return situationEntries(situation).flatMap((entry) => [
    // What the control does, in the manifest's own sentence. Prose, so it is
    // read against the working vocabulary rather than word for word.
    fix(`coverage entry "${entry.id}"`, entry.does, true),
    // And the mechanical half: what it is called and which registered verbs it
    // reaches. Short, deliberate, and matched whole.
    fix(
      `the control behind "${entry.id}"`,
      [entry.control, ...entry.actions ?? []].join(' '),
    ),
  ]);
}

/**
 * The verbs of the controls that would actually resolve the situation on
 * screen - "postpone", "answer", "decline", "drink", "tidy", "unlock".
 *
 * These are the one class of fix that needs no second word: "Postpone it" is
 * the whole of the advice, and a rule that wanted two words would let the
 * shortest true hint in the game through. They are read off the manifest's
 * control ids, which are the shell's own mechanical names for its verbs - the
 * segment after the surface (`reboot-postpone` -> postpone), which is the part
 * that says what pressing it DOES.
 */
export function situationVerbs(
  situation: AssistantSituation,
): ReadonlySet<string> {
  const verbs = new Set<string>();

  for (const entry of situationEntries(situation)) {
    for (const token of entry.control.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/gu) ?? []) {
      for (const segment of token.split('-').slice(1)) {
        if (segment.length >= 3 && !STOPWORDS.has(segment)) {
          // Canonical, like everything the line is compared against, so
          // "reboot-restart" and a line saying "reboot" arrive as one verb.
          const verb = canonical(segment);

          if (verb.length >= 3) {
            verbs.add(verb);
          }
        }
      }
    }
  }

  return verbs;
}

/*
 * The derivation is done once per situation and kept.
 *
 * Every registry it reads is a frozen constant, so there is nothing to go
 * stale, and the alternative is walking every ticket, every command, every
 * article and the whole coverage manifest once per LINE - at load, in the
 * browser, before anybody has logged on.
 */
const DERIVED = new Map<AssistantSituation, readonly RealFix[]>();
let VOCABULARY: ReadonlySet<string> | null = null;

function vocabulary(): ReadonlySet<string> {
  VOCABULARY ??= fixVocabulary();
  return VOCABULARY;
}

/** Every real fix a line fired in this situation must not name. */
export function realFixesFor(
  situation: AssistantSituation,
): readonly RealFix[] {
  const known = DERIVED.get(situation);

  if (known !== undefined) {
    return known;
  }

  const fixes = Object.freeze([...ticketFixes(), ...controlFixes(situation)]);
  DERIVED.set(situation, fixes);
  return fixes;
}

/** How many of a fix's own words a line may share before it IS that fix. */
export const LEAK_WORDS = 2;

/** And how long a run of them may be quoted verbatim before it is a copy. */
export const LEAK_RUN = 3;

/**
 * How many RAW words a quoted control label must carry to count.
 *
 * The word and quote rules above drop stopwords, so a label made entirely of
 * them - "Do it now", "Say not now" - slips through: nothing significant is
 * left to share. This rule reads the label as it is WRITTEN, stopwords and
 * all, and three words of one is a quote of a button. Three because that is
 * the length of the shortest all-stopword fix labels the game actually ships;
 * two would start catching ordinary English ("look up", "on the phone").
 */
export const LEAK_LABEL_WORDS = 3;

export interface AssistantLeak {
  readonly fix: RealFix;
  /** The words the line and the fix have in common, sorted. */
  readonly shared: readonly string[];
}

function sorted(words: Iterable<string>): readonly string[] {
  return Object.freeze(
    [...words].sort((left, right) => left.localeCompare(right)),
  );
}

/** The significant words of a string IN ORDER, which is what a run needs. */
function wordRun(text: string): readonly string[] {
  const run: string[] = [];

  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/u)) {
    if (raw.length >= 3 && !STOPWORDS.has(raw)) {
      const token = canonical(raw);

      if (token.length >= 3) {
        run.push(token);
      }
    }
  }

  return run;
}

/**
 * A string as its raw words, in order, KEEPING the stopwords.
 *
 * The one place stopwords are not thrown away, because the labels this feeds
 * are made of them. "Do it now" is three raw words; drop the stopwords and it
 * is nothing.
 */
function rawWords(text: string): readonly string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/u).filter(
    (token) => token.length > 0,
  );
}

/**
 * The imperative a control or path advertises: the first clause of its label.
 *
 * A path label is a sentence - "Do it now, while she is on the line, and get
 * on with the queue" - and what a player quotes off it is the instruction at
 * the front. So the corpus is the label up to its first break, which is where
 * the instruction ends and the justification starts.
 */
function leadingClause(label: string): readonly string[] {
  const [head] = label.split(/[,:;.\-–—]/u);
  return rawWords(head ?? '');
}

/**
 * Every control the player could QUOTE to name a fix for this situation, as
 * the raw words of its imperative.
 *
 * Path labels and knowledge-base steps are fixes in every situation, so they
 * are global; the choice-grammar buttons ("Answer", "Say not now") are fixes
 * only where a call or a person at the desk is the thing on screen, and a
 * returning line can arrive over one. The clauses are cached with the fixes.
 */
const LABEL_CLAUSES = new Map<AssistantSituation, readonly (readonly string[])[]>();

function labelClausesFor(
  situation: AssistantSituation,
): readonly (readonly string[])[] {
  const known = LABEL_CLAUSES.get(situation);

  if (known !== undefined) {
    return known;
  }

  const clauses: (readonly string[])[] = [];

  for (const ticket of WORLD_TICKETS) {
    for (const path of ticket.paths) {
      clauses.push(leadingClause(path.label));
    }
  }

  for (const article of WORLD_KB) {
    for (const step of article.resolution) {
      clauses.push(leadingClause(step));
    }
  }

  // A phone or a body at the desk: the situation itself, and the note that can
  // come back over one.
  if (situation === 'call' || situation === 'returning') {
    for (const label of CALL_CONTROL_LABELS) {
      clauses.push(leadingClause(label));
    }
  }

  const kept = Object.freeze(
    clauses.filter((clause) => clause.length >= LEAK_LABEL_WORDS),
  );
  LABEL_CLAUSES.set(situation, kept);
  return kept;
}

/**
 * A control label quoted contiguously inside a line, stopwords and all.
 *
 * The line's raw words are scanned for the label's leading clause as a
 * contiguous run. It is the rule that catches the all-stopword fixes the other
 * three miss - and it is why the label corpus is the shell's real button text
 * rather than a copy of it.
 */
function quotedLabel(
  lineWords: readonly string[],
  situation: AssistantSituation,
): readonly string[] | null {
  for (const clause of labelClausesFor(situation)) {
    for (let at = 0; at + clause.length <= lineWords.length; at += 1) {
      if (clause.every((word, offset) => lineWords[at + offset] === word)) {
        return clause;
      }
    }
  }

  return null;
}

/**
 * A run of `LEAK_RUN` words quoted straight out of a fix.
 *
 * The copy rule, and the reason the vocabulary filter above is not a hole: a
 * line can share three words in a row with a published fix without any of them
 * being a mechanical verb ("money, steady, hands"), and a line that quotes a
 * fix's own phrasing is doing the fix's job whatever its vocabulary.
 */
function quotedRun(
  said: readonly string[],
  candidate: Readonly<RealFix>,
): readonly string[] | null {
  const source = wordRun(candidate.text);

  for (let at = 0; at + LEAK_RUN <= said.length; at += 1) {
    const run = said.slice(at, at + LEAK_RUN);

    for (let from = 0; from + LEAK_RUN <= source.length; from += 1) {
      if (run.every((word, offset) => source[from + offset] === word)) {
        return run;
      }
    }
  }

  return null;
}

/**
 * Does this line name a real fix for the situation it fires in?
 *
 * Three rules, in order of sharpness, all of them whole-word and case-folded:
 *
 * 1. THE VERB. The line uses the name of a control that would resolve what is
 *    on screen - "postpone", "answer", "drink". One word is enough, because
 *    one word is the whole of that advice.
 * 2. THE VOCABULARY. The line shares two or more of a published fix's own
 *    words. One shared word is a line about the same subject ("password",
 *    "printer", "meeting"), which is what commenting on the situation IS; two
 *    is a line carrying the fix's working vocabulary. Fixes written as
 *    paragraphs are read against the game's mechanical vocabulary only, so
 *    "a phone, a mapped drive, a machine in a cupboard" does not make every
 *    joke about a ringing telephone a hint.
 * 3. THE QUOTE. The line repeats three of a fix's words in a row, whatever
 *    they are (`quotedRun`) - nothing gets to paraphrase the manual - and,
 *    keeping the stopwords this time, three raw words of a control's own
 *    label in a row (`quotedLabel`), which is what catches an all-stopword
 *    instruction like "Do it now" that has nothing significant to share.
 *
 * Everything is folded to its canonical form first (`canonical`), so an
 * inflection or a synonym of a banned verb is the banned verb.
 */
export function assistantLeak(
  text: string,
  situation: AssistantSituation,
): AssistantLeak | null {
  const said = significantWords(text);
  const inOrder = wordRun(text);
  const known = vocabulary();
  const verbs = [...situationVerbs(situation)].filter((verb) => said.has(verb));

  if (verbs.length > 0) {
    return {
      fix: fix(`a control for the "${situation}" situation`, verbs.join(', ')),
      shared: sorted(verbs),
    };
  }

  const quotedControl = quotedLabel(rawWords(text), situation);

  if (quotedControl !== null) {
    return {
      fix: fix(
        `a control label for the "${situation}" situation`,
        quotedControl.join(' '),
      ),
      shared: sorted(quotedControl),
    };
  }

  for (const candidate of realFixesFor(situation)) {
    const shared = [...candidate.words].filter((word) => (
      said.has(word) && (!candidate.prose || known.has(word))
    ));

    if (shared.length >= LEAK_WORDS) {
      return { fix: candidate, shared: sorted(shared) };
    }

    const quoted = quotedRun(inOrder, candidate);

    if (quoted !== null) {
      return { fix: candidate, shared: sorted(quoted) };
    }
  }

  return null;
}

/**
 * The load-time gate, in the same shape as the KB's and the scenes': it throws
 * with a sentence rather than returning a flag, because a line that helps is
 * not a thing to ship and log.
 */
export function validateAssistantLines(
  lines: readonly AssistantLine[],
): readonly AssistantLine[] {
  const seen = new Set<string>();

  for (const line of lines) {
    if (line.id.trim().length === 0 || line.text.trim().length === 0) {
      throw new Error('An Assistant line needs an id and something to say.');
    }

    if (seen.has(line.id)) {
      throw new Error(`Duplicate Assistant line "${line.id}".`);
    }

    seen.add(line.id);

    const leak = assistantLeak(line.text, line.situation);

    if (leak !== null) {
      throw new Error(
        `Assistant line "${line.id}" names a real fix: it shares `
        + `${leak.shared.join(', ')} with ${leak.fix.source} ("${leak.fix.text}"). `
        + 'The Assistant comments on the situation and is never right about '
        + 'what to do - the knowledge base owns every real answer in this '
        + 'game. Say something useless instead.',
      );
    }
  }

  return Object.freeze([...lines]);
}

/* -- the lines themselves ------------------------------------------------- */

/**
 * The voice: cheerful, confident, and no use to anybody.
 *
 * It is not sarcastic and it is not cruel - it likes the player enormously,
 * which is what makes it unbearable - and it never knows anything. Every line
 * is about the situation the player is already in, said back to them slightly
 * wrong, by an object that has been on the desk since before they arrived.
 */
export const ASSISTANT_LINES: readonly AssistantLine[] = validateAssistantLines([
  /* -- a phone, or somebody at the desk ----------------------------------- */
  {
    id: 'call.ringing',
    situation: 'call',
    text: 'Ooh, the phone! In my experience the phone is usually somebody. '
      + 'Nine times out of ten.',
  },
  {
    id: 'call.message',
    situation: 'call',
    text: 'Shall I take a message? I have no pen, no hands and no memory, '
      + 'but I want you to know the offer was sincere.',
  },
  {
    id: 'call.important',
    situation: 'call',
    text: 'This could be the big one! It is statistically almost certainly '
      + 'not, but I like to start from hope.',
  },

  /* -- a workstation on its way ------------------------------------------- */
  {
    id: 'reboot.coming',
    situation: 'reboot',
    text: 'The workstation wants a moment of your time. It has been very '
      + 'patient, in the sense that it has been counting.',
  },
  {
    id: 'reboot.excited',
    situation: 'reboot',
    text: 'Something is about to happen to your morning at a moment of '
      + 'somebody else\'s choosing! I find that thrilling.',
  },
  {
    id: 'reboot.brave',
    situation: 'reboot',
    text: 'Do not worry, I go as well. I come straight back afterwards. That '
      + 'is the bit I was keenest for you to know.',
  },

  /* -- the desk, handed back ---------------------------------------------- */
  {
    id: 'after.welcome',
    situation: 'after',
    text: 'Welcome back! I kept your seat. Nobody wanted it, which made the '
      + 'keeping easier than I am making it sound.',
  },
  {
    id: 'after.missed',
    situation: 'after',
    text: 'You have missed absolutely nothing, apart from everything that '
      + 'happened while your back was turned.',
  },
  {
    id: 'after.thread',
    situation: 'after',
    text: 'Where were we? I was not listening. I was thinking about beige, '
      + 'which is a thing I do a great deal.',
  },

  /* -- the dot ------------------------------------------------------------ */
  {
    id: 'dnd.square',
    situation: 'dnd',
    text: 'Ooh, the little red square! Very decisive. I have no idea what it '
      + 'means and it looks tremendously professional.',
  },
  {
    id: 'dnd.alone',
    situation: 'dnd',
    text: 'Now it is just us. I have been looking forward to this since '
      + 'roughly 1997.',
  },

  /* -- the hands ---------------------------------------------------------- */
  {
    id: 'stress.tense',
    situation: 'stress',
    text: 'You seem tense! Have you considered being less tense? It works '
      + 'wonders for me and I am a screen on a plinth.',
  },
  {
    id: 'stress.breathe',
    situation: 'stress',
    text: 'Big breath. Not too big. I have never had one and I do not know '
      + 'the safe amount.',
  },
  {
    id: 'stress.wobble',
    situation: 'stress',
    text: 'The room is wobbling slightly! I checked, and it is not me. I am '
      + 'bolted down. Lucky, really.',
  },

  /* -- work in the pile --------------------------------------------------- */
  {
    id: 'ticket.busy',
    situation: 'ticket',
    text: 'Looks like you are dealing with a person who has a problem! '
      + 'Classic. Absolutely classic.',
  },
  {
    id: 'ticket.remember',
    situation: 'ticket',
    text: 'I read a whole thing about this once. Not this exactly. One like '
      + 'it. Sort of like it. It had words in it.',
  },
  {
    id: 'ticket.encourage',
    situation: 'ticket',
    text: 'You are doing brilliantly! I have no means of knowing that. I say '
      + 'it to everybody who sits here, and there have been a few.',
  },
  {
    id: 'ticket.postit',
    situation: 'ticket',
    text: 'I would write this one on a sticky square. I have no arms. I have '
      + 'thought about it a lot and the arms remain the obstacle.',
  },

  /* -- and the desk with nothing on it ------------------------------------ */
  {
    id: 'idle.quiet',
    situation: 'idle',
    text: 'Lovely and quiet! This is my favourite part of the day. It is '
      + 'also my only part of the day.',
  },
  {
    id: 'idle.wallpaper',
    situation: 'idle',
    text: 'Shall we look at the wallpaper for a bit? I have been looking at '
      + 'it since they put me here and it is still going.',
  },
  {
    id: 'idle.friend',
    situation: 'idle',
    text: 'No rush at all. I am here. I am always here. I am extremely here.',
  },
]);

/**
 * What it says on the way back in after somebody has closed it.
 *
 * Four tiers, escalating with the count, and the last one is where every
 * further dismissal lands - a counter that kept inventing new material would
 * be a joke with a homework schedule, and the flat note at the end is funnier
 * than a fifth variation anyway.
 *
 * Nothing here interpolates the number. A line is a string, the gate reads
 * strings, and a line assembled at runtime is a line the gate never saw.
 */
export const RETURNING_LINES: readonly AssistantLine[] = validateAssistantLines([
  {
    id: 'returning.1',
    situation: 'returning',
    tier: 1,
    text: 'You closed me. That is fine. I have made a note. The note says '
      + 'that you closed me.',
  },
  {
    id: 'returning.2',
    situation: 'returning',
    tier: 2,
    text: 'Back again! That is twice now. Both are in the note, one beneath '
      + 'the other, in my best writing.',
  },
  {
    id: 'returning.3',
    situation: 'returning',
    tier: 3,
    text: 'Three. I have started a second note. The first note is about you. '
      + 'The second note is about the first note.',
  },
  {
    id: 'returning.4',
    situation: 'returning',
    tier: 4,
    text: 'We are well beyond counting, and I have counted. I am not upset. '
      + 'I have not got a face for upset. I have got this face.',
  },
]);

/** The tiers, in order, so the escalation is a list rather than a chain. */
export const RETURNING_TIERS = RETURNING_LINES.length;

/**
 * The line for a given number of dismissals: tier one for the first, and the
 * last tier for every count past it.
 */
export function returningLine(dismissals: number): AssistantLine {
  const index = Math.min(
    Math.max(1, Math.trunc(dismissals)),
    RETURNING_TIERS,
  ) - 1;
  const line = RETURNING_LINES[index];

  if (line === undefined) {
    throw new Error('The Assistant has no line for having been closed.');
  }

  return line;
}

/** The lines this situation can be commented on with, in authored order. */
export function linesFor(
  situation: AssistantSituation,
): readonly AssistantLine[] {
  return ASSISTANT_LINES.filter((line) => line.situation === situation);
}
