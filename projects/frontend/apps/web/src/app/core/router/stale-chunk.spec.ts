import { NavigationError } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { StaleChunkEnv, isStaleChunkError, reloadOnStaleChunk } from './stale-chunk';

/**
 * Pins the reload of a tab left open across a deploy (#644) — its next lazy route asks for a chunk
 * the new build no longer has :
 *
 * - **a stale chunk loads the page it was going to**, from the new version ;
 * - **once** — a second stale chunk within ten seconds is a real failure, never a reload loop ;
 * - **any other navigation error is left alone**, and so is a browser with no storage to remember
 *   the first reload by.
 */
function env(stored: string | null = null): StaleChunkEnv & { store: Map<string, string> } {
  const store = new Map<string, string>();
  if (stored !== null) store.set('stale-chunk-reload', stored);
  return {
    store,
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    },
    now: () => 1_000_000,
    assign: vi.fn(),
  };
}

function navigationError(message: string, url = '/journal/3f1c9a2e'): NavigationError {
  return new NavigationError(1, url, new TypeError(message));
}

const CHROMIUM =
  'Failed to fetch dynamically imported module: https://tickerstory.org/chunk-Bzn4ydz-.js';

describe('stale chunk', () => {
  it('recognises the wording of Chromium, Firefox and Safari', () => {
    expect(isStaleChunkError(new TypeError(CHROMIUM))).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(
      true,
    );
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new Error('NG04002: Cannot match any routes'))).toBe(false);
  });

  it('loads the page the navigation was going to, from the new version', () => {
    const e = env();

    reloadOnStaleChunk(navigationError(CHROMIUM), e);

    expect(e.assign).toHaveBeenCalledWith('/journal/3f1c9a2e');
    expect(e.store.get('stale-chunk-reload')).toBe('1000000');
  });

  it('reloads only once — a second stale chunk right after is a real failure', () => {
    const e = env(String(1_000_000 - 3_000));

    reloadOnStaleChunk(navigationError(CHROMIUM), e);

    expect(e.assign).not.toHaveBeenCalled();
  });

  it('reloads again for a later deploy', () => {
    const e = env(String(1_000_000 - 60_000));

    reloadOnStaleChunk(navigationError(CHROMIUM), e);

    expect(e.assign).toHaveBeenCalled();
  });

  it('leaves any other navigation error alone', () => {
    const e = env();

    reloadOnStaleChunk(navigationError('NG04002: Cannot match any routes'), e);

    expect(e.assign).not.toHaveBeenCalled();
  });

  it('risks no reload without storage to remember it by', () => {
    const e = { ...env(), storage: null };

    reloadOnStaleChunk(navigationError(CHROMIUM), e);

    expect(e.assign).not.toHaveBeenCalled();
  });
});
