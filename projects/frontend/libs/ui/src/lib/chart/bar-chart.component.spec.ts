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
 *  - **A segment answers a click only when asked to** (#739) — a pointer, and its bucket and series
 *    key out ; ECharts' default pointer over a bar that does nothing is turned off otherwise.
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
  silent?: boolean;
  cursor?: string;
  emphasis?: { disabled?: boolean };
  stack?: string;
  stackStrategy?: string;
  barCategoryGap?: string;
  data: (number | string | { value: number | string; itemStyle: { borderRadius: number[] } })[];
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
    // A zero draws no segment : its hairline would cut the zero line.
    expect(bars[1].data.map((d) => (typeof d === 'object' ? d.value : d))).toEqual([
      -405,
      '-',
      '-',
    ]);
    // Wide enough to read on a wide card, not a 32 px sliver lost in its slot.
    expect(bars[0].barCategoryGap).toBe('40%');
  });

  // Rounded ends read as one bar ; rounded segments inside it would read as a pile of pills.
  it('rounds only the two ends of each stack', () => {
    const bars = option().series.filter((s) => s.type === 'bar');
    const radius = (series: number) => {
      const item = bars[series].data[0];
      return typeof item === 'object' ? item.itemStyle.borderRadius : null;
    };

    // 14/09 : winners above, then losers and fees below — the fees close the stack downwards.
    expect(radius(0)).toEqual([4, 4, 0, 0]);
    expect(radius(1)).toEqual([0, 0, 0, 0]);
    expect(radius(2)).toEqual([0, 0, 4, 4]);
  });

  it('draws the net of each bar as a dot, and an empty bucket as a tick instead', () => {
    const [net, tick] = option().series.filter((s) => s.type === 'scatter');

    expect(net.data).toEqual([-355, '-', 1000]);
    expect(tick.data).toEqual(['-', 0, '-']);
  });

  // #749 : silent, the dot let its click through to the segment it sits on — on staging, October's
  // net inside the deposits opened the deposits.
  it('keeps the click aimed at the net dot from reaching the segment under it, without a hover', () => {
    const [net] = option().series.filter((s) => s.type === 'scatter');

    expect(net.silent).not.toBe(true);
    expect(net.cursor).toBe('default');
    // Nor does it react to the pointer, the hover the silence used to suppress.
    expect(net.emphasis?.disabled).toBe(true);
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

  // #737 : the tooltip still showing at the right of a week view keeps its index when the
  // grouping switches to quarters, and ECharts calls the new formatter with it.
  it('shows nothing, rather than throwing, for an index past the last bucket', () => {
    expect(option().tooltip.formatter([{ dataIndex: BUCKETS.length + 5 }])).toBe('');
  });

  it('shows nothing when hovering off the bars', () => {
    expect(option().tooltip.formatter([])).toBe('');
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

  describe('clicks (#739)', () => {
    function clickable(enabled: boolean) {
      const fixture = TestBed.createComponent(StbBarChart);
      fixture.componentRef.setInput('series', SERIES);
      fixture.componentRef.setInput('buckets', BUCKETS);
      fixture.componentRef.setInput('format', usd);
      fixture.componentRef.setInput('clickable', enabled);
      fixture.componentRef.setInput('hint', enabled ? 'Click a segment' : null);
      const clicks: unknown[] = [];
      fixture.componentInstance.segmentClick.subscribe((c) => clicks.push(c));
      return { chart: fixture.componentInstance, clicks };
    }

    function bars(chart: StbBarChart) {
      return (
        chart.option()(PALETTE) as { series: { type: string; cursor?: string }[] }
      ).series.filter((s) => s.type === 'bar');
    }

    it('names the bucket and the series key of the segment clicked', () => {
      const { chart, clicks } = clickable(true);

      chart.onItemClick({ seriesIndex: 2, dataIndex: 0 });

      expect(clicks).toEqual([{ bucket: 0, series: 'fees' }]);
      expect(bars(chart).every((b) => b.cursor === 'pointer')).toBe(true);
    });

    // The net dot and the empty tick come after the bar series : a click there must not move.
    it('ignores a click on the markers drawn after the bars', () => {
      const { chart, clicks } = clickable(true);

      chart.onItemClick({ seriesIndex: SERIES.length, dataIndex: 0 });
      chart.onItemClick({ seriesIndex: -1, dataIndex: 0 });

      expect(clicks).toEqual([]);
    });

    it('stays mute, with no pointer, unless clickable', () => {
      const { chart, clicks } = clickable(false);

      chart.onItemClick({ seriesIndex: 0, dataIndex: 0 });

      expect(clicks).toEqual([]);
      expect(bars(chart).every((b) => b.cursor === 'default')).toBe(true);
    });

    it('ends the tooltip on the hint, when one is given', () => {
      const tooltip = (
        clickable(true).chart.option()(PALETTE) as {
          tooltip: { formatter: (params: unknown) => string };
        }
      ).tooltip.formatter([{ dataIndex: 0 }]);

      expect(tooltip).toMatch(/Click a segment<\/span>$/);
    });
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

    // A canvas is mute : the bars are also a table, for a screen reader and for an e2e test (#702).
    it('carries the chart as a visually hidden table, the canvas hidden from assistive tech', async () => {
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();

      const el: HTMLElement = fixture.nativeElement;
      const table = el.querySelector('[data-testid="bar-chart-data"]');
      expect(table?.classList).toContain('cdk-visually-hidden');
      expect(el.querySelector('ui-chart')?.getAttribute('aria-hidden')).toBe('true');
      const rows = [...(table?.querySelectorAll('tbody tr') ?? [])].map((tr) =>
        [...tr.children].map((cell) => cell.textContent?.trim()),
      );
      expect(rows).toEqual([
        ['Week of 14/09', '+312.00 $', '-405.00 $', '-262.00 $', '', '-355.00 $'],
        ['Week of 07/09', '', '', '', '', '0.00 $'],
        ['Week of 31/08', '', '', '', '+1000.00 $', '+1000.00 $'],
      ]);
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
