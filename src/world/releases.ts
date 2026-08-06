/**
 * The changelog, as an operating-system update, because that is what this
 * product is pretending to be.
 *
 * Every release of Workgrumble arrives in-fiction: DeskPro WorkGroup installs
 * an update overnight and the player reads about it in the morning, in the
 * voice of a knowledge-base article written by somebody who has been told not
 * to say "we forgot". The joke only works if the notes are TRUE - a fake
 * changelog is a comedy bit, a real one written in that voice is the product
 * telling you what changed while staying in character - so every line below
 * describes something that is actually in the build.
 *
 * The list is data, newest first, and it is also the version gate: the build
 * takes its number from `package.json`, and `releases.test.ts` fails if the
 * newest entry here disagrees with it. A build cannot announce a version whose
 * notes nobody wrote.
 */

import { BUILD_VERSION } from '../shared/build';

export interface ReleaseNote {
  /** `major.minor.patch`, matching the tag the build was cut at. */
  readonly version: string;
  /** ISO date the update went out. */
  readonly date: string;
  /** The one-line summary at the top of the window. */
  readonly summary: string;
  /** The article body: one bullet per change, in the house voice. */
  readonly lines: readonly string[];
}

export const RELEASES: readonly ReleaseNote[] = Object.freeze([
  {
    version: '0.15.0',
    date: '2026-08-06',
    summary: 'This update lets you off the service desk.',
    lines: Object.freeze([
      'It has taken a while. You started on the desk, and every server in every '
        + 'building has been a box you could see and not touch - the terminal '
        + 'telling you, over and over, that this one is not your tier. That was '
        + 'never a wall. It was a door with a lock you had not earned. Now you '
        + 'have earned it: when your standing is high enough the engineering '
        + 'team comes for you, and if you take it, you cross a line the industry '
        + 'has a name for - from the workstation tier to the server tier, one '
        + 'way, for good. You keep everything you had. You gain the servers.',
      'And the servers are Linux, and Linux does not speak your language, so you '
        + 'learn theirs. "ssh" to a box - it shows you a fingerprint the first '
        + 'time and asks if you trust it, the way the real thing does - and you '
        + 'are IN, at a prompt that is not yours, on a machine that runs '
        + '"systemctl", not "sc". "systemctl status" tells you the truth in a '
        + 'shape your old tools never had; "journalctl" shows you why; and when '
        + 'a service is down, "systemctl restart" brings it back and says '
        + 'nothing at all, because on Linux success is silent and only a Windows '
        + 'tool would congratulate you for doing your job.',
      'The first thing they hand you is one of your own company\'s boxes with a '
        + 'service face-down on it - the portal is down, customers cannot log '
        + 'in, and it is yours now. You ssh in, read the journal, find the '
        + 'crash-loop that tripped the start limit, restart it, and it comes up. '
        + 'Nobody thanks you. That is the job. One thing the promotion does NOT '
        + 'do: walk you into a customer\'s server just because you can now. A '
        + 'helpdesk contract still says their servers are not yours to touch - '
        + 'engineer or not - and the terminal will still stop you at the door of '
        + 'a box you were never sold. You got the keys to your own building. Not '
        + 'everyone\'s.',
    ]),
  },
  {
    version: '0.14.0',
    date: '2026-08-06',
    summary: 'This update adds a customer where being slow has a patient in the '
      + 'chair.',
    lines: Object.freeze([
      'A dental practice signs on - ELMWOOD - and the MSP runs the whole thing, '
        + 'which means the machine that matters most is the one at the chair '
        + 'with a patient in front of it. When the X-ray sensor stops being '
        + 'detected mid-appointment, that is not a ticket that can wait: it is '
        + 'Gold, it is urgent, and the clock on it is the tightest in the '
        + 'building. The fix is the one every clinic tech knows in their hands - '
        + 'reseat the sensor, swap the port - dressed up as a command.',
      'The imaging bridge is the other kind of problem: a Windows update quietly '
        + 'broke the thing that writes X-rays into the patient chart, and no '
        + 'amount of restarting a service that is already running will fix a '
        + 'vendor\'s integration. That one you escalate, because it is theirs, '
        + 'and the terminal will not let you pretend otherwise.',
      'And a request that is not a fault at all: who opened this patient\'s '
        + 'chart? You pull the log, report what it says, and hand back the '
        + 'accounting - because in a place that holds medical records, who '
        + 'looked is a question with a real answer and a real weight.',
    ]),
  },
  {
    version: '0.13.0',
    date: '2026-08-06',
    summary: 'This update signs a new customer, and lets you find out what they '
      + 'were not telling you.',
    lines: Object.freeze([
      'A new client signs mid-week - TILLMAN-FREIGHT, a haulage firm - and the '
        + 'MSP takes them on the way it usually does: undocumented. There is no '
        + 'map of their estate and the runbook they handed over is thin and '
        + 'half wrong. So you make your own map. "audit <customer>" walks their '
        + 'machines and services off the wire and shows you what is actually '
        + 'there, which is not what anyone said was there.',
      'And there, in the audit, is the thing nobody was watching: a backup that '
        + 'runs every night, reports success every morning, and cannot restore a '
        + 'single file. It is green. It has been green for months. Green is not '
        + 'the same as working, and a status light was never going to tell you '
        + 'the difference - you had to go and look.',
      'The move is the honest one: raise it. Not paper over it, not note it for '
        + 'later - raise it, on the first week, before the thing it was supposed '
        + 'to protect against arrives. Somewhere there is an MSP that skipped '
        + 'this step and found out the hard way, ninety days in, that a backup '
        + 'nobody checked is just a folder full of nothing.',
    ]),
  },
  {
    version: '0.12.0',
    date: '2026-08-06',
    summary: 'This update puts a price on the clock, and the price is not the '
      + 'same for everyone.',
    lines: Object.freeze([
      'Every customer\'s ticket now carries the name of what they pay for. '
        + 'GOLD means a tight clock - their problem is due back fast, and the '
        + 'terminal shows you how fast. BRONZE means a slower one. So a Gold '
        + 'customer\'s second-worst problem can outrank a Bronze customer\'s '
        + 'worst, and the queue now tells you which, so you can pick the one '
        + 'that costs the most to be late on.',
      'It is the same ticket and the same fix, but the deadline is the '
        + 'contract\'s, not the problem\'s. A Gold shop paid for fifteen minutes '
        + 'and expects fifteen minutes; a Bronze shop bought the cheap plan and '
        + 'knows it. The clock on each one is set to what they signed.',
      'And missing a Gold deadline reads louder at the review than missing a '
        + 'Bronze one - it is worth more, and the person who sold them Gold will '
        + 'hear about it. The cost is the missed clock, never the tone: be as '
        + 'blunt as you like, just do not be late to the customer who paid not '
        + 'to be.',
    ]),
  },
  {
    version: '0.11.0',
    date: '2026-08-06',
    summary: 'This update adds two customers who bought the opposite of each '
      + 'other.',
    lines: Object.freeze([
      'The MSP now runs four kinds of relationship, not two. HOLLOWAY, an '
        + 'accountancy firm, bought EVERYTHING - you are their whole IT '
        + 'department, and their servers are yours to fix the way your first '
        + 'shop\'s never were. The wall the other contracts put up is simply '
        + 'not there. Do the work.',
      'ARDEN, a manufacturer, bought the other thing: they have their own IT, '
        + 'and you work ALONGSIDE them. Touch one of their boxes without a word '
        + 'and you are stopped - not because you cannot, but because somebody '
        + 'there might be doing it too, and "I thought you had it" is how the '
        + 'real outages happen. Say so first - "notify <box>" tells their '
        + 'people you are on it - and then you act. Some of it is theirs to do, '
        + 'and the honest move is to hand it back, not to fix it and learn later '
        + 'it was never yours to touch.',
      'Four contracts now, and the terminal tells the truth about each: '
        + 'watch-only raises and steps back, helpdesk stops at the servers, '
        + 'co-managed coordinates first, fully-managed does the lot. The same '
        + 'command, four different answers, because it is four different jobs '
        + 'depending on whose name is on the contract.',
    ]),
  },
  {
    version: '0.10.0',
    date: '2026-08-06',
    summary: 'This update lets you do the thing you were told you could not - '
      + 'once the paperwork clears.',
    lines: Object.freeze([
      'The refusals had no give in them. A server you were not contracted to '
        + 'touch, a risky job at the wrong hour - the terminal said no and that '
        + 'was the end of it. Now some of those noes have a door in them. File a '
        + 'change request - what you want to do, what could go wrong, how you '
        + 'would undo it - and it goes to the people whose call it is.',
      'It is not a rubber stamp and it is not instant. A request sits under '
        + 'review for as long as review takes, and if it is approved it comes '
        + 'back with a WINDOW - a stretch of time, and only then, in which you '
        + 'may act. Reach for the work before the window or after it closes and '
        + 'you are told no again, politely, with the clock. The emergency you '
        + 'cannot touch until the form clears is a real feeling, and it is in '
        + 'here now.',
      'One line does not move: a watch-only contract stays watch-only. No '
        + 'amount of paperwork turns "we only look" into "we may fix" - that is '
        + 'a different contract, not a change request. Monitoring-only still '
        + 'means raise it and step back. The door is for work the contract has '
        + 'a path for, not for the wall the contract is.',
    ]),
  },
  {
    version: '0.9.0',
    date: '2026-08-06',
    summary: 'This update gives you a wall of lights you are not allowed to '
      + 'touch.',
    lines: Object.freeze([
      'The clinic you watch but do not run now has a screen of its own - a '
        + 'monitoring board, which is the thing "eyes on glass" means. Its '
        + 'backup job, its certificate, its disk, each a row with a light on '
        + 'it, read straight off the machines. When one goes red you will know '
        + 'before they do. You still cannot fix it. That was never the deal.',
      'Two buttons, and no third. ACKNOWLEDGE, which means "I have seen it" and '
        + 'stops it nagging - seeing is not fixing. And ESCALATE, which raises '
        + 'it to the people whose box it actually is - the whole job of a '
        + 'watch-only contract, done properly. Reach for a repair and the '
        + 'terminal says what it said before: not yours to touch.',
      'And the board lies to you a little, on purpose, the way real ones do. A '
        + 'CPU spike that clears itself, a network check that flaps - noise, '
        + 'mixed in with the one alert that is a real fire. Acknowledge the '
        + 'nonsense, escalate the fire, and do not get so used to red that you '
        + 'wave the real one through. Somewhere a backup failed quietly for a '
        + 'month because every light was always red.',
    ]),
  },
  {
    version: '0.8.0',
    date: '2026-08-06',
    summary: 'This update gives you customers - and takes away the right to '
      + 'fix all of them.',
    lines: Object.freeze([
      'You have left the single building behind. The new job is a Managed '
        + 'Service Provider - Fettle & Crane - and it does not have one estate, '
        + 'it has other people\'s. A law firm, a software company, a clinic. '
        + 'The ticket queue is a pile of everybody\'s problems at once, and the '
        + 'first thing every ticket makes you do is work out whose it even is.',
      'Each customer bought a different thing. Some pay you to run their whole '
        + 'IT; some pay you only to WATCH, and raise a hand when something '
        + 'breaks. Point a fix at a watch-only customer and the terminal tells '
        + 'you the truth: the contract is notify-and-escalate, not remediate - '
        + 'raising it IS the job here, and touching it is not yours to do. A '
        + 'helpdesk customer\'s servers are someone else\'s contract. The '
        + 'software company\'s Linux boxes are out of reach on two counts at '
        + 'once. None of it is a wall. It is the shape of the work.',
      'And because it is now entirely possible to be looking at one customer '
        + 'while typing at another\'s machine, the terminal will stop you before '
        + 'you do: this customer is on your screen, that box belongs to someone '
        + 'else - are you sure you are where you think you are? Ignore it at '
        + 'your peril. Somewhere, a script ran against the wrong company, and it '
        + 'was not funny to the person who did it.',
    ]),
  },
  {
    version: '0.7.0',
    date: '2026-08-05',
    summary: 'This update admits there are machines here your tools cannot '
      + 'touch.',
    lines: Object.freeze([
      'The estate has been quietly pretending to be entirely ours - one family '
        + 'of machines, one set of tools, every box a Windows box you could '
        + 'point sc at. It was never true, and it has stopped pretending. There '
        + 'are Linux servers in this building now: the box the product actually '
        + 'runs on, and the database behind it, in the server room nobody on '
        + 'this desk has a login for. They are on the network. They answer a '
        + 'ping. They have a name. That is where your reach ends, for now.',
      'Point a Windows tool at one of them - sc, services, restart, systeminfo '
        + '- and it tells you the truth instead of a comforting fiction: this '
        + 'is not a Windows host, it runs a thing called systemd, and this '
        + 'terminal does not speak it. That is not a bug and it is not a wall. '
        + 'It is the shape of the job. There is a whole other family of tools '
        + 'for those boxes, reached over something called ssh, and you do not '
        + 'have them yet. You will.',
      'The Windows side is more honest too: there is an intranet server now '
        + '(the timesheet portal, the thing that throws 503s on a Friday), and '
        + 'the domain controller has stopped mumbling and names Active '
        + 'Directory for what it is.',
    ]),
  },
  {
    version: '0.6.0',
    date: '2026-08-05',
    summary: 'This update lets you leave.',
    lines: Object.freeze([
      'Passing your probation review used to be the end of the road: the '
        + 'fridge unlocked and then nothing happened, forever. There is now '
        + 'somewhere to go. Clear the Friday review and an offer arrives from '
        + 'another shop - Bodgeworth & Batch - and you can take it. Your '
        + 'standing, your job title and the money in the coffee tin all cross '
        + 'the road with you; the shop you are leaving does not get to keep '
        + 'them.',
      'Bodgeworth is not the shop you trained at. There is no domain '
        + 'controller, no install audit, and nobody keeping a list of what you '
        + 'put on your machine - the web store is simply open, and a toy you '
        + 'install just goes on and stays on. This is being sold to you as '
        + 'freedom. It is the specific kind of freedom that comes from nobody '
        + 'being in charge of anything.',
      'Its week has its own weather. On the Wednesday the entire company '
        + 'discovers the Reply All button at the same moment, and somewhere in '
        + 'the pile - underneath the all-staff message telling everyone to stop '
        + 'replying to all - is the one message that is not about cake: the '
        + 'shared drive is down, it has your name on it, and it is a ticket.',
      'The Friday review followed you here, and it is a real one. Stay on top '
        + 'of the queue and they keep you on. Ignore it for a week on the '
        + 'grounds that nobody appeared to be watching, and you will learn who '
        + 'was. If it goes badly, starting the week again starts it HERE, at '
        + 'the shop you are actually standing in, and a saved game reopens at '
        + 'the right shop too - both of which the old build got quietly wrong.',
    ]),
  },
  {
    version: '0.5.1',
    date: '2026-08-05',
    summary: 'This update lets you panic without a keyboard.',
    lines: Object.freeze([
      'It turns out people have been trying to play this on their phones, '
        + 'where there is no key to press when the boss appears - which meant '
        + 'the single most important button in the whole product did not '
        + 'exist. There is now an on-screen one. It is labelled as a tidy-up '
        + 'button, for the same reason the key was never labelled at all.',
      'On a touch screen the windows now fit the screen instead of hanging '
        + 'off the edge of it, and the things you tap are big enough to tap. '
        + 'This is not the same as the game being good on a phone. It is the '
        + 'game being possible on a phone. The difference is a later update, '
        + 'and IT has been asked not to promise when.',
    ]),
  },
  {
    version: '0.5.0',
    date: '2026-08-05',
    summary: 'This update adds more ways to be reached.',
    lines: Object.freeze([
      'The company has rolled out Hubbub, a channel client, because email and '
        + 'a phone and a colleague at your desk were not enough places for a '
        + 'person to be. Nobody asked for it. It has channels, it has threads, '
        + 'it has a little badge that counts the things you have not read, and '
        + 'it is very excited to be here.',
      'People will now ask you the same thing in several places at once - the '
        + 'inbox, the chat, and a Hubbub room, all one question. Answering any '
        + 'one of them makes the person happy. Only turning it into a ticket '
        + 'makes the day count it. You can do that from wherever it reached '
        + 'you, and it costs you the couple of minutes the writing-up takes, '
        + 'which is the honest price of being findable.',
      'Messages you have not read now weigh something. Not much - but a stack '
        + 'of unread rooms is a small steady cost until you clear it, and '
        + 'clearing it means actually looking, not minimising the window and '
        + 'hoping. Do Not Disturb does not help here: a room does not ring, so '
        + 'there is nothing for the dot to hold back. The backlog is the one '
        + 'thing the dot cannot buy off.',
      'Some tickets now arrive already chewed on by the self-service portal '
        + 'bot ("Bot tried: password reset"), which is how you can tell the '
        + 'ones that reach you are the ones it could not solve. The people it '
        + 'sent over are, on average, crosser than it found them.',
    ]),
  },
  {
    version: '0.4.5',
    date: '2026-08-03',
    summary: 'This update keeps the promise about Minesweeper.',
    lines: Object.freeze([
      'Office Minesweeper is now in the software catalogue, where Solitaire has '
        + 'been sitting looking smug. It is real Minesweeper - a real field, a '
        + 'real flood, and the real click that ends it. The first click is '
        + 'always safe, which is the one kindness in the whole game and the '
        + 'reason nobody loses on move one. Flagging is a button rather than a '
        + 'right-click, because the person who wrote this has used a trackpad.',
      'It installs the way everything installs here: fine, and noted. It is not '
        + 'on the approved list, because nothing is, and clearing a corner of it '
        + 'drains the same tension the Browser did, only better, right up until '
        + 'the square you were not sure about. The lead knows what Minesweeper '
        + 'looks like from behind. He was quite good at it, which is how he '
        + 'knows how long a game takes.',
      'The person who writes these notes would like it on the record that the '
        + 'date they agreed to, in writing, for Minesweeper has been met. They '
        + 'have asked for this to be the last sentence anybody remembers about '
        + 'the whole affair. It will not be.',
    ]),
  },
  {
    version: '0.4.4',
    date: '2026-08-03',
    summary: 'This update adds a game that is actually a game.',
    lines: Object.freeze([
      'Office Solitaire is now in the software catalogue. It is real '
        + 'Solitaire - a real deck, dealt properly, with every rule your wrist '
        + 'already knows and no rule it does not. It is free, in the sense '
        + 'that it came bundled with an operating system you did not buy. It '
        + 'is the first program on this machine that does what it says.',
      'Installing it works the way installing anything works here: fine, and '
        + 'noted. Solitaire is not on the approved list, because nothing is, '
        + 'and playing it drains the same tension the Browser did, only '
        + 'better, because it is a better way to not work. The lead knows '
        + 'what Solitaire looks like from behind. He invented looking at it '
        + 'from behind.',
      'Minesweeper is still marked coming soon. It is coming. The person who '
        + 'writes these notes has been asked to stop promising dates and has '
        + 'agreed, in writing, with a date.',
    ]),
  },
  {
    version: '0.4.3',
    date: '2026-08-03',
    summary: 'This update makes Do Not Disturb cost something.',
    lines: Object.freeze([
      'Somebody will message you on a Thursday about the shared calendar. It '
        + 'is not a ticket and it is not urgent, and if your status is Do Not '
        + 'Disturb it will not reach you - which is the feature, and the trap. '
        + 'A message held off does not go away; it comes back the moment you '
        + 'are reachable again, so the only way to truly miss it is to stay on '
        + 'Do Not Disturb until the day runs out.',
      'Sitting on Do Not Disturb while you are visibly working costs '
        + 'suspicion, a little at a time, and enough of it with the lead in '
        + 'the room is the conversation you were trying to avoid. So the sums '
        + 'are honest now: a quiet dot buys you focus and costs you standing, '
        + 'an open one costs you the interruption and keeps you clean, and '
        + 'neither is free. Personnel consider this a fair reflection of '
        + 'working life and have gone back to Do Not Disturb.',
    ]),
  },
  {
    version: '0.4.2',
    date: '2026-08-03',
    summary: 'This update tells you what is coming.',
    lines: Object.freeze([
      'Update History now has a second half. Below the updates that have '
        + 'happened, there is a list of the ones that are planned - what is '
        + 'being built, in roughly the order we expect to build it. It is '
        + 'reachable the same way this note was: Update History, in the Start '
        + 'menu, for ever.',
      'The planned list has no dates on it, because IT does not give dates, '
        + 'and no promises in it, because the last person who made one is in '
        + 'the list under a different heading. Everything on it is subject to '
        + 'change, including whether it happens. None of it is installed. Your '
        + 'workstation is exactly as capable this morning as the top half of '
        + 'the window says and no more.',
      'It is there so that the people testing this - which is you - can see '
        + 'where it is going. Thank you for being one of them. That part is '
        + 'not a joke, and it is the only sentence in this building that '
        + 'is not.',
    ]),
  },
  {
    version: '0.4.1',
    date: '2026-08-03',
    summary: 'This update adds a tone of voice.',
    lines: Object.freeze([
      'On some replies you will now find a second way to say the same thing, '
        + 'which is to say it rudely. You may, where the option is offered, '
        + 'tell a colleague exactly what you think of them and their fault. '
        + 'The rudest of these options is quite rude. It was requested.',
      'Being rude does not break anything. The fault still gets fixed - the '
        + 'reply that tells somebody to get lost fixes their computer on the '
        + 'way past, because you are a professional and they are not paying '
        + 'for your manners. What it costs is standing: your reputation takes '
        + 'the hit, the person remembers it and is worse the next time, and if '
        + 'the lead happens to be reading over your shoulder when you send it, '
        + 'he will have a word. None of that stops the ticket closing. All of '
        + 'it stops the week going well.',
      'This is the polite option\'s opposite, not its replacement. Nobody is '
        + 'making you. The neutral reply costs nothing and is right there. It '
        + 'is simply no longer the only thing you are allowed to feel.',
    ]),
  },
  {
    version: '0.4.0',
    date: '2026-08-03',
    summary: 'This update lets you install software.',
    lines: Object.freeze([
      'There is now a place to get software, reachable from the Browser. It '
        + 'looks like a website from 1998 because the good ones did. You can '
        + 'install what it offers, and some of what it offers is a way to not '
        + 'do your job for a while, which is better at that than the Browser '
        + 'was.',
      'Your employer has a view on what you install. This employer\'s view is '
        + 'that you should not. Installing something anyway works perfectly '
        + 'well - the program runs, the game plays - and is written down. IT '
        + 'audits IT. There is a list. Removing the program later takes it off '
        + 'your machine and leaves it on the list, because the list is not '
        + 'about what is on your machine, it is about what was.',
      'A colleague may, at some point, mention the list to you in person. He '
        + 'will know which program. He will know you took it off again. He is '
        + 'not going to do anything about it today. He wanted you to know that '
        + 'he could.',
      'Nothing you install follows you into a scripted week or a scored '
        + 'figure by surprise: an empty machine is exactly as capable as it '
        + 'has always been. What you add to it is yours, and so is the '
        + 'paperwork.',
    ]),
  },
  {
    version: '0.3.6',
    date: '2026-08-03',
    summary: 'This update tidies up after itself.',
    lines: Object.freeze([
      'The working day no longer ends when you leave. A message or two may '
        + 'arrive after you have gone, and they will be waiting on the '
        + 'morning screen when you come back. You can answer them. Answering '
        + 'is a small point in your favour, traded for a small amount of the '
        + 'evening following you into the next day. Leaving them costs '
        + 'nothing at all, which is the correct choice and the one nobody '
        + 'makes.',
      'The taskbar no longer pushes your open windows off the end of itself '
        + 'when a lot is happening at once. The status control has been made '
        + 'smaller so it stops elbowing everything else. It is still there. '
        + 'It is still watching.',
      'When the day slows itself down because something has happened to you, '
        + 'it now says so, rather than leaving you to notice ten minutes '
        + 'later that the afternoon has been crawling. It still does not '
        + 'speed itself back up. That part is yours.',
      'The assistant, once dismissed, now stays dismissed for the rest of '
        + 'the day, instead of returning the moment anything happens. It '
        + 'still comes back tomorrow. It was very clear about that.',
    ]),
  },
  {
    version: '0.3.5',
    date: '2026-08-02',
    summary: 'This update adds an assistant.',
    lines: Object.freeze([
      'A helpful assistant now lives on your desktop. It is a screen on a '
        + 'plinth with a face, it has opinions about what you are doing, and '
        + 'those opinions are wrong. This is not a limitation of the current '
        + 'version. It is the whole of the feature. The assistant has been '
        + 'carefully checked to make sure it never accidentally tells you how '
        + 'to fix anything, and it passed.',
      'The assistant can be dismissed. It remembers being dismissed. It will '
        + 'come back, and it will mention it. There is no number of times you '
        + 'can close it that it will not come back from, though after a while '
        + 'it stops counting out loud, which everyone agreed was for the best.',
      'The assistant does not speak during a meeting or while the workstation '
        + 'is installing updates. It knows when it is not wanted. It just does '
        + 'not act on that knowledge the rest of the time.',
    ]),
  },
  {
    version: '0.3.4',
    date: '2026-08-02',
    summary: 'This update adds colleagues.',
    lines: Object.freeze([
      'Colleagues may now approach your desk in person. There is no way to '
        + 'decline a person who is already standing at your desk; there is a '
        + 'button for saying "not now", and colleagues are advised that a '
        + 'colleague told "not now" will raise the request themselves, in '
        + 'writing, with a subject line that mentions you.',
      'Work done at your desk as a favour, off the record, is exactly as '
        + 'appreciated as it has always been, and exactly as invisible on '
        + 'Friday as it has always been. The person you helped will remember '
        + 'it warmly. The review will not remember it at all. Both of these '
        + 'are features.',
      'Some colleagues open a chat with "Hi." and then type for several '
        + 'minutes. The typing indicator now shows how long you are expected '
        + 'to wait, which is more than the message will turn out to justify. '
        + 'Replying "what is up?" skips the wait. There is a page on the '
        + 'intranet about this. A colleague will send it to you. It will not '
        + 'help.',
      'Some faults are reported five minutes before the end of the shift. '
        + 'The clock on such a fault runs for five minutes tonight and the '
        + 'rest tomorrow morning, which is the correct arithmetic and '
        + 'nobody\'s favourite fact. The fault was there all afternoon. The '
        + 'report was not. Personnel have declined to comment on the gap.',
    ]),
  },
  {
    version: '0.3.3',
    date: '2026-08-02',
    summary: 'This update adds presence.',
    lines: Object.freeze([
      'You now have a status. It is in the tray, it is one of Available, Do '
        + 'Not Disturb and Away, and it is visible to everybody, which is the '
        + 'part of this feature nobody asked for and everybody uses.',
      'Do Not Disturb holds your calls. It does not hold your meetings, and '
        + 'it does not hold the workstation, because neither of those has '
        + 'ever cared how busy you are. Colleagues whose calls did not ring '
        + 'are listed on the phone, with the time they tried. They know the '
        + 'dot was on. You know they know. This is called working culture.',
      'Please note that time spent on Do Not Disturb while visibly doing '
        + 'things is time your line manager can count. He rounds in neither '
        + 'direction. He has asked us to say that he is not angry, he is '
        + 'just interested in what the status was for.',
      'Setting yourself Away while demonstrably at your desk doing work is '
        + 'supported. The people waiting on that work can see it too. One of '
        + 'them will usually say something. This is not a bug in the status '
        + 'system; it is the status system working as originally intended, '
        + 'by someone who no longer works here.',
      'Available remains free of charge.',
    ]),
  },
  {
    version: '0.3.2',
    date: '2026-08-02',
    summary: 'This update adjusts the passage of time near events.',
    lines: Object.freeze([
      'Colleagues running their day at four times its natural speed have '
        + 'reported that telephone calls were over before they could be '
        + 'regretted, and meetings arrived, occurred and were summarised in '
        + 'the space of a breath. This has been addressed: when something '
        + 'lands on you - a call, a meeting, the workstation, the lead - the '
        + 'day now slows to its natural pace, so that whatever is about to '
        + 'happen to you happens at a speed at which you can be said to have '
        + 'been present for it.',
      'The day does not speed itself back up afterwards. It was slowed '
        + 'because something happened; deciding the rest of it should go '
        + 'faster is, as ever, yours to do and yours to answer for.',
      'The pause button is unaffected. It has always been unaffected. It is '
        + 'the one control in this building that does exactly what it says, '
        + 'and Personnel are monitoring it closely as a result.',
    ]),
  },
  {
    version: '0.3.1',
    date: '2026-08-02',
    summary: 'This update improves the delivery of updates.',
    lines: Object.freeze([
      'Your workstation now receives updates. Updates are important. When '
        + 'updates are ready, your workstation will tell you it is restarting '
        + 'in ten minutes, and those ten minutes are yours: the button '
        + 'postpones it, three times, for less time each time, which IT '
        + 'consider generous and the update considers negotiable. There is no '
        + 'button for not restarting. That option was withdrawn, and the '
        + 'dialog will explain whose fault that is (yours).',
      'While updates are installing, your workstation is not available. Your '
        + 'queue is. Every clock on it continues, which colleagues have '
        + 'described as unfair, and which Personnel have confirmed is '
        + 'accurate.',
      'Your work is restored after the restart. All of it, exactly as it '
        + 'was, every time. The screen will nevertheless say "Restoring your '
        + 'work... (most of it)", because the engineers who wrote that screen '
        + 'had lived a life before they came here, and nobody in this '
        + 'building has ever trusted a progress bar that told the whole '
        + 'truth.',
      'The percentage shown while installing is not connected to anything. '
        + 'The MINUTES are real - the percentage is a performance of them. It '
        + 'will hang at thirty for a while. This was specified.',
      'This update was itself delivered by the mechanism it describes. If '
        + 'you are reading this, the restart went fine, and your work came '
        + 'back. All of it. Whatever the screen said.',
    ]),
  },
  {
    version: '0.3.0',
    date: '2026-08-02',
    summary: 'This update adds interruptions.',
    lines: Object.freeze([
      'The telephone now works. Colleagues can call you while you are working '
        + 'on something else, which Personnel are advised is the normal use of '
        + 'a telephone. A call can be answered, asked to ring back, or '
        + 'declined, where the caller is somebody who can be declined. Asking '
        + 'somebody to ring back works once. The second call does not offer '
        + 'the button, for the reason you would expect.',
      'A call about the fault you are actually working is part of the work, '
        + 'and is treated as such: what is said in it lands on the ticket. A '
        + 'call about anything else costs you the place you were holding in '
        + 'what you were doing. IT are aware that finding your place again '
        + 'takes on average twenty-three minutes and have decided to describe '
        + 'this rather than fix it, as it is not a fault in any system they '
        + 'administer.',
      'A call that is allowed to ring until it stops is recorded as a call '
        + 'that was allowed to ring until it stopped. The record does not say '
        + 'anything else. It does not need to. You will also find you lost '
        + 'some of your place anyway, as the ringing was not nothing.',
      'Meetings have been introduced. Where a meeting concerns you it will be '
        + 'announced in the morning briefing and confirmed by mail, naming the '
        + 'hour. Attendance is expected. The meeting occupies the whole of '
        + 'your screen for the whole of its duration; your queue, and every '
        + 'clock on it, continues in your absence. This is not a fault. A '
        + 'summary mail is circulated afterwards containing the meeting, in '
        + 'full, for the benefit of those who were there.',
      'The Start menu now stays on the screen regardless of how much has been '
        + 'installed on this workstation. Items which were previously above '
        + 'the top of the screen can now be clicked. Colleagues who reported '
        + 'that the menu was "fine on my machine" are thanked for their '
        + 'contribution to the investigation.',
      'Known issue: the pace of the working day is under ongoing review '
        + 'following the addition of people to it.',
    ]),
  },
  {
    version: '0.2.7',
    date: '2026-08-01',
    summary: 'This update adds the consultation and selection screens '
      + 'required by our commitments on organisational change.',
    lines: Object.freeze([
      'Where a reduction in roles is proposed, the announcement will state '
        + 'the number of roles, the selection pool, the criteria and the date '
        + 'consultation closes. It will be sent to everybody at the site and '
        + 'it will be sent at least thirty days before any decision takes '
        + 'effect. This is longer than we are obliged to give at this '
        + 'headcount. It is what we are giving.',
      'Selection is scored on a published matrix with three criteria: your '
        + 'performance for the period, your disciplinary record where it is '
        + 'current and relevant, and your length of service. Performance is '
        + 'weighted heaviest. Length of service is capped at ten years, so '
        + 'that colleagues past that point are level with each other.',
      'Your own scores and everybody else\'s in the pool are visible to you '
        + 'from the day consultation opens, in the review window and on the '
        + 'day scorecard, and they update as the period goes on. Colleagues '
        + 'have asked whether the scores are visible before the decision. '
        + 'They are. That is the point of them.',
      'Where no reduction is proposed, all of the above screens say so. There '
        + 'is no round on during the probation week and there will not be one '
        + 'in the two weeks after any consultation closes.',
      'A role ending by redundancy is not a dismissal for conduct or '
        + 'capability and is not recorded as one. Notice is paid in lieu. '
        + 'Statutory redundancy pay requires two years of continuous service; '
        + 'below that, notice is what is owed, and for a colleague at this '
        + 'stage that is one week.',
      'Personnel confirm that a conduct file does not follow a colleague to a '
        + 'subsequent employer, as it is a record made by the people who made '
        + 'it. Colleagues have asked us to state this more prominently. It is '
        + 'stated here.',
      'Known issue: a week that comfortably clears the probation pass mark '
        + 'may still be the lowest-scoring week in a pool. The pass mark and '
        + 'the matrix answer different questions. Personnel confirm this is '
        + 'not an issue.',
    ]),
  },
  {
    version: '0.2.6',
    date: '2026-08-01',
    summary: 'This update clarifies how informal conduct discussions are '
      + 'recorded and used.',
    lines: Object.freeze([
      'Following the scoring correction in 0.2.5, conversations about what is '
        + 'open on your screen no longer affect any figure at the time they '
        + 'happen. They are recorded. A dated note is added to your file '
        + 'stating what was observed and when, in line with Personnel\'s '
        + 'documentation-first guidance, and the note is added whether or not '
        + 'anybody ever reads it.',
      'Your file is now available to you, under "A quick word" in the Start '
        + 'menu, at any time, in full. Colleagues have asked why this was not '
        + 'previously the case. Personnel have asked us to say that it now is.',
      'The same window states the circumstances in which your file would be '
        + 'consulted at review. There are three: a reported fault that passed '
        + 'its resolution target without the person who raised it being '
        + 'contacted at all; a colleague directed to the request form and not '
        + 'subsequently dealt with; and a fault raised by your own line '
        + 'manager left to pass its target. Where none of these applies, your '
        + 'file is not consulted and the review is decided on the percentage '
        + 'alone.',
      'Where your file IS consulted, the pass mark for the review rises by 5 '
        + 'for each note on it, to a maximum of 70 out of 100. The mark you '
        + 'have to reach is shown on the day scorecard every evening, in the '
        + 'review window, and on the week summary, together with the reason '
        + 'it is the number it is. It is never below 45.',
      'Time taken by these conversations is not credited back to the shift. A '
        + 'ten-minute discussion at your desk is ten minutes in which no fault '
        + 'was worked and no resolution target moved. This has always been the '
        + 'case and is now stated.',
      'The desk itself continues to be observed separately. Empties above the '
        + 'permitted number are noted on the same file and are not raised with '
        + 'the employee.',
      'Known issue: a note cannot be removed from a file by tidying anything. '
        + 'Personnel confirm this is not an issue.',
    ]),
  },
  {
    version: '0.2.5',
    date: '2026-08-01',
    summary: 'This update improves the consistency of probation review '
      + 'scoring.',
    lines: Object.freeze([
      'Addresses an issue in which the probation review was decided on a '
        + 'running total. Reviews are now scored as a percentage of the work '
        + 'the week actually received: half of it the proportion of the queue '
        + 'that was closed, half of it the proportion that never passed its '
        + 'resolution target. The pass mark is 45 out of 100.',
      'The previous method added points for each fault closed and took a '
        + 'fixed amount off for each conversation with a line manager about '
        + 'what was open on your screen. The first of those grew every time '
        + 'the fault catalogue grew and the second did not, so the standard '
        + 'required to pass fell slightly each time this department was given '
        + 'more to do. Personnel have asked that this be described as a '
        + 'scaling correction.',
      'The review percentage is now shown on the day scorecard, with the pass '
        + 'mark next to it and a sentence saying which side of it you are on. '
        + 'It was previously calculated and not displayed, which we accept is '
        + 'not the same thing as being told.',
      'The week summary now itemises both halves of the figure - closed '
        + 'against received, and deadlines kept against deadlines set - as '
        + 'fractions and as percentages, and states the number the reviewer '
        + 'read. That number is the one written down at three o\'clock and '
        + 'not the one the afternoon has moved since.',
      'The review window now states the figure your review was decided on. It '
        + 'is in the review window, at the review, in writing.',
      'Conversations about what is open on your screen no longer affect the '
        + 'review figure. They continue to be recorded, the corridor is '
        + 'unchanged, policy 4.1 is unchanged, and the time those '
        + 'conversations take out of your afternoon is unchanged.',
      'Known issue: a week in which nothing arrives at all cannot be scored, '
        + 'because there is nothing to take a percentage of. The reviewer '
        + 'will read whatever the previous week left him. This has not come '
        + 'up.',
    ]),
  },
  {
    version: '0.2.4',
    date: '2026-08-01',
    summary: 'This update improves the handling of files that were never lost.',
    lines: Object.freeze([
      'Addresses reports of documents disappearing after being saved. The '
        + 'documents had not disappeared. A file opened out of a mail is '
        + 'opened from C:\\WINDOWS\\TEMP, and Save writes it back to where '
        + 'it was opened from, every time, including the ninth time. Adds '
        + '"move <file> <directory>" to the Support Terminal for putting one '
        + 'back where the person who saved it believes it already is.',
      'The temp directory is now visible on every workstation, along with the '
        + 'note the build left in it in 1994 explaining that the machine '
        + 'treats everything in there as disposable. It has been doing that '
        + 'quietly for four years.',
      'Adds "purge <directory>" for a directory a program has filled and '
        + 'nobody has emptied. It will empty a directory whose contents have '
        + 'already been sent somewhere else, and it will refuse every other '
        + 'directory on the estate, including the one next door with the same '
        + 'software\'s name on it. That refusal is the feature.',
      'Resolves a condition in which a warehouse workstation reported '
        + 'insufficient disk space while containing four documents. It also '
        + 'contained twelve monthly scanner exports going back to 1997, '
        + 'totalling rather more than the drive had. Head office has had all '
        + 'twelve since the nights they were written.',
      'The print queue now lists its jobs rather than counting them: the job '
        + 'number, the size and the minute each one arrived, under the same '
        + 'numbers as the files in the spool folder. There are still no '
        + 'document names and no owners, because this spooler has never '
        + 'recorded either and this update will not invent them.',
      'The Event Viewer now dates each line the way the rest of the system '
        + 'dates a file. A log line and a directory listing describing the '
        + 'same evening now say so in the same words.',
      'Known issue: the pallet scanner will write next month\'s export next '
        + 'month. This update does not include a schedule for deleting them, '
        + 'because deleting things on a schedule is a change and a change '
        + 'needs a form.',
    ]),
  },
  {
    version: '0.2.3',
    date: '2026-08-01',
    summary: 'This update improves access to local and networked storage.',
    lines: Object.freeze([
      'Addresses an issue in which this workstation had no drive on it. Every '
        + 'machine on the estate now has a C: drive with the directories it '
        + 'was imaged with, the ones its job added, and a profile for whoever '
        + 'logs on to it.',
      'Adds "dir", "cd", "type" and "tree" to the Support Terminal. Listings '
        + 'include the volume header, the date and size of every entry, and '
        + 'what is left on the drive. Typing "cd" on its own reports where '
        + 'you are standing, which is the behaviour of this operating system '
        + 'and not an oversight.',
      'The Support Terminal now opens in C:\\SUPPORT and the prompt follows '
        + 'the directory you are in. A second terminal opens where a second '
        + 'terminal opens.',
      'Adds access to other machines through their administrative share, in '
        + 'the form \\\\PRINT-01\\C$. This works because the Server service '
        + 'is running on every box in this building, which you can see for '
        + 'yourself in any services list.',
      'The print queue is now a directory. Jobs stacked up behind a wedged '
        + 'spooler are files in the spool folder on the print server, with a '
        + 'size and a time on each, and emptying the queue empties the '
        + 'folder. Four files of the same size are four copies of the same '
        + 'delivery note.',
      'Each machine now keeps its event log as a file in '
        + 'C:\\WINDOWS\\SYSTEM32\\LOGFILES. It contains what the Event Viewer '
        + 'shows, because it is what the Event Viewer shows.',
      'Directories you have no rights to now report that they are directories '
        + 'you have no rights to. Payroll would like this noted as working as '
        + 'intended.',
      'Known issue: there is no "ls" on this workstation. There is no "ls" on '
        + 'any workstation in this building. This is not the sort of building '
        + 'that has one.',
    ]),
  },
  {
    version: '0.2.2',
    date: '2026-08-01',
    summary: 'This update improves the accuracy of workstation reporting.',
    lines: Object.freeze([
      'Addresses an issue in which a workstation reported one service. Every '
        + 'machine on the estate now lists the services it has been running '
        + 'since it was built, with the status and the startup type of each. '
        + 'Finding the one that is wrong is your job and always was.',
      'Adds startup types. A service set to Manual and stopped is a machine '
        + 'behaving itself; a service set to Automatic and stopped is the '
        + 'reason somebody has rung. The list now tells you which you are '
        + 'looking at.',
      'Adds "sc query" and "tasklist" to the Support Terminal. The first '
        + 'reports what the service manager holds on one service; the second '
        + 'reports what is open on this desk, browsers and morale exercises '
        + 'included. A minimised window remains a running program.',
      'Resolves a condition in which restarting a licence pool was refused in '
        + 'the words written for a chassis fan. Refusals now name what the '
        + 'thing actually is.',
      'Service names now require the machine they are on where more than one '
        + 'machine answers to the name, in the form PRINT-01\\Spooler. Every '
        + 'box in this building runs a print spooler, which was always true '
        + 'and is now visible.',
      'Adds a domain controller. The accounts, the group memberships and the '
        + 'lockouts have always been somewhere; they are now somewhere you '
        + 'can ping.',
      'About This Workstation is now an About dialog. It reports this '
        + 'machine - the processor, the memory, the display, the uptime and '
        + 'the licence - and no longer reports how many tickets are waiting '
        + 'for you. The queue was already doing that.',
      'Known issue: 48 MB of the memory in this workstation remains usable. '
        + 'Nobody knows why.',
    ]),
  },
  {
    version: '0.2.1',
    date: '2026-08-01',
    summary: 'This update improves the handling of workstation accounts.',
    lines: Object.freeze([
      'Addresses an issue in which logging on with a badge number that had no '
        + 'week saved against it started a new week without saying so. The '
        + 'workstation now states which of the two happened, on the same '
        + 'badge, before you have had time to wonder.',
      'Adds an account record to the log-on screen. Your badge number now '
        + 'shows the date it was issued and the date it was last used, which '
        + 'are the only two facts this company holds about you.',
      'Adds a retention period. IT clears out dormant accounts after six '
        + 'months, which is the most realistic thing in this building. '
        + 'Logging on or saving a day pushes the date another 180 days out; '
        + 'the date is on the log-on screen and it is not a threat.',
      'Known issue: this is still a helpdesk. No fix is planned.',
    ]),
  },
  {
    version: '0.1.0',
    date: '2026-07-31',
    summary: 'This update improves the reliability of the working day.',
    lines: Object.freeze([
      'Addresses an issue in which the working day did not exist. Days now '
        + 'run from 09:00 to 17:00 and end whether or not the queue does.',
      'Addresses an issue where reported faults arrived with no deadline '
        + 'attached. Response and resolution are now timed separately, and '
        + 'the first thing done to a ticket stops one of the two clocks.',
      'Adds the Active Dictionary, Remote Assist, Event Viewer, Chat, Mail, '
        + 'the Support Terminal and the Knowledge Base. Several of these were '
        + 'previously represented by an icon.',
      'Addresses an issue in which typing into the Support Terminal had no '
        + 'effect on the estate. Twenty-eight commands now do what their '
        + 'buttons do.',
      'Resolves a condition in which a print spooler could be restarted while '
        + 'still holding the files it was declining to print.',
      'Adds support for reporters who cannot describe the fault. Asking the '
        + 'right question now stops the reporter\'s clock; not asking one no '
        + 'longer does.',
      'Addresses an issue where workplace stress had no observable effects. '
        + 'Above 80, hand tremor is rendered. This is cosmetic. Every control '
        + 'continues to do exactly what it says it does.',
      'Adds corridor awareness. An approaching member of management is now '
        + 'indicated in the taskbar, in the reflection on the monitor, and in '
        + 'the floor. The Boss Key minimises all non-work windows.',
      'Adds desk consumables. Energy drinks are supported, including their '
        + 'documented aftermath. Beer is present and locked pending review, '
        + 'per policy 4.1 (probationary staff).',
      'Improves the accuracy of the payslip. Deductions are now itemised. '
        + 'The farm fund is displayed to the penny.',
      'Addresses an issue in which dismissal ended the session permanently. '
        + 'The farm fund is retained across terminations.',
      'Adds saved games. The week is written to this workstation, and to your '
        + 'badge number where one has been issued. Losing the badge loses the '
        + 'save; IT cannot look it up, which is the point.',
      'Known issue: this is still a helpdesk. No fix is planned.',
    ]),
  },
]);

