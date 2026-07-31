import { assertCaughtScenes } from '../../world/scenes';
import { ABOUT_APP } from './about';
import { BEER_APP } from './beer';
import { BRIEF_APP } from './brief';
import { BROWSER_APP } from './browser';
import { BUBBLES_APP } from './bubbles';
import { CAUGHT_APP } from './caught';
import { CHAT_APP } from './chat';
import { CMD_APP } from './cmd';
import { DIRECTORY_APP } from './directory';
import { EVENTS_APP } from './events';
import { KB_APP } from './kb';
import { MAIL_APP } from './mail';
import { loadManifest } from './manifest';
import { REMOTE_APP } from './remote';
import { REVIEW_APP } from './review';
import { SCORECARD_APP } from './scorecard';
import { TICKETS_APP } from './tickets';
import { WEEKEND_APP } from './weekend';

/**
 * The installed app roster, in taskbar and start-menu order: the day's own
 * screens first, then the queue, then the tools it sends you to, then the
 * reading, then the toys. Installing an app is a manifest entry and nothing
 * else - which is the seam a later tier (or an in-fiction "web store") uses
 * without touching the shell.
 *
 * The scene check is part of installing one: an app with `slack: true` is an
 * app somebody can be caught at, and shipping it without the content for what
 * happens then is a blank window with a manager in it. It fails the boot here
 * rather than failing a player later.
 */
export const APP_MANIFEST = assertCaughtScenes(loadManifest([
  BRIEF_APP,
  SCORECARD_APP,
  WEEKEND_APP,
  CAUGHT_APP,
  REVIEW_APP,
  BEER_APP,
  TICKETS_APP,
  DIRECTORY_APP,
  REMOTE_APP,
  EVENTS_APP,
  CHAT_APP,
  MAIL_APP,
  CMD_APP,
  KB_APP,
  ABOUT_APP,
  BUBBLES_APP,
  BROWSER_APP,
]));
