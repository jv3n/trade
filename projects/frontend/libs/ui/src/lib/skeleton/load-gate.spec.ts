import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stbLoadGate, type StbLoadGate } from './load-gate';

/**
 * The timing of a first load (#539), pinned on fake timers :
 *
 *  - **A fast answer never flashes the skeleton** — under the delay, the content comes straight.
 *  - **A shown skeleton never blinks** — it stays its minimum even when the data lands right after.
 *  - **A load back on within the minimum is waited for** — the content never lands mid-load.
 *  - **Only the first load counts** — a refetch keeps the content ; it never brings the skeleton back.
 *  - **A gate created on an idle `loading` says so** in dev mode, instead of silently never showing.
 */
describe('stbLoadGate', () => {
  const loading = signal(true);
  let gate: StbLoadGate;

  beforeEach(() => {
    vi.useFakeTimers();
    loading.set(true);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    gate = TestBed.runInInjectionContext(() => stbLoadGate(loading));
    TestBed.tick();
  });

  afterEach(() => vi.useRealTimers());

  function settle(): void {
    loading.set(false);
    TestBed.tick();
  }

  it('shows nothing during the delay', () => {
    vi.advanceTimersByTime(179);

    expect(gate.skeleton()).toBe(false);
    expect(gate.content()).toBe(false);
  });

  it('goes straight to the content when the answer beats the delay', () => {
    vi.advanceTimersByTime(100);
    settle();
    vi.advanceTimersByTime(500);

    expect(gate.skeleton()).toBe(false);
    expect(gate.content()).toBe(true);
  });

  it('shows the skeleton once the delay is past', () => {
    vi.advanceTimersByTime(180);

    expect(gate.skeleton()).toBe(true);
  });

  it('keeps a shown skeleton its minimum even when the data lands just after', () => {
    vi.advanceTimersByTime(200);
    settle();

    vi.advanceTimersByTime(279);
    expect(gate.skeleton()).toBe(true);
    expect(gate.content()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(gate.skeleton()).toBe(false);
    expect(gate.content()).toBe(true);
  });

  it('hands over at once when the skeleton has already been up its minimum', () => {
    vi.advanceTimersByTime(1500);
    settle();
    vi.advanceTimersByTime(0);

    expect(gate.content()).toBe(true);
  });

  // A filter changed in the first 300 ms used to hand over to an empty page mid-load.
  it('waits for a load that comes back on within the minimum', () => {
    vi.advanceTimersByTime(180);
    settle();
    vi.advanceTimersByTime(10);
    loading.set(true);
    TestBed.tick();

    vi.advanceTimersByTime(1000);
    expect(gate.skeleton()).toBe(true);
    expect(gate.content()).toBe(false);

    settle();
    vi.advanceTimersByTime(0);
    expect(gate.content()).toBe(true);
  });

  it('warns in dev mode when `loading` starts false', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const idle = signal(false);

    TestBed.runInInjectionContext(() => stbLoadGate(idle));
    TestBed.tick();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('stbLoadGate'));
    warn.mockRestore();
  });

  it('never brings the skeleton back on a refetch', () => {
    settle();
    loading.set(true);
    TestBed.tick();
    vi.advanceTimersByTime(1000);

    expect(gate.skeleton()).toBe(false);
    expect(gate.content()).toBe(true);
  });
});
