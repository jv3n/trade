import { Component, computed, input } from '@angular/core';
import { ChartPalette } from './chart-theme';
import { StbChart, StbChartOptionFactory } from './chart.component';

/**
 * What a series stands for, which sets its colour : `gain` / `loss` are outcomes (green / red),
 * `cost` a fee or a locate (amber), `neutral` a fund movement — a deposit is no outcome.
 */
export type BarTone = 'gain' | 'loss' | 'cost' | 'neutral';

/** One stacked series. [label] is plain text — the consumer translates it, the chart escapes it. */
export interface BarSeries {
  key: string;
  label: string;
  tone: BarTone;
}

/**
 * One bar : its axis label, its tooltip title, and a signed value per series key. [label] and
 * [title] are plain text — the tooltip escapes them, so a ticker or a typed note is safe in them.
 */
export interface BarBucket {
  label: string;
  title: string;
  values: Readonly<Record<string, number>>;
}

/**
 * Stacked, signed bar chart (#685) — one bar per bucket around a zero line : what is positive
 * stacks above, what is negative below, each series in its tone's colour. Each bar carries its
 * **net as a dot** ; a bucket where nothing moved is a flat tick on the line, never skipped, so it
 * does not read as a net that happens to be zero. Hovering a bar lists the series that moved in it
 * and the net.
 *
 * The consumer hands over [series] and [buckets] ; the stacking, the axes, the colours and the
 * legend are the lib's business, like `StbAreaChart` (#228). It renders nothing without a bucket —
 * the consumer shows its own empty state.
 */
