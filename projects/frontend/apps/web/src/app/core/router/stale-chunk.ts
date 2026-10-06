import { NavigationError } from '@angular/router';

const LAST_RELOAD_KEY = 'stale-chunk-reload';
/** Two stale chunks this close together mean a reload did not help : let the error through. */
const LOOP_GUARD_MS = 10_000;

/** What [reloadOnStaleChunk] reads and does — the browser by default, stubs in a spec. */
export interface StaleChunkEnv {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
  assign: (url: string) => void;
}

/**
 * The lazy chunk of a route is gone — the tab was loaded before a deploy that renamed it (#644).
 * Chromium, Firefox and Safari word it differently.
 */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed/.test(message);
}

/**
 * Router navigation-error handler : a tab left open across a deploy loads the page it was going to
 * from the new version, instead of failing the navigation. Once — a second stale chunk within
 * [LOOP_GUARD_MS] is a real failure, not an old tab ; and without storage to remember the first
 * reload, none is risked.
 */
export function reloadOnStaleChunk(
  event: NavigationError,
  env: StaleChunkEnv = browserEnv(),
): void {
  if (!isStaleChunkError(event.error) || !env.storage) return;
  try {
    const last = Number(env.storage.getItem(LAST_RELOAD_KEY) ?? 0);
    if (env.now() - last < LOOP_GUARD_MS) return;
    env.storage.setItem(LAST_RELOAD_KEY, String(env.now()));
  } catch {
    return;
  }
  env.assign(event.url);
}

function browserEnv(): StaleChunkEnv {
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Blocked storage (privacy settings) : no reload, see above.
  }
  return { storage, now: () => Date.now(), assign: (url) => window.location.assign(url) };
}
