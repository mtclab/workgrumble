import { ABOUT_APP } from './about';
import { BRIEF_APP } from './brief';
import { BUBBLES_APP } from './bubbles';
import { CHAT_APP } from './chat';
import { CMD_APP } from './cmd';
import { DIRECTORY_APP } from './directory';
import { KB_APP } from './kb';
import { MAIL_APP } from './mail';
import { loadManifest } from './manifest';
import { REMOTE_APP } from './remote';
import { SCORECARD_APP } from './scorecard';
import { TICKETS_APP } from './tickets';

/**
 * The installed app roster, in taskbar and start-menu order: the day's own
 * screens first, then the queue, then the tools it sends you to, then the
 * reading, then the toys. Installing an app is a manifest entry and nothing
 * else - which is the seam a later tier (or an in-fiction "web store") uses
 * without touching the shell.
 */
export const APP_MANIFEST = loadManifest([
  BRIEF_APP,
  SCORECARD_APP,
  TICKETS_APP,
  DIRECTORY_APP,
  REMOTE_APP,
  CHAT_APP,
  MAIL_APP,
  CMD_APP,
  KB_APP,
  ABOUT_APP,
  BUBBLES_APP,
]);
