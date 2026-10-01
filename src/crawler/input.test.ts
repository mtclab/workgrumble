import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from './input';
import { ACTIONS, DEFAULT_KEYS, keyName, mouseCode } from './settings';

/**
 * The real Input on a stand-in page: a window, a document and a canvas that
 * are plain event targets, so the game's own handlers hear the presses. The
 * mouse counts as captured (pointer lock), as it is in play.
 */
interface Page {
  readonly input: Input;
  readonly canvas: EventTarget;
}

function page(): Page {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null, exitPointerLock: () => undefined, visibilityState: 'visible' });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  // Nothing on this page is a text box.
  vi.stubGlobal('HTMLInputElement', class {});
  vi.stubGlobal('HTMLTextAreaElement', class {});
  vi.stubGlobal('HTMLSelectElement', class {});
  const canvas = Object.assign(new EventTarget(), { requestPointerLock: () => undefined });
  const input = new Input(canvas as unknown as HTMLCanvasElement);
  input.locked = true;
  return { input, canvas };
}

function mouse(type: string, button: number): Event {
  return Object.assign(new Event(type, { bubbles: true }), { button });
}

function key(type: string, code: string): Event {
  return Object.assign(new Event(type), { code });
}

describe('attack and block are bindings like any other', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('are the left and right buttons until rebound', () => {
    const { input, canvas } = page();
    input.bind(DEFAULT_KEYS.attack, DEFAULT_KEYS.block);
    canvas.dispatchEvent(mouse('mousedown', 0));
    expect(input.lmb).toBe(true);
    expect(input.clicked()).toBe(true);
    canvas.dispatchEvent(mouse('mousedown', 2));
    expect(input.rmb).toBe(true);
    window.dispatchEvent(mouse('mouseup', 0));
    window.dispatchEvent(mouse('mouseup', 2));
    expect(input.lmb).toBe(false);
    expect(input.rmb).toBe(false);
  });

  it('attack rebound to a key attacks with that key, and the left button no longer does', () => {
    const { input, canvas } = page();
    input.bind('KeyK', DEFAULT_KEYS.block);
    window.dispatchEvent(key('keydown', 'KeyK'));
    expect(input.clicked()).toBe(true);
    expect(input.lmb).toBe(true);
    window.dispatchEvent(key('keyup', 'KeyK'));
    input.endFrame();
    expect(input.lmb).toBe(false);
    canvas.dispatchEvent(mouse('mousedown', 0));
    expect(input.clicked()).toBe(false);
    expect(input.lmb).toBe(false);
    // The left button is still a button: whatever it is bound to hears it.
    expect(input.hit(mouseCode(0))).toBe(true);
  });

  it('block rebound to a side button blocks with it', () => {
    const { input, canvas } = page();
    input.bind(DEFAULT_KEYS.attack, mouseCode(4));
    canvas.dispatchEvent(mouse('mousedown', 4));
    expect(input.rmb).toBe(true);
    canvas.dispatchEvent(mouse('mousedown', 2));
    window.dispatchEvent(mouse('mouseup', 4));
    expect(input.rmb).toBe(false);
  });

  it('one press is one click: held, it is down but not pressed again next frame', () => {
    const { input, canvas } = page();
    input.bind(DEFAULT_KEYS.attack, DEFAULT_KEYS.block);
    canvas.dispatchEvent(mouse('mousedown', 0));
    input.endFrame();
    expect(input.clicked()).toBe(false);
    expect(input.lmb).toBe(true);
  });

  it('the buttons reach nothing while the mouse is not captured', () => {
    const { input, canvas } = page();
    input.locked = false;
    canvas.dispatchEvent(mouse('mousedown', 0));
    expect(input.lmb).toBe(false);
  });
});

describe('who let go of the mouse', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a release the game made is told apart from one the browser made, once', () => {
    const { input } = page();
    const doc = document as unknown as { pointerLockElement: unknown };
    doc.pointerLockElement = {};
    input.releaseLock();
    expect(input.lostOnPurpose()).toBe(true);
    // Asked again (the next loss): that one is the browser's.
    expect(input.lostOnPurpose()).toBe(false);
  });

  it('a release with nothing locked marks nothing, so the next real loss still pauses', () => {
    const { input } = page();
    input.releaseLock();
    expect(input.lostOnPurpose()).toBe(false);
  });
});

describe('the binding table', () => {
  it('has attack and block, on the buttons, named as the buttons', () => {
    expect(ACTIONS).toContain('attack');
    expect(ACTIONS).toContain('block');
    expect(keyName(DEFAULT_KEYS.attack)).toBe('LMB');
    expect(keyName(DEFAULT_KEYS.block)).toBe('RMB');
    expect(keyName('Mouse1')).toBe('Middle mouse');
    expect(keyName('Mouse3')).toBe('Mouse 4');
    expect(keyName('KeyK')).toBe('K');
  });

  it('binds no two actions to one key or button by default', () => {
    const codes = ACTIONS.map((a) => DEFAULT_KEYS[a]);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
