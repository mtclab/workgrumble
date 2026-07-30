import { ABOUT_APP } from './about';
import { BUBBLES_APP } from './bubbles';
import { loadManifest } from './manifest';

export const APP_MANIFEST = loadManifest([
  ABOUT_APP,
  BUBBLES_APP,
]);
