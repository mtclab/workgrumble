import { accountFacts, retentionNote } from './account';
import type { Account, ApiResult } from './api';
import type { ShellHire, ShellUser } from './context';
import { createIcon } from './icons';
import { setAvailability } from './apps/ui';
import { RETENTION_DAYS } from '../shared/retention';

export interface LoginScreenHandlers {
  logOn(): void;
  restart(): void;
  /**
   * Proves a badge number with the building. Answers rather than throwing.
   *
   * It is a handler rather than a call into the network from here because this
   * screen is a screen: it collects a badge, shows what it was told, and knows
   * nothing about how the telling happened.
   */
  signIn(badge: string): Promise<ApiResult<Account>>;
  /** Issues a new badge number to this browser. */
  issueBadge(): Promise<ApiResult<Account>>;
  /** The account this browser is already carrying, once anything knows. */
  knownAccount(): Account | null;
  /**
   * The desk this career is being started at, or null when nothing is being
   * started (E9, 0.35.0). Read once, when the screen is built: whether this
   * boot is a hire is decided before the world is, and cannot change while
   * somebody is looking at the log-on box.
   */
  hire(): ShellHire | null;
}

export interface LoginScreen {
  readonly element: HTMLElement;
  /** Called every time the screen becomes visible. */
  reset(): void;
  /**
   * Called when the building has said who this browser is.
   *
   * It is separate from `reset` because it arrives at a moment nobody chose:
   * the badge is asked about after the shell is already on screen, so the
   * answer can land while somebody is typing their password, and a redraw that
   * cleared the field and stole the focus would be the network interrupting a
   * log-on. This one touches only what the answer is about.
   */
  identityChanged(): void;
}

const ISSUED_NOTE = 'Write it down. IT cannot look it up, which is the point: '
  + 'nobody here knows your name, and the badge is the only thing that knows '
  + 'which week is yours. Lose it and you lose the week. Use it, too: a badge '
  + `nobody logs on with for ${String(RETENTION_DAYS)} days gets cleared out `
  + 'with the rest of the dormant accounts, and the week goes with it.';

/**
 * The log-on screen, which used to be a joke and is now a joke with a door
 * behind it.
 *
 * The PASSWORD FIELD STAYS, and stays useless. It is the oldest gag in this
 * product - any password, hint on a sticky note under the keyboard, nobody has
 * checked since 1998 - and replacing it with a real credential would be
 * throwing away the joke to gain a login nobody wants. The real credential is
 * the badge number, which is exactly how the building would do it.
 *
 * The badge is OPTIONAL. Leaving it blank logs on and plays the week in this
 * browser, which is what the game has always done and what it does when there
 * is no Worker on the other end at all. Typing one proves it first, because a
 * badge that turns out to be wrong should say so here rather than three days
 * into a week that was never going to sync.
 *
 * And a badge that cannot be checked because there is nothing to check it
 * against does NOT stop anybody: offline-first means the door is the cloud's
 * door, not the game's.
 *
 * This is also the BADGE SCREEN, which is why the record card lives here: once
 * a browser is carrying a badge, this is the one place that says when it was
 * issued, when it was last used and the date it gets cleared out if nobody
 * comes back. It is reachable at any time - Log off from the start menu comes
 * straight back here - so the answer to "how long have I got" is never more
 * than two clicks away.
 */
