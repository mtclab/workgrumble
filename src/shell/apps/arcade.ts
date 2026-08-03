import type { AppDef, AppInstance } from './types';

/**
 * The web store's fixture: one installable toy, so the machinery has something
 * real to install.
 *
 * It is deliberately minimal and deliberately SHIPPED rather than a test-only
 * object: the app-state parse refuses an installed id that is not in the real
 * catalogue, so a save that round-trips an install has to name a real
 * installable, and the resolved manifest that mounts it has to find a real
 * definition. This is that definition, and nothing more - lane B is where the
 * web store that installs it lives, where a toy becomes a slack app with a
 * caught scene and the relief that beats the Browser, and where the shareware
 * catalogue lists the media player and the "coming soon" greyed rows. Until
 * then it is `slack: false`: the audit-risk DRIP is what makes it interesting
 * to a locked-down shop, and the relief is content that has not shipped.
 *
 * The register is The Website Is Down: it does one thing badly and is very
 * pleased with itself about it.
 */
export const ARCADE_APP: AppDef = {
  id: 'arcade',
  title: 'Office Arcade',
  icon: 'icon-arcade',
  tier_required: 1,
  slack: false,
  desktop: true,
  mount: (host): AppInstance => {
    const root = document.createElement('section');
    root.className = 'arcade-app';
    root.dataset.testid = 'arcade-app';

    const title = document.createElement('h1');
    title.className = 'arcade-title';
    title.textContent = 'Office Arcade';

    const body = document.createElement('p');
    body.className = 'arcade-body';
    body.dataset.testid = 'arcade-body';
    body.textContent = 'You installed it. It installed. That is the whole of '
      + 'what it promised, and it has kept that promise. The rest is coming in '
      + 'a later update, which is a sentence this building has heard before.';

    root.append(title, body);
    host.append(root);

    return {
      unmount: (): void => {
        root.remove();
      },
    };
  },
};
