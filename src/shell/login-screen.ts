import type { ApiResult } from './api';
import type { ShellUser } from './context';
import { createIcon } from './icons';
import { setAvailability } from './apps/ui';

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
  signIn(badge: string): Promise<ApiResult<string>>;
  /** Issues a new badge number to this browser. */
  issueBadge(): Promise<ApiResult<string>>;
  /** The badge this browser is already carrying, once anything knows. */
  knownBadge(): string | null;
}

export interface LoginScreen {
  readonly element: HTMLElement;
  /** Called every time the screen becomes visible. */
  reset(): void;
}

const ISSUED_NOTE = 'Write it down. IT cannot look it up, which is the point: '
  + 'nobody here knows your name, and the badge is the only thing that knows '
  + 'which week is yours. Lose it and you lose the week.';

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
    badgeField,
    badgeNote,
    issue,
    issued,
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

  const syncIssueButton = (): void => {
    const known = handlers.knownBadge();

    setAvailability(
      issue,
      known === null
        ? null
        : `This browser is already carrying badge ${known}. A second badge `
          + 'would be a second week, and the first one would be nobody\'s.',
    );
  };

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const typed = badge.value.trim();

    // The path every existing session takes: no badge, no network, straight
    // in. It is also the path a browser with nothing on the other end takes.
    if (typed.length === 0 || typed === handlers.knownBadge()) {
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

      badge.value = answer.value;
      issued.hidden = false;
      issued.textContent = `Badge ${answer.value}. ${ISSUED_NOTE}`;
      syncIssueButton();
    });
  };

  form.addEventListener('submit', onSubmit, { signal });
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
      const known = handlers.knownBadge();

      // The badge the browser already proved is filled in rather than asked
      // for again: it is HttpOnly, so this is the only way the player ever
      // sees the number they were given.
      if (known !== null && badge.value.trim().length === 0) {
        badge.value = known;
      }

      syncIssueButton();
      say(null);
      password.value = '';
      password.focus();
    },
  };
}
