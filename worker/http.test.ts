import { describe, expect, it } from 'vitest';

import { assetPath } from './http';

/**
 * Where each address lands. The token link redirects to `/`, so whatever `/`
 * serves is what an invited tester sees first.
 */
describe('assetPath', () => {
  it('serves Helldesk at the front door', () => {
    expect(assetPath('/')).toBe('/crawler');
  });

  it('keeps the office sim reachable at /office', () => {
    expect(assetPath('/office')).toBe('/');
    expect(assetPath('/office/')).toBe('/');
  });

  it('leaves every other path alone', () => {
    for (const path of ['/crawler', '/assets/main-abc.js', '/favicon.ico']) {
      expect(assetPath(path)).toBe(path);
    }
  });
});
