import { describe, expect, it } from 'vitest';

import {
  PROMOTION_REPUTATION,
  SYSTEMS_ENGINEER_TITLE,
} from '../../world/actions';
import { COMPANY_IDS } from '../../world/company';
import { WasmEngine } from '../../engine-api';
import {
  FIELDS,
  PLAYER_TIERS,
  type PlayerTier,
  SYSTEMD_STATES,
} from '../../world/fields';
import { linuxUnitId } from '../../world/services';
import {
  createWorldSession,
  WORLD_SEED,
  type WorldSession,
} from '../../world/session';
import { AppStateStore } from '../app-state';
import { DayDriver } from '../day-driver';
import { parseCommand } from './cmd-parse';
import { executeCommand, type CommandResult } from './cmd-run';
import {
  ed25519Fingerprint,
  executeUnix,
  parseUnixCommand,
  readKnownHosts,
  type SshSession,
  unixPrompt,
} from './cmd-unix';
import type { GameApi } from './types';

function apiFor(session: WorldSession): GameApi {
  return {
    graph: session.engine.graph,
    appState: new AppStateStore(),
    day: new DayDriver(session.engine, COMPANY_IDS.player, WORLD_SEED, {
      onDayBoundary: () => {},
      openSlackApps: () => [],
      focusedSlackApp: () => null,
    }),
    dispatch: (id, actor, target, params) => session.engine.dispatch(
      id,
      actor,
      target,
      params,
    ),
    dispatchLog: () => session.engine.dispatchLog(),
    clock: {
      now: () => session.engine.now(),
      onTick: (listener) => session.engine.onTick(listener),
    },
    onWorldChange: (listener) => session.engine.onEvent(() => {
      listener();
    }),
    notify: () => {},
    report: () => Promise.resolve({ ok: true, value: undefined }),
    openApp: () => {},
    closeApp: () => {},
    hasApp: () => false,
    installApp: () => ({ ok: true }),
    uninstallApp: () => ({ ok: true }),
    restartWeek: () => {},
    acceptOffer: () => {},
    employer: 'workgrumble',
    actor: COMPANY_IDS.player,
  };
}

/** Sets the player's standing so the promotion offer is on the table. */
function earnPromotion(session: WorldSession): void {
  session.engine.applySetup([{
    op: 'setField',
    id: COMPANY_IDS.player,
    field: FIELDS.reputation,
    value: PROMOTION_REPUTATION,
  }]);
}

/** Runs a Windows-dialect line, as the desktop terminal does. */
function win(api: GameApi, input: string): CommandResult {
  return executeCommand(parseCommand(input), api);
}

/** Runs a unix-dialect line inside a session, as the terminal does on a box. */
function unix(
  api: GameApi,
  session: SshSession,
  input: string,
): CommandResult {
  return executeUnix(parseUnixCommand(input), api, session);
}

/** The session an ssh connect hands back, or a failure for the test to see. */
function connect(api: GameApi, line: string): SshSession | null {
  return win(api, line).enterSession ?? null;
}

