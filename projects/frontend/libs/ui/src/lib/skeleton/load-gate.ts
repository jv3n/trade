import { DestroyRef, Signal, effect, inject, isDevMode, signal, untracked } from '@angular/core';

export interface StbLoadGateOptions {
  /** How long a load may take before the skeleton shows — a faster answer never flashes it. */
  delay?: number;
  /** Once shown, how long the skeleton stays at least, so it never blinks. */
  minimum?: number;
}

export interface StbLoadGate {
  /** The skeleton is on screen. */
  readonly skeleton: Signal<boolean>;
  /** The content may render — true from the end of the first load on, refetches included. */
  readonly content: Signal<boolean>;
}

/**
 * Times a page's first load (#539) : nothing for `delay`, then the skeleton, kept at least
 * `minimum`, then the content. Only the first load counts — once `content` is true it stays, and a
 * refetch dims the content (`stbTable [busy]`) instead of bringing the skeleton back.
 *
 * `loading` must already be true when the gate is created : a gate that first sees `false` reads
 * the load as over, and says so in dev mode. Call it in an injection context (a field initialiser).
 */
export function stbLoadGate(loading: () => boolean, options: StbLoadGateOptions = {}): StbLoadGate {
  const { delay = 180, minimum = 300 } = options;
  const skeleton = signal(false);
  const content = signal(false);
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let shownAt = 0;

  // Read at creation, not on the first effect run : a load answered synchronously is over by then.
  if (!untracked(loading) && isDevMode()) {
    console.warn(
      'stbLoadGate: `loading` was false when the gate was created — the skeleton will never show.',
    );
  }

  effect(() => {
    const busy = loading();
    untracked(() => {
      if (content()) return;
      if (busy) {
        // A load back on within the minimum : the hand-over waits for it.
        clearTimeout(hideTimer);
        showTimer ??= setTimeout(() => {
          shownAt = Date.now();
          skeleton.set(true);
        }, delay);
        return;
      }
      clearTimeout(showTimer);
      if (!skeleton()) {
        content.set(true);
        return;
      }
      hideTimer = setTimeout(
        () => {
          skeleton.set(false);
          content.set(true);
        },
        Math.max(0, minimum - (Date.now() - shownAt)),
      );
    });
  });

  inject(DestroyRef).onDestroy(() => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  });

  return { skeleton: skeleton.asReadonly(), content: content.asReadonly() };
}
