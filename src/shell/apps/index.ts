import { ABOUT_APP } from './about';
import { BUBBLES_APP } from './bubbles';
import { CMD_APP } from './cmd';
import { DIRECTORY_APP } from './directory';
import { loadManifest } from './manifest';
import { TICKETS_APP } from './tickets';

/**
 * The installed app roster, in taskbar and start-menu order: work first, toys
 * last. Lane B's Chat, Mail, Remote Assist and KB slot in here as manifest
 * entries - nothing else has to change to install an app.
 */
export const APP_MANIFEST = loadManifest([
  TICKETS_APP,
  DIRECTORY_APP,
  CMD_APP,
  ABOUT_APP,
  BUBBLES_APP,
]);
