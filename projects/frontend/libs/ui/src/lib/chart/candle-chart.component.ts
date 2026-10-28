import { Component, computed, input } from '@angular/core';
import { BarChart, CandlestickChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { StbChart, StbChartOptionFactory } from './chart.component';

echarts.use([
  CandlestickChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  MarkAreaComponent,
  MarkLineComponent,
]);

/** One candle. [label] is its place on the time axis (e.g. `09:41`), unique across the series. */
export interface CandleBar {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * A point marked on its candle — a pattern's Open, Push, Sink… [tone] `warn` is a point that does
 * not sit on its candle ; [towards] then draws a dashed leader from it to the candle's edge.
 */
export interface CandleMark {
  /** The letter drawn by the mark — `P`. */
  short: string;
  /** What the tooltip says of it — `Push · 09:41 · 2.20`. */
  title: string;
  /** The [CandleBar.label] it sits on. */
  at: string;
  price: number;
  tone: 'accent' | 'warn';
  /** Label above the mark (a high) or under it (a low). */
  above: boolean;
  towards?: number;
}

/** A horizontal reference — the previous close a gap is read from. */
export interface CandleLine {
  price: number;
  label: string;
}

/** A stretch of the axis shaded — the extended hours, from one bar label to another. */
export interface CandleShade {
  from: string;
  to: string;
}

/**
 * Candlestick chart with its volume underneath, for a day of bars read point by point. Green up, red
 * down, each volume bar in its candle's colour — the one exception to the colour rule, as on every
 * trading tool (`CLAUDE.md`, #804). The marks in the accent, a point off its candle in amber, so
 * neither reads as a candle. The wheel or a pinch zooms the time, the slider beside the price axis
 * the price.
 */
@Component({
  selector: 'ui-candle-chart',
  imports: [StbChart],
  template: `
    @if (bars().length > 0) {
      <ui-chart [optionFactory]="option()" [height]="height()" />
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class StbCandleChart {
  readonly bars = input.required<readonly CandleBar[]>();
  readonly marks = input<readonly CandleMark[]>([]);
  readonly line = input<CandleLine | null>(null);
  readonly shades = input<readonly CandleShade[]>([]);
  /**
   * Formats every price shown — the axis, the tooltip — with one precision for the whole scale,
   * in the reader's locale. The lib knows neither : the consumer does.
   */
  readonly formatPrice = input<(value: number) => string>((value) => value.toFixed(2));
  readonly height = input(320);

  readonly option = computed<StbChartOptionFactory>(() => {
    const bars = this.bars();
    const marks = this.marks();
    const line = this.line();
    const shades = this.shades();
    const price = this.formatPrice();
    const labels = bars.map((b) => b.label);

    return (palette) => ({
      textStyle: { fontFamily: palette.fontFamily },
      grid: [
        { left: 8, right: 84, top: 12, height: '68%' },
        { left: 8, right: 84, top: '80%', bottom: 24 },
      ],
      axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: palette.border } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        backgroundColor: palette.surface,
        borderColor: palette.border,
        textStyle: { color: palette.text },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number; seriesType: string }[];
          const bar = bars[list[0]?.dataIndex ?? -1];
          if (!bar) return '';
          return (
            `<b>${bar.label}</b><br>O ${price(bar.open)} · H ${price(bar.high)}<br>` +
            `L ${price(bar.low)} · C ${price(bar.close)}<br>${bar.volume.toLocaleString()}`
          );
        },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1] },
        // The wheel zooms the time ; the price has a slider of its own — an inside zoom on both
        // axes would answer the same wheel, Shift or not, and zoom them together.
        {
          type: 'slider',
          yAxisIndex: 0,
          filterMode: 'none',
          right: 6,
          top: 12,
          height: '68%',
          width: 12,
          showDetail: false,
          brushSelect: false,
          borderColor: palette.border,
          backgroundColor: 'transparent',
          fillerColor: palette.accentFade(0.15),
          dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
          handleStyle: { color: palette.surface, borderColor: palette.textMuted },
          moveHandleStyle: { color: palette.border },
        },
      ],
      xAxis: [
        {
          type: 'category',
          data: labels,
          gridIndex: 0,
          axisLine: { lineStyle: { color: palette.border } },
          axisLabel: { show: false },
          axisTick: { show: false },
        },
        {
          type: 'category',
          data: labels,
          gridIndex: 1,
          axisLine: { lineStyle: { color: palette.border } },
          axisLabel: { color: palette.textMuted, hideOverlap: true },
          axisTick: { show: false },
        },
      ],
      yAxis: [
        {
          scale: true,
          position: 'right',
          splitNumber: 4,
          axisLabel: { color: palette.textMuted, formatter: (v: number) => price(v) },
          splitLine: { lineStyle: { color: palette.border, opacity: 0.5 } },
        },
        { gridIndex: 1, show: false, scale: false },
      ],
      series: [
        {
          type: 'candlestick',
          name: 'bars',
          // ECharts reads a candle as [open, close, low, high].
          data: bars.map((b) => [b.open, b.close, b.low, b.high]),
          itemStyle: {
            color: palette.gain,
            color0: palette.loss,
            borderColor: palette.gain,
            borderColor0: palette.loss,
          },
          markArea: {
            silent: true,
            itemStyle: { color: palette.border, opacity: 0.35 },
            data: shades.map((s) => [{ xAxis: s.from }, { xAxis: s.to }]),
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: palette.textMuted, type: 'dashed' },
            label: { color: palette.textMuted, position: 'insideStartTop' },
            data: line ? [{ yAxis: line.price, label: { formatter: line.label } }] : [],
          },
        },
        {
          type: 'bar',
          name: 'volume',
          xAxisIndex: 1,
          yAxisIndex: 1,
          silent: true,
          data: bars.map((b) => ({
            value: b.volume,
            itemStyle: { color: b.close >= b.open ? palette.gain : palette.loss },
          })),
          itemStyle: { opacity: 0.45 },
        },
        {
          type: 'scatter',
          name: 'marks',
          symbolSize: 9,
          z: 5,
          data: marks.map((m) => {
            const color = m.tone === 'warn' ? palette.cost : palette.accent;
            return {
              value: [m.at, m.price],
              name: m.title,
              itemStyle: { color, borderColor: palette.surface, borderWidth: 1.5 },
              label: {
                show: true,
                formatter: m.short,
                position: m.above ? 'top' : 'bottom',
                color,
                fontWeight: 650,
              },
            };
          }),
          tooltip: { trigger: 'item', formatter: (p: { name: string }) => p.name },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: palette.cost, type: 'dashed', width: 1.5 },
            label: { show: false },
            data: marks
              .filter((m) => m.towards !== undefined)
              .map((m) => [{ coord: [m.at, m.price] }, { coord: [m.at, m.towards] }]),
          },
        },
      ],
    });
  });
}