export function createLoginScreen(
  user: Readonly<ShellUser>,
  handlers: Readonly<LoginScreenHandlers>,
  signal: AbortSignal,
): LoginScreen {
  const element = document.createElement('div');
  element.className = 'screen screen-login wallpaper';
  element.dataset.testid = 'login-screen';

  const dialog = document.createElement('section');
  dialog.className = 'login-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', 'Log on to DeskPro WorkGroup');

  const head = document.createElement('div');
  head.className = 'login-head';
  const headIcon = createIcon('icon-lock');
  headIcon.classList.add('svg-icon-lg');
  const headCopy = document.createElement('div');
  const heading = document.createElement('h1');
  heading.textContent = 'DeskPro WorkGroup';
  const subheading = document.createElement('p');
  subheading.textContent = 'Type your password to enter the working day.';
  headCopy.append(heading, subheading);
  head.append(headIcon, headCopy);

  const form = document.createElement('form');
  form.className = 'login-form';
  form.noValidate = true;

  const userField = document.createElement('div');
  userField.className = 'field';
  const userLabel = document.createElement('span');
  userLabel.textContent = 'User name';
  const userValue = document.createElement('div');
  userValue.className = 'field-static';
  userValue.dataset.testid = 'login-user';
  userValue.append(createIcon('icon-user'));
  const userText = document.createElement('span');
  userText.textContent = `${user.displayName} (${user.account})`;
  userValue.append(userText);
  userField.append(userLabel, userValue);

  const badgeField = document.createElement('label');
  badgeField.className = 'field';
  const badgeLabel = document.createElement('span');
  badgeLabel.textContent = 'Badge number';
  const badge = document.createElement('input');
  badge.type = 'text';
  badge.name = 'badge';
  badge.autocomplete = 'off';
  badge.spellcheck = false;
  badge.maxLength = 16;
  badge.placeholder = 'WG-0000-AA';
  badge.dataset.testid = 'login-badge';
  badgeField.append(badgeLabel, badge);

  const badgeNote = document.createElement('p');
  badgeNote.className = 'login-hint';
  badgeNote.dataset.testid = 'login-badge-note';
  badgeNote.textContent = 'Optional. The week plays in this browser without '
    + 'one; a badge is what carries it to another machine.';

  const issue = document.createElement('button');
  issue.type = 'button';
  issue.className = 'os-button os-button-compact';
  issue.dataset.testid = 'login-issue-badge';
  issue.textContent = 'Issue me a badge';

  const issued = document.createElement('p');
  issued.className = 'login-issued';
  issued.dataset.testid = 'login-badge-issued';
  issued.hidden = true;

  const refusal = document.createElement('p');
  refusal.className = 'app-refusal';
  refusal.dataset.testid = 'login-badge-refusal';
  refusal.hidden = true;

  // The record IT holds on this badge, which is four lines long and is the
  // whole of what the building knows about anybody. It is only on screen when
  // there is a badge to hold a record on.
  const record = document.createElement('div');
  record.className = 'login-hint';
  record.dataset.testid = 'login-badge-account';
  record.hidden = true;
  const facts = document.createElement('dl');
  facts.className = 'login-account';
  const retention = document.createElement('p');
  retention.className = 'login-account-note';
  retention.textContent = retentionNote();
  record.append(facts, retention);

  /**
   * THE DESK, which is the difficulty select in the only clothes this game
   * would ever put it in (E9, 0.35.0, D1).
   *
   * It is on the log-on screen and not on a menu because this is the moment the
   * fiction already has for it: the agency has placed you, and the first thing
   * you do is log on to the machine they sat you at. The label says the job
   * rather than "difficulty", the options are titles rather than words like
   * Normal and Hard, and the line underneath is what the rung actually changes
   * about the work - which is the honest description of what picking it does.
   *
   * THE UNBUILT RUNGS ARE SHOWN, GREYED, and that is a decision rather than an
   * accident of markup. The whole design is that the ladder IS the difficulty
   * scale, and a select holding the two rungs with content would teach a player
   * that this game has two difficulties instead of a career with two of its
   * seven rungs playable. Greyed with the reason on them says the true thing:
   * here is the ladder, here is where you can get on it today. The refusal is
   * enforced in `main.ts` as well, because a disabled option is a courtesy and
   * not a rule.
   *
   * Absent entirely when this browser is not starting a career - a saved week,
   * an arrival at a new employer, a retry after a firing - because none of
   * those is a hire and offering a job to somebody mid-week would be a screen
   * lying about what the button does.
   */
  const hire = handlers.hire();
  const deskField = document.createElement('label');
  deskField.className = 'field';
  deskField.dataset.testid = 'login-desk-field';
  const desk = document.createElement('select');
  desk.name = 'desk';
  desk.dataset.testid = 'login-desk';
  const deskNote = document.createElement('p');
  deskNote.className = 'login-hint';
  deskNote.dataset.testid = 'login-desk-note';

  if (hire !== null) {
    const deskLabel = document.createElement('span');
    deskLabel.textContent = 'The desk you were hired onto';
    deskField.append(deskLabel, desk);

    for (const rung of hire.rungs) {
      const option = document.createElement('option');
      option.value = rung.id;
      option.textContent = rung.takeable && rung.employer !== null
        ? `${rung.label} - ${rung.employer}`
        : `${rung.label} - not written yet`;
      option.disabled = !rung.takeable;
      option.selected = rung.id === hire.standard;
      desk.append(option);
    }
  }

  const sayDesk = (): void => {
    const picked = hire?.rungs.find((rung) => rung.id === desk.value);

    deskNote.textContent = picked === undefined
      ? ''
      : picked.takeable
        ? picked.shapeBreak
        : `${picked.shapeBreak} Nobody has written this rung yet - the ladder `
          + 'is the difficulty, and this is where it runs out.';
  };

  const passwordField = document.createElement('label');
  passwordField.className = 'field';
  const passwordLabel = document.createElement('span');
  passwordLabel.textContent = 'Password';
  const password = document.createElement('input');
  password.type = 'password';
  password.name = 'password';
  password.autocomplete = 'off';
  password.dataset.testid = 'login-password';
  passwordField.append(passwordLabel, password);

  const hint = document.createElement('p');
  hint.className = 'login-hint';
  hint.dataset.testid = 'login-hint';
  hint.textContent = user.passwordHint;

  const actions = document.createElement('div');
  actions.className = 'login-actions';
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.className = 'os-button';
  restart.dataset.testid = 'login-restart';
  restart.textContent = 'Restart';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'os-button os-button-primary';
  submit.dataset.testid = 'login-submit';
  submit.textContent = 'Log on';
  actions.append(restart, submit);

  form.append(
    userField,
    ...(hire === null ? [] : [deskField, deskNote]),
    badgeField,
    badgeNote,
    issue,
    issued,
    record,
    refusal,
    passwordField,
    hint,
    actions,
  );
  dialog.append(head, form);
  element.append(dialog);

  const say = (problem: string | null): void => {
    refusal.hidden = problem === null;
    refusal.textContent = problem ?? '';
  };

  /**
   * The record card, redrawn from whatever the building last said.
   *
   * It is rebuilt rather than patched because it is four rows of text and the
   * dates change the moment somebody logs on - a card showing a "last seen"
   * from before this log-on would be the screen quietly disagreeing with the
   * thing it is a record of.
   */
  const showAccount = (known: Account | null): void => {
    record.hidden = known === null;

    if (known === null) {
      facts.replaceChildren();
      return;
    }

    facts.replaceChildren(...accountFacts(known).flatMap((fact) => {
      const term = document.createElement('dt');
      term.textContent = fact.term;
      const value = document.createElement('dd');
      value.textContent = fact.value;
      return [term, value];
    }));
  };

  const syncIssueButton = (known: Account | null): void => {
    setAvailability(
      issue,
      known === null
        ? null
        : `This browser is already carrying badge ${known.badge}. A second `
          + 'badge would be a second week, and the first one would be '
          + 'nobody\'s.',
    );
  };

  /** Everything on this screen that depends on which badge this browser has. */
  const showBadge = (known: Account | null): void => {
    // The badge the browser already proved is filled in rather than asked for
    // again: it is HttpOnly, so this is the only way the player ever sees the
    // number they were given. Anything already typed is left alone.
    if (known !== null && badge.value.trim().length === 0) {
      badge.value = known.badge;
    }

    syncIssueButton(known);
    showAccount(known);
  };

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const typed = badge.value.trim();

    // The desk first, because taking a different job rebuilds the world: the
    // pick is written down and the machine starts again, arriving at the new
    // shop's own first boot. The standard desk is the world this browser has
    // ALREADY booted, so it costs nothing and changes nothing - which is why
    // every existing session, and every player who does not touch this, is on
    // exactly the path they were on before the select existed.
    if (hire !== null && desk.value !== hire.standard) {
      const taken = hire.choose(desk.value);

      if (!taken.ok) {
        say(taken.reason);
        return;
      }

      // Nothing after this runs: `choose` starts the page again.
      return;
    }

    // The path every existing session takes: no badge, no network, straight
    // in. It is also the path a browser with nothing on the other end takes.
    if (typed.length === 0 || typed === handlers.knownAccount()?.badge) {
      handlers.logOn();
      return;
    }

    setAvailability(submit, 'Checking the badge number.');
    say(null);

    void handlers.signIn(typed).then((answer) => {
      setAvailability(submit, null);

      // Offline is not a refused badge: nothing said no, there was nothing to
      // ask. The week plays here regardless, so it plays here.
      if (answer.ok || answer.offline) {
        handlers.logOn();
        return;
      }

      say(answer.reason);
      badge.focus();
    });
  };

  const onIssue = (): void => {
    setAvailability(issue, 'Asking for a badge number.');
    say(null);

    void handlers.issueBadge().then((answer) => {
      if (!answer.ok) {
        setAvailability(issue, null);
        say(answer.reason);
        return;
      }

      badge.value = answer.value.badge;
      issued.hidden = false;
      issued.textContent = `Badge ${answer.value.badge}. ${ISSUED_NOTE}`;
      showBadge(answer.value);
    });
  };

  form.addEventListener('submit', onSubmit, { signal });
  desk.addEventListener('change', sayDesk, { signal });
  issue.addEventListener('click', onIssue, { signal });
  restart.addEventListener(
    'click',
    () => {
      handlers.restart();
    },
    { signal },
  );

  return {
    element,
    reset: (): void => {
      showBadge(handlers.knownAccount());
      sayDesk();
      say(null);
      password.value = '';
      password.focus();
    },
    identityChanged: (): void => {
      showBadge(handlers.knownAccount());
    },
  };
}
