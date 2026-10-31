import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CandleBar, CandleLeg, StbCandleChart } from './candle-chart.component';
import { ChartPalette } from './chart-theme';

/**
 * The candle chart's contract with its consumer : no bars, no chart — the page shows its own state
 * (« not yet », « none served ») ; from one bar on, the chart is drawn. Runs the real `StbChart`
 * under jsdom, with the `ResizeObserver` stub of the shared test setup (#592).
 */
@Component({
  imports: [StbCandleChart],
  template: `<ui-candle-chart [bars]="bars()" [legs]="legs()" />`,
})
class Host {
  readonly bars = signal<readonly CandleBar[]>([]);
  readonly legs = signal<readonly CandleLeg[]>([]);
  readonly chart = viewChild(StbCandleChart);
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

const PALETTE = {
  accent: 'indigo',
  cost: 'amber',
  accentFade: () => 'indigo',
} as unknown as ChartPalette;

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

  // #818 : on the marks' series they would be silent, `silent` holding for the leaders' whole markLine.
  it('draws a leg on a series of its own, with its own tooltip and its tone', async () => {
    const fixture = await render([OPEN_BAR]);
    fixture.componentInstance.legs.set([
      {
        title: 'Base → Apex · +52.3% · 8 min',
        from: { at: '09:30', price: 1.9 },
        to: { at: '09:38', price: 2.9 },
        tone: 'warn',
      },
    ]);
    await fixture.whenStable();

    const option = fixture.componentInstance.chart()!.option()(PALETTE) as {
      series: {
        name: string;
        markLine?: { silent?: boolean; tooltip: object; data: unknown[][] };
      }[];
    };
    const legs = option.series.find((s) => s.name === 'legs')!.markLine!;

    expect(legs.silent).toBeUndefined();
    expect(legs.tooltip).toMatchObject({ trigger: 'item' });
    expect(legs.data[0][0]).toMatchObject({
      name: 'Base → Apex · +52.3% · 8 min',
      coord: ['09:30', 1.9],
      lineStyle: { color: PALETTE.cost },
    });
    expect(legs.data[0][1]).toEqual({ coord: ['09:38', 2.9] });
  });
});
