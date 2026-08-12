import type { FieldValue } from './engine-api';
import { loadEngine, WasmEngine } from './engine-api';
import { type Account, createCloudApi } from './shell/api';
import { type AppState, AppStateStore } from './shell/app-state';
import { APP_MANIFEST } from './shell/apps';
import {
  askedAtLast,
  openDirectMessage,
  openNoHello,
  pingBossThread,
  remarkInThread,
} from './shell/boss-thread';
import type { ShellContext } from './shell/context';
import { DayDriver, DRIVER_INTERVAL_MS, windowFor } from './shell/day-driver';
import {
  acknowledgeCarry,
  carryFrom,
  hydrateFromRetry,
  RetrySlot,
} from './shell/retry';
import { createShellSession, type SaveOutcome, SaveSlot } from './shell/save';
import { SaveHealth } from './shell/save-health';
import { Shell } from './shell/shell';
import { carryForSwitch, SwitchSlot } from './shell/switch';
import { openStorage } from './shell/storage';
import { CloudSaves } from './shell/sync';
import { updateOnBoot, VersionSlot } from './shell/updates';
import { BUILD_VERSION } from './shared/build';
import { unreadIds } from './world/channels';
import { COMPANY, COMPANY_IDS } from './world/company';
import { type Employer, employerFor, employerName } from './world/employers';
import { awayNoticedLine } from './world/dialogue';
import { dayForTick } from './world/hours';
import { FLAVOR, flavorText } from './world/interruptions';
import { MSP_IDS } from './world/msp-company';
import { createWorldSession, FIRST_WEEK } from './world/session';
import { ticketTitle } from './world/tickets';
import { channelFeedThrough } from './world/week';

/**
 * A read-only window onto the running session, for the journey gate.
 *
 * The full-day test has to prove that a save and a reload land on the SAME
 * world, and "the same world" is a graph hash - a number no screen shows and
 * no screen should. Everything here reads; nothing dispatches, advances a
 * clock or writes a field, so the worst a player can do with it is find out
 * what their own save already knows.
 */
export interface SimDebug {
  /** The graph hash: the whole world in sixteen characters. */
  hash(): string;
  /** Simulation tick, which the taskbar clock only shows to the minute. */
  tick(): number;
  /** What the apps were showing, as the save would carry it. */
  screens(): AppState;
  /**
   * One field off one node of the live graph (E11, 0.34.0).
   *
   * For the half of a week boundary that no screen shows. The estate delta a
   * stay carries is world state by design - a note by a socket is a repair to a
   * building, not a window - so the only way for a journey on the built artifact
   * to ask "did the building keep it" is to ask the graph. It reads exactly one
   * field and returns whatever is there, which is strictly less than the hash
   * above already gives away.
   */
  field(node: string, name: string): FieldValue | undefined;
}

declare global {
  var careerSim: SimDebug | undefined;
}

function mountPoint(): HTMLElement {
  const host = document.getElementById('app');

  if (!(host instanceof HTMLElement)) {
    throw new Error('The shell needs a #app mount point in index.html.');
  }

  // Whatever index.html painted while the wasm was on its way - the loading
  // shell - goes here, replaced by the thing it was standing in for.
  host.replaceChildren();
  return host;
}

/**
 * The screen a player gets when the boot never finishes.
 *
 * There are real ways for it not to: a Worker serving the wasm with the wrong
 * MIME type or from a stale cache, a compile that fails, a browser that will
 * not hand over storage at all. Every one of them used to produce an empty
 * body and an unhandled rejection in a console nobody has open, which is
 * indistinguishable from the game being broken forever.
 */
function showBootFailure(failure: unknown): void {
  const host = document.getElementById('app');

  if (!(host instanceof HTMLElement)) {
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'boot-failure';
  panel.dataset.testid = 'boot-failure';

  const heading = document.createElement('h1');
  heading.textContent = 'The workstation did not come up';

  const body = document.createElement('p');
  body.textContent = 'Something between here and the server did not arrive. '
    + 'This is a beige box in 1998 and it has done this before; it usually '
    + 'comes up on the second go.';

  const detail = document.createElement('pre');
  detail.className = 'boot-failure-detail';
  detail.dataset.testid = 'boot-failure-detail';
  detail.textContent = failure instanceof Error
    ? failure.message
    : String(failure);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'os-button os-button-primary';
  retry.dataset.testid = 'boot-retry';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => {
    window.location.reload();
  });

  panel.append(heading, body, detail, retry);
  host.replaceChildren(panel);
}

