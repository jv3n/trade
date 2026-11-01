import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketClock } from './market-clock.service';

/**
 * A tab left open overnight must not keep writing to yesterday (#842). What is pinned : the day
 * moves when the tab comes back, and only then ; coming back on the same day keeps the same value,
 * so the resources keyed on it do not reload.
 */
describe('MarketClock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T20:00:00Z'));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  const comeBack = () => document.dispatchEvent(new Event('visibilitychange'));

  it('moves to the new day when the tab comes back', () => {
    const clock = TestBed.inject(MarketClock);
    expect(clock.today().getDate()).toBe(14);

    vi.setSystemTime(new Date('2026-10-15T13:00:00Z'));
    comeBack();

    expect(clock.today().getDate()).toBe(15);
  });

  it('keeps the same day object on a return the same day, but moves the time', () => {
    const clock = TestBed.inject(MarketClock);
    const today = clock.today();

    vi.setSystemTime(new Date('2026-10-14T21:00:00Z'));
    comeBack();

    expect(clock.today()).toBe(today);
    expect(clock.now()).toEqual(new Date('2026-10-14T21:00:00Z'));
  });

  it('ignores the tab going away', () => {
    const clock = TestBed.inject(MarketClock);
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    vi.setSystemTime(new Date('2026-10-15T13:00:00Z'));
    comeBack();
    hidden.mockRestore();

    expect(clock.today().getDate()).toBe(14);
  });
});
