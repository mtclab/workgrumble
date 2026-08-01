import { describe, expect, it } from 'vitest';

import { APP_MANIFEST } from './index';
import {
  PROGRAM_IMAGES,
  programImage,
  runningPrograms,
  SYSTEM_PROCESSES,
} from './processes';

/**
 * The process list is the boss's-eye view of the slack mechanic, and it only
 * works if it is the truth: what is open is on it, what is closed is not, and a
 * minimised window is still running. These are the gates for all three.
 */
describe('what is running on this desk', () => {
  it('has an image name for every app this build installs', () => {
    for (const app of APP_MANIFEST) {
      const program = PROGRAM_IMAGES[app.id];

      expect(program, app.id).toBeDefined();
      expect(program?.image, app.id).toMatch(/^[A-Z0-9]{1,8}\.EXE$/u);
      expect(program?.title.length ?? 0, app.id).toBeGreaterThan(0);
    }

    // And nothing in the table that this build does not install: a process
    // list with a program nobody can open is a list nobody can trust.
    const installed = new Set(APP_MANIFEST.map((app) => app.id));

    for (const id of Object.keys(PROGRAM_IMAGES)) {
      expect(installed.has(id), id).toBe(true);
    }
  });

  it('lists the machine first, then one process per open window', () => {
    const programs = runningPrograms([
      { appId: 'browser', minimized: false },
      { appId: 'bubbles', minimized: true },
    ]);

    expect(programs.slice(0, SYSTEM_PROCESSES.length)).toEqual(SYSTEM_PROCESSES);
    expect(programs.map((program) => program.image)).toContain('NAVIGATE.EXE');
    expect(programs.map((program) => program.image)).toContain('BUBBLES.EXE');

    // The whole point: minimised is still running. The panic key moves what is
    // on the screen and nothing at all on this list.
    const bubbles = programs.find((program) => program.appId === 'bubbles');

    expect(bubbles?.minimized).toBe(true);
  });

  it('drops a window the moment it is closed', () => {
    const open = runningPrograms([{ appId: 'browser', minimized: false }]);
    const shut = runningPrograms([]);

    expect(open.map((program) => program.appId)).toContain('browser');
    expect(shut.map((program) => program.appId)).not.toContain('browser');
  });

  it('gives the same window the same pid every session', () => {
    const first = runningPrograms([{ appId: 'cmd', minimized: false }]);
    const second = runningPrograms([{ appId: 'cmd', minimized: false }]);

    expect(first).toEqual(second);
    expect(first.at(-1)?.pid).toBeGreaterThan(0);
    expect(first.at(-1)?.memoryKb).toBeGreaterThan(0);
  });

  it('still names a window whose app has no entry', () => {
    expect(programImage('nothing-here').image).toBe('NOTHING-HERE.EXE');
  });
});
