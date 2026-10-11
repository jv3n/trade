import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AreaChartPoint, StbAreaChart } from './area-chart.component';

/**
 * The area chart's contract with its consumer : below two points there is no curve, so the host
 * renders nothing and the page shows its own empty state ; from two points on, the chart is drawn.
 * The second case runs the real `StbChart` under jsdom, which only works with the `ResizeObserver`
 * stub of the shared test setup (#592).
 */
@Component({
  imports: [StbAreaChart],
  template: `<ui-area-chart [points]="points()" unit=" $" />`,
})
class Host {
  readonly points = signal<readonly AreaChartPoint[]>([]);
}

/** One day of the account balance, as the account page feeds the chart. */
function point(day: number, balance: number): AreaChartPoint {
  const date = new Date(2026, 9, day);
  return { x: date.getTime(), y: balance, label: date.toDateString() };
}

describe('StbAreaChart', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  async function render(points: readonly AreaChartPoint[]) {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.points.set(points);
    await fixture.whenStable();
    return fixture;
  }

  it('renders no chart for a single point', async () => {
    const fixture = await render([point(1, 27360)]);

    expect(fixture.nativeElement.querySelector('ui-chart')).toBeNull();
  });

  it('draws the chart from two points on', async () => {
    const fixture = await render([point(1, 27360), point(2, 27910)]);

    expect(fixture.nativeElement.querySelector('ui-chart .chart-canvas canvas')).not.toBeNull();
  });
});
