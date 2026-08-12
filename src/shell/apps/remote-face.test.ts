import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../../engine-api/load-node';
import { EMPLOYER_IDS, employerFor } from '../../world/employers';
import {
  FIELDS,
  MACHINE_OS,
  MACHINE_ROLES,
  machineOsOf,
  machineRoleOf,
} from '../../world/fields';
import { MSP_IDS } from '../../world/msp-company';
import { createWorldSession, FIRST_WEEK } from '../../world/session';
import { AppStateStore } from '../app-state';
import {
  remoteFace,
  type RemoteFace,
  remoteSession,
  WINDOWS_FURNITURE,
} from './remote';
import type { GameApi } from './types';

/**
 * THE STANDING GATE on #55: Remote Assist never draws the Windows caricature
 * on a machine that is not a Windows box.
 *
 * The defect it forbids shipped in 0.7.0 and lived until 0.33.0. The viewer
 * drew My Documents, a Q4 file, a Recycle bin and a Start button onto EVERY
 * machine it was pointed at - Meridian's Linux app server, the studio's project
 * NAS, and from 0.32.0 three Macs. The estate refused those boxes truthfully on
 * the wire the whole time; the one surface that draws a screen lied.
 *
 * So the gate is not "the Mac has a face now". It is a sweep of EVERY machine
 * in EVERY world this build ships, asking one question of each: would the
 * viewer put Windows furniture on it, and is that box a Windows box. Revert the
 * fix - hand every session the Windows face again - and this reds once per
 * non-Windows machine in the estate, which since 0.7.0 is Meridian's fleet.
 *
 * It is asked of the FACE rather than of a rendered document, because this
 * suite has no DOM: the face is the data the renderer is built from, the
 * furniture exists only as fields on it, and the test ids are read from the
 * same frozen object the renderer writes onto the elements - so a rename
 * cannot quietly split the two apart. The DOM half is walked on the built
 * artifact in `e2e/remote.spec.ts` and `e2e/msp.spec.ts`.
 */

beforeAll(() => {
  loadEngineForTests();
});

interface Machine {
  readonly world: string;
  readonly id: string;
  readonly hostname: string;
  readonly os: string;
  readonly role: string;
  readonly face: RemoteFace;
}

/**
 * Every machine in every shipped world, with the face the viewer would draw on
 * it.
 *
 * All four employers, because the bug was in a shared window and the estates
 * are what differ: a gate that only looked at the MSP would have passed on the
 * day the probation shop was given a Linux box.
 */
function everyMachine(): readonly Machine[] {
  const found: Machine[] = [];

  for (const employer of EMPLOYER_IDS) {
    const world = createWorldSession({ ...FIRST_WEEK, employer });
    const api: Pick<GameApi, 'graph' | 'appState' | 'actor'> = {
      graph: world.engine.graph,
      appState: new AppStateStore(),
      actor: employerFor(employer).playerId,
    };

    for (const machine of world.engine.graph.nodesOfKind('machine')) {
      const model = remoteSession(api, machine, {
        picked: null,
        outcome: null,
        refusal: null,
      });

      found.push({
        world: employer,
        id: machine.id,
        hostname: model.hostname,
        os: machineOsOf(machine.fields[FIELDS.machineOs]),
        role: machineRoleOf(machine.fields[FIELDS.machineRole]),
        face: remoteFace(model),
      });
    }
  }

  return found;
}

/**
 * The Windows caricature's furniture that a face would put on screen, by test
 * id - read off the SAME frozen object the renderer writes onto its elements,
 * so the gate and the document cannot drift.
 */
function windowsFurnitureOn(face: Readonly<RemoteFace>): readonly string[] {
  return [
    ...(face.icons.length > 0 ? [WINDOWS_FURNITURE.icons] : []),
    ...(face.dialog === null ? [] : [WINDOWS_FURNITURE.dialog]),
    ...(face.bar === 'taskbar' ? [WINDOWS_FURNITURE.start] : []),
  ];
}

