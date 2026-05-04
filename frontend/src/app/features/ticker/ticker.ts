import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/language.service';
import {
  MarketRepository,
  OhlcBar,
  TickerNarrativeSnapshot,
  TickerSnapshot,
  TIMEFRAME_CODES,
  TimeframeCode,
} from '../../core/market.repository';
import { WatchlistRepository } from '../../core/watchlist.repository';

interface ChartPoint {
  x: number;
  y: number;
  bar: OhlcBar;
}

interface YTick {
  y: number;
  label: string;
}

interface XTick {
  x: number;
  label: string;
}

interface ChartGeometry {
  /** Inner-area projected (x, y) for each bar, plus a reference back to the bar. */
  points: ChartPoint[];
  /** SVG path `d` attribute for the price polyline. */
  pricePath: string;
  /** Horizontal grid + price labels on the left axis. */
  yTicks: YTick[];
  /** Vertical reference points + date labels on the bottom axis. */
  xTicks: XTick[];
  /** Inner drawing area (excluding axis margins) — used by the crosshair. */
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
}

interface HoverInfo {
  /** Index into `chartBars()` of the bar nearest to the cursor. */
  index: number;
  /** Inner-area X (used by the SVG crosshair). */
  x: number;
  /** Inner-area Y of the bar's close (anchors the dot marker). */
  y: number;
  /** Localized date / time label for the tooltip. */
  timeLabel: string;
  /** Pre-formatted price label (with the dossier currency). */
  priceLabel: string;
  /** Tooltip horizontal position as a percentage of the chart canvas — used by CSS. */
  percentX: number;
}

