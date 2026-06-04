/**
 * Tests on the radar filter panel after Phase 6 ticket (8) v0.5 — the form was slimmed to two
 * axes (gap %, volume ratio), the cap range + sector knobs disappeared because (a) the universe
 * is hardcoded to NASDAQ_MID_CAP server-side, (b) sector was no-op on every live provider. We pin
 * the form hydration (seeded once from the [initial] input), the emission shape (debounced
 * [filterChanged]), and the empty-input coalescing to defaults.
 *
 * The 300 ms debounce is handled with Vitest fake timers so the suite stays sub-second.
 */
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import {
  DEFAULT_SCREENER_FILTER,
  ScreenerFilter,
} from '../../core/api/screener/screener.repository';
import { RadarFilterPanel } from './radar-filter-panel';

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
    await setup({ gapPctMin: 12, volumeRatioMin: 4 });

    expect(component.form.value).toEqual({ gapPctMin: 12, volumeRatioMin: 4 });
  });

  it('debounces form changes and emits the consolidated filter once', async () => {
    vi.useFakeTimers();
    try {
      await setup();
      const emitted: ScreenerFilter[] = [];
      component.filterChanged.subscribe((f) => emitted.push(f));

      component.form.patchValue({ gapPctMin: 11 });
      component.form.patchValue({ gapPctMin: 12 });
      component.form.patchValue({ gapPctMin: 13 });

      // Fast-forward past the 300 ms debounce window — only the last value reaches the output.
      await vi.advanceTimersByTimeAsync(350);

      expect(emitted.length).toBe(1);
      expect(emitted[0].gapPctMin).toBe(13);
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
      // flooding the radar with every "moving by 0.1 %" mover — the floor stays meaningful even
      // when the user blanks the field.
      component.form.patchValue({ gapPctMin: null, volumeRatioMin: null });
      await vi.advanceTimersByTimeAsync(350);

      expect(emitted[0].gapPctMin).toBe(DEFAULT_SCREENER_FILTER.gapPctMin);
      expect(emitted[0].volumeRatioMin).toBe(DEFAULT_SCREENER_FILTER.volumeRatioMin);
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
