import { DecimalPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';

/** One point of an area chart. `x` is a numeric position (e.g. epoch ms), `y` the value, `label` the tooltip caption. */
export interface AreaChartPoint {
  x: number;
  y: number;
  label: string;
}

/**
 * Lightweight, dependency-free SVG **area chart** — a filled curve + line with a hover tooltip.
 * Zoneless-safe (pure signals, no `zone.js`). Built in-house rather than pulling a charting lib (the
 * needs are a single series ; cf. the account balance-evolution decision in
 * `docs/projet/us/compte-broker.md`). A full charting lib is revisited if Phase 2 stats demand
 * distributions / heatmaps.
 *
 * The SVG uses `preserveAspectRatio="none"` to stretch to the container, so strokes carry
 * `vector-effect: non-scaling-stroke` to stay crisp. Axis labels are intentionally omitted (text
 * would distort under the non-uniform scale) — the hover tooltip carries the exact date + value.
 * Needs ≥ 2 points to draw ; below that [hasData] is false and the host renders nothing (the
 * consumer shows its own empty state).
 */
@Component({
  selector: 'ui-area-chart',
  imports: [DecimalPipe],
  template: `
    @if (hasData()) {
      <div class="chart-wrap">
        <svg
          #svg
          [attr.viewBox]="'0 0 ' + W + ' ' + H"
          preserveAspectRatio="none"
          (mousemove)="onMove($event, svg)"
          (mouseleave)="onLeave()"
        >
          @for (g of gridLines(); track g) {
            <line class="grid" [attr.x1]="padX" [attr.y1]="g" [attr.x2]="W - padX" [attr.y2]="g" />
          }
          <path class="area" [attr.d]="areaPath()" />
          <path class="line" [attr.d]="linePath()" />
          @if (cursor(); as c) {
            <circle class="cursor" [attr.cx]="c.cx" [attr.cy]="c.cy" r="5" />
          }
        </svg>

        @if (hoverPoint(); as hp) {
          @if (hoverPos(); as pos) {
            <div class="tooltip" [style.left.px]="pos.left" [style.top.px]="pos.top">
              <div class="tt-date">{{ hp.label }}</div>
              <div class="tt-value">{{ hp.y | number: '1.2-2' }}{{ unit() }}</div>
            </div>
          }
        }
      </div>
    }
  `,
  styles: `
    .chart-wrap {
      position: relative;
      width: 100%;
    }
    svg {
      display: block;
      width: 100%;
      height: 220px;
    }
    .grid {
      stroke: var(--color-border-soft);
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    .area {
      fill: color-mix(in srgb, var(--color-accent) 16%, transparent);
    }
    .line {
      fill: none;
      stroke: var(--color-accent);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }
    .cursor {
      fill: var(--color-bg);
      stroke: var(--color-accent);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }
    .tooltip {
      position: absolute;
      pointer-events: none;
      transform: translate(-50%, -130%);
      background: var(--color-surface-3);
      color: var(--color-text);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 0.4rem 0.6rem;
      font-size: 0.75rem;
      white-space: nowrap;
      box-shadow: var(--shadow);
    }
    .tt-date {
      color: var(--color-text-muted);
      margin-bottom: 0.15rem;
    }
    .tt-value {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class StbAreaChart {
  readonly points = input<AreaChartPoint[]>([]);
  /** Suffix appended to the tooltip value (e.g. ` $`). */
  readonly unit = input('');

  protected readonly W = 1000;
  protected readonly H = 240;
  protected readonly padX = 8;
  private readonly padTop = 14;
  private readonly padBottom = 12;

  readonly hasData = computed(() => this.points().length >= 2);

  private readonly bounds = computed(() => {
    const pts = this.points();
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minYRaw = Math.min(...ys);
    const maxYRaw = Math.max(...ys);
    // Pad the y range by 8 % so the curve doesn't touch the edges ; guard a flat series.
    const span = maxYRaw - minYRaw || Math.abs(maxYRaw) || 1;
    return { minX, maxX, minY: minYRaw - span * 0.08, maxY: maxYRaw + span * 0.08 };
  });

  readonly linePath = computed(() => {
    const pts = this.points();
    if (pts.length < 2) return '';
    return pts
      .map((p, i) => `${i ? 'L' : 'M'}${this.sx(p.x).toFixed(1)} ${this.sy(p.y).toFixed(1)}`)
      .join(' ');
  });

  readonly areaPath = computed(() => {
    const pts = this.points();
    if (pts.length < 2) return '';
    const baseY = (this.H - this.padBottom).toFixed(1);
    const firstX = this.sx(pts[0].x).toFixed(1);
    const lastX = this.sx(pts[pts.length - 1].x).toFixed(1);
    return `${this.linePath()} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  });

  readonly gridLines = computed(() =>
    [0, 0.5, 1].map((t) => this.padTop + (this.H - this.padTop - this.padBottom) * t),
  );

  readonly hoverIndex = signal<number | null>(null);
  readonly hoverPos = signal<{ left: number; top: number } | null>(null);

  readonly hoverPoint = computed(() => {
    const i = this.hoverIndex();
    return i === null ? null : this.points()[i];
  });

  readonly cursor = computed(() => {
    const i = this.hoverIndex();
    if (i === null) return null;
    const p = this.points()[i];
    return { cx: this.sx(p.x), cy: this.sy(p.y) };
  });

  onMove(event: MouseEvent, svg: Element): void {
    const pts = this.points();
    if (pts.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(ratio * (pts.length - 1))));
    this.hoverIndex.set(i);
    this.hoverPos.set({
      left: (this.sx(pts[i].x) / this.W) * rect.width,
      top: (this.sy(pts[i].y) / this.H) * rect.height,
    });
  }

  onLeave(): void {
    this.hoverIndex.set(null);
    this.hoverPos.set(null);
  }

  private sx(x: number): number {
    const { minX, maxX } = this.bounds();
    const span = maxX - minX || 1;
    return this.padX + ((x - minX) / span) * (this.W - 2 * this.padX);
  }

  private sy(y: number): number {
    const { minY, maxY } = this.bounds();
    const span = maxY - minY || 1;
    return this.padTop + (1 - (y - minY) / span) * (this.H - this.padTop - this.padBottom);
  }
}