describe('the remote viewer never lies about which machine it is on', () => {
  const machines = everyMachine();

  it('finds machines in every world, including non-Windows ones', () => {
    // The gate below is a sweep, and a sweep over nothing passes. This is the
    // half that says the sweep had something to look at: four estates, and a
    // fleet that is not Windows in at least one of them.
    expect(machines.length).toBeGreaterThan(20);
    expect(new Set(machines.map((machine) => machine.world)).size)
      .toBe(EMPLOYER_IDS.length);
    expect(machines.filter((machine) => machine.os === MACHINE_OS.linux).length)
      .toBeGreaterThan(0);
    expect(machines.filter((machine) => machine.os === MACHINE_OS.mac).length)
      .toBeGreaterThan(0);
  });

  /** THE GATE. */
  it('draws Windows furniture on Windows boxes and on nothing else', () => {
    const lying = machines
      .filter((machine) => machine.os !== MACHINE_OS.windows)
      .filter((machine) => windowsFurnitureOn(machine.face).length > 0)
      .map((machine) => `${machine.world}/${machine.hostname} (${machine.os})`);

    expect(
      lying,
      'these boxes are not Windows boxes and the viewer draws a Windows '
        + 'desktop on them, which is #55',
    ).toEqual([]);

    // And the other direction, so the fix cannot be "draw nothing anywhere":
    // every Windows box still gets the caricature it has had since 0.7.0, all
    // three pieces of it.
    for (const machine of machines) {
      if (machine.os !== MACHINE_OS.windows) {
        continue;
      }

      expect(windowsFurnitureOn(machine.face), machine.hostname).toEqual([
        WINDOWS_FURNITURE.icons,
        WINDOWS_FURNITURE.dialog,
        WINDOWS_FURNITURE.start,
      ]);
    }
  });

  /**
   * The claim the Linux face MAKES, kept true by the estate.
   *
   * That face says out loud that there is no graphical session on the box -
   * which is true of every Linux machine this game has ever seeded, because
   * every one of them is a server. Seed a Linux WORKSTATION and that sentence
   * becomes a lie about somebody's desk, so this fails HERE, next to the face
   * that would say it, rather than shipping quietly.
   */
  it('has no Linux desktop anywhere for the console face to libel', () => {
    const desks = machines
      .filter((machine) => machine.os === MACHINE_OS.linux)
      .filter((machine) => machine.role === MACHINE_ROLES.workstation)
      .map((machine) => `${machine.world}/${machine.hostname}`);

    expect(
      desks,
      'a Linux workstation is somebody sitting at a desktop, and the console '
        + 'face tells the player there is no graphical session on it',
    ).toEqual([]);

    // And what the face is instead: the box's own login prompt, and no
    // furniture, no bar and no clock - a server has none of them.
    for (const machine of machines) {
      if (machine.os !== MACHINE_OS.linux) {
        continue;
      }

      expect(machine.face.console, machine.hostname)
        .toBe(`${machine.hostname} login:`);
      expect(machine.face.bar, machine.hostname).toBeNull();
      expect(machine.face.menuBar, machine.hostname).toBe(false);
      expect(machine.face.clock, machine.hostname).toBe(false);
    }
  });

  /**
   * The Mac face: the two layout facts the chrome slice ships, and nothing
   * invented on top of them.
   */
  it('gives a Mac a menu bar and a dock, and no desktop it does not have', () => {
    const macs = machines.filter((machine) => machine.os === MACHINE_OS.mac);

    for (const mac of macs) {
      expect(mac.face.menuBar, mac.hostname).toBe(true);
      expect(mac.face.bar, mac.hostname).toBe('dock');
      // The clock is real - the world knows the time. Everything else a Mac
      // desktop has, this estate does not hold, so none of it is drawn.
      expect(mac.face.clock, mac.hostname).toBe(true);
      expect(mac.face.icons, mac.hostname).toEqual([]);
      expect(mac.face.dialog, mac.hostname).toBeNull();
      expect(mac.face.console, mac.hostname).toBeNull();
    }
  });
});

/**
 * The TCC state, on the screen it is about (#55, and the 0.32.0 fiction hole).
 *
 * 0.32.0 shipped the black-square mechanic as a TICKET: macOS keeps screen
 * capture behind a consent only the person at the keyboard can give, the studio
 * granted it everywhere except one box, and the desk's job is to talk somebody
 * through granting it. The ticket closes from a chat window, so nobody had to
 * open the viewer - and if they had, they would have seen a Windows desktop on
 * a Mac that is supposed to be showing them nothing at all.
 *
 * So the consent is read HERE, off the same field the MDM refusal reads, and
 * the black frame clears the face with it: a blackout drawn over a dock
 * silhouette would be this window showing a player the screen it has just said
 * it cannot see.
 */
describe('the black square, on the screen it is about', () => {
  function macSession(consent: boolean | null): RemoteFace {
    const world = createWorldSession({ ...FIRST_WEEK, employer: 'msp' });

    if (consent !== null) {
      world.engine.applySetup([{
        op: 'setField',
        id: MSP_IDS.marloweDesignMac,
        field: FIELDS.tccScreenRecording,
        value: consent,
      }]);
    }

    const machine = world.engine.graph.getNode(MSP_IDS.marloweDesignMac);

    if (machine === undefined) {
      throw new Error('The studio has no design Mac in it.');
    }

    return remoteFace(remoteSession(
      {
        graph: world.engine.graph,
        appState: new AppStateStore(),
        actor: employerFor('msp').playerId,
      },
      machine,
      { picked: null, outcome: null, refusal: null },
    ));
  }

  it('is black before the grant and a screen after it', () => {
    // The seeded state: the studio's Macs have the support tool approved,
    // because a desk that could never see a screen would not have a contract.
    const granted = macSession(null);

    expect(granted.blackout).toBe(false);
    expect(granted.menuBar).toBe(true);

    // And the ticket's state - the consent taken away on this one box - is a
    // black frame with NOTHING on it. Not a dimmed desktop, not a caricature
    // behind a veil: the viewer is handed a black rectangle, which is what
    // makes the fault legible and what the reporter is describing.
    const denied = macSession(false);

    expect(denied.blackout).toBe(true);
    expect(denied.menuBar).toBe(false);
    expect(denied.bar).toBeNull();
    expect(denied.clock).toBe(false);
    expect(denied.icons).toEqual([]);
    expect(denied.dialog).toBeNull();
    expect(windowsFurnitureOn(denied)).toEqual([]);
  });

  it('blacks out nothing that has no consent to be missing', () => {
    // The null, and why it is not `false`. A Windows box carries no Screen
    // Recording consent at all, and reading its absence as a denial would
    // black out every screen in the estate - which is the bug the three-valued
    // field exists to make impossible.
    for (const machine of everyMachine()) {
      if (machine.os === MACHINE_OS.mac) {
        continue;
      }

      expect(machine.face.blackout, machine.hostname).toBe(false);
    }
  });
});
