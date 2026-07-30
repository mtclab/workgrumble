import type { ShellUser } from './context';
import { createIcon } from './icons';

export interface LoginScreenHandlers {
  logOn(): void;
  restart(): void;
}

export interface LoginScreen {
  readonly element: HTMLElement;
  /** Called every time the screen becomes visible. */
  reset(): void;
}

/**
 * Single fixture user, any password. The password field exists purely so the
 * comedy hint has somewhere to point.
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

  form.append(userField, passwordField, hint, actions);
  dialog.append(head, form);
  element.append(dialog);

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      handlers.logOn();
    },
    { signal },
  );
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
      password.value = '';
      password.focus();
    },
  };
}
