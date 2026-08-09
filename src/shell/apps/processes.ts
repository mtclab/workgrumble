/**
 * What is actually OPEN on this desk, as the machine would report it.
 *
 * The slack mechanic has always been about what the lead can see when he comes
 * round the corner. This is the same question asked by a machine rather than by
 * a person: a browser that is open is a process that is running, and a process
 * that is running is on a list anybody with the right window can read. If the
 * lead can read the box, so can the player - which is the whole reason this
 * exists rather than the game keeping the open windows to itself.
 *
 * Nothing in here is world state. A process list is what is on screen NOW; it
 * is derived from the same window state the save carries and the boss system
 * reads, so it cannot disagree with either. Nothing here touches the DOM, the
 * graph or the clock, and the numbers are pure functions of the program name so
 * that the same window is the same process in every session.
 *
 * Services are not in here and processes are not in the services list: they are
 * two different questions about the same machine and a world that mixed them
 * would be teaching something wrong.
 */

import type { OpenWindowState } from '../app-state';
import { stableHash } from './cmd-net';

export interface ProgramImage {
  /** The file the parody OS says it is running. */
  readonly image: string;
  /** What the window calls itself, for the taskbar rather than the list. */
  readonly title: string;
}

/**
 * One image name per installed app.
 *
 * Written down rather than derived from the app id, because an image name is
 * the thing a person recognises in a process list - `EVENTVWR.EXE` reads as
 * the Event Viewer and `EVENTS.EXE` reads as nothing - and because the joke
 * only lands if the toy is called what a toy would be called. A missing entry
 * is a gate failure in `processes.test.ts` rather than a silent fallback with
 * an invented name in it.
 */
export const PROGRAM_IMAGES: Readonly<Record<string, ProgramImage>> = {
  brief: { image: 'SHIFTBRF.EXE', title: 'Morning brief' },
  scorecard: { image: 'DAYEND.EXE', title: 'Day scorecard' },
  weekend: { image: 'WEEKEND.EXE', title: 'Week summary' },
  caught: { image: 'MANAGER.EXE', title: 'A word' },
  // One program for both kinds of conversation, and the image stays PHONE.EXE
  // for the reason a 1998 desktop would: the phone applet is the only thing
  // this workstation has ever had for talking to a person, so the day opens it
  // whether the person is on the other end of a line or standing behind you.
  call: { image: 'PHONE.EXE', title: 'Somebody wants you' },
  meeting: { image: 'CALENDAR.EXE', title: 'In a meeting' },
  reboot: { image: 'WUPDATE.EXE', title: 'Workstation update' },
  review: { image: 'REVIEW.EXE', title: 'Probation review' },
  beer: { image: 'FRIDGE.EXE', title: 'The fridge' },
  tickets: { image: 'HELPDESK.EXE', title: 'Ticket queue' },
  // The plan surface (0.29.0). Named for the thing rather than for the window,
  // the way the rest of this list is: a PSA is what the trade calls the tool
  // that carries the projects, and the process list is where a workstation of
  // this era told you what a friendly window was really called.
  projects: { image: 'PSAPLAN.EXE', title: 'Projects' },
  directory: { image: 'ACTDICT.EXE', title: 'Active Dictionary' },
  remote: { image: 'RASSIST.EXE', title: 'Remote Assist' },
  monitor: { image: 'RMMBOARD.EXE', title: 'Monitoring board' },
  events: { image: 'EVENTVWR.EXE', title: 'Event Viewer' },
  chat: { image: 'WGCHAT.EXE', title: 'Chat' },
  hubbub: { image: 'HUBBUB.EXE', title: 'Hubbub' },
  mail: { image: 'WGMAIL.EXE', title: 'Mail' },
  cmd: { image: 'CMD.EXE', title: 'Support Terminal' },
  kb: { image: 'KBASE.EXE', title: 'Knowledge Base' },
  about: { image: 'WINVER.EXE', title: 'About This Workstation' },
  // The control-panel applet the desktop is chosen in, named the way the
  // caricature named it: a .CPL wearing an .EXE, because that is what the
  // process list of the era showed when you opened one.
  display: { image: 'DESKCPL.EXE', title: 'Display Properties' },
  updates: { image: 'UPDHIST.EXE', title: 'Update History' },
  feedback: { image: 'REPORTIT.EXE', title: 'Report a Problem' },
  bubbles: { image: 'BUBBLES.EXE', title: 'Bubble Break' },
  browser: { image: 'NAVIGATE.EXE', title: 'Browser' },
};

export interface RunningProgram {
  readonly image: string;
  readonly title: string;
  readonly pid: number;
  /** Working set, in whole kilobytes, as the list prints it. */
  readonly memoryKb: number;
  /** Minimised is still running, which is the entire point of the boss key. */
  readonly minimized: boolean;
  /** The app whose window this is, or null for the machine's own processes. */
  readonly appId: string | null;
}

/** The lowest pid this session hands out, well clear of the system's own. */
const FIRST_PID = 1024;
const PID_RANGE = 3000;

/** Working sets somewhere between "a browser" and "a beige box". */
const FIRST_KB = 640;
const KB_RANGE = 9000;

function pidFor(image: string): number {
  // Even numbers only, because they always were: it is the sort of detail
  // that costs a line and is wrong in every game that skips it.
  return FIRST_PID + ((stableHash(image) % PID_RANGE) & ~1);
}

function memoryFor(image: string): number {
  return FIRST_KB + (stableHash(`mem:${image}`) % KB_RANGE);
}

/**
 * The four the machine is running whether anybody is at the desk or not.
 *
 * The idle process is the joke that is also true - the number beside it is how
 * much of this workstation is doing nothing - and the other three are the ones
 * a real list has at the top of it every time.
 */
export const SYSTEM_PROCESSES: readonly RunningProgram[] = Object.freeze([
  {
    image: 'System Idle Process',
    title: 'Doing nothing, professionally',
    pid: 0,
    memoryKb: 16,
    minimized: false,
    appId: null,
  },
  {
    image: 'SERVICES.EXE',
    title: 'Service Control Manager',
    pid: 216,
    memoryKb: 3_264,
    minimized: false,
    appId: null,
  },
  {
    image: 'SPOOLSV.EXE',
    title: 'Print Spooler',
    pid: 388,
    memoryKb: 2_108,
    minimized: false,
    appId: null,
  },
  {
    image: 'EXPLORER.EXE',
    title: 'Desktop and taskbar',
    pid: 604,
    memoryKb: 6_820,
    minimized: false,
    appId: null,
  },
]);

export function programImage(appId: string): ProgramImage {
  // A window with no image name is still a window somebody has open, and
  // hiding it would be the one thing this list must never do.
  return PROGRAM_IMAGES[appId]
    ?? { image: `${appId.toUpperCase()}.EXE`, title: appId };
}

/**
 * Everything running on the desk: the machine's own, then one per open window,
 * in the order the windows were opened.
 */
export function runningPrograms(
  open: readonly OpenWindowState[],
): readonly RunningProgram[] {
  return [
    ...SYSTEM_PROCESSES,
    ...open.map((window) => {
      const program = programImage(window.appId);

      return {
        image: program.image,
        title: program.title,
        pid: pidFor(program.image),
        memoryKb: memoryFor(program.image),
        minimized: window.minimized,
        appId: window.appId,
      };
    }),
  ];
}
