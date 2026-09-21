import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { provideNativeDateAdapter } from '@portfolioai/ui';
import { describe, expect, it } from 'vitest';
import { PeriodSelection, computePeriodRange } from '../period-preset/period-preset';
import { PeriodFilter } from './period-filter';

/**
 * Component spec for the shared period filter of the stats, journal and account pages. What it
 * pins : a preset picked is handed over with its range (`today` included), « custom » keeps the
 * range on screen and reveals the from / to pickers, and a date typed by hand switches the
 * selection to « custom ». The range maths themselves live in `period-preset.spec`.
 */

const THIS_MONTH: PeriodSelection = { period: 'thisMonth', ...computePeriodRange('thisMonth') };

function setup(selection: PeriodSelection = THIS_MONTH): {
  fixture: ComponentFixture<PeriodFilter>;
  filter: PeriodFilter;
  emitted: PeriodSelection[];
} {
  TestBed.configureTestingModule({
    imports: [PeriodFilter],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
    ],
  });
  const fixture = TestBed.createComponent(PeriodFilter);
  fixture.componentRef.setInput('selection', selection);
  const emitted: PeriodSelection[] = [];
  fixture.componentInstance.selectionChange.subscribe((s) => emitted.push(s));
  fixture.detectChanges();
  return { fixture, filter: fixture.componentInstance, emitted };
}

describe('PeriodFilter', () => {
  it('offers « today » right after « all »', () => {
    const { filter } = setup();

    expect(filter.presets.slice(0, 3)).toEqual(['all', 'today', 'custom']);
  });

  it('hands a preset over with its range', () => {
    const { filter, emitted } = setup();

    filter.pickPreset('today');

    expect(emitted).toEqual([{ period: 'today', ...computePeriodRange('today') }]);
  });

  it('keeps the range on screen when switching to « custom »', () => {
    const { filter, emitted } = setup();

    filter.pickPreset('custom');

    expect(emitted).toEqual([{ ...THIS_MONTH, period: 'custom' }]);
  });

  it('shows the from / to pickers only on « custom »', () => {
    const closed = setup();
    expect(closed.fixture.nativeElement.querySelectorAll('.date-field').length).toBe(0);
    TestBed.resetTestingModule();

    const open = setup({ ...THIS_MONTH, period: 'custom' });
    expect(open.fixture.nativeElement.querySelectorAll('.date-field').length).toBe(2);
  });

  it('switches to « custom » when a date is picked by hand', () => {
    const { filter, emitted } = setup();
    const from = new Date(2026, 8, 14);

    filter.setDateFrom(from);

    expect(emitted).toEqual([{ ...THIS_MONTH, period: 'custom', dateFrom: from }]);
  });
});
