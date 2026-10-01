import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { said, safeOption } from './dialogue';
import type { Game } from './game';
import { rootPlayer } from './hosts';
import {
  burnoutMenu,
  controlsGrid,
  difficultyWord,
  firstEnabled,
  focusMove,
  MENU_LABEL,
  type MenuSpec,
  PACK_APPS,
  packAppKey,
  pauseMenu,
  SAFE_ESCAPES,
  stepEnabled,
  stepFocus,
  titleMenu,
} from './menus';
import { busyDue, BUSY_GAP, MOVE_ACTIONS, rootedView } from './rooted';
import { difficultyFor, RUNG_COUNT, WORKPLACES } from './rpg';
import { DEFAULT_KEYS } from './settings';

/**
 * The menus' rules (docs/SPEC_MENUS.md), without a page: what each screen
 * offers and what Esc may do there, how the keyboard walks a list, which
 * dialogue line Esc picks, the backpack's app bar, the controls card, the
 * form's words, and the rooted card. The page itself is
 * e2e/helldesk-menus.spec.ts.
 */

describe('focus order', () => {
  it('the arrows walk a list, and Home and End jump to its ends', () => {
    expect(focusMove('ArrowDown')).toBe('next');
    expect(focusMove('ArrowRight')).toBe('next');
    expect(focusMove('ArrowUp')).toBe('prev');
    expect(focusMove('ArrowLeft')).toBe('prev');
    expect(focusMove('Home')).toBe('first');
    expect(focusMove('End')).toBe('last');
    expect(focusMove('KeyW')).toBeNull();
    expect(focusMove('Enter')).toBeNull();
  });

  it('wraps round both ends, so the keyboard can never fall off a list', () => {
    expect(stepFocus(4, 3, 'next')).toBe(0);
    expect(stepFocus(4, 0, 'prev')).toBe(3);
    expect(stepFocus(4, 1, 'next')).toBe(2);
    expect(stepFocus(4, 2, 'first')).toBe(0);
    expect(stepFocus(4, 1, 'last')).toBe(3);
  });

  it('comes in from outside the list at the end it is travelling from', () => {
    expect(stepFocus(4, -1, 'next')).toBe(0);
    expect(stepFocus(4, -1, 'prev')).toBe(3);
    expect(stepFocus(0, -1, 'next')).toBe(-1);
  });

  it('steps over lines that cannot be chosen, and never lands on one', () => {
    const disabled = [false, true, false, true];
    expect(stepEnabled(disabled, 0, 'next')).toBe(2);
    expect(stepEnabled(disabled, 2, 'next')).toBe(0);
    expect(stepEnabled(disabled, 0, 'prev')).toBe(2);
    expect(stepEnabled(disabled, 1, 'next')).toBe(2);
    expect(stepEnabled(disabled, 3, 'prev')).toBe(2);
    expect(stepEnabled(disabled, 2, 'last')).toBe(2);
    expect(stepEnabled([true, true], 0, 'next')).toBe(-1);
    for (let at = -1; at < disabled.length; at++) {
      for (const mv of ['next', 'prev', 'first', 'last'] as const) expect(disabled[stepEnabled(disabled, at, mv)]).toBe(false);
    }
  });

  it('opens on the first line that can be chosen', () => {
    expect(firstEnabled([false, false])).toBe(0);
    expect(firstEnabled([true, false])).toBe(1);
    expect(firstEnabled([true])).toBe(-1);
  });
});

