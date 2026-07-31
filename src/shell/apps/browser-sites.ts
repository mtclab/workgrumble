/**
 * The two sites, as content.
 *
 * Everything here is in-repo: text, and line art drawn out of the same icon
 * set the rest of the OS uses. Nothing is fetched, nothing is embedded from
 * anywhere, and there is no address bar you can type into - this is a browser
 * in the way the office kettle is a kitchen.
 *
 * They are written as the two shapes slacking actually takes: a thread you
 * read one more post of, and a page of pictures you scroll for no reason.
 */

export interface ForumPost {
  readonly author: string;
  readonly when: string;
  readonly body: readonly string[];
  /** The line under the avatar nobody asked for. */
  readonly signature?: string;
}

export interface ForumSite {
  readonly kind: 'forum';
  readonly heading: string;
  readonly board: string;
  readonly posts: readonly ForumPost[];
  readonly footer: string;
}

export interface GalleryPicture {
  /** An icon id from the shell's own sprite. There are no image files. */
  readonly icon: string;
  readonly caption: string;
  readonly alt: string;
}

export interface GallerySite {
  readonly kind: 'gallery';
  readonly heading: string;
  readonly tagline: string;
  readonly pictures: readonly GalleryPicture[];
  readonly hits: number;
  readonly footer: string;
}

export interface BrowserSite {
  readonly id: string;
  readonly title: string;
  /** What the address bar reads. It is not typeable and it goes nowhere. */
  readonly url: string;
  readonly page: ForumSite | GallerySite;
}

const LAWNMOWER: BrowserSite = {
  id: 'forum',
  title: 'The Shed',
  url: 'http://theshed.invalid/threads/mower-wont',
  page: {
    kind: 'forum',
    heading: 'MOWER WONT (solved) (not solved) (solved)',
    board: 'General Discussion > Outdoor Machinery > Mowers, Petrol',
    posts: [
      {
        author: 'BEIGE_ENJOYER',
        when: 'Mon 08:51',
        body: [
          'Mower wont. Was fine last year. Has been in the shed since. Any '
          + 'ideas appreciated, I am not technical.',
        ],
        signature: 'Sent from the shed',
      },
      {
        author: 'ModeratorGraham',
        when: 'Mon 09:04',
        body: [
          'Moved from General Discussion. This is the fourth mower thread this '
          + 'week. Please use the search.',
        ],
        signature: 'I do this for free, which is the problem',
      },
      {
        author: 'TWO_STROKE_TERRY',
        when: 'Mon 09:20',
        body: [
          'Old fuel. Always old fuel. Drain it, fresh petrol, new plug, you '
          + 'will be cutting grass inside the hour.',
          'Do NOT let it run dry over winter. I have said this in every '
          + 'thread since 2003 and I will keep saying it.',
        ],
      },
      {
        author: 'BEIGE_ENJOYER',
        when: 'Mon 11:47',
        body: [
          'Drained it. Fresh petrol. New plug. Still wont.',
        ],
      },
      {
        author: 'Pauline_H',
        when: 'Mon 12:02',
        body: [
          'Is it switched on? I only ask because of what happened with my '
          + 'strimmer and I have not been allowed to forget it.',
        ],
      },
      {
        author: 'TWO_STROKE_TERRY',
        when: 'Mon 12:09',
        body: [
          'It will be the fuel.',
        ],
      },
      {
        author: 'BEIGE_ENJOYER',
        when: 'Tue 07:30',
        body: [
          'Update: it was the fuel. Sort of. My son had borrowed it and left '
          + 'the lead off. Put the lead on, started first pull.',
          'Thank you all. This forum is better than the manufacturer, who '
          + 'wanted eighty pounds to come and put a lead on.',
        ],
      },
      {
        author: 'ModeratorGraham',
        when: 'Tue 07:34',
        body: [
          'Marking solved. Locking before somebody says fuel again.',
        ],
      },
      {
        author: 'TWO_STROKE_TERRY',
        when: 'Tue 07:35',
        body: [
          'Fuel.',
        ],
      },
    ],
    footer: 'Page 1 of 1 · 9 replies · 1,204 views · You have read this entire '
      + 'thread and you do not own a lawnmower.',
  },
};

const CATS: BrowserSite = {
  id: 'cats',
  title: 'Cat Pictures',
  url: 'http://catpictures.invalid/index.htm',
  page: {
    kind: 'gallery',
    heading: 'CAT PICTURES',
    tagline: 'Updated whenever. Best viewed at 1024x768. Please sign the '
      + 'guestbook.',
    pictures: [
      {
        icon: 'icon-cat-loaf',
        caption: 'Loaf. Has been like this since Thursday.',
        alt: 'A cat folded into a loaf shape, ears up, eyes shut',
      },
      {
        icon: 'icon-cat-box',
        caption: 'Box arrived Tuesday. Cat arrived Tuesday.',
        alt: 'A cat sitting in a cardboard box that is slightly too small',
      },
      {
        icon: 'icon-cat-sitting',
        caption: 'Supervising. Nothing is being supervised.',
        alt: 'A cat sitting upright with its tail curled around its feet',
      },
      {
        icon: 'icon-cat-loaf',
        caption: 'Same loaf. Different room. Somehow.',
        alt: 'The same loaf-shaped cat, in a different room',
      },
      {
        icon: 'icon-cat-box',
        caption: 'This one costs forty pounds a month in food.',
        alt: 'A cat in a box, looking directly at the camera',
      },
      {
        icon: 'icon-cat-sitting',
        caption: 'He knows what he did.',
        alt: 'A cat sitting very still, avoiding eye contact',
      },
    ],
    hits: 44_318,
    footer: 'This page has been up since 1998 and has never been redesigned. '
      + 'The webmaster is contactable by post.',
  },
};

export const BROWSER_SITES: readonly BrowserSite[] = Object.freeze([
  LAWNMOWER,
  CATS,
]);

export function browserSite(id: string | null): BrowserSite | undefined {
  return BROWSER_SITES.find((site) => site.id === id);
}
