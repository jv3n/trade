import { Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  of,
  switchMap,
} from 'rxjs';
import { LanguageService } from '../../core/language.service';
import {
  MarketRepository,
  OhlcBar,
  SymbolMatch,
  TickerNarrativeSnapshot,
  TickerSnapshot,
  TIMEFRAME_CODES,
  TimeframeCode,
} from '../../core/market.repository';
import { NewsItem, NewsRepository } from '../../core/news.repository';
import { WatchlistRepository } from '../../core/watchlist.repository';

/**
 * Same value as the dashboard watchlist autocomplete — keeps the typing-vs-search rhythm uniform
 * across the app.
 */
const BENCHMARK_SEARCH_DEBOUNCE_MS = 300;

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
  /** SVG path `d` attribute for the ticker polyline. */
  pricePath: string;
  /** SVG path `d` for the benchmark polyline — only present when benchmark is on AND its bars
   *  are loaded. Absent during the pre-load window so the chart still draws the ticker line. */
  benchmarkPath?: string;
  /** Projected benchmark points (one per aligned bar) — used to draw the benchmark hover dot. */
  benchmarkPoints?: ChartPoint[];
  /** Horizontal grid + axis labels (price in single-series mode, % return when benchmark is on). */
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
  /** Inner-area Y of the bar's close (anchors the ticker dot marker). */
  y: number;
  /** Inner-area Y of the benchmark's close at the same index, or null when benchmark is off /
   *  not loaded / the index falls outside the benchmark series. */
  benchmarkY: number | null;
  /** Localized date / time label for the tooltip. */
  timeLabel: string;
  /** Pre-formatted ticker label — price + currency when benchmark is off, signed % otherwise. */
  priceLabel: string;
  /** Pre-formatted benchmark label (signed %), or null when benchmark is off / not loaded. */
  benchmarkLabel: string | null;
  /** Tooltip horizontal position as a percentage of the chart canvas — used by CSS. */
  percentX: number;
}

/**
 * Benchmark picker values. `'off'` is the sentinel for "no overlay" ; the four buttons in the
 * toolbar are `off | SPY | QQQ | IWM | sector`. `'custom'` is set internally when the user picks
 * a ticker from the autocomplete sidecar — there's no Custom *button* in the toggle group, the
 * toggle simply deselects when the user picks via the autocomplete.
 *
 * Using a string sentinel rather than `null` keeps `mat-button-toggle-group` happy (it doesn't
 * bind cleanly to nullable values).
 */
export type BenchmarkChoice = 'off' | 'SPY' | 'QQQ' | 'IWM' | 'sector' | 'custom';

/** Toggle-group buttons in display order — `'custom'` is excluded (set via the autocomplete only). */
export const BENCHMARK_TOGGLE_CHOICES: BenchmarkChoice[] = ['off', 'SPY', 'QQQ', 'IWM', 'sector'];

/** What's actually plotted under the ticker line. `null` means no overlay (mode `'off'` or
 *  `'custom'` waiting for a pick or `'sector'` waiting for the resolve). */
interface ResolvedBenchmark {
  /** Symbol passed to `getChart` to fetch the bars (e.g. `SPY`, `XLK`, `MSFT`). */
  symbol: string;
  /** Display label for the chart legend / tooltip (e.g. `SPY`, `Technology (XLK)`, `MSFT`). */
  label: string;
}