describe('the screens', () => {
  const all: MenuSpec[] = [];
  for (const latest of [false, true]) for (const saves of [false, true]) all.push(titleMenu({ latest, saves }));
  for (const ironman of [false, true]) for (const vision of [false, true]) all.push(pauseMenu({ ironman, vision }));
  all.push(burnoutMenu());

  it('the title is a main menu: Settings and Controls & help before any game exists', () => {
    expect(titleMenu({ latest: false, saves: false }).items).toEqual(['new', 'settings', 'controls', 'whatsnew']);
    expect(titleMenu({ latest: true, saves: true }).items).toEqual(['continue', 'new', 'load', 'settings', 'controls', 'whatsnew']);
    expect(MENU_LABEL.controls).toBe('Controls & help');
  });

  it('Esc resumes from pause', () => {
    for (const ironman of [false, true]) for (const vision of [false, true]) {
      const spec = pauseMenu({ ironman, vision });
      expect(spec.escape).toBe('resume');
      expect(spec.items[0]).toBe('resume');
    }
  });

  it('Esc never does anything that cannot be taken back, on any menu', () => {
    for (const spec of all) {
      if (spec.escape === null) continue;
      expect(SAFE_ESCAPES).toContain(spec.escape);
      expect(spec.items).toContain(spec.escape);
    }
    expect(burnoutMenu().escape).toBeNull();
    expect(titleMenu({ latest: true, saves: true }).escape).toBeNull();
  });

  it('the pause menu names what it opens, and Character is one step away', () => {
    const spec = pauseMenu({ ironman: false, vision: false });
    expect(spec.items).toEqual(['resume', 'save', 'load', 'inventory', 'character', 'settings', 'controls', 'title']);
    expect(MENU_LABEL.inventory).toBe('Inventory');
    expect(Object.values(MENU_LABEL)).not.toContain('Backpack & Career');
  });

  it('Ironman neither saves nor loads by hand; under the steam nothing saves and the backpack is shut', () => {
    expect(pauseMenu({ ironman: true, vision: false }).items).not.toContain('save');
    expect(pauseMenu({ ironman: true, vision: false }).items).not.toContain('load');
    const under = pauseMenu({ ironman: false, vision: true }).items;
    expect(under).toContain('load');
    for (const no of ['save', 'inventory', 'character', 'settings'] as const) expect(under).not.toContain(no);
  });

  it('burnout offers more than clocking back in: a save to load, or the title', () => {
    expect(burnoutMenu().items).toEqual(['clockin', 'load', 'title']);
  });
});

describe('the backpack app bar', () => {
  it('reaches Inventory, Character, Journal, Help and Achievements', () => {
    for (const app of ['inventory', 'character', 'journal', 'help', 'achievements'] as const) expect(PACK_APPS).toContain(app);
    expect(PACK_APPS[0]).toBe('inventory');
  });

  it('1-8 open the bar\'s apps in order, and nothing else does', () => {
    expect(PACK_APPS[packAppKey('Digit1')]).toBe('inventory');
    expect(PACK_APPS[packAppKey('Digit2')]).toBe('character');
    expect(packAppKey(`Digit${PACK_APPS.length + 1}`)).toBe(-1);
    expect(packAppKey('Digit0')).toBe(-1);
    expect(packAppKey('Numpad1')).toBe(-1);
    expect(packAppKey('KeyC')).toBe(-1);
  });
});

describe('the dialogue line Esc picks', () => {
  it('a plain end-of-conversation line is safe to walk away from', () => {
    expect(safeOption(said('Morag', 'Hello.').options)).toBe(0);
  });

  it('only a line marked as walking away, never the first line or a fight', () => {
    const pick = (): null => null;
    // "Fine. We do this the hard way." ends the talk too, but it is not a leave.
    const hostile = [{ label: 'Accept the meeting', pick }, { label: 'Fine. We do this the hard way.', pick }];
    expect(safeOption(hostile)).toBe(-1);
    const offer = [{ label: 'Leave it with me.', pick }, { label: 'Not right now.', leave: true, pick }];
    expect(safeOption(offer)).toBe(1);
  });

  it('never a greyed-out line', () => {
    const pick = (): null => null;
    expect(safeOption([{ label: 'Leave', leave: true, disabled: true, pick }])).toBe(-1);
  });

  it('every line marked as walking away, in every conversation in the game, does nothing but end it', () => {
    // A "leave" that costs morale, standing or Rep would make Esc a choice
    // the player never saw. The only thing such a line may do is return null.
    const dir = join(process.cwd(), 'src/crawler');
    let marked = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      for (let at = text.indexOf('leave: true'); at >= 0; at = text.indexOf('leave: true', at + 1)) {
        marked++;
        expect(text.slice(at, at + 40), `${file}: a leave line that does something`).toMatch(/^leave: true, pick: \(\) => null \}/);
      }
    }
    // The leaves are really marked (said() and the walk-aways in the world), not none at all.
    expect(marked).toBeGreaterThanOrEqual(9);
  });
});