/**
 * Compares two `major.minor.patch` versions.
 *
 * Written out rather than compared as strings, because `'0.10.0' < '0.9.0'` is
 * true alphabetically and false in every other sense - and this decides
 * whether a player is shown an update window, which is the sort of thing that
 * goes unnoticed for exactly nine releases.
 *
 * Anything that is not three whole numbers sorts BELOW everything that is: an
 * unreadable stored version means "older than this build", which shows the
 * notes rather than hiding them.
 */
export function compareVersions(left: string, right: string): number {
  const parts = (value: string): readonly number[] => {
    const matched = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());

    return matched === null
      ? [-1, -1, -1]
      : [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  };

  const a = parts(left);
  const b = parts(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);

    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }

  return 0;
}

/** The notes, newest first, whatever order they were written in. */
export function releasesNewestFirst(): readonly ReleaseNote[] {
  return [...RELEASES].sort(
    (left, right) => compareVersions(right.version, left.version),
  );
}

/** Everything published after `version`, newest first. */
export function releasesSince(version: string): readonly ReleaseNote[] {
  return releasesNewestFirst().filter(
    (note) => compareVersions(note.version, version) > 0,
  );
}

/** What this build calls itself, for anything that needs to say it out loud. */
export const CURRENT_VERSION = BUILD_VERSION;
