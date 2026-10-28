import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CandleBar, StbCandleChart } from './candle-chart.component';

/**
 * The candle chart's contract with its consumer : no bars, no chart — the page shows its own state
 * (« not yet », « none served ») ; from one bar on, the chart is drawn. Runs the real `StbChart`
 * under jsdom, with the `ResizeObserver` stub of the shared test setup (#592).
 */
@Component({
  imports: [StbCandleChart],
  template: `<ui-candle-chart [bars]="bars()" />`,
})
class Host {
  readonly bars = signal<readonly CandleBar[]>([]);
}

/** OLOX at the open, 21/10. */
const OPEN_BAR: CandleBar = {
  label: '09:30',
  open: 1.1,
  high: 1.14,
  low: 1.02,
  close: 1.04,
  volume: 182_340,
};

describe('StbCandleChart', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  async function render(bars: readonly CandleBar[]) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.bars.set(bars);
    await fixture.whenStable();
    return fixture;
  }

  it('renders no chart without bars', async () => {
    const fixture = await render([]);

    expect(fixture.nativeElement.querySelector('ui-chart')).toBeNull();
  });

  it('draws the chart from one bar on', async () => {
    const fixture = await render([OPEN_BAR]);

    expect(fixture.nativeElement.querySelector('ui-chart .chart-canvas canvas')).not.toBeNull();
  });
});