describe('the controls card', () => {
  it('has the essentials, Space for jump among them', () => {
    const grid = controlsGrid(DEFAULT_KEYS);
    expect(grid).toContainEqual(['W A S D', 'move']);
    expect(grid).toContainEqual(['Space', 'jump']);
    expect(grid).toContainEqual(['E', 'use / talk']);
    expect(grid).toContainEqual(['Esc', 'pause']);
    expect(grid.length).toBeLessThanOrEqual(12);
  });

  it('shows the keys this player bound, not the defaults', () => {
    const grid = controlsGrid({ ...DEFAULT_KEYS, jump: 'KeyK', forward: 'ArrowUp' });
    expect(grid).toContainEqual(['K', 'jump']);
    expect(grid[0]?.[0]).toBe('↑ A S D');
  });

  it('shows attack and block as bound: the buttons by default, the new key once rebound', () => {
    expect(controlsGrid(DEFAULT_KEYS)).toContainEqual(['LMB', 'tool (hold: heavy swing)']);
    expect(controlsGrid(DEFAULT_KEYS)).toContainEqual(['RMB', 'block (tap: shove)']);
    const grid = controlsGrid({ ...DEFAULT_KEYS, attack: 'KeyJ', block: 'Mouse3' });
    expect(grid).toContainEqual(['J', 'tool (hold: heavy swing)']);
    expect(grid).toContainEqual(['Mouse 4', 'block (tap: shove)']);
  });
});

describe('the New Starter Form\'s words', () => {
  it('says the ladder in words, harder rung by rung', () => {
    const order = ['much easier', 'easier', 'as designed', 'harder', 'much harder', 'brutal'];
    let last = 0;
    for (let r = 0; r < RUNG_COUNT; r++) {
      const at = order.indexOf(difficultyWord(difficultyFor(r)));
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
    expect(difficultyWord(difficultyFor(0))).toBe('much easier');
    expect(difficultyWord(1)).toBe('as designed');
    expect(difficultyWord(difficultyFor(RUNG_COUNT - 1))).toBe('brutal');
  });

  it('the gentle employer reads easier and the death march harder', () => {
    expect(difficultyWord(WORKPLACES.fourday.enemy)).toMatch(/easier/);
    expect(difficultyWord(WORKPLACES.standard.enemy)).toBe('as designed');
    expect(difficultyWord(WORKPLACES.deathmarch.enemy)).toMatch(/harder|brutal/);
  });
});

describe('the rooted card', () => {
  it('is up only in play, only while rooted', () => {
    expect(rootedView(true, 0, 4, 'In a meeting: "KPI deep dive"')).toBeNull();
    expect(rootedView(false, 3, 4, 'In a meeting: "KPI deep dive"')).toBeNull();
    expect(rootedView(true, 3, 4, 'In a meeting: "KPI deep dive"')).not.toBeNull();
  });

  it('says why, and the countdown runs from the length of the hold', () => {
    const v = rootedView(true, 3, 4, 'In a meeting: "KPI deep dive"');
    expect(v?.reason).toBe('In a meeting');
    expect(v?.detail).toBe('"KPI deep dive"');
    expect(v?.fraction).toBeCloseTo(0.75);
    expect(v?.left).toBe(3);
    const freeze = rootedView(true, 1, 1.6, 'Budget freeze');
    expect(freeze?.reason).toBe('Budget freeze');
    expect(freeze?.detail).toBe('');
    expect(rootedView(true, 1, 0, '')?.reason).toBe('You cannot move');
    // A stale or missing length never overfills the bar.
    expect(rootedView(true, 2, 1, 'Cornered')?.fraction).toBe(1);
  });

  it('every way of moving counts as trying to move', () => {
    expect([...MOVE_ACTIONS].sort()).toEqual(['back', 'forward', 'jump', 'left', 'right']);
  });

  it('one engaged tone per gap, not one per key-repeat', () => {
    expect(busyDue(5, null)).toBe(true);
    expect(busyDue(5, 5 - BUSY_GAP / 2)).toBe(false);
    expect(busyDue(5, 5 - BUSY_GAP * 1.01)).toBe(true);
  });

  it('a hold sets where the countdown starts; a shorter one inside it does not restart it', () => {
    const g = {
      rootT: 0, rootMax: 0, rootReason: '', rootImmuneUntil: 0, time: 0,
      derivedCache: { noRoot: false },
      save: { perks: {} },
    };
    const game = g as unknown as Game;
    rootPlayer(game, 4, 'In a meeting: "Stand-up (seated)"', false);
    expect(g.rootT).toBe(4);
    expect(g.rootMax).toBe(4);
    g.rootT = 3;
    rootPlayer(game, 2, 'Cornered', false);
    expect(g.rootT).toBe(3);
    expect(g.rootMax).toBe(4);
    rootPlayer(game, 6, 'Sitting down, very suddenly', false);
    expect(g.rootMax).toBe(6);
    expect(rootedView(true, g.rootT, g.rootMax, g.rootReason)?.fraction).toBe(1);
  });
});
