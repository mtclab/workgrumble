import { BOSS_KEY_LABEL } from '../keys';
import { createIcon } from '../icons';
import type { AppDef, AppInstance, GameApi } from './types';

/**
 * The web store's other real toy: a media player, off the shareware register.
 *
 * The second installable, and a real slack app the same way Office Arcade is -
 * `slack: true`, the installed-toy slack rate (`SLACK_RATES.mediaplayer`), a
 * caught scene of its own, and an install on the audit the drip and the lead's
 * beat read. Two toys rather than one so the catalogue that ships is not one
 * row long, and so the store's Install/Uninstall flow is exercised against more
 * than a single id.
 *
 * The register is The Website Is Down: there is no music file in here, because
 * there is no internet and there never was - what plays is a visualiser that is
 * extremely confident about a song nobody can hear. There is one control, it
 * starts and stops the bouncing, and it plays nothing at all.
 */

const NOW_PLAYING = [
  'Now playing: SILENCE.WAV (0:00 / 0:00)',
  'Now playing: a song you cannot hear, at a volume nobody set',
  'Now playing: the sound of a media player that should not be installed',
] as const;

export const MEDIA_APP: AppDef = {
  id: 'mediaplayer',
  title: 'Media Player',
  icon: 'icon-media',
  tier_required: 1,
  slack: true,
  desktop: true,
  mount: (host, api: GameApi): AppInstance => {
    let playing = false;
    let track = 0;

    const root = document.createElement('section');
    root.className = 'media-app';
    root.dataset.testid = 'media-app';

    const title = document.createElement('h1');
    title.className = 'media-title';
    title.textContent = 'Media Player';

    const tip = document.createElement('p');
    tip.className = 'media-tip';
    tip.textContent = `A player you installed yourself, off the web store. `
      + `Panic key: ${BOSS_KEY_LABEL}`;

    const visualiser = document.createElement('div');
    visualiser.className = 'media-visualiser';
    visualiser.dataset.testid = 'media-visualiser';
    for (let bar = 0; bar < 5; bar += 1) {
      const strip = document.createElement('span');
      strip.className = 'media-bar';
      strip.style.setProperty('--media-bar', String(bar));
      visualiser.append(strip);
    }

    const nowPlaying = document.createElement('p');
    nowPlaying.className = 'media-body';
    nowPlaying.dataset.testid = 'media-body';

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'os-button os-button-primary';
    play.dataset.testid = 'media-play';
    play.append(createIcon('icon-media'));
    const playLabel = document.createElement('span');
    play.append(playLabel);

    const render = (): void => {
      root.dataset.playing = String(playing);
      playLabel.textContent = playing ? 'Pause' : 'Play';
      nowPlaying.textContent = playing
        ? NOW_PLAYING[track % NOW_PLAYING.length] ?? NOW_PLAYING[0]
        : 'Paused. It was not playing anything, but it has stopped not playing '
          + 'it, which the bars seem to feel strongly about.';
    };

    const onPlay = (): void => {
      playing = !playing;

      if (playing) {
        track += 1;
        api.notify(
          'Media Player',
          'The media player is now playing nothing, loudly and confidently. '
            + 'It is also on the install audit, which is the one thing in this '
            + 'window that is real.',
        );
      }

      render();
    };

    play.addEventListener('click', onPlay);

    root.append(title, tip, visualiser, nowPlaying, play);
    host.replaceChildren(root);
    render();

    return {
      unmount: (): void => {
        play.removeEventListener('click', onPlay);
        root.remove();
      },
    };
  },
};