describe('the promotion, ssh, and the unix terminal (E6)', () => {
  describe('the promotion: earned, one-way, through the real dispatch', () => {
    it('refuses the promotion below the reputation it is offered at', () => {
      const api = apiFor(createWorldSession());
      const out = win(api, 'promotion accept').lines.join('\n');

      expect(out).toContain('not on the table yet');
      // The world did NOT flip the tier: a below-the-bar accept changes nothing.
      expect(api.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBeUndefined();
    });

    it('flips the tier and the title once it is earned', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);

      const out = win(api, 'promotion accept').lines.join('\n');
      expect(out).toContain('Systems Engineer now');

      expect(api.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBe(PLAYER_TIERS.systemsEngineer);
      expect(api.graph.getField(COMPANY_IDS.player, FIELDS.title))
        .toBe(SYSTEMS_ENGINEER_TITLE);
    });

    it('refuses a second promotion - the crossing is one-way', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');

      const out = win(api, 'promotion accept').lines.join('\n');
      expect(out).toContain('already a Systems Engineer');
    });

    it('refuses an unknown promotion sub-command', () => {
      const api = apiFor(createWorldSession());
      expect(win(api, 'promotion decline').lines.join('\n'))
        .toContain('promotion accept');
    });
  });

  describe('ssh: the tier gate', () => {
    it('refuses a service-desk player - server access is the engineers\' tier', () => {
      const api = apiFor(createWorldSession());
      const result = win(api, 'ssh pat@APP-01');

      expect(result.enterSession).toBeUndefined();
      expect(result.lines.join('\n')).toContain('not service-desk access');
    });

    it('connects once promoted - the same box, the gate now open', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');

      const opened = win(api, 'ssh pat@APP-01');
      expect(opened.enterSession).toBeDefined();
      expect(opened.enterSession?.hostname).toBe('APP-01');
      expect(opened.enterSession?.username).toBe('pat');
    });

    it('refuses ssh to a Windows box - it does not run sshd', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');

      const out = win(api, 'ssh pat@BEIGE-BOX');
      expect(out.enterSession).toBeUndefined();
      expect(out.lines.join('\n')).toContain('does not run sshd');
    });

    it('refuses a host nothing answers to', () => {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');

      expect(win(api, 'ssh pat@nowhere').lines.join('\n'))
        .toContain('Could not resolve hostname');
    });
  });

  describe('ssh: trust-on-first-use', () => {
    function promotedApi(): GameApi {
      const session = createWorldSession();
      const api = apiFor(session);
      earnPromotion(session);
      win(api, 'promotion accept');
      return api;
    }

    it('shows the fingerprint and records the host on the FIRST connect', () => {
      const api = promotedApi();
      const first = win(api, 'ssh pat@APP-01');

      expect(first.lines.join('\n')).toContain('ED25519 key fingerprint is');
      expect(first.lines.join('\n')).toContain('Permanently added');

      // The ledger now holds the box, one line, off the real graph field.
      const known = readKnownHosts(
        api.graph.getField(COMPANY_IDS.player, FIELDS.knownHosts),
      );
      expect(known).toContain('machine:app');
    });

    it('skips the fingerprint on the SECOND connect to the same host', () => {
      const api = promotedApi();
      win(api, 'ssh pat@APP-01');
      const second = win(api, 'ssh pat@APP-01');

      expect(second.enterSession).toBeDefined();
      expect(second.lines.join('\n')).not.toContain('key fingerprint');
      // Still exactly one line in the ledger - trusting a known host is a no-op.
      expect(readKnownHosts(
        api.graph.getField(COMPANY_IDS.player, FIELDS.knownHosts),
      )).toEqual(['machine:app']);
    });

    it('derives a stable ED25519 fingerprint from the host id', () => {
      const fp = ed25519Fingerprint('machine:app');
      expect(fp).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/u);
      // Deterministic: the same box has the same fingerprint every session.
      expect(ed25519Fingerprint('machine:app')).toBe(fp);
      expect(ed25519Fingerprint('machine:db')).not.toBe(fp);
    });
  });

  describe('the unix dialect on a box', () => {
    interface OnBox {
      readonly world: WorldSession;
      readonly api: GameApi;
      readonly ssh: SshSession;
    }

    function onBox(host = 'APP-01'): OnBox {
      const world = createWorldSession();
      const api = apiFor(world);
      earnPromotion(world);
      win(api, 'promotion accept');
      const ssh = connect(api, `ssh pat@${host}`);
      if (ssh === null) {
        throw new Error('ssh did not open a session');
      }
      return { world, api, ssh };
    }

    it('prompts as user@host, a real family difference from C:\\>', () => {
      const { ssh } = onBox();
      expect(unixPrompt(ssh)).toBe('pat@APP-01:~$');
    });

    it('systemctl status reads the seeded unit as the richer ●-dot block', () => {
      const { api, ssh } = onBox();
      const out = unix(api, ssh, 'systemctl status nginx').lines;

      // The dot, then the Loaded and Active lines and the Main PID - not sc's
      // flat STATE line. The description and state are the seeded fields.
      expect(out[0]).toContain('\u25cf nginx.service - ');
      expect(out[0]).toContain('high performance web server');
      expect(out.join('\n')).toContain('Loaded: loaded (/lib/systemd/system/'
        + 'nginx.service; enabled;');
      expect(out.join('\n')).toContain('Active: active (running)');
      expect(out.join('\n')).toContain('Main PID:');
    });

    it('takes the full unit name as well as the base', () => {
      const { api, ssh } = onBox();
      expect(unix(api, ssh, 'systemctl status nginx.service').lines[0])
        .toContain('nginx.service');
    });

    it('reads the state off the node - flip it and the status changes (teeth)', () => {
      const { world, api, ssh } = onBox();

      const before = unix(api, ssh, 'systemctl status nginx').lines.join('\n');
      expect(before).toContain('active (running)');

      // The world is the only source: re-seed the unit as failed (the state the
      // Pass B fix task will find it in) and the block changes with it.
      world.engine.applySetup([{
        op: 'setField',
        id: linuxUnitId('machine:app', 'nginx.service'),
        field: FIELDS.unitState,
        value: SYSTEMD_STATES.failed,
      }]);

      const after = unix(api, ssh, 'systemctl status nginx').lines.join('\n');
      expect(after).toContain('Active: failed');
      expect(after).toContain('\u00d7 nginx.service'); // the × dot, not ●
      // A failed unit has no Main PID line - the block is honest about it.
      expect(after).not.toContain('Main PID:');
    });

    it('ls -la prints the mode/owner/group columns, not a dir header', () => {
      const { api, ssh } = onBox();
      const out = unix(api, ssh, 'ls -la').lines.join('\n');

      expect(out).toContain('drwxr-xr-x');
      expect(out).toContain('pat');
      // The family difference, said out loud, with no invented files.
      expect(out).toContain('mode, owner, group, size and mtime');
      expect(out).not.toContain('Volume in drive');
    });

    it('exit and logout leave the session, back to the desktop', () => {
      const { api, ssh } = onBox();
      const exited = unix(api, ssh, 'exit');
      expect(exited.exitSession).toBe(true);
      expect(exited.lines.join('\n')).toContain('Connection to APP-01 closed');

      expect(unix(api, ssh, 'logout').exitSession).toBe(true);
    });

    it('refuses systemctl restart honestly - it does not fake success', () => {
      const { api, ssh } = onBox();
      const out = unix(api, ssh, 'systemctl restart nginx').lines.join('\n');
      // The fidelity bar: a restart is silent on success on a real box, and Pass
      // B owns it. This refuses rather than fabricating a confirmation line.
      expect(out).toContain('not wired');
      expect(out).not.toContain('reports RUNNING');
    });

    it('answers an unknown unix command in the unix shape', () => {
      const { api, ssh } = onBox();
      expect(unix(api, ssh, 'htop').lines.join('\n'))
        .toContain('command not found');
    });
  });

  describe('the crossing survives a save', () => {
    it('a reload keeps the promotion, the title and the known_hosts', () => {
      const world = createWorldSession();
      const api = apiFor(world);
      earnPromotion(world);
      win(api, 'promotion accept');
      win(api, 'ssh pat@APP-01'); // records the host in known_hosts

      // The two durable halves are fields on the player node, so the engine's
      // own serialization carries them - which is exactly the string a save
      // file holds verbatim (`save.ts`).
      const saved = world.engine.serialize();
      const reloaded = new WasmEngine(WORLD_SEED);
      reloaded.restore(saved);

      expect(reloaded.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBe(PLAYER_TIERS.systemsEngineer);
      expect(reloaded.graph.getField(COMPANY_IDS.player, FIELDS.title))
        .toBe(SYSTEMS_ENGINEER_TITLE);
      expect(readKnownHosts(
        reloaded.graph.getField(COMPANY_IDS.player, FIELDS.knownHosts),
      )).toContain('machine:app');
    });

    it('the promotion crosses an employer switch, permanently', () => {
      // The career carry is what makes the tier follow the player to the next
      // job. A promoted standing arriving at a new employer seeds the engineer
      // tier onto its fresh player node; a service-desk one writes nothing.
      const promoted = createWorldSession(carryFor(PLAYER_TIERS.systemsEngineer));
      expect(promoted.engine.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBe(PLAYER_TIERS.systemsEngineer);

      const deskCarry = createWorldSession(carryFor(PLAYER_TIERS.serviceDesk));
      // The desk default writes nothing - byte-identical to before the tier.
      expect(deskCarry.engine.graph.getField(COMPANY_IDS.player, FIELDS.playerTier))
        .toBeUndefined();
    });
  });
});

/** A first-week carry arriving with the given tier, for the switch test. */
function carryFor(tier: PlayerTier): Parameters<typeof createWorldSession>[0] {
  return {
    farmFund: 0,
    attempt: 1,
    employer: 'workgrumble',
    reputation: 80,
    title: 'Systems Engineer',
    playerTier: tier,
  };
}
