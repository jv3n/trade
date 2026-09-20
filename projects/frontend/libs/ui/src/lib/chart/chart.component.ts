import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartPalette, onThemeChange, readChartPalette } from './chart-theme';

/**
 * Tree-shaken registration : only the charts and components the lib actually draws. The full
 * `echarts` bundle is about a megabyte, and most of it would never render here. A new chart type
 * adds its import to this list.
 */
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

/**
 * ECharts animates over a second by default, which reads as lag when a filter redraws the curve.
 * A chart type can still override these in its own option.
 */
const ANIMATION_DEFAULTS = {
  animationDuration: 300,
  animationDurationUpdate: 250,
  animationEasing: 'cubicOut',
  animationEasingUpdate: 'cubicOut',
} as const;

/** The option shape, re-exported so a chart component can type its own builder. */
export type StbChartOption = echarts.EChartsCoreOption;

/** Builds an option from the resolved palette — charts are described as a function of the theme. */
export type StbChartOptionFactory = (palette: ChartPalette) => StbChartOption;

/**
 * The base every chart type is built on : it owns the ECharts instance and the three things every
 * chart needs and always gets wrong — resizing with its container, disposing with the view, and
 * following a light / dark switch **live** rather than only at first paint.
 *
 * Consumers don't use it directly : each chart type wraps it and hands it an
 * [StbChartOptionFactory], so a feature asks for "an area chart of these points" and never writes
 * a series definition (cf. `StbAreaChart`).
 */
@Component({
  selector: 'ui-chart',
  template: '<div #canvas class="chart-canvas"></div>',
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .chart-canvas {
      width: 100%;
      height: 100%;
    }
  `,
})
export class StbChart {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Describes the chart against the current palette ; re-run on every theme change. */
  readonly optionFactory = input.required<StbChartOptionFactory>();
  /** Height of the drawing area. Charts have no intrinsic size. */
  readonly height = input(160);

  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');
  private instance: echarts.ECharts | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const factory = this.optionFactory();
      const height = this.height();
      if (!this.isBrowser) return;
      this.canvas().nativeElement.style.height = `${height}px`;
      this.render(factory);
    });

    if (this.isBrowser) {
      // A chart sized by its container has to be told when that container moves.
      const resizeObserver = new ResizeObserver(() => this.instance?.resize());
      queueMicrotask(() => resizeObserver.observe(this.canvas().nativeElement));

      const stopWatchingTheme = onThemeChange(() => this.render(this.optionFactory(), true));

      destroyRef.onDestroy(() => {
        resizeObserver.disconnect();
        stopWatchingTheme();
        this.instance?.dispose();
        this.instance = null;
      });
    }
  }

  /**
   * Applies the option. A data change merges into the live instance : `notMerge` tears down the
   * tooltip and the axis pointer along with everything else, and the chart comes back mute to the
   * mouse. `replaceMerge` on the series still drops the ones the new option no longer declares.
   *
   * A theme change is the one case worth a [rebuild] : every colour is replaced at once, and a
   * merge would keep the previous palette in the components that don't redeclare it.
   */
  private render(factory: StbChartOptionFactory, rebuild = false): void {
    if (rebuild) {
      this.instance?.dispose();
      this.instance = null;
    }
    this.instance ??= echarts.init(this.canvas().nativeElement, undefined, {
      renderer: 'canvas',
    });
    this.instance.setOption(
      { ...ANIMATION_DEFAULTS, ...factory(readChartPalette()) },
      { replaceMerge: ['series'] },
    );
  }
}