@Component({
  selector: 'app-ticker',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './ticker.html',
  styleUrl: './ticker.scss',
})
export class TickerPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly marketRepository = inject(MarketRepository);
  private readonly newsRepository = inject(NewsRepository);
  private readonly watchlistRepository = inject(WatchlistRepository);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

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

  // ---- Benchmark overlay state ----

  /** Toggle-group buttons (excludes `'custom'`, which is set via the autocomplete sidecar). */
  readonly benchmarkToggleChoices = BENCHMARK_TOGGLE_CHOICES;
  /** Active picker mode. Drives the toggle group selection and tells [chartGeometry] whether to
   *  flip the Y axis to percent. `'custom'` is set when the user picks via the autocomplete. */
  selectedBenchmark = signal<BenchmarkChoice>('off');
  /** What's actually plotted under the ticker line. `null` while resolving (sector) or waiting
   *  for the user to pick (custom). The chart geometry uses this to decide whether to draw the
   *  benchmark polyline ; the legend reads [label] from here. */
  resolvedBenchmark = signal<ResolvedBenchmark | null>(null);
  /** Bars for [resolvedBenchmark], aligned by index to [chartBars] (no date matching v1 — relies
   *  on US-listed benchmarks following the same trading calendar as US-listed tickers). */
  benchmarkBars = signal<OhlcBar[]>([]);
  benchmarkLoading = signal(false);
  /** Inline error scoped to the benchmark — a 503 here must NOT clear the main chart. */
  benchmarkError = signal<string | null>(null);
  private benchmarkSub?: Subscription;
  private sectorResolveSub?: Subscription;

  /**
   * Custom-benchmark autocomplete control. Mirrors the dashboard watchlist autocomplete shape :
   * `string | SymbolMatch | null` — flips between the typed string and a picked `SymbolMatch`.
   */
  customBenchmarkControl = new FormControl<string | SymbolMatch | null>('');
  /** Suggestions currently displayed in the autocomplete dropdown. */
  customBenchmarkSuggestions = signal<SymbolMatch[]>([]);
  /** True while the search HTTP call is in flight ; drives the dropdown spinner. */
  customBenchmarkSearching = signal(false);

  // ---- News state ----

  /** Headlines for the current ticker. Empty list = "no recent news" rather than "loading". */
  news = signal<NewsItem[]>([]);
  newsLoading = signal(false);
  /** Inline error in the news panel — kept scoped so a Finnhub hiccup doesn't blank the dossier. */
  newsError = signal<string | null>(null);

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

    const xAt = (i: number) => innerLeft + (i / (bars.length - 1)) * innerW;

    // Benchmark mode flips the Y axis from absolute price to % return from the first close.
    // Without this the two series can't share an axis (SPY at $500 next to a small-cap at $15
    // would crush one curve into a flat line). The flip happens *as soon as a benchmark is
    // resolved* — for presets that's the click, for sector that's the API resolve, for custom
    // that's the autocomplete pick. The second line appears once the chart bars fetch resolves.
    const benchOn = this.resolvedBenchmark() !== null;
    const benchBars = this.benchmarkBars();
    const benchLoaded = benchOn && benchBars.length >= 2;

    let yValues: number[];
    let benchValues: number[] | null = null;
    let formatYTick: (v: number) => string;

    if (benchOn) {
      const t0 = bars[0].close;
      yValues = bars.map((b) => ((b.close - t0) / t0) * 100);
      formatYTick = (pct) => this.formatPercent(pct);
      if (benchLoaded) {
        const b0 = benchBars[0].close;
        // Align by index — US-listed benchmarks share the trading calendar with US-listed
        // tickers, so bar counts match for any given (range, interval). For dual-listed or
        // foreign tickers (e.g. RY.TO) a small mismatch can occur ; we silently truncate to
        // the common length and accept the minor drift.
        const common = Math.min(bars.length, benchBars.length);
        benchValues = benchBars.slice(0, common).map((b) => ((b.close - b0) / b0) * 100);
      }
    } else {
      yValues = bars.map((b) => b.close);
      formatYTick = (price) => this.formatPrice(price);
    }

    // Y range covers both series so neither gets clipped.
    const allValues = benchValues ? [...yValues, ...benchValues] : yValues;
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;

    const yAt = (v: number) => innerTop + (1 - (v - min) / range) * innerH;

    const points: ChartPoint[] = bars.map((b, i) => ({ x: xAt(i), y: yAt(yValues[i]), bar: b }));
    const pricePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    let benchmarkPoints: ChartPoint[] | undefined;
    let benchmarkPath: string | undefined;
    if (benchValues) {
      benchmarkPoints = benchValues.map((v, i) => ({
        x: xAt(i),
        y: yAt(v),
        bar: benchBars[i],
      }));
      benchmarkPath = benchmarkPoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ');
    }

    // 5 evenly-spaced horizontal grid lines (4 intervals). Labels formatted with the same
    // precision as the dossier price so the magnitudes line up visually.
    const yTicks: YTick[] = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const v = min + (1 - t) * range; // top tick = max value (visually higher)
      return { y: innerTop + t * innerH, label: formatYTick(v) };
    });

    // 4 evenly-spaced date markers. Date format depends on the active timeframe — intraday
    // shows HH:mm, daily shows DD MMM, multi-year shows MMM YYYY.
    const xTicks: XTick[] = [0, 1, 2, 3].map((t) => {
      const i = Math.round((t / 3) * (bars.length - 1));
      const ts = new Date(bars[i].timestamp);
      return { x: xAt(i), label: this.formatTickDate(ts) };
    });

    return {
      points,
      pricePath,
      benchmarkPath,
      benchmarkPoints,
      yTicks,
      xTicks,
      innerLeft,
      innerRight,
      innerTop,
      innerBottom,
    };
  });

  /** Backward-compat accessor — older specs and the empty-state branch read this. */
  pricePath = computed(() => this.chartGeometry()?.pricePath ?? '');

  hoverInfo = computed<HoverInfo | null>(() => {
    const idx = this.hoveredIndex();
    const geom = this.chartGeometry();
    if (idx === null || !geom) return null;
    const point = geom.points[idx];
    if (!point) return null;

    const benchOn = this.resolvedBenchmark() !== null;
    const tickerBars = this.chartBars();
    const benchBars = this.benchmarkBars();

    let priceLabel: string;
    let benchmarkLabel: string | null = null;
    let benchmarkY: number | null = null;

    if (benchOn) {
      // In percent mode we show signed % at hover for both series — apples-to-apples comparison
      // is the whole point of turning the overlay on.
      const t0 = tickerBars[0].close;
      const tickerPct = ((point.bar.close - t0) / t0) * 100;
      priceLabel = this.formatPercent(tickerPct);
      const benchPoint = geom.benchmarkPoints?.[idx];
      if (benchPoint && benchBars.length >= 2) {
        const b0 = benchBars[0].close;
        const benchPct = ((benchPoint.bar.close - b0) / b0) * 100;
        benchmarkLabel = this.formatPercent(benchPct);
        benchmarkY = benchPoint.y;
      }
    } else {
      const currency = this.snapshot()?.quote.currency ?? '';
      priceLabel = currency
        ? `${this.formatPrice(point.bar.close)} ${currency}`
        : this.formatPrice(point.bar.close);
    }

    return {
      index: idx,
      x: point.x,
      y: point.y,
      benchmarkY,
      timeLabel: this.formatHoverDate(new Date(point.bar.timestamp)),
      priceLabel,
      benchmarkLabel,
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
    this.loadNews(s);
    this.wireCustomBenchmarkSearch();
  }

  ngOnDestroy(): void {
    this.chartSub?.unsubscribe();
    this.benchmarkSub?.unsubscribe();
    this.sectorResolveSub?.unsubscribe();
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
    // Refetch the benchmark for the new timeframe so the two series stay in sync. Done in
    // parallel — a slow benchmark fetch must not delay the main chart. Uses [resolvedBenchmark]
    // so a sector overlay refetches the resolved ETF (XLK) rather than re-resolving from scratch,
    // and a custom overlay refetches the picked symbol.
    const resolved = this.resolvedBenchmark();
    if (resolved) {
      this.fetchBenchmarkBars(resolved.symbol, tf);
    }
  }

  // ---- Benchmark overlay ----

  /**
   * Toggle-group click handler. For `off` and the three preset indices, resolution is synchronous
   * (the symbol IS the picker value). For `sector`, we kick the `/sector-benchmark` resolve and
   * fetch the bars when it lands. `custom` is never set via the toggle group — the user picks via
   * the autocomplete sidecar, see [onCustomBenchmarkSelected].
   *
   * Re-clicking the active choice is a no-op so the toggle doesn't burn an extra `getChart` credit
   * on every click.
   */
  selectBenchmark(choice: BenchmarkChoice): void {
    if (choice === this.selectedBenchmark()) return;
    this.selectedBenchmark.set(choice);
    // Clear the autocomplete sidecar on any toggle change — a click on SPY shouldn't leave a stale
    // "MSFT" string lingering in the input.
    this.customBenchmarkControl.setValue('', { emitEvent: false });
    this.customBenchmarkSuggestions.set([]);
    // Drop hover so a stale tooltip from the previous benchmark doesn't linger over a bar that
    // may not have a matching benchmark point in the new series (different bar counts).
    this.hoveredIndex.set(null);

    this.benchmarkSub?.unsubscribe();
    this.sectorResolveSub?.unsubscribe();
    this.benchmarkError.set(null);

    if (choice === 'off') {
      this.resolvedBenchmark.set(null);
      this.benchmarkBars.set([]);
      this.benchmarkLoading.set(false);
      return;
    }

    if (choice === 'sector') {
      this.resolveSectorBenchmark();
      return;
    }

    // Preset index : SPY / QQQ / IWM. Resolved symbol = the choice itself.
    this.resolvedBenchmark.set({ symbol: choice, label: choice });
    this.benchmarkBars.set([]);
    this.fetchBenchmarkBars(choice, this.selectedTimeframe());
  }

  /**
   * Two-step Sector flow : (1) call `/sector-benchmark` to resolve the dossier ticker to its SPDR
   * sector ETF, then (2) fetch the chart bars for that ETF and plot. A 404 from the resolve means
   * the sector isn't in the SPDR mapping (or the ticker isn't in the mock seed) — surface a polite
   * inline message rather than a generic error so the user understands they can pick a preset
   * instead.
   */
  private resolveSectorBenchmark(): void {
    const sym = this.symbol();
    if (!sym) return;
    this.resolvedBenchmark.set(null);
    this.benchmarkBars.set([]);
    this.benchmarkLoading.set(true);
    this.sectorResolveSub?.unsubscribe();
    this.sectorResolveSub = this.marketRepository.getSectorBenchmark(sym).subscribe({
      next: (sb) => {
        this.resolvedBenchmark.set({
          symbol: sb.etfSymbol,
          label: `${sb.sector} (${sb.etfSymbol})`,
        });
        this.fetchBenchmarkBars(sb.etfSymbol, this.selectedTimeframe());
      },
      error: (err: { status?: number }) => {
        this.benchmarkError.set(
          this.translate.instant(
            err?.status === 404
              ? 'ticker.benchmark.errors.sectorNotMapped'
              : 'ticker.benchmark.errors.fetch',
          ),
        );
        this.benchmarkLoading.set(false);
      },
    });
  }

  /**
   * Fetches the chart bars for [symbol] at [tf]. Provider-agnostic — used for presets, sector
   * (after resolve) and custom benchmarks alike. On error we clear the bars so a stale curve from
   * the previous benchmark doesn't linger under a fresh error banner.
   */
  private fetchBenchmarkBars(symbol: string, tf: TimeframeCode): void {
    this.benchmarkLoading.set(true);
    this.benchmarkError.set(null);
    this.benchmarkSub?.unsubscribe();
    this.benchmarkSub = this.marketRepository.getChart(symbol, tf).subscribe({
      next: (resp) => {
        this.benchmarkBars.set(resp.bars);
        this.benchmarkLoading.set(false);
      },
      error: () => {
        this.benchmarkBars.set([]);
        this.benchmarkError.set(this.translate.instant('ticker.benchmark.errors.fetch'));
        this.benchmarkLoading.set(false);
      },
    });
  }

  // ---- Custom benchmark autocomplete ----

  /**
   * Mirrors the dashboard watchlist autocomplete wiring : debounce the typed string, search the
   * configured market provider, drop the dropdown silently on a 503 (search is best-effort, the
   * inline error is reserved for the actual chart fetch).
   *
   * The `filter(string)` upstream of debounce is essential — when the user picks a suggestion, the
   * control flips to a `SymbolMatch` object and we must NOT trigger another search with the
   * previously-typed string still buffered.
   */
  private wireCustomBenchmarkSearch(): void {
    this.customBenchmarkControl.valueChanges
      .pipe(
        filter((v): v is string => typeof v === 'string'),
        debounceTime(BENCHMARK_SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((typed) => {
          const trimmed = typed.trim();
          if (trimmed.length === 0) {
            this.customBenchmarkSuggestions.set([]);
            return of<SymbolMatch[]>([]);
          }
          this.customBenchmarkSearching.set(true);
          return this.marketRepository
            .searchSymbols(trimmed)
            .pipe(catchError(() => of<SymbolMatch[]>([])));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((suggestions) => {
        this.customBenchmarkSuggestions.set(suggestions);
        this.customBenchmarkSearching.set(false);
      });
  }

  /**
   * Called when the user picks an option in the custom-benchmark autocomplete. Switches the
   * picker mode to `'custom'` (which deselects the toggle group visually since `custom` isn't a
   * button), sets [resolvedBenchmark] to the picked symbol, fetches its bars.
   */
  onCustomBenchmarkSelected(event: MatAutocompleteSelectedEvent): void {
    const match = event.option.value as SymbolMatch;
    this.selectedBenchmark.set('custom');
    this.resolvedBenchmark.set({ symbol: match.symbol, label: match.symbol });
    this.benchmarkBars.set([]);
    this.benchmarkError.set(null);
    this.hoveredIndex.set(null);
    this.sectorResolveSub?.unsubscribe();
    this.fetchBenchmarkBars(match.symbol, this.selectedTimeframe());
  }

  /** `mat-autocomplete [displayWith]` formatter — same shape as the dashboard. */
  displayCustomBenchmark(value: SymbolMatch | string | null): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return value.symbol;
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

  /** Signed-percent formatter used by the benchmark overlay (Y axis labels and tooltip).
   *  Values that round to zero (incl. exactly 0, like the first bar's anchor) drop the sign so
   *  the tooltip doesn't flip-flop between `0.00%` and `+0.00%` / `-0.00%` on tiny noise. */
  private formatPercent(value: number): string {
    if (Math.abs(value) < 0.005) return '0.00%';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  // ---- News actions ----

  /**
   * Fetches up to 10 headlines on init. 503 (Finnhub down / rate-limited) surfaces inline in the
   * news panel — the rest of the dossier (chart, indicators, narrative) stays interactive. Empty
   * list is a normal state (slow-news ticker), not an error.
   */
  private loadNews(symbol: string): void {
    this.newsLoading.set(true);
    this.newsError.set(null);
    this.newsRepository.getForSymbol(symbol).subscribe({
      next: (items) => {
        this.news.set(items);
        this.newsLoading.set(false);
      },
      error: (err: { status?: number }) => {
        this.newsError.set(this.errorMessage(err, symbol));
        this.newsLoading.set(false);
      },
    });
  }

  /**
   * Formats a news date for the inline list. Recent items (< 24 h) show as relative time
   * ("il y a 3 h"), older ones as a localised date. Reuses [LanguageService.lang] so the format
   * follows the active UI locale.
   */
  formatNewsDate(iso: string): string {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const locale = this.language.lang();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (diffMs < 60_000) return rtf.format(-Math.floor(diffMs / 1000), 'second');
    if (diffMs < 3_600_000) return rtf.format(-Math.floor(diffMs / 60_000), 'minute');
    if (diffMs < 86_400_000) return rtf.format(-Math.floor(diffMs / 3_600_000), 'hour');
    if (diffMs < 7 * 86_400_000) return rtf.format(-Math.floor(diffMs / 86_400_000), 'day');
    return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
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