async function boot(): Promise<void> {
  // The engine is wasm now, so it has to be fetched before a world exists.
  // Same-origin, alongside the bundle, and nothing renders until it is here.
  await loadEngine();

  // Storage is a decision somebody else's browser makes, and reading it can
  // throw. Behind a guarded adapter it is always SOMETHING - a real store, or
  // an in-memory one that forgets when the tab does - plus the honest sentence
  // about which. The health latch starts with that sentence on it, so a
  // browser that was never going to keep anything says so from the taskbar
  // rather than at the first day boundary.
  const store = openStorage(() => window.localStorage);
  const health = new SaveHealth(store.reason);
  // The one place in this product that knows a URL exists. Everything else is
  // handed a function that answers, so an app can be reasoned about - and
  // tested - without a network being one of the things it depends on.
  const api = createCloudApi((input, init) => window.fetch(input, init));
  // What the browser is playing as, and the three dates that make it an
  // account. It starts as nothing and is filled in once the Worker has been
  // asked, which happens after the shell is on screen: the badge is HttpOnly,
  // so being told is the only way to know.
  let account: Account | null = null;

  // A week that was played before and ended badly leaves exactly three things
  // behind: the fund, the article that was up, and which attempt this is.
  // Reading the slot LEAVES it - see below for when it is finally let go of.
  const retry = new RetrySlot(store.storage);
  // And a probation that ENDED - passed or fired - leaves an offer taken: the
  // career crossing into the next employer's world. It takes priority over a
  // retry, because taking the offer is the later decision and it leads to a
  // DIFFERENT employer rather than the same Monday. Read-and-leave, exactly like
  // the retry, and let go of only once the arrival is durable.
  const switchSlot = new SwitchSlot(store.storage);
  const arriving = switchSlot.peek();
  const carried = arriving === null ? retry.peek() : null;
  // What this session's world was BUILT from, kept rather than thrown away: the
  // save file stamps it (schema 5) and a firing reads it back, because the
  // estate a retry is owed is the one the lost week OPENED on and the graph
  // stops being able to answer that question the moment anybody fixes anything.
  const opening = arriving !== null
    ? carryForSwitch(arriving)
    : carried === null ? FIRST_WEEK : carryFrom(carried);
  const { engine, tier, seed, employer, week } = createWorldSession(opening);
  // The employer this session is a week at, as LIVE state rather than a
  // constant read once: the driver deals its week, the audit prices installs
  // against its policy, and the offer names the shop after it - and a LOAD can
  // move all of that to a different shop (`onEmployerRestored` below, P1-1). It
  // is resolved off the id the world was actually stood up FROM, so it is right
  // on a first Monday, an arrival, and a retry alike.
  let currentEmployer: Employer = employerFor(employer);
  // The apps' own memory - transcripts, unread flags, the article that was
  // open. It outlives their windows and the save carries it.
  const appState = new AppStateStore();

  if (carried !== null) {
    hydrateFromRetry(appState, carried);
  }

  // And the toys, on a STAY (E11, 0.34.0). The install set is app state rather
  // than world state - it always has been - so it cannot ride the estate
  // whitelist, and it is carried here beside the retry's article for the same
  // reason that one is: it is a screen fact that survives the boundary. Only an
  // arrival that names an arc week has one; a change of employer is a change of
  // machine, and the desktop it comes with is the new shop's.
  if (arriving?.installed !== undefined && arriving.installed.length > 0) {
    appState.patch('installed', { apps: [...arriving.installed] });
  }

  const slot = new SaveSlot(store.storage);
  // The only place real time becomes simulation time. Pause and speed live
  // here rather than in the engine, whose clock counts whole ticks and nothing
  // else - which is what makes a day replayable.
  const day = new DayDriver(engine, COMPANY_IDS.player, seed, {
    // The day boundary is the cheapest save there is: the log has just been
    // checkpointed, so the file carries a baseline and an empty history. The
    // hook runs a whole day after this line, by which time `session` exists.
    onDayBoundary: () => {
      const kept = session.save();

      // The one that used to be thrown away. Storage filling up at clock-off
      // produced a completely normal new morning and a tab that took the day
      // with it when it closed, without a word on screen.
      if (!kept.ok) {
        shell.notify(
          'The day was not saved',
          `${kept.reason} The week is still playable, and closing this tab `
          + 'will lose it.',
        );
      }
    },
    // What the pressure layer cannot see for itself: which slack apps are
    // genuinely on screen right now.
    // And whether there is a desk to be at. Without this the day ran through
    // the POST gag, the login box and every logged-off minute at a minute a
    // second, with the pause button on the far side of a login form.
    atDesk: () => shell.hasDesktop(),
    openSlackApps: () => shell.openSlackApps(),
    // And the one the player is in, which is the only one calming anybody
    // down. The lead sees the rest.
    focusedSlackApp: () => shell.focusedSlackApp(),
    // The web store's audit-risk drip, gated on the employer's policy HERE
    // because the meters have no employer to read: a locked-down shop counts
    // every installed toy, a wild-west one counts none however many there are.
    // Empty on every scripted walk, so the goldens do not move.
    installedAgainstPolicy: () => (
      currentEmployer.installPolicy === 'locked_down'
        ? appState.get().installed.apps.length
        : 0
    ),
    // And the policy on its own, for the beat that reads the audit trail rather
    // than the current install set - it survives an uninstall, so the count
    // above cannot tell it "locked down with nothing installed" from
    // "wild west". Read off THIS employer, not the first one hardcoded: a toy
    // installed at a wild-west shop accrues no suspicion (0.6.0, P1-3).
    installPolicy: () => currentEmployer.installPolicy,
    // The sprawl of the third channel, priced (0.5.0 slice 3): the unread room
    // messages the meters have not billed, and the ledger that remembers the
    // ones they have. The driver bills the difference a point each, once - and
    // reads clear the pile the same way the badge does, because both read the
    // same ledger. The dot does not slide any of this: a room post is not an
    // interruption, so DND has nothing to turn away, which is the whole of why
    // the backlog is the cost DND cannot buy off.
    unreadChannels: () => unreadIds(
      channelFeedThrough(engine.now()),
      appState.get().hubbub.read,
    ),
    attentionCharged: () => appState.get().hubbub.charged,
    noteAttentionCharged: (ids) => {
      appState.patch('hubbub', {
        charged: [...appState.get().hubbub.charged, ...ids],
      });
    },
    onNotice: (title, body) => {
      shell.notify(title, body);
    },
    // The clock dropping to x1, said out loud. It is a self-dismissing toast
    // like every other notice, and it is deliberately about the CLOCK rather
    // than about the thing that came in - that already has its own window and
    // its own notice. What this closes is the 0.3.2 flag: the drop leaves no
    // signal but the speed button, nothing brings the speed back but the player,
    // and an afternoon set to x4 could run the rest of itself at x1 unnoticed.
    onClockDropped: (cause) => {
      const why = cause === 'boss'
        ? 'the lead came round'
        : cause === 'meeting'
          ? 'a meeting started'
          : cause === 'machine'
            ? 'the workstation took the desk'
            : cause === 'chat'
              ? 'a message came in'
              : cause === 'walk_up'
                ? 'somebody came to the desk'
                : 'a call came in';
      shell.notify(
        'Clock dropped to x1',
        `The clock is back to x1 because ${why}. It stays there until you put `
        + 'it back up - nothing speeds it up again but you.',
      );
    },
    // The world has already been told what being caught costs. What is left is
    // the scene, which is a window like any other - closeable, on top of a
    // queue that is still there underneath it.
    onCaught: (appId, tick, evidence, software) => {
      // The reading he was going on, captured in the minute he was standing
      // there. It is null for every conversation about a screen, and for the
      // one about the status it is the number the file's own line was written
      // from - so the scene and the file cannot end up telling two different
      // stories about the same morning. `software` is the installs the audit
      // conversation is about, so its scene names what was actually installed.
      appState.patchExternal('caught', {
        appId,
        at: tick,
        evidence,
        software: software === undefined ? null : [...software],
      });
      shell.openApp('caught');
      shell.notify(
        'A quick word',
        'The lead saw what was on your screen. It has been mentioned, which '
          + 'is how these things start.',
      );
    },
    // He does not raise tickets. He raises concerns, in the thread he has
    // always used, and the thread is the shell's memory rather than the
    // world's - so the driver hands the line over rather than writing it.
    onBossPing: (ping) => {
      pingBossThread(appState, ping.line);
      shell.notify(
        'Message from the lead',
        ping.ticketId === null
          ? ping.line
          : `${ping.line} It is now a ticket, because you made it one.`,
      );
    },
    /**
     * One rung of the invoice ladder (0.30.0, slice 2).
     *
     * The world has already written it down and raised the toast; four of the
     * five rungs are POST and land in the mail app off a derived thread, which
     * is a read and needs nothing here. The fifth is a conversation, and it is
     * the one the research says actually stings - your own account side, in
     * your own chat, about a client who cannot reconcile your hours. It lands
     * in the lead's thread because at a shop this size the lead IS the account
     * side, and it is a remark rather than a ping: there is nothing in it to
     * answer, and a player halfway through another conversation should not
     * have it yanked out from under them.
     */
    onInvoiceEscalation: (rung, _customer, label) => {
      if (rung === 'account_manager') {
        remarkInThread(
          appState,
          MSP_IDS.mspLead,
          `Have you got five minutes about ${label}? Their finance side have `
          + 'stopped the invoice. They are not accusing anybody of anything, '
          + 'they just cannot tie the hours to anything they recognise, and I '
          + 'have to answer that on Thursday.',
          true,
        );
      }
    },
    // And somebody who is not the lead, asking for a favour. Both answers are
    // legitimate; the difference between them turns up on Friday's scorecard
    // rather than in a telling off, which is the whole of the point.
    onDirectMessage: (speaker) => {
      const line = openDirectMessage(appState, speaker);

      if (line !== null) {
        shell.notify('Somebody has messaged you directly', line);
      }
    },
    // And somebody who has said hello and nothing else.
    //
    // The notice deliberately carries the greeting and no question, because
    // there is no question yet - that is the entire beat, and a toast that
    // helpfully summarised what they were about to ask would be the shell
    // solving the problem the mechanic is about. What it does say is the one
    // thing the player can act on: the conversation is open, and asking is
    // faster than waiting.
    onNoHello: (speaker) => {
      const line = openNoHello(appState, engine.graph, speaker);

      if (line !== null) {
        shell.notify(
          'Somebody has said hello',
          `"${line}" That is the whole message. They are typing, and asking `
          + 'them what they want in Chat gets there sooner than waiting for '
          + 'them to finish does.',
        );
      }
    },
    // The question, finally, for a player who waited it out. It is silent on
    // purpose: somebody who asked has had this line for minutes already, and
    // `askedAtLast` is what knows the difference.
    onNoHelloQuestion: (speaker) => {
      askedAtLast(appState, speaker);
    },
    // The phone, and the half hour that was in the summons mail on Monday.
    // Two windows because they are two different things: a call is a window
    // like any other and the normal rules keep applying underneath it - the
    // boss key works, the lead still comes round - while the meeting is a
    // takeover and the desk is genuinely unreachable for the whole of it.
    onInterruption: (view) => {
      shell.openApp(windowFor(view.entry.source));

      if (view.entry.source === 'machine') {
        // Nobody is on the other end of this one, so the notice is the
        // machine's own register rather than a person's: a statement about
        // what is going to happen, with no question in it anywhere.
        shell.notify(
          view.callback
            ? 'The workstation is back about the updates'
            : 'The workstation is restarting',
          view.postponesLeft > 0
            ? `It can be put off ${String(view.postponesLeft)} more time(s), `
              + 'and the windows get shorter each time. The desk is gone '
              + 'while it goes, and every deadline in the queue is not.'
            : 'There is nothing left to put it off with. It takes the desk '
              + 'now, the queue carries on without you, and it will be a '
              + 'few minutes.',
        );
        return;
      }

      if (view.entry.source === 'meeting') {
        shell.notify(
          'You are in a meeting',
          'The one from the summons mail. It is half an hour, it is not '
          + 'optional, and the queue has not been told about it.',
        );
        return;
      }

      // Somebody at the desk, which is its own sentence rather than the
      // phone's with a word changed. The dot is named on purpose: it is the
      // one thing about this interruption a player who has been buying quiet
      // all morning will have a wrong expectation about, and being told once,
      // in the moment, is cheaper than being surprised.
      if (view.entry.source === 'walk_up') {
        shell.notify(
          view.callback
            ? 'They are back, at the minute you asked for'
            : 'Somebody is at your desk',
          view.callback
            ? 'You asked for twenty minutes and they took it. This time it is '
              + 'the conversation.'
            : 'Not the phone - a person, standing there. Your status does not '
              + 'come into it, because they can see you, and the queue carries '
              + 'on regardless.',
        );
        return;
      }

      // A message, which is the one shape of interruption a red dot could have
      // turned away - so an honest dot is named here, once, in the moment: this
      // landed because your status let it, and the same status would have slid
      // it. Told once is cheaper than a player wondering why Do Not Disturb did
      // not stop this the way it stopped the phone.
      if (view.entry.source === 'chat') {
        shell.notify(
          view.callback
            ? 'Back in the chat, at the minute you said'
            : 'A message came in',
          view.callback
            ? 'You said you would get to it, and here it is. This time it is '
              + 'the conversation.'
            : 'Somebody messaged you, and your dot let it through - Do Not '
              + 'Disturb would have slid it. The queue carries on either way.',
        );
        return;
      }

      shell.notify(
        'The phone is ringing',
        view.callback
          ? 'They are ringing back, which is the one you said you would '
            + 'take. This time it is the conversation.'
          : 'Somebody wants you. The queue carries on either way.',
      );
    },
    // And the minute the screen is yours again, however it ended. The world
    // has already been told everything it is owed by the time this fires.
    onInterruptionEnded: (entry) => {
      shell.closeApp(windowFor(entry.source));

      // The reboot's last beat, and the whole comedy register of this game in
      // one line: the screen doubts, and the world has not lost a byte. Every
      // window is where it was, every draft is still in it, the terminal
      // remembers what was typed - because none of it was ever thrown away.
      // The parenthesis is the machine's manners, not a disclaimer.
      if (entry.source === 'machine') {
        shell.notify(
          'Restoring your work... (most of it)',
          'Everything is exactly where you left it, which the workstation '
          + 'could have said with more confidence and chose not to. What is '
          + 'gone is the minutes.',
        );
      }
    },
    // A phone that did not ring, because the dot said not to.
    //
    // Said ONCE a day and quietly, which is the whole register of this one: the
    // durable record is in the call window's own silence, where the player can
    // read at five o'clock exactly who tried and when. A notice per slide would
    // be a filter announcing every call it turned away, which is the opposite
    // of what buying quiet is supposed to feel like - but a filter that never
    // said anything at all would be a mechanic paid for in suspicion and never
    // once seen working.
    //
    // "First today" is asked of the WORLD rather than remembered here: the
    // ledger has just been written, so the answer survives a reload exactly as
    // the record does.
    onInterruptionDodged: (entry, tick) => {
      const today = day.dodgedInterruptions().filter(
        (dodged) => dayForTick(dodged.tick) === dayForTick(tick),
      );

      if (today.length > 1) {
        return;
      }

      // A phone that did not ring, or a message that did not land - the record
      // is the same and the word for it is not, because a chat does not ring
      // and nothing in this world may say it did.
      const subject = flavorText(entry, FLAVOR.subject) ?? 'Somebody wanted you';

      shell.notify(
        entry.source === 'chat'
          ? 'A message did not land'
          : 'The phone did not ring',
        entry.source === 'chat'
          ? `${subject}. They saw the dot and left it - it is in the call `
            + 'window with the time on it, and they may well try again.'
          : `${subject}. They saw the dot and did not put it through. It is in `
            + 'the call window with the time on it, and they may well try again.',
      );
    },
    // And somebody noticing that the dot says Away while the queue moves.
    //
    // The world has already taken the reputation and written down that this
    // person has had their one thought about it today; the notice that says a
    // number moved is the driver's. What is left is what they SAY, which is
    // content and lands in the conversation they would have said it in - so
    // the player can go and read who it was, in their own voice, rather than
    // being told a meter went down.
    onPresenceNoticed: (reporter) => {
      const line = awayNoticedLine(reporter);

      if (line !== null) {
        remarkInThread(appState, reporter, line);
      }
    },
    // Friday at three. The world has already decided - the verb is guarded on
    // the one number that decides it - so what is left is the conversation.
    onReview: (outcome) => {
      shell.openApp('review');
      shell.notify(
        outcome === 'passed' ? 'Probation over' : 'A quick word',
        outcome === 'passed'
          ? 'The lead has had a look at the week and the week is fine. Not '
            + 'brilliant. Fine.'
          : 'The lead would like a word in the room with the blind that does '
            + 'not go all the way down.',
      );
    },
    // Five o'clock on a Friday that went well.
    onBeerUnlocked: () => {
      shell.openApp('beer');
      shell.notify(
        'There is one in the fridge',
        'With your name on it, allegedly. The probation is over, which is '
          + 'what the lock on it has been about all week.',
      );
    },
    onWeekEnd: (outcome) => {
      shell.openApp('weekend');
      shell.notify(
        'That is the week',
        outcome === 'passed'
          ? 'Five days, one review and a fund that has moved. There is a job '
            + 'elsewhere on the table, and there is a Monday here.'
          : 'Five days and a short conversation. The fund is still yours, '
            + 'which is the only part of this they cannot take back.',
      );
    },
  },
  // No injected plan reader (the shipped shell deals its own days), then THIS
  // employer's content: the week the driver schedules, the rooms Hubbub draws
  // and whether the lead pings. Threading it off the session is what stops an
  // arrival at a second employer from driving the probation week over its estate
  // (0.6.0, P1-2/P1-4) - the `service:chassis-fan` crash the de-global exposed.
  undefined,
  // The week off the SESSION rather than off the employer record: the session
  // is what resolved it, from the employer AND the attempt AND where in the arc
  // this week sits (`week-source.ts`), and a boot that went back to the
  // employer record would be a second answer to a question with one answer.
  week,
  currentEmployer.channels,
  currentEmployer.runsBossPings);

  const session = createShellSession({
    engine,
    appState,
    day,
    slot,
    retry,
    switch: switchSlot,
    actor: COMPANY_IDS.player,
    // Which employer every save this session writes is stamped with, read back
    // off the session that stood the world up rather than assumed - so an
    // arrival at the second employer stamps ITS id, and the switch verb reads
    // the same value to work out where the next job after this one is.
    employer,
    // And the building this week opened on, stamped into every save beside it.
    carried: opening.estate ?? [],
    // When a LOAD stands a different shop up than this tab booted at, the rest
    // of the shell has to follow: the audit prices installs against the loaded
    // shop's policy, and the offer names the shop after it (0.6.0, P1-1). The
    // driver re-points its own week inside `load`; this catches everything else
    // that reads the employer.
    onEmployerRestored: (id) => {
      currentEmployer = employerFor(id);
    },
    // A throwaway engine for the preflight: a save is tried in a session
    // nobody is playing before it replaces the one somebody is.
    probeEngine: () => new WasmEngine(seed),
    // Every write, automatic or not, reports here. Two of the three have no
    // control a player can see, and those were the two whose failures vanished.
    onWrite: (outcome: SaveOutcome) => {
      if (outcome.ok) {
        health.succeeded();
        // And up to the badge, if there is one and the two copies have been
        // compared. Nothing waits for this: the day has already been kept in
        // the place that matters, and the player has already been told so.
        cloud.push();
        return;
      }

      health.failed(outcome.reason);
    },
    // A world that never happened cannot be un-happened in place: the retry
    // has been written down, so the cheapest honest way to build the week
    // again is to start the page again.
    restart: () => {
      window.location.reload();
    },
  });

  // The badge's copy of the week. It is built here, before the carry-over is
  // acknowledged, because that acknowledgement WRITES a save - and a push that
  // happened before the two copies had been compared would send a fresh Monday
  // up over somebody's Thursday. `CloudSaves` starts with pushing switched off
  // for exactly that reason; `settle()` below is what switches it on.
  const cloud = new CloudSaves({
    api,
    slot,
    storage: store.storage,
    load: () => {
      const loaded = session.load();

      if (!loaded.ok) {
        shell.notify('The badge\'s copy would not open', loaded.reason);
      }
    },
  });

  // Whether there was already a saved week in this browser when this session
  // booted, read BEFORE either acknowledgement - one of them is about to write
  // a save into an empty slot, and afterwards the answer would be "yes" for a
  // week nobody had played. It decides only which sentence the player gets: a
  // carry-over that was not let go of is either a browser that would not keep
  // the new week, or a week already in the slot that this boot refused to
  // write over. Two different facts, and telling somebody the wrong one about
  // their own save is how a working Load button goes unclicked.
  const savedWeekAlreadyHere = slot.exists();

  // And here is where the carry-over is finally let go of, and not a line
  // earlier: the new week is saved first, and the record is dropped only if
  // that write worked. See `acknowledgeCarry` for what this is protecting.
  // The answer is kept rather than ignored: `false` means the new attempt is
  // not durable, so the carry-over is deliberately still sitting there - which
  // is the honest failure, and which the player has to be told, because a
  // refresh from here starts this attempt again from the fund they carried in.
  const carryUnsaved = carried !== null
    && !acknowledgeCarry(retry, () => session.save(), slot);

  // And the switch's carry is let go of the same way and for the same reason:
  // the arrival is saved FIRST, and the record of the career that crossed the
  // threshold is dropped only once that write worked. A browser that would not
  // keep the arrival keeps the switch record and asks again next boot, which is
  // the honest failure - and the player is told, because a refresh from here
  // stands the new employer up again from the same carried career.
  const switchUnsaved = arriving !== null
    && !acknowledgeCarry(switchSlot, () => session.save(), slot);

  const context: ShellContext = {
    manifest: APP_MANIFEST,
    saveHealth: health,
    identity: {
      account: () => account,
      signIn: async (typed) => {
        const answer = await api.logIn(typed);

        if (answer.ok) {
          account = answer.value;
          shell.identityChanged();
          void settleWithBadge();
        }

        return answer;
      },
      issueBadge: async () => {
        const answer = await api.register();

        if (answer.ok) {
          account = answer.value;
          shell.identityChanged();
          // A brand-new badge has nothing on it, so this is a push rather than
          // a pull - but it goes through the same comparison, because "nothing
          // on the badge" is a thing to be TOLD rather than assumed: a week
          // that starts at Monday because the badge was empty says so.
          void settleWithBadge();
        }

        return answer;
      },
    },
    report: (submission) => api.sendFeedback(submission),
    tier,
    graph: engine.graph,
    appState,
    day,
    session,
    // Which employer this session is a week at - the offer surface reads it to
    // work out where the next job is, and it is the id the world was actually
    // stood up FROM (`createWorldSession` above), so it is right on an arrival
    // as well as on a first Monday.
    employer,
    clock: {
      now: () => engine.now(),
      onTick: (listener) => engine.onTick(listener),
    },
    user: {
      displayName: 'Pat Pending',
      account: `${COMPANY.domain}\\ppending`,
      passwordHint: 'Hint: it is on the sticky note under the keyboard. '
        + 'Any password works; nobody has checked since 1998.',
      node: COMPANY_IDS.player,
    },
    // Through the DAY rather than straight at the engine: a dispatch is not
    // only a change to the world, it is the minute somebody first did
    // something about a ticket and a line on the handoff form that ticket will
    // eventually carry. Both are written where the action happens.
    dispatch: (id, actor, target, params) => day.dispatch(
      id,
      actor,
      target,
      params,
    ),
    dispatchLog: () => engine.dispatchLog(),
    // A load is a world change like any other, and the biggest one there is:
    // every open app is showing a world that no longer exists until it
    // repaints. Without this, the desktop kept the previous session on screen
    // until some unrelated mutation happened along.
    onWorldChange: (listener) => engine.onEvent((event) => {
      if (event.type === 'graph:mutated' || event.type === 'world:restored') {
        listener();
      }
    }),
  };

  // What the workstation installed overnight.
  //
  // Read BEFORE the shell is built, because the answer decides which SCREEN
  // the boot goes to: a build that changed under this browser plays the update
  // animation between the POST and the log-on box, and the notes it is the
  // changelog of open on the desktop the moment there is one. One animation,
  // two masters - the fiction's updates and ours.
  //
  // The version is recorded here rather than when the window is closed. A
  // player who shuts the tab during the boot gag has still had this build
  // installed, and a record that only lands if somebody reads the notes is a
  // record that shows the same notes every morning until they do.
  const versions = new VersionSlot(store.storage);
  const installed = updateOnBoot(versions.read(), BUILD_VERSION);
  versions.write(BUILD_VERSION);

  // The "here is your new machine" beat, on the same screen the update wears.
  // An arrival at a new employer plays the install ceremony with the shop's
  // name on it before the log-on box - a new starter's first boot IS an update,
  // as far as a beige box is concerned - and it rides the existing boot ->
  // installing -> login path rather than a new state. A real version update on
  // the same boot keeps its own subject; the two coinciding is rare and the
  // arrival is the one worth naming when they do.
  const arrivalSubject = arriving === null
    ? undefined
    : `Setting up your workstation - new starter - ${
      employerName(arriving.employer)
    }`;

  const shell = new Shell(
    mountPoint(),
    context,
    installed.length > 0 || arriving !== null,
    arrivalSubject,
  );

  engine.onEvent((event) => {
    if (event.type === 'ticket:resolved') {
      shell.notify(
        'Ticket resolved',
        `${ticketTitle(event.id)} - closed. Reputation nudged upward by an `
          + 'amount nobody will mention.',
      );
    }

    if (event.type === 'ticket:breached') {
      shell.notify(
        'SLA breached',
        `${ticketTitle(event.id)} - the timer ran out. An escalation mail is `
          + 'already being drafted about you.',
      );
    }

    if (event.type === 'ticket:spawned') {
      shell.notify(
        'New ticket',
        `${ticketTitle(event.id)} - it is in the queue, and it is yours.`,
      );
    }
  });

  globalThis.careerSim = Object.freeze({
    hash: () => engine.snapshotHash(),
    tick: () => engine.now(),
    screens: () => appState.snapshot(),
    field: (node: string, name: string) => engine.graph.getField(node, name),
  });

  /**
   * The badge's copy of the week, compared with this browser's, once.
   *
   * It runs when a badge turns up - at boot if the browser is already carrying
   * one, or the moment somebody types theirs on the log-on screen - and three
   * of its outcomes say something out loud. Nothing waits for it, and nothing
   * depends on it having happened: `settle` answers `unavailable` for a build
   * served without a Worker behind it, which is what the local journey suite
   * runs against.
   *
   * The two FRESH answers are the ones this slice exists for. A badge with no
   * week on it used to start a new one in silence, which is indistinguishable
   * from a save that went missing - and the player it happens to is the player
   * who has just typed in a number specifically to get their week back.
   */
  async function settleWithBadge(): Promise<void> {
    const outcome = await cloud.settle();

    if (outcome === 'adopted') {
      shell.notify(
        'Your badge had a later week on it',
        'The week saved against your badge was newer than the one in this '
          + 'browser, so it is the one you are looking at. The other one has '
          + 'not been thrown away.',
      );
      return;
    }

    if (outcome === 'fresh') {
      shell.notify(
        'Nothing is filed against that badge',
        'There is no week on it yet, so this is Monday morning, first day, '
          + 'same as everybody else got. Anything kept from here on goes up '
          + 'against the badge.',
      );
      return;
    }

    if (outcome === 'fresh-broken') {
      shell.notify(
        'The week on that badge will not open',
        'It was written by a version of this workstation that no longer '
          + 'exists, and nothing here can make sense of it. You are starting '
          + 'the week again; the next day kept will file over it.',
      );
    }
  }

  if (installed.length > 0) {
    shell.openApp('updates');
    shell.notify(
      'DeskPro WorkGroup has been updated',
      `Update ${BUILD_VERSION} was installed while nobody was at the desk. `
        + 'The window says what it was for.',
    );
  }

  // Both of these are raised BEFORE the shell starts, with no desktop on
  // screen to raise them on - which is exactly the case the notification queue
  // exists for, and now the only one that can happen: the day itself is frozen
  // until somebody is at a desk.
  if (store.reason !== null) {
    shell.notify('Nothing is being saved', store.reason);
  }

  if (carryUnsaved) {
    shell.notify(
      'This attempt is not saved',
      savedWeekAlreadyHere
        ? 'There is already a saved week in this browser, and it has been left '
          + 'exactly as it is rather than written over - open it from Load if it '
          + 'is the one you want. Everything works, and refreshing the page will '
          + 'start this attempt again from the fund you carried in.'
        : 'The browser would not keep the new week. Everything works, and '
          + 'refreshing the page will start this attempt again from the fund you '
          + 'carried in.',
    );
  }

  // The arrival, said out loud once. A new employer, a Monday, and the two
  // things that crossed with you: the standing you were hired on and the fund
  // that has never been anybody's but yours. It is the "you got the job" half of
  // the transition, the install screen having just done the "here is your new
  // machine" half.
  if (arriving !== null) {
    shell.notify(
      `First day at ${employerName(arriving.employer)}`,
      'New desk, new machine, same you. The reputation and the title came with '
        + `you, and so did the fund - £${
          (arriving.career.farmFund / 100).toFixed(2)
        } towards the farm, exactly where you left it.`,
    );
  }

  if (switchUnsaved) {
    shell.notify(
      'This move is not saved',
      savedWeekAlreadyHere
        ? 'There is already a saved week in this browser, and it has been left '
          + 'exactly as it is rather than written over - open it from Load if it '
          + 'is the one you want. Everything works, and refreshing the page will '
          + 'stand the new employer up again from the same career you carried in.'
        : 'The browser would not keep the arrival. Everything works, and '
          + 'refreshing the page will stand the new employer up again from the '
          + 'same career you carried in.',
    );
  }

  shell.start();
  // The interval is shorter than a tick so that a faster clock is a faster
  // clock, rather than a burst of minutes once a second; the driver keeps the
  // remainder, so no real time is lost between turns.
  window.setInterval(() => {
    day.step(DRIVER_INTERVAL_MS);
  }, DRIVER_INTERVAL_MS);

  // Asking the building who this browser is - AFTER the shell is on screen,
  // and without anything waiting for the answer. The badge is a convenience
  // and the week is not: a boot that blocked on a network call would make the
  // optional half of this product the reason the essential half was slow.
  void (async (): Promise<void> => {
    const who = await api.session();

    if (who.ok && who.value !== null) {
      account = who.value;
      // The log-on screen has already been painted, with no badge on it: this
      // is what puts the record card on a screen that is currently up.
      shell.identityChanged();
      await settleWithBadge();
    }
  })();
}

void boot().catch((failure: unknown) => {
  showBootFailure(failure);
});
