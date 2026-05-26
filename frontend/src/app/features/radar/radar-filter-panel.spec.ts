/**
 * Tests on the radar filter panel. The form is the only mutable state in the panel — we pin its
 * hydration (seeded once from the [initial] input) and its emission shape (debounced
 * [filterChanged] with `null` coalescing for empty inputs).
 *
 * The 300 ms debounce is handled with Vitest fake timers so the suite stays sub-second.
 */
import { vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RadarFilterPanel } from './radar-filter-panel';
import {
  DEFAULT_SCREENER_FILTER,
  ScreenerFilter,
} from '../../core/api/screener/screener.repository';

describe('RadarFilterPanel', () => {
  let fixture: ComponentFixture<RadarFilterPanel>;
  let component: RadarFilterPanel;

  async function setup(initial: ScreenerFilter = DEFAULT_SCREENER_FILTER): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RadarFilterPanel],
      providers: [provideZonelessChangeDetection(), provideTranslateService({ lang: 'en' })],
    }).compileComponents();

    fixture = TestBed.createComponent(RadarFilterPanel);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('initial', initial);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('seeds the form from the [initial] input', async () => {
    await setup({
      gapPctMin: 12,
      volumeRatioMin: 4,
      marketCapMin: 3_000_000_000,
      marketCapMax: 8_000_000_000,
      exchange: null,
      sector: 'Technology',
    });

    expect(component.form.value).toEqual({
      gapPctMin: 12,
      volumeRatioMin: 4,
      marketCapMin: 3_000_000_000,
      marketCapMax: 8_000_000_000,
      sector: 'Technology',
    });
  });

  it('represents a null sector seed as an empty string in the form', async () => {
    // The `<mat-select>` binding uses '' as the "any sector" sentinel — we map back to `null`
    // on emission. Seed-side, a null sector must therefore hydrate as ''.
    await setup({ ...DEFAULT_SCREENER_FILTER, sector: null });

    expect(component.form.value.sector).toBe('');
  });

  it('debounces form changes and emits the consolidated filter once', async () => {
    vi.useFakeTimers();
    try {
      await setup();
      const emitted: ScreenerFilter[] = [];
      component.filterChanged.subscribe((f) => emitted.push(f));

      component.form.patchValue({ gapPctMin: 7 });
      component.form.patchValue({ gapPctMin: 8 });
      component.form.patchValue({ gapPctMin: 9 });

      // Fast-forward past the 300 ms debounce window — only the last value reaches the output.
      await vi.advanceTimersByTimeAsync(350);

      expect(emitted.length).toBe(1);
      expect(emitted[0].gapPctMin).toBe(9);
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces empty numeric inputs to the default floors rather than 0', async () => {
    vi.useFakeTimers();
    try {
      await setup();
      const emitted: ScreenerFilter[] = [];
      component.filterChanged.subscribe((f) => emitted.push(f));

      // Material number inputs emit `null` when cleared. We coerce to the default to avoid
      // flooding the radar with every mid-cap "moving by 0.1 %" — the floor stays meaningful
      // even when the user blanks the field.
      component.form.patchValue({ gapPctMin: null, volumeRatioMin: null });
      await vi.advanceTimersByTimeAsync(350);

      expect(emitted[0].gapPctMin).toBe(DEFAULT_SCREENER_FILTER.gapPctMin);
      expect(emitted[0].volumeRatioMin).toBe(DEFAULT_SCREENER_FILTER.volumeRatioMin);
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps the empty-string sector back to null when emitting', async () => {
    vi.useFakeTimers();
    try {
      await setup({ ...DEFAULT_SCREENER_FILTER, sector: 'Technology' });
      const emitted: ScreenerFilter[] = [];
      component.filterChanged.subscribe((f) => emitted.push(f));

      component.form.patchValue({ sector: '' });
      await vi.advanceTimersByTimeAsync(350);

      expect(emitted[0].sector).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits resetRequested when reset() is called', async () => {
    await setup();
    const resetSpy = vi.fn();
    component.resetRequested.subscribe(resetSpy);

    component.reset();

    expect(resetSpy).toHaveBeenCalledOnce();
  });
});
