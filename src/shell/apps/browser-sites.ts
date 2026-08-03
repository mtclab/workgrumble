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

/**
 * One row of the web store's catalogue.
 *
 * A shipped installable carries the `appId` the Install button dispatches and
 * the store reads the machine's install set against; a "coming soon" row has no
 * `appId` and is greyed - the catalogue listing more than the build ships, which
 * is cheap content that sets up later slices. Both are the same shape so the
 * page renders one list and the joke reads down it.
 */
export interface StoreProgram {
  /** The installable app id, or absent for a greyed "coming soon" row. */
  readonly appId?: string;
  readonly name: string;
  /** The register line, in the voice of a late-90s shareware download page. */
  readonly blurb: string;
  /** The shareware register nobody ever paid: "Freeware", "Nagware", etc. */
  readonly register: string;
}

export interface StoreSite {
  readonly kind: 'store';
  readonly heading: string;
  readonly tagline: string;
  /**
   * The policy consequence, said honestly in-fiction: the install is not
   * blocked, it works, and somebody keeps a list. It is the store's version of
   * the rule every other slack surface states before it charges for itself.
   */
  readonly notice: string;
  readonly programs: readonly StoreProgram[];
  readonly footer: string;
}

export interface BrowserSite {
  readonly id: string;
  readonly title: string;
  /** What the address bar reads. It is not typeable and it goes nowhere. */
  readonly url: string;
  readonly page: ForumSite | GallerySite | StoreSite;
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

/**
 * The page Owen's daughter sent him, which he read and agreed with and then
 * ignored the next morning.
 *
 * It is a forum thread rather than a manifesto, and that is the joke doing its
 * own work: the real page is one polite paragraph, and what the internet in
 * this building does with one polite paragraph is have an argument about it
 * for two days and then say hello to each other in it. Nobody in the thread is
 * stupid and nobody is a villain - the strongest position in it is also the
 * one that is wrong, and the last post is the whole point.
 *
 * It is in the browser's list because the veteran LINKS it, in his own
 * conversation, at the end of the beat it is about. A page nobody is sent to
 * is a page nobody reads, which is the same rule the KB keeps.
 */
const NO_HELLO: BrowserSite = {
  id: 'nohello',
  title: 'no hello',
  url: 'http://nohello.invalid/',
  page: {
    kind: 'forum',
    heading: 'PLEASE DO NOT SAY JUST HELLO IN CHAT',
    board: 'Etiquette > Instant Messaging > Workplace',
    posts: [
      {
        author: 'nohello (site owner)',
        when: 'Thu 08:12',
        body: [
          'When you open with "hi" and then wait, you have started a '
          + 'conversation and given the other person nothing to do with it. '
          + 'They cannot answer, they cannot decide whether it is urgent, and '
          + 'they cannot get back to what they were doing, because you are '
          + 'still typing.',
          'Say hello AND the question, in the same message. That is the whole '
          + 'of it. There is no course.',
        ],
        signature: 'This page has one idea on it and that is deliberate',
      },
      {
        author: 'RegionalBrian',
        when: 'Thu 08:40',
        body: [
          'Strongly disagree. Launching straight into a request is rude. I '
          + 'was raised to greet people.',
        ],
        signature: 'Sent from a device I do not understand',
      },
      {
        author: 'nohello (site owner)',
        when: 'Thu 08:44',
        body: [
          'Greet them. In the same message. As the first four words of the '
          + 'message that also contains the question.',
        ],
      },
      {
        author: 'RegionalBrian',
        when: 'Thu 09:02',
        body: [
          'That is not how a conversation works.',
        ],
      },
      {
        author: 'HelpdeskOfNineYears',
        when: 'Thu 09:15',
        body: [
          'It is exactly how a conversation works when one of the people in '
          + 'it has forty of them open and a clock on every single one.',
          'I have counted. Eleven minutes a day, every day, waiting for the '
          + 'second message. That is a working week a year of watching three '
          + 'dots.',
        ],
      },
      {
        author: 'Pauline_H',
        when: 'Thu 10:31',
        body: [
          'I have printed this out and put it by the kettle. Two people have '
          + 'already come over to tell me they agree with it.',
        ],
      },
      {
        author: 'HelpdeskOfNineYears',
        when: 'Thu 10:33',
        body: [
          'Came over. To tell you. In person.',
        ],
      },
      {
        author: 'RegionalBrian',
        when: 'Fri 07:58',
        body: [
          'Hi.',
        ],
      },
      {
        author: 'ModeratorGraham',
        when: 'Fri 08:06',
        body: [
          'Locking this before anybody replies to that.',
        ],
        signature: 'I do this for free, which is the problem',
      },
    ],
    footer: 'Page 1 of 1 · 8 replies · 91,455 views · Bookmarked on this '
      + 'workstation by somebody who has since done it four times.',
  },
};

/**
 * The web store: a late-90s shareware download page, bookmarked on a
 * locked-down workstation for reasons nobody will admit to.
 *
 * The two rows with an `appId` are the toys this build actually installs; the
 * rest are the catalogue being bigger than the build, greyed and going nowhere,
 * which is both a joke and the seam later slices hang more programs off. The
 * whole page is content - text and a policy notice - and the buttons on it are
 * wired by the Browser app, which is the one thing that can see the machine's
 * install set and reach the shell that mounts an app.
 */
const WEB_STORE: BrowserSite = {
  id: 'store',
  title: 'Download Depot',
  url: 'http://download-depot.invalid/programs.htm',
  page: {
    kind: 'store',
    heading: 'DOWNLOAD DEPOT',
    tagline: 'Over 4 programs! Updated when we feel like it. All software '
      + 'tested on one machine that is not this one. Best experienced at '
      + '1024x768 with the sound off.',
    notice: 'A note about your workstation: this machine is on a locked-down '
      + 'policy, which means it does not permit any of this. It will install '
      + 'anyway - the button works, the program runs, the relief is real. But '
      + 'it goes on the install audit the moment you click, and IT keeps that '
      + 'list. Somebody will notice. That is the deal, and it is a better deal '
      + 'than the forum.',
    programs: [
      {
        appId: 'arcade',
        name: 'Office Arcade',
        register: 'Freeware (unregistered)',
        blurb: 'Seventeen games in one! There is one game. It is very good at '
          + 'being one game. Catches nobody up on their queue and takes the '
          + 'edge off in a way a forum never quite manages.',
      },
      {
        appId: 'mediaplayer',
        name: 'Media Player',
        register: 'Nagware (the nag is this whole page)',
        blurb: 'Plays every format, including several that do not exist. Comes '
          + 'with a visualiser that is more sure of itself than anyone in the '
          + 'building. Plays no actual sound, which is the one considerate '
          + 'thing about it.',
      },
      {
        name: 'Screen Saver Deluxe',
        register: 'Shareware ($15, cheque only, do not send a cheque)',
        blurb: 'Flying toasters, allegedly. This row does nothing yet - the '
          + 'download is "coming soon", which on this site has historically '
          + 'meant "coming never".',
      },
      {
        name: 'Weather Tray 98',
        register: 'Trialware (trial expired 1999)',
        blurb: 'Puts the weather in your system tray. There is no internet in '
          + 'here, so it would only ever have shown one kind of weather. '
          + 'Coming soon, in the sense that it is not coming.',
      },
      {
        name: 'MODEM BLASTER TOOLS',
        register: 'Careware (please be kind to your modem)',
        blurb: 'A suite of tools for a modem this workstation does not have. '
          + 'Listed for completeness, and because the webmaster is proud of '
          + 'it. Coming soon.',
      },
    ],
    footer: 'This page has been under construction since 1998. Downloads are '
      + 'not scanned for anything, because scanning was not invented here yet. '
      + 'You are visitor 6 today, and four of those were you.',
  },
};

export const BROWSER_SITES: readonly BrowserSite[] = Object.freeze([
  LAWNMOWER,
  CATS,
  NO_HELLO,
  WEB_STORE,
]);

export function browserSite(id: string | null): BrowserSite | undefined {
  return BROWSER_SITES.find((site) => site.id === id);
}
