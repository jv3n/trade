import { Component, computed, input } from '@angular/core';
import * as echarts from 'echarts/core';
import { StbChart, StbChartOptionFactory } from './chart.component';

/** One point of an area chart. `x` is a numeric position (e.g. epoch ms), `y` the value. */
export interface AreaChartPoint {
  x: number;
  y: number;
  /** What the tooltip shows above the value — usually the formatted date. */
  label: string;
}

/**
 * Area chart — a filled curve with a hover tooltip, for a single series read over time (the account
 * balance, a cumulative P&L…). The consumer hands over [points] and a [unit] ; the series, the axes
 * and the palette are the lib's business.
 *
 * Needs at least two points to mean anything : below that the host renders nothing and the consumer
 * shows its own empty state.
 */
@Component({
  selector: 'ui-area-chart',
  imports: [StbChart],
  template: `
    @if (hasData()) {
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
export class StbAreaChart {
  readonly points = input.required<readonly AreaChartPoint[]>();
  /** Appended to the value in the tooltip — e.g. ` $`. */
  readonly unit = input('');
  readonly height = input(160);

  readonly hasData = computed(() => this.points().length >= 2);

  readonly option = computed<StbChartOptionFactory>(() => {
    const points = this.points();
    const unit = this.unit();
    const labels = new Map(points.map((p) => [p.x, p.label]));

    return (palette) => ({
      // The card around the chart provides the padding ; a second one inside wastes height.
      grid: { top: 8, right: 8, bottom: 24, left: 8, containLabel: true },
      textStyle: { fontFamily: palette.fontFamily },
      tooltip: {
        trigger: 'axis',
        backgroundColor: palette.surface,
        borderColor: palette.border,
        textStyle: { color: palette.text },
        axisPointer: { lineStyle: { color: palette.border } },
        formatter: (params: unknown) => {
          const [first] = params as { value: [number, number] }[];
          // Hovering past the last point hands over an empty list ; throwing here would kill the
          // mouse handler and the tooltip would never come back.
          if (!first) return '';
          const [x, y] = first.value;
          const value = y.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return `${labels.get(x) ?? ''}<br><b>${value}${unit}</b>`;
        },
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: palette.border } },
        axisLabel: { color: palette.textMuted, hideOverlap: true },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        // The interesting part of a balance curve is its variation, not its distance to zero.
        scale: true,
        // Three ticks are enough to read the scale ; more of them turn into a grid the curve has to
        // fight against.
        splitNumber: 3,
        axisLabel: { color: palette.textMuted },
        splitLine: { lineStyle: { color: palette.border, opacity: 0.5 } },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: points.map((p) => [p.x, p.y]),
          lineStyle: { width: 2.5, color: palette.accent },
          itemStyle: { color: palette.accent },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: palette.accentFade(0.35) },
              { offset: 1, color: palette.accentFade(0) },
            ]),
          },
        },
      ],
    });
  });
}
