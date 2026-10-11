import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BarBucket, BarSeries, StbBarChart } from './bar-chart.component';
import { ChartPalette } from './chart-theme';

/**
 * The stacked, signed bar chart of the reports (#685, #695). What is pinned is the option it hands
 * ECharts — jsdom draws nothing, so the stacking, the colours and the markers are read there :
 *
 *  - **One stacked bar series per series**, in order, each in its tone's colour, stacked by sign so
 *    positives pile above zero and negatives below.
 *  - **The net of each bar as a dot**, and a bucket where nothing moved as a flat tick instead — a
 *    net of zero and an empty week must not look alike.
 *  - **The tooltip** lists only the series that moved, then the net.
 *  - **Nothing renders without a bucket** — the consumer shows its own empty state.
 */
const PALETTE: ChartPalette = {
  accent: 'accent',
  accentFade: () => 'fade',
  text: 'text',
  textMuted: 'muted',
  border: 'border',
  surface: 'surface',
  fontFamily: 'Geist',
  gain: 'green',
  loss: 'red',
  cost: 'amber',
  neutral: 'grey',
};

const SERIES: BarSeries[] = [
  { key: 'winning', label: 'Winning trades', tone: 'gain' },
  { key: 'losing', label: 'Losing trades', tone: 'loss' },
  { key: 'fees', label: 'Fees', tone: 'cost' },
  { key: 'deposits', label: 'Deposits', tone: 'neutral' },
];

/** A week of the account : 14/09 traded and paid fees, 07/09 moved nothing. */
function week(label: string, values: Record<string, number>): BarBucket {
  return { label, title: `Week of ${label}`, values };
}

const BUCKETS: BarBucket[] = [
  week('14/09', { winning: 312, losing: -405, fees: -262, deposits: 0 }),
  week('07/09', {}),
  week('31/08', { deposits: 1000 }),
];

/** A fixed format, so the assertions do not depend on the runner's locale. */
function usd(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} $`;
}

interface SeriesOption {
  type: string;
  stack?: string;
  stackStrategy?: string;
  barCategoryGap?: string;
  data: (number | string)[];
  itemStyle: { color: string };
}

@Component({
  imports: [StbBarChart],
  template: `<ui-bar-chart
    [series]="series"
    [buckets]="buckets()"
    [format]="format"
    netLabel="Net"
  />`,
})
class Host {
  readonly series = SERIES;
  readonly buckets = signal<readonly BarBucket[]>(BUCKETS);
  readonly format = usd;
}

describe('StbBarChart', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  /** The option the chart hands ECharts, built against a fixed palette. */
  function option() {
    const fixture = TestBed.createComponent(StbBarChart);
    fixture.componentRef.setInput('series', SERIES);
    fixture.componentRef.setInput('buckets', BUCKETS);
    fixture.componentRef.setInput('format', usd);
    return fixture.componentInstance.option()(PALETTE) as {
      series: SeriesOption[];
      tooltip: { formatter: (params: unknown) => string };
      xAxis: { data: string[] };
    };
  }

  it('stacks one bar series per series, by sign, in its tone colour', () => {
    const bars = option().series.filter((s) => s.type === 'bar');

    expect(bars.map((b) => b.itemStyle.color)).toEqual(['green', 'red', 'amber', 'grey']);
    expect(bars.every((b) => b.stack === 'flow' && b.stackStrategy === 'samesign')).toBe(true);
    expect(bars[1].data).toEqual([-405, 0, 0]);
    // Wide enough to read on a wide card, not a 32 px sliver lost in its slot.
    expect(bars[0].barCategoryGap).toBe('40%');
  });

  it('draws the net of each bar as a dot, and an empty bucket as a tick instead', () => {
    const [net, tick] = option().series.filter((s) => s.type === 'scatter');

    expect(net.data).toEqual([-355, '-', 1000]);
    expect(tick.data).toEqual(['-', 0, '-']);
  });

  it('labels the axis with the buckets', () => {
    expect(option().xAxis.data).toEqual(['14/09', '07/09', '31/08']);
  });

  it('lists in the tooltip only the series that moved, then the net', () => {
    const tooltip = option().tooltip.formatter([{ dataIndex: 0 }]);

    expect(tooltip).toContain('Week of 14/09');
    expect(tooltip).toContain('Winning trades <b>+312.00 $</b>');
    expect(tooltip).toContain('Fees <b>-262.00 $</b>');
    expect(tooltip).not.toContain('Deposits');
    expect(tooltip).toContain('Net <b>-355.00 $</b>');
  });

  // A design-system tooltip : the next consumer may pass a ticker or a typed note.
  it('escapes what the consumer hands over, its own markup aside', () => {
    const fixture = TestBed.createComponent(StbBarChart);
    fixture.componentRef.setInput('series', [{ key: 'x', label: '<img src=x>', tone: 'gain' }]);
    fixture.componentRef.setInput('buckets', [
      { label: 'a', title: 'A & <b>B</b>', values: { x: 1 } },
    ]);
    fixture.componentRef.setInput('format', usd);
    const built = fixture.componentInstance.option()(PALETTE) as {
      tooltip: { formatter: (params: unknown) => string };
    };

    const tooltip = built.tooltip.formatter([{ dataIndex: 0 }]);
    expect(tooltip).toContain('A &amp; &lt;b&gt;B&lt;/b&gt;');
    expect(tooltip).toContain('&lt;img src=x&gt;');
    expect(tooltip).not.toContain('<img');
  });

  it('formats the amounts with the consumer format', () => {
    const fixture = TestBed.createComponent(StbBarChart);
    fixture.componentRef.setInput('series', SERIES);
    fixture.componentRef.setInput('buckets', BUCKETS);
    fixture.componentRef.setInput('format', (v: number) => `${v} USD`);
    const built = fixture.componentInstance.option()(PALETTE) as {
      tooltip: { formatter: (params: unknown) => string };
    };

    expect(built.tooltip.formatter([{ dataIndex: 2 }])).toContain('Deposits <b>1000 USD</b>');
  });

  describe('on screen', () => {
    it('draws the chart and its legend, the net last', async () => {
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('ui-chart .chart-canvas canvas')).not.toBeNull();
      const legend = [...el.querySelectorAll('.stb-bar-legend li')].map((li) =>
        li.textContent?.trim(),
      );
      expect(legend).toEqual(['Winning trades', 'Losing trades', 'Fees', 'Deposits', 'Net']);
    });

    it('renders nothing without a bucket', async () => {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.buckets.set([]);
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('ui-chart')).toBeNull();
      expect(fixture.nativeElement.querySelector('.stb-bar-legend')).toBeNull();
    });
  });
});