@Component({
  selector: 'app-ticker',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  templateUrl: './ticker.html',
  styleUrl: './ticker.scss',
})
export class TickerPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly marketRepository = inject(MarketRepository);
  private readonly watchlistRepository = inject(WatchlistRepository);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);

  symbol = signal<string>('');
  loading = signal(false);
  error = signal<string | null>(null);
  snapshot = signal<TickerSnapshot | null>(null);

  // ---- Chart state (multi-timeframe) ----

  /** All available toggle buttons — kept here so the template doesn't hard-code the order. */
  readonly timeframes = TIMEFRAME_CODES;
  /** Selected timeframe ; default `1y` matches the dossier's reference view. */
  selectedTimeframe = signal<TimeframeCode>('1y');
  /** Bars currently drawn on the chart. Kept separate from `snapshot.bars` so a timeframe
   *  switch can re-fetch bars without disturbing indicators / narrative. */
  chartBars = signal<OhlcBar[]>([]);
  chartLoading = signal(false);
  chartError = signal<string | null>(null);
  private chartSub?: Subscription;

  /** Bar index nearest the cursor when hovering the chart, or null when not hovering. */
  private hoveredIndex = signal<number | null>(null);

  // ---- Watchlist state ----

  /** True when the current symbol is on the user's watchlist. Optimistic — flips before the
   *  server confirms ; rolls back on error. Tooltip / icon are derived from this signal. */
  isWatched = signal(false);
  /** Disables the toggle button while a request is in flight, prevents rapid double-clicks
   *  triggering races between add and remove. */
  watchlistBusy = signal(false);

  // ---- Narrative state ----

  narrative = signal<TickerNarrativeSnapshot | null>(null);
  narrativeLoading = signal(false);
  narrativeError = signal<string | null>(null);
  private narrativePollSub?: Subscription;

  // ---- Chart geometry ----

  /** ViewBox of the SVG. Aspect is preserved (no `preserveAspectRatio=none`) so axis labels
   *  don't get stretched on wide containers. */
  readonly chartWidth = 800;
  readonly chartHeight = 260;
  /** Inner padding — leaves room on the left for price labels, on the bottom for date labels. */
  private readonly padLeft = 56;
  private readonly padRight = 12;
  private readonly padTop = 12;
  private readonly padBottom = 24;

  chartGeometry = computed<ChartGeometry | null>(() => {
    const bars = this.chartBars();
    if (bars.length < 2) return null;

    const innerLeft = this.padLeft;
    const innerRight = this.chartWidth - this.padRight;
    const innerTop = this.padTop;
    const innerBottom = this.chartHeight - this.padBottom;
    const innerW = innerRight - innerLeft;
    const innerH = innerBottom - innerTop;

    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;

    const xAt = (i: number) => innerLeft + (i / (bars.length - 1)) * innerW;
    const yAt = (price: number) => innerTop + (1 - (price - min) / range) * innerH;

    const points: ChartPoint[] = bars.map((b, i) => ({ x: xAt(i), y: yAt(b.close), bar: b }));
    const pricePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    // 5 evenly-spaced horizontal grid lines (4 intervals). Labels formatted with the same
    // precision as the dossier price so the magnitudes line up visually.
    const yTicks: YTick[] = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const price = min + (1 - t) * range; // top tick = max price (visually higher)
      return { y: innerTop + t * innerH, label: this.formatPrice(price) };
    });

    // 4 evenly-spaced date markers. Date format depends on the active timeframe — intraday
    // shows HH:mm, daily shows DD MMM, multi-year shows MMM YYYY.
    const xTicks: XTick[] = [0, 1, 2, 3].map((t) => {
      const i = Math.round((t / 3) * (bars.length - 1));
      const ts = new Date(bars[i].timestamp);
      return { x: xAt(i), label: this.formatTickDate(ts) };
    });

    return { points, pricePath, yTicks, xTicks, innerLeft, innerRight, innerTop, innerBottom };
  });

  /** Backward-compat accessor — older specs and the empty-state branch read this. */
  pricePath = computed(() => this.chartGeometry()?.pricePath ?? '');

  hoverInfo = computed<HoverInfo | null>(() => {
    const idx = this.hoveredIndex();
    const geom = this.chartGeometry();
    if (idx === null || !geom) return null;
    const point = geom.points[idx];
    if (!point) return null;
    const currency = this.snapshot()?.quote.currency ?? '';
    const priceLabel = currency
      ? `${this.formatPrice(point.bar.close)} ${currency}`
      : this.formatPrice(point.bar.close);
    return {
      index: idx,
      x: point.x,
      y: point.y,
      timeLabel: this.formatHoverDate(new Date(point.bar.timestamp)),
      priceLabel,
      percentX: ((point.x - geom.innerLeft) / (geom.innerRight - geom.innerLeft)) * 100,
    };
  });

  // ---- Indicator helpers (used in template for color bands) ----

  rsiClass = computed(() => {
    const r = this.snapshot()?.indicators?.rsi14;
    if (r === null || r === undefined) return '';
    if (r >= 70) return 'warning';
    if (r <= 30) return 'warning';
    return '';
  });

  drawdownClass = computed(() => {
    const d = this.snapshot()?.indicators?.drawdownFrom52wHigh;
    if (d === null || d === undefined) return '';
    if (d <= -20) return 'danger';
    if (d >= -5) return 'success';
    return '';
  });

  perfClass(value: number | null | undefined): string {
    if (value === null || value === undefined) return '';
    if (value > 0) return 'success';
    if (value < 0) return 'danger';
    return '';
  }

  signed(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  }

  private errorMessage(err: { status?: number } | undefined, symbol: string): string {
    switch (err?.status) {
      case 404:
        return this.translate.instant('ticker.errors.notFound', { symbol });
      case 503:
        return this.translate.instant('ticker.errors.rateLimit');
      default:
        return this.translate.instant('ticker.errors.generic');
    }
  }

  // ---- Lifecycle ----

  ngOnInit(): void {
    const s = this.route.snapshot.paramMap.get('symbol');
    if (!s) {
      this.error.set(this.translate.instant('ticker.errors.missingSymbol'));
      return;
    }
    this.symbol.set(s);
    this.load(s);
    this.loadLatestNarrative(s);
    this.loadWatchlistState(s);
  }

  ngOnDestroy(): void {
    this.chartSub?.unsubscribe();
    this.narrativePollSub?.unsubscribe();
  }

  load(symbol: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketRepository.getTicker(symbol).subscribe({
      next: (snap) => {
        this.snapshot.set(snap);
        this.chartBars.set(snap.bars);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.errorMessage(err, symbol));
        this.loading.set(false);
      },
    });
  }

  // ---- Chart timeframe + hover ----

  /**
   * Fetches the bars for [tf] from the chart endpoint and updates the chart. No-op when [tf]
   * equals the currently selected timeframe (matches the way mat-button-toggle emits) — keeps the
   * chart from flashing on a re-click.
   */
  selectTimeframe(tf: TimeframeCode): void {
    if (tf === this.selectedTimeframe() && this.chartBars().length > 0) return;
    const sym = this.symbol();
    if (!sym) return;
    this.selectedTimeframe.set(tf);
    this.chartLoading.set(true);
    this.chartError.set(null);
    // Reset hover so the previous timeframe's tooltip doesn't linger over the new bars.
    this.hoveredIndex.set(null);
    this.chartSub?.unsubscribe();
    this.chartSub = this.marketRepository.getChart(sym, tf).subscribe({
      next: (resp) => {
        this.chartBars.set(resp.bars);
        this.chartLoading.set(false);
      },
      error: (err: { status?: number }) => {
        this.chartError.set(this.errorMessage(err, sym));
        this.chartLoading.set(false);
      },
    });
  }

  /**
   * Updates [hoveredIndex] to point at the bar nearest the cursor. We map the screen-space mouse
   * X back to the SVG's user units via `getScreenCTM().inverse()` — that handles any responsive
   * width / future zoom transform without bespoke math.
   */
  onChartMouseMove(event: MouseEvent): void {
    const geom = this.chartGeometry();
    if (!geom) return;
    const svg = (event.currentTarget as HTMLElement).querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    const innerW = geom.innerRight - geom.innerLeft;
    const t = Math.max(0, Math.min(1, (local.x - geom.innerLeft) / innerW));
    const idx = Math.round(t * (this.chartBars().length - 1));
    this.hoveredIndex.set(idx);
  }

  onChartMouseLeave(): void {
    this.hoveredIndex.set(null);
  }

  // ---- Date / price formatters for the chart axes and tooltip ----

  /**
   * Formats a date for the X axis, calibrated to the current timeframe :
   * - intraday (1D, 5D) → `HH:mm`
   * - daily (1M, 3M) → `DD MMM`
   * - 1Y → `MMM YY`
   * - 5Y → `YYYY`
   */
  private formatTickDate(date: Date): string {
    const tf = this.selectedTimeframe();
    const locale = this.language.lang();
    if (tf === '1d') {
      return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    }
    if (tf === '5d') {
      return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    }
    if (tf === '1mo' || tf === '3mo') {
      return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    }
    if (tf === '1y') {
      return date.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString(locale, { year: 'numeric' });
  }

  /**
   * Formats a date for the hover tooltip — more verbose than the axis labels, since the user
   * has paused on a specific bar and wants the unambiguous timestamp.
   */
  private formatHoverDate(date: Date): string {
    const tf = this.selectedTimeframe();
    const locale = this.language.lang();
    if (tf === '1d' || tf === '5d') {
      return date.toLocaleString(locale, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private formatPrice(price: number): string {
    return price.toFixed(2);
  }

  // ---- Watchlist actions ----

  /**
   * Fetches the current watchlist on init to derive [isWatched] for the active symbol. We don't
   * have a `/watchlist/contains/:symbol` endpoint — calling `list()` is fine because the list
   * stays small in practice (dozens of entries max for a personal app). Silent failure : button
   * just stays in the "not watched" state, the user can click to retry.
   */
  private loadWatchlistState(symbol: string): void {
    const upper = symbol.toUpperCase();
    this.watchlistRepository.list().subscribe({
      next: (entries) => this.isWatched.set(entries.some((e) => e.symbol === upper)),
      error: () => this.isWatched.set(false),
    });
  }

  /**
   * Toggles the watchlist state for the current symbol. Optimistic : the button flips visually
   * immediately, then we call the server. On error we roll back. The backend's idempotent add
   * means a quick double-click on a fresh symbol just yields the same row twice — no harm.
   */
  toggleWatchlist(): void {
    const sym = this.symbol();
    if (!sym || this.watchlistBusy()) return;
    const wasWatched = this.isWatched();
    this.watchlistBusy.set(true);
    this.isWatched.set(!wasWatched);

    // `remove` returns Observable<void> and `add` returns Observable<WatchlistEntry> ; the union
    // can't be subscribed to directly without a cast. Keep the two calls in separate branches —
    // explicit and the handlers stay shared via local `onDone` / `onFail`.
    const onDone = () => this.watchlistBusy.set(false);
    const onFail = () => {
      this.isWatched.set(wasWatched);
      this.watchlistBusy.set(false);
    };
    if (wasWatched) {
      this.watchlistRepository.remove(sym).subscribe({ next: onDone, error: onFail });
    } else {
      this.watchlistRepository.add(sym).subscribe({ next: onDone, error: onFail });
    }
  }

  // ---- Narrative actions ----

  private loadLatestNarrative(symbol: string): void {
    this.marketRepository.getLatestNarrative(symbol).subscribe({
      next: (snap) => this.narrative.set(snap),
      error: () => {
        this.narrative.set(null);
      },
    });
  }

  generateNarrative(): void {
    const sym = this.symbol();
    if (!sym || this.narrativeLoading()) return;
    this.narrativeLoading.set(true);
    this.narrativeError.set(null);
    this.narrativePollSub?.unsubscribe();

    this.marketRepository.requestNarrative(sym).subscribe({
      next: (job) => {
        if (job.status === 'DONE') {
          this.fetchNarrativeAfterCompletion(sym);
          return;
        }
        if (job.status === 'ERROR') {
          this.narrativeError.set(
            job.error ?? this.translate.instant('ticker.narrative.errorGeneric'),
          );
          this.narrativeLoading.set(false);
          return;
        }
        this.narrativePollSub = this.marketRepository.pollNarrativeJob(sym, job.jobId).subscribe({
          next: (updated) => {
            if (updated.status === 'DONE') {
              this.fetchNarrativeAfterCompletion(sym);
            } else if (updated.status === 'ERROR') {
              this.narrativeError.set(
                updated.error ?? this.translate.instant('ticker.narrative.errorGeneric'),
              );
              this.narrativeLoading.set(false);
            }
          },
          error: (err: Error) => {
            this.narrativeError.set(
              err.message ?? this.translate.instant('ticker.narrative.errorPolling'),
            );
            this.narrativeLoading.set(false);
          },
        });
      },
      error: () => {
        this.narrativeError.set(this.translate.instant('ticker.narrative.errorRequest'));
        this.narrativeLoading.set(false);
      },
    });
  }

  private fetchNarrativeAfterCompletion(symbol: string): void {
    this.marketRepository.getLatestNarrative(symbol).subscribe({
      next: (snap) => {
        this.narrative.set(snap);
        this.narrativeLoading.set(false);
      },
      error: () => {
        this.narrativeError.set(this.translate.instant('ticker.narrative.errorReload'));
        this.narrativeLoading.set(false);
      },
    });
  }

  sentimentClass(s: TickerNarrativeSnapshot | null): string {
    if (!s) return '';
    return `sentiment-${s.sentiment.toLowerCase()}`;
  }
}