@Component({
  selector: 'ui-bar-chart',
  imports: [StbChart],
  template: `
    @if (buckets().length) {
      <!-- A canvas says nothing to a screen reader : the table below is the chart, in text. -->
      <ui-chart aria-hidden="true" [optionFactory]="option()" [height]="height()" />
      <table class="cdk-visually-hidden" data-testid="bar-chart-data">
        <thead>
          <tr>
            <td></td>
            @for (s of series(); track s.key) {
              <th scope="col">{{ s.label }}</th>
            }
            <th scope="col">{{ netLabel() }}</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr>
              <th scope="row">{{ row.title }}</th>
              @for (cell of row.cells; track $index) {
                <td>{{ cell }}</td>
              }
              <td>{{ row.net }}</td>
            </tr>
          }
        </tbody>
      </table>
      <ul class="stb-bar-legend" aria-hidden="true">
        @for (s of series(); track s.key) {
          <li><i [class]="'stb-bar-swatch stb-bar-swatch--' + s.tone"></i>{{ s.label }}</li>
        }
        <li><i class="stb-bar-swatch stb-bar-swatch--net"></i>{{ netLabel() }}</li>
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class StbBarChart {
  readonly series = input.required<readonly BarSeries[]>();
  readonly buckets = input.required<readonly BarBucket[]>();
  /**
   * Formats an amount in the tooltip — required, so the numbers follow the app's language rather
   * than the browser's locale. Its output is rendered as text.
   */
  readonly format = input.required<(value: number) => string>();
  /** The tooltip's and the legend's name for the net — translated by the consumer. */
  readonly netLabel = input('Net');
  readonly height = input(240);

  /**
   * The chart as text, one row per bar : its title, the amount of each series (empty where it did
   * not move) and the net. What a screen reader reads — and what an e2e test can (#702).
   */
  readonly rows = computed(() => {
    const format = this.format();
    return this.buckets().map((b) => {
      const values = this.series().map((s) => b.values[s.key] ?? 0);
      return {
        title: b.title,
        cells: values.map((v) => (v === 0 ? '' : format(v))),
        net: format(values.reduce((sum, v) => sum + v, 0)),
      };
    });
  });

  readonly option = computed<StbChartOptionFactory>(() => {
    const series = this.series();
    const buckets = this.buckets();
    const format = this.format();
    const netLabel = this.netLabel();
    const nets = buckets.map((b) => series.reduce((sum, s) => sum + (b.values[s.key] ?? 0), 0));
    const moved = buckets.map((b) => series.some((s) => (b.values[s.key] ?? 0) !== 0));
    const ends = buckets.map((b) => stackEnds(series, b));

    return (palette) => ({
      // The card around the chart provides the padding ; a second one inside wastes height.
      grid: { top: 8, right: 8, bottom: 24, left: 8, containLabel: true },
      textStyle: { fontFamily: palette.fontFamily },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: palette.border, opacity: 0.25 } },
        backgroundColor: palette.surface,
        borderColor: palette.border,
        textStyle: { color: palette.text },
        formatter: (params: unknown) => {
          const [first] = params as { dataIndex: number }[];
          // Hovering off the bars hands over an empty list ; throwing would kill the tooltip.
          if (!first) return '';
          const bucket = buckets[first.dataIndex];
          // ECharts renders the formatter's string as HTML : everything the consumer handed over is
          // escaped, the markup is ours.
          const rows = series
            .filter((s) => (bucket.values[s.key] ?? 0) !== 0)
            .map(
              (s) =>
                `${swatch(toneColor(palette, s.tone))}${escapeHtml(s.label)} <b>${escapeHtml(format(bucket.values[s.key]))}</b>`,
            );
          return [
            escapeHtml(bucket.title),
            ...rows,
            `${escapeHtml(netLabel)} <b>${escapeHtml(format(nets[first.dataIndex]))}</b>`,
          ].join('<br>');
        },
      },
      xAxis: {
        type: 'category',
        data: buckets.map((b) => b.label),
        // The zero line : the axis sits on 0 and is drawn a shade stronger than the grid.
        axisLine: { onZero: true, lineStyle: { color: palette.textMuted, width: 1.5 } },
        axisLabel: { color: palette.textMuted, hideOverlap: true, margin: 10 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        splitNumber: 3,
        axisLabel: { color: palette.textMuted },
        // The grid stays behind the bars : a faint dash, the zero line carrying the reading.
        splitLine: { lineStyle: { color: palette.border, opacity: 0.35, type: 'dashed' } },
      },
      series: [
        ...series.map((s) => ({
          type: 'bar',
          name: s.label,
          // Positives pile above zero and negatives below, whatever their order in the list.
          stack: 'flow',
          stackStrategy: 'samesign',
          // The bars take the room they have : 60 % of their slot, capped so two or three bars over a
          // wide card do not turn into blocks.
          barCategoryGap: '40%',
          barMaxWidth: 96,
          data: buckets.map((b, i) => ({
            // A zero is no segment at all : drawn, its hairline would cut the zero line.
            value: b.values[s.key] || '-',
            // Only the stack's two ends are rounded : the segments inside meet square.
            itemStyle: { borderRadius: cornerRadius(s.key, ends[i]) },
          })),
          // A hairline of the card's own colour between the segments, so two stacked tones read
          // as two.
          itemStyle: {
            color: toneColor(palette, s.tone),
            borderColor: palette.surface,
            borderWidth: 1,
          },
          emphasis: { disabled: true },
        })),
        {
          // The net as a hole : legible over any colour it lands on.
          type: 'scatter',
          name: netLabel,
          symbol: 'circle',
          symbolSize: 9,
          z: 10,
          silent: true,
          data: nets.map((net, i) => (moved[i] ? net : '-')),
          itemStyle: {
            color: palette.surface,
            borderColor: palette.text,
            borderWidth: 2,
            shadowBlur: 4,
            shadowColor: 'rgba(0, 0, 0, 0.25)',
          },
        },
        {
          // A bucket where nothing moved : a flat tick on the line, not a dot at zero.
          type: 'scatter',
          symbol: 'rect',
          symbolSize: [16, 3],
          z: 10,
          silent: true,
          data: moved.map((m) => (m ? '-' : 0)),
          itemStyle: { color: palette.textMuted },
        },
      ],
    });
  });
}

/** Which series closes the stack above zero, and which below — the two that get round corners. */
function stackEnds(
  series: readonly BarSeries[],
  bucket: BarBucket,
): { top: string | null; bottom: string | null } {
  let top: string | null = null;
  let bottom: string | null = null;
  for (const s of series) {
    const value = bucket.values[s.key] ?? 0;
    if (value > 0) top = s.key;
    if (value < 0) bottom = s.key;
  }
  return { top, bottom };
}

const RADIUS = 4;

function cornerRadius(key: string, ends: { top: string | null; bottom: string | null }): number[] {
  if (key === ends.top) return [RADIUS, RADIUS, 0, 0];
  if (key === ends.bottom) return [0, 0, RADIUS, RADIUS];
  return [0, 0, 0, 0];
}

function toneColor(palette: ChartPalette, tone: BarTone): string {
  return palette[tone];
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function swatch(color: string): string {
  return `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${color}"></span>`;
}
